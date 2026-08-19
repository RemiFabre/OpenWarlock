# Notes for Remi (OpenWarlock & the open web MOBA)

*Rounds 24.13 + 24.14, 2026-08-19 evening (24.12, same day, is archived at
`docs/history/2026-08-19-remi-notes-round-2412.md`): the anger cadence buff
you asked for, and the refresh-lag hunt from game night.*

## 24.13: Anger marks come faster (your buff, hand-computed)

Your call: the held charge made the bank harder to cash, so the mark reward
gets better. `markEvery [36,27,20] -> [27,20,15]`. Same 1/x rule, same
+35% rate per level, re-anchored at lv3 = 15 s (your number): 15 x 1.35 =
20.25 -> 20, 15 x 1.35^2 = 27.3 -> 27. One-line revert: [36,27,20].
UNMEASURED (your feel call; say the word if you want an elo run on it).

## 24.14: The refresh lead, hunted (game-night lag)

Your observation (both guests lagged, both improved after refreshing) says
the rot lives in state a refresh resets. What I found, full report in
`docs/history/2026-08-19-refresh-lag-investigation.md`:

- **Our own per-connection code does NOT rot**: a 25-minute rtclab run
  (real engine, real wire, shipped slew tracker) shows a lossy-wifi guest
  playing the same at minute 24 as at minute 2. Client arrays are all
  capped (audited). The 21.11/23.1 fixes hold.
- **One thing DID grow all game**: the every-2-s echo keyframe rides the
  reliable ORDERED channel and carries the whole state, so it grew ~5 KB ->
  ~40 KB as pillars/craters piled up. On an ordered channel one lost chunk
  stalls every event behind it, and on real WebRTC repeated loss on
  ever-bigger blobs collapses the connection's SCTP congestion window,
  which is EXACTLY what a refresh resets. Best mechanical fit for "fine
  early, laggy late, refresh helps".
- **The fix**: the echo cadence now stretches to hold a byte budget
  (~2.5 KB/s; early game unchanged, late game a 40 KB keyframe ships every
  ~16 s instead of every 2 s). Gap recovery is untouched (a guest that
  misses a delta still demands a keyframe immediately; that round trip was
  already faster than the old cadence). Measured: late-game reliable-channel
  load cut 2-3x, guest Hz/delay/freezes unchanged-to-better.
- **What I cannot see from here**: real SCTP congestion state and browser
  heap/render decay. So the game now self-instruments: every 5 s each RTC
  guest reports renderDelay / gap / applied Hz / JS heap to your host tab's
  journal, beside the per-guest wire stats.

**Your one job next laggy game: press the ⬇ log button BEFORE closing the
host tab.** That file now contains per-guest lag timelines, including the
exact moment someone refreshes and which numbers step down when they do.
That settles the remaining suspects with data instead of theory.

## 24.13/24.14: Verified

533 vitest green (the new one: a growing keyframe stretches the echo cadence,
floors at the configured cadence, caps at ~20 s). rtclab 25-min before/after
(the fix's table is in the history doc), slowlink 20 s, client-robustness
chromium+webkit, solo-static, rtc-host e2e, harness bots+coop, arena 4p/8p.

## Still waiting on you

Everything from 24.12's list (held-charge feel at 1.5 s / 5 tiers, +40% size
ceiling, fizzle sound, coin melt feel, midas per-cast question, the 21.9
leftovers, Normal/Hard standoff, demo Faker, lava 16 + treads feel, crater
sizes + portal cross, Blood Debt feel, A4/B4 floor), plus new: anger
[27,20,15] feel (want an elo run?), and the ⬇ log download after the next
laggy RTC game.
