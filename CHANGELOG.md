# Changelog

All changes land through pull requests on `main` (merge commits). Dates are merge dates (2026-10-28 for all of the below).
ru/he follow-ups are listed with the PR whose strings they translate.

## Initial commits (before #1)
- Pure seeded engine, the crisis → remedy → backfire graph, the bot API (TS + HTTP) and the text protocol for LLM agents.
- Mobile-first UI: hemicycle, swipe cards, effect previews, timeline, angry promise reminders, scheduled elections, Moves drawer.
- Balance harness.

## #1 Cause → result feedback
- An outcome record for every choice, timeout and walkout, shown as a result flash in the UI and as a `RESULT:` block in text mode.
- Ignore is always on as its own tap.
- Headline ticker on the calm screen.

## #2 Russian and Hebrew
- ru and he (RTL) translations.
- Language picker, `?lang=` and browser auto-detect.

## #3 (closed, superseded by #4)

## #4 Balance pass and i18n polish
- First balance round: idle play must hurt, and elections become a gamble.
- Election-loss roll, indictment, poll panic, remedy fatigue.
- `docs/balance.md`.

## #5 Drawer moves, opposition, rotation, endings
- Drawer moves: poach, new ministry, UN exile, 20:00 statement, Nobel, cottage cheese, Wing of Zion, postpone elections.
- Campaign tricks.
- An opposition period after a lost election.
- Rotation promises.
- Miami and plea-bargain endings.
- #6 translates them to ru/he.

## #7 Review fixes
- Ministry allocation.
- One angry card per promise.
- Passed laws stay passed.
- Card cooldowns.
- Lost-election seat shift.
- Election count.

## #8 Balance round 3 and clarity
- Human-proxy bots `card-only-trial-aware` and `card-only-hud-aware` become the tuning target.
- Effect chips, "why unavailable" reasons, drift lines.
- #9 translates them to ru/he.

## #10 Random factors
- Risky remedies with shown odds, ±25% outcome noise.
- Random starts with starting conditions, party-leader traits.
- Wildcard good and bad news, a Trump-mood random walk, exit polls.
- #11 translates them to ru/he.

## #12 Advisor, Friday edition, sound, analytics
- Spin-doctor advisor (tutorial hints).
- Quarterly Friday-edition newspaper recap.
- WebAudio sound (off by default) and haptics.
- GA4 analytics behind a consent banner.

## #13 GA4 enabled
- Measurement ID `G-5X17LS4GDR`.

## #14 Share and Today's Knesset
- Game-over share: WhatsApp, native share, copy.
- `?daily` / `?daily=YYYY-MM-DD` seed, and `?seed=N` is honoured.
- `share` analytics event.

## #15 Exploit fixes
- Postponing elections: the street hit now lands even during the war it requires, and repeats cost more.
- The constitution promise costs more and backfires.
- Fuzzy per-party leave line.
- Balance round 5.

## #16 Satire pack 2
- 7 cards: loyalty spreadsheet, prison pita, submarines, ice-cream budget, Miami podcast, London protesters, the President's silence.
- 3 moves: blame the AG, the "life itself" speech, security detail.
- 6 quip variants for the most frequent remedies.

## #17 Knesset summer recess
- Aug–Sep: regular crises pause, the clock runs faster, and the recess is shown on the timeline.
- Balance round 6.

## #18 Docs
- README, this changelog, balance round 6 with rollout bots.

## #19 Playtest fixes
- The approval target ("polls drifting toward X") is shown in the HUD, in text mode and in the log when it crosses the panic line. Slower late-game fatigue.
- Fewer obvious picks: Beepers once per game, harsher remedy fatigue, and new card-specific answers for polls collapse, the reservists' letter and the ICC warrant.
- Less repetition: "You're a leftist!" only when the far right is unhappy, repeat cards get rarer, and text variants for the Trump post, Iran and others.
- Fixes: "hand out a ministry" on own-party cards does something; what a card does on arrival is shown on the card, not blamed on drift; the rogue backbencher counts real seats; the ICC warrant blocks the DC trip; the campaign risk counts tricks already applied; text-mode `wait` no longer auto-refuses an open card (`wait!` does).
- Two mild bad-news cards during the summer recess.
- Balance round 7.
- ru/he follow-up: playtest keys; the rogue backbencher's seat count is plural-aware.

## #20 Simpler UI
- Intro screen on the first visit (five lines, big Start, EN/RU/HE switch, slim consent bar); the ? button reopens it.
- One layer at a time (intro / sheet / game over) plus one queued toast.
- The result popup becomes a single result line above the card.
- Advisor popup → inline tip under the card; tutorial hints dropped (the intro covers them).
- Friday edition popup → filed in the Log tab with a small toast.
- Bottom bar: Moves / Parties / Log tabs of one sheet; the timeline opens the Log tab.

