// Core engine: state creation, time stepping, actions. Pure TS — no DOM,
// no Math.random, no Date.now. All randomness flows through state.rngState.
import type {
  Action, ActionResult, Config, CrisisDef, Effect, GameState, KnessetData, LogEntry, Outcome, Party,
} from './types.ts';
import { makeRng, pickWeighted, type Rng } from './rng.ts';
import {
  allocateMinistries, coalitionSeats, fairShare, formGovernment, hateCount, matchesTag, ministryCounts,
} from './coalition.ts';
import { runElection } from './elections.ts';
import { CRISES, LAWS, crisisById, remedyById } from '../data/crises.ts';
import { promiseById } from '../data/promises.ts';
import { TITLES } from '../data/titles.ts';
import { DEFAULT_CONFIG } from '../config.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const DAY_MS = 86_400_000;

function rngOf(s: GameState): Rng {
  const r = makeRng(s.rngState);
  return {
    get state() { return r.state; },
    set state(v: number) { r.state = v; },
    next() { const v = r.next(); s.rngState = r.state; return v; },
  };
}

function log(s: GameState, key: string, params?: LogEntry['params'], kind: LogEntry['kind'] = 'info') {
  s.log.push({ t: s.day, key, params, kind });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

// ---------------------------------------------------------------- outcomes (cause → result)

const METERS = ['approval', 'street', 'us', 'fiscal', 'trial'] as const;
interface Snap { sat: Record<string, number>; m: Record<string, number>; seats: number; coal: string[]; pressure: Record<string, number> }
/** >0 while a decision is being applied; nested coalition changes then fold into that outcome */
let wrapDepth = 0;

function snap(s: GameState): Snap {
  return {
    sat: Object.fromEntries(s.parties.map((p) => [p.id, p.satisfaction])),
    m: Object.fromEntries(METERS.map((k) => [k, s[k]])),
    seats: seatsOf(s),
    coal: coalition(s).map((p) => p.id),
    pressure: { ...s.pressure },
  };
}

function record(s: GameState, kind: Outcome['kind'], cause: Outcome['cause'], b: Snap) {
  s.outcomes ??= [];
  s.outcomeSeq ??= 0;
  const coalNow = coalition(s).map((p) => p.id);
  const o: Outcome = {
    seq: ++s.outcomeSeq,
    day: Math.floor(s.day),
    kind,
    cause,
    sat: s.parties.filter((p) => p.seats > 0)
      .map((p) => ({ party: p.id, delta: Math.round(p.satisfaction - b.sat[p.id]), inCoalition: p.inCoalition }))
      .filter((x) => x.delta !== 0)
      .sort((x, y) => Number(y.inCoalition) - Number(x.inCoalition) || Math.abs(y.delta) - Math.abs(x.delta)),
    meters: METERS.map((k) => ({ meter: k, delta: Math.round(s[k] - b.m[k]) })).filter((x) => x.delta !== 0),
    seats: { from: b.seats, to: seatsOf(s) },
    left: b.coal.filter((id) => !coalNow.includes(id)),
    joined: coalNow.filter((id) => !b.coal.includes(id)),
    risks: Object.keys(s.pressure).filter((k) => s.pressure[k] - (b.pressure[k] ?? 0) > 0.01),
  };
  s.outcomes.push(o);
  if (s.outcomes.length > 40) s.outcomes.splice(0, s.outcomes.length - 40);
}

function withOutcome<T>(s: GameState, kind: Outcome['kind'], cause: Outcome['cause'], fn: () => T): T {
  const b = snap(s);
  wrapDepth++;
  try { return fn(); } finally { wrapDepth--; record(s, kind, cause, b); }
}

/** why a party's satisfaction drifts each day (sum = actual daily drift) */
export function satDrivers(s: GameState, p: Party): { key: string; perDay: number }[] {
  const c = s.config;
  const out: { key: string; perDay: number }[] = [];
  if (s.phase !== 'governing') return out;
  if (p.inCoalition && p.id !== s.base.pmParty) {
    const coal = coalition(s);
    const over = Math.max(0, Math.abs(s.govPosition - p.position) - p.tolerance);
    if (over > 0) out.push({ key: s.govPosition > p.position ? 'drift.tooRight' : 'drift.tooLeft', perDay: -over * c.driftPenalty });
    out.push({ key: 'drift.appetite', perDay: -c.appetitePerDay });
    const fair = (ministryCounts(s.ministries)[p.id] ?? 0) - fairShare(p, s.parties, s.ministries.length);
    if (Math.abs(fair) > 0.5) out.push({ key: fair > 0 ? 'drift.ministriesPlus' : 'drift.ministriesMinus', perDay: fair * c.ministryFairness });
    const h = hateCount(p, coal);
    if (h) out.push({ key: 'drift.hate', perDay: -h * c.hatePenalty });
  }
  if (p.trust.state === 'believing') out.push({ key: 'drift.believe', perDay: c.believeDriftPerDay });
  if (p.trust.state === 'distrust') out.push({ key: 'drift.distrust', perDay: -c.distrustDriftPerDay });
  const reg = (c.satBaseline - p.satisfaction) * c.satRegression;
  if (Math.abs(reg) > 0.005) out.push({ key: reg > 0 ? 'drift.recover' : 'drift.cool', perDay: reg });
  return out;
}

// ---------------------------------------------------------------- creation

export function createState(base: KnessetData, seed: number, config: Partial<Config> = {}): GameState {
  const cfg: Config = { ...DEFAULT_CONFIG, ...config };
  const total = base.parties.reduce((s, p) => s + p.seats, 0);
  if (total !== cfg.totalSeats) throw new Error(`knesset data: seats sum to ${total}, expected ${cfg.totalSeats}`);
  const s: GameState = {
    seed,
    rngState: seed >>> 0,
    config: cfg,
    base: structuredClone(base),
    day: 0,
    pmDays: 0,
    status: 'playing',
    termReached: false,
    phase: 'governing',
    phaseLeftDays: 0,
    govPosition: base.startPosition,
    approval: 45,
    street: 60,
    us: 60,
    fiscal: 55,
    trial: 30,
    trialPausedUntil: 0,
    openCases: [],
    refusedBy: [],
    campaignPollSeats: 0,
    parties: base.parties.map((p) => ({
      ...structuredClone(p), wartime: false, threatening: false,
      trust: { state: 'neutral', promiseId: null, until: 0 },
    })),
    ministries: base.ministries.map((m) => ({ ...m })),
    defectors: 0,
    event: null,
    nextEventInDays: 0,
    pressure: {},
    war: { active: false, leftDays: 0, cooldownDays: 0 },
    cooldowns: { ministry: 0, law: 0, invite: 0 },
    budgetPassedYear: 0,
    lastBudgetNag: -999,
    queue: [],
    termEndsDay: cfg.knessetTermDays,
    tensionUntil: 180,
    iccUntil: 0,
    usedOnce: [],
    elections: 0,
    failedElections: 0,
    stats: {
      warsEnded: 0, electionsSurvived: 0, casesSurvived: 0, maxOpenCases: 0, refusedByAll: 0,
      comebacks: 0, brokenPromises: 0, promisesKept: 0, bigCoalitionStreak: 0, bigCoalitionBest: 0,
      crisesHandled: 0,
    },
    titles: [],
    log: [],
    outcomes: [],
    outcomeSeq: 0,
  };
  s.nextEventInDays = scheduleNext(s);
  log(s, 'log.start', { seats: seatsOf(s) }, 'info');
  return s;
}

// ---------------------------------------------------------------- queries

export const seatsOf = (s: GameState) => coalitionSeats(s.parties, s.defectors);
export const pmParty = (s: GameState) => s.parties.find((p) => p.id === s.base.pmParty)!;
export const coalition = (s: GameState) => s.parties.filter((p) => p.inCoalition);
export const partyById = (s: GameState, id: string) => s.parties.find((p) => p.id === id);

export function dateOf(s: GameState): Date {
  return new Date(Date.parse(s.config.startDate + 'T00:00:00Z') + Math.floor(s.day) * DAY_MS);
}

/** year whose budget is due next (by 31 March of that year) */
export function budgetDueYear(s: GameState): number {
  const d = dateOf(s);
  return d.getUTCMonth() <= 2 ? d.getUTCFullYear() : d.getUTCFullYear() + 1;
}

function scheduleNext(s: GameState): number {
  const c = s.config;
  return c.eventIntervalDays + (rngOf(s).next() * 2 - 1) * c.eventJitterDays;
}

export function crisisWeight(s: GameState, c: CrisisDef): number {
  const req = c.requires;
  if (req?.coalitionTag && !coalition(s).some((p) => matchesTag(p, req.coalitionTag!))) return 0;
  if (req?.maxApproval !== undefined && s.approval > req.maxApproval) return 0;
  if (req?.noWar && s.war.active) return 0;
  if (req?.maxFiscal !== undefined && s.fiscal > req.maxFiscal) return 0;
  if (req?.minTrial !== undefined && s.trial < req.minTrial) return 0;
  if (req?.warHistory && !s.war.active && s.stats.warsEnded === 0) return 0;
  let w = c.weight * (1 + (s.pressure[c.id] ?? 0));
  switch (c.id) {
    case 'kaplan': w *= 1 + Math.max(0, 60 - s.street) / 20; break;
    case 'case': w *= 0.5 + s.trial / 50; break;
    case 'trump': w *= 1 + Math.max(0, 50 - s.us) / 25; break;
    case 'rebel': w *= 1 + Math.max(0, 60 - pmParty(s).satisfaction) / 20; break;
    case 'deal': w *= s.war.active ? 3 : 1; break;
    case 'budget': if (s.budgetPassedYear >= budgetDueYear(s)) return 0; break;
  }
  return w;
}

/** is a remedy option currently usable? */
export const hasTension = (s: GameState) => s.war.active || s.day < s.tensionUntil;

export function remedyAvailable(s: GameState, id: string): boolean {
  const r = remedyById.get(id);
  if (!r) return false;
  if (r.context === 'tension' && !hasTension(s)) return false;
  if (r.once && s.usedOnce.includes(id)) return false;
  if (r.travel && s.day < s.iccUntil) return false;
  if (id === 'war') return !s.war.active && s.war.cooldownDays <= 0;
  if (id === 'buytime') {
    const p = s.event?.subject ? partyById(s, s.event.subject) : undefined;
    return !!p && !p.trust.extended;
  }
  if (id === 'fire') return coalition(s).some((p) => p.tags.includes('farright') && ministryCounts(s.ministries)[p.id]);
  return true;
}

// ---------------------------------------------------------------- effects

function resolveTargets(s: GameState, target: string, subject: string | null): Party[] {
  switch (target) {
    case 'subject': return subject ? s.parties.filter((p) => p.id === subject) : [];
    case 'coalition': return coalition(s).filter((p) => p.id !== s.base.pmParty);
    case 'opposition': return s.parties.filter((p) => !p.inCoalition);
    case 'all': return s.parties;
    case 'pm': return [pmParty(s)];
    default: return s.parties.filter((p) => matchesTag(p, target));
  }
}

function applyEffect(s: GameState, e: Effect, subject: string | null) {
  if (e.position) s.govPosition = clamp(s.govPosition + e.position, -10, 10);
  if (e.approval) s.approval = clamp(s.approval + e.approval, 0, 100);
  if (e.street && !(s.war.active && e.street < 0)) s.street = clamp(s.street + e.street, 0, 100);
  if (e.us) s.us = clamp(s.us + e.us, 0, 100);
  if (e.fiscal) s.fiscal = clamp(s.fiscal + e.fiscal, 0, 100);
  if (e.trial) s.trial = clamp(s.trial + e.trial, 0, 100);
  if (e.pauseTrialDays) {
    s.trialPausedUntil = Math.max(s.trialPausedUntil, s.day) + e.pauseTrialDays;
    s.openCases = s.openCases.map((d) => d + e.pauseTrialDays!);
  }
  if (e.quietDays) s.nextEventInDays += e.quietDays;
  for (const { target, delta } of e.sat ?? []) {
    for (const p of resolveTargets(s, target, subject)) p.satisfaction = clamp(p.satisfaction + delta, 0, 100);
  }
  switch (e.special) {
    case 'war': startWar(s); break;
    case 'endWar': if (s.war.active) endWar(s); break;
    case 'ministryToSubject': {
      const coal = coalition(s);
      const to = (subject && partyById(s, subject)?.inCoalition ? partyById(s, subject) : null)
        ?? [...coal].filter((p) => p.id !== s.base.pmParty).sort((a, b) => a.satisfaction - b.satisfaction)[0];
      if (!to) break;
      const counts = ministryCounts(s.ministries);
      const from = [...coal].filter((p) => p.id !== to.id && (counts[p.id] ?? 0) > 0)
        .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))[0];
      const m = from && s.ministries.find((x) => x.holder === from.id);
      if (m) transferMinistry(s, m.id, to.id);
      break;
    }
    case 'fireFarRight': {
      const counts = ministryCounts(s.ministries);
      const fr = coalition(s).filter((p) => p.tags.includes('farright') && counts[p.id])
        .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))[0];
      const m = fr && s.ministries.find((x) => x.holder === fr.id);
      if (m) { m.holder = s.base.pmParty; log(s, 'log.fired', { party: fr.id, ministry: m.id }, 'info'); }
      break;
    }
    case 'fireDefence': {
      const m = s.ministries.find((x) => x.id === 'defense');
      const holder = m?.holder ? partyById(s, m.holder) : undefined;
      if (m && holder) {
        if (holder.id !== s.base.pmParty) holder.satisfaction = clamp(holder.satisfaction - 20, 0, 100);
        m.holder = s.base.pmParty;
        log(s, 'log.firedDefence', { party: holder.id }, 'info');
      }
      break;
    }
    case 'deliverPromise': {
      const p = subject ? partyById(s, subject) : undefined;
      const def = p?.trust.promiseId ? promiseById.get(p.trust.promiseId) : undefined;
      if (!p || !def || p.trust.state === 'neutral') break;
      if (def.deliveredBy === 'ministry') {
        const counts = ministryCounts(s.ministries);
        const from = coalition(s).filter((x) => x.id !== p.id && (counts[x.id] ?? 0) > 0)
          .sort((x, y) => (counts[y.id] ?? 0) - (counts[x.id] ?? 0))[0];
        const m = from && s.ministries.find((x) => x.holder === from.id);
        if (m) transferMinistry(s, m.id, p.id);
      } else applyMove(s, def.deliveredBy, p.id);
      p.trust = { state: 'neutral', promiseId: null, until: 0 };
      break;
    }
    case 'buyTime': {
      const p = subject ? partyById(s, subject) : undefined;
      if (!p || p.trust.state !== 'angry') break;
      p.trust = { state: 'believing', promiseId: p.trust.promiseId, until: s.day + s.config.buyTimeDays, extended: true };
      p.satisfaction = clamp(p.satisfaction - 5, 0, 100);
      log(s, 'log.buyTime', { party: p.id }, 'info');
      break;
    }
    case 'refuse': {
      const p = subject ? partyById(s, subject) : undefined;
      if (!p || p.trust.state !== 'angry') break;
      breakPromise(s, p);
      log(s, 'log.refusedPromise', { party: p.id }, 'bad');
      if (p.inCoalition) leave(s, p);
      break;
    }
    case 'elections': callElections(s, 'early'); break;
    case 'passBudget':
      s.budgetPassedYear = budgetDueYear(s);
      log(s, 'log.budgetPassed', { year: s.budgetPassedYear }, 'good');
      break;
    case 'defector':
      s.defectors++;
      log(s, 'log.defector', { n: s.defectors }, 'bad');
      break;
  }
}

