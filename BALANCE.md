# BALANCE.md — what is currently true

*Lean since 2026-08-08 (Remi's context policy): this file keeps only the
CURRENT balance state — the latest tables, the shipped retunes, the guidelines
and the open questions. Full reports are dated files in `docs/history/` —
grep them on demand, never read them wholesale. Round 17's full evidence:
`docs/history/2026-08-08-round17-battery.md` (battery + sweeps) and
`2026-08-08-round17-bot-targeting-softmax.md` (bot targeting), and
`2026-08-08-round17-value-analysis.md` (per-upgrade dps/eHP math + the staged
duel matrix — the intuition layer behind questions K, L and M).*

## How to read the numbers

- **Win rate**: share of games a seat finished 1st of 4. Baseline **25%**.
- **Mirror / mixed tables are zero-sum RANKINGS**, not strength meters: a
  point one seat gains is a point off the other three. The do-nothing floor is
  ~3%, not 25% (paying gold for nothing is actively bad).
- **A strategy** is an exhaustive ordered buy list (identity core + shared
  exhaust tail). The 25-strategy roster lives in **STRATEGIES.md**.
- Bots never bait, aim bursts, or refuse trades — and a bot carrier lands a
  median **172 fireballs/game**, far above human pace: volume-scaling things
  (momentum) read inflated, aimed things read at their floor. Extreme columns
  show which way skill bends it.

## Current state (round 17, 2026-08-08)

Everything in docs/ROUND17.md shipped in one day: haste (§4), Swap (§3), the
telegraphed sky-bolt (§2), midas mark (§5), momentum tiers (§6), venom
de-stack (§7), ember trim (§8), sustain pass + full-stop regen lock (§9),
softmax bot targeting (§11), layered projectile visuals + shop rows (§12+§10),
co-op mothballed (§1). Plus, from live playtest: the 🧪 testing sandbox and
`boltDodge` (Hard commits to dodging only 50% of sky-bolts). Two measured
retunes beyond the plan's FIRST TRY values, both one-line reverts:
**venom `tickDmg [0.5, 1, 1.5]`** (the first-try [1,2,3] measured 96% — the
sweep is monotone now that stacking is gone) and **hourglass
`haste [8, 18, 28]`** (the ladder ruling).

**LATE round-17 changes (Remi live, all measured)**: passive regen REMOVED
(`PLAYER.REGEN 0`, Ring deleted; round-1 first death 34.8 s unchanged, venom
−20 to ~44%, midfield healthier — full numbers in the battery history file
§no-regen); power spells cheaper (12-14 g) with infinite ground-target range;
vanish 1/2/3 s; hourglass [10,18,26]. Round 17.2 (pre-game batch): momentum =
1/2/3 points per hit, +3 dmg per 50 points, linear/uncapped; venom ticks flat
½ with duration 3/5/7 s; midas penalty-free at lv3; Swap single-level range
68. ⚠ The mixed/ladder tables above predate
these — momentum's row is the stable read, the sustain rows are not.

**Question J is CLOSED**: midas-cdr 86.2 → **24.3%** (both seeds — exactly
baseline), double-cdr 49.1 → 10.5/12.9, mosquito-midas 70.0 → 29.8. Haste
sums where CDR compounded, and the mark halves midas's income rate; nothing
engine-shaped remains.

**Round 18 (2026-08-08, Remi live mid-game, dictated)**: spawn seats dealt
fresh each round (seeded rng, versus only); 4 lava portals (diagonals, 1.25×
the starting rim, versus only) teleport a toucher to the center; mosquito
rework — the ARMING sting now applies every on-hit rider (1 dmg, no push), the
cashing sting doesn't (its 2 proc balls do) = **3 on-hit procs per
armed+cashed pair**, and levels became fireball haste [20,40,60] (ex-cdMult,
one additive pool with arcane/hourglass); per-player ping badge (server-side
ws RTT, network path only). One quick instrument pass (element mirror, 600
games, seed 1): mosquito 43.5 (at 17.2) → 46.1 after the rework —
value-neutral on bots, which can't use the on-hit-amp fantasy anyway.
⚠ Momentum reads **99.6-100% on that instrument both BEFORE and after round
18** — the uncapped 17.2 ramp on 172-hit bot carriers. Question K got louder,
not new. The mixed/ladder tables below are now two reworks stale.

### The mixed table (one element per seat, Hard, 800 games × seeds 1/7, at `62de05b`)

| element | s1 | s7 | | element | s1 | s7 |
|---|---|---|---|---|---|---|
| ⚙️ Momentum | 85.9 | 89.2 | | 🌪️ Gale | 8.0 | 6.5 |
| 🐍 Venom | 64.7 | 57.9 | | ❄️ Frost | 5.4 | 2.3 |
| 🦟 Mosquito | 39.6 | 37.9 | | 👻 Ghost | 3.5 | 3.3 |
| 🔥 Ember | 28.9 | 27.0 | | 🪨 Terra | 2.5 | 2.2 |
| 🧛 Vampire | 20.8 | 20.7 | | 🪙 Midas | 0.0 | 0.4 |
| 🔮 Arcane | 13.7 | 11.9 | | | | |

Venom meets its §7 target (out of the 90s, #2, top-third). Ember's trim
landed (61.5 → ~28). Midas's 0.0 is the familiar gold-saturation floor
(40-50 g unspent), deepened by the mark — question E still owns its real
value. ⚠ Momentum is the table's #1 — see question K.

### The item ladder (1500 games, seat capped at that level, at `62de05b`)

| item | lv0 | lv1 | lv2 | lv3 | | item | lv0 | lv1 | lv2 | lv3 |
|---|---|---|---|---|---|---|---|---|---|---|
| boots | 27.7 | 26.7 | 24.9 | 20.7 | | cape | 51.2 | 28.7 | 14.0 | 6.1 |
| treads | 38.5 | 27.9 | 19.9 | 13.7 | | sword | **1.3** | 15.7 | 34.7 | 48.2 |
| amulet | 12.9 | 22.9 | 31.1 | 33.1 | | hourglass* | 7.1→~13 | | | |
| ring | 30.3 | 28.6 | 23.3 | 17.7 | | | | | | |

*hourglass row measured at [10,22,38]; the shipped [8,18,28] measured lv0
12.9 on its single-item ladder.* The §9 trim + the venom fix un-warped
sustain: amulet lv0 0.4 → 12.9 (≈ the ~15% ruling), ring is a free choice.
**The sword is the one mandatory item left — and its knob doesn't fix it**
(question L). Cape stays pilot-sign-flipping (question B, untouched).

### Strategy study (pre-softmax bots — headline rows; full tables in the history file)

venom-balanced 76.9/77.6 (pre-retune venom), mosquito-combo 55.1,
vampire-cadence 50.9, balanced 31.9/34.5, momentum-scaling 28.5/24.5 (alive —
the §6 target), midas-cdr 24.3/24.3, double-cdr 10.5/12.9, no-elements 1.2.
Extreme: all-cheap 69.1 tops; no 90s anywhere. ⚠ The study predates the
softmax bots AND the venom/hourglass retunes — re-run before quoting it.

### Other health numbers

- Round-1 first-death median **34.3 s** (p25 29.3 / p75 37.9) vs ~31 s before
  the full-stop lock — the lock still does its round-1 job.
- Lava kill share 22.6% (Hard study), comeback rate 21.7%.
- h2h ladder after softmax + boltDodge: 100 / 99.8 / 100.
- Multi-enemy-focus metric shipped in arena.js; 3+ hunters on one victim
  34.9% → 26.1% at TEMPERATURE 6 (the metric itself reads ~13% and is a feel
  gauge, not the verdict — see the softmax history file).

## Open questions

*These need Remi, not more games. Ordered by how much rides on them.*

**K. (round 17) Momentum's tiers on bot tables.** #1 at 85.9/89.2 mixed, but
momentum-scaling the STRATEGY is healthy (28.5 Hard / 33.9 Extreme), and the
mixed number rides on bot carriers banking 172 hits/game — a human sees tier 1,
maybe tier 2. Classic bot-inflation shape (the round-12 rule says don't
number-nerf around it). Measured lever if your feel agrees it's too much:
`tierHits [40,90,150] → [60,130,220]` = 87.3 → 72.2 (still #1); `tierDmg` is
the untested deeper lever. Your call.

**L. (round 17) The Blood Sword is mandatory by STRUCTURE.** Ladder lv0 1.3%,
and cutting lifesteal a third only moves it to 5.7 — under the full-stop regen
lock, lifesteal is the only heal that works while you're being hit. §9's
letter protects the sword (active healing SHOULD out-heal passive). Options:
accept the sword as the price of the readable lock; give lifesteal its own
soft lock; or revisit REGEN_LOCK_MULT (0 → 0.1-ish keeps the sentence "pauses
your regen" approximately true). Numbers for all three on request.

**M. (round 17) Are the CDR builds where you want them?** cadence 11.3,
double-cdr 10.5/12.9, arcane 11.9-13.7 mixed — the stack went from auto-win to
bottom-third. If a dedicated cadence build should be viable-but-honest
(~30-40%), the levers are arcane's fireball haste or hourglass costs; nothing
here acts without your read.

**B. The Cape of the Magi** — unchanged (lab can't agree on the sign; only
your playtest settles it). **E. Midas's real value** rides on shopping depth,
not the saturated lab floor. **F. The round-13/16 feel items** (gale burst,
Blood Sword feel, mosquito in human hands, constant knockback, draft fun) —
all still yours. **H. Offense-first meta** — round 17 kept it; defense-first
still bottom-third.

~~**G. Venom**~~ — CLOSED: §7 shipped + the measured [0.5,1,1.5] retune.
~~**J. midas-cdr**~~ — CLOSED (see Current state).
**D. Bots and the power tier**: §11 shipped pillar-cover and the Swap
lava-save, but no build list contains a power spell, so they fire only via
draft; teaching bots to BUY them is still open.

## How to reproduce

```bash
node tools/arena.js --mode=elemental --games=800 --seed=1     # the mixed table (and --seed=7)
node tools/arena.js --ladder=all --games=1500 --seed=1        # the item ladder
node tools/arena.js --ladder=sword --games=1500 --seed=1 --fx=sword.lifesteal=0.12,0.20,0.28
node tools/arena.js --mode=elemental --games=600 --seed=1 --fx=venom.tickDmg=0.5,1,1.5
node tools/arena.js --mode=elemental --games=600 --seed=1 --fx=momentum.tierHits=60,130,220
node tools/strategy-study.js --games=4000 --seed=1            # the strategy table (and --seed=7)
node tools/strategy-study.js --games=2000 --kind=stalker      # the Extreme column
node tools/h2h.js --games=400 brawler grunt                   # ladder (then berserker/brawler, stalker/berserker)
node tools/arena.js --games=60 --players=4                    # lava share, comebacks, focus metric
node tools/coop.js --levels                                   # co-op mothballed: only if its tests break
npx vitest run                                                # 245 green
node test/harness/run.js test/harness/scenarios/bots.js
node test/harness/run.js test/harness/scenarios/coop.js
```

**Lab conventions** (unchanged, load-bearing): the shared exhaust tail in
`tools/arena.js` is breadth-first on purpose; probes rotate seats; a single
run is not a measurement — 2+ seeds, check monotonicity; the isolation
self-test needs ≥1600 games; ⚠ the isolation lab saturates at the top in
elemental mode (elements are the progression).
