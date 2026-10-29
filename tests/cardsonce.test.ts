import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { crisisWeight } from '../src/engine/game.ts';
import { crisisById } from '../src/data/crises.ts';

describe('one-time cards and "Again:" repeats', () => {
  it('a one-time card never comes back; a repeatable one does, titled Again', () => {
    const g = createGame({ seed: 2 });
    const s = g.state;
    const reserve = crisisById.get('reserve')!;
    expect(reserve.repeats).toBeFalsy();
    s.firedCount = { reserve: 1, kaplan: 1 };
    s.lastFired = { reserve: -1000, kaplan: -1000 };
    expect(crisisWeight(s, reserve)).toBe(0);
    expect(crisisWeight(s, crisisById.get('kaplan')!)).toBeGreaterThan(0);
    s.firedCount.kaplan = 2;
    s.event = { id: 'kaplan', subject: null, firedAt: s.day, leftDays: 10 };
    expect(g.observe().event!.title).toBe('Again: Mass protest on Kaplan');
    s.firedCount.kaplan = 1;
    expect(g.observe().event!.title).toBe('Mass protest on Kaplan');
  });
});

describe('backup remedies', () => {
  it('a spent once-only remedy is replaced by the next one in the list', () => {
    const g = createGame({ seed: 2 });
    const s = g.state;
    s.event = { id: 'iran', subject: null, firedAt: s.day, leftDays: 10 };
    s.usedOnce.push('beepers');
    const ids = g.observe().event!.options.filter((o) => o.dir !== 'ignore').map((o) => o.id);
    expect(ids).toEqual(['fordow', 'cartoonbomb']);
  });
});
