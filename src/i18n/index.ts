// i18n: every user-facing string lives in a locale dictionary keyed like en.ts.
// en.ts is the source of truth; other locales may lag — missing keys fall back to English.
import { en } from './en.ts';
import type { LogEntry } from '../engine/types.ts';

export type Lang = 'en' | 'ru' | 'he';
export const LANGS: { code: Lang; label: string; rtl: boolean }[] = [
  { code: 'en', label: 'EN', rtl: false },
  { code: 'ru', label: 'RU', rtl: false },
  { code: 'he', label: 'עב', rtl: true },
];

type Dict = Record<string, string>;
const dicts: Partial<Record<Lang, Dict>> = { en };
let current: Lang = 'en';
let dict: Dict = en;

export const isLang = (x: unknown): x is Lang => LANGS.some((l) => l.code === x);

/** Load a locale's dictionary (./ru.ts, ./he.ts). Resolves false if the file is missing. */
export async function loadLocale(code: Lang): Promise<boolean> {
  if (dicts[code]) return true;
  try {
    const m = (await import(`./${code}.ts`)) as Record<string, unknown>;
    const d = (m[code] ?? m.default) as Dict | undefined;
    if (!d) return false;
    dicts[code] = d;
    return true;
  } catch {
    return false;
  }
}

/** Switch the active locale (must be loaded; unknown → English). A plain dict overrides keys on top of English. */
export function setLocale(code: Lang | Dict) {
  if (typeof code === 'object') { dict = { ...en, ...code }; return; }
  current = dicts[code] ? code : 'en';
  dict = dicts[current]!;
}

export const getLocale = (): Lang => current;
export const isRtl = () => LANGS.find((l) => l.code === current)?.rtl ?? false;

/** Run fn with a locale temporarily active (server: per-request language). */
export function withLocale<T>(code: Lang | undefined, fn: () => T): T {
  if (!code || code === current) return fn();
  const prev = current;
  setLocale(code);
  try { return fn(); } finally { setLocale(prev); }
}

export function has(key: string): boolean { return key in dict || key in en; }
/** True only if the active locale itself defines the key (no English fallback). */
export function hasOwn(key: string): boolean { return key in dict; }

/** Count params that get a pluralised companion: {days} → {daysText} ("1 day", "3 days"), {seats} → {seatsText}. */
const COUNTS: [string, string][] = [['days', 'unit.days'], ['seats', 'unit.seats']];

export function t(key: string, params: Record<string, string | number> = {}): string {
  const s = dict[key] ?? en[key] ?? key;
  if (!key.startsWith('unit.')) {
    for (const [p, unit] of COUNTS) {
      if (typeof params[p] === 'number' && params[`${p}Text`] === undefined && s.includes(`{${p}Text}`)) {
        params = { ...params, [`${p}Text`]: tp(unit, params[p] as number) };
      }
    }
  }
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

/**
 * Plural helper: picks `${key}.${category}` using Intl.PluralRules for the active locale
 * (categories: one, few, many, other), falling back to `${key}.other`, then `key`.
 * Params get {n}. Example keys: 'ui.days.one': '{n} day', 'ui.days.other': '{n} days'.
 */
export function tp(key: string, n: number, params: Record<string, string | number> = {}): string {
  const cat = new Intl.PluralRules(current).select(n);
  const k = has(`${key}.${cat}`) ? `${key}.${cat}` : has(`${key}.other`) ? `${key}.other` : key;
  return t(k, { n, ...params });
}

/** Header-chip label: optional locale-only `party.<id>.chip` (an extra-short form), else the given short name. */
export function partyChip(id: string, short: string): string {
  const k = `party.${id}.chip`;
  return hasOwn(k) ? t(k) : short;
}

/** Party display name: translated `party.<id>` if present, else the data name. */
export function partyLabel(id: string, fallback: string): string {
  const k = `party.${id}`;
  return has(k) ? t(k) : fallback;
}

/** Turn ids inside log params into display names. */
export function formatLog(e: LogEntry, partyName: (id: string) => string): string {
  const p: Record<string, string | number> = { ...(e.params ?? {}) };
  for (const k of ['party', 'from', 'to'] as const) if (typeof p[k] === 'string' && p[k] !== '-' && p[k] !== '') p[k] = partyName(p[k] as string);
  if (p.ministry) p.ministry = t(`ministry.${p.ministry}`);
  if (p.crisis) p.crisis = t(`crisis.${p.crisis}.title`);
  if (p.remedy) p.remedy = t(`remedy.${p.remedy}`);
  if (p.law) p.law = t(`remedy.${p.law}`);
  if (p.promise) p.promise = t(`promise.${p.promise}`);
  if (p.title) p.title = t(`title.${p.title}`);
  if (p.reason) p.reason = t(`reason.${p.reason}`);
  return t(e.key, p);
}
