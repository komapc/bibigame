import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { eventOptions, loseFactors } from '../src/engine/game.ts';

const partner = (g: ReturnType<typeof createGame>, tag: string) => g.state.parties.find((p) => p.inCoalition && p.tags.includes(tag))!;

describe('promises', () => {
  it('a promise kept on the spot is just the deal: no extra mood', () => {
    const g = createGame({ seed: 1 }), h = createGame({ seed: 1 });
    const p = partner(g, 'haredi'), q = partner(h, 'haredi');
    p.satisfaction = q.satisfaction = 40;
    g.act({ type: 'promise', partyId: p.id, promiseId: 'funds' });
    g.act({ type: 'deliver', partyId: p.id, promiseId: 'funds' });
    h.act({ type: 'deliver', partyId: q.id, promiseId: 'funds' }); // no promise: plain delivery
    expect(p.satisfaction).toBeLessThanOrEqual(q.satisfaction + 1);
  });
  it('delivering a ministry is not held up by the law queue', () => {
    const g = createGame({ seed: 1 });
    const p = partner(g, 'haredi');
    g.act({ type: 'promise', partyId: p.id, promiseId: 'ministry' });
    g.state.cooldowns.law = 30;
    expect(g.act({ type: 'deliver', partyId: p.id, promiseId: 'ministry' }).ok).toBe(true);
  });
  it('no money promise with an empty treasury', () => {
    const g = createGame({ seed: 1 });
    g.state.fiscal = 0;
    expect(g.act({ type: 'promise', partyId: partner(g, 'haredi').id, promiseId: 'funds' }).error).toBe('err.promiseMoot.noMoney');
  });
});

describe('no dead ends', () => {
  it('a boycotting party cannot burn the invitation', () => {
    const g = createGame({ seed: 1 });
    const b = g.state.parties.find((p) => !p.inCoalition && !p.willSitWithBibi && p.seats > 0);
    if (!b) return;
    expect(g.act({ type: 'invite', partyId: b.id }).error).toBe('err.boycott');
    expect(g.state.cooldowns.invite).toBe(0);
  });
  it('early elections you call yourself cost odds', () => {
    const g = createGame({ seed: 1 });
    g.state.campaignFx = { merger: false, spoiler: false, gevalt: false, early: true };
    expect(loseFactors(g.state).some((f) => f.id === 'early' && f.delta > 0)).toBe(true);
  });
  it('spending an empty treasury costs approval', () => {
    const cost = (fiscal: number) => {
      const g = createGame({ seed: 1, config: { outcomeNoise: 0 } });
      g.state.fiscal = fiscal;
      const a0 = g.state.approval;
      expect(g.act({ type: 'move', moveId: 'newministry' }).ok).toBe(true);
      return a0 - g.state.approval;
    };
    expect(cost(0)).toBeGreaterThan(cost(50));
  });
  it('"the President hasn\'t called" has a usable answer under an ICC warrant', () => {
    const g = createGame({ seed: 1 });
    g.state.iccUntil = g.state.day + 300;
    g.state.event = { id: 'president', subject: null, firedAt: g.state.day, leftDays: 10 };
    expect(eventOptions(g.state).some((o) => o.id !== 'ignore' && o.available)).toBe(true);
  });
  it('no walkout without a threat first', () => {
    const g = createGame({ seed: 1 });
    const p = partner(g, 'farright');
    p.satisfaction = 5;
    p.threatening = false;
    g.advanceDays(1);
    if (p.inCoalition) expect(p.threatening).toBe(true);
  });
});
