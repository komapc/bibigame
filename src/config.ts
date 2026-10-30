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
  /** UI: if true the clock stops on the news screen after a card until the player taps Next */
  pauseOnNews: boolean;
  /** UI: clock speed multiplier when no card is pending (fast-forward between events) */
  uiIdleClockScale: number;
  /** UI: the clock runs this many times faster during the Knesset summer recess */
  recessClockMult: number;
  /** Knesset summer recess: regular crises pause (wildcards still happen); 0-based month, length in months; 0 = off */
  recessStartMonth: number;
  recessMonths: number;
  /** party card shows "waiting…" this many days before a promise window ends */
  promiseWarnDays: number;

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
  /** the roll also falls per approval point ABOVE approvalNeutral (popular PMs are safer) */
  loseGainPerApprovalPoint: number;
  /** the "ground game" lever (last months of a term): off the next loss roll */
  groundGameLose: number;
  /** approval collapse: below this for collapseDays in a row (governing) → partners bolt, elections;
   *  a warning (log + advisor) after collapseWarnDays */
  collapseBelow: number;
  collapseDays: number;
  collapseWarnDays: number;
  /** "deliver now (at a premium)": the delivered remedy's costs are scaled by this (the premium is the bill) */
  premiumCostScale: number;
  /** show the election odds and their factors this many days before scheduled elections */
  electionOddsDays: number;
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
  /** cap on the poll-panic drain per partner (sat/day) */
  pollPanicMaxPerDay: number;
  /** remedy effects get ±this share of noise (0 = deterministic numbers) */
  outcomeNoise: number;
  /** random starting moods, approval, starting conditions and leader traits */
  randomStart: boolean;
  startMoodSpread: number;
  startApprovalSpread: number;
  /** share of parties whose leader gets a trait */
  traitChance: number;
  /** Trump mood: daily random walk step, chance per day of a 3 a.m. swing, US-meter pull per mood point */
  trumpWalk: number;
  trumpSwingPerDay: number;
  trumpUsPull: number;
  /** Kaplan's weight multiplier from low street is capped here */
  kaplanStreetMaxMult: number;
  /** the same card never fires twice within this many days */
  crisisCooldownDays: number;
  /** each earlier firing of the same card this game multiplies its weight by this */
  crisisRepeatDecay: number;
  goodNewsCooldownDays: number;
  /** ceasefire/deal cards: during a war or this many days after it */
  recentWarDays: number;
  /** the US-midterms wildcard only fires in Oct–Nov of a midterm year: its weight there is multiplied by this */
  midtermsSeasonMult: number;
  /** a wartime partner stays after the war if its mood is at least this */
  wartimeStayMood: number;
  /** the PM party never gives away ministries below this many (handouts then become deputy posts) */
  pmMinMinistries: number;
  /** repeated use of a remedy within remedyFatigueDays: its POSITIVE effects shrink by 1 / (1 + uses × remedyFatigue) */
  remedyFatigue: number;
  remedyFatigueDays: number;
  /** coalition funds unavailable when budget health is below this ("the treasury is empty") */
  fundsMinFiscal: number;
  leaveChancePerDay: number;
  /** randomStart: each party's leave line moves by up to ± this many points per game */
  leaveFuzz: number;
  threatenResetAbove: number;

  // --- meters ---
  /** approval pulls toward a target computed from street/us/fiscal/trial */
  approvalRegression: number;
  /** approval target drops this much per year as PM (incumbency fatigue) */
  fatiguePerYear: number;
  trialGrowthPerDay: number;
  /** street / US / fiscal pull back toward their norm per day (0.004 ≈ half way in ~6 months) */
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
  /** a promise kept right after it was made is just a deal: the delivery bonus ramps from 25% to 100% over this many days */
  promiseRipenDays: number;
  believeDriftPerDay: number;
  /** security detail move: daily mood bonus for the guarded partner, and for how long */
  guardDriftPerDay: number;
  guardDays: number;
  distrustDriftPerDay: number;

  // --- ministries / invites ---
  ministryGain: number;
  /** "hand out a ministry" when the subject is your own party: a deputy post, this much mood */
  pmPostBoost: number;
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
  /** extra approval / street cost for every postponement after the first one in a game */
  postponeRepeatApproval: number;
  postponeRepeatStreet: number;
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
  pauseOnNews: true,
  uiIdleClockScale: 2.5,
  recessClockMult: 2,
  recessStartMonth: 7,
  recessMonths: 2,
  promiseWarnDays: 14,

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
  loseGainPerApprovalPoint: 0.005,
  groundGameLose: 0.08,
  collapseBelow: 20,
  collapseDays: 90,
  collapseWarnDays: 45,
  premiumCostScale: 0.5,
  electionOddsDays: 180,
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
  pollPanicMaxPerDay: 0.13,
  outcomeNoise: 0.25,
  randomStart: true,
  startMoodSpread: 10,
  startApprovalSpread: 4,
  traitChance: 0.7,
  trumpWalk: 0.08,
  trumpSwingPerDay: 1 / 150,
  trumpUsPull: 4,
  kaplanStreetMaxMult: 2,
  crisisCooldownDays: 60,
  crisisRepeatDecay: 0.75,
  goodNewsCooldownDays: 365,
  recentWarDays: 90,
  midtermsSeasonMult: 15,
  wartimeStayMood: 65,
  pmMinMinistries: 3,
  remedyFatigue: 1.0,
  remedyFatigueDays: 365,
  fundsMinFiscal: 15,
  leaveChancePerDay: 0.02,
  leaveFuzz: 3,
  threatenResetAbove: 35,

  approvalRegression: 0.01,
  fatiguePerYear: 1.0,
  trialGrowthPerDay: 0.03,
  meterRegression: 0.004,
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
  promiseRipenDays: 60,
  believeDriftPerDay: 0.05,
  guardDriftPerDay: 0.04,
  guardDays: 365,
  distrustDriftPerDay: 0.06,

  ministryGain: 12,
  pmPostBoost: 8,
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
  postponeRepeatApproval: 6,
  postponeRepeatStreet: 15,
  primetimeMin: -4,
  primetimeMax: 7,
};