/** apply a remedy/law move: effect + backfire pressure + promise delivery */
function applyMove(s: GameState, moveId: string, subject: string | null, extra?: Effect) {
  const r = remedyById.get(moveId);
  if (!r) return;
  if (r.once && !s.usedOnce.includes(moveId)) s.usedOnce.push(moveId);
  if (r.tension) s.tensionUntil = Math.max(s.tensionUntil, s.day + r.tension);
  applyEffect(s, r.effect, subject);
  if (extra) applyEffect(s, extra, subject);
  for (const b of r.backfires) s.pressure[b] = (s.pressure[b] ?? 0) + s.config.backfirePressure;
  deliverPromises(s, moveId, subject);
}

function deliverPromises(s: GameState, moveId: string, recipient: string | null) {
  for (const p of s.parties) {
    if (p.trust.state === 'neutral' || !p.trust.promiseId) continue;
    const def = promiseById.get(p.trust.promiseId);
    if (!def || def.deliveredBy !== moveId) continue;
    if (moveId === 'ministry' && recipient !== p.id) continue;
    const wasBelieving = p.trust.state === 'believing';
    p.satisfaction = clamp(p.satisfaction + s.config.promiseDeliverBonus * (wasBelieving ? 1 : 0.5), 0, 100);
    p.trust = { state: 'neutral', promiseId: null, until: 0 };
    s.stats.promisesKept++;
    log(s, 'log.delivered', { party: p.id, promise: def.id }, 'good');
  }
}

