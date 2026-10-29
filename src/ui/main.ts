// DOM layer. Reads Observation, sends Actions. No game logic here.
import './style.css';
import { createGame, errorText, promisesFor, type Game, type Observation, type OutcomeView, type Preview } from '../api/game.ts';
import { promiseById } from '../data/promises.ts';
import type { Action } from '../engine/types.ts';
import { titleBoard } from '../api/text.ts';
import { LANGS, getLocale, isLang, isRtl, loadLocale, partyChip, setLocale, t, type Lang } from '../i18n/index.ts';
import { hemicycleSvg } from './hemicycle.ts';
import { initSwipe } from './swipe.ts';
import { buzz, play, setSound, soundOn } from './fx.ts';
import { consentPending, initConsent, mountConsent, track } from './analytics.ts';
import { editionSnap, fridayEdition, type EditionSnap } from '../api/extras.ts';
import { dailySeed, isDateKey, shareText, todayKey, whatsappUrl } from '../api/share.ts';

// ---- language: saved choice → browser language → English
const LANG_KEY = 'bibigame.lang';
function savedLang(): string | null { try { return localStorage.getItem(LANG_KEY); } catch { return null; } }
function detectLang(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (isLang(q)) return q;
  const s = savedLang();
  if (isLang(s)) return s;
  const nav = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase();
  return nav.startsWith('he') || nav.startsWith('iw') ? 'he' : nav.startsWith('ru') ? 'ru' : 'en';
}
{
  const want = detectLang();
  if (want !== 'en' && (await loadLocale(want))) setLocale(want);
  document.documentElement.lang = getLocale();
  document.documentElement.dir = isRtl() ? 'rtl' : 'ltr';
  document.title = t('ui.docTitle');
}

const app = document.getElementById('app')!;
// ?daily (today) or ?daily=YYYY-MM-DD → the same seed for everyone that day; ?seed=N → that seed
const query = new URLSearchParams(location.search);
let daily: string | null = query.has('daily') ? (isDateKey(query.get('daily')) ? query.get('daily')! : todayKey()) : null;
const urlSeed = Number(query.get('seed'));
const seedType = daily ? 'daily' : query.has('seed') && Number.isFinite(urlSeed) ? 'fixed' : 'random';
const randomSeed = () => Math.floor(Math.random() * 1e9);
let game: Game = createGame({ seed: daily ? dailySeed(daily) : seedType === 'fixed' ? urlSeed : randomSeed() });
let paused = false;
/** the news screen between cards holds the clock until the player taps Next (config.pauseOnNews) */
let newsHold = true;
let hadEvent = false;
let last = performance.now();
let lastTitles = 0;
const keys: Record<string, string> = {};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Bidi-isolate a signed number so RTL text shows "+3", not "3+" (survives esc()). */
const ltr = (x: string) => `\u2066${x}\u2069`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (v: number) => `${Math.max(0, Math.min(100, v)).toFixed(1)}%`;
const ARROW: Record<string, string> = { left: '←', right: '→' };

// Layout (phone first): top bar (seats big + approval, timeline) → one result line → the card.
// Everything else lives in ONE bottom sheet behind three tabs. Layers: at most one of
// intro / sheet / game-over at a time (see openLayer), plus at most one small toast.
const TABS: [string, string, string][] = [['moves', '🎲', 'ui.movesPanel'], ['parties', '🤝', 'ui.parties'], ['log', '📜', 'ui.tabLog']];
app.innerHTML = `
<header class="top">
  <div class="row1">
    <span id="date" class="date"></span>
    <button id="trialb" class="trialb" data-act="trial" hidden></button>
    <span class="sp"></span>
    <button class="icon help" data-act="intro" aria-label="${t('ui.help')}">?</button>
    <button id="sound" class="icon" data-act="sound" aria-label="${t('ui.sound')}"></button>
    <button id="pause" class="icon" aria-label="${t('ui.pause')}">⏸</button>
  </div>
  <div class="support">
    <div class="bigseats" id="bigseats" aria-live="polite"><b id="seatnum">0</b><span id="seatof" class="of">/ 61</span><span id="margin" class="margin"></span><span id="seattrend" class="trend"></span></div>
    <div class="appr"><span>${t('ui.approval')}</span><b id="apprnum">0%</b><small id="apprtgt" class="trend"></small><div class="mbar"><div id="apprbar"></div></div></div>
  </div>
  <div class="seatbar" id="seatbar"></div>
  <button id="timeline" class="timeline" data-act="open" data-sec="log" aria-label="${t('ui.timeline')}"><div class="tl-track" id="tltrack"></div></button>
  <div class="statusrow"><button id="alert" class="alert" data-act="open" data-sec="parties" hidden></button><button id="tlcap" class="tl-caption" data-act="open" data-sec="log"></button></div>
</header>
<main class="main">
  <div id="result" class="resultline" role="status" aria-live="polite"></div>
  <section class="stage" id="stage"></section>
  <aside id="drawer" class="drawer" aria-label="${t('ui.moves')}">
    <div class="tabs" role="tablist">${TABS.map(([id, ic, k]) => `<button role="tab" data-act="tab" data-tab="${id}" aria-selected="false">${ic} ${t(k)}</button>`).join('')}<button class="icon drawer-close" data-act="close" aria-label="${t('ui.closeSheet')}">✕</button></div>
    <div class="tabpane" data-pane="moves">
      <button id="war" class="war" data-act="war"></button>
      <section class="panel"><h3>${t('ui.movesPanel')}</h3><div id="moves" class="laws moves"></div></section>
      <section class="panel"><h3>${t('ui.laws')}</h3><div id="laws" class="laws"></div></section>
      <section class="panel"><h3>${t('ui.ministries')}</h3><div id="ministries" class="ministries"></div></section>
    </div>
    <div class="tabpane" data-pane="parties">
      <div id="parties" class="parties"></div>
      <section class="panel hud"><h3>${t('ui.overview')}</h3>
        <div id="hemi"></div>
        <div id="slider" class="slider"></div>
        <div id="meters" class="meters"></div>
        <div id="chips" class="chips"></div>
      </section>
    </div>
    <div class="tabpane" data-pane="log">
      <section class="panel"><h3>${t('ui.timeline')}</h3><p id="titleline" class="sub titleline"></p><ul id="upcoming" class="tl-up"></ul></section>
      <div id="editions"></div>
      <section class="panel"><h3>${t('ui.log')}</h3><ol id="log" class="log"></ol></section>
      <p class="bothint">${t('ui.botHint')}</p>
    </div>
  </aside>
</main>
<nav class="bottombar">${TABS.map(([id, ic, k]) => `<button data-act="open" data-sec="${id}">${ic} ${t(k)}${id === 'parties' ? ' <span id="movesdot" class="dot" hidden></span>' : ''}</button>`).join('')}</nav>
<div id="toast" class="toast" hidden role="status"></div>
<div id="over" class="over" hidden></div>
<div id="intro" class="intro" hidden role="dialog" aria-modal="true" aria-labelledby="introtitle"></div>
`;

const $ = (id: string) => document.getElementById(id)!;

function region(id: string, key: string, html: () => string) {
  if (keys[id] === key) return;
  keys[id] = key;
  $(id).innerHTML = html();
}

const partyName = (o: Observation, id: string | null) => o.parties.find((p) => p.id === id)?.name ?? id ?? '—';

