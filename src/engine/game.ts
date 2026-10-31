// Core engine: state creation, time stepping, actions. Pure TS — no DOM,
// no Math.random, no Date.now. All randomness flows through state.rngState.
import type { Ministry,
  Action, ActionResult, Config, CrisisDef, Effect, GameState, KnessetData, LogEntry, Outcome, Party, Trait,
} from './types.ts';
import { makeRng, pickWeighted, type Rng } from './rng.ts';
import {
  allocateMinistries, coalitionSeats, fairShare, formGovernment, hateCount, matchesTag, ministryCounts,
} from './coalition.ts';
import { runElection } from './elections.ts';
import { CRISES, DOMESTIC, LAWS, START_CONDITIONS, crisisById, remedyById } from '../data/crises.ts';
import { promiseById } from '../data/promises.ts';
import { NEW_MINISTRIES, moveById } from '../data/moves.ts';
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

/** causes of the outcomes being recorded (a risky remedy marks its cause as failed) */
const causeStack: Outcome['cause'][] = [];

/** fatigue factor of the move being applied (specials such as a ministry handout use it too) */
let moveFatigue = 1;

/** the outcome being recorded is a gamble that went wrong (shown as "did not work") */
function markFailed() {
  const cause = causeStack[causeStack.length - 1];
  if (cause) cause.params = { ...cause.params, fail: 1 };
}

function withOutcome<T>(s: GameState, kind: Outcome['kind'], cause: Outcome['cause'], fn: () => T): T {
  const b = snap(s);
  wrapDepth++;
  causeStack.push(cause);
  try { return fn(); } finally { wrapDepth--; causeStack.pop(); record(s, kind, cause, b); }
}

/** why a party's satisfaction drifts each day (sum = actual daily drift; nothing thresholded) */
export function satDrivers(
  s: GameState, p: Party,
  ctx: { coal: Party[]; counts: Record<string, number> } = { coal: coalition(s), counts: ministryCounts(s.ministries) },
): { key: string; perDay: number }[] {
  const c = s.config;
  const out: { key: string; perDay: number }[] = [];
  if (s.phase !== 'governing') return out;
  if (p.inCoalition && p.id !== s.base.pmParty) {
    const over = Math.max(0, Math.abs(s.govPosition - p.position) - p.tolerance);
    out.push({ key: s.govPosition > p.position ? 'drift.tooRight' : 'drift.tooLeft', perDay: -over * c.driftPenalty });
    out.push({ key: 'drift.appetite', perDay: -appetite(s) });
    const fair = (ctx.counts[p.id] ?? 0) - fairShare(p, s.parties, s.ministries.length);
    out.push({ key: fair > 0 ? 'drift.ministriesPlus' : 'drift.ministriesMinus', perDay: fair * c.ministryFairness * (p.trait === 'greedy' ? 2 : 1) });
    out.push({ key: 'drift.hate', perDay: -hateCount(p, ctx.coal) * c.hatePenalty });
    const panic = p.trait === 'loyal' ? 0.5 : p.trait === 'opportunist' ? 2 : 1;
    out.push({ key: 'drift.polls', perDay: -panic * Math.min(c.pollPanicMaxPerDay, Math.max(0, c.pollPanicBelow - s.approval) * c.pollPanicPerPoint) });
    if (s.fiscal < c.fiscalCrisisBelow) out.push({ key: 'drift.treasury', perDay: -c.fiscalCrisisMoodPerDay });
  }
  if (p.trust.state === 'believing') out.push({ key: 'drift.believe', perDay: c.believeDriftPerDay });
  if ((p.guardedUntil ?? 0) > s.day) out.push({ key: 'drift.guarded', perDay: c.guardDriftPerDay });
  if (p.trust.state === 'distrust') out.push({ key: 'drift.distrust', perDay: -c.distrustDriftPerDay });
  const reg = (c.satBaseline - p.satisfaction) * c.satRegression;
  out.push({ key: reg > 0 ? 'drift.recover' : 'drift.cool', perDay: reg });
  return out;
}

/** partners' daily appetite: grows with years in office (entropy) */
export function appetite(s: GameState): number {
  return s.config.appetitePerDay * (1 + s.config.appetiteGrowthPerYear * (s.pmDays / 365.25));
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
    lawsPassed: [],
    lastFired: {},
    lastWarEnd: -9999,
    elections: 0,
    failedElections: 0,
    stats: {
      warsEnded: 0, electionsSurvived: 0, casesSurvived: 0, maxOpenCases: 0, refusedByAll: 0,
      comebacks: 0, brokenPromises: 0, promisesKept: 0, bigCoalitionStreak: 0, bigCoalitionBest: 0,
      crisesHandled: 0, returns: 0,
    },
    titles: [],
    log: [],
    outcomes: [],
    outcomeSeq: 0,
    lostReason: null,
    electionDays: [],
    remedyUses: {},
    electionLosses: 0,
    rival: null,
    fromOpposition: false,
    campaignFx: { merger: false, spoiler: false, gevalt: false },
    moveReadyAt: {},
    usedThisTerm: [],
    startConditions: [],
    trumpMood: 0,
  };
  s.nextEventInDays = scheduleNext(s);
  log(s, 'log.start', { seats: seatsOf(s) }, 'info');
  if (cfg.randomStart) randomizeStart(s);
  return s;
}

const TRAITS: Trait[] = ['patient', 'hothead', 'greedy', 'loyal', 'opportunist'];

/** every game starts a little differently: moods, polls, leader traits, 1–2 starting conditions */
function randomizeStart(s: GameState) {
  const c = s.config;
  const rng = rngOf(s);
  const spread = (n: number) => Math.round((rng.next() * 2 - 1) * n);
  for (const p of s.parties) {
    p.satisfaction = clamp(p.satisfaction + spread(c.startMoodSpread), 5, 95);
    if (p.id !== s.base.pmParty && rng.next() < c.traitChance) p.trait = TRAITS[Math.floor(rng.next() * TRAITS.length)];
  }
  s.approval = clamp(s.approval + spread(c.startApprovalSpread), 0, 100);
  s.trumpMood = Math.round((rng.next() * 2 - 1) * 10) / 10;
  const pool = [...START_CONDITIONS];
  const n = rng.next() < 0.5 ? 1 : 2;
  for (let i = 0; i < n && pool.length; i++) {
    const sc = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    s.startConditions.push(sc.id);
    applyEffect(s, sc.effect, null);
    log(s, `log.start.${sc.id}`, {}, 'event');
  }
  for (const p of s.parties) if (p.id !== s.base.pmParty) p.leaveOffset = spread(c.leaveFuzz);
}

/** ±outcomeNoise on the numbers of an effect (same choice, not always the same result) */
function jitter(s: GameState, e: Effect): Effect {
  const n = s.config.outcomeNoise;
  if (!n) return e;
  const rng = rngOf(s);
  const k = () => 1 + n * (rng.next() * 2 - 1);
  const out: Effect = { ...e };
  for (const key of ['approval', 'street', 'us', 'fiscal', 'trial', 'rival'] as const) if (e[key]) out[key] = e[key]! * k();
  if (e.sat) out.sat = e.sat.map((x) => ({ ...x, delta: x.delta * k() }));
  return out;
}

export const TRUMP_EMOJI = ['😠', '🙁', '😐', '🙂', '😍'];
export const trumpFace = (s: GameState) => TRUMP_EMOJI[Math.round(clamp(s.trumpMood ?? 0, -2, 2)) + 2];

// ---------------------------------------------------------------- queries

export const seatsOf = (s: GameState) => coalitionSeats(s.parties, s.defectors);
export const pmParty = (s: GameState) => s.parties.find((p) => p.id === s.base.pmParty)!;
export const coalition = (s: GameState) => s.parties.filter((p) => p.inCoalition);
export const partyById = (s: GameState, id: string) => s.parties.find((p) => p.id === id);

/** Knesset summer recess (governing only): config.recessMonths from config.recessStartMonth */
export function inRecess(s: GameState): boolean {
  const c = s.config;
  if (!c.recessMonths || s.phase !== 'governing') return false;
  const m = dateOf(s).getUTCMonth();
  return (m - c.recessStartMonth + 12) % 12 < c.recessMonths;
}

/** day numbers of the current (or next) recess: [start, end) */
export function recessWindow(s: GameState): { start: number; end: number } {
  const c = s.config;
  const d = dateOf(s);
  const at = (y: number, m: number) => Math.round((Date.UTC(y, m, 1) - Date.parse(c.startDate + 'T00:00:00Z')) / DAY_MS);
  let y = d.getUTCFullYear();
  if (at(y, c.recessStartMonth + c.recessMonths) <= Math.floor(s.day)) y++;
  return { start: at(y, c.recessStartMonth), end: at(y, c.recessStartMonth + c.recessMonths) };
}

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
  const rng = rngOf(s);
  if (s.day > 0 && rng.next() < c.clusterChance) return 1 + rng.next() * c.clusterDays;
  const base = c.eventIntervalDays / (1 + c.eventSpeedupPerYear * (s.pmDays / 365.25));
  return base + (rng.next() * 2 - 1) * c.eventJitterDays * (base / c.eventIntervalDays);
}

