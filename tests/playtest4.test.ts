import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { crisisWeight } from '../src/engine/game.ts';
import { crisisById } from '../src/data/crises.ts';

describe('texts say what happened', () => {
  it('no dangling arrow when nothing visible changed', () => {
    const g = createGame({ seed: 1 });
    for (const r of g.observe(40).outcomes ?? []) expect(r.summary).not.toMatch(/→\s*$/);
  });
  it('"the far right calls you a leftist" not when the government already sits on their line', () => {
    const g = createGame({ seed: 1 });
    const fr = g.state.parties.filter((p) => p.inCoalition && p.tags.includes('farright'));
    for (const p of fr) p.satisfaction = 30;
    g.state.govPosition = Math.max(...fr.map((p) => p.position));
    expect(crisisWeight(g.state, crisisById.get('leftist')!)).toBe(0);
    g.state.govPosition = 2;
    expect(crisisWeight(g.state, crisisById.get('leftist')!)).toBeGreaterThan(0);
  });
});

describe('war is a decision', () => {
  it('not in the first days of the government', () => {
    const g = createGame({ seed: 1 });
    expect(g.act({ type: 'startWar' }).ok).toBe(false);
    g.advanceDays(g.state.config.warFirstDays + 1);
    if (g.state.tensionUntil > g.state.day) expect(g.observe().war.cooldownDays).toBe(0);
  });
  it('the observation says who joins and what it costs', () => {
    const g = createGame({ seed: 1 });
    const w = g.observe().war;
    expect(w.fiscalPerDay).toBeGreaterThan(0);
    expect(Array.isArray(w.joiners)).toBe(true);
  });
  it('a wartime partner waiting on a promise stays after the war', () => {
    const g = createGame({ seed: 1 });
    const s = g.state;
    s.war.cooldownDays = 0;
    g.act({ type: 'startWar' });
    const w = s.parties.find((p) => p.wartime);
    if (!w) return;
    w.satisfaction = 40;
    w.trust = { state: 'believing', promiseId: 'ceasefire', until: s.day + 90, since: s.day };
    s.event = { id: 'deal', subject: null, firedAt: s.day, leftDays: 10 };
    g.act({ type: 'choose', optionId: 'ceasefire' });
    expect(w.inCoalition).toBe(true);
  });
  it('starting a war keeps the "push into Lebanon" promise', () => {
    const g = createGame({ seed: 1 });
    const fr = g.state.parties.find((p) => p.inCoalition && p.tags.includes('farright'))!;
    g.act({ type: 'promise', partyId: fr.id, promiseId: 'lebanon' });
    expect(fr.trust.promiseId).toBe('lebanon');
    g.state.war.cooldownDays = 0;
    g.act({ type: 'startWar' });
    expect(fr.trust.state).toBe('neutral');
  });
});
