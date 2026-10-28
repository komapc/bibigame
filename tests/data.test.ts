import { describe, expect, it } from 'vitest';
import { DEFAULT_KNESSET } from '../src/api/game.ts';
import { CRISES, REMEDIES, crisisById, remedyById } from '../src/data/crises.ts';
import { PROMISES } from '../src/data/promises.ts';
import { TITLES } from '../src/data/titles.ts';
import { en } from '../src/i18n/en.ts';

describe('data files', () => {
  it('knesset seats sum to 120 and ids are unique', () => {
    expect(DEFAULT_KNESSET.parties.reduce((s, p) => s + p.seats, 0)).toBe(120);
    expect(new Set(DEFAULT_KNESSET.parties.map((p) => p.id)).size).toBe(DEFAULT_KNESSET.parties.length);
  });
  it('initial coalition has a majority and ministries go to coalition parties', () => {
    const coal = DEFAULT_KNESSET.parties.filter((p) => p.inCoalition);
    expect(coal.reduce((s, p) => s + p.seats, 0)).toBeGreaterThanOrEqual(61);
    for (const m of DEFAULT_KNESSET.ministries) expect(coal.map((p) => p.id)).toContain(m.holder);
  });
  it('crisis graph is consistent', () => {
    for (const c of CRISES) {
      for (const r of c.remedies) if (r !== 'ignore') expect(remedyById.has(r), `${c.id} -> ${r}`).toBe(true);
    }
    for (const r of REMEDIES) for (const b of r.backfires) expect(crisisById.has(b), `${r.id} backfires ${b}`).toBe(true);
    for (const p of PROMISES) if (p.deliveredBy !== 'ministry') expect(remedyById.has(p.deliveredBy)).toBe(true);
  });
  it('every id has English text', () => {
    for (const c of CRISES) { expect(en[`crisis.${c.id}.title`]).toBeTruthy(); expect(en[`crisis.${c.id}.text`]).toBeTruthy(); }
    for (const r of REMEDIES) expect(en[`remedy.${r.id}`], r.id).toBeTruthy();
    for (const p of PROMISES) expect(en[`promise.${p.id}`]).toBeTruthy();
    for (const t of TITLES) { expect(en[`title.${t.id}`]).toBeTruthy(); expect(en[`title.${t.id}.gloss`]).toBeTruthy(); }
    for (const m of DEFAULT_KNESSET.ministries) expect(en[`ministry.${m.id}`]).toBeTruthy();
  });
});
