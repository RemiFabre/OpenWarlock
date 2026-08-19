// shared/snapwire.js: one connection's snapshot wire (round 21.10).
// The rules under test are the ones that make a DELTA stream safe to drop
// frames from: a delta needs its base, so whoever drops one must re-base.
// history: docs/history/2026-08-12-snapshot-bandwidth.md

import { describe, it, expect } from 'vitest';
import { createSnapWire, createSnapSink, QUEUE_FLOOR_BYTES, ECHO_BUDGET_PER_FRAME, ECHO_MAX_EVERY } from '../shared/snapwire.js';
import { createSnapDecoder } from '../shared/snapdelta.js';

// wire -> (a lossy pipe) -> sink, the whole contract end to end
function pipe({ delta = true } = {}) {
  const got = [];
  const fulls = { n: 0 };
  const w = createSnapWire({ delta });
  const sink = createSnapSink((m) => got.push(m), () => { fulls.n++; w.requestFull(); }, { fullEveryMs: 0 });
  return {
    got, fulls, w,
    // send one snapshot; `queued` fakes a backed-up socket, `lose` drops the
    // state message in flight (the unreliable rtc channel, or a real packet loss)
    push(msg, { queued = 0, lose = false } = {}) {
      const f = w.frame(msg, queued);
      if (f.evt) sink.take(JSON.parse(f.evt));
      if (f.state && !lose) sink.take(JSON.parse(f.state));
      return f;
    },
  };
}

const snap = (phase, extra = {}) => ({
  t: 'snap',
  s: { phase, time: 1, players: { p1: { id: 'p1', x: 1, y: 2, hp: 100 } }, pillars: [], ...extra },
});

// the client half: decode a state string the way client/transport.js does
const apply = (dec, wire) => dec.decode(JSON.parse(wire));

describe('snapwire: events', () => {
  it('rides its own message, separate from the state', () => {
    const w = createSnapWire();
    const f = w.frame({ ...snap('battle'), e: [{ t: 'boom', x: 1 }] });
    expect(JSON.parse(f.evt)).toEqual({ t: 'evt', e: [{ t: 'boom', x: 1 }] });
    expect(JSON.parse(f.state).t).toBe('snap');
  });

  it('is still sent when the state is skipped (a lost death is a lost kill cue)', () => {
    const w = createSnapWire();
    w.frame(snap('battle'));                                    // establishes lastBytes
    const f = w.frame({ ...snap('battle'), e: [{ t: 'death', id: 'p1' }] }, 10 * QUEUE_FLOOR_BYTES);
    expect(f.skipped).toBe(true);
    expect(f.state).toBe(null);
    expect(JSON.parse(f.evt).e[0].t).toBe('death');
  });
});

describe('snapwire: delta stream', () => {
  it('opens with a keyframe, then sends deltas', () => {
    const w = createSnapWire();
    expect(JSON.parse(w.frame(snap('battle')).state).f).toBeDefined();
    const second = JSON.parse(w.frame(snap('battle', { time: 2 })).state);
    expect(second.f).toBeUndefined();
    expect(second.b).toBe(1);
  });

  it('reconstructs the exact state a full snapshot would have carried', () => {
    const w = createSnapWire();
    const dec = createSnapDecoder();
    apply(dec, w.frame(snap('battle')).state);
    const moved = snap('battle', { time: 2 });
    moved.s.players.p1.x = 9;
    const r = apply(dec, w.frame(moved).state);
    expect(r.payload.s).toEqual(moved.s);
  });

  it('keyframes on a phase change (a shop opening changes nearly every field)', () => {
    const w = createSnapWire();
    w.frame(snap('battle'));
    expect(JSON.parse(w.frame(snap('battle', { time: 2 })).state).f).toBeUndefined();
    expect(JSON.parse(w.frame(snap('shop')).state).f).toBeDefined();
  });

  it('keyframes when the client reports a gap it could not patch', () => {
    const w = createSnapWire();
    w.frame(snap('battle'));
    w.requestFull();
    expect(JSON.parse(w.frame(snap('battle', { time: 2 })).state).f).toBeDefined();
  });

  it('carries bans and pings inside the delta-coded payload', () => {
    const w = createSnapWire();
    const dec = createSnapDecoder();
    const r = apply(dec, w.frame({ ...snap('lobby'), bans: 2, pings: { p1: 40 } }).state);
    expect(r.payload.bans).toBe(2);
    expect(r.payload.pings).toEqual({ p1: 40 });
  });
});

