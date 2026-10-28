# Balance

**Current target** (since Round 3): the human-proxy bot **card-only-hud-aware** reaches the 4-year
term **~40–50%** of the time; dumb bots ≤ 10%; random loses ≥ 90% with a median < 1.5 years.
**Current numbers**: [Round 6](#round-6-2026-10-28-satire-pack-2--summer-recess) (hud-aware 51%, median 4.0 y).
Rounds 1–2 below (targets table, "Before"/"After") are history: they tuned the rollout bots and
predate the opposition period, moves, randomness and recess.

Reproduce: `npm run balance` (defaults: 40 seeds, 20-year cap). Sweep a value without editing code:
`npm run balance -- --only greedy --games 24 --set pollPanicPerPoint=0.014`.

Bots play through the same `Game` API as the UI, deciding every 5 game days. Crisis cards time out
after `eventTimeoutDays` (23) like in text mode. **Rollouts are blind**: a bot's "what if" clone gets
a scrambled RNG stream, so it can't see the real upcoming crises or election rolls (before this, greedy
was effectively an oracle and never lost).

| strategy | what it does |
|---|---|
| never-act | ignores everything |
| random | random available option, random proactive actions |
| always-war | starts wars whenever possible, picks `war` on cards |
| promise-spammer | promises everything to everyone, never delivers |
| greedy | picks the card option with the best immediate score; ministries to the unhappiest partner, cheap promises, delivers before expiry, invites when the majority is thin |
| lookahead | greedy, but scores options by the mean of 4 blind 30-day rollouts; skips snap elections unless the majority is already gone |
| card-only-trial-aware | human proxy: no drawer, no rollouts; picks the option with the best immediate coalition mood + approval − trial, always delivers on angry cards |
| **card-only-hud-aware** | **primary "decent human" target**: like trial-aware but reads every meter (approval, street, fiscal, US, trial, budget) and avoids leaving a partner below 20 |

## Targets (from the brief; rounds 1–2, historical)

| target | result |
|---|---|
| dumb strategies (never-act, random, always-war, promise-spammer) reach the 4-year term ≤ 10% | **0% / 0% / 0% / 0%** |
| random loses ≥ 90%, median survival < 1.5 y | **0% term, median 0.7 y** |
| never-act fails | **0% term, median 1.5 y** |
| greedy reaches the term ~30–60% | **33%** |
| lookahead better than greedy but < 80% | **43%** |
| median for decent play 3–6 y | **3.8 y** (both) |
| re-elections genuinely risky; HaKosem rare | greedy/lookahead **0%** HaKosem; dumb bots 0–20% (they hit snap elections constantly) |

"lost" is 100% everywhere because the run is capped at 20 years with `stopAtTerm: false`: everyone
eventually loses an election. Loss reasons are mostly the voters (election-loss roll), then deadlock
(failed formation); indictment is rare once a player watches the trial meter.

## Before (initial values, 20 seeds)

| strategy | games | 4-year term reached | lost | median years as PM | p25–p75 years | mean elections |
|---|---|---|---|---|---|---|
| never-act | 20 | 50% | 100% | 4.7 | 2.7–6.7 | 9.2 |
| random | 20 | 65% | 90% | 4.9 | 2.5–8.7 | 9.3 |
| always-war | 20 | 70% | 95% | 4.7 | 3.7–6.7 | 9.9 |
| promise-spammer | 20 | 50% | 100% | 4.7 | 3.7–6.7 | 8.8 |
| greedy | 20 | 100% | 0% | 20.0 | 20.0–20.0 | 0.0 |
| lookahead | 20 | 100% | 0% | 20.0 | 20.0–20.0 | 0.0 |

