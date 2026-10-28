// Coalition math: pure functions over party lists.
import type { Ministry, Party, PartyDef } from './types.ts';

export function coalitionSeats(parties: PartyDef[], defectors = 0): number {
  return Math.max(0, parties.filter((p) => p.inCoalition).reduce((s, p) => s + p.seats, 0) - defectors);
}

export function hasMajority(parties: PartyDef[], majority = 61, defectors = 0): boolean {
  return coalitionSeats(parties, defectors) >= majority;
}

/** does `p` match a target id/tag (not group targets) */
export function matchesTag(p: PartyDef, idOrTag: string): boolean {
  return p.id === idOrTag || p.tags.includes(idOrTag);
}

/** number of hated parties/tags `p` has to sit with in `coalition` */
export function hateCount(p: PartyDef, coalition: PartyDef[]): number {
  let n = 0;
  for (const other of coalition) {
    if (other.id === p.id) continue;
    if (p.hates.some((h) => matchesTag(other, h))) n++;
  }
  return n;
}

/** ministries held per party id */
export function ministryCounts(ministries: Ministry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of ministries) if (m.holder) out[m.holder] = (out[m.holder] ?? 0) + 1;
  return out;
}

/** fair share of ministries for a coalition party, by seats */
export function fairShare(p: PartyDef, parties: PartyDef[], totalMinistries: number): number {
  const seats = coalitionSeats(parties);
  return seats > 0 ? (p.seats / seats) * totalMinistries : 0;
}

/**
 * Greedy government formation after elections: PM party, then willing parties
 * by closeness of position, skipping a party that hates someone already in
 * (or is hated by them). Returns ids, or null if 61 can't be reached.
 */
export function formGovernment(parties: PartyDef[], pmId: string, majority = 61): string[] | null {
  const pm = parties.find((p) => p.id === pmId);
  if (!pm || pm.seats === 0) return null;
  const chosen: PartyDef[] = [pm];
  let seats = pm.seats;
  const candidates = parties
    .filter((p) => p.id !== pmId && p.seats > 0 && p.willSitWithBibi)
    .sort((a, b) => Math.abs(a.position - pm.position) - Math.abs(b.position - pm.position) || b.seats - a.seats);
  for (const c of candidates) {
    if (seats >= majority) break;
    const conflict = chosen.some((x) => hateCount(c, [x]) > 0 || hateCount(x, [c]) > 0);
    if (conflict) continue;
    chosen.push(c);
    seats += c.seats;
  }
  return seats >= majority ? chosen.map((p) => p.id) : null;
}

/** D'Hondt-style ministry allocation among coalition parties (in ministry list order). */
export function allocateMinistries(ministries: Ministry[], parties: Party[]): Ministry[] {
  const coal = parties.filter((p) => p.inCoalition && p.seats > 0);
  const counts: Record<string, number> = {};
  return ministries.map((m) => {
    let best: Party | null = null;
    let bestQ = -1;
    for (const p of coal) {
      const q = p.seats / ((counts[p.id] ?? 0) + 1);
      if (q > bestQ) { bestQ = q; best = p; }
    }
    if (best) counts[best.id] = (counts[best.id] ?? 0) + 1;
    return { id: m.id, holder: best ? best.id : null };
  });
}
