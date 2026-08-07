# Bot strategies — the chart

*A bot is a **difficulty** (how it fights) × a **strategy** (what it buys).
Both are picked in the lobby: each difficulty button has a strategy dropdown
next to it, and 🎲 random rolls one of the six strategies when the bot is
seated. The same definitions drive the balance lab (`tools/arena.js`), so
arena reports and live games measure the same thing. The in-game version of
this chart is under "Bot difficulties & strategies explained" in the lobby.*

## Difficulty — how the bot fights

*Round 12: the tiers are **named**, not starred, and there are **four** of them.
Each one is a `BOTS` entry in `shared/constants.js` — `brain` says which step
function pilots it, `react`/`aimErr` are its numbers — so Normal is the Hard
brain with a slower read and looser aim, not new AI.*

| Tier | Name | How it plays |
|---|---|---|
| Easy | **Grunt** | Wanders the safe ring and fires at a **random bearing** — it does not aim at anybody at all. Cannon fodder, and the only instinct it keeps is not drowning. |
| Normal | **Brawler** | The Hard brain with worse numbers: it decides every ~0.30–0.46 s (vs ~0.16–0.26 s) and carries a much bigger absolute aim error. It hunts you and trades, but it reads you slowly and sprays. |
| Hard | **Berserker** | Hunts the nearest wounded/isolated prey, rushes in, herds rim-standers into the lava, never retreats (except from the lava's edge). Since round 10 it has a **human-ish reaction time** (~0.2 s): it aims from a slightly stale picture of you and its point-blank aim has real scatter — juking it in a duel works now. |
| Extreme | **Stalker** | Sidesteps incoming projectiles (or shields late ones), leads its shots with a real intercept solve, finishes with lightning, teleports out of lava and point-blank pressure, kites harder when hurt. |

Measured ladder (`tools/h2h.js`, 2 seats vs 2 seats, 400 games, bruiser, 50% =
parity): Normal beats Easy **100%**, Hard beats Normal **99.5%**, Extreme beats
Hard **100%**. Because Easy is pure chaos, every piloted tier crushes it, so the
readable version is all four in ONE game (one seat each, 400 games) — average
place 3.92 / 2.82 / 2.26 / 1.00 and average kills 0.3 / 2.9 / 4.7 / 15.6 from
Easy to Extreme. Extreme wins 100% of those games: it is a different animal.

All four now also **pilot whatever their build buys** (the "use what you own"
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

**Which strategy fits which difficulty**: see the build × tier mirror table in
`BALANCE.md` §7 (1500 mirror games per tier). It used to be restated here, which
meant every retune had to be typed into two files and the copies drifted — read
it there. (The pointer used to say "report #4"; that report is now in git history
at `33b64ab:BALANCE.md` and the live table is the round-15 one.)

**Boomer is the strongest pick at every tier**, and that is partly a bot
artifact: nothing in the bot code dodges a boomerang (Extreme's dodge routine
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
  Knockback into lava IS the game, but the share has fallen every single round:
  ~86% originally, ~68% after round 8/9, ~47% after round 10, ~38% after round
  11, and **30.0% now** (round 15) — softer knockback plus 2× swim speed make the
  lava escapable. It also depends heavily on who is playing: 20.9% in a Hard
  mirror, 45.2% in an Extreme one. Remi has still never ruled on the right value
  (BALANCE.md open question C) — treat big moves as a signal, not a bug.
- **comeback rate**: fraction of games the winner was at some point ≥4
  kills behind — a health check that games aren't decided in round 3.

*Report-writing rule (2026-08-03, from Remi): any future balance report must
explain its metrics before using them, spell out the baseline (25% for 4
players), and describe each strategy in build+playstyle terms — link here
instead of assuming the reader remembers the codenames.*