function lose(s: GameState, reason: GameState['lostReason']) {
  s.status = 'lost';
  s.lostReason = reason;
}

/** a special ending (Miami, plea bargain, rotation handover): the game ends, titles stay */
function retire(s: GameState, reason: 'miami' | 'plea' | 'rotation') {
  s.status = 'retired';
  s.lostReason = reason;
  s.event = null;
  log(s, `log.end.${reason}`, {}, 'event');
  checkTitles(s);
}

/** what goes into the voters' verdict, one line per factor (shown before the vote) */
export function loseFactors(s: GameState): { id: string; delta: number }[] {
  const c = s.config;
  // before the campaign starts, the next election is one more on the fatigue clock
  const recent = (s.electionDays ?? []).filter((d) => s.day - d <= c.electionFatigueDays).length - (s.phase === 'campaign' ? 1 : 0);
  const fx = s.campaignFx;
  const gap = c.approvalNeutral - s.approval;
  const out = [
    { id: 'base', delta: c.loseBase },
    { id: 'approval', delta: gap > 0 ? gap * c.losePerApprovalPoint : gap * c.loseGainPerApprovalPoint },
    { id: 'cases', delta: s.openCases.length * c.losePerOpenCase },
    { id: 'recent', delta: Math.max(0, recent) * c.losePerRecentElection },
    { id: 'gevalt', delta: fx?.gevalt ? -c.gevaltLose : 0 },
    { id: 'spoiler', delta: fx?.spoiler ? -c.spoilerLose : 0 },
    { id: 'groundgame', delta: s.termFx?.groundGame ? -c.groundGameLose : 0 },
  ];
  return out.filter((x) => x.id === 'base' || Math.abs(x.delta) > 1e-9);
}

/** chance the voters throw you out at this election */
export function loseChance(s: GameState): number {
  return clamp(loseFactors(s).reduce((n, x) => n + x.delta, 0), 0, s.config.loseMax);
}

