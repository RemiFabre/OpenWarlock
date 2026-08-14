# Strategy roster, GENERATED from tools/roster.js (edit there, `node tools/roster.js --doc`)

**Goal**: mass AI games, ELO per strategy (random 4-strategy lobbies, Elo fitted from placements).
**Core cost target**: 150-185 g, a bit above the ~145 g an average seat earns in a full game (measured: 13.1 rounds, 9.8 kills/seat), so the uncontrolled everything-else tail almost never runs.
**After the core**: the bot walks the study's shared exhaust list (identical for every strategy), and only when even that is maxed does the in-game random fallback (items, then pilotable spells, then mutations) spend leftovers.
**Fireball**: free at lv1 for everyone in elemental, never levels; not listed.
**Spells bots can pilot** (the only ones allowed here): lightning, boomerang, rush, shield, Blood Debt (24.6: Hard+ casts it on the imminent-ball read, Shield's understudy), blink, meteor (CC-gated: cast only into a frost stun/heavy slow) and statue (round 21.8: a panic button; hurt, a ball inbound, away from the rim). Mine, Decoy, Switcheroo, vanish, pillar, wall and repulse are NOT pilotable and are excluded from the ELO pool.


## Family A: system purity (price each shelf as a class)

- **A1-items-sustain** (147 g, ⚠ item shelf EXHAUSTED below the band (round 21.8: the whole item shelf is 147 g)): The item shelf's best self: HP and both kinds of healing.
  - order: amulet1 → sword1 → spoon1 → amulet2 → sword2 → spoon2 → amulet3 → sword3 → spoon3 → cape2 → hourglass2 → boots1 → treads1 → brazier1 → boots2 → treads2 → brazier2 → boots3 → cape3 → treads3 → hourglass3 → brazier3
  - tests: items as a class (sustain half) vs the element families
- **A2-items-mobility** (147 g, ⚠ item shelf EXHAUSTED below the band (round 21.8: the whole item shelf is 147 g)): The item shelf's utility half: speed, lava, armor.
  - order: boots1 → treads1 → boots2 → cape1 → boots3 → treads2 → cape2 → treads3 → cape3 → hourglass1 → hourglass2 → hourglass3 → sword1 → amulet1 → brazier1 → spoon1 → sword2 → amulet2 → brazier2 → spoon2 → sword3 → amulet3 → brazier3 → spoon3
  - tests: items as a class (mobility half)
- **A3-elements-only** (88 g, shelf exhausts here BY DESIGN): Pure fireball stat scaling, zero items.
  - order: ember2 → arcane1 → gale1 → terra1 → ghost1 → ember3 → arcane2 → gale2 → terra2 → ghost2 → terra3 → ghost3 → gale3
  - tests: the stat-element shelf as a class
- **A4-mutations-only** (130 g, shelf exhausts here BY DESIGN): Pure behavior-changers, zero items or stat axes.
  - order: anger1 → frost1 → anger2 → frost2 → anger3 → frost3 → malady2 → midas1 → malady3 → mosquito3 → midas3
  - tests: the mutation shelf as a class
- **A5-spells-only** (88 g, shelf exhausts here BY DESIGN): The kit shelf as a class: buttons, no elements.
  - order: lightning1 → boomerang1 → rush1 → shield1 → lightning2 → boomerang2 → lightning3 → shield2 → boomerang3 → rush2 → teleport2
  - tests: spells as a class
- **A6-no-elements** (152 g): Items + spells, elements refused: prices the element shelf by absence.
  - order: amulet1 → sword1 → boots1 → lightning1 → amulet2 → sword2 → boomerang1 → cape1 → treads1 → hourglass1 → amulet3 → sword3 → lightning2 → boots2 → brazier1 → spoon1 → cape2 → treads2 → hourglass2 → brazier2 → spoon2 → boots3 → cape3 → treads3
  - tests: control: what skipping elements costs

## Family B: depth vs breadth, per system

- **B1-element-depth** (150 g): Rush two stat axes to max before anything else.
  - order: ember3 → arcane2 → lightning1 → arcane3 → sword1 → amulet1 → sword2 → amulet2 → gale1 → sword3 → amulet3 → boots1 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → boots2 → cape2 → treads2 → hourglass2
  - tests: depth (vs B2) for stat elements
- **B2-element-breadth** (150 g): Level 1 of every stat axis before any level 2.
  - order: ember1 → terra1 → arcane1 → gale1 → ghost1 → ember2 → terra2 → arcane2 → gale2 → ghost2 → ember3 → sword2 → amulet2 → terra3 → boots1 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → boots2 → cape2 → treads2
  - tests: breadth (vs B1) for stat elements
- **B3-mutation-depth** (153 g): Max one mutation immediately (anger, the scaler).
  - order: anger3 → amulet1 → sword1 → amulet2 → sword2 → amulet3 → sword3 → boots2 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → cape2 → treads2 → hourglass2 → brazier2 → spoon2 → boots3 → cape3 → treads3
  - tests: depth (vs B4) for mutations
- **B4-mutation-breadth** (153 g): One level of five mutations: does cross-synergy beat depth?
  - order: anger1 → frost1 → midas1 → malady1 → mosquito1 → anger2 → frost2 → midas2 → malady2 → anger3 → sword2 → amulet1 → boots1 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → amulet2
  - tests: breadth (vs B3) for mutations + cross-mutation synergy
- **B5-item-depth** (147 g, ⚠ item shelf EXHAUSTED below the band (round 21.8: the whole item shelf is 147 g)): Max the two best items before touching the rest.
  - order: sword3 → amulet3 → boots1 → boots2 → cape1 → treads1 → boots3 → cape2 → hourglass1 → brazier1 → spoon1 → treads2 → hourglass2 → brazier2 → spoon2 → cape3 → treads3 → hourglass3 → brazier3 → spoon3
  - tests: depth (vs B6) for items
- **B6-item-breadth** (147 g, shelf exhausts here BY DESIGN): One of everything before any second level (the round-15 champion).
  - order: sword1 → amulet1 → boots1 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → sword2 → amulet2 → boots2 → cape2 → treads2 → hourglass2 → brazier2 → spoon2 → sword3 → amulet3 → boots3 → cape3 → treads3 → hourglass3 → brazier3 → spoon3
  - tests: breadth (vs B5) for items, post-reworks

## Family C: spell-scaling probes

- **C1-bolt-rush** (154 g): Max one spell immediately: is spell depth worth 22 g?
  - order: lightning3 → hourglass2 → amulet1 → sword1 → amulet2 → sword2 → hourglass3 → amulet3 → sword3 → boots1 → cape1 → treads1 → brazier1 → spoon1 → boots2 → cape2 → treads2 → brazier2 → spoon2 → boots3 → cape3 → treads3
  - tests: spell depth (vs C2, its control)
- **C2-bolt-splash** (151 g): Spell lv1 as a tool, stats do the killing.
  - order: lightning1 → ember2 → amulet1 → sword1 → ember3 → amulet2 → sword2 → arcane2 → amulet3 → sword3 → boots1 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → boots2 → cape2 → treads2 → hourglass2 → brazier2 → spoon2
  - tests: the control for C1: same shell, minimum spell investment
- **C3-kit-width** (154 g): Five buttons at lv1: is width its own power?
  - order: lightning1 → boomerang1 → shield1 → teleport1 → rush1 → ember2 → sword1 → amulet1 → ember3 → sword2 → amulet2 → boots2 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → cape2 → treads2 → hourglass2
  - tests: kit width vs C1 depth
- **C4-boomerang-main** (154 g): The forgotten spell, maxed: does anything justify boomerang lv3?
  - order: boomerang3 → ember2 → sword1 → amulet1 → ember3 → sword2 → amulet2 → sword3 → amulet3 → boots1 → hourglass1 → cape1 → treads1 → brazier1 → spoon1 → boots2 → cape2 → treads2 → hourglass2 → brazier2 → spoon2 → boots3
  - tests: boomerang scaling
- **C5-meteor-value** (154 g): The 2 s stun is a landing pad for the rock.
  - order: frost3 → meteor1 → amulet1 → meteor2 → sword1 → amulet2 → sword2 → terra2 → amulet3 → boots1 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → boots2 → cape2 → treads2 → hourglass2 → brazier2
  - tests: meteor priced against C6 (same shell, cheaper bolt)
- **C6-bolt-combo** (153 g): The Chainer: freeze, bolt, shove, repeat (the live lobby build).
  - order: frost1 → lightning1 → gale1 → mosquito1 → frost2 → lightning2 → gale2 → mosquito2 → frost3 → lightning3 → gale3 → mosquito3 → sword1 → amulet1 → boots1 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → sword2 → amulet2
  - tests: lightning in the same CC shell as C5
- **C7-statue-guard** (154 g): A 2 s invulnerable statue as the panic button on a plain fighting kit.
  - order: statue1 → ember2 → statue2 → sword1 → amulet1 → ember3 → sword2 → amulet2 → sword3 → amulet3 → boots1 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → boots2 → cape2 → treads2 → hourglass2 → brazier2 → spoon2 → boots3 → cape3
  - tests: what a total-immunity root is worth on the ONE reading a bot can make of it (hurt + a ball inbound); a floor for a spell whose real value is human timing

## Family D: play-style archetypes

- **D1-warlord** (151 g): No tricks, bigger numbers: win every straight trade.
  - order: ember2 → sword1 → amulet1 → ember3 → sword2 → amulet2 → arcane2 → sword3 → amulet3 → boots2 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → cape2 → treads2 → hourglass2 → brazier2 → spoon2 → boots3 → cape3
  - tests: ember's dominance + sword-by-structure (question L) in one kit; ALSO the control every family-G variant is measured against (24.7)
- **D2-executioner** (152 g): The mark appears, someone dies: build entirely around claiming.
  - order: anger1 → boots1 → anger2 → ghost1 → anger3 → boots2 → ghost2 → sword1 → boots3 → ghost3 → sword2 → amulet2 → sword3 → amulet3 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → cape2 → treads2 → hourglass2
  - tests: anger's claim rate when built for the chase (question K's missing half)
