// Plain-text protocol for LLM agents / terminal play. Shared by the CLI and the
// HTTP server (POST /games/:id/text). Turn-based: time only moves on `wait`.
import { advice } from './extras.ts';
import type { Action } from '../engine/types.ts';
import { TITLES } from '../data/titles.ts';
import { t } from '../i18n/index.ts';
import { type Game, type Observation, formatOutcome, promisesFor } from './game.ts';

export type Command =
  | { kind: 'action'; action: Action }
  | { kind: 'wait'; days: number; untilEvent: boolean }
  | { kind: 'help' }
  | { kind: 'look' }
  | { kind: 'error'; message: string };

export const HELP = `Commands (one per line):
  left | right | up | down     swipe the crisis card (also 1-4, or ← → ↑ ↓); down = call early elections
  ignore | 0                   ignore the crisis (it escalates; not on urgent cards — there it means refuse)
  choose <option>              choose an option by id (e.g. choose settle)
  promise <party> <promise>    make a promise (e.g. promise liberman constitution)
  deliver <party> <promise>    actually do it (uses the law cooldown)
  ministry <party> from <party>   give one of <from>'s ministries to <party>
  ministry <party> <ministry>  give a specific ministry (e.g. ministry shas finance)
  invite <party>               try to bring a party into the coalition
  law <law>                    pass a law (see LAWS)
  war                          start a war (emergency button)
  move <id>                    a drawer move (see MOVES; also campaign tricks and opposition moves)
  wait [N|Nd|Nm]               let time pass; stops early when a crisis fires (default: until next crisis, max 30d)
  look                         print the state again
  help                         this text
Parties can be named by id, short code, name or leader alias.`;

const g_timeoutNote = (o: Observation) => `${o.event!.daysLeft}d to respond on wait; timeout = ${o.event!.id === 'angry' ? 'refuse' : 'ignore (escalates)'}`;

function bar(v: number, width = 10): string {
  const n = Math.round((Math.max(0, Math.min(100, v)) / 100) * width);
  return '#'.repeat(n) + '.'.repeat(width - n);
}

