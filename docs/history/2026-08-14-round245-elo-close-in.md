# Round 24.5 elo: the melee close-in share (2026-08-14)

Standard run (2000 games, seed 1, Hard pilots) AFTER round 24.5: builds
owning vampire or the Hat of Aura drop the tier standoff (12/18) back to the
old 8.5 ring half the time (BOT_TARGETING.CLOSE_SHARE, re-rolled every
2-4 s). Compare the 24.4 table in 2026-08-14-roster-review.md.

FINDING: it did NOT recover the aura builds (D4-leech 1427 -> 1427,
D12-hatburner 1422 -> 1392, noise). The close ring of 8.5 is still OUTSIDE
feastR/auraR 7; the pre-24.4 feeding came from the deleted wounded dive
(ring 1.5), not the old prowl ring. Lever if Remi wants the benefit real:
a tighter close ring for payload builds (6 would sit inside both auras),
or accept the floor and let humans price feast/burn.

```
=== strategy ELO: 2000 games, seed 1, 4 random berserker seats/game, elemental ===
Elo from Bradley-Terry over pairwise placements; 1500 = roster average,
+173 = 73% favourite in a pair. games = seats played. place = mean of 1-4.
Bot read ONLY: no target-leading/CC-chaining; reactive tools + contagion at a floor.

elo    games  place  cost  strategy
2827     175  1.06   152g  K5-faker-vendetta
2679     186  1.10   151g  K4-faker-galeforce
2620     203  1.11   154g  K3-faker-minefield
2606     183  1.16   154g  K2-faker-permafrost
2446     173  1.25   150g  K1-faker-hookstorm
1637     181  1.83   151g  C4-boomerang-main
1597     221  1.93   152g  B3-mutation-depth
1539     177  2.10   155g  D1-warlord
1523     172  2.15   153g  C2-bolt-splash
1516     183  2.16   153g  E2-chronomancer
1492     201  2.17   153g  B1-element-depth
1458     176  2.32   150g  D7-stormcaller
1427     214  2.41   153g  D4-leech
1423     187  2.41    88g  A5-spells-only
1414     201  2.42   151g  C3-kit-width
1413     179  2.46   156g  D2-executioner
1404     178  2.40   152g  C7-statue-guard
1392     180  2.55    98g  A3-elements-only
1392     188  2.57   152g  D12-hatburner
1386     201  2.51   147g  A1-items-sustain
1382     187  2.52   154g  B2-element-breadth
1365     184  2.64   152g  D3-tycoon
1365     209  2.57   155g  D10-skirmisher
1359     208  2.65   153g  C1-bolt-rush
1351     208  2.64   151g  A6-no-elements
1335     219  2.69   153g  D9-phantom
1331     194  2.73   153g  D5-plaguebearer
1316     170  2.75   154g  E1-hastemaker
1301     177  2.84   147g  B6-item-breadth
1298     189  2.86   147g  B5-item-depth
1293     180  2.86   150g  F4-sword-burst
1291     196  2.88   150g  F3-spoon-burst
1271     188  2.90   147g  D8-juggernaut
1225     201  3.07   156g  F1-spoon-volume
1216     191  3.14   156g  F2-sword-volume
1212     188  3.11   152g  B4-mutation-breadth
1208     185  3.15   150g  C5-meteor-value
1199     187  3.16   130g  A4-mutations-only
1178     182  3.21   152g  D11-spoonbearer
1109     181  3.40   151g  D6-sumo
1107     207  3.42   152g  C6-bolt-combo
1098     210  3.42   147g  A2-items-mobility

unfinished games: 0
```