- **D3-tycoon** (152 g): Every mark is a paycheck: run it down, cash it, outspend the lobby.
  - order: midas1 → boots1 → midas2 → ghost1 → midas3 → boots2 → ghost2 → sword1 → boots3 → ghost3 → sword2 → amulet2 → sword3 → amulet3 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → cape2 → treads2 → hourglass2
  - tests: the reworked midas (24.1: timed hunt, +2 g flat claim) built for claim rate; D2's exact core with midas swapped for anger, so the two mark hunts price each other
  - note: Redesigned round 24.7 (Remi): the midas-echo combo this build existed for no longer exists.
- **D4-leech** (150 g): Cast twice as often, bank twice the marks, wade in and drink the pile back.
  - order: vampire2 → arcane1 → mosquito1 → sword1 → vampire3 → arcane2 → hourglass1 → mosquito2 → amulet1 → lightning1 → arcane3 → hourglass2 → mosquito3 → sword2 → amulet2 → boots1 → cape1 → treads1 → brazier1 → spoon1
  - tests: the round-24 mark-and-feast fed by CAST RATE (arcane+hourglass haste, echo pairs) instead of raw damage (Remi, 24.7); the 24.5 dive logic keys on vampire, so this row dives half the time
  - note: Respecced round 24.7 (Remi): marks scale with hit count, so the build now buys frequency (arcane, hourglass, echo), not damage.