export function crisisWeight(s: GameState, c: CrisisDef): number {
  const req = c.requires;
  if (req?.coalitionTag && !coalition(s).some((p) => matchesTag(p, req.coalitionTag!))) return 0;
  if (req?.maxApproval !== undefined && s.approval > req.maxApproval) return 0;
  if (req?.noWar && s.war.active) return 0;
  if (req?.maxFiscal !== undefined && s.fiscal > req.maxFiscal) return 0;
  if (req?.ministryHolderTag && c.subjectMinistry) {
    const h = s.ministries.find((m) => m.id === c.subjectMinistry)?.holder;
    const hp = h ? partyById(s, h) : undefined;
    if (!hp || !matchesTag(hp, req.ministryHolderTag)) return 0;
  }
  if (req?.minTrial !== undefined && s.trial < req.minTrial) return 0;
  if (req?.warHistory && !s.war.active && s.stats.warsEnded === 0) return 0;
  const c0 = s.config;
  // summer recess: the Knesset is at the beach; only wildcards (no-card news) still happen
  // opposition cards only in the opposition; everything else only while governing
  if (!!req?.opposition !== (s.phase === 'opposition')) return 0;
  if (!c.goodNews && s.recess && !req?.opposition) return 0;
  if (req?.recess && !s.recess) return 0;
  if (req?.subjectMoodBelow !== undefined && c.subjectTag
    && !coalition(s).some((p) => matchesTag(p, c.subjectTag!) && p.satisfaction < req.subjectMoodBelow!)) return 0;
  // most cards are a one-time story; the rest come back, but not within crisisCooldownDays (good news: a year)
  if (!c.repeats && s.firedCount?.[c.id]) return 0;
  // no card twice within crisisCooldownDays (good news: within a year)
  const last = s.lastFired[c.id];
  if (last !== undefined && s.day - last < (c.goodNews ? c0.goodNewsCooldownDays : c0.crisisCooldownDays)) return 0;
  if (req?.notPassed && s.lawsPassed.includes(req.notPassed)) return 0;
  if (req?.anyLaw && !s.lawsEnacted?.length) return 0;
  if (req?.lawOrPromise && !s.lawsPassed.includes(req.lawOrPromise)
    && !s.parties.some((p) => p.trust.promiseId === req.lawOrPromise && (p.trust.state === 'believing' || p.trust.state === 'angry'))) return 0;
  if (req?.recentWar && !s.war.active && s.day - s.lastWarEnd > c0.recentWarDays) return 0;
  // the same card again and again gets old: each earlier firing this game scales the weight down
  let w = c.weight * (1 + (s.pressure[c.id] ?? 0)) * c0.crisisRepeatDecay ** (s.firedCount?.[c.id] ?? 0);
  switch (c.id) {
    case 'kaplan': w *= Math.min(c0.kaplanStreetMaxMult, 1 + Math.max(0, 60 - s.street) / 20); break;
    // a frozen trial: no new hearings or charges until it thaws (that is what the pause bought)
    case 'case': w *= s.day < s.trialPausedUntil ? 0 : 0.5 + s.trial / 50; break;
    case 'testimony': case 'qatargate': if (s.day < s.trialPausedUntil) return 0; break;
    case 'president': if ((s.trumpMood ?? 0) >= 1 || s.us >= 60) return 0; break;
    // suitcases on "the Washington trip": only once there has been one
    case 'laundry': if (!['dc', 'congress'].some((id) => s.remedyUses?.[id]?.length)) return 0; break;
    // US midterms: only in the autumn of a midterm year (2026, 2030, …), when they are actually held
    case 'midterms': {
      const d = dateOf(s);
      if (d.getUTCFullYear() % 4 !== 2 || d.getUTCMonth() < 9 || d.getUTCMonth() > 10) return 0;
      w *= c0.midtermsSeasonMult;
      break;
    }
    // "Trump cools off" makes no sense while he is still in love (😍)
    case 'trump': w *= (s.trumpMood ?? 0) >= 1 ? 0 : 1 + Math.max(0, 50 - s.us) / 25; break;
    case 'rebel': w *= 1 + Math.max(0, 60 - pmParty(s).satisfaction) / 20; break;
    case 'deal': w *= s.war.active ? 3 : 1; break;
    case 'budget': {
      // the "31 March" card only in budget season (December–March)
      const m = dateOf(s).getUTCMonth();
      if (s.budgetPassedYear >= budgetDueYear(s) || (m > 2 && m < 11)) return 0;
      break;
    }
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
  if (r.permanent && s.lawsPassed.includes(id)) return false;
  if (r.travel && s.day < s.iccUntil) return false;
  if (id === 'war') return !s.war.active && s.war.cooldownDays <= 0;
  if (id === 'ceasefire') return s.war.active;
  if ((id === 'funds' || id === 'deliverpremium') && s.fiscal < s.config.fundsMinFiscal) return false;
  if (id === 'fire') return coalition(s).some((p) => p.tags.includes('farright') && ministryCounts(s.ministries)[p.id]);
  if (id === 'newministry') return s.ministries.length < s.base.ministries.length + s.config.newMinistryMax;
  return true;
}

/** a one-shot option already spent (used once per game, or a permanent law already passed):
 *  drop it from the card instead of greying it out, so a backup can take its side */
function remedySpent(s: GameState, id: string): boolean {
  const r = remedyById.get(id);
  if (id === 'ceasefire' && !s.war.active) return true; // nothing left to end
  return !!r && ((!!r.once && s.usedOnce.includes(id)) || (!!r.permanent && s.lawsPassed.includes(id)));
}

/** slow killers get a log line when they cross a step (cause → effect for things that drift) */
function driftNotes(s: GameState, trial0: number, street0: number) {
  if (Math.floor(s.trial / 10) > Math.floor(trial0 / 10) && s.trial >= 40) {
    log(s, 'log.driftTrial', { trial: Math.floor(s.trial / 10) * 10, n: Math.round(0.15 * s.trial) }, 'bad');
  }
  for (const line of [30, 15]) if (street0 >= line && s.street < line) log(s, 'log.driftStreet', { street: line }, 'bad');
}

/** why an option/move is unavailable (i18n key under why.*), or null when it is available */
export function unavailableReason(s: GameState, id: string): { key: string; params?: Record<string, number> } | null {
  if (id === 'elections' && s.phase === 'opposition') return { key: 'why.inOpposition' };
  const m = moveById.get(id);
  if (m && remedyAvailable(s, id)) {
    if (s.usedThisTerm.includes(id)) return { key: 'why.oncePerTerm' };
    if (m.requires?.war && !s.war.active) return { key: 'why.needWar' };
    if (m.requires?.minTrial !== undefined && s.trial < m.requires.minTrial) return { key: 'why.needTrial', params: { n: m.requires.minTrial } };
    const within = m.requires?.electionsWithinDays;
    if (within !== undefined && s.termEndsDay - s.day > within) {
      return within >= 365 ? { key: 'why.tooEarly' } : { key: 'why.electionsFar', params: { days: within, left: Math.ceil(s.termEndsDay - s.day - within) } };
    }
  }
  if (remedyAvailable(s, id)) {
    const days = moveCooldown(s, id);
    return days > 0 ? { key: 'why.cooldown', params: { days } } : null;
  }
  const r = remedyById.get(id);
  if (!r) return { key: 'why.na' };
  if (id === 'war' && s.war.active) return { key: 'why.atWar' };
  if (id === 'war' && s.war.cooldownDays > 0) return { key: 'why.cooldown', params: { days: Math.ceil(s.war.cooldownDays) } };
  if (id === 'ceasefire') return { key: 'why.noWar' };
  if (r.context === 'tension' && !hasTension(s)) return { key: 'why.tension' };
  if (r.once && s.usedOnce.includes(id)) return { key: 'why.once' };
  if (r.permanent && s.lawsPassed.includes(id)) return { key: 'why.passed' };
  if (r.travel && s.day < s.iccUntil) return { key: 'why.icc', params: { days: Math.ceil(s.iccUntil - s.day) } };
  if (id === 'funds' || id === 'deliverpremium') return { key: 'why.fiscal', params: { n: s.config.fundsMinFiscal } };
  if (id === 'newministry') return { key: 'why.cap' };
  return { key: 'why.na' };
}

/** odds that an invited party says yes (shown before you spend the invitation) */
export function inviteChance(s: GameState, p: Party): number {
  const c = s.config, coal = coalition(s);
  const conflicts = hateCount(p, coal) + coal.filter((x) => hateCount(x, [p]) > 0).length;
  return !p.willSitWithBibi ? 0 : clamp(
    c.inviteBaseChance + (p.satisfaction / 100) * 0.5 - Math.abs(p.position - s.govPosition) * 0.04
      - conflicts * 0.15 + (s.approval - 45) / 100, 0.02, 0.95);
}

/** the likeliest reason an invited party said no (ui.inviteWhy.<id>) */
export function inviteWhy(s: GameState, p: Party): string {
  return !p.willSitWithBibi ? 'bibi' : Math.abs(p.position - s.govPosition) > 4 ? 'far'
    : p.satisfaction < 40 ? 'mood' : s.approval < 40 ? 'polls' : 'luck';
}

/** opposition party an MK can be poached from (the biggest one with 2+ seats) */
export function poachDonor(s: GameState): Party | undefined {
  return s.parties.filter((p) => !p.inCoalition && p.id !== s.base.pmParty && p.seats >= 2).sort((a, b) => b.seats - a.seats)[0];
}

/** can this drawer move be used right now? */
export function moveAvailable(s: GameState, id: string): boolean {
  const m = moveById.get(id);
  if (!m || s.status !== 'playing' || !m.phases.includes(s.phase)) return false;
  if ((s.moveReadyAt?.[id] ?? 0) > s.day) return false;
  if (m.oncePerTerm && s.usedThisTerm?.includes(id)) return false;
  if (!remedyAvailable(s, id)) return false;
  const r = m.requires;
  if (r?.war && !s.war.active) return false;
  if (r?.minTrial !== undefined && s.trial < r.minTrial) return false;
  if (r?.electionsWithinDays !== undefined && s.termEndsDay - s.day > r.electionsWithinDays) return false;
  if (r?.oppositionDonor && !poachDonor(s)) return false;
  return true;
}

/** days until a move is off cooldown (0 = ready) */
export const moveCooldown = (s: GameState, id: string) => Math.max(0, Math.ceil((s.moveReadyAt?.[id] ?? 0) - s.day));

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
  const c = s.config;
  if (e.rival && s.rival) s.rival.stability = clamp(s.rival.stability + e.rival, 0, 100);
  if (e.position) s.govPosition = clamp(s.govPosition + e.position, -10, 10);
  if (e.approval) s.approval = clamp(s.approval + e.approval, 0, 100);
  const street0 = s.street, trial0 = s.trial;
  if (e.street && !(s.war.active && e.street < 0 && !e.streetInWar)) s.street = clamp(s.street + e.street, 0, 100);
  if (e.us) s.us = clamp(s.us + e.us, 0, 100);
  if (e.fiscal) s.fiscal = clamp(s.fiscal + e.fiscal, 0, 100);
  if (e.trial) {
    // a paused trial is frozen: new charges wait too (the pause itself can still lower it)
    if (e.trial > 0 && s.day < s.trialPausedUntil) log(s, 'log.trialFrozen', { days: Math.ceil(s.trialPausedUntil - s.day) }, 'good');
    else s.trial = clamp(s.trial + e.trial, 0, 100);
  }
  driftNotes(s, trial0, street0);
  if (e.pauseTrialDays) {
    s.trialPausedUntil = Math.max(s.trialPausedUntil, s.day) + e.pauseTrialDays;
    s.openCases = s.openCases.map((d) => d + e.pauseTrialDays!);
  }
  if (e.quietDays) s.nextEventInDays += e.quietDays;
  for (const { target, delta } of e.sat ?? []) {
    for (const p of resolveTargets(s, target, subject)) p.satisfaction = clamp(p.satisfaction + delta * (p.trait === 'hothead' ? 1.4 : 1), 0, 100);
  }
  switch (e.special) {
    case 'war': startWar(s); break;
    case 'pivot':
      // "life itself": a domestic card on the table loses the headlines (no ignore penalty)
      if (s.event && DOMESTIC.has(s.event.id)) {
        log(s, 'log.pivot', { crisis: s.event.id }, 'good');
        s.event = null;
        s.nextEventInDays = scheduleNext(s);
      }
      break;
    case 'securityDetail': {
      const p = coalition(s).filter((x) => x.id !== s.base.pmParty).sort((a, b) => a.satisfaction - b.satisfaction)[0];
      if (p) {
        p.satisfaction = clamp(p.satisfaction + 8, 0, 100);
        p.guardedUntil = s.day + c.guardDays;
        log(s, 'log.securityDetail', { party: p.id }, 'info');
      }
      break;
    }
    case 'endWar': if (s.war.active) endWar(s); break;
    case 'ministryToSubject': {
      const to = ministryTarget(s, subject).to;
      if (!to) break;
      if (to.id === s.base.pmParty) {
        // a rebel in your own party: a deputy-minister post (no partner loses a ministry)
        to.satisfaction = clamp(to.satisfaction + c.pmPostBoost, 0, 100);
        log(s, 'log.pmPost', {}, 'info');
        break;
      }
      const m = ministryFor(s, to);
      if (m) transferMinistry(s, m.id, to.id, moveFatigue);
      else {
        // nothing left to hand out without gutting your own party: a deputy-minister post instead
        to.satisfaction = clamp(to.satisfaction + c.pmPostBoost, 0, 100);
        log(s, 'log.deputyPost', { party: to.id }, 'info');
      }
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
      const group = promiseGroup(s, p);
      if (def.deliveredBy === 'ministry') {
        for (const x of group) { const m = ministryFor(s, x); if (m) transferMinistry(s, m.id, x.id); }
      } else applyMove(s, def.deliveredBy, p.id, undefined, c.premiumCostScale);
      for (const x of group) x.trust = { state: 'neutral', promiseId: null, until: 0 };
      break;
    }
    case 'refuse': {
      const p = subject ? partyById(s, subject) : undefined;
      if (!p || p.trust.state !== 'angry') break;
      for (const x of promiseGroup(s, p)) {
        breakPromise(s, x);
        log(s, 'log.refusedPromise', { party: x.id }, 'bad');
        if (x.inCoalition) leave(s, x);
      }
      break;
    }
    case 'elections': callElections(s, 'early'); break;
    case 'passBudget':
      s.budgetPassedYear = budgetDueYear(s);
      log(s, 'log.budgetPassed', { year: s.budgetPassedYear }, 'good');
      break;
    case 'groundGame':
      s.termFx = { ...s.termFx, groundGame: true };
      log(s, 'log.groundGame', { n: Math.round(c.groundGameLose * 100) }, 'info');
      break;
    case 'defector':
      s.defectors++;
      log(s, 'log.defector', { n: s.defectors }, 'bad');
      break;
    case 'poach': {
      const donor = poachDonor(s);
      if (!donor) break;
      donor.seats--;
      pmParty(s).seats++;
      donor.satisfaction = clamp(donor.satisfaction - 25, 0, 100);
      log(s, 'log.poach', { party: donor.id }, 'info');
      break;
    }
    case 'newMinistry': {
      const id = NEW_MINISTRIES.find((x) => !s.ministries.some((m) => m.id === x));
      if (!id) break;
      const sub = subject ? partyById(s, subject) : undefined;
      const to = (sub?.inCoalition ? sub : undefined)
        ?? coalition(s).filter((p) => p.id !== s.base.pmParty).sort((a, b) => a.satisfaction - b.satisfaction)[0]
        ?? pmParty(s);
      s.ministries.push({ id, holder: to.id });
      if (to.id !== s.base.pmParty) to.satisfaction = clamp(to.satisfaction + c.ministryGain, 0, 100);
      log(s, 'log.newMinistry', { ministry: id, party: to.id }, 'info');
      break;
    }
    case 'exileRival':
      s.pressure.rebel = 0;
      if (s.defectors > 0) s.defectors--;
      log(s, 'log.exileRival', {}, 'info');
      break;
    case 'primetime': {
      const d = c.primetimeMin + rngOf(s).next() * (c.primetimeMax - c.primetimeMin);
      s.approval = clamp(s.approval + d, 0, 100);
      if (d < 0) markFailed();
      log(s, d >= 0 ? 'log.primetimeUp' : 'log.primetimeDown', { n: Math.round(Math.abs(d)) }, d >= 0 ? 'good' : 'bad');
      break;
    }
    case 'postponeElections':
    {
      s.termEndsDay = Math.max(s.termEndsDay, s.day) + c.postponeDays;
      // once per term (moves.ts), but a habit gets noticed: each repeat in a game costs more
      const n = s.postponements = (s.postponements ?? 0) + 1;
      if (n > 1) {
        s.approval = clamp(s.approval - c.postponeRepeatApproval * (n - 1), 0, 100);
        s.street = clamp(s.street - c.postponeRepeatStreet * (n - 1), 0, 100);
        log(s, 'log.postponedAgain', { n }, 'bad');
      } else log(s, 'log.postponed', {}, 'bad');
    }
      break;
    case 'merger': s.campaignFx.merger = true; log(s, 'log.merger', {}, 'info'); break;
    case 'gevalt': s.campaignFx.gevalt = true; s.campaignPollSeats += c.gevaltSeats; log(s, 'log.gevalt', {}, 'info'); break;
    case 'spoiler':
      s.campaignFx.spoiler = true;
      s.campaignPollSeats += c.spoilerSeats;
      if (rngOf(s).next() < c.spoilerExposeChance) {
        s.openCases.push(s.day + 730);
        s.stats.casesSurvived++;
        s.stats.maxOpenCases = Math.max(s.stats.maxOpenCases, s.openCases.length);
        s.trial = clamp(s.trial + 8, 0, 100);
        s.approval = clamp(s.approval - 3, 0, 100);
        markFailed();
        log(s, 'log.spoilerExposed', {}, 'bad');
      } else log(s, 'log.spoiler', {}, 'info');
      break;
    case 'oppPoach': log(s, 'log.oppPoach', {}, 'info'); break;
    case 'noConfidence': {
      if (!s.rival) break;
      const chance = clamp(1 - s.rival.stability / c.noConfidenceScale, 0.05, 0.9);
      if (rngOf(s).next() < chance) {
        log(s, 'log.noConfidenceWon', {}, 'good');
        callElections(s, 'noconfidence');
      } else {
        s.approval = clamp(s.approval - 2, 0, 100);
        log(s, 'log.noConfidenceFailed', {}, 'bad');
      }
      break;
    }
    case 'breakRotation': {
      const p = subject ? partyById(s, subject) : undefined;
      if (!p) break;
      p.trust = { state: 'distrust', promiseId: 'rotation', until: s.day + c.rotationDistrustDays };
      p.satisfaction = clamp(p.satisfaction - c.rotationBrokenPenalty, 0, 100);
      for (const x of coalition(s)) if (x.id !== p.id && x.id !== s.base.pmParty) x.satisfaction = clamp(x.satisfaction - 5, 0, 100);
      s.stats.brokenPromises++;
      log(s, 'log.brokeRotation', { party: p.id }, 'bad');
      break;
    }
    case 'handover': retire(s, 'rotation'); break;
    case 'plea': retire(s, 'plea'); break;
    case 'miami': retire(s, 'miami'); break;
  }
}

