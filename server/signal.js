// OpenWarlock signalling relay (docs/BRIEF-browser-hosting.md §B1).
// A standalone WebSocket rendezvous for browser-hosted games: a host opens a
// room and gets a short code, guests join by code, and SDP/ICE blobs are
// relayed VERBATIM between them ({t:'sig'} `data` is opaque — never parsed).
// It carries NO game traffic: once WebRTC connects, this process can die or
// restart mid-match with zero effect (hosts re-register their code, see
// client/transport.js). Optional and separate — `npm start`/`npm run host`
// never touch it. Run: node server/signal.js [--port=3001]   (or PORT env)
// It also hosts the anonymous usage counters (/beacon + /stats, see below).
// Deployment options for Remi: docs/history/2026-08-09-browser-hosting-phaseB.md

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

// ---- anonymous usage counters (2026-08-09) ----------------------------------
// The relay doubles as the analytics sink because it is the one always-on
// process we run. client/analytics.js POSTs tiny anonymous beacons to /beacon
// (visit / game_start / game_end — counts only, no names/ids/IPs); they are
// aggregated in memory per UTC day + all-time, and GET /stats dumps the whole
// aggregate as public JSON. This stays a COUNTER, not a tracker.

const emptyBucket = () => ({
  visits: 0, by_mode: {},                    // page loads, split by transport mode
  games: 0, players_total: 0, humans_total: 0, // game_start beacons + their seat counts
  game_ends: 0, rounds_total: 0,             // game_end beacons + rounds played
});

// Persistence: day buckets + all-time totals flush to a PRIVATE HF dataset so
// Space restarts / sleeps don't wipe history. totals.json is flushed together
// with the day files, so on boot both merge-add back losslessly. No HF_TOKEN
// (local dev) -> returns null -> persistence silently off; /stats still works.
export function createHfStatsStore({
  token = process.env.HF_TOKEN,
  repo = 'RemiFabre/openwarlock-stats',
  fetchFn = globalThis.fetch,
} = {}) {
  if (!token) return null;
  const auth = { Authorization: `Bearer ${token}` };
  const read = async (path) => {
    const r = await fetchFn(`https://huggingface.co/datasets/${repo}/resolve/main/${path}`,
      { headers: auth });
    if (!r.ok) return null;
    return r.json().catch(() => null);
  };
  return {
    async load(dayKey) {
      return { day: await read(`days/${dayKey}.json`), totals: await read('totals.json') };
    },
    async save(files) { // files: { 'days/YYYY-MM-DD.json': obj, 'totals.json': obj }
      const lines = [JSON.stringify({ key: 'header', value: { summary: 'stats flush' } })];
      for (const [path, obj] of Object.entries(files))
        lines.push(JSON.stringify({ key: 'file', value: {
          path, encoding: 'base64',
          content: Buffer.from(JSON.stringify(obj, null, 1)).toString('base64'),
        } }));
      const r = await fetchFn(`https://huggingface.co/api/datasets/${repo}/commit/main`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/x-ndjson' },
        body: lines.join('\n'),
      });
      if (!r.ok) throw new Error(`HF commit failed: ${r.status}`);
    },
  };
}

// room codes: 4-6 chars, nothing that reads two ways (no 0/O, 1/l/I)
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = (n = 5) => Array.from({ length: n },
  () => CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0]).join('');

