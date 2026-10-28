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
  eventTimeoutDays: number;
  /** timer for urgent cards (angry reminders) */
  urgentTimeoutDays: number;
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
}

export const DEFAULT_CONFIG: Config = {
  msPerDay: 165, // ≈ 5 s per game month, ≈ 4 min per 4-year term
  startDate: '2026-12-01',
  termDays: 1461,
  restartTermOnElection: false,
  stopAtTerm: false,

  eventIntervalDays: 20,
  eventJitterDays: 8,
  eventTimeoutDays: 45,
  urgentTimeoutDays: 20,
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
};
