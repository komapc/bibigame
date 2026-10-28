import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { moveAvailable } from '../src/engine/game.ts';

const quiet = { eventIntervalDays: 1e9, eventJitterDays: 0, clusterChance: 0, startDate: '2026-05-01' };

/** a game whose scheduled elections come on day 5 and that the voters always reject */
function losing(extra = {}) {
  return createGame({ seed: 3, config: { ...quiet, knessetTermDays: 5, loseBase: 1, loseMax: 1, ...extra } });
}

describe('opposition', () => {
  it('first lost election sends you to the opposition, the second ends the game', () => {
    const g = losing();
    g.advanceDays(5 + g.state.config.campaignDays + 2);
    expect(g.state.status).toBe('playing');
    expect(g.state.phase).toBe('opposition');
    expect(g.observe().opposition?.stability).toBeGreaterThan(0);
    const pm = g.state.pmDays;
    g.advanceDays(30);
    expect(g.state.pmDays).toBe(pm); // no PM time in opposition
    // topple them: stability 0 → elections → lost again → game over
    g.state.rival!.stability = 0.01;
    g.advanceDays(2 + g.state.config.campaignDays + 2);
    expect(g.state.status).toBe('lost');
    expect(g.state.lostReason).toBe('voters');
  });
  it('a won election from the opposition is a return (title)', () => {
    const g = losing();
    g.advanceDays(5 + g.state.config.campaignDays + 2);
    expect(g.state.phase).toBe('opposition');
    g.state.config.loseBase = 0; g.state.config.loseMax = 0;
    expect(g.act({ type: 'move', moveId: 'oppattack' }).ok).toBe(true);
    expect(g.act({ type: 'move', moveId: 'oppattack' }).ok).toBe(false); // cooldown
    g.state.rival!.stability = 0;
    for (let i = 0; i < 20 && g.state.phase === 'opposition'; i++) {
      g.state.moveReadyAt.noconfidence = 0;
      expect(g.act({ type: 'move', moveId: 'noconfidence' }).ok).toBe(true); // 90% at stability 0
    }
    expect(g.state.phase).toBe('campaign');
    g.advanceDays(g.state.config.campaignDays + 2);
    if (g.state.phase === 'governing') {
      expect(g.state.stats.returns).toBe(1);
      expect(g.state.titles).toContain('shiva');
    }
  });
  it('governing actions are rejected in opposition', () => {
    const g = losing();
    g.advanceDays(5 + g.state.config.campaignDays + 2);
    expect(g.act({ type: 'passLaw', lawId: 'reform' }).error).toBe('err.opposition');
  });
});

describe('rotation', () => {
  it('a rotation promise fires the rotation card; handing over ends the game with a title', () => {
    const g = createGame({ seed: 1, config: quiet });
    const partner = g.state.parties.find((p) => p.inCoalition && p.id !== g.state.base.pmParty && p.seats >= 4)!;
    const sat0 = partner.satisfaction;
    expect(g.act({ type: 'promise', partyId: partner.id, promiseId: 'rotation' }).ok).toBe(true);
    expect(partner.satisfaction).toBeGreaterThan(sat0 + 20);
    const other = g.state.parties.find((p) => p.inCoalition && p.id !== partner.id && p.id !== g.state.base.pmParty && p.seats >= 4)!;
    expect(g.act({ type: 'promise', partyId: other.id, promiseId: 'rotation' }).error).toBe('err.oneRotation');
    expect(g.act({ type: 'deliver', partyId: partner.id, promiseId: 'rotation' }).ok).toBe(false);
    partner.trust.until = g.state.day + 1;
    partner.satisfaction = 90;
    g.state.budgetPassedYear = 2100;
    g.advanceDays(3);
    expect(g.state.event?.id).toBe('rotation');
    expect(g.observe().event!.options.map((o) => o.id)).toEqual(['handover', 'breakrotation', 'elections']);
    g.act({ type: 'choose', optionId: 'handover' });
    expect(g.state.status).toBe('retired');
    expect(g.state.lostReason).toBe('rotation');
    expect(g.state.titles).toContain('rotated');
  });
  it('breaking it means legendary distrust', () => {
    const g = createGame({ seed: 1, config: quiet });
    const partner = g.state.parties.find((p) => p.inCoalition && p.id !== g.state.base.pmParty && p.seats >= 4)!;
    g.act({ type: 'promise', partyId: partner.id, promiseId: 'rotation' });
    partner.trust.until = g.state.day + 1;
    partner.satisfaction = 90;
    g.state.budgetPassedYear = 2100;
    g.advanceDays(3);
    g.act({ type: 'choose', optionId: 'breakrotation' });
    expect(partner.trust.state).toBe('distrust');
    expect(partner.trust.until - g.state.day).toBeGreaterThan(600);
    expect(partner.satisfaction).toBeLessThanOrEqual(50);
  });
});

describe('moves', () => {
  it('poach moves a seat from the opposition to Likud', () => {
    const g = createGame({ seed: 1, config: quiet });
    const seats = g.observe().seats;
    expect(g.act({ type: 'move', moveId: 'poach' }).ok).toBe(true);
    expect(g.observe().seats).toBe(seats + 1);
    expect(g.state.parties.reduce((n, p) => n + p.seats, 0)).toBe(120);
  });
  it('new ministry adds a chair (capped)', () => {
    const g = createGame({ seed: 1, config: quiet });
    const n = g.state.ministries.length;
    expect(g.act({ type: 'move', moveId: 'newministry' }).ok).toBe(true);
    expect(g.state.ministries.length).toBe(n + 1);
    expect(g.state.ministries[n].holder).not.toBeNull();
  });
  it('campaign tricks only in a campaign; postponing elections only at war near elections', () => {
    const g = createGame({ seed: 1, config: quiet });
    expect(moveAvailable(g.state, 'gevalt')).toBe(false);
    expect(moveAvailable(g.state, 'postponeelections')).toBe(false);
    g.state.war = { active: true, leftDays: 60, cooldownDays: 300 };
    g.state.termEndsDay = g.state.day + 200;
    expect(moveAvailable(g.state, 'postponeelections')).toBe(true);
    g.act({ type: 'move', moveId: 'postponeelections' });
    expect(g.state.termEndsDay).toBeGreaterThan(g.state.day + 500);
    const h = createGame({ seed: 1, config: { ...quiet, knessetTermDays: 5 } });
    h.advanceDays(6);
    expect(h.state.phase).toBe('campaign');
    expect(h.act({ type: 'move', moveId: 'gevalt' }).ok).toBe(true);
    expect(h.act({ type: 'move', moveId: 'gevalt' }).ok).toBe(false);
    expect(h.act({ type: 'move', moveId: 'merger' }).ok).toBe(true);
    expect(h.state.campaignFx).toMatchObject({ gevalt: true, merger: true });
  });
  it('Miami and the plea bargain are endings with titles', () => {
    const g = createGame({ seed: 1, config: quiet });
    expect(moveAvailable(g.state, 'plea')).toBe(false); // trial too low
    g.state.trial = 60;
    expect(moveAvailable(g.state, 'plea')).toBe(true);
    g.act({ type: 'move', moveId: 'exilemiami' });
    expect(g.state.status).toBe('retired');
    expect(g.state.titles).toContain('miamivice');
    expect(g.act({ type: 'noop' }).ok).toBe(false);
  });
});
