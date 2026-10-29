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
