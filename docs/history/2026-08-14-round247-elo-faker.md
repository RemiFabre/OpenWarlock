# Round 24.7c: the same roster with EVERY seat on the Faker brain (2026-08-14)

Remi's ask: rerun the 24.7 standard elo with all Hard (berserker) seats
replaced by Faker, and see what moves. Same 53-row roster, same 2500 games,
same seed 1; the ONLY change is `--kind=faker`. Companion tables:
- Hard baseline: `2026-08-14-round247-elo.md` (+ page `...elo-2500g-seed1.html`)
- This run's page: `...elo-2500g-seed1-faker.html`

## How to read this

Same instrument as the standard run (Bradley-Terry over pairwise placements,
1500 = roster average, +173 ≈ 73% favourite, ~190 seats/row, ±40 = noise),
but every pilot is the TOP tier: stalker driving + the combo layer + never
eats a telegraphed bolt (boltDodge 1) + hunts its marks. ⚠ Raw elo is NOT
comparable across the two tables (the K rows gave back ~1200 elo each and
Bradley-Terry hands that mass to everyone else). Compare each row TO
D1-WARLORD in its own table: D1 is 1479 on Hard, 1455 on Faker, the stable
anchor. "Δ vs D1" below = (row − D1), Faker table minus Hard table.

## What moved (vs the D1 anchor, biggest swings)

- **The mark hunts explode when the pilot can actually hunt.**
  D3-tycoon (midas chase): −274 → **+588** (swing +862, the biggest in the
  roster; rank 47 → 3). D2-executioner (anger chase): −72 → +580. M5-midas:
  +102 → +689 (rank 2). M1-anger: +171 → +792 (rank 1). The Hard table's
  "midas chase is a trap" verdict was a PILOT verdict, not a design one:
  with top-tier driving, claiming marks is the best thing in the game.
- **The Faker combo arsenals collapse against equal opponents.**
  K1-hookstorm +959 → −371 (rank 5 → 51), K2-permafrost +1210 → −217,
  K3 +1240 → +148, K4 +1227 → −143. Their round-23/24 dominance was
  driving-gap + preying on worse dodgers; vs peers (everyone boltDodge 1,
  everyone stalker-dodging), telegraphed-bolt combos stop paying. K5 (plain
  anger, no combo reliance) stays the best K row: +1440 → +270.
- **Defense and toughness climb when the enemy aims.** D8-juggernaut −293 →
  +22, D13-bastion −124 → +103 (buttons still beat plain armor), D6-sumo
  −376 → −32, A2-items-mobility −406 → −62 (off last place), A1-sustain
  −142 → +25, B6-item-breadth −258 → +27. The offense-first meta (question
  H) is a MID-SKILL meta; at top skill the item shelf is respectable.
- **Sustain-through-volume collapses.** D4-leech +41 → −146, D11-spoonbearer
  −276 → −270 (still bad), F1-spoon-volume −235 → −271, F2-sword-volume
  −258 → −328, E1-hastemaker −116 → −193, E2-chronomancer +59 → −103.
  Fakers dodge, so per-hit healing income dries up while burst still kills;
  drip-healing kits starve at both ends. ⚠ For D4 note the compounding 24.5
  dive (~−100 on vampire rows on ANY brain).
- **Frost finally pays: −126 → +315.** As suspected, frost's Hard-table
  last place among mutations was the pilot wasting the freeze. Faker
  exploits it (and a frozen target cannot dodge the follow-up). Human value
  is likely between the two reads, closer to this one for good players.
- **Aim-scaling rows rise.** D9-phantom (pierce) −175 → +164; A3-elements
  −27 → +384; B2-element-breadth −54 → +487. Better aim converts stat
  elements into hits.
- **Blood Debt's +243 was half a Hard artifact.** G2-debt: +243 → +123;
  G1-shield: +159 → +140. Vs equal opponents the two reactives converge
  (Δ 17, inside noise) because fewer balls arrive to bank/reflect. Still
  the best two purchases in the Warlord lab on BOTH tables.
