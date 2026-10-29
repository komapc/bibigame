import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';

describe('clearer outcomes', () => {
  it('a missed gamble says it did not work', () => {
    let seen = false;
    for (let seed = 1; seed < 60 && !seen; seed++) {
      const g = createGame({ seed });
      g.state.event = { id: 'trump', subject: null, firedAt: g.state.day, leftDays: 10 };
      g.act({ type: 'choose', optionId: 'dc' });
      const last = g.observe().outcomes.at(-1)!;
      if (last.cause.includes('did not work')) seen = true;
    }
    expect(seen).toBe(true);
  });
  it('previews carry a size: a big mood hit reads ▼▼▼', () => {
    const g = createGame({ seed: 1 });
    g.state.event = { id: 'moodys', subject: null, firedAt: g.state.day, leftDays: 10 };
    const saudi = g.observe().event!.options.find((o) => o.id === 'saudi')!;
    expect(saudi.preview.some((p) => !p.up && p.size === 3)).toBe(true); // far right −25
    expect(saudi.preview.every((p) => p.size === undefined || [1, 2, 3].includes(p.size))).toBe(true);
  });
});
