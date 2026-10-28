// Pure data types for the game engine. No DOM, no Math.random, no Date.now.
import type { Config } from '../config.ts';
export type { Config };

export interface PartyDef {
  id: string;
  name: string;
  short: string;
  color: string;
  seats: number;
  /** -10 (left) .. +10 (right) */
  position: number;
  /** distance from government position the party tolerates before souring */
  tolerance: number;
  satisfaction: number;
  inCoalition: boolean;
  willSitWithBibi: boolean;
  joinsWartime: boolean;
  tags: string[];
  /** party ids or tags this party cannot stand sitting with */
  hates: string[];
  /** extra names accepted by the text interface, e.g. leader surnames */
  aliases?: string[];
}

export interface KnessetData {
  pmParty: string;
  startPosition: number;
  parties: PartyDef[];
  ministries: { id: string; holder: string | null }[];
}

/** angry = the believe window ran out, an angry-reminder card is pending */
export type TrustState = 'neutral' | 'believing' | 'angry' | 'distrust';

export interface Trust {
  state: TrustState;
  promiseId: string | null;
  /** game day the current state ends */
  until: number;
  /** already bought time once for this promise */
  extended?: boolean;
}

export type Trait = 'patient' | 'hothead' | 'greedy' | 'loyal' | 'opportunist';

export interface Party extends PartyDef {
  /** party leader's trait this game (random per game; undefined = none) */
  trait?: Trait;
  /** joined only for the duration of a war */
  wartime: boolean;
  /** state-funded security detail for the leader's family: a small daily mood bonus until this day */
  guardedUntil?: number;
  /** has publicly threatened to quit (hysteresis flag) */
  threatening: boolean;
  trust: Trust;
}

export interface Ministry {
  id: string;
  holder: string | null;
}

/** party id, tag (farright/haredi/centrist/...), or "coalition" | "opposition" | "all" | "subject" | "pm" */
export type Target = string;

export interface Effect {
  position?: number;
  /** public approval / the base */
  approval?: number;
  /** street calm (low = protests) */
  street?: number;
  /** US support */
  us?: number;
  /** fiscal health */
  fiscal?: number;
  /** corruption-trial pressure */
  trial?: number;
  /** pause trial growth for N days */
  pauseTrialDays?: number;
  /** delay next random event by N days */
  quietDays?: number;
  sat?: { target: Target; delta: number }[];
  /** opposition only: the rival government's stability */
  rival?: number;
  /** special mechanics */
  special?: 'war' | 'endWar' | 'ministryToSubject' | 'fireFarRight' | 'fireDefence' | 'elections' | 'deliverPromise' | 'buyTime' | 'refuse' | 'passBudget' | 'defector'
    | 'poach' | 'newMinistry' | 'merger' | 'spoiler' | 'gevalt' | 'exileRival' | 'primetime' | 'postponeElections'
    | 'plea' | 'miami' | 'handover' | 'breakRotation' | 'noConfidence' | 'oppPoach' | 'pivot' | 'securityDetail';
}

export interface RemedyDef {
  id: string;
  effect: Effect;
  /** crises whose probability rises after using this remedy */
  backfires: string[];
  /** usable proactively as a law (passLaw action) */
  law?: boolean;
  /** only when there is Iran/Hezbollah tension (recent strike, or war) */
  context?: 'tension';
  /** can be used once per game */
  once?: boolean;
  /** a long trip abroad — blocked while an ICC warrant is active */
  travel?: boolean;
  /** sets/extends regional tension for N days */
  tension?: number;
  /** a PROMISE remedy: makes this promise to every coalition party it targets (they believe you
   *  for promiseBelieveDays); the remedy's own effect is the immediate reaction of everyone else */
  promise?: string;
  /** a gamble: succeeds with `chance` (shown as odds); otherwise `fail` applies instead of `effect` */
  risk?: { chance: number; fail: Effect };
  /** a law that stays law once passed: hidden afterwards (and cards demanding it stop) */
  permanent?: boolean;
}

