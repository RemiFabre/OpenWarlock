# Notes for Remi — OpenWarlock & the open web MOBA

*Rounds 21.0-21.4, 2026-08-10. Your overnight rulings, applied. Round 20's notes
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

## Round 21.2 — pillars are forever, and the arena grows with the lobby

- **Lava never destroys a pillar.** Stones stay solid out in the lava (the
  arena's own ring included) — no more melting stubs. Only a terra-lv3
  Demolisher fireball breaks one.
- **A placed pillar survives every later round, for the whole game.** Each round
  re-deals the arena's default ring and keeps everything anyone raised before,
  with **no cap**: a long game silently turns into a maze. Their old 10/16 s
  timer is gone, so pillar lv2 now buys cooldown only. Counterplay is lightning,
  Nova, Blink, portals and terra 3, exactly as you said.
- **Arena area per player is constant above 5 seats.** 5 players = today's arena
  (radius 56); below 5 nothing changes; above it radius = 56 × √(n/5) — 6
  players 61.3, 8 players 70.8. Frozen at game start from the seats then
  (humans + bots — someone joining mid-game never resizes a live arena).
  Everything sized off the arena follows: spawn ring, the lava's closing speed
  (a round still lasts the same time), the four portals, the default pillar ring,
  the camera.
- **Bot smoke**: 60-game arena runs at 4 and 8 players both finish with sane
  kills (top killer 15.7 / 16.1, nobody hits the 25-round cap). ⚠ One thing to
  know: bots never *buy* pillars today, but if I hand every bot a lv2 pillar the
  game becomes a fortress — 25-round caps, ~4-5 kills, 400-750 stones standing.
  That is the ruling working as designed, not a crash; worth a human playtest
  before we teach bots to buy it.

## Round 21.3 — TEAMS in normal games

A lobby property, not a mode. **Every player has a team number, and the default
is their own** — a lobby nobody touches is exactly today's free-for-all.

- **Pick your own number** in the lobby (small `team [1]` selector on your row).
  You can also set the **bots'**, so one person can arrange a 2v2 alone. Any
  shape works: 2v2, 3v2, 2v1v1. Your team survives "play again" and a reconnect.
- **Teammates' spells ignore each other completely** — your ball flies *through*
  them (no damage, no push, no frost/gale/malady/midas/anger, no Switcheroo hook,
  no shield reflect), your Bomb/Meteor/Lightning/Repulse/Rush skip them, and
  their Mirror Wall lets your shots pass. **Pillars still block everyone** —
  they're the map. There is no way to hurt a teammate, so there is no team-kill
  rule at all.
- **The round ends when the survivors are all one team**, and **every** survivor
  banks the +2 round-win gold.
- **The game ends when a team's summed kills reach 15 × its size** — the average
  per player stays 15. At the 25-round cap the best kills-per-member wins (my
  interpretation of "highest sum/size", commented in the code).
- **On screen**: allies wear a ring in the team colour in the arena, the corner
  board and the shop scoreboard are banded per team with `kills / target`, and
  the banner says "Team 1 takes round 3". Solo lobbies look exactly as before.
- ⚠ **N-vs-1 can't be won on kills**: 3v1 always runs to the 25-round cap,
  because three players sharing one victim can never reach 45 kills — the cap's
  kills-per-member tie-break decides it. 2v2 and 2v1v1 finish normally (20/20
  bot games, ~18 rounds). Say the word if you'd rather a lopsided team's target
  was capped by how many enemies exist.

## Round 21.4 — a NEW spell: Statue 🗿, the golden pillar

Cast on yourself, instant. For **2 seconds** you become a golden stone pillar:
you take **zero** damage from everything (balls, Lightning, Meteor, Bomb, lava,
sickness ticks), **nothing can push you**, nothing applies to you (frost, gale,
Malady, Anger), and **terra 3 does not smash you**. Your body **blocks balls
like a real pillar** — they explode on you for nothing, so you are cover for
whoever stands behind you. You cannot move and you cannot cast; the whole price
is that you are rooted and unmissable, and the enemy can pre-place a Meteor or a
bolt on the spot you have to walk out of.

- **Cost 10 g, upgrade 5 g** (your 8/10/12 rule, medium tier). ⚠ Your voice note
  said "a Tangle purchase" — I read that as **"a ten-gold purchase"**. Say the
  word if it meant something else.
- **The duration never levels** (your call): lv2 buys **cooldown only, 16 → 12 s**
  — Blink's pair, and a hair longer than Shield's 15/12 since this is total
  immunity rather than a reflect.
- **A Switcheroo bolt fizzles on you.** It is a projectile, it hits the pillar
  body, it pops — no trade, no stun, their cooldown spent. Same for a boomerang
  or a pierced ghost ball: cover, not a window.
- **Casting it reveals you** if you were invisible (the existing any-cast rule) —
  and during it you are the most visible thing on the map, by design.
- **Name**: you said "Stasis" and invited better, so it ships as **Statue** — our
  spell names are plain things (Fireball, Blink, Mirror Wall) and "statue" is
  literally what you become, without the League echo. Alternates if you prefer
  one: **Stasis**, **Monolith**, **Gold Rush** (pun, probably too cute). Renaming
  is one line.
- ⚠ **The 🗿 moved**: it is Statue's now, and the Stone Pillar took 🏛️ (two
  spells cannot share an icon). One-line revert if you hate it.
- **Key**: `A` on QWERTY, `Q` on AZERTY — the same physical key, left of the
  pillar's S. Rebindable like everything else.
- **Bots**: they can pilot it — hurt (under half HP), a ball about to land, and
  standing far enough inside the ring not to surface in the lava. 8 bot games:
  215 casts, games still finish in ~15 rounds.

## Still waiting on you

Echo (ex-Mosquito) pair feel in human hands, anger's strength, sword-by-structure,
whether the chronomancer CDR family's 7th-of-30 is where you want it, the cape,
and names for Bomb 💣 and Nova 🧨.