// ------------------------------------------------------------------ header
// Header = date · trial · buttons, then seats + approval, the seat bar, a thin timeline and ONE
// status line (a warning when something is about to break, otherwise the next timeline event).
function renderTop(o: Observation) {
  $('date').textContent = o.date;
  const coal = o.parties.filter((p) => p.inCoalition && p.seats > 0).sort((a, b) => a.position - b.position);
  const opp = o.parties.filter((p) => !p.inCoalition && p.seats > 0).sort((a, b) => a.position - b.position);
  region('seatbar', [...coal, ...opp].map((p) => p.id + p.seats + p.inCoalition + p.mayLeave).join() + o.defectors, () =>
    [...coal, ...opp].map((p) => `<span class="seg ${p.inCoalition ? '' : 'opp'} ${p.mayLeave ? 'ghost' : ''}" style="flex:${p.seats};background:${p.color}" title="${esc(p.name)} ${p.seats}"></span>`).join('')
    + `<span class="maj" style="left:${(61 / 120) * 100}%"></span>`);
  renderSupport(o);
  // trial: always visible once it is running (also in opposition) — it ends the game at 100
  const trial = Math.round(o.meters.trial);
  const tb = $('trialb') as HTMLButtonElement;
  tb.hidden = trial <= 0;
  tb.textContent = `⚖ ${trial}/100`;
  tb.className = `trialb ${trial >= 80 ? 'bad' : trial >= 60 ? 'warn' : ''}`;
  tb.title = t('ui.trialBadge', { n: trial });
  tb.setAttribute('aria-label', tb.title);
  // the one warning: a partner about to walk (biggest first), else a meter in danger
  const m = o.meters;
  const leaving = coal.filter((p) => p.mayLeave).sort((a, b) => b.seats - a.seats);
  const dangers: [string, number, boolean][] = [['ui.street', m.street, m.street < 30], ['ui.us', m.us, m.us < 30], ['ui.fiscal', m.fiscal, m.fiscal < 25]];
  const dg = dangers.find((x) => x[2]);
  const al = $('alert') as HTMLButtonElement;
  let text = '', sec = 'parties', cls = 'alert';
  if (o.phase === 'governing' && leaving.length) {
    const p = leaving[0];
    text = `⚠ ${t('ui.mayLeaveLine', { party: partyChip(p.id, p.short || p.name), seats: p.seatsWithout })}${leaving.length > 1 ? ` ${ltr(`+${leaving.length - 1}`)}` : ''}`;
    cls += ' danger';
  } else if (o.phase === 'governing' && dg) {
    text = `⚠ ${t(dg[0])} ${Math.round(dg[1])}`;
  } else if ((o.opposition || o.phase === 'campaign') && o.electionLosses) {
    text = `⚠ ${t('ui.lastChance')}`; sec = 'moves';
  }
  al.hidden = !text;
  al.textContent = text;
  al.dataset.sec = sec;
  al.className = cls;
  $('tlcap').hidden = !!text;
}

// ------------------------------------------------------------------ big support indicator
let shownSeats = -1, shownAppr = -1, seatsAtCard = -1, lastCardAt = -1;

