// Google Analytics 4, loaded only after the visitor allows it (same pattern as the other lipu sites).
// With an empty GA_MEASUREMENT_ID nothing loads, no banner shows,
// and track() is a no-op. Never send free text or personal data — only ids and numbers.
import { t } from '../i18n/index.ts';

export const GA_MEASUREMENT_ID = 'G-5X17LS4GDR';
const KEY = 'bibigame-consent';

declare global { interface Window { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void } }

const get = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const set = (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };

function load() {
  if (!GA_MEASUREMENT_ID || window.gtag) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer!.push(arguments); }; // eslint-disable-line prefer-rest-params
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });
}

export function track(event: string, params: Record<string, string | number> = {}) {
  window.gtag?.('event', event, params);
}

/** true while the visitor has not answered the consent question yet */
export function consentPending(): boolean {
  if (!GA_MEASUREMENT_ID) return false;
  const c = get();
  return c !== 'yes' && c !== 'no';
}

/** load GA if it was already allowed (call once at startup) */
export function initConsent() {
  if (GA_MEASUREMENT_ID && get() === 'yes') load();
}

/**
 * Render the slim consent bar into `host` (the intro screen's bottom slot) — never a floating
 * overlay over the game. `onDone` runs after an answer.
 */
export function mountConsent(host: HTMLElement, onDone: () => void = () => {}) {
  host.innerHTML = '';
  host.hidden = !consentPending();
  if (host.hidden) return;
  const d = document.createElement('div');
  d.className = 'consent';
  d.innerHTML = `<span>${t('consent.text')}</span><button class="c-yes" data-c="yes">${t('consent.allow')}</button><button data-c="no">${t('consent.decline')}</button>`;
  d.addEventListener('click', (e) => {
    const v = (e.target as HTMLElement).dataset.c;
    if (!v) return;
    e.stopPropagation();
    set(v);
    host.innerHTML = '';
    host.hidden = true;
    if (v === 'yes') load();
    onDone();
  });
  host.appendChild(d);
}
