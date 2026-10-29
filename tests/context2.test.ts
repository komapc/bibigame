import { describe, expect, it } from 'vitest';
import { createGame, errorText } from '../src/api/game.ts';
import { crisisWeight, eventOptions, ministryFor } from '../src/engine/game.ts';
import { crisisById } from '../src/data/crises.ts';
import { ministryCounts } from '../src/engine/coalition.ts';

const card = (id: string) => crisisById.get(id)!;

describe('cards only when they make sense', () => {
  it('the High Court strikes down a law only once some law has passed', () => {
    const g = createGame({ seed: 1 });
    g.state.lawsPassed = [];
    expect(crisisWeight(g.state, card('court'))).toBe(0);
    expect(g.act({ type: 'passLaw', lawId: 'norwegian' }).ok).toBe(true);
    expect(crisisWeight(g.state, card('court'))).toBeGreaterThan(0);
  });
  it('the defence minister argues about the reform only once it is passed or promised', () => {
    const g = createGame({ seed: 1 });
    expect(crisisWeight(g.state, card('gallant'))).toBe(0);
    g.state.lawsPassed = ['reform'];
    expect(crisisWeight(g.state, card('gallant'))).toBeGreaterThan(0);
  });
  it('"the President hasn\'t called" not while Trump is in love', () => {
    const g = createGame({ seed: 1 });
    g.state.trumpMood = 1;
    expect(crisisWeight(g.state, card('president'))).toBe(0);
  });
  it('a frozen trial gets no new cases or testimony', () => {
    const g = createGame({ seed: 1 });
    g.state.trial = 60;
    g.state.trialPausedUntil = g.state.day + 100;
    expect(crisisWeight(g.state, card('case'))).toBe(0);
    expect(crisisWeight(g.state, card('testimony'))).toBe(0);
  });
  it('after the war the deal card no longer offers "sign the ceasefire"', () => {
    const g = createGame({ seed: 1 });
    g.state.war.active = false;
    g.state.event = { id: 'deal', subject: null, firedAt: g.state.day, leftDays: 10 };
    expect(eventOptions(g.state).map((o) => o.id)).not.toContain('ceasefire');
  });
  it('under an ICC warrant the Trump card still has a usable answer', () => {
    const g = createGame({ seed: 1 });
    g.state.iccUntil = g.state.day + 300;
    g.state.usedOnce.push('nobel');
    g.state.event = { id: 'trump', subject: null, firedAt: g.state.day, leftDays: 10 };
    expect(eventOptions(g.state).some((o) => o.id !== 'ignore' && o.available)).toBe(true);
  });
});

describe('refusals say why', () => {
  it('a cooldown names what and how long', () => {
    const g = createGame({ seed: 1 });
    g.state.cooldowns.law = 20;
    const r = g.act({ type: 'passLaw', lawId: 'norwegian' });
    expect(r.ok).toBe(false);
    expect(errorText(r)).toMatch(/20 days/);
  });
  it('an unavailable action says why', () => {
    const g = createGame({ seed: 1 });
    g.act({ type: 'startWar' });
    const r = g.act({ type: 'startWar' });
    expect(r.ok).toBe(false);
    expect(errorText(r)).toMatch(/already at war/);
  });
});

describe('ministries and partners', () => {
  it('handing out ministries never strips the PM party below its core', () => {
    const g = createGame({ seed: 1 });
    const s = g.state;
    const partner = s.parties.find((p) => p.inCoalition && p.id !== s.base.pmParty)!;
    for (let i = 0; i < 20; i++) {
      const m = ministryFor(s, partner);
      if (!m) break;
      m.holder = partner.id;
    }
    expect(ministryCounts(s.ministries)[s.base.pmParty] ?? 0).toBeGreaterThanOrEqual(s.config.pmMinMinistries);
  });
  it('a happy wartime partner stays after the war', () => {
    const g = createGame({ seed: 1 });
    const s = g.state;
    g.act({ type: 'startWar' });
    const w = s.parties.find((p) => p.wartime);
    if (!w) return; // no wartime party in this Knesset
    w.satisfaction = 90;
    s.event = { id: 'deal', subject: null, firedAt: s.day, leftDays: 10 };
    g.act({ type: 'choose', optionId: 'ceasefire' });
    expect(w.inCoalition).toBe(true);
  });
  it('the ceasefire preview includes the end-of-war approval dip', () => {
    const g = createGame({ seed: 1 });
    g.act({ type: 'startWar' });
    g.state.event = { id: 'deal', subject: null, firedAt: g.state.day, leftDays: 10 };
    const cf = g.observe().event!.options.find((o) => o.id === 'ceasefire')!;
    const appr = cf.preview.filter((p) => p.label === 'Approval');
    expect(appr.length).toBeLessThanOrEqual(1);
    expect(appr[0]?.up ?? false).toBe(false); // +2 and −4 → one ▼
  });
});