function transferMinistry(s: GameState, ministryId: string, toId: string) {
  const m = s.ministries.find((x) => x.id === ministryId)!;
  const from = m.holder ? partyById(s, m.holder) : undefined;
  const to = partyById(s, toId)!;
  m.holder = toId;
  if (from) {
    const loss = from.id === s.base.pmParty ? s.config.ministryLoss / 3 : s.config.ministryLoss;
    from.satisfaction = clamp(from.satisfaction - loss, 0, 100);
  }
  to.satisfaction = clamp(to.satisfaction + s.config.ministryGain, 0, 100);
  log(s, 'log.ministry', { ministry: ministryId, from: from?.id ?? '-', to: toId }, 'info');
  deliverPromises(s, 'ministry', toId);
}

// ---------------------------------------------------------------- war

function startWar(s: GameState) {
  if (s.war.active) return;
  const c = s.config;
  s.war = { active: true, leftDays: c.warDurationDays, cooldownDays: c.warCooldownDays };
  s.approval = clamp(s.approval + c.warApproval, 0, 100);
  s.fiscal = clamp(s.fiscal + c.warFiscal, 0, 100);
  for (const p of s.parties) {
    if (p.tags.includes('farright')) p.satisfaction = clamp(p.satisfaction + 5, 0, 100);
    if (!p.inCoalition && p.joinsWartime && p.willSitWithBibi && p.seats > 0) {
      p.inCoalition = true;
      p.wartime = true;
      p.satisfaction = 50;
      log(s, 'log.wartimeJoin', { party: p.id }, 'good');
    }
  }
  log(s, 'log.war', {}, 'event');
}

