// Google Analytics 4, loaded only after the visitor allows it (same pattern as the other lipu sites).
// GA_MEASUREMENT_ID is empty until the owner picks a GA4 property: then nothing loads, no banner shows,
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

/** show the consent banner if needed (call once after the app has rendered) */
export function initConsent() {
  if (!GA_MEASUREMENT_ID) return;
  const c = get();
  if (c === 'yes') { load(); return; }
  if (c === 'no') return;
  const d = document.createElement('div');
  d.id = 'consent';
  d.className = 'consent';
  d.setAttribute('role', 'dialog');
  d.innerHTML = `<span>${t('consent.text')}</span><button class="primary" data-c="yes">${t('consent.allow')}</button><button data-c="no">${t('consent.decline')}</button>`;
  d.addEventListener('click', (e) => {
    const v = (e.target as HTMLElement).dataset.c;
    if (!v) return;
    set(v);
    d.remove();
    if (v === 'yes') load();
  });
  document.body.appendChild(d);
}
