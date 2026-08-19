# Rounds 24 to 24.3: the day's full Elo tables (2026-08-14)

Instrument: tools/elo.js, 2000 games each, random 4-of-roster Hard lobbies,
Bradley-Terry over pairwise placements, 1500 = roster average, +173 = 73%
favourite in a pair, ~+/-40 between neighbours is noise. Baseline for the
day: docs/history/2026-08-13-round23-elo-faker-anger.md (r368). Narrative
reports: ...round24-vampire-feast.md and ...round241-midas-meteor-portals.md.
From round 24.3 on the STANDARD is ONE seed (seed 1, Remi's ruling); the
earlier same-day batches ran two while the older sweep rule was still being
over-applied to elo.js.

## Round 24 (vampire mark-and-feast), seed 1

```
=== strategy ELO: 2000 games, seed 1, 4 random berserker seats/game, elemental ===
Elo from Bradley-Terry over pairwise placements; 1500 = roster average,
+173 = 73% favourite in a pair. games = seats played. place = mean of 1-4.
Bot read ONLY: no target-leading/CC-chaining; reactive tools + contagion at a floor.

elo    games  place  cost  strategy
2788     175  1.07   152g  K5-faker-vendetta
2674     183  1.13   154g  K2-faker-permafrost
2655     186  1.12   151g  K4-faker-galeforce
2646     203  1.10   154g  K3-faker-minefield
2425     173  1.27   150g  K1-faker-hookstorm
1605     181  1.91   151g  C4-boomerang-main
1603     214  1.91   153g  D4-leech
1552     177  2.05   155g  D1-warlord
1549     221  2.05   152g  B3-mutation-depth
1528     188  2.14   152g  D12-hatburner
1514     183  2.18   153g  E2-chronomancer
1465     201  2.25   151g  C3-kit-width
1462     172  2.34   153g  C2-bolt-splash
1445     201  2.32   153g  B1-element-depth
1436     176  2.38   150g  D7-stormcaller
1434     184  2.41   152g  D3-tycoon
1402     187  2.49    88g  A5-spells-only
1398     179  2.50   156g  D2-executioner
1392     201  2.49   147g  A1-items-sustain
1384     178  2.48   152g  C7-statue-guard
1359     187  2.59   154g  B2-element-breadth
1356     180  2.67    98g  A3-elements-only
1333     209  2.68   155g  D10-skirmisher
1315     177  2.77   147g  B6-item-breadth
1311     219  2.77   153g  D9-phantom
1310     208  2.78   151g  A6-no-elements
1304     194  2.82   153g  D5-plaguebearer
1296     189  2.86   147g  B5-item-depth
1280     188  2.87   152g  B4-mutation-breadth
1274     196  2.92   150g  F3-spoon-burst
1271     208  2.95   153g  C1-bolt-rush
1269     180  2.92   150g  F4-sword-burst
1262     170  2.92   154g  E1-hastemaker
1233     188  3.02   147g  D8-juggernaut
1230     191  3.09   156g  F2-sword-volume
1221     187  3.07   130g  A4-mutations-only
1219     185  3.11   150g  C5-meteor-value
1207     201  3.13   156g  F1-spoon-volume
1182     210  3.18   147g  A2-items-mobility
1178     182  3.22   152g  D11-spoonbearer
1126     181  3.36   151g  D6-sumo
1105     207  3.43   152g  C6-bolt-combo

unfinished games: 0
```

## Round 24, seed 2

```
=== strategy ELO: 2000 games, seed 2, 4 random berserker seats/game, elemental ===
Elo from Bradley-Terry over pairwise placements; 1500 = roster average,
+173 = 73% favourite in a pair. games = seats played. place = mean of 1-4.
Bot read ONLY: no target-leading/CC-chaining; reactive tools + contagion at a floor.

elo    games  place  cost  strategy
2713     173  1.14   152g  K5-faker-vendetta
2671     174  1.13   151g  K4-faker-galeforce
2664     188  1.15   154g  K2-faker-permafrost
2576     180  1.19   154g  K3-faker-minefield
2374     211  1.25   150g  K1-faker-hookstorm
1660     197  1.79   151g  C4-boomerang-main
1605     189  1.86   153g  D4-leech
1586     203  1.99   152g  B3-mutation-depth
1573     204  1.96   153g  E2-chronomancer
1547     212  2.04   152g  D12-hatburner
1521     176  2.09   155g  D1-warlord
1486     196  2.20   152g  D3-tycoon
1482     190  2.24   153g  C2-bolt-splash
1468     188  2.27   153g  B1-element-depth
1452     191  2.32   150g  D7-stormcaller
1443     167  2.40   151g  C3-kit-width
1403     205  2.46    88g  A5-spells-only
1397     209  2.54   154g  B2-element-breadth
1392     182  2.55   147g  A1-items-sustain
1361     186  2.62    98g  A3-elements-only
1356     193  2.68   156g  D2-executioner
1342     200  2.73   152g  C7-statue-guard
1341     168  2.73   153g  D9-phantom
1329     185  2.76   147g  B6-item-breadth
1326     197  2.82   155g  D10-skirmisher
1299     199  2.82   151g  A6-no-elements
1297     207  2.89   153g  C1-bolt-rush
1296     191  2.87   150g  F4-sword-burst
1288     195  2.88   147g  B5-item-depth
1281     192  2.92   153g  D5-plaguebearer
1269     182  2.94   150g  F3-spoon-burst
1259     184  2.95   152g  B4-mutation-breadth
1258     193  2.99   156g  F1-spoon-volume
1250     185  3.02   154g  E1-hastemaker
1236     200  3.10   147g  D8-juggernaut
1219     171  3.11   130g  A4-mutations-only
1209     195  3.14   152g  D11-spoonbearer
1177     173  3.22   150g  C5-meteor-value
1169     208  3.24   156g  F2-sword-volume
1160     187  3.27   147g  A2-items-mobility
1144     182  3.32   151g  D6-sumo
1121     192  3.39   152g  C6-bolt-combo

unfinished games: 0
```

## Round 24.1 (midas hunt, hunting bots, craters, portal cross), seed 1

```
=== strategy ELO: 2000 games, seed 1, 4 random berserker seats/game, elemental ===
Elo from Bradley-Terry over pairwise placements; 1500 = roster average,
+173 = 73% favourite in a pair. games = seats played. place = mean of 1-4.
Bot read ONLY: no target-leading/CC-chaining; reactive tools + contagion at a floor.

elo    games  place  cost  strategy
2775     175  1.08   152g  K5-faker-vendetta
2664     183  1.13   154g  K2-faker-permafrost
2655     186  1.12   151g  K4-faker-galeforce
2650     203  1.10   154g  K3-faker-minefield
2458     173  1.25   150g  K1-faker-hookstorm
1661     181  1.80   151g  C4-boomerang-main
1627     214  1.86   153g  D4-leech
1600     221  1.94   152g  B3-mutation-depth
1548     177  2.07   155g  D1-warlord
1543     188  2.12   152g  D12-hatburner
1518     183  2.17   153g  E2-chronomancer
1483     172  2.28   153g  C2-bolt-splash
1466     201  2.25   153g  B1-element-depth
1463     201  2.26   151g  C3-kit-width
1424     176  2.41   150g  D7-stormcaller
1410     178  2.38   152g  C7-statue-guard
1407     201  2.44   147g  A1-items-sustain
1400     179  2.50   156g  D2-executioner
1399     187  2.51    88g  A5-spells-only
1357     187  2.59   154g  B2-element-breadth
1351     180  2.68    98g  A3-elements-only
1338     194  2.70   153g  D5-plaguebearer
1324     219  2.71   153g  D9-phantom
1321     189  2.77   147g  B5-item-depth
1320     177  2.76   147g  B6-item-breadth
1312     209  2.75   155g  D10-skirmisher
1298     208  2.85   153g  C1-bolt-rush
1296     170  2.80   154g  E1-hastemaker
1295     208  2.81   151g  A6-no-elements
1277     180  2.89   150g  F4-sword-burst
1271     188  2.88   147g  D8-juggernaut
1269     196  2.94   150g  F3-spoon-burst
1224     201  3.07   156g  F1-spoon-volume
1205     191  3.15   156g  F2-sword-volume
1202     188  3.13   152g  B4-mutation-breadth
1199     184  3.17   152g  D3-tycoon
1193     210  3.14   147g  A2-items-mobility
1180     182  3.20   152g  D11-spoonbearer
1178     187  3.21   130g  A4-mutations-only
1176     181  3.21   151g  D6-sumo
1168     185  3.25   150g  C5-meteor-value
1096     207  3.44   152g  C6-bolt-combo

unfinished games: 0
```

## Round 24.1, seed 2

```
=== strategy ELO: 2000 games, seed 2, 4 random berserker seats/game, elemental ===
Elo from Bradley-Terry over pairwise placements; 1500 = roster average,
+173 = 73% favourite in a pair. games = seats played. place = mean of 1-4.
Bot read ONLY: no target-leading/CC-chaining; reactive tools + contagion at a floor.

elo    games  place  cost  strategy
2753     173  1.13   152g  K5-faker-vendetta
2731     174  1.12   151g  K4-faker-galeforce
2675     180  1.16   154g  K3-faker-minefield
2589     188  1.22   154g  K2-faker-permafrost
2467     211  1.22   150g  K1-faker-hookstorm
1637     197  1.83   151g  C4-boomerang-main
1630     189  1.79   153g  D4-leech
1584     203  1.97   152g  B3-mutation-depth
1555     176  1.96   155g  D1-warlord
1552     204  1.99   153g  E2-chronomancer
1533     212  2.05   152g  D12-hatburner
1484     190  2.22   153g  C2-bolt-splash
1442     191  2.32   150g  D7-stormcaller
1438     167  2.38   151g  C3-kit-width
1430     188  2.37   153g  B1-element-depth
1389     205  2.49    88g  A5-spells-only
1389     209  2.54   154g  B2-element-breadth
1386     193  2.56   156g  D2-executioner
1385     182  2.55   147g  A1-items-sustain
1372     200  2.60   152g  C7-statue-guard
1363     186  2.58    98g  A3-elements-only
1352     168  2.67   153g  D9-phantom
1341     185  2.69   147g  B6-item-breadth
1322     197  2.79   155g  D10-skirmisher
1305     192  2.81   153g  D5-plaguebearer
1299     207  2.86   153g  C1-bolt-rush
1293     199  2.82   151g  A6-no-elements
1292     195  2.86   147g  B5-item-depth
1288     191  2.88   150g  F4-sword-burst
1260     200  3.00   147g  D8-juggernaut
1251     193  3.01   156g  F1-spoon-volume
1249     185  3.01   154g  E1-hastemaker
1242     184  2.99   152g  B4-mutation-breadth
1224     195  3.07   152g  D11-spoonbearer
1223     182  3.07   150g  F3-spoon-burst
1213     171  3.12   130g  A4-mutations-only
1207     187  3.11   147g  A2-items-mobility
1189     196  3.18   152g  D3-tycoon
1185     208  3.18   156g  F2-sword-volume
1180     182  3.20   151g  D6-sumo
1170     173  3.23   150g  C5-meteor-value
1133     192  3.34   152g  C6-bolt-combo

unfinished games: 0
```

## Round 24.2 (35% cadences; INTERIM anger [30,22,16], pre-anchor), seed 1

```
=== strategy ELO: 2000 games, seed 1, 4 random berserker seats/game, elemental ===
Elo from Bradley-Terry over pairwise placements; 1500 = roster average,
+173 = 73% favourite in a pair. games = seats played. place = mean of 1-4.
Bot read ONLY: no target-leading/CC-chaining; reactive tools + contagion at a floor.

elo    games  place  cost  strategy
2778     175  1.07   152g  K5-faker-vendetta
2663     183  1.13   154g  K2-faker-permafrost
2648     186  1.12   151g  K4-faker-galeforce
2574     203  1.12   154g  K3-faker-minefield
2499     173  1.23   150g  K1-faker-hookstorm
1637     181  1.85   151g  C4-boomerang-main
1630     221  1.86   152g  B3-mutation-depth
1582     214  1.95   153g  D4-leech
1545     177  2.07   155g  D1-warlord
1512     188  2.20   152g  D12-hatburner
1501     183  2.22   153g  E2-chronomancer
1472     201  2.23   153g  B1-element-depth
1471     172  2.31   153g  C2-bolt-splash
1459     179  2.30   156g  D2-executioner
1437     201  2.34   151g  C3-kit-width
1407     176  2.48   150g  D7-stormcaller
1397     187  2.51    88g  A5-spells-only
1382     178  2.49   152g  C7-statue-guard
1372     201  2.56   147g  A1-items-sustain
1367     180  2.63    98g  A3-elements-only
1337     177  2.70   147g  B6-item-breadth
1331     187  2.69   154g  B2-element-breadth
1329     194  2.73   153g  D5-plaguebearer
1327     219  2.71   153g  D9-phantom
1314     208  2.75   151g  A6-no-elements
1311     189  2.81   147g  B5-item-depth
1307     184  2.83   152g  D3-tycoon
1301     209  2.79   155g  D10-skirmisher
1285     208  2.90   153g  C1-bolt-rush
1283     188  2.86   152g  B4-mutation-breadth
1279     170  2.86   154g  E1-hastemaker
1264     180  2.94   150g  F4-sword-burst
1263     196  2.96   150g  F3-spoon-burst
1247     187  2.99   130g  A4-mutations-only
1243     188  2.99   147g  D8-juggernaut
1213     201  3.11   156g  F1-spoon-volume
1205     191  3.17   156g  F2-sword-volume
1195     185  3.18   150g  C5-meteor-value
1186     182  3.19   152g  D11-spoonbearer
1184     210  3.18   147g  A2-items-mobility
1164     181  3.25   151g  D6-sumo
1099     207  3.45   152g  C6-bolt-combo

unfinished games: 0
```

## Round 24.2, seed 2

```
=== strategy ELO: 2000 games, seed 2, 4 random berserker seats/game, elemental ===
Elo from Bradley-Terry over pairwise placements; 1500 = roster average,
+173 = 73% favourite in a pair. games = seats played. place = mean of 1-4.
Bot read ONLY: no target-leading/CC-chaining; reactive tools + contagion at a floor.

elo    games  place  cost  strategy
2851     173  1.09   152g  K5-faker-vendetta
2728     174  1.13   151g  K4-faker-galeforce
2653     180  1.18   154g  K3-faker-minefield
2601     188  1.22   154g  K2-faker-permafrost
2447     211  1.23   150g  K1-faker-hookstorm
1638     189  1.77   153g  D4-leech
1628     197  1.84   151g  C4-boomerang-main
1606     203  1.91   152g  B3-mutation-depth
1535     212  2.04   152g  D12-hatburner
1532     204  2.04   153g  E2-chronomancer
1517     176  2.06   155g  D1-warlord
1467     190  2.26   153g  C2-bolt-splash
1460     191  2.26   150g  D7-stormcaller
1432     167  2.40   151g  C3-kit-width
1429     188  2.36   153g  B1-element-depth
1392     205  2.47    88g  A5-spells-only
1387     193  2.54   156g  D2-executioner
1383     182  2.55   147g  A1-items-sustain
1370     186  2.55    98g  A3-elements-only
1369     209  2.60   154g  B2-element-breadth
1346     200  2.69   152g  C7-statue-guard
1334     196  2.68   152g  D3-tycoon
1334     168  2.72   153g  D9-phantom
1327     197  2.78   155g  D10-skirmisher
1323     185  2.75   147g  B6-item-breadth
1305     192  2.81   153g  D5-plaguebearer
1296     199  2.80   151g  A6-no-elements
1288     195  2.86   147g  B5-item-depth
1272     207  2.95   153g  C1-bolt-rush
1269     191  2.94   150g  F4-sword-burst
1250     185  3.00   154g  E1-hastemaker
1249     171  2.99   130g  A4-mutations-only
1247     193  3.02   156g  F1-spoon-volume
1244     200  3.06   147g  D8-juggernaut
1231     184  3.02   152g  B4-mutation-breadth
1222     182  3.07   150g  F3-spoon-burst
1204     195  3.13   152g  D11-spoonbearer
1193     187  3.15   147g  A2-items-mobility
1174     208  3.21   156g  F2-sword-volume
1172     182  3.22   151g  D6-sumo
1171     173  3.22   150g  C5-meteor-value
1125     192  3.36   152g  C6-bolt-combo

unfinished games: 0
```

## Round 24.3 (FINAL shipped state: anger [36,27,20], meteor [25,35] + lv2-only crater, cd normalization, mine cd flat), seed 1 (the standard run)

```
=== strategy ELO: 2000 games, seed 1, 4 random berserker seats/game, elemental ===
Elo from Bradley-Terry over pairwise placements; 1500 = roster average,
+173 = 73% favourite in a pair. games = seats played. place = mean of 1-4.
Bot read ONLY: no target-leading/CC-chaining; reactive tools + contagion at a floor.

elo    games  place  cost  strategy
2899     175  1.04   152g  K5-faker-vendetta
2680     183  1.13   154g  K2-faker-permafrost
2643     186  1.12   151g  K4-faker-galeforce
2603     203  1.11   154g  K3-faker-minefield
2369     173  1.28   150g  K1-faker-hookstorm
1648     181  1.82   151g  C4-boomerang-main
1618     214  1.87   153g  D4-leech
1614     221  1.90   152g  B3-mutation-depth
1535     188  2.13   152g  D12-hatburner
1528     177  2.12   155g  D1-warlord
1501     183  2.22   153g  E2-chronomancer
1468     172  2.33   153g  C2-bolt-splash
1452     176  2.33   150g  D7-stormcaller
1450     201  2.30   151g  C3-kit-width
1433     201  2.35   153g  B1-element-depth
1426     201  2.38   147g  A1-items-sustain
1413     179  2.46   156g  D2-executioner
1391     187  2.53    88g  A5-spells-only
1385     180  2.57    98g  A3-elements-only
1383     178  2.48   152g  C7-statue-guard
1359     187  2.59   154g  B2-element-breadth
1342     208  2.66   151g  A6-no-elements
1340     194  2.70   153g  D5-plaguebearer
1329     184  2.75   152g  D3-tycoon
1315     209  2.74   155g  D10-skirmisher
1313     177  2.79   147g  B6-item-breadth
1313     219  2.76   153g  D9-phantom
1298     189  2.85   147g  B5-item-depth
1290     208  2.88   153g  C1-bolt-rush
1288     196  2.88   150g  F3-spoon-burst
1271     188  2.90   152g  B4-mutation-breadth
1266     180  2.93   150g  F4-sword-burst
1257     188  2.93   147g  D8-juggernaut
1249     170  2.96   154g  E1-hastemaker
1207     187  3.12   130g  A4-mutations-only
1193     210  3.14   147g  A2-items-mobility
1189     191  3.21   156g  F2-sword-volume
1171     201  3.23   156g  F1-spoon-volume
1167     185  3.26   150g  C5-meteor-value
1157     182  3.27   152g  D11-spoonbearer
1149     181  3.29   151g  D6-sumo
1096     207  3.45   152g  C6-bolt-combo

unfinished games: 0
```
