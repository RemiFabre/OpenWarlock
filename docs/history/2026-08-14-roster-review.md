# Roster review: all 42 elo strategies after rounds 24-24.4 (2026-08-14)

Remi asked for a pass over every strategy in the elo roster (tools/roster.js)
in the light of this week's changes: vampire mark-and-feast, midas gold hunt,
mark-hunting Hard+ bots, meteor craters, the 1/x cadences, and the 24.4 bot
pass (wounded dive deleted, prowl rings Hard 12 / Normal 18).

**How to read the chart.** "Elo" is the 24.4 re-baseline (2000 games, seed 1,
the standard run; full table at the bottom): 1500 = roster average, ~±40
between neighbours is noise, and it re-baselines EVERYTHING because the Hard
pilots all bots share just changed. "Build" decodes the core buy order (the
padder tops every core to 150-185 g with items). "Proposal" is what I would
change; nothing here is applied yet.

**The one structural finding first**: the 24.4 ring change (Hard prowls at 12)
moved bot fights OUTSIDE every radius-7 aura. D4-leech (vampire) fell
1618 -> 1427 and D12-hatburner 1535 -> 1422 in one day with zero balance
changes to their kits. That is the bot-flattering of feast/aura builds
deflating, not a nerf; expect human play to sit above these rows now.

## Family A: system purity probes (keep all six; they are instruments)

| strategy | Elo | build today | proposal | comment |
|---|---|---|---|---|
| A1-items-sustain | 1395 | amulet/sword/spoon to 3, cape 2, hourglass 2 | keep | the sustain-shelf price; moves only when items move |
| A2-items-mobility | 1148 | boots/treads/cape/hourglass maxed | keep | bottom by design: mobility is human-flavored; the row is the floor stated |
| A3-elements-only | 1367 | one of each stat axis, then depth (98 g, exhausts) | keep | purity probe |
| A4-mutations-only | 1168 | anger/frost to 3, malady 3, mosquito 3, midas 3 (130 g) | keep | purity probe; will drift with the midas/anger cadences |
| A5-spells-only | 1407 | lightning/boomerang to 3, shield 2, rush 2, blink 2 (88 g) | keep | purity probe; remarkably strong for 88 g |
| A6-no-elements | 1355 | items + spells, elements refused | keep | the control that prices the element shelf by absence |

## Family B: depth vs breadth (keep all six)

| strategy | Elo | build today | proposal | comment |
|---|---|---|---|---|
| B1-element-depth | 1492 | ember 3 + arcane 3 first, sword/amulet after | keep | |
| B2-element-breadth | 1355 | lv1 of every stat axis before any lv2 | keep | depth still beats breadth: the question keeps being answered the same way, which is the point of keeping the pair |
| B3-mutation-depth | 1568 | anger 3 first, amulet/sword to 3 | keep | the anger benchmark; K5 is this exact list on the Faker brain |
| B4-mutation-breadth | 1262 | lv1 of five mutations first | keep | |
| B5-item-depth | 1341 | sword 3 + amulet 3 first | keep | |
| B6-item-breadth | 1317 | one of all eight items first (147 g, exhausts) | keep | |

## Family C: spell probes (keep six, refresh one)

| strategy | Elo | build today | proposal | comment |
|---|---|---|---|---|
| C1-bolt-rush | 1336 | lightning 3 immediately, hourglass shell | keep | spell-depth probe |
| C2-bolt-splash | 1508 | lightning 1 + ember shell | keep | C1's control; the pair still says "lv1 as a tool wins" |
| C3-kit-width | 1355 | five buttons at lv1 + ember shell | keep | |
| C4-boomerang-main | 1655 | boomerang 3 + ember shell | keep, keep the flag | best non-Faker row, and STILL bot-flattered: Hard dodges no projectiles. Not a balance signal |
| C5-meteor-value | 1176 | frost 3 + meteor 2 + terra 2 | **refresh the tests text** | the row now prices meteor 25/35 AND the lv2 crater; it did not move (1167 -> 1176) because bots only cast meteor into holds, and holds got rarer at ring 12. Floor read, state it |
| C6-bolt-combo | 1103 | frost/gale/lightning/mosquito all to 3 | keep, keep the flag | the human chainer build; bots cannot chain CC, so the bottom rank is the stated floor, not a verdict |
| C7-statue-guard | 1442 | statue 2 panic button + ember shell | keep | |

