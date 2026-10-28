import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { runText } from '../src/api/text.ts';
import { CRISES, crisisById, remedyById } from '../src/data/crises.ts';
import { approvalTarget, crisisWeight, remedyAvailable } from '../src/engine/game.ts';

const quiet = { eventIntervalDays: 1e9, eventJitterDays: 0, clusterChance: 0, startDate: '2026-05-01', randomStart: false, outcomeNoise: 0 };

describe('playtest fixes', () => {
  it('a target under the panic line is logged and shown', () => {
    const g = createGame({ seed: 1, config: quiet });
    g.state.trial = 95; g.state.street = 20; g.state.us = 20; g.state.fiscal = 10;
    expect(approvalTarget(g.state)).toBeLessThan(g.state.config.pollPanicBelow);
    g.advanceDays(1);
    expect(g.state.log.some((l) => l.key === 'log.driftPollsDown')).toBe(true);
    expect(g.observe().approvalTarget).toBeLessThan(g.observe().panicBelow);
    expect(runText(g, 'look').reply).toMatch(/drifting toward \d+; partners panic below/);
  });
  it('beepers once per game; polls / reservists / ICC have their own answers', () => {
    expect(remedyById.get('beepers')!.once).toBe(true);
    expect(crisisById.get('polls')!.remedies).toContain('ownpoll');
    expect(crisisById.get('reserve')!.remedies).toEqual(expect.arrayContaining(['reservebill', 'meetpilots']));
    expect(crisisById.get('icc')!.remedies).not.toContain('dc');
    expect(remedyById.get('dc')!.travel).toBe(true); // a trip, like Congress: blocked by a warrant
  });
  it('leftist card only when the far right is unhappy, and repeats get rarer', () => {
    const g = createGame({ seed: 1, config: quiet });
    const leftist = crisisById.get('leftist')!;
    for (const p of g.state.parties) if (p.tags.includes('farright')) p.satisfaction = 80;
    expect(crisisWeight(g.state, leftist)).toBe(0);
    for (const p of g.state.parties) if (p.tags.includes('farright')) p.satisfaction = 40;
    const w0 = crisisWeight(g.state, leftist);
    expect(w0).toBeGreaterThan(0);
    g.state.firedCount = { leftist: 3 };
    expect(crisisWeight(g.state, leftist)).toBeCloseTo(w0 * g.state.config.crisisRepeatDecay ** 3);
  });
  it('repeat cards get different text; the rogue backbencher counts real seats', () => {
    const g = createGame({ seed: 1, config: quiet });
    g.state.event = { id: 'trump', subject: null, firedAt: 0, leftDays: 10 };
    g.state.firedCount = { trump: 1 };
    const a = g.observe().event!.text;
    g.state.firedCount = { trump: 2 };
    expect(g.observe().event!.text).not.toBe(a);
    g.state.event = { id: 'rebel', subject: 'likud', firedAt: 0, leftDays: 10 };
    expect(g.observe().event!.text).toContain(`${g.observe().seats - 1} seats`);
  });
  it('"hand out a ministry" to your own party does something real', () => {
    const g = createGame({ seed: 1, config: quiet });
    g.state.event = { id: 'rebel', subject: 'likud', firedAt: g.state.day, leftDays: 10 };
    const pm = g.state.parties.find((p) => p.id === 'likud')!;
    pm.satisfaction = 40;
    const holders = g.state.ministries.map((m) => m.holder).join();
    g.act({ type: 'choose', optionId: 'ministry' });
    expect(pm.satisfaction).toBeGreaterThan(44);
    expect(g.state.ministries.map((m) => m.holder).join()).toBe(holders);
    expect(g.state.log.some((l) => l.key === 'log.pmPost')).toBe(true);
  });
  it('what a card did on arrival is an outcome on the card, not "drift"', () => {
    const g = createGame({ seed: 1, config: { ...quiet, eventIntervalDays: 3 } });
    let ev = null;
    for (let i = 0; i < 400 && !ev; i++) { g.advanceDays(1); if (g.state.event && crisisById.get(g.state.event.id)?.onFire) ev = g.state.event; else if (g.state.event) g.act({ type: 'choose', optionId: 'ignore' }); }
    expect(ev).not.toBeNull();
    const o = g.observe();
    expect(o.event!.arrival).not.toBeNull();
    expect(o.outcomes.some((x) => x.kind === 'arrival')).toBe(true);
  });
  it('text mode: wait refuses while a card is open; wait! lets it time out', () => {
    const g = createGame({ seed: 1, config: quiet });
    g.state.event = { id: 'sara', subject: null, firedAt: g.state.day, leftDays: 10 };
    const r = runText(g, 'wait 30');
    expect(r.ok).toBe(false);
    expect(r.reply).toMatch(/NOT WAITING/);
    expect(g.state.event).not.toBeNull();
    expect(runText(g, 'wait! 30').reply).toMatch(/Waited/);
    expect(g.state.event).toBeNull();
  });
  it('campaign tricks show in the poll and the risk line', () => {
    const g = createGame({ seed: 1, config: { ...quiet, knessetTermDays: 5 } });
    g.advanceDays(6);
    expect(g.state.phase).toBe('campaign');
    const poll = g.state.campaignPollSeats;
    g.act({ type: 'move', moveId: 'gevalt' });
    expect(g.state.campaignPollSeats).toBe(poll + g.state.config.gevaltSeats);
    expect(runText(g, 'look').reply).toMatch(/tricks applied: gevalt/);
  });
  it('recess has a little bad news too', () => {
    const bad = CRISES.filter((c) => c.requires?.recess && c.badNews);
    expect(bad.length).toBeGreaterThanOrEqual(2);
    const g = createGame({ seed: 1, config: quiet });
    g.state.recess = true;
    expect(bad.every((c) => crisisWeight(g.state, c) > 0)).toBe(true);
    g.state.recess = false;
    expect(bad.every((c) => crisisWeight(g.state, c) === 0)).toBe(true);
    expect(remedyAvailable(g.state, 'ownpoll')).toBe(true);
  });
});
