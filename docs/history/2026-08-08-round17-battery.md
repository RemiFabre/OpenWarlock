# Round 17 — the Session B battery and the retunes it forced (2026-08-08)

*Full numbers behind BALANCE.md's round-17 state. Everything here ran headless
with fixed seeds. The main battery ran in a worktree pinned at `12ba6d3`
(§5–§9 shipped, PRE-softmax bots); the final tables at the bottom re-ran at
`62de05b` (softmax bots + the venom retune) and are the current truth.*

## Setup

- Mixed element table: `tools/arena.js --mode=elemental --games=800`, seeds 1
  and 7 — one element per seat, 4 Hard berserker/bruiser, baseline 25%.
- Strategy study: `tools/strategy-study.js --games=4000`, seeds 1 and 7 (Hard)
  plus `--games=2000 --kind=stalker` (Extreme).
- Item ladder: `tools/arena.js --ladder=all --games=1500 --seed=1`.
- Round-1 first-death median: 300 seeded 4-berserker games, elemental
  (scratch script; the §9 re-check — the regen lock exists for this number).

## Headlines

1. **Question J CLOSED.** The haste conversion (§4) + the midas mark (§5)
   deleted the degenerate economy builds outright:
   midas-cdr **86.2 → 24.3 / 24.3** (seeds 1/7, i.e. exactly baseline),
   mosquito-midas 70.0 → 29.8, double-cdr 49.1 → 10.5/12.9, cadence 39.9 →
   11.3. Nothing engine-shaped remains around midas income.
