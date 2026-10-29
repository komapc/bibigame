// Public programmatic API — used by the browser UI, the HTTP server, the text
// CLI and bots. Headless, deterministic for a given seed + action sequence.
import knesset from '../data/knesset.json' with { type: 'json' };
import type { Action, ActionResult, Config, Effect, GameState, KnessetData, Outcome } from '../engine/types.ts';
import {
  act, approvalTarget, dampen, fatigueOf, budgetDueYear, partyById, recessWindow, trumpFace, unavailableReason, loseChance, loseFactors, scaleCosts, hasTension, createState, dateOf, eventOptions, moveAvailable, moveCooldown, reshuffleOffers, satDrivers, seatsOf, step,
} from '../engine/game.ts';
import { MOVES } from '../data/moves.ts';
import { LAWS, crisisById, remedyById } from '../data/crises.ts';
import { PROMISES } from '../data/promises.ts';
import { TITLES } from '../data/titles.ts';
import { formatLog, has, hasOwn, partyLabel, t } from '../i18n/index.ts';

/** translated party display name */
export function pname(s: GameState, id: string): string {
  const p = s.parties.find((x) => x.id === id);
  return p ? partyLabel(p.id, p.name) : id;
}
import { matchesTag } from '../engine/coalition.ts';

export const DEFAULT_KNESSET = knesset as KnessetData;

export interface GameOptions {
  seed?: number;
  config?: Partial<Config>;
  data?: KnessetData;
}

export interface Observation {
  day: number;
  date: string;
  pmDays: number;
  termDays: number;
  termProgress: number;
  termReached: boolean;
  /** Knesset summer recess: regular crises paused, the UI clock runs faster */
  recess: boolean;
  status: GameState['status'];
  lostReason: GameState['lostReason'];
  /** chance the voters throw you out if elections were held now */
  electionRisk: number;
  /** campaign tricks already applied (merger / spoiler / gevalt) — already in electionRisk and the poll */
  campaignTricks: string[];
  /** what makes up electionRisk, one line per factor (delta in risk points, + = worse) */
  electionFactors: { id: string; label: string; delta: number }[];
  /** the vote is close (campaign, or scheduled elections within config.electionOddsDays): show the odds */
  electionSoon: boolean;
  /** days left on a trial pause (0 = the trial runs) */
  trialPausedDays: number;
  /** days approval has been under config.collapseBelow (partners bolt at config.collapseDays) */
  collapse: { days: number; limit: number; below: number } | null;
  /** where approval is drifting (below config.pollPanicBelow partners panic) */
  approvalTarget: number;
  /** config.pollPanicBelow */
  panicBelow: number;
  phase: GameState['phase'];
  phaseLeftDays: number;
  seats: number;
  majority: number;
  defectors: number;
  govPosition: number;
  meters: { approval: number; street: number; us: number; fiscal: number; trial: number };
  /** Trump's mood −2..+2 and its face */
  trump: { mood: number; face: string };
  startConditions: { id: string; label: string }[];
  openCases: number;
  budget: { dueYear: number; passed: boolean };
  parties: {
    id: string; name: string; short: string; color: string; seats: number; position: number; tolerance: number;
    satisfaction: number; inCoalition: boolean; wartime: boolean; threatening: boolean;
    willSitWithBibi: boolean; tags: string[]; ministries: string[];
    /** waiting = believe window ends within config.promiseWarnDays (angry reminder coming) */
    trust: { state: string; promiseId: string | null; daysLeft: number; waiting: boolean };
    /** passive drift per game month and its main reason ("doing nothing" has consequences) */
    trend: { perMonth: number; reason: string };
    /** most recent visible change with its cause (last ~4 months) */
    lastChange: { delta: number; because: string; day: number } | null;
    /** coalition partner below the threaten line: may walk out */
    mayLeave: boolean;
    /** coalition seats if this partner left */
    seatsWithout: number;
    trait: { id: string; label: string; desc: string } | null;
  }[];
  /** recent cause → result records, newest last; watch outcomeSeq for new ones */
  outcomes: OutcomeView[];
  outcomeSeq: number;
  ministries: { id: string; name: string; holder: string | null }[];
  /** two ready-made reshuffles (giveMinistry ministryId → to) */
  reshuffles: { ministryId: string; ministry: string; from: string; to: string }[];
  event: null | {
    id: string; title: string; text: string; subject: string | null; daysLeft: number;
    /** what the crisis already did when it arrived (onFire), or null */
    arrival: OutcomeView | null;
    /** left / right = remedies; timeout = ignore (early elections are a move) */
    options: { id: string; dir: string; odds: number | null; label: string; desc: string; available: boolean; preview: Preview[]; why: string }[];
  };
  war: { active: boolean; daysLeft: number; cooldownDays: number };
  /** Iran/Hezbollah tension: enables war, beepers, Fordow */
  tension: boolean;
  /** ICC warrant days left (blocks travel remedies) */
  iccDays: number;
  usedOnce: string[];
  cooldowns: { ministry: number; law: number; invite: number };
  laws: { id: string; label: string }[];
  /** drawer moves for the current phase (src/data/moves.ts); `ending` ones end the game */
  moves: { id: string; label: string; desc: string; available: boolean; cooldown: number; ending: boolean; preview: Preview[]; why: string }[];
  /** in opposition: the rival government's stability (falls at 0) and days until it must call elections */
  opposition: { stability: number; daysLeft: number } | null;
  /** elections lost so far; at maxElectionLosses the game is over */
  electionLosses: number;
  maxElectionLosses: number;
  promises: { id: string; label: string; to: string[]; deliveredBy: string }[];
  titles: { id: string; name: string; gloss: string }[];
  stats: GameState['stats'];
  elections: number;
  log: { day: number; kind: string; text: string }[];
  timeline: Timeline;
}

