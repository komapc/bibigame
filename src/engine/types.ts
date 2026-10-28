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

export type TrustState = 'neutral' | 'believing' | 'distrust';

export interface Trust {
  state: TrustState;
  promiseId: string | null;
  /** game day the current state ends */
  until: number;
}

export interface Party extends PartyDef {
  /** joined only for the duration of a war */
  wartime: boolean;
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
  /** special mechanics */
  special?: 'war' | 'endWar' | 'ministryToSubject' | 'fireFarRight' | 'fireDefence' | 'elections' | 'passBudget' | 'defector';
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
}

export interface CrisisDef {
  id: string;
  weight: number;
  /** effect applied the moment the crisis fires */
  onFire?: Effect;
  /** effect if ignored / timed out ("escalates") */
  ignore: Effect;
  /** remedy ids offered (ignore is always added) */
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
  };
  /** never fired by the random roll (scheduled by the engine) */
  scheduled?: boolean;
}

export interface PromiseDef {
  id: string;
  /** party tags (or "any") this promise can be made to */
  to: string[];
  /** remedy/law id that delivers it, or "ministry" (give that party a ministry) */
  deliveredBy: string;
}

export interface TitleDef {
  id: string;
  kind: 'tenure' | 'achievement';
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

export type Phase = 'governing' | 'campaign';
export type Status = 'playing' | 'won' | 'lost';

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
  /** regional (Iran/Hezbollah) tension lasts until this day */
  tensionUntil: number;
  /** ICC warrant active until this day */
  iccUntil: number;
  /** once-per-game remedies already used */
  usedOnce: string[];
  elections: number;
  failedElections: number;
  stats: Stats;
  titles: string[];
  log: LogEntry[];
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
  | { type: 'deliver'; partyId: string; promiseId: string };

export interface ActionResult {
  ok: boolean;
  /** i18n key explaining a rejection */
  error?: string;
}
