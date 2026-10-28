// DOM layer. Reads Observation, sends Actions. No game logic here.
import './style.css';
import { createGame, promisesFor, type Game, type Observation, type OutcomeView } from '../api/game.ts';
import type { Action } from '../engine/types.ts';
import { titleBoard } from '../api/text.ts';
import { LANGS, getLocale, isLang, isRtl, loadLocale, partyChip, setLocale, t, type Lang } from '../i18n/index.ts';
import { hemicycleSvg } from './hemicycle.ts';
import { initSwipe } from './swipe.ts';
import { buzz, play, setSound, soundOn } from './fx.ts';
import { initConsent, track } from './analytics.ts';
import { advice, editionSnap, fridayEdition, type EditionSnap } from '../api/extras.ts';

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
let game: Game = createGame({ seed: Math.floor(Math.random() * 1e9) });
let paused = false;
let last = performance.now();
let lastTitles = 0;
const keys: Record<string, string> = {};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Bidi-isolate a signed number so RTL text shows "+3", not "3+" (survives esc()). */
const ltr = (x: string) => `\u2066${x}\u2069`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (v: number) => `${Math.max(0, Math.min(100, v)).toFixed(1)}%`;
const ARROW: Record<string, string> = { left: '←', right: '→', up: '↑', down: '↓' };

app.innerHTML = `
<header class="top">
  <div class="row1">
    <div class="who"><b>${t('ui.player')}</b> <span id="title" class="badge"></span></div>
    <div class="langs" role="group" aria-label="Language">${LANGS.map((l) => `<button data-lang="${l.code}" aria-pressed="${l.code === getLocale()}" lang="${l.code}">${l.label}</button>`).join('')}</div>
    <div id="date" class="date"></div>
    <button id="sound" class="icon" data-act="sound" aria-label="${t('ui.sound')}"></button>
    <button id="pause" class="icon" aria-label="${t('ui.pause')}">⏸</button>
  </div>
  <button id="timeline" class="timeline" aria-expanded="false" aria-label="${t('ui.timeline')}">
    <div class="tl-track" id="tltrack"></div>
    <div class="tl-caption" id="tlcap"></div>
  </button>
  <div id="history" class="history" hidden></div>
  <div class="support">
    <div class="bigseats" id="bigseats" aria-live="polite"><b id="seatnum">0</b><span class="of">/ 61</span><span id="margin" class="margin"></span><span id="seattrend" class="trend"></span></div>
    <div class="appr"><span>${t('ui.approval')}</span><b id="apprnum">0%</b><div class="mbar"><div id="apprbar"></div></div></div>
  </div>
  <div id="danger" class="dangerm" hidden></div>
  <div class="seatbar" id="seatbar"></div>
  <div id="seattxt" class="seattxt"></div>
  <div id="pchips" class="pchips" role="list"></div>
</header>
<main class="main">
  <section class="stage" id="stage"></section>
  <aside id="drawer" class="drawer" aria-label="${t('ui.moves')}">
    <button class="drawer-close" data-act="drawer">▾ ${t('ui.closeSheet')}</button>
    <button id="war" class="war" data-act="war"></button>
    <details class="panel hud"><summary>${t('ui.overview')}</summary>
      <div id="hemi"></div>
      <div id="slider" class="slider"></div>
      <div id="meters" class="meters"></div>
      <div id="chips" class="chips"></div>
    </details>
    <details class="panel" open><summary>${t('ui.parties')}</summary><div id="parties" class="parties"></div></details>
    <details class="panel"><summary>${t('ui.ministries')}</summary><div id="ministries" class="ministries"></div></details>
    <details class="panel"><summary>${t('ui.laws')}</summary><div id="laws" class="laws"></div></details>
    <details class="panel"><summary>${t('ui.movesPanel')}</summary><div id="moves" class="laws moves"></div></details>
    <details class="panel"><summary>${t('ui.log')}</summary><ol id="log" class="log"></ol></details>
    <p class="bothint">${t('ui.botHint')}</p>
  </aside>
</main>
<nav class="bottombar"><button id="movesbtn" data-act="drawer" class="moves">☰ ${t('ui.moves')} <span id="movesdot" class="dot" hidden></span></button></nav>
<div id="toast" class="toast" hidden></div>
<div id="advisor" class="advisor" hidden role="status"></div>
<div id="friday" class="friday" hidden></div>
<div id="result" class="result" hidden role="status" aria-live="polite"></div>
<div id="over" class="over" hidden></div>
`;

