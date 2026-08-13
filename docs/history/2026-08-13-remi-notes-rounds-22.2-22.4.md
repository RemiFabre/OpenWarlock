# Notes for Remi — OpenWarlock & the open web MOBA

*Round 22.2 → 22.4, 2026-08-12 (your first-game feedback, then the shop/Tab
pass, then the ice rework). Round 22.1 is archived at
`docs/history/2026-08-12-remi-notes-round-22.1.md`.*

## 22.4: the ice

- **The shared-stacks bug was real, and it was the shield.** Stacks were
  always private per attacker, but a reflected ball (Shield or Mirror Wall)
  changed hands entirely, so its frost rider planted stacks under the
  REFLECTOR's name. Reflect a frost player's balls and their element fed your
  own freeze counter. Now a ball's riders stay keyed to whoever owns the
  element (damage and kill credit still go to the reflector, per your
  round-21.0 "reflect the ball as it was" ruling). Test-locked.
- **Stack fade, exactly as you specced**: frost, gale and malady piles lose
  one stack after 9 unfed seconds, the clock restarts after each loss, and
  landing that element again resets it. Each attacker's pile fades on its own
  clock. Midas marks and anger claims don't fade (different rhythms). The
  knob is `STACK_DECAY` in constants.js if 9 s needs tuning after play.
- ⚠ The old frost/gale/malady lab numbers and the ELO table predate the fade.

## 22.3: shop fits one screen, scoreboard on Tab

The top stats table is gone; hold **Tab** (shop, countdown or battle) for the
live standings. The whole shop now fits with zero scrolling at normal window
sizes. Level pips replace the grey "lv N" text, names hold one line
(Hourglass and Health Amulet got shorter), tooltips no longer flicker.

## The invisible-purchase bug: found, and it was a good one

Your guests' gold moved but their boots stayed lv 1. Root cause: the game's
snapshot hands the delta encoder the sim's LIVE objects (items, spells,
elements), and the encoder remembered "what I last sent" by reference. A buy
mutated that shared object, so the encoder's memory of the past changed with
it, and the diff concluded nothing changed. Gold is a plain number (copied
each frame), which is exactly the asymmetry you saw. The bug is as old as the
delta wire but was masked: the every-2-s keyframe silently resynced everyone.
The 21.11 echo change made healthy links drop those keyframes as duplicates,
and the staleness became permanent. Fix: the encoder deep-copies its base (a
few KB per frame, nothing). The regression test round-trips through real JSON,
because the in-memory version of the same test passes even on broken code.

## Your three asks

- **Level pips**: every shop card has a thin bar along its bottom edge, one
  cell per level, owned cells lit green. Level 0/1/2/3 at a glance for spells,
  elements and items.
- **↩ Undo** next to Pause: refunds your last purchase, repeatable back to the
  start of THIS shop. Buys from earlier rounds are final (the stack is wiped
  when the round starts). It restores the whole pre-buy state, so side effects
  like the amulet's max-HP reverse exactly (test-locked).
- **Instant Continue**: clicking Continue puts YOU in the lobby immediately.
  The others keep reading the standings (their screen pins the table until
  they click too); the old 45-second wait-for-everyone is deleted.

## And the em dashes are gone

All ~1,690 of them, everywhere outside the append-only archive: full stops or
brackets instead, judged one by one (data separators became "·"). The rule is
in AGENTS.md and in my persistent memory, so they stay gone.

## Still waiting on you

The 21.9 leftovers (mine throwability, the two 21.7 sounds, 3v1 kill-target
cap, Switcheroo names), the Normal/Hard standoff verdict, and whether the demo
Faker should return to fresh lobbies.