function animateNum(el: HTMLElement, from: number, to: number, fmt: (n: number) => string) {
  const host = el.closest<HTMLElement>('.bigseats, .appr');
  if (host) {
    host.classList.remove('flash-up', 'flash-down');
    void host.offsetWidth;
    host.classList.add(to > from ? 'flash-up' : 'flash-down');
  }
  if (reduceMotion) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 900;
  const tick = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    el.textContent = fmt(Math.round(from + (to - from) * k));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderSupport(o: Observation) {
  const seats = o.seats, margin = seats - o.majority;
  const big = $('bigseats');
  if (o.opposition) {
    // nothing to count in opposition: show what you are fighting, the rival government's stability
    const st = Math.round(o.opposition.stability);
    big.dataset.state = 'opp';
    $('seatnum').textContent = `${st}%`;
    $('seatof').textContent = t('ui.rivalShort');
    $('margin').textContent = '';
    $('seattrend').textContent = '';
    big.title = t('ui.rival', { n: st });
    shownSeats = -1;
    renderApproval(o);
    return;
  }
  $('seatof').textContent = `/ ${o.majority}`;
  big.title = '';
  if (game.state.event && game.state.event.firedAt !== lastCardAt) { lastCardAt = game.state.event.firedAt; seatsAtCard = seats; }
  if (seatsAtCard < 0) seatsAtCard = seats;
  if (shownSeats < 0) { shownSeats = seats; $('seatnum').textContent = String(seats); }
  else if (seats !== shownSeats) { animateNum($('seatnum'), shownSeats, seats, String); shownSeats = seats; }
  big.dataset.state = o.phase === 'campaign' ? 'campaign' : margin >= 3 ? 'good' : margin >= 0 ? 'warn' : 'bad';
  $('margin').textContent = o.phase === 'campaign' ? t('ui.campaignShort', { days: o.phaseLeftDays }) : ltr(margin >= 0 ? `+${margin}` : `${margin}`);
  const d = seats - seatsAtCard;
  $('seattrend').textContent = d > 0 ? `↑${d}` : d < 0 ? `↓${-d}` : '';
  $('seattrend').className = `trend ${d > 0 ? 'good' : d < 0 ? 'bad' : ''}`;
  renderApproval(o);
}

function renderApproval(o: Observation) {
  const a = Math.round(o.meters.approval);
  if (shownAppr < 0) { shownAppr = a; $('apprnum').textContent = `${a}%`; }
  else if (Math.abs(a - shownAppr) >= 2) { animateNum($('apprnum'), shownAppr, a, (n) => `${n}%`); shownAppr = a; }
  else if (a !== shownAppr && !game.state.event) { shownAppr = a; $('apprnum').textContent = `${a}%`; }
  const bar = $('apprbar');
  bar.style.width = pct(o.meters.approval);
  bar.className = o.meters.approval < 35 ? 'low' : '';
  // where it is drifting: an arrow when the target is clearly elsewhere, red under the panic line
  const tgt = Math.round(o.approvalTarget);
  const arrow = tgt < a - 2 ? '↘' : tgt > a + 2 ? '↗' : '';
  $('apprtgt').textContent = arrow ? `${arrow}${tgt}%` : '';
  $('apprtgt').className = `trend ${o.approvalTarget < o.panicBelow ? 'bad' : ''}`;
  $('apprtgt').title = t('ui.approvalTarget', { n: tgt, panic: o.panicBelow });
}

const ICON: Record<string, string> = {
  crisis: '', war: '⚔', election: '🗳', recess: '🏖', title: '👑', budget: '💰', case: '⚖', icc: '✈', promise: '🤝', distrust: '😠', goal: '🏁',
};

function renderTimeline(o: Observation) {
  const tl = o.timeline;
  const end = Math.max(tl.goalDay, tl.nowDay + 120);
  const x = (d: number) => `${Math.max(0, Math.min(100, (d / end) * 100)).toFixed(2)}%`;
  const key = [Math.floor(end / 30), tl.past.length, tl.upcoming.map((m) => m.kind + m.day).join(), tl.trust.map((r) => r.party + r.believeUntil).join()].join('|');
  region('tltrack', key, () => {
    const past = tl.past.map((m) => `<span class="tl-m past ${m.kind}" style="inset-inline-start:${x(m.day)}" title="${esc(m.date + ' ' + m.label)}">${ICON[m.kind] ?? ''}</span>`).join('');
    const up = tl.upcoming.filter((m) => m.day <= end).map((m) => `<span class="tl-m up ${m.kind}" style="inset-inline-start:${x(m.day)}" title="${esc(m.date + ' ' + m.label)}">${ICON[m.kind] ?? '•'}</span>`).join('');
    const trust = tl.trust.map((r, i) => `<span class="tl-trust believe" style="inset-inline-start:${x(r.from)};width:calc(${x(r.believeUntil)} - ${x(r.from)});background:${r.color};top:${12 + (i % 3) * 2}px"></span><span class="tl-trust distrust" style="inset-inline-start:${x(r.believeUntil)};width:calc(${x(r.distrustUntil)} - ${x(r.believeUntil)});top:${12 + (i % 3) * 2}px"></span>`).join('');
    return `<div class="tl-line"><div class="tl-fill" id="tlfill"></div></div>${trust}${past}${up}<span class="tl-now" id="tlnow"></span>`;
  });
  const fill = document.getElementById('tlfill');
  if (fill) fill.style.width = x(tl.nowDay);
  const now = document.getElementById('tlnow');
  if (now) now.style.insetInlineStart = x(tl.nowDay);
  const next = tl.upcoming.find((m) => m.kind !== 'goal');
  const parts = [`${(o.pmDays / 365.25).toFixed(1)}/4y`];
  if (next) parts.push(t('tl.next', { label: next.label, days: next.day - tl.nowDay }));
  $('tlcap').textContent = parts.join(' · ');
  // titles are secondary: they live in the Log tab
  const best = o.titles.length ? o.titles[o.titles.length - 1] : null;
  const tline = $('titleline');
  tline.textContent = [`👑 ${t('ui.titleNow', { title: best ? best.name : t('ui.noTitle') })}`,
    tl.nextTitle ? t('news.title', { title: tl.nextTitle.name, days: tl.nextTitle.inDays }) : ''].filter(Boolean).join(' · ');
  tline.title = best ? best.gloss : '';
  if (sheetTab === 'log') region('upcoming', tl.upcoming.map((m) => m.kind + m.day).join() + Math.floor(tl.nowDay), () =>
    tl.upcoming.map((m) => `<li>${ICON[m.kind] ?? '•'} ${m.date} — ${esc(m.label)} (${m.day - tl.nowDay}d)</li>`).join(''));
}

// ------------------------------------------------------------------ HUD
function renderHud(o: Observation) {
  region('hemi', o.parties.map((p) => p.id + p.seats + p.inCoalition).join(), () => hemicycleSvg(o.parties));
  const coal = o.parties.filter((p) => p.inCoalition && p.seats > 0);
  region('slider', coal.map((p) => p.id).join() + o.govPosition, () => {
    const x = (v: number) => ((v + 10) / 20) * 100;
    return `<div class="track">${coal.map((p) => {
      const lo = Math.max(-10, p.position - p.tolerance), hi = Math.min(10, p.position + p.tolerance);
      return `<span class="band" style="left:${x(lo)}%;width:${x(hi) - x(lo)}%;background:${p.color}"></span><span class="pdot" style="left:${x(p.position)}%;background:${p.color}" title="${esc(p.name)}"></span>`;
    }).join('')}<span class="gov" style="left:${x(o.govPosition)}%" title="${t('ui.gov')}">▲</span></div>
      <div class="ends"><span>${t('ui.left')}</span><span>${t('ui.gov')} ${o.govPosition}</span><span>${t('ui.right')}</span></div>`;
  });
  const m = o.meters;
  const meters: [string, number, boolean][] = [
    ['ui.approval', m.approval, false], ['ui.street', m.street, false], ['ui.us', m.us, false],
    ['ui.fiscal', m.fiscal, false], ['ui.trial', m.trial, true],
  ];
  region('meters', 'static', () => meters.map(([k], i) =>
    `<div class="meter"><span>${t(k)}${k === 'ui.us' ? ' <i id="trumpface" class="tface"></i>' : ''}</span><div class="mbar"><div id="m${i}"></div></div><b id="mv${i}"></b></div>`).join(''));
  const tf = document.getElementById('trumpface');
  if (tf) { tf.textContent = o.trump.face; tf.title = t('ui.trumpMood'); }
  meters.forEach(([, v, inverse], i) => {
    const el = $(`m${i}`) as HTMLElement;
    el.style.width = pct(v);
    el.className = (inverse ? v > 60 : v < 35) ? 'low' : '';
    $(`mv${i}`).textContent = String(Math.round(v));
  });
  const chips: string[] = [];
  if (o.tension) chips.push(`<span class="chip warn">${t('ui.tension')}</span>`);
  if (o.iccDays) chips.push(`<span class="chip">${t('ui.icc', { days: o.iccDays })}</span>`);
  if (!o.budget.passed) chips.push(`<span class="chip">💰 ${o.budget.dueYear} ✗</span>`);
  if (o.openCases) chips.push(`<span class="chip">⚖ ${o.openCases}</span>`);
  $('chips').innerHTML = chips.join('');
}

// ------------------------------------------------------------------ crisis card
/** an effect chip's text: "▲Approval", but the trial reads "Trial slower" / "Trial faster" (no arrows to decode) */
const chipText = (p: Preview, sep = '') => p.meter === 'trial' ? t(p.up ? 'ui.trialSlower' : 'ui.trialFaster') : `${(p.up ? '▲' : '▼').repeat(p.size ?? 1)}${sep}${p.label}`;
const meterLabel = (meter: string, label: string, delta: number) => meter === 'trial' ? t(delta > 0 ? 'ui.trialFaster' : 'ui.trialSlower') : label;

/** what the crisis already did when it arrived (onFire): small chips under the card text */
function arrivalHtml(a: OutcomeView | null): string {
  if (!a) return '';
  const chips = [
    ...a.sat.slice(0, 4).map((x) => ({ label: x.name, good: x.delta, shown: x.delta })),
    ...a.meters.map((x) => ({ label: meterLabel(x.meter, x.label, x.delta), good: x.meter === 'trial' ? -x.delta : x.delta, shown: x.delta })),
  ];
  if (!chips.length) return '';
  return `<p class="arrival"><small>${t('ui.arrival')}:</small> ${chips.map((c) => `<span class="${c.good > 0 ? 'up' : 'down'}">${esc(c.label)} <bdi dir="ltr">${c.shown > 0 ? '+' : ''}${c.shown}</bdi></span>`).join(' ')}</p>`;
}

function renderStage(o: Observation) {
  const ev = o.event;
  const key = ev ? `${ev.id}|${game.state.event?.firedAt}|${ev.options.map((x) => x.available).join()}|${canWar(o)}` : `none|${newsKey(o)}|${holding()}`;
  if (swipe.dragging()) return;
  const kind = ev ? `card:${game.state.event?.firedAt}` : 'news';
  region('stage', key, () => {
    const enter = kind !== lastStageKind ? 'enter' : '';
    lastStageKind = kind;
    if (!ev) return newsHtml(o, enter);
    const by: Record<string, (typeof ev.options)[number] | undefined> = {};
    for (const op of ev.options) by[op.dir] = op;
    const hint = (dir: string) => {
      const op = by[dir];
      if (!op) return `<span class="hint-${dir} hint empty"></span>`;
      // effect chips right on the card (no need to drag to see them; the engine computes op.preview)
      const chips = op.available
        ? `<span class="fx mini">${op.preview.slice(0, 4).map((p) => `<span class="${p.up ? 'up' : 'down'}">${esc(chipText(p))}</span>`).join('')}</span>`
        : `<span class="why">${esc(op.why)}</span>`;
      // unavailable options stay tappable (aria-disabled) so a tap/swipe can say why
      return `<button class="hint hint-${dir} ${op.available ? '' : 'na'}" data-dir="${dir}" ${op.available ? '' : 'aria-disabled="true"'} title="${esc(op.desc)}"><span class="arrow">${ARROW[dir]}</span> ${esc(op.label)}${op.odds !== null ? ` <b class="odds" title="${esc(t('ui.odds'))}">${op.odds}%</b>` : ''}${chips}</button>`;
    };
    const urgent = ev.id === 'angry';
    const ign = ev.options.find((x) => x.dir === 'ignore');
    const ignFx = ign ? ign.preview.filter((p) => !p.up).map((p) => (p.meter === 'trial' ? t('ui.trialFaster') : p.label)).slice(0, 3).join(', ') : '';
    return `<div id="card" class="swipecard ${enter} ${urgent ? 'urgent' : ''}" tabindex="0" aria-label="${esc(ev.title)}">
      <div class="cbody">
        <svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" class="ring-bg"/><circle id="ring" cx="20" cy="20" r="16" class="ring-fg"/></svg>
        <h2>${esc(ev.title)}${ev.subject ? ` <small>· ${esc(partyName(o, ev.subject))}</small>` : ''}</h2>
        <p>${esc(ev.text)}</p>
        ${arrivalHtml(ev.arrival)}
        <div id="swipelabel" class="swipelabel" hidden></div>
      </div>
      <div class="lr">${hint('left')}${hint('right')}</div>
    </div>
    <div class="underbtns">
      ${ign ? `<button class="ignorebtn" data-dir="ignore"><b>${t('ui.ignore')}</b> <small>${esc(t('ui.ignoreFx', { fx: ignFx || t('out.escalates') }))}</small> <kbd>0</kbd></button>` : ''}
      ${canWar(o) ? `<button class="ignorebtn warbtn" data-act="war"><b>💥 ${t('ui.war')}</b></button>` : ''}
    </div>`;
  });
  if (ev) {
    const ring = document.getElementById('ring');
    const total = ev.id === 'angry' ? game.state.config.urgentTimeoutDays : game.state.config.eventTimeoutDays;
    if (ring) ring.parentElement!.style.display = game.state.config.pauseOnDecision ? 'none' : '';
    if (ring) ring.style.strokeDashoffset = String(100.5 * (1 - ev.daysLeft / total));
  }
}

// ------------------------------------------------------------------ headlines (no crisis)
function headline(o: Observation): string {
  const name = (id: string) => partyName(o, id);
  if (o.opposition) return t('news.opposition', { n: o.opposition.stability });
  if (o.phase === 'campaign') return t('news.campaign', { days: o.phaseLeftDays, poll: game.state.campaignPollSeats, risk: Math.round(o.electionRisk * 100) });
  const angry = o.parties.find((p) => p.trust.state === 'angry');
  if (angry) return t('news.angry', { party: name(angry.id), promise: t(`promise.${angry.trust.promiseId}`) });
  const leaving = o.parties.find((p) => p.mayLeave);
  if (leaving) return t('news.threat', { party: name(leaving.id) });
  const waiting = o.parties.find((p) => p.trust.waiting);
  if (waiting) return t('news.waiting', { party: name(waiting.id), promise: t(`promise.${waiting.trust.promiseId}`), days: waiting.trust.daysLeft });
  const budget = o.timeline.upcoming.find((m) => m.kind === 'budget');
  if (budget && budget.day - o.day < 60) return t('news.budget', { year: o.budget.dueYear, days: budget.day - o.day });
  if (o.war.active) return t('news.war', { day: game.state.config.warDurationDays - o.war.daysLeft });
  return t('news.poll', { approval: Math.round(o.meters.approval), seats: o.seats });
}

function newsKey(o: Observation) {
  return [o.phase, headline(o), o.timeline.upcoming[0]?.label, Math.floor(o.day / 15), o.cooldowns.ministry > 0, o.cooldowns.law > 0, o.war.cooldownDays > 0,
    o.opposition ? o.moves.map((m) => `${m.id}${m.available}${m.cooldown}`).join() : '',
    o.electionSoon ? o.electionFactors.map((x) => x.delta).join() : '', o.trialPausedDays > 0].join('|');
}

let lastStageKind = '';

const holding = () => newsHold && game.state.config.pauseOnNews && !game.state.event && !game.over;

function newsHtml(o: Observation, enter: string): string {
  const tl = o.timeline;
  const next = tl.upcoming.find((m) => m.kind !== 'goal');
  // the vote is close: the odds and what makes them up (levers are in the Moves tab)
  const odds = o.electionSoon ? t('news.odds', {
    risk: Math.round(o.electionRisk * 100),
    factors: o.electionFactors.map((x) => `${x.label} ${ltr(x.delta >= 0 ? `+${x.delta}` : `${x.delta}`)}`).join(', '),
  }) : '';
  const ticker = [
    odds,
    o.trialPausedDays ? t('news.trialPaused', { days: o.trialPausedDays }) : '',
    next ? t('news.next', { label: next.label, days: next.day - tl.nowDay }) : '',
    tl.nextTitle ? t('news.title', { title: tl.nextTitle.name, days: tl.nextTitle.inDays }) : '',
    t(`news.flavour.${Math.floor(o.day / 23) % 10}`),
    t('news.poll', { approval: Math.round(o.meters.approval), seats: o.seats }),
  ].filter(Boolean).filter((x) => x !== headline(o));
  const gov = o.phase === 'governing';
  const warOk = gov && !o.war.active && o.war.cooldownDays === 0 && o.tension;
  return `<div class="news ${enter}">
    <div class="mast">${t('news.masthead')}</div>
    <h2>${esc(headline(o))}</h2>
    <ul class="ticker">${ticker.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    ${o.opposition ? oppositionHelp(o) : ''}
    ${gov ? `<div class="quick">
      <button data-act="open" data-sec="parties">🤝 ${t('ui.qPromise')}</button>
      <button data-act="open" data-sec="ministries" ${o.cooldowns.ministry ? 'disabled' : ''}>🏛 ${t('ui.qMinistry')}</button>
      <button data-act="open" data-sec="laws" ${o.cooldowns.law ? 'disabled' : ''}>📜 ${t('ui.qLaw')}</button>
      <button data-act="war" class="warq" ${warOk ? '' : 'disabled'}>⚔ ${t('ui.war')}</button>
    </div>` : ''}
    ${holding() ? `<button class="primary nextbtn" data-act="next">${t('ui.next')} ▶</button>` : ''}
  </div>`;
}

/** opposition has no cards to swipe: say what to do and put the opposition moves right here */
function oppositionHelp(o: Observation): string {
  // the opposition's own moves (attack, poach, no-confidence) first, then whatever else is ready
  const own = (id: string) => (id.startsWith('opp') || id === 'noconfidence' ? 0 : 1);
  const moves = o.moves.filter((m) => !m.ending)
    .sort((a, b) => own(a.id) - own(b.id) || Number(b.available) - Number(a.available)).slice(0, 4);
  return `<p class="whatnow"><b>${esc(t('ui.whatNow'))}</b> ${esc(t('ui.whatNowOpp'))}</p>
    <div class="quick">${moves.map((m) => `<button data-move="${m.id}" ${m.available ? '' : 'disabled'} title="${esc(m.desc)}">${esc(m.label)}${m.cooldown ? ` <small>${esc(t('ui.cooldown', { days: m.cooldown }))}</small>` : ''}</button>`).join('')}</div>`;
}

// ------------------------------------------------------------------ result line (cause → result)
// ONE short line in a fixed slot between the top bar and the card: "Shas −8 · Approval +2 · Seats 63".
// It never covers anything and never blocks the clock; several outcomes at once are queued and
// each stays at least MIN_SHOW ms. The line stays (dimmed) until the next result replaces it.
let seenSeq = 0;
/** what an action did that has no numbers (an invite refused): shown in the result line of outcome `seq` */
let actionNote: { seq: number; text: string } | null = null;
const flashQueue: OutcomeView[] = [];
let flashUntil = 0;
const MIN_SHOW = 1600, MIN_SHOW_BIG = 3000;

function pumpOutcomes(o: Observation) {
  if (o.outcomeSeq > seenSeq) {
    for (const r of o.outcomes) if (r.seq > seenSeq && r.kind !== 'arrival') flashQueue.push(r); // arrivals show on the card
    seenSeq = o.outcomeSeq;
  }
  const now = performance.now();
  if (flashUntil && now < flashUntil) return;
  const r = flashQueue.shift();
  if (r) showResult(r, o);
  else if (flashUntil && now > flashUntil + 5000) { $('result').classList.add('stale'); flashUntil = 0; }
}

/** "−8" with a real minus, bidi-isolated so it reads the same in RTL */
const signed = (n: number) => ltr(n > 0 ? `+${n}` : `−${-n}`);

function showResult(r: OutcomeView, o: Observation) {
  const el = $('result');
  const short = (id: string, name: string) => { const p = o.parties.find((x) => x.id === id); return p ? partyChip(id, p.short || p.name) : name; };
  const part = (good: boolean, html: string) => `<span class="${good ? 'up' : 'down'}">${html}</span>`;
  const sat = [...r.sat].sort((a, b) => Number(b.inCoalition) - Number(a.inCoalition) || Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3)
    .map((x) => part(x.delta > 0, `${esc(short(x.party, x.name))} <b>${signed(x.delta)}</b>`));
  const meters = [...r.meters].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 2)
    .map((x) => part(x.meter === 'trial' ? x.delta < 0 : x.delta > 0, `${esc(meterLabel(x.meter, x.label, x.delta))} <b>${signed(x.delta)}</b>`));
  const lj = [
    r.left.length ? part(false, esc(t('out.leftList', { parties: r.left.join(', ') }))) : '',
    r.joined.length ? part(true, esc(t('out.joinedList', { parties: r.joined.join(', ') }))) : '',
  ].filter(Boolean);
  const seats = r.seats.from !== r.seats.to ? [part(r.seats.to > r.seats.from, `<b>${esc(t('ui.resultSeats', { n: r.seats.to }))}</b>`)] : [];
  const fx = [...lj, ...sat, ...meters, ...seats];
  el.className = `resultline ${r.big ? 'big' : ''} k-${r.kind}`;
  const note = actionNote && actionNote.seq === r.seq ? actionNote.text : '';
  if (note) actionNote = null;
  el.innerHTML = `<small class="cause">${esc(r.cause)}</small><span class="fxline">${note ? part(false, esc(note)) + (fx.length ? '<i> · </i>' : '') : ''}${fx.length ? fx.join('<i> · </i>') : note ? '' : esc(t('out.nothing'))}</span>`;
  el.title = [r.quip, r.reaction].filter(Boolean).join(' — ');
  if (!reduceMotion) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  flashUntil = performance.now() + (r.big ? MIN_SHOW_BIG : MIN_SHOW);
  if (r.left.length) buzz([60, 30, 60]);
  else if (r.seats.to < r.seats.from || r.cause.startsWith(t('out.badNews', { crisis: '' }).trim())) buzz([30, 40, 30]);
  // a floating delta on the big approval number + pulse on party cards (if the sheet is open)
  const ap = r.meters.find((m) => m.meter === 'approval');
  if (ap) floatOn($('apprnum'), ap.delta);
  for (const x of r.sat) {
    const card = app.querySelector<HTMLElement>(`[data-sat="${x.party}"]`)?.closest<HTMLElement>('.party');
    if (card) { card.classList.remove('pulse-up', 'pulse-down'); void card.offsetWidth; card.classList.add(x.delta > 0 ? 'pulse-up' : 'pulse-down'); }
  }
}

