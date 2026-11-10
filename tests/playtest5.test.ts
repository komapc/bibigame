import { describe, expect, it } from 'vitest';
import { createGame, formatOutcome } from '../src/api/game.ts';
import { crisisWeight } from '../src/engine/game.ts';
import { crisisById } from '../src/data/crises.ts';

const partner = (g: ReturnType<typeof createGame>, tag: string) => g.state.parties.find((p) => p.inCoalition && p.tags.includes(tag));

describe('5th playtest: honesty', () => {
  it('a result with no numbers shows what the log said instead of "nothing changed"', () => {
    const g = createGame({ seed: 1 });
    g.state.event = { id: 'trump', subject: null, firedAt: g.state.day, leftDays: 10 };
    g.act({ type: 'choose', optionId: 'dc' });
    const o = { ...g.state.outcomes.at(-1)!, sat: [], meters: [], risks: [], seats: { from: 1, to: 1 }, note: { key: 'log.spoilerExposed' } };
    expect(formatOutcome(g.state, o).summary).toContain('spoiler funding leaks');
    expect(formatOutcome(g.state, { ...o, note: undefined }).summary).toContain('Nothing visible');
  });
  it('a promise of a one-time move already used is moot', () => {
    const g = createGame({ seed: 1 });
    g.state.usedOnce.push('saudi');
    const p = g.state.parties.find((x) => x.tags.includes('centrist'))!;
    p.inCoalition = true;
    expect(g.act({ type: 'promise', partyId: p.id, promiseId: 'saudi' }).error).toBe('err.promiseMoot.once');
  });
  it('a happy centrist partner does not threaten to quit', () => {
    const g = createGame({ seed: 1 });
    const p = partner(g, 'centrist');
    if (!p) return;
    for (const q of g.state.parties) if (q.tags.includes('centrist')) q.satisfaction = 82;
    expect(crisisWeight(g.state, crisisById.get('centre')!)).toBe(0);
  });
  it('no "the government is leftist" card right after a settlement', () => {
    const g = createGame({ seed: 1 });
    (g.state.remedyUses ??= {}).settle = [g.state.day];
    expect(crisisWeight(g.state, crisisById.get('leftist')!)).toBe(0);
  });
  it('laws list carries availability and a reason', () => {
    const g = createGame({ seed: 1 });
    const laws = g.observe().laws;
    expect(laws.length).toBeGreaterThan(0);
    for (const l of laws) {
      expect(typeof l.available).toBe('boolean');
      if (!l.available) expect(l.why).toBeTruthy();
    }
  });
});
