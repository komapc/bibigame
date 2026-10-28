// Balance harness: plays many seeded games per strategy and prints a markdown table.
//   npm run balance -- [--games 40] [--years 20] [--only greedy,random]
import { STRATEGIES } from '../src/bots/strategies.ts';
import { playGame, type RunResult } from '../src/bots/runner.ts';
import { TITLES } from '../src/data/titles.ts';
import { t } from '../src/i18n/index.ts';

const args = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const games = Number(arg('--games', '40'));
const years = Number(arg('--years', '20'));
const only = arg('--only', '').split(',').filter(Boolean);

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`;

const rows: string[] = [];
const titleRows: string[] = [];
rows.push(`| strategy | games | 4-year term reached | lost | median years as PM | p25–p75 years | mean elections | lost to: voters / deadlock / indicted |`);
rows.push(`|---|---|---|---|---|---|---|---|`);
titleRows.push(`| strategy | titles reached (share of games) |`);
titleRows.push(`|---|---|`);
const started = Date.now();
for (const name of Object.keys(STRATEGIES)) {
  if (only.length && !only.includes(name)) continue;
  const res: RunResult[] = [];
  for (let seed = 1; seed <= games; seed++) res.push(playGame(STRATEGIES[name](seed), seed, { maxYears: years }));
  const yrs = res.map((r) => r.pmDays / 365.25).sort((a, b) => a - b);
  const won = res.filter((r) => r.termReached).length;
  const lost = res.filter((r) => r.status === 'lost').length;
  rows.push(`| ${name} | ${games} | ${pct(won, games)} | ${pct(lost, games)} | ${median(yrs).toFixed(1)} | ${yrs[Math.floor(games * 0.25)].toFixed(1)}–${yrs[Math.floor(games * 0.75)].toFixed(1)} | ${(res.reduce((s, r) => s + r.elections, 0) / games).toFixed(1)} | ${['voters', 'deadlock', 'indicted'].map((k) => res.filter((r) => r.lostReason === k).length).join(' / ')} |`);
  const counts = TITLES.map((x) => [x.id, res.filter((r) => r.titles.includes(x.id)).length] as const).filter(([, n]) => n > 0);
  titleRows.push(`| ${name} | ${counts.map(([id, n]) => `${t(`title.${id}`)} ${pct(n, games)}`).join(', ') || '—'} |`);
}
console.log(`Seeds 1..${games}, cap ${years} game years, ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
console.log(rows.join('\n'));
console.log('\n' + titleRows.join('\n'));
