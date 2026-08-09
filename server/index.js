// OpenWarlock — Node adapter around the authoritative room (shared/engine.js).
// One process = one game (lobby -> rounds -> gameover -> back to lobby).
// Serves the static client over HTTP and the game over WebSocket.
//
// The engine owns everything portable (seating, the wire switch, ghosts,
// name-bans, kick, autostart, lobby resets). THIS file owns the Node costume:
// http static serving, /health, ws + heartbeats, the JSONL journal, crash
// dumps, and IP-based bans. Same wire protocol as before the extraction.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createEngine } from '../shared/engine.js';
import { snapshot } from '../shared/sim.js';
import { TICK_RATE, SNAPSHOT_RATE } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const arg = (name) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const PORT = Number(process.env.PORT || arg('port') || 3000);
const SEED = Number(process.env.SEED || arg('seed') || (Math.random() * 2 ** 31) | 0);
const JOURNAL = process.env.JOURNAL || arg('journal') || null;
const MAX_PLAYERS = 10;

// ---- journal: JSONL log of everything that happens (for the test harness
// and for post-mortem debugging; enabled with --journal=<file>) -------------

let tick = 0;
const journalStream = JOURNAL ? fs.createWriteStream(JOURNAL, { flags: 'a' }) : null;
function journal(k, data) {
  if (!journalStream) return;
  journalStream.write(JSON.stringify({ ms: Date.now(), tick, k, ...data }) + '\n');
}

function crashDump(kind, err) {
  const entry = {
    ms: Date.now(), tick, k: 'crash', kind,
    error: String(err && err.stack || err),
    state: (() => { try { return snapshot(engine.game); } catch { return 'unserializable'; } })(),
  };
  try {
    // Write synchronously: process.exit(1) follows immediately and would drop
    // an async journalStream.write, leaving no trace of the crash on disk.
    if (JOURNAL) fs.appendFileSync(JOURNAL, JSON.stringify(entry) + '\n');
    else fs.writeFileSync(path.join(ROOT, `crash-${Date.now()}.json`), JSON.stringify(entry, null, 2));
  } catch { /* nothing left to do */ }
  console.error(`[warlock] FATAL (${kind}):`, err);
}

process.on('uncaughtException', (err) => { crashDump('uncaughtException', err); process.exit(1); });
process.on('unhandledRejection', (err) => { crashDump('unhandledRejection', err); process.exit(1); });

// ---- static file server -------------------------------------------------

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.m4a': 'audio/mp4',
};

const httpServer = http.createServer((req, res) => {
  let urlPath;
  try {
    // decodeURIComponent throws URIError on malformed escapes (e.g. GET /%);
    // an uncaught throw here would take down the whole game process.
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400); res.end('bad request');
    return;
  }
  if (urlPath === '/health') {
    const game = engine.game;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true, tick, phase: game.phase, round: game.round,
      players: Object.keys(game.players).length, uptime: process.uptime(),
    }));
    return;
  }
  // The client lives at /client/ so its relative asset/script paths work from
  // BOTH this server and a static subpath host (GitHub Pages). Serving the
  // html at '/' would break those relative paths, hence the redirect.
  if (urlPath === '/') {
    res.writeHead(302, { Location: '/client/' });
    res.end();
    return;
  }
  if (urlPath === '/client' || urlPath === '/client/') urlPath = '/client/index.html';
  const file = path.normalize(path.join(ROOT, urlPath));
  const ok = file.startsWith(path.join(ROOT, 'client')) ||
             file.startsWith(path.join(ROOT, 'shared')) ||
             file.startsWith(path.join(ROOT, 'assets'));
  if (!ok) { res.writeHead(404); res.end('not found'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    // Cache policy: code (html/js) must revalidate on every load so players
    // never run stale clients after an update; media assets are immutable-ish.
    const ext = path.extname(file);
    const cache = file.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=86400'
      : 'no-cache';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cache,
    });
    res.end(data);
  });
});

// ---- the room + this adapter's connection bookkeeping ----------------------

let nextConnId = 1;
const sockets = new Map(); // playerId -> ws

// Bans (until the server restarts): a kicked-with-ban player is blocked by
// NAME (engine) and by IP (here). Name catches the classic offender — an
// abandoned tab that auto-reconnects under the same name 2 s after every
// kick; IP catches renames. Behind cloudflared every socket is local, so
// trust the CF-Connecting-IP header first.
const bannedIps = new Set();
const ipsById = new Map(); // playerId -> remote ip
const ipOf = (req) => String(
  req.headers['cf-connecting-ip'] ||
  String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
  req.socket.remoteAddress || '');

let journaledEvents = 0;

const engine = createEngine({
  seed: SEED,
  maxPlayers: MAX_PLAYERS,
  againGraceMs: Number(process.env.AGAIN_GRACE_MS || 45000),
  resetGraceMs: Number(process.env.RESET_GRACE_MS || 60_000),
  onSend: (connId, msg) => {
    const ws = sockets.get(connId);
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  },
  onKick: (connId, { ban }) => {
    if (ban) {
      const tip = ipsById.get(connId);
      if (tip) bannedIps.add(tip);
    }
    const tws = sockets.get(connId);
    if (tws) {
      try { tws.close(); } catch { }
      sockets.delete(connId);
    }
  },
  onUnbanAll: () => bannedIps.clear(),
  externalBans: () => bannedIps.size,
  onLog: (k, data) => {
    // a reset starts a NEW game with an empty events array; a stale cursor
    // would make the journal skip the first events of the new game
    if (k === 'reset') journaledEvents = 0;
    journal(k, data);
  },
});

