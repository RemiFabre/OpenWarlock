# 2026-08-09 — Strategy ELO tournament #1 (baseline at r200/45b4a48)

**What this is**: the first full-roster ELO run. 28 strategies
(tools/roster.js, level-explicit cores auto-padded to 150-185 g), random
4-strategy Hard-berserker lobbies in elemental mode, 8000 games per seed
(≈1100-1200 seats per strategy per seed), Bradley-Terry strengths fitted from
all pairwise placements, reported on an Elo scale: **1500 = roster average,
+173 ≈ a 73% favourite in a pairwise matchup**. Repro:
`node tools/elo.js --games=8000 --seed=1` (and `--seed=2`).

**What the instrument cannot see** (quote next to every number): bots don't
lead targets, bait, pre-cast, or chain CC windows; reactive tools (shield,
blink, boomerang recall-catch) and cluster value (malady's contagion) read at
a floor; the boomer profile is a KNOWN over-read (nothing dodges a boomerang);
anger saturates simpler instruments. This ranks what BOTS extract from each
strategy at r200's balance numbers (pre any later nerfs).

## The table (seed 1 / seed 2 — sorted by seed-1 Elo)

| strategy | elo s1 | elo s2 | place s1 | cost |
|---|---|---|---|---|
| D3-tycoon | 1909 | 1893 | 1.36 | 155g |
| B3-mutation-depth (anger3 rush) | 1850 | 1877 | 1.48 | 161g |
| B1-element-depth | 1755 | 1749 | 1.72 | 150g |
| C4-boomerang-main ⚠boomer read | 1723 | 1715 | 1.81 | 159g |
| B2-element-breadth | 1703 | 1711 | 1.86 | 153g |
| D1-warlord | 1703 | 1716 | 1.86 | 150g |
| D4-leech | 1701 | 1708 | 1.87 | 153g |
| A3-elements-only (104g shelf!) | 1675 | 1674 | 1.95 | 104g |
| D2-executioner | 1670 | 1649 | 1.97 | 160g |
| C3-kit-width | 1653 | 1653 | 2.02 | 157g |
| A5-spells-only | 1620 | 1596 | 2.12 | 96g |
| C2-bolt-splash | 1617 | 1610 | 2.12 | 160g |
| B4-mutation-breadth | 1508 | 1512 | 2.52 | 159g |
| C6-bolt-combo (Chainer) | 1504 | 1497 | 2.51 | 157g |
| D7-stormcaller | 1473 | 1478 | 2.61 | 156g |
| D9-phantom | 1466 | 1470 | 2.65 | 150g |
| A4-mutations-only | 1433 | 1408 | 2.77 | 130g |
| A6-no-elements | 1432 | 1419 | 2.74 | 159g |
| C1-bolt-rush | 1397 | 1406 | 2.84 | 159g |
| D10-skirmisher | 1393 | 1415 | 2.86 | 153g |
| B6-item-breadth | 1387 | 1381 | 2.87 | 168g |
| B5-item-depth | 1374 | 1385 | 2.91 | 155g |
| A1-items-sustain | 1343 | 1347 | 3.02 | 153g |
| C5-meteor-value | 1234 | 1233 | 3.30 | 150g |
| D8-juggernaut | 1221 | 1228 | 3.36 | 157g |
| D5-plaguebearer ⚠cluster-blind | 1171 | 1190 | 3.44 | 153g |
| D6-sumo ⚠position-blind | 1102 | 1091 | 3.59 | 151g |
| A2-items-mobility | 982 | 991 | 3.77 | 153g |

Zero unfinished games either seed. Cross-seed max drift ≈ 25 Elo — the fit
is stable at this sample size.

## Findings, mapped to Remi's questions

1. **"Items are weaker than elements/mutations" — CONFIRMED, emphatically.**
   Every item-centric strategy sits in the bottom half: items-sustain 1343,
   item-depth 1374, item-breadth 1387, items-mobility DEAD LAST at 982 —
   that's a 25-30% pairwise underdog against an average roster member.
   Meanwhile the pure stat-element shelf (A3) reaches 1675 while costing only
   104 g TOTAL — elements deliver ~1.5× the Elo of items per gold before the
   shelf even runs out. The gap between A3 (elements alone) and A6
   (everything EXCEPT elements) is ~250 Elo: skipping the element shelf costs
   more than skipping any other shelf.
2. **Depth beats breadth — everywhere it can be measured.** Elements:
   depth 1755 vs breadth 1703 (modest). Mutations: depth (anger3 first) 1850
   vs breadth 1508 — a 340-Elo chasm; spreading mutation lv1s wastes their
   scaling. Items: both variants bad, breadth ≈ depth (the shelf itself is
   the problem, not the order).
3. **Spell scaling answered (family C): don't max spells.** Bolt-splash
   (lightning lv1 + stat elements, 1617) beats bolt-rush (lightning maxed
   first, 1397) by ~215 Elo — the lv2/lv3 bolt levels are poor gold next to
   ember/arcane. Kit-WIDTH (five lv1 buttons, 1653) beats every spell-depth
   line. Boomerang-main's high read (1723) carries the standing boomer
   over-read flag. Meteor loses to lightning in the identical CC shell by
   ~270 Elo (C5 1234 vs C6 1504) — and both combo shells rank below their
   non-combo cousins IN BOT HANDS (bots can't chain CC; human read may
   invert this).
4. **The champion is economy, not damage: D3-tycoon (midas+mosquito) #1 both
   seeds.** The income engine converts to the deepest late build — evidence
   that midas's true value was always shopping depth (question E answered in
   midas's favor), and that mosquito-as-gold-amp is its working pairing.
5. **Anger with a sustain shell (B3) is #2** — top-tier but NOT runaway once
   opponents are real strategies instead of single elements: strategy-space
   already prices anger more honestly than the saturated element mirror
   (1850 ≈ 76% pairwise favourite vs average, not 99%). D2-executioner
   (anger + chase mobility) is 180 Elo WORSE than anger + sustain — bots
   don't need boots to claim marks; humans might.
6. **The floor is the known blind spots**: sumo (gale positioning),
   plaguebearer (contagion clusters), juggernaut (defense-first — question H
   confirmed again), skirmisher (reactive mobility). Treat these as
   bot-artifacts pending human play, not as verdicts.

## Standing use

This is the BASELINE at r200. To price any balance change: re-run both seeds
after the change and diff the tables — ~35 min/seed on this machine. The
first scheduled comparison: Remi's planned anger nerf (this table holds
anger's pre-nerf strength at B3 1850/1877, D2 1670/1649).
