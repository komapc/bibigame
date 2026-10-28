import { describe, expect, it } from 'vitest';
import { DEFAULT_KNESSET, createGame } from '../src/api/game.ts';
import { runElection, type ElectionParams } from '../src/engine/elections.ts';
import { makeRng } from '../src/engine/rng.ts';

const params: ElectionParams = { totalSeats: 120, threshold: 4, noise: 0.12, noiseMin: 1, pmBonus: 0, pmId: 'likud' };

describe('re-elections', () => {
  it('always sums to 120 with no party between 0 and threshold', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = runElection(DEFAULT_KNESSET.parties, params, makeRng(seed));
      expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(120);
      for (const v of Object.values(r)) { expect(v).toBeGreaterThanOrEqual(0); expect(v === 0 || v >= 3).toBe(true); }
    }
  });
  it('is deterministic per seed and varies across seeds', () => {
    const a = runElection(DEFAULT_KNESSET.parties, params, makeRng(42));
    const b = runElection(DEFAULT_KNESSET.parties, params, makeRng(42));
    const c = runElection(DEFAULT_KNESSET.parties, params, makeRng(43));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it('stays realistic: noise around the base distribution', () => {
    let likud = 0;
    for (let seed = 1; seed <= 300; seed++) likud += runElection(DEFAULT_KNESSET.parties, params, makeRng(seed)).likud;
    expect(likud / 300).toBeGreaterThan(28);
    expect(likud / 300).toBeLessThan(37);
  });
  it('approval bonus shifts the PM party', () => {
    let lo = 0, hi = 0;
    for (let seed = 1; seed <= 100; seed++) {
      lo += runElection(DEFAULT_KNESSET.parties, { ...params, pmBonus: -6 }, makeRng(seed)).likud;
      hi += runElection(DEFAULT_KNESSET.parties, { ...params, pmBonus: 6 }, makeRng(seed)).likud;
    }
    expect(hi).toBeGreaterThan(lo);
  });
  it('a collapse leads to a campaign and then a new layout (or game over)', () => {
    const g = createGame({ seed: 9 });
    g.act({ type: 'noop' });
    for (const p of g.state.parties) if (p.inCoalition && p.id !== 'likud') p.satisfaction = 0;
    g.advanceDays(1);
    expect(g.state.phase).toBe('campaign');
    g.advanceDays(g.state.config.campaignDays + 1);
    expect(g.state.parties.reduce((s, p) => s + p.seats, 0)).toBe(120);
    expect(g.state.phase === 'governing' || g.state.phase === 'campaign' || g.state.status === 'lost').toBe(true);
  });
});