function clearResult() { const el = $('result'); el.innerHTML = ''; el.className = 'resultline'; el.title = ''; flashUntil = 0; }

function floatOn(el: HTMLElement | null, d: number, inverse = false) {
  if (!el || reduceMotion) return;
  const f = document.createElement('span');
  f.className = `floater ${(inverse ? d < 0 : d > 0) ? 'up' : 'down'}`;
  f.textContent = ltr(d > 0 ? `+${d}` : `${d}`);
  el.parentElement?.querySelectorAll(':scope > .floater').forEach((x) => x.remove());
  el.parentElement?.appendChild(f);
  f.addEventListener('animationend', () => f.remove(), { once: true });
  window.setTimeout(() => f.remove(), 1400);
}

function showPreview(dir: string | null, strength: number) {
  const el = document.getElementById('swipelabel');
  const ev = game.observe(0).event;
  if (!el || !ev) return;
  const op = dir ? ev.options.find((x) => x.dir === dir) : undefined;
  if (!op || strength < 0.25) { el.hidden = true; return; }
  el.hidden = false;
  el.className = `swipelabel to-${dir} ${op.available ? '' : 'na'}`;
  el.style.opacity = String(Math.min(1, 0.5 + strength));
  el.innerHTML = `<b>${ARROW[dir!]} ${esc(op.label)}</b><div class="fx">${op.preview.map((p) => `<span class="${p.up ? 'up' : 'down'}">${esc(chipText(p, ' '))}</span>`).join('')}</div>`;
}

