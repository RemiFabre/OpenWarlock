# Strategy roster — GENERATED from tools/roster.js (edit there, `node tools/roster.js --doc`)

**Goal**: mass AI games, ELO per strategy (random 4-strategy lobbies, Elo fitted from placements).
**Core cost target**: 150-185 g — a bit above the ~145 g an average seat earns in a full game (measured: 13.1 rounds, 9.8 kills/seat), so the uncontrolled everything-else tail almost never runs.
**After the core**: the bot walks the study's shared exhaust list (identical for every strategy), and only when even that is maxed does the in-game random fallback (items, then pilotable spells, then mutations) spend leftovers.
**Fireball**: free at lv1 for everyone in elemental, never levels — not listed.
**Spells bots can pilot** (the only ones allowed here): lightning, boomerang, rush, shield, blink, meteor (CC-gated: cast only into a frost stun/heavy slow). Bomb, Switcheroo, vanish, pillar, wall, repulse are NOT pilotable and are excluded from the ELO pool.


## Family A — system purity (price each shelf as a class)

- **A1-items-sustain** (147 g, ⚠ item shelf EXHAUSTED below the band (round 21.8: the whole item shelf is 147 g)): The item shelf's best self: HP and lifesteal only.
  - order: amulet1 → sword1 → amulet2 → sword2 → amulet3 → sword3 → cape2 → hourglass2 → boots3 → cape3 → treads1 → treads2 → treads3 → hourglass3 → brazier1 → brazier2 → brazier3 → spoon1 → spoon2 → spoon3
  - tests: items as a class (sustain half) vs the element families
- **A2-items-mobility** (147 g, ⚠ item shelf EXHAUSTED below the band (round 21.8: the whole item shelf is 147 g)): The item shelf's utility half: speed, lava, armor.
  - order: boots1 → treads1 → boots2 → cape1 → boots3 → treads2 → cape2 → treads3 → cape3 → hourglass1 → hourglass2 → hourglass3 → sword1 → sword2 → sword3 → amulet1 → amulet2 → amulet3 → brazier1 → brazier2 → brazier3 → spoon1 → spoon2 → spoon3
  - tests: items as a class (mobility half)
- **A3-elements-only** (98 g, shelf exhausts here BY DESIGN): Pure fireball stat scaling, zero items.
  - order: ember2 → arcane1 → gale1 → terra1 → ghost1 → ember3 → arcane2 → gale2 → terra2 → ghost2 → arcane3 → terra3 → ghost3 → gale3
  - tests: the stat-element shelf as a class
- **A4-mutations-only** (130 g, shelf exhausts here BY DESIGN): Pure behavior-changers, zero items or stat axes.
  - order: anger1 → frost1 → anger2 → frost2 → anger3 → frost3 → malady2 → midas1 → malady3 → mosquito3 → midas3
  - tests: the mutation shelf as a class
- **A5-spells-only** (88 g, shelf exhausts here BY DESIGN): The kit shelf as a class: buttons, no elements.
  - order: lightning1 → boomerang1 → rush1 → shield1 → lightning2 → boomerang2 → lightning3 → shield2 → boomerang3 → rush2 → teleport2
  - tests: spells as a class
- **A6-no-elements** (151 g): Items + spells, elements refused: prices the element shelf by absence.
  - order: amulet1 → sword1 → boots1 → lightning1 → amulet2 → sword2 → boomerang1 → cape1 → treads1 → hourglass1 → amulet3 → sword3 → lightning2 → boots2 → boots3 → cape2 → cape3 → treads2 → treads3 → hourglass2 → hourglass3 → brazier1 → brazier2 → brazier3
  - tests: control: what skipping elements costs

## Family B — depth vs breadth, per system

- **B1-element-depth** (153 g): Rush two stat axes to max before anything else.
  - order: ember3 → arcane3 → sword1 → amulet1 → sword2 → amulet2 → gale1 → sword3 → amulet3 → boots1 → boots2 → boots3 → cape1 → cape2 → cape3 → treads1 → treads2 → treads3 → hourglass1 → hourglass2 → hourglass3
  - tests: depth (vs B2) for stat elements
- **B2-element-breadth** (154 g): Level 1 of every stat axis before any level 2.
  - order: ember1 → terra1 → arcane1 → gale1 → ghost1 → ember2 → terra2 → arcane2 → gale2 → ghost2 → ember3 → sword2 → amulet2 → terra3 → sword3 → amulet3 → boots1 → boots2 → boots3 → cape1 → cape2 → cape3 → treads1 → treads2
  - tests: breadth (vs B1) for stat elements
- **B3-mutation-depth** (152 g): Max one mutation immediately (anger, the scaler).
  - order: anger3 → amulet1 → sword1 → amulet2 → sword2 → amulet3 → sword3 → boots2 → cape1 → boots3 → cape2 → cape3 → treads1 → treads2 → treads3 → hourglass1 → hourglass2 → hourglass3 → brazier1 → brazier2 → brazier3
  - tests: depth (vs B4) for mutations