describe('snapwire: skipping a backed-up socket stays decodable', () => {
  it('the next delta SPANS the skipped state: no keyframe needed, nothing lost', () => {
    // 21.11: a skipped state never reaches the encoder, so the next delta is
    // based on the last state the client actually got. The old forced keyframe
    // dropped ~18 KB onto an already-full link, exactly when it hurt most.
    const w = createSnapWire();
    const dec = createSnapDecoder();
    apply(dec, w.frame(snap('battle')).state);
    // the socket backs up: this state never reaches the client
    expect(w.frame(snap('battle', { time: 2 }), 10 * QUEUE_FLOOR_BYTES).skipped).toBe(true);
    // the link recovers; the next message applies against what the client HAS
    const next = snap('battle', { time: 3 });
    next.s.players.p1.x = 42;
    const f = w.frame(next, 0);
    expect(JSON.parse(f.state).f).toBeUndefined();   // a small delta, not a keyframe
    const r = apply(dec, f.state);
    expect(r.needFull).toBe(false);
    expect(r.payload.s).toEqual(next.s);             // the skipped change is IN the span
  });

  it('a phase change during a skipped stretch still gets its keyframe', () => {
    const w = createSnapWire();
    w.frame(snap('battle'));
    expect(w.frame(snap('shop'), 10 * QUEUE_FLOOR_BYTES).skipped).toBe(true);
    const f = w.frame(snap('shop', { time: 2 }), 0);
    expect(JSON.parse(f.state).f).toBeDefined();     // the deferred phase keyframe
  });

  it('does not trip on the ordinary write buffering of a healthy link', () => {
    const w = createSnapWire();
    w.frame(snap('battle'));
    expect(w.frame(snap('battle', { time: 2 }), QUEUE_FLOOR_BYTES - 1).skipped).toBe(false);
  });

  it('scales its patience with the payload, not a fixed byte count', () => {
    // a big-payload connection tolerates a bigger queue than the floor
    const big = createSnapWire();
    const fat = snap('battle', { pillars: Array.from({ length: 400 }, (_, i) => ({ x: i, y: i, r: 2.2, sunk: false })) });
    const bytes = big.frame(fat).state.length;
    expect(bytes).toBeGreaterThan(QUEUE_FLOOR_BYTES);
    expect(big.frame(fat, bytes * 2).skipped).toBe(false);
    expect(big.frame(fat, bytes * 4).skipped).toBe(true);
  });
});

describe('snapwire: wire -> sink, the shape main.js sees', () => {
  it('delivers {t:snap, s, e} with the events that arrived alongside', () => {
    const p = pipe();
    p.push({ ...snap('battle'), e: [{ t: 'boom' }, { t: 'death' }] });
    expect(p.got).toHaveLength(1);
    expect(p.got[0].s.phase).toBe('battle');
    expect(p.got[0].e).toEqual([{ t: 'boom' }, { t: 'death' }]);
  });

  it('holds events that arrived without a state, and pays them out with the next one', () => {
    const p = pipe();
    p.push(snap('battle'));
    // the state is skipped, the death still crosses -> it must not be lost
    p.push({ ...snap('battle', { time: 2 }), e: [{ t: 'death' }] }, { queued: 10 * QUEUE_FLOOR_BYTES });
    expect(p.got).toHaveLength(1);
    p.push(snap('battle', { time: 3 }));
    expect(p.got).toHaveLength(2);
    expect(p.got[1].e).toEqual([{ t: 'death' }]);
  });

  it('recovers from a LOST delta by asking for a keyframe, and the state is whole again', () => {
    const p = pipe();
    p.push(snap('battle'));
    p.push(snap('battle', { time: 2 }), { lose: true });   // this packet never lands
    const third = snap('battle', { time: 3 });
    third.s.players.p1.x = 77;
    p.push(third);                                          // a delta on a base we do not have
    expect(p.fulls.n).toBe(1);                              // -> "send me a full"
    expect(p.got).toHaveLength(1);                          // nothing wrong was applied
    const fourth = snap('battle', { time: 4 });
    fourth.s.players.p1.x = 77;
    p.push(fourth);
    expect(p.got).toHaveLength(2);
    expect(p.got.at(-1).s).toEqual(fourth.s);               // exactly right, not drifted
  });

  it('never rolls back when a late duplicate arrives (the unordered rtc channel)', () => {
    const w = createSnapWire();
    const got = [];
    const sink = createSnapSink((m) => got.push(m));
    const wires = [1, 2, 3].map(t => JSON.parse(w.frame(snap('battle', { time: t })).state));
    for (const m of wires) sink.take(m);
    expect(got.at(-1).s.time).toBe(3);
    sink.take(wires[1]);                       // a reordered copy of an old state
    expect(got).toHaveLength(3);               // dropped, not re-delivered
    expect(got.at(-1).s.time).toBe(3);         // and the state did not go backwards
  });

  it('the delta stream costs a fraction of the whole snapshot it replaces', () => {
    // a real snapshot's bulk is the static pillar list; only the players move
    const pillars = Array.from({ length: 300 }, (_, i) => ({ x: i, y: i, r: 2.2, sunk: false }));
    const w = createSnapWire();
    const first = w.frame(snap('battle', { pillars })).state.length;
    let moving = snap('battle', { time: 2, pillars });
    moving.s.players.p1.x = 5;
    const second = w.frame(moving).state.length;
    expect(second).toBeLessThan(first / 10);
  });
});