export function renderText(o: Observation): string {
  const L: string[] = [];
  const years = (o.pmDays / 365.25).toFixed(2);
  if ((o.status === 'lost' || o.status === 'retired') && o.lostReason) L.push(`GAME OVER: ${t(`over.${o.lostReason}.title`)} — ${t(`over.${o.lostReason}.text`)}`);
  L.push(`=== ${o.date} | day ${o.day} | PM for ${years}y (${Math.round(o.termProgress * 100)}% of 4y term${o.termReached ? ', TERM REACHED' : ''}) | ${o.status.toUpperCase()} ===`);
  if (o.opposition) L.push(`IN OPPOSITION: rival government stability ${o.opposition.stability}% (falls at 0; elections in ${o.opposition.daysLeft}d at the latest). Lose the next election and it is over.`);
  if (o.phase === 'campaign') L.push(`ELECTION CAMPAIGN: ${o.phaseLeftDays}d to election day (election #${o.elections}); chance the voters throw you out: ${Math.round(o.electionRisk * 100)}%`);
  L.push(`Coalition: ${o.seats}/120 (need ${o.majority})${o.defectors ? `, ${o.defectors} rogue MKs` : ''} | gov position ${o.govPosition} (-10 left .. +10 right)`);
  const m = o.meters;
  if (o.recess) L.push('RECESS: Knesset summer recess (no regular crises; wildcards still possible)');
  if (o.startConditions.length && o.day < 60) L.push(`Start: ${o.startConditions.map((x) => x.label).join('; ')}`);
  L.push(`Approval ${m.approval} | street calm ${m.street} | US ${m.us} (Trump ${o.trump.face} ${o.trump.mood}) | budget health ${m.fiscal} | trial ${m.trial} | open cases ${o.openCases}`);
  L.push(`Budget ${o.budget.dueYear}: ${o.budget.passed ? 'passed' : 'NOT passed (due 31 March)'}`);
  L.push(`War: ${o.war.active ? `ACTIVE ${o.war.daysLeft}d left` : o.war.cooldownDays ? `cooldown ${o.war.cooldownDays}d` : 'ready'} | cooldowns: ministry ${o.cooldowns.ministry}d, law ${o.cooldowns.law}d, invite ${o.cooldowns.invite}d`);
  L.push('PARTIES (id seats pos sat trust ministries trend):');
  const parties = [...o.parties].filter((p) => p.seats > 0).sort((a, b) => Number(b.inCoalition) - Number(a.inCoalition) || b.seats - a.seats);
  for (const p of parties) {
    const trust = p.trust.state === 'neutral' ? '-' : `${p.trust.waiting ? 'WAITING' : p.trust.state}:${p.trust.promiseId}${p.trust.state === 'angry' ? '' : `:${p.trust.daysLeft}d`}`;
    const flags = [p.trait && `trait:${p.trait.id}`, p.wartime && 'WARTIME', p.threatening && 'THREATENING', !p.inCoalition && !p.willSitWithBibi && 'boycotts-you'].filter(Boolean).join(' ');
    const tr = p.inCoalition && Math.abs(p.trend.perMonth) >= 0.5 ? ` ${p.trend.perMonth > 0 ? '↑+' : '↓'}${p.trend.perMonth}/mo (${p.trend.reason})` : '';
    const danger = p.mayLeave ? ` MAY LEAVE (without them: ${p.seatsWithout})` : '';
    L.push(`  ${p.inCoalition ? 'C' : 'o'} ${p.id.padEnd(9)} ${String(p.seats).padStart(2)}  ${String(p.position).padStart(3)}  ${bar(p.satisfaction)} ${String(Math.round(p.satisfaction)).padStart(3)}  ${trust}  [${p.ministries.join(',')}] ${flags}${tr}${danger}`);
  }
  const tl = o.timeline;
  const span = Math.max(tl.goalDay, tl.nowDay + 30) - tl.startDay || 1;
  const cells = 32;
  const at = (d: number) => Math.min(cells - 1, Math.max(0, Math.round(((d - tl.startDay) / span) * (cells - 1))));
  const strip: string[] = Array.from({ length: cells }, (_, i) => (i < at(tl.nowDay) ? '=' : '-'));
  for (const m of tl.upcoming) if (m.kind !== 'goal') strip[at(m.day)] = m.kind === 'election' ? 'E' : m.kind === 'budget' ? 'B' : m.kind === 'promise' || m.kind === 'distrust' ? 'p' : strip[at(m.day)];
  strip[at(tl.nowDay)] = '|';
  L.push(`TIMELINE: start [${strip.join('')}] goal ${tl.goalDay > tl.nowDay ? `in ${tl.goalDay - tl.nowDay}d` : 'reached'}${tl.nextTitle ? ` | next title: ${tl.nextTitle.name} in ${tl.nextTitle.inDays}d` : ''}`);
  if (tl.upcoming.length) L.push(`UPCOMING: ${tl.upcoming.slice(0, 6).map((m) => `${m.date} ${m.label} (${m.day - tl.nowDay}d)`).join('; ')}`);
  if (o.event) {
    L.push(`CRISIS: ${o.event.title} — ${o.event.text}${o.event.subject ? ` (subject: ${o.event.subject})` : ''} [${g_timeoutNote(o)}]`);
    const n: Record<string, number> = { left: 1, right: 2, up: 3, down: 4, ignore: 0 };
    for (const op of o.event.options) {
      const fx = op.preview.map((p) => `${p.label}${p.up ? '+' : '-'}`).join(', ');
      L.push(`  ${n[op.dir]}. ${op.dir.toUpperCase().padEnd(5)} ${op.label} (${op.id})${op.odds !== null ? ` [${op.odds}% odds]` : ''}${op.available ? '' : ` [unavailable: ${op.why}]`}${fx ? ` -> ${fx}` : ''}`);
    }
  } else if (o.phase === 'governing') L.push('No crisis right now.');
  L.push(`LAWS: ${o.laws.map((l) => l.id).join(', ')}`);
  if (o.moves.length) L.push(`MOVES: ${o.moves.map((m) => `${m.id}${m.available ? '' : m.cooldown ? ` (${m.cooldown}d)` : ` (n/a: ${m.why})`}${m.ending ? ' [ENDS GAME]' : ''}`).join(', ')}`);
  L.push(`PROMISES: ${o.promises.map((p) => `${p.id}->${p.to.join('/')}`).join(', ')}`);
  L.push(`TITLES: ${o.titles.length ? o.titles.map((x) => `${x.name} (${x.gloss})`).join('; ') : 'none yet'}`);
  if (o.log.length) {
    L.push('RECENT:');
    for (const e of o.log.slice(-6)) L.push(`  d${e.day} ${e.text}`);
  }
  return L.join('\n');
}

