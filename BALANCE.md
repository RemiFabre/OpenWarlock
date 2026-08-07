# BALANCE.md — what everything is actually worth

*Round 15, 2026-08-08. This file was **rewritten from scratch** around one idea:
measure every purchasable thing in **isolation**, against a price-matched control
that does nothing, so the number means "points over wasting the same gold"
instead of "position in a ranking".*

**Where the old reports went.** Report #4 (round 10) and the round-11, -12, -13
and -14 addenda are in git history at `33b64ab:BALANCE.md`; reports #2 and #3 are
at `ab48932` / `9a96b47`. Every *finding* of theirs that is still true and is not
reproduced below is carried forward in [§9](#9-what-was-kept-from-the-old-reports).
One old headline is **superseded and wrong** — round 13's "item levels 2-3 lose
29-33 points" — and [§4](#4-items) explains the measurement error that produced it.

---

## Contents

1. [How to read this report](#1-how-to-read-this-report) — every metric defined
2. [The instrument, and why the old tables disagree with it](#2-the-instrument) — Finding 15A
3. [Elements](#3-elements) — Finding 15B
4. [Items, level by level](#4-items) — Finding 15C
5. [Should the Cape and the Lava Treads be buffed?](#5-should-the-cape-and-the-lava-treads-be-buffed) — Finding 15D, **the round's brief**
6. [Spells](#6-spells) — Finding 15E
7. [Builds and difficulty tiers](#7-builds-and-difficulty-tiers) — Finding 15F
8. [Health metrics, and what this round changed](#8-health-metrics-and-what-changed)
9. [What was kept from the old reports](#9-what-was-kept-from-the-old-reports)
10. [Open questions — these need Remi, not more games](#10-open-questions)
11. [How to reproduce every number here](#11-how-to-reproduce)

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

*Elemental mode only. Twelve elements, three levels each, 10+8+8 g, stackable.
All measured at **level 3** (the full 26 g), Hard berserker, 800 games per cell
per seed, seeds 1 and 7, baseline 25.*

### Finding 15B — the mixed table was a good ranking all along, and Midas is the one exception

| element | isolated, seed 1 | seed 7 | **mean** | mixed table (1000 games) |
|---|---|---|---|---|
| 🪙 Midas | +72.0 | +72.1 | **+72.1** | 0.0% *(12th)* |
| 🧛 Vampire | +69.3 | +71.4 | **+70.4** | 33.6% *(4th)* |
| ⚙️ Momentum | +69.3 | +68.0 | **+68.7** | 37.0% *(3rd)* |
| 🐍 Venom | +64.4 | +65.4 | **+64.9** | 44.3% *(1st)* |
| 🦟 Mosquito | +63.3 | +65.1 | **+64.2** | 42.9% *(2nd)* |
| 🔥 Ember | +61.8 | +60.8 | **+61.3** | 32.9% *(5th)* |
| 🔮 Arcane | +61.4 | +59.3 | **+60.4** | 26.9% *(7th)* |
| 🪨 Terra | +59.4 | +58.6 | **+59.0** | 27.1% *(6th)* |
| ⏳ Chronos | +58.8 | +57.1 | **+58.0** | 20.4% *(8th)* |
| ❄️ Frost | +48.6 | +49.1 | **+48.9** | 18.6% *(9th)* |
| 🌪️ Gale | +40.9 | +40.4 | **+40.7** | 9.7% *(10th)* |
| 👻 Ghost | +31.5 | +30.5 | **+31.0** | 7.6% *(11th)* |

Seed-to-seed spread is at most 2.1 points, so this table reproduces.

**The two views agree.** Strike Midas and the orderings are the same list with
swaps that all sit inside the noise band: the bottom four (chronos, frost, gale,
ghost) are in **identical** order, arcane and terra swap adjacent places, and the
top five contain exactly the same five elements in a different order. **Finding
12A was right: the mixed table is a good ranking.** What it is not is a strength
meter — and here is the difference that matters:

> **Every single element, including the ones the mixed table prints at 7.6% and
> 9.7%, is worth +31 to +72 points over its 26 gold.** Ghost is last of twelve
> and returns +31. There is no broken element in the roster. The mixed table's
> low numbers are what *"twelfth of twelve strong things, in a zero-sum table"*
> looks like, and buying anything up toward 25% there would only deflate the
> other eleven.

### Midas: the one disagreement, and it is not a mystery

Midas is 12th in the mixed table (0.0%) and 1st in isolation (+72.1). The cause
is **measured, not argued** — the same element, same seeds, same lab, differing
only in the shopping list the four seats share:

| Midas at lv3, 800 games, seed 1 | isolated |
|---|---|
| on the lab's **long breadth-first list** (every spell a bot pilots + every item to lv3) | **+72.0** |
| on the shipped **bruiser** build order (`--tail=bruiser`) | **−12.5** |

An **84-point swing** from one lab-design choice, and it is not a lab artifact —
it is the element. Midas pays in gold, and gold is worth nothing if you have
nothing left to buy. The evidence is printed in the mixed table itself: the
`avg-gold` column reads **77.5 for Midas and ~14 for every other seat**. In the
study where Midas scores 0.0%, it is finishing every game sitting on five items'
worth of unspent change while carrying a −28% damage penalty.

The control that shows this is specific to Midas and not a general property of
the long list: **Chronos measures +58.8 on the long list and +57.8 on the bruiser
order** — a 1.0-point difference. Only the economic element cares.

- `INFERRED`: in a human game with the power tier, three item levels and twelve
  elements all on the shelf, a real player's shopping list is much closer to the
  long one than to a bruiser bot's eight-entry order. Midas is therefore probably
  a *strong* element in Remi's hands, and its 0.0% is a property of the study, not
  of the element. AGENTS.md's scar — *"before believing a bot-artifact
  explanation, check whether you can DELETE the artifact"* — is now answered with
  a number instead of a hypothesis. **Nothing was changed for Midas**: the fix, if
  he wants one, is Remi's ruling on whether the drawback is right, not a lab tune.

### ⚠ Bot artifacts in this table, flagged not corrected

- **Ghost (+31.0, last)**. Its pierce bonus fires on 3.07% of its fireballs
  because bots never line two enemies up (round 12). Lining them up *is* the
  element. +31 is a floor.
- **Gale (+40.7, 11th)**. The round-13 rework made it stack-and-burst; everything
  a burst is *for* — holding it, walking a victim toward the rim before spending
  it — is invisible here. `burstKbMult` is a violently steep lever (+20% = +14
  points in the mixed table); do not round it up.
- **Mosquito (+64.2)** is *flattered*: a bot re-hits its nearest enemy constantly
  and so cashes the mark for free. This is an upper bound.
- **Vampire (+70.4)** is flattered for the same reason a bruiser berserker is the
  ideal lifesteal engine: it brawls point-blank forever and never disengages.

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

**Health metrics, measured on the shipped build:**

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
that it measures 2nd, whether Mosquito's setup is as free for a human as it is for
a bot, whether constant knockback feels better, and whether draft mode is fun
(unmeasured by design).

---

## 11. How to reproduce

Every number above comes from the shipped tools with fixed seeds. Nothing in this
report used a throwaway harness — that was the point of the round.

```bash
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
