import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';

describe('ready-made reshuffles', () => {
  it('two offers to different partners, the unhappiest first; one applies', () => {
    const g = createGame({ seed: 4 });
    const o = g.observe();
    expect(o.reshuffles.length).toBe(2);
    expect(new Set(o.reshuffles.map((r) => r.to)).size).toBe(2);
    const partners = o.parties.filter((p) => p.inCoalition && p.id !== g.state.base.pmParty).sort((a, b) => a.satisfaction - b.satisfaction);
    expect(o.reshuffles[0].to).toBe(partners[0].id);
    const r = o.reshuffles[0];
    expect(g.act({ type: 'giveMinistry', ministryId: r.ministryId, partyId: r.to }).ok).toBe(true);
    expect(g.state.ministries.find((m) => m.id === r.ministryId)!.holder).toBe(r.to);
  });
});
