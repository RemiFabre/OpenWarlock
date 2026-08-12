// One connection's snapshot wire: what the adapter actually sends, and when it
// sends nothing. Pure — no sockets, no JSON parsing back — so every rule below
// is unit-tested in test/snapwire.test.js.
//
// Why this exists (round 21.10): the payload GROWS all game (a permanent pillar
// list re-serialized 15×/s went from 3.1 KB to 22 KB per snapshot in a measured
// 20-round game), and the ws adapter re-sent all of it, uncompressed, with no
// way to fall behind except by queueing forever.
// history: docs/history/2026-08-12-snapshot-bandwidth.md
//
// Three rules, in the order they matter:
//   1. EVENTS RIDE ALONE and are never skipped — a lost death is a lost kill
//      cue. Splitting them out is what makes the state below droppable.
//   2. STATE IS DELTA-CODED per connection (shared/snapdelta.js). Opt-in, so a
//      stale cached tab that never asked still gets whole snapshots.
//   3. A BACKED-UP SOCKET GETS ITS STATE SKIPPED, not queued: a dropped
//      snapshot costs nothing (the next one carries the full state again), a
//      queued one costs permanent latency that never drains. ⚠ The skip breaks
//      the delta chain — but WE broke it, so we force our own keyframe next
//      send and no round trip is needed. That is the whole robustness story
//      Remi asked about: a delta needs its base, so the only party allowed to
//      drop one is the party that can immediately re-base.

import { createSnapEncoder, createSnapDecoder } from './snapdelta.js';

// Skip the state when the socket has more than this queued. Measured in
// SNAPSHOTS (the payload size swings 7× over a game, so bytes alone are the
// wrong unit) with a byte floor, because ordinary TCP write buffering on a
// healthy link is a few KB and must never trip the skip.
export const QUEUE_LIMIT_SNAPS = 3;
export const QUEUE_FLOOR_BYTES = 8192;
// ...and the signal that actually catches a thin link: the backlog of states we
// have sent that the client has not reported applying, measured against the
// SMALLEST backlog this link has recently managed.
// ⚠ Two scars, both found by tools/slowlink.js:
//   - `bufferedAmount` alone is blind: a seat ran 19 s behind while it never
//     rose, because a megabyte sat in the kernel send buffer.
//   - the ABSOLUTE backlog is not the signal either. It sits at RTT × 15 Hz
//     even on a perfect link, so a distant friend on a fat pipe would be
//     throttled for being far away. A congested pipe's backlog GROWS; a merely
//     distant one's is a constant offset — so compare against the floor.
export const ACK_LIMIT_SNAPS = 6;   // ~400 ms of backlog ABOVE this link's floor

