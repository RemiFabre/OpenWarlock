# Notes for Remi — OpenWarlock & the open web MOBA

*Round 21.0, 2026-08-10. Your overnight rulings, applied. Round 20's notes
(the mosquito rework + the ELO measurement pass) are archived at
`docs/history/2026-08-09-remi-notes-round-20.md`.*

## Your two rulings — the round-20.4 "fixes" are REVERTED

You said both original behaviours are good physics, so they are back, and both
are now commented as RULINGS in the code with a test each, so no future agent
"fixes" them again.

- **A reflected ball comes back as it was cast.** A mosquito lead ball has no
  knockback; a Magic Shield or a Mirror Wall sends it back still push-less. It
  damages, it does not shove.
- **The trailing twin leaves from where you ARE**, 0.15 s later, on the aim you
  originally cast. If something knocks, portals or blinks you inside that
  window, the second ball really does come from the new spot.

## Repulse: once you start charging, you blow up

Nothing interrupts the wind-up any more. Before, three things quietly defused
it: a frost freeze, a Switcheroo, and stepping into a lava portal. All three
are gone.

- **Frozen solid still detonates** — you blow up where you stand.
- **Switcheroo carries the bomb.** Swap a charging enemy and the blast goes off
  at *your* old position, with you standing there. Both ends keep their charge.
- **A portal takes the bomb to the middle** and it goes off in the center.
- **Only dying defuses it** (my interpretation: "you blow up eventually" needs
  you alive to do it — a corpse cannot explode).

## You can now SEE the blast

The detonation draws a short, bright ring at **exactly** the radius that got
shoved — it snaps out to full size in the first third of its 0.4 s and holds
there, so the circle you see is the circle that hit. Verified headlessly: the
drawn ring measures 9.0 world units for a lv1 Repulse, which is the spell's own
radius. (A blast from a *vanished* caster stays invisible — that is the
existing design, untouched.)

## Switcheroo's stun — longer, and now capped

You said the combo is still too hard, so the reaction padding goes **0.35 →
0.55 s** and there is a new **3 s ceiling** so a freak long trade cannot hold
someone forever. The stun is measured from the distance actually traded, at the
moment of the switch — so if a knockback drags your victim further away while
the bolt is in the air, you get a *longer* stun.

| swapped over | stun |
|---|---|
| 10 units | 1.00 s (the floor) |
| 40 units (full lv1 range) | 1.53 s |
| 70 units (full lv3 range) | 2.26 s |
| 120 units (across the arena) | 3.00 s (capped) |

## Shield now says what it does NOT stop

Hover text: reflects **energy** projectiles — fireballs, boomerangs, Switcheroo
— and holds a Lightning bolt or a Repulse blast; **physical impacts (Meteor,
Bomb) go straight through it**.

## Round 21.1 — prices and one rename

- **Spell prices follow your rule**: base = 8 (cheap) / 10 (medium) / 12
  (expensive), every upgrade = half the base (4 / 5 / 6). Pillar is the cheap
  one now (8, 4); Meteor 14 → 12 and Mirror Wall 14 → 12; Repulse 12, 6; the
  10-base spells (lightning, boomerang, rush, Bomb, Switcheroo, Blink, Vanish)
  all upgrade at 5. Blink stayed a 10-base — that was your round-19.1 call, so
  I only halved its upgrade (8 → 5). ⚠ **Fireball untouched**: its base is 0
  (locked at lv1 in elemental), so the tiers don't apply — say the word if you
  want its classic-mode 8+8 moved.
- **Every item is 1 g cheaper per level**: boots / treads / cape 6 → 5, amulet /
  sword / hourglass 8 → 7. The whole item shelf is now 108 g (was 126).
- **Mosquito is now Echo 👯** — display only: name, icon, "Doubled casts." and
  the hover line "Every 6/5/4th fireball you throw is doubled: the lead ball
  hits without pushback so its twin can land too." Nothing about how it plays
  changed, and the internal key stays `mosquito` so old logs still read.

## Still waiting on you

Echo (ex-Mosquito) pair feel in human hands, anger's strength, sword-by-structure,
whether the chronomancer CDR family's 7th-of-30 is where you want it, the cape,
and names for Bomb 💣 and Nova 🧨.
