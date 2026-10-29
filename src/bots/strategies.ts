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
  if (s.status === 'lost' || s.status === 'retired') return -1e6;
  const o = g.observe(0);
  if (o.opposition) return -800 + 1.5 * o.meters.approval - 4 * o.opposition.stability - 3 * Math.max(0, o.meters.trial - 50);
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
  // a decent player watches the trial (indictment ends the game) and re-election odds
  sc -= 3 * Math.max(0, o.meters.trial - 50);
  sc -= 150 * o.electionRisk;
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
      // a random player also tries the drawer moves now and then (never the game-ending exits)
      const moves = o.moves.filter((m) => m.available && !m.ending);
      if (moves.length && rng.next() < (o.phase === 'governing' ? 0.02 : 0.05)) acts.push({ type: 'move', moveId: pick(moves).id });
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

/** answers every card with the same side (if that side is greyed out: the other one, else ignore) */
export function sideBot(dir: 'left' | 'right'): Strategy {
  return {
    name: `always-${dir}`,
    decide(_g, o) {
      if (!o.event) return [];
      const opts = o.event.options.filter((x) => x.available && x.dir !== 'ignore');
      const op = opts.find((x) => x.dir === dir) ?? opts[0];
      return [{ type: 'choose', optionId: op?.id ?? 'ignore' }];
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
/** clone for "what if" rollouts WITHOUT peeking at the real future: the copy gets its own RNG
 *  stream, so bots can't foresee upcoming crises/elections (they'd be oracles otherwise) */
function blindClone(g: Game, k = 0): Game {
  const c = g.clone();
  c.state.rngState = (Math.imul(c.state.rngState ^ (0x9e3779b9 + k * 0x6d2b79f5), 0x85ebca6b) ^ (c.state.day * 7919)) >>> 0;
  return c;
}

/** mean score over `n` blind rollouts (one rollout of a random future is mostly noise) */
function rolloutScore(g: Game, first: Action | null, days: number, n: number): number {
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const c = blindClone(g, k);
    if (first && !c.act(first).ok) return -Infinity;
    if (days) c.advanceDays(days);
    sum += scoreState(c);
  }
  return sum / n;
}

function bestOption(g: Game, o: Observation, rolloutDays: number, n: number): string | null {
  if (!o.event) return null;
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const opt of o.event.options) {
    if (!opt.available) continue;
    const a: Action = { type: 'choose', optionId: opt.id };
    const sc = rolloutDays ? rolloutScore(g, a, rolloutDays, n) : rolloutScore(g, a, 0, 1);
    if (sc > bestScore) { bestScore = sc; best = opt.id; }
  }
  return best;
}

/** evaluate a proactive action by rollout; returns gain vs doing nothing */
function gainOf(g: Game, a: Action, days: number, baseline: number, n = 1): number {
  return rolloutScore(g, a, days, n) - baseline;
}

/**
 * Greedy-satisfaction: answers crises by immediate score, fixes the unhappiest
 * partner with ministries and promises, and delivers promises before they expire.
 */
export function greedy(lookaheadDays = 0, name = 'greedy', rollouts = 1): Strategy {
  return {
    name,
    decide(g, o) {
      const acts: Action[] = [];
      const s = g.state;
      const ready = (id: string) => o.moves.some((m) => m.id === id && m.available);
      if (o.phase === 'campaign') {
        for (const id of ['merger', 'gevalt']) if (ready(id)) acts.push({ type: 'move', moveId: id });
        if (ready('spoiler') && o.meters.trial < 70) acts.push({ type: 'move', moveId: 'spoiler' });
        return acts;
      }
      if (o.opposition) {
        if (ready('noconfidence') && o.opposition.stability < 20) acts.push({ type: 'move', moveId: 'noconfidence' });
        for (const id of ['opppoach', 'oppattack']) if (ready(id)) acts.push({ type: 'move', moveId: id });
        return acts;
      }
      if (o.phase !== 'governing') return acts;
      if (o.event) {
        const b = bestOption(g, o, lookaheadDays, rollouts);
        if (b) acts.push({ type: 'choose', optionId: b });
      }
      const partners = o.parties.filter((p) => p.inCoalition && p.id !== s.base.pmParty)
        .sort((a, b) => a.satisfaction - b.satisfaction);
      const worst = partners[0];
      // deliver promises that are about to expire (if not too costly)
      const horizon = Math.max(30, lookaheadDays);
      let base: number | undefined;
      const baseline = () => (base ??= rolloutScore(g, null, horizon, rollouts));
      if (o.cooldowns.law === 0) {
        for (const p of o.parties) {
          if (p.trust.state === 'believing' && p.trust.daysLeft < 30 && p.trust.promiseId) {
            const a: Action = { type: 'deliver', partyId: p.id, promiseId: p.trust.promiseId };
            if (gainOf(g, a, horizon, baseline(), rollouts) > -10) { acts.push(a); break; }
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
          const gain = gainOf(g, { type: 'promise', partyId: worst.id, promiseId: id }, horizon, baseline(), rollouts);
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
      // drawer moves: the one with the best rollout gain, if clearly positive (never the exits)
      // (once a month: rollouts per move are the slowest part of the bot)
      if (!o.event && Math.floor(s.day) % 30 < 5) {
        let bestMove: string | null = null;
        let bestMoveGain = 8;
        for (const m of o.moves) {
          if (!m.available || m.ending) continue;
          // a handful of rollouts can't price a ~25% election-loss roll: only gamble on snap elections when the majority is already gone
          if (m.id === 'elections' && o.seats >= o.majority) continue;
          const gain = gainOf(g, { type: 'move', moveId: m.id }, horizon, baseline(), rollouts);
          if (gain > bestMoveGain) { bestMoveGain = gain; bestMove = m.id; }
        }
        if (bestMove) acts.push({ type: 'move', moveId: bestMove });
      }
      // emergency button when the coalition is about to break
      if (o.seats < o.majority + 2 && partners.some((p) => p.satisfaction < 10) && !o.war.active && o.war.cooldownDays === 0) {
        if (gainOf(g, { type: 'startWar' }, horizon, baseline(), rollouts) > 0) acts.push({ type: 'startWar' });
      }
      return acts;
    },
  };
}


/** card-only human proxies (no rollouts, no drawer): they read the HUD and the immediate result of
 *  each option, like a careful player. card-only-hud-aware is the primary "decent human" target. */
function cardOnly(name: string, value: (g: Game, c: Game) => number): Strategy {
  return {
    name,
    decide(g, o) {
      if (!o.event || o.phase === 'campaign') return [];
      if (o.phase === 'opposition') {
        // opposition cards: whatever brings the rival government down without sinking approval
        let best: string | null = null;
        let bs = -Infinity;
        for (const op of o.event.options) {
          if (!op.available) continue;
          const c = g.clone();
          if (!c.act({ type: 'choose', optionId: op.id }).ok) continue;
          const v = (c.state.phase !== 'opposition' ? 100 : 0) + ((g.state.rival?.stability ?? 0) - (c.state.rival?.stability ?? 0))
            + 1.5 * (c.state.approval - g.state.approval) + 0.2 * (c.state.street - g.state.street);
          if (v > bs) { bs = v; best = op.id; }
        }
        return best ? [{ type: 'choose', optionId: best }] : [];
      }
      if (o.event.id === 'angry' && o.event.options.some((x) => x.id === 'deliverpremium' && x.available)) return [{ type: 'choose', optionId: 'deliverpremium' }];
      let best: string | null = null;
      let bs = -Infinity;
      for (const op of o.event.options) {
        if (!op.available) continue;
        const c = g.clone();
        if (!c.act({ type: 'choose', optionId: op.id }).ok) continue;
        const v = (c.state.phase !== 'governing' ? -1000 : 0) + value(g, c);
        if (v > bs) { bs = v; best = op.id; }
      }
      return best ? [{ type: 'choose', optionId: best }] : [];
    },
  };
}

const coalSat = (s: Game['state']) => s.parties.filter((p) => p.inCoalition).reduce((n, p) => n + p.satisfaction * p.seats, 0);

export const cardOnlyTrialAware = cardOnly('card-only-trial-aware', (g, c) => {
  const s = c.state, s0 = g.state;
  if (s0.event?.id === 'budget' && s.budgetPassedYear > s0.budgetPassedYear) return 1e3;
  return (coalSat(s) - coalSat(s0)) / 10 + (s.approval - s0.approval) - 2 * (s.trial - s0.trial) + (s.trialPausedUntil > s0.trialPausedUntil ? 5 : 0);
});

export const cardOnlyHudAware = cardOnly('card-only-hud-aware', (g, c) => {
  const s = c.state, s0 = g.state;
  const pm = s.base.pmParty;
  const partners = s.parties.filter((p) => p.inCoalition && p.id !== pm);
  const coalMin = partners.length ? Math.min(...partners.map((p) => p.satisfaction)) : 100;
  let v = s.parties.filter((p) => p.inCoalition).reduce((n, p) => {
    const before = s0.parties.find((q) => q.id === p.id)!.satisfaction;
    return n + (Math.min(p.satisfaction, 70) - Math.min(before, 70)) * p.seats;
  }, 0) / 10;
  v += 1.5 * (s.approval - s0.approval) + 0.3 * (s.street - s0.street) + 0.3 * (s.fiscal - s0.fiscal) + 0.2 * (s.us - s0.us)
    - 2 * (s.trial - s0.trial) + (s.trialPausedUntil > s0.trialPausedUntil ? 6 : 0) + (s.budgetPassedYear > s0.budgetPassedYear ? 20 : 0);
  if (coalMin < 20) v -= 30;
  return v;
});

export const STRATEGIES: Record<string, (seed: number) => Strategy> = {
  'never-act': () => neverAct,
  random: (seed) => randomBot(seed),
  'always-left': () => sideBot('left'),
  'always-right': () => sideBot('right'),
  'always-war': () => alwaysWar,
  'promise-spammer': () => promiseSpammer,
  'card-only-trial-aware': () => cardOnlyTrialAware,
  'card-only-hud-aware': () => cardOnlyHudAware,
  greedy: () => greedy(0, 'greedy'),
  lookahead: () => greedy(30, 'lookahead', 4),
};
