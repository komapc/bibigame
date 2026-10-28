import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';

describe('titles', () => {
  it('tenure titles follow pmDays', () => {
    const g = createGame({ seed: 1 });
    g.state.pmDays = 183;
    g.advanceDays(1);
    expect(g.state.titles).toContain('lapid');
    expect(g.state.titles).not.toContain('bennett');
  });
  it('achievement titles follow stats', () => {
    const g = createGame({ seed: 1 });
    g.state.stats.brokenPromises = 10;
    g.advanceDays(1);
    expect(g.observe().titles.map((t) => t.id)).toContain('havtachot');
  });
});