function resolveParty(g: Game, name: string | undefined): string | null {
  if (!name) return null;
  const n = name.toLowerCase().replace(/[^a-z0-9-]/g, '');
  for (const p of g.state.parties) {
    const keys = [p.id, p.short, p.name, ...(p.aliases ?? [])].map((k) => k.toLowerCase().replace(/[^a-z0-9-]/g, ''));
    if (keys.includes(n)) return p.id;
  }
  const pre = g.state.parties.find((p) => p.name.toLowerCase().replace(/[^a-z0-9-]/g, '').startsWith(n));
  return pre?.id ?? null;
}

export function parseCommand(g: Game, line: string): Command {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { kind: 'look' };
  const [cmd, ...rest] = words;
  const c = cmd.toLowerCase();
  const o = g.observe(0);
  const dirOf: Record<string, string> = { '0': 'ignore', ignore: 'ignore', '1': 'left', '2': 'right', '3': 'up', '4': 'down', '←': 'left', '→': 'right', '↑': 'up', '↓': 'down', left: 'left', right: 'right', up: 'up', down: 'down' };
  if (dirOf[c]) {
    const opt = o.event?.options.find((x) => x.dir === dirOf[c]);
    if (!opt && dirOf[c] === 'ignore' && o.event) return { kind: 'action', action: { type: 'choose', optionId: 'ignore' } };
    if (!opt) return { kind: 'error', message: o.event ? 'No option on that side.' : 'No crisis right now.' };
    return { kind: 'action', action: { type: 'choose', optionId: opt.id } };
  }
  switch (c) {
    case 'help': case '?': return { kind: 'help' };
    case 'look': case 'state': return { kind: 'look' };
    case 'choose': return rest[0] ? { kind: 'action', action: { type: 'choose', optionId: rest[0].toLowerCase() } } : { kind: 'error', message: 'choose <option>' };
    case 'war': return { kind: 'action', action: { type: 'startWar' } };
    case 'move': return rest[0] ? { kind: 'action', action: { type: 'move', moveId: rest[0].toLowerCase() } } : { kind: 'error', message: 'move <id> (see MOVES)' };
    case 'noop': return { kind: 'action', action: { type: 'noop' } };
    case 'law': return rest[0] ? { kind: 'action', action: { type: 'passLaw', lawId: rest[0].toLowerCase() } } : { kind: 'error', message: 'law <law>' };
    case 'invite': {
      const p = resolveParty(g, rest[0]);
      return p ? { kind: 'action', action: { type: 'invite', partyId: p } } : { kind: 'error', message: `Unknown party: ${rest[0] ?? ''}` };
    }
    case 'promise': case 'deliver': {
      const p = resolveParty(g, rest[0]);
      if (!p) return { kind: 'error', message: `Unknown party: ${rest[0] ?? ''}` };
      const promiseId = (rest[1] ?? '').toLowerCase();
      if (!promiseId) return { kind: 'error', message: `Promises for ${p}: ${promisesFor(g.state, p).join(', ')}` };
      return { kind: 'action', action: { type: c, partyId: p, promiseId } };
    }
    case 'ministry': case 'give': {
      const to = resolveParty(g, rest[0]);
      if (!to) return { kind: 'error', message: `Unknown party: ${rest[0] ?? ''}` };
      if (rest[1]?.toLowerCase() === 'from') {
        const from = resolveParty(g, rest[2]);
        if (!from) return { kind: 'error', message: `Unknown party: ${rest[2] ?? ''}` };
        const m = g.state.ministries.find((x) => x.holder === from);
        if (!m) return { kind: 'error', message: `${from} holds no ministry.` };
        return { kind: 'action', action: { type: 'giveMinistry', ministryId: m.id, partyId: to } };
      }
      const mid = (rest[1] ?? '').toLowerCase();
      if (!g.state.ministries.some((x) => x.id === mid)) return { kind: 'error', message: `Ministries: ${g.state.ministries.map((x) => x.id).join(', ')}` };
      return { kind: 'action', action: { type: 'giveMinistry', ministryId: mid, partyId: to } };
    }
    case 'wait': {
      const a = rest[0]?.toLowerCase();
      if (!a) return { kind: 'wait', days: 30, untilEvent: true };
      const mm = /^(\d+)([dm]?)$/.exec(a);
      if (!mm) return { kind: 'error', message: 'wait [N|Nd|Nm]' };
      const days = Number(mm[1]) * (mm[2] === 'm' ? 30 : 1);
      return { kind: 'wait', days: Math.min(days, 365), untilEvent: true };
    }
  }
  return { kind: 'error', message: `Unknown command: ${cmd}. Type help.` };
}

