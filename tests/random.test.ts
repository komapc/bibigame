import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';

describe('random factors (seeded)', () => {
  it('random starts differ between seeds and repeat for the same seed', () => {
    const a = createGame({ seed: 11 }).state, b = createGame({ seed: 11 }).state, c = createGame({ seed: 12 }).state;
    expect(a.startConditions).toEqual(b.startConditions);
    expect(a.parties.map((p) => [p.satisfaction, p.trait])).toEqual(b.parties.map((p) => [p.satisfaction, p.trait]));
    expect(a.startConditions.length).toBeGreaterThanOrEqual(1);
    expect(a.startConditions.length).toBeLessThanOrEqual(2);
    const sig = (s: typeof a) => JSON.stringify([s.startConditions, s.parties.map((p) => [p.satisfaction, p.trait ?? ''])]);
    expect(sig(a)).not.toBe(sig(c));
    expect(a.parties.find((p) => p.id === 'likud')!.trait).toBeUndefined();
  });

  it('randomStart can be switched off', () => {
    const s = createGame({ seed: 11, config: { randomStart: false } }).state;
    expect(s.startConditions).toEqual([]);
    expect(s.parties.every((p) => !p.trait)).toBe(true);
  });

  it('a risky remedy shows its odds and can fail with its own quip', () => {
    let failed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = createGame({ seed, config: { outcomeNoise: 0 } });
      g.state.event = { id: 'trump', subject: null, firedAt: 0, leftDays: 10 };
      const o = g.observe();
      expect(o.event!.options.find((x) => x.id === 'dc')!.odds).toBe(75);
      g.act({ type: 'choose', optionId: 'dc' });
      const last = g.state.outcomes[g.state.outcomes.length - 1];
      if (last.cause.params?.fail) {
        failed++;
        expect(g.observe().outcomes.at(-1)!.quip).toMatch(/awkward/i);
      }
    }
    expect(failed).toBeGreaterThan(2);
    expect(failed).toBeLessThan(25);
  });

  it('Trump mood stays within −2..2 and shows a face', () => {
    const g = createGame({ seed: 3 });
    g.advanceDays(400);
    expect(Math.abs(g.state.trumpMood)).toBeLessThanOrEqual(2);
    expect(g.observe().trump.face).toMatch(/\p{Extended_Pictographic}/u);
  });

  it('election night logs an exit poll before the results', () => {
    const g = createGame({ seed: 4 });
    const s = g.state;
    for (let i = 0; i < 500 && s.elections === 0; i++) { s.event = null; s.termEndsDay = s.day; g.advanceDays(1); }
    for (let i = 0; i < 200 && s.phase === 'campaign'; i++) g.advanceDays(1);
    const keys = s.log.map((e) => e.key);
    expect(keys).toContain('log.exitPoll');
    expect(keys.indexOf('log.exitPoll')).toBeLessThan(keys.lastIndexOf('log.results'));
  });
});
