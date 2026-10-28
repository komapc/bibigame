// ALL tuning constants live here. Time is in GAME DAYS unless suffixed Ms.
// Remedy/crisis magnitudes live in src/data/crises.ts (data, not tuning rates).

export interface Config {
  /** real milliseconds per game day (UI clock only; engine runs in days) */
  msPerDay: number;
  /** game start date (ISO, UTC) */
  startDate: string;
  /** days as PM required to "win" (4 years) */
  termDays: number;
  /** if true, the PM clock restarts after each election; default: total time as PM counts */
  restartTermOnElection: boolean;
  /** if true the game ends (status "won") at termDays; otherwise you keep going for titles */
  stopAtTerm: boolean;

  eventIntervalDays: number;
  eventJitterDays: number;
  /** game days a crisis card waits before its default fires (bots, text mode, UI).
   *  Keep ≈ uiAnswerMs × uiCardClockScale / msPerDay so the UI and engine agree. */
  eventTimeoutDays: number;
  /** timer for urgent cards (angry reminders); keep ≈ uiUrgentAnswerMs × uiCardClockScale / msPerDay */
  urgentTimeoutDays: number;
  /** UI: real-time budget to answer a normal card (ms) */
  uiAnswerMs: number;
  /** UI: real-time budget to answer an urgent card (ms) */
  uiUrgentAnswerMs: number;
  /** UI: game clock speed multiplier while a card awaits an answer (reading shouldn't burn months) */
  uiCardClockScale: number;
  /** UI: if true the clock STOPS while a decision card is open (no countdown); overrides uiCardClockScale */
  pauseOnDecision: boolean;
  /** UI: clock speed multiplier when no card is pending (fast-forward between events) */
  uiIdleClockScale: number;
  /** party card shows "waiting…" this many days before a promise window ends */
  promiseWarnDays: number;
  /** "buy time" extends the believe window by this much (once per promise) */
  buyTimeDays: number;

  warDurationDays: number;
  warCooldownDays: number;
  ministryCooldownDays: number;
  lawCooldownDays: number;
  inviteCooldownDays: number;
  campaignDays: number;
  /** a Knesset term: scheduled elections this many days after the last ones */
  knessetTermDays: number;
  /** every partner's satisfaction drains this much per day (appetite) */
  appetitePerDay: number;
  /** appetite grows by this fraction per year as PM (entropy) */
  appetiteGrowthPerYear: number;
  /** crises come faster the longer you rule: interval / (1 + this × years as PM) */
  eventSpeedupPerYear: number;
  /** chance that a resolved crisis is followed by another within clusterDays */
  clusterChance: number;
  clusterDays: number;
  /** election-loss roll: base + per approval point below approvalNeutral + per open case + per election in the last electionFatigueDays */
  loseBase: number;
  losePerApprovalPoint: number;
  losePerOpenCase: number;
  losePerRecentElection: number;
  electionFatigueDays: number;
  loseMax: number;
  /** trial meter at which you're indicted and the game ends (0 = never) */
  indictAt: number;
  /** consecutive elections without a Bibi government before game over */
  maxFailedElections: number;

  majority: number;
  totalSeats: number;
  /** min seats to enter the Knesset (3.25% of 120 ≈ 4) */
  threshold: number;

  // --- satisfaction dynamics (per day) ---
  /** sat loss per day per position unit beyond tolerance */
  driftPenalty: number;
  /** sat change per day per ministry above/below fair share */
  ministryFairness: number;
  /** sat loss per day for each hated party/tag sitting in the coalition */
  hatePenalty: number;
  /** pull of satisfaction toward satBaseline per day (fraction) */
  satRegression: number;
  satBaseline: number;
  threatenBelow: number;
  /** below this satisfaction a threatening partner may walk out any day (chance per day) */
  leaveBelow: number;
  /** partners get nervous when your approval is below this: −(line − approval) × pollPanicPerPoint sat/day */
  pollPanicBelow: number;
  pollPanicPerPoint: number;
  /** repeated use of a remedy within remedyFatigueDays: its POSITIVE effects shrink by 1 / (1 + uses × remedyFatigue) */
  remedyFatigue: number;
  remedyFatigueDays: number;
  /** coalition funds unavailable when budget health is below this ("the treasury is empty") */
  fundsMinFiscal: number;
  leaveChancePerDay: number;
  threatenResetAbove: number;

  // --- meters ---
  /** approval pulls toward a target computed from street/us/fiscal/trial */
  approvalRegression: number;
  /** approval target drops this much per year as PM (incumbency fatigue) */
  fatiguePerYear: number;
  trialGrowthPerDay: number;
  meterRegression: number;
  /** seats the PM party gains per approval point above approvalNeutral at elections */
  approvalSeatFactor: number;
  approvalNeutral: number;
  electionNoise: number;
  electionNoiseMin: number;

  // --- backfire pressure ---
  backfirePressure: number;
  ignorePressure: number;
  pressureDecayPerDay: number;

  // --- promises ---
  promiseBelieveDays: number;
  promiseDistrustDays: number;
  promiseBoost: number;
  promiseBrokenPenalty: number;
  promiseDeliverBonus: number;
  believeDriftPerDay: number;
  distrustDriftPerDay: number;

  // --- ministries / invites ---
  ministryGain: number;
  ministryLoss: number;
  inviteBaseChance: number;

