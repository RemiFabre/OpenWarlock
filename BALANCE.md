# Balance report #2 — the v5 rebalance campaign

*2026-08-03. Generated with `tools/arena.js` (rerun commands at the bottom).
Rules at time of study: v5 mechanics — knockback doubled and HP-scaled
(`KB_HP_FACTOR 0.8`), damage halved, baseline regen 1.2, death-adaptive lava
shrink, 6 pillars on ring 40, first to 15 kills. ~46,000 headless games total.*

## Method (what changed since report #1)

Report #1's big confound was **profile × build**: a stalker with any build
beats a grunt with any build, so mixed Elo mostly measures the pilot. This
campaign adds three instruments to `tools/arena.js`:

1. **Mirror mode** (`--mirror=stalker`): every seat runs the *same* bot
   profile, only builds differ. Confound-free build comparison within one
   skill tier — this is the primary balance instrument now.
2. **Item probe** (`--probe=berserker`): every seat runs the same profile
   *and the same build tail*; only the **first purchase** differs (one item,
   or nothing for the control). This de-confounds the winner-held item table,
   which systematically flatters items that sit late in build lists (only
   players who are already winning live long enough to buy them).
3. **Kill-cause + comeback tracking**: every death is classified lava vs
   direct damage (death position vs current arena radius), and we record the
   eventual winner's worst kill deficit (comeback = won after being ≥4 behind).

Plus one measurement patch: **no bot profile ever casts boomerang** (see
finding 0), so the arena now ships a deliberately-dumb harness-side
"boomerang assist" (throw at nearest enemy in range when off cooldown),
default on, `--noboomassist` to disable. Without it the spell is unmeasurable.

Convergence target for "somewhat balanced": in mirror runs, every build the
profile can actually pilot lands within [0.6×, 1.6×] of uniform (15–40% for
4 seats); no item >60% or <15% winner-held in mixed runs; boomerang off the
floor.

## Finding 0 — build ratings are capped by what the pilot casts