/** `meter: 'trial'` marks a trial-pressure chip (up = good = the trial slows down) so the UI can word it */
/** size: 1 small, 2 medium, 3 large (shown as ▲ / ▲▲ / ▲▲▲) */
export interface Preview { label: string; up: boolean; meter?: string; size?: number }

/** rough size of a change: meters move in smaller steps than party moods */
const sizeOf = (delta: number, sat = false) => { const a = Math.abs(delta) / (sat ? 1.5 : 1); return a <= 4 ? 1 : a <= 10 ? 2 : 3; };

export interface OutcomeView {
  seq: number; day: number; kind: Outcome['kind'];
  /** "Kaplan protests: you chose “Blame the deep state”" */
  cause: string;
  sat: { party: string; name: string; delta: number; inCoalition: boolean }[];
  meters: { meter: string; label: string; delta: number }[];
  seats: { from: number; to: number };
  left: string[]; joined: string[];
  /** crisis titles that became more likely */
  risks: string[];
  /** coalition changed / elections: show as a big card */
  big: boolean;
  /** one-line text version (text mode, logs) */
  summary: string;
  /** satirical one-liner about what just happened */
  quip: string;
  /** a generic in-character reaction from the most affected party */
  reaction: string;
}

const REACT_TAGS = ['farright', 'haredi', 'centrist', 'secular', 'left', 'arab'];

function quipOf(o: Outcome): string {
  const p = o.cause.params ?? {};
  const q = Number(p.quip ?? o.seq);
  let id = '';
  if (o.kind === 'news' || o.kind === 'arrival') return o.kind === 'news' ? t(`crisis.${p.crisis}.text`) : '';
  if (p.fail) { const f = t(`quip.${p.remedy}.fail`); if (f !== `quip.${p.remedy}.fail`) return f; }
  if (o.cause.key === 'out.ignored' || o.cause.key === 'out.timedOutIgnore') id = 'ignore';
  else if (p.remedy) id = String(p.remedy);
  else if (o.cause.key === 'out.law') id = String(p.law);
  else if (o.cause.key === 'out.war') id = 'war';
  else if (o.cause.key === 'out.ministry') id = 'ministry';
  else if (o.cause.key === 'out.deliver') {
    // the drawer delivers the thing itself (no "loyalty fee"): quip of the delivered remedy
    const by = PROMISES.find((x) => x.id === p.promise)?.deliveredBy;
    id = by === 'ministry' || !by ? 'ministry' : by;
  }
  if (!id) return '';
  // as many variants as the locale has (quip.<id>.0, .1, …); English ones only if it has none
  const countBy = (f: (k: string) => boolean) => { let n = 0; while (f(`quip.${id}.${n}`)) n++; return n; };
  const count = countBy(hasOwn) || countBy(has);
  return count ? t(`quip.${id}.${q % count}`) : '';
}

