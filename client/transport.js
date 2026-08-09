// Transports: how the client reaches an authoritative room.
// One interface, picked once at startup (docs/BRIEF-browser-hosting.md §A3):
//   t.connect({ name, avatar })  — (re)dial and join; may be called again to reconnect
//   t.send(obj)                  — one wire message up
//   t.onMessage(cb)              — welcome / snap / denied come back here
//   t.onClose(cb)                — the connection dropped (ws only; solo never closes)
//
//  - ws:   today's WebSocket to the Node server, moved verbatim from main.js.
//  - solo: a full engine living in this tab — same rules, same lobby, no server.

import { createEngine } from '../shared/engine.js';
import { TICK_RATE, SNAPSHOT_RATE } from '../shared/constants.js';

export function createWsTransport() {
  const handlers = { msg: () => {}, close: () => {} };
  let ws = null; // the CURRENT socket; stale sockets' callbacks check identity and bail

  return {
    kind: 'ws',
    connect({ name, avatar }) {
      let sock;
      try {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        sock = new WebSocket(`${proto}://${location.host}`);
      } catch (err) { handlers.close(err); return; }
      ws = sock;
      sock.onopen = () => {
        if (ws === sock) sock.send(JSON.stringify({ t: 'join', name, avatar }));
      };
      sock.onmessage = (ev) => {
        if (ws !== sock) return;
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (!m || typeof m !== 'object') return;
        handlers.msg(m);
      };
      sock.onerror = () => {}; // close always follows; handled there
      sock.onclose = () => { if (ws === sock) handlers.close(); };
    },
    send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); },
    onMessage(cb) { handlers.msg = cb; },
    onClose(cb) { handlers.close = cb; },
  };
}

export function createLocalTransport() {
  const handlers = { msg: () => {}, close: () => {} };
  const ID = 'p1'; // the one human seat in a solo room
  let engine = null;

  function ensureEngine() {
    if (engine) return;
    engine = createEngine({
      seed: (Math.random() * 2 ** 31) | 0,
      // structuredClone both ways: the tab must never hand the client a live
      // reference into authoritative state (or vice versa) — same isolation a
      // JSON wire gives the ws path, without the stringify cost.
      onSend: (connId, msg) => { if (connId === ID) handlers.msg(structuredClone(msg)); },
    });
    // the clock lives here, not in the engine: same cadence as server/index.js
    setInterval(() => engine.tick(1 / TICK_RATE), 1000 / TICK_RATE);
    setInterval(() => engine.pushSnapshots(), 1000 / SNAPSHOT_RATE);
    window.__engine = engine; // test/debug hook (mirrors window.__fx et al.)
  }

  return {
    kind: 'solo',
    connect({ name, avatar }) {
      ensureEngine();
      if (engine.game.players[ID]) return; // already seated; nothing to redial
      const r = engine.join(ID, { name, avatar });
      if (!r.ok) { handlers.msg({ t: 'denied', reason: r.reason }); return; }
      handlers.msg({ t: 'welcome', id: ID });
    },
    send(obj) { if (engine) engine.message(ID, structuredClone(obj)); },
    onMessage(cb) { handlers.msg = cb; },
    onClose(cb) { handlers.close = cb; },
  };
}

// Which transport? Deterministic and testable (phase B adds a #r=CODE case):
//   1. ?mode=solo / ?mode=server in the URL wins — tests use this.
//   2. otherwise probe GET /health (~1 s): a live game server -> ws,
//      anything else (static host, GitHub Pages, file://) -> solo.
export async function selectTransport() {
  const want = new URLSearchParams(location.search).get('mode');
  if (want === 'solo') return createLocalTransport();
  if (want === 'server') return createWsTransport();
  if (location.protocol === 'file:') return createLocalTransport();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1000);
    // absolute path on purpose: the game server answers /health at its root
    // wherever the page sits; a static host 404s it and we fall back to solo
    const res = await fetch(new URL('/health', location.href), { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const j = await res.json().catch(() => null);
      if (j && j.ok) return createWsTransport();
    }
  } catch { /* no server — solo */ }
  return createLocalTransport();
}
