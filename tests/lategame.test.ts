import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { runText } from '../src/api/text.ts';
import { CRISES } from '../src/data/crises.ts';
import { crisisWeight, eventOptions, loseChance, loseFactors } from '../src/engine/game.ts';
import { advice } from '../src/api/extras.ts';

const quiet = { eventIntervalDays: 1e9, eventJitterDays: 0, clusterChance: 0, startDate: '2026-05-01', randomStart: false, outcomeNoise: 0 };

function toOpposition(seed = 1, config = {}) {
  const g = createGame({ seed, config: { ...quiet, ...config } });
  const s = g.state;
  s.phase = 'opposition';
  s.rival = { stability: 60, until: s.day + 730 };
  for (const p of s.parties) p.inCoalition = false;
  return g;
}

describe('late game', () => {
  it('a paused trial does not grow, and new charges wait', () => {
    const g = createGame({ seed: 1, config: quiet });
    const s = g.state;
    s.trialPausedUntil = s.day + 365;
    const t0 = s.trial;
    g.advanceDays(100);
    expect(s.trial).toBe(t0);
    s.event = { id: 'case', subject: null, firedAt: s.day, leftDays: 10 };
    g.act({ type: 'choose', optionId: 'ignore' });
    expect(s.trial).toBe(t0);
    expect(s.log.some((l) => l.key === 'log.trialFrozen')).toBe(true);
    expect(g.observe().trialPausedDays).toBeGreaterThan(200);
    expect(runText(g, 'look').reply).toMatch(/PAUSED \d+d/);
  });

  it('approval under the floor for 90 days: a warning, then elections', () => {
    const g = createGame({ seed: 1, config: quiet });
    const s = g.state;
    s.termEndsDay = s.day + 2000;
    s.budgetPassedYear = 2100;
    const hold = () => { s.approval = 10; for (const p of s.parties) if (p.inCoalition) p.satisfaction = 80; };
    for (let d = 0; d < 50; d++) { hold(); g.advanceDays(1); }
    expect(s.log.some((l) => l.key === 'log.pollCollapseWarn')).toBe(true);
    expect(advice(s).some((a) => a.id === 'collapse')).toBe(true);
    expect(s.phase).toBe('governing');
    for (let d = 0; d < 45 && s.phase === 'governing'; d++) { hold(); g.advanceDays(1); }
    expect(s.phase).toBe('campaign');
    expect(s.log.some((l) => l.key === 'log.pollCollapse')).toBe(true);
  });

  it('election odds are a sum of visible factors, and the levers move them', () => {
    const g = createGame({ seed: 1, config: quiet });
    const s = g.state;
    s.approval = 30;
    s.openCases = [s.day + 300];
    const f = loseFactors(s);
    expect(f.map((x) => x.id)).toEqual(expect.arrayContaining(['base', 'approval', 'cases']));
    expect(loseChance(s)).toBeCloseTo(f.reduce((n, x) => n + x.delta, 0));
    s.approval = 70;
    expect(loseFactors(s).find((x) => x.id === 'approval')!.delta).toBeLessThan(0);
    // levers only in the last months
    expect(g.observe().moves.find((m) => m.id === 'groundgame')!.available).toBe(false);
    s.termEndsDay = s.day + 100;
    s.approval = 40;
    const o = g.observe();
    expect(o.electionSoon).toBe(true);
    expect(o.moves.find((m) => m.id === 'groundgame')!.available).toBe(true);
    const before = loseChance(s);
    expect(g.act({ type: 'move', moveId: 'groundgame' }).ok).toBe(true);
    expect(loseChance(s)).toBeCloseTo(before - s.config.groundGameLose);
    expect(g.observe().electionFactors.some((x) => x.id === 'groundgame')).toBe(true);
    expect(runText(g, 'look').reply).toMatch(/ELECTION ODDS: \d+%.*ground game -8/);
    // the lever survives into the campaign and is used up by the vote
    s.termEndsDay = s.day;
    g.advanceDays(1);
    expect(s.phase).toBe('campaign');
    expect(s.termFx?.groundGame).toBe(true);
    g.advanceDays(s.config.campaignDays + 2);
    expect(s.termFx?.groundGame).toBeFalsy();
  });

  it('deliver at a premium shows its bill and costs less than the full remedy', () => {
    const g = createGame({ seed: 1, config: quiet });
    const s = g.state;
    const p = s.parties.find((x) => x.inCoalition && x.tags.includes('haredi'))!;
    p.trust = { state: 'angry', promiseId: 'exemption', until: s.day };
    s.event = { id: 'angry', subject: p.id, firedAt: s.day, leftDays: 5 };
    const op = g.observe().event!.options.find((x) => x.id === 'deliverpremium')!;
    expect(op.preview[0].label).toMatch(/^Bill: /);
    const f0 = s.fiscal;
    g.act({ type: 'choose', optionId: 'deliverpremium' });
    expect(p.trust.state).toBe('neutral');
    expect(f0 - s.fiscal).toBeLessThan(20);
  });

  it('opposition cards: only in opposition, no early elections, they hit the rival', () => {
    const opp = CRISES.filter((c) => c.requires?.opposition);
    expect(opp.length).toBeGreaterThanOrEqual(3);
    const gov = createGame({ seed: 1, config: quiet });
    expect(opp.every((c) => crisisWeight(gov.state, c) === 0)).toBe(true);
    const g = toOpposition();
    const s = g.state;
    expect(opp.every((c) => crisisWeight(s, c) > 0)).toBe(true);
    expect(CRISES.filter((c) => !c.requires?.opposition && !c.goodNews).every((c) => crisisWeight(s, c) === 0)).toBe(true);
    s.event = { id: 'oppdefector', subject: null, firedAt: s.day, leftDays: 10 };
    expect(eventOptions(s).find((o) => o.id === 'elections')!.available).toBe(false);
    expect(g.act({ type: 'choose', optionId: 'elections' }).ok).toBe(false);
    const r0 = s.rival!.stability;
    expect(g.act({ type: 'choose', optionId: 'oppwelcome' }).ok).toBe(true);
    expect(s.rival!.stability).toBeLessThan(r0);
    expect(g.act({ type: 'invite', partyId: 'shas' } as never).ok).toBe(false);
  });

  it('opposition cards actually fire in the opposition', () => {
    const g = toOpposition(3, { eventIntervalDays: 10 });
    const seen = new Set<string>();
    for (let d = 0; d < 300 && g.state.phase === 'opposition'; d++) {
      g.advanceDays(1);
      if (g.state.event) { seen.add(g.state.event.id); g.act({ type: 'choose', optionId: 'ignore' }); }
    }
    expect([...seen].some((id) => id.startsWith('opp'))).toBe(true);
  });
});