/** scale the positive parts of an effect (negatives stay full) */
/** scale the costs (negative parts) of an effect; a rushed premium delivery is cheaper than the real thing */
export function scaleCosts(e: Effect, k: number): Effect {
  const out: Effect = { ...e };
  for (const key of ['approval', 'street', 'us', 'fiscal'] as const) if ((e[key] ?? 0) < 0) out[key] = e[key]! * k;
  if ((e.trial ?? 0) > 0) out.trial = e.trial! * k;
  if (e.sat) out.sat = e.sat.map((x) => (x.delta < 0 ? { ...x, delta: x.delta * k } : x));
  return out;
}

/** how much of a remedy's good side is left after recent uses (1 = fresh; the preview shows the same) */
export function fatigueOf(s: GameState, id: string): number {
  const n = (s.remedyUses?.[id] ?? []).filter((d) => s.day - d <= s.config.remedyFatigueDays).length;
  return 1 / (1 + n * s.config.remedyFatigue);
}

export function dampen(e: Effect, k: number): Effect {
  const out: Effect = { ...e };
  for (const key of ['approval', 'street', 'us', 'fiscal'] as const) if ((e[key] ?? 0) > 0) out[key] = e[key]! * k;
  if ((e.trial ?? 0) < 0) out.trial = e.trial! * k;
  if (e.sat) out.sat = e.sat.map((x) => (x.delta > 0 ? { ...x, delta: x.delta * k } : x));
  return out;
}

/** apply a remedy/law move: effect + backfire pressure + promise delivery */
function applyMove(s: GameState, moveId: string, subject: string | null, extra?: Effect, costScale = 1) {
  const r = remedyById.get(moveId);
  if (!r) return;
  if (r.once && !s.usedOnce.includes(moveId)) s.usedOnce.push(moveId);
  if (r.permanent && !s.lawsPassed.includes(moveId)) s.lawsPassed.push(moveId);
  if (r.law && !(s.lawsEnacted ??= []).includes(moveId)) s.lawsEnacted.push(moveId);
  if (r.tension) s.tensionUntil = Math.max(s.tensionUntil, s.day + r.tension);
  if (r.promise) makePromise(s, r.promise);
  // diminishing returns: the public (and partners) have seen this trick recently
  const uses = ((s.remedyUses ??= {})[moveId] ??= []).filter((d) => s.day - d <= s.config.remedyFatigueDays);
  const k = fatigueOf(s, moveId);
  moveFatigue = k;
  uses.push(s.day);
  s.remedyUses[moveId] = uses;
  // a gamble: roll the shown odds; on a miss the fail effect replaces the effect
  let eff = r.effect;
  let failed = false;
  if (r.risk) {
    const ok = rngOf(s).next() < r.risk.chance;
    if (!ok) {
      failed = true;
      eff = r.risk.fail;
      markFailed();
      log(s, 'log.riskFailed', { remedy: moveId }, 'bad');
    }
  }
  if (costScale !== 1) eff = scaleCosts(eff, costScale);
  applyEffect(s, jitter(s, k < 1 ? dampen(eff, k) : eff), subject);
  if (extra && !failed) applyEffect(s, jitter(s, extra), subject);
  moveFatigue = 1;
  for (const b of r.backfires) s.pressure[b] = (s.pressure[b] ?? 0) + s.config.backfirePressure;
  deliverPromises(s, moveId, subject);
}

/** a promise remedy: every coalition party the promise targets now believes you (if it still can) */
function makePromise(s: GameState, promiseId: string) {
  const def = promiseById.get(promiseId);
  if (!def) return;
  for (const p of coalition(s)) {
    if (p.id === s.base.pmParty && !def.to.includes('pm')) continue;
    if (!def.to.some((tg) => tg === 'any' || matchesTag(p, tg))) continue;
    if (p.trust.state === 'distrust') { log(s, 'log.notBelieved', { party: p.id }, 'bad'); continue; }
    if (p.trust.state !== 'neutral') continue;
    if (promiseMoot(s, def.id)) continue;
    p.trust = { state: 'believing', promiseId: def.id, since: s.day, until: s.day + s.config.promiseBelieveDays * (p.trait === 'patient' ? 1.5 : 1) };
    p.satisfaction = clamp(p.satisfaction + s.config.promiseBoost, 0, 100);
    log(s, 'log.promised', { party: p.id, promise: def.id }, 'info');
  }
}