function endWar(s: GameState) {
  s.war.active = false;
  s.war.leftDays = 0;
  s.stats.warsEnded++;
  s.approval = clamp(s.approval + s.config.warEndApproval, 0, 100);
  for (const p of s.parties) {
    if (p.wartime) {
      p.wartime = false;
      leave(s, p, 'log.wartimeLeave');
    }
  }
  log(s, 'log.warEnd', {}, 'info');
}

function leave(s: GameState, p: Party, key = 'log.left') {
  if (!p.inCoalition || p.id === s.base.pmParty) return;
  const b = wrapDepth ? null : snap(s);
  p.inCoalition = false;
  p.wartime = false;
  p.threatening = false;
  for (const m of s.ministries) if (m.holder === p.id) m.holder = s.base.pmParty;
  log(s, key, { party: p.id }, 'bad');
  if (b) record(s, 'leave', { key: key === 'log.wartimeLeave' ? 'out.wartimeLeave' : 'out.left', params: { party: p.id } }, b);
}

// ---------------------------------------------------------------- elections

function pmBonus(s: GameState) {
  return (s.approval - s.config.approvalNeutral) * s.config.approvalSeatFactor;
}

function callElections(s: GameState, reason: string) {
  if (s.phase === 'campaign' || s.status !== 'playing') return;
  const b = wrapDepth ? null : snap(s);
  if (s.war.active) endWar(s);
  s.phase = 'campaign';
  s.phaseLeftDays = s.config.campaignDays;
  s.event = null;
  s.elections++;
  const base = s.base.parties.find((p) => p.id === s.base.pmParty)!;
  s.campaignPollSeats = Math.round(base.seats + pmBonus(s));
  log(s, 'log.elections', { reason, n: s.elections, poll: s.campaignPollSeats }, 'bad');
  if (b) record(s, 'elections', { key: `out.elections.${reason}`, params: { poll: s.campaignPollSeats } }, b);
}

