// DOM layer. Reads Observation, sends Actions. No game logic here.
import './style.css';
import { createGame, promisesFor, type Game, type Observation } from '../api/game.ts';
import type { Action } from '../engine/types.ts';
import { titleBoard } from '../api/text.ts';
import { t } from '../i18n/index.ts';
import { hemicycleSvg } from './hemicycle.ts';

const app = document.getElementById('app')!;
let game: Game = createGame({ seed: Math.floor(Math.random() * 1e9) });
let paused = false;
let last = performance.now();
let lastTitles = 0;
const keys: Record<string, string> = {};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (v: number) => `${Math.max(0, Math.min(100, v)).toFixed(1)}%`;

app.innerHTML = `
<header class="top">
  <div class="row1">
    <div class="who"><b>${t('ui.player')}</b> <span id="title" class="badge"></span></div>
    <div id="date" class="date"></div>
    <button id="pause" class="icon" aria-label="${t('ui.pause')}">⏸</button>
  </div>
  <div class="term"><div id="termbar" class="termfill"></div><span id="termtxt"></span></div>
  <div class="seatbar" id="seatbar"></div>
  <div id="seattxt" class="seattxt"></div>
</header>
<main class="main">
  <section class="card hud">
    <div id="hemi"></div>
    <div id="slider" class="slider"></div>
    <div id="meters" class="meters"></div>
    <div id="chips" class="chips"></div>
  </section>
  <details class="card" open><summary>${t('ui.parties')}</summary><div id="parties" class="parties"></div></details>
  <details class="card"><summary>${t('ui.ministries')}</summary><div id="ministries" class="ministries"></div></details>
  <details class="card"><summary>${t('ui.laws')}</summary><div id="laws" class="laws"></div></details>
  <details class="card" open><summary>${t('ui.log')}</summary><ol id="log" class="log"></ol></details>
  <p class="hint">${t('ui.botHint')}</p>
</main>
<footer class="dock">
  <div id="event" class="event"></div>
  <div class="actions"><button id="war" class="war" data-act="war"></button></div>
</footer>
<div id="toast" class="toast" hidden></div>
<div id="over" class="over" hidden></div>
`;

const $ = (id: string) => document.getElementById(id)!;

function region(id: string, key: string, html: () => string) {
  if (keys[id] === key) return;
  keys[id] = key;
  $(id).innerHTML = html();
}

function partyName(o: Observation, id: string | null) {
  return o.parties.find((p) => p.id === id)?.name ?? id ?? '—';
}

function renderTop(o: Observation) {
  const best = o.titles.length ? o.titles[o.titles.length - 1] : null;
  const title = $('title');
  title.textContent = best ? best.name : t('ui.noTitle');
  title.title = best ? best.gloss : '';
  $('date').textContent = o.date;
  ($('termbar') as HTMLElement).style.width = pct(o.termProgress * 100);
  $('termtxt').textContent = `${t('ui.term')}: ${(o.pmDays / 365.25).toFixed(1)} / 4y`;
  const coal = o.parties.filter((p) => p.inCoalition && p.seats > 0).sort((a, b) => a.position - b.position);
  const opp = o.parties.filter((p) => !p.inCoalition && p.seats > 0).sort((a, b) => a.position - b.position);
  region('seatbar', [...coal, ...opp].map((p) => p.id + p.seats + p.inCoalition).join() + o.defectors, () =>
    [...coal, ...opp].map((p) => `<span class="seg ${p.inCoalition ? '' : 'opp'}" style="flex:${p.seats};background:${p.color}" title="${esc(p.name)} ${p.seats}"></span>`).join('')
    + `<span class="maj" style="left:${(61 / 120) * 100}%"></span>`);
  const ok = o.seats >= o.majority;
  $('seattxt').innerHTML = o.phase === 'campaign'
    ? `<b class="bad">${esc(t('ui.campaign', { days: o.phaseLeftDays }))}</b>`
    : `${t('ui.seats')}: <b class="${ok ? 'good' : 'bad'}">${o.seats}</b>/120 · ${t('ui.majority')}${o.defectors ? ` · ${o.defectors} rogue` : ''}`;
}

