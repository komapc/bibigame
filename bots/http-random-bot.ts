// Trivial example bot that plays over the HTTP API (any language can do this).
//   node server/server.ts &   then   node bots/http-random-bot.ts [http://localhost:8787] [seed]
const base = process.argv[2] ?? 'http://localhost:8787';
const seed = Number(process.argv[3] ?? 42);

async function call(method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

let rng = seed;
const rand = () => ((rng = (rng * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const { id } = await call('POST', '/games', { seed });
let state = await call('GET', `/games/${id}/state`);
while (state.status === 'playing' && state.pmDays < 365 * 8) {
  if (state.event) {
    const opts = state.event.options.filter((o: { available: boolean }) => o.available);
    const pick = opts[Math.floor(rand() * opts.length)];
    state = (await call('POST', `/games/${id}/action`, { type: 'choose', optionId: pick.id })).state;
  }
  state = await call('POST', `/games/${id}/advance`, { days: 5 });
}
console.log(`game ${id}: ${state.status}, ${(state.pmDays / 365.25).toFixed(1)} years as PM, ${state.elections} elections, titles: ${state.titles.map((t: { name: string }) => t.name).join(', ') || 'none'}`);
export {};
