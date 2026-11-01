import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { moveAvailable, unityCandidate } from '../src/engine/game.ts';

const DESPERATE = ['unitygov', 'summit', 'dossier', 'bailout', 'immunity'];

describe('desperate measures', () => {
  it('stay shut while things are fine, with a reason', () => {
    const g = createGame({ seed: 1 });
    g.state.approval = 50; g.state.fiscal = 50; g.state.trial = 10;
    for (const id of DESPERATE) expect(moveAvailable(g.state, id)).toBe(false);
    const m = g.observe().moves.find((x) => x.id === 'summit')!;
    expect(m.desperate).toBe(true);
    expect(m.why).toMatch(/approval is under 25/);
  });
  it('each opens with its own trouble', () => {
    const g = createGame({ seed: 1 });
    g.state.approval = 50; g.state.fiscal = 50; g.state.trial = 10;
    g.state.approval = 20;
    expect(moveAvailable(g.state, 'summit')).toBe(true);
    expect(moveAvailable(g.state, 'bailout')).toBe(false);
    g.state.fiscal = 5;
    expect(moveAvailable(g.state, 'bailout')).toBe(true);
    g.state.trial = 75;
    expect(moveAvailable(g.state, 'immunity')).toBe(true);
  });
  it('opening up is announced once a term', () => {
    const g = createGame({ seed: 1 });
    g.state.approval = 10;
    g.advanceDays(2);
    const n = g.state.log.filter((e) => e.key === 'log.desperate').length;
    expect(n).toBeGreaterThan(0);
    g.advanceDays(5);
    expect(g.state.log.filter((e) => e.key === 'log.desperate').length).toBe(n);
  });
  it('once per term; a win and a loss both happen', () => {
    let won = 0, lost = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = createGame({ seed });
      g.state.approval = 15;
      const a0 = g.state.approval;
      expect(g.act({ type: 'move', moveId: 'summit' }).ok).toBe(true);
      if (g.state.approval > a0) won++; else lost++;
      expect(g.act({ type: 'move', moveId: 'summit' }).ok).toBe(false);
    }
    expect(won).toBeGreaterThan(0);
    expect(lost).toBeGreaterThan(0);
  });
  it('a successful unity offer brings the biggest willing party in', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = createGame({ seed, config: {} });
      g.state.approval = 15;
      const cand = unityCandidate(g.state);
      if (!cand) continue;
      g.act({ type: 'move', moveId: 'unitygov' });
      if (g.state.log.some((e) => e.key === 'log.unityJoin')) {
        expect(cand.inCoalition).toBe(true);
        return;
      }
    }
    throw new Error('no successful unity offer in 30 seeds');
  });
});
