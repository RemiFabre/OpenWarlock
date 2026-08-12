// OpenWarlock signalling relay (docs/BRIEF-browser-hosting.md §B1).
// A standalone WebSocket rendezvous for browser-hosted games: a host opens a
// room and gets an invite code, guests join by code, and SDP/ICE blobs are
// relayed VERBATIM between them ({t:'sig'} `data` is opaque — never parsed).
// It carries NO game traffic: once WebRTC connects, this process can die or
// restart mid-match with zero effect (hosts re-register their code, see
// client/transport.js). Optional and separate — `npm start`/`npm run host`
// never touch it. Run: node server/signal.js [--port=3001]   (or PORT env)
// It also hosts the anonymous usage counters (/beacon + /stats) and the
// per-version play stats + star ratings (/rate + /versions), see below.
// Deployment options for Remi: docs/history/2026-08-09-browser-hosting-phaseB.md

import http from 'node:http';
import { randomInt } from 'node:crypto';
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
      return {
        day: await read(`days/${dayKey}.json`),
        totals: await read('totals.json'),
        versions: await read('versions.json'),
      };
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

// Invite links carry 12 unambiguous random chars: easy to copy, impractical to guess.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 12;
const LEGACY_CODE_LENGTH = 5; // immutable pre-r243 versions still speak this protocol
const CODE_RE = new RegExp(`^(?:[${CODE_ALPHABET}]{${LEGACY_CODE_LENGTH}}|[${CODE_ALPHABET}]{${CODE_LENGTH}})$`);
const newCode = (length = CODE_LENGTH) => Array.from({ length },
  () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

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

  // ---- per-version stats + star ratings (round 22) ----
  // Beacons carry a `slug` (?version= param, 'default' = the main game) since round 22;
  // older pinned versions send none and only feed the global counters above.
  const versions = new Map(); // slug -> { plays, finished, player_rounds, rating_sum, rating_n }
  let versionsDirty = false;
  const MAX_SLUGS = 200;
  const slugOf = (s) => {
    const t = String(s ?? '').toLowerCase();
    return /^[a-z0-9-]{1,32}$/.test(t) ? t : 'unknown';
  };
  const version = (slug) => {
    let v = versions.get(slug);
    if (!v) {
      v = { plays: 0, finished: 0, player_rounds: 0, rating_sum: 0, rating_n: 0 };
      versions.set(slug, v);
      if (versions.size > MAX_SLUGS) { // memory bound: evict the least-played
        let worstK = null, worstP = Infinity;
        for (const [k, e] of versions) if (k !== slug && e.plays < worstP) { worstK = k; worstP = e.plays; }
        versions.delete(worstK);
      }
    }
    return v;
  };
  // rating invariants after ANY update (rate, merge): garbage prev values or
  // hostile persisted files can never push the aggregates negative or absurd
  const clampRating = (v) => {
    v.rating_n = Math.max(0, v.rating_n);
    v.rating_sum = Math.min(v.rating_n * 5, Math.max(0, v.rating_sum));
  };

  // POST /rate body: { slug, stars 1..5, prev 1..5|null }. A re-rate replaces
  // (prev = what this browser sent before) — trust-based, it's a friends game.
  function recordRating(m) {
    if (!m || typeof m !== 'object') return;
    const stars = m.stars;
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return;
    const prev = Number.isInteger(m.prev) && m.prev >= 1 && m.prev <= 5 ? m.prev : null;
    const v = version(slugOf(m.slug));
    v.rating_sum += stars - (prev || 0);
    v.rating_n += prev ? 0 : 1;
    clampRating(v);
    versionsDirty = true;
  }

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
    if (m.slug != null && m.e !== 'visit') { // slug-less = old pinned version: global only
      const v = version(slugOf(m.slug));
      if (m.e === 'game_start') v.plays++;
      else { v.finished++; v.player_rounds += clampN(m.rounds, 1000) * clampN(m.players, 64); }
      versionsDirty = true;
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
  const mergeVersions = (from) => { // boot resume: counters AND ratings merge-add
    if (!from || typeof from !== 'object') return;
    for (const [slug, e] of Object.entries(from)) {
      if (!e || typeof e !== 'object') continue;
      const v = version(slugOf(slug));
      for (const f of ['plays', 'finished', 'player_rounds', 'rating_sum', 'rating_n'])
        v[f] += clampN(e[f], 1e9);
      clampRating(v);
    }
  };

  // dirty clears BEFORE the await: beacons landing mid-save re-mark the day and
  // the next flush rewrites the (cumulative) bucket — nothing is ever lost, at
  // worst re-uploaded. A failed save re-marks so the next tick retries.
  async function flushStats() {
    if (!statsStore || (!dirty.size && !versionsDirty)) return;
    const keys = [...dirty];
    dirty.clear();
    const hadVersions = versionsDirty;
    versionsDirty = false;
    const files = { 'totals.json': totals };
    if (hadVersions) files['versions.json'] = Object.fromEntries(versions);
    for (const k of keys) files[`days/${k}.json`] = days.get(k);
    try { await statsStore.save(files); }
    catch { for (const k of keys) dirty.add(k); versionsDirty ||= hadVersions; }
    // memory bound: day buckets older than ~60 days are flushed history — drop them
    for (const k of days.keys()) if (!dirty.has(k) && days.size > 60) days.delete(k);
  }

  if (statsStore) { // resume after a restart: merge-add so early beacons survive
    statsStore.load(dayKey()).then((r) => {
      if (!r) return;
      mergeAdd(bucket(dayKey()), r.day); // totals.json already includes every day file,
      mergeAdd(totals, r.totals);        // so day files merge into their day ONLY
      mergeVersions(r.versions);
    }).catch(() => { });
  }

  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // any content type (sendBeacon ships text/plain), any garbage: always 204
  const swallowJson = (req, res, record) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('error', () => { });
    req.on('end', () => {
      try { record(JSON.parse(body)); } catch { }
      res.writeHead(204, CORS); res.end();
    });
  };

  const CORS_PATHS = ['/beacon', '/stats', '/rate', '/versions'];
  const httpServer = http.createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    } else if (req.method === 'OPTIONS' && CORS_PATHS.includes(path)) {
      res.writeHead(204, CORS); res.end();
    } else if (path === '/beacon' && req.method === 'POST') {
      swallowJson(req, res, recordBeacon);
    } else if (path === '/rate' && req.method === 'POST') {
      swallowJson(req, res, recordRating);
    } else if (path === '/stats' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({ ok: true, total: totals, days: Object.fromEntries(days) }));
    } else if (path === '/versions' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({ ok: true, versions: Object.fromEntries(versions) }));
    } else { res.writeHead(404); res.end(); }
  });
  const wss = new WebSocketServer({ server: httpServer });
  const say = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

  wss.on('connection', (ws) => {
    let room = null, me = null, rejected = false; // me: 'host' | peer id
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'create') {
        if (room || rejected) return;
        // an explicit free code is honored (host re-registering after a relay
        // restart, or B4 migration re-opening the room) — a LIVE one is never stolen
        let code = typeof m.code === 'string' ? m.code.toUpperCase() : '';
        const length = m.codeLength === CODE_LENGTH ? CODE_LENGTH : LEGACY_CODE_LENGTH;
        if (!CODE_RE.test(code) || rooms.has(code)) code = newCode(length);
        while (rooms.has(code)) code = newCode(length);
        room = { host: ws, peers: new Map(), nextPeer: 1, at: Date.now(), code };
        rooms.set(code, room);
        me = 'host';
        say(ws, { t: 'room', code });
      } else if (m.t === 'join') {
        if (room || rejected) return;
        const r = rooms.get(String(m.code || '').toUpperCase());
        if (!r) {
          rejected = true;
          ws.send(JSON.stringify({ t: 'error', reason: 'room unavailable — ask the host for a fresh link' }),
            () => ws.close(1008, 'room unavailable'));
          return;
        }
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