export interface CrisisDef {
  id: string;
  weight: number;
  /** effect applied the moment the crisis fires */
  onFire?: Effect;
  /** effect if ignored / timed out ("escalates") */
  ignore: Effect;
  /** ≤3 remedy ids offered as left/right/up ('ignore' allowed); down = elections */
  remedies: string[];
  /** per-remedy extra effect for this crisis */
  extra?: Record<string, Effect>;
  /** party picked as "subject" (by tag; lowest satisfaction coalition member) */
  subjectTag?: string;
  /** subject = holder of this ministry (overrides subjectTag) */
  subjectMinistry?: string;
  /** opens a corruption case */
  opensCase?: boolean;
  /** sets regional tension for N days */
  tension?: number;
  /** ICC warrant for N days (blocks travel remedies) */
  icc?: number;
  requires?: {
    coalitionTag?: string; maxApproval?: number; noWar?: boolean; maxFiscal?: number;
    minTrial?: number; warHistory?: boolean;
    /** not once this permanent law has passed */
    notPassed?: string;
    /** only during a war or within config.recentWarDays after one */
    recentWar?: boolean;
  };
  /** never fired by the random roll (scheduled by the engine) */
  scheduled?: boolean;
  /** shorter timer, distinct look */
  urgent?: boolean;
  /** option applied on timeout (default 'ignore') */
  defaultOption?: string;
  /** good-news event: no card; onFire applies and a result flash/headline shows it */
  goodNews?: boolean;
  /** with goodNews: a bad-news wildcard (no card either; shown as bad news) */
  badNews?: boolean;
}

export interface PromiseDef {
  id: string;
  /** party tags (or "any") this promise can be made to */
  to: string[];
  /** remedy/law id that delivers it, or "ministry" (give that party a ministry) */
  deliveredBy: string;
  /** other remedies that also count as delivering it */
  alsoBy?: string[];
  /** believe window (default config.promiseBelieveDays) */
  believeDays?: number;
  /** satisfaction boost when made (default config.promiseBoost) */
  boost?: number;
  /** card fired when the window runs out (default 'angry') */
  card?: string;
  /** partner must have at least this many seats */
  minSeats?: number;
  /** can't be delivered early from the drawer (only on its card) */
  cardOnly?: boolean;
}

/** a drawer move: the effect is the REMEDIES entry with the same id (cards and moves share it) */
export interface MoveDef {
  id: string;
  /** phases in which the move can be used */
  phases: Phase[];
  /** own cooldown after use */
  cooldownDays?: number;
  /** once per Knesset term / election (reset when a new government forms or you lose) */
  oncePerTerm?: boolean;
  requires?: { war?: boolean; minTrial?: number; electionsWithinDays?: number; oppositionDonor?: boolean };
  /** ends the game (special ending) */
  ending?: boolean;
}

export interface TitleDef {
  id: string;
  /** ending: earned when the game ends that way (lostReason) */
  kind: 'tenure' | 'achievement' | 'ending';
  ending?: LostReason;
  /** tenure: days as PM; achievement: threshold for stat */
  threshold: number;
  stat?: keyof Stats;
}

export interface Stats {
  warsEnded: number;
  /** re-elections after which Bibi formed a government again */
  electionsSurvived: number;
  /** corruption cases opened against you while you stayed PM */
  casesSurvived: number;
  maxOpenCases: number;
  /** 1 once every opposition party has refused you */
  refusedByAll: number;
  /** won re-elections after polling under 25 seats */
  comebacks: number;
  brokenPromises: number;
  promisesKept: number;
  /** consecutive days with a 6+ party coalition */
  bigCoalitionStreak: number;
  bigCoalitionBest: number;
  crisesHandled: number;
  /** came back from the opposition to form a government */
  returns: number;
}

export interface ActiveEvent {
  id: string;
  subject: string | null;
  firedAt: number;
  leftDays: number;
}

export interface LogEntry {
  /** game day */
  t: number;
  /** i18n key */
  key: string;
  params?: Record<string, string | number>;
  kind?: 'info' | 'good' | 'bad' | 'event' | 'title';
}

export type Phase = 'governing' | 'campaign' | 'opposition';
/** retired = a special ending (Miami, plea bargain, rotation handover): not a defeat, not a win */
export type Status = 'playing' | 'won' | 'lost' | 'retired';
/** voters = lost the election; deadlock = nobody (incl. you) could form a government; indicted = trial meter maxed */
export type LostReason = 'voters' | 'deadlock' | 'indicted' | 'miami' | 'plea' | 'rotation';

