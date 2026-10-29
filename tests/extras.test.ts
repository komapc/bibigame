import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { advice, editionSnap, fridayEdition } from '../src/api/extras.ts';
import { runText } from '../src/api/text.ts';
import { partyById } from '../src/engine/game.ts';

describe('advisor + Friday edition', () => {
  it('the advisor starts as a tutorial and reacts to the state', () => {
    const g = createGame({ seed: 1 });
    expect(advice(g.state)[0].id).toBe('tutSwipe');
    g.state.street = 5;
    expect(advice(g.state).map((a) => a.id)).toContain('street');
    const shas = partyById(g.state, 'shas')!;
    shas.trust = { state: 'believing', promiseId: 'exemption', until: g.state.day + 12 };
    const w = advice(g.state).find((a) => a.key === 'adv.waiting')!;
    expect(w.params?.days).toBe(12);
  });
  it('text mode prints an ADVISOR line', () => {
    const g = createGame({ seed: 2 });
    expect(runText(g, 'look').reply).toMatch(/^ADVISOR: /m);
  });
  it('the Friday edition explains what moved and why', () => {
    const g = createGame({ seed: 3 });
    const snap = editionSnap(g.state);
    for (let i = 0; i < 90; i++) {
      if (g.state.event) g.act({ type: 'choose', optionId: g.observe(0).event!.options.find((x) => x.available)!.id });
      g.advanceDays(1);
    }
    const ed = fridayEdition(g.state, snap);
    expect(ed.items.length).toBeGreaterThan(0);
    expect(ed.items.length).toBeLessThanOrEqual(4);
    expect(ed.joke).toBeGreaterThanOrEqual(0);
  });
});