function resolveElection(s: GameState) {
  const b = snap(s);
  wrapDepth++;
  try { resolveElectionInner(s); } finally { wrapDepth--; }
  if (s.status === 'lost') record(s, 'newGov', { key: 'out.noGovLost' }, b);
  else if (s.phase === 'governing') record(s, 'newGov', { key: 'out.newGov', params: { seats: seatsOf(s), pm: pmParty(s).seats } }, b);
  else record(s, 'elections', { key: 'out.elections.deadlock', params: { poll: s.campaignPollSeats } }, b);
}

function resolveElectionInner(s: GameState) {
  const c = s.config;
  const seats = runElection(s.base.parties, {
    totalSeats: c.totalSeats, threshold: c.threshold, noise: c.electionNoise, noiseMin: c.electionNoiseMin,
    pmBonus: pmBonus(s), pmId: s.base.pmParty,
  }, rngOf(s));
  for (const p of s.parties) { p.seats = seats[p.id] ?? 0; p.inCoalition = false; p.wartime = false; p.threatening = false; }
  const ids = formGovernment(s.parties, s.base.pmParty, c.majority);
  log(s, 'log.results', { results: s.parties.filter((p) => p.seats > 0).map((p) => `${p.short} ${p.seats}`).join(', ') }, 'event');
  if (!ids) {
    s.failedElections++;
    if (s.failedElections >= c.maxFailedElections) {
      s.status = 'lost';
      log(s, 'log.lost', {}, 'bad');
      return;
    }
    s.phase = 'governing'; // so callElections proceeds
    log(s, 'log.noGov', {}, 'bad');
    callElections(s, 'deadlock');
    return;
  }
  const coalSeats = ids.reduce((n, id) => n + partyById(s, id)!.seats, 0);
  let pos = 0;
  for (const p of s.parties) {
    if (ids.includes(p.id)) {
      p.inCoalition = true;
      p.satisfaction = Math.max(p.satisfaction, 55);
      pos += (p.position * p.seats) / coalSeats;
    }
  }
  s.govPosition = Math.round(pos * 10) / 10;
  s.ministries = allocateMinistries(s.ministries, s.parties);
  s.defectors = 0;
  s.failedElections = 0;
  s.stats.electionsSurvived++;
  if (s.campaignPollSeats < 25) s.stats.comebacks++;
  s.refusedBy = [];
  s.termEndsDay = s.day + c.knessetTermDays;
  s.approval = clamp(s.approval + 5, 0, 100);
  s.phase = 'governing';
  s.nextEventInDays = scheduleNext(s);
  if (c.restartTermOnElection) s.pmDays = 0;
  log(s, 'log.newGov', { seats: seatsOf(s), parties: ids.length }, 'good');
}

// ---------------------------------------------------------------- events

function breakPromise(s: GameState, p: Party) {
  p.trust = { state: 'distrust', promiseId: p.trust.promiseId, until: s.day + s.config.promiseDistrustDays };
  p.satisfaction = clamp(p.satisfaction - s.config.promiseBrokenPenalty, 0, 100);
  s.stats.brokenPromises++;
  log(s, 'log.broken', { party: p.id }, 'bad');
}

function fireCrisis(s: GameState, c: CrisisDef, subjectOverride?: string | null) {
  let subject: string | null = null;
  if (subjectOverride !== undefined) subject = subjectOverride;
  else if (c.subjectMinistry) subject = s.ministries.find((m) => m.id === c.subjectMinistry)?.holder ?? null;
  else if (c.subjectTag === 'pm') subject = s.base.pmParty;
  else if (c.subjectTag === 'coalition') {
    const partners = coalition(s).filter((p) => p.id !== s.base.pmParty);
    subject = partners.length ? partners[Math.floor(rngOf(s).next() * partners.length)].id : null;
  } else if (c.subjectTag) {
    subject = coalition(s).filter((p) => matchesTag(p, c.subjectTag!))
      .sort((a, b) => a.satisfaction - b.satisfaction)[0]?.id ?? null;
  }
  s.event = { id: c.id, subject, firedAt: s.day, leftDays: c.urgent ? s.config.urgentTimeoutDays : s.config.eventTimeoutDays };
  if (c.onFire) applyEffect(s, c.onFire, subject);
  if (c.tension) s.tensionUntil = Math.max(s.tensionUntil, s.day + c.tension);
  if (c.icc) s.iccUntil = Math.max(s.iccUntil, s.day + c.icc);
  if (c.opensCase) {
    s.openCases.push(s.day + 730);
    s.stats.casesSurvived++;
    s.stats.maxOpenCases = Math.max(s.stats.maxOpenCases, s.openCases.length);
  }
  log(s, 'log.crisis', { crisis: c.id, subject: subject ?? '' }, 'event');
}

export type Dir = 'left' | 'right' | 'up' | 'down';
export const DIRS: Dir[] = ['left', 'right', 'up', 'down'];

/** the current crisis card: ≤3 remedies on left/right/up, elections on down */
export type OptionDir = Dir | 'ignore';

