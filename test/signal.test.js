// server/signal.js — the WebRTC rendezvous (docs/BRIEF-browser-hosting.md §B1).
// It brokers { host, code } <-> guests and relays opaque sig blobs; it never
// sees game traffic (the e2e kills it mid-match and the game must not notice).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { createSignalServer, CODE_ALPHABET } from '../server/signal.js';

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
    expect(m.code).toMatch(new RegExp(`^[${CODE_ALPHABET}]{5}$`));
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

  it('join with an unknown code is a plain error', async () => {
    const guest = await dial();
    guest.send({ t: 'join', code: 'ZZZZZ' });
    const m = await guest.next();
    expect(m.t).toBe('error');
    expect(m.reason).toMatch(/no such room/i);
    guest.ws.close();
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
