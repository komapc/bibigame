import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { moveAvailable, unityCandidate } from '../src/engine/game.ts';
import { hateCount } from '../src/engine/coalition.ts';
import { renderText } from '../src/api/text.ts';

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
  it('a unity offer with nobody to take it stays shut, with a reason', () => {
    const g = createGame({ seed: 1 });
    g.state.approval = 15;
    for (const p of g.state.parties) if (!p.inCoalition) p.willSitWithBibi = false;
    expect(unityCandidate(g.state)).toBeUndefined();
    expect(moveAvailable(g.state, 'unitygov')).toBe(false);
    expect(g.observe().moves.find((x) => x.id === 'unitygov')!.why).toMatch(/someone outside/);
    expect(g.act({ type: 'move', moveId: 'unitygov' }).ok).toBe(false);
  });
  it('a unity partner joins like an invited one: the line moves, haters sulk, a ministry comes with it', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = createGame({ seed });
      g.state.approval = 15;
      const cand = unityCandidate(g.state)!;
      const pos0 = g.state.govPosition;
      const haters = g.state.parties.filter((x) => x.inCoalition && hateCount(x, [cand]) > 0);
      const sat0 = new Map(haters.map((x) => [x.id, x.satisfaction]));
      g.act({ type: 'move', moveId: 'unitygov' });
      if (!g.state.log.some((e) => e.key === 'log.unityJoin')) continue;
      expect(cand.inCoalition).toBe(true);
      expect(g.state.ministries.some((m) => m.holder === cand.id)).toBe(true);
      expect(cand.satisfaction).toBeGreaterThanOrEqual(50);
      if (cand.position !== pos0) expect(g.state.govPosition).not.toBe(pos0);
      // the far-right partners lose 6 to the offer itself; a hater loses the invite's 20 on top
      if (!haters.length) continue;
      for (const x of haters) expect(sat0.get(x.id)! - x.satisfaction).toBeGreaterThan(15);
      return;
    }
    throw new Error('no successful unity offer with a hater in 40 seeds');
  });
  it('the odds of a gamble are shown in the drawer and in text mode', () => {
    const g = createGame({ seed: 1 });
    g.state.approval = 15;
    const o = g.observe();
    for (const id of DESPERATE) expect(o.moves.find((x) => x.id === id)!.odds).toBeGreaterThan(0);
    expect(o.moves.find((x) => x.id === 'elections')!.odds).toBeNull();
    expect(renderText(o)).toMatch(/summit \[45% odds\]/);
  });
  it('every desperate measure can miss', () => {
    const setup: Record<string, (s: ReturnType<typeof createGame>['state']) => void> = {
      unitygov: (s) => { s.approval = 15; }, summit: (s) => { s.approval = 15; }, dossier: (s) => { s.approval = 15; },
      bailout: (s) => { s.fiscal = 5; }, immunity: (s) => { s.trial = 80; },
    };
    for (const id of DESPERATE) {
      let missed = false;
      for (let seed = 1; seed <= 30 && !missed; seed++) {
        const g = createGame({ seed });
        setup[id](g.state);
        expect(g.act({ type: 'move', moveId: id }).ok).toBe(true);
        missed = g.state.log.some((e) => e.key === 'log.riskFailed');
      }
      expect(missed, id).toBe(true);
    }
  });
});
