// OpenWarlock — authoritative game server.
// One process = one game (lobby -> rounds -> gameover -> back to lobby).
// Serves the static client over HTTP and the game over WebSocket.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  createGame, addPlayer, removePlayer, setMoveTarget, castSpell, buy,
  startGame, step, snapshot, viewEvents, stepBot, botShop, setShopReady,
  setSpectator, fighters, setMode,
} from '../shared/sim.js';
import { TICK_RATE, SNAPSHOT_RATE, BOTS, BUILDS } from '../shared/constants.js';

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
    state: (() => { try { return snapshot(game); } catch { return 'unserializable'; } })(),
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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true, tick, phase: game.phase, round: game.round,
      players: Object.keys(game.players).length, uptime: process.uptime(),
    }));
    return;
  }
  if (urlPath === '/') urlPath = '/client/index.html';
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

// ---- game state ----------------------------------------------------------

let game = createGame({ seed: SEED });
let nextConnId = 1;
let nextBotId = 1;
const sockets = new Map(); // playerId -> ws
let lastPhase = game.phase;

const BOT_NAMES = ['Gul\'dan', 'Kil\'jaeden', 'Cho\'gall', 'Teron', 'Nerzhul', 'Archimonde'];
const BOT_AVATARS = ['👹', '💀', '👺', '🧟', '🐉', '😈'];

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of sockets.values()) if (ws.readyState === 1) ws.send(msg);
}

// Seats that count against MAX_PLAYERS: co-op campaign monsters are spawned by
// the simulation and must never keep a human out of their own game.
function playerCount() {
  return Object.values(game.players).filter(p => !p.wave).length;
}

function maybeAutoStart() {
  if (game.phase !== 'lobby') return;
  const humans = Object.values(game.players).filter(p => !p.bot);
  // co-op is playable solo (the campaign scales to the party); the free-for-all
  // rulesets still need somebody to fight
  const need = game.mode === 'coop' ? 1 : 2;
  if (humans.length >= 1 && humans.every(p => p.ready) && fighters(game).length >= need) {
    startGame(game);
  }
}

// How long the final standings stay up for the stragglers once somebody has
// clicked Continue.
const AGAIN_GRACE_MS = Number(process.env.AGAIN_GRACE_MS || 45000);
let againTimer = null;

function resetToLobby() {
  journal('reset', {});
  clearTimeout(againTimer); againTimer = null;
  ghosts.clear(); // progress stashes never outlive the game they came from
  const old = game.players;
  // the ruleset (like avatars) survives "play again"
  game = createGame({ seed: SEED + game.round + 1, mode: game.mode });
  // the new game starts with an empty events array; a stale counter would
  // make the journal skip the first events of the new game
  journaledEvents = 0;
  for (const [id, p] of Object.entries(old)) {
    if (p.wave) continue; // campaign monsters belong to the level, not the lobby
    if (p.bot || sockets.has(id)) {
      const np = addPlayer(game, id, p.name, { bot: p.bot, color: p.color, avatar: p.avatar, kind: p.kind, build: p.build });
      np.ready = false;
      np.spectator = p.spectator;
    }
  }
}

// ---- websocket protocol ---------------------------------------------------
// client -> server: join, ready, spectate, mode, move, cast, buy, addBot, removeBot, again
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

// Bans (until the server restarts): a kicked-with-ban player is blocked by
// NAME and by IP. Name catches the classic offender — an abandoned tab that
// auto-reconnects under the same name 2 s after every kick; IP catches
// renames. Behind cloudflared every socket is local, so trust the
// CF-Connecting-IP header first.
const bannedNames = new Set();
const bannedIps = new Set();

// Reconnect persistence (2026-08-05): a human who drops mid-game keeps their
// progress. On disconnect during a running game the player's earnings/score/
// build are stashed under their normalized NAME; the next join with that name
// gets them back (10-minute freshness cap). Stashes die with the game
// (resetToLobby) — names are trusted within a friends lobby, same as bans.
const GHOST_TTL_MS = 10 * 60 * 1000;
const ghosts = new Map(); // normName -> {at, ...progress}

// Humans-all-gone mid-game: wait this long for a reconnect before resetting.
const RESET_GRACE_MS = Number(process.env.RESET_GRACE_MS || 60_000);
let lobbyResetTimer = null;
function scheduleLobbyReset() {
  if (lobbyResetTimer) return;
  journal('reset-scheduled', { inMs: RESET_GRACE_MS });
  lobbyResetTimer = setTimeout(() => {
    lobbyResetTimer = null;
    // a human made it back during the grace window: keep the game alive
    if (Object.values(game.players).some(p => !p.bot)) return;
    resetToLobby();
  }, RESET_GRACE_MS);
}
function cancelLobbyReset() {
  if (!lobbyResetTimer) return;
  clearTimeout(lobbyResetTimer);
  lobbyResetTimer = null;
}
const ipsById = new Map(); // playerId -> remote ip
const normName = (n) => String(n || '').trim().toLowerCase().slice(0, 16);
const ipOf = (req) => String(
  req.headers['cf-connecting-ip'] ||
  String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
  req.socket.remoteAddress || '');

