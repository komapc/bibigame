import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';

describe('promises and trust', () => {
  it('believe for 3 months, then distrust for 6, then neutral', () => {
    const g = createGame({ seed: 5 });
    const c = g.state.config;
    expect(g.act({ type: 'promise', partyId: 'yb', promiseId: 'constitution' }).ok).toBe(true);
    const yb = () => g.state.parties.find((p) => p.id === 'yb')!;
    expect(yb().trust.state).toBe('believing');
    expect(g.act({ type: 'promise', partyId: 'yb', promiseId: 'funds' }).error).toBe('err.alreadyPromised');
    g.advanceDays(c.promiseBelieveDays - c.promiseWarnDays + 1);
    expect(g.observe().parties.find((p) => p.id === 'yb')!.trust.waiting).toBe(true);
    g.advanceDays(c.promiseWarnDays);
    // yb is in the opposition: no reminder card, they simply stop believing you
    expect(yb().trust.state).toBe('distrust');
    expect(g.state.stats.brokenPromises).toBe(1);
    expect(g.act({ type: 'promise', partyId: 'yb', promiseId: 'funds' }).error).toBe('err.distrust');
    g.advanceDays(c.promiseDistrustDays + 1);
    expect(yb().trust.state).toBe('neutral');
  });
  it('delivering clears the promise', () => {
    const g = createGame({ seed: 6 });
    g.act({ type: 'promise', partyId: 'shas', promiseId: 'exemption' });
    expect(g.act({ type: 'deliver', partyId: 'shas', promiseId: 'exemption' }).ok).toBe(true);
    const shas = g.state.parties.find((p) => p.id === 'shas')!;
    expect(shas.trust.state).toBe('neutral');
    expect(g.state.stats.promisesKept).toBe(1);
  });
  it('angry reminder: buy time works once, deliver at a premium clears it', () => {
    // isolate the mechanic: no random crises; pass the budget when it nags
    const g = createGame({ seed: 8, config: { eventIntervalDays: 100000, eventJitterDays: 0, clusterChance: 0 } });
    const c = g.state.config;
    g.act({ type: 'promise', partyId: 'shas', promiseId: 'exemption' });
    const shas = () => g.state.parties.find((p) => p.id === 'shas')!;
    const waitAngry = () => {
      for (let i = 0; i < 400 && g.state.event?.id !== 'angry'; i++) {
        if (g.state.event) g.act({ type: 'choose', optionId: g.state.event.id === 'budget' ? 'left' : 'ignore' });
        g.advanceDays(1);
      }
      expect(g.state.event?.id).toBe('angry');
      expect(g.state.event!.leftDays).toBeLessThanOrEqual(c.urgentTimeoutDays);
    };
    waitAngry();
    expect(g.act({ type: 'choose', optionId: 'buytime' }).ok).toBe(true);
    expect(shas().trust.state).toBe('believing');
    waitAngry();
    expect(g.observe().event!.options.find((o) => o.id === 'buytime')!.available).toBe(false);
    expect(g.act({ type: 'choose', optionId: 'left' }).ok).toBe(true); // deliver at a premium
    expect(shas().trust.state).toBe('neutral');
    expect(g.state.stats.promisesKept).toBe(1);
  });
  it('rejects promises the party does not care about', () => {
    const g = createGame({ seed: 7 });
    expect(g.act({ type: 'promise', partyId: 'shas', promiseId: 'constitution' }).error).toBe('err.wrongParty');
  });
});

describe('promise-or-do remedies', () => {
  it('Promise a settlement: far right believes, centrists drop now; Build delivers', () => {
    const g = createGame({ seed: 3 });
    const sat = (id: string) => g.state.parties.find((p) => p.id === id)!.satisfaction;
    const ya0 = sat('yeshatid');
    g.state.event = { id: 'leftist', subject: 'otzma', firedAt: 0, leftDays: 20 };
    expect(g.act({ type: 'choose', optionId: 'promsettle' }).ok).toBe(true);
    const otzma = g.state.parties.find((p) => p.id === 'otzma')!;
    expect(otzma.trust).toMatchObject({ state: 'believing', promiseId: 'settlement' });
    expect(sat('yeshatid')).toBeLessThan(ya0);
    g.state.event = { id: 'leftist', subject: 'otzma', firedAt: g.state.day, leftDays: 20 };
    expect(g.act({ type: 'choose', optionId: 'settle' }).ok).toBe(true);
    expect(otzma.trust.state).toBe('neutral');
    expect(g.state.stats.promisesKept).toBeGreaterThan(0);
  });
});