// ---- websocket protocol ---------------------------------------------------
// client -> server: join, ready, spectate, mode, draft, move, cast, buy,
//                   draftPick, addBot, removeBot, again
// server -> client: welcome {id}, snap {state, events}, denied {reason}

const wss = new WebSocketServer({ server: httpServer });

// Zombie reaper: connections through tunnels (cloudflared) often die WITHOUT
// a close frame, leaving a ghost warlock seated forever — blocking the lobby
// (start needs every human ready). Ping every 15 s; a socket that misses two
// pongs is terminated, which fires 'close' and removes the player normally.
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 15000);
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { try { ws.terminate(); } catch { } continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { }
  }
}, HEARTBEAT_MS);

// RTT measure (round 18, Remi: "a friend had a lot of lag"): a second, faster
// ping stream whose payload is its own send time — the pong echoes the payload
// back (RFC 6455), so every browser reports its round-trip with zero client
// code. DELIBERATELY separate from the reaper above: folding this cadence into
// the reaper would shrink its miss-two-pongs tolerance from 30 s to 4 s and
// kill players on an ordinary tunnel stall.
const PING_MS = Number(process.env.PING_MS || 2000);
setInterval(() => {
  for (const ws of wss.clients) {
    try { ws.ping(String(Date.now())); } catch { }
  }
}, PING_MS);

wss.on('connection', (ws, req) => {
  const id = 'c' + nextConnId++;
  const ip = ipOf(req);
  let joined = false;
  ws.isAlive = true;
  ws.on('pong', (data) => {
    ws.isAlive = true;
    // RTT pings carry their send time; the reaper's plain ping echoes an
    // empty payload, which parses to 0 and is skipped here
    const t0 = Number(String(data));
    if (Number.isFinite(t0) && t0 > 0) ws.pingMs = Math.max(0, Date.now() - t0);
  });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { journal('badmsg', { id, raw: String(raw).slice(0, 200) }); return; }
    journal('msg', { id, m });
    if (!joined) {
      if (m.t !== 'join') return;
      // IP ban is this adapter's check; the engine handles the name ban inside join()
      if (ip && bannedIps.has(ip)) {
        journal('banned-join', { id, ip, name: String(m.name || '').slice(0, 16) });
        ws.send(JSON.stringify({ t: 'denied', reason: 'banned from this lobby' }));
        ws.close();
        return;
      }
      const r = engine.join(id, { name: m.name, avatar: m.avatar });
      if (!r.ok) {
        if (r.reason === 'banned from this lobby')
          journal('banned-join', { id, ip, name: String(m.name || '').slice(0, 16) });
        ws.send(JSON.stringify({ t: 'denied', reason: r.reason }));
        ws.close();
        return;
      }
      sockets.set(id, ws);
      ipsById.set(id, ip);
      joined = true;
      ws.send(JSON.stringify({ t: 'welcome', id }));
      return;
    }
    engine.message(id, m);
  });

  ws.on('close', () => {
    if (!joined) return;
    journal('disconnect', { id });
    sockets.delete(id);
    ipsById.delete(id);
    engine.leave(id);
  });
});

// ---- game loop -------------------------------------------------------------

const DT = 1 / TICK_RATE;
let lastPhase = engine.game.phase;
setInterval(() => {
  tick++;
  engine.tick(DT);
  const game = engine.game;

  if (journalStream) {
    // journal game events as they appear (snapshot loop drains the array).
    // Events go first: they chronologically precede any phase change they caused.
    for (; journaledEvents < game.events.length; journaledEvents++)
      journal('event', { e: game.events[journaledEvents] });
  }
  if (game.phase !== lastPhase) journal('phase', { from: lastPhase, to: game.phase, round: game.round });
  lastPhase = game.phase;

  if (journalStream) {
    if (tick % TICK_RATE === 0) {
      const players = {};
      for (const [id, p] of Object.entries(game.players))
        players[id] = {
          x: +p.x.toFixed(2), y: +p.y.toFixed(2), hp: +p.hp.toFixed(1),
          gold: p.gold, score: p.score, alive: p.alive, bot: p.bot,
          spells: p.spells, items: p.items,
          // co-op: campaign monsters are not seats — the invariant checker
          // must not count them as fighters (see test/harness/check.js)
          ...(p.wave ? { wave: true } : {}),
        };
      journal('digest', { phase: game.phase, round: game.round, mode: game.mode, arenaR: +game.arenaRadius.toFixed(1), players, proj: game.projectiles.length });
    }
  }
}, 1000 / TICK_RATE);

setInterval(() => {
  const game = engine.game;
  // journal any events that appeared since the last game tick (e.g. casts
  // triggered directly by client messages) before the engine drains them
  for (; journaledEvents < game.events.length; journaledEvents++)
    journal('event', { e: game.events[journaledEvents] });
  // per-player RTT: measured here on the real socket, reported by the engine
  for (const [pid, pws] of sockets)
    if (pws.pingMs != null) engine.setPing(pid, Math.round(pws.pingMs));
  engine.pushSnapshots();
  journaledEvents = 0; // pushSnapshots drained game.events
}, 1000 / SNAPSHOT_RATE);

// ---- go --------------------------------------------------------------------

httpServer.listen(PORT, () => {
  journal('start', { port: PORT, seed: SEED, pid: process.pid });
  const nets = os.networkInterfaces();
  const lan = Object.values(nets).flat().find(i => i && i.family === 'IPv4' && !i.internal);
  console.log(`\n  OpenWarlock server running`);
  console.log(`  Local:   http://localhost:${PORT}`);
  if (lan) console.log(`  LAN:     http://${lan.address}:${PORT}`);
  console.log(`  (use \`npm run host\` for a public internet URL)\n`);
});