/** a promise nobody would believe: it is already law, or there is nothing to deliver it on (a ceasefire without a war) */
export function promiseMoot(s: GameState, promiseId: string): 'already' | 'noWar' | null {
  const def = promiseById.get(promiseId);
  const r = def && remedyById.get(def.deliveredBy);
  if (r?.permanent && s.lawsPassed.includes(r.id)) return 'already';
  if (promiseId === 'ceasefire' && !s.war.active) return 'noWar';
  return null;
}

function deliverPromises(s: GameState, moveId: string, recipient: string | null) {
  for (const p of s.parties) {
    if (p.trust.state === 'neutral' || !p.trust.promiseId) continue;
    const def = promiseById.get(p.trust.promiseId);
    if (!def || (def.deliveredBy !== moveId && !def.alsoBy?.includes(moveId))) continue;
    if (moveId === 'ministry' && recipient !== p.id) continue;
    const wasBelieving = p.trust.state === 'believing';
    // promise today, deliver today = a plain deal, not a kept word: the thanks grow with the wait
    const ripe = p.trust.since === undefined ? 1 : clamp((s.day - p.trust.since) / s.config.promiseRipenDays, 0.25, 1);
    p.satisfaction = clamp(p.satisfaction + s.config.promiseDeliverBonus * (wasBelieving ? ripe : 0.5), 0, 100);
    p.trust = { state: 'neutral', promiseId: null, until: 0 };
    // their angry reminder is answered: take the card off the table
    if (s.event?.id === 'angry' && s.event.subject === p.id) { s.event = null; s.nextEventInDays = scheduleNext(s); }
    s.stats.promisesKept++;
    log(s, 'log.delivered', { party: p.id, promise: def.id }, 'good');
  }
}

/** "hand out a ministry": who gets one (the card's subject, else the unhappiest partner), which one and from whom */
export function ministryTarget(s: GameState, subject: string | null): { to?: Party; ministry?: Ministry; from?: string } {
  const to = (subject && partyById(s, subject)?.inCoalition ? partyById(s, subject) : null)
    ?? [...coalition(s)].filter((p) => p.id !== s.base.pmParty).sort((a, b) => a.satisfaction - b.satisfaction)[0];
  if (!to || to.id === s.base.pmParty) return { to };
  const ministry = ministryFor(s, to);
  const holder = ministry?.holder && partyById(s, ministry.holder)?.inCoalition ? ministry.holder : undefined;
  return { to, ministry, from: holder };
}

/** which ministry a card/promise hands to `to`: a free one first, then one of your own (never Defence),
 *  then (only for a partner, never for your own party) one from the partner holding the most */
export function ministryFor(s: GameState, to: Party): Ministry | undefined {
  const free = s.ministries.find((m) => !m.holder || !partyById(s, m.holder)?.inCoalition);
  if (free) return free;
  if (to.id === s.base.pmParty) return undefined;
  const pm = s.base.pmParty;
  const counts0 = ministryCounts(s.ministries);
  const own = (counts0[pm] ?? 0) > s.config.pmMinMinistries ? [...s.ministries].reverse().find((m) => m.holder === pm && m.id !== 'defense') : undefined;
  if (own) return own;
  const counts = ministryCounts(s.ministries);
  const from = coalition(s).filter((x) => x.id !== to.id && x.id !== pm && (counts[x.id] ?? 0) > 1)
    .sort((x, y) => (counts[y.id] ?? 0) - (counts[x.id] ?? 0))[0];
  return from && [...s.ministries].reverse().find((m) => m.holder === from.id && m.id !== 'defense');
}

/** up to two ready-made reshuffles: the unhappiest partners each get a ministry from whoever holds
 *  the most above their fair share (the PM party first on a tie: it minds the least) */
export function reshuffleOffers(s: GameState): { ministryId: string; from: string; to: string }[] {
  const coal = s.parties.filter((p) => p.inCoalition && p.seats > 0);
  const counts = ministryCounts(s.ministries);
  const over = (id: string) => {
    const p = coal.find((x) => x.id === id);
    return p ? (counts[id] ?? 0) - fairShare(p, s.parties, s.ministries.length) + (id === s.base.pmParty ? 0.5 : 0) : -Infinity;
  };
  const takers = coal.filter((p) => p.id !== s.base.pmParty).sort((a, b) => a.satisfaction - b.satisfaction);
  // the PM party keeps its core ministries
  const pmLeft = () => (counts[s.base.pmParty] ?? 0) - out.filter((o) => o.from === s.base.pmParty).length;
  const out: { ministryId: string; from: string; to: string }[] = [];
  for (const to of takers) {
    const m = s.ministries
      .filter((x) => x.holder && x.holder !== to.id && !out.some((o) => o.ministryId === x.id) && !(x.holder === s.base.pmParty && pmLeft() <= s.config.pmMinMinistries))
      .sort((a, b) => over(b.holder!) - over(a.holder!))[0];
    if (m) out.push({ ministryId: m.id, from: m.holder!, to: to.id });
    if (out.length === 2) break;
  }
  return out;
}

function transferMinistry(s: GameState, ministryId: string, toId: string, gainScale = 1) {
  const m = s.ministries.find((x) => x.id === ministryId)!;
  const from = m.holder ? partyById(s, m.holder) : undefined;
  const to = partyById(s, toId)!;
  m.holder = toId;
  if (from) {
    const loss = from.id === s.base.pmParty ? s.config.ministryLoss / 3 : s.config.ministryLoss;
    from.satisfaction = clamp(from.satisfaction - loss, 0, 100);
  }
  to.satisfaction = clamp(to.satisfaction + s.config.ministryGain * gainScale, 0, 100);
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
      log(s, 'log.wartimeJoin', { party: p.id, n: s.config.wartimeStayMood }, 'good');
    }
  }
  log(s, 'log.war', {}, 'event');
}

function endWar(s: GameState) {
  const rally = Math.round(warRally(s));
  s.war.active = false;
  s.war.leftDays = 0;
  s.stats.warsEnded++;
  s.lastWarEnd = s.day;
  s.approval = clamp(s.approval + s.config.warEndApproval, 0, 100);
  for (const p of s.parties) {
    if (p.wartime) {
      p.wartime = false;
      // a happy emergency partner stays on as a regular one
      if (p.satisfaction >= s.config.wartimeStayMood) log(s, 'log.wartimeStays', { party: p.id }, 'good');
      else leave(s, p, 'log.wartimeLeave');
    }
  }
  log(s, 'log.warEnd', {}, 'info');
  log(s, 'log.driftWarOver', { n: rally }, 'bad');
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
  s.fromOpposition = s.phase === 'opposition';
  s.rival = null;
  s.campaignFx = { merger: false, spoiler: false, gevalt: false };
  s.usedThisTerm = [];
  // elections void a rotation agreement (the classic way out)
  for (const p of s.parties) if (p.trust.promiseId === 'rotation' && (p.trust.state === 'believing' || p.trust.state === 'angry')) {
    p.trust = { state: 'neutral', promiseId: null, until: 0 };
    log(s, 'log.rotationVoided', { party: p.id }, 'bad');
  }
  s.phase = 'campaign';
  s.phaseLeftDays = s.config.campaignDays;
  s.event = null;
  s.elections++;
  (s.electionDays ??= []).push(s.day);
  const base = s.base.parties.find((p) => p.id === s.base.pmParty)!;
  s.campaignPollSeats = Math.round(base.seats + pmBonus(s));
  log(s, 'log.elections', { reason, n: s.elections, poll: s.campaignPollSeats }, 'bad');
  if (b) record(s, 'elections', { key: `out.elections.${reason}`, params: { poll: s.campaignPollSeats, seats: s.campaignPollSeats } }, b);
}

function resolveElection(s: GameState) {
  const b = snap(s);
  wrapDepth++;
  try { resolveElectionInner(s); } finally { wrapDepth--; }
  if (s.status === 'lost') record(s, 'newGov', { key: s.lostReason === 'voters' ? 'out.votersLost' : 'out.noGovLost' }, b);
  else if (s.phase === 'opposition') record(s, 'newGov', { key: 'out.opposition' }, b);
  else if (s.phase === 'governing') record(s, 'newGov', { key: 'out.newGov', params: { seats: seatsOf(s), pm: pmParty(s).seats } }, b);
  else record(s, 'elections', { key: 'out.elections.deadlock', params: { poll: s.campaignPollSeats, seats: s.campaignPollSeats } }, b);
}

/** election night: the exit poll first (a few seats off), then the real count; a party that was in
 *  the exit poll but missed the threshold is the night's big swing */