- **D5-plaguebearer** (150 g): Wade into the pack; everyone leaves sick.
  - order: malady2 → terra1 → treads1 → malady3 → terra2 → amulet1 → treads2 → terra3 → amulet2 → sword2 → amulet3 → boots1 → cape1 → hourglass1 → brazier1 → spoon1 → boots2 → cape2 → hourglass2 → brazier2 → spoon2
  - tests: contagion value (the lab is blind to it; this is the human entry)
- **D6-sumo** (152 g): Never mind damage: you fly, I don't.
  - order: gale1 → cape1 → gale2 → boots1 → gale3 → cape2 → treads1 → cape3 → boots2 → treads2 → amulet2 → boots3 → sword1 → hourglass1 → brazier1 → spoon1 → sword2 → hourglass2 → brazier2 → spoon2 → sword3 → amulet3 → treads3 → hourglass3
  - tests: today's gale buff vs cape buff, head-on; lava economics
- **D7-stormcaller** (153 g): The kit never stops: bolt on cooldown, refund on every hit.
  - order: arcane2 → lightning1 → arcane3 → hourglass1 → lightning2 → hourglass2 → lightning3 → hourglass3 → boomerang1 → amulet2 → sword1 → boots1 → cape1 → treads1 → brazier1 → spoon1 → sword2 → boots2 → cape2 → treads2 → brazier2 → spoon2
  - tests: question M: is a dedicated cadence build viable-but-honest?
- **D8-juggernaut** (147 g, ⚠ item shelf EXHAUSTED below the band (round 21.8: the whole item shelf is 147 g)): Outlive everyone; the ring does the killing.
  - order: amulet1 → cape1 → treads1 → amulet2 → sword1 → cape2 → amulet3 → sword2 → treads2 → cape3 → sword3 → treads3 → boots1 → hourglass1 → brazier1 → spoon1 → boots2 → hourglass2 → brazier2 → spoon2 → boots3 → hourglass3 → brazier3 → spoon3
  - tests: question H: the offense-first meta, probed by its opposite