| strategy | titles reached (share of games) |
|---|---|
| never-act | Longer than Lapid 100%, Longer than Bennett 100%, Tov LaYehudim 95%, Rak Bibi 50%, Gush Bibi 35%, Bibi HaMelech 15%, Melech Yisrael 15%, Ben-Gurion Who? 15%, HaKosem 75%, Lo Yihye Klum 20%, Crime Minister 20%, HaMahapach 30% |
| random | Longer than Lapid 100%, Longer than Bennett 100%, Tov LaYehudim 85%, Rak Bibi 65%, Gush Bibi 40%, Bibi HaMelech 30%, Melech Yisrael 20%, Ben-Gurion Who? 10%, Archaeological Site 10%, HaKosem 60%, Mister Bitachon 40%, Lo Yihye Klum 40%, Crime Minister 70%, HaMahapach 60%, Kablan Koalitziot 30% |
| always-war | Longer than Lapid 100%, Longer than Bennett 95%, Tov LaYehudim 90%, Rak Bibi 70%, Gush Bibi 35%, Bibi HaMelech 15%, Melech Yisrael 10%, Ben-Gurion Who? 10%, Archaeological Site 5%, HaKosem 85%, Mister Bitachon 60%, Lo Yihye Klum 50%, Crime Minister 60%, HaMahapach 90% |
| promise-spammer | Longer than Lapid 100%, Longer than Bennett 95%, Tov LaYehudim 85%, Rak Bibi 50%, Gush Bibi 25%, Bibi HaMelech 10%, Melech Yisrael 5%, HaKosem 75%, Lo Yihye Klum 35%, Crime Minister 50%, HaMahapach 85%, Havtachot Bechirot 100% |
| greedy | Longer than Lapid 100%, Longer than Bennett 100%, Tov LaYehudim 100%, Rak Bibi 100%, Gush Bibi 100%, Bibi HaMelech 100%, Melech Yisrael 100%, Ben-Gurion Who? 100%, Archaeological Site 100%, Mister Bitachon 100%, Lo Yihye Klum 100%, Crime Minister 100%, Havtachot Bechirot 10%, Kablan Koalitziot 100% |
| lookahead | Longer than Lapid 100%, Longer than Bennett 100%, Tov LaYehudim 100%, Rak Bibi 100%, Gush Bibi 100%, Bibi HaMelech 100%, Melech Yisrael 100%, Ben-Gurion Who? 100%, Archaeological Site 100%, Mister Bitachon 100%, Lo Yihye Klum 100%, Crime Minister 100%, Kablan Koalitziot 100% |

Every strategy survived for years; greedy and lookahead never lost in 20 years. Doing nothing reached
the term 50% of the time, random 65%.

## After (round 2 values, historical)

Seeds 1..40, cap 20 game years, 582s

| strategy | games | 4-year term reached | lost | median years as PM | p25–p75 years | mean elections | lost to: voters / deadlock / indicted |
|---|---|---|---|---|---|---|---|
| never-act | 40 | 0% | 100% | 1.5 | 0.5–1.5 | 2.0 | 29 / 10 / 1 |
| random | 40 | 0% | 100% | 0.7 | 0.5–1.1 | 2.3 | 30 / 10 / 0 |
| always-war | 40 | 0% | 100% | 0.9 | 0.5–1.0 | 1.6 | 27 / 13 / 0 |
| promise-spammer | 40 | 0% | 100% | 0.6 | 0.4–0.8 | 2.3 | 26 / 14 / 0 |
| greedy | 40 | 33% | 100% | 3.8 | 3.3–4.2 | 1.1 | 31 / 9 / 0 |
| lookahead | 40 | 43% | 100% | 3.8 | 3.6–4.2 | 1.1 | 31 / 9 / 0 |

| strategy | titles reached (share of games) |
|---|---|
| never-act | Longer than Lapid 68%, Longer than Bennett 68%, Tov LaYehudim 13%, HaKosem 8%, Crime Minister 3%, HaMahapach 3% |
| random | Longer than Lapid 78%, Longer than Bennett 28%, Tov LaYehudim 3%, HaKosem 20%, Crime Minister 3% |
| always-war | Longer than Lapid 53%, Longer than Bennett 38%, Crime Minister 3%, HaMahapach 3% |
| promise-spammer | Longer than Lapid 60%, Longer than Bennett 13%, HaKosem 18%, Havtachot Bechirot 35% |
| greedy | Longer than Lapid 100%, Longer than Bennett 100%, Tov LaYehudim 100%, Rak Bibi 33%, Mister Bitachon 85%, Lo Yihye Klum 25%, Crime Minister 70%, HaMahapach 5%, Kablan Koalitziot 100% |
| lookahead | Longer than Lapid 100%, Longer than Bennett 100%, Tov LaYehudim 100%, Rak Bibi 43%, Mister Bitachon 80%, Lo Yihye Klum 50%, Crime Minister 75%, HaMahapach 5%, Kablan Koalitziot 100% |

## What changed and why