/** the current crisis card: ≤3 remedies on left/right/up, elections on down, plus a separate
 *  "ignore it" tap (dir 'ignore', key 0) on every non-urgent card */
export function eventOptions(s: GameState): { id: string; dir: OptionDir; available: boolean }[] {
  if (!s.event) return [];
  const c = crisisById.get(s.event.id)!;
  const opts: { id: string; dir: OptionDir; available: boolean }[] =
    c.remedies.slice(0, 3).map((id, i) => ({ id, dir: DIRS[i], available: remedyAvailable(s, id) }));
  opts.push({ id: 'elections', dir: 'down', available: true });
  if (!c.urgent) opts.push({ id: 'ignore', dir: 'ignore', available: true });
  return opts;
}

function resolveEvent(s: GameState, optionId: string, timedOut = false) {
  const ev = s.event!;
  const cause: Outcome['cause'] = optionId === 'ignore'
    ? { key: timedOut ? 'out.timedOutIgnore' : 'out.ignored', params: { crisis: ev.id, party: ev.subject ?? '' } }
    : { key: timedOut ? 'out.timedOut' : 'out.chose', params: { crisis: ev.id, remedy: optionId, party: ev.subject ?? '' } };
  withOutcome(s, timedOut ? 'timeout' : 'choice', cause, () => resolveEventInner(s, optionId));
}

function resolveEventInner(s: GameState, optionId: string) {
  const ev = s.event!;
  const c = crisisById.get(ev.id)!;
  s.event = null;
  s.nextEventInDays = scheduleNext(s);
  if (optionId === 'ignore') {
    applyEffect(s, c.ignore, ev.subject);
    s.pressure[c.id] = (s.pressure[c.id] ?? 0) + s.config.ignorePressure;
    log(s, 'log.ignored', { crisis: c.id }, 'bad');
  } else {
    s.stats.crisesHandled++;
    log(s, 'log.chose', { crisis: c.id, remedy: optionId }, 'info');
    applyMove(s, optionId, ev.subject, c.extra?.[optionId]);
  }
  checkCoalition(s);
}

// ---------------------------------------------------------------- tick

function checkCoalition(s: GameState) {
  if (s.phase !== 'governing' || s.status !== 'playing') return;
  const c = s.config;
  for (const p of coalition(s)) {
    if (p.id === s.base.pmParty) continue;
    if (p.satisfaction <= 0) { leave(s, p); continue; }
    if (!p.threatening && p.satisfaction < c.threatenBelow) {
      p.threatening = true;
      log(s, 'log.threat', { party: p.id }, 'bad');
    } else if (p.threatening && p.satisfaction > c.threatenResetAbove) p.threatening = false;
  }
  if (seatsOf(s) < c.majority) callElections(s, 'collapse');
}

function tickDay(s: GameState, dt: number) {
  const c = s.config;
  // meters (both phases)
  if (s.day >= s.trialPausedUntil) s.trial = clamp(s.trial + c.trialGrowthPerDay * dt, 0, 100);
  if (!s.war.active) s.street += (60 - s.street) * c.meterRegression * dt;
  s.us += (55 - s.us) * c.meterRegression * dt;
  s.fiscal += (50 - s.fiscal) * c.meterRegression * dt;
  const target = 20 + 0.2 * s.street + 0.15 * s.us + 0.1 * s.fiscal - 0.15 * s.trial
    + (s.war.active ? c.warApprovalBonusTarget : 0) - c.fatiguePerYear * (s.pmDays / 365.25);
  s.approval = clamp(s.approval + (target - s.approval) * c.approvalRegression * dt, 0, 100);
  for (const k of Object.keys(s.pressure)) s.pressure[k] *= Math.max(0, 1 - c.pressureDecayPerDay * dt);
  s.openCases = s.openCases.filter((d) => d > s.day);

  for (const p of s.parties) {
    if (p.trust.state === 'believing' && s.day >= p.trust.until) {
      if (p.seats > 0) {
        // no silent switch: the party comes to collect (angry-reminder card)
        p.trust = { ...p.trust, state: 'angry' };
        s.queue.push({ id: 'angry', subject: p.id });
      } else breakPromise(s, p);
    } else if (p.trust.state === 'distrust' && s.day >= p.trust.until) {
      p.trust = { state: 'neutral', promiseId: null, until: 0 };
    }
  }

  if (s.phase === 'campaign') {
    s.phaseLeftDays -= dt;
    if (s.phaseLeftDays <= 0) resolveElection(s);
    return;
  }

  checkCoalition(s);
  if (s.phase !== 'governing') return;
  // cooldowns & war
  s.cooldowns.ministry = Math.max(0, s.cooldowns.ministry - dt);
  s.cooldowns.law = Math.max(0, s.cooldowns.law - dt);
  s.cooldowns.invite = Math.max(0, s.cooldowns.invite - dt);
  s.war.cooldownDays = Math.max(0, s.war.cooldownDays - dt);
  if (s.war.active) {
    s.war.leftDays -= dt;
    if (s.war.leftDays <= 0) endWar(s);
  }

  // party satisfaction
  const coal = coalition(s);
  for (const p of s.parties) {
    const d = satDrivers(s, p).reduce((n, x) => n + x.perDay, 0);
    p.satisfaction = clamp(p.satisfaction + d * dt, 0, 100);
  }

  // big-coalition streak
  if (coal.length >= 6) {
    s.stats.bigCoalitionStreak += dt;
    s.stats.bigCoalitionBest = Math.max(s.stats.bigCoalitionBest, s.stats.bigCoalitionStreak);
  } else s.stats.bigCoalitionStreak = 0;

  if (s.day >= s.termEndsDay) { callElections(s, 'scheduled'); return; }

  // budget: nag in Feb–Mar, automatic elections on 1 April without one
  const d = dateOf(s);
  const due = budgetDueYear(s);
  if (s.budgetPassedYear < due) {
    if (d.getUTCMonth() >= c.budgetNagFromMonth && d.getUTCMonth() <= 2 && !s.event && s.day - s.lastBudgetNag >= 20) {
      s.lastBudgetNag = s.day;
      fireCrisis(s, crisisById.get('budget')!);
    }
  }
  if (d.getUTCMonth() === 3 && s.budgetPassedYear < d.getUTCFullYear()) {
    s.budgetPassedYear = d.getUTCFullYear();
    log(s, 'log.noBudget', {}, 'bad');
    callElections(s, 'budget');
    return;
  }

  // events
  if (s.event) {
    s.event.leftDays -= dt;
    if (s.event.leftDays <= 0) resolveEvent(s, crisisById.get(s.event.id)?.defaultOption ?? 'ignore', true);
  } else if (s.queue.length) {
    const q = s.queue.shift()!;
    const p = q.subject ? partyById(s, q.subject) : undefined;
    if (!p || p.trust.state === 'angry') fireCrisis(s, crisisById.get(q.id)!, q.subject);
  } else {
    s.nextEventInDays -= dt;
    if (s.nextEventInDays <= 0) {
      const rng = rngOf(s);
      const c2 = pickWeighted(rng, CRISES.map((x) => ({ item: x, weight: crisisWeight(s, x) })));
      if (c2) fireCrisis(s, c2);
      else s.nextEventInDays = scheduleNext(s);
    }
  }
  checkCoalition(s);
}

