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
    g.advanceDays(c.promiseBelieveDays + 1);
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
  it('rejects promises the party does not care about', () => {
    const g = createGame({ seed: 7 });
    expect(g.act({ type: 'promise', partyId: 'shas', promiseId: 'constitution' }).error).toBe('err.wrongParty');
  });
});
