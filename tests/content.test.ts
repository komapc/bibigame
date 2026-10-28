import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { satDrivers } from '../src/engine/game.ts';
import { DOMESTIC, crisisById } from '../src/data/crises.ts';
import { moveById } from '../src/data/moves.ts';
import { en } from '../src/i18n/en.ts';

const quiet = { eventIntervalDays: 1e9, eventJitterDays: 0, clusterChance: 0, startDate: '2026-05-01', randomStart: false, outcomeNoise: 0 };

describe('satire pack 2', () => {
  it('new cards and moves exist with text', () => {
    for (const id of ['loyaltymatrix', 'prisonpita', 'submarines', 'icecream', 'podcast', 'london', 'president']) {
      expect(crisisById.has(id), id).toBe(true);
      expect(en[`crisis.${id}.title`]).toBeTruthy();
    }
    for (const id of ['blameag', 'lifeitself', 'securitydetail']) {
      expect(moveById.has(id), id).toBe(true);
      expect(en[`remedy.${id}.desc`]).toBeTruthy();
      expect(en[`quip.${id}.0`]).toBeTruthy();
    }
    for (const id of DOMESTIC) expect(crisisById.has(id), id).toBe(true);
  });
  it('the most frequent remedies have 6 quip variants', () => {
    for (const id of ['ministry', 'funds', 'deepstate', 'ignore', 'postpone', 'attackad']) expect(en[`quip.${id}.5`], id).toBeTruthy();
  });
  it('"life itself" drops a domestic card without the ignore penalty, but not a foreign one', () => {
    const g = createGame({ seed: 1, config: quiet });
    g.state.event = { id: 'sara', subject: null, firedAt: g.state.day, leftDays: 10 };
    const appr = g.state.approval;
    expect(g.act({ type: 'move', moveId: 'lifeitself' }).ok).toBe(true);
    expect(g.state.event).toBeNull();
    expect(g.state.approval).toBeGreaterThanOrEqual(appr);
    expect(g.state.tensionUntil).toBeGreaterThan(g.state.day + 100);
    expect(g.act({ type: 'move', moveId: 'lifeitself' }).ok).toBe(false); // cooldown
    const h = createGame({ seed: 1, config: quiet });
    h.state.event = { id: 'trump', subject: null, firedAt: h.state.day, leftDays: 10 };
    h.act({ type: 'move', moveId: 'lifeitself' });
    expect(h.state.event?.id).toBe('trump');
  });
  it('a security detail costs money and keeps the unhappiest partner grateful for a year', () => {
    const g = createGame({ seed: 1, config: quiet });
    const partners = g.state.parties.filter((p) => p.inCoalition && p.id !== g.state.base.pmParty);
    partners[0].satisfaction = 20;
    const fiscal = g.state.fiscal;
    expect(g.act({ type: 'move', moveId: 'securitydetail' }).ok).toBe(true);
    expect(g.state.fiscal).toBeLessThan(fiscal);
    expect(partners[0].satisfaction).toBeGreaterThan(20);
    expect(satDrivers(g.state, partners[0]).some((d) => d.key === 'drift.guarded')).toBe(true);
    g.advanceDays(400);
    expect(satDrivers(g.state, partners[0]).some((d) => d.key === 'drift.guarded')).toBe(false);
  });
  it('blaming the AG: far right up, street down, trial pressure', () => {
    const g = createGame({ seed: 1, config: quiet });
    const fr = g.state.parties.find((p) => p.tags.includes('farright'))!;
    const sat = fr.satisfaction, street = g.state.street;
    expect(g.act({ type: 'move', moveId: 'blameag' }).ok).toBe(true);
    expect(fr.satisfaction).toBeGreaterThan(sat);
    expect(g.state.street).toBeLessThan(street);
    expect(g.state.pressure.court).toBeGreaterThan(0);
  });
});
