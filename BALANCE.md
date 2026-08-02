# Balance report #1 — 4,500 headless games

*2026-08-02. Generated with `tools/arena.js` (see bottom for how to rerun).
Rules at time of study: first to 15 kills, size-by-lead on, tuning v3.*

## Method

A **strategy** = combat profile × build scheme. Three profiles (the bot AIs:
grunt ★ / berserker ★★ / stalker ★★★) × seven build schemes (shopping
priority lists: bruiser, sniper, escape, turtle, rusher, boomer, and a
"greedless" control that never buys) = 21 strategies. Each game samples 4 (or
6) distinct strategies into a free-for-all, plays a full seeded game directly
against the simulation, and updates an **Elo rating per strategy** from the
final kill ranking (pairwise). 3,000 four-player games + 1,500 six-player
games ≈ 100 s of compute total.

## Elo tables

**4 players, 3,000 games** (expected win rate 25%):

| Elo | Win% | Strategy | | Elo | Win% | Strategy |
|---|---|---|---|---|---|---|
| 1888 | 85.1 | stalker/bruiser | | 803 | 8.9 | berserker/turtle |
| 1877 | 83.2 | stalker/turtle | | 801 | 10.6 | berserker/boomer |
| 1816 | 79.0 | stalker/sniper | | 682 | 1.7 | berserker/escape |
| 1559 | 58.3 | stalker/boomer | | 647 | 0.9 | berserker/sniper |
| 1518 | 49.7 | stalker/rusher | | 626 | 3.9 | grunt/rusher |
| 1434 | 50.1 | stalker/escape | | 622 | 3.1 | grunt/turtle |
| 1080 | 32.6 | berserker/bruiser | | 604 | 0.2 | grunt/escape |
| 1062 | 19.6 | stalker/greedless | | 590 | 0.7 | grunt/sniper |
| 930 | 16.8 | berserker/rusher | | 569 | 7.9 | grunt/boomer |
| 842 | 14.9 | grunt/bruiser | | 530/520 | 0.0 | \*/greedless |

**6 players, 1,500 games**: same ordering, same tiers (top: stalker/bruiser
1754, stalker/sniper 1728, stalker/turtle 1628; bottom: grunt builds ≤733).

## Findings

1. **Skill dwarfs shopping.** The entire stalker block sits above every
   berserker strategy, which sits above every grunt strategy. A stalker that
   never buys anything (Elo 1062) still beats 13 of 14 itemized lower-skill
   strategies. Dodging + aim-leading is worth far more than any build.
   *Implication:* if human play mirrors this, mechanical outplay decides
   games. Whether that's good (skill expression!) or bad (items feel weak) is
   a design taste question — Warlock lineage says it's good.
2. **Items matter a lot within a skill tier.** stalker/bruiser 85% vs
   stalker/greedless 20% — a 4× win-rate multiplier from shopping alone.
3. **Best builds: raw damage + HP.** bruiser (Fireball ups → Amulet → Sword)
   and turtle (Shield/Amulet/Ring/Cape) are the top pair in both studies;
   sniper (Lightning focus) close behind. The common core: **HP stacking and
   Fireball levels**.
4. **Mobility-first builds underperform** at every skill level: escape
   (Teleport first) and rusher (Rush first) are the weakest real builds
   within each profile. Spending 12 g on utility before damage/HP appears to
   be a trap.
5. **Winner-held rates** (marginal, confounded by which profiles buy what —
   read as hints only): Treads 55.7%, Sword 54.6%, Cape 51.3% at the top;
   Teleport 17.0%, Rush 23.8%, Lightning 25.8% at the bottom (4p).

## Caveats — read before nerfing anything

- **Bot pilots undervalue utility.** Teleport/Shield/Rush ratings are only as
  good as the AI's usage of them (the stalker uses them well; grunts barely).
  Human hands may invert finding 4. Don't buff Teleport purely on this data.
- Build lists are fixed priorities, not adaptive; no counter-building.
- All FFA — team modes would change item math (e.g. Cape vs focused fire).

## Suggested next experiments (cheap to run)

1. Re-run with Amulet 12 g → 14 g and Sword 14 g → 16 g: does the bruiser/
   turtle dominance soften?
2. Give the *grunt* profile teleport-usage logic, re-measure escape builds —
   separates "Teleport is weak" from "bots waste it".
3. Mirror matches (same profile, different builds, 1v1v1v1) for
   confound-free build comparisons.
4. Sweep `PLAYER.SIZE_LEAD.PER_KILL` (0 / 0.08 / 0.15) and measure comeback
   rate (games won by a player who was ≥4 kills behind at some point) — is
   size-by-lead actually producing comebacks?

## Rerun / extend

```bash
node tools/arena.js --games=3000 --players=4 --seed=42   # this study
node tools/arena.js --list                                # strategies
```

Add builds in `tools/arena.js` (`BUILDS`), profiles in `shared/sim.js`
(`stepBot`). Everything is seeded and deterministic.
