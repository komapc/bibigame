import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { makeServer } from '../server/server.ts';

const server = makeServer();
let base = '';
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });

describe('HTTP bot API', () => {
  it('creates, observes, acts, advances and talks text', async () => {
    const created = await (await fetch(`${base}/games`, { method: 'POST', body: JSON.stringify({ seed: 3 }) })).json();
    expect(created.state.seats).toBe(64);
    const id = created.id;
    const adv = await (await fetch(`${base}/games/${id}/advance`, { method: 'POST', body: JSON.stringify({ days: 30 }) })).json();
    expect(adv.day).toBe(30);
    const act = await fetch(`${base}/games/${id}/action`, { method: 'POST', body: JSON.stringify({ type: 'promise', partyId: 'shas', promiseId: 'exemption' }) });
    expect(act.status).toBe(200);
    const bad = await fetch(`${base}/games/${id}/action`, { method: 'POST', body: JSON.stringify({ type: 'promise', partyId: 'shas', promiseId: 'exemption' }) });
    expect(bad.status).toBe(400);
    const txt = await (await fetch(`${base}/games/${id}/text`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'wait 10d' })).text();
    expect(txt).toMatch(/Waited \d+d/);
    expect(txt).toContain('Coalition:');
    const titles = await (await fetch(`${base}/games/${id}/titles`)).json();
    expect(titles.length).toBeGreaterThan(5);
    expect((await fetch(`${base}/games/nope/state`)).status).toBe(404);
  });
});
