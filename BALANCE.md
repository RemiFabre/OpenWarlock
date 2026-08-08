# BALANCE.md — what is currently true

*Lean since 2026-08-08 (Remi's context policy): this file keeps only the
CURRENT balance state — the latest tables, the shipped retunes, the guidelines
and the open questions. Full reports (methods, findings 15A-15F and 16A with
all their evidence, superseded tables) are dated files in `docs/history/` —
grep them on demand, never read them wholesale. Any `§N` reference inside a
kept block below points into
`docs/history/2026-08-08-round15-16-balance-full.md`.*

## How to read the numbers

- **Win rate**: share of games a seat finished 1st of 4. Baseline **25%**.
- **Mirror / mixed tables are zero-sum RANKINGS**, not strength meters: a
  point one seat gains is a point off the other three. The do-nothing floor is
  ~3%, not 25% (paying gold for nothing is actively bad).
- **isolated (points)** = win% − 25 against three seats holding a
  price-matched do-nothing control: "points over wasting the same gold".
  ⚠ Since round 16 this lab SATURATES at the top in elemental mode (elements
  are the progression, so element-vs-nothing is an auto-win).
- **A strategy** is an exhaustive ordered buy list (identity core + shared
  exhaust tail). The full 25-strategy ranking, Hard and Extreme, lives in
  **STRATEGIES.md** — single source, not repeated here.
- Bots never bait, aim bursts, line up targets, or refuse trades: aimed
  things read at their floor on Hard, sustain reads flattered. Extreme
  columns show which way skill bends it.

## Current state (round 16, 2026-08-08)

The rework: elements are the fireball's whole progression (the fireball never
levels in elemental). Retunes shipped with it, both measured, both one-line
reverts: momentum `rampDmg 0.06 → 0.022`, arcane's lv3 refund excludes the
fireball's own cooldown. Full story: REMI_NOTES.md round 16 and
`docs/history/2026-08-08-round15-16-balance-full.md` §0.

**Headline**: `midas-cdr` (midas income funding the arcane×Hourglass CDR
stack) is a copyable auto-win — **86% Hard / 95% Extreme** — and every polite
nerf was measured and missed. It needs Remi's ruling (open question J below).

### The mixed table (one element per seat, Hard berserker/bruiser, 800 games × seeds 1/7, baseline 25%)

| element | seed 1 | seed 7 | **mean** | isolated (lv3, 600 games) |
|---|---|---|---|---|
| 🐍 Venom | 91.4 | 92.1 | **91.8** | +74.8 *(saturated)* |
| 🔥 Ember | 62.5 | 60.4 | **61.5** | +74.5 *(saturated)* |
| ⚙️ Momentum | 39.2 | 40.5 | **39.9** | +74.2 *(saturated)* |
| 🦟 Mosquito | 35.9 | 30.6 | **33.3** | +74.0 *(saturated)* |
| 🧛 Vampire | 17.4 | 13.4 | **15.4** | +70.8 |
| 🔮 Arcane | 12.3 | 9.8 | **11.1** | +60.3 |
| 🌪️ Gale | 5.4 | 9.1 | **7.3** | +57.3 |
| 👻 Ghost | 5.3 | 3.3 | **4.3** | +47.3 |
| 🪙 Midas | 2.9 | 3.5 | **3.2** | +75.0 *(saturated — long-list tail)* |
| 🪨 Terra | 2.5 | 2.2 | **2.4** | +16.7 |
| ❄️ Frost | 2.3 | 1.3 | **1.8** | +49.2 |

### ⚠ Finding 16A — midas-cdr is a degenerate build, and no knob I'm allowed to turn fixes it

`midas-cdr` wins **86.2% on Hard and 95.2% on Extreme** — reproducible across
seeds and tiers, and a human can copy it off this page. The engine: midas's
+1 g per hit is capped per HIT but not per SECOND, so anything that raises hit
*rate* raises income — and the CDR stack is both the best thing to buy *and* a
hit-rate multiplier. The result roughly **doubles the economy** (midas seats
end games ~+12 g/round over the field, walking straight around the
anti-snowball income cap, which only governs round income) and converts the
lead into having lv3 arcane + Hourglass + a full build rounds before anyone
else.

Every polite lever was measured and none of them fixes it:

| candidate nerf | midas-cdr becomes |
|---|---|
| shipped values | 86.8% |
| hourglass trimmed `[0.92, 0.85, 0.78]` | 78.5% |
| midas penalty deepened `[0.5, 0.55, 0.62]` | 80.1% |
| midas penalty deepened `[0.45, 0.5, 0.55]` | 76.7% |

