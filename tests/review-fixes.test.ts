import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { crisisWeight, ministryFor, partyById, remedyAvailable, seatsOf } from '../src/engine/game.ts';
import { formGovernment } from '../src/engine/coalition.ts';
import { crisisById } from '../src/data/crises.ts';

describe('review fixes (2026-10-28)', () => {
  it('a ministry for your own party never comes from a partner; partners never get Defence', () => {
    const g = createGame({ seed: 1 });
    const s = g.state;
    expect(ministryFor(s, partyById(s, 'likud')!)).toBeUndefined();
    const m = ministryFor(s, partyById(s, 'shas')!)!;
    expect(m.holder).toBe('likud');
    expect(m.id).not.toBe('defense');
  });

  it('one angry reminder per promise, not one per party', () => {
    const g = createGame({ seed: 2 });
    const s = g.state;
    s.nextEventInDays = 999;
    for (const id of ['rz', 'otzma', 'noam']) partyById(s, id)!.trust = { state: 'believing', promiseId: 'settlement', until: s.day + 1 };
    g.advanceDays(3);
    const cards = s.queue.filter((q) => q.id === 'angry').length + (s.event?.id === 'angry' ? 1 : 0);
    expect(cards).toBe(1);
    // refusing on that one card answers for all three
    if (s.event?.id !== 'angry') g.advanceDays(1);
    expect(g.act({ type: 'choose', optionId: 'refuse' }).ok).toBe(true);
    for (const id of ['rz', 'otzma', 'noam']) expect(partyById(s, id)!.trust.state).toBe('distrust');
  });

  it('no reminder for a party that already left', () => {
    const g = createGame({ seed: 3 });
    const s = g.state;
    s.nextEventInDays = 999;
    const shas = partyById(s, 'shas')!;
    shas.trust = { state: 'believing', promiseId: 'exemption', until: s.day + 1 };
    shas.inCoalition = false;
    g.advanceDays(3);
    expect(s.queue.length + (s.event?.id === 'angry' ? 1 : 0)).toBe(0);
    expect(shas.trust.state).toBe('distrust');
  });

  it('the same card does not come back within the cooldown; good news not within a year', () => {
    const g = createGame({ seed: 4 });
    const s = g.state;
    s.lastFired.kaplan = s.day;
    expect(crisisWeight(s, crisisById.get('kaplan')!)).toBe(0);
    s.lastFired.eurovision = s.day - 200;
    expect(crisisWeight(s, crisisById.get('eurovision')!)).toBe(0);
    s.street = 0;
    s.lastFired.kaplan = -999;
    expect(crisisWeight(s, crisisById.get('kaplan')!)).toBeLessThanOrEqual(crisisById.get('kaplan')!.weight * 2 + 1e-9);
  });

  it('laws remember: a passed exemption hides the law and the draft cards', () => {
    const g = createGame({ seed: 5 });
    const s = g.state;
    expect(g.act({ type: 'passLaw', lawId: 'exempt' }).ok).toBe(true);
    expect(remedyAvailable(s, 'exempt')).toBe(false);
    expect(crisisWeight(s, crisisById.get('draft')!)).toBe(0);
    expect(crisisWeight(s, crisisById.get('route4')!)).toBe(0);
  });

  it('"Washington wants a deal" only during or just after a war', () => {
    const g = createGame({ seed: 6 });
    expect(crisisWeight(g.state, crisisById.get('deal')!)).toBe(0);
  });

  it('coalition seats never show below zero', () => {
    const g = createGame({ seed: 7 });
    g.state.defectors = 200;
    expect(seatsOf(g.state)).toBe(0);
  });

  it('a lost election never prints a majority for your bloc', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const g = createGame({ seed, config: { loseBase: 1, loseMax: 1 } });
      const s = g.state;
      // bring the scheduled election forward and let the campaign resolve (the loss roll is certain)
      for (let i = 0; i < 400 && s.phase !== 'opposition' && s.status === 'playing'; i++) {
        if (s.event) s.event = null;
        if (s.phase === 'governing') { s.termEndsDay = s.day; }
        g.advanceDays(1);
      }
      expect(s.phase === 'opposition' || s.status !== 'playing').toBe(true);
      expect(formGovernment(s.parties, s.base.pmParty, s.config.majority)).toBeNull();
    }
  });
});