describe('snapwire: `full` tells a two-channel caller which state is precious', () => {
  // The RTC host routes keyframes down the RELIABLE channel and deltas down the
  // lossy one. Getting this flag wrong sends a 20 KB all-or-nothing keyframe
  // over maxRetransmits:0, and one lost fragment orphans every delta after it.
  it('flags the opening keyframe, the phase-change one, and a requested one', () => {
    const w = createSnapWire();
    expect(w.frame(snap('battle')).full).toBe(true);         // join
    expect(w.frame(snap('battle', { time: 2 })).full).toBe(false);
    expect(w.frame(snap('shop')).full).toBe(true);           // phase change
    expect(w.frame(snap('shop', { time: 2 })).full).toBe(false);
    w.requestFull();
    expect(w.frame(snap('shop', { time: 3 })).full).toBe(true);
  });

  it('flags exactly the states a receiver can stand up on with no history', () => {
    // the invariant, checked message by message against a cold decoder: `full`
    // is true iff that message alone is enough. The encoder also keyframes on
    // its own fullEvery cadence, which a caller reading only its own request
    // flag would miss.
    const w = createSnapWire({ fullEvery: 4 });
    let fulls = 0;
    for (let i = 0; i < 12; i++) {
      const f = w.frame(snap('battle', { time: i }));
      const standsAlone = !createSnapDecoder().decode(JSON.parse(f.state)).needFull;
      expect(f.full).toBe(standsAlone);
      if (f.full) fulls++;
    }
    expect(fulls).toBeGreaterThan(1);   // the periodic ones really did happen
  });

  it('flags every state for a pre-21.10 client (all of them are self-contained)', () => {
    const w = createSnapWire({ delta: false });
    expect(w.frame(snap('battle')).full).toBe(true);
    expect(w.frame(snap('battle', { time: 2 })).full).toBe(true);
  });
});

