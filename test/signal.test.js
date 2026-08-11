// server/signal.js — the WebRTC rendezvous (docs/BRIEF-browser-hosting.md §B1).
// It brokers { host, code } <-> guests and relays opaque sig blobs; it never
// sees game traffic (the e2e kills it mid-match and the game must not notice).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { createSignalServer, CODE_ALPHABET, CODE_LENGTH } from '../server/signal.js';

let srv;
beforeAll(async () => { srv = await createSignalServer({ port: 0 }); });
afterAll(() => srv.close());

function dial() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    const inbox = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      const w = waiters.shift();
      if (w) w(m); else inbox.push(m);
    });
    ws.on('open', () => resolve({
      ws,
      send: (m) => ws.send(JSON.stringify(m)),
      next: () => inbox.length ? Promise.resolve(inbox.shift())
        : new Promise((r) => waiters.push(r)),
    }));
    ws.on('error', reject);
  });
}

describe('signal server', () => {
  it('create -> room code from the unambiguous alphabet', async () => {
    const host = await dial();
    host.send({ t: 'create' });
    const m = await host.next();
    expect(m.t).toBe('room');
    expect(m.code).toMatch(new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`));
    host.ws.close();
  });

  it('join relays peer arrival and sig blobs verbatim, both directions', async () => {
    const host = await dial();
    host.send({ t: 'create' });
    const { code } = await host.next();

    const guest = await dial();
    guest.send({ t: 'join', code });
    const ok = await guest.next();
    expect(ok.t).toBe('ok');
    expect(ok.id).toBeTruthy();
    const peer = await host.next();
    expect(peer).toEqual({ t: 'peer', id: ok.id });

    const blob = { sdp: 'v=0 fake', nested: { ice: [1, 2, { x: 'y' }] } };
    host.send({ t: 'sig', to: ok.id, data: blob });
    expect(await guest.next()).toEqual({ t: 'sig', from: 'host', data: blob });
    guest.send({ t: 'sig', data: { answer: true } });
    expect(await host.next()).toEqual({ t: 'sig', from: ok.id, data: { answer: true } });

    // guest leaving tells the host who is gone
    guest.ws.close();
    expect(await host.next()).toEqual({ t: 'gone', id: ok.id });
    host.ws.close();
  });

  it('an unknown code reports once, then closes the connection', async () => {
    const guest = await dial();
    const closed = new Promise((resolve) => guest.ws.once('close', resolve));
    guest.send({ t: 'join', code: 'ZZZZZZZZZZZZ' });
    const m = await guest.next();
    expect(m.t).toBe('error');
    expect(m.reason).toMatch(/room unavailable/i);
    await closed;
  });

  it('host vanishing notifies guests and frees the code for a same-code re-host (B4)', async () => {
    const host = await dial();
    host.send({ t: 'create' });
    const { code } = await host.next();
    const guest = await dial();
    guest.send({ t: 'join', code });
    await guest.next(); await host.next();

    host.ws.close();
    expect(await guest.next()).toEqual({ t: 'hostgone' });

    // migration path: a survivor re-opens the SAME code
    const heir = await dial();
    heir.send({ t: 'create', code });
    expect(await heir.next()).toEqual({ t: 'room', code });
    heir.ws.close(); guest.ws.close();
  });

  it('a requested code that is still LIVE is not stolen — a fresh one is dealt', async () => {
    const host = await dial();
    host.send({ t: 'create' });
    const { code } = await host.next();
    const rival = await dial();
    rival.send({ t: 'create', code });
    const m = await rival.next();
    expect(m.t).toBe('room');
    expect(m.code).not.toBe(code);
    host.ws.close(); rival.ws.close();
  });

  it('serves /health without CORS ceremony, as before', async () => {
    const r = await fetch(`http://127.0.0.1:${srv.port}/health`);
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  });

  it('idle rooms expire', async () => {
    const tiny = await createSignalServer({ port: 0, roomTtlMs: 80, sweepMs: 20 });
    const ws = new WebSocket(`ws://127.0.0.1:${tiny.port}`);
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify({ t: 'create' }));
    const code = await new Promise((r) => ws.once('message', (raw) => r(JSON.parse(raw).code)));
    await new Promise((r) => setTimeout(r, 250));
    const guest = new WebSocket(`ws://127.0.0.1:${tiny.port}`);
    await new Promise((r) => guest.on('open', r));
    guest.send(JSON.stringify({ t: 'join', code }));
    const m = await new Promise((r) => guest.once('message', (raw) => r(JSON.parse(raw))));
    expect(m.t).toBe('error');
    ws.close(); guest.close(); tiny.close();
  });
});

// ---- anonymous usage counters (/beacon -> /stats) ---------------------------
// The relay counts tiny anonymous beacons from client/analytics.js: visits per
// transport mode, games started (with seat counts), games ended (with rounds).
// Persistence is an injected store (statsStore) — these tests stub it; the
// real HF uploader is never touched from vitest.

const post = (port, body, type = 'text/plain') =>
  fetch(`http://127.0.0.1:${port}/beacon`, {
    method: 'POST', headers: { 'Content-Type': type }, body,
  });
const stats = async (port) => (await fetch(`http://127.0.0.1:${port}/stats`)).json();
const today = () => new Date().toISOString().slice(0, 10);

