import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { approvalTarget, satDrivers, warRally } from '../src/engine/game.ts';

describe('war has a price', () => {
  it('the rally fades as the war drags on', () => {
    const g = createGame({ seed: 1 });
    g.act({ type: 'startWar' });
    const start = warRally(g.state);
    g.state.war.leftDays = 0;
    expect(warRally(g.state)).toBeLessThan(start);
    expect(warRally(g.state)).toBeCloseTo(g.state.config.warApprovalBonusTarget * g.state.config.warRallyMinShare);
  });
  it('every day of war costs budget health', () => {
    const peace = createGame({ seed: 1 }), war = createGame({ seed: 1 });
    war.state.war = { active: true, leftDays: 90, cooldownDays: 300 };
    peace.state.fiscal = war.state.fiscal = 50;
    peace.advanceDays(10); war.advanceDays(10);
    expect(war.state.fiscal).toBeLessThan(peace.state.fiscal);
  });
});

describe('an empty treasury hurts', () => {
  it('lowers the approval target', () => {
    const g = createGame({ seed: 1 });
    g.state.fiscal = g.state.config.fiscalCrisisBelow;
    const ok = approvalTarget(g.state);
    g.state.fiscal -= 0.01;
    expect(approvalTarget(g.state)).toBeLessThan(ok - g.state.config.fiscalCrisisApproval + 0.1);
  });
  it('sours the partners, and says why', () => {
    const g = createGame({ seed: 1 });
    g.state.fiscal = 0;
    const p = g.state.parties.find((x) => x.inCoalition && x.id !== g.state.base.pmParty)!;
    expect(satDrivers(g.state, p).some((d) => d.key === 'drift.treasury' && d.perDay < 0)).toBe(true);
  });
});