- **D9-phantom** (151 g): One line, three victims.
  - order: ghost2 → ember2 → ghost3 → ember3 → sword1 → amulet1 → sword2 → amulet2 → boots1 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → boots2 → cape2 → treads2 → hourglass2 → brazier2 → spoon2 → sword3 → amulet3
  - tests: ghost lv3 pierce value under bot aim (floor read, stated)
- **D10-skirmisher** (150 g): Mobility wins fights: dash in, blink out.
  - order: boots1 → rush1 → ember1 → teleport1 → ember2 → boots2 → shield1 → ember3 → rush2 → sword2 → amulet2 → boots3 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → cape2 → treads2 → hourglass2 → brazier2
  - tests: the mobility-spell package (rush+blink) as a fighting style
- **D11-spoonbearer** (156 g): Low damage, endless uptime: hold them still and heal a flat amount off every tap.
  - order: spoon1 → frost1 → gale1 → spoon2 → frost2 → gale2 → spoon3 → frost3 → gale3 → boots1 → treads1 → sword1 → amulet1 → cape1 → hourglass1 → brazier1 → sword2 → amulet2 → boots2 → cape2 → treads2 → hourglass2 → brazier2 → sword3
  - tests: the Slow Spoon's premise (round 21.8): does a flat heal-per-hit carry a deliberately LOW-damage utility kit, where lifesteal pays almost nothing?
- **D12-hatburner** (154 g): Stand in the pack and cook: a burning ring that follows them out of it.
  - order: brazier1 → malady1 → brazier2 → malady2 → brazier3 → malady3 → treads1 → amulet1 → treads2 → amulet2 → sword1 → boots1 → cape1 → hourglass1 → spoon1 → sword2 → boots2 → cape2 → hourglass2 → spoon2 → sword3 → amulet3 → boots3 → cape3
  - tests: passive damage as a build: the Hat of Aura's ring + its round-21.8 linger, paired with the plague that wants the same close range
- **D13-bastion** (151 g): Nothing gets through: reflect it, or bank it and hand it back.
  - order: shield1 → amulet1 → cape1 → debt1 → sword1 → amulet2 → shield2 → treads1 → debt2 → cape2 → sword2 → amulet3 → treads2 → cape3 → sword3 → treads3 → boots1 → hourglass1 → brazier1 → spoon1 → boots2 → hourglass2 → brazier2
  - tests: the two reactive windows stacked (24.6: Hard+ casts Shield, and Blood Debt as the understudy) on a max-armor shell; defense WITH buttons vs D8 (armor only)
  - note: New round 24.7: answers 24.6's open question "which builds should shop Blood Debt".
- **D14-hyperscaler** (150 g): Two marks, two clocks, one snowball: claim everything, forever.
  - order: anger1 → midas1 → anger2 → midas2 → anger3 → midas3 → sword1 → amulet1 → sword2 → amulet2 → boots1 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → boots2 → cape2 → treads2 → hourglass2 → brazier2 → spoon2
  - tests: anger + midas leveled in lockstep (lv1 both, lv2 both, lv3 both): do the two mark engines compound or contend? Read vs M1/M5 (each engine alone on a full scaffold)

## Family E: cooldown reduction (question M)

- **E1-hastemaker** (150 g): Cast faster, and every so often the cast is two balls.
  - order: arcane1 → mosquito1 → hourglass1 → arcane2 → lightning1 → arcane3 → mosquito2 → mosquito3 → boomerang1 → shield1 → lightning2 → boomerang2 → teleport1 → lightning3 → sword1 → amulet1 → boots1 → cape1 → treads1 → brazier1 → spoon1
  - tests: question M: CDR x fireball throughput. Arcane+hourglass haste multiplied by mosquito's pair, with a pilotable kit for the lv3 refund to shave
- **E2-chronomancer** (156 g): Five buttons, none of them ever off cooldown for long.
  - order: hourglass1 → arcane1 → hourglass2 → arcane2 → hourglass3 → lightning1 → arcane3 → boomerang1 → shield1 → rush1 → teleport1 → shield2 → rush2 → teleport2 → sword1 → amulet1 → boots1 → cape1 → treads1 → brazier1 → spoon1 → sword2
  - tests: question M: CDR x kit WIDTH. The same maxed haste core feeding five pilotable buttons, so arcane lv3's per-hit refund has the most cooldowns to shave (vs D7's one-spell depth)

