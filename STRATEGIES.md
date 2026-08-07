# Bot strategies — the chart

*A bot is a **difficulty** (how it fights) × a **strategy** (what it buys).
Both are picked in the lobby: each difficulty button has a strategy dropdown
next to it, and 🎲 random rolls one of the six strategies when the bot is
seated. The same definitions drive the balance lab (`tools/arena.js`), so
arena reports and live games measure the same thing. The in-game version of
this chart is under "Bot difficulties & strategies explained" in the lobby.*

## Difficulty — how the bot fights

| ★ | Name | How it plays |
|---|---|---|
| ★ | **Grunt** | Wanders the safe ring and lobs fireballs with sloppy aim. Cannon fodder. |
| ★★ | **Berserker** | Hunts the nearest wounded/isolated prey, rushes in, herds rim-standers into the lava, never retreats (except from the lava's edge). Since round 10 it has a **human-ish reaction time** (~0.2 s): it aims from a slightly stale picture of you and its point-blank aim has real scatter — juking it in a duel works now. |
| ★★★ | **Stalker** | Sidesteps incoming projectiles (or shields late ones), leads its shots with a real intercept solve, finishes with lightning, teleports out of lava and point-blank pressure, kites harder when hurt. |

All three now also **pilot whatever their build buys** (the "use what you own"
layer in `shared/sim.js` → `pilotOwnedSpells`): a sniper-build grunt actually
zaps, a boomer-build berserker actually throws. Native behavior always takes
priority; the pilot layer only fires spells the kind logic doesn't use.

## Strategy — what the bot buys

Each shop, the bot buys the **first affordable item on its list** it doesn't
already own (then repeats until it can't afford anything). Reading a build =
reading its priorities: what it wants first is what the strategy is about.

| Strategy | Buy order | The idea |
|---|---|---|
| **Bruiser** | 🔥 amulet 🔥 boots sword ring cape treads | Max fireball damage plus HP and lifesteal. Stands its ground and trades hits. |
| **Sniper** | ⚡ 🔥 boots ⚡ 🔥 ⚡ cape ring | Lightning first: long-range instant poke, finishes low targets before they can heal. |
| **Escape artist** | boots 🔥 🌀 🔥 🔥 cape 🌀 ring | Max fireball with an escape button. Slippery, still dangerous. |
| **Turtle** | 🛡️ amulet ring cape 🛡️ treads 🔥 🔥 | Shield, regen, max HP, knockback resist. Outlasts everyone and lets the lava do the killing. |
| **Rusher** | 💨 🔥 boots sword 🔥 💨 amulet cape | Rush to close, shove you off the platform, lifesteal to stay in the fight. |
| **Boomer** | 🪃 🔥 boots 🪃 amulet 🪃 ring sword | Boomerang stacking: wide projectiles that hit on the way out **and** back. |

(The arena additionally runs a **greedless** control that never buys anything
— it exists only to calibrate the tables and is not offered in the lobby.)

**Which strategy fits which difficulty**: see the build × tier table in
`BALANCE.md` (report #4, 1500 mirror games per tier). It used to be restated
here, which meant every retune had to be typed into two files and the copies
drifted — read it there.

**Boomer is the strongest pick at every tier**, and that is partly a bot
artifact: nothing in the bot code dodges a boomerang (the ★★★ dodge routine
follows a projectile's current velocity ray, which is exactly what a
returning boomerang violates) and no bot ever *catches* one to halve its
cooldown, so the lab over-rates the weapon and under-rates the skill in it.
For the hardest fight, pick **boomer**; for a brawl, **berserker/bruiser**;
for a war of attrition, **stalker/turtle**. Rusher and escape stay weak in
bot hands (bots can't extract teleport/rush's reactive value the way a human
can) — pick them for flavor, not challenge. Sniper on a berserker (6.4%) is
a deliberate mismatch: a no-push mid-range finisher handed to the profile
whose whole plan is to be in your face.

## How to read the arena reports

Every table in `BALANCE.md` (and every `tools/arena.js` run) uses the same
conventions — keep these in mind and the numbers stop being mysterious:

- **Win rate**: fraction of its games this strategy finished **1st of 4**.
  With 4 players the neutral baseline is **25%** — above 25% is strong,
  below is weak. 30% ≈ mildly favored; 50% ≈ dominant; 5% ≈ a trap.
- **Elo**: like chess ratings, computed from pairwise placements (finishing
  2nd still beats the two below you). Everyone starts at 1000; ±50 is a
  real gap, ±150 is a different league. Elo is more stable than win rate
  at low game counts because every placement counts, not just 1st.
- **avg-place**: average finishing position (1–4). Neutral is 2.5.
- **Mixed studies confound skill with shopping**: `stalker/anything` beats
  `grunt/anything` because piloting dwarfs purchases. To compare *builds*,
  read the **mirror** tables (`--mirror=stalker`: all seats the same
  difficulty, only builds differ) — that isolates the shopping question.
- **lava kill share**: fraction of deaths where the victim died in lava.
  Knockback into lava IS the game, but the target share has drifted with the
  retunes: ~86% originally, ~68% after round 8/9, **~45–60% after round 10**
  (softer low-HP knockback + 2× swim speed make lava escapable). Remi hasn't
  ruled on the right value yet — treat big moves as a signal, not a bug.
- **comeback rate**: fraction of games the winner was at some point ≥4
  kills behind — a health check that games aren't decided in round 3.

*Report-writing rule (2026-08-03, from Remi): any future balance report must
explain its metrics before using them, spell out the baseline (25% for 4
players), and describe each strategy in build+playstyle terms — link here
instead of assuming the reader remembers the codenames.*