The damage penalty misses because midas-cdr's damage comes from cast rate, not
per-ball damage; the CDR trim misses because the income is the bigger half.
The honest fixes all touch **Remi's explicit design rulings**, which is why
nothing shipped: (a) an income *rate* cap (e.g. one payout per victim per
second — but a cashed mosquito sting must still visibly pay "+1 g twice",
his named acceptance criterion, so same-frame hits would need an exemption);
(b) a per-round midas income cap (bends "every hit pays +1 g — never more");
(c) accepting it as the economy archetype and letting lobbies ban it. This is
**open question J below** and the first thing to rule on.

### The two retunes the rework forced (measured, shipped)

- **Momentum ramp `0.06 → 0.022`/hit.** Locking the fireball at lv1 silently
  tripled the ramp's relative power: at the round-13 value momentum measured
  **80-87%** across three seeds in the single-element study — the strongest
  thing ever recorded here. Swept at 400-800 games per row (0.06 → 81.8 ·
  0.045 → 67.0 · 0.035 → 50.7 · 0.025 → 32.5 · 0.02 → 24.5), confirmed at
  800 × 3 seeds. 0.022 keeps the exact 1:1.5:2 level ratio and puts break-even
  vs a plain fireball at ~80 landed hits against the new measured median of
  **172 hits/game** (it was 78 in round 13 — flat fireballs mean long fights).
- **Arcane's lv3 refund excludes the fireball's own cooldown.** Refunding the
  spell that triggers the refund is a feedback loop: land a ball → its own
  1.5 s cooldown drops toward the 0.25 s floor → fire again. Arcane alone
  measured **74%** in the single-element study; halving the refund to 0.5 s
  still measured 47%. With the exclusion, arcane's stat line lands at 11-14%
  there (a cheap utility element) and the refund becomes what the fantasy says:
  *your fireball accelerates the rest of your kit.* One-line revert on
  `arcaneRefund` in `shared/sim.js`.

### Buff/nerf guidelines (the deliverable — nothing here is applied)

Ranked by how much they matter. Each carries its evidence and its lever.

0. **Rule on midas-cdr first** (Finding 16A). It is the one copyable auto-win
   in the game (86% Hard / 95% Extreme), every polite knob was measured and
   missed, and the real fixes — an income *rate* cap, a per-round midas cap,
   or acceptance — all touch your own design rulings. Until then, treat
   "midas + cooldown stacking" as the known broken combo.
1. **Venom is the #1 element-level nerf candidate.** In the single-element
   study it now wins **91.4 / 92.1%** (seeds 1/7) — the field around it
   weakened while its DoT ignores everything round 16 changed. But the obvious
   knob barely moves it: ticks −20% → 84%, ticks −30% → 77%. The dominance
   lives in the *stacking* (re-hits refresh the 5 s clock AND grow the tick
   toward `stackCap`), so the honest levers are `stackCap` `[3, 4.5, 6]`,
   `dotTime` 5, or deepening the −15% direct-damage penalty. The strategy
   table softens the severity (venom-balanced peaks at 48.5% once everyone
   has real builds), so this is "clearly strongest element", not "auto-win".
2. **Ember probably needs a trim; it is the second face of the same coin**
   (61.5% single-element, +39.8 isolated at lv1 for 6 g — the best
   gold-for-points purchase in the game). Lever: `dmgAdd` `[2, 4, 6]` →
   `[2, 3, 5]`, or price lv2/3 up. `INFERRED`: some of this is bots being
   unable to miss at point-blank; a human's +2 damage is worth less.