function choose(dir: string) {
  const ev = game.observe(0).event;
  const op = ev?.options.find((x) => x.dir === dir);
  if (!op || !op.available) return false;
  buzz(15);
  track('choice', { crisis_id: ev!.id, option_id: op.id, dir });
  if (op.id === 'funds' || op.id === 'deliverpremium') play('cash');
  doAct({ type: 'choose', optionId: op.id });
  return true;
}

const swipe = initSwipe({
  root: $('stage'),
  reduceMotion,
  canChoose: (dir) => !!game.observe(0).event?.options.find((x) => x.dir === dir && x.available),
  onPreview: showPreview,
  onChoose: (dir) => { choose(dir); },
  onBlocked: (dir) => blocked(dir),
});

function blocked(dir: string) {
  const card = document.getElementById('card');
  if (card && !reduceMotion) { card.classList.remove('nope'); void card.offsetWidth; card.classList.add('nope'); }
  buzz([20, 30, 20]);
  const op = game.observe(0).event?.options.find((x) => x.dir === dir);
  if (op) toast(`${op.label}: ${op.why || t('err.unavailable')}`);
}

// ------------------------------------------------------------------ drawer
function renderParties(o: Observation) {
  const list = o.parties.filter((p) => p.seats > 0)
    .sort((a, b) => Number(b.inCoalition) - Number(a.inCoalition) || b.seats - a.seats);
  const key = list.map((p) => [p.id, p.seats, p.inCoalition, p.wartime, p.threatening, p.mayLeave, p.trust.state, p.trust.waiting, p.ministries.length, p.trait?.id, p.lastChange?.day, Math.round(p.trend.perMonth), p.trend.reason].join(':')).join('|')
    + `|${o.cooldowns.invite > 0}|${o.cooldowns.law > 0}|${o.phase}|${pendingPromise ? pendingPromise.party + pendingPromise.promise + Math.floor(o.day) : ''}`;
  region('parties', key, () => list.map((p) => {
    const promises = promisesFor(game.state, p.id);
    const canAct = o.phase === 'governing';
    const pending = pendingPromise && pendingPromise.party === p.id && canAct && p.trust.state === 'neutral' ? promiseConfirm(o, p, pendingPromise.promise) : '';
    const promiseSel = pending ? pending : p.trust.state === 'neutral' && canAct
      ? `<select data-promise="${p.id}" aria-label="${t('ui.promise')}"><option value="">${t('ui.promise')}</option>${promises.map((id) => `<option value="${id}">${esc(t(`promise.${id}`))}</option>`).join('')}</select>` : '';
    const deliver = (p.trust.state === 'believing' || p.trust.state === 'distrust') && p.trust.promiseId && canAct
      ? `<button data-deliver="${p.id}" data-pid="${p.trust.promiseId}" ${o.cooldowns.law > 0 ? 'disabled' : ''}>${t('ui.deliver')}: ${esc(t(`promise.${p.trust.promiseId}`))}</button>` : '';
    const invite = !p.inCoalition && canAct
      ? `<button data-invite="${p.id}" ${o.cooldowns.invite > 0 ? 'disabled' : ''}>${t('ui.invite')}</button>` : '';
    const flags = [p.wartime && t('ui.wartime'), p.mayLeave ? t('ui.mayLeave') : p.threatening && t('ui.threatening')].filter(Boolean).join(' · ');
    const sgn = (n: number) => ltr(n > 0 ? `+${n}` : `${n}`);
    const cause = p.lastChange ? `<div class="cause ${p.lastChange.delta > 0 ? 'good' : 'bad'}">${esc(t('out.because', { delta: sgn(p.lastChange.delta), cause: p.lastChange.because }))}</div>` : '';
    const trend = p.inCoalition && Math.abs(p.trend.perMonth) >= 0.3
      ? `<div class="trend ${p.trend.perMonth > 0 ? 'good' : 'bad'}">${p.trend.perMonth > 0 ? '↗' : '↘'} ${esc(t('ui.trendMonth', { delta: ltr((p.trend.perMonth > 0 ? '+' : '') + p.trend.perMonth.toFixed(1)), reason: p.trend.reason }))}</div>` : '';
    const cls = p.trust.state === 'angry' ? 'angry' : p.trust.waiting ? 'waiting' : '';
    return `<div class="party ${p.inCoalition ? 'in' : 'out'} ${cls} ${p.mayLeave ? 'mayleave' : ''}" style="--c:${p.color}">
      <div class="phead"><b>${esc(p.name)}</b><span>${p.seats}</span></div>
      <div class="sat"><div data-sat="${p.id}"></div></div>
      <div class="pmeta"><span data-trust="${p.id}"></span>${flags ? `<span class="bad ${p.mayLeave ? 'danger' : ''}">${flags}</span>` : ''}<span>${p.ministries.length ? `🏛 ${p.ministries.length}` : ''}</span>${p.trait ? `<span class="trait" title="${esc(p.trait.desc)}">${esc(p.trait.label)}</span>` : ''}</div>
      ${trend}${cause}
      <div class="pbtns">${promiseSel}${deliver}${invite}</div>
    </div>`;
  }).join(''));
  for (const p of list) {
    const bar = app.querySelector<HTMLElement>(`[data-sat="${p.id}"]`);
    if (bar) { bar.style.width = pct(p.satisfaction); bar.className = p.satisfaction < 25 ? 'low' : ''; }
    const tr = app.querySelector<HTMLElement>(`[data-trust="${p.id}"]`);
    if (!tr) continue;
    const state = p.trust.waiting ? t('ui.trust.waiting', { days: p.trust.daysLeft }) : t(`ui.trust.${p.trust.state}`, { days: p.trust.daysLeft });
    tr.textContent = state ? `${Math.round(p.satisfaction)}% · ${state}` : `${Math.round(p.satisfaction)}%`;
  }
  $('movesdot').hidden = !o.parties.some((p) => p.trust.waiting || p.trust.state === 'angry' || (p.inCoalition && p.threatening));
}

