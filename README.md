# Bibi: Coalition Juggler (bibigame)

A satirical real-time browser game about Israeli coalition politics. You play the PM and must keep a
coalition of **61+ of 120** Knesset seats alive for **4 years** (and then keep going for titles).
Crises fire every few seconds, each with remedies that backfire into other crises. Fall below 61 and
you get re-elections with realistic noise around the base seat distribution.

Satire. Party names are factual placeholders; no quotes are attributed to real people.

**Play:** https://komapc.github.io/bibigame/ (GitHub Pages, deployed from `main`).
Add `?daily` for **Today's Knesset** (the same game for everyone today; `?daily=YYYY-MM-DD` for a
given date), `?seed=N` for a fixed seed, `?lang=en|ru|he` for the language.

## Features

- **Swipe cards**: left / right / up = up to three remedies, down = early elections, a separate
  **Ignore** tap. Effect chips on each option; risky remedies show their odds; greyed options say why.
- **Intro screen** on the first visit (five lines on how to play, a big Start, EN/RU/HE switch); the
  ? button reopens it. Only one layer is open at a time (intro, the sheet or game over), plus at most
  one small toast.
- **Cause → result**: a single result line above the card after every decision ("Shas −8 · Approval
  +2 · Seats 63", with the cause and a quip), drift lines explaining slow changes, a timeline (budget,
  elections, war, promises, recess, next title).
- **Randomness**: random start (moods, approval, 1–2 starting conditions), party-leader traits
  (patient / hothead / greedy / loyal / opportunist), ±25% outcome noise, risky remedies that can
  fail, wildcard news (good and bad), a Trump-mood random walk (😠…😍 next to the US meter), exit polls.
- **Bottom tabs**: 🎲 Moves / 🤝 Parties / 📜 Log, three tabs of one sheet (the timeline opens the Log).
  Between cards, The Daily Coalition offers quick Promise / Reshuffle / Pass a law / Start a war buttons.
- **Moves** (🎲), **opposition** period after a lost election, **rotation** promises, special
  **endings** (Miami, plea bargain, rotation handover) and 22 titles.
- **Late game**: in the last 180 days of a term the election odds and their factors (approval, open
  cases, recent elections, tricks) are shown, with two levers (election-year budget, ground game).
  Approval under 20 for 90 days makes the partners bolt (warned at 45 days). The opposition has its own
  cards (a scandal in the government, a wavering MK, a protest) that bring the rival government down.
- **Knesset summer recess** (Aug–Sep): regular crises pause (wildcards still happen), the clock runs
  faster, shown on the timeline.
- **Spin-doctor tips**: rule-based hints shown inline under the card (no popup, no repeats for a
  while). **Friday edition**: every 3 game months a newspaper recap of what moved and why, filed in the
  Log tab with a small toast (the clock keeps running).
- **Share** on game over: WhatsApp first, the system share sheet when available, or copy; a short
  summary in the current language (reign, wars, title, ending, link; the date in daily mode).
- **Sound and haptics**: WebAudio effects (siren, drum, applause, cash register) and vibration; sound
  is **off by default** (🔇 toggle, remembered); respects reduced motion.
- **Analytics with consent**: GA4 (`src/ui/analytics.ts`) loads only after the visitor accepts the
  banner (`localStorage['bibigame-consent']`). Events carry ids and numbers only (game_start,
  card_shown, choice, game_over, title_earned, quit_on_card, share) — never free text or personal data.
- **Languages**: en / ru / he (RTL).
- **Bots**: the same engine is playable from TypeScript, over HTTP, or in a text mode for LLM agents.

## Run

```sh
npm install
npm run dev        # Vite dev server (browser game)
npm test           # vitest
npm run build      # static build in dist/ (tsc + vite), Cloudflare-Pages-ready, base './'
npm run server     # bot HTTP API on :8787 (PORT=... to change)
npm run text -- --seed 42 [--log run.jsonl] [--realtime]   # text mode for humans / LLM agents
npm run balance -- [--games 40] [--years 20] [--only greedy,random]
```

Node ≥ 22.18 (runs `.ts` directly via type stripping; no build step for server/CLI).

## Layout