## Family F: sustain, flat heal-per-hit vs lifesteal (round 21.8)

- **F1-spoon-volume** (152 g): Cast constantly, heal a flat crumb off every single connection.
  - order: arcane2 → lightning1 → arcane3 → mosquito3 → hourglass3 → boomerang1 → rush1 → ghost2 → spoon3 → boots2 → amulet2
  - tests: the Slow Spoon against the Blood Sword, identical kit, identical gold, NEITHER seat allowed the other item (vs F2)
- **F3-spoon-burst** (154 g): Big hits, and a flat crumb of healing per hit that barely notices them.
  - order: ember3 → lightning2 → meteor2 → terra3 → spoon3 → amulet2 → hourglass2 → boots3 → treads2 → cape1 → brazier1
  - tests: the Slow Spoon where lifesteal SHOULD win: few, large hits (vs F4)
- **F4-sword-burst** (154 g): Big hits, and a percentage of every one of them.
  - order: ember3 → lightning2 → meteor2 → terra3 → sword3 → amulet2 → hourglass2 → boots3 → treads2 → cape1 → brazier1
  - tests: the control for F3: the Blood Sword on the same big-hit kit
- **F2-sword-volume** (152 g): The same barrage, paid for in lifesteal instead.
  - order: arcane2 → lightning1 → arcane3 → mosquito3 → hourglass3 → boomerang1 → rush1 → ghost2 → sword3 → boots2 → amulet2
  - tests: the control for F1: the Blood Sword in the identical high-volume kit, Slow Spoon banned

## Family G: the Warlord, one variable at a time (control = D1-warlord; round 24.7)

- **G1-warlord-shield** (152 g): The Warlord who answers: every trade, plus a reflection window.
  - order: ember2 → sword1 → amulet1 → shield1 → ember3 → sword2 → amulet2 → arcane2 → shield2 → sword3 → amulet3 → boots2 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → cape2 → treads2 → hourglass2 → brazier2
  - tests: ONE variable vs D1: +Shield (12+6 g, bought early); is a piloted reactive worth 18 g of items?
- **G2-warlord-debt** (152 g): The Warlord who banks the hit and mails it back.
  - order: ember2 → sword1 → amulet1 → debt1 → ember3 → sword2 → amulet2 → arcane2 → debt2 → sword3 → amulet3 → boots2 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → cape2 → treads2 → hourglass2 → brazier2
  - tests: ONE variable vs D1: +Blood Debt in the exact slots G1 gives Shield (same 12+6 g), so G1-G2 is Shield vs Debt on the same bot read (24.6)
  - note: First roster row to shop Blood Debt (with D13), closing 24.6's open question.
- **G3-warlord-no-sword** (155 g): The Warlord without the vampire sword: pure damage, no drain.
  - order: ember2 → amulet1 → ember3 → amulet2 → arcane2 → amulet3 → boots2 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → cape2 → treads2 → hourglass2 → brazier2 → spoon2 → boots3 → cape3 → treads3 → hourglass3 → brazier3 → spoon3
  - tests: ONE variable vs D1: sword BANNED (caps, padder included); prices lifesteal-by-structure (question L) as an ablation, gold goes to the generic shelf instead
- **G4-warlord-no-arcane** (151 g): The Warlord who never learns to cast faster.
  - order: ember2 → sword1 → amulet1 → ember3 → sword2 → amulet2 → sword3 → amulet3 → boots2 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → cape2 → treads2 → hourglass2 → brazier2 → spoon2 → boots3 → cape3 → treads3 → hourglass3
  - tests: ONE variable vs D1: arcane BANNED (caps); prices the haste axis inside the base build, its 12 g goes to the generic shelf instead

## Family M: one mutation maxed first, identical scaffold after (round 24.7)

- **M1-anger-first** (172 g): Max the grudge, then build like everyone else.
  - order: anger3 → sword1 → amulet1 → ember1 → terra1 → gale1 → arcane1 → ghost1 → sword2 → amulet2 → ember2 → terra2 → gale2 → arcane2 → ghost2 → sword3 → amulet3 → ember3 → terra3 → gale3 → lightning1 → arcane3 → ghost3
  - tests: anger isolated on the shared scaffold (vs its M siblings)