function renderHud(o: Observation) {
  region('hemi', o.parties.map((p) => p.id + p.seats + p.inCoalition).join(), () => hemicycleSvg(o.parties));
  const coal = o.parties.filter((p) => p.inCoalition && p.seats > 0);
  region('slider', coal.map((p) => p.id).join() + o.govPosition, () => {
    const x = (v: number) => ((v + 10) / 20) * 100;
    return `<div class="track">${coal.map((p) => `<span class="band" style="left:${x(Math.max(-10, p.position - p.tolerance))}%;width:${x(Math.min(10, p.position + p.tolerance)) - x(Math.max(-10, p.position - p.tolerance))}%;background:${p.color}"></span><span class="pdot" style="left:${x(p.position)}%;background:${p.color}" title="${esc(p.name)}"></span>`).join('')}
      <span class="gov" style="left:${x(o.govPosition)}%" title="${t('ui.gov')}">▲</span></div>
      <div class="ends"><span>${t('ui.left')}</span><span>${t('ui.gov')} ${o.govPosition}</span><span>${t('ui.right')}</span></div>`;
  });
  const m = o.meters;
  const meters: [string, number, boolean][] = [
    ['ui.approval', m.approval, false], ['ui.street', m.street, false], ['ui.us', m.us, false],
    ['ui.fiscal', m.fiscal, false], ['ui.trial', m.trial, true],
  ];
  region('meters', 'static', () => meters.map(([k], i) =>
    `<div class="meter"><span>${t(k)}</span><div class="mbar"><div id="m${i}"></div></div><b id="mv${i}"></b></div>`).join(''));
  meters.forEach(([, v, inverse], i) => {
    const el = $(`m${i}`) as HTMLElement;
    el.style.width = pct(v);
    el.className = (inverse ? v > 60 : v < 35) ? 'low' : '';
    $(`mv${i}`).textContent = String(Math.round(v));
  });
  const chips: string[] = [];
  if (o.tension) chips.push(`<span class="chip warn">${t('ui.tension')}</span>`);
  if (o.iccDays) chips.push(`<span class="chip">${t('ui.icc', { days: o.iccDays })}</span>`);
  if (!o.budget.passed) chips.push(`<span class="chip">Budget ${o.budget.dueYear} ✗</span>`);
  if (o.openCases) chips.push(`<span class="chip">⚖ ${o.openCases}</span>`);
  $('chips').innerHTML = chips.join('');
}

function renderParties(o: Observation) {
  const list = o.parties.filter((p) => p.seats > 0)
    .sort((a, b) => Number(b.inCoalition) - Number(a.inCoalition) || b.seats - a.seats);
  const key = list.map((p) => [p.id, p.seats, p.inCoalition, p.wartime, p.threatening, p.trust.state, p.ministries.length].join(':')).join('|')
    + `|${o.cooldowns.invite > 0}|${o.cooldowns.law > 0}|${o.phase}`;
  region('parties', key, () => list.map((p) => {
    const promises = promisesFor(game.state, p.id);
    const canAct = o.phase === 'governing';
    const promiseSel = p.trust.state === 'neutral' && canAct
      ? `<select data-promise="${p.id}" aria-label="${t('ui.promise')}"><option value="">${t('ui.promise')}</option>${promises.map((id) => `<option value="${id}">${esc(t(`promise.${id}`))}</option>`).join('')}</select>` : '';
    const deliver = p.trust.state !== 'neutral' && p.trust.promiseId && canAct
      ? `<button data-deliver="${p.id}" data-pid="${p.trust.promiseId}" ${o.cooldowns.law > 0 ? 'disabled' : ''}>${t('ui.deliver')}: ${esc(t(`promise.${p.trust.promiseId}`))}</button>` : '';
    const invite = !p.inCoalition && canAct
      ? `<button data-invite="${p.id}" ${o.cooldowns.invite > 0 ? 'disabled' : ''}>${t('ui.invite')}</button>` : '';
    const flags = [p.wartime && t('ui.wartime'), p.threatening && t('ui.threatening')].filter(Boolean).join(' · ');
    return `<div class="party ${p.inCoalition ? 'in' : 'out'}" style="--c:${p.color}">
      <div class="phead"><b>${esc(p.name)}</b><span>${p.seats}</span></div>
      <div class="sat"><div data-sat="${p.id}"></div></div>
      <div class="pmeta"><span data-trust="${p.id}"></span>${flags ? `<span class="bad">${flags}</span>` : ''}<span>${p.ministries.length ? `🏛 ${p.ministries.length}` : ''}</span></div>
      <div class="pbtns">${promiseSel}${deliver}${invite}</div>
    </div>`;
  }).join(''));
  for (const p of list) {
    const bar = app.querySelector<HTMLElement>(`[data-sat="${p.id}"]`);
    if (bar) { bar.style.width = pct(p.satisfaction); bar.className = p.satisfaction < 25 ? 'low' : ''; }
    const tr = app.querySelector<HTMLElement>(`[data-trust="${p.id}"]`);
    if (tr) tr.textContent = p.trust.state === 'neutral' ? `${Math.round(p.satisfaction)}%` : `${Math.round(p.satisfaction)}% · ${t(`ui.trust.${p.trust.state}`, { days: p.trust.daysLeft })}`;
  }
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

function renderEvent(o: Observation) {
  const ev = o.event;
  const key = ev ? `${ev.id}|${game.state.event?.firedAt}|${ev.options.map((x) => x.available).join()}` : 'none';
  region('event', key, () => {
    if (!ev) return '';
    return `<div class="evcard"><h2>${esc(ev.title)}</h2><p>${esc(ev.text)}${ev.subject ? ` <i>(${esc(partyName(o, ev.subject))})</i>` : ''}</p>
      <div class="timer"><div id="evtimer"></div></div>
      <div class="opts">${ev.options.map((op) => `<button data-opt="${op.id}" ${op.available ? '' : 'disabled'} title="${esc(t(`remedy.${op.id}.desc`))}">${esc(op.label)}</button>`).join('')}</div></div>`;
  });
  $('event').classList.toggle('open', !!ev);
  if (ev) {
    const bar = document.getElementById('evtimer');
    if (bar) bar.style.width = pct((ev.daysLeft / game.state.config.eventTimeoutDays) * 100);
  }
}

function renderWar(o: Observation) {
  const btn = $('war') as HTMLButtonElement;
  const can = o.phase === 'governing' && !o.war.active && o.war.cooldownDays === 0 && o.tension;
  btn.disabled = !can;
  btn.textContent = o.war.active ? t('ui.warActive', { days: o.war.daysLeft })
    : o.war.cooldownDays ? t('ui.warCooldown', { days: o.war.cooldownDays })
    : `💥 ${t('ui.war')}${o.tension ? '' : ' (—)'}`;
}

function renderLog() {
  const s = game.state;
  const o = game.observe(30);
  region('log', String(s.log.length) + (s.log[s.log.length - 1]?.t ?? ''), () =>
    [...o.log].reverse().map((e) => `<li class="${e.kind}"><time>d${e.day}</time> ${esc(e.text)}</li>`).join(''));
}

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
  el.innerHTML = `<div class="overcard"><h2>${t('ui.gameOver')}</h2>
    <p>${o.status === 'won' ? t('ui.wonText') : t('ui.lostText')}</p>
    <p>${(o.pmDays / 365.25).toFixed(1)} years as PM · ${o.elections} elections</p>
    <h3>${t('ui.titles')}</h3>
    <ul class="board">${titleBoard(game.state.titles).map((x) => `<li class="${x.earned ? 'earned' : 'locked'}"><b>${esc(x.name)}</b><small>${esc(x.gloss)}</small></li>`).join('')}</ul>
    <button data-act="restart" class="primary">${t('ui.restart')}</button></div>`;
}