wss.on('connection', (ws, req) => {
  const id = 'c' + nextConnId++;
  const ip = ipOf(req);
  let joined = false;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { journal('badmsg', { id, raw: String(raw).slice(0, 200) }); return; }
    journal('msg', { id, m });
    if (!joined) {
      if (m.t !== 'join') return;
      if (bannedNames.has(normName(m.name)) || (ip && bannedIps.has(ip))) {
        journal('banned-join', { id, ip, name: String(m.name || '').slice(0, 16) });
        ws.send(JSON.stringify({ t: 'denied', reason: 'banned from this lobby' }));
        ws.close();
        return;
      }
      if (playerCount() >= MAX_PLAYERS) {
        ws.send(JSON.stringify({ t: 'denied', reason: 'game is full' }));
        ws.close();
        return;
      }
      const pl = addPlayer(game, id, m.name || 'warlock', {
        avatar: typeof m.avatar === 'string' ? m.avatar : undefined,
      });
      if (game.phase === 'countdown') {
        // the fight hasn't started yet — seat them straight into this round
        pl.alive = true;
        const n = Object.keys(game.players).length;
        const a = n * 2.39996; // golden angle: spreads any number of joiners
        const r = 56 * 0.6;
        pl.x = Math.cos(a) * r; pl.y = Math.sin(a) * r;
      } else if (game.phase !== 'lobby') {
        // mid-battle joiners are seated but dead until the next round
        pl.alive = false;
      }
      cancelLobbyReset(); // a human is back: the game no longer needs to die
      // returning player? restore the progress their dropped socket stashed
      const ghost = ghosts.get(normName(m.name));
      if (ghost && Date.now() - ghost.at < GHOST_TTL_MS && game.phase !== 'lobby') {
        pl.color = ghost.color;
        if (pl.avatar === '🧙') pl.avatar = ghost.avatar;
        pl.gold = ghost.gold; pl.goldEarned = ghost.goldEarned;
        pl.kills = ghost.kills; pl.deaths = ghost.deaths;
        pl.dmgDealt = ghost.dmgDealt;
        pl.maxHp = ghost.maxHp; // amulet hp travels here — never re-apply items
        pl.hp = Math.min(pl.hp, pl.maxHp);
        pl.spells = ghost.spells; pl.items = ghost.items; pl.elements = ghost.elements;
        pl.momentumHits = ghost.momentumHits || 0; // the permanent ramp survives
        ghosts.delete(normName(m.name));
        journal('reconnect-restore', { id, name: pl.name, kills: pl.kills, gold: pl.gold });
      }
      sockets.set(id, ws);
      ipsById.set(id, ip);
      joined = true;
      ws.send(JSON.stringify({ t: 'welcome', id }));
      return;
    }
    const pl = game.players[id];
    if (!pl) return;
    switch (m.t) {
      case 'ready':
        if (game.phase === 'shop') { setShopReady(game, id, !!m.ready); break; }
        pl.ready = !!m.ready;
        maybeAutoStart();
        break;
      case 'spectate':
        setSpectator(game, id, !!m.on);
        maybeAutoStart();
        break;
      case 'mode':
        // any player may flip the ruleset, but only in the lobby;
        // setMode validates both the phase and the value
        if (typeof m.mode === 'string') setMode(game, m.mode);
        break;
      case 'move':
        if (typeof m.x === 'number' && typeof m.y === 'number')
          setMoveTarget(game, id, m.x, m.y);
        break;
      case 'cast':
        if (typeof m.x === 'number' && typeof m.y === 'number' && typeof m.key === 'string')
          castSpell(game, id, m.key, m.x, m.y);
        break;
      case 'buy': {
        const r = buy(game, id, String(m.id || ''));
        journal('buy', { id, thing: m.id, ok: r.ok, err: r.err });
        if (!r.ok) ws.send(JSON.stringify({ t: 'denied', reason: r.err }));
        break;
      }
      case 'addBot': {
        if (game.phase !== 'lobby' || playerCount() >= MAX_PLAYERS) break;
        const kind = Object.hasOwn(BOTS, m.kind) ? m.kind : 'grunt';
        // build strategy: explicit lobby pick, or a random one ('random'/absent)
        const buildKeys = Object.keys(BUILDS);
        const build = typeof m.build === 'string' && Object.hasOwn(BUILDS, m.build)
          ? m.build : buildKeys[(Math.random() * buildKeys.length) | 0];
        const bid = 'bot' + nextBotId++;
        const bp = addPlayer(game, bid, BOT_NAMES[(nextBotId - 2) % BOT_NAMES.length], {
          bot: true, kind, build, avatar: BOT_AVATARS[(nextBotId - 2) % BOT_AVATARS.length],
        });
        bp.ready = true;
        maybeAutoStart();
        break;
      }
      case 'removeBot': {
        const bots = Object.values(game.players).filter(p => p.bot);
        if (bots.length && game.phase === 'lobby') removePlayer(game, bots[bots.length - 1].id);
        break;
      }
      case 'kick': {
        // lobby-only: boot a HUMAN player (ghost seats, AFK friends). With
        // ban:true their name+ip stay blocked until the server restarts —
        // else an abandoned tab just auto-reconnects 2 s later, forever.
        if (game.phase !== 'lobby' || typeof m.id !== 'string') break;
        const target = game.players[m.id];
        if (!target || target.bot || m.id === id) break;
        if (m.ban) {
          bannedNames.add(normName(target.name));
          const tip = ipsById.get(m.id);
          if (tip) bannedIps.add(tip);
        }
        const tws = sockets.get(m.id);
        if (tws) {
          try { tws.send(JSON.stringify({ t: 'denied', reason: m.ban ? 'banned from this lobby' : 'kicked from the lobby' })); } catch { }
          try { tws.close(); } catch { }
          sockets.delete(m.id);
        }
        journal('kick', { by: id, target: m.id, ban: !!m.ban });
        removePlayer(game, m.id);
        maybeAutoStart();
        break;
      }
      case 'unbanAll': {
        journal('unbanAll', { by: id, names: bannedNames.size, ips: bannedIps.size });
        bannedNames.clear();
        bannedIps.clear();
        break;
      }
      case 'again':
        // Everyone reads the final standings at their own pace, so one player
        // hitting Continue must NOT yank the table off everybody else's
        // screen (that was the "the scores vanish before I can look" report).
        // The lobby comes back when every connected human has acknowledged.
        if (game.phase !== 'gameover') break;
        pl.againReady = true;
        journal('again', { id });
        if (Object.values(game.players).every(p => p.bot || !sockets.has(p.id) || p.againReady)) {
          clearTimeout(againTimer); againTimer = null;
          resetToLobby();
        } else if (!againTimer) {
          // ...but one AFK player must not hold the lobby hostage forever
          againTimer = setTimeout(() => {
            againTimer = null;
            if (game.phase === 'gameover') resetToLobby();
          }, AGAIN_GRACE_MS);
        }
        break;
    }
  });

  ws.on('close', () => {
    if (!joined) return;
    journal('disconnect', { id });
    // stash a mid-game fighter's progress so a reconnect (same name) keeps it
    const pl = game.players[id];
    if (pl && !pl.bot && !pl.spectator &&
        game.phase !== 'lobby' && game.phase !== 'gameover') {
      ghosts.set(normName(pl.name), {
        at: Date.now(), color: pl.color, avatar: pl.avatar,
        gold: pl.gold, goldEarned: pl.goldEarned, kills: pl.kills,
        deaths: pl.deaths, dmgDealt: pl.dmgDealt, maxHp: pl.maxHp,
        spells: { ...pl.spells }, items: { ...pl.items },
        elements: { ...(pl.elements || {}) },
        // Momentum's ramp is game-long, so a tunnel hiccup must not erase the
        // power earned over 20 rounds of landed fireballs
        momentumHits: pl.momentumHits || 0,
      });
      journal('reconnect-stash', { id, name: pl.name, kills: pl.kills, gold: pl.gold });
    }
    sockets.delete(id);
    ipsById.delete(id);
    removePlayer(game, id);
    if (playerCount() === 0 || Object.values(game.players).every(p => p.bot)) {
      // don't let bot-only games spin forever — but if a game is RUNNING,
      // give the vanished humans a grace window to reconnect first (a tunnel
      // hiccup must not wipe a solo-vs-bots game; see the ghost stash above)
      if (game.phase === 'lobby' || game.phase === 'gameover') resetToLobby();
      else scheduleLobbyReset();
    }
  });
});