- **B4-mutation-breadth** (152 g): One level of five mutations: does cross-synergy beat depth?
  - order: anger1 → frost1 → midas1 → malady1 → mosquito1 → anger2 → frost2 → midas2 → malady2 → anger3 → sword2 → amulet1 → sword3 → amulet2 → amulet3 → boots1 → boots2 → boots3 → cape1
  - tests: breadth (vs B3) for mutations + cross-mutation synergy
- **B5-item-depth** (147 g, ⚠ item shelf EXHAUSTED below the band (round 21.8: the whole item shelf is 147 g)): Max the two best items before touching the rest.
  - order: sword3 → amulet3 → boots1 → boots2 → cape1 → treads1 → boots3 → cape2 → hourglass1 → cape3 → treads2 → treads3 → hourglass2 → hourglass3 → brazier1 → brazier2 → brazier3 → spoon1 → spoon2 → spoon3
  - tests: depth (vs B6) for items
- **B6-item-breadth** (147 g, shelf exhausts here BY DESIGN): One of everything before any second level (the round-15 champion).
  - order: sword1 → amulet1 → boots1 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → sword2 → amulet2 → boots2 → cape2 → treads2 → hourglass2 → brazier2 → spoon2 → sword3 → amulet3 → boots3 → cape3 → treads3 → hourglass3 → brazier3 → spoon3
  - tests: breadth (vs B5) for items, post-reworks

## Family C — spell-scaling probes

- **C1-bolt-rush** (153 g): Max one spell immediately: is spell depth worth 22 g?
  - order: lightning3 → hourglass2 → amulet1 → sword1 → amulet2 → sword2 → hourglass3 → amulet3 → sword3 → boots1 → boots2 → boots3 → cape1 → cape2 → cape3 → treads1 → treads2 → treads3 → brazier1 → brazier2 → brazier3 → spoon1
  - tests: spell depth (vs C2, its control)
- **C2-bolt-splash** (153 g): Spell lv1 as a tool, stats do the killing.
  - order: lightning1 → ember2 → amulet1 → sword1 → ember3 → amulet2 → sword2 → arcane2 → amulet3 → sword3 → boots1 → boots2 → boots3 → cape1 → cape2 → cape3 → treads1 → treads2 → treads3 → hourglass1 → hourglass2 → hourglass3 → brazier1
  - tests: the control for C1: same shell, minimum spell investment
- **C3-kit-width** (151 g): Five buttons at lv1: is width its own power?
  - order: lightning1 → boomerang1 → shield1 → teleport1 → rush1 → ember2 → sword1 → amulet1 → ember3 → sword2 → amulet2 → boots2 → sword3 → amulet3 → boots3 → cape1 → cape2 → cape3 → treads1 → treads2
  - tests: kit width vs C1 depth
- **C4-boomerang-main** (151 g): The forgotten spell, maxed: does anything justify boomerang lv3?
  - order: boomerang3 → ember2 → sword1 → amulet1 → ember3 → sword2 → amulet2 → sword3 → amulet3 → boots1 → hourglass1 → boots2 → boots3 → cape1 → cape2 → cape3 → treads1 → treads2 → treads3 → hourglass2 → hourglass3 → brazier1
  - tests: boomerang scaling
- **C5-meteor-value** (150 g): The 2 s stun is a landing pad for the rock.
  - order: frost3 → meteor1 → amulet1 → meteor2 → sword1 → amulet2 → sword2 → terra2 → amulet3 → boots1 → sword3 → boots2 → boots3 → cape1 → cape2 → cape3 → treads1 → treads2 → treads3 → hourglass1
  - tests: meteor priced against C6 (same shell, cheaper bolt)
- **C6-bolt-combo** (152 g): The Chainer: freeze, bolt, shove, repeat (the live lobby build).
  - order: frost1 → lightning1 → gale1 → mosquito1 → frost2 → lightning2 → gale2 → mosquito2 → frost3 → lightning3 → gale3 → mosquito3 → sword1 → amulet1 → sword2 → sword3 → amulet2 → amulet3 → boots1 → boots2 → boots3 → cape1
  - tests: lightning in the same CC shell as C5

## Family D — play-style archetypes

- **D1-warlord** (155 g): No tricks, bigger numbers: win every straight trade.
  - order: ember2 → sword1 → amulet1 → ember3 → sword2 → amulet2 → arcane2 → sword3 → amulet3 → boots2 → cape1 → boots3 → cape2 → cape3 → treads1 → treads2 → treads3 → hourglass1 → hourglass2 → hourglass3 → brazier1 → brazier2 → brazier3
  - tests: ember's dominance + sword-by-structure (question L) in one kit
- **D2-executioner** (156 g): The mark appears, someone dies: build entirely around claiming.
  - order: anger1 → boots1 → anger2 → ghost1 → anger3 → boots2 → ghost2 → sword1 → boots3 → ghost3 → sword2 → amulet2 → sword3 → amulet3 → cape1 → cape2 → cape3 → treads1 → treads2 → treads3 → hourglass1 → hourglass2 → hourglass3
  - tests: anger's claim rate when built for the chase (question K's missing half)