const $ = (id: string) => document.getElementById(id)!;

function region(id: string, key: string, html: () => string) {
  if (keys[id] === key) return;
  keys[id] = key;
  $(id).innerHTML = html();
}

const partyName = (o: Observation, id: string | null) => o.parties.find((p) => p.id === id)?.name ?? id ?? '—';

// ------------------------------------------------------------------ header
function renderTop(o: Observation) {
  const best = o.titles.length ? o.titles[o.titles.length - 1] : null;
  const title = $('title');
  title.textContent = best ? best.name : t('ui.noTitle');
  title.title = best ? best.gloss : '';
  $('date').textContent = o.date;
  const coal = o.parties.filter((p) => p.inCoalition && p.seats > 0).sort((a, b) => a.position - b.position);
  const opp = o.parties.filter((p) => !p.inCoalition && p.seats > 0).sort((a, b) => a.position - b.position);
  region('seatbar', [...coal, ...opp].map((p) => p.id + p.seats + p.inCoalition + p.mayLeave).join() + o.defectors, () =>
    [...coal, ...opp].map((p) => `<span class="seg ${p.inCoalition ? '' : 'opp'} ${p.mayLeave ? 'ghost' : ''}" style="flex:${p.seats};background:${p.color}" title="${esc(p.name)} ${p.seats}"></span>`).join('')
    + `<span class="maj" style="left:${(61 / 120) * 100}%"></span>`);
  renderSupport(o, coal);
  $('seattxt').innerHTML = o.opposition
    ? `<b class="bad">${esc(t('ui.rival', { n: o.opposition.stability }))}</b> · ${esc(t('ui.lastChance'))}`
    : o.phase === 'campaign'
    ? `<b class="bad">${esc(t('ui.campaign', { days: o.phaseLeftDays }))}</b>${o.electionLosses ? ` · ${esc(t('ui.lastChance'))}` : ''}`
    : `${o.defectors ? `${o.defectors} rogue MKs` : ''}`
      + coal.filter((p) => p.mayLeave).map((p) => ` · <span class="danger">⚠ ${esc(t('ui.without', { party: p.short || p.name, seats: p.seatsWithout }))}</span>`).join('');
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

function renderSupport(o: Observation, coal: Observation['parties']) {
  const seats = o.seats, margin = seats - o.majority;
  if (game.state.event && game.state.event.firedAt !== lastCardAt) { lastCardAt = game.state.event.firedAt; seatsAtCard = seats; }
  if (seatsAtCard < 0) seatsAtCard = seats;
  if (shownSeats < 0) { shownSeats = seats; $('seatnum').textContent = String(seats); }
  else if (seats !== shownSeats) { animateNum($('seatnum'), shownSeats, seats, String); shownSeats = seats; }
  const big = $('bigseats');
  big.dataset.state = o.phase === 'campaign' ? 'campaign' : o.opposition ? 'bad' : margin >= 3 ? 'good' : margin >= 0 ? 'warn' : 'bad';
  $('margin').textContent = o.phase === 'campaign' ? t('ui.campaignShort', { days: o.phaseLeftDays })
    : o.opposition ? t('ui.oppositionShort') : ltr(margin >= 0 ? `+${margin}` : `${margin}`);
  const d = seats - seatsAtCard;
  $('seattrend').textContent = d > 0 ? `↑${d}` : d < 0 ? `↓${-d}` : '';
  $('seattrend').className = `trend ${d > 0 ? 'good' : d < 0 ? 'bad' : ''}`;
  const a = Math.round(o.meters.approval);
  if (shownAppr < 0) { shownAppr = a; $('apprnum').textContent = `${a}%`; }
  else if (Math.abs(a - shownAppr) >= 2) { animateNum($('apprnum'), shownAppr, a, (n) => `${n}%`); shownAppr = a; }
  else if (a !== shownAppr && !game.state.event) { shownAppr = a; $('apprnum').textContent = `${a}%`; }
  const bar = $('apprbar');
  bar.style.width = pct(o.meters.approval);
  bar.className = o.meters.approval < 35 ? 'low' : '';
  // one extra meter, only when it's in danger
  const m = o.meters;
  const dangers: [string, number, boolean][] = [
    ['ui.trial', m.trial, m.trial > 70], ['ui.street', m.street, m.street < 30], ['ui.us', m.us, m.us < 30], ['ui.fiscal', m.fiscal, m.fiscal < 25],
  ];
  const dg = dangers.find((x) => x[2]);
  const dEl = $('danger');
  dEl.hidden = !dg;
  if (dg) dEl.innerHTML = `⚠ ${t(dg[0])} <b>${Math.round(dg[1])}</b>`;
  // compact coalition chips; tap → full party sheet
  region('pchips', coal.map((p) => [p.id, p.seats, p.satisfaction < 25 ? 'r' : p.satisfaction < 45 ? 'a' : 'g', p.mayLeave, p.trust.state === 'angry' || p.trust.waiting].join(':')).join('|'), () =>
    [...coal].sort((x, y) => y.seats - x.seats).map((p) => {
      const mood = p.mayLeave || p.satisfaction < 25 ? 'bad' : p.satisfaction < 45 ? 'warn' : 'good';
      return `<button class="pchip ${mood}" role="listitem" data-act="open" data-sec="parties" title="${esc(p.name)}"><i style="background:${p.color}"></i><span class="pn">${esc(partyChip(p.id, p.short || p.name))}</span> ${p.seats}${p.mayLeave ? ` <em>${t('ui.mayLeave')}</em>` : ''}${p.trust.state === 'angry' || p.trust.waiting ? ' ⏳' : ''}</button>`;
    }).join(''));
}

const ICON: Record<string, string> = {
  crisis: '', war: '⚔', election: '🗳', title: '👑', budget: '💰', case: '⚖', icc: '✈', promise: '🤝', distrust: '😠', goal: '🏁',
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
  if (tl.nextTitle) parts.push(`👑 ${t('tl.nextTitle', { title: tl.nextTitle.name, days: tl.nextTitle.inDays })}`);
  $('tlcap').textContent = parts.join(' · ');
  const hist = $('history');
  if (!hist.hidden) {
    region('history', String(game.state.log.length) + tl.upcoming.length, () => {
      const full = game.observe(300);
      return `<h3>${t('ui.timeline')}</h3><ul class="tl-up">${tl.upcoming.map((m) => `<li>${ICON[m.kind] ?? '•'} ${m.date} — ${esc(m.label)} (${m.day - tl.nowDay}d)</li>`).join('')}</ul>
        <ol class="log">${[...full.log].reverse().map((e) => `<li class="${e.kind}"><time>d${e.day}</time> ${esc(e.text)}</li>`).join('')}</ol>`;
    });
  }
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
function renderStage(o: Observation) {
  const ev = o.event;
  const key = ev ? `${ev.id}|${game.state.event?.firedAt}|${ev.options.map((x) => x.available).join()}` : `none|${newsKey(o)}`;
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
        ? `<span class="fx mini">${op.preview.slice(0, 4).map((p) => `<span class="${p.up ? 'up' : 'down'}">${p.up ? '▲' : '▼'}${esc(p.label)}</span>`).join('')}</span>`
        : `<span class="why">${esc(op.why)}</span>`;
      return `<button class="hint hint-${dir}" data-dir="${dir}" ${op.available ? '' : 'disabled'} title="${esc(op.desc)}"><span class="arrow">${ARROW[dir]}</span> ${esc(op.label)}${op.odds !== null ? ` <b class="odds" title="${esc(t('ui.odds'))}">${op.odds}%</b>` : ''}${chips}</button>`;
    };
    const urgent = ev.id === 'angry';
    const ign = ev.options.find((x) => x.dir === 'ignore');
    const ignFx = ign ? ign.preview.filter((p) => !p.up).map((p) => p.label).slice(0, 3).join(', ') : '';
    const tutorial = o.outcomeSeq === 0 ? `<p class="tutorial">${t('ui.tutorial')}</p>` : '';
    return `<div id="card" class="swipecard ${enter} ${urgent ? 'urgent' : ''}" tabindex="0" aria-label="${esc(ev.title)}">
      ${hint('up')}
      <div class="cbody">
        <svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" class="ring-bg"/><circle id="ring" cx="20" cy="20" r="16" class="ring-fg"/></svg>
        <h2>${esc(ev.title)}${ev.subject ? ` <small>· ${esc(partyName(o, ev.subject))}</small>` : ''}</h2>
        <p>${esc(ev.text)}</p>
        ${tutorial}
        <div id="swipelabel" class="swipelabel" hidden></div>
      </div>
      <div class="lr">${hint('left')}${hint('right')}</div>
      ${hint('down')}
    </div>
    ${ign ? `<button class="ignorebtn" data-dir="ignore"><b>${t('ui.ignore')}</b> <small>${esc(t('ui.ignoreFx', { fx: ignFx || t('out.escalates') }))}</small> <kbd>0</kbd></button>` : ''}
    <p class="swipehint">${t('ui.swipeHint')}</p>`;
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
  return [o.phase, headline(o), o.timeline.upcoming[0]?.label, Math.floor(o.day / 15), o.cooldowns.ministry > 0, o.cooldowns.law > 0, o.war.cooldownDays > 0].join('|');
}

let lastStageKind = '';

function newsHtml(o: Observation, enter: string): string {
  const tl = o.timeline;
  const next = tl.upcoming.find((m) => m.kind !== 'goal');
  const ticker = [
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
    ${gov ? `<div class="quick">
      <button data-act="open" data-sec="parties">🤝 ${t('ui.qPromise')}</button>
      <button data-act="open" data-sec="ministries" ${o.cooldowns.ministry ? 'disabled' : ''}>🏛 ${t('ui.qMinistry')}</button>
      <button data-act="open" data-sec="laws" ${o.cooldowns.law ? 'disabled' : ''}>📜 ${t('ui.qLaw')}</button>
      <button data-act="war" class="warq" ${warOk ? '' : 'disabled'}>⚔ ${t('ui.war')}</button>
      <button data-act="open" data-sec="moves">🎲 ${t('ui.movesPanel')}</button>
    </div>` : `<div class="quick"><button data-act="open" data-sec="moves">🎲 ${t('ui.movesPanel')}</button></div>`}
  </div>`;
}

// ------------------------------------------------------------------ result flash (cause → result)
let seenSeq = 0;
const flashQueue: OutcomeView[] = [];
let flashUntil = 0;
const flashing = () => flashUntil > 0;

function pumpOutcomes(o: Observation) {
  if (o.outcomeSeq > seenSeq) {
    for (const r of o.outcomes) if (r.seq > seenSeq) flashQueue.push(r);
    seenSeq = o.outcomeSeq;
  }
  const now = performance.now();
  if (flashUntil && now < flashUntil) return;
  if (flashUntil) hideFlash();
  const r = flashQueue.shift();
  if (r) showFlash(r);
}

function showFlash(r: OutcomeView) {
  const el = $('result');
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  /** good = colour/emoji direction; shown = the number printed (trial: up is bad) */
  const chip = (label: string, good: number, extra = '', shown = good) => `<span class="fxchip ${good > 0 ? 'up' : 'down'} ${extra}">${esc(label)} <b><bdi dir="ltr">${sign(shown)}</bdi></b> ${good > 0 ? '😊' : '😠'}</span>`;
  const sat = r.sat.slice(0, 7).map((x) => chip(x.name, x.delta, x.inCoalition ? '' : 'opp')).join('');
  const meters = r.meters.map((x) => chip(x.label, x.meter === 'trial' ? -x.delta : x.delta, '', x.delta)).join('');
  const seats = r.seats.from !== r.seats.to ? `<p class="seats ${r.seats.to < r.seats.from ? 'bad' : 'good'}">${esc(t('out.seats', r.seats))}</p>` : '';
  const lj = [r.left.length ? t('out.leftList', { parties: r.left.join(', ') }) : '', r.joined.length ? t('out.joinedList', { parties: r.joined.join(', ') }) : ''].filter(Boolean).map((x) => `<p class="lj">${esc(x)}</p>`).join('');
  const risks = r.risks.length ? `<p class="risk">⚠ ${t('out.risk')}: ${esc(r.risks.join(' · '))}</p>` : '';
  const nothing = !sat && !meters && !seats && !lj ? `<p class="sub">${t('out.nothing')}</p>` : '';
  el.className = `result ${r.big ? 'big' : ''} ${r.kind}`;
  const quip = r.quip ? `<p class="quip">${esc(r.quip)}</p>` : '';
  const react = r.reaction ? `<p class="react">${esc(r.reaction)}</p>` : '';
  el.innerHTML = `<h3>${esc(r.cause)}</h3>${quip}${seats}${lj}<div class="fxrow">${sat}${meters}</div>${react}${risks}${nothing}<small class="sub">${t('ui.resultTap')}</small>`;
  el.hidden = false;
  flashUntil = performance.now() + (r.big ? 5000 : 2800);
  if (r.left.length) buzz([60, 30, 60]);
  else if (r.seats.to < r.seats.from || r.cause.startsWith(t('out.badNews', { crisis: '' }).trim())) buzz([30, 40, 30]);
  // floating deltas on the HUD meters + pulse on party cards
  const idx: Record<string, number> = { approval: 0, street: 1, us: 2, fiscal: 3, trial: 4 };
  for (const m of r.meters) floatOn(document.getElementById(`mv${idx[m.meter]}`), m.delta, m.meter === 'trial');
  for (const x of r.sat) {
    const card = app.querySelector<HTMLElement>(`[data-sat="${x.party}"]`)?.closest<HTMLElement>('.party');
    if (card) { card.classList.remove('pulse-up', 'pulse-down'); void card.offsetWidth; card.classList.add(x.delta > 0 ? 'pulse-up' : 'pulse-down'); }
  }
}

function hideFlash() { $('result').hidden = true; flashUntil = 0; }

function floatOn(el: HTMLElement | null, d: number, inverse = false) {
  if (!el || reduceMotion) return;
  const f = document.createElement('span');
  f.className = `floater ${(inverse ? d < 0 : d > 0) ? 'up' : 'down'}`;
  f.textContent = ltr(d > 0 ? `+${d}` : `${d}`);
  el.parentElement?.appendChild(f);
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
  el.innerHTML = `<b>${ARROW[dir!]} ${esc(op.label)}</b><div class="fx">${op.preview.map((p) => `<span class="${p.up ? 'up' : 'down'}">${p.up ? '▲' : '▼'} ${esc(p.label)}</span>`).join('')}</div>`;
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
});

// ------------------------------------------------------------------ drawer
function renderParties(o: Observation) {
  const list = o.parties.filter((p) => p.seats > 0)
    .sort((a, b) => Number(b.inCoalition) - Number(a.inCoalition) || b.seats - a.seats);
  const key = list.map((p) => [p.id, p.seats, p.inCoalition, p.wartime, p.threatening, p.mayLeave, p.trust.state, p.trust.waiting, p.ministries.length, p.trait?.id, p.lastChange?.day, Math.round(p.trend.perMonth), p.trend.reason].join(':')).join('|')
    + `|${o.cooldowns.invite > 0}|${o.cooldowns.law > 0}|${o.phase}`;
  region('parties', key, () => list.map((p) => {
    const promises = promisesFor(game.state, p.id);
    const canAct = o.phase === 'governing';
    const promiseSel = p.trust.state === 'neutral' && canAct
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

function renderMinistries(o: Observation) {
  const coal = o.parties.filter((p) => p.inCoalition && p.seats > 0);
  const ready = o.cooldowns.ministry === 0 && o.phase === 'governing';
  region('ministries', o.ministries.map((m) => m.holder).join() + coal.map((p) => p.id).join() + ready, () =>
    `<p class="sub">${ready ? t('ui.ready') : t('ui.cooldown', { days: o.cooldowns.ministry })}</p>` +
    o.ministries.map((m) => `<label class="min"><span>${esc(m.name)}</span>
      <select data-ministry="${m.id}" ${ready ? '' : 'disabled'}>${coal.map((p) => `<option value="${p.id}" ${p.id === m.holder ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      ${m.holder && !coal.some((p) => p.id === m.holder) ? `<option selected>${esc(partyName(o, m.holder))}</option>` : ''}</select></label>`).join(''));
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

function renderWar(o: Observation) {
  const btn = $('war') as HTMLButtonElement;
  const can = o.phase === 'governing' && !o.war.active && o.war.cooldownDays === 0 && o.tension;
  btn.disabled = !can;
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

// ------------------------------------------------------------------ overlays
function toast(msg: string) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout((el as unknown as { _t: number })._t);
  (el as unknown as { _t: number })._t = window.setTimeout(() => { el.hidden = true; }, 3500);
}

function renderOver(o: Observation) {
  const el = $('over');
  if (o.status === 'playing') { el.hidden = true; return; }
  if (!el.hidden) return;
  el.hidden = false;
  const why = o.status === 'won' ? 'won' : o.lostReason ?? 'deadlock';
  el.innerHTML = `<div class="overcard"><h2>${t('ui.gameOver')}: ${esc(t(`over.${why}.title`))}</h2>
    <p>${esc(t(`over.${why}.text`))}</p>
    <p>${(o.pmDays / 365.25).toFixed(1)} years as PM · ${o.elections} elections</p>
    <h3>${t('ui.titles')}</h3>
    <ul class="board">${titleBoard(game.state.titles).map((x) => `<li class="${x.earned ? 'earned' : 'locked'}"><b>${esc(x.name)}</b><small>${esc(x.gloss)}</small></li>`).join('')}</ul>
    <button data-act="restart" class="primary">${t('ui.restart')}</button></div>`;
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
    toast(`👑 ${t('ui.newTitle', { title: nt.name })} — ${nt.gloss}`);
    play('applause');
    track('title_earned', { title_id: game.state.titles[game.state.titles.length - 1] });
  }
  lastTitles = o.titles.length;
  if (o.termReached && !keys.termToast) { keys.termToast = '1'; toast(t('ui.termReached')); }
  pumpOutcomes(o);
  renderOver(o);
  renderExtras(o);
}

// ------------------------------------------------------------------ advisor, Friday edition, sound
let cardKey = '';
let cardsSeen = 0;
let overTracked = false;
const advShown: Record<string, number> = {};
let advUntil = 0;
let edition: EditionSnap | null = null;
let nextEdition = 90;
const fridayOpen = () => !$('friday').hidden;

function renderExtras(o: Observation) {
  const s = game.state;
  $('sound').textContent = soundOn() ? '🔊' : '🔇';
  // a new card: count it, sounds, analytics
  const k = s.event ? `${s.event.id}@${s.event.firedAt}` : '';
  if (k && k !== cardKey) {
    cardsSeen++;
    track('card_shown', { crisis_id: s.event!.id });
    if (s.event!.id === 'iran' || s.event!.id === 'houthis') play('siren');
    else if (s.event!.id === 'kaplan') play('drum');
    if (cardsSeen === 1 || cardsSeen % 3 === 0) showAdvice();
  }
  cardKey = k;
  if (advUntil && performance.now() > advUntil) hideAdvice();
  if (o.status !== 'playing' && !overTracked) {
    overTracked = true;
    track('game_over', { reason: o.lostReason ?? o.status, days: Math.floor(o.pmDays), titles_count: o.titles.length });
  }
  // quarterly Friday edition (clock paused while it is open)
  edition ??= editionSnap(s);
  if (s.day >= nextEdition && !s.event && !flashing() && s.phase === 'governing' && o.status === 'playing' && !fridayOpen()) {
    showFriday(fridayEdition(s, edition));
    edition = editionSnap(s);
    nextEdition = s.day + 90;
  }
}

function showAdvice() {
  const s = game.state;
  const a = advice(s).find((x) => advShown[x.id] === undefined || s.day - advShown[x.id] > 150);
  if (!a) return;
  advShown[a.id] = s.day;
  const el = $('advisor');
  el.innerHTML = `<b>🧑‍💼 ${t('adv.who')}</b> <span>${esc(t(a.key, a.params))}</span><button class="icon" data-act="advisor" aria-label="${t('ui.close')}">✕</button>`;
  el.hidden = false;
  advUntil = performance.now() + 9000;
}
function hideAdvice() { $('advisor').hidden = true; advUntil = 0; }

const METER_LABEL: Record<string, string> = { seats: 'ui.seats', approval: 'ui.approval', street: 'ui.street', trial: 'ui.trial', us: 'ui.us' };
function showFriday(ed: ReturnType<typeof fridayEdition>) {
  const el = $('friday');
  const sign = (n: number) => ltr(n > 0 ? `+${n}` : `${n}`);
  const items = ed.items.length
    ? ed.items.map((x) => {
      const good = x.meter === 'trial' ? x.delta < 0 : x.delta > 0;
      return `<li class="${good ? 'good' : 'bad'}"><b>${esc(t(METER_LABEL[x.meter]))} ${sign(x.delta)}</b>${x.because ? ` — ${esc(x.because)}` : ''}</li>`;
    }).join('')
    : `<li>${esc(t('friday.quiet'))}</li>`;
  el.innerHTML = `<div class="paper" role="dialog" aria-label="${esc(t('friday.masthead'))}">
    <div class="mast">${esc(t('friday.masthead'))}<small>${esc(o0Date())}</small></div>
    <h3>${esc(t(`friday.joke.${ed.joke}`))}</h3>
    <ul>${items}</ul>
    <button class="primary" data-act="friday">${t('friday.close')}</button></div>`;
  el.hidden = false;
}
const o0Date = () => game.observe(0).date;

function doAct(a: Action) {
  const r = game.act(a);
  if (!r.ok && r.error) toast(t(r.error));
  render();
}

function restart() {
  game = createGame({ seed: Math.floor(Math.random() * 1e9) });
  for (const k of Object.keys(keys)) delete keys[k];
  lastTitles = 0;
  seenSeq = 0;
  shownSeats = shownAppr = seatsAtCard = lastCardAt = -1;
  flashQueue.length = 0;
  hideFlash();
  $('over').hidden = true;
  cardKey = ''; cardsSeen = 0; overTracked = false; edition = null; nextEdition = 90;
  for (const k of Object.keys(advShown)) delete advShown[k];
  hideAdvice();
  $('friday').hidden = true;
  track('game_start', { lang: getLocale(), seed_type: 'random' });
  render();
}

// ------------------------------------------------------------------ input
$('result').addEventListener('click', () => hideFlash());

function openSection(sec: string) {
  const dr = $('drawer');
  dr.classList.add('open');
  const det = $(sec).closest('details');
  if (det) det.open = true;
  $(sec).scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
}

app.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.dir === 'ignore') choose('ignore');
  else if (d.dir) { if (!swipe.consumedClick()) swipe.flyThenChoose(d.dir); }
  else if (d.act === 'open' && d.sec) openSection(d.sec);
  else if (d.lang) {
    const u = new URL(location.href);
    try { localStorage.setItem(LANG_KEY, d.lang); u.searchParams.delete('lang'); } catch { u.searchParams.set('lang', d.lang); }
    location.href = u.toString();
  }
  else if (d.act === 'war') doAct({ type: 'startWar' });
  else if (d.act === 'restart') restart();
  else if (d.act === 'sound') { setSound(!soundOn()); if (soundOn()) play('cash'); render(); }
  else if (d.act === 'advisor') hideAdvice();
  else if (d.act === 'friday') $('friday').hidden = true;
  else if (d.act === 'drawer') $('drawer').classList.toggle('open');
  else if (d.law) doAct({ type: 'passLaw', lawId: d.law });
  else if (d.move) {
    const m = game.observe(0).moves.find((x) => x.id === d.move);
    if (m?.ending && !window.confirm(`${m.label}\n\n${m.desc}`)) return;
    doAct({ type: 'move', moveId: d.move });
  }
  else if (d.invite) doAct({ type: 'invite', partyId: d.invite });
  else if (d.deliver && d.pid) doAct({ type: 'deliver', partyId: d.deliver, promiseId: d.pid });
  else if (b.id === 'timeline') {
    const h = $('history');
    h.hidden = !h.hidden;
    b.setAttribute('aria-expanded', String(!h.hidden));
    keys.history = '';
  }
});

