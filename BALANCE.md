# BALANCE.md (what is currently true)

*Lean since 2026-08-08 (Remi's context policy): this file keeps only the
CURRENT balance state: the latest tables, the shipped retunes, the guidelines
and the open questions. Full reports are dated files in `docs/history/`.
Grep them on demand, never read them wholesale. Round 17's full evidence:
`docs/history/2026-08-08-round17-battery.md` (battery + sweeps) and
`2026-08-08-round17-bot-targeting-softmax.md` (bot targeting), and
`2026-08-08-round17-value-analysis.md` (per-upgrade dps/eHP math + the staged
duel matrix; the intuition layer behind questions K, L and M).*

## How to read the numbers

- **Win rate**: share of games a seat finished 1st of 4. Baseline **25%**.
- **Mirror / mixed tables are zero-sum RANKINGS**, not strength meters: a
  point one seat gains is a point off the other three. The do-nothing floor is
  ~3%, not 25% (paying gold for nothing is actively bad).
- **A strategy** is an exhaustive ordered buy list (identity core + shared
  exhaust tail). The roster is CODE: `tools/roster.js` (53 rows since 24.7;
  `docs/ARCHETYPES.md` is generated from it). Every elo run now opens its own
  HTML report page (`tools/report.js`).
- Bots never bait, aim bursts, or refuse trades, and a bot carrier lands a
  median **172 fireballs/game**, far above human pace: volume-scaling things
  (anger, ex-momentum) read inflated, aimed things read at their floor;
  mechanics bots cannot express (malady's contagion, gale's gust positioning)
  read at a FALSE floor. Extreme columns show which way skill bends it.

## Current state (rounds 17 → 21, newest entries at the end of this section)

Everything in docs/ROUND17.md shipped in one day: haste (§4), Swap (§3), the
telegraphed sky-bolt (§2), midas mark (§5), momentum tiers (§6), venom
de-stack (§7), ember trim (§8), sustain pass + full-stop regen lock (§9),
softmax bot targeting (§11), layered projectile visuals + shop rows (§12+§10),
co-op mothballed (§1). Plus, from live playtest: the 🧪 testing sandbox and
`boltDodge` (Hard commits to dodging only 50% of sky-bolts). Two measured
retunes beyond the plan's FIRST TRY values, both one-line reverts:
**venom `tickDmg [0.5, 1, 1.5]`** (the first-try [1,2,3] measured 96%; the
sweep is monotone now that stacking is gone) and **hourglass
`haste [8, 18, 28]`** (the ladder ruling).

**LATE round-17 changes (Remi live, all measured)**: passive regen REMOVED
(`PLAYER.REGEN 0`, Ring deleted; round-1 first death 34.8 s unchanged, venom
−20 to ~44%, midfield healthier; full numbers in the battery history file
§no-regen); power spells cheaper (12-14 g) with infinite ground-target range;
vanish 1/2/3 s; hourglass [10,18,26]. Round 17.2 (pre-game batch): momentum =
1/2/3 points per hit, +3 dmg per 50 points, linear/uncapped; venom ticks flat
½ with duration 3/5/7 s; midas penalty-free at lv3; Swap single-level range
68. ⚠ The mixed/ladder tables above predate
these: momentum's row is the stable read, the sustain rows are not.

**Question J is CLOSED**: midas-cdr 86.2 → **24.3%** (both seeds, exactly
baseline), double-cdr 49.1 → 10.5/12.9, mosquito-midas 70.0 → 29.8. Haste
sums where CDR compounded, and the mark halves midas's income rate; nothing
engine-shaped remains.

**Round 18 (2026-08-08, Remi live mid-game, dictated)**: spawn seats dealt
fresh each round (seeded rng, versus only); 4 lava portals (diagonals, 1.25×
the starting rim, versus only) teleport a toucher to the center; mosquito
rework: the ARMING sting now applies every on-hit rider (1 dmg, no push), the
cashing sting doesn't (its 2 proc balls do) = **3 on-hit procs per
armed+cashed pair**, and levels became fireball haste [20,40,60] (ex-cdMult,
one additive pool with arcane/hourglass); per-player ping badge (server-side
ws RTT, network path only). One quick instrument pass (element mirror, 600
games, seed 1): mosquito 43.5 (at 17.2) → 46.1 after the rework.
Value-neutral on bots, which can't use the on-hit-amp fantasy anyway.
⚠ Momentum reads **99.6-100% on that instrument both BEFORE and after round
18** (the uncapped 17.2 ramp on 172-hit bot carriers). Question K got louder,
not new.

**Round 19 (overnight 2026-08-09, Remi's pre-sleep dictation)**: Malady 🦠
replaces venom (two-hit infection, 1 dmg/tick, contagious aura r [4,6,8],
duration [2,3,4] s, once-per-instance immunity, creator can catch it back,
lethal tick credits creator/spreader; the trail AND venom's old 0.85 dmg tax
are gone); Anger 🔴 replaces momentum (a red mark on a random enemy every
[10,7,5] s, fireball-claim = +0.5 dmg forever, uncapped, game-long); mosquito
= NORMAL balls taxed ×[0.5,0.75,1] dmg+kb (multiplicative with midas), trap
arm/cash = 2 extra balls, 4 rider procs per pair; gale uniform (stacks from
lv1, gust is a flat ADD [15,30,45] ≈ 70% of the old lv3 total, kbAdd
[7,14,21], costs [10,8,8]); Nova 🧨 NEW spell (PLACEHOLDER name: fused
artillery, flies over everything, flat AoE [10,14,18] r [4.5,5.5,6.5], no
push, no riders, power tier); Swap 3 lv (speed 50, range [40,55,70], cd
[13,12,11]); Blink [8,6] g flat range 22; vanish reveals on any cast (castable
mid-charge now); Mirror Walls block bodies; frost verified UNCHANGED (slow
never touched knockback; lv1 already 30%).

**Round 20 (2026-08-09, r207)**: anger `markEvery [10,7,5] → [20,15,10]`
(nerf); ghost lv3 12 → 10 g; malady `dotTime [4,5,6]` + `auraR [10,14,18]`
(buff); **every item flat per level: 6 g boots/treads/cape, 8 g
sword/amulet/hourglass** (Remi: "buy an item every round even with zero
kills\"), so the whole item shelf is now 126 g; **mosquito reworked**: no
dmg/kb tax, no arm/cash trap, every [6,5,4]th cast fires a PAIR (no-push lead
+ normal trailing ball 0.15 s behind, both carrying every rider; trailing
balls advance the every-N counters but can never chain), and the **Echo Stone
item is DELETED**, merged in; terra lv3 smashes pillars.

**Round 20.3 (2026-08-09, Remi live)**: malady `auraR [10,14,18] → [5,7,9]`
(the aura was blanketing the arena) and the **creator is now IMMUNE to their
own instance**. They still catch other players' plagues, and a lethal tick is
always the creator's kill (the spreader-credit case is gone).

**Round 21.0-21.4 (2026-08-10, Remi's overnight rulings)**: the balance-bearing
half; the full story is REMI_NOTES.md. **Spell prices obey one rule**: base
8 / 10 / 12, every upgrade half its base (pillar → [8,4], meteor and wall
14 → [12,6], repulse [12,6], every 10-base spell upgrades at 5; fireball exempt,
base 0). **Items dropped another 1 g/level**: 5 g boots/treads/cape, 7 g
sword/amulet/hourglass. **Pillars are PERMANENT** (lava-proof, they accumulate
all game, no cap; only terra lv3 removes one). ⚠ Untestable in the labs, bots
never buy pillars. **Arena AREA per player is constant above 5 seats**
(`state.startRadius = 56 × √(n/5)`), so an 8-seat game plays on radius 70.8;
60-game arena smokes at 4 and 8 players both finish with sane kills.
**Teams** landed as a lobby property (default = everyone solo, bit-identical to
the old free-for-all); a team's kill target is `15 × size`, so ⚠ 3v1 can never
be won on kills and always runs to the 25-round cap. **Statue 🗿** is new; see
question N, it is unmeasured by design.

**Round 21.5 (2026-08-10)**: NEW item `brazier` (displays as **Hat of Aura 🎩**
since 21.7), the first passive damage in the game: enemies within `auraR`
(centre-to-centre) burn for a FLAT 1 dmg/s, one bite per second on the owner's
clock. Owner and teammates exempt, co-op exempt, statues immune, a statue'd
owner keeps burning, and it does NOT break vanish (Remi's ruling). Price and
radius were re-set in 21.7 below. UNMEASURED: no Elo pass has run with it.

**Round 21.6 (2026-08-10)**: NEW spell **Decoy 👥**, [10, 5] g, `tier: 'power'`.
lv1 = one clone, lv2 = two; they live 5 s, wander at your move speed, mime every
cast you make with phantom balls, and have **zero** gameplay effect (no body,
no collision, no targeting, no counters; everything passes through). ⚠ Its
measured value is the DO-NOTHING FLOOR by construction, and always will be:
**fooling bots is out of scope** (bot targeting reads `state.players`, which
never holds a clone, and bot threat-dodging reads `state.projectiles`, which
never holds a phantom). `tier: 'power'` keeps bots from buying a spell they
cannot use. Every lab that enumerates spells will price it at ~0. That is the
instrument being honest, not the spell being weak. Human playtest only.

**Round 21.7 (2026-08-10, Remi's hand spec after a playtest; UNMEASURED, all
one-line reverts)**: a price + feel pass, no new mechanics.
- **Elements repriced** (his numbers, the cheap axes get cheaper and the third
  step carries the premium): ember `[5,5,7]`, terra `[6,6,7]`, gale `[6,6,6]`,
  arcane `[6,6,10]`, ghost `[6,6,10]`. ⚠ Gale went from 26 g to 18 g total, so
  its gust was cut with the discount: `burstKbAdd [30,60,90] → [25,50,75]`.
- **Cape −25/−40/−50%** (`kbMult [0.75, 0.60, 0.50]`, was [0.85, 0.74, 0.65]).
  ⚠ Deliberately set on FEEL: the cape's lab value flips sign by pilot, so the
  Hard-bot number was never the ruler (BALANCE 15D stands).
- **Hat of Aura** (`brazier` renamed) 7 → **6 g/level**, `auraR [3,3.8,4.6] →
  [5,6,7]` (lv1 now equals malady's lv1 aura, lv3 still under its lv3). Shelf
  129 → **126 g**. The old "half a lv1 plague" sizing is gone by his ruling.
- Display only: `statue` → **NOPE** (gold-tinted 🗿, pillar takes the plain one
  back), Echo's icon → 🫧. Internal keys unchanged, as with mosquito/Echo.
- ⚠ The whole entry is UNMEASURED (the ELO baseline below predates it).

**Round 21.8 (2026-08-11, Remi's post-playtest brief; UNMEASURED except where
stated, every number a one-line revert)**:
- **The Bomb is now the Mine** (`SPELLS.nova`, key unchanged): his verdict on the
  artillery was "unsatisfying: not much damage, hard to hit, no push". It plants
  at your feet (trigger ring 1.32 = 1.65 × the fireball's radius), 2 levels
  [10, 5] g, damage [10, 15], push 100, and it SWALLOWS the planter's own
  fireballs ([1, 2] of them). Stepping on it = the mine's damage, then every
  stored ball point blank, one TICK apart, all push-less but the last (Echo's
  rule), which pushes at max(ball, mine). Shield answers the balls, not the
  ground. ⚠ It is INVISIBLE to every lab: bots neither buy it (power tier) nor
  understand a trap. Human read only.
- **Malady inverted**: `dotTime` FLAT 4 s, `tickDmg [1, 1.5, 2]` (was 1 flat with
  [4,5,6] s). Remi's target: a plague that catches TWO people should out-damage a
  pure damage element. **Measured, old spec vs new, same seeds** (elemental
  study: 400 games, 4 Hard seats running the warlord build, one element each,
  win% against a 25% baseline; `--fx=malady.tickDmg=1 --fx=malady.dotTime=4,5,6`
  restores the old element in-place):

  | seed | malady OLD | malady NEW | rank NEW (of 11) |
  |---|---|---|---|
  | 1 | 40.3% | **62.7%** | 2nd (anger 95.6%) |
  | 7 | 31.1% | **49.0%** | 3rd, tied with vampire 50.0% (anger 97.6%) |

  **+18-22 points on both seeds**, the biggest single-element move since the
  round-20.3 creator-immunity change. ⚠ And it is a FLOOR: bots never bunch up,
  so the contagion half of the element is not in these numbers at all.
- **Hat of Aura**: the burn now LINGERS `[3, 4, 5]` s after you leave the ring
  (`ITEM_FX.brazier.linger`); the ring itself is unchanged. Revert = linger 0.
- **NEW item: Slow Spoon 🥄** (`spoon`, 7 g/level): a FLAT `healOnHit
  [1, 1.5, 2]` per damaging hit, once per victim per hit (a pierced ball through
  three bodies pays three times). ⚠ Auras and DoT ticks are EXCLUDED by design
  (`procs: false` in applyDamage). The spoon is the sustain answer for
  low-damage utility builds that lifesteal ignores. Item shelf 126 → **147 g**.
- **Meteor lv2 damage 24 → 30.** Gale's gust and the cape kept their 21.7 values.
- 🔧 **Three labs were dead since round 20.2 and are fixed.** Retiring the legacy
  six builds left `bruiser` named in lab DEFAULTS (`h2h.js`, `coop.js`, the
  since-deleted elemental study); `BUILDS.bruiser` is undefined, so those runs
  threw "not iterable" and nobody could have used them since. h2h defaults to
  `warlord` now, and an unknown build name THROWS BY NAME instead of resolving
  to an empty list. A silent empty build is a table of numbers measuring seats
  that buy nothing. (Round 23, Remi: the element-vs-element study itself was
  deleted; identical-build mirrors are not the game, rank with `tools/elo.js`.)
- 🔧 **The arena lab now defaults to the ruleset the game defaults to.**
  `createGame` has defaulted to **elemental** for a long time; `arena.js` still
  played **classic**, so every Elo/mirror/item-pick table it has ever printed
  measured the mode almost nobody plays. Both study paths take `--ruleset=` now
  (default elemental, `--ruleset=classic` reproduces the old runs) and **print
  the ruleset in the header**. ⚠ Every arena table quoted in this file or in
  `docs/history/` from before 2026-08-11 is a CLASSIC table.
  `tools/elo.js` (the 30-strategy roster ranking, the one that matters) has
  always run elemental off explicit roster cores and was never affected.

### The strategy ELO table: THE current ranking (r353, 41 strategies, 8000 games × 2 seeds)

**`docs/history/2026-08-13-round22.5-elo.md`** is the STANDING baseline (drift
mean 11.1, max 38, 0 unfinished). ⚠ The roster grew 37 → 41 (family K, the
Faker's four arsenals, which run the FAKER brain and score 2444-2755), so every
Δ in that file is **re-centred** on the 37 rows r249 also held, and because Elo
is zero-sum the "nothing happened to me" line is **+19, not 0**. Headlines: the
**22.5 anger slow is the whole table** and it landed monotonically on how much
anger a core holds (B3 −267 and no longer 1st, D2 −205, B4 −104, A4 −90);
**D4-leech +219**, the only big gain, because vampire's new FLAT heal is a buff
for a deliberately low-damage vampire kit (the % it replaced only scaled for the
ember/anger builds that never buy vampire); the **stack fade shows up on malady
only** (D12 −64, D5 −37; frost/gale within churn); **midas's softened penalty
and the fireball range cap are both invisible here**, with the mechanism
measured (0.5% of connecting bot fireballs had flown 50+).

The r249 table (37 strategies, the sustain pass + the credit rules):
**`docs/history/2026-08-11-round21.9-elo.md`**. Headlines: the blade nerf landed
on its target (B3 −94, D2 −58, D1 −50); the sustain shelf rose as a class
(A1 +140, F1 +115, D11 +82, A2 +80); D12-hatburner reached 3rd on the aura, not
the sickness; 100% of deaths now land on a name.

The previous table (r232/r236, 33-35 strategies, pre-sustain-pass):
**`docs/history/2026-08-11-round21.8-elo.md`**
(the STANDING baseline; it replaces the r219 round-21 table, which replaced r207).
Cross-seed drift mean 8.8 / max 30 Elo, the tightest yet. Headlines: **anger
unmoved at #1** (B3 2087); the NEW **D12-hatburner (Hat of Aura 3 + malady 3)
enters 4th of 33** and D5-plaguebearer gains +129, so this round's aura+plague
buffs are the biggest movers; **every item core gained 58-126**: three price
cuts moved items nothing, two items that DO something moved them 60-130 in one
round, though they are still the bottom third (items are effect-limited, not
price-limited, sharpened); **C7-statue-guard lands at exactly 1500**, the honest
answer for a panic button no bot can time; **D11-spoonbearer is 32nd**, which
prices its deliberately low-damage frost+gale KIT, not the Slow Spoon (the same
item raised A1 +58 and B6 +118; human read needed); the **meteor lv2 buff
(24→30) is invisible** (C5 still last, Δ −1): its cast rules, not its damage,
are the lever.

**The sustain pass (r238, Remi's rulings; the A/B that drove it is the r236
addendum in the ELO file above).** Three numbers changed together:
**sword lifesteal 18/30/38 → 10/20/30%**, **spoon `healOnHit` 1/1.5/2 → 1/2/3**
with DoT/aura ticks paying **a tenth** (`tickFrac 0.1`, max one proc/s/victim),
and **hourglass haste 10/18/26 → 10/20/30**.
- **The break-even is now a flat 10 damage at every spoon level** (`flat ÷
  lifesteal%`), and hit sizes in this game are two spikes, 7 (bare fireball) and
  11 (ember-3 fireball), so that line cleanly separates "no damage investment"
  from "damage investment". Below 7: the spoon never won. Above 11: it always
  won. Measured p10/median/p90 per hit: 7/7/8 in a plain kit, 7/11/11 in an
  ember kit, max 18 in either.
- **Ticks at a tenth make the two fantasies pay the same** (hp healed per player
  per game, lv3, measured tick counts): anger+blade **722**, plague+spoon **768**
  (+6%), hat+plague+spoon **766** (+6%), while each item still wins its own
  home: blade **+27%** in an anger build, spoon **+19%** in a plague build,
  **+37%** in a plain low-damage kit, blade **+7%** back in an ember burst kit.
  At `tickFrac` 0.05 the ticks stop mattering (the Hat build prefers the blade);
  at 0.2 it runs +56% and the spoon becomes an aura item.
- Tick counts behind that, per player per game: Hat3+malady3 **984** ticks vs 157
  hits; malady3 alone **430** vs 213; anger builds ~**100** vs 165 hits at 14
  dmg each (vs 7.3 for everyone else).
- ⚠ Bots never cluster, so malady's contagion (and therefore the plague side of
  this) is a FLOOR. If plague+spoon feels oppressive live, 0.08 is the same rule
  with a smaller tenth.
⚠ **Instrument scar**: `EXHAUST_PASS` holds every item, so a one-variable item
A/B MUST use `caps: {other: 0}`. Without it the pair prices buy ORDER and
produces a plausible, wrong table.

⚠ The paragraphs below this line describe the SUPERSEDED r219 table and are kept
for the round-21 diffs they explain. Instrument: `tools/elo.js` (that run used
8000 games; ⚠ the STANDARD run is `--games=2000 --seed=1` since 2026-08-13): random
4-of-roster Hard lobbies in elemental, Bradley-Terry over all pairwise
placements, **1500 = roster average, +173 ≈ a 73% pairwise favourite**.
⚠ **It is a RANKING, not a strength meter**: the fit pins the average at 1500,
so a strategy can gain 200 Elo purely because its rivals got worse. Zero
unfinished games; cross-seed drift mean 13.5 Elo, max 71 (the top row).
Headlines:

- **Anger still #1 (B3-mutation-depth 2064) and #3 (D2-executioner 1880)**,
  unmoved by all of round 21. No absolute scale → question K stays Remi's call.
- **Items are effect-limited, not price-limited**: a third price cut (now flat
  5/7 g, whole shelf 129 g at the time *including* the new brazier; 126 g since
  21.7) left the five item-only
  cores at ranks 22/23/25/26/29 of 30. B6-item-breadth buys the brazier at all
  three levels and *lost* 30 Elo. Meanwhile elements-only scores 1557 on 102 g
  and spells-only 1585 on 88 g.
- **Half-price spell upgrades paid the KIT, not the maxer**: E2-chronomancer
  +80 → **4th of 30** (question M: CDR is top-quartile and honest, not OP);
  the three max-one-spell builds are still 24th/27th/28th. "Don't max spells"
  survived its own price cut (C2 lightning-lv1+ember 1683 vs C1 maxed 1311).
- **Malady's 20.3 ruling was a big buff in the lab**: the creator-immunity
  change (aura halved, but you no longer infect yourself) moved
  D5-plaguebearer **+202**, A4-mutations-only +124, B4-mutation-breadth +109
  (the three biggest gains in the table), and all three are cluster-blind, so the
  true gain is larger. Watch malady in the next playtest.
- **The Echo (ex-mosquito) demotion held** at the new prices (tycoon 12th,
  leech 19th, Chainer 27th): structural, not a seed artifact. "Midas ×
  mosquito is the champion economy engine" stays **VOID**.
- **Round 21's mechanisms are invisible to this table**: permanent pillars
  (bots never buy pillars), Statue, Decoy, teams, arena scaling (inert at 4
  seats). It measures round 21's PRICES only.
- CDR gold-for-gold math (still current, from the round-20 report §6): haste
  **sums** and `cd = base/(1+h/100)` is concave, so the full CDR core buys
  0.041 dps/gold vs ember's 0.119: **5 g of ember lv3 beats a maxed Hourglass**
  on the same fireball. Bots do cast on cooldown, but **every extra ball
  converts 5-7% worse**: knockback shoves the target out of the next ball's path.

### The mixed table (one element per seat, Hard, 800 games × seeds 1/7, round-19 HEAD 2026-08-09)

| element | s1 | s7 | | element | s1 | s7 |
|---|---|---|---|---|---|---|
| 🔴 Anger | 97.4 | 97.9 | | 🪙 Midas | 6.1 | 3.9 |
| 🦟 Mosquito | 63.8 | 62.1 | | 🦠 Malady | 5.2 | 4.0 |
| 🧛 Vampire | 35.8 | 29.3 | | ❄️ Frost | 4.7 | 4.0 |
| 🔥 Ember | 33.6 | 38.6 | | 🪨 Terra | 3.2 | 3.0 |
| 🔮 Arcane | 13.7 | 10.5 | | 👻 Ghost | 3.2 | 4.4 |
| | | | | 🌪️ Gale | 2.2 | 1.1 |

⚠ Anger's ~98% is a SATURATED instrument (bots claim marks near-perfectly);
sweeps barely move it (markEvery [16,12,8] → 94.1, markDmg 0.3 → 87.3
at 600 games, seed 1), so the shipped numbers are the fantasy-first ones and
the levers stay documented (question K, renamed). Mosquito 63% (tax version
loves bot volume: 4 procs/pair). ⚠ Malady/gale floors are NOT trusted: bots
never cluster (contagion) or exploit positioning (gust). The lab cannot
express either mechanic; human games are the instrument.

### The item ladder (1500 games, seat capped at that level, at `62de05b`)

⚠ **Prices below are pre-round-20** (items are flat 5/6/7 g since 21.7, whole
shelf 126 g with the Hat of Aura), and the **cape's rungs changed in 21.7**
(−25/−40/−50%), so its column measures the old, weaker cape. The effect columns still hold; the gold cost of each rung does not.
And the cut did not help: see the ELO headlines above.

| item | lv0 | lv1 | lv2 | lv3 | | item | lv0 | lv1 | lv2 | lv3 |
|---|---|---|---|---|---|---|---|---|---|---|
| boots | 27.7 | 26.7 | 24.9 | 20.7 | | cape | 51.2 | 28.7 | 14.0 | 6.1 |
| treads | 38.5 | 27.9 | 19.9 | 13.7 | | sword | **1.3** | 15.7 | 34.7 | 48.2 |
| amulet | 12.9 | 22.9 | 31.1 | 33.1 | | hourglass* | 7.1→~13 | | | |
| ring | 30.3 | 28.6 | 23.3 | 17.7 | | | | | | |

*hourglass row measured at [10,22,38]; the shipped [8,18,28] measured lv0
12.9 on its single-item ladder.* The §9 trim + the venom fix un-warped
sustain: amulet lv0 0.4 → 12.9 (≈ the ~15% ruling), ring is a free choice.
**The sword is the one mandatory item left, and its knob doesn't fix it**
(question L). Cape stays pilot-sign-flipping (question B, untouched).

### Strategy study (pre-softmax bots; headline rows; full tables in the history file)

venom-balanced 76.9/77.6 (pre-retune venom), mosquito-combo 55.1,
vampire-cadence 50.9, balanced 31.9/34.5, momentum-scaling 28.5/24.5 (alive;
the §6 target), midas-cdr 24.3/24.3, double-cdr 10.5/12.9, no-elements 1.2.
Extreme: all-cheap 69.1 tops; no 90s anywhere. ⚠ The study predates the
softmax bots AND the venom/hourglass retunes. Re-run before quoting it.

### Other health numbers

- Round-1 first-death median **34.3 s** (p25 29.3 / p75 37.9) vs ~31 s before
  the full-stop lock; the lock still does its round-1 job.
- Lava kill share 22.6% (Hard study), comeback rate 21.7%.
- h2h ladder after softmax + boltDodge: 100 / 99.8 / 100.
- Multi-enemy-focus metric shipped in arena.js; 3+ hunters on one victim
  34.9% → 26.1% at TEMPERATURE 6 (the metric itself reads ~13% and is a feel
  gauge, not the verdict; see the softmax history file).

## Round 22.4 + 22.5: stack fade, range cap, anger/vampire/midas (TABLED)

Remi's game-night call ("the new ice is too strong"): frost/gale/malady piles
now lose 1 stack per 9 unfed seconds (`STACK_DECAY` in constants.js; reapply
resets the clock; midas/anger exempt). Also fixed: a reflected ball used to
plant stacks under the REFLECTOR's name, so shields fed your freeze counter
with other players' frost (`pr.elemOwner` pins riders to the element's owner
now). Then 22.5: fireball `range` 50 (was Infinity), anger `markEvery`
[20,15,10] → [30,25,20], vampire's engorged ball heals a FLAT [10,20,30]
instead of 1.4/1.92/2.45 × damage, midas `dmgMult` [0.5,0.75,1] → [0.7,0.85,1].

**Measured: `docs/history/2026-08-13-round22.5-elo.md`** (r353, the standing
table above). Per-change reads, all two-seed:
- **anger**, element-mirror win% vs a 25% baseline (⚠ instrument DELETED round
  23, do not re-run): **92.3/91.0 → 83.3/84.1**. Real, and still 20 points
  clear of every other element. Question K stands: flag it, do not number-nerf
  around it.
- **stack fade**, same deleted study, fade on vs off: **malady −4.9/−7.3**, frost and
  gale inside the instrument's churn (~7 points). ⚠ The fade punishes poke-and-
  leave, which bots never do (a Hard bot re-feeds a pile every ~2 s from a ring
  of 8.5), so this is a FLOOR.
- **fireball range 50**: invisible to bots and structurally so. With the cap
  lifted, 38.7% of balls fly past 50 but **only 0.5% of the ones that CONNECT
  had flown 50+** (60 lobbies, 61417 balls): the cap deletes misses. A paired
  ablation (2500 games, identical lobbies, range 50 vs Infinity) sits at the
  noise floor (mean |Δ| 19.9). `stepBot` has no range check at all.
- **midas**: no measurable effect on either instrument (seeds disagree on sign).
  Every core that buys midas reaches lv3, where `dmgMult` is 1.0 either way.
- **vampire**: could NOT be ablated (the % path was deleted from sim.js in
  22.5); the Elo table's D4-leech +219 is the only read.

## Round 24: vampire mark-and-feast (shipped 2026-08-14)

Remi's diagnosis: heal-per-damage made vampire a high-damage-only pick, the
22.5 flat every-5th heal made it a high-frequency-only pick; both were the
same over-tight synergy. The rework decouples the heal from BOTH axes: every
fireball hit banks a MARK on that victim (never fades, dies with either
party); stepping inside the feast ring (r 7 = Hat of Aura lv3) vacuums the
whole pile back, one mark per 0.1 s, each healing `markHeal` [2,3,4] × a
linear 1→3 multiplier on the vampire's OWN missing hp. A started feast always
finishes. Full design, rulings and evidence:
`docs/history/2026-08-14-round24-vampire-feast.md`.

Measured (tools/elo.js standard 2000-game runs, seeds 1 AND 2; Elo 1500 =
roster average, ±40 ≈ neighbour noise; D4-leech = vampire 3 + mosquito +
sword/amulet): **D4-leech 1397 → 1603/1605 (+~206), rank 19 → 7 of 42**, now
level with the best non-Faker row (C4) while the control rows moved <40 on
both seeds. ⚠ BOT-FLATTERED:
berserker brains brawl inside r 7 all game (permanent vacuum) and never
burst a low vampire, which is the build's designed weakness. One-line
levers if live play agrees it is too strong: `markHeal`, `lowHpMax`.
(24.7: D4-leech was respecced to a frequency core, vampire+arcane+hourglass+
echo, per Remi's ruling that marks scale with hit count; the numbers above
measured the OLD core. New baseline: D4 1520, M6-vampire-first 1479, both
mid-pack, `docs/history/2026-08-14-round247-elo.md`.)

**Round 24.9 (2026-08-14, Remi's design pass on both mark mechanics)**:
scaling in long games is ACCEPTED as the fantasy (the FFA lobby turning on
the leader is the auto-balancer); what changed is visibility and setup.
**Midas = coins**: marks deleted; every fireball hit rolls [20,32,45]% to
drop a PUBLIC 1 g coin where the victim stood, owner-only pickup, coins die
with the round, Hard+ bots detour to collect (napkin + tables:
`docs/history/2026-08-14-round249-mark-reworks.md`). **Anger = release bar**:
claims still bank +0.5 forever, but a bar fills over 2× the default fireball
CD (4.2 s), every cast drains it, and the ball adds bank × charge; spam pays
crumbs BY DESIGN (deliberate anti-synergy with haste/echo). The round's
first mark lands immediately on your LAST KILLER (random if you didn't die).
Echo cadence [5,4,3] since 24.8. All levers one-line: `coinChance`,
`chargeCds`, `markEvery`.

## Round 24.1: midas hunt, mark-hunting bots, meteor craters, portal cross (2026-08-14)

Same-day follow-up to round 24; full report
`docs/history/2026-08-14-round241-midas-meteor-portals.md`. Midas pays +2 g
per claimed hunt mark (anger's cadence, NO malus of any kind; Remi's ruling
that buying must never weaken you). Hard+ bots hunt anger/midas marks
(`HUNT_MARK 40`; Normal untouched). Meteor leaves a permanent walkable lava
crater (`craterR` [3,4], real lava rules). Portal exits sit 2.5 past the
center on each portal's line (the four form a marked cross; the one-mine
center camp is dead).

Measured (standard 2000-game elo, seeds 1+2, vs the round-24 table):
**D3-tycoon 1434 → 1199/1189** (the midas build; mostly the END of a bot
artifact: bots volume-farmed the old +1 g-per-two-hits at 172 hits/game,
the new income is cadence-capped, humans lose far less), **K5 flat at
~2775/2753** (already at place 1.08: no headroom, the hunt cannot raise a
ceiling), B3 +40 on one seed, everything else within noise, 4000/4000 games
finished with craters in play. Levers if live play disagrees: `goldOnClaim`
2, `markEvery`, `craterR`, `EXIT_DIST`.

## Round 24.2: the 1/x cadence ruling (2026-08-14)

Levels that scale a cooldown-gated effect are computed in FREQUENCY space
now (the ruling lives in AGENTS.md): "+p% per level" = CD / (1+p), rounded.
Applied at +35%/level: anger markEvery [30,25,20] -> [36,27,20] (anchored
at lv3 = 20 s, Remi: "we don't want to buff anger"; an interim [30,22,16]
lived for one push), midas [30,25,20] -> [20,15,11] (new 20 s base). Portal EXIT_DIST
2.5 -> 5 the same day (too bunched), and the exit rune is an "x".

Measured (standard 2000-game elo, seeds 1+2, vs the 24.1 table):
**D3-tycoon 1199 -> 1307/1334** (the midas build; the faster cadence pays
~61 g/game of claims, up from 43), B3 anger ~1620 (inside noise), K5 flat.
The mixed-lobby gap to anger remains (depth beats breadth for bots; the
full account is the gold-probe analysis in this round's notes). A full CD
audit against the 35% default was reported to Remi in-chat; no other CDs
were changed.

## Round 24.3: the normalization pass (2026-08-14, Remi's numbers)

Pillar [14,10], Shield [15,11], Blood Debt [15,11], Rush [10,7] (the
pure-frequency levels near the +35% default); meteor dmg [16,30] -> [25,35]
(flatter step, net buff) with the ground-break moved to LV2 only (craterR
[0,4]); mine cd FLAT 9 (lv2 keeps damage + the second ball). Anger anchored
[36,27,20] the same day (lv3 = the 22.5 cadence, no buff). Elo tables for
the full 24.x batch: `docs/history/2026-08-14-round24x-elo-tables.md`.

## Round 24.11: the live-play trim (2026-08-19, Remi's numbers, UNMEASURED)

Remi's feel pass after the 08-17 games, all one-line reverts:
**midas** `coinChance [0.20,0.32,0.45] -> [0.20,0.30,0.40]` and coins now
MELT after `coinLife` 10 s (blink the last 3): the pierce+haste flywheel from
his Hard-lobby game out-earned the 24.9 napkin, and the melt forces the
owner into the fight instead of farming coins from range. **echo**
`doubleEvery [5,4,3] -> [6,5,4]`: the trailing ball advances the counter, so
[5,4,3] FELT like every-other-cast doubling at lv3; steady state is now
single-single-pair and the 5/4/3rd button text is true from the caster's
seat. **vampire** `lowHpMax 3 -> 2.5`: endgame proximity is forced, so the
near-death multiplier was the overperforming part.

## Round 24.12: echo un-nerfed with honest text, anger = the held charge (2026-08-19)

**Echo back to `doubleEvery [5,4,3]`** (24.11's [6,5,4] had silently undone
24.8's measured strength patch: M4-echo 1417 -> 1516 on Hard; echo was never
strong). The button now states the FELT cadence ("every 4/3/2nd fireball"),
which is truthful because the trailing ball advances the counter.

**Anger's 24.9 release bar is DELETED; the bank is HOLD-GATED** (Remi's
design, issue-6 charge machinery): an anger owner's fireball key holds;
five equal-time tiers over 1.5 s, gains back-loaded (`CHARGE` in
constants.js: radiusMult up to 1.4, bankFrac [0,.15,.35,.6,1]); release
fires bank x bankFrac and the ball GROWS; holding past the window fizzles
the cast with the cooldown already spent. A tap = tier 0 = zero bank: spam
now pays NOTHING (24.9's bar paid ~50% to spam). Marks, cadence
[36,27,20], revenge targeting, +0.5/claim all unchanged. Bots commit to a
hold at the press: Extreme+ perfect full charge, below that 50-100% rolled
per cast (Remi's spec), and at release the bot RE-AIMS its committed
target with a first-order lead (never through Vanish): without that, the
first 24.12 run put the whole anger family at rank-bottom (a 1.5 s stale
aim line is a pilot no human resembles). Both runs, deltas and the
what-bots-cannot-price flags: `docs/history/2026-08-19-round2412-elo.md`
(short: anger rows UP on Hard vs 24.10, M1 1529 -> 1614, D2 1117 -> 1440;
D1 anchor stable; the 24.11 midas/vampire trims read mild).

## Open questions

*These need Remi, not more games. Ordered by how much rides on them.*

**K. (round 19, ex-momentum) Anger on bot tables.** ~98% mixed at every knob
tried: bots claim marks near-perfectly, so the mirror cannot price the human
cost of hunting a specific target (the element's whole design). Classic
bot-inflation shape (round-12 rule: no number-nerfs around it). Measured
levers if your FEEL says too much: `markEvery [10,7,5] → [16,12,8]` = 94.1;
`markDmg 0.5 → 0.3` = 87.3 (both 600 games seed 1, still saturated). Human
math at shipped numbers: a devoted lv3 hunter ≈ +2 dmg/round. Your call.

**L. (round 17) The Blood Sword is mandatory by STRUCTURE.** Ladder lv0 1.3%,
and cutting lifesteal a third only moves it to 5.7. Under the full-stop regen
lock, lifesteal is the only heal that works while you're being hit. §9's
letter protects the sword (active healing SHOULD out-heal passive). Options:
accept the sword as the price of the readable lock; give lifesteal its own
soft lock; or revisit REGEN_LOCK_MULT (0 → 0.1-ish keeps the sentence "pauses
your regen" approximately true). Numbers for all three on request.

**M. (round 17, MEASURED round 20; now a feel call) Are the CDR builds where
you want them?** A dedicated family was built and run:
**E2-chronomancer** (arcane3 + hourglass3, then lightning/boomerang/shield/
rush/blink at lv1 and their lv2 cooldown levels) is **7th of 30, Elo 1697** ≈
a 76% pairwise favourite vs an average strategy; D7-stormcaller (same haste,
lightning maxed instead) 14th at 1531; E1-hastemaker (CDR × mosquito) 18th at
1438. So: viable and honest, top quartile, 340 Elo behind the leader.
The value lives in **arcane lv3's refund × kit WIDTH** (1 s off every other
cooldown per fireball hit ≈ +25-37 Ability Haste on the rest of your kit for
12 g), not in the fireball's own cadence. Why stacking is not OP:
`docs/history/2026-08-09-round20-elo.md` §6. Levers if your feel disagrees:
arcane's `haste`/`hitRefund`, hourglass cost. Your read decides.

**B. The Cape of the Magi**: unchanged (lab can't agree on the sign; only
your playtest settles it). **E. Midas's real value** rides on shopping depth,
not the saturated lab floor. **F. The round-13/16 feel items** (gale burst,
Blood Sword feel, mosquito in human hands, constant knockback, draft fun) are
all still yours. **H. Offense-first meta**: round 17 kept it; defense-first
still bottom-third.

~~**G. Venom**~~ is CLOSED: §7 shipped + the measured [0.5,1,1.5] retune.
~~**J. midas-cdr**~~ is CLOSED (see Current state).
**N. Statue 🗿 (round 21.4) is UNMEASURED.** A brand-new spell (2 s of total
invulnerability for 10 g), and no lab prices it: no BUILDS order contains it,
so bots only reach it through the shopping exhaust tail or draft, and its bot
pilot (shield's heuristic mirrored) cannot value 2 s of "nothing can touch me,
but I stand still". Whether the duration, the 16/12 s cooldown or the price are
right is a FEEL call after a human playtest, not a sweep.

**O. Decoy 👥 (round 21.6) is UNMEASURABLE by the labs.** It is a bluff against
a human's eyes; no bot can be fooled by one (see Current state above). Price,
5 s lifetime and "lv2 = a second body" are feel calls.

**D. Bots and the power tier**: §11 shipped pillar-cover and the Swap
lava-save, but no build list contains a power spell, so they fire only via
draft; teaching bots to BUY them is still open.

## How to reproduce

```bash
node tools/elo.js --games=2000 --seed=1                       # THE strategy ranking, ~5 min, ONE seed (Remi's standard run)
node tools/pair.js <A> <B> --games=400 --seed=1               # why an Elo gap: what each side DID (+ --fx sweeps)
node tools/roster.js                                         # roster cost check (--doc regenerates docs/ARCHETYPES.md)
node tools/h2h.js --games=400 brawler grunt                   # bot tiers (then berserker/brawler, stalker/berserker)
node tools/arena.js --games=60 --players=4                    # health: lava share, comebacks, focus metric
# (retired round 24.4: strategy-study.js, duel.js, arena --isolate/--ladder/--mirror/--probe; git ad9d54e)
node tools/coop.js --levels                                   # co-op mothballed: only if its tests break
npx vitest run                                                # 376 green
node test/harness/run.js test/harness/scenarios/bots.js
node test/harness/run.js test/harness/scenarios/coop.js
```

**Lab conventions** (unchanged, load-bearing): the shared exhaust tail in
`tools/arena.js` is breadth-first on purpose; probes rotate seats; a single
run is not a measurement: 2+ seeds, check monotonicity; the isolation
self-test needs ≥1600 games; ⚠ the isolation lab saturates at the top in
elemental mode (elements are the progression).