function checkTitles(s: GameState) {
  for (const t of TITLES) {
    if (s.titles.includes(t.id)) continue;
    const ok = t.kind === 'tenure' ? s.pmDays >= t.threshold : (s.stats[t.stat!] ?? 0) >= t.threshold;
    if (ok) {
      s.titles.push(t.id);
      log(s, 'log.title', { title: t.id }, 'title');
    }
  }
}

/** Advance the game by `days` game days (fractional ok). */
export function step(s: GameState, days: number) {
  let left = days;
  while (left > 1e-9 && s.status === 'playing') {
    const dt = Math.min(1, left);
    tickDay(s, dt);
    if (s.status !== 'playing') break;
    s.day += dt;
    s.pmDays += dt;
    left -= dt;
    if (!s.termReached && s.pmDays >= s.config.termDays) {
      s.termReached = true;
      log(s, 'log.term', {}, 'good');
      if (s.config.stopAtTerm) s.status = 'won';
    }
    checkTitles(s);
  }
}

// ---------------------------------------------------------------- actions

export function act(s: GameState, a: Action): ActionResult {
  s.outcomes ??= [];
  s.outcomeSeq ??= 0;
  if (a.type === 'choose' || a.type === 'noop') return actInner(s, a);
  const b = snap(s);
  wrapDepth++;
  let r: ActionResult;
  try { r = actInner(s, a); } finally { wrapDepth--; }
  if (r.ok) record(s, 'action', actionCause(a), b);
  return r;
}

function actionCause(a: Action): Outcome['cause'] {
  switch (a.type) {
    case 'giveMinistry': return { key: 'out.ministry', params: { ministry: a.ministryId, party: a.partyId } };
    case 'startWar': return { key: 'out.war' };
    case 'passLaw': return { key: 'out.law', params: { law: a.lawId } };
    case 'invite': return { key: 'out.invite', params: { party: a.partyId } };
    case 'promise': return { key: 'out.promise', params: { party: a.partyId, promise: a.promiseId } };
    case 'deliver': return { key: 'out.deliver', params: { party: a.partyId, promise: a.promiseId } };
    default: return { key: 'out.action' };
  }
}

