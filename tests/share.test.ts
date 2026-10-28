import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { dailySeed, isDateKey, reignText, shareText, todayKey, whatsappUrl } from '../src/api/share.ts';
import { loadLocale, setLocale } from '../src/i18n/index.ts';

describe('share', () => {
  it('daily seed: same date → same seed and same game; different dates differ', () => {
    expect(dailySeed('2026-10-28')).toBe(dailySeed('2026-10-28'));
    expect(dailySeed('2026-10-28')).not.toBe(dailySeed('2026-10-29'));
    const a = createGame({ seed: dailySeed('2026-10-28') }), b = createGame({ seed: dailySeed('2026-10-28') });
    a.advanceDays(200); b.advanceDays(200);
    expect(a.observe()).toEqual(b.observe());
    expect(isDateKey(todayKey())).toBe(true);
    expect(isDateKey('2026-1-2')).toBe(false);
  });
  it('reign text: years and months, days for short reigns', () => {
    expect(reignText(365.25 * 2 + 4 * 30.44 + 1)).toBe('2 years 4 months');
    expect(reignText(31)).toBe('1 month');
    expect(reignText(12)).toBe('12 days');
  });
  it('share text: reign, wars, title, ending, url; date in daily mode', () => {
    const g = createGame({ seed: 5 });
    const s = g.state;
    s.pmDays = 365.25 * 2 + 130; s.stats.warsEnded = 2; s.titles = ['lapid']; s.status = 'lost'; s.lostReason = 'miami';
    const txt = shareText(s, 'https://example.test/', null);
    expect(txt).toContain('2 years 4 months');
    expect(txt).toContain('2 wars');
    expect(txt).toContain('Moved to Miami');
    expect(txt).toContain('https://example.test/');
    expect(txt).not.toContain('{');
    expect(shareText(s, 'u', '2026-10-28')).toContain('2026-10-28');
    expect(whatsappUrl('a b&c')).toBe('https://wa.me/?text=a%20b%26c');
  });
  it('share text is translated', async () => {
    const g = createGame({ seed: 5 });
    g.state.status = 'lost'; g.state.lostReason = 'voters';
    expect(await loadLocale('ru')).toBe(true);
    setLocale('ru');
    try { expect(shareText(g.state, 'u')).not.toContain('{'); } finally { setLocale('en'); }
  });
});
