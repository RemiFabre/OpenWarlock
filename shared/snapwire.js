// One connection's snapshot wire: what the adapter actually sends, and when it
// sends nothing. Pure (no sockets, no JSON parsing back), so every rule below
// is unit-tested in test/snapwire.test.js.
//
// Why this exists (round 21.10): the payload GROWS all game (a permanent pillar
// list re-serialized 15×/s went from 3.1 KB to 22 KB per snapshot in a measured
// 20-round game), and the ws adapter re-sent all of it, uncompressed, with no
// way to fall behind except by queueing forever.
// history: docs/history/2026-08-12-snapshot-bandwidth.md
//
// Three rules, in the order they matter:
//   1. EVENTS RIDE ALONE and are never skipped; a lost death is a lost kill
//      cue. Splitting them out is what makes the state below droppable.
//   2. STATE IS DELTA-CODED per connection (shared/snapdelta.js). Opt-in, so a
//      stale cached tab that never asked still gets whole snapshots.
//   3. A BACKED-UP SOCKET GETS ITS STATE SKIPPED, not queued: a dropped
//      snapshot costs nothing (deltas span it; see below), a queued one costs
//      permanent latency that never drains.
//
// Round 21.11, after tools/rtclab.js reproduced the late-game RTC lag: a
// skipped state never reaches the encoder, so the NEXT delta is still valid
// against the last state actually sent; a skip does not break the chain and
// forces no keyframe (the old forced keyframe landed ~18 KB on an already-full
// link, exactly when it hurt most). The delta chain only breaks when the
// RECEIVER loses a message, and that is its call to requestFull().

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
//     distant one's is a constant offset, so compare against the floor.
export const ACK_LIMIT_SNAPS = 6;   // ~400 ms of backlog ABOVE this link's floor
// The echo keyframe's bandwidth budget, in bytes per snapshot FRAME (~2.5 KB/s
// at 15 Hz). The keyframe GROWS all game (pillars/craters accumulate) and rides
// the reliable ORDERED channel, where a lost chunk stalls every event behind
// it; a fixed 2 s cadence made that cost grow ~7× over a long game (measured,
// docs/history/2026-08-19-refresh-lag-investigation.md). So the cadence
// stretches to hold the budget; recovery stays on the guest's requestFull path,
// which round-trips faster than the old 2 s cadence anyway.
export const ECHO_BUDGET_PER_FRAME = 170;
export const ECHO_MAX_EVERY = 300;  // never sparser than ~20 s at 15 Hz

