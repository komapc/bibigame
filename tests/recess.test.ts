import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { CRISES } from '../src/data/crises.ts';
import { crisisWeight, inRecess, recessWindow } from '../src/engine/game.ts';

describe('Knesset summer recess', () => {
  it('Aug–Sep: logged, on the timeline, regular crises paused, wildcards still possible', () => {
    const g = createGame({ seed: 2, config: { startDate: '2026-07-20', randomStart: false } });
    expect(g.observe().timeline.upcoming.some((m) => m.kind === 'recess' && m.date === '2026-08-01')).toBe(true);
    let cards = 0;
    g.advanceDays(13); // 2 Aug
    expect(g.state.recess).toBe(true);
    expect(g.observe().recess).toBe(true);
    expect(g.state.log.some((l) => l.key === 'log.recessStart')).toBe(true);
    expect(g.observe().timeline.upcoming.some((m) => m.kind === 'recess' && m.date === '2026-10-01')).toBe(true);
    const regular = CRISES.filter((c) => !c.goodNews);
    expect(regular.every((c) => crisisWeight(g.state, c) === 0)).toBe(true);
    expect(CRISES.filter((c) => c.goodNews).some((c) => crisisWeight(g.state, c) > 0)).toBe(true);
    for (let d = 0; d < 55; d++) {
      if (g.state.event && !g.state.queue.length) cards++;
      if (g.state.event) g.act({ type: 'choose', optionId: 'ignore' });
      g.advanceDays(1);
    }
    expect(cards).toBe(0);
    g.advanceDays(10); // October
    expect(g.state.recess).toBe(false);
    expect(g.state.log.some((l) => l.key === 'log.recessEnd')).toBe(true);
  });
  it('window math and off switch', () => {
    const g = createGame({ seed: 1, config: { startDate: '2026-10-15', randomStart: false } });
    const w = recessWindow(g.state);
    expect(w.end - w.start).toBe(61);
    expect(w.start).toBeGreaterThan(250);
    const off = createGame({ seed: 1, config: { startDate: '2026-08-10', recessMonths: 0, randomStart: false } });
    off.advanceDays(1);
    expect(inRecess(off.state)).toBe(false);
    expect(off.observe().timeline.upcoming.some((m) => m.kind === 'recess')).toBe(false);
  });
});
