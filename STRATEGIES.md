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
| ★★ | **Berserker** | Hunts the nearest wounded/isolated prey, rushes in, herds rim-standers into the lava, never retreats (except from the lava's edge). |
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
| **Escape artist** | 🌀 boots 🔥 🌀 cape 🔥 ring treads | Teleport and speed. Nearly impossible to shove into the lava; wins by outliving. |
| **Turtle** | 🛡️ amulet ring cape 🛡️ treads 🔥 🔥 | Shield, regen, max HP, knockback resist. Outlasts everyone and lets the lava do the killing. |
| **Rusher** | 💨 boots 🔥 💨 sword amulet 🔥 cape | Rush to close, shove you off the platform, lifesteal to stay in the fight. |
| **Boomer** | 🪃 🔥 boots 🪃 amulet 🪃 ring sword | Boomerang stacking: wide projectiles that hit on the way out **and** back. |

(The arena additionally runs a **greedless** control that never buys anything
— it exists only to calibrate the tables and is not offered in the lobby.)

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
- **lava kill share**: fraction of deaths where the victim died in lava
  (~86% by design — knockback into lava IS the game).
- **comeback rate**: fraction of games the winner was at some point ≥4
  kills behind — a health check that games aren't decided in round 3.

*Report-writing rule (2026-08-03, from Remi): any future balance report must
explain its metrics before using them, spell out the baseline (25% for 4
players), and describe each strategy in build+playstyle terms — link here
instead of assuming the reader remembers the codenames.*