/** Run one text command; returns the response text (result line + state). */
export function runText(g: Game, line: string): { reply: string; ok: boolean } {
  const cmd = parseCommand(g, line);
  const seq0 = g.state.outcomeSeq ?? 0;
  const sat0 = Object.fromEntries(g.state.parties.map((p) => [p.id, p.satisfaction]));
  let head = '';
  let ok = true;
  switch (cmd.kind) {
    case 'help': return { reply: HELP, ok: true };
    case 'look': break;
    case 'error': head = `ERROR: ${cmd.message}`; ok = false; break;
    case 'action': {
      const r = g.act(cmd.action);
      ok = r.ok;
      head = r.ok ? `OK: ${cmd.action.type}` : `REJECTED: ${t(r.error ?? 'err.unknown')}`;
      break;
    }
    case 'wait': {
      const start = g.state.day;
      const hadEvent = !!g.state.event;
      while (!g.over && g.state.day - start < cmd.days) {
        g.advanceDays(1);
        if (cmd.untilEvent && !hadEvent && g.state.event) break;
      }
      head = `Waited ${Math.round(g.state.day - start)}d.`;
      break;
    }
  }
  const o = g.observe();
  const res = (g.state.outcomes ?? []).filter((x) => x.seq > seq0).map((x) => formatOutcome(g.state, x));
  const lines: string[] = [];
  if (res.length) {
    lines.push('RESULT:');
    for (const r of res) {
      lines.push(`  ${r.big ? '!! ' : ''}${r.summary}`);
      if (r.quip) lines.push(`     ${r.quip}`);
      if (r.reaction) lines.push(`     ${r.reaction}`);
    }
  }
  if (cmd.kind === 'wait') {
    // passive drift: what time alone did, with the main reason
    const drift = o.parties.filter((p) => p.inCoalition && p.seats > 0)
      .map((p) => ({ p, d: Math.round(p.satisfaction - sat0[p.id]) })).filter((x) => x.d !== 0);
    if (drift.length) lines.push(`DRIFT: ${drift.map(({ p, d }) => `${p.id} ${d > 0 ? '+' : ''}${d} (${p.trend.reason})`).join('; ')}`);
  }
  const adv = advice(g.state)[0];
  if (adv) lines.push(`ADVISOR: ${t(adv.key, adv.params)}`);
  if (head) lines.unshift(head);
  return { reply: (lines.length ? lines.join('\n') + '\n' : '') + renderText(o), ok };
}

/** titles earned + locked, for end screens */
export function titleBoard(earned: string[]): { id: string; name: string; gloss: string; earned: boolean }[] {
  return TITLES.map((x) => ({ id: x.id, name: t(`title.${x.id}`), gloss: t(`title.${x.id}.gloss`), earned: earned.includes(x.id) }));
}