describe('usage counters', () => {
  it('aggregates visit / game_start / game_end into per-day and all-time buckets', async () => {
    const s = await createSignalServer({ port: 0 });
    await post(s.port, JSON.stringify({ e: 'visit', mode: 'solo', v: '1.0.0' }));
    await post(s.port, JSON.stringify({ e: 'visit', mode: 'server' }));
    await post(s.port, JSON.stringify({ e: 'game_start', mode: 'solo', players: 4, humans: 1 }));
    await post(s.port, JSON.stringify({ e: 'game_start', mode: 'rtc-host', players: 3, humans: 3 }));
    await post(s.port, JSON.stringify({ e: 'game_end', mode: 'solo', rounds: 12 }));
    const j = await stats(s.port);
    expect(j.ok).toBe(true);
    for (const b of [j.total, j.days[today()]]) {
      expect(b.visits).toBe(2);
      expect(b.by_mode).toEqual({ solo: 1, server: 1 });
      expect(b.games).toBe(2);
      expect(b.players_total).toBe(7);
      expect(b.humans_total).toBe(4);
      expect(b.game_ends).toBe(1);
      expect(b.rounds_total).toBe(12);
    }
    s.close();
  });

  it('tolerates garbage, sendBeacon content types, and hostile numbers — always 204', async () => {
    const s = await createSignalServer({ port: 0 });
    expect((await post(s.port, 'not json at all')).status).toBe(204);
    expect((await post(s.port, '')).status).toBe(204);
    expect((await post(s.port, '{"e":"nonsense"}', 'application/json')).status).toBe(204);
    expect((await post(s.port, JSON.stringify({ e: 'visit', mode: 'solo' }),
      'text/plain;charset=UTF-8')).status).toBe(204); // what navigator.sendBeacon ships
    // counts are clamped, never trusted: 1e9 players and negative rounds don't poison sums
    await post(s.port, JSON.stringify({ e: 'game_start', players: 1e9, humans: -5 }));
    await post(s.port, JSON.stringify({ e: 'game_end', rounds: -3 }));
    const j = await stats(s.port);
    expect(j.total.visits).toBe(1);
    expect(j.total.players_total).toBe(64);   // per-beacon cap
    expect(j.total.humans_total).toBe(0);
    expect(j.total.rounds_total).toBe(0);
    s.close();
  });

  it('CORS: OPTIONS preflight and permissive headers on /beacon and /stats', async () => {
    const s = await createSignalServer({ port: 0 });
    for (const path of ['/beacon', '/stats']) {
      const pre = await fetch(`http://127.0.0.1:${s.port}${path}`, { method: 'OPTIONS' });
      expect(pre.status).toBe(204);
      expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    }
    const r = await post(s.port, '{}');
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    const st = await fetch(`http://127.0.0.1:${s.port}/stats`);
    expect(st.headers.get('access-control-allow-origin')).toBe('*');
    s.close();
  });

  it('persistence: flushes dirty days + totals to the store, resumes on boot by merge-add', async () => {
    // a fake store: the HF dataset reduced to an in-memory object
    const disk = {};
    const store = {
      load: async (dayKey) => ({ day: disk[`days/${dayKey}.json`] || null, totals: disk['totals.json'] || null }),
      save: async (files) => { Object.assign(disk, JSON.parse(JSON.stringify(files))); },
    };
    const a = await createSignalServer({ port: 0, statsStore: store });
    await post(a.port, JSON.stringify({ e: 'visit', mode: 'solo' }));
    await post(a.port, JSON.stringify({ e: 'game_start', players: 2, humans: 2 }));
    await a.flushStats();
    expect(disk[`days/${today()}.json`].visits).toBe(1);
    expect(disk['totals.json'].games).toBe(1);
    a.close();

    // "restart": a fresh server on the same store resumes today's counts...
    const b = await createSignalServer({ port: 0, statsStore: store });
    await new Promise((r) => setTimeout(r, 20)); // boot load is async
    await post(b.port, JSON.stringify({ e: 'visit', mode: 'solo' }));
    const j = await stats(b.port);
    expect(j.days[today()].visits).toBe(2); // 1 restored + 1 new
    expect(j.total.games).toBe(1);          // restored via totals.json
    await b.flushStats();
    expect(disk[`days/${today()}.json`].visits).toBe(2);
    b.close();
  });

  it('a failing store keeps the day dirty and retries on the next flush', async () => {
    let fail = true;
    const saved = [];
    const store = {
      load: async () => null,
      save: async (files) => { if (fail) throw new Error('hf down'); saved.push(files); },
    };
    const s = await createSignalServer({ port: 0, statsStore: store });
    await post(s.port, JSON.stringify({ e: 'visit', mode: 'server' }));
    await s.flushStats();      // upload fails -> stays dirty
    expect(saved.length).toBe(0);
    fail = false;
    await s.flushStats();      // retry succeeds
    expect(saved.length).toBe(1);
    expect(saved[0][`days/${today()}.json`].visits).toBe(1);
    await s.flushStats();      // clean -> no third upload
    expect(saved.length).toBe(1);
    s.close();
  });

  it('without a store, /stats still counts in memory (local dev, no HF_TOKEN)', async () => {
    const s = await createSignalServer({ port: 0 });
    await post(s.port, JSON.stringify({ e: 'visit', mode: 'solo' }));
    await s.flushStats(); // a no-op, must not throw
    expect((await stats(s.port)).total.visits).toBe(1);
    s.close();
  });
});
