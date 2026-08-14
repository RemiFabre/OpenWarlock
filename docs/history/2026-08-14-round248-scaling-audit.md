# Round 24.8: the spread audit, the patch tables, and the scaling problem (2026-08-14)

Remi questioned the all-Faker table's huge elo spread (suspected bug), asked
for a breadth-first auto-fill, a D14 anger+midas row, and the echo buff, and
opened a design discussion on infinite scaling vs game length. This file is
the audit verdict, the two post-patch tables, the length-sensitivity probes,
and the design options. Pages: `...elo-2565g-seed1.html` (Hard) and
`...elo-2565g-seed1-faker.html` (all-Faker).

## 1. Audit verdict: the spread is NOT a bug

Checked: mark hunting is owner-side only (`stackCount(enemy, elem, pl.id)`,
gated Hard+); every seat buys exactly its scripted list (probes); placements
and the Bradley-Terry fit are correct. Two real mechanisms explain the
spread:

- **Elo is log-odds and equal pilots remove the noise that compressed it.**
  Fixed lobby M1-anger vs 3x D1-warlord, 120 games: Hard pilots -> M1 wins
  111/120 (pilot misplays gift 9 games); Faker pilots -> 120/120. Same
  builds, same true gap; at 100% win rate the log-odds (elo distance)
  explodes while "mean place" barely moves. Read mean place on the Faker
  table, not elo distance.
- **Perfect pilots feed the snowball for real**: near-100% mark claim rate
  plus longer games (14.5 vs 12.9 rounds in the probe) genuinely amplify
  scaling builds.

## 2. The 24.8 patch (shipped this round)

- **Breadth-first auto-fill** (tools/roster.js): the padder always bumps the
  lowest-level remaining filler, so every lv1 lands before any lv2, every
  lv2 before any lv3 (Remi: "items are worth more at level 1"). The old walk
  maxed items one at a time (boots 3 before a first amulet). ⚠ Most
  auto-padded tails changed, so 24.8 tables shift slightly vs 24.7
  everywhere, not only where the patch touched.
- **Echo buff** (shared/constants.js): `doubleEvery` [6,5,4] -> [5,4,3]
  (weakest volume mutation for its 26 g on BOTH 24.7 tables).
- **D14-hyperscaler** (54th row): anger+midas in lockstep (lv1 both, lv2
  both, lv3 both), then sword/amulet and the fill. 150 g.
- Standard run scales with the ruling: 54 rows -> 2565 games, seed 1.

## 3. Patch verdicts (compare within a table; D1-warlord is the anchor)

- **D14-hyperscaler: Remi's prediction confirmed.** Hard: 1517, level with
  D1 (1521). Faker: **1940, rank 5 of 54, mean place 1.38** (+455 vs D1).
  But each engine ALONE on a full scaffold still beats both on half a
  scaffold (M1 2202, M5 2080, D3 2046, D2 2041 all above it): the two
  clocks CONTEND (one fireball claims one mark) more than they compound.
- **Echo buff works at mid skill, not against dodgers.** M4-echo-first on
  Hard: 1417 -> 1516 (now above average). On Faker: 1662 -> 1653 (flat;
  extra pairs get dodged like the originals). Keep: the human game is
  closer to the Hard read for volume value.
- Mark builds still own the Faker top: M1 2202, M5 2080, D3 2046, D2 2041,
  D14 1940 = ranks 1-5 are ALL mark builds now.

## 4. The length-sensitivity probes (the structural finding)

- **Bots do not play human-length games at all.** Humans: ~11 rounds
  (Remi). In 400 M1-vs-3xD1 Hard games: 3 games finished <= 11 rounds
  (0.75%). The whole bot elo instrument operates in the length regime
  where scaling has already run away.
- **Anger dominates every sampled length bin**: win share (fair = 25%)
  84% at 12-13 rounds, 95% at 14-15, 87% at 16+ (the 16+ dip is survivor
  bias: games anger fails to close early run long).
- **More players currently SHORTENS games**: D1-mirror lobbies average
  16.3 rounds at 4 seats, 12.8 at 8 seats (more targets = faster kill
  race). Remi's "10 players -> longer games" is backwards under current
  rules; the actual danger formats are higher kill targets, TEAMS
  (15 x size), defensive metas, and any mode without the 25-round cap.

