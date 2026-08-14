# Round 24.1: midas hunt, mark-hunting bots, meteor craters, portal cross (2026-08-14)

Remi's second voice list of the day, shipped a few hours after round 24.
Four changes; interpretations stated per the transcription rule.

## 1. Midas: pays, never taxes

His ruling: "it's a bad design that players get something bad instead of
good when they spend their money". The -30/-15/-0% fireball malus
(`dmgMult`), the push malus (`kbMult`) and the plant-then-cash rhythm are
DELETED (the generic fx.dmgMult/kbMult engine went with them; no element
declares either any more). Midas is Anger's twin now, one shared hunt
engine (`MARK_HUNTS` in sim.js): every `markEvery` [30,25,20] s (anger's
exact numbers, his instruction) a gold mark lands on a random living
opponent; a FIREBALL hit on them claims `goldOnClaim` **+2 g flat** (his
first-try value) and re-arms the clock. Claims pay through the ordinary
gold columns, so the 2x earn-spread cap logic is untouched. Statues are
not candidates; the mark dies with the round; classic unaffected.

## 2. Bots hunt their marks (Hard and above)

"Make it so that the bots hunt the marks whenever possible starting from
hard and above; below hard no changes." Implemented as `huntPull`: the
enemy carrying MY anger or midas mark reads `BOT_TARGETING.HUNT_MARK` (40)
apparent units closer in BOTH targeting seams (pickPrey's softmax for
berserker, nearestEnemy for stalker/faker). Gated on the bot's KIND
(`BOTS[kind].difficulty >= Hard`), NOT its brain: Normal is the berserker
brain on the brawler kind and is untouched by construction (test-locked).
Midas left `PREY_MARKS` (the small generic my-stacks bias) so it is not
counted twice.

## 3. Meteor breaks the ground into lava (from Ju's idea, made walkable)

Ju's version made impassable holes; Remi wants LAVA you can gamble on
crossing. Impact leaves a crater (`SPELLS.meteor.craterR` [3,4]; the blast
radius stays 6) that IS lava: the `inLava` read in stepBattle covers it,
so LAVA.DPS (x treads resist), Fire Walk immunity, the x2 swim speed and
the knock-them-in kill credit all come for free. Craters are PERMANENT
across rounds (the pillar precedent; "you broke the ground"); spawn seats
walk themselves around the ring until clear (`inCrater` nudge in
startRound, test-locked). The client draws the pool radius-TRUE with a
crusted lip, and the impact plays a ground-break: shards + a lava geyser
(`craterBurst` fx riding the meteorHit event's new `crater` field).
⚠ Bots do not path around craters (they never pathed around anything);
flagged, not fixed. My calls, both one-line levers: craterR [3,4],
permanence (delete the no-reset to make them round-long).

## 4. Portal exits form a cross

"Players just buy mines, and you get destroyed [arriving] at the center."
Each portal now exits on its own portal-to-center line, `EXIT_DIST` 2.5
PAST the center (a bit more than a player diameter, and past a center
mine's trigger ring 1.32 + body; test-locked). Four distinct exits form a
cross, each marked by a small cool-toned floor rune (client). A charging
repulse still survives the trip and detonates at the exit.

## Measured (tools/elo.js standard 2000-game runs, seeds 1 and 2)

Elo over 42 roster strategies, 1500 = average, neighbours differ by ~±40
noise. Baseline = the round-24 runs from earlier today (same instrument).

| row (what it plays) | round 24 | 24.1 seed 1 | 24.1 seed 2 |
|---|---|---|---|
| D3-tycoon (midas 3 + mosquito + hourglass + sword/amulet) | 1434 | **1199** | **1189** |
| K5-faker-vendetta (Faker brain, anger 3 core) | 2788 | 2775 | 2753 |
| B3-mutation-depth (anger 3 on the Hard brain) | 1549 | 1600 | 1584 |
| D4-leech (vampire, round 24) | 1603/1605 | 1627 | 1630 |
| C4 / D1 controls | 1605 / 1552 | 1661 / 1548 | 1637 / 1555 |

Readings, with what the instrument cannot see:

- **D3-tycoon -240**: expected and mostly a bot artifact ENDING, not a raw
  nerf of that size for humans. Old midas income was volume-farmed (a bot
  lands a median 172 balls/game; +1 g per two hits on one body), which is
  exactly the inflation question J documented. The new income is
  cadence-capped (~2 g per 25-30 s regardless of hit volume), so bots lose
  their farm while a human's real income loss is far smaller. If it feels
  poor live, the levers are `goldOnClaim` (2) and `markEvery`.
- **K5 flat at ~2775 despite the hunt**: it already placed 1.07-1.08 of 4;
  there is no headroom above winning nearly everything. The round-23 note
  "no bot chases the mark, 2783 is a floor" is now resolved the other way:
  the floor was also the ceiling. B3's small climb (+40, one seed) is the
  visible hunt dividend at Hard.
- **Craters did not degenerate games**: 4000/4000 games finished, arena
  smokes at 4p/8p show lava kill share ~46%, same as round 24.

## Verification

517 vitest green (12 new/updated cases: midas hunt + claim, no-malus,
hunt-vs-Normal draw counts, crater terrain/persistence/spawn-nudge/wire,
portal exits + mine-coverage bound, repulse-at-exit). Harness bots+coop,
client-robustness chromium+webkit, solo-static, reconnect, arena 4p/8p.
Screenshot-verified: crater pool + geyser, portal exit cross, gold hunt
orb + "mark is OUT" HUD chip. No wire-shape changes beyond the additive
craters list; wire labs not run.
