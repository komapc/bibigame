// Public programmatic API — used by the browser UI, the HTTP server, the text
// CLI and bots. Headless, deterministic for a given seed + action sequence.
import knesset from '../data/knesset.json' with { type: 'json' };
import type { Action, ActionResult, Config, GameState, KnessetData } from '../engine/types.ts';
import {
  act, budgetDueYear, hasTension, createState, dateOf, eventOptions, seatsOf, step,
} from '../engine/game.ts';
import { LAWS } from '../data/crises.ts';
import { PROMISES } from '../data/promises.ts';
import { TITLES } from '../data/titles.ts';
import { formatLog, t } from '../i18n/index.ts';
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
    trust: { state: string; promiseId: string | null; daysLeft: number };
  }[];
  ministries: { id: string; name: string; holder: string | null }[];
  event: null | {
    id: string; title: string; text: string; subject: string | null; daysLeft: number;
    options: { id: string; label: string; available: boolean }[];
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
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function observe(s: GameState, logTail = 12): Observation {
  const nameOf = (id: string) => s.parties.find((p) => p.id === id)?.name ?? id;
  return {
    day: Math.floor(s.day),
    date: dateOf(s).toISOString().slice(0, 10),
    pmDays: Math.floor(s.pmDays),
    termDays: s.config.termDays,
    termProgress: Math.min(1, s.pmDays / s.config.termDays),
    termReached: s.termReached,
    status: s.status,
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
      id: p.id, name: p.name, short: p.short, color: p.color, seats: p.seats, position: p.position,
      tolerance: p.tolerance, satisfaction: r1(p.satisfaction), inCoalition: p.inCoalition, wartime: p.wartime,
      threatening: p.threatening, willSitWithBibi: p.willSitWithBibi, tags: p.tags,
      ministries: s.ministries.filter((m) => m.holder === p.id).map((m) => m.id),
      trust: { state: p.trust.state, promiseId: p.trust.promiseId, daysLeft: Math.max(0, Math.ceil(p.trust.until - s.day)) },
    })),
    ministries: s.ministries.map((m) => ({ id: m.id, name: t(`ministry.${m.id}`), holder: m.holder })),
    event: s.event && {
      id: s.event.id,
      title: t(`crisis.${s.event.id}.title`),
      text: t(`crisis.${s.event.id}.text`),
      subject: s.event.subject,
      daysLeft: Math.max(0, Math.ceil(s.event.leftDays)),
      options: eventOptions(s).map((o) => ({ ...o, label: t(`remedy.${o.id}`) })),
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
    log: s.log.slice(-logTail).map((e) => ({ day: Math.floor(e.t), kind: e.kind ?? 'info', text: formatLog(e, nameOf) })),
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