function exitPoll(s: GameState) {
  const rng = rngOf(s);
  const th = s.config.threshold;
  const poll = s.parties.map((p) => {
    let n = p.seats ? Math.max(0, p.seats + Math.round((rng.next() * 2 - 1) * 2.4)) : rng.next() < 0.3 && p.id !== s.base.pmParty ? th : 0;
    if (n > 0 && n < th) n = th;
    return { p, n };
  }).filter((x) => x.n > 0);
  log(s, 'log.exitPoll', { results: poll.map((x) => `${x.p.short} ${x.n}`).join(', ') }, 'event');
  for (const x of poll) if (x.p.seats === 0) log(s, 'log.thresholdDrama', { party: x.p.id }, 'event');
}

function resolveElectionInner(s: GameState) {
  const c = s.config;
  const fx = s.campaignFx ?? { merger: false, spoiler: false, gevalt: false };
  // far-right merger: one list, no wasted votes under the threshold
  const merge = fx.merger
    ? s.base.parties.filter((p) => p.tags.includes('farright')).sort((a, b) => b.seats - a.seats).map((p) => p.id) : undefined;
  const seats = runElection(s.base.parties, {
    totalSeats: c.totalSeats, threshold: c.threshold, noise: c.electionNoise, noiseMin: c.electionNoiseMin,
    pmBonus: pmBonus(s) + (fx.gevalt ? c.gevaltSeats : 0), pmId: s.base.pmParty,
    merge, bonus: merge?.length ? { [merge[0]]: c.mergerSeats } : undefined,
  }, rngOf(s));
  // spoiler list: splits the biggest anti-Bibi party's vote
  if (fx.spoiler) {
    const big = s.base.parties.filter((p) => !p.willSitWithBibi && (seats[p.id] ?? 0) > c.spoilerSeats + c.threshold)
      .sort((a, b) => (seats[b.id] ?? 0) - (seats[a.id] ?? 0))[0];
    if (big) { seats[big.id] -= c.spoilerSeats; seats[s.base.pmParty] += c.spoilerSeats; }
  }
  const lossRoll = loseChance(s);
  s.campaignFx = { merger: false, spoiler: false, gevalt: false };
  s.termFx = {};
  for (const p of s.parties) { p.seats = seats[p.id] ?? 0; p.inCoalition = false; p.wartime = false; p.threatening = false; }
  // the voters may simply be done with you (approval, cases, election fatigue)
  if (rngOf(s).next() < lossRoll) {
    // the count has to agree with the verdict: late ballots swing seats until your bloc is short of a majority
    const rival = s.parties.filter((p) => !p.willSitWithBibi && p.seats > 0).sort((a, b) => b.seats - a.seats)[0];
    for (let i = 0; rival && i < c.totalSeats && formGovernment(s.parties, s.base.pmParty, c.majority); i++) {
      const ids = formGovernment(s.parties, s.base.pmParty, c.majority)!;
      const donor = s.parties.filter((p) => ids.includes(p.id) && p.seats > 0).sort((a, b) => b.seats - a.seats)[0];
      donor.seats--;
      rival.seats++;
    }
    exitPoll(s);
    log(s, 'log.results', { results: s.parties.filter((p) => p.seats > 0).map((p) => `${p.short} ${p.seats}`).join(', ') }, 'event');
    log(s, 'log.votersLost', {}, 'bad');
    enterOpposition(s, 'voters');
    return;
  }
  exitPoll(s);
  const ids = formGovernment(s.parties, s.base.pmParty, c.majority);
  log(s, 'log.results', { results: s.parties.filter((p) => p.seats > 0).map((p) => `${p.short} ${p.seats}`).join(', ') }, 'event');
  if (!ids) {
    s.failedElections++;
    if (s.failedElections >= c.maxFailedElections) {
      enterOpposition(s, 'deadlock');
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
  if (s.fromOpposition) { s.stats.returns++; log(s, 'log.returned', {}, 'good'); }
  s.fromOpposition = false;
  s.usedThisTerm = [];
  s.refusedBy = [];
  s.termEndsDay = s.day + c.knessetTermDays;
  s.approval = clamp(s.approval + 5, 0, 100);
  s.phase = 'governing';
  s.nextEventInDays = scheduleNext(s);
  if (c.restartTermOnElection) s.pmDays = 0;
  log(s, 'log.newGov', { seats: seatsOf(s), parties: ids.length }, 'good');
}

/** lost an election (or nobody could form a government with you): the first time you go to the
 *  opposition and can topple the rival government; config.maxElectionLosses ends the game */
function enterOpposition(s: GameState, why: 'voters' | 'deadlock') {
  const c = s.config;
  s.electionLosses = (s.electionLosses ?? 0) + 1;
  s.usedThisTerm = [];
  s.fromOpposition = false;
  if (s.electionLosses >= c.maxElectionLosses) {
    lose(s, why);
    log(s, 'log.lost', {}, 'bad');
    return;
  }
  s.phase = 'opposition';
  s.phaseLeftDays = 0;
  s.rival = { stability: c.rivalStartStability, until: s.day + c.oppositionMaxDays };
  for (const p of s.parties) {
    p.inCoalition = false; p.wartime = false; p.threatening = false;
    p.trust = { state: 'neutral', promiseId: null, until: 0 };
  }
  for (const m of s.ministries) m.holder = null;
  s.queue = [];
  s.event = null;
  s.defectors = 0;
  s.failedElections = 0;
  s.termFx = {};
  s.lowApprovalDays = 0;
  s.lowApprovalWarned = false;
  s.nextEventInDays = scheduleNext(s);
  log(s, why === 'voters' ? 'log.oppositionVoters' : 'log.oppositionDeadlock', {}, 'bad');
}

// ---------------------------------------------------------------- events

/** parties holding the same promise from the same moment (one angry card speaks for all of them) */
function promiseGroup(s: GameState, p: Party): Party[] {
  return s.parties.filter((x) => x === p || (x.inCoalition && x.trust.state === p.trust.state && x.trust.promiseId === p.trust.promiseId
    && x.trust.until === p.trust.until && !!p.trust.promiseId));
}

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
  s.lastFired[c.id] = s.day;
  (s.firedCount ??= {})[c.id] = (s.firedCount[c.id] ?? 0) + 1;
  s.event = { id: c.id, subject, firedAt: s.day, leftDays: c.urgent ? s.config.urgentTimeoutDays : s.config.eventTimeoutDays };
  // what the crisis did on arrival is a recorded outcome (shown on the card / in text mode),
  // so later drift isn't blamed for it
  if (c.onFire) withOutcome(s, 'arrival', { key: 'out.arrival', params: { crisis: c.id } }, () => applyEffect(s, c.onFire!, subject));
  if (c.tension) s.tensionUntil = Math.max(s.tensionUntil, s.day + c.tension);
  if (c.icc) s.iccUntil = Math.max(s.iccUntil, s.day + c.icc);
  if (c.opensCase) {
    s.openCases.push(s.day + 730);
    s.stats.casesSurvived++;
    s.stats.maxOpenCases = Math.max(s.stats.maxOpenCases, s.openCases.length);
  }
  log(s, 'log.crisis', { crisis: c.id, subject: subject ?? '' }, 'event');
}

export type Dir = 'left' | 'right';
export const DIRS: Dir[] = ['left', 'right'];

/** the current crisis card: ≤3 remedies on left/right/up, elections on down */
export type OptionDir = Dir | 'ignore';

/** the current crisis card: ≤2 remedies on left/right, plus a separate "ignore it" tap
 *  (dir 'ignore', key 0) on every non-urgent card; war is its own action (startWar) */
export function eventOptions(s: GameState): { id: string; dir: OptionDir; available: boolean }[] {
  if (!s.event) return [];
  const c = crisisById.get(s.event.id)!;
  // spent once-per-game remedies drop out and the next one in the list (a backup) takes the side
  // usable ones first (e.g. under an ICC warrant a non-travel backup beats a greyed-out trip), list order otherwise
  const ids = c.remedies.filter((id) => !remedySpent(s, id));
  const opts: { id: string; dir: OptionDir; available: boolean }[] = [...ids.filter((id) => remedyAvailable(s, id)), ...ids.filter((id) => !remedyAvailable(s, id))]
    .slice(0, DIRS.length).map((id, i) => ({ id, dir: DIRS[i], available: remedyAvailable(s, id) }));
  if (!c.urgent) opts.push({ id: 'ignore', dir: 'ignore', available: true });
  return opts;
}

function resolveEvent(s: GameState, optionId: string, timedOut = false) {
  const ev = s.event!;
  const cause: Outcome['cause'] = optionId === 'ignore'
    ? { key: timedOut ? 'out.timedOutIgnore' : 'out.ignored', params: { crisis: ev.id, party: ev.subject ?? '', quip: Math.floor(rngOf(s).next() * 60) } }
    : { key: timedOut ? 'out.timedOut' : 'out.chose', params: { crisis: ev.id, remedy: optionId, party: ev.subject ?? '', quip: Math.floor(rngOf(s).next() * 60) } };
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

function checkCoalition(s: GameState, dt = 0) {
  if (s.phase !== 'governing' || s.status !== 'playing') return;
  const c = s.config;
  for (const p of coalition(s)) {
    if (p.id === s.base.pmParty) continue;
    if (p.satisfaction <= 0) { leave(s, p); continue; }
    if (dt && p.satisfaction < c.leaveBelow + (p.leaveOffset ?? 0) && rngOf(s).next() < c.leaveChancePerDay * (p.trait === 'loyal' ? 0.5 : 1) * dt) { leave(s, p); continue; }
    if (!p.threatening && p.satisfaction < c.threatenBelow) {
      p.threatening = true;
      log(s, 'log.threat', { party: p.id }, 'bad');
    } else if (p.threatening && p.satisfaction > c.threatenResetAbove) p.threatening = false;
  }
  if (seatsOf(s) < c.majority) callElections(s, 'collapse');
}

function trumpTick(s: GameState, dt: number) {
  if (!dt) return;
  const c = s.config;
  const rng = rngOf(s);
  s.trumpMood = clamp((s.trumpMood ?? 0) + (rng.next() * 2 - 1) * c.trumpWalk * Math.sqrt(dt) - 0.01 * (s.trumpMood ?? 0) * dt, -2, 2);
  if (rng.next() < c.trumpSwingPerDay * dt) {
    const up = rng.next() < 0.5;
    s.trumpMood = up ? 2 : -2;
    s.us = clamp(s.us + (up ? 8 : -8), 0, 100);
    log(s, up ? 'log.trumpPostUp' : 'log.trumpPostDown', {}, up ? 'good' : 'bad');
  }
}

/** the war's pull on approval: full at the start, fading to warRallyMinShare by the end */
export function warRally(s: GameState): number {
  const c = s.config;
  if (!s.war.active) return 0;
  const left = clamp(s.war.leftDays / c.warDurationDays, 0, 1);
  return c.warApprovalBonusTarget * (c.warRallyMinShare + (1 - c.warRallyMinShare) * left);
}

/** where approval drifts to: street, US, budget, trial, war rally, years in office, opposition bonus */
export function approvalTarget(s: GameState): number {
  const c = s.config;
  return 20 + 0.2 * s.street + 0.15 * s.us + 0.1 * s.fiscal - 0.15 * s.trial
    + warRally(s) - (s.fiscal < c.fiscalCrisisBelow ? c.fiscalCrisisApproval : 0) - c.fatiguePerYear * (s.pmDays / 365.25)
    + (s.phase === 'opposition' ? c.oppositionApprovalBonus : 0);
}

function tickDay(s: GameState, dt: number) {
  const c = s.config;
  // meters (both phases)
  const trial0 = s.trial, street0 = s.street;
  if (s.day >= s.trialPausedUntil) s.trial = clamp(s.trial + c.trialGrowthPerDay * dt, 0, 100);
  driftNotes(s, trial0, street0);
  if (c.indictAt > 0 && s.trial >= c.indictAt) {
    const b = snap(s);
    log(s, 'log.indicted', {}, 'bad');
    lose(s, 'indicted');
    record(s, 'newGov', { key: 'out.indicted' }, b);
    return;
  }
  if (!s.war.active) s.street += (60 - s.street) * c.meterRegression * dt;
  s.us += (55 + c.trumpUsPull * (s.trumpMood ?? 0) - s.us) * c.meterRegression * dt;
  trumpTick(s, dt);
  s.fiscal += (50 - s.fiscal) * c.meterRegression * dt;
  if (s.war.active) s.fiscal = clamp(s.fiscal - c.warFiscalPerDay * dt, 0, 100);
  const broke = s.fiscal < c.fiscalCrisisBelow;
  if (broke !== !!s.treasuryEmpty) {
    s.treasuryEmpty = broke;
    log(s, broke ? 'log.treasuryEmpty' : 'log.treasuryOk', { n: c.fiscalCrisisApproval }, broke ? 'bad' : 'good');
  }
  const target = approvalTarget(s);
  // the slide toward a target under the panic line is invisible otherwise: say it when it crosses
  const below = target < c.pollPanicBelow;
  if (below !== !!s.targetBelowPanic) {
    s.targetBelowPanic = below;
    log(s, below ? 'log.driftPollsDown' : 'log.driftPollsUp', { target: Math.round(target) }, below ? 'bad' : 'good');
  }
  s.approval = clamp(s.approval + (target - s.approval) * c.approvalRegression * dt, 0, 100);
  for (const k of Object.keys(s.pressure)) s.pressure[k] *= Math.max(0, 1 - c.pressureDecayPerDay * dt);
  s.openCases = s.openCases.filter((d) => d > s.day);

  for (const p of s.parties) {
    if (p.trust.state === 'believing' && s.day >= p.trust.until) {
      const card = (p.trust.promiseId && promiseById.get(p.trust.promiseId)?.card) || 'angry';
      if (p.id === s.base.pmParty || card === 'rotation' && !p.inCoalition) {
        p.trust = { state: 'neutral', promiseId: null, until: 0 }; // nobody comes to collect
      } else if (!p.inCoalition || p.seats <= 0) {
        breakPromise(s, p); // outside the coalition: no card, they just stop believing you
      } else {
        // no silent switch: the party comes to collect (angry-reminder / rotation card); one card per promise
        p.trust = { ...p.trust, state: 'angry' };
        const queued = s.queue.some((q) => {
          const o = q.subject ? partyById(s, q.subject) : undefined;
          return q.id === card && !!o && o !== p && promiseGroup(s, o).includes(p);
        });
        if (!queued) s.queue.push({ id: card, subject: p.id });
      }
    } else if (p.trust.state === 'distrust' && s.day >= p.trust.until) {
      p.trust = { state: 'neutral', promiseId: null, until: 0 };
    }
  }

  if (s.phase === 'campaign') {
    s.phaseLeftDays -= dt;
    if (s.phaseLeftDays <= 0) resolveElection(s);
    return;
  }
  if (s.phase === 'opposition') {
    const r = s.rival ??= { stability: c.rivalStartStability, until: s.day + c.oppositionMaxDays };
    r.stability = clamp(r.stability - c.rivalDecayPerDay * dt, 0, 100);
    if (r.stability <= 0 || s.day >= r.until) {
      log(s, 'log.rivalFell', {}, 'good');
      callElections(s, 'rivalCollapse');
      return;
    }
    // the comeback is played: opposition cards (scandal, defector, protest) chip at the rival
    runEvents(s, dt);
    return;
  }

  checkCoalition(s, dt);
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
  const ctx = { coal, counts: ministryCounts(s.ministries) };
  for (const p of s.parties) {
    const d = satDrivers(s, p, ctx).reduce((n, x) => n + x.perDay, 0);
    p.satisfaction = clamp(p.satisfaction + d * dt, 0, 100);
  }

  // big-coalition streak
  if (coal.length >= 6) {
    s.stats.bigCoalitionStreak += dt;
    s.stats.bigCoalitionBest = Math.max(s.stats.bigCoalitionBest, s.stats.bigCoalitionStreak);
  } else s.stats.bigCoalitionStreak = 0;

  if (s.day >= s.termEndsDay) { callElections(s, 'scheduled'); return; }

  // approval collapse: weeks under the floor and the partners bolt (warned first)
  if (s.approval < c.collapseBelow) {
    s.lowApprovalDays = (s.lowApprovalDays ?? 0) + dt;
    if (s.lowApprovalDays >= c.collapseDays) {
      s.lowApprovalDays = 0;
      s.lowApprovalWarned = false;
      log(s, 'log.pollCollapse', {}, 'bad');
      callElections(s, 'pollCollapse');
      return;
    }
    if (s.lowApprovalDays >= c.collapseWarnDays && !s.lowApprovalWarned) {
      s.lowApprovalWarned = true;
      log(s, 'log.pollCollapseWarn', { below: c.collapseBelow, days: Math.ceil(c.collapseDays - s.lowApprovalDays) }, 'bad');
    }
  } else {
    s.lowApprovalDays = 0;
    s.lowApprovalWarned = false;
  }

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

  // Knesset summer recess
  const rec = inRecess(s);
  if (rec !== !!s.recess) { s.recess = rec; log(s, rec ? 'log.recessStart' : 'log.recessEnd', {}, 'event'); }

  runEvents(s, dt);
  checkCoalition(s);
}

/** the card slot: tick the open card, fire queued cards, or roll the next random one */
function runEvents(s: GameState, dt: number) {
  if (s.event) {
    s.event.leftDays -= dt;
    if (s.event.leftDays <= 0) resolveEvent(s, crisisById.get(s.event.id)?.defaultOption ?? 'ignore', true);
  } else if (s.queue.length) {
    const q = s.queue.shift()!;
    const p = q.subject ? partyById(s, q.subject) : undefined;
    if (p && !p.inCoalition) { if (p.trust.state === 'angry') breakPromise(s, p); }
    else if (!p || p.trust.state === 'angry') fireCrisis(s, crisisById.get(q.id)!, q.subject);
  } else {
    s.nextEventInDays -= dt;
    if (s.nextEventInDays <= 0) {
      const rng = rngOf(s);
      const c2 = pickWeighted(rng, CRISES.map((x) => ({ item: x, weight: crisisWeight(s, x) })));
      if (c2?.goodNews) {
        s.lastFired[c2.id] = s.day;
        (s.firedCount ??= {})[c2.id] = (s.firedCount[c2.id] ?? 0) + 1;
        withOutcome(s, 'news', { key: c2.badNews ? 'out.badNews' : 'out.goodNews', params: { crisis: c2.id } }, () => { if (c2.onFire) applyEffect(s, c2.onFire, null); });
        log(s, c2.badNews ? 'log.badNews' : 'log.goodNews', { crisis: c2.id }, c2.badNews ? 'bad' : 'good');
        s.nextEventInDays = scheduleNext(s);
      } else if (c2) fireCrisis(s, c2);
      else s.nextEventInDays = scheduleNext(s);
    }
  }
}

function checkTitles(s: GameState) {
  for (const t of TITLES) {
    if (s.titles.includes(t.id)) continue;
    const ok = t.kind === 'tenure' ? s.pmDays >= t.threshold
      : t.kind === 'ending' ? s.status === 'retired' && s.lostReason === t.ending
      : (s.stats[t.stat!] ?? 0) >= t.threshold;
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
    // a caretaker PM still counts; a campaign run from the opposition does not
    if (s.phase !== 'opposition' && !(s.phase === 'campaign' && s.fromOpposition)) s.pmDays += dt;
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
  if (r.ok) {
    const cause = actionCause(a);
    if (r.causeParams) cause.params = { ...cause.params, ...r.causeParams };
    record(s, 'action', cause, b);
  }
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
    case 'move': return { key: 'out.move', params: { remedy: a.moveId } };
    default: return { key: 'out.action' };
  }
}

/** a rejection that says which cooldown and for how long */
const cooldown = (what: 'ministry' | 'law' | 'invite', days: number): ActionResult =>
  ({ ok: false, error: `err.cooldown.${what}`, params: { days: Math.ceil(days) } });

/** a rejection that says why the option/move can't be used now */
function unavailable(s: GameState, id: string): ActionResult {
  return { ok: false, error: 'err.unavailableWhy', why: unavailableReason(s, id) ?? { key: 'why.na' } };
}

function actInner(s: GameState, a: Action): ActionResult {
  if (s.status !== 'playing') return { ok: false, error: 'err.over' };
  if (a.type === 'noop') return { ok: true };
  const c = s.config;
  if (a.type === 'move') {
    const m = moveById.get(a.moveId);
    if (!m) return { ok: false, error: 'err.unknown' };
    if (!moveAvailable(s, a.moveId)) return unavailable(s, a.moveId);
    if (m.cooldownDays) (s.moveReadyAt ??= {})[a.moveId] = s.day + m.cooldownDays;
    if (m.oncePerTerm) (s.usedThisTerm ??= []).push(a.moveId);
    log(s, 'log.move', { remedy: a.moveId }, 'info');
    applyMove(s, a.moveId, null);
    checkCoalition(s);
    return { ok: true };
  }
  // in the opposition the only thing besides moves is answering an opposition card
  if (s.phase === 'opposition' && a.type !== 'choose') return { ok: false, error: 'err.opposition' };
  if (s.phase === 'campaign') return { ok: false, error: 'err.campaign' };
  switch (a.type) {
    case 'choose': {
      if (!s.event) return { ok: false, error: 'err.noEvent' };
      const def = crisisById.get(s.event.id)?.defaultOption;
      // on urgent cards (no ignore) "ignore" means the card's default (e.g. refuse)
      if (a.optionId === 'ignore' && def) { resolveEvent(s, def); return { ok: true }; }
      const opt = eventOptions(s).find((o) => o.id === a.optionId || o.dir === a.optionId);
      if (!opt) return { ok: false, error: 'err.badOption' };
      if (!opt.available) return unavailable(s, opt.id);
      resolveEvent(s, opt.id);
      return { ok: true };
    }
    case 'giveMinistry': {
      if (s.cooldowns.ministry > 0) return cooldown('ministry', s.cooldowns.ministry);
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
      if (!remedyAvailable(s, 'war')) return unavailable(s, 'war');
      applyMove(s, 'war', null);
      checkCoalition(s);
      return { ok: true };
    }
    case 'passLaw': {
      if (!LAWS.includes(a.lawId)) return { ok: false, error: 'err.unknown' };
      if (s.cooldowns.law > 0) return cooldown('law', s.cooldowns.law);
      if (s.recess) return { ok: false, error: 'err.recess' };
      if (!remedyAvailable(s, a.lawId)) return unavailable(s, a.lawId);
      log(s, 'log.law', { law: a.lawId }, 'info');
      applyMove(s, a.lawId, null);
      s.cooldowns.law = c.lawCooldownDays;
      checkCoalition(s);
      return { ok: true };
    }
    case 'invite': {
      if (s.cooldowns.invite > 0) return cooldown('invite', s.cooldowns.invite);
      const p = partyById(s, a.partyId);
      if (!p || p.seats === 0) return { ok: false, error: 'err.unknown' };
      if (p.inCoalition) return { ok: false, error: 'err.alreadyIn' };
      s.cooldowns.invite = c.inviteCooldownDays;
      const coal = coalition(s);
      const chance = inviteChance(s, p);
      if (rngOf(s).next() < chance) {
        // the government's line moves toward the newcomer, by its share of the seats
        const seats0 = coal.reduce((n, x) => n + x.seats, 0);
        s.govPosition = Math.round(((s.govPosition * seats0 + p.position * p.seats) / (seats0 + p.seats)) * 10) / 10;
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
        return { ok: true, causeParams: { why: inviteWhy(s, p) } };
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
      const moot = promiseMoot(s, def.id);
      if (moot) return { ok: false, error: `err.promiseMoot.${moot}` };
      const rotation = def.id === 'rotation';
      if (rotation) {
        if (!p.inCoalition || p.id === s.base.pmParty || p.seats < (def.minSeats ?? 0)) return { ok: false, error: 'err.rotationWho', params: { seats: def.minSeats ?? 0 } };
        if (s.parties.some((x) => x.trust.promiseId === 'rotation' && (x.trust.state === 'believing' || x.trust.state === 'angry'))) return { ok: false, error: 'err.oneRotation' };
      }
      p.trust = { state: 'believing', promiseId: def.id, since: s.day, until: s.day + (rotation ? c.rotationBelieveDays : def.believeDays ?? c.promiseBelieveDays) * (p.trait === 'patient' ? 1.5 : 1) };
      p.satisfaction = clamp(p.satisfaction + (rotation ? c.rotationBoost : def.boost ?? c.promiseBoost), 0, 100);
      log(s, 'log.promised', { party: p.id, promise: def.id }, 'info');
      return { ok: true };
    }
    case 'deliver': {
      const p = partyById(s, a.partyId);
      const def = promiseById.get(a.promiseId);
      if (!p || !def) return { ok: false, error: 'err.unknown' };
      if (def.cardOnly) return { ok: false, error: 'err.cardOnly' };
      if (s.cooldowns.law > 0) return cooldown('law', s.cooldowns.law);
      if (def.deliveredBy === 'ministry') {
        if (!p.inCoalition) return { ok: false, error: 'err.notInCoalition' };
        const counts = ministryCounts(s.ministries);
        const from = coalition(s).filter((x) => x.id !== p.id && (counts[x.id] ?? 0) > 0)
          .sort((x, y) => (counts[y.id] ?? 0) - (counts[x.id] ?? 0))[0];
        const m = from && s.ministries.find((x) => x.holder === from.id);
        if (!m) return { ok: false, error: 'err.noMinistryToGive' };
        transferMinistry(s, m.id, p.id);
      } else {
        if (s.recess && remedyById.get(def.deliveredBy)?.law) return { ok: false, error: 'err.recess' };
        if (!remedyAvailable(s, def.deliveredBy)) return unavailable(s, def.deliveredBy);
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
