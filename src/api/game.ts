// Public programmatic API — used by the browser UI, the HTTP server, the text
// CLI and bots. Headless, deterministic for a given seed + action sequence.
import knesset from '../data/knesset.json' with { type: 'json' };
import type { Action, ActionResult, Config, Effect, GameState, KnessetData, Outcome } from '../engine/types.ts';
import {
  act, budgetDueYear, loseChance, hasTension, createState, dateOf, eventOptions, satDrivers, seatsOf, step,
} from '../engine/game.ts';
import { LAWS, crisisById, remedyById } from '../data/crises.ts';
import { PROMISES } from '../data/promises.ts';
import { TITLES } from '../data/titles.ts';
import { formatLog, partyLabel, t } from '../i18n/index.ts';

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
  status: GameState['status'];
  lostReason: GameState['lostReason'];
  /** chance the voters throw you out if elections were held now */
  electionRisk: number;
  phase: GameState['phase'];
  phaseLeftDays: number;
  seats: number;
  majority: number;
  defectors: number;
  govPosition: number;
  meters: { approval: number; street: number; us: number; fiscal: number; trial: number };
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
  }[];
  /** recent cause → result records, newest last; watch outcomeSeq for new ones */
  outcomes: OutcomeView[];
  outcomeSeq: number;
  ministries: { id: string; name: string; holder: string | null }[];
  event: null | {
    id: string; title: string; text: string; subject: string | null; daysLeft: number;
    /** left / right / up = remedies, down = early elections; timeout = ignore */
    options: { id: string; dir: string; label: string; desc: string; available: boolean; preview: Preview[] }[];
  };
  war: { active: boolean; daysLeft: number; cooldownDays: number };
  /** Iran/Hezbollah tension: enables war, beepers, Fordow */
  tension: boolean;
  /** ICC warrant days left (blocks travel remedies) */
  iccDays: number;
  usedOnce: string[];
  cooldowns: { ministry: number; law: number; invite: number };
  laws: { id: string; label: string }[];
  promises: { id: string; label: string; to: string[]; deliveredBy: string }[];
  titles: { id: string; name: string; gloss: string }[];
  stats: GameState['stats'];
  elections: number;
  log: { day: number; kind: string; text: string }[];
  timeline: Timeline;
}

export interface Preview { label: string; up: boolean }

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
  const n = Number(p.quip ?? o.seq) % 3;
  let id = '';
  if (o.kind === 'news') return t(`crisis.${p.crisis}.text`);
  if (o.cause.key === 'out.ignored' || o.cause.key === 'out.timedOutIgnore') id = 'ignore';
  else if (p.remedy) id = String(p.remedy);
  else if (o.cause.key === 'out.law') id = String(p.law);
  else if (o.cause.key === 'out.war') id = 'war';
  else if (o.cause.key === 'out.ministry') id = 'ministry';
  else if (o.cause.key === 'out.deliver') id = 'deliverpremium';
  if (!id) return '';
  const k = `quip.${id}.${n}`;
  const q = t(k);
  return q === k ? '' : q;
}

