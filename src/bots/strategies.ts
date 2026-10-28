// Bot strategies for headless play + balancing. A strategy looks at the game
// and returns zero or more actions to take *now*. Randomness is seeded.
import type { Action } from '../engine/types.ts';
import { makeRng } from '../engine/rng.ts';
import { type Game, type Observation, promisesFor } from '../api/game.ts';

export interface Strategy {
  name: string;
  decide(game: Game, obs: Observation): Action[];
}

/** score a game state from Bibi's point of view (used by greedy/lookahead) */
export function scoreState(g: Game): number {
  const s = g.state;
  if (s.status === 'lost') return -1e6;
  const o = g.observe(0);
  let sc = o.phase === 'campaign' ? -400 : 0;
  sc += 12 * Math.min(o.seats - o.majority, 6);
  sc += 1.5 * o.meters.approval;
  for (const p of o.parties) {
    if (!p.inCoalition || p.id === s.base.pmParty) continue;
    sc += Math.min(p.satisfaction, 60) * (p.seats / 8);
    if (p.satisfaction < 15) sc -= 40 * (p.seats / 6);
    if (p.threatening) sc -= 15;
  }
  if (!o.budget.passed) sc -= 5;
  return sc;
}

export const neverAct: Strategy = { name: 'never-act', decide: () => [] };

export function randomBot(seed = 1): Strategy {
  const rng = makeRng(seed ^ 0x5eed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rng.next() * xs.length)];
  return {
    name: 'random',
    decide(_g, o) {
      const acts: Action[] = [];
      if (o.phase !== 'governing') return acts;
      if (o.event && rng.next() < 0.3) {
        const opts = o.event.options.filter((x) => x.available);
        acts.push({ type: 'choose', optionId: pick(opts).id });
      }
      if (rng.next() < 0.05) {
        const r = rng.next();
        const parties = o.parties.filter((p) => p.seats > 0);
        const party = pick(parties);
        if (r < 0.25) acts.push({ type: 'startWar' });
        else if (r < 0.5) acts.push({ type: 'passLaw', lawId: pick(o.laws).id });
        else if (r < 0.75) acts.push({ type: 'invite', partyId: party.id });
        else acts.push({ type: 'giveMinistry', ministryId: pick(o.ministries).id, partyId: pick(parties.filter((p) => p.inCoalition)).id });
      }
      return acts;
    },
  };
}

export const alwaysWar: Strategy = {
  name: 'always-war',
  decide(_g, o) {
    const acts: Action[] = [];
    if (!o.war.active && o.war.cooldownDays === 0) acts.push({ type: 'startWar' });
    if (o.event) {
      const w = o.event.options.find((x) => x.id === 'war' && x.available);
      acts.push({ type: 'choose', optionId: w ? 'war' : 'ignore' });
    }
    return acts;
  },
};

export const promiseSpammer: Strategy = {
  name: 'promise-spammer',
  decide(g, o) {
    const acts: Action[] = [];
    for (const p of o.parties) {
      if (p.seats === 0 || p.trust.state !== 'neutral') continue;
      const ids = promisesFor(g.state, p.id);
      if (ids.length) acts.push({ type: 'promise', partyId: p.id, promiseId: ids[0] });
    }
    if (o.event) acts.push({ type: 'choose', optionId: 'ignore' });
    return acts;
  },
};

/** pick the event option whose immediate (or short-rollout) result scores best */
function bestOption(g: Game, o: Observation, rolloutDays: number): string | null {
  if (!o.event) return null;
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const opt of o.event.options) {
    if (!opt.available) continue;
    const c = g.clone();
    c.act({ type: 'choose', optionId: opt.id });
    if (rolloutDays) c.advanceDays(rolloutDays);
    const sc = scoreState(c);
    if (sc > bestScore) { bestScore = sc; best = opt.id; }
  }
  return best;
}

