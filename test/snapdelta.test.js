// shared/snapdelta.js — delta snapshots for the WebRTC host path
// (docs/BRIEF-browser-hosting.md §B3, verification 5: a client reconstructing
// from full+deltas must match the host's authoritative snapshot EXACTLY, over a
// full round — including packet loss and out-of-order delivery, since the snap
// data channel is unreliable+unordered by design).

import { describe, it, expect } from 'vitest';
import { diff, patch, createSnapEncoder, createSnapDecoder } from '../shared/snapdelta.js';
import { createEngine } from '../shared/engine.js';
import { TICK_RATE, SNAPSHOT_RATE } from '../shared/constants.js';

const rt = (a, b) => {
  const d = diff(a, b);
  return patch(a, d);
};

describe('snapdelta: diff/patch primitives', () => {
  it('round-trips objects, arrays, deletions and primitives', () => {
    const cases = [
      [{ a: 1 }, { a: 2 }],
      [{ a: 1, b: { c: 3 } }, { a: 1, b: { c: 4, d: 5 } }],
      [{ a: 1, b: 2 }, { a: 1 }],                        // key deleted
      [{ p: { x: 1, y: 2 } }, { p: { x: 1 } }],          // nested delete
      [{ arr: [1, 2, 3] }, { arr: [1, 2] }],             // arrays are atomic
      [{ v: null }, { v: 0 }],
      [{ v: 'a' }, { v: { o: 'looks like a delta tag' } }], // value shaped like the encoding
      [{}, { new: { deep: [1, { z: 2 }] } }],
      [{ s: 'x' }, { s: 'x' }],                          // no change at all
    ];
    for (const [a, b] of cases)
      expect(JSON.stringify(rt(a, b))).toBe(JSON.stringify(b));
  });

  it('diff returns undefined when nothing changed', () => {
    const a = { x: 1, nest: { y: [1, 2] } };
    expect(diff(a, JSON.parse(JSON.stringify(a)))).toBe(undefined);
  });

  it('patch does not mutate the previous value', () => {
    const a = { p: { x: 1 }, arr: [1] };
    const b = { p: { x: 2 }, arr: [1] };
    patch(a, diff(a, b));
    expect(a.p.x).toBe(1);
  });
});

// drive a real engine round and stream one viewer's snapshots through the codec
function playRound(onPayload, { seed = 5 } = {}) {
  const DT = 1 / TICK_RATE;
  const snapEvery = Math.round(TICK_RATE / SNAPSHOT_RATE);
  let out = [];
  const engine = createEngine({ seed, onSend: (id, m) => { if (id === 'h1' && m.t === 'snap') out.push(m); } });
  engine.game.oneRound = false; // exercises the BASE round flow (see oneround.test.js for the default)
  engine.join('h1', { name: 'Guest' });
  engine.join('h2', { name: 'Other' });
  engine.message('h1', { t: 'addBot', kind: 'berserker', build: 'glass' });
  engine.message('h1', { t: 'addBot', kind: 'berserker', build: 'tank' });
  engine.message('h1', { t: 'ready', ready: true });
  engine.message('h2', { t: 'ready', ready: true });
  let sawShop = false;
  for (let i = 0; i < 300 * TICK_RATE && !(sawShop && engine.game.phase === 'battle'); i++) {
    engine.tick(DT);
    if (engine.game.phase === 'shop') sawShop = true;
    if (i % snapEvery === 0) {
      engine.pushSnapshots();
      for (const m of out) onPayload({ s: m.s, bans: m.bans });
      out = [];
    }
  }
  engine.destroy();
  if (!sawShop) throw new Error('round never reached shop');
}

describe('snapdelta: encoder/decoder over a real round', () => {
  it('lossless channel: every decoded payload matches the authoritative one exactly', () => {
    const enc = createSnapEncoder();
    const dec = createSnapDecoder();
    let n = 0, fulls = 0;
    playRound((payload) => {
      const msg = enc.encode(payload);
      if (msg.f !== undefined) fulls++;
      const r = dec.decode(msg);
      expect(r.payload).toBeTruthy();
      expect(JSON.stringify(r.payload)).toBe(JSON.stringify(payload));
      n++;
    });
    expect(n).toBeGreaterThan(100);        // a real round streamed
    expect(fulls).toBeLessThan(n / 3);     // and most of it was deltas
  });

  it('phase changes can force a keyframe', () => {
    const enc = createSnapEncoder({ fullEvery: 1e9 });
    let lastPhase = null, forced = 0;
    playRound((payload) => {
      const full = payload.s.phase !== lastPhase;
      lastPhase = payload.s.phase;
      const msg = enc.encode(payload, { full });
      if (full) { expect(msg.f).toBeTruthy(); forced++; }
    });
    expect(forced).toBeGreaterThan(2);     // lobby->countdown->battle->shop...
  });

  it('lossy + reordered channel: gaps demand a full, and every accepted payload is exact', () => {
    const enc = createSnapEncoder();
    const dec = createSnapDecoder();
    const byQ = new Map(); // q -> the authoritative payload that message carried
    let i = 0, accepted = 0, resyncs = 0, staleDrops = 0, delayed = null;
    const deliver = (msg) => {
      const r = dec.decode(msg);
      if (r.needFull) { resyncs++; enc.pendingFull = true; }
      if (r.payload) {
        accepted++;
        // whatever is accepted must be EXACTLY what that seq carried, bit for bit
        expect(JSON.stringify(r.payload)).toBe(JSON.stringify(byQ.get(msg.q)));
      } else if (!r.needFull) staleDrops++;
      return r;
    };
    playRound((payload) => {
      i++;
      const msg = enc.encode(payload, { full: enc.pendingFull });
      enc.pendingFull = false;
      byQ.set(msg.q, payload);
      if (i % 7 === 3) return;                     // ~14% loss
      if (i % 11 === 5) { delayed = msg; return; } // hold one back...
      const r = deliver(msg);
      // ...and hand it over only once something NEWER was accepted: a message
      // older than the applied state must be dropped, never rewind the game
      if (delayed && r.payload && msg.q > delayed.q) {
        const d = delayed; delayed = null; deliver(d);
      }
    });
    expect(resyncs).toBeGreaterThan(0);      // loss really forced re-keyframes
    expect(staleDrops).toBeGreaterThan(0);   // reordering really dropped stales
    expect(accepted).toBeGreaterThan(100);
  });
});
