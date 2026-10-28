// Plain-text protocol for LLM agents / terminal play. Shared by the CLI and the
// HTTP server (POST /games/:id/text). Turn-based: time only moves on `wait`.
import type { Action } from '../engine/types.ts';
import { TITLES } from '../data/titles.ts';
import { t } from '../i18n/index.ts';
import { type Game, type Observation, promisesFor } from './game.ts';

export type Command =
  | { kind: 'action'; action: Action }
  | { kind: 'wait'; days: number; untilEvent: boolean }
  | { kind: 'help' }
  | { kind: 'look' }
  | { kind: 'error'; message: string };

export const HELP = `Commands (one per line):
  <n>                          choose option n of the current crisis
  choose <option>              choose an option by id (e.g. choose settle)
  promise <party> <promise>    make a promise (e.g. promise liberman constitution)
  deliver <party> <promise>    actually do it (uses the law cooldown)
  ministry <party> from <party>   give one of <from>'s ministries to <party>
  ministry <party> <ministry>  give a specific ministry (e.g. ministry shas finance)
  invite <party>               try to bring a party into the coalition
  law <law>                    pass a law (see LAWS)
  war                          start a war (emergency button)
  wait [N|Nd|Nm]               let time pass; stops early when a crisis fires (default: until next crisis, max 30d)
  look                         print the state again
  help                         this text
Parties can be named by id, short code, name or leader alias.`;

function bar(v: number, width = 10): string {
  const n = Math.round((Math.max(0, Math.min(100, v)) / 100) * width);
  return '#'.repeat(n) + '.'.repeat(width - n);
}

export function renderText(o: Observation): string {
  const L: string[] = [];
  const years = (o.pmDays / 365.25).toFixed(2);
  L.push(`=== ${o.date} | day ${o.day} | PM for ${years}y (${Math.round(o.termProgress * 100)}% of 4y term${o.termReached ? ', TERM REACHED' : ''}) | ${o.status.toUpperCase()} ===`);
  if (o.phase === 'campaign') L.push(`ELECTION CAMPAIGN: ${o.phaseLeftDays}d to election day (election #${o.elections})`);
  L.push(`Coalition: ${o.seats}/120 (need ${o.majority})${o.defectors ? `, ${o.defectors} rogue MKs` : ''} | gov position ${o.govPosition} (-10 left .. +10 right)`);
  const m = o.meters;
  L.push(`Approval ${m.approval} | street calm ${m.street} | US ${m.us} | budget health ${m.fiscal} | trial ${m.trial} | open cases ${o.openCases}`);
  L.push(`Budget ${o.budget.dueYear}: ${o.budget.passed ? 'passed' : 'NOT passed (due 31 March)'}`);
  L.push(`War: ${o.war.active ? `ACTIVE ${o.war.daysLeft}d left` : o.war.cooldownDays ? `cooldown ${o.war.cooldownDays}d` : 'ready'} | cooldowns: ministry ${o.cooldowns.ministry}d, law ${o.cooldowns.law}d, invite ${o.cooldowns.invite}d`);
  L.push('PARTIES (id seats pos sat trust ministries):');
  const parties = [...o.parties].filter((p) => p.seats > 0).sort((a, b) => Number(b.inCoalition) - Number(a.inCoalition) || b.seats - a.seats);
  for (const p of parties) {
    const trust = p.trust.state === 'neutral' ? '-' : `${p.trust.state}:${p.trust.promiseId}:${p.trust.daysLeft}d`;
    const flags = [p.wartime && 'WARTIME', p.threatening && 'THREATENING', !p.inCoalition && !p.willSitWithBibi && 'boycotts-you'].filter(Boolean).join(' ');
    L.push(`  ${p.inCoalition ? 'C' : 'o'} ${p.id.padEnd(9)} ${String(p.seats).padStart(2)}  ${String(p.position).padStart(3)}  ${bar(p.satisfaction)} ${String(Math.round(p.satisfaction)).padStart(3)}  ${trust}  [${p.ministries.join(',')}] ${flags}`);
  }
  if (o.event) {
    L.push(`CRISIS: ${o.event.title} — ${o.event.text}${o.event.subject ? ` (subject: ${o.event.subject})` : ''} [${o.event.daysLeft}d to respond; default: ignore]`);
    o.event.options.forEach((op, i) => L.push(`  ${i + 1}. ${op.label} (${op.id})${op.available ? '' : ' [unavailable]'}`));
  } else if (o.phase === 'governing') L.push('No crisis right now.');
  L.push(`LAWS: ${o.laws.map((l) => l.id).join(', ')}`);
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
  if (/^\d+$/.test(c)) {
    const opt = o.event?.options[Number(c) - 1];
    if (!opt) return { kind: 'error', message: 'No such option.' };
    return { kind: 'action', action: { type: 'choose', optionId: opt.id } };
  }
  switch (c) {
    case 'help': case '?': return { kind: 'help' };
    case 'look': case 'state': return { kind: 'look' };
    case 'choose': return rest[0] ? { kind: 'action', action: { type: 'choose', optionId: rest[0].toLowerCase() } } : { kind: 'error', message: 'choose <option>' };
    case 'war': return { kind: 'action', action: { type: 'startWar' } };
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
  return { reply: (head ? head + '\n' : '') + renderText(g.observe()), ok };
}

/** titles earned + locked, for end screens */
export function titleBoard(earned: string[]): { id: string; name: string; gloss: string; earned: boolean }[] {
  return TITLES.map((x) => ({ id: x.id, name: t(`title.${x.id}`), gloss: t(`title.${x.id}.gloss`), earned: earned.includes(x.id) }));
}