export function createSignalServer({
  port = 3001, roomTtlMs = 10 * 60_000, sweepMs = 60_000,
  statsStore = null,           // library default: OFF (tests never touch HF);
  flushMs = 10 * 60_000,       // the CLI entry below passes createHfStatsStore()
} = {}) {
  const rooms = new Map(); // code -> { host: ws, peers: Map(id -> ws), nextPeer, at }
  const touch = (room) => { room.at = Date.now(); };

  // ---- the aggregate ----
  const days = new Map();          // 'YYYY-MM-DD' (UTC) -> bucket
  const totals = emptyBucket();    // all-time (persists via totals.json)
  const dirty = new Set();         // day keys touched since the last flush
  const dayKey = () => new Date().toISOString().slice(0, 10);
  const bucket = (k) => { let b = days.get(k); if (!b) { b = emptyBucket(); days.set(k, b); } return b; };
  const clampN = (x, cap) => Math.min(cap, Math.max(0, Math.floor(Number(x) || 0)));

  function recordBeacon(m) {
    if (!m || typeof m !== 'object') return;
    if (m.e !== 'visit' && m.e !== 'game_start' && m.e !== 'game_end') return;
    const k = dayKey();
    for (const t of [bucket(k), totals]) {
      if (m.e === 'visit') {
        t.visits++;
        const mode = String(m.mode || 'unknown').toLowerCase().replace(/[^a-z-]/g, '').slice(0, 12) || 'unknown';
        t.by_mode[mode] = (t.by_mode[mode] || 0) + 1;
      } else if (m.e === 'game_start') {
        t.games++;
        t.players_total += clampN(m.players, 64);
        t.humans_total += clampN(m.humans, 64);
      } else {
        t.game_ends++;
        t.rounds_total += clampN(m.rounds, 1000);
      }
    }
    dirty.add(k);
  }

  const mergeAdd = (into, from) => {
    if (!from || typeof from !== 'object') return;
    for (const f of ['visits', 'games', 'players_total', 'humans_total', 'game_ends', 'rounds_total'])
      into[f] += clampN(from[f], 1e9);
    for (const [mode, n] of Object.entries(from.by_mode || {}))
      into.by_mode[mode] = (into.by_mode[mode] || 0) + clampN(n, 1e9);
  };

  // dirty clears BEFORE the await: beacons landing mid-save re-mark the day and
  // the next flush rewrites the (cumulative) bucket — nothing is ever lost, at
  // worst re-uploaded. A failed save re-marks so the next tick retries.
  async function flushStats() {
    if (!statsStore || !dirty.size) return;
    const keys = [...dirty];
    dirty.clear();
    const files = { 'totals.json': totals };
    for (const k of keys) files[`days/${k}.json`] = days.get(k);
    try { await statsStore.save(files); } catch { for (const k of keys) dirty.add(k); }
    // memory bound: day buckets older than ~60 days are flushed history — drop them
    for (const k of days.keys()) if (!dirty.has(k) && days.size > 60) days.delete(k);
  }

  if (statsStore) { // resume after a restart: merge-add so early beacons survive
    statsStore.load(dayKey()).then((r) => {
      if (!r) return;
      mergeAdd(bucket(dayKey()), r.day); // totals.json already includes every day file,
      mergeAdd(totals, r.totals);        // so day files merge into their day ONLY
    }).catch(() => { });
  }

  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const httpServer = http.createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    } else if (req.method === 'OPTIONS' && (path === '/beacon' || path === '/stats')) {
      res.writeHead(204, CORS); res.end();
    } else if (path === '/beacon' && req.method === 'POST') {
      // any content type (sendBeacon ships text/plain), any garbage: always 204
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
      req.on('error', () => { });
      req.on('end', () => {
        try { recordBeacon(JSON.parse(body)); } catch { }
        res.writeHead(204, CORS); res.end();
      });
    } else if (path === '/stats' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({ ok: true, total: totals, days: Object.fromEntries(days) }));
    } else { res.writeHead(404); res.end(); }
  });
  const wss = new WebSocketServer({ server: httpServer });
  const say = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

  wss.on('connection', (ws) => {
    let room = null, me = null; // me: 'host' | peer id
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'create') {
        // an explicit free code is honored (host re-registering after a relay
        // restart, or B4 migration re-opening the room) — a LIVE one is never stolen
        let code = typeof m.code === 'string' ? m.code.toUpperCase() : '';
        if (!/^[A-Z2-9]{4,6}$/.test(code) || rooms.has(code)) code = newCode();
        while (rooms.has(code)) code = newCode();
        room = { host: ws, peers: new Map(), nextPeer: 1, at: Date.now(), code };
        rooms.set(code, room);
        me = 'host';
        say(ws, { t: 'room', code });
      } else if (m.t === 'join') {
        const r = rooms.get(String(m.code || '').toUpperCase());
        if (!r) { say(ws, { t: 'error', reason: 'no such room — ask the host for a fresh link' }); return; }
        room = r; me = 'g' + room.nextPeer++;
        room.peers.set(me, ws);
        touch(room);
        say(ws, { t: 'ok', code: room.code, id: me });
        say(room.host, { t: 'peer', id: me });
      } else if (m.t === 'sig' && room && me) {
        touch(room);
        if (me === 'host') say(room.peers.get(String(m.to)), { t: 'sig', from: 'host', data: m.data });
        else say(room.host, { t: 'sig', from: me, data: m.data });
      }
    });
    ws.on('close', () => {
      if (!room || !me) return;
      if (me === 'host') {
        if (rooms.get(room.code) !== room) return; // superseded already
        for (const p of room.peers.values()) say(p, { t: 'hostgone' });
        rooms.delete(room.code);
      } else {
        room.peers.delete(me);
        say(room.host, { t: 'gone', id: me });
      }
    });
  });

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms)
      if (now - room.at > roomTtlMs) {
        try { room.host.close(); } catch { }
        for (const p of room.peers.values()) { try { p.close(); } catch { } }
        rooms.delete(code);
      }
  }, sweepMs);
  sweeper.unref?.();

  // flush on a timer IF dirty, and on SIGTERM (the Space's 48 h sleep sends one)
  const flusher = setInterval(flushStats, flushMs);
  flusher.unref?.();
  let onTerm = null;
  if (statsStore) {
    onTerm = () => { flushStats().finally(() => process.exit(0)); };
    process.once('SIGTERM', onTerm);
  }

  return new Promise((resolve) => {
    httpServer.listen(port, () => resolve({
      port: httpServer.address().port,
      flushStats, // tests await this; prod uses the timer + SIGTERM
      close: () => {
        clearInterval(sweeper); clearInterval(flusher);
        if (onTerm) process.removeListener('SIGTERM', onTerm);
        wss.close(); httpServer.close();
      },
    }));
  });
}

// CLI entry: node server/signal.js [--port=3001]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv.find(a => a.startsWith('--port='))?.split('=')[1];
  const port = Number(process.env.PORT || arg || 3001);
  // Persistence is opt-in outside the Space: dev shells often export HF_TOKEN
  // (Remi's does — verified live 2026-08-09 when a local test relay clobbered
  // the production day file), and `npm run signal` must never fight the Space
  // over days/YYYY-MM-DD.json. Spaces always set SPACE_ID; elsewhere, set
  // STATS_PERSIST=1 to persist on purpose.
  const persist = process.env.HF_TOKEN && (process.env.SPACE_ID || process.env.STATS_PERSIST);
  const store = persist ? createHfStatsStore() : null;
  const s = await createSignalServer({ port, statsStore: store });
  console.log(`OpenWarlock signalling relay on ws://localhost:${s.port} (rooms only, no game traffic)`
    + ` — /beacon counters ${store ? 'persist to the HF dataset' : 'in memory only'}`);
}