- **D3-tycoon** (152 g): Every hit pays, the amplifier doubles the payroll.
  - order: midas1 → mosquito1 → midas2 → hourglass1 → midas3 → mosquito2 → sword1 → amulet1 → sword2 → amulet2 → sword3 → boots1 → amulet3 → boots2 → boots3 → cape1 → cape2 → cape3 → treads1 → treads2 → treads3 → hourglass2 → hourglass3
  - tests: mosquito-as-gold-amp + midas with real shopping depth (question E)
- **D4-leech** (153 g): Every 5th ball is a feast, and the trap volley speeds the count.
  - order: vampire2 → mosquito1 → sword1 → vampire3 → mosquito2 → amulet1 → sword2 → amulet2 → mosquito3 → sword3 → amulet3 → boots1 → boots2 → boots3 → cape1 → cape2 → cape3 → treads1 → treads2 → treads3 → hourglass1 → hourglass2
  - tests: the vampire×mosquito cast-counting ruling; sustain stacking
- **D5-plaguebearer** (153 g): Wade into the pack; everyone leaves sick.
  - order: malady2 → terra1 → treads1 → malady3 → terra2 → amulet1 → treads2 → terra3 → amulet2 → sword2 → amulet3 → sword3 → boots1 → boots2 → boots3 → cape1 → cape2 → cape3 → treads3 → hourglass1 → hourglass2 → hourglass3
  - tests: contagion value (the lab is blind to it — this is the human entry)
- **D6-sumo** (151 g): Never mind damage: you fly, I don't.
  - order: gale1 → cape1 → gale2 → boots1 → gale3 → cape2 → treads1 → cape3 → boots2 → treads2 → amulet2 → boots3 → sword1 → sword2 → sword3 → amulet3 → treads3 → hourglass1 → hourglass2 → hourglass3 → brazier1 → brazier2 → brazier3 → spoon1
  - tests: today's gale buff vs cape buff, head-on; lava economics
- **D7-stormcaller** (150 g): The kit never stops: bolt on cooldown, refund on every hit.
  - order: arcane2 → lightning1 → arcane3 → hourglass1 → lightning2 → hourglass2 → lightning3 → hourglass3 → boomerang1 → amulet2 → sword1 → sword2 → sword3 → amulet3 → boots1 → boots2 → boots3 → cape1 → cape2 → cape3 → treads1
  - tests: question M: is a dedicated cadence build viable-but-honest?
- **D8-juggernaut** (147 g, ⚠ item shelf EXHAUSTED below the band (round 21.8: the whole item shelf is 147 g)): Outlive everyone; the ring does the killing.
  - order: amulet1 → cape1 → treads1 → amulet2 → sword1 → cape2 → amulet3 → sword2 → treads2 → cape3 → sword3 → treads3 → boots1 → boots2 → boots3 → hourglass1 → hourglass2 → hourglass3 → brazier1 → brazier2 → brazier3 → spoon1 → spoon2 → spoon3
  - tests: question H: the offense-first meta, probed by its opposite
- **D9-phantom** (153 g): One line, three victims.
  - order: ghost2 → ember2 → ghost3 → ember3 → sword1 → amulet1 → sword2 → amulet2 → sword3 → amulet3 → boots1 → boots2 → boots3 → cape1 → cape2 → cape3 → treads1 → treads2 → treads3 → hourglass1 → hourglass2 → hourglass3 → brazier1
  - tests: ghost lv3 pierce value under bot aim (floor read, stated)
- **D10-skirmisher** (155 g): Mobility wins fights: dash in, blink out.
  - order: boots1 → rush1 → ember1 → teleport1 → ember2 → boots2 → shield1 → ember3 → rush2 → sword2 → amulet2 → boots3 → sword3 → amulet3 → cape1 → cape2 → cape3 → treads1 → treads2 → treads3 → hourglass1 → hourglass2
  - tests: the mobility-spell package (rush+blink) as a fighting style

## Family E — cooldown reduction (question M)

- **E1-hastemaker** (154 g): Cast faster, and every so often the cast is two balls.
  - order: arcane1 → mosquito1 → hourglass1 → arcane2 → arcane3 → mosquito2 → mosquito3 → lightning1 → boomerang1 → shield1 → lightning2 → boomerang2 → teleport1 → lightning3 → sword1 → sword2 → sword3 → amulet1 → amulet2 → amulet3
  - tests: question M: CDR x fireball throughput — arcane+hourglass haste multiplied by mosquito's pair, with a pilotable kit for the lv3 refund to shave
- **E2-chronomancer** (153 g): Five buttons, none of them ever off cooldown for long.
  - order: hourglass1 → arcane1 → hourglass2 → arcane2 → hourglass3 → arcane3 → lightning1 → boomerang1 → shield1 → rush1 → teleport1 → shield2 → rush2 → teleport2 → sword1 → sword2 → sword3 → amulet1 → amulet2 → amulet3
  - tests: question M: CDR x kit WIDTH — the same maxed haste core feeding five pilotable buttons, so arcane lv3's per-hit refund has the most cooldowns to shave (vs D7's one-spell depth)

