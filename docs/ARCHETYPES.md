# Strategy roster — draft 2 for Remi's iteration (2026-08-09)

**The goal**: agree on a large roster, then run mass AI games and fit an
**ELO score per strategy** (I'll extend tools/strategy-study.js: random
4-strategy lobbies, Elo fitted from placements — pairwise, not just win%).
Players will later get a curated subset; the roster itself is a measuring
instrument, so MANY entries are fine when each isolates something.

**Notation**: `frost1` = buy frost to level 1; `frost2` = the next level.
Every entry lists the exact buy sequence with levels. After the listed core,
every strategy falls into the same shared everything-else tail (so late-game
convergence is identical and differences come from the core alone).
Elemental mode: everyone starts with fireball lv1 for free (it never levels)
— it is not listed.

**Spells the AI can pilot** (only these may appear in a roster entry):
lightning, boomerang, rush, shield, blink, and meteor (CC-gated: bots only
cast it into a frost stun/heavy slow). NOT pilotable today: Bomb, Switcheroo,
vanish, pillar, wall, repulse — strategies using those can't enter the ELO
pool and live in a small human-only annex at the bottom.

**Your hypothesis under test**: items < elements/mutations, and spell scaling
is unpriced. Family A prices whole systems, family B prices depth-vs-breadth
inside each system, family C prices spell scaling directly, family D are the
play-style archetypes.

---

## Family A — system purity (price each shelf as a class)

- **A1 items-sustain**: amulet1 → sword1 → amulet2 → sword2 → amulet3 → sword3 → cape1 → cape2
  — the item shelf's best self (bot-measured strongest items).
- **A2 items-mobility**: boots1 → treads1 → boots2 → cape1 → boots3 → treads2 → cape2 → treads3
  — the item shelf's utility half.
- **A3 elements-only** (stat axes): ember1 → ember2 → arcane1 → gale1 → terra1 → ghost1 → ember3 → arcane2 → gale2
  — pure fireball-stat scaling, zero items.
- **A4 mutations-only**: anger1 → frost1 → anger2 → frost2 → anger3 → frost3 → malady1 → malady2
  — pure behavior-changers, zero items/stat-axes.
- **A5 spells-only**: lightning1 → boomerang1 → rush1 → shield1 → lightning2 → boomerang2 → lightning3 → shield2
  — the kit shelf as a class (no elements at all).
- **A6 no-elements control** (already in the study): items + spells, elements refused — prices the element shelf by absence.

## Family B — depth vs breadth (inside each system)

- **B1 element-depth**: ember1 → ember2 → ember3 → arcane1 → arcane2 → arcane3 → sword1 → amulet1
- **B2 element-breadth**: ember1 → terra1 → arcane1 → gale1 → ghost1 → ember2 → terra2 → arcane2
  — B1 vs B2 answers "rush lv3 or spread lv1s?" for stat elements.
- **B3 mutation-depth**: anger1 → anger2 → anger3 → amulet1 → sword1 → amulet2 → sword2
- **B4 mutation-breadth**: anger1 → frost1 → midas1 → malady1 → mosquito1 → anger2 → frost2
  — same question for mutations (breadth here also tests cross-mutation synergy).
- **B5 item-depth**: sword1 → sword2 → sword3 → amulet1 → amulet2 → amulet3 → boots1
- **B6 item-breadth**: sword1 → amulet1 → boots1 → cape1 → treads1 → hourglass1 → sword2 → amulet2
  — re-tests the round-15 "breadth beats depth" finding post-reworks.

## Family C — spell scaling probes (your "no idea how to scale spells")

- **C1 bolt-rush**: lightning1 → lightning2 → lightning3 → hourglass1 → hourglass2 → amulet1 → sword1
  — max one spell immediately: is spell depth worth 22 g?
- **C2 bolt-splash**: lightning1 → ember1 → ember2 → amulet1 → sword1 → lightning2 → ember3
  — spell lv1 as a tool, stats do the killing (the control for C1).
- **C3 kit-width**: lightning1 → boomerang1 → shield1 → blink1 → rush1 → ember1 → ember2
  — five buttons at lv1: is width its own power? (vs C1's depth)
- **C4 boomerang-main**: boomerang1 → boomerang2 → boomerang3 → ember1 → ember2 → sword1 → amulet1
  — the forgotten spell, maxed: does anything justify boomerang3?
- **C5 meteor-value**: frost1 → frost2 → frost3 → meteor1 → amulet1 → meteor2 → sword1
  — meteor priced against C6 (identical shell, cheaper bolt).
- **C6 bolt-combo** (= old combo-bolt): frost1 → lightning1 → gale1 → mosquito1 → frost2 → lightning2 → gale2 → mosquito2 → frost3 → lightning3
  — the Chainer order, level-explicit.

## Family D — play-style archetypes (cross-system, the fun ones)

- **D1 Warlord** (raw trades): ember1 → ember2 → sword1 → amulet1 → ember3 → sword2 → amulet2 → arcane1
- **D2 Executioner** (mark hunter): anger1 → boots1 → anger2 → ghost1 → anger3 → boots2 → ghost2 → sword1
- **D3 Tycoon** (income engine): midas1 → mosquito1 → midas2 → hourglass1 → midas3 → mosquito2 → sword1 → amulet1
- **D4 Leech** (sustain stacking): vampire1 → vampire2 → mosquito1 → sword1 → vampire3 → mosquito2 → amulet1 → sword2
- **D5 Plaguebearer** (crowd sickness): malady1 → terra1 → malady2 → treads1 → malady3 → terra2 → amulet1 → treads2
- **D6 Sumo** (knockback war): gale1 → cape1 → gale2 → boots1 → gale3 → cape2 → treads1 → cape3
- **D7 Stormcaller** (cadence): arcane1 → arcane2 → lightning1 → arcane3 → hourglass1 → lightning2 → hourglass2 → lightning3
- **D8 Juggernaut** (defense-first, question H): amulet1 → cape1 → treads1 → amulet2 → sword1 → cape2 → amulet3 → sword2
- **D9 Phantom** (line sniper): ghost1 → ember1 → ghost2 → ember2 → ghost3 → ember3 → sword1 → amulet1
- **D10 Skirmisher** (mobility fights): boots1 → rush1 → ember1 → blink1 → ember2 → boots2 → shield1 → ember3

## Human-only annex (no ELO — you and friends in the 🧪 sandbox)

- **H1 Trickster**: Switcheroo1 → treads1 → pillar1 → Switcheroo2 → vanish1 → boots1 → Switcheroo3
- **H2 Bomber**: Bomb1 → terra1 → Bomb2 → hourglass1 → Bomb3 → ember1 → amulet1
- **H3 Portal Rat**: boots1 → treads1 → boots2 → vanish1 → treads2 → Switcheroo1 → boots3

---

**What the ELO run will tell us, mapped to your questions**: A1/A2 vs A3/A4
prices items-vs-elements directly (your "items are weaker" hypothesis);
C1 vs C2 and C3 prices spell depth; B pairs settle depth-vs-breadth per
system. Caveat carried on every result: bots under-price reactive tools
(shield, blink, boomerang recall) and cluster-dependent value (malady), and
anger saturates every bot instrument — the ELO will be a ranking of what
BOTS can extract, with those blind spots stated next to the table.

Iteration marks welcome anywhere. When you bless the roster, I wire it into
the study, build the ELO fit, and run the tournament.