Config (`src/config.ts`):

| key | before → after | why |
|---|---|---|
| eventIntervalDays / eventJitterDays | 25 / 10 → 20 / 8 | more decisions per term; idle play must hurt |
| eventTimeoutDays | 45 → 23 (+ urgentTimeoutDays 12) | matches the UI answer budget (15 s × 0.25 clock / 165 ms); ignoring now costs sooner |
| maxFailedElections | 2 → 1 | a failed formation ends the game ("deadlock") instead of a free retry |
| driftPenalty | 0.06 → 0.08 | left–right drift matters more |
| hatePenalty | 0.08 → 0.1 | sitting with an enemy hurts more |
| satRegression / meterRegression | 0.004 → 0.002 | satisfaction/meters drift back to neutral more slowly, so fixes and damage last |
| backfirePressure | 1 → 1.5 | remedies breed follow-up crises more often |
| appetitePerDay (new) | 0.04 | partners always want more; doing nothing drains them |
| appetiteGrowthPerYear (new) | 0.3 | entropy: appetite grows every year in office |
| fatiguePerYear (new) | 1.5 | approval target drops each year (incumbency fatigue) |
| eventSpeedupPerYear (new) | 0.15 | crises come faster the longer you rule |
| clusterChance / clusterDays (new) | 0.15 / 4 | crises sometimes arrive back-to-back |
| loseBase, losePerApprovalPoint, losePerOpenCase, losePerRecentElection, loseMax (new) | 0.1, 0.015, 0.05, 0.1, 0.85 | elections are a gamble: base risk + low approval + open cases + recent elections (`electionFatigueDays` 1461). Without it a snap election was a free reset (HaKosem 60–85% for dumb bots) |
| indictAt (new) | 100 | the trial meter can end the game |
| leaveBelow / leaveChancePerDay (new) | 15 / 0.02 | an unhappy partner may walk out before reaching 0 (rolled once per game day); since Round 5 fuzzed ±`leaveFuzz` (3) per party per game |
| pollPanicBelow / pollPanicPerPoint (new) | 32 / 0.015 | partners get nervous when approval is low. Most sensitive knob: greedy term rate 92% at 0.012, 56% at 0.014, 33% at 0.015, 13% at 0.016, 0% at 0.03 (capped since Round 3 by `pollPanicMaxPerDay` 0.13) |
| remedyFatigue / remedyFatigueDays (new) | 0.6 / 365 | repeating the same remedy within a year gives diminishing positive effects |
| fundsMinFiscal (new) | 15 | "coalition funds" unavailable when the treasury is empty |
| pauseOnDecision, uiIdleClockScale, uiAnswerMs… | UI only | no effect on bots |

Data (`src/data/`):

- `ch14`, `attackad`, `congress`, `cartoonbomb` were free: they now have costs and backfire into
  `court`, `bennett`, `deal`, `iran` respectively.
- `ignore` is no longer one of a card's remedies; it's always a separate option (escalates).
- Remedy lists were filled to 3 per card, with promise-or-do pairs (`promsettle`/`settle`,
  `promexempt`/`exempt`, `promreform`/`reform`, `promceasefire`/`ceasefire`, `promsaudi`/`saudi`,
  `promlebanon`/`lebanon`, `promconstitution`): a promise is cheap now and must be delivered later.
- Good-news events (Eurovision, gas field, …) give small boosts without a card.

Bots (`src/bots/strategies.ts`):

- Blind rollouts (above). `scoreState` also penalises the trial meter above 50 and the election risk,
  as a decent player would.
- Lookahead averages 4 rollouts (one sample of a random future was mostly noise and it scored worse
  than greedy, 3%) and doesn't gamble on snap elections while it still holds a majority (4 samples
  can't price a ~25% loss roll).

## Round 3 (2026-10-28): the human-proxy target

The independent review (`docs/review-2026-10-28.md` in the review worktree) showed that greedy/lookahead
(engine rollouts) are not human proxies: a HUD-reading card-only bot reached the term 98% on the pre-v2
main and **3%** on v2. The target is now **card-only-hud-aware 30–60%**; greedy/lookahead are reported
but no longer tuned for.

