# BRIEF — the friend's lag: what we measured, what we still don't know

*2026-08-13/14. Written for the agent who will implement the next step under
Remi's supervision. Everything here is measured today unless marked ESTIMATE or
UNKNOWN. Read `AGENTS.md` and the CONTEXT POLICY first.*

**Status: the mechanism of the jerk is identified and measured. The reason it is
worse late in a game is NOT explained.** Do not start coding until you have
answered §7 Q1 or explicitly agreed with Remi to proceed without it.

---

## 1. The symptom

A friend playing over 📡 Host online (browser-to-browser WebRTC, Remi's tab
hosts) reports the game is "jerky, like low freq". Present for days across
several attempted fixes. **Fine in early rounds, bad in later rounds.** A second
friend on the same host was fine. His ping looks normal to him.

Round 21.10 shipped five changes for this (deflate on the ws path, delta coding,
event split, skip-don't-queue, keyframes onto the reliable RTC channel). **The
symptom came back.** Two of those five do nothing on the RTC path by
construction — see `docs/history/2026-08-12-snapshot-bandwidth.md` §3b.

## 2. The first live measurement (2026-08-13)

Both players ran a recorder in the browser console for ~2 minutes of real play.
`updates/s` = snapshots the client actually received per second (nominal 15).
`renderDelay` = how far in the past the client draws the world, in ms.

| | Remi (host tab) | friend (guest) |
|---|---|---|
| updates/s — min / avg / max | 12.9 / **14.1** / 15.0 | 12.1 / **14.1** / 16.7 |
| renderDelay ms — min / avg / max | 131.7 / **138.7** / 153.0 | 152.3 / **206.6** / 478.7 |

**The friend receives exactly as many updates as the host — 14.1/s, identical.**
He is not losing updates in volume. Bandwidth is not the proximate cause.

Inverting `renderDelay = gapEst × 1.6 + 25` gives the gap between snapshot
arrivals each client actually observed:

| | typical gap | worst gap |
|---|---|---|
| nominal at 15 Hz | 66.7 ms | — |
| Remi | 71 ms | 80 ms |
| **friend** | **113 ms** | **284 ms** |

⚠ Remi's tab is the host, so its snapshots never cross the network. His row
proves the engine ticks steadily; it does **not** prove his outbound send pacing
is smooth. It is not a network control.

## 3. The mechanism (confirmed in code)

`client/main.js:468-475`:

```js
gapEst = Math.max(at - prev, gapEst * 0.92);
renderDelay = Math.min(600, Math.max(131.7, gapEst * 1.6 + 25));
```

- `renderDelay` is the playout buffer. `BASE_DELAY` = 131.7 ms, `MAX_DELAY` = 600.
- `main.js:483`: `const rt = now - renderDelay;` — used raw, nothing smooths it.
- `main.js:489`: on underrun `k` clamps to 1 → **the world freezes** on the last
  snapshot. There is no extrapolation.
- **There is no client-side prediction.** Every player including yourself is
  drawn from server snapshots, so `renderDelay` is felt as input lag.

`gapEst` is a peak-hold: it jumps instantly to the worst gap and decays 8% per
snapshot. On a jittery link new peaks arrive before the decay finishes, so it
never settles. Consecutive seconds from the friend's trace: `202 → 443 → 199`
and `166 → 479 → 193`.

A +313 ms step in `renderDelay` moves `rt` **backward 313 ms in one frame**: the
world visibly rewinds a third of a second, then fast-forwards as it decays back.

> **His link supplies ±100–200 ms of jitter; our code converts it into ±313 ms
> of rewind. The trigger is his, the jerk is ours.**

## 4. Eliminated — do not re-investigate without new evidence

Each was measured today and found not to be the cause. Three were my own wrong
theories from this session.

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Pillar list growth | **NO** | 6 pillars in a normal game, 0.3 KB, 0.1% of state. Remi confirms they don't spam pillars. |
| `game.events` unbounded growth | **NO** | Drained every broadcast by `pushSnapshots()` (`engine.js:344`). My first harness never called it — the growth was the instrument. |
| Hot spare (whole room, every 2 s, `transport.js:180`) | **NO** | 3.2 KB flat over a 10-min game = 1.6 KB/s. Structurally ugly (no backpressure, reliable channel, consumed by nothing but `test/rtc-host.js` — host migration is unimplemented) but far too small to matter. |
| Client memory / DOM / framerate | **NO** | Round 21.10: flat 9.5 MB over 9 rounds. |
| Server-side simulation cost | **NO** | 0.90 ms per broadcast building 9 per-viewer snapshots, against a 66.7 ms budget = 1.4%. |
| Bandwidth volume to the guest | **NO** | He receives 14.1 updates/s, same as the host. |

## 5. Sizes and cost (measured, real engine + real `snapwire` framing)

Snapshots are **per-viewer** (private element stacks, Vanish masking), so the
host pays separately for each guest and cannot share one blob between them.

Per guest, per snapshot, during a live fight:

| seats | full snapshot | delta (steady state) |
|---|---|---|
| 4 | 3,603 B | 540 B |
| 6 | 5,105 B | 717 B |
| 8 | 6,618 B | 920 B |
| 10 | 8,110 B | 1,073 B |

Host **upload** at 15 Hz (this is the only bottleneck; each guest's download is
1/Nth of it):

| lobby | full keyframes, raw | full keyframes, compressed | deltas (today) |
|---|---|---|---|
| 4 players | 1.30 Mbps | ~0.33 | 0.24 |
| **6 players** | **3.06 Mbps** | **~0.61** | **0.53** |
| 8 players | 5.56 Mbps | ~0.94 | 0.96 |
| 10 players | 8.76 Mbps | ~1.39 | 1.45 |

Compression ratio measured on real snapshot strings with `deflate-raw`,
independent per message (no shared dictionary): **16–25% of raw**, better at
larger lobbies. Compute cost per 8 KB snapshot: **compress 0.011 ms, decompress
0.005 ms** (node zlib — see §6 caveat).

**Transmit time is the real latency term, and it has a cliff.** Pushing 9 guests'
snapshots out the host's uplink, against a 66.7 ms broadcast interval:

| uplink | raw | compressed |
|---|---|---|
| 5 Mbps | **116.8 ms — exceeds the interval** | 18.7 ms |
| 10 Mbps | 58.4 ms | 9.3 ms |
| 20 Mbps | 29.2 ms | 4.7 ms |

Remi is right that this is not a "saving some delay" question: once transmit time
exceeds the broadcast interval, the queue grows every broadcast and never drains.
**It is a hard capacity limit, not a gradient.** That is the round-21.10 bug
reproduced by lobby size instead of by pillar count.

## 6. Latency budget — why it is ~200 ms and not ~30 ms

Remi expected ~30 ms and reasoned that peer-to-peer must beat a central server
because there is one hop fewer. **The hop reasoning is correct. The 30 ms is
not, and the gap is our own design, not the network.**

One guest, healthy link, 10-player lobby:

| stage | ms |
|---|---|
| waiting for the next broadcast (avg half of 66.7) | ~33 |
| building + serializing the snapshot | 0.1 |
| compress | 0.011 |
| pushing bytes out the uplink (10 Mbps, compressed) | 9.3 |
| network propagation, one way | 10–30 |
| decompress | 0.005 |
| **playout buffer (`renderDelay`)** | **131.7 healthy, 207 on his link** |
| waiting for the next drawn frame at 60 fps | ~8 |
| **total** | **~190–280 ms** |

Two thirds of it is buffering we chose. The structural difference from a game
like League is **not** the server hop — it is that they run a higher tick rate
and, decisively, **client-side prediction**, so your own actions are instant and
only other players are interpolated. We have none, so every one of your own
inputs waits the full budget. At 15 Hz we also pay 33 ms of interval wait and
need a larger buffer (`BASE_DELAY` is derived from the interval: `interval × 1.6
+ 25`).

⚠ ESTIMATE: compression timings are node's zlib. The browser's
`CompressionStream('deflate-raw')` is async and stream-shaped, so per-message
setup probably dominates the 0.011 ms of real work — call it 0.05–0.5 ms,
still 2–3 orders below the buffer. **Measure it in a real browser before writing
it down as fact.**

## 7. Open questions — Q1 blocks everything

**Q1. Why is it fine early and bad late? THIS IS UNEXPLAINED.** Remi asked
directly whether the data we send grows. Measured: a full 10-seat game to its end
(round 11, 99 kills, bots shopping — verified they bought boots/sword to level 3)
grows the snapshot from **7,747 B in round 1 to 9,702 B in round 11 — only
1.25×**. That is nowhere near enough to flip a link from fine to unplayable.
So either:
- (a) the asymmetry is time-based, not round-based — something that degrades over
  minutes on his machine or his wifi (power management, thermal, other traffic),
  or
- (b) something grows that this measurement does not capture — a real human game
  with more spells, Decoy clones, mines, walls, and Echo pairs may churn far more
  than bots that mostly buy boots and sword, or
- (c) the effect is in the *variance* of the stream rather than its size, and the
  peak-hold amplifier makes a mild increase in churn feel like a cliff.

**The measurement that answers it:** have the friend run the recorder again with
the round number tagged, for a full game from round 1 to the end. If
`renderDelay` is flat early and thrashing late, the cause is in the game state.
If it thrashes from round 1 and he simply notices it more later, the cause is his
link and the asymmetry is perceptual. This is one game's worth of effort and it
decides the whole approach.

**Q2. Is the jitter his wifi or the host's send pacing?** The data cannot
separate them (§2 caveat). Evidence for wifi: he loses **no** updates but they
arrive clumped, which is the signature of link-layer retransmission — wifi retries
rather than drops, so packets arrive late instead of missing. Evidence against
wifi being the whole story: a second friend on the same host was fine, but
host-induced jitter would hit both. UNKNOWN: Remi's actual uplink speed — needed
to evaluate every option in §8.

**Q3. Were the 21.10 changes worth it?** Honest answer: on the ws path yes
(measured 6.3 Hz → 16.0 Hz for a throttled seat). On the RTC path the friend
actually plays, deflate and delta coding bought **zero** by construction, the
keyframe reroute helps only above ~5% packet loss, and the adaptive render delay
is now the prime suspect for the current symptom. The next change should not
ship without a measurement that would have caught this one.

## 8. Options

**A. Slew-limit the render delay** — split target from actual, walk toward the
target at ~20%/s up and ~5%/s down instead of stepping; replace the peak-hold
with a sliding-window max over ~3 s. Fixes the amplifier. **No latency cost, no
protocol change, one-line revertible.** Does not fix the underlying jitter.

**B. Keyframes only, drop deltas** (Remi's proposal) — `createSnapWire({delta:
false})`. Removes base dependency, orphaned deltas, recovery requests and the
2 Hz rate limit. ⚠ **Requires flipping the routing at `transport.js:209-212`:
when every frame is self-contained they must all go on the LOSSY channel** —
leaving them on the reliable ordered one at 15 Hz would head-of-line-block. Costs
1.30 Mbps at 4 players, 3.06 at 6, 8.76 at 10.

**C. Compression** (`CompressionStream('deflate-raw')`, both ends, handshake flag
for old tabs, binary payloads). You do **not** write a compressor. The genuine
annoyances: the API is async/stream-shaped, and it has no `flush()`, so a
long-lived shared-dictionary compressor is not possible without hand-coding
deflate — but the numbers above already assume per-message compression, so the
easy version delivers the full win. ~100–150 lines plus tests. **This is what
makes B affordable at 6+.**

**D. Client-side prediction and/or extrapolation on underrun** — the big one.
Extrapolating ~100 ms on underrun removes the freeze and lets the buffer shrink;
full prediction of the local player removes input lag entirely. Largest win,
largest risk (rubber-banding on direction change), largest scope.

**E. Raise the snapshot rate** (15 → 20/30 Hz) — shrinks both the interval wait
and `BASE_DELAY`, which is derived from it. Multiplies bandwidth proportionally;
only viable together with C.

## 9. Remi's positions and requirements

- **Target: anyone in a group can host 6 players. That is an objective for the
  game to succeed.** 10+ is a luxury. It is acceptable to require that the person
  with the best connection hosts.
  - Measured against that: raw keyframes at 6 players need **3.06 Mbps** upload,
    which "anyone" does not reliably have. Compressed needs ~0.61 Mbps, which
    almost everyone has. **So B alone does not meet the 6-player objective; B+C
    does.** Deltas today already meet it at 0.53 Mbps, but fragilely.
- **First deliverable is a mental model, not code.** Remi wants the current state
  of client-side interpolation explained clearly before any change is proposed.
- **Justify that the change is worth it.** Several changes have already shipped
  without fixing the problem; do not add a sixth on the same basis.
- **Code cleanliness is a first-class constraint.** Complexity in the netcode is
  acceptable *if it is isolated in files that are not read often*, so it does not
  pollute the context of agents iterating on gameplay from player issues.
  `shared/snapwire.js` and `client/transport.js` are the right home; keep
  `shared/sim.js` and `client/main.js` clean.

## 10. What to deliver

1. A clear mental model of the current client interpolation path, in Remi's terms.
2. An answer on Q1, or an explicit agreement with Remi to proceed without it.
3. A recommendation among §8 with the trade-offs stated, measured against the
   6-player objective.
4. A test that would have caught the current bug — e.g. extract the gap tracker
   as a pure function, feed it the friend's measured arrival statistics (typical
   gap 113 ms, spikes to 284 ms, 14.1 updates/s) and assert the per-frame change
   in `renderDelay` stays bounded, that the buffer still covers the gaps, and
   that a clean 15 Hz stream converges to 131.7 ms.
5. The verification ritual in `AGENTS.md` before any claim that it works.

## Repro / instruments

- Live recorder (browser console, host and guest) — logs updates/s and
  `renderDelay`; the source of §2. See the session transcript or rebuild from
  `window.__snapN` and `window.__delay()`.
- `tools/slowlink.js` — bandwidth only. ⚠ **No jitter, no loss, no RTC path**, so
  it cannot see this bug. Extending it with a jitter model would be valuable.
- `test/rtc-host.js` — drives a real host+guest over WebRTC locally.
- Scratch measurement scripts for this brief (sizes, growth, compression) are
  throwaway; re-derive from `createEngine` + `createSnapWire` as shown in §5.
