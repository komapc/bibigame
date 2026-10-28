import { describe, expect, it } from 'vitest';
import { STRATEGIES } from '../src/bots/strategies.ts';
import { playGame } from '../src/bots/runner.ts';

describe('headless bots', () => {
  for (const name of Object.keys(STRATEGIES)) {
    it(`${name} plays a full game headlessly`, () => {
      const r = playGame(STRATEGIES[name](1), 1, { maxYears: 6 });
      expect(r.days).toBeGreaterThan(0);
      expect(r.status === 'lost' || r.status === 'retired' || r.days >= 6 * 365).toBe(true);
    }, 60_000);
  }
  it('is deterministic for a seed', () => {
    const a = playGame(STRATEGIES.random(5), 5, { maxYears: 4 });
    const b = playGame(STRATEGIES.random(5), 5, { maxYears: 4 });
    expect(a).toEqual(b);
  });
});
