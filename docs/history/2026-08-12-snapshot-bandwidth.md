# Round 21.10 — the snapshot stream had no brakes (2026-08-12)

Remi's report: one remote friend got **progressively jerkier as the rounds went
on** — fine early, "everything jerky, like low freq" late — on a fast PC with
the game tab in front. A second remote friend in the same games was fine.

Everything below is measured. Every table says what its numbers are, against
what baseline, and how they were taken.

## 1. What was ruled out, and by what

| Hypothesis | How it was tested | Result |
|---|---|---|
| Client memory / DOM leak accumulating over rounds | Drove the real client (`?mode=solo`) in headless Chromium through 9 rounds, sampling `performance.memory`, `document.getElementsByTagName('*').length` and frames/s every 3.5 s | Heap flat at **9.5 MB**, DOM flat at **879 nodes**, fps stable. No leak. |
| Host simulation cost late-game | `engine.tick()` timed in Node, 900 ticks per point, pillar count forced 6 → 800 | **0.02 → 0.07 ms** against a **33 ms** budget. `snapshot()`+`JSON.stringify` 0.03 → 0.18 ms. Not the host. |
| Client render cost of accumulated pillars | Injected N extra pillars into a live client's game state, counted frames over 3 s at 1600×900 | 92.5 fps at +0 → **58.4 fps at +450** → 47.6 at +700. Real but modest; matters on a weak GPU, not on this machine. |
| The RTC hot spare (`engine.serialize()`, sent to every guest every 2 s) | Serialized a live game each round, with `pushSnapshots()` called at 15 Hz as production does | **6.7 KB → 7.4 KB over 11 rounds**. Not a factor. ⚠ A first pass measured it ballooning to 733 KB — that was the harness never calling `pushSnapshots()`, so `game.events` never drained. Harness artifact, not a real effect. |

## 2. The cause: three things compounding

### 2a. Snapshots were re-sent whole, 15×/s, uncompressed

`server/index.js` sent `ws.send(JSON.stringify(msg))` per player per snapshot,
with no delta coding and no compression. `perMessageDeflate` is **off by default
in `ws`** and nothing turned it on.

Snapshot of a 4-seat elemental game, `JSON.stringify(snapshot(game, viewer))`,
deflate applied with `zlib.deflateSync` for comparison:

| pillars on the map | raw bytes/snapshot | raw, per player at 15 Hz | deflated | deflated at 15 Hz |
|---|---|---|---|---|
| 6 (round 1) | 3,087 | 45 KB/s | 648 (21%) | 9 KB/s |
| 80 | 6,270 | 92 KB/s | 1,260 (20%) | 18 KB/s |
| 300 | 15,713 | 230 KB/s | 2,763 (18%) | 40 KB/s |
| 450 | 22,159 | **325 KB/s** | 3,740 (17%) | 55 KB/s |

Every player was receiving ~5× more bytes than the same information needs.

### 2b. The payload grows all game, and pillars are the whole growth

Pillars are permanent (round 21.2) and the entire list was re-serialized into
every snapshot, though it changes a couple of times a minute.

Headless 4-seat games, snapshot bytes at each round's shop:

| game | round 1 | round 20 | pillars at the end |
|---|---|---|---|
| nobody owns Stone Pillar | 3,627 B | 3,964 B (round 11) | 6 |
| all four seats own it and cast on cooldown, run A | 4,287 B | **23,377 B** | 452 |
| same setup, run B | 4,287 B | 6,000-7,200 B | plateaued 60-85 |

Two things to read here. **Without pillars the snapshot grows only ~9% over 11
rounds** (players accumulating spells, items, elements and cooldown keys) — so
the answer to "what else grows?" is: almost nothing. And the pillar count is not
monotonic in general: fireballs smash pillars, so whether a game reaches 450 or
plateaus at 80 depends on where they get placed. Both runs are honest; the
late-game bandwidth is somewhere between 2× and 7× the round-1 figure.

### 2c. A player who could not keep up was queued, never dropped

There was no `bufferedAmount` check anywhere. Against a real server, two clients
in a live battle, one stops draining its socket for 10 s:

```
during the 10 s stall: fast client got 229 snapshots, slow client got 0
after resuming, the slow client immediately drained 150 queued snapshots
```