function reactionOf(s: GameState, o: Outcome): string {
  if (o.kind === 'elections' || o.kind === 'newGov' || o.kind === 'news') return '';
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
  const cause = formatLog({ t: o.day, key: o.cause.key, params: o.cause.params }, nameOf);
  const sat = o.sat.map((x) => ({ ...x, name: nameOf(x.party) }));
  const meters = o.meters.map((x) => ({ ...x, label: t(`fx.${x.meter}`) }));
  const risks = o.risks.map((id) => t(`crisis.${id}.title`));
  const left = o.left.map(nameOf), joined = o.joined.map(nameOf);
  const parts: string[] = [];
  if (o.seats.from !== o.seats.to) parts.push(t('out.seats', o.seats));
  if (left.length) parts.push(t('out.leftList', { parties: left.join(', ') }));
  if (joined.length) parts.push(t('out.joinedList', { parties: joined.join(', ') }));
  if (o.cause.key === 'out.invite' && !joined.length) parts.push(t('out.refused', { party: nameOf(String(o.cause.params?.party)) }));
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
function becauseOf(s: GameState, o: Outcome): string {
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

export function observe(s: GameState, logTail = 12): Observation {
  const nameOf = (id: string) => pname(s, id);
  return {
    day: Math.floor(s.day),
    date: dateOf(s).toISOString().slice(0, 10),
    pmDays: Math.floor(s.pmDays),
    termDays: s.config.termDays,
    termProgress: Math.min(1, s.pmDays / s.config.termDays),
    termReached: s.termReached,
    status: s.status,
    lostReason: s.lostReason ?? null,
    electionRisk: Math.round(loseChance(s) * 100) / 100,
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
    event: s.event && {
      id: s.event.id,
      title: t(`crisis.${s.event.id}.title`),
      text: t(`crisis.${s.event.id}.text`),
      subject: s.event.subject,
      daysLeft: Math.max(0, Math.ceil(s.event.leftDays)),
      options: eventOptions(s).map((o) => ({
        ...o, label: t(`remedy.${o.id}`), desc: t(`remedy.${o.id}.desc`), preview: preview(s, o.id),
      })),
    },
    war: { active: s.war.active, daysLeft: Math.ceil(s.war.leftDays), cooldownDays: Math.ceil(s.war.cooldownDays) },
    tension: hasTension(s),
    iccDays: Math.max(0, Math.ceil(s.iccUntil - s.day)),
    usedOnce: [...s.usedOnce],
    cooldowns: {
      ministry: Math.ceil(s.cooldowns.ministry), law: Math.ceil(s.cooldowns.law), invite: Math.ceil(s.cooldowns.invite),
    },
    laws: LAWS.map((id) => ({ id, label: t(`remedy.${id}`) })),
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
  };
}

const tagLabel = (s: GameState, target: string, subject: string | null): string => {
  if (target === 'subject') return subject ? pname(s, subject) : t('tag.coalition');
  const p = s.parties.find((x) => x.id === target);
  if (p) return pname(s, p.id);
  return t(`tag.${target}`);
};

/** qualitative effect preview of an option (no numbers): who/what goes up or down */
export function preview(s: GameState, optionId: string): Preview[] {
  const out: Preview[] = [];
  if (optionId === 'elections') return [{ label: t('fx.elections'), up: false }];
  const crisis = s.event ? crisisById.get(s.event.id) : undefined;
  const subject = s.event?.subject ?? null;
  const effects: Effect[] = optionId === 'ignore'
    ? [crisis?.ignore ?? {}]
    : [remedyById.get(optionId)?.effect ?? {}, crisis?.extra?.[optionId] ?? {}];
  for (const e of effects) {
    for (const k of ['approval', 'street', 'us', 'fiscal'] as const) if (e[k]) out.push({ label: t(`fx.${k}`), up: e[k]! > 0 });
    if (e.trial) out.push({ label: t('fx.trial'), up: e.trial < 0 });
    if (e.position) out.push({ label: t(e.position > 0 ? 'fx.right' : 'fx.left'), up: true });
    for (const x of e.sat ?? []) out.push({ label: tagLabel(s, x.target, subject), up: x.delta > 0 });
    if (e.pauseTrialDays) out.push({ label: t('fx.pause'), up: true });
    if (e.quietDays) out.push({ label: t('fx.quiet'), up: true });
    const sp: Record<string, [string, boolean]> = {
      war: ['fx.war', true], endWar: ['fx.endWar', true], ministryToSubject: ['fx.ministry', true],
      fireFarRight: ['fx.fire', false], fireDefence: ['fx.fire', false], elections: ['fx.elections', false],
      passBudget: ['fx.budget', true], defector: ['fx.defector', false],
      deliverPromise: ['fx.deliver', true], buyTime: ['fx.buyTime', true], refuse: ['fx.refuse', false],
    };
    if (e.special && sp[e.special]) out.push({ label: t(sp[e.special][0]), up: sp[e.special][1] });
    if (e.special === 'war') out.push({ label: t('fx.fiscal'), up: false });
  }
  return out;
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