function reactionOf(s: GameState, o: Outcome): string {
  if (o.kind === 'elections' || o.kind === 'newGov' || o.kind === 'news' || o.kind === 'arrival') return '';
  const top = [...o.sat].filter((x) => Math.abs(x.delta) >= 3).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  if (!top) return '';
  const p = s.parties.find((x) => x.id === top.party);
  if (!p) return '';
  const tag = p.id === s.base.pmParty ? 'pm' : REACT_TAGS.find((tg) => p.tags.includes(tg));
  return tag ? t(`react.${tag}.${top.delta > 0 ? 'up' : 'down'}`) : '';
}

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function formatOutcome(s: GameState, o: Outcome): OutcomeView {
  const nameOf = (id: string) => pname(s, id);
  // a gamble that missed says so: the numbers alone read like a mystery
  const cause = formatLog({ t: o.day, key: o.cause.key, params: o.cause.params }, nameOf) + (o.cause.params?.fail ? ` — ${t('out.failed')}` : '');
  const sat = o.sat.map((x) => ({ ...x, name: nameOf(x.party) }));
  const meters = o.meters.map((x) => ({ ...x, label: t(`fx.${x.meter}`) }));
  const risks = o.risks.map((id) => t(`crisis.${id}.title`));
  const left = o.left.map(nameOf), joined = o.joined.map(nameOf);
  const parts: string[] = [];
  if (o.seats.from !== o.seats.to) parts.push(t('out.seats', o.seats));
  if (left.length) parts.push(t('out.leftList', { parties: left.join(', ') }));
  if (joined.length) parts.push(t('out.joinedList', { parties: joined.join(', ') }));
  if (o.cause.key === 'out.invite' && !joined.length) {
    const why = o.cause.params?.why;
    parts.push(why ? t('ui.inviteNo', { party: nameOf(String(o.cause.params?.party)), why: t(`ui.inviteWhy.${why}`) })
      : t('out.refused', { party: nameOf(String(o.cause.params?.party)) }));
  }
  const fx = [...sat.slice(0, 6).map((x) => `${x.name} ${sign(x.delta)}`), ...meters.map((x) => `${x.label} ${sign(x.delta)}`)];
  if (fx.length) parts.push(fx.join(', '));
  if (risks.length) parts.push(`${t('out.risk')}: ${risks.join(', ')}`);
  if (!parts.length) parts.push(t('out.nothing'));
  return {
    seq: o.seq, day: o.day, kind: o.kind, cause, sat, meters, seats: o.seats, left, joined, risks,
    big: left.length > 0 || joined.length > 0 || o.kind === 'elections' || o.kind === 'newGov',
    summary: `${cause} → ${parts.join('; ')}`,
    quip: quipOf(o),
    reaction: reactionOf(s, o),
  };
}

/** short "because" text for a party's satisfaction change in an outcome */
export function becauseOf(s: GameState, o: Outcome): string {
  const nameOf = (id: string) => pname(s, id);
  return formatLog({ t: o.day, key: o.cause.key, params: o.cause.params }, nameOf);
}