function actInner(s: GameState, a: Action): ActionResult {
  if (s.status !== 'playing') return { ok: false, error: 'err.over' };
  if (a.type === 'noop') return { ok: true };
  if (s.phase !== 'governing') return { ok: false, error: 'err.campaign' };
  const c = s.config;
  switch (a.type) {
    case 'choose': {
      if (!s.event) return { ok: false, error: 'err.noEvent' };
      const def = crisisById.get(s.event.id)?.defaultOption;
      // on urgent cards (no ignore) "ignore" means the card's default (e.g. refuse)
      if (a.optionId === 'ignore' && def) { resolveEvent(s, def); return { ok: true }; }
      const opt = eventOptions(s).find((o) => o.id === a.optionId || o.dir === a.optionId);
      if (!opt) return { ok: false, error: 'err.badOption' };
      if (!opt.available) return { ok: false, error: 'err.unavailable' };
      resolveEvent(s, opt.id);
      return { ok: true };
    }
    case 'giveMinistry': {
      if (s.cooldowns.ministry > 0) return { ok: false, error: 'err.cooldown' };
      const m = s.ministries.find((x) => x.id === a.ministryId);
      const p = partyById(s, a.partyId);
      if (!m || !p) return { ok: false, error: 'err.unknown' };
      if (!p.inCoalition) return { ok: false, error: 'err.notInCoalition' };
      if (m.holder === p.id) return { ok: false, error: 'err.alreadyHolds' };
      transferMinistry(s, m.id, p.id);
      for (const b of remedyById.get('ministry')!.backfires) s.pressure[b] = (s.pressure[b] ?? 0) + c.backfirePressure;
      s.cooldowns.ministry = c.ministryCooldownDays;
      checkCoalition(s);
      return { ok: true };
    }
    case 'startWar': {
      if (!remedyAvailable(s, 'war')) return { ok: false, error: 'err.cooldown' };
      applyMove(s, 'war', null);
      checkCoalition(s);
      return { ok: true };
    }
    case 'passLaw': {
      if (!LAWS.includes(a.lawId)) return { ok: false, error: 'err.unknown' };
      if (s.cooldowns.law > 0) return { ok: false, error: 'err.cooldown' };
      log(s, 'log.law', { law: a.lawId }, 'info');
      applyMove(s, a.lawId, null);
      s.cooldowns.law = c.lawCooldownDays;
      checkCoalition(s);
      return { ok: true };
    }
    case 'invite': {
      if (s.cooldowns.invite > 0) return { ok: false, error: 'err.cooldown' };
      const p = partyById(s, a.partyId);
      if (!p || p.seats === 0) return { ok: false, error: 'err.unknown' };
      if (p.inCoalition) return { ok: false, error: 'err.alreadyIn' };
      s.cooldowns.invite = c.inviteCooldownDays;
      const coal = coalition(s);
      const conflicts = hateCount(p, coal) + coal.filter((x) => hateCount(x, [p]) > 0).length;
      const chance = !p.willSitWithBibi ? 0 : clamp(
        c.inviteBaseChance + (p.satisfaction / 100) * 0.5 - Math.abs(p.position - s.govPosition) * 0.04
          - conflicts * 0.15 + (s.approval - 45) / 100, 0.02, 0.95);
      if (rngOf(s).next() < chance) {
        p.inCoalition = true;
        p.satisfaction = 55;
        for (const x of coal) if (hateCount(x, [p]) > 0) x.satisfaction = clamp(x.satisfaction - 20, 0, 100);
        log(s, 'log.joined', { party: p.id }, 'good');
        checkCoalition(s);
      } else {
        if (!s.refusedBy.includes(p.id)) s.refusedBy.push(p.id);
        const opp = s.parties.filter((x) => !x.inCoalition && x.seats > 0);
        if (opp.length && opp.every((x) => s.refusedBy.includes(x.id))) s.stats.refusedByAll = 1;
        log(s, 'log.refused', { party: p.id }, 'bad');
      }
      return { ok: true };
    }
    case 'promise': {
      const p = partyById(s, a.partyId);
      const def = promiseById.get(a.promiseId);
      if (!p || !def || p.seats === 0) return { ok: false, error: 'err.unknown' };
      if (!def.to.includes('any') && !def.to.some((t) => matchesTag(p, t))) return { ok: false, error: 'err.wrongParty' };
      if (p.trust.state === 'distrust') {
        log(s, 'log.notBelieved', { party: p.id }, 'bad');
        return { ok: false, error: 'err.distrust' };
      }
      if (p.trust.state === 'believing') return { ok: false, error: 'err.alreadyPromised' };
      p.trust = { state: 'believing', promiseId: def.id, until: s.day + c.promiseBelieveDays };
      p.satisfaction = clamp(p.satisfaction + c.promiseBoost, 0, 100);
      log(s, 'log.promised', { party: p.id, promise: def.id }, 'info');
      return { ok: true };
    }
    case 'deliver': {
      const p = partyById(s, a.partyId);
      const def = promiseById.get(a.promiseId);
      if (!p || !def) return { ok: false, error: 'err.unknown' };
      if (s.cooldowns.law > 0) return { ok: false, error: 'err.cooldown' };
      if (def.deliveredBy === 'ministry') {
        if (!p.inCoalition) return { ok: false, error: 'err.notInCoalition' };
        const counts = ministryCounts(s.ministries);
        const from = coalition(s).filter((x) => x.id !== p.id && (counts[x.id] ?? 0) > 0)
          .sort((x, y) => (counts[y.id] ?? 0) - (counts[x.id] ?? 0))[0];
        const m = from && s.ministries.find((x) => x.holder === from.id);
        if (!m) return { ok: false, error: 'err.unavailable' };
        transferMinistry(s, m.id, p.id);
      } else {
        if (!remedyAvailable(s, def.deliveredBy)) return { ok: false, error: 'err.unavailable' };
        log(s, 'log.law', { law: def.deliveredBy }, 'info');
        applyMove(s, def.deliveredBy, p.id);
      }
      s.cooldowns.law = c.lawCooldownDays;
      checkCoalition(s);
      return { ok: true };
    }
  }
  return { ok: false, error: 'err.unknown' };
}
