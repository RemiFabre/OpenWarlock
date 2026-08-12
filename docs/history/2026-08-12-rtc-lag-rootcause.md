# 2026-08-12 — the late-game RTC lag: root cause, lab, fixes (round 21.11)

Follow-up to `2026-08-12-snapshot-bandwidth.md`, which fixed the ws/tunnel path
and rerouted RTC keyframes to the reliable channel but honestly concluded that
none of it was *confirmed* to explain the friend's session (the keyframe
reroute only matters at ≥5 % packet loss, and nobody had measured his link).
This round found the mechanisms, built the instrument that reproduces the
symptom, fixed them, and re-measured. Branch `rtc-lag`.

## 1. How big the payloads actually get

Measured with the real engine headless (3 idle humans spamming Stone Pillars —
the pattern that maximises pillar growth; a bot lobby smashes pillars with
terra and caps out earlier). Bytes are the JSON message as sent. "spare" is the
host-migration blob `{t:'spare', state: engine.serialize()}` that
client/transport.js sent to EVERY guest EVERY 2 s over the reliable ordered
channel — it was not in the 21.10 accounting at all.

| game min | round | pillars | keyframe B | delta avg B | spare B |
|---|---|---|---|---|---|
| 1 | 2 | 18 | 3 339 | 253 | 5 445 |
| 12 | 13 | 186 | 10 586 | 296 | 22 122 |
| 24 | 25 | 372 | 18 454 | 360 | 40 362 |

- The spare is **~2.2× the keyframe** (serialize keeps full float precision:
  63 B per pillar vs 34 in a snapshot) and grows the same way.
- With 7 seats the deltas average ~1.5 KB, not the 246 B measured on a 4-seat
  round-1 game — deltas scale with players moving, keyframes with pillars.
- So a late-game guest received, every 2 s, ~58 KB of reliable-ordered burst
  (keyframe + spare) before a single delta — ~30× the round-1 cost. Early game
  needs ~9 KB/s total; late game needed 45–65 KB/s.

## 2. The four mechanisms (each needs NO packet loss to hurt)

1. **The spare firehose.** Unconditional, un-backpressured, to every guest,
   on the ordered channel where it head-of-line-blocks keyframes and events.
   Alone it was ~25 KB/s per guest by round 25 — 38 % of the stream.
2. **The keyframe race.** A delta names its base `b = q−1`. A cadence keyframe
   IS state q and rode ctrl, arriving after transmission delay (+ queueing
   behind a spare); deltas q+1… landed on the fast lossy channel first and the
   decoder discards what it cannot base (it buffers nothing). Once ctrl
   delivery of the keyframe took > one delta interval (**67 ms** — a 60 KB/s
   link crosses that at ~4 KB of queue), EVERY keyframe boundary orphaned the
   following ~2 s of deltas and the guest lived on 0.5–2 Hz keyframes. "Like
   low freq." Early keyframes win the race, late ones cannot: that is the
   progressive part, and per-guest downlink decides who falls off: the
   asymmetric part.
3. **The skip amplifier.** A skip set `wantFull`, so every backpressure skip
   pushed an extra ~18 KB keyframe into the already-full pipe. Unnecessary:
   a skipped state never reaches the encoder, so the next delta is already
   valid against the last state actually sent.
4. **The gapped-ack deadlock.** A gapped client applies nothing → acks
   nothing → the backlog test skipped everything *including the keyframe the
   client had requested*, until the floor crept up (~10 s stalls).

## 3. The instrument: tools/rtclab.js

Real engine + real `createSnapWire`/`createSnapSink` + the real spare cadence,
through a modeled two-channel link per guest (shared host uplink FIFO, serial
per-guest downlink, RTT + jitter, bursty Gilbert-Elliott chunk loss, ordered
ctrl with RTO stalls, snap messages dying whole on any chunk loss). What it
cannot see: real SCTP congestion control (real loss is WORSE), browser
scheduling; guest inputs are instant. Numbers below are Hz of applied state
updates in battle (15 = keeping up) and staleness vs the host clock.

Found while building it: the sink's ack/request rate-limits used wall-clock
`Date.now()`, which silently swallowed acks when game-time runs faster than
real time. The sink now takes an injectable clock; the `>=` fix also stops a
real (rare) dropped ack when two states apply in the same millisecond.

## 4. Reproduction and the A/B

Host uplink 1250 KB/s; guests `ok` 1000 KB/s/25 ms/1 %, `wifi` 120/35/3 %,
`thin` 60 KB/s/50 ms/1 % (≈0.5 Mbit — congested wifi / weak DSL). Same seed,
same 25-round pillar-heavy game (502 pillars).

| build | thin guest min 0–14 | thin min 18–24 | wifi min 18–24 | ok |
|---|---|---|---|---|
| 21.10 (before) | 13–15 Hz, ≤0.3 s stale | **2–3 Hz, 7→48 s behind, no recovery** | 9–14 Hz | 13–15 Hz |
| spare off only | 13–15 Hz | 11–14 Hz, ≤1 s | — | — |
| 21.11 (all fixes) | 14–15 Hz | **12.7–13.8 Hz, ≤0.2 s avg / 1.4 s worst** | 12–14 Hz | 14–15 Hz |

The before-row is the symptom: fine early, collapsing late, one guest only,
never recovers — while the other guests in the same game stay fine.

## 5. The fixes (branch `rtc-lag`, each ~10 lines)

- **Echo keyframes** (`snapdelta.js` + `snapwire.js` `{echo:true}`, RTC host
  only): a cadence keyframe rides BESIDE the delta with the same q; the
  decoder applies whichever lands first and drops the other as stale. The
  delta chain never routes through the slow channel, and a lost delta now
  recovers on the next echo with no round trip. Forced fulls (join, gap,
  phase change) still replace the delta.
- **Spare rotation** (`transport.js`): one guest per 2 s, rotating, only on an
  idle channel. Migration (unimplemented B4) needs A recent spare somewhere,
  not a fresh one everywhere.
- **Skip does not re-base** and **a requested keyframe bypasses the
  ack-backlog skip** (`snapwire.js`) — kills mechanisms 3 and 4.
- **Visibility**: an RTC guest now measures its own RTT via `getStats()` every
  2 s → `engine.setPing` → the same ms badge the ws path has; the host journal
  logs a per-guest `wire` line (behind/skipped/floor) every 2 s.

## 6. Limits and the next lever

- 6 guests on a **1 Mbit/s uplink** still saturate late-game (874 pillars,
  everyone at 2–4 Hz, ~2 s stale — graceful and equal now, not one guest at
  48 s). On a 5 Mbit/s uplink all six hold 11–14 Hz to round 25. If hosting on
  ADSL-class uplinks ever matters, the lever is the keyframe itself: pillars
  are ~86 % of it and change a few times a minute — a pillar-revision scheme
  (send the list once reliably, keyframes carry a revision number) would cut
  late-game keyframes ~7×. Protocol change; not done in 21.11.
- "This is what was hurting HIM" is now a reproduced mechanism plus matched
  symptoms, still not a measurement of his link — but the badge now shows his
  RTT in-game, and the host log shows his behind/skipped. One long game tells.