export function createSnapWire({
  delta = true,                 // false = the pre-21.10 shape, whole every time
  echo = false,                 // two-channel callers: cadence keyframes ride BESIDE the delta (out.key)
  fullEvery = 30,               // belt-and-braces keyframe cadence (~2 s at 15 Hz)
  queueLimitSnaps = QUEUE_LIMIT_SNAPS,
  queueFloorBytes = QUEUE_FLOOR_BYTES,
  ackLimitSnaps = ACK_LIMIT_SNAPS,
} = {}) {
  const enc = delta ? createSnapEncoder({ fullEvery, echo }) : null;
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
    // -> { evt, state, key, full, skipped }; any string may be null. `full`
    // says the state is a KEYFRAME, which matters to a caller that has both a
    // reliable and a lossy channel; `key` (echo mode only) is a redundant
    // cadence keyframe for the reliable channel while `state` stays a delta
    // for the lossy one. See the RTC host in client/transport.js.
    frame(msg, queued = 0) {
      const out = { evt: null, state: null, key: null, full: false, skipped: false };
      if (!msg || msg.t !== 'snap' || !msg.s) return out;
      // Events get their own reliable message, but only for a client that
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
      // A keyframe the client ASKED for bypasses the ack test: a gapped client
      // cannot apply anything, so it stops acking; withholding its keyframe
      // until it acks again is a deadlock (multi-second stalls, found by
      // tools/rtclab.js). The byte test still stands: a full pipe is full.
      if ((queued > limit || (behind && !wantFull)) && !(!delta && hasEvents)) {
        // Falling behind: drop this state on the floor. The encoder never sees
        // it, so the next delta spans the hole; nothing to re-base.
        out.skipped = true;
        skipped++;
        return out;
      }

      const payload = {
        s: msg.s,
        ...(msg.bans != null ? { bans: msg.bans } : {}),
        ...(msg.pings != null ? { pings: msg.pings } : {}),
        ...(msg.host != null ? { host: msg.host } : {}),
        ...(msg.chat != null ? { chat: msg.chat } : {}),
      };
      // Keyframe on join, on a reported gap, after a skip of ours, and on a
      // phase change: a shop opening changes almost every field anyway, so a
      // delta there is bigger than the thing it describes.
      const full = wantFull || msg.s.phase !== lastPhase;
      lastPhase = msg.s.phase;
      wantFull = false;
      const wire = delta
        ? enc.encode(payload, { full })
        : { t: 'snap', ...payload, ...(hasEvents ? { e: msg.e } : { e: [] }) };
      // `full` above is what we ASKED for; the encoder also keyframes on its own
      // fullEvery cadence, so read the answer off the message it produced.
      if (wire.echo) {
        out.key = JSON.stringify(wire.echo); delete wire.echo;
        // stretch the next cadence so echo keyframes stay inside their budget
        // (never denser than the configured fullEvery, never sparser than the cap)
        enc.setFullEvery(Math.min(ECHO_MAX_EVERY,
          Math.max(fullEvery, out.key.length / ECHO_BUDGET_PER_FRAME)));
      }
      out.full = wire.f !== undefined || !delta;
      if (wire.q != null) sentQ = wire.q;
      out.state = JSON.stringify(wire);
      lastBytes = out.state.length;
      return out;
    },

    // `behind` is the live "how far back is this player" number; the thing
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

// The playout half: how far in the past the client renders (`renderDelay`),
// fed by snapshot ARRIVAL times. Lives here, not in main.js, so tools/rtclab.js
// and the tests run the exact code the client runs.
//
// mode 'step' is the shipped pre-fix behavior: a peak-hold gap estimate (jump
// to the worst gap, decay 8% per snapshot) applied to renderDelay INSTANTLY.
// ⚠ Measured against a friend's real trace (2026-08-13): one 284 ms arrival
// gap steps renderDelay +313 ms in one frame, which REWINDS the drawn world a
// third of a second. history: docs/history/2026-08-14-playout-rewind.md
// mode 'slew' is the fix: the estimate becomes a sliding-window max (one spike
// stops poisoning it after windowMs) and the APPLIED delay walks toward that
// target at a bounded rate. Widening slows playback a little, tightening
// speeds it a little, and the drawn clock never jumps.
export function createGapTracker({
  intervalMs = 1000 / 15,      // nominal snapshot interval
  maxDelay = 600,              // past this, lag is worse than the stutter it hides
  mode = 'step',               // 'step' = pre-fix behavior · 'slew' = bounded walk
  windowMs = 3000,             // 'slew': how long a bad gap keeps the target wide
  slewUp = 200,                // 'slew': widen at most 200 ms/s (0.8x playback)
  slewDown = 30,               // 'slew': tighten at most 30 ms/s (1.03x playback)
} = {}) {
  const base = intervalMs * 1.6 + 25;   // one-and-a-bit intervals on a healthy link
  const target = (g) => Math.min(maxDelay, Math.max(base, g * 1.6 + 25));
  let lastAt = null;           // previous snapshot arrival
  let gapEst = intervalMs;     // 'step': peak-hold · 'slew': max over the window
  let delay = base;            // the renderDelay actually applied
  let lastNow = null;          // 'slew': when the walk last advanced
  let gaps = [];               // 'slew': {at, gap} samples inside the window
  return {
    reset() { lastAt = null; gapEst = intervalMs; delay = base; lastNow = null; gaps = []; },
    // a snapshot arrived at time `at` (same clock as delay(now))
    track(at) {
      if (lastAt != null && at > lastAt) {
        const gap = at - lastAt;
        if (mode === 'step') {
          gapEst = Math.max(gap, gapEst * 0.92);
          delay = target(gapEst);
        } else {
          gaps.push({ at, gap });
          while (gaps.length && gaps[0].at < at - windowMs) gaps.shift();
          gapEst = gaps.reduce((m, g) => Math.max(m, g.gap), intervalMs);
        }
      }
      lastAt = at;
    },
    // the delay to render with at time `now`; call it every drawn frame
    delay(now) {
      if (mode === 'step') return delay;
      const dt = lastNow == null ? 0 : Math.max(0, now - lastNow) / 1000;
      lastNow = now;
      const t = target(gapEst);
      if (t > delay) delay = Math.min(t, delay + slewUp * dt);
      else delay = Math.max(t, delay - slewDown * dt);
      return delay;
    },
    stats() { return { renderDelay: delay, gapEst }; },
  };
}

// The receiving half: turn `evt` messages and delta-coded `snap` messages back
// into the one `{t:'snap', s, e}` the client has always seen. Used by BOTH
// client transports (ws and rtc guest; they differ in their channels, not in
// their framing) and by tools/slowlink.js. A host older than 21.10 sends `s`
// inline; that shape still works untouched, which is what lets a stale tab play.
export function createSnapSink(deliver, requestFull = () => {}, {
  fullEveryMs = 500,
  // "I applied state q": the only way the sender can tell this link is falling
  // behind (see ACK_LIMIT_SNAPS). ⚠ EVERY applied state, not a sampled subset:
  // ~20 bytes × 15 Hz = 300 B/s upstream, and a slower cadence would itself look
  // like a backlog (the first version acked at 2 Hz and throttled everybody).
  ack = () => {},
  ackEveryMs = 0,
  // injectable so a loss test or a faster-than-real sim (tools/rtclab.js) can
  // run against a VIRTUAL clock: with the real one, frames land in the same
  // millisecond and the rate limits below suppress everything, which silently
  // understates recovery
  now = () => Date.now(),
} = {}) {
  let dec = createSnapDecoder();
  let events = [];
  let lastReq = 0, lastAck = 0;
  const flush = (payload) => {
    // shallow-clone s: the client annotates it (bans/pings) and the decoder's
    // copy must stay pristine; it is the base the next delta patches
    const out = { t: 'snap', s: { ...payload.s }, e: events };
    events = [];
    if (payload.bans != null) out.bans = payload.bans;
    if (payload.pings != null) out.pings = payload.pings;
    if (payload.host != null) out.host = payload.host;
    if (payload.chat != null) out.chat = payload.chat;
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
      const t = now();
      if (r.needFull && t - lastReq >= fullEveryMs) { lastReq = t; requestFull(); }
      if (r.payload) {
        flush(r.payload);
        if (t - lastAck >= ackEveryMs) { lastAck = t; ack(m.q); }
      }
      return true;
    },
  };
}
