# Round 24.9: Midas coins + the Anger release bar (2026-08-14)

Remi's design pass after the 24.8 scaling discussion. His ruling: infinite
scaling in long games is ACCEPTED as the fantasy (League-style; the FFA lobby
turning on the fed player is the auto-balancer). What both mark mechanics
lacked was VISIBILITY and SETUP. Both are reworked; roster untouched
(D3/M5/D14 still shop midas, D2/M1/K5 anger: same keys, new mechanics).

## 1. Midas: the coin mini-game (marks deleted)

- Every FIREBALL hit by a midas owner rolls `coinChance` [20/32/45]% per
  level: success drops a **1 g coin exactly where the victim stood** (the
  knockback carries them off it). Seeded rng; no coin off your own body via
  a reflection (the vampire self-guard, reused).
- The coin is **public**: everyone sees it, and everyone knows the owner
  wants to walk there (the pre-aim ambush is the counterplay Remi wants).
  Rendering makes ownership unmistakable: YOUR coin is bright gold with a
  glint and a pulsing pickup ring; someone else's is a small dull disc.
- **Owner-only pickup** on walkover (reach `coinRadius` 1.4); a statue
  cannot collect; an invisible owner can (their gamble). Uncollected coins
  die with the round, like stacks. Value is FLAT 1 g at every level: levels
  buy drop CHANCE only.
- **Bots**: Hard and above DETOUR to their own coin when it lies within
  `BOT_TARGETING.COIN_SEEK` (30 u) and not in the lava, overriding the prowl
  walk for that tick while the shooting logic keeps firing. Normal shares
  the brain but is gated out on KIND (the 24.1 mark-hunt precedent).
- Deleted: `markEvery`/`goldOnClaim`, the midas half of MARK_HUNTS, the
  `midasMark`/`midasClaim` events (client now rides `coinDrop`/`coinTake`).

### The coinChance napkin (Remi asked for it)

Anchors: a bot carrier lands a median **172 fireball hits/game over 13.1
rounds ≈ 13 hits/round** (r353 baseline); humans land fewer (call it ~9) and
play ~11 rounds; assume ~70% of drops actually get collected (contested
walks, rim drops). Remi's target: the purchase breaks even around mid-game
(break-even, not yet worth-it, since the gold spent elsewhere would have
paid all along).

- lv1 (10 g): 0.20 x 13 x 0.7 ≈ **1.8 g/round** for a bot -> break-even
  round ~5.5 of 13 (before mid-game). For a human: 0.20 x 9 x 0.7 ≈ 1.3
  g/round -> round ~8 of 11, slightly PAST mid. If midas reads weak in live
  play, lv1 chance is the one-line lever (0.25 puts the human break-even at
  mid-game).
- lv2 (+8 g, +12 pts): +1.1 g/round (bot) -> pays back in ~7 rounds.
- lv3 (26 g total, 45%): ≈ **4.1 g/round** for a bot, roughly +50% on the
  8 g round stipend; the whole investment pays back in ~6-7 rounds, paid in
  telegraphed WALKS rather than free income (the old mark paid ~2-3 g/round
  with a hunt attached).
- Echo synergy (more hits = more rolls) is ACCEPTED per Remi, and 24.8's
  faster echo compounds it; the elo tables below price the pair.

## 2. Anger: the release bar (+ the revenge mark)

- Claims unchanged in principle: a fireball hit on your marked target banks
  **+0.5 damage forever** (uncapped; the fantasy stays).
- **Release-gated (the setup Remi wanted)**: an anger bar fills over
  `chargeCds` (2) x the DEFAULT lv1 fireball cooldown = **4.2 s**, haste
  never speeds it. EVERY fireball cast drains it, and that cast's own ball
  adds bank x charge fraction (linear). A spammer casting on cooldown
  releases ~50% per ball; the anger DPS ceiling is bank / 4.2 s no matter
  how fast you cast. Deliberate NEGATIVE synergy with haste/echo (Remi:
  everything else already scales with cast rate). An echo pair's trailing
  ball carries NO release (lead only); a mine's stored ball keeps the charge
  it was fired with (it IS your ball); a reflected ball keeps its charge,
  keyed to the owner's bank as riders always are.
- **The revenge mark**: markDelay 0 (the round's first mark lands the
  instant battle starts) and it targets **whoever killed you last**, any
  earlier round (game-long memory, hostile kills only); random as before if
  you didn't die, round 1 included. One revenge per round; later marks stay
  random on the cadence ([36,27,20] s, unchanged). The bar also starts each
  round FULL, so the opening ball at your killer carries the whole bank.