- **Stable facts (same answer on both brains, believe these most):**
  arcane in the Warlord shell is ~free to skip (G4: −23 Hard, +37 Faker,
  both ≈ noise); the sword matters on Hard (−94) but barely vs Fakers
  (−19); C6-bolt-combo is last/near-last everywhere; echo is the weakest
  volume mutation for its price on both tables (M4 mid-low twice).

## Raw table (verbatim tool output)

```
=== strategy ELO: 2500 games, seed 1, 4 random faker seats/game, elemental ===
elo    games  place  cost  strategy
2247     207  1.10   166g  M1-anger-first
2144     172  1.15   166g  M5-midas-first
2043     205  1.27   156g  D3-tycoon
2035     186  1.30   156g  D2-executioner
1942     205  1.38   154g  B2-element-breadth
1839     175  1.58    98g  A3-elements-only
1827     169  1.57   166g  M3-malady-first
1787     161  1.69   166g  M6-vampire-first
1782     192  1.68   152g  B3-mutation-depth
1770     206  1.68   166g  M2-frost-first
1725     169  1.79   152g  K5-faker-vendetta
1662     201  1.96   166g  M4-echo-first
1619     212  2.09   153g  D9-phantom
1603     209  2.10   154g  K3-faker-minefield
1595     185  2.14   155g  G1-warlord-shield
1578     179  2.21   155g  G2-warlord-debt
1558     187  2.20   150g  D13-bastion
1518     188  2.38   151g  C4-boomerang-main
1510     178  2.43   153g  D5-plaguebearer
1492     176  2.42   150g  G4-warlord-no-arcane
1482     184  2.43   147g  B6-item-breadth
1480     207  2.56   147g  A1-items-sustain
1477     173  2.52   147g  D8-juggernaut
1459     186  2.57   150g  C5-meteor-value
1455     177  2.56   155g  D1-warlord
1448     198  2.60   150g  F4-sword-burst
1445     202  2.62   153g  B1-element-depth
1436     181  2.62   153g  C2-bolt-splash
1436     170  2.66   155g  G3-warlord-no-sword
1425     215  2.67   147g  B5-item-depth
1423     199  2.64   151g  D6-sumo
1406     191  2.76   151g  A6-no-elements
1400     204  2.78   150g  F3-spoon-burst
1393     194  2.79   147g  A2-items-mobility
1391     186  2.70   150g  D7-stormcaller
1352     183  2.91   153g  C1-bolt-rush
1352     180  2.84   153g  E2-chronomancer
1342     190  2.97   155g  D10-skirmisher
1341     192  2.93   152g  C7-statue-guard
1334     193  2.95   152g  D12-hatburner
1330     165  2.99    88g  A5-spells-only
1312     186  3.03   151g  K4-faker-galeforce
1311     197  3.01   152g  B4-mutation-breadth
1311     182  3.03   151g  C3-kit-width
1309     191  3.05   150g  D4-leech
1262     175  3.15   154g  E1-hastemaker
1238     201  3.27   154g  K2-faker-permafrost
1209     193  3.33   130g  A4-mutations-only
1185     183  3.38   152g  D11-spoonbearer
1184     223  3.37   156g  F1-spoon-volume
1127     186  3.54   156g  F2-sword-volume
1084     188  3.60   150g  K1-faker-hookstorm
1081     163  3.61   152g  C6-bolt-combo

unfinished games: 0
```

## What this pair of tables cannot see

Both are still bots: no baiting, no human creativity, no tilt, no teams.
The Faker table over-weights what a scripted top pilot extracts (perfect
bolt dodges, perfect mark hunts); real strong humans sit between the two
tables, and REAL beginners sit below the Hard one. The K rows' collapse
here does NOT mean combos are weak in live play: it means they are weak
against opponents who never eat the bolt, which describes no human.

## The one-line takeaways

1. The meta is skill-dependent by design and the two tables bracket it:
   offense/volume wins at mid skill, marks/aim/toughness win at top skill.
2. Midas needs no buff; it needed a pilot. D3 stands rehabilitated.
3. Frost is fine; Hard bots slander it.
4. Echo and C6-bolt-combo are weak on BOTH tables: real candidates.
5. Debt/Shield stay the best Warlord purchases everywhere; watch in live
   play, price later if humans confirm.
