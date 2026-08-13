# Strategy ELO, round 23: the Faker brain on the best anger build (2026-08-13)

**Question (Remi).** How strong is the ANGER element in the hands of the FAKER
bot tier? The four Faker-family rows crush the rest of the table, but none of
them holds anger; the best anger row (B3) runs on a Hard brain.

**What was added.** One roster row, `K5-faker-vendetta`: the Faker brain
(stalker-grade dodging + the combo layer, `kind: 'faker'` like K1-K4) piloting
the EXACT shopping list of `B3-mutation-depth`, the best anger row of the r353
table (rank 6 of 41 at 1631/1629). Decoded, that list is: anger to lv3 FIRST
(the mark hunt: a red mark on a random enemy every 30/25/20 s, claiming it is
+0.5 fireball damage forever), then Health Amulet and Blood Sword interleaved
to lv3, boots 2, cape 1; the auto-padder then fills with the standard item
order. Core + pad are byte-identical to B3's, so B3 in the same table is the
same shopping list on the Hard (berserker) brain. All cores:
`docs/ARCHETYPES.md` (regenerated).

**Protocol.** The standard run, exactly: `node tools/elo.js --games=2000
--seed=1` (Remi's 2026-08-13 convention; raw numbers only, no re-centring or
adjustment of any kind). Random 4-of-42 elemental lobbies, Hard bots except
the five K rows (each pins its own Faker brain), Bradley-Terry over pairwise
placements, Elo-scaled so 1500 = the average of THIS 42-row roster and +173 =
a 73% pairwise favourite. 0 unfinished games.

**⚠ This run includes today's balance changes**, which the r353 baseline does
NOT: lava 14 -> 16 DPS and Lava Treads nerfed to 25/40/50% resistance
(`lavaMult` [0.75, 0.60, 0.50], commit 7e3bbdf). Raw comparisons to r353 also
carry two instrument shifts: 2000x1 games instead of 8000x2, and a 42nd
2700-class row dragging the pinned 1500 mean, which pushes every other raw
number down. Both stated, neither corrected (per the raw-numbers ruling).

## The table

Raw `tools/elo.js` output: Elo per strategy (1500 = this roster's average,
+173 = 73% pairwise favourite), from 2000 random 4-of-42 elemental lobbies,
seed 1, Hard seats except the K rows (Faker brain). `games` = seats played,
`place` = mean finish 1-4 (lower is better), `cost` = padded core gold.

| # | strategy | elo | games | place | cost |
|---|---|---|---|---|---|
| 1 | K5-faker-vendetta | 2783 | 175 | 1.07 | 152g |
| 2 | K2-faker-permafrost | 2682 | 183 | 1.12 | 154g |
| 3 | K4-faker-galeforce | 2653 | 186 | 1.12 | 151g |
| 4 | K3-faker-minefield | 2625 | 203 | 1.10 | 154g |
| 5 | K1-faker-hookstorm | 2420 | 173 | 1.27 | 150g |
| 6 | C4-boomerang-main | 1620 | 181 | 1.87 | 151g |
| 7 | B3-mutation-depth | 1560 | 221 | 2.02 | 152g |
| 8 | D1-warlord | 1552 | 177 | 2.05 | 155g |
| 9 | D12-hatburner | 1533 | 188 | 2.12 | 152g |
| 10 | E2-chronomancer | 1518 | 183 | 2.16 | 153g |
| 11 | C2-bolt-splash | 1473 | 172 | 2.29 | 153g |
| 12 | C3-kit-width | 1463 | 201 | 2.25 | 151g |
| 13 | D7-stormcaller | 1456 | 176 | 2.31 | 150g |
| 14 | B1-element-depth | 1444 | 201 | 2.32 | 153g |
| 15 | D3-tycoon | 1442 | 184 | 2.37 | 152g |
| 16 | D2-executioner | 1410 | 179 | 2.46 | 156g |
| 17 | A5-spells-only | 1405 | 187 | 2.47 | 88g |
| 18 | A1-items-sustain | 1398 | 201 | 2.47 | 147g |
| 19 | D4-leech | 1397 | 214 | 2.51 | 153g |
| 20 | C7-statue-guard | 1387 | 178 | 2.48 | 152g |
| 21 | A3-elements-only | 1365 | 180 | 2.64 | 98g |
| 22 | B2-element-breadth | 1364 | 187 | 2.58 | 154g |
| 23 | D10-skirmisher | 1336 | 209 | 2.67 | 155g |
| 24 | B6-item-breadth | 1328 | 177 | 2.74 | 147g |
| 25 | A6-no-elements | 1319 | 208 | 2.75 | 151g |
| 26 | D5-plaguebearer | 1314 | 194 | 2.78 | 153g |
| 27 | D9-phantom | 1312 | 219 | 2.77 | 153g |
| 28 | B5-item-depth | 1303 | 189 | 2.84 | 147g |
| 29 | B4-mutation-breadth | 1295 | 188 | 2.82 | 152g |
| 30 | C1-bolt-rush | 1284 | 208 | 2.90 | 153g |
| 31 | E1-hastemaker | 1273 | 170 | 2.90 | 154g |
| 32 | F4-sword-burst | 1273 | 180 | 2.91 | 150g |
| 33 | F3-spoon-burst | 1266 | 196 | 2.96 | 150g |
| 34 | D8-juggernaut | 1248 | 188 | 2.98 | 147g |
| 35 | F2-sword-volume | 1241 | 191 | 3.06 | 156g |
| 36 | A4-mutations-only | 1222 | 187 | 3.08 | 130g |
| 37 | C5-meteor-value | 1211 | 185 | 3.14 | 150g |
| 38 | F1-spoon-volume | 1210 | 201 | 3.12 | 156g |
| 39 | A2-items-mobility | 1185 | 210 | 3.18 | 147g |
| 40 | D11-spoonbearer | 1172 | 182 | 3.25 | 152g |
| 41 | D6-sumo | 1155 | 181 | 3.28 | 151g |
| 42 | C6-bolt-combo | 1105 | 207 | 3.44 | 152g |

