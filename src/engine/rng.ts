// Seeded PRNG (mulberry32). State is a plain number so it lives in GameState
// and the whole game stays serializable + deterministic.

export interface Rng {
  next(): number; // [0,1)
  state: number;
}

export function makeRng(seed: number): Rng {
  const rng: Rng = {
    state: seed >>> 0,
    next() {
      rng.state = (rng.state + 0x6d2b79f5) >>> 0;
      let t = rng.state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
  return rng;
}

export function gaussian(rng: Rng): number {
  // Box–Muller
  const u = Math.max(rng.next(), 1e-12);
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pickWeighted<T>(rng: Rng, items: { item: T; weight: number }[]): T | null {
  const total = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const i of items) {
    r -= Math.max(0, i.weight);
    if (r < 0) return i.item;
  }
  return items[items.length - 1].item;
}