- **M2-frost-first** (172 g): Max the cold, then build like everyone else.
  - order: frost3 → sword1 → amulet1 → ember1 → terra1 → gale1 → arcane1 → ghost1 → sword2 → amulet2 → ember2 → terra2 → gale2 → arcane2 → ghost2 → sword3 → amulet3 → ember3 → terra3 → gale3 → lightning1 → arcane3 → ghost3
  - tests: frost isolated on the shared scaffold; stack-fade (22.4) means bots must feed the pile
- **M3-malady-first** (172 g): Max the plague, then build like everyone else.
  - order: malady3 → sword1 → amulet1 → ember1 → terra1 → gale1 → arcane1 → ghost1 → sword2 → amulet2 → ember2 → terra2 → gale2 → arcane2 → ghost2 → sword3 → amulet3 → ember3 → terra3 → gale3 → lightning1 → arcane3 → ghost3
  - tests: malady isolated on the shared scaffold; contagion still reads at a floor (bots do not cluster on purpose)
- **M4-echo-first** (172 g): Max the echo, then build like everyone else.
  - order: mosquito3 → sword1 → amulet1 → ember1 → terra1 → gale1 → arcane1 → ghost1 → sword2 → amulet2 → ember2 → terra2 → gale2 → arcane2 → ghost2 → sword3 → amulet3 → ember3 → terra3 → gale3 → lightning1 → arcane3 → ghost3
  - tests: mosquito (Echo) isolated on the shared scaffold: every 4th cast pairs
- **M5-midas-first** (172 g): Max the gold mark, then build like everyone else.
  - order: midas3 → sword1 → amulet1 → ember1 → terra1 → gale1 → arcane1 → ghost1 → sword2 → amulet2 → ember2 → terra2 → gale2 → arcane2 → ghost2 → sword3 → amulet3 → ember3 → terra3 → gale3 → lightning1 → arcane3 → ghost3
  - tests: midas isolated on the shared scaffold: its +2 g claims should show as a DEEPER tail, which is the whole value of gold
- **M6-vampire-first** (172 g): Max the feast, then build like everyone else.
  - order: vampire3 → sword1 → amulet1 → ember1 → terra1 → gale1 → arcane1 → ghost1 → sword2 → amulet2 → ember2 → terra2 → gale2 → arcane2 → ghost2 → sword3 → amulet3 → ember3 → terra3 → gale3 → lightning1 → arcane3 → ghost3
  - tests: vampire isolated on the shared scaffold (no frequency support here; D4 is the synergy build)

## Family K: the Faker combo arsenals, on the Faker brain (issue #7)

- **K1-faker-hookstorm** (153 g): The hook: Switcheroo into the bolt, the rock onto the landing point.
  - order: lightning3 → swap3 → meteor2 → ember2 → boots2 → cape1 → sword1 → amulet1 → treads1 → hourglass1 → brazier1 → spoon1 → sword2 → amulet2 → cape2 → treads2 → hourglass2
  - tests: does the combo layer out-earn raw value at equal cost
- **K2-faker-permafrost** (151 g): The freeze: the third stack is spent on purpose, with the bolt loaded.
  - order: frost3 → lightning3 → hourglass3 → boots2 → sword1 → amulet1 → cape1 → treads1 → brazier1 → spoon1 → sword2 → amulet2 → cape2 → treads2 → brazier2 → spoon2
  - tests: frost-hold combos vs the chainer, on a brain that times them
- **K3-faker-minefield** (151 g): The detonator: a loaded trap underfoot, Switcheroo drops you on it.
  - order: lightning2 → nova2 → swap3 → ember2 → boots2 → sword1 → amulet1 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → sword2 → amulet2 → cape2 → treads2 → hourglass2 → brazier2
  - tests: the trap-hook chain: the biggest measured true combos (tools/combo.js)
- **K4-faker-galeforce** (155 g): The wind: every third ball shoves, the bolt is already falling there.
  - order: gale3 → lightning3 → arcane2 → boots2 → sword1 → amulet1 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → sword2 → amulet2 → cape2 → treads2 → hourglass2 → brazier2 → spoon2 → sword3
  - tests: gust-into-bolt chains; the weakest combo identity in the lab, priced here
- **K5-faker-vendetta** (153 g): The grudge: max anger first, claim every mark, snowball forever.
  - order: anger3 → amulet1 → sword1 → amulet2 → sword2 → amulet3 → sword3 → boots2 → cape1 → treads1 → hourglass1 → brazier1 → spoon1 → cape2 → treads2 → hourglass2 → brazier2 → spoon2 → boots3 → cape3 → treads3
  - tests: anger in Faker hands: B3's core (the best anger build on Hard) piloted by the top bot tier