## Where the new row landed

The numbers below are raw Elo gaps read off the table above (same fit, same
run); on this scale +173 = a 73% pairwise favourite. The baseline for each
gap is named in each line.

- **Rank 1 of 42 at 2783, mean finish 1.07** (best in the table on both
  measures).
- **vs the other Faker rows**: +101 over K2-faker-permafrost (2682; frost 3 +
  lightning 3 + hourglass 3), +130 over K4-faker-galeforce (2653; gale 3 +
  lightning 3 + arcane 2), +158 over K3-faker-minefield (2625; lightning 2 +
  Mine 2 + Switcheroo 3 + ember 2), +363 over K1-faker-hookstorm (2420;
  lightning 3 + Switcheroo 3 + meteor 2 + ember 2). A +101 gap reads as about
  a 64% pairwise favourite.
- **vs the best non-Faker rows**: +1163 over C4-boomerang-main (1620;
  boomerang 3 + ember 3 + sword/amulet, this run's top Hard-brain row) and
  +1223 over B3-mutation-depth (1560), which is the SAME shopping list as K5
  on the Hard brain. The brain swap alone is worth the entire Faker-tier gap
  on an unchanged 152 g purchase.

## What the instrument cannot see

- **No bot hunts the anger mark.** `PREY_MARKS` in `shared/sim.js` (the
  target-preference list) is frost/gale/midas/malady; anger is absent, so
  K5's claims come from ordinary aggression landing on whoever happens to be
  marked. A pilot who actually chases marks claims faster, so 2783 is a FLOOR
  for the build's mark economy under this brain.
- **K5 holds no combo arsenal.** Its kit is anger + items only (no lightning,
  Switcheroo or Mine), so the Faker's combo layer has almost nothing to fire;
  the score is essentially stalker-grade dodging + the permanent anger damage
  ramp + sword/amulet sustain.
- **One seed, 2000 games** (~170-220 seats per row): the r353 protocol
  measured cross-seed drift mean 11, max 38 at 8000x2; a single 2000-game
  seed is noisier than that and cannot measure its own drift. Gaps of ~100+
  between K rows should be read with that in mind.
- **Bots cannot price reactive skill** (standing rule): what any of this is
  worth against humans is not measured here.

## Repro

```bash
node tools/elo.js --games=2000 --seed=1
```

Roster row: `K5-faker-vendetta` in `tools/roster.js` (family K, kind faker,
core identical to B3-mutation-depth). Baseline table:
`docs/history/2026-08-13-round22.5-elo.md` (r353, 41 rows, pre lava/treads
change, 8000x2 protocol).