describe('snapwire: falling behind is detected by ACKS, not by the socket', () => {
  // The scar this encodes: bufferedAmount stayed at 0 while a throttled seat ran
  // 19 s behind, because the backlog lived in the kernel send buffer.
  const drive = (n, { ackEvery = null } = {}) => {
    const w = createSnapWire({ ackLimitSnaps: 6 });
    let sent = 0, skips = 0, lastQ = 0;
    for (let i = 0; i < n; i++) {
      const f = w.frame(snap('battle', { time: i }), 0);   // socket always looks idle
      if (f.skipped) skips++;
      else { sent++; lastQ = JSON.parse(f.state).q; }
      if (ackEvery && i % ackEvery === 0) w.ack(lastQ);
    }
    return { sent, skips, w };
  };

  it('sends everything to a client that keeps acking', () => {
    const r = drive(40, { ackEvery: 1 });
    expect(r.skips).toBe(0);
    expect(r.sent).toBe(40);
  });

  it('starts skipping for a client that stops acking, and reports how far behind', () => {
    const w = createSnapWire({ ackLimitSnaps: 6 });
    for (let i = 0; i < 3; i++) w.frame(snap('battle', { time: i }), 0);
    w.ack(1);                                    // it has applied exactly one
    let skips = 0;
    for (let i = 0; i < 30; i++) if (w.frame(snap('battle', { time: 10 + i }), 0).skipped) skips++;
    expect(skips).toBeGreaterThan(20);           // most states dropped, not queued
    expect(w.stats().behind).toBeGreaterThan(6);
  });

  it('leaves a DISTANT but healthy link alone (high RTT is a constant backlog, not congestion)', () => {
    // a friend 300 ms away acks 5 states late, forever, and never falls further
    const w = createSnapWire({ ackLimitSnaps: 6 });
    const inFlight = [];
    let skips = 0;
    for (let i = 0; i < 200; i++) {
      const f = w.frame(snap('battle', { time: i }), 0);
      if (f.skipped) { skips++; continue; }
      inFlight.push(JSON.parse(f.state).q);
      if (inFlight.length > 5) w.ack(inFlight.shift());   // a fixed 5-state lag
    }
    expect(skips).toBe(0);
    expect(w.stats().floor).toBe(5);   // it learned what this link costs
  });

  it('never skips for a client that cannot ack at all (a pre-21.10 tab)', () => {
    const r = drive(40);                          // no acks ever
    expect(r.skips).toBe(0);
    expect(r.w.stats().behind).toBe(null);
  });

  it('resumes the moment the client catches up, on a state it can use', () => {
    const w = createSnapWire({ ackLimitSnaps: 2 });
    const dec = createSnapDecoder();
    apply(dec, w.frame(snap('battle'), 0).state);
    w.ack(1);
    const sent = [];
    for (let i = 0; i < 10; i++) {
      const f = w.frame(snap('battle', { time: i }), 0);  // it goes quiet
      if (f.state) sent.push(f.state);
    }
    expect(w.frame(snap('battle', { time: 99 }), 0).skipped).toBe(true);
    w.ack(w.stats().behind + 1e9);               // "I am fully caught up"
    // everything SENT before the skips eventually arrived (the pipe is reliable)
    for (const s of sent) apply(dec, s);
    const f = w.frame(snap('battle', { time: 100 }), 0);
    expect(f.skipped).toBe(false);
    const r = apply(dec, f.state);
    expect(r.needFull).toBe(false);
    expect(r.payload.s.time).toBe(100);
  });

  it('a REQUESTED keyframe goes out even while the client is behind (else deadlock)', () => {
    // The scar (found by tools/rtclab.js): a gapped client applies nothing, so
    // it acks nothing, so the backlog test skipped the very keyframe it was
    // waiting for; a stall that only ended when the floor crept up, ~10 s.
    const w = createSnapWire({ ackLimitSnaps: 2 });
    w.frame(snap('battle'), 0);
    w.ack(1);
    for (let i = 0; i < 10; i++) w.frame(snap('battle', { time: i }), 0);   // acks stopped
    expect(w.frame(snap('battle', { time: 50 }), 0).skipped).toBe(true);    // behind: skipping
    w.requestFull();                                                        // "I hit a gap"
    const f = w.frame(snap('battle', { time: 51 }), 0);
    expect(f.skipped).toBe(false);
    expect(JSON.parse(f.state).f).toBeDefined();                            // the way out
  });
});