function render() {
  const o = game.observe();
  renderTop(o);
  renderHud(o);
  renderParties(o);
  renderMinistries(o);
  renderLaws(o);
  renderEvent(o);
  renderWar(o);
  renderLog();
  if (o.titles.length > lastTitles) {
    const nt = o.titles[o.titles.length - 1];
    toast(`👑 ${t('ui.newTitle', { title: nt.name })} — ${nt.gloss}`);
  }
  lastTitles = o.titles.length;
  if (o.termReached && !keys.termToast) { keys.termToast = '1'; toast(t('ui.termReached')); }
  renderOver(o);
}

function doAct(a: Action) {
  const r = game.act(a);
  if (!r.ok && r.error) toast(t(r.error));
  render();
}

function restart() {
  game = createGame({ seed: Math.floor(Math.random() * 1e9) });
  for (const k of Object.keys(keys)) delete keys[k];
  lastTitles = 0;
  $('over').hidden = true;
  render();
}

app.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.opt) doAct({ type: 'choose', optionId: d.opt });
  else if (d.act === 'war') doAct({ type: 'startWar' });
  else if (d.act === 'restart') restart();
  else if (d.law) doAct({ type: 'passLaw', lawId: d.law });
  else if (d.invite) doAct({ type: 'invite', partyId: d.invite });
  else if (d.deliver && d.pid) doAct({ type: 'deliver', partyId: d.deliver, promiseId: d.pid });
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

$('pause').addEventListener('click', () => {
  paused = !paused;
  $('pause').textContent = paused ? '▶' : '⏸';
  $('pause').setAttribute('aria-label', paused ? t('ui.resume') : t('ui.pause'));
});

function frame(now: number) {
  const dt = Math.min(250, now - last);
  last = now;
  if (!paused && !document.hidden && !game.over) game.advance(dt);
  render();
  requestAnimationFrame(frame);
}
render();
requestAnimationFrame(frame);

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
