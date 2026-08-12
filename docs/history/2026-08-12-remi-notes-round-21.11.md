# Notes for Remi — OpenWarlock & the open web MOBA

*Round 21.11, 2026-08-12, merged to main at your request before tonight's
session. Round 21.10 (the ws-path bandwidth fixes) is archived at
`docs/history/2026-08-12-remi-notes-round-21.10.md`. Full investigation:
`docs/history/2026-08-12-rtc-lag-rootcause.md`.*

## Your friend's lag: found for real this time, and reproduced first

The 21.10 fixes were real bugs but, as that handoff admitted, none of them was
proven to explain HIS session. I built the missing instrument —
`node tools/rtclab.js`, a simulated network (bandwidth, latency, packet loss,
per guest) around the REAL engine and the real wire code — and it reproduces
his exact symptom: a guest on ~0.5 Mbit/s plays perfectly for 14 minutes, then
drops to 2–3 updates a second and drifts 48 s behind, while the other guests in
the same game feel nothing.

Two things caused it, both growing with the pillar list, which is why it only
shows late:

1. **A hidden second stream.** Every 2 s your hosting tab sent EVERY guest a
   complete backup of the room, preparation for a host-migration feature that
   is not built. By round 25 that blob is 40 KB — twice a keyframe — and it
   shared the ordered channel with keyframes and kill events, jamming them
   behind it. Per your call: **deleted entirely** — the migration plan stays
   written in `docs/BRIEF-browser-hosting.md` §B4 and the spare returns with
   the feature, throttled.
2. **Keyframes raced their own deltas.** A delta patches the state right
   before it. The every-2-s keyframe IS one of those states, and it travelled
   on the slow reliable channel — so late-game, the little deltas arrived
   *before the big state they patch*, and your friend's client had to throw
   them all away and live on keyframes alone: 1–2 updates a second, "like low
   freq". Fix: the keyframe now travels ALONGSIDE a normal delta instead of
   replacing it, so the delta chain never has to wait for a big message. If a
   delta is lost, the next keyframe repairs things anyway — no round trip.

After the fixes, the same simulated guest holds 13–14 of 15 updates a second
through round 25, at worst 1.4 s behind for a moment. Two smaller bugs fell
out too (a skip used to *add* an 18 KB keyframe to an already-full pipe, and a
guest waiting for a keyframe could be starved for ~10 s because it had stopped
acking). All four fixes are ~10 lines each; 430 tests green, full ritual run,
a real WebRTC round played.

## Updating your mental model — you asked exactly the right question

Your picture is correct: full state every frame → too big; deltas → small but
each one needs the one before it. Here is the part to add:

- **Fragility is handled by roles, not hope.** Every message is numbered and
  names the state it patches, so the receiver always KNOWS it missed one —
  nothing is silently wrong. The receiver's remedy is "ask for a full"; the
  sender's remedy (when it must drop for a slow client) is nothing at all,
  because a state it never sent is simply spanned by the next delta.
- **A keyframe every ~2 s is the safety net**: whatever was lost, at most 2 s
  later a complete state arrives and everything re-anchors. The 21.11 insight
  is that the safety net must never be *in the way* — it now rides beside the
  stream, not inside it.
- **So deltas did not make the game less robust — the two big blobs did.**
  Everything that broke was a large message (keyframe, backup blob) sitting in
  front of small fresh ones. The deltas themselves were never the problem.

## Tonight, you can finally SEE his link

- Every player now has the **ms badge on the RTC path** too (his own browser
  measures its connection and reports it). If his badge is high or jumpy,
  it's his link; if it's clean and he still lags, tell me — that would point
  at his machine (4K display? another window covering the browser?).
- Your host tab's downloadable debug log now records, every 2 s, how far
  behind each guest is and how much we dropped for them.

## For "host + 6 friends"

Simulated: 6 guests including two bad links — on a normal fibre upload all six
hold 11–14 Hz to round 25 even with 874 pillars. On a 1 Mbit/s upload (old
ADSL) the late game saturates for everyone at once; if that case ever matters,
the next lever is documented in the history file (pillars are 86 % of a
keyframe and change rarely — send them once, not 15×/s).

## Still waiting on you (unchanged from 21.9)

The mine's name; whether the trap should be throwable; the two 21.7 sounds;
capping a 3v1 team's kill target; names for Switcheroo 🎭.
