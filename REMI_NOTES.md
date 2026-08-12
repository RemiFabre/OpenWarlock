# Notes for Remi — OpenWarlock & the open web MOBA

*Round 21.10, 2026-08-12. Your friend's late-game lag: found, fixed, measured.
Round 21.9 (the mine, the spoon, the sustain pass, the ELO table) is archived at
`docs/history/2026-08-11-remi-notes-round-21.9.md`.*

## Your friend's lag was our bug, not his PC

**What was happening.** Every snapshot was the *complete* game state, re-sent to
every player 15 times a second, uncompressed — and the biggest thing in it is
the pillar list, which is permanent since 21.2 and was re-sent whole every
single time even though it changes twice a minute. So the stream grows all game:

| pillars on the map | per player, per second |
|---|---|
| 6 (round 1) | 45 KB/s |
| 80 | 92 KB/s |
| 450 (a long pillar-heavy game) | **325 KB/s** |

And when a player's connection couldn't swallow that, **the server queued it
forever instead of dropping anything.** I reproduced it: stall a client for 10
seconds and the server holds all **150** snapshots for it. A link that is merely
*too slow* does that continuously — it falls further behind every second and
never recovers. That is your friend's "everything is jerky, like low freq", and
it is why the other friend was fine: downlink is per-person, so whoever runs out
of headroom first falls off a cliff while everyone else sees nothing.

**It was never his machine.** I checked: over 9 rounds in a real browser the
client's memory is flat at 9.5 MB, its DOM is flat, its framerate is stable, and
the server's simulation runs at 0.07 ms against a 33 ms budget even with 800
pillars on the map.

## What I changed

Your reading was exactly right — we were sending a whole state every time
instead of just what changed. Four things, each revertible in one line:

1. **Compression on.** It was off (the library's default) and snapshots are the
   most compressible thing in the game — repetitive pillar lists squash to 17-21%
   of their size. One option, ~5× fewer bytes.
2. **Only what changed.** The state is now delta-coded per player, reusing the
   encoder your browser-hosting path has had since round 21. Measured live in a
   real browser: a delta state message is **246 bytes**. For scale, a *whole*
   snapshot of a 4-seat game at round 1 is **3,087 bytes**, and 22,159 at 450
   pillars — and the delta barely grows with the pillar count, because pillars
   only cost bytes on the frames where they actually change.
3. **Events ride separately** and are never dropped — a lost death is a lost kill
   cue. That split is what makes the state safe to drop.
4. **Falling behind now drops frames instead of queueing them.** A dropped
   snapshot costs nothing (the next one is complete again); a queued one costs
   latency that never drains.

## Your worry about deltas — you were right, and here is the answer

You said it: with a whole snapshot you can throw any message away, but a delta
**needs the one before it**. That is the real risk in this change, so it is built
around it:

- Every message carries a sequence number and names the base it patches, so a
  receiver *knows* when it lost one instead of quietly applying nonsense.
- **The only party allowed to drop a state is the server**, because it can
  immediately re-base: the moment it skips one, the next thing it sends is a
  complete keyframe. No round trip, no waiting.
- If a message is lost in flight anyway (the peer-to-peer path is deliberately
  unreliable), the client asks for a complete state and gets one.
- A late or duplicated message can never roll the game backwards.
- **A player on an old cached tab is unaffected** — they simply keep getting
  whole snapshots. The client says "I can handle deltas" when it joins; if it
  doesn't say so, nothing changes for it. Mixed versions lose bandwidth, never
  correctness.

There are **23 tests** on exactly these rules, including "lose a packet and the
state comes back *exactly* right, not drifted".

## And the smoothing you asked for

You wanted the drops hidden rather than shown. They are: the client's
interpolation delay now **follows the update rate it actually observes**. On a
healthy link it stays at its old 131.7 ms and nothing changes at all. If the
server starts skipping states for you, the delay widens to match, so you get the
same motion sampled more coarsely instead of freeze-then-jump.

Starved to half a kilobyte per second — far below what the game needs, the case
the drop logic exists for — a player still gets **10.4 of 15 updates a second and
stays 0.4 s behind**. On the old build, at that same rate, they never received a
single battle state.

## The lab, so we never have to guess again

`node tools/slowlink.js` spawns a real server, seats three normal players plus
one on a throttled connection, has everyone spam pillars, and runs all four wire
configurations in sequence. Thin seat at 20 KB/s, "behind" = how far back its
newest state was, 15 Hz = keeping up:

| configuration | thin seat | behind (avg / worst) |
|---|---|---|
| the build your friend played on | **6.3 Hz** | **10.1 s / 19.2 s** |
| compression only | 16.0 Hz | 0.00 / 0.07 s |
| deltas only | 16.0 Hz | 0.02 / 0.20 s |
| both (shipped) | 16.0 Hz | 0.00 / 0.07 s |

`--rate=`, `--seconds=`, `--only=` are the knobs. ⚠ What it cannot see: it runs
on one machine, so bandwidth is the only impairment — no jitter, no packet loss,
and it does not exercise the browser-hosting path.

## Two things for you

- **`/health` now shows the wire per player**: how much is queued for them, how
  far behind they are, and how many states we dropped for them. If someone
  reports lag again, that is the number to look at — and the in-game ms badge
  tells you the same story from the other end.
- **I could not tell which way your friend was connected** (`npm run host`
  tunnel, or 📡 Host online peer-to-peer). Both paths got the fix, but if it was
  peer-to-peer the mechanism was sharper: that channel is deliberately
  unreliable, a big snapshot fragments into ~18 packets, and losing *any one*
  discards the whole thing — so a lossy link there was capped at about **2 usable
  updates a second**. If the jerkiness ever comes back, tell me which one he
  used and I will chase that path specifically.

## Still waiting on you (unchanged from 21.9)

The mine's name, whether the trap should be throwable rather than underfoot; the
two 21.7 sounds; whether a 3v1 team's kill target should be capped by how many
enemies exist; anger's strength (you said it is fine — left alone); and names for
Switcheroo 🎭.