// ---- game loop -------------------------------------------------------------

const DT = 1 / TICK_RATE;
let journaledEvents = 0;
setInterval(() => {
  tick++;
  step(game, DT);

  // bots act; on entering shop they spend their gold once
  for (const p of Object.values(game.players)) {
    if (p.bot) stepBot(game, p.id, DT);
  }
  if (game.phase === 'shop' && lastPhase !== 'shop') {
    for (const p of Object.values(game.players)) if (p.bot) botShop(game, p.id);
  }
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
  // journal any events that appeared since the last game tick (e.g. casts
  // triggered directly by client messages) before draining
  for (; journaledEvents < game.events.length; journaledEvents++)
    journal('event', { e: game.events[journaledEvents] });
  if (sockets.size === 0) { game.events = []; journaledEvents = 0; return; }
  const events = game.events;
  game.events = [];
  journaledEvents = 0;
  // PER-VIEWER snapshots (round 12): element stacks are private to whoever
  // applied them, so there is no longer one blob that is correct for everyone —
  // each socket gets its own view. snapshot() is cheap (a field copy per
  // player) and this caps out at MAX_PLAYERS sockets at SNAPSHOT_RATE.
  // The EVENT stream is per-viewer for the same reason: events carry positions,
  // so a Vanish that only stripped the snapshot would leak the hidden player
  // through their own casts and hits (viewEvents; no-op when nobody is hidden).
  for (const [id, ws] of sockets) {
    if (ws.readyState !== 1) continue;
    ws.send(JSON.stringify({ t: 'snap', s: snapshot(game, id), e: viewEvents(game, events, id) }));
  }
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
