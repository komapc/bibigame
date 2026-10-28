// Headless game runner for bots and balancing.
import { createGame } from '../api/game.ts';
import type { Config } from '../engine/types.ts';
import type { Strategy } from './strategies.ts';

export interface RunResult {
  strategy: string;
  seed: number;
  status: string;
  termReached: boolean;
  days: number;
  pmDays: number;
  elections: number;
  titles: string[];
}

export interface RunOptions {
  /** stop after this many game years even if still playing */
  maxYears?: number;
  /** strategy is consulted every N days (and whenever a crisis is pending) */
  decideEveryDays?: number;
  config?: Partial<Config>;
}

export function playGame(strategy: Strategy, seed: number, opts: RunOptions = {}): RunResult {
  const g = createGame({ seed, config: opts.config });
  const maxDays = (opts.maxYears ?? 20) * 365.25;
  const every = opts.decideEveryDays ?? 5;
  let lastDecision = -Infinity;
  while (!g.over && g.state.day < maxDays) {
    if (g.state.event || g.state.day - lastDecision >= every) {
      lastDecision = g.state.day;
      for (const a of strategy.decide(g, g.observe(0))) g.act(a);
    }
    g.advanceDays(1);
  }
  return {
    strategy: strategy.name, seed, status: g.state.status, termReached: g.state.termReached,
    days: Math.floor(g.state.day), pmDays: Math.floor(g.state.pmDays), elections: g.state.elections,
    titles: [...g.state.titles],
  };
}
