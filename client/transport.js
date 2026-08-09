// Transports: how the client reaches an authoritative room.
// One interface, picked once at startup (docs/BRIEF-browser-hosting.md §A3+§B):
//   t.connect({ name, avatar })  — (re)dial and join; may be called again to reconnect
//   t.send(obj)                  — one wire message up
//   t.onMessage(cb)              — welcome / snap / denied come back here
//   t.onClose(cb)                — the connection dropped (solo/host never close)
//
//  - ws:       today's WebSocket to the Node server, moved verbatim from main.js.
//  - solo:     a full engine living in this tab — same rules, same lobby, no server.
//  - rtc-host: the solo engine PLUS N guests over WebRTC data channels (phase B).
//  - rtc:      guest side of the above — dials the host through the signalling relay.

import { createEngine } from '../shared/engine.js';
import { TICK_RATE, SNAPSHOT_RATE } from '../shared/constants.js';
import { createSnapEncoder, createSnapDecoder } from '../shared/snapdelta.js';
import { VERSION } from '../shared/version.js';

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

// An authoritative engine living in THIS tab, with its clock.
// The clock lives here, not in the engine: same cadence as server/index.js.
// It ticks from a WEB WORKER because hidden-tab throttling murders
// main-thread timers (1 Hz at once, 1/min after 5 min) while worker timers
// hold 30 Hz — measured 2026-08-09, tools/tabtest-run.js. Solo is usually a
// foreground tab, but alt-tabbing to Discord must not slow the round to a
// crawl — and the phase-B host (whose tab IS everyone's server) leans on this
// same clock.
function createInTabEngine(engineOpts) {
  const engine = createEngine({ seed: (Math.random() * 2 ** 31) | 0, ...engineOpts });
  const snapEvery = Math.max(1, Math.round(TICK_RATE / SNAPSHOT_RATE));
  let n = 0;
  const onTick = () => {
    engine.tick(1 / TICK_RATE);
    if (++n % snapEvery === 0) engine.pushSnapshots();
  };
  try {
    const src = `setInterval(() => postMessage(0), ${1000 / TICK_RATE});`;
    const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = onTick;
  } catch {
    setInterval(onTick, 1000 / TICK_RATE); // strict CSP etc. — solo still works
  }
  window.__engine = engine; // test/debug hook (mirrors window.__fx et al.)
  return engine;
}

export function createLocalTransport() {
  const handlers = { msg: () => {}, close: () => {} };
  const ID = 'p1'; // the one human seat in a solo room
  let engine = null;

  function ensureEngine() {
    if (engine) return;
    engine = createInTabEngine({
      // structuredClone both ways: the tab must never hand the client a live
      // reference into authoritative state (or vice versa) — same isolation a
      // JSON wire gives the ws path, without the stringify cost.
      onSend: (connId, msg) => { if (connId === ID) handlers.msg(structuredClone(msg)); },
    });
  }

  return {
    kind: 'solo',
    connect({ name, avatar }) {
      ensureEngine();
      if (engine.game.players[ID]) return; // already seated; nothing to redial
      const r = engine.join(ID, { name, avatar });
      if (!r.ok) { handlers.msg({ t: 'denied', reason: r.reason }); return; }
      handlers.msg({ t: 'welcome', id: ID, v: VERSION });
    },
    send(obj) { if (engine) engine.message(ID, structuredClone(obj)); },
    onMessage(cb) { handlers.msg = cb; },
    onClose(cb) { handlers.close = cb; },
  };
}

// ---- WebRTC hosting (docs/BRIEF-browser-hosting.md §B) ----------------------
// A player's tab runs the engine and serves N friends over RTCDataChannels.
// The signalling relay (server/signal.js) only brokers the introduction —
// once connected, it can die mid-match with zero effect.