/** evaluate a proactive action by rollout; returns gain vs doing nothing */
function gainOf(g: Game, a: Action, days: number, baseline: number): number {
  const c = g.clone();
  if (!c.act(a).ok) return -Infinity;
  c.advanceDays(days);
  return scoreState(c) - baseline;
}

/**
 * Greedy-satisfaction: answers crises by immediate score, fixes the unhappiest
 * partner with ministries and promises, and delivers promises before they expire.
 */
export function greedy(lookaheadDays = 0, name = 'greedy'): Strategy {
  return {
    name,
    decide(g, o) {
      const acts: Action[] = [];
      const s = g.state;
      if (o.phase !== 'governing') return acts;
      if (o.event) {
        const b = bestOption(g, o, lookaheadDays);
        if (b) acts.push({ type: 'choose', optionId: b });
      }
      const partners = o.parties.filter((p) => p.inCoalition && p.id !== s.base.pmParty)
        .sort((a, b) => a.satisfaction - b.satisfaction);
      const worst = partners[0];
      // deliver promises that are about to expire (if not too costly)
      const horizon = Math.max(30, lookaheadDays);
      const baseline = (() => { const c = g.clone(); c.advanceDays(horizon); return scoreState(c); })();
      if (o.cooldowns.law === 0) {
        for (const p of o.parties) {
          if (p.trust.state === 'believing' && p.trust.daysLeft < 30 && p.trust.promiseId) {
            const a: Action = { type: 'deliver', partyId: p.id, promiseId: p.trust.promiseId };
            if (gainOf(g, a, horizon, baseline) > -10) { acts.push(a); break; }
          }
        }
      }
      // ministry to the unhappiest partner
      if (worst && worst.satisfaction < 35 && o.cooldowns.ministry === 0) {
        const donors = partners.filter((p) => p.id !== worst.id && p.satisfaction > 55 && p.ministries.length);
        const pm = o.parties.find((p) => p.id === s.base.pmParty)!;
        const from = pm.ministries.length > 2 ? pm : donors.sort((a, b) => b.satisfaction - a.satisfaction)[0];
        if (from) acts.push({ type: 'giveMinistry', ministryId: from.ministries[0], partyId: worst.id });
      }
      // promise to an unhappy partner only if we could deliver it cheaply later
      if (worst && worst.satisfaction < 40 && worst.trust.state === 'neutral') {
        const ids = promisesFor(s, worst.id);
        let bestId: string | null = null;
        let bestGain = -Infinity;
        for (const id of ids) {
          const gain = gainOf(g, { type: 'promise', partyId: worst.id, promiseId: id }, horizon, baseline);
          if (gain > bestGain) { bestGain = gain; bestId = id; }
        }
        if (bestId && bestGain > 0) acts.push({ type: 'promise', partyId: worst.id, promiseId: bestId });
      }
      // thin majority: try to widen it
      if (o.seats < o.majority + 3 && o.cooldowns.invite === 0) {
        const cand = o.parties.filter((p) => !p.inCoalition && p.seats > 0 && p.willSitWithBibi)
          .sort((a, b) => Math.abs(a.position - o.govPosition) - Math.abs(b.position - o.govPosition))[0];
        if (cand) acts.push({ type: 'invite', partyId: cand.id });
      }
      // emergency button when the coalition is about to break
      if (o.seats < o.majority + 2 && partners.some((p) => p.satisfaction < 10) && !o.war.active && o.war.cooldownDays === 0) {
        if (gainOf(g, { type: 'startWar' }, horizon, baseline) > 0) acts.push({ type: 'startWar' });
      }
      return acts;
    },
  };
}

export const STRATEGIES: Record<string, (seed: number) => Strategy> = {
  'never-act': () => neverAct,
  random: (seed) => randomBot(seed),
  'always-war': () => alwaysWar,
  'promise-spammer': () => promiseSpammer,
  greedy: () => greedy(0, 'greedy'),
  lookahead: () => greedy(45, 'lookahead'),
};