3. **The cheap "aim" axes are cheap for a reason** — terra +5.0, gale +3.8,
   ghost +3.0 isolated at lv1 (vs ember's +39.8 for the same 6 g), and their
   strategies sit at the bottom on Hard while tripling or better on Extreme.
   Do **not** number-buff them for Hard-bot tables (the round-12 rule about
   bot artifacts); if Remi's own play says they feel weak, buff the *specials*
   (gale `burstKbMult` 2.4 — steep lever, +20% ≈ +14 points; ghost could get
   its pierce at lv2) rather than the stat lines.
4. **CDR stacking** — see ranking note 3. Hourglass trim `[0.92, 0.85, 0.78]`
   is measured and ready if human play confirms; alternatively cap the
   fireball's total CDR product.
5. **Frost is quietly fine** (20.0% strategy, +49 isolated lv3): the freeze is
   real, the setup is slow. No action.
6. **Vampire fell out of the top tier** (15.4% single-element vs 26.7% when it
   was tuned in round 12; vampire-brawler 16.7% strategy). The whole sustain
   axis is worth less in the flat-fireball meta. If sustain-brawling should be
   an archetype, `chargeLifesteal` is the lever — but read open question H below
   first: Remi may prefer the offense-first meta as-is.
7. **Midas alone (without the CDR stack) is merely strong** (35.7% Hard /
   67.4% Extreme with a full list) — the round-15 diagnosis was right: it just
   needed somewhere for the gold to go. If guideline #0 is settled by a rate
   or round cap, plain midas likely lands in a healthy place without further
   touches; the penalty buyback (`dmgMult`) is measured to be a weak lever
   (−7 to −10 points for very deep cuts).

### ⚠ Bot caveats on all of the above

Hard berserkers never dodge, never bait, never hold a gale burst, never kite a
frozen target. Everything whose value is *aimed* (gale, ghost, terra) reads at
its floor on Hard and 3-5× higher on Extreme; everything whose value is
*trading* (vampire, lifesteal, HP) reads richer on Hard than it will feel
against humans who disengage. The Hard table is the meta of Remi's usual
lobby; the Extreme column is the direction skilled play bends it.

---

## Open questions

*These need Remi, not more games. Ordered by how much rides on them.*

**A. The Amulet and the Blood Sword return 3-6× more per gold than anything
else, and no one has ruled on it.** Amulet lv1 +64.1 and Sword lv1 +41.2, against
+14.6 for the next item down; on the ladder a seat that skips the Amulet wins
**0.4%** of its games. This is the actual cause of "item levels 2-3 feel like a
trap" (§4) — every other level is competing with those two. Raised in round 13,
still unanswered. Nothing here acts on it: nerfing the two best items in the shop
is a design decision.

**B. The Cape of the Magi.** The lab cannot even agree on the sign (−19 on Hard,
+39 on Extreme, §5). Only a playtest settles it. If it feels fine in his hands,
the round-13 table was reading a berserker's mistake and the item is already
correct; if it feels weak, `ITEM_FX.cape.kbMult` is the one-line lever.

**C. The lava kill share still has no ruling.** 86% at launch → 68% → 47% → ~38%
→ 30% → **30.0%** now. Two deaths in three are people being shot on the platform
rather than shoved in. It has been open question #1 since round 10 and every round
retunes on top of it. One-line levers: `PLAYER.KB_HP_FACTOR`,
`PLAYER.KB_CONSTANT_MISSING` (set to `null` to restore true HP-scaled knockback),
`LAVA.SPEED_MULT`.

**D. Bots pilot none of the power tier — and, newly, none of the Stone Pillar
above Easy.** Meteor, Hook, Repulse, Mirror Wall and Pillar all measure at exactly
the do-nothing control (§6). Every number in the power tier is a design guess, and
the Pillar is currently dead gold in three of four tiers *and is in shipped build
lists*. Teaching bots to cast them is the highest-value lab work left.

**E. Midas is either the strongest element in the game or the weakest, depending
on whether you have anything left to buy** (+72.1 vs −12.5, §3). Which one the
real game is depends on how a human actually shops, which no lab here can answer.

**F. Still open from round 13 and only answerable by playing**: whether Gale's
burst feels good in human hands, whether the Blood Sword still *feels* weak now
that it measures 2nd (round 16 gave it the green +N popup, which was 13B's
recommended fix), whether Mosquito's setup is as free for a human as it is for
a bot, whether constant knockback feels better, and whether draft mode is fun
(unmeasured by design).

**G. (round 16) Venom.** Strongest element by a wide margin under the new rules
(91.8% single-element, and tick nerfs barely dent it — guideline #1 above). The
honest levers are the stacking (`stackCap`, `dotTime`) or a deeper direct-damage
penalty, and choosing between them is a design call, not a lab call.

**H. (round 16) Is offense-first the meta you want?** Every defense-first
strategy is in the bottom third of the ranking at both skill tiers (STRATEGIES.md). That is
a coherent, readable meta — buy threat, then live long enough to use it — but it
inverts the sustain-dominated meta of rounds 10-15. If you want defense-first to
be viable rather than merely order-swapped, the lever is the fireball's flat
7 damage (a small lv1 bump makes early defense cheaper to skip past), not the
items.

**I. (round 16) `ARENA.NEVER_STOPS` is now versus-only.** Your never-stopping
ring shipped without a co-op re-measure and had collapsed campaign level 8 from
68/66/57% clear to 80/46/6 (a ~100 s fight in a ring that reaches zero). Co-op
keeps the classic hold-then-sudden-death ring at its own 65 s journey
(`ARENA.COOP_SHRINK_TIME`). If you'd rather the campaign ALSO play under the
never-stopping ring, the guard is one line in `stepBattle` — but the whole back
half of the campaign then needs re-pricing.

**J. (round 16) midas-cdr needs a ruling — it is the one copyable auto-win.**
86% Hard / 95% Extreme (Finding 16A). The measured non-fixes: hourglass trim
−8, deep midas penalty −7/−10. The real options touch your rulings: (a) cap
midas income by RATE (one payout per victim per second — but a cashed mosquito
sting must still show "+1 g twice", your named acceptance criterion, so
same-frame hits need an exemption); (b) cap midas income per ROUND; (c) accept
it as the economy archetype. Until ruled, "midas + cooldown stacking" is the
known broken combo.

---

---

## How to reproduce

Every number above comes from the shipped tools with fixed seeds. Nothing in this
report used a throwaway harness — that was the point of the round.

```bash
# ---- the round-16 strategy study (table in STRATEGIES.md) ----------------------------------------
node tools/strategy-study.js --list                       # roster + descriptions
node tools/strategy-study.js --games=4000 --seed=1        # the Hard table (and --seed=7)
node tools/strategy-study.js --games=2000 --kind=stalker  # the Extreme column
node tools/strategy-study.js --games=800 --only=cadence,double-cdr,balanced,venom-dot

# the round-16 retune sweeps (re-run these after ANY fireball/element change)
node tools/arena.js --mode=elemental --games=800 --seed=1 --fx=momentum.rampDmg=0.022,0.033,0.044
node tools/arena.js --mode=elemental --games=600 --seed=1 --fx=arcane.hitRefund=0,0,0.5
node tools/arena.js --mode=elemental --games=600 --seed=1 --fx=venom.tickDmg=0.7,1.0,1.4

# ---- the isolation lab (§2, §3, §4, §6) --------------------------------------
node tools/arena.js --isolate=self-test --games=800     # must read 25.0% / +0.0
node tools/arena.js --isolate=no-op      --games=600     # 25.2% (price-matched)
node tools/arena.js --isolate=no-op --control=none --games=600   # 3.3% floor

node tools/arena.js --isolate=elements --games=800 --seed=1   # §3, and --seed=7
node tools/arena.js --isolate=items    --games=800 --seed=1   # §4, all 3 levels
node tools/arena.js --isolate=spells   --games=800 --seed=1   # §6

# one thing, one level, and the tail contrast that explains Midas (§3)
node tools/arena.js --isolate=midas   --games=800 --tail=bruiser   # -12.5
node tools/arena.js --isolate=chronos --games=800 --tail=bruiser   # +57.8, control

# ---- the level ladder — the depth-vs-breadth decision table (§4) -------------
node tools/arena.js --ladder=all --games=1500 --seed=1

# ---- sweeps WITHOUT editing constants.js (§5) --------------------------------
# --fx overrides any ITEM_FX / ELEMENTS[x].fx / ITEMS[x] field for one run, so
# every sweep table in a constants.js comment can be re-run rather than trusted.
node tools/arena.js --isolate=treads --level=1 --games=800 --fx=treads.lavaMult=0,0,0
node tools/arena.js --isolate=cape --level=1 --games=800 --kind=stalker --fx=cape.kbMult=0,0,0

# ---- the older views, for comparison (§3, §7) --------------------------------
node tools/arena.js --mode=elemental --games=1000        # the mixed table
node tools/arena.js --mirror=berserker --games=1500      # builds, Hard
node tools/arena.js --mirror=stalker   --games=1500      # builds, Extreme
node tools/h2h.js --games=400 brawler   grunt            # 50% = parity
node tools/h2h.js --games=400 berserker brawler
node tools/h2h.js --games=400 stalker   berserker

# ---- health + the checks that must pass before any of this is believed -------
node tools/arena.js --games=60 --players=4               # lava share, comebacks
node tools/coop.js --levels                              # RE-RUN AFTER ANY item/gold/knockback CHANGE
npx vitest run                                           # 212 green
node test/harness/run.js test/harness/scenarios/bots.js
node test/harness/run.js test/harness/scenarios/coop.js
```

**Lab conventions**, for whoever changes them next:

- The shared build list (`ISOLATION_TAIL` in `tools/arena.js`) is **breadth-first
  on purpose** — one pass buys one of everything, three passes buy every level.
  An earlier version listed every spell to max before any item, which front-loaded
  114 g of spells so that no seat ever owned an item, and every item was then
  measured in a world where nobody else had one. If you change that list you
  change every number in §3, §4 and §6; re-run all three.
- The list contains **only spells a bot actually pilots**, or the list itself
  becomes a gold sink of unknown size (§6).
- The probe seat rotates through all four seat indices, because spawn position is
  seat-indexed.
- **A single run is not a measurement.** Two seeds minimum, and check monotonicity
  across a sweep before believing any single cell.
