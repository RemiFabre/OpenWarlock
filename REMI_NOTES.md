# Notes for Remi — OpenWarlock & the open web MOBA

*Round 21.8, 2026-08-11. Your post-playtest brief, applied. Round 21.7 (the key
collision, the rebind menu, the price pass) is archived at
`docs/history/2026-08-10-remi-notes-round-21.7.md`.*

## The Bomb is gone. It is a Mine now.

Press it and a trap drops **where you stand** — instantly, no aiming. ⚠ That is
my reading of "you press the button, it just creates a trap where you are": the
click is ignored entirely. If you meant "throw it a short way", that is one line.

The ring is **1.32 units** — your 65% over the fireball's own 0.8. Bodies are
1.4 wide, so in practice someone trips it from about 2.7 units centre to centre:
close enough to walk onto by accident, far from a zone.

**Feeding it is the whole spell.** Your own fireballs are swallowed by your own
trap: one at level 1, two at level 2. An enemy standing behind your mine is safe
from you until it is full — that is the price you pay for the setup, exactly as
you described it. Enemy balls fly straight over; a full mine lets your own
through again.

**When someone steps on it**: the mine's damage lands first, then every stored
ball erupts into them point blank, **one tick apart** (0.033 s — your "as fast
as possible without being the same tick"; you see two balls, you cannot dodge
between them). Echo's rule handles the push: every ball but the last carries
**zero** knockback, so nobody is shoved out of their twin's path, and the last
one pushes at **max(the ball's push, the mine's)** — never the sum, as you said.

- **10 g, upgrade 5 g. Two levels.** Damage **10 / 15**, push **100**,
  cooldown 9 / 8 s. The level buys the second slot.
- **A Shield on top of it works exactly as you hoped**: the stored balls are
  real fireballs, so they reflect and fly off at whoever is behind — but the
  **ground still hits them** for the mine's own damage. Test-locked.
- **A statue never trips one**, and the mine is not spent — it waits.
- Teammates and you walk over your own traps freely. Mines die with the round.
- The stored ball is *your* ball: ember's damage, malady's sting, frost stacks,
  anger's claim, ghost's passthrough all ride along, because it literally is the
  projectile you fired, kept in a box.
- **On screen**: a thin dashed ring in your colour, a dark stud, and **one ember
  pip per stored ball** orbiting it — "that one is loaded" reads from across the
  arena. Quiet, not a red flare, per your brief.
- ⚠ One consequence worth knowing: standing on your own fresh trap, your **next
  fireball is eaten immediately**. Step off it first, or that is exactly how you
  load it in two seconds. I verified the whole loop in a real browser (plant →
  two balls swallowed → third flies past the full mine → bot steps on it and
  eats 15 + 7 + 7 with one shove).

## Malady is a damage element now

You wanted it to pay off the moment it catches two people, so I inverted it:
the sickness always lasts **4 seconds**, and the levels buy the **bite**:
**1 / 1.5 / 2 damage per tick**. The hover row is renamed "damage per tick", as
you asked, and shows those numbers.

Measured, for once: in the elemental study (120 games × 2 seeds, one element per
seat, Hard bots, 25% = par) malady goes to **2nd of 11 on both seeds** (48.6% and
37.8%), behind only anger's saturated 88-91%. ⚠ Bots never bunch up, so the
contagion half is still under-measured — in your hands it should be stronger.

## The Slow Spoon 🥄

Your friend's idea, your joke, 7 g per level, three levels: **+1 / +1.5 / +2 HP
every time you damage an enemy**, flat, whatever the damage was. One proc **per
victim**, so a ghost-3 ball through three bodies heals you three times, and a
gale/frost utility build finally has sustain that does not scale off damage.

⚠ **Auras and sicknesses pay nothing** — not Malady's ticks, not the Hat of
Aura's burn. That exclusion is the item's whole balance (a burn would pay every
second for free), it is written into the shop text, and it is test-locked.

## Hat of Aura: the burn follows you out

The ring is unchanged; leaving it is no longer an escape. The burn keeps ticking
for **3 / 4 / 5 seconds** after you step out (your second set of numbers, the one
you called more balanced). A burning body wears a faint ember ring so you can see
who is still cooking.

## Meteor

Level 2 damage **24 → 30**.

## Something I found while measuring

`node tools/arena.js --mode=elemental` has been **crashing since round 20** —
BUILDS became objects and the study still read them as lists. So every elemental
element-vs-element number quoted since then came from before the break. Fixed in
one line; the malady figures above are from the repaired instrument.

## What I verified

389 unit tests (13 new ones for the mine, the spoon and the linger), both
harness scenarios, the 2-engine browser test, the reconnect test, 60-game bot
smokes at 4 and 8 seats, and a real browser session driving the mine end to end.
⚠ Your server was running the whole time — nothing I ran touched it.

## Still waiting on you

The mine's name (**Mine** is mine to defend — "elemental mine" felt long; Trap
and Snare are one line), whether the trap should be throwable rather than
underfoot; the two 21.7 sounds; whether a 3v1 team's kill target should be
capped by how many enemies exist; anger's strength (you said it is fine — I have
left it alone); and names for Switcheroo 🎭.