Grepping `stepBot`: grunt casts **fireball only**; berserker **fireball +
rush**; stalker **fireball, lightning, teleport, shield**. Nobody casts
boomerang. So "escape is a trap" (report #1, finding 4) was half pilot
artifact: for a grunt or berserker, teleport is 18g of *nothing*. Mirror
tables below must be read per profile, over the builds that profile can use:

- grunt mirror: only bruiser (and boomer, via assist) is fully piloted.
- berserker mirror: bruiser, rusher, boomer are fair; turtle/escape/sniper
  carry 10–18g of dead spell gold.
- stalker mirror: everything except rusher is fairly piloted.

This is a **sim.js bot problem, not a numbers problem** — out of scope for
this campaign (constants only), flagged for the next one.

## Baseline (v5 as committed, before any change)

**Mirror win rates** (1,200 games each, 4 seats, seed 7, expected 25%,
band [15–40%]):

| build | grunt | berserker | stalker |
|---|---|---|---|
| bruiser | **83.8** | **79.9** | 34.8 |
| sniper | 13.1 | 6.6 | 23.1 |
| escape | 31.6 | 11.1 | **60.5** |
| turtle | 24.0 | 21.5 | **54.5** |
| rusher | 13.6 | **42.7** | 0.5 |
| boomer | 7.8 | 10.4 | 0.8 |
| greedless | 0.0 | 0.0 | 0.0 |

**Mixed study** (2,000 games, seed 42): treads 64.7% / cape 60.8%
winner-held (both over the 60% cap), boomerang 18.4%, rush 22.2%. Lava kill
share 88.2%, comeback rate 12.7%. Full Elo table ordering matches report #1's
skill-tier story (stalker block > berserker block > grunt block).

**Item probe, baseline values** (1,200 games, seed 11, same build tail, only
first item differs — expected 25%):

| first item | berserker | stalker |
|---|---|---|
| treads | 40.1 | **68.0** |
| cape | **45.1** | 39.8 |
| ring | 31.9 | 25.0 |
| sword | 24.3 | 14.1 |
| *none (control)* | 13.4 | 8.3 |
| amulet | 12.2 | 10.8 |
| boots | 7.9 | 8.5 |

Read: treads and cape are *genuinely* strong (not just list-position
confound) — a stalker whose first 10g goes to treads wins 8× more often than
the identical stalker who saves the gold. Amulet and boots first are *worse
than buying nothing first* (they delay fireball levels). The survivability
meta is real.

## Iterations

### Iteration 1 — measurement fix: boomerang assist (no constants touched)

- **Measured:** boomer build at the floor everywhere (7.8 / 10.4 / 0.8%).
- **Hypothesis:** it's not (only) the pillars or the damage halving — bots
  never throw the thing; 22g of the build is dead gold.
- **Change:** harness-side boomerang micro-pilot in `tools/arena.js`
  (measurement tool only; the real game's bots still never cast it).
- **Result:** grunt boomer 7.8 → **15.2** (in band), berserker 10.4 →
  **17.8** (in band), stalker 0.8 → 0.6 (stalkers dodge slow projectiles;
  boomerang numbers themselves still too weak vs good pilots). Mixed
  boomerang winner-held 18.4 → 18.6%.

### Iteration 2 — fireball upgrade nerf

- **Measured:** bruiser at 84% (grunt) / 80% (berserker) in mirrors — the
  two profiles whose main (or only) spell is fireball. The L2/L3 upgrades
  gave +12 knockback each for 6g, in a meta where knockback = lava kills.
- **Hypothesis:** fireball levels are the most gold-efficient purchase in the
  game for any fireball-centric pilot.
- **Change:** `SPELLS.fireball.costs [0,6,6] → [0,8,8]`, `knockback
  [72,84,96] → [72,80,88]`.
- **Result:** weak. bruiser 84.1 → 81.7 (grunt), 79.8 → 78.3 (berserker),
  36.8 → 32.2 (stalker, still comfortably in band). **Kept** (directionally
  right, hurts nothing), but the lesson is that bruiser's mirror dominance is
  mostly *structural*: for a pilot whose only spell is fireball, every rival
  build carries 10–18g of dead spell gold. Constants cannot fix that (see
  Finding 0 and "still imperfect").

### Iteration 3 — treads + cape nerf

- **Measured:** treads 65.0% / cape 65.4% winner-held in the mixed study
  (cap: 60%), and the item probe proved it's causal, not list-position bias
  (treads-first stalker: 68% vs 8.3% control). Stalker mirror's over-band
  escape (58.5) and turtle (57.9) both stack cape + treads.
- **Hypothesis:** in a game where 87% of deaths are lava, "take less lava
  damage" and "get knocked back less" are the two best stats per gold; both
  were priced like ordinary items.
- **Change:** `ITEM_FX.treads.lavaMult 0.5 → 0.65` and cost 10 → 12;
  `ITEM_FX.cape.kbMult 0.75 → 0.85` (descs updated to -35% / -15%). One test
  expectation updated (`lava treads reduce lava damage`: ratio bound
  0.6 → 0.75).
- **Result:** cape fixed — probe 39.8 → 32.4 (still good, no longer absurd),
  mixed winner-held 65.4 → 59.6 (under the cap). Treads improved in the probe
  (68.0 → 53.9) but its *mixed winner-held went UP* (65.0 → 73.8): the higher
  price means only already-winning players afford it, a selection artifact
  that proves winner-held share is unreliable for expensive items — trust the
  probe. Stalker mirror: turtle 57.9 → 52.5, escape 59.9 (unchanged —
  teleport, not cape, is escape's engine). Berserker bruiser 78.3 → 72.9.
  **Kept.**

### Iteration 4 — boomerang rescue

- **Measured:** even with the assist throwing it, boomer sat at 3.7% in the
  stalker mirror (dodging pilots) and boomerang upgrades were objectively
  dead gold: +2 damage per 6g and *zero* knockback growth, in a meta where
  knockback is the kill stat (fireball gets kb growth; boomerang didn't).
- **Hypothesis:** boomerang is too slow to hit anyone who dodges (speed 26 vs
  fireball 34) and its levels buy nothing.
- **Change:** `SPELLS.boomerang: cooldown 6 → 4.5, speed 26 → 31, knockback
  [56,56,56] → [56,66,76]`.
- **Result:** the campaign's biggest win. grunt boomer 16.8 → **39.1**,
  berserker boomer 24.7 → **32.9** — both in band. As a side effect the
  extra boomer pressure pushed bruiser further down (grunt 81.7 → 75.3,
  berserker 72.9 → 70.5). Stalker boomer only 3.7 → 5.5: against pilots that
  dodge and lava-save, a projectile-only build without teleport/shield stays
  weak — again partly structural. One test needed a gold bump (`a berserker
  buys rush in its first affordable shop`: 24 → 28g, since fireball upgrades
  now cost 16 total). **Kept.**

### Iteration 5 — teleport/shield tax + treads re-shape

- **Measured:** stalker mirror still had escape at 62.0 and turtle at 50.3
  (band tops out at 40): teleport (not cape) is escape's engine, shield is
  turtle's. Treads still #1 in the probe at 53.9, and its cost hike had
  *worsened* the mixed selection artifact.
- **Hypothesis:** the two utility spells are underpriced for how well a good
  pilot converts them into lava saves; treads should be weaker but cheap
  (so early access stops correlating with already-winning).
- **Change:** `teleport costs [12,6] → [14,8], cooldown [12,9] → [14,10]`;
  `shield cooldown [13,10] → [15,12]`; `treads lavaMult 0.65 → 0.7, cost
  12 → 10`.
- **Result:** stalker escape 62.0 → 52.9, turtle 50.3 → 48.1 (still above
  band, closing). Probe treads 53.9 → 48.9; mixed treads 59.2% (under the
  cap), cape 61.5% (borderline). Side effect: berserker escape 7.2 → 4.3 —
  the pricier teleport is even worse for a pilot that never casts it
  (structural, accepted). **Kept.**

### Iteration 6 — utility effectiveness + last fireball trim

- **Measured:** stalker escape/turtle still 2.1×/1.9× uniform; berserker
  bruiser still 71.6.
- **Hypothesis:** cost taxes weren't enough because the stalker converts
  every teleport charge into a guaranteed lava save — the lever is charge
  *frequency*, not price. Bruiser gets one more knockback-growth trim.
- **Change:** `teleport cooldown [14,10] → [16,12]`; `shield duration
  1.5 → 1.25`; `fireball knockback [72,80,88] → [72,78,84]`.
- **Result:** stalker escape 52.9 → **45.2**, turtle 48.1 → 50.9 (the shield
  duration cut did less than hoped — turtle's core is items), sniper up to
  36.5, bruiser 32.8 — four of five piloted stalker builds now in or near
  band. Berserker bruiser 71.6 → 68.1, grunt bruiser 75.3 → 72.1; grunt
  boomer drifted to 43.0 (a hair over band — the assist-thrown boomerang is
  strong against pilots that never dodge). **Kept**; campaign stopped here.

## Final state

**Mirror win rates, before → after** (1,200 games, seed 7, band [15–40%];
† = build carries spell gold this pilot cannot cast — read structurally):

| build | grunt | berserker | stalker |
|---|---|---|---|
| bruiser | 83.8 → **72.1** | 79.9 → **68.1** | 34.8 → 32.8 |
| sniper | 13.1 → 11.4 † | 6.6 → 4.2 † | 23.1 → **36.5** |
| escape | 31.6 → 16.0 † | 11.1 → 4.5 † | 60.5 → **45.2** |
| turtle | 24.0 → 21.3 † | 21.5 → 20.2 † | 54.5 → **50.9** |
| rusher | 13.6 → 12.1 † | 42.7 → 43.5 | 0.5 → 1.6 † |
| boomer | 7.8 → **43.0** | 10.4 → **32.8** | 0.8 → 7.7 |
| greedless | 0.0 | 0.0 | 0.0 |

**Item probe, before → after** (same build tail, first purchase differs,
expected 25%):

| first item | berserker | stalker |
|---|---|---|
| treads | 40.1 → 24.0 | 68.0 → 48.7 |
| cape | 45.1 → 25.8 | 39.8 → 27.4 |
| ring | 31.9 → 37.2 | 25.0 → 36.8 |
| sword | 24.3 → 35.3 | 14.1 → 21.2 |
| amulet | 12.2 → 19.8 | 10.8 → 14.7 |
| *none* | 13.4 → 18.6 | 8.3 → 12.7 |
| boots | 7.9 → 13.9 | 8.5 → 12.3 |

The berserker probe is now genuinely flat (13.9–37.2 around a 25%
expectation). The stalker probe still crowns treads, but at 3.8× control
instead of 8.2×.

**Mixed study, 2,000 games (4p, seed 42)** — winner-held shares: cape 60.6%
(borderline at the cap), treads 59.1%, sword 51.9%, ring 45.2%, amulet 41.4%,
boots 32.8%, teleport 30.3%, lightning 28.6%, shield 28.4%, **boomerang
24.2%** (was 18.4% — off the floor), rush 22.7%. All within [15%, 61%].
Elo top of table compressed: stalker/sniper 1755, escape 1720, bruiser 1696,
turtle 1678, boomer 1556 (baseline had escape at 1824 with a 100-point gap).
The 6-player study (800 games, seed 9) shows the same ordering.

**Kill causes & comebacks** (unchanged by design): lava kill share 84.6–88%
across all runs — Remi's "the lava is the killer" intent holds (≥70% target).
Comeback rate (winner was ≥4 kills behind at some point): 12.3% in 4p mixed,
21.1% in 6p, 24–37% in mirrors (evenly matched seats produce more lead
changes).

**All constants changed this campaign** (v5-commit → now):

| constant | before | after | iteration |
|---|---|---|---|
| fireball costs | [0,6,6] | [0,8,8] | 2 |
| fireball knockback | [72,84,96] | [72,78,84] | 2, 6 |
| boomerang cooldown / speed | 6 / 26 | 4.5 / 31 | 4 |
| boomerang knockback | [56,56,56] | [56,66,76] | 4 |
| teleport costs / cooldown | [12,6] / [12,9] | [14,8] / [16,12] | 5, 6 |
| shield cooldown / duration | [13,10] / 1.5 | [15,12] / 1.25 | 5, 6 |
| treads lavaMult (cost) | 0.5 (10) | 0.7 (10) | 3, 5 |
| cape kbMult | 0.75 | 0.85 | 3 |

Untouched by request: PLAYER.SPEED, KB_HP_FACTOR, REGEN, SIZE_LEAD, all
ARENA/LAVA values. Nothing in the data screamed that any of them is broken.

## Experiment: does size-by-lead produce comebacks?

One-off measurement (not a balance change): `PLAYER.SIZE_LEAD.PER_KILL` was
temporarily set to 0, the exact same seeded runs were repeated, and the
constant restored to 0.08. Comeback rate = share of games won by a player
who was ≥4 kills behind the leader at some point.

| run (same seeds/params) | PER_KILL = 0 | PER_KILL = 0.08 |
|---|---|---|
| mixed 4p, 2,000 games | 10.7% | **12.3%** |
| grunt mirror, 1,200 | 20.8% | **26.3%** |
| berserker mirror, 1,200 | 20.0% | **23.7%** |
| stalker mirror, 1,200 | 21.7% | **37.1%** |

**Yes — the mechanic works**, and it works hardest exactly where you want
it: among evenly-matched skilled players (stalker mirror: +15 points, a 1.7×
comeback multiplier). In mixed games it only adds ~1.6 points because
blowouts across skill tiers are decided by piloting, not by target size.
Kill-lead body growth is doing its job; no change recommended.

## What's still imperfect

1. **bruiser vs fireball-only pilots (grunt 72%, berserker 68%).** Mostly
   structural: when a pilot can only cast fireball (grunt) or fireball+rush
   (berserker), every other build donates 10–18g to spells that pilot never
   uses. Constants were pushed as far as sensible (fireball upgrades now
   cost 16g total for +12 kb / +6 dmg); going further would gut the spell
   for humans. The real fix is bot work in `shared/sim.js` (out of scope
   here): teach grunts/berserkers to cast what they own.
2. **stalker turtle 50.9% / escape 45.2%** — above the 40% band line but no
   longer a 2.4× outlier. Survivability is simply what wins v5's lava meta;
   with lava at 87% of kills this may be *correct* rather than broken.
3. **stalker boomer 7.7%** — the assist pilot is deliberately dumb and
   stalkers dodge; treat as a lower bound on the spell, not proof it's weak.
4. **cape at 60.6%** winner-held in the mixed run — right at the cap, but
   the de-confounded probe has it at a healthy 26–27%, so this is mostly the
   list-position artifact (iteration 3 result explains it).

## Caveats (report #1's still apply)

- **Bot pilots undervalue utility** — and worse than we knew: they don't
  even cast most of it (Finding 0). Teleport/shield/rush/boomerang mirror
  numbers are floors for grunt/berserker contexts, decent estimates only for
  the stalker.
- **Winner-held share is confounded twice**: by profile (report #1) and by
  list position/price (iteration 3 — a price *increase* pushed treads'
  winner-held share *up* 9 points while the causal probe showed it got
  weaker). Use `--probe` for item questions; the mixed table is a smell
  test only.
- The boomerang assist is a harness construct (`--noboomassist` to disable):
  real in-game bots still never throw it. Boomer-build numbers describe the
  spell's potential, not current bot games.
- Build lists are fixed priorities, no counter-building; FFA only.

## Recommended next experiments

1. **Teach the bots their spells** (sim.js): a generic "cast owned spells
   sensibly" fallback would make all 21 strategies measurable and likely
   melt most of the remaining bruiser dominance. Highest value per hour.
2. **Turtle vs shield**: iteration 6 cut shield duration and turtle barely
   moved — probe turtle's items (its core seems to be amulet+ring+cape+
   treads, not shield). An item-probe variant with a turtle tail would
   confirm.
3. **Cape price point**: try cost 14 (keep -15%) and see if mixed share
   drops below 55% without hurting the probe number.
4. **Human validation**: the whole campaign assumes bot-vs-bot transfer;
   one evening of 3-4 player human games tracking builds would calibrate.

## Rerun / extend

```bash
node tools/arena.js --games=2000 --players=4 --seed=42     # mixed study (Elo + items + kill causes)
node tools/arena.js --mirror=stalker --games=1200 --seed=7 # mirror: same pilot, builds only
node tools/arena.js --probe=stalker --games=1000 --seed=11 # item probe: same build tail, first item differs
node tools/arena.js --noboomassist --mirror=grunt          # faithful run (bots never throw boomerang)
node tools/arena.js --list                                 # strategies
npx vitest run                                             # 61 tests
node test/harness/run.js test/harness/scenarios/bots.js    # full-stack bot game (slow, ~2 min)
```

Add builds in `tools/arena.js` (`BUILDS`), profiles in `shared/sim.js`
(`stepBot`). Everything is seeded and deterministic.