## 5. Design options discussed (nothing implemented; Remi is thinking)

The problem needs two ingredients: (a) UNBOUNDED, TIME-anchored income
(a mark every X seconds of battle), and (b) COMPOUNDING conversion (damage
-> win duels -> survive -> claim more). Anger has both. Midas has only (a):
its gold self-caps once the shelf is bought out (probe: bots end with
11-17 g unspent), which is why midas is the tamer twin.

- **Remi idea A, chunky payouts** (rarer, bigger gains, highly visible):
  fixes VISIBILITY, not sensitivity; expected gain per minute is unchanged.
  Worth having anyway for legibility.
- **Remi idea B, scale only one variable in K** (alternate damage with a
  non-compounding reward): halves the feedback loop, softens acceleration,
  does not bound it.
- **Agent recommendation: anchor mark income to ROUNDS, not seconds.** One
  mark per round (spawn at round start, visible to everyone). The scaling
  budget becomes rounds played, hard-bounded by the 25-round cap and
  INSENSITIVE to round length, player count, or meta speed: an 11-round
  human game and a 14-round bot game differ by 27% in stacks instead of
  2-3x in compounded power. It is also Remi's idea A for free (a
  round-start mark is a chunky, telegraphed ritual). Levels then buy claim
  VALUE (frequency-space stops applying). Same treatment for midas keeps
  the twins symmetric.
- **Companion cap**: stacks cap at the kill target (15): "the vendetta
  completes". Humans would rarely hit it; runaway formats cannot.
- **Counterplay valve** (mild): death voids the OUTSTANDING mark and resets
  the clock. Shedding CLAIMED stacks on death was judged too harsh (deaths
  are frequent by design).
- **Do nothing yet** is defensible for today's 4-player 11-round human
  games; it stops being defensible the day teams or bigger lobbies ship,
  and anger is pilot-free stat gain, so "it is hard to pilot a big kit"
  does not brake it.

## 6. Raw tables (verbatim tool output, 24.8 patch)

### Hard (berserker), 2565 games, seed 1
```
elo    games  place  cost  strategy
2802     175  1.08   153g  K5-faker-vendetta
2765     203  1.06   151g  K2-faker-permafrost
2692     189  1.12   155g  K4-faker-galeforce
2679     204  1.10   151g  K3-faker-minefield
2398     200  1.20   153g  K1-faker-hookstorm
1675     177  1.73   152g  G2-warlord-debt
1648     184  1.90   154g  C4-boomerang-main
1640     211  1.86   166g  M1-anger-first
1623     165  1.93   152g  G1-warlord-shield
1589     172  1.97   166g  M5-midas-first
1585     192  1.98   153g  B3-mutation-depth
1567     179  2.01   166g  M3-malady-first
1555     210  2.03   154g  D4-leech
1524     177  2.20   153g  E2-chronomancer
1521     176  2.19   151g  D1-warlord
1517     172  2.21   150g  D14-hyperscaler
1516     207  2.27   166g  M4-echo-first
1512     203  2.18   150g  B1-element-depth
1507     174  2.24   151g  C2-bolt-splash
1455     201  2.42   150g  B2-element-breadth
1443     180  2.47    98g  A3-elements-only
1439     159  2.46   166g  M6-vampire-first
1433     185  2.41   151g  G4-warlord-no-arcane
1429     179  2.50   154g  C3-kit-width
1419     162  2.52    88g  A5-spells-only
1419     194  2.49   150g  D7-stormcaller
1405     181  2.59   155g  G3-warlord-no-sword
1398     175  2.55   152g  D2-executioner
1394     199  2.56   151g  D13-bastion
1368     197  2.68   166g  M2-frost-first
1357     175  2.68   154g  E1-hastemaker
1354     210  2.72   154g  C7-statue-guard
1348     199  2.73   152g  A6-no-elements
1341     196  2.76   147g  A1-items-sustain
1331     215  2.76   150g  D10-skirmisher
1328     196  2.82   154g  D12-hatburner
1306     235  2.88   156g  F1-spoon-volume
1292     178  2.97   151g  D9-phantom
1290     202  2.96   154g  F3-spoon-burst
1290     198  2.94   154g  F4-sword-burst
1280     197  2.92   150g  D5-plaguebearer
1270     192  3.03   156g  F2-sword-volume
1264     189  3.03   154g  C1-bolt-rush
1259     215  3.03   153g  B4-mutation-breadth
1248     189  3.11   147g  B6-item-breadth
1240     202  3.10   147g  B5-item-depth
1239     194  3.11   130g  A4-mutations-only
1220     196  3.13   152g  D3-tycoon
1214     183  3.17   156g  D11-spoonbearer
1178     191  3.30   154g  C5-meteor-value
1167     158  3.34   153g  C6-bolt-combo
1167     185  3.28   147g  D8-juggernaut
1060     176  3.55   152g  D6-sumo
1039     207  3.60   147g  A2-items-mobility
unfinished games: 0
```

