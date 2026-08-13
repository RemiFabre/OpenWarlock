# 2026-08-14: the playout rewind: the client-side half of the friend's lag

*Follow-up to `docs/history/2026-08-12-rtc-lag-rootcause.md` (round 21.11,
which fixed the WIRE half: echo keyframes, skip-spanning deltas, the
requested-keyframe deadlock bypass, hot spare deleted). This session found the
remaining PLAYOUT half, staged a fix behind a one-line flip, and taught
tools/rtclab.js to price it. No game behavior changed in this commit.*

## The measured symptom (2026-08-13, live recorder, both players)

A friend on 📡 Host online reports "jerky, like low freq", fine early and bad
late. Both players ran a console recorder for ~2 min of real play.
`updates/s` = snapshots applied per second (nominal 15). `renderDelay` = how
far in the past the client draws, ms (healthy 131.7).

|            | Remi (host tab) | friend (guest) |
|---|---|---|
| updates/s avg | 14.1 | 14.1 (identical: volume is NOT the problem) |
| renderDelay avg / max | 138.7 / 153.0 | 206.6 / 478.7 |

Inverting `renderDelay = gapEst*1.6+25`: his link delivered clumps with
arrival gaps to 284 ms. Consecutive seconds of his renderDelay: 202 → 443 →
199 and 166 → 479 → 193.

## The mechanism (client/main.js, now createGapTracker mode 'step')

`gapEst` was a peak-hold (jump to the worst gap, decay 8% per snapshot) and
`renderDelay = clamp(gapEst*1.6+25)` was applied INSTANTLY to the drawn clock
`rt = now - renderDelay`. One 284 ms arrival gap therefore steps renderDelay
+313 ms in ONE FRAME, which rewinds the drawn world a third of a second, then
fast-forwards as the estimate decays. His wifi supplies clumped arrivals
(link-layer retransmission: nothing is lost in volume, it arrives late); our
playout converts each clump into a visible rewind. On a jittery link new peaks
arrive before the decay finishes, so it thrashes forever.

## The fix (staged): mode 'slew' in createGapTracker (shared/snapwire.js)

The gap estimate becomes a sliding-window max (3 s, so one spike stops
poisoning it), and the applied delay WALKS toward the target: at most 200 ms/s
up (playback briefly at 0.8x, invisible) and 30 ms/s down (1.03x). The drawn
clock never jumps backward by construction. `test/gaptrack.test.js` replays
the friend's measured arrival pattern: step mode rewinds >250 ms in one frame
(the test that would have caught it before shipping), slew never moves the
clock backward, still covers the spikes, and forgets an isolated one.

## Priced in tools/rtclab.js (now runs the playout layer, `--tracker=`)

6 sim minutes, real engine, guests fiber 0.3% loss / cable 1% / wifi 3%,
identical wire numbers in both runs (the tracker is playout-only). rew =
drawn-world rewind events per battle-minute / ms rewound; frz = ms per
battle-minute with nothing new to draw; delay = avg renderDelay (input lag).

| guest | step: rew /ms | step frz | step delay | slew: rew | slew frz | slew delay |
|---|---|---|---|---|---|---|
| fiber 0.3% | 0.6 / 221 | 112 | 134 | **0** | 112 | 168 |
| cable 1% | 3.4 / 1258 | 675 | 149 | **0** | 412 | 279 |
| wifi 3% | 12.9 / 4048 | 2211 | 193 | **0** | 337 | 465 |

The trade: slew removes every rewind and most freezes, and PAYS in input lag
on lossy links (the window max holds coverage of recurring spikes). Knobs
exist (windowMs, slewUp/slewDown) if Remi's feel test wants it tighter; the
1.6x target multiplier is inherited from step and is the next tuning lever.

## Q1 from the brief ("fine early, bad late"): where it landed

The 21.11 wire fixes (echo keyframes, skip-spanning) removed the mechanisms
that GREW with the game. What remains is his link's jitter feeding the step
tracker, plus phase-change keyframes (forced fulls have no echo and still race
their deltas on a lossy link, bounded by the 500 ms request limit). The
decisive instrument is unchanged: a round-tagged recorder run over one full
game with him. If renderDelay thrashes from round 1 the asymmetry was
perceptual; if it worsens late on CURRENT code, measure before theorizing.

## Session note: the stale-clone detour (for the record)

This machine's clone was 119 commits behind origin (round 21.10-era) for most
of the session. On that old code the session independently found and priced
the ack-starvation deadlock (one keyframe stall discarding >6 deltas locked
the host into ~90 skipped states = a 6.3 s freeze) that round 21.11 had
already found via rtclab and fixed with the requested-keyframe bypass
(`behind && !wantFull`); it also prototyped an `ackReceived` sink option
(ack what is RECEIVED, not applied) as an alternative deadlock cure, dropped
as redundant, and a keyframes-only+compression comparison. That work sits
unpushed on branch `jitterlab-port` if the design ever wants it. Lessons that
survive: git fetch BEFORE reading the entry set, and "hold the delta burst
client-side" BACKFIRES (holding withholds acks, which the backpressure logic
reads as a dying link).

## Also decided

Client-side prediction: recommended NO for now. Healthy links already feel
great (Remi's own report), prediction fixes baseline lag rather than spikes,
and it is the largest complexity injection into the files kept clean for
gameplay agents. Revisit only if players complain about the ~140 ms feel.

## The flip, when Remi says go

`client/main.js`: `createGapTracker({ intervalMs: 1000 / SNAPSHOT_RATE })`
gains `mode: 'slew'`. One line, one-line revertible.
