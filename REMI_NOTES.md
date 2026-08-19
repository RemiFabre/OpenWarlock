# Notes for Remi (OpenWarlock & the open web MOBA)

*Round 24.11, 2026-08-19: your live-play trim after the 08-17 games (midas,
echo, vampire), dictated and shipped as specced. Rounds 23.1-24.10 are
archived at `docs/history/2026-08-19-remi-notes-rounds-231-2410.md`.*

## 24.11: Midas pays a little less, and the coin has a fuse

- `coinChance` [20,32,45]% -> **[20,30,40]%** (your numbers; shop text
  updated to match).
- **Coins melt after 10 s** (`coinLife`, new): you can no longer shoot from
  range and collect on your own schedule; the walk has a deadline. The last
  3 seconds the coin BLINKS, so a vanish never reads as a bug. Uncollected
  coins still die with the round as before.
- Context, from the analysis you asked for on 08-18: your ghost-3 + arcane-3
  game beat the 24.9 napkin because pierce multiplies coin ROLLS per cast
  and a human collects far better than the bots the napkin priced. The melt
  attacks exactly the collect-later half. ⚠ Honest note: income is still
  per-HIT, so the pierce multiplier itself is untouched; if midas still runs
  away live, the structural lever remains one roll per CAST instead of per
  hit (pierce would then buy damage, not income). Not done, your call.

## 24.11: Echo now does what its button says

Your read was exactly right, and it was by (older) design: the trailing ball
of a pair ADVANCES the every-N counter (your "all every-N counters count"
ruling from 20.1), so 24.8's [5,4,3] felt like every OTHER cast doubling at
lv3: normal, double, normal, double. `doubleEvery` is back to **[6,5,4]**:
steady state at lv3 is single, single, pair, i.e. the button's "every 3rd
fireball" is now true from your seat. No logic changed, no text changed,
just the numbers, as you asked. (The very first pair of a round arrives one
cast later than the text implies; every pair after is on cadence.)

## 24.11: Vampire feasts a bit thinner when nearly dead

`lowHpMax` **3 -> 2.5**: a gulp still heals markHeal x 1 to 2.5 linear on
your own missing hp (was 1 to 3). Your diagnosis: endgame forces everyone
into feast range, so the near-death multiplier was the part that
overperformed; the base heal and the mark economy are untouched. Shop text
updated ("up to 2.5x").

## 24.11: Verified

530 vitest green (1 new: the coin melt + the pre-24.11 no-fuse revert path
are both locked). Constants-only otherwise; no wire shape changed (the
snapshot's optional coin `t` field is ignored by old clients, absent from
old servers). No elo rerun: all three changes are your feel calls on
mechanics the bots either flatter (vampire, midas) or cannot express
(the echo cast rhythm); say the word if you want tables anyway.

## Still waiting on you

The 21.9 leftovers (mine throwability, the two 21.7 sounds, 3v1 kill-target
cap, Switcheroo names), the Normal/Hard standoff verdict, whether the demo
Faker returns to fresh lobbies, a feel pass on lava 16 + the treads nerf, a
feel pass on the 24.1 crater sizes and portal cross, the one-game trace with
your friend (23.1), a live feel-check on Blood Debt (still the best
non-Faker purchase on Hard, possibly bot-flattered), the anger bar feel
(does holding a full bar feel like a decision?), whether A4/B4 sitting on
the roster floor bothers you, and NEW: whether the 10 s coin melt feels
like tension or like theft (the blink is tuned at 3 s), and whether midas
needs the structural per-cast roll after more long games.
