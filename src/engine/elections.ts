// Re-elections: noise around the base seat distribution, threshold, largest remainder.
import type { PartyDef } from './types.ts';
import { gaussian, type Rng } from './rng.ts';

export interface ElectionParams {
  totalSeats: number;
  threshold: number;
  /** relative std-dev of noise per party */
  noise: number;
  /** minimal absolute std-dev in seats */
  noiseMin: number;
  /** extra seats for the PM party (from approval) */
  pmBonus: number;
  pmId: string;
}

/** Returns new seat counts by party id; sums to totalSeats exactly. */
export function runElection(base: PartyDef[], params: ElectionParams, rng: Rng): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const p of base) {
    const sd = Math.max(params.noiseMin, p.seats * params.noise);
    let v = p.seats + gaussian(rng) * sd;
    if (p.id === params.pmId) v += params.pmBonus;
    raw[p.id] = Math.max(0, v);
  }
  // threshold: parties below it get nothing
  let passed = base.filter((p) => raw[p.id] >= params.threshold);
  if (passed.length === 0) passed = [...base].sort((a, b) => raw[b.id] - raw[a.id]).slice(0, 1);
  const total = passed.reduce((s, p) => s + raw[p.id], 0);
  const out: Record<string, number> = Object.fromEntries(base.map((p) => [p.id, 0]));
  const quotas = passed.map((p) => {
    const q = (raw[p.id] / total) * params.totalSeats;
    out[p.id] = Math.floor(q);
    return { id: p.id, rem: q - Math.floor(q) };
  });
  let left = params.totalSeats - quotas.reduce((s, q) => s + out[q.id], 0);
  quotas.sort((a, b) => b.rem - a.rem);
  for (let i = 0; left > 0; i = (i + 1) % quotas.length, left--) out[quotas[i].id]++;
  return out;
}
