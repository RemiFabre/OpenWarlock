// OpenWarlock signalling relay (docs/BRIEF-browser-hosting.md §B1).
// A standalone WebSocket rendezvous for browser-hosted games: a host opens a
// room and gets a short code, guests join by code, and SDP/ICE blobs are
// relayed VERBATIM between them ({t:'sig'} `data` is opaque — never parsed).
// It carries NO game traffic: once WebRTC connects, this process can die or
// restart mid-match with zero effect (hosts re-register their code, see
// client/transport.js). Optional and separate — `npm start`/`npm run host`
// never touch it. Run: node server/signal.js [--port=3001]   (or PORT env)
// Deployment options for Remi: docs/history/2026-08-09-browser-hosting-phaseB.md

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

// room codes: 4-6 chars, nothing that reads two ways (no 0/O, 1/l/I)
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = (n = 5) => Array.from({ length: n },
  () => CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0]).join('');

export function createSignalServer({ port = 3001, roomTtlMs = 10 * 60_000, sweepMs = 60_000 } = {}) {
  const rooms = new Map(); // code -> { host: ws, peers: Map(id -> ws), nextPeer, at }
  const touch = (room) => { room.at = Date.now(); };

  const httpServer = http.createServer((req, res) => {
    if (new URL(req.url, 'http://x').pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
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

  return new Promise((resolve) => {
    httpServer.listen(port, () => resolve({
      port: httpServer.address().port,
      close: () => { clearInterval(sweeper); wss.close(); httpServer.close(); },
    }));
  });
}

// CLI entry: node server/signal.js [--port=3001]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv.find(a => a.startsWith('--port='))?.split('=')[1];
  const port = Number(process.env.PORT || arg || 3001);
  const s = await createSignalServer({ port });
  console.log(`OpenWarlock signalling relay on ws://localhost:${s.port} (rooms only, no game traffic)`);
}