- **HUD**: the anger buff chip now carries a live charge bar (glows at
  full); midas's chip counts your coins waiting on the ground. Both
  screenshot-verified in the real solo client (staged scene, chromium).

## 3. What to expect in the tables (predictions, written before the runs)

- Anger rows (M1, D2, K5, D14, B3) should FALL on both tables: bots cast on
  cooldown, so the release gate halves their anger output. The Hard table's
  M1 read is the honest "is the bar too harsh" signal.
- Midas rows (M5, D3, D14) hinge on the coin walk: if bots collect well,
  midas income is now BIGGER than 24.8 (napkin: ~4 vs ~2-3 g/round at lv3),
  so M5/D3 may rise; if the detour dies to focus fire, they crater and the
  bot artifact must be flagged, not number-fixed.
- M4-echo (24.8 buff) + midas synergy is priced for the first time here.

## 4. Verification

528 vitest green (6 rewritten to the new spec + 2 new: revenge mark, bot
coin-walk; the spam-crumbs fraction is asserted to 5 decimals), arena 60x4p
and 60x8p healthy (48% lava, comebacks 13-28%), harness bots, solo-static,
client-robustness chromium+webkit, and two staged screenshots in the real
client (own shiny coin + foreign dull coin + half/full anger bar + the
buffbar chips). No wire-shape change beyond two additive snapshot fields
(`coins`, own-entry `angerCharge`), both absent when unused, so classic
snapshots stay byte-identical.

## 5. The tables (2565 games, seed 1, ~190 seats/row; pages beside this file:
`...elo-2565g-seed1-2.html` Hard, `...elo-2565g-seed1-faker-2.html` Faker;
the `-2` suffix = same-day name collision with the 24.8 pages)

### Verdicts vs the 24.8 tables (compare within a table; D1 is the anchor)

- **The release bar did its job on both brains.** Hard: every anger-heavy
  row fell (B3 1585 -> 1293, D2 1398 -> 1158, M1 1640 -> 1518, A4 last at
  985) because bots cast on cooldown and release ~50%. Faker: M1 stays #1
  but the auto-win is GONE: 2202 -> 1996, mean place 1.12 -> 1.25, and the
  top 5 is now DIVERSE (anger, element-breadth, pure elements, vampire,
  malady) instead of five mark builds. Exactly the compression Remi wanted
  without deleting the fantasy.
- **Midas coins hold their own without exploding.** Hard: M5 1589 -> 1502,
  D3 1220 -> 1245 (flat: the walk income replaces the mark income). Faker:
  M5 2080 -> 1811 (rank 7), D3 2046 -> 1528: still strong with a pilot who
  collects, no longer degenerate. Bots demonstrably collect (the walk is
  test-locked); the chatter about camping coins is a human-play question.
- **D14-hyperscaler deflated as designed** (both engines were the nerf's
  center): Faker 1940 -> 1392, Hard 1517 -> 1260. The two-clock stack no
  longer freeloads.
- **Casualties to watch**: A4-mutations-only (985/968) and
  B4-mutation-breadth (1015/960) are now the roster floor on BOTH tables:
  thin-spread mutations lost their anger carry and their midas marks in one
  round. Flag, don't buff yet: both rows exist to price the shelf, and the
  shelf's price genuinely fell.
- D4-leech (echo 24.8 + others falling) is the best non-K non-G row on
  Hard (1617). Keep an eye on the echo pair rate if it climbs further.