Nothing was discarded. A link that is merely *too slow* does this continuously:
the queue grows, never drains, and the client renders state that is seconds old
in bursts. That is the reported symptom, and it explains the asymmetry —
downlink is per-friend, so the one below the (rising) threshold falls off a
cliff while the other notices nothing.

## 3. The fix, and what it measures

Four changes, each independently revertible:

1. **`perMessageDeflate` on** (`server/index.js`; `WS_DEFLATE=0` reverts).
2. **Delta-coded state** per connection, reusing `shared/snapdelta.js` through
   the new `shared/snapwire.js`. Opt-in via `join {dv:1}`, so a stale cached tab
   still gets whole snapshots — it degrades in bandwidth, never in correctness.
3. **Events on their own message** (`{t:'evt'}`), which is what makes the state
   droppable — a lost death is a lost kill cue, so events are never skipped. A
   pre-21.10 client keeps them inline, and its snapshots are then never skipped.
4. **Skip, don't queue**, for a connection that is falling behind, plus an
   **adaptive interpolation delay** in the client so fewer updates read as
   coarser motion instead of freeze-and-jump.

`tools/slowlink.js` is the instrument: a real server, 3 normal seats plus one
throttled seat, everyone spamming Stone Pillars, four wire configurations in
sequence with the same cast order. 30 s per configuration, thin seat at
**20 KB/s**, ~18 pillars reached. "behind" is how far behind the live game the
thin seat's newest state was; the send rate is 15 Hz, so ~15-16 Hz applied means
keeping up:

| configuration | full seat | thin seat | thin seat behind (avg / worst) |
|---|---|---|---|
| neither (the round-21.9 build) | 53 KB/s, 16.0 Hz | 20 KB/s, **6.3 Hz** | **10.06 s / 19.20 s** |
| permessage-deflate only | 1 KB/s, 16.0 Hz | 1 KB/s, 16.0 Hz | 0.00 s / 0.07 s |
| delta snapshots only | 6 KB/s, 16.0 Hz | 6 KB/s, 16.0 Hz | 0.02 s / 0.20 s |
| deflate + delta (shipped) | 1 KB/s, 16.0 Hz | 1 KB/s, 16.0 Hz | 0.00 s / 0.07 s |

And starved *below* what even the compressed stream needs — the same lab at
**0.5 KB/s**, which is the case the skip logic exists for:

| configuration | thin seat applied | thin seat behind | states skipped on purpose |
|---|---|---|---|
| deflate + delta (shipped) | 10.4 Hz | 0.38 s avg / 1.27 s worst | 163 |
| neither | **0.0 Hz** | never received a battle state at all | 0 |

Live confirmation on a healthy 4-seat lobby through a real browser: a delta
state message is **246 bytes** on the wire where the full snapshot was ~3,100,
and the client's interpolation delay stays at its 131.7 ms baseline (the
adaptive path is inert until snapshots actually get sparse).

## 4. Scars this round earned

- **`bufferedAmount` is blind.** The first version of the skip used it and never
  fired once: the throttled seat ran 19 s behind while Node's write queue stayed
  at 0, because ~1 MB sat in the kernel send buffer where neither Node nor `ws`
  can see it. The working signal is an application-level ack (`{t:'ack', q}`).
- **The absolute backlog is not the signal either.** Sent-minus-acked sits at
  RTT × 15 Hz even on a perfect link, so a distant friend on a fat pipe would be
  throttled for being far away. A congested pipe's backlog *grows*; a merely
  distant one's is a constant offset — hence the "floor" baseline.
- **The ack cadence must be faster than the lag limit.** Acking at 2 Hz with a
  6-state (400 ms) limit made the sender throttle *everybody*, including
  unthrottled seats: the ack interval itself looked like a backlog.
- **A new socket restarts the sequence at 1.** Any decoder still holding the old
  session's cursor rejects every message as stale, permanently. Every transport
  and the harness client reset the sink on (re)connect.
- **A lab must not print "no data" as zero.** The starved raw run showed
  "0.00 s behind" because it never received a single battle state to compare —
  the best-looking number in the table was the worst outcome in it.
