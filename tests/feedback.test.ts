import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { runText } from '../src/api/text.ts';
import { CRISES } from '../src/data/crises.ts';
import { DEFAULT_CONFIG } from '../src/config.ts';

const untilEvent = (g: ReturnType<typeof createGame>) => {
  for (let i = 0; i < 400 && !g.state.event; i++) g.advanceDays(1);
  return g.state.event!;
};

describe('ignore is a separate option, swipes are real remedies', () => {
  it('no crisis lists ignore as a swipe remedy; every non-urgent card offers ignore', () => {
    for (const c of CRISES) expect(c.remedies, c.id).not.toContain('ignore');
    const g = createGame({ seed: 5 });
    untilEvent(g);
    const opts = g.observe().event!.options;
    expect(opts.filter((o) => ['left', 'right'].includes(o.dir)).every((o) => o.id !== 'ignore')).toBe(true);
    expect(opts.map((o) => o.dir).every((d) => ['left', 'right', 'ignore'].includes(d))).toBe(true);
    for (const c of CRISES) expect(c.remedies.length, c.id).toBeLessThanOrEqual(2);
    expect(opts.find((o) => o.dir === 'ignore')!.id).toBe('ignore');
  });
});

describe('cause → result outcomes', () => {
  it('a choice records an outcome with deltas and the cause', () => {
    const g = createGame({ seed: 7 });
    untilEvent(g);
    const seq = g.state.outcomeSeq;
    expect(g.act({ type: 'choose', optionId: 'left' }).ok).toBe(true);
    const o = g.observe();
    expect(o.outcomeSeq).toBe(seq + 1);
    const r = o.outcomes[o.outcomes.length - 1];
    expect(r.kind).toBe('choice');
    expect(r.cause).toMatch(/you chose/);
    expect(r.summary).toContain('→');
  });

  it('ignoring records an escalation (risk on the same crisis)', () => {
    const g = createGame({ seed: 7 });
    const ev = untilEvent(g);
    g.act({ type: 'choose', optionId: 'ignore' });
    const r = g.observe().outcomes.at(-1)!;
    expect(r.cause).toMatch(/ignored/);
    expect(r.risks.length).toBeGreaterThan(0);
    expect(g.state.pressure[ev.id]).toBeGreaterThan(0);
  });

  it('partners show a passive trend with a reason', () => {
    const g = createGame({ seed: 7 });
    g.advanceDays(10);
    const p = g.observe().parties.find((x) => x.inCoalition && x.id !== 'likud')!;
    expect(p.trend.reason).not.toBe('');
  });

  it('text mode prints a RESULT block after a choice and DRIFT after a wait', () => {
    const g = createGame({ seed: 7 });
    expect(runText(g, 'wait 60').reply).toMatch(/DRIFT:/);
    untilEvent(g);
    expect(runText(g, '0').reply).toMatch(/^RESULT:/m);
  });
});

describe('UI clock config', () => {
  it('engine timeouts match the UI answer budget at the card clock scale', () => {
    const c = DEFAULT_CONFIG;
    expect(Math.abs(c.eventTimeoutDays - (c.uiAnswerMs * c.uiCardClockScale) / c.msPerDay)).toBeLessThan(1);
    expect(Math.abs(c.urgentTimeoutDays - (c.uiUrgentAnswerMs * c.uiCardClockScale) / c.msPerDay)).toBeLessThan(1);
  });
});