## Family D: archetypes (ten keep, one redesign, one watch)

| strategy | Elo | build today | proposal | comment |
|---|---|---|---|---|
| D1-warlord | 1559 | ember 3, sword/amulet 3, arcane 2 | keep | the plain-numbers reference shell other rows should A/B against |
| D2-executioner | 1413 | anger 3 + boots 3 + ghost 3 (built to chase) | keep, refresh tests text | 24.1 gave Hard+ native mark hunting, so "built for the chase" is partly in the brain now; the row still prices chase ITEMS |
| D3-tycoon | 1337 | midas 3 + mosquito 2 + hourglass | **REDESIGN** | the shell is stale: mosquito/hourglass amplified per-HIT midas, they do nothing for the timed hunt. Proposal: midas 3 on D1's exact shell, so D3 vs D1 becomes a clean one-variable "is midas worth its 26 g" |
| D4-leech | 1427 | vampire 3 + mosquito 3 (pairs = double marks) | keep as the synergy row | fell 191 with the ring change (bots stopped standing in their own feast ring); the SYNERGY question it asks is still live. See the proposed V-row below for the pure version |
| D5-plaguebearer | 1309 | malady 3 + terra 3 + treads | keep | contagion floor row |
| D6-sumo | 1171 | gale 3 + cape 3 + treads | keep, watch | bottom-3 for months, but nothing else prices gale-vs-cape knockback economics; delete only if we stop caring about that question |
| D7-stormcaller | 1463 | arcane 3 + lightning 3 + hourglass 3 | keep | CDR x one spell |
| D8-juggernaut | 1254 | amulet/cape/treads/sword maxed | keep | the offense-first meta probe by its opposite |
| D9-phantom | 1343 | ghost 3 + ember 3 | keep | pierce floor read |
| D10-skirmisher | 1370 | boots + rush + blink + ember | keep | |
| D11-spoonbearer | 1180 | spoon 3 + frost 3 + gale 3 | keep | the spoon premise row |
| D12-hatburner | 1422 | brazier 3 + malady 3 | keep, note | fell 113 with ring 12 (bots now prowl outside their own hat); floor read now, say so when quoting |

## Family E and F: answered questions (trim three rows)

| strategy | Elo | build today | proposal | comment |
|---|---|---|---|---|
| E1-hastemaker | 1329 | arcane 3 + hourglass + mosquito 3 + kit | **DELETE** | strictly a less informative sibling: F1/F2 run the same haste-volume shell as an actual A/B, D7 covers CDR depth, E2 covers CDR width. Question M has three better answers |
| E2-chronomancer | 1498 | hourglass 3 + arcane 3 + five buttons | keep | the CDR x width point stays |
| F1-spoon-volume | 1214 | haste-volume kit + spoon 3 (sword banned) | keep | the standing sustain A/B |
| F2-sword-volume | 1208 | same kit + sword 3 (spoon banned) | keep | 6 Elo apart: the items are priced right, which is worth re-checking every big round |
| F3-spoon-burst | 1272 | big-hit kit + spoon 3 | **DELETE** | the burst pair answered the same as the volume pair in every table since 21.8 (sword ~= spoon in both shells). The question is answered; two rows of noise |
| F4-sword-burst | 1317 | big-hit kit + sword 3 | **DELETE** | with F3 |

## Family K: Faker arsenals (keep all five)

| strategy | Elo | build today | proposal | comment |
|---|---|---|---|---|
| K1-faker-hookstorm | 2444 | swap 3 + lightning 3 + meteor 2 | keep | |
| K2-faker-permafrost | 2600 | frost 3 + lightning 3 + hourglass 3 | keep | |
| K3-faker-minefield | 2633 | nova 2 + swap 3 + lightning 2 | keep, note | mine cd went flat 9 in 24.3 (small nerf); row absorbed it |
| K4-faker-galeforce | 2662 | gale 3 + lightning 3 + arcane 2 | keep | |
| K5-faker-vendetta | 2825 | B3's exact list on the Faker brain | keep | the roof of the table; the piloting-vs-combos benchmark |

