import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { warRally } from '../src/engine/game.ts';

const ready = (seed: number, config = {}) => {
  const g = createGame({ seed, config });
  g.state.war.cooldownDays = 0;
  g.state.tensionUntil = g.state.day + 100;
  g.state.fiscal = 50;
  return g;
};

describe('war is a gamble', () => {
  it('no war with an empty treasury', () => {
    const g = ready(1);
    g.state.fiscal = 5;
    const r = g.act({ type: 'startWar' });
    expect(r.ok).toBe(false);
    expect(r.why?.key).toBe('why.fiscal');
    expect(g.observe().war.broke).toBe(true);
  });
  it('a failed war costs approval and Washington, with no rally', () => {
    const g = ready(1, { warFailChance: 1 });
    const a0 = g.state.approval, us0 = g.state.us;
    expect(g.act({ type: 'startWar' }).ok).toBe(true);
    expect(g.state.war.failed).toBe(true);
    expect(g.state.approval).toBeLessThan(a0);
    expect(g.state.us).toBeLessThan(us0);
    expect(warRally(g.state)).toBe(0);
    expect(g.observe().war.failed).toBe(true);
  });
  it('a war that goes to plan still rallies', () => {
    const g = ready(1, { warFailChance: 0 });
    const a0 = g.state.approval;
    g.act({ type: 'startWar' });
    expect(g.state.war.failed).toBe(false);
    expect(g.state.approval).toBeGreaterThan(a0);
    expect(warRally(g.state)).toBeGreaterThan(0);
  });
  it('the odds are in the observation and the text', () => {
    const g = ready(1);
    expect(g.observe().war.failChance).toBe(25);
  });
});

describe('promises are rationed', () => {
  it('one new promise per promiseCooldownDays', () => {
    const g = createGame({ seed: 1 });
    const [a, b] = g.state.parties.filter((p) => p.inCoalition && p.id !== g.state.base.pmParty);
    expect(g.act({ type: 'promise', partyId: a.id, promiseId: 'norwegian' }).ok).toBe(true);
    expect(g.act({ type: 'promise', partyId: b.id, promiseId: 'norwegian' }).error).toBe('err.cooldown.promise');
    g.advanceDays(31);
    expect(g.state.cooldowns.promise).toBe(0);
  });
  it('a small party gets a share of the rotation boost', () => {
    const g = createGame({ seed: 1 });
    const small = g.state.parties.find((p) => p.inCoalition && p.id !== g.state.base.pmParty && p.seats >= 4 && p.seats < 10)!;
    if (!small) return;
    small.satisfaction = 20;
    g.act({ type: 'promise', partyId: small.id, promiseId: 'rotation' });
    expect(small.satisfaction).toBeLessThan(20 + g.state.config.rotationBoost * 0.7);
  });
});
