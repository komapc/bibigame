// Text-mode CLI: `npm run text -- --seed 42 [--log run.jsonl] [--realtime]`
// Reads one command per line from stdin, prints the state after each.
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
import { createGame } from '../api/game.ts';
import { HELP, renderText, runText } from '../api/text.ts';

const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const seed = Number(arg('--seed') ?? Math.floor(Math.random() * 1e9));
const logFile = arg('--log');
const realtime = args.includes('--realtime');

const game = createGame({ seed });
console.log(`bibigame text mode — seed ${seed}${realtime ? ' (realtime)' : ' (turn-based: time moves only on "wait")'}`);
console.log(HELP + '\n');
let lastState = renderText(game.observe());
console.log(lastState);
process.stdout.write('> ');

let lastTick = Date.now();
if (realtime) {
  setInterval(() => {
    const now = Date.now();
    game.advance(now - lastTick);
    lastTick = now;
    if (game.over) { console.log('\n' + renderText(game.observe())); process.exit(0); }
  }, 250).unref();
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const { reply, ok } = runText(game, line);
  if (logFile) appendFileSync(logFile, JSON.stringify({ seed, day: game.state.day, state: lastState, command: line, ok, reply }) + '\n');
  lastState = reply.slice(reply.indexOf('==='));
  console.log(reply);
  if (game.over) { console.log('GAME OVER'); rl.close(); return; }
  process.stdout.write('> ');
});
rl.on('close', () => process.exit(0));