export interface TimelineMark { day: number; date: string; kind: string; label: string }
export interface Timeline {
  startDay: number;
  nowDay: number;
  goalDay: number;
  past: TimelineMark[];
  upcoming: TimelineMark[];
  trust: { party: string; color: string; from: number; believeUntil: number; distrustUntil: number }[];
  nextTitle: { id: string; name: string; inDays: number } | null;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** card text; repeat cards cycle through <base>, <base>.1, <base>.2 … (as many as the locale has).
 *  <base> is crisis.<id>.text.<promise> when the card's party holds a promise that has its own text, else crisis.<id>.text */
/** a repeatable card that already fired earlier this game (the count includes this firing) */
const again = (s: GameState, id: string) => !!crisisById.get(id)?.repeats && (s.firedCount?.[id] ?? 0) > 1;

export function crisisText(s: GameState, id: string): string {
  const own = (k: string) => hasOwn(k); // only variants the active locale has (no mixed languages)
  const promise = s.event?.id === id && s.event.subject ? partyById(s, s.event.subject)?.trust.promiseId ?? null : null;
  const base = promise && own(`crisis.${id}.text.${promise}`) ? `crisis.${id}.text.${promise}` : `crisis.${id}.text`;
  let n = 1;
  while (own(`${base}.${n}`)) n++;
  const k = ((s.firedCount?.[id] ?? 1) - 1) % n;
  const params = { seats: Math.max(0, seatsOf(s) - 1), promise: promise ? t(`promise.${promise}`) : '' };
  return t(k ? `${base}.${k}` : base, params);
}

/** what the current card did on arrival (its onFire effect), as a recorded outcome */
function arrivalOf(s: GameState): OutcomeView | null {
  const ev = s.event;
  if (!ev) return null;
  const o = [...(s.outcomes ?? [])].reverse().find((x) => x.kind === 'arrival' && x.cause.params?.crisis === ev.id && x.day === ev.firedAt);
  return o ? formatOutcome(s, o) : null;
}

export function observe(s: GameState, logTail = 12): Observation {
  const nameOf = (id: string) => pname(s, id);
  return {
    day: Math.floor(s.day),
    date: dateOf(s).toISOString().slice(0, 10),
    pmDays: Math.floor(s.pmDays),
    termDays: s.config.termDays,
    termProgress: Math.min(1, s.pmDays / s.config.termDays),
    termReached: s.termReached,
    recess: !!s.recess,
    status: s.status,
    lostReason: s.lostReason ?? null,
    electionRisk: Math.round(loseChance(s) * 100) / 100,
    campaignTricks: Object.entries(s.campaignFx ?? {}).filter(([, on]) => on).map(([k]) => k),
    electionFactors: loseFactors(s).map((x) => ({ id: x.id, label: t(`odds.${x.id}`), delta: Math.round(x.delta * 100) })),
    electionSoon: s.phase === 'campaign' || (s.phase === 'governing' && s.termEndsDay - s.day <= s.config.electionOddsDays),
    trialPausedDays: Math.max(0, Math.ceil(s.trialPausedUntil - s.day)),
    collapse: s.phase === 'governing' && (s.lowApprovalDays ?? 0) > 0
      ? { days: Math.floor(s.lowApprovalDays ?? 0), limit: s.config.collapseDays, below: s.config.collapseBelow } : null,
    approvalTarget: r1(approvalTarget(s)),
    panicBelow: s.config.pollPanicBelow,
    phase: s.phase,
    phaseLeftDays: Math.ceil(s.phaseLeftDays),
    seats: seatsOf(s),
    majority: s.config.majority,
    defectors: s.defectors,
    govPosition: r1(s.govPosition),
    meters: { approval: r1(s.approval), street: r1(s.street), us: r1(s.us), fiscal: r1(s.fiscal), trial: r1(s.trial) },
    openCases: s.openCases.length,
    budget: { dueYear: budgetDueYear(s), passed: s.budgetPassedYear >= budgetDueYear(s) },
    parties: s.parties.map((p) => ({
      id: p.id, name: partyLabel(p.id, p.name), short: partyLabel(`${p.id}.short`, p.short), color: p.color, seats: p.seats, position: p.position,
      tolerance: p.tolerance, satisfaction: r1(p.satisfaction), inCoalition: p.inCoalition, wartime: p.wartime,
      threatening: p.threatening, willSitWithBibi: p.willSitWithBibi, tags: p.tags,
      ministries: s.ministries.filter((m) => m.holder === p.id).map((m) => m.id),
      trust: {
        state: p.trust.state, promiseId: p.trust.promiseId, daysLeft: Math.max(0, Math.ceil(p.trust.until - s.day)),
        waiting: p.trust.state === 'believing' && p.trust.until - s.day <= s.config.promiseWarnDays,
      },
      ...partyExtras(s, p.id),
    })),
    outcomes: (s.outcomes ?? []).slice(-5).map((o) => formatOutcome(s, o)),
    outcomeSeq: s.outcomeSeq ?? 0,
    ministries: s.ministries.map((m) => ({ id: m.id, name: t(`ministry.${m.id}`), holder: m.holder })),
    reshuffles: reshuffleOffers(s).map((r) => ({ ...r, ministry: t(`ministry.${r.ministryId}`) })),
    event: s.event && {
      id: s.event.id,
      title: again(s, s.event.id) ? t('crisis.again', { title: t(`crisis.${s.event.id}.title`) }) : t(`crisis.${s.event.id}.title`),
      text: crisisText(s, s.event.id),
      arrival: arrivalOf(s),
      subject: s.event.subject,
      daysLeft: Math.max(0, Math.ceil(s.event.leftDays)),
      options: eventOptions(s).map((o) => ({
        ...o, odds: oddsOf(o.id), label: t(`remedy.${o.id}`), desc: t(`remedy.${o.id}.desc`), preview: preview(s, o.id),
        why: o.available ? '' : whyText(s, o.id),
      })),
    },
    war: { active: s.war.active, daysLeft: Math.ceil(s.war.leftDays), cooldownDays: Math.ceil(s.war.cooldownDays) },
    tension: hasTension(s),
    iccDays: Math.max(0, Math.ceil(s.iccUntil - s.day)),
    usedOnce: [...s.usedOnce],
    trump: { mood: Math.round((s.trumpMood ?? 0) * 10) / 10, face: trumpFace(s) },
    startConditions: (s.startConditions ?? []).map((id) => ({ id, label: t(`start.${id}`) })),
    cooldowns: {
      ministry: Math.ceil(s.cooldowns.ministry), law: Math.ceil(s.cooldowns.law), invite: Math.ceil(s.cooldowns.invite),
    },
    laws: LAWS.map((id) => ({ id, label: t(`remedy.${id}`) })),
    moves: MOVES.filter((m) => m.phases.includes(s.phase)).map((m) => ({
      id: m.id, label: t(`remedy.${m.id}`), desc: t(`remedy.${m.id}.desc`), available: moveAvailable(s, m.id), why: moveAvailable(s, m.id) ? '' : whyText(s, m.id),
      cooldown: moveCooldown(s, m.id), ending: !!m.ending, preview: preview(s, m.id),
    })),
    opposition: s.phase === 'opposition' && s.rival
      ? { stability: Math.round(s.rival.stability), daysLeft: Math.max(0, Math.ceil(s.rival.until - s.day)) } : null,
    electionLosses: s.electionLosses ?? 0,
    maxElectionLosses: s.config.maxElectionLosses,
    promises: PROMISES.map((p) => ({ id: p.id, label: t(`promise.${p.id}`), to: p.to, deliveredBy: p.deliveredBy })),
    titles: s.titles.map((id) => ({ id, name: t(`title.${id}`), gloss: t(`title.${id}.gloss`) })),
    stats: { ...s.stats },
    elections: s.elections,
    timeline: timeline(s),
    log: s.log.slice(-logTail).map((e) => ({ day: Math.floor(e.t), kind: e.kind ?? 'info', text: formatLog(e, nameOf) })),
  };
}

function partyExtras(s: GameState, id: string) {
  const p = s.parties.find((x) => x.id === id)!;
  const drivers = satDrivers(s, p);
  const perMonth = Math.round(drivers.reduce((n, x) => n + x.perDay, 0) * 30 * 10) / 10;
  const main = drivers.filter((x) => Math.abs(x.perDay) > 0.005).sort((a, b) => Math.abs(b.perDay) - Math.abs(a.perDay))
    .find((x) => Math.sign(x.perDay) === Math.sign(perMonth));
  let lastChange: { delta: number; because: string; day: number } | null = null;
  for (let i = (s.outcomes?.length ?? 0) - 1; i >= 0; i--) {
    const o = s.outcomes[i];
    if (s.day - o.day > 120) break;
    const d = o.sat.find((x) => x.party === id);
    if (d) { lastChange = { delta: d.delta, because: becauseOf(s, o), day: o.day }; break; }
  }
  const seats = seatsOf(s);
  return {
    trend: { perMonth, reason: main ? t(main.key) : '' },
    lastChange,
    mayLeave: p.inCoalition && p.id !== s.base.pmParty && p.satisfaction < s.config.threatenBelow,
    seatsWithout: p.inCoalition ? seats - p.seats : seats,
    trait: p.trait ? { id: p.trait, label: t(`trait.${p.trait}`), desc: t(`trait.${p.trait}.desc`) } : null,
  };
}

const tagLabel = (s: GameState, target: string, subject: string | null): string => {
  if (target === 'subject') return subject ? pname(s, subject) : t('tag.coalition');
  const p = s.parties.find((x) => x.id === target);
  if (p) return pname(s, p.id);
  return t(`tag.${target}`);
};

/** a rejected action as a sentence: which cooldown, or why it can't be done now */
export function errorText(r: ActionResult): string {
  const why = r.why ? t(r.why.key, r.why.params) : '';
  return t(r.error ?? 'err.unknown', { ...r.params, why });
}

function whyText(s: GameState, id: string): string {
  const r = unavailableReason(s, id);
  return r ? t(r.key, r.params) : t('why.na');
}

/** success chance in % of a risky remedy (null = no gamble) */
export function oddsOf(id: string): number | null {
  const r = remedyById.get(id)?.risk;
  return r ? Math.round(r.chance * 100) : null;
}

/** qualitative effect preview of an option (no numbers): who/what goes up or down */
export function preview(s: GameState, optionId: string): Preview[] {
  const out: Preview[] = [];
  if (optionId === 'elections') return [{ label: t('fx.elections'), up: false }];
  const crisis = s.event ? crisisById.get(s.event.id) : undefined;
  const subject = s.event?.subject ?? null;
  const pr = remedyById.get(optionId)?.promise;
  if (pr) {
    const def = PROMISES.find((x) => x.id === pr);
    if (def) out.push({ label: t('fx.promise', { who: def.to.map((tg) => t(`tag.${tg}`)).join(', ') }), up: true });
  }
  const effects: Effect[] = optionId === 'ignore'
    ? [crisis?.ignore ?? {}]
    : [remedyById.get(optionId)?.effect ?? {}, crisis?.extra?.[optionId] ?? {}];
  // delivering on an angry card also costs whatever the delivered law/remedy costs: show the bill up front
  if (optionId === 'deliverpremium' && subject) {
    const r = deliveredRemedy(s, subject);
    if (r) effects.push({ ...scaleCosts(r.effect, s.config.premiumCostScale), special: undefined });
    const bill = premiumBill(s, subject);
    if (bill) out.unshift({ label: t('fx.bill', { bill }), up: false });
  }
  // a war starting or ending moves the meters too: show it in the same arrows
  const sp0 = effects.map((e) => e.special);
  if (sp0.includes('war') && !s.war.active) effects.push({ approval: s.config.warApproval, fiscal: s.config.warFiscal });
  if (sp0.includes('endWar') && s.war.active) effects.push({ approval: s.config.warEndApproval });
  // a recently used trick works less (the same factor the engine applies)
  const k = optionId === 'ignore' ? 1 : fatigueOf(s, optionId);
  if (k < 1) out.push({ label: t('fx.tired'), up: false });
  const shown = effects.map((e) => (k < 1 ? dampen(e, k) : e));
  // meters: one arrow per meter, summed over all parts (so +2 and −4 show as one −)
  for (const m of ['approval', 'street', 'us', 'fiscal', 'trial'] as const) {
    const v = shown.reduce((a, e) => a + (e[m] ?? 0), 0);
    if (Math.abs(v) < 0.5) continue;
    out.push(m === 'trial' ? { label: t('fx.trial'), up: v < 0, meter: 'trial', size: sizeOf(v) } : { label: t(`fx.${m}`), up: v > 0, size: sizeOf(v) });
  }
  for (const e of shown) {
    if (e.position) out.push({ label: t(e.position > 0 ? 'fx.right' : 'fx.left'), up: true });
    for (const x of e.sat ?? []) out.push({ label: tagLabel(s, x.target, subject), up: x.delta > 0, size: sizeOf(x.delta, true) });
    if (e.pauseTrialDays) out.push({ label: t('fx.pause'), up: true });
    if (e.quietDays) out.push({ label: t('fx.quiet'), up: true });
    if (e.rival) out.push({ label: t('fx.rival'), up: e.rival < 0 });
    const sp: Record<string, [string, boolean]> = {
      war: ['fx.war', true], endWar: ['fx.endWar', true], ministryToSubject: ['fx.ministry', true],
      fireFarRight: ['fx.fire', false], fireDefence: ['fx.fire', false], elections: ['fx.elections', false],
      passBudget: ['fx.budget', true], defector: ['fx.defector', false],
      deliverPromise: ['fx.deliver', true], refuse: ['fx.refuse', false],
      poach: ['fx.poach', true], newMinistry: ['fx.newMinistry', true], merger: ['fx.merger', true],
      spoiler: ['fx.spoiler', true], gevalt: ['fx.gevalt', true], exileRival: ['fx.exileRival', true],
      primetime: ['fx.primetime', true], postponeElections: ['fx.postponeElections', true],
      plea: ['fx.ending', false], miami: ['fx.ending', false], handover: ['fx.ending', false],
      breakRotation: ['fx.breakRotation', false], pivot: ['fx.pivot', true], securityDetail: ['fx.securityDetail', true], noConfidence: ['fx.noConfidence', true], oppPoach: ['fx.poach', true],
      groundGame: ['fx.groundGame', true],
    };
    if (e.special && sp[e.special]) out.push({ label: t(sp[e.special][0]), up: sp[e.special][1] });
  }
  const seen = new Set<string>();
  return out.filter((x) => { const k = x.label + x.up; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** the remedy a premium delivery runs for this subject's promise (none for a ministry promise) */
function deliveredRemedy(s: GameState, subject: string) {
  const pid = s.parties.find((x) => x.id === subject)?.trust.promiseId;
  const by = PROMISES.find((x) => x.id === pid)?.deliveredBy;
  return by && by !== 'ministry' ? remedyById.get(by) : undefined;
}

/** "Budget −12 · Approval −3": what "deliver now (at a premium)" costs in total (premium + rushed delivery) */
export function premiumBill(s: GameState, subject: string): string {
  const prem = remedyById.get('deliverpremium')!.effect;
  const r = deliveredRemedy(s, subject);
  const d = r ? scaleCosts(r.effect, s.config.premiumCostScale) : {};
  const parts: string[] = [];
  for (const k of ['fiscal', 'approval', 'street', 'us'] as const) {
    const n = Math.round((prem[k] ?? 0) + (d[k] ?? 0));
    if (n) parts.push(`${t(`fx.${k}`)} ${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  }
  return parts.join(' · ');
}

const DAY = 86_400_000;
function dayOfDate(s: GameState, y: number, m: number, d: number) {
  return Math.round((Date.UTC(y, m, d) - Date.parse(s.config.startDate + 'T00:00:00Z')) / DAY);
}
function dateStr(s: GameState, day: number) {
  return new Date(Date.parse(s.config.startDate + 'T00:00:00Z') + Math.floor(day) * DAY).toISOString().slice(0, 10);
}

export function timeline(s: GameState): Timeline {
  const mark = (day: number, kind: string, label: string): TimelineMark => ({ day: Math.floor(day), date: dateStr(s, day), kind, label });
  const nameOf = (id: string) => pname(s, id);
  const past: TimelineMark[] = [];
  for (const e of s.log) {
    if (e.key === 'log.crisis') past.push(mark(e.t, 'crisis', t(`crisis.${e.params?.crisis}.title`)));
    else if (e.key === 'log.war') past.push(mark(e.t, 'war', t('fx.war')));
    else if (e.key === 'log.elections') past.push(mark(e.t, 'election', t('fx.elections')));
    else if (e.key === 'log.title') past.push(mark(e.t, 'title', t(`title.${e.params?.title}`)));
  }
  const up: TimelineMark[] = [];
  const due = budgetDueYear(s);
  if (s.budgetPassedYear < due) up.push(mark(dayOfDate(s, due, 2, 31), 'budget', t('tl.budget', { year: due })));
  if (s.phase === 'campaign') up.push(mark(s.day + s.phaseLeftDays, 'election', t('tl.electionDay')));
  else up.push(mark(s.termEndsDay, 'election', t('tl.scheduled')));
  if (s.war.active) up.push(mark(s.day + s.war.leftDays, 'war', t('tl.warEnds')));
  if (s.config.recessMonths && s.phase === 'governing') {
    const w = recessWindow(s);
    if (s.recess) up.push(mark(w.end, 'recess', t('tl.recessEnds')));
    else up.push(mark(w.start, 'recess', t('tl.recess')));
  }
  if (s.iccUntil > s.day) up.push(mark(s.iccUntil, 'icc', t('tl.iccEnds')));
  for (const d of s.openCases) up.push(mark(d, 'case', t('tl.caseCloses')));
  const trust: Timeline['trust'] = [];
  for (const p of s.parties) {
    if (p.trust.state === 'believing') {
      up.push(mark(p.trust.until, 'promise', t('tl.believes', { party: nameOf(p.id) })));
      trust.push({ party: p.id, color: p.color, from: p.trust.until - s.config.promiseBelieveDays, believeUntil: p.trust.until, distrustUntil: p.trust.until + s.config.promiseDistrustDays });
    } else if (p.trust.state === 'distrust') {
      up.push(mark(p.trust.until, 'distrust', t('tl.distrusts', { party: nameOf(p.id) })));
      const b = p.trust.until - s.config.promiseDistrustDays;
      trust.push({ party: p.id, color: p.color, from: b - s.config.promiseBelieveDays, believeUntil: b, distrustUntil: p.trust.until });
    }
  }
  const goalDay = s.termReached ? s.day : s.day + (s.config.termDays - s.pmDays);
  if (!s.termReached) up.push(mark(goalDay, 'goal', t('tl.goal')));
  const next = TITLES.filter((x) => x.kind === 'tenure' && !s.titles.includes(x.id)).sort((a, b) => a.threshold - b.threshold)[0];
  up.sort((a, b) => a.day - b.day);
  return {
    startDay: 0,
    nowDay: Math.floor(s.day),
    goalDay: Math.floor(goalDay),
    past: past.slice(-60),
    upcoming: up.filter((m) => m.day >= s.day),
    trust,
    nextTitle: next ? { id: next.id, name: t(`title.${next.id}`), inDays: Math.ceil(next.threshold - s.pmDays) } : null,
  };
}

/** which promises can be made to a party */
export function promisesFor(s: GameState, partyId: string): string[] {
  const p = s.parties.find((x) => x.id === partyId);
  if (!p) return [];
  return PROMISES.filter((d) => d.to.includes('any') || d.to.some((tag) => matchesTag(p, tag))).map((d) => d.id);
}

export const ALL_TITLES = TITLES;

export class Game {
  state: GameState;
  constructor(opts: GameOptions = {}) {
    this.state = createState(opts.data ?? DEFAULT_KNESSET, opts.seed ?? 1, opts.config);
  }
  /** wrap an existing (e.g. cloned) state */
  static fromState(state: GameState): Game {
    const g = Object.create(Game.prototype) as Game;
    g.state = state;
    return g;
  }
  clone(): Game { return Game.fromState(structuredClone(this.state)); }
  observe(logTail?: number): Observation { return observe(this.state, logTail); }
  act(action: Action): ActionResult { return act(this.state, action); }
  /** advance by real-time milliseconds (uses config.msPerDay) */
  advance(ms: number): Observation { step(this.state, ms / this.state.config.msPerDay); return this.observe(); }
  /** advance by game days */
  advanceDays(days: number): Observation { step(this.state, days); return this.observe(); }
  get over(): boolean { return this.state.status !== 'playing'; }
  toJSON(): GameState { return this.state; }
}

export function createGame(opts: GameOptions = {}): Game {
  return new Game(opts);
}

export type { Action, ActionResult, GameState };
