# Bibi: Coalition Juggler (bibigame)

A satirical real-time browser game about Israeli coalition politics. You play the PM and must keep a
coalition of **61+ of 120** Knesset seats alive for **4 years** (and then keep going for titles).
Crises fire every few seconds, each with remedies that backfire into other crises. Fall below 61 and
you get re-elections with realistic noise around the base seat distribution.

Satire. Party names are factual placeholders; no quotes are attributed to real people.

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
src/data/crises.ts       crisis → remedy → backfire graph (28 crises × 27 remedies)
src/data/promises.ts     promises and what delivers them
src/data/titles.ts       tenure + achievement titles (thresholds)
src/i18n/en.ts           every user-facing string (add he.ts / ru.ts with the same keys)
src/engine/              pure, seeded engine: game.ts (tick/actions), coalition.ts, elections.ts, rng.ts, types.ts
src/api/game.ts          public API: createGame / observe / act / advance
src/api/text.ts          text protocol: renderer + command parser (shared by CLI and HTTP)
src/bots/                bot strategies + headless runner
src/ui/                  DOM layer (mobile-first), hemicycle SVG
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
  outside it, satisfaction drains. Below `leaveBelow` a partner may walk out (daily roll); at 0 it quits;
  below 61 → elections. Partners' appetite grows every year in office.
- **Ministries**: fixed list; giving one to a party takes it from another (who gets angry). Partners
  also compare their ministries with their fair share by seats.
- **Crises**: every ~20 game days, faster each year, sometimes in clusters. Card = up to 3 remedies
  (swipe left/right/up) + early elections (down), plus a separate **Ignore** tap (Space / `0`;
  not on urgent cards). Ignoring escalates. Timeouts (`eventTimeoutDays`/`urgentTimeoutDays`) apply to
  bots/text mode; the UI shows an answer budget instead. Many remedies come as a pair:
  **promise** it (cheap now, must be delivered later) or **do** it (costly now).
  Repeating a remedy within a year is less effective (`remedyFatigue`); `funds` is unavailable when the
  fiscal meter is low. Each remedy raises the probability of the crises it backfires into.
- **Feedback**: every choice/timeout/walkout is an *outcome* record (cause → party/meter deltas, seats,
  quip, party reaction) shown as a result flash in the UI and a `RESULT:` / `DRIFT:` block in text mode.
  Party cards show the trend per month with its reason, "may leave" and "without X: N seats".
- **War** (emergency button, needs tension): parties flagged `joinsWartime` join temporarily; approval
  rally, budget cost, cooldown.
- **Promises**: promise a party something → it believes you for 3 months (+satisfaction). Deliver
  (`deliver` action, or the matching *do* remedy) or it distrusts you for 6 months.
- **Budget**: must pass by 31 March each year, else automatic elections.
- **Elections**: first a loss roll (`loseChance`: base + low approval + open cases + recent elections;
  shown as a risk % during the campaign), then noise around base seats, 4-seat threshold, largest
  remainder, automatic formation. Game over reasons: `voters`, `deadlock` (failed formation),
  `indicted` (trial meter reaches `indictAt`); poll panic accelerates partner drain at low approval.
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
wait [N|Nd|Nm]               let time pass; stops early when a crisis fires (default: up to 30d)
look | help
```

Parties can be named by id, short code, name, or leader alias (e.g. `liberman`, `gantz`, `deri`).

## Balance

See [docs/balance.md](docs/balance.md); reproduce with `npm run balance`.
