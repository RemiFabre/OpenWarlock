# 2026-08-19: the refresh lead: why a guest reload reduces lag, and what was fixed

*Round 24.14. Trigger: Remi hosted online (RTC path) on game night; BOTH
guests lagged at some point, and BOTH reported less lag after refreshing
their page. That is a new observation: a refresh resets specific state, so
whatever degrades must live in that state. This session hunted it, fixed the
one degrading mechanism it could measure, and shipped the instrument that
will settle the rest at the next real game.*

## What a guest page refresh actually resets

1. The guest's browser tab: JS heap, render state, the playout tracker
   (createGapTracker), the snap decoder.
2. The connection: a NEW RTCPeerConnection, meaning a fresh SCTP association
   (congestion window, retransmit state) on both channels.
3. The host's per-guest state: a new conn id gets a fresh createSnapWire
   (delta encoder base, ack floor, skip counters). The old peer is dropped.

## Ruled out by code audit (client-side accumulation)

Every unbounded-growth candidate in the client was checked: `snaps` capped at
40, `fx` pruned by duration each frame, host `logBuf` capped at 20000 entries,
chatter bubbles capped, render BLOBS fixed at 14, sfx nodes stop and are GC'd.
No leak found in our arrays. (Heap growth from engine/browser internals is NOT
ruled out; the new lagr report measures it live, see below.)

## Ruled out by measurement (our per-connection wire/playout logic)

tools/rtclab.js, 25 sim minutes, real engine + real snapwire + shipped slew
tracker, guests fiber 2500KB/s/12ms/0.3% loss, wifi 1000/35/3.0%, dsl
250/45/1.0%. Per-2-minute buckets: Hz (state updates applied per second, 15 =
keeping up), stale (host clock minus drawn state), delay (renderDelay ms the
guest plays with, healthy 132), frz (ms per battle-minute with nothing to
draw). Verdict: NONE of these ratchet over 24 minutes on current code. The
wifi guest plays at ~13.5 Hz / ~490 ms delay in minute 2 AND in minute 24.
Our wire and playout state does not degrade with connection age; the
21.11/23.1 fixes hold.

## What DOES grow, and the fix (adaptive echo keyframe cadence)

One column grew all game: ctrl KB/s, the reliable ORDERED channel. The echo
cadence keyframe (a full state, sent every ~2 s beside the delta as a
recovery point, round 21.11) grows linearly with permanent arena objects,
because the delta grammar treats arrays as atomic and a keyframe carries
everything: pillars 50 -> 565 over the game took the keyframe from ~5 KB to
~40 KB. On the ordered channel a lost chunk stalls EVERYTHING behind it one
retransmit; a 40 KB keyframe is ~34 chunks, so at 3% chunk loss most late-game
keyframes stall the event stream behind them. And on real WebRTC (which
rtclab cannot model) repeated loss on ever-bigger blobs also collapses the
SCTP congestion window of the long-lived association, which is exactly the
state a refresh resets. This is the best mechanical fit for "fine early,
laggy late, refresh helps" that the code can show.

Fix (shared/snapwire.js + a setFullEvery hook in snapdelta.js): the echo
cadence now STRETCHES to hold a byte budget, `ECHO_BUDGET_PER_FRAME` 170 B
per snapshot frame (~2.5 KB/s at 15 Hz, the early-game cost), capped at
`ECHO_MAX_EVERY` 300 frames (~20 s). Early game nothing changes (5 KB
keyframe -> the same ~2 s cadence); late game a 40 KB keyframe ships every
~16 s instead of every 2 s. Recovery is unaffected: a guest that hits a gap
requests a keyframe explicitly (requestFull, 500 ms rate limit), a round trip
that was already faster than waiting out the old 2 s cadence. Forced
keyframes (join, gap, phase change) are untouched.

Same rtclab scenario after the fix, minute-24 bucket (565 pillars),
before -> after:

| guest | ctrl KB/s | Hz | delay ms | frz ms/min |
|---|---|---|---|---|
| fiber | 13.9 -> 4.4 | 15.0 -> 15.0 | 133 -> 214 (noise; min-22 was 245 -> 136) | 0 -> 112 |
| wifi  | 19.5 -> 10.0 | 13.2 -> 13.5 | 545 -> 531 | 374 -> 262 |
| dsl   | 15.4 -> 5.0 | 14.6 -> 14.6 | 455 -> 399 | 337 -> 206 |

ctrl load no longer tracks the pillar count (fiber whole-game: 2.4 -> 4.4
KB/s after, vs 2.4 -> 13.9 before); Hz/stale/delay/frz stay within their
run-to-run noise; `wasted` (redundant echo copies the decoder discards)
drops sharply. wifi ctrl stays higher because its loss triggers more
on-demand fulls, which is the system working as designed.

## What this session could NOT see (and the instrument that will)

rtclab is arithmetic: no SCTP congestion control, no browser scheduling, no
real GC. The two remaining refresh-resettable suspects live exactly there:
the SCTP association's congestion state, and browser-side heap/render decay.
So round 24.14 also ships the friend-trace reporter: every 5 s an RTC guest
sends `{t:'lagr', d, g, hz, heap}` (renderDelay ms, gap estimate ms, applied
snapshots/s, JS heap MB where the browser exposes it) and the host journals
it beside the existing per-guest `wire` lines (behind/skipped/floor).

**Next laggy game, the procedure is one step: Remi presses the ⬇ log button
after the game** (before closing the tab; the journal dies with it). The
JSONL then answers, per guest and per timestamp: did renderDelay/gapEst climb
while `behind` stayed flat (link-side decay: SCTP suspect), did heap climb
with the lag (client decay), did the numbers step down at the moment the
guest refreshed (which reset), did `skipped` bursts line up with the lag
reports. Old host + new guest, or new host + old guest, both degrade
gracefully (unknown message types are ignored everywhere).

## Files touched

`shared/snapwire.js` (budget + cadence stretch), `shared/snapdelta.js`
(setFullEvery), `client/main.js` (lagr sender), `client/transport.js` (lagr
-> journal), `test/snapwire.test.js` (+1: a growing keyframe stretches the
cadence, floors at the configured fullEvery, caps at ECHO_MAX_EVERY).
