import { describe, expect, it } from 'vitest';
import { createGame, errorText } from '../src/api/game.ts';
import { crisisWeight } from '../src/engine/game.ts';
import { crisisById } from '../src/data/crises.ts';

const partner = (g: ReturnType<typeof createGame>, tag: string) => g.state.parties.find((p) => p.inCoalition && p.tags.includes(tag))!;

describe('promises are checked against the game', () => {
  it('no promise of a law that is already law', () => {
    const g = createGame({ seed: 1 });
    g.state.lawsPassed.push('exempt');
    const r = g.act({ type: 'promise', partyId: partner(g, 'haredi').id, promiseId: 'exemption' });
    expect(r.ok).toBe(false);
    expect(errorText(r)).toMatch(/already law/);
  });
  it('no ceasefire promise without a war', () => {
    const g = createGame({ seed: 1 });
    const p = g.state.parties.find((x) => x.tags.includes('centrist'))!;
    p.inCoalition = true;
    expect(g.act({ type: 'promise', partyId: p.id, promiseId: 'ceasefire' }).error).toBe('err.promiseMoot.noWar');
  });
  it('a permanent law cannot be passed twice', () => {
    const g = createGame({ seed: 1 });
    g.state.lawsPassed.push('exempt');
    expect(g.act({ type: 'passLaw', lawId: 'exempt' }).ok).toBe(false);
  });
  it('promise-then-deliver at once pays less than a kept word after a wait', () => {
    const bonus = (wait: number) => {
      const g = createGame({ seed: 1 });
      const p = partner(g, 'haredi');
      g.act({ type: 'promise', partyId: p.id, promiseId: 'funds' });
      g.state.day += wait;
      p.trust.until += wait;
      const before = p.satisfaction;
      g.act({ type: 'deliver', partyId: p.id, promiseId: 'funds' });
      return p.satisfaction - before;
    };
    expect(bonus(0)).toBeLessThan(bonus(90));
  });
  it('keeping the promise takes the angry reminder off the table', () => {
    const g = createGame({ seed: 1 });
    const p = partner(g, 'haredi');
    g.act({ type: 'promise', partyId: p.id, promiseId: 'funds' });
    p.trust.state = 'angry';
    g.state.event = { id: 'angry', subject: p.id, firedAt: g.state.day, leftDays: 10 };
    g.act({ type: 'deliver', partyId: p.id, promiseId: 'funds' });
    expect(g.state.event).toBeNull();
  });
  it('no laws during the summer recess', () => {
    const g = createGame({ seed: 1 });
    g.state.recess = true;
    expect(g.act({ type: 'passLaw', lawId: 'norwegian' }).error).toBe('err.recess');
  });
});

describe('honest previews and refusals', () => {
  it('"hand out a ministry" names who gets it', () => {
    const g = createGame({ seed: 1 });
    g.state.event = { id: 'shabbat', subject: partner(g, 'haredi').id, firedAt: g.state.day, leftDays: 10 };
    const opt = g.observe().event!.options.find((o) => o.id === 'ministry')!;
    expect(opt.preview.some((x) => x.label.includes(partner(g, 'haredi').name) || x.label.includes('deputy'))).toBe(true);
  });
  it('war without tension says so instead of "ready in 0 days"', () => {
    const g = createGame({ seed: 1 });
    g.state.tensionUntil = 0;
    g.state.war.cooldownDays = 0;
    const r = g.act({ type: 'startWar' });
    expect(r.ok).toBe(false);
    expect(errorText(r)).not.toMatch(/0 days/);
  });
  it('invite odds are shown for parties outside the coalition', () => {
    const g = createGame({ seed: 1 });
    const out = g.observe().parties.filter((p) => !p.inCoalition && p.seats > 0);
    expect(out.every((p) => typeof p.inviteOdds === 'number')).toBe(true);
  });
  it('no "President hasn\'t called" while US support is high', () => {
    const g = createGame({ seed: 1 });
    g.state.us = 90;
    g.state.trumpMood = 0;
    expect(crisisWeight(g.state, crisisById.get('president')!)).toBe(0);
  });
});