### Hard (berserker), 2565 games, seed 1
```
elo    games  place  cost  strategy
2829     203  1.05   151g  K2-faker-permafrost
2756     189  1.10   155g  K4-faker-galeforce
2717     175  1.13   153g  K5-faker-vendetta
2706     204  1.10   151g  K3-faker-minefield
2458     200  1.19   153g  K1-faker-hookstorm
1721     177  1.64   152g  G2-warlord-debt
1699     165  1.77   152g  G1-warlord-shield
1696     184  1.80   154g  C4-boomerang-main
1617     210  1.87   154g  D4-leech
1591     179  1.96   166g  M3-malady-first
1584     177  2.02   153g  E2-chronomancer
1565     176  2.07   151g  D1-warlord
1549     207  2.16   166g  M4-echo-first
1540     174  2.11   151g  C2-bolt-splash
1524     203  2.14   150g  B1-element-depth
1518     211  2.20   166g  M1-anger-first
1502     172  2.24   166g  M5-midas-first
1494     194  2.26   150g  D7-stormcaller
1476     201  2.35   150g  B2-element-breadth
1473     159  2.36   166g  M6-vampire-first
1468     185  2.30   151g  G4-warlord-no-arcane
1466     179  2.40   154g  C3-kit-width
1461     180  2.41    98g  A3-elements-only
1453     162  2.43    88g  A5-spells-only
1429     181  2.51   155g  G3-warlord-no-sword
1423     175  2.45   154g  E1-hastemaker
1419     199  2.48   151g  D13-bastion
1392     210  2.59   154g  C7-statue-guard
1386     196  2.59   147g  A1-items-sustain
1375     215  2.61   150g  D10-skirmisher
1364     197  2.70   166g  M2-frost-first
1357     196  2.69   154g  D12-hatburner
1346     178  2.79   151g  D9-phantom
1333     235  2.77   156g  F1-spoon-volume
1330     199  2.76   152g  A6-no-elements
1315     198  2.88   154g  F4-sword-burst
1314     202  2.88   154g  F3-spoon-burst
1308     189  2.88   154g  C1-bolt-rush
1297     189  2.95   147g  B6-item-breadth
1293     192  2.93   153g  B3-mutation-depth
1291     197  2.87   150g  D5-plaguebearer
1276     192  3.01   156g  F2-sword-volume
1267     202  3.01   147g  B5-item-depth
1260     172  3.05   150g  D14-hyperscaler
1245     196  3.02   152g  D3-tycoon
1228     183  3.13   156g  D11-spoonbearer
1204     185  3.13   147g  D8-juggernaut
1189     191  3.25   154g  C5-meteor-value
1188     158  3.25   153g  C6-bolt-combo
1158     175  3.29   152g  D2-executioner
1109     176  3.43   152g  D6-sumo
1042     207  3.57   147g  A2-items-mobility
1015     215  3.63   153g  B4-mutation-breadth
 985     194  3.68   130g  A4-mutations-only
unfinished games: 0
```

### All-Faker, 2565 games, seed 1
```
elo    games  place  cost  strategy
1996     211  1.25   166g  M1-anger-first
1986     201  1.28   150g  B2-element-breadth
1912     180  1.39    98g  A3-elements-only
1899     159  1.43   166g  M6-vampire-first
1897     179  1.41   166g  M3-malady-first
1878     197  1.45   166g  M2-frost-first
1811     172  1.57   166g  M5-midas-first
1764     175  1.66   152g  D2-executioner
1754     207  1.75   166g  M4-echo-first
1696     178  1.89   151g  D9-phantom
1659     165  1.99   152g  G1-warlord-shield
1622     177  2.12   152g  G2-warlord-debt
1622     204  2.09   151g  K3-faker-minefield
1614     184  2.09   154g  C4-boomerang-main
1605     199  2.15   151g  D13-bastion
1571     197  2.27   150g  D5-plaguebearer
1560     185  2.27   151g  G4-warlord-no-arcane
1555     176  2.31   151g  D1-warlord
1548     196  2.34   147g  A1-items-sustain
1537     175  2.37   153g  K5-faker-vendetta
1533     192  2.40   153g  B3-mutation-depth
1528     196  2.35   152g  D3-tycoon
1522     203  2.39   150g  B1-element-depth
1519     185  2.37   147g  D8-juggernaut
1508     191  2.49   154g  C5-meteor-value
1498     176  2.49   152g  D6-sumo
1486     174  2.53   151g  C2-bolt-splash
1480     181  2.55   155g  G3-warlord-no-sword
1478     189  2.55   147g  B6-item-breadth
1475     202  2.56   147g  B5-item-depth
1469     198  2.61   154g  F4-sword-burst
1466     199  2.58   152g  A6-no-elements
1459     194  2.58   150g  D7-stormcaller
1458     207  2.64   147g  A2-items-mobility
1447     202  2.68   154g  F3-spoon-burst
1423     196  2.73   154g  D12-hatburner
1409     210  2.78   154g  C7-statue-guard
1409     210  2.74   154g  D4-leech
1392     172  2.82   150g  D14-hyperscaler
1388     189  2.86   154g  C1-bolt-rush
1376     177  2.85   153g  E2-chronomancer
1364     215  2.94   150g  D10-skirmisher
1363     179  2.93   154g  C3-kit-width
1342     203  3.03   151g  K2-faker-permafrost
1339     162  3.00    88g  A5-spells-only
1317     189  3.07   155g  K4-faker-galeforce
1250     235  3.23   156g  F1-spoon-volume
1247     183  3.29   156g  D11-spoonbearer
1233     175  3.27   154g  E1-hastemaker
1175     192  3.47   156g  F2-sword-volume
1155     200  3.51   153g  K1-faker-hookstorm
1079     158  3.62   153g  C6-bolt-combo
 968     194  3.78   130g  A4-mutations-only
 960     215  3.79   153g  B4-mutation-breadth
unfinished games: 0
```