let pendingPromise: { party: string; promise: string } | null = null;

/** what a promise costs before it is made: the boost now, how long they believe you, what delivering takes */
function promiseConfirm(o: Observation, p: Observation['parties'][number], id: string): string {
  const def = promiseById.get(id);
  if (!def) return '';
  const c = game.state.config;
  const rotation = id === 'rotation';
  const days = Math.round((rotation ? c.rotationBelieveDays : def.believeDays ?? c.promiseBelieveDays) * (p.trait?.id === 'patient' ? 1.5 : 1));
  const boost = rotation ? c.rotationBoost : def.boost ?? c.promiseBoost;
  const due = new Date(Date.parse(o.date) + days * 864e5).toISOString().slice(0, 10);
  const how = def.deliveredBy === 'ministry' ? t('fx.ministry') : t(`remedy.${def.deliveredBy}`);
  return `<div class="pconfirm" role="group">
    <b>🤝 ${esc(t(`promise.${id}`))}</b>
    <p>${esc(t('ui.promiseCost', { party: p.short || p.name, boost: ltr(`+${Math.round(boost)}`), date: due, days, how, distrust: Math.round(c.promiseDistrustDays) }))}</p>
    <div class="pbtns"><button class="primary" data-pconfirm="${p.id}" data-pid="${id}">${t('ui.confirmPromise')}</button><button data-pcancel="1">${t('ui.cancel')}</button></div>
  </div>`;
}

// two ready-made reshuffles instead of a table of dropdowns
function renderMinistries(o: Observation) {
  const ready = o.cooldowns.ministry === 0 && o.phase === 'governing';
  const c = game.state.config;
  const short = (id: string) => { const p = o.parties.find((x) => x.id === id); return p?.short || p?.name || id; };
  region('ministries', o.reshuffles.map((r) => `${r.ministryId}>${r.to}`).join() + ready, () =>
    `<p class="sub">${ready ? t('ui.ready') : t('ui.cooldown', { days: o.cooldowns.ministry })}</p>` +
    o.reshuffles.map((r) => {
      const loss = Math.round(r.from === game.state.base.pmParty ? c.ministryLoss / 3 : c.ministryLoss);
      return `<button class="reshuffle" data-reshuffle="${r.ministryId}" data-to="${r.to}" ${ready ? '' : 'disabled'}>🏛 ${esc(r.ministry)}: ${esc(short(r.from))} → ${esc(short(r.to))}
        <span class="fx mini"><span class="up">${esc(short(r.to))} ${signed(Math.round(c.ministryGain))}</span><span class="down">${esc(short(r.from))} ${signed(-loss)}</span></span></button>`;
    }).join(''));
}

function renderLaws(o: Observation) {
  const ready = o.cooldowns.law === 0 && o.phase === 'governing';
  region('laws', String(ready), () =>
    `<p class="sub">${ready ? t('ui.ready') : t('ui.cooldown', { days: o.cooldowns.law })}</p>` +
    o.laws.map((l) => `<button data-law="${l.id}" ${ready ? '' : 'disabled'} title="${esc(t(`remedy.${l.id}.desc`))}">${esc(l.label)}</button>`).join(''));
}

function renderMoves(o: Observation) {
  region('moves', o.phase + o.moves.map((m) => `${m.id}${m.available}${m.cooldown}`).join(), () => {
    const btn = (m: Observation['moves'][number]) => `<button data-move="${m.id}" class="${m.ending ? 'exit' : ''}" ${m.available ? '' : 'disabled'} title="${esc(m.desc)}">${esc(m.label)}${m.cooldown ? ` <small>${esc(t('ui.cooldown', { days: m.cooldown }))}</small>` : !m.available && m.why ? ` <small>${esc(m.why)}</small>` : ''}<small class="mdesc">${esc(m.desc)}</small></button>`;
    const main = o.moves.filter((m) => !m.ending), exits = o.moves.filter((m) => m.ending);
    return (o.opposition ? `<p class="sub">${esc(t('ui.rival', { n: o.opposition.stability }))}</p>` : '')
      + main.map(btn).join('') + (exits.length ? `<p class="sub">${t('ui.exits')}</p>${exits.map(btn).join('')}` : '');
  });
}

/** war can start now: shown under the crisis card and enabled in the moves panel */
const canWar = (o: Observation) => o.phase === 'governing' && !o.war.active && o.war.cooldownDays === 0 && o.tension;

function renderWar(o: Observation) {
  const btn = $('war') as HTMLButtonElement;
  btn.disabled = !canWar(o);
  btn.textContent = o.war.active ? t('ui.warActive', { days: o.war.daysLeft })
    : o.war.cooldownDays ? t('ui.warCooldown', { days: o.war.cooldownDays })
    : `💥 ${t('ui.war')}${o.tension ? '' : ` — ${t('ui.tension')} ✗`}`;
}

function renderLog() {
  const s = game.state;
  const o = game.observe(30);
  region('log', String(s.log.length) + (s.log[s.log.length - 1]?.t ?? ''), () =>
    [...o.log].reverse().map((e) => `<li class="${e.kind}"><time>d${e.day}</time> ${esc(e.text)}</li>`).join(''));
}

// ------------------------------------------------------------------ layers: ONE modal at a time
// intro (first screen / "?"), sheet (moves · parties · log), over (game over). Opening one closes
// the other, except that game over is never replaced by the sheet and waits while the intro is up.
type Layer = 'intro' | 'sheet' | 'over';
let layer: Layer | null = null;
let overWaiting = false;
let sheetTab = 'parties';

function showLayer(l: Layer | null) {
  layer = l;
  $('intro').hidden = l !== 'intro';
  $('drawer').classList.toggle('open', l === 'sheet');
  $('over').hidden = l !== 'over';
  document.body.dataset.layer = l ?? '';
}
function openLayer(l: Layer) {
  if (layer === l) return;
  if (layer === 'over' && l === 'sheet') return;
  if (layer === 'intro' && l === 'over') { overWaiting = true; return; }
  showLayer(l);
}
function closeLayer() {
  showLayer(null);
  if (overWaiting) { overWaiting = false; showLayer('over'); }
}