  // --- war ---
  warApproval: number;
  warEndApproval: number;
  warFiscal: number;
  warApprovalBonusTarget: number;

  /** budget must pass by 31 March each year; crisis starts nagging from this month (0=Jan) */
  budgetNagFromMonth: number;

  // --- opposition (after losing an election) ---
  /** elections lost (voters or deadlock) before game over; the first loss sends you to the opposition */
  maxElectionLosses: number;
  rivalStartStability: number;
  /** rival government stability lost per day (it falls apart on its own, eventually) */
  rivalDecayPerDay: number;
  /** the rival government falls after this many days at the latest (elections) */
  oppositionMaxDays: number;
  /** approval target bonus in opposition ("they miss you") */
  oppositionApprovalBonus: number;
  /** no-confidence vote: success chance = 1 − stability / this */
  noConfidenceScale: number;

  // --- moves ---
  /** rotation promise: believe window, boost, penalty if broken, distrust days */
  rotationBelieveDays: number;
  rotationBoost: number;
  rotationBrokenPenalty: number;
  rotationDistrustDays: number;
  /** at most this many invented ministries */
  newMinistryMax: number;
  /** campaign tricks: seats in the election roll / lower loss chance */
  mergerSeats: number;
  gevaltSeats: number;
  gevaltLose: number;
  spoilerSeats: number;
  spoilerLose: number;
  spoilerExposeChance: number;
  /** emergency law: scheduled elections move this far */
  postponeDays: number;
  /** prime-time statement: approval swing range [min, max] */
  primetimeMin: number;
  primetimeMax: number;
}

export const DEFAULT_CONFIG: Config = {
  msPerDay: 165, // ≈ 5 s per game month, ≈ 4 min per 4-year term
  startDate: '2026-12-01',
  termDays: 1461,
  restartTermOnElection: false,
  stopAtTerm: false,

  eventIntervalDays: 20,
  eventJitterDays: 8,
  eventTimeoutDays: 23, // = 15 s × 0.25 / 165 ms (was 45 ≈ 7 s of wall time — too short to read)
  urgentTimeoutDays: 12, // = 8 s × 0.25 / 165 ms
  uiAnswerMs: 15000,
  uiUrgentAnswerMs: 8000,
  uiCardClockScale: 0.25,
  pauseOnDecision: true,
  uiIdleClockScale: 2.5,
  promiseWarnDays: 14,
  buyTimeDays: 30,

  warDurationDays: 90,
  warCooldownDays: 300,
  ministryCooldownDays: 60,
  lawCooldownDays: 90,
  inviteCooldownDays: 90,
  campaignDays: 60,
  knessetTermDays: 1461,
  appetitePerDay: 0.04,
  appetiteGrowthPerYear: 0.3,
  eventSpeedupPerYear: 0.15,
  clusterChance: 0.15,
  clusterDays: 4,
  loseBase: 0.1,
  losePerApprovalPoint: 0.015,
  losePerOpenCase: 0.05,
  losePerRecentElection: 0.1,
  electionFatigueDays: 1461,
  loseMax: 0.85,
  indictAt: 100,
  maxFailedElections: 1,

  majority: 61,
  totalSeats: 120,
  threshold: 4,

  driftPenalty: 0.08,
  ministryFairness: 0.03,
  hatePenalty: 0.1,
  satRegression: 0.002,
  satBaseline: 50,
  threatenBelow: 25,
  leaveBelow: 15,
  pollPanicBelow: 32,
  pollPanicPerPoint: 0.015,
  remedyFatigue: 0.6,
  remedyFatigueDays: 365,
  fundsMinFiscal: 15,
  leaveChancePerDay: 0.02,
  threatenResetAbove: 35,

  approvalRegression: 0.01,
  fatiguePerYear: 1.5,
  trialGrowthPerDay: 0.03,
  meterRegression: 0.002,
  approvalSeatFactor: 0.35,
  approvalNeutral: 45,
  electionNoise: 0.12,
  electionNoiseMin: 1,

  backfirePressure: 1.5,
  ignorePressure: 0.5,
  pressureDecayPerDay: 0.01,

  promiseBelieveDays: 91,
  promiseDistrustDays: 183,
  promiseBoost: 12,
  promiseBrokenPenalty: 20,
  promiseDeliverBonus: 10,
  believeDriftPerDay: 0.05,
  distrustDriftPerDay: 0.06,

  ministryGain: 12,
  ministryLoss: 15,
  inviteBaseChance: 0.25,

  warApproval: 8,
  warEndApproval: -4,
  warFiscal: -15,
  warApprovalBonusTarget: 10,

  budgetNagFromMonth: 1,

  maxElectionLosses: 2,
  rivalStartStability: 60,
  rivalDecayPerDay: 0.08,
  oppositionMaxDays: 730,
  oppositionApprovalBonus: 6,
  noConfidenceScale: 50,

  rotationBelieveDays: 540,
  rotationBoost: 30,
  rotationBrokenPenalty: 40,
  rotationDistrustDays: 730,
  newMinistryMax: 4,
  mergerSeats: 2,
  gevaltSeats: 3,
  gevaltLose: 0.05,
  spoilerSeats: 3,
  spoilerLose: 0.04,
  spoilerExposeChance: 0.3,
  postponeDays: 365,
  primetimeMin: -4,
  primetimeMax: 7,
};
