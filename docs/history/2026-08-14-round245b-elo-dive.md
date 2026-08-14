# Round 24.5b elo: the dive version of the melee close-in (2026-08-14)

Standard run (2000 games, seed 1). Remi's second cut: vampire/Hat builds
DIVE to ring 1.5 (the old wounded-dive distance) 50% of the time, re-rolled
every 5 s, prey hp no longer gates it. Compare 24.4 (no close-in) and 24.5
(close ring 8.5, zero effect) in the two earlier files.

FINDING: the dive costs the bots elo instead of paying: D4-leech 1427 ->
1332, D12-hatburner 1392 -> 1327 (~-100 each, well past noise). The old
dive was a FINISHING move (prey under 30 hp, brief); an unconditional 5 s
dive parks the bot in point-blank range of healthy enemies and the
feast/burn income does not cover what it eats there. Bots cannot time or
dodge their way out, humans can, so this is a floor on the DESIGN, not on
the numbers. Shipped anyway per Remi's spec (bots now visibly play their
archetype; feel outranks the table). Middle option if wanted later: close
ring 6 (inside both auras, outside point-blank).

```
=== strategy ELO: 2000 games, seed 1, 4 random berserker seats/game, elemental ===
Elo from Bradley-Terry over pairwise placements; 1500 = roster average,
+173 = 73% favourite in a pair. games = seats played. place = mean of 1-4.
Bot read ONLY: no target-leading/CC-chaining; reactive tools + contagion at a floor.

elo    games  place  cost  strategy
2810     175  1.06   152g  K5-faker-vendetta
2687     186  1.10   151g  K4-faker-galeforce
2649     203  1.10   154g  K3-faker-minefield
2579     183  1.17   154g  K2-faker-permafrost
2443     173  1.25   150g  K1-faker-hookstorm
1602     181  1.92   151g  C4-boomerang-main
1585     221  1.96   152g  B3-mutation-depth
1550     183  2.07   153g  E2-chronomancer
1539     172  2.10   153g  C2-bolt-splash
1517     201  2.10   153g  B1-element-depth
1510     177  2.19   155g  D1-warlord
1509     176  2.16   150g  D7-stormcaller
1439     187  2.36    88g  A5-spells-only
1429     179  2.40   156g  D2-executioner
1428     180  2.43    98g  A3-elements-only
1419     201  2.40   151g  C3-kit-width
1400     187  2.47   154g  B2-element-breadth
1386     201  2.52   147g  A1-items-sustain
1385     209  2.50   155g  D10-skirmisher
1380     178  2.49   152g  C7-statue-guard
1356     208  2.63   151g  A6-no-elements
1350     170  2.63   154g  E1-hastemaker
1345     180  2.67   150g  F4-sword-burst
1332     214  2.73   153g  D4-leech
1332     219  2.71   153g  D9-phantom
1331     184  2.74   152g  D3-tycoon
1327     194  2.75   153g  D5-plaguebearer
1327     188  2.79   152g  D12-hatburner
1324     196  2.77   150g  F3-spoon-burst
1320     208  2.79   153g  C1-bolt-rush
1287     201  2.87   156g  F1-spoon-volume
1281     189  2.92   147g  B5-item-depth
1270     177  2.95   147g  B6-item-breadth
1263     188  2.94   152g  B4-mutation-breadth
1236     191  3.08   156g  F2-sword-volume
1226     187  3.06   130g  A4-mutations-only
1218     188  3.09   147g  D8-juggernaut
1197     185  3.17   150g  C5-meteor-value
1185     182  3.19   152g  D11-spoonbearer
1119     207  3.39   152g  C6-bolt-combo
1114     181  3.38   151g  D6-sumo
1015     210  3.60   147g  A2-items-mobility

unfinished games: 0
```