export function createSnapWire({
  delta = true,                 // false = the pre-21.10 shape, whole every time
  fullEvery = 30,               // belt-and-braces keyframe cadence (~2 s at 15 Hz)
  queueLimitSnaps = QUEUE_LIMIT_SNAPS,
  queueFloorBytes = QUEUE_FLOOR_BYTES,
  ackLimitSnaps = ACK_LIMIT_SNAPS,
} = {}) {
  const enc = delta ? createSnapEncoder({ fullEvery }) : null;
  let wantFull = true;          // join, a client-reported gap, or a skip of ours
  let lastPhase = null;
  let lastBytes = 0;            // size of the last state message actually sent
  let skipped = 0;              // lifetime count, for the lab and the journal
  let sentQ = 0, ackedQ = 0;    // sequence sent vs last one the client applied
  let acking = false;           // has this client ever acked? (legacy ones never do)
  let floor = Infinity;         // smallest backlog seen lately = this link's RTT cost

  return {
    // The client hit a gap it could not patch (`{t:'full'}` upstream).
    requestFull() { wantFull = true; },

    // The client reporting the newest state it has applied (`{t:'ack', q}`).
    ack(q) {
      if (!Number.isFinite(q)) return;
      acking = true;
      if (q > ackedQ) ackedQ = q;
    },

    // One engine 'snap' message -> the strings to send, in order.
    // `queued` is the socket's unflushed byte count (ws.bufferedAmount).
    // -> { evt, state, skipped } — either string may be null.
    frame(msg, queued = 0) {
      const out = { evt: null, state: null, skipped: false };
      if (!msg || msg.t !== 'snap' || !msg.s) return out;
      // Events get their own reliable message — but only for a client that
      // announced it understands this framing. A pre-21.10 tab still finds them
      // INSIDE the snapshot, or it would silently lose every death cue; and its
      // snapshot is then never skipped, for the same reason.
      const hasEvents = Array.isArray(msg.e) && msg.e.length > 0;
      if (hasEvents && delta) out.evt = JSON.stringify({ t: 'evt', e: msg.e });

      const limit = Math.max(queueFloorBytes, queueLimitSnaps * lastBytes);
      let behind = false;
      if (acking) {
        const backlog = sentQ - ackedQ;
        // the floor creeps up slowly so a link that genuinely got worse is
        // re-learned, but a momentary dip cannot lower the bar for good
        floor = Math.min(backlog, floor + 0.01);
        behind = backlog > floor + ackLimitSnaps;
      }
      if ((queued > limit || behind) && !(!delta && hasEvents)) {
        // Falling behind: drop this state on the floor. Re-base on the next
        // one (a no-op for the legacy shape, which is always self-contained).
        out.skipped = true;
        skipped++;
        wantFull = true;
        lastPhase = msg.s.phase; // the forced keyframe already covers the change
        return out;
      }

      const payload = {
        s: msg.s,
        ...(msg.bans != null ? { bans: msg.bans } : {}),
        ...(msg.pings != null ? { pings: msg.pings } : {}),
      };
      // Keyframe on join, on a reported gap, after a skip of ours, and on a
      // phase change — a shop opening changes almost every field anyway, so a
      // delta there is bigger than the thing it describes.
      const full = wantFull || msg.s.phase !== lastPhase;
      lastPhase = msg.s.phase;
      wantFull = false;
      const wire = delta
        ? enc.encode(payload, { full })
        : { t: 'snap', ...payload, ...(hasEvents ? { e: msg.e } : { e: [] }) };
      if (wire.q != null) sentQ = wire.q;
      out.state = JSON.stringify(wire);
      lastBytes = out.state.length;
      return out;
    },

    // `behind` is the live "how far back is this player" number — the thing
    // that was invisible when a friend reported late-game jerkiness. `floor` is
    // what this link costs when healthy, so behind−floor is the congestion.
    stats() {
      return {
        skipped, lastBytes,
        behind: acking ? sentQ - ackedQ : null,
        floor: Number.isFinite(floor) ? Math.round(floor) : null,
      };
    },
  };
}

// The receiving half: turn `evt` messages and delta-coded `snap` messages back
// into the one `{t:'snap', s, e}` the client has always seen. Used by BOTH
// client transports (ws and rtc guest — they differ in their channels, not in
// their framing) and by tools/slowlink.js. A host older than 21.10 sends `s`
// inline; that shape still works untouched, which is what lets a stale tab play.
export function createSnapSink(deliver, requestFull = () => {}, {
  fullEveryMs = 500,
  // "I applied state q" — the only way the sender can tell this link is falling
  // behind (see ACK_LIMIT_SNAPS). ⚠ EVERY applied state, not a sampled subset:
  // ~20 bytes × 15 Hz = 300 B/s upstream, and a slower cadence would itself look
  // like a backlog (the first version acked at 2 Hz and throttled everybody).
  ack = () => {},
  ackEveryMs = 0,
} = {}) {
  let dec = createSnapDecoder();
  let events = [];
  let lastReq = 0, lastAck = 0;
  const flush = (payload) => {
    // shallow-clone s: the client annotates it (bans/pings) and the decoder's
    // copy must stay pristine — it is the base the next delta patches
    const out = { t: 'snap', s: { ...payload.s }, e: events };
    events = [];
    if (payload.bans != null) out.bans = payload.bans;
    if (payload.pings != null) out.pings = payload.pings;
    deliver(out);
  };
  return {
    reset() { dec = createSnapDecoder(); events = []; },
    // -> true when the message was framing this sink owns
    take(m) {
      if (!m || typeof m !== 'object') return false;
      if (m.t === 'evt') { if (Array.isArray(m.e)) events.push(...m.e); return true; }
      if (m.t !== 'snap') return false;
      if (m.s) { flush(m); return true; }
      const r = dec.decode(m);
      // A gap: ask for a keyframe, at most twice a second. On the unreliable rtc
      // channel a gap can repeat every frame, and one request per 500 ms
      // recovers without adding a request storm to an already struggling link.
      if (r.needFull && Date.now() - lastReq > fullEveryMs) { lastReq = Date.now(); requestFull(); }
      if (r.payload) {
        flush(r.payload);
        const now = Date.now();
        if (now - lastAck > ackEveryMs) { lastAck = now; ack(m.q); }
      }
      return true;
    },
  };
}
