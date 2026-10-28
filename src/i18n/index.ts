import { en } from './en.ts';
import type { LogEntry } from '../engine/types.ts';

let dict: Record<string, string> = en;

export function setLocale(d: Record<string, string>) {
  dict = { ...en, ...d };
}

export function t(key: string, params: Record<string, string | number> = {}): string {
  const s = dict[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

/** Turn ids inside log params into display names. */
export function formatLog(e: LogEntry, partyName: (id: string) => string): string {
  const p: Record<string, string | number> = { ...(e.params ?? {}) };
  for (const k of ['party', 'from', 'to'] as const) if (typeof p[k] === 'string' && p[k] !== '-') p[k] = partyName(p[k] as string);
  if (p.ministry) p.ministry = t(`ministry.${p.ministry}`);
  if (p.crisis) p.crisis = t(`crisis.${p.crisis}.title`);
  if (p.remedy) p.remedy = t(`remedy.${p.remedy}`);
  if (p.law) p.law = t(`remedy.${p.law}`);
  if (p.promise) p.promise = t(`promise.${p.promise}`);
  if (p.title) p.title = t(`title.${p.title}`);
  if (p.reason) p.reason = t(`reason.${p.reason}`);
  return t(e.key, p);
}