## #21 UI follow-up
- The Daily Coalition screen drops its Moves button (the bottom bar already has it).
- The floating approval delta rises inside its own box and is cleared on animation end; it no longer lingers over the mute button.
- README describes the new UI.

## #22 Text mode intro
- Text mode prints the five intro lines at the start and in `help`.

## #23 Late game: fewer spikes, less dice
- "Deliver now (at a premium)" shows its whole bill on the card, and the delivered remedy costs half (the premium is the bill).
- Approval under 20 for 90 days: the partners bolt and force elections; a warning (log + advisor tip) comes at 45 days.
- Election odds: in the last 180 days of a term (and in the campaign) the voters' verdict is shown with its factors. High approval now lowers it too. Two levers in the last months: an election-year budget and a ground game.
- A paused trial is frozen: no drift and no new charges until the pause ends; the pause is shown.
- Opposition cards (scandal in the government, a wavering MK, a protest) chip at the rival government; no early elections from the opposition.
- Balance round 8.

## #24 Calmer main screen + blind-playtest fixes
- Header: one compact row (date, ⚖ trial x/100 once the trial runs, ? / sound / pause), seats and approval in big numbers, a thin seat bar and timeline, and one status line: the next event, or a single tappable warning ("⚠ RZ may leave → 56 seats" opens Parties).
- Removed: the party chip row, the separate warnings line, the title badge (current and next title are now in the Log tab) and the spin-doctor tips (`advice()` stays for bots and text mode).
- The card fills the remaining height. Nothing overflows the screen width any more (toasts, options and lines wrap).
- Trial chips read "Trial slower" / "Trial faster". In opposition the header shows the rival government's stability, and The Daily Coalition says "What now?" with the opposition moves.
- The clock stops while the sheet is open. Unavailable options shake and say why. Invite reports who joined or why they refused. A promise needs a confirm step that shows the boost and the due date. No text selection in the game area.
- API: read-only `Preview.meter` (`'trial'`).

## #25 Spent options leave the card
- A one-shot option that is already used (time already bought for this promise, once-per-game remedies) is no longer shown greyed out; its slot stays empty. Buy-time texts drop "works once".

## #26 Hebrew phrase review
- Reviewed Hebrew texts for intro, crises and remedies; EN/RU follow. Most card punch lines are gone, so cards are shorter.
- The angry reminder names the broken promise: per-promise texts (`crisis.<id>.text.<promise>`, 3 variants each), `{promise}` placeholder.

## #27 Fewer filler cards
- Removed the Eurovision, Shabbat-elevator, recess-junket and beach-selfie news, and the extra Trump card texts.

## #28 Rewritten rogue-MK, polls and defence-minister cards
- New texts for the rogue backbencher and the defence minister on live TV; the polls card keeps only its "party that does not exist yet" text.

## #29 Two options per card
- Every crisis card has exactly two remedies, ← and → (for example, the angry card offers "deliver at a premium" and "refuse"). Vertical swipes and ↑/↓ keys do nothing.
- Under the card: **Ignore**, and **💥 Start a war** when a war can start (governing, tension, no war, no cooldown).
- Early elections moved from the swipe down to a drawer move (`move elections`).
- "Buy time" removed (option, config `buyTimeDays`, strings).
- "VAT off cottage cheese" is no longer offered on cards; it stays as a move with its cooldown.
- **Breaking for bots / text protocol**: options have `dir` left / right / ignore only; `up`, `down`, `3`, `4` are gone; `choose elections` → `move elections`.

## #30 Plain wording
- Card titles say what happened (e.g. "High Court strikes back" → "High Court strikes down a law", "Iran fires" → "Missile barrage from Iran"), in EN/RU/HE.
- Option labels are plain actions ("Judicial reform, part N" → "Pass a law limiting the court", "Coalition funds" → "Give them coalition funds").
- The punch line is gone from the Trump card.

## #31 News screen waits for Next
- After a card the clock stops on the news screen until the player taps **Next ▶** (or Space / Enter); moves can be made meanwhile. Config `pauseOnNews` (default on).
## #32 Reshuffle: two ready-made options
- The ministries panel shows two ready-made reshuffles (the unhappiest partners each get a ministry from whoever holds the most above their fair share) instead of a dropdown per ministry. `observe().reshuffles`; `giveMinistry` is unchanged for bots and text mode.
