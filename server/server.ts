// Tiny local HTTP JSON API for bots in any language. No dependencies.
//   node server/server.ts            (PORT env, default 8787)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createGame, type Game } from '../src/api/game.ts';
import { renderText, runText, titleBoard } from '../src/api/text.ts';
import type { Action } from '../src/engine/types.ts';

const games = new Map<string, Game>();
const MAX_GAMES = 1000;

const ROUTES = {
  'POST /games': 'create a game: {"seed"?: number, "config"?: {...}} -> {id, state}',
  'GET /games/:id/state': 'observation (JSON)',
  'POST /games/:id/action': '{"type":"choose","optionId":"settle"} | giveMinistry | startWar | passLaw | invite | promise | deliver | noop -> {result, state}',
  'POST /games/:id/advance': '{"days": 10} or {"ms": 1000} -> state',
  'GET /games/:id/text': 'state as plain text',
  'POST /games/:id/text': 'plain-text command (body text/plain or {"command": "..."}) -> plain text',
  'GET /games/:id/titles': 'all titles, earned + locked',
  'DELETE /games/:id': 'drop a game',
};

function send(res: ServerResponse, code: number, body: unknown, type = 'application/json') {
  res.writeHead(code, {
    'content-type': `${type}; charset=utf-8`,
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
  });
  res.end(type === 'application/json' ? JSON.stringify(body, null, 1) : String(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1e6) throw new Error('body too large');
  }
  return data;
}

function parseJson(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export function makeServer() {
  return createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return send(res, 204, '');
      const url = new URL(req.url ?? '/', 'http://x');
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length === 0) return send(res, 200, { name: 'bibigame bot API', routes: ROUTES });
      if (parts[0] !== 'games') return send(res, 404, { error: 'not found' });

      if (parts.length === 1 && req.method === 'POST') {
        const body = parseJson(await readBody(req));
        if (games.size >= MAX_GAMES) games.delete(games.keys().next().value!);
        const id = randomUUID().slice(0, 8);
        const seed = typeof body.seed === 'number' ? body.seed : Math.floor(Math.random() * 1e9);
        const game = createGame({ seed, config: (body.config as object) ?? {} });
        games.set(id, game);
        return send(res, 201, { id, seed, state: game.observe() });
      }
      if (parts.length === 1 && req.method === 'GET') return send(res, 200, { games: [...games.keys()] });

      const game = games.get(parts[1]);
      if (!game) return send(res, 404, { error: 'no such game' });
      const sub = parts[2];
      if (!sub && req.method === 'DELETE') { games.delete(parts[1]); return send(res, 200, { ok: true }); }
      if (sub === 'state' && req.method === 'GET') return send(res, 200, game.observe(Number(url.searchParams.get('log') ?? 12)));
      if (sub === 'titles' && req.method === 'GET') return send(res, 200, titleBoard(game.state.titles));
      if (sub === 'action' && req.method === 'POST') {
        const action = parseJson(await readBody(req)) as unknown as Action;
        const result = game.act(action);
        return send(res, result.ok ? 200 : 400, { result, state: game.observe() });
      }
      if (sub === 'advance' && req.method === 'POST') {
        const body = parseJson(await readBody(req));
        const days = typeof body.days === 'number' ? body.days : typeof body.ms === 'number' ? body.ms / game.state.config.msPerDay : 1;
        return send(res, 200, game.advanceDays(Math.min(days, 3650)));
      }
      if (sub === 'text') {
        if (req.method === 'GET') return send(res, 200, renderText(game.observe()), 'text/plain');
        if (req.method === 'POST') {
          const raw = await readBody(req);
          let cmd = raw;
          if ((req.headers['content-type'] ?? '').includes('json')) cmd = String(parseJson(raw).command ?? '');
          const { reply, ok } = runText(game, cmd.split('\n')[0]);
          return send(res, ok ? 200 : 400, reply, 'text/plain');
        }
      }
      return send(res, 404, { error: 'not found', routes: ROUTES });
    } catch (e) {
      return send(res, 400, { error: String((e as Error).message ?? e) });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  makeServer().listen(port, () => console.log(`bibigame bot API on http://localhost:${port}`));
}
