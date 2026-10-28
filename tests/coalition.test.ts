import { describe, expect, it } from 'vitest';
import { DEFAULT_KNESSET, createGame } from '../src/api/game.ts';
import { allocateMinistries, coalitionSeats, formGovernment, hasMajority, hateCount } from '../src/engine/coalition.ts';
import type { PartyDef } from '../src/engine/types.ts';

const parties = DEFAULT_KNESSET.parties;

describe('coalition math', () => {
  it('counts coalition seats and majority', () => {
    expect(coalitionSeats(parties)).toBe(64);
    expect(hasMajority(parties)).toBe(true);
    expect(hasMajority(parties, 61, 4)).toBe(false); // 4 rogue MKs → 60
  });

  it('hate counting uses ids and tags', () => {
    const otzma = parties.find((p) => p.id === 'otzma')!;
    const raam = parties.find((p) => p.id === 'raam')!;
    expect(hateCount(otzma, [raam])).toBe(1);
    expect(hateCount(raam, [otzma])).toBe(1);
  });

  it('forms the right-wing government from base results', () => {
    const ids = formGovernment(parties, 'likud')!;
    expect(ids[0]).toBe('likud');
    const seats = ids.reduce((s, id) => s + parties.find((p) => p.id === id)!.seats, 0);
    expect(seats).toBeGreaterThanOrEqual(61);
    // never mixes parties that hate each other
    expect(ids.includes('natunity') && ids.includes('otzma')).toBe(false);
  });

  it('returns null when 61 is unreachable', () => {
    const weak: PartyDef[] = parties.map((p) => ({ ...p, seats: p.id === 'likud' ? 10 : p.id === 'yeshatid' ? 46 : p.seats }));
    expect(formGovernment(weak, 'likud')).toBeNull();
  });

  it('allocates every ministry to coalition parties, biggest party most', () => {
    const g = createGame({ seed: 1 });
    const out = allocateMinistries(g.state.ministries, g.state.parties);
    expect(out.every((m) => m.holder && g.state.parties.find((p) => p.id === m.holder)!.inCoalition)).toBe(true);
    const likud = out.filter((m) => m.holder === 'likud').length;
    expect(likud).toBeGreaterThan(out.filter((m) => m.holder === 'shas').length);
  });

  it('a partner at 0 satisfaction leaves; dropping below 61 triggers elections', () => {
    const g = createGame({ seed: 3 });
    const shas = g.state.parties.find((p) => p.id === 'shas')!;
    shas.satisfaction = 0;
    g.advanceDays(1);
    expect(shas.inCoalition).toBe(false);
    expect(g.state.phase).toBe('campaign');
    expect(g.state.elections).toBe(1);
  });

  it('giving a ministry moves it and costs the loser', () => {
    const g = createGame({ seed: 4 });
    const before = g.state.parties.find((p) => p.id === 'otzma')!.satisfaction;
    expect(g.act({ type: 'giveMinistry', ministryId: 'heritage', partyId: 'shas' }).ok).toBe(true);
    expect(g.state.ministries.find((m) => m.id === 'heritage')!.holder).toBe('shas');
    expect(g.state.parties.find((p) => p.id === 'otzma')!.satisfaction).toBeLessThan(before);
    expect(g.act({ type: 'giveMinistry', ministryId: 'negev', partyId: 'shas' }).error).toBe('err.cooldown');
  });
});