```
src/config.ts            ALL tuning constants (rates, cooldowns, timings)
src/data/knesset.json    parties + ministries (25th Knesset placeholder — swap for Oct 2026 results; seats must sum to 120)
src/data/crises.ts       crisis → remedy → backfire graph (37 card crises, 15 no-card news/wildcards, 60 remedies, 6 start conditions)
src/data/moves.ts        moves (the 🎲 Moves tab) (each reuses the remedy with the same id)
src/data/promises.ts     promises and what delivers them
src/data/titles.ts       tenure + achievement titles (thresholds)
src/i18n/en.ts           every user-facing string (add he.ts / ru.ts with the same keys)
src/engine/              pure, seeded engine: game.ts (tick/actions), coalition.ts, elections.ts, rng.ts, types.ts
src/api/game.ts          public API: createGame / observe / act / advance
src/api/text.ts          text protocol: renderer + command parser (shared by CLI and HTTP)
src/api/extras.ts        advisor hints + Friday edition (pure)
src/api/share.ts         share text, wa.me link, daily seed (pure)
src/bots/                bot strategies + headless runner
src/ui/                  DOM layer (mobile-first), hemicycle SVG, swipe, fx.ts (sound/haptics), analytics.ts (GA4 + consent)
src/cli/text.ts          text-mode CLI
server/server.ts         zero-dependency HTTP JSON API
bots/http-random-bot.ts  example bot over HTTP
scripts/balance.ts       balance harness (docs/balance.md)
tests/                   vitest
```

## Mechanics (short)

- **Time**: engine runs in game days; the UI maps `msPerDay` (≈5 s per game month). With
  `pauseOnDecision` (default) the clock **stops while a crisis card is open** and runs
  `uiIdleClockScale`× faster between events; the calm screen is a newspaper headline/ticker.
- **Left–right**: the government has a position (−10..+10). Each partner has a position and a tolerance;
  outside it, satisfaction drains. Below `leaveBelow` (15, fuzzed ±`leaveFuzz` 3 per party per game) a
  partner may walk out (daily roll); at 0 it quits; below 61 → elections. Partners' appetite grows
  every year in office.
- **Ministries**: fixed list; giving one to a party takes it from another (who gets angry). Partners
  also compare their ministries with their fair share by seats.
- **Crises**: every ~20 game days, faster each year, sometimes in clusters; the same card not within
  60 days (good news: a year). Card = up to 3 remedies
  (swipe left/right/up) + early elections (down), plus a separate **Ignore** tap (Space / `0`;
  not on urgent cards). Ignoring escalates. Timeouts (`eventTimeoutDays`/`urgentTimeoutDays`) apply to
  bots/text mode; the UI shows an answer budget instead. Many remedies come as a pair:
  **promise** it (cheap now, must be delivered later) or **do** it (costly now).
  Repeating a remedy within a year is less effective (`remedyFatigue`); `funds` is unavailable when the
  fiscal meter is low. Each remedy raises the probability of the crises it backfires into.
- **Feedback**: every choice/timeout/walkout is an *outcome* record (cause → party/meter deltas, seats,
  quip, party reaction) shown as the result line in the UI and a `RESULT:` / `DRIFT:` block in text mode.
  Party cards show the trend per month with its reason, "may leave" and "without X: N seats".
- **War** (emergency button, needs tension): parties flagged `joinsWartime` join temporarily; approval
  rally, budget cost, cooldown.
- **Risky remedies**: beepers 80%, Fordow 75%, attack ad 70%, pardon 75%, Washington trip 75%,
  poach 70%; a miss applies the remedy's `fail` effect. All other outcomes vary ±`outcomeNoise` (25%).
- **Summer recess**: 1 Aug – 30 Sep (`recessStartMonth` 7, `recessMonths` 2; 0 = off), governing only:
  regular crisis cards stop, wildcards and angry promise reminders don't; UI clock ×`recessClockMult` (2).
- **Promises**: promise a party something → it believes you for 3 months (+satisfaction). Deliver
  (`deliver` action, or the matching *do* remedy) or it distrusts you for 6 months.
- **Budget**: must pass by 31 March each year, else automatic elections.
- **Elections**: first a loss roll (`loseChance`: base + low approval + open cases + recent elections;
  shown as a risk % during the campaign), then noise around base seats, 4-seat threshold, largest
  remainder, automatic formation. Game over reasons: `voters`, `deadlock` (failed formation),
  `indicted` (trial meter reaches `indictAt`); poll panic accelerates partner drain at low approval.
- **Moves** (`src/data/moves.ts`, the 🎲 Moves tab): actions that reuse the remedy with the
  same id (effects, fatigue, quips). Governing: poach an MK, new ministry, exile a rival to the UN,
  20:00 statement, Trump-for-Nobel (once), cottage-cheese VAT, Wing of Zion (once), blame the Attorney
  General, the "life itself" speech (pivot to Iran: a domestic card on the table drops out of the
  headlines), a security detail for the unhappiest partner's family (+mood for a year), postpone
  elections (only at war, elections < 1 year away, once per term; each repeat in a game costs more). Campaign (once per election): far-right merger, fund a spoiler
  (may be exposed → new case), "Gevalt!". Laws: Norwegian law, close Army Radio. Promise a **rotation**
  for a big trust boost: when the date comes, hand over (ending) or break it (lasting distrust).
