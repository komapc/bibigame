// Game-over share text and the daily seed ("Today's Knesset"). Pure: no DOM.
import type { GameState } from '../engine/types.ts';
import { t, tp } from '../i18n/index.ts';

/** local calendar date as YYYY-MM-DD */
export function todayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isDateKey(x: string | null | undefined): x is string {
  return !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);
}

/** the same seed for everyone on a given date (FNV-1a over the date string) */
export function dailySeed(date: string): number {
  let h = 0x811c9dc5;
  for (const ch of `bibigame:${date}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % 1e9;
}

/** "2 years 4 months" (or "3 months" / "12 days" for short reigns) */
export function reignText(pmDays: number): string {
  const totalMonths = Math.floor(pmDays / 30.44);
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  if (y === 0 && m === 0) return tp('unit.days', Math.max(1, Math.floor(pmDays)));
  return [y ? tp('unit.years', y) : '', m ? tp('unit.months', m) : ''].filter(Boolean).join(' ');
}

/** a short, funny summary for WhatsApp & co. (current language; no personal data) */
export function shareText(s: GameState, url: string, daily?: string | null): string {
  const why = s.status === 'won' ? 'won' : s.lostReason ?? 'deadlock';
  const wars = s.stats.warsEnded + (s.war.active ? 1 : 0);
  const title = s.titles.length ? t(`title.${s.titles[s.titles.length - 1]}`) : t('share.noTitle');
  const lines = [
    daily ? t('share.daily', { date: daily }) : '',
    t('share.summary', { reign: reignText(s.pmDays), wars: tp('share.wars', wars), title, ending: t(`over.${why}.title`) }),
    t('share.beat', { url }),
  ];
  return lines.filter(Boolean).join('\n');
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