What moved it (all in PR #7 + this PR; no knob had to change further):

| change | where |
|---|---|
| Kaplan's low-street multiplier capped at ×2 (was ×4 at street 0) | `kaplanStreetMaxMult` 2 |
| same card not within 60 days; good news not within a year | `crisisCooldownDays` 60, `goodNewsCooldownDays` 365 |
| poll-panic drain per partner capped at 0.13/day (≈ 4/month; was ≈ 9/month at approval 12) | `pollPanicMaxPerDay` 0.13 |
| passed laws stay passed (draft/Route 4/High Court cards stop asking) | `permanent` remedies |
| a lost election sends you to the opposition first (second loss = game over) | `maxElectionLosses` 2 (moves PR) |

### Before / after (40 seeds, 20-year cap)

| strategy | v2 (review) term / median y | now term / median y | lost to voters / deadlock / indicted (now) |
|---|---|---|---|
| never-act | 0% / 1.5 | 0% / 1.7 | 27 / 5 / 8 |
| random | 0% / 0.7 | 0% / 1.3 | 34 / 5 / 1 |
| always-war | 0% / 0.9 | 0% / 1.1 | 18 / 6 / 16 |
| promise-spammer | 0% / 0.6 | 0% / 1.2 | 27 / 7 / 6 |
| card-only-trial-aware | 0% / 1.5 | 13% / 2.9 | 34 / 6 / 0 |
| **card-only-hud-aware** | **3% / 2.8** | **45% / 3.9** | 36 / 4 / 0 |
| greedy (rollouts) | 33% / 3.8 | 98% / 5.3 | 30 / 2 / 8 |
| lookahead (rollouts) | 43% / 3.8 | not run in Round 3 (lost in a restart); Round 6: 80% / 4.3 | |

Random's median rose 0.7 → 1.3 y because a lost election is no longer the end (opposition period);
it still never reaches the term and loses every game.

### Sensitivity (card-only bots, 30 seeds × 8 years; ±8 pp is noise)

| change from current | hud-aware term / median y | trial-aware term / median y |
|---|---|---|
| current | 47% / 4.0 | 17% / 2.9 |
| `pollPanicMaxPerDay` 0.08 | 93% / 4.3 | 33% / 3.5 |
| `pollPanicMaxPerDay` 0.11 | 63% / 4.3 | 23% / 3.1 |
| `pollPanicMaxPerDay` 0.15 | 37% / 3.8 | 3% / 2.8 |
| `pollPanicBelow` 30 (from 32) | 53% / 4.1 | 27% / 3.1 |
| `pollPanicBelow` 28 | 80% / 4.3 | 33% / 3.4 |
| `meterRegression` 0.003 (from 0.002) | 67% / 4.3 | 20% / 3.3 |
| `meterRegression` 0.004 | 70% / 4.3 | 40% / 3.8 |
| `crisisCooldownDays` 30 | 57% / 4.2 | 17% / 3.2 |
| `kaplanStreetMaxMult` 3 | 60% / 4.5 | 30% / 3.5 |

No single step of a knob jumps more than ~25 pp. The panic cap is the most sensitive lever (0.11–0.15
spans 63% → 37%), so it sits in the middle of that range. The reviewer's suggested
`meterRegression` 0.004–0.005 + `pollPanicBelow` 28–30 overshoots now that the cap/cooldowns are in
(70–80%), so those stay at 0.002 / 32.

The rollout bots are far above the old 30–60% band (greedy 98%): with the opposition second chance and
the drawer moves they play an engine-perfect game no human can (they clone the state and simulate
each option). They are kept as an upper bound and a regression alarm, not as a tuning target.

## Round 4 (2026-10-28): random factors

Risky remedies (odds shown on the card), ±25% outcome noise, random starts (moods ±10, approval ±4,
leader traits, 1–2 starting conditions), wildcard news, Trump mood random walk, exit poll.
First pass took the human proxy from 45% to 25% (pardon failing 40% → indictments; bad wildcards
outweighed good ones). Softened: pardon odds 60% → 75%, bad wildcard weights 1.04 → 0.73 total,
"trial resumes" start +8 → +5.

| strategy (40 seeds × 20y) | term | median y (p25–p75) | lost to voters / deadlock / indicted |
|---|---|---|---|
| never-act | 0% | 1.5 (1.3–1.7) | 22 / 6 / 12 |
| random | 0% | 1.2 (1.0–1.8) | 37 / 1 / 2 |
| always-war | 0% | 1.2 (0.9–1.5) | 17 / 2 / 21 |
| promise-spammer | 0% | 1.0 (0.6–1.3) | 29 / 6 / 5 |
| card-only-trial-aware | 13% | 3.0 (2.4–3.3) | 30 / 10 / 0 |
| **card-only-hud-aware** | **53%** | 4.2 (3.5–4.8) | 31 / 4 / 5 |
| hud-aware with `outcomeNoise=0, randomStart=false` | 63% | 4.2 (3.5–4.5) | 30 / 5 / 5 |

Randomness costs a careful player ~10 pp; the run-to-run spread (p25–p75) widens slightly.

## Round 5 (2026-10-28): exploit fixes

- **Forever war vs elections.** Postponing elections was already once per term (and needs a war and
  elections within a year), so a war loop cannot dodge elections indefinitely: the term ends at most
  365 days late. Two holes closed: the postponement's street −20 was muted by the very war it needs
  (`streetInWar` now lets it land), and every repeat in a later term costs extra
  (`postponeRepeatApproval` 6, `postponeRepeatStreet` 15 per repeat).
- **Promise of a constitution** was nearly free (haredi −5, far right −2, no backfire). Now haredi −8,
  far right −3 and it raises Shabbat-crisis pressure (visible backfire chip).
- **Fuzzy leave line.** With `randomStart`, each partner's leave threshold moves by up to ±`leaveFuzz` (3)
  points per game, so hovering exactly above 15 is no longer safe.

The new random draw shifts every seed's stream, so the 40-game numbers moved by noise alone
(hud-aware 30–45% across reruns); this round uses 80 seeds.

| strategy (80 seeds × 20y) | term | median y (p25–p75) | lost to voters / deadlock / indicted |
|---|---|---|---|
| never-act | 0% | 1.5 (1.2–1.7) | 42 / 12 / 26 |
| random | 0% | 1.2 (0.9–1.5) | 72 / 6 / 2 |
| always-war | 0% | 1.1 (0.7–1.4) | 36 / 11 / 33 |
| promise-spammer | 0% | 1.0 (0.7–1.2) | 51 / 13 / 16 |
| card-only-trial-aware | 20% | 3.0 (2.4–3.7) | 60 / 15 / 5 |
| **card-only-hud-aware** | **41%** | 3.9 (3.2–4.3) | 61 / 9 / 10 |

Constitution-promise sensitivity (hud-aware, 80 seeds): haredi −10 / far right −5 / approval −1 → 38%;
the shipped −8 / −3 → 41%. `leaveFuzz` 0 / 3 / 4 at 40 seeds: 38% / 45% / 30% (inside the noise).

## Round 6 (2026-10-28): satire pack 2 + summer recess

PR #16 adds 7 cards and 3 moves (blame the AG, the "life itself" speech, a security detail); PR #17
adds the Knesset summer recess (1 Aug – 30 Sep: regular crisis cards pause, wildcards and angry
promise reminders don't). Measured on F+H+I combined (= current `main`), 80 seeds × 20 years:

| strategy (80 seeds × 20y) | term | median y (p25–p75) | lost to voters / deadlock / indicted |
|---|---|---|---|
| never-act | 0% | 1.6 (1.3–2.2) | 50 / 9 / 21 |
| random | 0% | 1.2 (0.8–1.6) | 64 / 15 / 1 |
| always-war | 0% | 1.3 (0.9–1.5) | 32 / 17 / 31 |
| promise-spammer | 0% | 1.1 (0.7–1.3) | 61 / 13 / 6 |
| card-only-trial-aware | 26% | 3.3 (2.9–4.0) | 58 / 15 / 7 |
| **card-only-hud-aware** | **51%** | 4.0 (3.5–4.3) | 49 / 16 / 15 |

Step by step (hud-aware, 80 seeds): Round 5 (F) 41% → + satire pack (F+H) 38% (noise) → + recess
(F+H+I) 51%. Two crisis-free months a year make the game easier, as expected; the result sits at the
top of the 40–50% band. If it should be lower, `recessMonths: 1` is the obvious knob.

Rollout bots (upper bound only, not tuned for; 40 seeds × 20y):

| strategy | term | median y (p25–p75) | lost to voters / deadlock / indicted |
|---|---|---|---|
| greedy | 68% | 4.3 (3.6–4.9) | 15 / 1 / 24 |
| lookahead | 80% | 4.3 (4.3–5.3) | 26 / 2 / 12 |

(Run time ≈ 20 min for both; lookahead ≈ 16 s per game. Greedy fell from 98% in Round 3: risky
remedies and outcome noise hurt a bot that trusts its one-step score; it now often ignores the trial
meter until indictment.)

## Round 7 (2026-10-28): playtest fixes

A fresh playtest (6/10) found an invisible slide under the panic line, a few always-right picks and
heavy repetition. PR #19 changes, in balance terms:

- Easier: `fatiguePerYear` 1.5 → 1.0 (the late-game approval target no longer sinks under
  `pollPanicBelow` 32 by itself); `crisisRepeatDecay` 0.75 (each repeat of a card makes it 25% less
  likely); "You're a leftist!" needs the far right below 60 mood; own-party "hand out a ministry"
  now gives +`pmPostBoost` 8 instead of nothing.
- Harder: Beepers once per game (like Fordow); `remedyFatigue` 0.6 → 1.0 (third use of a remedy
  keeps 33% of its effect instead of 45%); the DC trip is a travel move, so it is blocked by an ICC
  warrant; two mild recess bad-news cards (junket, beach selfie).
- New card-specific answers: own poll (polls collapse, risky), reservists bill and meeting the pilots
  (reservists' letter), sanction the ICC (ICC warrant).

| strategy (80 seeds × 20y) | term | median y (p25–p75) | lost to voters / deadlock / indicted |
|---|---|---|---|
| never-act | 0% | 1.6 (1.2–2.2) | 56 / 11 / 13 |
| random | 0% | 1.3 (0.8–1.8) | 64 / 12 / 4 |
| always-war | 0% | 1.2 (1.0–1.5) | 42 / 14 / 24 |
| promise-spammer | 0% | 1.0 (0.7–1.3) | 65 / 9 / 6 |
| card-only-trial-aware | 20% | 3.1 (2.7–3.9) | 57 / 16 / 7 |
| **card-only-hud-aware** | **43%** | 3.8 (3.2–4.3) | 64 / 6 / 10 |

The easier and harder changes roughly cancel: hud-aware 51% → 43%, inside the 40–50% band, with no
further tuning. Random stays at 0% (median 1.3y). Rollout bots were not rerun.

## Round 8 (2026-10-28): late game

PR #22 targets the spikes and the dice of the playtest review (problems 4–5):

- `premiumCostScale` 0.5: a premium delivery pays the premium (budget −8, approval −2) plus half the
  delivered remedy's costs. The total bill is a chip on the card.
- `collapseBelow` 20 / `collapseDays` 90 / `collapseWarnDays` 45: a poll collapse ends in elections.
- `loseGainPerApprovalPoint` 0.005: approval above `approvalNeutral` lowers the voters' verdict (before:
  only approval below it counted). `groundGameLose` 0.08 for the ground-game lever; the election-year
  budget is approval +5, street +3, budget −15. Both only within `electionOddsDays` 180 of the vote.
- A trial pause blocks positive trial effects, not only the daily drift (the drift was already paused).
- Three opposition cards; the card-only bots now answer them (whatever lowers the rival's stability
  without costing approval). Before, the opposition had no cards at all.

| strategy (80 seeds × 20y) | term | median y (p25–p75) | lost to voters / deadlock / indicted |
|---|---|---|---|
| never-act | 0% | 1.6 (1.2–2.1) | 47 / 16 / 17 |
| random | 0% | 1.3 (0.9–1.7) | 70 / 8 / 2 |
| always-war | 0% | 1.2 (0.9–1.5) | 44 / 11 / 25 |
| promise-spammer | 0% | 1.0 (0.7–1.2) | 61 / 10 / 9 |
| card-only-trial-aware | 11% | 2.9 (2.5–3.5) | 60 / 19 / 1 |
| **card-only-hud-aware** | **46%** | 3.9 (3.3–4.3) | 72 / 7 / 1 |

hud-aware 43% → 46%, inside the band, with no extra tuning. Indictments almost vanish for the card
bots (15 → 1 for hud-aware), because pausing the trial now actually stops it. Losses move to the voters.
Trial-aware falls (20% → 11%) since its trial-only scoring no longer needs to fight the pause.
The card bots never use moves, so the two election levers are not measured here; they can only help.
