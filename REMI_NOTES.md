# Notes for Remi (OpenWarlock & the open web MOBA)

*Round 23.1, 2026-08-14 (your friend's jerkiness: the client-side half, found
and shipped). Round 23 (polish, balance, issue ports, lobby rework) is
archived at `docs/history/2026-08-13-remi-notes-round-23.md`.*

## Your friend's jerk was a REWIND, and it was ours

You two played on the current version and it was still bad for him. That
matters: round 21.11 already fixed the wire (keyframes ride beside the deltas,
the host can no longer go silent for seconds), so what was left had to be on
the drawing side. It was.

**What was happening.** His wifi delivers every update (he gets the same 14.1
per second you do) but in CLUMPS: gaps up to 284 ms in his measured trace,
because wifi re-sends late instead of dropping. The client draws the world a
little in the past, and it sized that "little" by jumping INSTANTLY to cover
the worst recent gap. One 284 ms clump made it jump +313 ms in a single frame,
and the drawn world visibly REWINDS a third of a second, then fast-forwards.
That, over and over, is "jerky, like low freq". His wifi supplies the clumps;
our code turned them into rewinds.

**What I changed (shipped).** The delay now WALKS instead of jumping: widening
runs the world at 0.8x for a moment (invisible), tightening at 1.03x, and the
drawn clock can never move backwards, by construction. On a healthy link
nothing changes.

**The honest cost.** Smoothness is paid in delay on a bad link. In the lab, a
3%-packet-loss wifi player goes from 13 rewinds a minute (4 seconds of
backward motion!) and 2.2 s/min frozen, to ZERO rewinds and 0.3 s/min frozen,
but plays ~0.46 s in the past instead of ~0.19. A healthy link pays ~20-35 ms.
If he now says "smooth but heavy", there are knobs to trade back; tell me the
feel and I tune.

**Anchored, as you asked.** `tools/rtclab.js` now simulates the player's eyes
(rewinds, freezes, felt delay) on top of the wire, and 8 new tests replay his
actual measured trace through the real code; the old behavior fails them, the
new one passes. Full story: `docs/history/2026-08-14-playout-rewind.md`.

## Your two questions from the voice note

- **Prediction: not now.** It fixes baseline delay (which nobody complains
  about), not spikes (his problem), and it is the biggest complexity injection
  into the files we keep clean. Your instinct to keep it simple is right.
- **The delta-burst theory: right mechanism, already half-fixed.** The wire
  side of it was 21.11's fix. I also tested the tempting client-side version
  (hold the burst until its base arrives): it BACKFIRES in simulation, holding
  also withholds the acks and the host thinks the link is dying. Not shipped.

## The one measurement still worth doing

Play one full game with him and run the recorder I'll give you (it now tags
the round number). If the trace thrashes from round 1, "fine early, bad late"
was perception; if it genuinely degrades late on current code, that is new
signal we measure before theorizing. Either way he should FEEL the difference
already: no more backward motion.

## Still waiting on you (carried from round 23)

See the archived round 23 notes for the open list (mine name, sounds, team
kill caps, Switcheroo names).