function setTab(tab: string) {
  sheetTab = tab;
  $('drawer').dataset.tab = tab;
  for (const b of app.querySelectorAll<HTMLElement>('.tabs [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  keys.upcoming = '';
}
const SEC_TAB: Record<string, string> = { moves: 'moves', laws: 'moves', ministries: 'moves', parties: 'parties', log: 'log' };
const desktop = () => window.matchMedia('(min-width: 900px)').matches;
function openSection(sec: string) {
  if (layer === 'over' || layer === 'intro') return;
  setTab(SEC_TAB[sec] ?? 'parties');
  if (!desktop()) openLayer('sheet');
  render();
  if (sec === SEC_TAB[sec] && !desktop()) { $('drawer').scrollTop = 0; return; }
  const target = $(sec).closest<HTMLElement>('.panel') ?? $(sec);
  target.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
}

// ------------------------------------------------------------------ toast: one small line, queued
const toastQ: string[] = [];
let toastUntil = 0;
function toast(msg: string) {
  if (!toastQ.includes(msg) && $('toast').textContent !== msg) toastQ.push(msg);
  pumpToast();
}
function pumpToast() {
  const el = $('toast');
  const now = performance.now();
  if (toastUntil && now < toastUntil) return;
  if (layer === 'intro') { el.hidden = true; toastUntil = 0; return; }
  const m = toastQ.shift();
  if (!m) { if (toastUntil) { el.hidden = true; el.textContent = ''; toastUntil = 0; } return; }
  el.textContent = m;
  el.hidden = false;
  toastUntil = now + 3200;
}

// ------------------------------------------------------------------ intro (first screen)
const INTRO_KEY = 'bibigame.intro';
const INTRO_AGAIN = 'bibigame.introAgain';
const store = {
  get: (k: string, s: Storage | null = null) => { try { return (s ?? localStorage).getItem(k); } catch { return null; } },
  set: (k: string, v: string, s: Storage | null = null) => { try { (s ?? localStorage).setItem(k, v); } catch { /* private mode */ } },
  del: (k: string, s: Storage | null = null) => { try { (s ?? localStorage).removeItem(k); } catch { /* private mode */ } },
};
const session = (() => { try { return sessionStorage; } catch { return null; } })();
const INTRO_LINES: [string, string][] = [
  ['👔', 'intro.you'], ['🃏', 'intro.cards'], ['😠', 'intro.price'], ['🤝', 'intro.promises'], ['👑', 'intro.goal'],
];

function openIntro() {
  const fresh = game.state.outcomeSeq === 0 && !game.state.event && game.state.day < 1;
  $('intro').innerHTML = `<div class="introcard">
    <div class="langs" role="group" aria-label="${t('intro.lang')}">${LANGS.map((l) => `<button data-lang="${l.code}" aria-pressed="${l.code === getLocale()}" lang="${l.code}">${l.label}</button>`).join('')}</div>
    <h1 id="introtitle">${t('ui.title')}</h1>
    <div class="hero" dir="ltr"><b>61</b><span>/ 120</span></div>
    <ul class="introlines">${INTRO_LINES.map(([ic, k]) => `<li><span class="ic" aria-hidden="true">${ic}</span><span>${t(k)}</span></li>`).join('')}</ul>
    <button class="primary big" data-act="start">${t(fresh ? 'intro.start' : 'intro.resume')}</button>
    <p class="satire">${t('intro.satire')}</p>
  </div>
  <div id="consentslot" class="consentslot" hidden></div>`;
  mountConsent($('consentslot'));
  openLayer('intro');
  (app.querySelector('[data-act=start]') as HTMLElement | null)?.focus();
}

function startFromIntro() {
  store.set(INTRO_KEY, '1');
  store.del(INTRO_AGAIN, session);
  closeLayer();
  last = performance.now();
}

// ------------------------------------------------------------------ game over
function renderOver(o: Observation) {
  if (o.status === 'playing') { if (layer === 'over') closeLayer(); overWaiting = false; keys.over = ''; return; }
  if (keys.over) return;
  keys.over = '1';
  const why = o.status === 'won' ? 'won' : o.lostReason ?? 'deadlock';
  $('over').innerHTML = `<div class="overcard" role="dialog" aria-modal="true"><h2>${t('ui.gameOver')}: ${esc(t(`over.${why}.title`))}</h2>
    <p>${esc(t(`over.${why}.text`))}</p>
    <p class="overstats"><b>${esc(t('over.stats', { years: (o.pmDays / 365.25).toFixed(1), elections: o.elections }))}</b></p>
    ${daily ? `<p class="dailybadge">${esc(t('share.dailyBadge', { date: daily }))}</p>` : ''}
    <button data-act="restart" class="primary big">${t('ui.restart')}</button>
    <div class="sharebar">
      <a class="share wa" href="${esc(whatsappUrl(myShareText()))}" target="_blank" rel="noopener" data-share="whatsapp">💬 ${t('share.whatsapp')}</a>
      ${typeof navigator.share === 'function' ? `<button class="share" data-share="native">📤 ${t('share.share')}</button>` : ''}
      <button class="share" data-share="copy">📋 ${t('share.copy')}</button>
    </div>
    ${daily === todayKey() ? '' : `<button data-act="daily" class="wide">${t('share.dailyPlay')}</button>`}
    <details class="titles"><summary>${t('ui.titles')} (${o.titles.length})</summary>
    <ul class="board">${titleBoard(game.state.titles).map((x) => `<li class="${x.earned ? 'earned' : 'locked'}"><b>${esc(x.name)}</b><small>${esc(x.gloss)}</small></li>`).join('')}</ul></details></div>`;
  // in-game notices are moot now; only share feedback toasts from here on
  toastQ.length = 0;
  toastUntil = 0;
  $('toast').hidden = true;
  openLayer('over');
}

function shareUrl(): string {
  const u = new URL(location.origin + location.pathname);
  if (daily) u.searchParams.set('daily', daily);
  return u.toString();
}
const myShareText = () => shareText(game.state, shareUrl(), daily);

async function doShare(method: string) {
  track('share', { method, seed_type: daily ? 'daily' : 'random' });
  const text = myShareText();
  if (method === 'native') {
    try { await navigator.share({ text }); } catch { /* cancelled */ }
  } else if (method === 'copy') {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.append(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* nothing more to try */ }
      ta.remove();
    }
    toast(t('share.copied'));
  }
}

function render() {
  const o = game.observe();
  renderTop(o);
  renderTimeline(o);
  renderStage(o);
  renderHud(o);
  renderParties(o);
  renderMinistries(o);
  renderLaws(o);
  renderMoves(o);
  renderWar(o);
  renderLog();
  if (o.titles.length > lastTitles) {
    const nt = o.titles[o.titles.length - 1];
    toast(`👑 ${t('ui.newTitle', { title: nt.name })}`);
    play('applause');
    track('title_earned', { title_id: game.state.titles[game.state.titles.length - 1] });
  }
  lastTitles = o.titles.length;
  if (o.termReached && !keys.termToast) { keys.termToast = '1'; toast(t('ui.termReached')); }
  if (o.recess !== (keys.recess === '1')) { keys.recess = o.recess ? '1' : ''; if (o.recess) toast(t('ui.recess')); }
  document.body.classList.toggle('recess', o.recess);
  pumpOutcomes(o);
  renderOver(o);
  renderExtras(o);
  pumpToast();
}

// ------------------------------------------------------------------ Friday edition (in the log), sound
let cardKey = '';
let overTracked = false;
let edition: EditionSnap | null = null;
let nextEdition = 90;
const editions: string[] = [];

function renderExtras(o: Observation) {
  const s = game.state;
  $('sound').textContent = soundOn() ? '🔊' : '🔇';
  // a new card: sounds, analytics (no popups, no tips; how to play lives in the intro)
  const k = s.event ? `${s.event.id}@${s.event.firedAt}` : '';
  if (k && k !== cardKey) {
    track('card_shown', { crisis_id: s.event!.id });
    if (s.event!.id === 'iran' || s.event!.id === 'houthis') play('siren');
    else if (s.event!.id === 'kaplan') play('drum');
  }
  cardKey = k;
  if (o.status !== 'playing' && !overTracked) {
    overTracked = true;
    track('game_over', { reason: o.lostReason ?? o.status, days: Math.floor(o.pmDays), titles_count: o.titles.length });
  }
  // quarterly Friday edition: filed in the Log tab, announced by a small toast — never a popup
  edition ??= editionSnap(s);
  if (s.day >= nextEdition && s.phase === 'governing' && o.status === 'playing') {
    fileEdition(fridayEdition(s, edition), o.date);
    edition = editionSnap(s);
    nextEdition = s.day + 90;
  }
}

const METER_LABEL: Record<string, string> = { seats: 'ui.seats', approval: 'ui.approval', street: 'ui.street', trial: 'ui.trial', us: 'ui.us' };
function fileEdition(ed: ReturnType<typeof fridayEdition>, date: string) {
  const items = ed.items.length
    ? ed.items.map((x) => {
      const good = x.meter === 'trial' ? x.delta < 0 : x.delta > 0;
      return `<li class="${good ? 'good' : 'bad'}"><b>${esc(t(METER_LABEL[x.meter]))} ${signed(x.delta)}</b>${x.because ? ` — ${esc(x.because)}` : ''}</li>`;
    }).join('')
    : `<li>${esc(t('friday.quiet'))}</li>`;
  editions.unshift(`<details class="paper"${editions.length ? '' : ' open'}><summary><span class="mast">📰 ${esc(t('friday.masthead'))}</span> <small>${esc(date)}</small></summary>
    <h4>${esc(t(`friday.joke.${ed.joke}`))}</h4><ul>${items}</ul></details>`);
  editions.length = Math.min(editions.length, 4);
  $('editions').innerHTML = editions.join('');
  toast(`📰 ${t('ui.editionToast')}`);
}

function doAct(a: Action) {
  const r = game.act(a);
  if (!r.ok && r.error) toast(errorText(r));
  render();
  return r;
}

/** invite: say who joined, or who refused and the likely reason (never "nothing changed") */
function invite(id: string) {
  const before = game.observe(0);
  const p = before.parties.find((x) => x.id === id);
  if (!p) return;
  const seq = game.state.outcomeSeq;
  const r = game.act({ type: 'invite', partyId: id });
  if (!r.ok) { if (r.error) toast(errorText(r)); render(); return; }
  const after = game.observe(0).parties.find((x) => x.id === id);
  if (after?.inCoalition) { toast(`✅ ${t('ui.inviteYes', { party: p.name })}`); render(); return; }
  const why = !p.willSitWithBibi ? 'bibi' : Math.abs(p.position - before.govPosition) > 4 ? 'far'
    : p.satisfaction < 40 ? 'mood' : before.meters.approval < 40 ? 'polls' : 'luck';
  const text = t('ui.inviteNo', { party: p.name, why: t(`ui.inviteWhy.${why}`) });
  if (game.state.outcomeSeq > seq) actionNote = { seq: game.state.outcomeSeq, text };
  toast(`✖ ${text}`);
  render();
}

function restart(day: string | null = null) {
  daily = day;
  game = createGame({ seed: daily ? dailySeed(daily) : randomSeed() });
  for (const k of Object.keys(keys)) delete keys[k];
  lastTitles = 0;
  seenSeq = 0;
  shownSeats = shownAppr = seatsAtCard = lastCardAt = -1;
  flashQueue.length = 0;
  clearResult();
  toastQ.length = 0;
  cardKey = ''; overTracked = false; edition = null; nextEdition = 90;
  newsHold = true; hadEvent = false;
  editions.length = 0;
  $('editions').innerHTML = '';
  pendingPromise = null;
  actionNote = null;
  overWaiting = false;
  closeLayer();
  track('game_start', { lang: getLocale(), seed_type: daily ? 'daily' : 'random' });
  if (daily) toast(t('share.dailyBadge', { date: daily }));
  render();
}

// ------------------------------------------------------------------ input
app.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('a[data-share]')) track('share', { method: 'whatsapp', seed_type: daily ? 'daily' : 'random' });
  const b = (e.target as HTMLElement).closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.dir && d.dir !== 'ignore' && b.getAttribute('aria-disabled') === 'true') { if (!swipe.consumedClick()) blocked(d.dir); }
  else if (d.dir === 'ignore') choose('ignore');
  else if (d.dir) { if (!swipe.consumedClick()) swipe.flyThenChoose(d.dir); }
  else if (d.act === 'open' && d.sec) openSection(d.sec);
  else if (d.act === 'tab' && d.tab) { setTab(d.tab); render(); }
  else if (d.act === 'close') closeLayer();
  else if (d.act === 'intro') openIntro();
  else if (d.act === 'start') startFromIntro();
  else if (d.lang) {
    const u = new URL(location.href);
    if (layer === 'intro') store.set(INTRO_AGAIN, '1', session);
    try { localStorage.setItem(LANG_KEY, d.lang); u.searchParams.delete('lang'); } catch { u.searchParams.set('lang', d.lang); }
    location.href = u.toString();
  }
  else if (d.act === 'war') doAct({ type: 'startWar' });
  else if (d.act === 'next') { newsHold = false; render(); }
  else if (d.act === 'restart') restart();
  else if (d.act === 'daily') restart(todayKey());
  else if (d.share) doShare(d.share);
  else if (d.act === 'sound') { setSound(!soundOn()); if (soundOn()) play('cash'); render(); }
  else if (d.law) doAct({ type: 'passLaw', lawId: d.law });
  else if (d.reshuffle && d.to) { doAct({ type: 'giveMinistry', ministryId: d.reshuffle, partyId: d.to }); if (layer === 'sheet') closeLayer(); }
  else if (d.move) {
    const m = game.observe(0).moves.find((x) => x.id === d.move);
    if (m?.ending && !window.confirm(`${m.label}\n\n${m.desc}`)) return;
    doAct({ type: 'move', moveId: d.move });
    // a move played from the sheet: close it so the result line (and any card) is visible
    if (layer === 'sheet') closeLayer();
  }
  else if (d.invite) invite(d.invite);
  else if (d.pconfirm && d.pid) { pendingPromise = null; doAct({ type: 'promise', partyId: d.pconfirm, promiseId: d.pid }); }
  else if (d.pcancel) { pendingPromise = null; render(); }
  else if (d.act === 'trial') toast(t('ui.trialBadge', { n: Math.round(game.observe(0).meters.trial) }));
  else if (d.deliver && d.pid) doAct({ type: 'deliver', partyId: d.deliver, promiseId: d.pid });
});