describe('snapwire: echo mode (cadence keyframes ride BESIDE the delta)', () => {
  // The 21.11 fix for the keyframe race: a big cadence keyframe on the slow
  // reliable channel used to REPLACE the delta, so every delta behind it was
  // orphaned until it landed. In echo mode the delta chain never routes
  // through the reliable channel; the keyframe is a redundant recovery point.
  const wire = () => createSnapWire({ echo: true, fullEvery: 3 });

  it('emits the delta AND a keyframe with the same q at cadence time', () => {
    const w = wire();
    w.frame(snap('battle'));
    w.frame(snap('battle', { time: 2 }));
    w.frame(snap('battle', { time: 3 }));
    const f = w.frame(snap('battle', { time: 4 }));      // 4th state: cadence hits
    expect(f.key).not.toBe(null);
    const d = JSON.parse(f.state), k = JSON.parse(f.key);
    expect(d.f).toBeUndefined();                          // the chain link
    expect(k.f).toBeDefined();                            // the recovery point
    expect(d.q).toBe(k.q);
    expect(f.full).toBe(false);                           // the STATE is a delta
  });

  it('either arrival order yields the same state, the other copy is dropped', () => {
    const w = wire();
    const lead = [w.frame(snap('battle')), w.frame(snap('battle', { time: 2 })), w.frame(snap('battle', { time: 3 }))];
    const pair = w.frame(snap('battle', { time: 4 }));    // cadence: delta + keyframe
    const after = w.frame(snap('battle', { time: 5 }));   // plain delta on top
    for (const order of [[pair.state, pair.key], [pair.key, pair.state]]) {
      const dec = createSnapDecoder();
      for (const f of lead) apply(dec, f.state);
      const got = [order[0], order[1], after.state].map(s => apply(dec, s));
      expect(got[0].payload.s.time).toBe(4);              // first copy applies...
      expect(got[1].payload).toBe(null);                  // ...duplicate dropped...
      expect(got[2].payload.s.time).toBe(5);              // ...chain continues
    }
  });

  it('a receiver that lost the delta stands up on the echoed keyframe, then chains', () => {
    const w = wire();
    const dec = createSnapDecoder();
    apply(dec, w.frame(snap('battle')).state);
    w.frame(snap('battle', { time: 2 }));                 // delta LOST in flight
    w.frame(snap('battle', { time: 3 }));                 // delta LOST in flight
    const pair = w.frame(snap('battle', { time: 4 }));    // cadence: delta + keyframe
    expect(apply(dec, pair.state).needFull).toBe(true);   // delta useless (no base)
    expect(apply(dec, pair.key).payload.s.time).toBe(4);  // keyframe recovers, no round trip
    const next = w.frame(snap('battle', { time: 5 }));
    expect(apply(dec, next.state).payload.s.time).toBe(5);// and the chain continues
  });

  it('forced keyframes (join, gap, phase change) still replace the delta', () => {
    const w = wire();
    expect(w.frame(snap('battle')).key).toBe(null);                 // join
    expect(w.frame(snap('shop')).key).toBe(null);                   // phase change
    expect(JSON.parse(w.frame(snap('shop', { time: 9 })).state).f).toBeUndefined();
    w.requestFull();
    const f = w.frame(snap('shop', { time: 10 }));
    expect(f.key).toBe(null);                                       // requested gap fill
    expect(JSON.parse(f.state).f).toBeDefined();
  });

  it('a GROWING keyframe stretches the echo cadence to hold its byte budget', () => {
    // The late-game killer (2026-08-19): permanent pillars/craters grow the
    // keyframe ~7× over a game, and a fixed 2 s cadence shipped that on the
    // reliable ORDERED channel where a lost chunk stalls every event behind it.
    const big = { pillars: Array.from({ length: 400 }, (_, i) => ({ x: i, y: i % 37, r: 2.2 })) };
    const w = createSnapWire({ echo: true, fullEvery: 3 });
    const echoGap = (extra) => {
      // frames between one echo keyframe and the next
      let n = 0, t = 100;
      while (w.frame(snap('battle', { time: t++, ...extra })).key === null && n < 1000) n++;
      let gap = 1;
      while (w.frame(snap('battle', { time: t++, ...extra })).key === null && gap < 1000) gap++;
      return gap;
    };
    // small state: the configured cadence holds (tiny keyframe, under budget)
    expect(echoGap({})).toBe(3);
    // big state: the cadence stretches to keyBytes / budget, capped
    const gap = echoGap(big);
    const keyBytes = JSON.stringify({ t: 'snap', q: 0, f: { s: snap('battle', big).s } }).length;
    expect(gap).toBeGreaterThan(3);
    expect(gap).toBeLessThanOrEqual(ECHO_MAX_EVERY);
    expect(gap).toBeGreaterThanOrEqual(Math.min(ECHO_MAX_EVERY, keyBytes / ECHO_BUDGET_PER_FRAME) - 2);
    // a keyframe is still produced (stretched, never silenced)
    expect(gap).toBeLessThan(1000);
  });
});

