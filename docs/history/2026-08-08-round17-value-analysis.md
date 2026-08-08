# Round 17 — upgrade VALUE analysis: dps math + staged duels (2026-08-08)

*Remi asked for intuition about what each purchase is WORTH — not win rates in
full games, but damage/tankiness math plus gold-matched duels at early/mid/
late snapshots. Two instruments here, each section defines its own numbers.*

## 1. Sustained damage per second (pure math from `shared/constants.js`)

*dps = damage per landed hit ÷ cooldown, assuming every cast lands (bot-like;
scale down uniformly for humans — the RANKING is the point). Δdps/10g = extra
dps over the bare ball, per 10 gold — the value-density column. Base elemental
ball: 7 dmg / 2.1 s = 3.33 dps.*

| option | dps | cost | Δdps/10g | note |
|---|---|---|---|---|
| bare fireball | 3.33 | 0 | — | |
| ember lv1 | 3.81 | 6 | 7.9 | |
| ember lv3 | 5.24 | 16 | 11.9 | |
| arcane lv1 | 3.93 | 6 | 10.0 | |
| arcane lv2 | 4.40 | 11 | 9.7 | |
| hourglass lv3 (ball only) | 4.20 | 26 | 3.3 | also hastens the whole kit |
| arcane2 + hourglass3 | 5.27 | 37 | 5.2 | the whole cadence stack |
| momentum lv1, tier 1 (40 hits) | 4.29 | 10 | 9.5 | |
| **momentum lv1, tier 3 (150 hits)** | **7.62** | **10** | **42.9** | ~4× anyone's value density |
| momentum lv3, tier 3 | 9.05 | 26 | 22.0 | beats the CLASSIC lv3 ball (8.75) |
| venom lv1 sustained | 3.33 | 10 | 0.0 | single-target: a wash |
| venom lv3 sustained | 4.33 | 26 | 3.8 | + smear + credit + trail (not dps) |
| mosquito lv3 cycle | 6.46 | 26 | 12.0 | needs 2 hits on the SAME target |
| classic fireball lv3 | 8.75 | 16 | 33.9 | classic-mode reference |

Reading: **momentum's mixed-table 86% is not mysterious — at tier 3 it sells
double the field's dps for 10 gold**, more than a classic maxed fireball, in
a mode where everything else caps ~5.2. The entire question is whether you
reach 150 landed hits: bots always do (172 median/game), humans usually don't.
**Venom's single-target dps is mediocre on purpose** — its wins come from the
things this table can't price: 100% uptime after disengage, burning three
enemies in parallel, and lethal-tick kill credit.

## 2. Tankiness (base 100 HP; passive regen NO LONGER EXISTS)

- **Amulet** +18/+32/+42 max HP for 12/24/36 g — flat +18/32/42% effective HP.
- **Blood Sword** heals lv1/2/3 = 18/30/38% of damage dealt. At a realistic
  5 dps output that is 0.9/1.5/1.9 hp/s — over a 40 s fight ≈ 76 hp at lv3,
  MORE than a maxed amulet grants, and it scales with your offense. It is the
  only healing in the game now; that is its (structural) mandatory-ness.
- **Treads**: lava 14 → 7/5/3.9 dps (lava-only). **Cape**: −8/15/20% knockback
  (positional survival, no HP math). That is the entire defense shelf.

## 3. Staged duels (`tools/duel.js` — new lab)

*Two identical Hard bots, 1v1 to the first death, SAME gold spent down two
different priority lists (kits printed by the tool). win% vs FIELD = mean
across all pairings, 50% = average kit. 60 duels per pair per stage, seats
alternated. What 1v1 CANNOT see: venom's multi-target smear, gale ring-outs,
economy — and bot duels overprice raw dps. Momentum's banked hits are stated
inputs (bot-paced).*

| archetype | EARLY 20 g (15 hits) | MID 60 g (80 hits) | LATE 110 g (160 hits) |
|---|---|---|---|
| ember | **76.7** | 71.7 | 52.8 |
| mosquito | 66.0 | **72.6** | 76.7 |
| cadence | 60.0 | 62.9 | 18.8 |
| momentum | **13.1** | 64.0 | **99.3** |
| venom | 47.4 | 46.7 | 29.4 |
| vampire | 52.4 | 28.1 | 27.0 |
| tank (amulet) | 51.0 | 24.5 | 39.2 |
| lifesteal (sword) | 33.6 | 29.5 | 56.8 |

The arcs, in words:

- **Momentum is a time machine**: the worst early buy in the game (13% — dead
  gold until 40 hits), average at mid, and at late it won 695 of 700 decided
  duels (TTK 27.6 s vs everyone's ~50). Bot games spend most of their length
  in "late", hence the 86% mixed table; a human game mostly lives in "mid".
- **Ember is the honest early axis** (76.7 early, fading to 52.8 as flat +4
  gets outscaled) — exactly what a cheap flat stat should do.
- **Cadence collapses late** (18.8): multiplying a 7-damage ball can't race
  flat +9s, and haste's kit-wide value doesn't exist in a thin duel kit.
  (Context for question M.)
- **Venom reads weak in 1v1 at every stage** — confirming its real value is
  the multi-target/credit machinery this lab deliberately can't see.
- **Defense doesn't win duels**: tank and vampire sink mid/late; lifesteal
  alone climbs (33.6 → 56.8) because longer, bloodier fights feed it. With
  regen gone these four rows ARE the whole defense economy.

## Where this points (intuitions, not actions)

1. Momentum's problem/feature is the TIER-3 CLIFF, not the element: everything
   before 150 hits is fair. Levers if wanted: threshold, tier-3 bonus, or
   making tier bonuses cost gold (deeper level gating).
2. Venom is now shaped right: bad duelist, good arsonist.
3. The defense shelf is thin by construction (amulet/sword/treads/cape and
   nothing else). If tankiness should be an archetype, it needs a new tool,
   not bigger numbers on these.
4. Cadence's late-game falloff is real (question M's evidence).

Repro: `node "$scratch/value.mjs"` (analytic; or recompute by hand from
constants.js) · `node tools/duel.js --games=60 --seed=1`.