// tap on the dimmed backdrop above the sheet closes it
document.addEventListener('pointerdown', (e) => {
  if (layer !== 'sheet') return;
  const el = e.target as HTMLElement;
  if (!el.closest('#drawer') && !el.closest('.bottombar') && !el.closest('#toast')) { e.preventDefault(); closeLayer(); }
});

app.addEventListener('change', (e) => {
  const s = e.target as HTMLSelectElement;
  // no promise on the first (maybe accidental) pick: show what it costs and when it is due, then Confirm
  if (s.dataset.promise && s.value) { pendingPromise = { party: s.dataset.promise, promise: s.value }; render(); }
});

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 'Escape') { if (layer === 'sheet' || layer === 'intro') { if (layer === 'intro') startFromIntro(); else closeLayer(); } return; }
  if (layer) return; // cards only take keys when no layer is open
  const dir = ({ ArrowLeft: 'left', ArrowRight: 'right' } as Record<string, string>)[e.key];
  if (dir && game.state.event) { e.preventDefault(); swipe.flyThenChoose(dir); }
  else if ((e.key === '0' || e.key === ' ') && game.state.event && game.observe(0).event?.options.some((x) => x.dir === 'ignore')) { e.preventDefault(); choose('ignore'); }
  else if ((e.key === ' ' || e.key === 'Enter') && holding() && tag !== 'BUTTON') { e.preventDefault(); newsHold = false; render(); }
  else if (e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); $('pause').click(); }
});

$('pause').addEventListener('click', () => {
  paused = !paused;
  $('pause').textContent = paused ? '▶' : '⏸';
  $('pause').setAttribute('aria-label', paused ? t('ui.resume') : t('ui.pause'));
});

function frame(now: number) {
  const dt = Math.min(250, now - last);
  last = now;
  if (!paused && !document.hidden && !game.over && layer !== 'intro' && layer !== 'sheet') {
    const c = game.state.config;
    if (hadEvent && !game.state.event) newsHold = true; // a card was just answered: read the news first
    hadEvent = !!game.state.event;
    const scale = game.state.event ? (c.pauseOnDecision ? 0 : c.uiCardClockScale) : holding() ? 0 : c.uiIdleClockScale;
    if (scale > 0) game.advance(dt * scale * (game.state.recess && !game.state.event ? c.recessClockMult : 1));
  }
  render();
  requestAnimationFrame(frame);
}
setTab(sheetTab);
initConsent();
if (!store.get(INTRO_KEY) || store.get(INTRO_AGAIN, session) || consentPending()) openIntro();
render();
requestAnimationFrame(frame);
track('game_start', { lang: getLocale(), seed_type: seedType });
if (daily) toast(t('share.dailyBadge', { date: daily }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state.event && !game.over) track('quit_on_card', { crisis_id: game.state.event.id });
});

// In-page bot hook: window.bibigame.game.act({...}) / .observe()
declare global { interface Window { bibigame: unknown } }
window.bibigame = {
  get game() { return game; },
  createGame,
  observe: () => game.observe(),
  act: (a: Action) => game.act(a),
  pause: (v = true) => { paused = v; },
  restart,
  intro: openIntro,
};
