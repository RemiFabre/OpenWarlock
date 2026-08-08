# BALANCE.md — what everything is actually worth

*Rounds 15-16, 2026-08-08. Round 15 rewrote this file around one idea: measure
every purchasable thing in **isolation**, against a price-matched control that
does nothing, so the number means "points over wasting the same gold" instead of
"position in a ranking". **Round 16 changed the game underneath it** — elements
are now the fireball's whole progression — so [§0](#0-round-16-the-strategy-study)
is the round-16 report (the strategy ranking Remi asked for, plus the retunes and
the buff/nerf guidelines), [§3](#3-elements) was re-measured under the new rules,
and everything else below it still holds (items, spells and builds were measured
in classic mode, which round 16 did not touch).*

**Where the old reports went.** Report #4 (round 10) and the round-11, -12, -13
and -14 addenda are in git history at `33b64ab:BALANCE.md`; reports #2 and #3 are
at `ab48932` / `9a96b47`; the round-15 element table (measured under the OLD
element rules) is at `dce0096:BALANCE.md`. Every *finding* of theirs that is
still true and is not reproduced below is carried forward in
[§9](#9-what-was-kept-from-the-old-reports).

---

## Contents

0. [**Round 16 — the strategy study**](#0-round-16-the-strategy-study) — the ranking, the retunes, the guidelines. **Start here.**
1. [How to read this report](#1-how-to-read-this-report) — every metric defined
2. [The instrument, and why the old tables disagree with it](#2-the-instrument) — Finding 15A
3. [Elements](#3-elements) — re-measured for round 16
4. [Items, level by level](#4-items) — Finding 15C (classic mode, still current)
5. [Should the Cape and the Lava Treads be buffed?](#5-should-the-cape-and-the-lava-treads-be-buffed) — Finding 15D
6. [Spells](#6-spells) — Finding 15E (still current)
7. [Builds and difficulty tiers](#7-builds-and-difficulty-tiers) — Finding 15F (classic mode)
8. [Health metrics, and what this round changed](#8-health-metrics-and-what-changed)
9. [What was kept from the old reports](#9-what-was-kept-from-the-old-reports)
10. [Open questions — these need Remi, not more games](#10-open-questions)
11. [How to reproduce every number here](#11-how-to-reproduce)

---

## 0. Round 16 — the strategy study

*The brief: after the elements-are-the-progression rework, run full 4-player
lobbies where complete SHOPPING STRATEGIES compete, rank them, and end with
buff/nerf guidelines. Every metric used here is defined in
[§1](#1-how-to-read-this-report); every strategy is described as build +
playstyle below and in [STRATEGIES.md](STRATEGIES.md); the baseline is **25%**
(4 players, so a strategy exactly as good as the field wins a quarter of its
games).*

### What round 16 changed (context for every number below)

- **The fireball never levels in elemental mode** (elemental is the default
  ruleset). Its old level bundle — damage AND push AND cadence in one 8 g
  purchase — was split into cheap single-axis elements: **ember** = damage,
  **gale** = push, **arcane** = cadence, **terra** = size, **ghost** = speed
  (6+5+5 g, or 6+5+12 where lv3 unlocks a special). Classic keeps its 3-level
  fireball.
- **Lv3 specials**: gale = the stack-and-burst gust (3rd stack, one ×2.4
  shove), arcane = every fireball hit refunds 1 s off all your *other*
  cooldowns (per enemy hit), ghost = pure passthrough (everyone on the line
  takes a full hit; all on-hit effects and lifesteal pay per victim).
- **Chronos was removed** (its refund became arcane's lv3, narrowed to fireball
  hits); **arcane's old global CDR became an item**, the Hourglass of Haste
  (same 10+8+8 costs, same −10/−19/−28%); **the Cinder Crown is gone** (there
  is no fireball lv4 to unlock).
- **Two retunes were forced by the rework, both measured** (details below):
  momentum's ramp `0.06 → 0.022`/hit, and arcane's refund excludes the
  fireball's own cooldown.

### The instrument

`node tools/strategy-study.js` — a **strategy** here is what a player actually
plays: a named, ordered, *exhaustive* buy list. Each has a **core** (its
identity — what it rushes, in what order) and then a shared **exhaust tail**
(one canonical breadth pass over everything a bot can pilot, repeated), so no
seat ever sits on dead gold late. That tail is Remi's own spec — *"make the
list in a way that there is always something to buy"* — and it matters
enormously: it is what finally made midas measurable (see below). Games are
4-seat **mirrors** (all Hard berserkers, the piloted tier), each game sampling
4 distinct strategies; the table is therefore **zero-sum — a ranking**, and a
number far above 25% means "beats the rest of this field", not "broken in
absolute terms".

**Sample sizes**: two waves. Wave 1: 17 strategies, 4,000 games × 2 seeds.
Wave 2 added 8 hybrids **designed from wave 1's findings** and re-ran the full
pool of 25: 5,000 games × 2 seeds on Hard (~800 games per strategy per seed,
2σ ≈ ±3.0) plus 2,500 on Extreme. The seeds agree within noise on every row.
The table below is the final (wave-2) ranking — note that win rates are
zero-sum against THIS pool, so wave-1 numbers (e.g. double-cdr's 63.6%) shrank
when stronger hybrids joined; the ORDER of the survivors barely moved.

### The final ranking — Hard (berserker) mirrors, 10,000 games, 25 strategies

| # | strategy | win% (seeds 1/7 → mean) | the build, in one line |
|---|---|---|---|
| 1 | **midas-cdr** ⚠ | 86.8 / 85.6 → **86.2** | midas income funding the arcane×Hourglass cooldown stack — see the finding below |
| 2 | **mosquito-midas** ⚠ | 70.6 / 69.4 → **70.0** | gold machine: every cashed sting procs midas twice, the sting itself is cheap to land |
| 3 | **double-cdr** | 50.4 / 47.7 → **49.1** | arcane maxed (fireball CDR + lv3 kit refund) × Hourglass — a ~1.1 s fireball whose hits hasten the lightning |
| 4 | **venom-balanced** | 47.3 / 49.6 → **48.5** | venom alternated with amulet/sword every purchase |
| 5 | **cadence** | 38.5 / 41.3 → **39.9** | double-cdr plus the Echo Stone and deeper lightning |
| 6 | **vampire-cadence** | 38.2 / 36.5 → **37.4** | vampire's every-5th heal arriving faster under the CDR stack |
| 7 | **venom-ember** | 35.5 / 37.8 → **36.7** | the two strongest elements stacked, sustain after |
| 8 | **balanced** | 36.5 / 36.8 → **36.7** | strict one-for-one alternation: ember, amulet, arcane, sword, repeat |
| 9 | **midas-economy** | 37.4 / 34.0 → **35.7** | midas first, income into a generic deep build |
| 10 | **cdr-balanced** | 35.9 / 34.3 → **35.1** | double-cdr with defense interleaved |
| 11 | **mosquito-combo** | 26.2 / 28.2 → **27.2** | mosquito maxed, venom behind it (a cashed sting procs the poison twice) |
| 12 | **spell-kit** | 23.4 / 22.8 → **23.1** | lightning/boomerang/rush/shield at lv1 before anything deep |
| 13 | **venom-dot** | 22.4 / 23.3 → **22.9** | venom maxed, terra so the weaker direct hits land, then max HP |
| 14 | **glass-cannon** | 13.2 / 12.1 → **12.7** | all three cheap offense axes maxed before any HP |
| 15 | **frost-control** | 12.8 / 12.4 → **12.6** | frost to the lv3 freeze, lightning to punish it |
| 16 | **vampire-brawler** | 10.8 / 10.3 → **10.6** | vampire + amulet + Blood Sword; wins long point-blank trades |
| 17 | **ember-tank** | 7.9 / 8.0 → **8.0** | two cheap ember levels, then the full turtle |
| 18 | **frost-gale** | 7.9 / 7.3 → **7.6** | gust them to the rim, freeze them there — the stack-synergy bet, and it loses |
| 19 | **all-cheap** | 4.6 / 6.8 → **5.7** | lv1-2 of every cheap element axis before anything expensive |
| 20 | **ghost-sniper** | 5.5 / 4.3 → **4.9** | ghost speed into the lv3 passthrough, ember damage |
| 21 | **tank-sustain** | 3.7 / 3.9 → **3.8** | amulet/ring/sword/treads before any element |
| 22 | **no-elements** | 2.7 / 3.1 → **2.9** | control: refuses the element shelf entirely |
| 23 | **momentum-scaling** | 2.3 / 3.0 → **2.7** | momentum maxed first, banking on a late cannon |
| 24 | **gale-launcher** | 2.6 / 2.6 → **2.6** | gale push into the lv3 burst; wins by ring-outs |
| 25 | **item-breadth** | 2.5 / 2.4 → **2.5** | one level of every item before any second level or element |

Gold-left at game end is 11-14 g for every strategy except the midas builds
(27-32 g), so **every list really does go all the way**: nobody wins or loses
because they ran out of things to buy.

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
**open question J in §10** and the first thing to rule on.

### What the ranking says (each claim is measured unless marked `INFERRED`)

1. **The economy is the strongest axis in the game** — see Finding 16A. All
   three midas builds beat or match everything that doesn't touch midas.
2. **Offense-first wins; defense-first collapses.** The bottom third is every
   strategy that spends its early gold on survival (tank-sustain 3.8,
   item-breadth 2.5, no-elements 2.9, ember-tank 8.0). The exhaust tail means
   *everyone* owns the amulet and the sword eventually — the losers are the
   ones who bought them *first*. `INFERRED`: with the fireball flat at 7
   damage, early offense compounds (kills → gold → more offense) while early
   HP just delays losses.
3. **…but pure offense with no HP is also a trap, and ORDER is the lesson.**
   glass-cannon (12.7) buys nearly the same things as `balanced` (36.7) — the
   difference is an amulet level between each offense purchase. The same move
   works on venom: `venom-dot` 22.9 → `venom-balanced` 48.5, **+26 points from
   re-ordering the identical core**. The one place it FAILS is the CDR stack
   (cdr-balanced 35.1 vs double-cdr 49.1): cooldown reduction compounds with
   itself, so interrupting the rush costs more than the amulet pays.
4. **CDR stacking is the strongest non-economy axis** (double-cdr 49.1,
   cadence 39.9, and it is the multiplier inside midas-cdr). Arcane lv1/2
   (×0.72 on the fireball) and the Hourglass (×0.72 on everything) multiply to
   a 1.09 s fireball. The measured hourglass trim `[0.92, 0.85, 0.78]` shaves
   ~10 points off the CDR builds and reshuffles rather than flattens. **Not
   applied.**
5. **Element synergy bets mostly lose to raw-value stacking**: venom-ember
   (36.7, two strong elements) beats mosquito-combo (27.2) and crushes
   frost-gale (7.6, the thematic gust-then-freeze combo). The exception is
   mosquito-midas (70.0) — a genuine emergent combo, and it is an economy one.
6. **momentum-scaling (2.7) is the price of the momentum re-nerf** (below) —
   rushing a 26 g ramp that only pays after ~80 landed hits is now a bad plan.
   Its element-level number is fine (24% as one purchase among many); it is
   *rushing it first* that died. `INFERRED`: if Remi wants "momentum rush" to
   be a real archetype, the lever is its 10+8+8 price (the cheap axes are
   6+5+5), not the ramp.

### The same strategies on Extreme (stalker) pilots — 2,500 games

*The 10%-effort skill check Remi asked for. Same lists, same lab, better
pilots (dodging, kiting, teleport saves). The differences are large and
informative:*

| strategy | Hard | Extreme | reading |
|---|---|---|---|
| midas-cdr | 86.2 | **95.2** | a pilot that survives longer lands more hits → more gold; the degenerate build gets worse with skill |
| midas-economy | 35.7 | **67.4** | same story without the CDR stack |
| all-cheap | 5.7 | **38.7** | breadth of small stats compounds with a pilot that doesn't die |
| gale-launcher | 2.6 | **19.9** | the burst needs aim; Hard bots spray, stalkers place it |
| ghost-sniper | 4.9 | **19.6** | projectile speed only matters if your aim was going to be dodged |
| glass-cannon | 12.7 | **22.9** | all-in offense is safer when you can dodge |
| momentum-scaling | 2.7 | **9.6** | more landed hits per game feed the ramp faster |
| balanced | 36.7 | **14.5** | HP is worth far less to a pilot that dodges — the amulet half of the alternation is wasted on a stalker |
| cdr-balanced | 35.1 | **12.6** | same |
| vampire-brawler | 10.6 | **7.9** | lifesteal pays on trades; stalkers refuse trades |

`INFERRED`: a human sits between these two columns, and closer to Extreme the
better they are. The practical read for Remi's lobby: **economy first, then
offense, holds at both tiers** (tank-sustain / no-elements / item-breadth are
last everywhere), but *which* offense is best flips with skill — cooldown
stacking and HP-backed trades for brawlers, aimed elements (gale, ghost) and
cheap breadth for good aim. Lava kill share is 18.3% in Hard mirrors and
43.9% in Extreme ones.

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
   an archetype, `chargeLifesteal` is the lever — but read open question §10
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

## 1. How to read this report

Nothing below is meaningful without these definitions. They are given before
they are used, and the baseline is stated every time.

| Term | What it means |
|---|---|
| **Win rate** | the share of its games a seat finished **1st of 4**. With four players the neutral share is **25%**. |
| **isolated (points)** | the headline number of this report. **`win% − 25`** in the isolation lab (§2): four identical seats, one holds the thing under test, the other three hold a **price-matched control that does nothing**. If the probe seat also held the control, all four seats would be identical and each would win 25% by symmetry — so this is literally *"points gained by swapping an equal pile of wasted gold for the real thing"*. Positive = worth its price. Zero = you may as well have thrown the gold in the lava. |
| **ladder (win%)** | the *decision* view for item levels (§4): four identical seats capped at **0 / 1 / 2 / 3** levels of one item, everyone spending the gold they save on the same shared shopping list. Here **25% means "this level is exactly worth its price"**, because the alternative is not nothing — it is the rest of the shop. |
| **mixed elemental table** | the older `--mode=elemental` study: four seats, four *different* elements, one each. It is **zero-sum** — a point one element wins is a point taken off the other three — so it is a **ranking**, not a strength meter. Baseline 25%. |
| **mirror table** | four seats, same difficulty tier, only the **build** differs. Baseline 25%. Isolates shopping from piloting. |
| **Elo** | pairwise-placement rating from the mixed study; 1000 start, ±50 is a real gap. Stabler than win rate at low n because 2nd place still counts. |
| **h2h** | `tools/h2h.js`: two seats of tier A against two of tier B in one game. **50% is parity.** |
| **lava kill share** | share of deaths where the victim died outside the ring. |
| **comeback rate** | share of games the eventual winner was at some point ≥4 kills behind. |
| **strategy** | a bot is a **difficulty** (how it fights) × a **build** (what it buys). Both are described, with buy orders and playstyle, in **[STRATEGIES.md](STRATEGIES.md)** — that chart is deliberately not restated here. |

**Sample sizes and noise.** Every table carries its `n`. A single isolation cell
at 800 games has 2σ ≈ **±3.1 points**; a mixed-table cell at 1000 games is only
~330 games for one element, 2σ ≈ **±4.8**. Anything inside those bands is noise
and is called noise.

**Measured vs inferred.** Every table below is **measured** unless a row or
sentence is prefixed **`INFERRED`**. Explanations of *why* a number is what it is
are inferences unless they carry their own control run.

**⚠ The standing caveat on all of it.** These are bots. They never bait, never
hold a shot, never catch a boomerang, never line two enemies up, never decide
"I can win this brawl because I heal through it". Anything whose value is
*reactive* measures at its **floor** here. Where that bites, it is flagged in
place rather than compensated for with a number — Remi's rule.

---

## 2. The instrument

### Finding 15A — a price-matched control makes the baseline exactly 25%, and it is self-checking

Round 12 established the thing that reframes every earlier report: **the
do-nothing floor is not 25%**. An element whose effect table is literally `{}` —
it does nothing at all, but still pays its 10+8+8 gold — scored 2.7%, because
spending gold on nothing is *actively bad*. Every mixed-table number silently
contains that penalty, which is why "below 25% = weak" was a wrong reading in
every report before round 12.

Round 13 applied the same idea to items with a control item, but its control cost
**a flat 15 g at every level** while the items under test cost 10-15 g and their
level 3 cost 30-45 g. The mismatch grew with the level, and that is the arithmetic
that produced round 13's headline "levels 2-3 lose 29-33 points" — see §4.

**This round's lab removes the mismatch by construction.** Four seats, same bot
kind, same shared build list, same everything. One seat buys the thing; the other
three buy a control with **the same cost, the same number of purchases and no
effect whatsoever**. Then:

> if the probe seat *also* held the control, all four seats would be identical,
> so each would win exactly **25%** — by symmetry, with no calibration run.

So `win% − 25` is exactly *points gained by swapping price-matched wasted gold for
the real thing*. The control for an element is a control **element** (all twelve
cost 10+8+8, so one control price-matches all of them at every level); the control
for anything else is a control **item** priced so that N copies cost what the
probe spent.

It is now a real flag on the shipped tool, not a throwaway:
`node tools/arena.js --isolate=…`, `--ladder=…`, `--fx=…` (see §11).

### The instrument checks itself — four validations, all measured

| check | expectation | measured |
|---|---|---|
| **self-test**: give the probe seat the control too, so all four seats are identical (`--isolate=self-test`, 800 games) | exactly 25.0% | **25.0%** (+0.0) |
| **no-op element** vs three price-matched controls (`--isolate=no-op`, 600 games) | 25% — it does nothing, but so do they | **25.2%** (+0.2) |
| **no-op element** vs three seats that buy no element at all (`--isolate=no-op --control=none`, 600 games) | round 12's do-nothing floor, ~2.7% | **3.3%** |
| **six spells no bot brain ever casts** (meteor, hook, repulse, mirror wall, pillar, vanish — 800 games each) | 25%, since holding them is identical to holding the control | **+2.0, +0.4, +0.4, +0.0, +0.0, +0.9** |

The last row is the best one, because those six cells were not designed as a
calibration and their true value is 0 by construction. Mean **+0.62**, worst
cell **+2.0**. **Hook and Repulse both cost 20 g and are both never cast, so they
must produce identical games — and they do, to every printed digit (25.4%, 12.7
kills each).** The instrument's systematic bias is under one point.

### ⚠ Two real limits of this lab, stated up front

- **It saturates above roughly +70.** A seat that wins 100% of its games cannot
  win more. The Amulet at levels 2-3 (99.5-99.8%) and Fireball lv3 (100.0%) are
  *pinned at the ceiling*: the lab can say "enormous" and cannot rank them. Where
  that happens the **ladder** (§4) is the instrument, not this one.
- **The shared build list is part of the measurement**, and for anything whose
  payload is *economic* it is the whole measurement. See Midas, §3.

---

## 3. Elements

*Re-measured 2026-08-08 for **round 16**: eleven elements (chronos removed),
the five single-axis ones cheap (6+5+5 g, or 6+5+12 with a lv3 special), the
six originals still 10+8+8 g. The round-15 table below this one was measured
under the OLD rules and is preserved only in git (`dce0096:BALANCE.md`) — do
not quote it for current values.*

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

**Read the two columns differently.** The mixed table is the zero-sum ranking:
each seat commits to ONE element for the whole game. The isolated column is
"one element seat vs three seats with a price-matched do-nothing" — and in the
round-16 meta it **saturates**: six elements win 95-100% of those games,
because a fireball that never levels makes an element seat vs an element-less
seat an auto-win. That is not an instrument failure, it is the design working —
*elements ARE the progression now* — but it means the isolation lab can no
longer rank the top of the roster; the strategy study (§0) is the ranking
instrument for round 16.

**What the mixed table is really saying:**

- **Venom at ~92% is the outlier that matters** — see guideline #1 in §0. Its
  DoT ignores everything the rework flattened, and tick-size nerfs barely dent
  it (−30% ticks still measures 77%).
- **The strategy study softens most of these extremes**: when every seat has a
  full list (and everyone eventually owns several elements), venom-dot ranks
  6th at 36.7% and single-element commitment stops being the game. The mixed
  table is the "what should my FIRST 26 gold be" view.
- **Terra (2.4%) and frost (1.8%) are not broken** — isolated they return +17
  and +49 over their gold. They are last of eleven strong things, and both are
  utility riders that shine stacked under damage elements rather than alone.
- The **cheap lv1 dips**, isolated at 600 games (the "is 6 g of this worth 6 g"
  question a low-gold shop actually asks): **ember +39.8 · arcane +29.8 ·
  terra +5.0 · gale +3.8 · ghost +3.0**. The damage and cadence axes are
  spectacular per gold; the aim axes barely break even *in Hard-bot hands*
  (they triple or better on Extreme pilots — §0).

### ⚠ Bot artifacts in this table, flagged not corrected

- **Gale and ghost read at their floor on Hard.** Everything a burst or a
  fast-piercing ball is *for* — timing it, lining people up — is invisible to a
  bot that sprays at its nearest enemy. Both roughly quadruple on Extreme
  pilots (gale-launcher 6.2 → 27.1, ghost-sniper 8.2 → 25.8 in §0).
- **Mosquito (33.3) and vampire (15.4) are flattered**: a bot re-hits its
  nearest enemy constantly (free mark cashes) and never disengages a brawl
  (ideal lifesteal engine). Both are upper bounds.
- **Midas's 3.2% is the old gold-saturation story** (it ends these games on
  ~225 g!). With a list that never runs dry it places 2nd of 17 strategies —
  §0. The mixed table's bruiser tail is simply too short for it.

---

## 4. Items

### Finding 15C — levels 2-3 are not worthless; they lose to breadth, and the reason is the Amulet and the Sword

**First, the correction.** Round 13 reported *"item levels 2-3 are near-worthless
across the whole roster: lv1→lv3 is −29 to −33 points for ring/boots/cape/treads,
and +43.3 for the amulet, the one outlier"*. **That does not reproduce, and the
cause is a flaw in how it was measured.** Its control item cost a flat 15 g at
every level, so an item at level 3 (30-45 g) was scored against a **45 g** waste
while the same item at level 1 (10-15 g) was scored against a **15 g** waste. The
comparison got 15-30 g more lopsided with every level, and the "collapse" is
mostly that arithmetic. Against a control that is price-matched **at every
level**, every item's value *rises* with its level.

**Isolated value — points over wasting the same gold** (800 games/cell/seed,
seeds 1 and 7, mean; Hard berserker; baseline 25; 2σ ±3.1 on a cell):

| item | cost/level | lv1 | lv2 | lv3 |
|---|---|---|---|---|
| ❤️ Amulet of Health | 12 | **+64.1** | +73.8\* | +74.7\* |
| 🗡️ Blood Sword | 15 | **+41.2** | +60.7 | +65.2 |
| 💍 Ring of Regeneration | 12 | +14.6 | +23.9 | +30.0 |
| 👢 Boots of Speed | 10 | +8.5 | +15.0 | +24.0 |
| 🥾 Lava Treads | 10 | +7.3 | +7.6 | +8.9 |
| 🧣 Cape of the Magi | 12 | +0.9 | −2.1 | −2.0 |

\* **saturated** — the Amulet wins 99.1-99.8% of its games at levels 2-3. The lab
cannot resolve the top two rows; read the ladder below for those.

**The ladder — the question a player actually faces** (four identical seats
capped at 0/1/2/3 levels of one item, the saved gold going into the same shared
list; 1500 games; **25% = "this level is exactly worth its price"**):

| item | lv0 | lv1 | lv2 | lv3 | reading |
|---|---|---|---|---|---|
| ❤️ Amulet | 0.4 | 2.9 | 36.9 | **59.7** | mandatory, and deep |
| 🗡️ Sword | 4.4 | 20.3 | 31.9 | **43.4** | every level pays |
| 👢 Boots | **33.1** | 33.1 | 20.4 | 13.3 | level 1 breaks even; 2-3 lose |
| 💍 Ring | 31.5 | **33.5** | 20.9 | 14.1 | same shape |
| 🥾 Treads | **43.1** | 32.5 | 16.5 | 7.9 | level 1 is now a close call *(was 49.1 / 28.3 before this round's retune)* |
| 🧣 Cape | **59.5** | 25.5 | 11.9 | 3.1 | the worst purchase in the shop |

**Both tables are true at once, and the gap between them is the finding.** Level
2 of the Boots beats 10 g of *nothing* by +6.5 points and loses to 10 g of *the
rest of the shop* by 12.7. Nothing is broken about the diminishing-effect curve;
what is happening is that **the Amulet and the Sword return three to six times
more per gold than anything else in the shop**, so every third pair of boots is
competing against a purchase worth +40 to +75.

- **⚠ THE FLAT COST IS NOT THE CAUSE, so it was not touched.** This report was
  asked to consider whether a mild cost escalation on levels 2-3 would serve the
  goal better than a gentler effect falloff. **The measurement says no, and says
  it in the wrong direction**: levels 2-3 already lose to breadth, and *raising*
  their price makes them lose harder. Remi's round-12 instruction (same flat cost
  at every level, diminishing effect as the only brake) is left exactly as it is.
- The one place the *curve* was genuinely broken was **Boots level 3**, which
  measured as buying literally nothing (+18.9 → +19.0, i.e. 0 ± 3 across two
  seeds). Retuned — see §8.
- `INFERRED`: the honest lever for "make levels 2-3 worth considering" is not
  inflating five items, it is the Amulet/Sword outlier. That is a much bigger
  change than this round's brief and it is **[open question A](#10-open-questions)**.

### ⚠ One structural caveat on the isolated item table

Each row removes the item under test from the shared list, so in the Amulet row
*nobody* has an Amulet and in the Boots row everybody does. Rows are internally
exact (the two arms differ in one thing only) but not perfectly comparable to each
other. The ladder does not have this problem for the level question, which is why
both are printed.

---

## 5. Should the Cape and the Lava Treads be buffed?

### Finding 15D — yes to one, no to the other, and the reason they differ is worth more than either number

This was the round's direct question. The two items look alike in the round-13
table (the two weakest) and they are **not** alike.

#### 🥾 Lava Treads — yes. Buffed, with the sweep.

First, the ceiling, because it bounds everything else. **Total lava immunity**
(`lavaMult = 0`) is worth only **+16.5** at level-1 price and **+20.0** at
level-3 price. That is the whole prize, and it is small *for a structural reason*:
round 13 measured that **the lava is 8.5% of all damage taken and ~30% of the
kills** — it is the executioner, not the damage dealer, so an item that reduces
lava *damage* can only ever reach into 8.5% of the game.

Within that ceiling, value scales roughly linearly with the fraction of burn
removed, which is exactly why −15% measured as nothing:

| `lavaMult` | lv1 | lv2 | lv3 | (800 games/cell, seed 1) |
|---|---|---|---|---|
| `[0.85, 0.74, 0.68]` — **was shipped** | +1.4 | +2.9 | +6.4 | worth ~nothing |
| `[0.60, 0.45, 0.35]` | +4.4 | — | +11.4 | |
| **`[0.50, 0.36, 0.28]` — SHIPPED NOW** | **+7.3** | **+7.6** | **+8.9** | *(final values, two seeds, post-retune)* |
| `[0.45, 0.30, 0.20]` | +7.9 | — | +11.0 | |
| `[0, 0, 0]` — the ceiling | +16.5 | — | +20.0 | total immunity |

**The check that made this safe to do:** the treads' value has the **same sign at
every bot tier** (Extreme reads +2.5 on the old numbers and +13.8 on the new ones
— the same story, roughly doubled). It is a number problem, so a number fixes it.

⚠ The shipped result landed *below* the sweep's prediction (+7.3 instead of
+12.7 at lv3) and that is not noise: the same commit also raised Boots level 3,
so **everyone in the shared list now moves 5% faster and spends less time in the
lava, which prices the treads down**. This is AGENTS.md's scar — *any global item
change silently re-prices everything built on top of it* — caught in the act,
inside one commit. The honest summary is that the treads went from *"worth
nothing"* to *"clearly worth their gold and still the second-weakest item"*, and
that the ladder gap for level 1 halved (lv0 − lv1 was 20.8 points, now 10.6).

**`INFERRED`, and it is the interesting part:** treads can be made worth their
price and can **never** be made a headline item, because the prize is capped at
+17 by the 8.5% damage share. If Remi wants Lava Treads to be *exciting*, the
answer is a different effect, not a bigger percentage — swim speed, a burn-immune
window, lava that pays you — and that is his call, not the lab's.

#### 🧣 Cape of the Magi — **no.** Its measured value changes SIGN with the pilot.

| Cape at lv1 (12 g), 800 games, seed 1 | as shipped (`kbMult 0.92`) | with `kbMult 0` (total knockback immunity) |
|---|---|---|
| **Normal** (brawler) | — | **−11.5** |
| **Hard** (berserker) — the tier every published table uses | +0.9 | **−19.8** |
| **Extreme** (stalker) | +1.1 | **+25.6** |

*(Cape lv3 on Extreme: **+9.1**, against −2.0 on Hard.)*

Knockback resistance is worth **−20 points to a Hard berserker and +26 to an
Extreme stalker**. It is monotone in the amount of resistance in *both* tiers —
just in opposite directions. On Hard the direction sweep runs `kbMult`
0 → −19.8, 0.5 → −10.4, 0.92 → +0.9, 1.25 → −5.0: **the peak is at "no cape at
all"**, and moving away from 1.0 in *either* direction loses points. (The 0.5 and
1.25 cells were taken before this round's boots/treads retune; the endpoints
reproduce on the shipped build, −19.1 → −19.8.)

- `INFERRED`, mechanism: a berserker charges in and never retreats, so being
  shoved out of a fight it is losing is a *rescue* it did not have to earn; a
  stalker dodges, kites and holds position, so not being shoved is exactly what
  it wants. This mechanism is **not verified** — the measurement is.
- **What follows is not "the cape is weak".** It is that the number Remi read —
  the round-13 table, taken on a Hard berserker — is a **bot artifact**, and that
  a human is at least as positional as the Extreme bot. Buffing the cape means
  pushing `kbMult` *down*, toward the value that measures **−19** on the tier the
  lab reports; the lab would grade the buffed cape as worse. That is the exact
  case AGENTS.md says to flag rather than pay for.
- **Nothing was changed.** ⚠ **This one needs a playtest, not more games** —
  [open question B](#10-open-questions).

---

## 6. Spells

### Finding 15E — six spells are unmeasurable, and the lab can now prove it rather than assert it

*Level 1 unless stated, price-matched control, Hard berserker, 800 games, seed 1,
baseline 25.*

| spell | gold | isolated |
|---|---|---|
| 🔥 Fireball to lv3 | 16 | **+75.0** *(saturated: wins 100.0%)* |
| 🛡️ Shield | 12 | **+47.3** |
| ⚡ Lightning | 10 | +35.6 |
| 🪃 Boomerang | 10 | +33.8 |
| 💨 Rush | 10 | +7.6 |
| 🌀 Teleport | 12 | +3.4 |
| ☄️ Meteor *(power)* | 22 | +2.0 |
| 👁️ Vanish | 12 | +0.9 |
| 🪝 Hook *(power)* | 20 | +0.4 |
| 💥 Repulse *(power)* | 20 | +0.4 |
| 🪞 Mirror Wall *(power)* | 24 | +0.0 |
| 🪨 Stone Pillar | 10 | +0.0 |

**The bottom six are all measured at zero, and that is the correct answer, not a
balance verdict.** No bot brain casts any of them, so buying one is arithmetically
identical to buying the control — which is why they double as the lab's noise
calibration (§2). Do not read these as "Meteor is weak". They are **unmeasured**,
and every number in the power tier remains a design guess.

- ⚠ **New this round, and not on anyone's list: the Stone Pillar is unmeasurable
  too.** The four power spells are known to be unpiloted, but `pilotOwnedSpells`
  casts `pillar` **only for the Easy grunt** (the
  `['boomerang','lightning','rush','pillar']` loop) — the Normal, Hard and Extreme
  brains never place one. Every published table uses Hard or Extreme, so the
  Pillar has been silently in the same bucket as Meteor all along. No build list
  names it today, so no bot is currently wasting gold on it — but unlike the power
  tier it has **no structural guard** in `botShop` (that guard keys on
  `tier === 'power'`), and **draft mode can offer a bot a Pillar**, because only
  power spells are filtered out of bot offers. One build-list edit or one draft
  roll turns it into dead gold for three of the four tiers.
- **Teleport (+3.4) and Rush (+7.6) are floors, hard.** Both are reactive
  escapes; a bot fires them off a crude heuristic. Compare the mirror tables in
  §7, where `escape` (boots + teleport) wins **0.0%** of berserker games — that is
  a bot failing to use a tool, not a bad spell.
- **Boomerang (+33.8) is the opposite** — an over-estimate. Nothing in the bot
  code dodges a boomerang and no bot ever *catches* one to halve its cooldown, so
  the lab over-rates the weapon and under-rates the skill in it.
- ⚠ **Spells are measured at level 1 only.** The control is an item, and a spell's
  cost curve (10+6+6) has no item-shaped twin above one purchase. Fireball is the
  exception because its levels 2-3 cost a flat 8+8.

---

## 7. Builds and difficulty tiers

### Finding 15F — these need no do-nothing control, because they already have one

The isolation lab exists to answer "is this worth its gold". Builds and tiers are
not purchases — **they are already fully-specified alternatives to each other**,
so putting them in one game *is* the controlled comparison. A mirror table holds
the pilot fixed and varies only shopping; `tools/h2h.js` holds shopping fixed and
varies only the pilot. Neither needs a price match because neither side is
spending different money.

The mirror tables even ship their own do-nothing arm: **`greedless` never buys
anything at all and scores 0.0%** in every mirror — the far end of the same scale
this whole report is drawn on.

**Mirror tables** (1500 games, seed 1, baseline 25%; build descriptions and buy
orders in **[STRATEGIES.md](STRATEGIES.md)**):

| build | Hard (berserker) | Extreme (stalker) |
|---|---|---|
| Bruiser — max fireball, HP, lifesteal; stands and trades | **69.4%** | 43.0% |
| Boomer — boomerang stacking, wide throws | 45.3% | 44.2% |
| Turtle — shield, regen, HP; outlasts you | 22.6% | **52.4%** |
| Rusher — dive in, shove you off | 33.3% | 22.7% |
| Sniper — lightning poke, no push | 3.4% | 10.2% |
| Escape artist — boots + teleport | 0.0% | 2.5% |
| *greedless* (control: buys nothing) | 0.0% | 0.0% |

**Difficulty ladder** (`tools/h2h.js`, 400 games, bruiser, 2 seats each,
**50% = parity**) — re-verified after this round's item change:

| matchup | result |
|---|---|
| Normal beats Easy | **100.0%** |
| Hard beats Normal | **99.8%** |
| Extreme beats Hard | **100.0%** |

Monotone, unchanged. ⚠ h2h *against Easy* is not a balance signal — Easy is fully
random, so every piloted tier crushes it. The readable version is all four tiers
in one game (STRATEGIES.md).

⚠ Bot hotspots, accepted and documented: boomer is over-rated (nothing dodges or
catches a boomerang), and sniper/escape are bot-traps rather than bad builds —
raise them with smarter piloting, not numbers.

---

## 8. Health metrics, and what changed

**Round-16 update (2026-08-08, after the elements rework):** lava kill share is
**18.9%** in the Hard strategy mirrors (8,000 games) and **44.3%** on Extreme —
the flat-fireball meta kills more by damage and less by shove at Hard tier, one
more step in the fall that open question C tracks. Comeback machinery, the h2h
ladder (Normal>Easy 100%, Hard>Normal 99.5%, Extreme>Hard 100%, 400 games/pair)
and the co-op curve (re-run after scoping `ARENA.NEVER_STOPS` to versus — it had
silently collapsed L8 to 6% at 3p) are all at their documented values. Tests:
**219/219** vitest, both harness scenarios, robustness (chromium+webkit),
reconnect e2e. The round-15 numbers below are kept for the record.

**Health metrics, measured on the shipped build (round 15):**

| metric | value | (before this round's retune) |
|---|---|---|
| lava kill share — mixed 4p, `--games=60` | 30.0% | 32.6% |
| comeback rate — same run | 10.0% | 10.0% |
| lava kill share — Hard mirror, 1500 games | 20.9% | 22.4% |
| comeback rate — Hard mirror | 36.3% | 36.0% |
| lava kill share — Extreme mirror, 1500 games | 45.2% | 47.8% |
| comeback rate — Extreme mirror | 40.3% | 41.7% |
| tests | **212/212 vitest green**; both harness scenarios PASS | |

The lava kill share moved down 1.5-2.6 points in the large samples. That is the
expected direction for a Lava Treads buff and it is small, but it is one more
notch on a number that has fallen every single round and **has still never had a
ruling** — [open question C](#10-open-questions).

### What this round changed

Two constants, both in `shared/constants.js` with their sweeps in comments:

| constant | from | to | effect |
|---|---|---|---|
| `ITEM_FX.treads.lavaMult` | `[0.85, 0.74, 0.68]` | **`[0.50, 0.36, 0.28]`** | isolated +1.4/+2.9/+6.4 → **+7.3/+7.6/+8.9** |
| `ITEM_FX.boots.speedMult` | `[1.15, 1.27, 1.35]` | **`[1.15, 1.29, 1.42]`** | level 3 isolated +19.0 → **+24.0** (it previously bought nothing) |

⚠ **The Boots edit changes numbers Remi specced by hand** ("+15%, then +10% more,
then +7% more"). Level 1 is untouched at ×1.15; only the last two steps are
re-cut, to +14pp/+13pp from +12pp/+8pp. Round 11's 4-5-boots meta cannot return
from it — that required *uncapped* stacking (1.2⁵ = ×2.49) and this is ×1.42
behind a hard cap of 3. One-line revert: `[1.15, 1.27, 1.35]`.

Two things were **deliberately not changed**: the Cape (§5) and the flat item
cost (§4).

Also fixed, found by screenshotting the shop in a headless browser: the shop
header read **"Powerful ⚡ (unlock after round 5)"**, a leftover from before round
12 deleted the `minRound` gate. **The shop was lying about the rules** — the power
tier has been on sale from round 1 since round 12. `client/main.js`.

### ⚠ The item change re-priced the co-op campaign — measured, not assumed

AGENTS.md is explicit that any global item change re-prices the back half of the
campaign, so `tools/coop.js --levels` was re-run in the same commit (200 attempts
per cell, seed 7, Hard berserker/bruiser party, clear% at 1p/2p/3p):

| level | before | after |
|---|---|---|
| L4 | 94 / 94 / 97 | 94 / 94 / 97 |
| L5 | 98 / 96 / 91 | 95 / 98 / 97 |
| L6 | 91 / 97 / 97 | 95 / 97 / 98 |
| L7 | 69 / 75 / 73 | **77 / 78 / 76** |
| L8 | 68 / 66 / 57 | 70 / 77 / 56 |
| L9 | 39 / 46 / 44 | **49 / 54 / 53** |
| L10 | 30 / 42 / 32 | **37 / 42 / 36** |

**The late campaign got 5-10 points easier**, exactly as the scar predicts: the
party buys items, the monsters are fixed templates that do not. The curve is still
non-increasing and L10 is still a real wall at 36-42%, so nothing is broken — but
this is a drift against the documented target and **the campaign was deliberately
not retuned to compensate**, because levels are Remi's design data, not the lab's.
The measured lever if he wants it back: AGENTS.md's own conversion rate, *one
Shade ≈ 30-45 clear points, one hound ≈ 10*, applied to L9 and L10 in
`shared/campaign.js`. Pre-existing and unchanged: the L4-L6 plateau at 94-98%.

---

## 9. What was kept from the old reports

These are still true, are not reproduced by anything above, and would otherwise
be lost with the files they came from.

- **13A — the lava does 8.5% of the damage and ~30% of the killing.** Flat at ~8%
  in every round from 2 to 18; it does *not* rise as the ring closes. **Any
  argument of the form "most damage is lava, therefore X" is wrong.** §5 leans on
  this to bound the Lava Treads.
- **13B(ii) — the Blood Sword's "weakness" is a UI finding and is still not
  fixed.** The standings print Lifesteal (349 hp/game at lv1) directly beside
  Regen (357 hp/game, free), so a 15 g item looks like it lost to passive regen.
  It did not: lifesteal lands mid-fight while regen is throttled to 25% for 2.5 s
  after every hit. The sword has **no in-fight feedback at all**. Recommended and
  still not applied, because it is a feel change, not a number. §4 confirms the
  sword is the second-strongest item in the shop at every level.
- **12B — a study cannot see a variable its design cannot express.** Round 12's
  private-frost-stacks change is invisible to the standard elemental study,
  because that study contains exactly one frost seat. Draft mode is unmeasured for
  the same reason, on purpose.
- **12C — a feature that is never rendered reads as a broken feature.** Mosquito's
  bites were computed, were on the wire, and the client never drew them; three
  balance passes went looking in the numbers. Check the renderer before the spec.
- **12F — capping items at 3 levels was a co-op campaign nerf** (55/79/55 →
  11/10/4%) and nobody re-measured co-op when it shipped. Re-confirmed from the
  other direction this round, §8.
- **13C — Gale's rework was impulse-neutral**, and in bot hands *total impulse is
  what counts, its distribution does not*. `burstKbMult` is violently steep.
- **14A — the kill-leader targeting bias** (`BOT_TARGETING.LEADER_BIAS = 2.5`)
  buys +2.3 points of comeback rate and costs no game length; 0 removes it.
- **12E / the Midas scar — "before believing a bot-artifact explanation, check
  whether you can DELETE the artifact."** §3 deletes it.

---

## 10. Open questions

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
(91.8% single-element, and tick nerfs barely dent it — §0 guideline #1). The
honest levers are the stacking (`stackCap`, `dotTime`) or a deeper direct-damage
penalty, and choosing between them is a design call, not a lab call.

**H. (round 16) Is offense-first the meta you want?** Every defense-first
strategy is in the bottom third of the ranking at both skill tiers (§0). That is
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

## 11. How to reproduce

Every number above comes from the shipped tools with fixed seeds. Nothing in this
report used a throwaway harness — that was the point of the round.

```bash
# ---- the round-16 strategy study (§0) ----------------------------------------
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
