import { describe, expect, it } from 'vitest';
import { createGame } from '../src/api/game.ts';
import { parseCommand, renderText, runText } from '../src/api/text.ts';

describe('text protocol', () => {
  it('parses commands with aliases', () => {
    const g = createGame({ seed: 1 });
    expect(parseCommand(g, 'promise liberman constitution')).toEqual({ kind: 'action', action: { type: 'promise', partyId: 'yb', promiseId: 'constitution' } });
    expect(parseCommand(g, 'deliver Shas exemption')).toEqual({ kind: 'action', action: { type: 'deliver', partyId: 'shas', promiseId: 'exemption' } });
    expect(parseCommand(g, 'ministry shas from otzma')).toEqual({ kind: 'action', action: { type: 'giveMinistry', ministryId: 'security', partyId: 'shas' } });
    expect(parseCommand(g, 'ministry utj finance')).toEqual({ kind: 'action', action: { type: 'giveMinistry', ministryId: 'finance', partyId: 'utj' } });
    expect(parseCommand(g, 'war')).toEqual({ kind: 'action', action: { type: 'startWar' } });
    expect(parseCommand(g, 'law reform')).toEqual({ kind: 'action', action: { type: 'passLaw', lawId: 'reform' } });
    expect(parseCommand(g, 'invite gantz')).toEqual({ kind: 'action', action: { type: 'invite', partyId: 'natunity' } });
    expect(parseCommand(g, 'wait 2m')).toEqual({ kind: 'wait', days: 60, untilEvent: true });
    expect(parseCommand(g, 'help').kind).toBe('help');
    expect(parseCommand(g, 'dance').kind).toBe('error');
    expect(parseCommand(g, 'invite nobody').kind).toBe('error');
  });
  it('numbered options pick from the current crisis', () => {
    const g = createGame({ seed: 2 });
    runText(g, 'wait');
    expect(g.state.event).not.toBeNull();
    const cmd = parseCommand(g, '1');
    expect(cmd.kind).toBe('action');
    const reply = runText(g, '1');
    expect(reply.reply).toMatch(/^OK: choose/);
  });
  it('renders a compact state block', () => {
    const g = createGame({ seed: 3 });
    const txt = renderText(g.observe());
    expect(txt).toContain('2026-12-01');
    expect(txt).toContain('Coalition: 64/120');
    expect(txt).toMatch(/C likud\s+32/);
  });
  it('is deterministic: same seed + commands → same transcript', () => {
    const cmds = ['wait', '1', 'promise shas exemption', 'wait 3m', '2', 'wait', 'deliver shas exemption', 'wait 6m'];
    const run = () => { const g = createGame({ seed: 11 }); return cmds.map((c) => runText(g, c).reply).join('\n'); };
    expect(run()).toBe(run());
  });
});