// A lossy pipe with SIZE-DEPENDENT loss, which is the whole point: a data
// channel splits a message into ~1200-byte chunks, and on the unreliable one
// (maxRetransmits: 0) losing ANY chunk discards the WHOLE message. So a 15 KB
// keyframe is ~13× more exposed than a 250-byte delta.
// ⚠ This MODELS that arithmetic; it is not SCTP. It cannot prove anything about
// real WebRTC; it tests that our framing recovers from loss, which is where the
// round-21.10 bug actually lived. Seeded, so a failure is reproducible.
const MTU = 1200;
function lossyRun({ pktLoss, frames = 300, protectKeyframes, pillars = 300, seed = 7 }) {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const ring = Array.from({ length: pillars }, (_, i) => ({ x: i % 50, y: i % 37, r: 2.2, sunk: false }));
  const w = createSnapWire();
  let clock = 0, applied = 0, lost = 0, last = null;
  // no acks on purpose: this isolates loss recovery from the backpressure logic.
  // The VIRTUAL clock is load-bearing; with the real one, 300 frames land in the
  // same millisecond and the 500 ms keyframe-request limit suppresses every
  // recovery, which made the first version of this test read 3× worse than truth.
  const sink = createSnapSink(
    (m) => { applied++; last = m.s; },
    () => w.requestFull(),
    { fullEveryMs: 500, now: () => clock },
  );
  for (let i = 0; i < frames; i++) {
    clock = i * (1000 / 15);
    const msg = snap('battle', { time: i, pillars: ring });
    msg.s.players.p1.x = i;                       // something real changes each frame
    const f = w.frame(msg, 0);
    if (!f.state) continue;
    const reliable = protectKeyframes && f.full;
    const frags = Math.ceil(f.state.length / MTU);
    if (!reliable && rnd() < 1 - (1 - pktLoss) ** frags) { lost++; continue; }
    sink.take(JSON.parse(f.state));
    if (f.full) last = JSON.parse(f.state).f.s;   // truth, straight off the keyframe
  }
  return { applied, lost, frames, last, truth: { time: frames - 1 } };
}

describe('snapwire: recovery under packet loss (the reason keyframes went reliable)', () => {
  it('an ordinary 1% link is fine either way (this fix is not what carries it)', () => {
    expect(lossyRun({ pktLoss: 0.01, protectKeyframes: true }).applied).toBeGreaterThan(290);
    expect(lossyRun({ pktLoss: 0.01, protectKeyframes: false }).applied).toBeGreaterThan(290);
  });

  it('at 10% it is the difference between playable and dead', () => {
    const good = lossyRun({ pktLoss: 0.10, protectKeyframes: true });
    const bad = lossyRun({ pktLoss: 0.10, protectKeyframes: false });
    // an ~11 KB keyframe is all-or-nothing across 10 chunks, and every delta
    // after a lost one is orphaned until the next keyframe, so it compounds
    expect(good.applied).toBeGreaterThan(200);
    expect(bad.applied).toBeLessThan(good.applied / 2);
  });

  it('never drifts: whatever was lost, the state ends up exactly right', () => {
    const r = lossyRun({ pktLoss: 0.05, protectKeyframes: true });
    expect(r.lost).toBeGreaterThan(0);            // the run really did lose messages
    // the decisive check: the state the client ends up holding is a real
    // snapshot of the game, not an accumulation of half-applied patches.
    // x is set to the frame number every frame, so x === time or we drifted.
    expect(r.last.pillars).toHaveLength(300);
    expect(r.last.players.p1.x).toBe(r.last.time);
  });
});

describe('snapwire: a client that never asked for deltas', () => {
  it('gets the pre-21.10 self-contained shape, events INSIDE the snapshot', () => {
    const w = createSnapWire({ delta: false });
    const f = w.frame({ ...snap('battle'), bans: 1, e: [{ t: 'death' }] });
    expect(f.evt).toBe(null);                       // no separate message it would not read
    expect(JSON.parse(f.state)).toEqual({ t: 'snap', s: snap('battle').s, bans: 1, e: [{ t: 'death' }] });
    // ...every time, with no keyframe machinery
    expect(JSON.parse(w.frame(snap('battle', { time: 2 })).state).s.time).toBe(2);
  });

  it('is still skipped when its socket backs up (a whole snapshot is free to drop)', () => {
    const w = createSnapWire({ delta: false });
    w.frame(snap('battle'));
    expect(w.frame(snap('battle'), 10 * QUEUE_FLOOR_BYTES).skipped).toBe(true);
    expect(JSON.parse(w.frame(snap('battle', { time: 3 }), 0).state).s.time).toBe(3);
  });

  it('...but never one carrying events, which have nowhere else to ride', () => {
    const w = createSnapWire({ delta: false });
    w.frame(snap('battle'));
    const f = w.frame({ ...snap('battle'), e: [{ t: 'death' }] }, 10 * QUEUE_FLOOR_BYTES);
    expect(f.skipped).toBe(false);
    expect(JSON.parse(f.state).e).toEqual([{ t: 'death' }]);
  });
});