- **Opposition**: losing an election (voters or deadlock) sends you to the opposition: the rival
  government has a stability meter (attack it, poach MKs, no-confidence vote); when it falls you get
  another election. Losing `maxElectionLosses` (2) elections ends the game.
- **Endings**: besides losing — *moved to Miami*, *plea bargain* (moral turpitude; needs a trial ≥ 40)
  and *rotation handover*, each with its own title.
- **Win**: 4 years total as PM (config `restartTermOnElection`, `stopAtTerm`). Titles beyond that.
- **Languages**: en / ru / he (RTL) — `src/i18n/`; picker in the header, `?lang=he`, auto-detect from
  the browser. Text mode `--lang ru`, HTTP `lang` field / `?lang=`. Command keywords stay English.

## Bot API

### Programmatic (TS/JS)

```ts
import { createGame } from './src/api/game.ts';
const game = createGame({ seed: 42 });
let o = game.observe();          // seats, parties, satisfaction, trust, ministries, event + options, cooldowns, titles…
game.act({ type: 'choose', optionId: 'settle' });
game.act({ type: 'giveMinistry', ministryId: 'finance', partyId: 'shas' });
game.act({ type: 'promise', partyId: 'yb', promiseId: 'constitution' });
game.act({ type: 'deliver', partyId: 'yb', promiseId: 'constitution' });
game.act({ type: 'passLaw', lawId: 'reform' });
game.act({ type: 'invite', partyId: 'natunity' });
game.act({ type: 'startWar' });
o = game.advanceDays(10);        // or game.advance(ms) using config.msPerDay
```

Deterministic: same seed + same action sequence → same game. In the browser, `window.bibigame`
exposes the live game (`.game`, `.observe()`, `.act()`, `.pause()`, `.restart()`).

### HTTP

```sh
npm run server
curl -s -X POST localhost:8787/games -d '{"seed":42}'                       # -> {"id":"ab12cd34", "state":{...}}
curl -s localhost:8787/games/ab12cd34/state
curl -s -X POST localhost:8787/games/ab12cd34/action -d '{"type":"choose","optionId":"ignore"}'
curl -s -X POST localhost:8787/games/ab12cd34/advance -d '{"days":30}'
curl -s -X POST localhost:8787/games/ab12cd34/text -H 'content-type: text/plain' -d 'promise liberman constitution'
curl -s localhost:8787/games/ab12cd34/titles
```

`GET /` lists all routes. Example bot: `npm run bot:http -- http://localhost:8787 42`.

### Text mode (LLM agents)

`npm run text -- --seed 42 [--lang ru] --log transcript.jsonl` prints a compact state block and reads one
command per line. Turn-based by default: time moves **only** on `wait`, so thinking time is free.
`--log` writes `{seed, day, state, command, ok, reply}` JSONL. The same protocol is at `POST /games/:id/text`.

```
<n>                          choose option n of the current crisis (0 / ignore = ignore it)
choose <option>              choose by id (e.g. choose settle)
promise <party> <promise>    e.g. promise liberman constitution
deliver <party> <promise>    actually do it (uses the law cooldown)
ministry <party> from <party>   give one of <from>'s ministries to <party>
ministry <party> <ministry>  e.g. ministry shas finance
invite <party>
law <law>                    exempt | reform | constitution | settlelaw
war
move <id>                    a move, e.g. move primetime (list under MOVES:)
wait [N|Nd|Nm]               let time pass; stops early when a crisis fires (default: up to 30d)
look | help
```

Parties can be named by id, short code, name, or leader alias (e.g. `liberman`, `gantz`, `deri`).

## Balance

Target: the human-proxy bot **card-only-hud-aware** (cards only, reads the HUD, no simulation) reaches
the 4-year term **~40–50%** of the time; dumb bots ≤ 10%; random loses ≥ 90% with a median < 1.5 years.
Current (80 seeds × 20 years, Round 6): hud-aware **51%** (median 4.0 y), trial-aware 26%, never-act /
random / always-war / promise-spammer **0%** (random median 1.2 y). The rollout bots (greedy, lookahead)
simulate the engine and are an upper bound only. Details and history: [docs/balance.md](docs/balance.md);
reproduce with `npm run balance`.

## Contributing

- `main` is protected by a local hook: **no direct pushes**. Work on a branch, open a PR; CI (`npm test`,
  build) must be green; PRs are merged with a merge commit (not squash). Every merge to `main` deploys
  to GitHub Pages.
- Tuning lives in `src/config.ts` only; content in `src/data/`; every user-facing string goes into
  `src/i18n/en.ts` (ru/he are synced separately).
- Satire rule: describe events; never fabricate direct quotes of real people.
- See [CHANGELOG.md](CHANGELOG.md) for the PR history.