## Proposed additions (two)

- **V1-nosferatu** (working name): vampire 3 on D1-warlord's exact shell
  (ember 2-3, sword/amulet ladder). The rework's whole goal was "vampire
  playable regardless of build"; nothing tests that. V1 vs D1 is the clean
  one-variable read, and V1 vs D4 prices the mosquito synergy specifically.
- **D13-headhunter**: anger 3 + midas 3 + sword/amulet. Both timed hunts on
  one kit: with 24.1's mark-hunting brain the bot nearly always has a mark to
  chase, so this prices the whole hunt economy (and whether stacking two
  cadences beats maxing one).

## Gaps the roster CANNOT cover yet (needs bot piloting, not rows)

Blood Debt (main spell since round 23) and Genki (same) have ZERO lab
coverage because no bot brain casts them; a roster row would just buy dead
gold. Same for Fire Walk, Mine-as-non-Faker, Decoy, vanish, walls, repulse.
The two mainline spells are the real blind spots: if we ever teach the
berserker one new button, Blood Debt (absorb window on "projectile inbound",
the same read as statue's panic button) is the highest-value candidate.

## Net effect if all proposals land

42 rows -> 41 (delete E1, F3, F4; add V1, D13; redesign D3 in place). Elo
re-baselines anyway at every roster edit, so the right moment is one batch.

## The 24.4 re-baseline table this review used (2000 games, seed 1)

```
elo    games  place  cost  strategy
2825     175  1.06   152g  K5-faker-vendetta
2662     186  1.11   151g  K4-faker-galeforce
2633     203  1.10   154g  K3-faker-minefield
2600     183  1.16   154g  K2-faker-permafrost
2444     173  1.25   150g  K1-faker-hookstorm
1655     181  1.80   151g  C4-boomerang-main
1568     221  2.00   152g  B3-mutation-depth
1559     177  2.03   155g  D1-warlord
1508     172  2.19   153g  C2-bolt-splash
1498     183  2.21   153g  E2-chronomancer
1492     201  2.17   153g  B1-element-depth
1463     176  2.30   150g  D7-stormcaller
1442     178  2.28   152g  C7-statue-guard
1427     214  2.40   153g  D4-leech
1422     188  2.47   152g  D12-hatburner
1413     179  2.45   156g  D2-executioner
1407     187  2.47    88g  A5-spells-only
1395     201  2.48   147g  A1-items-sustain
1370     209  2.55   155g  D10-skirmisher
1367     180  2.63    98g  A3-elements-only
1355     208  2.63   151g  A6-no-elements
1355     187  2.61   154g  B2-element-breadth
1355     201  2.62   151g  C3-kit-width
1343     219  2.66   153g  D9-phantom
1341     189  2.71   147g  B5-item-depth
1337     184  2.73   152g  D3-tycoon
1336     208  2.73   153g  C1-bolt-rush
1329     170  2.70   154g  E1-hastemaker
1317     177  2.78   147g  B6-item-breadth
1317     180  2.77   150g  F4-sword-burst
1309     194  2.81   153g  D5-plaguebearer
1272     196  2.94   150g  F3-spoon-burst
1262     188  2.95   152g  B4-mutation-breadth
1254     188  2.96   147g  D8-juggernaut
1214     201  3.11   156g  F1-spoon-volume
1208     191  3.17   156g  F2-sword-volume
1180     182  3.22   152g  D11-spoonbearer
1176     185  3.24   150g  C5-meteor-value
1171     181  3.23   151g  D6-sumo
1168     187  3.25   130g  A4-mutations-only
1148     210  3.29   147g  A2-items-mobility
1103     207  3.43   152g  C6-bolt-combo

unfinished games: 0
```