app.addEventListener('change', (e) => {
  const s = e.target as HTMLSelectElement;
  if (s.dataset.promise && s.value) doAct({ type: 'promise', partyId: s.dataset.promise, promiseId: s.value });
  else if (s.dataset.ministry) {
    const holder = game.state.ministries.find((m) => m.id === s.dataset.ministry)?.holder;
    if (s.value !== holder) doAct({ type: 'giveMinistry', ministryId: s.dataset.ministry, partyId: s.value });
    keys.ministries = '';
  }
});

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
  const dir = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as Record<string, string>)[e.key];
  if (dir && game.state.event) { e.preventDefault(); swipe.flyThenChoose(dir); }
  else if ((e.key === '0' || e.key === ' ') && game.state.event && game.observe(0).event?.options.some((x) => x.dir === 'ignore')) { e.preventDefault(); choose('ignore'); }
  else if (e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); $('pause').click(); }
  else if (e.key === 'Enter' && flashing()) hideFlash();
  else if (e.key === 'Escape') $('drawer').classList.remove('open');
});

$('pause').addEventListener('click', () => {
  paused = !paused;
  $('pause').textContent = paused ? '▶' : '⏸';
  $('pause').setAttribute('aria-label', paused ? t('ui.resume') : t('ui.pause'));
});

function frame(now: number) {
  const dt = Math.min(250, now - last);
  last = now;
  if (!paused && !document.hidden && !game.over) {
    const c = game.state.config;
    const scale = flashing() || fridayOpen() ? 0 : game.state.event ? (c.pauseOnDecision ? 0 : c.uiCardClockScale) : c.uiIdleClockScale;
    if (scale > 0) game.advance(dt * scale);
  }
  render();
  requestAnimationFrame(frame);
}
render();
requestAnimationFrame(frame);
initConsent();
track('game_start', { lang: getLocale(), seed_type: new URLSearchParams(location.search).has('seed') ? 'fixed' : 'random' });
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
};