export interface GameState {
  seed: number;
  rngState: number;
  config: Config;
  base: KnessetData;
  /** game days since start */
  day: number;
  /** days as PM counted toward the term goal */
  pmDays: number;
  status: Status;
  /** reached termDays at least once */
  termReached: boolean;
  phase: Phase;
  phaseLeftDays: number;
  govPosition: number;
  approval: number;
  street: number;
  us: number;
  fiscal: number;
  trial: number;
  trialPausedUntil: number;
  /** game days on which each open corruption case closes */
  openCases: number[];
  /** opposition parties that have refused to join */
  refusedBy: string[];
  /** PM party projected seats when the current campaign started */
  campaignPollSeats: number;
  parties: Party[];
  ministries: Ministry[];
  /** rogue MKs who no longer vote with the coalition (reset at elections) */
  defectors: number;
  event: ActiveEvent | null;
  nextEventInDays: number;
  /** crisis id -> extra weight multiplier from backfires/ignores */
  pressure: Record<string, number>;
  war: { active: boolean; leftDays: number; cooldownDays: number };
  cooldowns: { ministry: number; law: number; invite: number };
  /** last year whose budget was passed */
  budgetPassedYear: number;
  lastBudgetNag: number;
  /** crises waiting to fire as soon as the card slot is free (e.g. angry reminders) */
  queue: { id: string; subject: string | null }[];
  /** scheduled elections on this day */
  termEndsDay: number;
  /** regional (Iran/Hezbollah) tension lasts until this day */
  tensionUntil: number;
  /** ICC warrant active until this day */
  iccUntil: number;
  /** once-per-game remedies already used */
  usedOnce: string[];
  /** permanent laws already passed */
  lawsPassed: string[];
  /** crisis id → game day it last fired (per-card cooldown) */
  lastFired: Record<string, number>;
  /** game day the last war ended */
  lastWarEnd: number;
  elections: number;
  failedElections: number;
  stats: Stats;
  titles: string[];
  log: LogEntry[];
  /** visible cause → result records (choices, timeouts, actions, coalition changes); last 40 */
  outcomes: Outcome[];
  outcomeSeq: number;
  /** why the game was lost (for the game-over screen) */
  lostReason: LostReason | null;
  /** game days on which elections were called (election fatigue) */
  electionDays: number[];
  /** remedy id → game days it was used (diminishing returns) */
  remedyUses: Record<string, number[]>;
  /** elections lost (voters or deadlock); config.maxElectionLosses ends the game */
  electionLosses: number;
  /** in opposition: the rival government (falls at stability 0 or at `until`) */
  rival: { stability: number; until: number } | null;
  /** the current campaign came from the opposition */
  fromOpposition: boolean;
  /** campaign tricks in effect for the next election roll */
  campaignFx: { merger: boolean; spoiler: boolean; gevalt: boolean };
  /** move id → game day it is usable again */
  moveReadyAt: Record<string, number>;
  /** once-per-term moves already used this term */
  usedThisTerm: string[];
  /** random starting conditions this game */
  startConditions: string[];
  /** Trump's mood, −2 (furious) .. +2 (adoring); a random walk with 3 a.m. swings */
  trumpMood: number;
}

export type Action =
  | { type: 'noop' }
  | { type: 'choose'; optionId: string }
  | { type: 'giveMinistry'; ministryId: string; partyId: string }
  | { type: 'startWar' }
  | { type: 'passLaw'; lawId: string }
  | { type: 'invite'; partyId: string }
  | { type: 'promise'; partyId: string; promiseId: string }
  /** actually do the thing you promised (uses the law cooldown) */
  | { type: 'deliver'; partyId: string; promiseId: string }
  /** a drawer move (src/data/moves.ts) */
  | { type: 'move'; moveId: string };

export interface ActionResult {
  ok: boolean;
  /** i18n key explaining a rejection */
  error?: string;
}

/** What a single decision (or a coalition change) did, so the UI/text mode can show cause → result. */
export interface Outcome {
  seq: number;
  day: number;
  /** choice = picked a card option; timeout = card expired; action = drawer move;
   *  leave/join = coalition change outside a decision; elections/newGov = phase changes */
  kind: 'choice' | 'timeout' | 'action' | 'leave' | 'join' | 'elections' | 'newGov' | 'news';
  /** i18n key + params describing the cause ("You built a settlement") */
  cause: { key: string; params?: Record<string, string | number> };
  /** satisfaction deltas per party (rounded, |Δ| ≥ 1) */
  sat: { party: string; delta: number; inCoalition: boolean }[];
  /** meter deltas (approval, street, us, fiscal, trial) */
  meters: { meter: string; delta: number }[];
  seats: { from: number; to: number };
  left: string[];
  joined: string[];
  /** crises that became more likely (backfire / escalation) */
  risks: string[];
}