// Where the signalling relay lives. Resolution order:
//   1. ?signal=ws://... in the URL (tests, one-off relays)
//   2. this constant — set it after deploying a relay (e.g. 'wss://signal.example.com')
//   3. the page's own hostname on port 3001 (the local-dev default: `npm run signal`)
// The deployed relay: HF Space (PRO), verified 2026-08-09 with a live
// create/join/sig round-trip. Deploys via scripts/deploy-signal-hf.sh.
export const SIGNAL_URL = 'wss://remifabre-openwarlock-signal.hf.space';
export function signalUrl() {
  const q = new URLSearchParams(location.search).get('signal');
  if (q) return q;
  if (SIGNAL_URL) return SIGNAL_URL;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:3001`;
}

// Public STUN only, no TURN — deliberate (§B2/§Why): desktop peers punch
// through fine, relay costs money+accounts, and the fallback for the rare
// blocked pair is "let someone else host". Adding TURN later = one array entry.
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }] };

// #r=CODE in the hash (not the query: GitHub Pages needs no routing for it)
export function roomCodeFromHash() {
  const m = /[#&]r=([A-Za-z0-9]{4,6})\b/.exec(location.hash);
  return m ? m[1].toUpperCase() : null;
}

// The host: the solo engine + a signalling room + one pair of data channels per
// guest. ctrl = reliable/ordered (join, inputs, events, hot-spare state);
// snap = unreliable/unordered (delta snapshots — a stale one is worthless, and
// reliability there would head-of-line-block every fresh one behind it).
export function createRtcHostTransport({ onRoom = () => {}, onError = () => {} } = {}) {
  const handlers = { msg: () => {}, close: () => {} };
  const ID = 'p1';                // the host is a player, not a spectator
  const peers = new Map();        // connId -> peer record
  const byPeerId = new Map();     // signalling peer id -> peer record
  const logBuf = [];              // in-memory journal — a tab has no filesystem,
                                  // so the debugging story is the ⬇ log button
  let engine = null;
  let sig = null;
  let code = null;                // survives signalling-relay restarts (re-registered)
  let nextConn = 1;               // local conn ids; NEVER reuse signalling ids —
                                  // those restart at g1 when the relay restarts

  const log = (k, data) => {
    logBuf.push({ ms: Date.now(), k, ...data });
    if (logBuf.length > 20000) logBuf.splice(0, 5000); // cap memory, keep the tail
  };

  function ensureEngine() {
    if (engine) return;
    engine = createInTabEngine({
      onSend: sendTo,
      onKick: (connId) => { const p = peers.get(connId); if (p) dropPeer(p, 'kicked'); },
      onLog: log,
    });
    // hot spare for host migration (§B4): every 2 s each guest holds a full
    // serialized room, so a survivor CAN resume the game if this tab dies.
    // Kept in B3 on purpose — migration later needs no protocol change.
    setInterval(() => {
      const alive = [...peers.values()].filter(p => p.joined && p.ctrl && p.ctrl.readyState === 'open');
      if (!alive.length) return;
      const spare = JSON.stringify({ t: 'spare', code, state: engine.serialize() });
      for (const p of alive) { try { p.ctrl.send(spare); } catch { } }
    }, 2000);
  }

  function sendTo(connId, msg) {
    if (connId === ID) { handlers.msg(structuredClone(msg)); return; }
    const p = peers.get(connId);
    if (!p || !p.ctrl || p.ctrl.readyState !== 'open') return;
    try {
      if (msg.t === 'snap') {
        // events ride ctrl (reliable — a lost death is a lost kill cue);
        // state rides the lossy snap channel as full-or-delta (shared/snapdelta.js)
        if (msg.e && msg.e.length) p.ctrl.send(JSON.stringify({ t: 'evt', e: msg.e }));
        const payload = { s: msg.s, ...(msg.bans != null ? { bans: msg.bans } : {}) };
        const full = p.wantFull || msg.s.phase !== p.lastPhase; // keyframe on join/gap/phase change
        p.lastPhase = msg.s.phase; p.wantFull = false;
        const wire = JSON.stringify(p.enc.encode(payload, { full }));
        if (p.snap && p.snap.readyState === 'open') p.snap.send(wire);
        else p.ctrl.send(wire); // snap channel not up (yet): the framing still works
      } else {
        p.ctrl.send(JSON.stringify(msg)); // welcome / denied
      }
    } catch (err) { log('senderr', { connId, err: String(err) }); }
  }

  function dropPeer(p, why) {
    if (p.dead) return;
    p.dead = true;
    peers.delete(p.connId);
    byPeerId.delete(p.peerId);
    log('peer-drop', { connId: p.connId, why });
    if (p.joined && engine) engine.leave(p.connId); // ghost-stash + reseat like the ws server
    try { p.pc.close(); } catch { }
  }

  // a guest announced by the relay: offer them the two channels
  function onPeer(peerId) {
    const connId = 'r' + nextConn++;
    const pc = new RTCPeerConnection(ICE);
    const p = {
      connId, peerId, pc, joined: false, dead: false,
      ctrl: pc.createDataChannel('ctrl'),
      snap: pc.createDataChannel('snap', { ordered: false, maxRetransmits: 0 }),
      enc: createSnapEncoder(), wantFull: true, lastPhase: null,
    };
    peers.set(connId, p);
    byPeerId.set(peerId, p);
    p.ctrl.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (!p.joined) {
        if (m.t !== 'join') return;
        ensureEngine();
        const r = engine.join(connId, { name: m.name, avatar: m.avatar });
        log('join', { connId, name: String(m.name || '').slice(0, 16), ok: r.ok, reason: r.reason });
        if (!r.ok) {
          try { p.ctrl.send(JSON.stringify({ t: 'denied', reason: r.reason })); } catch { }
          setTimeout(() => dropPeer(p, 'denied'), 200); // let the message flush first
          return;
        }
        p.joined = true;
        p.wantFull = true;
        p.ctrl.send(JSON.stringify({ t: 'welcome', id: connId, v: VERSION }));
        return;
      }
      if (m.t === 'full') { p.wantFull = true; return; } // guest's snap decoder hit a gap
      engine.message(connId, m);
    };
    p.ctrl.onclose = () => dropPeer(p, 'ctrl closed');
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') dropPeer(p, pc.connectionState);
    };
    pc.onicecandidate = (e) => { if (e.candidate) sigSend({ t: 'sig', to: peerId, data: { ice: e.candidate } }); };
    pc.createOffer()
      .then(o => pc.setLocalDescription(o))
      .then(() => sigSend({ t: 'sig', to: peerId, data: { sdp: pc.localDescription } }))
      .catch(err => { log('offererr', { err: String(err) }); dropPeer(p, 'offer failed'); });
  }

  async function onSig(p, data) {
    try {
      if (data.sdp) await p.pc.setRemoteDescription(data.sdp);
      else if (data.ice) await p.pc.addIceCandidate(data.ice);
    } catch (err) { log('sigerr', { connId: p.connId, err: String(err) }); }
  }

  const sigSend = (m) => { if (sig && sig.readyState === 1) sig.send(JSON.stringify(m)); };

  function dialSignal() {
    if (sig && (sig.readyState === 0 || sig.readyState === 1)) return;
    let ws;
    try { ws = new WebSocket(signalUrl()); } catch (err) {
      onError(`couldn't reach the signalling relay (${signalUrl()}) — friends can't join, but you can still play solo`);
      return;
    }
    sig = ws;
    let opened = false;
    // re-register the SAME code after a relay restart, so the invite link
    // keeps working — the relay is a weak dependency by design
    ws.onopen = () => { opened = true; ws.send(JSON.stringify({ t: 'create', ...(code ? { code } : {}) })); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'room') { code = m.code; onRoom(code); }
      else if (m.t === 'peer') onPeer(m.id);
      else if (m.t === 'sig') { const p = byPeerId.get(m.from); if (p) onSig(p, m.data || {}); }
      // 'gone' is signalling-level only; live RTC connections outlive it
    };
    ws.onclose = () => {
      if (!opened) onError(`couldn't reach the signalling relay (${signalUrl()}) — friends can't join, but you can still play solo`);
      setTimeout(dialSignal, 3000);
    };
    ws.onerror = () => { }; // close always follows
  }

  return {
    kind: 'rtc-host',
    connect({ name, avatar }) {
      ensureEngine();
      if (!engine.game.players[ID]) {
        const r = engine.join(ID, { name, avatar });
        if (!r.ok) { handlers.msg({ t: 'denied', reason: r.reason }); return; }
        handlers.msg({ t: 'welcome', id: ID, v: VERSION });
      }
      dialSignal();
    },
    send(obj) { if (engine) engine.message(ID, structuredClone(obj)); },
    onMessage(cb) { handlers.msg = cb; },
    onClose(cb) { handlers.close = cb; },
    roomCode: () => code,
    journal: () => logBuf, // "download debug log" reads this
  };
}

// The guest: reach the host through the relay, then talk pure WebRTC.
// Reconnect story mirrors ws: any drop fires onClose once, main.js redials
// via connect() — which builds a fresh peer connection through the relay
// (covers both a network blip and a B4 same-code re-host).
export function createRtcGuestTransport(code) {
  const handlers = { msg: () => {}, close: () => {} };
  let profile = null;
  let sig = null, pc = null, ctrl = null;
  let dec = null, events = [], lastFullReq = 0;
  let down = true;          // becomes false once ctrl opens
  let closedFired = false;
  let sigQ = Promise.resolve(); // serializes async SDP/ICE handling in order
  let dialTimer = null;

  function dropped(err) {
    if (closedFired) return;
    closedFired = true;
    down = true;
    try { if (pc) pc.close(); } catch { }
    try { if (sig) sig.close(); } catch { }
    handlers.close(err);
  }

  function onSnapWire(m) {
    const r = dec.decode(m);
    if (r.needFull && ctrl && ctrl.readyState === 'open' && Date.now() - lastFullReq > 500) {
      lastFullReq = Date.now();
      ctrl.send(JSON.stringify({ t: 'full' })); // a keyframe, please — we lost the base
    }
    if (!r.payload) return;
    // shallow-clone s: the client annotates m.s (bans/pings) and the decoder's
    // copy must stay pristine — it is the base the next delta patches
    const out = { t: 'snap', s: { ...r.payload.s }, e: events };
    if (r.payload.bans != null) out.bans = r.payload.bans;
    events = [];
    handlers.msg(out);
  }

  function wireCtrl(ch) {
    ctrl = ch;
    ch.onopen = () => {
      down = false; closedFired = false;
      clearTimeout(dialTimer);
      if (profile) ch.send(JSON.stringify({ t: 'join', name: profile.name, avatar: profile.avatar }));
    };
    ch.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'evt') { if (Array.isArray(m.e)) events.push(...m.e); return; }
      if (m.t === 'spare') { window.__spare = m; return; } // B4 hot spare, held for migration
      if (m.t === 'snap') { onSnapWire(m); return; }        // reliable-fallback framing
      handlers.msg(m);                                      // welcome / denied
    };
    ch.onclose = () => dropped();
  }

  function dial() {
    try { if (pc) pc.close(); } catch { }
    try { if (sig) sig.close(); } catch { }
    pc = null; ctrl = null;
    dec = createSnapDecoder(); events = [];
    closedFired = false;
    let ws;
    try { ws = new WebSocket(signalUrl()); } catch (err) { dropped(err); return; }
    sig = ws;
    // plain language on a dead end, not a hang (§B2)
    clearTimeout(dialTimer);
    dialTimer = setTimeout(() => {
      if (down) dropped(new Error("couldn't reach the host — they may be offline, or the network blocks peer-to-peer; try again, or ask someone else to host"));
    }, 20000);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', code }));
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'error') {
        clearTimeout(dialTimer);
        handlers.msg({ t: 'denied', reason: m.reason || 'room not found' });
        return;
      }
      if (m.t === 'hostgone') { dropped(new Error('the host closed their tab — the room is gone')); return; }
      if (m.t !== 'sig' || !m.data) return;
      sigQ = sigQ.then(() => onSig(m.data)).catch(() => { });
    };
    ws.onerror = () => { };
    ws.onclose = () => { }; // fine mid-match: the relay is only the introduction
  }

  async function onSig(data) {
    if (data.sdp) {
      pc = new RTCPeerConnection(ICE);
      pc.onicecandidate = (e) => {
        if (e.candidate && sig && sig.readyState === 1)
          sig.send(JSON.stringify({ t: 'sig', data: { ice: e.candidate } }));
      };
      pc.ondatachannel = (e) => {
        if (e.channel.label === 'ctrl') wireCtrl(e.channel);
        else if (e.channel.label === 'snap') e.channel.onmessage = (ev) => {
          let m; try { m = JSON.parse(ev.data); } catch { return; }
          onSnapWire(m);
        };
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') dropped();
      };
      await pc.setRemoteDescription(data.sdp);
      const a = await pc.createAnswer();
      await pc.setLocalDescription(a);
      if (sig && sig.readyState === 1) sig.send(JSON.stringify({ t: 'sig', data: { sdp: pc.localDescription } }));
    } else if (data.ice && pc) {
      await pc.addIceCandidate(data.ice);
    }
  }

  return {
    kind: 'rtc',
    code,
    connect({ name, avatar }) {
      profile = { name, avatar };
      if (ctrl && ctrl.readyState === 'open') { // channel survived; just (re)join
        ctrl.send(JSON.stringify({ t: 'join', name, avatar }));
        return;
      }
      dial();
    },
    send(obj) { if (ctrl && ctrl.readyState === 'open') ctrl.send(JSON.stringify(obj)); },
    onMessage(cb) { handlers.msg = cb; },
    onClose(cb) { handlers.close = cb; },
  };
}

// Which transport? Deterministic and testable:
//   1. #r=CODE in the hash — this tab was invited to somebody's game (phase B).
//   2. ?mode=solo / ?mode=server in the URL wins — tests use this.
//   3. otherwise probe GET /health (~1 s): a live game server -> ws,
//      anything else (static host, GitHub Pages, file://) -> solo.
export async function selectTransport() {
  const rtcCode = roomCodeFromHash();
  if (rtcCode) return createRtcGuestTransport(rtcCode);
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