### All-Faker, 2565 games, seed 1
```
elo    games  place  cost  strategy
2202     211  1.12   166g  M1-anger-first
2080     172  1.20   166g  M5-midas-first
2046     196  1.27   152g  D3-tycoon
2041     175  1.25   152g  D2-executioner
1940     172  1.38   150g  D14-hyperscaler
1889     201  1.48   150g  B2-element-breadth
1845     180  1.54    98g  A3-elements-only
1817     179  1.58   166g  M3-malady-first
1804     159  1.65   166g  M6-vampire-first
1786     197  1.61   166g  M2-frost-first
1760     175  1.70   153g  K5-faker-vendetta
1714     192  1.83   153g  B3-mutation-depth
1653     207  2.02   166g  M4-echo-first
1640     178  2.03   151g  D9-phantom
1569     199  2.20   151g  D13-bastion
1563     184  2.21   154g  C4-boomerang-main
1560     165  2.24   152g  G1-warlord-shield
1556     177  2.27   152g  G2-warlord-debt
1556     204  2.22   151g  K3-faker-minefield
1488     197  2.45   150g  D5-plaguebearer
1486     203  2.46   150g  B1-element-depth
1485     176  2.48   151g  D1-warlord
1475     185  2.49   151g  G4-warlord-no-arcane
1461     196  2.56   147g  A1-items-sustain
1457     185  2.51   147g  D8-juggernaut
1454     202  2.56   147g  B5-item-depth
1439     191  2.65   154g  C5-meteor-value
1423     189  2.64   147g  B6-item-breadth
1417     176  2.68   152g  D6-sumo
1409     181  2.70   155g  G3-warlord-no-sword
1408     194  2.68   150g  D7-stormcaller
1406     198  2.70   154g  F4-sword-burst
1402     174  2.78   151g  C2-bolt-splash
1398     199  2.76   152g  A6-no-elements
1378     202  2.83   154g  F3-spoon-burst
1376     207  2.86   147g  A2-items-mobility
1368     215  2.83   153g  B4-mutation-breadth
1364     196  2.87   154g  D12-hatburner
1343     210  2.92   154g  C7-statue-guard
1323     162  2.96    88g  A5-spells-only
1322     179  2.98   154g  C3-kit-width
1317     189  2.99   154g  C1-bolt-rush
1315     210  2.98   154g  D4-leech
1304     177  3.02   153g  E2-chronomancer
1301     215  3.05   150g  D10-skirmisher
1282     194  3.10   130g  A4-mutations-only
1263     189  3.19   155g  K4-faker-galeforce
1255     203  3.22   151g  K2-faker-permafrost
1182     235  3.36   156g  F1-spoon-volume
1180     175  3.37   154g  E1-hastemaker
1174     183  3.40   156g  D11-spoonbearer
1143     192  3.49   156g  F2-sword-volume
1134     200  3.51   153g  K1-faker-hookstorm
1049     158  3.65   153g  C6-bolt-combo
unfinished games: 0
```

## 7. What these tables cannot see

Both remain bot reads (no baiting, no human creativity); the Faker table
additionally saturates (near-deterministic outcomes, log-odds inflation) and
BOTH sample almost no human-length games (section 4), so every scaling row
is overweighted relative to Remi's real evenings. The probes used fixed
lobbies (reverse causality caveat: a snowball that fails to close also
lengthens the game it then wins).