2. **Venom failed its §7 target at the FIRST TRY ticks** — 96.3/96.7% mixed
   (WORSE than round 16's 91.8 despite the de-stack), venom strategies the
   whole podium (venom-balanced 76.9/77.6). Two mechanisms measured:
   - Tick volume: lv3 was 3 dps × 5 s refreshed ≈ 15 damage riding every hit.
   - Regen denial: every tick re-arms the §9 FULL-STOP lock, so a poisoned
     target heals zero, permanently. Measured the tick↔lock interaction alone
     (ticks exempted from the lock, code variant): venom 96.3 → **88.6** —
     real but NOT the engine. The ticks are.
3. **The tick sweep is strongly monotone now that stacking is gone** (round 16
   it wasn't — the stack was the power): [1,2,3] 96.3 · [0.7,1.4,2] 78.6 ·
   **[0.5,1,1.5] 55.7 = shipped** (out of the 90s, #2, top-third — the target).
   dotTime 3 s at full ticks measured 75.6 (weaker lever, not used).
4. **First blood is safe**: round-1 first-death median 34.3 s (p25 29.3 /
   p75 37.9) vs ~31 s before the full-stop lock. The lock still does its job.
5. **Momentum inherits the crown on bot tables** — 68.8/65.5 mixed at FIRST
   TRY tiers, rising to 87.3 once venom is tamed (zero-sum table). Threshold
   sweep tierHits [40,90,150] → [60,130,220] (under tamed venom): 87.3 →
   72.2, still #1. BUT the strategy table says momentum-rush is healthy, not
   degenerate (28.5/24.5 Hard, 33.9 Extreme vs 2.7 in round 16), and the
   mixed number is carried by bot carriers landing a median 172 hits/game —
   humans land a small fraction of that and mostly see tier 1. Flagged as a
   bot-inflated reading, NOT auto-nerfed (the round-12 rule); Remi's feel
   report decides. Levers if wanted: tierHits (measured above) or tierDmg.
6. **The §9 sustain target cannot be judged from this ladder.** At `12ba6d3`
   (venom 96%): amulet lv0 0.4%, sword lv0 2.7%, hourglass lv0 9.5% — all
   below the ≥15% ruling — and ring INVERTED (lv0 34.7, lv3 14.9: maxing it
   is dead gold). But flat HP is the only defense against permanent regen
   denial, so venom was force-multiplying the amulet. Re-measured at HEAD
   after the venom retune — see the final tables below.

## Strategy study, Hard seed 1 (4000 games; seed 7 within ±5 on every row)

| win% | strategy | | win% | strategy |
|---|---|---|---|---|
| 76.9 | venom-balanced | | 24.3 | midas-cdr |
| 67.3 | venom-ember | | 24.3 | spell-kit |
| 57.1 | venom-dot | | 19.9 | frost-gale |
| 55.1 | mosquito-combo | | 14.5 | vampire-brawler |
| 50.9 | vampire-cadence | | 11.3 | cadence |
| 34.5 | glass-cannon | | 10.5 | double-cdr |
| 31.9 | balanced | | 9.2 | ghost-sniper |
| 29.8 | mosquito-midas | | 9.1 | ember-tank |
| 29.6 | cdr-balanced | | 6.3 | gale-launcher |
| 28.9 | all-cheap | | 3.7 | tank-sustain |
| 28.5 | momentum-scaling | | 3.5 | midas-economy |
| | | | 3.1 | item-breadth |
| | | | 2.9 | frost-control |
| | | | 1.2 | no-elements |

(Pre-venom-retune: the venom rows are what 96% mixed looks like with real
builds. Everything else is the current shape of the meta.)

Extreme (2000 games, stalker): all-cheap 69.1 tops (skill scales breadth),
venom trio 46.6–57.8, midas-cdr 32.3, momentum-scaling 33.9 — no 90s anywhere.

Lava kill share 22.6% (Hard study). Comeback rate 21.7% (arena smoke).

## Mixed element table (seed 1 / seed 7, 800 games each, at `12ba6d3`)

| element | s1 | s7 | | element | s1 | s7 |
|---|---|---|---|---|---|---|
| venom | 96.3 | 96.7 | | gale | 6.7 | 7.3 |
| momentum | 68.8 | 65.5 | | ghost | 4.2 | 2.2 |
| mosquito | 37.2 | 32.5 | | frost | 3.4 | 2.7 |
| ember | 27.2 | 27.7 | | terra | 2.8 | 1.1 |
| vampire | 17.7 | 14.9 | | midas | 0.4 | 0.4 |
| arcane | 11.7 | 10.5 | | | | |

Ember 61.5 → 27.4 mean: the §8 trim landed where intended. Midas's 0.4 is the
familiar gold-saturation floor (avg-gold 40-47 with nothing to buy), now
deepened by the mark halving income — real-lobby value rides on question E's
"is there something to spend on", not this floor.

## Venom sweeps (600 games, seed 1, mixed table, at `12ba6d3`)

| tickDmg | venom | notes |
|---|---|---|
| [1, 2, 3] (first try) | 96.3 | shipped §7 values |
| [0.7, 1.4, 2] | 78.6 | |
| **[0.5, 1, 1.5]** | **55.7** | **shipped** — #2 behind momentum 87.3 |
| [1,2,3] + dotTime 3 | 75.6 | duration is the weaker lever |
| [1,2,3], ticks don't re-arm the regen lock | 88.6 | design variant, NOT shipped — the interaction is worth ~8 points, the ticks are the engine |

## Final tables at HEAD `62de05b` (softmax bots + venom [0.5,1,1.5])

Mixed element table (800 games × seeds 1/7):

| element | s1 | s7 | | element | s1 | s7 |
|---|---|---|---|---|---|---|
| momentum | 85.9 | 89.2 | | gale | 8.0 | 6.5 |
| venom | 64.7 | 57.9 | | frost | 5.4 | 2.3 |
| mosquito | 39.6 | 37.9 | | ghost | 3.5 | 3.3 |
| ember | 28.9 | 27.0 | | terra | 2.5 | 2.2 |
| vampire | 20.8 | 20.7 | | midas | 0.0 | 0.4 |
| arcane | 13.7 | 11.9 | | | | |

Venom holds its target under the new bots (out of the 90s, #2, top-third).
Momentum is the table's #1 at 85.9/89.2 — carried by bot hit volume (median
172 landed/game), flagged for Remi's ruling, not auto-nerfed.

Item ladder (1500 games, seed 1 — win% of the seat capped at that level):

| item | lv0 | lv1 | lv2 | lv3 |
|---|---|---|---|---|
| boots | 27.7 | 26.7 | 24.9 | 20.7 |
| treads | 38.5 | 27.9 | 19.9 | 13.7 |
| amulet | 12.9 | 22.9 | 31.1 | 33.1 |
| ring | 30.3 | 28.6 | 23.3 | 17.7 |
| cape | 51.2 | 28.7 | 14.0 | 6.1 |
| sword | 1.3 | 15.7 | 34.7 | 48.2 |
| hourglass | 7.1 | 14.3 | 27.1 | 51.5 |

vs the pre-venom-retune ladder (amulet lv0 0.4, ring inverted 34.7/14.9): the
venom fix un-warped sustain — amulet lv0 12.9 ≈ the ~15% ruling, ring free.
Sword (lv0 1.3) and hourglass (lv0 7.1) still fail "no mandatory items";
their trims were swept next — see the shipped values in constants.js and the
sweep rows below.

Item sweeps (1500-game single-item ladders, seed 1, lv0 = forbidden seat):

| override | lv0 | lv1 | lv2 | lv3 | verdict |
|---|---|---|---|---|---|
| sword.lifesteal [0.15,0.25,0.32] | 2.5 | 16.4 | 34.0 | 47.1 | not shipped |
| sword.lifesteal [0.12,0.20,0.28] | 5.7 | 17.8 | 31.3 | 45.2 | not shipped |
| hourglass.haste [10,20,30] | 8.6 | 18.1 | 31.7 | 41.6 | not shipped |
| **hourglass.haste [8,18,28]** | **12.9** | 19.5 | 26.5 | 41.1 | **shipped** |

The sword's knob barely moves its seat (1.3 → 5.7 for a −33% cut at lv3):
under the FULL-STOP regen lock, lifesteal is the only heal that works while
you are being hit, so the item is mandatory by STRUCTURE, not by number.
Options are design-shaped (lifesteal under some lock of its own; a weaker
lock; accept the sword as the one true item) — Remi rules. §9's own letter
protects it: "touch the sword only if active lifesteal fails to out-heal
passive play" — it does not fail.
