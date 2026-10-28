// Spin-doctor advisor and the quarterly "Friday edition": pure functions of the game state.
import type { GameState } from '../engine/types.ts';
import { budgetDueYear, coalition, dateOf, hasTension, loseChance, moveAvailable, partyById, seatsOf } from '../engine/game.ts';
import { becauseOf } from './game.ts';
import { partyLabel } from '../i18n/index.ts';

export interface Advice { id: string; key: string; params?: Record<string, string | number> }

/** every hint that applies right now, most urgent first (the UI/text mode picks one) */
export function advice(s: GameState): Advice[] {
  const c = s.config;
  const out: Advice[] = [];
  const add = (id: string, params?: Advice['params']) => out.push({ id, key: `adv.${id}`, params });
  if (s.status !== 'playing') return out;
  if (s.phase === 'opposition') { add('opposition'); return out; }
  if (s.phase === 'campaign') { add('campaign'); return out; }
  const pname = (id: string) => partyLabel(id, partyById(s, id)?.name ?? id);
  if ((s.lowApprovalDays ?? 0) >= 15) add('collapse', { below: c.collapseBelow, days: Math.max(0, Math.ceil(c.collapseDays - (s.lowApprovalDays ?? 0))) });
  if (s.termEndsDay - s.day <= c.electionOddsDays && (moveAvailable(s, 'electionbudget') || moveAvailable(s, 'groundgame'))) {
    add('levers', { days: Math.ceil(s.termEndsDay - s.day), risk: Math.round(loseChance(s) * 100) });
  }
  if (s.day < 25 && (s.outcomeSeq ?? 0) === 0) add('tutSwipe');
  for (const p of coalition(s)) {
    if (p.id === s.base.pmParty) continue;
    if (p.trust.state === 'believing' && p.trust.until - s.day <= c.promiseWarnDays + 10) {
      add(`waiting:${p.id}`, { party: pname(p.id), days: Math.max(0, Math.ceil(p.trust.until - s.day)) });
      out[out.length - 1].key = 'adv.waiting';
    }
    if (p.satisfaction < c.threatenBelow) {
      add(`mayLeave:${p.id}`, { party: pname(p.id), seats: seatsOf(s) - p.seats });
      out[out.length - 1].key = 'adv.mayLeave';
    }
  }
  if (seatsOf(s) - c.majority <= 1) add('thin');
  if (s.street < 15) add('street');
  if (!s.war.active && s.day - s.lastWarEnd < 40) add('warOver');
  if (s.trial >= 60) add('trial', { n: Math.round(s.trial) });
  const due = budgetDueYear(s);
  const d = dateOf(s);
  if (s.budgetPassedYear < due && (d.getUTCMonth() <= 2 || d.getUTCMonth() === 11)) add('budget');
  if (s.approval < c.pollPanicBelow) add('polls');
  if (s.us < 25) add('us');
  if ((s.trumpMood ?? 0) <= -1.5) add('trump');
  if (s.fiscal < c.fundsMinFiscal) add('fiscal');
  if (hasTension(s) && !s.war.active && s.war.cooldownDays <= 0 && s.approval < 35) add('tension');
  if (s.day < 120) add('tutPromise');
  if (s.day < 200) add('tutMoves');
  return out;
}

/** what the paper compares against: a snapshot at the last edition */
export interface EditionSnap { day: number; seats: number; approval: number; street: number; trial: number; us: number }
export const editionSnap = (s: GameState): EditionSnap => ({
  day: Math.floor(s.day), seats: seatsOf(s), approval: s.approval, street: s.street, trial: s.trial, us: s.us,
});

export interface EditionItem { meter: string; delta: number; because: string }
/** the quarterly recap: what moved since `since`, and the biggest single cause of each move */
export function fridayEdition(s: GameState, since: EditionSnap): { items: EditionItem[]; joke: number } {
  const now = editionSnap(s);
  const recent = (s.outcomes ?? []).filter((o) => o.day >= since.day);
  const items: EditionItem[] = [];
  for (const meter of ['seats', 'approval', 'street', 'trial', 'us'] as const) {
    const delta = Math.round(now[meter] - since[meter]);
    if (Math.abs(delta) < (meter === 'seats' ? 1 : 3)) continue;
    let best: (typeof recent)[number] | undefined;
    let bestD = 0;
    for (const o of recent) {
      const d = meter === 'seats' ? o.seats.to - o.seats.from : o.meters.find((x) => x.meter === meter)?.delta ?? 0;
      if (Math.sign(d) === Math.sign(delta) && Math.abs(d) > Math.abs(bestD)) { bestD = d; best = o; }
    }
    items.push({ meter, delta, because: best ? becauseOf(s, best) : '' });
  }
  items.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { items: items.slice(0, 4), joke: Math.floor(s.day / 90) % 10 };
}
