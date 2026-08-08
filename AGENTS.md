# AGENTS.md — handoff for the next session

*Last updated 2026-08-08, after round 16 (see REMI_NOTES.md for the
player-facing changelog of each round, BALANCE.md for the numbers — §0 is the
round-16 report). Read this first; it replaces digging through history.*

## ⚠ State of the repo right now (read before your first command)

- **Round 16 (2026-08-08, overnight, autonomous) — ELEMENTS ARE THE FIREBALL'S
  PROGRESSION.** Remi's dictated brief, executed while he slept: the fireball
  never levels in elemental mode (classic keeps 3 levels); its old bundle is
  split into cheap single-axis elements (ember=damage, gale=push,
  arcane=cadence, terra=size, ghost=speed; 6+5+5 g, specials 6+5+12);
  gale/arcane/ghost lv3 unlock specials (burst gust / −1 s off your OTHER
  cooldowns per fireball hit / pure passthrough with full hits); **chronos
  removed** (arcane lv3 is its heir); **arcane's old global CDR became the
  Hourglass of Haste item** (items can carry per-level `costs` arrays now);
  **Cinder Crown removed**; lifesteal pops a green +N on every heal ≥ 1 hp;
  the live scoreboard has an ❤️ HP `current/max` column. Then ~35k games of
  strategy study (`tools/strategy-study.js`, NEW; 25 strategies in two waves)
  produced the ranking and the buff/nerf guidelines in BALANCE.md §0 — its
  headline: **midas-cdr is a copyable auto-win (86% Hard / 95% Extreme), every
  polite nerf was measured and missed, and the real fixes need Remi's ruling**
  (Finding 16A / open question J). Two measured retunes shipped with it:
  momentum `rampDmg 0.06 → 0.022` (the flat fireball tripled the ramp's
  relative power) and the arcane refund excluding the fireball's own cooldown
  (self-refund was a 74%-win feedback loop). Verified: **219 vitest**, both
  harness scenarios, robustness (chromium+webkit), reconnect e2e, h2h ladder
  (100/99.5/100), coop --levels, shop screenshotted headless.
- **Two repairs of round-15/16-era regressions are in the same work**:
  `ARENA.NEVER_STOPS` is now **versus-only** — it had shipped (c38730f) with no
  co-op re-measure and had collapsed campaign L8 to 6% at 3p; co-op keeps the
  classic ring at its own 65 s journey (`ARENA.COOP_SHRINK_TIME`). And **fast
  projectiles could tunnel through Mirror Walls** (the side check read the
  post-move position); found by ghost's new speed, fixed for every projectile.
- **Remi may be playing when you start.** Do not `pkill` anything matching
  `server/index.js` and do not run `test/client-robustness.js` or
  `tools/reconnect-test.js` without checking first — they spawn and kill
  servers, and a stray kill takes down his live game. `npx vitest run` and the
  `tools/arena.js` / `tools/coop.js` / `tools/h2h.js` /
  `tools/strategy-study.js` labs are pure and always safe.
- **Round 16 needs Remi's feel pass**: the interpretation call (global-CDR→item
  vs chronos→item), the arcane self-refund exclusion, and the guidelines
  (venom #1 nerf candidate at 92% single-element; ember trim; whether
  offense-first is the meta he wants) are all his to ratify — BALANCE.md §10
  G/H/I and REMI_NOTES round 16.

## What this is

**OpenWarlock** (`github.com/RemiFabre/OpenWarlock`, push directly to main,
keep commits short) — an open-source web remake of the WC3 *Warlock* arena
brawler, and the pathfinder for Remi's bigger idea: an open, web-native,
player-hosted MOBA with community house rules and an AI-agent-friendly
codebase. Vanilla JS everywhere, no build step, Node ESM, only dep is `ws`.

## How Remi works (owner preferences)

- Voice-dictated feedback after playtests (often in French, sometimes garbled
  transcription — flag your interpretation when ambiguous) → batch of
  concrete changes. Ship a playable commit FAST when they're waiting to play,
  polish after.
- **Everything written in the project is in English** (his instruction, 2026-08-07).
  Older French entries in REMI_NOTES.md stay as they are; new ones are English.
- He wants **data-driven balance** (thousands of headless games, documented
  iterations), not vibes — but bot data has limits: bots don't extract
  reactive-skill value (teleport, catches, trails, lining targets up). Flag
  bot-artifacts, don't number-buff around them.
- **Reports must explain themselves**: define every metric before using it,
  state the baseline (25% win rate for 4 players), describe strategies as
  build+playstyle, link STRATEGIES.md. No bare win-rate dumps.
- Non-QWERTY keyboard → keybindings must stay rebindable (client Keys panel).
- He supplies art/music (`assets/`; originals in
  `~/reachy_mini_apps/fire_nation_attacked_assets/` at 1024×1536 — `sips`
  JPEG q65, **never downscale**; music `afconvert` AAC 96k).
- Use subagents liberally; verify between phases; he reads REMI_NOTES.md
  (and can ask for an email recap — there's a local tool for that on his Mac).

## Map

| Path | What |
|---|---|
| `shared/constants.js` | ALL game numbers (spells incl. power tier + Vanish, **3-level items**, **11 elements**, arena, gold economy, DRAFT, bots, BUILDS). Every value carries its sweep in a comment — read those before re-deriving anything |
| `shared/items.js` | the ONE place that knows how `ITEM_FX` is shaped: `pl.items` is `{key: level}`, every fx array is an **absolute cumulative total** (lv2 boots ARE ×1.27, nothing compounds) |
| `shared/catalogue.js` | one enumerable view over spells + elements + items for a ruleset, minus the starting kit. Draft mode's pool split, the gold-equivalence and the shop gate all read it; it is a VIEW, not a second source of truth |
| `shared/sim.js` | pure simulation + bot brains (`grunt` random, `berserker` piloted, `stalker` dodging — Normal is the berserker brain with worse params, not new code — plus the generic pilotOwnedSpells layer) + elements, hazards, meteors, walls, Vanish's wire masking |
| `server/index.js` | authoritative server, 30 Hz tick, JSONL journal (`JOURNAL=`), crash dumps, `/health`, static serving, ws heartbeat reaper, lobby kick/ban, draft offers |
| `scripts/host.js` | `npm run host`: server + cloudflared quick tunnel → public URL (verified end-to-end incl. websockets) |
| `client/` | canvas client: main.js (net/input/HUD/shop/draft banner/floaters), render.js (full-res art + 1/3-res blob layer), music.js, sfx.js (synthesized) |
| `test/sim.test.js` | 219 vitest tests — `npx vitest run` must stay green |
| `test/harness/` | scenario runner + invariant checker + fuzzer (`node test/harness/run.js test/harness/scenarios/bots.js`, and `scenarios/coop.js`) |
| `test/client-robustness.js` | 2-engine playwright test (`PLAY_MS=30000 node test/client-robustness.js`) |
| `tools/arena.js` | balance lab. **`--isolate=` is the one to reach for** (round 15): 1 seat holds the thing, 3 hold a price-matched do-nothing control, so the baseline is exactly 25% and the number is *points over wasting the same gold*. ⚠ Round 16: in elemental mode the isolation lab **saturates at the top** (an element seat vs element-less seats is an auto-win now — elements are the progression), so it ranks the bottom of the roster only. Also `--ladder=` (item levels: depth vs breadth), `--fx=item.field=a,b,c` (sweep a constant without editing it), `--tail=bruiser`, `--control=none`, `--isolate=self-test` / `no-op` (the lab checks itself; at 400 games the self-test can read ~30% on seed noise — believe it at 1600, where it reads 25.7). Older views: mixed Elo, `--mirror=`, `--probe=`, `--mode=elemental --kind=` |
| `tools/strategy-study.js` | **round 16, the ranking instrument**: complete shopping strategies (identity core + shared exhaust tail so gold never idles) in 4-seat mirror lobbies, elemental. `--list`, `--games=`, `--seed=`, `--kind=stalker`, `--only=a,b,c`, `--json=`. The report built on it is BALANCE.md §0 |
| `tools/h2h.js` | **difficulty-ladder check** (2 seats vs 2 seats, 50% = parity) — the mixed Elo table hides tier gaps; this one doesn't |
| `shared/campaign.js` | **co-op campaign**: the 10 levels as pure data (unit templates + waves + the party-scaling rule). Levels are data, never code |
| `tools/coop.js` | co-op lab: `--levels` (isolated per-level clear rates, the tuning view), no flag (full campaign runs), `--roster` |
| `client/coop.js` | co-op client: level card, battle status strip, the 3-way rules toggle. Self-contained on purpose |
| `tools/reconnect-test.js` | e2e reconnect-persistence test (spawns a real server + ws clients) |
| `BALANCE.md` | **REWRITTEN round 15** around isolated win rates — one report, no addendum stack: every element, item (per level), spell, build and tier measured against a price-matched do-nothing control. Findings `15A`-`15F`; §9 carries forward what is still true from the old ones. Everything from report #4 (round 10) through the round-14 addendum is in git history at `33b64ab:BALANCE.md`, #3/#2 at `ab48932` / `9a96b47` |
| `STRATEGIES.md` | bot difficulty × build chart + how to read arena reports |
| `REMI_NOTES.md` | per-round changelog Remi actually reads (newest on top; round 12 onward in English) |
| `docs/` | **design + decision docs, all current**: `ROUND12.md` (the round-12 work order as dictated, with every correction applied inline — read it for *why*, not for numbers), `VERSIONING.md` (**revision 2**: a version is **arbitrary code** with **distributed maintenance** — rev 1's "a version is a data patch" was OVERRULED by Remi and the reasoning is on the page), `HOSTING.md` (player-hosting plan: named tunnel + domain, one-button "Create game", chat box → Worker → GitHub issue), `NAMING.md` + `CONTRIBUTING-LEGAL.md` (name/licence/contributor answers), `archive/` |

## Game rules snapshot (post-round-16)

- First to **15 kills**, 25-round cap. countdown → battle → roundEnd (banner,
  art reveal, itemized income) → shop (full roster w/ kits; Ready skips).
- **Lava**: 14 DPS, **×2 move speed** while in it (swimming is a real escape
  route), no afterburn. Ring shrinks faster as fighters die. **In VERSUS the
  ring never stops** (`ARENA.NEVER_STOPS`, c38730f — shrinks continuously from
  START to zero at a 30% slower rate); **co-op is exempt** (round 16: keeps the
  classic hold-then-sudden-death ring at `ARENA.COOP_SHRINK_TIME` 65 s — the
  campaign is priced around it, see the scar below). 6 pillars sink as it
  shrinks. **Lava kill share keeps falling**: 86% at launch → 68% → 47% → ~38%
  → 30% (round 15) → **18.9% in round-16 Hard strategy mirrors** (44.3% on
  Extreme). BALANCE.md open question C — **Remi has never ruled on it**.
  Levers are one-line reverts: `KB_HP_FACTOR`, `PLAYER.KB_CONSTANT_MISSING`,
  `LAVA.SPEED_MULT`.
- **Knockback is CONSTANT** (round 12, S1 — this line described HP-scaled
  knockback as current until 2026-08-07 and that is now WRONG). The HP formula
  is still there but is fed a fixed `PLAYER.KB_CONSTANT_MISSING = 0.30`, so
  everyone is shoved as if permanently at 70% HP. **Set it to `null` and true
  HP-scaling (`KB_HP_FACTOR 0.385`) comes back — that one line is the whole
  revert, deliberately.** No size term (audited, regression-tested — big is only
  ever a disadvantage).
- **Economy (anti-snowball)**: 8 g/round + 2 g/kill + 2 g round win + 1 g
  first death; invariant `ROUND_BASE >= 3*PER_KILL + ROUND_WIN` caps 4p earn
  spread at 2× (test-enforced). Gap bounty max 3 g; the leader never
  collects one. `goldEarned` + `dmgDealt` tracked (DoT/lava credit rules
  below); standings show earnings, not wallet.
- **Spells**: fireball 41 u/s r0.8, **locked at lv1 in elemental (round 16 —
  dmg 7, cd 2.1; the ELEMENTS are its levels now)**, classic keeps 7/10/14 and
  cd 2.1→1.6; lightning range 38 NO push (finisher); boomerang **out 52 and
  recallable — tapping the key mid-flight turns it round early**, returns to
  the LAUNCH POINT, catch = half cd, uncaught flies off forever, one hit per
  enemy per throw; teleport F, rush E, boomerang R, **pillar S** (placeable
  blocker, one each, 10–16 s), **Vanish V** (round 12).
- **Regen lock (round 11)**: taking damage throttles regen to 25% for 2.5 s.
  This exists because a lv1 fireball (2.38 dps if EVERY shot lands) lost to
  1.2 hp/s of passive regen, so round 1 was unkillable — median first death
  51.9 s vs ~20 s in round 3, now 31.3 s. Don't remove it without re-measuring
  that number.
- **Items have 3 LEVELS** (round 12, S4): hard cap 3, the **same flat gold cost
  at every level**, each level worth less than the last (`ITEM_FX` arrays are
  **cumulative totals**, boots **1.15/1.29/1.42** and treads **0.50/0.36/0.28**
  since round 15 — see the sweeps in `constants.js`). Round 11's free stacking
  produced a 4-5-boots meta Remi didn't want. ⚠ Two measured consequences:
  it **resurrected the gold-saturation artifact** (midas back to 0.0% on ~49 g
  of unspent gold — see the scars) and it **broke the co-op campaign** (see the
  co-op section: the party is bots that shop 13 times).
- **Vanish 👁️** (round 12, N4): 0.75/1.5/2.25 s invisible; you can still cast,
  hit and be hit. Two load-bearing, test-locked rules: the position is
  **stripped in `snapshot()`**, never merely skipped by the renderer (devtools
  would see through it), and **bot perception is masked too** (`BOT_MEMORY` 1.5 s
  of shooting at your last known spot) or Extreme becomes an aimbot.
- **Power tier, buyable from round 1** (round 12 dropped `minRound`; **the gate
  is now that no bot build list contains one**, enforced in `botShop` and in
  draft offers), expensive by design: meteor T (1.25 s telegraph, AoE hits
  caster too), hook G (yanks victim a full body behind caster; visible chain +
  🪝 head), repulse X (2 s visible charge; **Teleport and Rush are castable
  mid-charge**, everything else stays locked; shield blocks the burst), mirror
  wall C (reflects ENEMY projectiles — ownership flips — blocks enemy lightning;
  own pass). **Bots pilot none of these** → unmeasured, human playtest decides.
- **Credit rule**: DoT ticks (poison, trails) NEVER stamp last-hitter — but
  since round 10 a **lethal poison tick does take the kill** (the poisoner is
  passed as the direct source). Both halves are test-locked. The round-9
  discovery this protects: poison re-stamping 30×/s stole nearly every lava
  kill (venom measured 75–86% before the fix, ~15% after, same numbers).
- **Lifesteal** heals on damage *actually dealt* (overkill excluded), from
  every sourced hit including DoT ticks and trails, never from lava. 5 tests.
  **The Blood Sword is the 2nd-strongest item in the game** (round 13, measured
  against a price-matched do-nothing control item: +36.5 points at lv1, beaten
  only by the amulet) — do not "fix" it. Remi's read that it was weak had a real
  cause and it is the SCOREBOARD: the standings print Lifesteal (349 hp/game at
  lv1) beside Regen (357 hp/game, free), so a 15 g item looks like it lost to
  passive regen. It didn't — lifesteal lands mid-fight, regen is throttled to
  25% for 2.5 s after every hit. BALANCE 13B.
- **Damage split: the lava is 8.5% of the damage and ~30% of the kills**
  (round 13, measured — `dmgTakenLava` / `dmgTakenDirect` on every player exist
  to answer this and nothing had recorded uncredited burn before). Flat at ~8%
  in every round from 2 to 18; it does NOT rise as the ring closes. **The lava
  is the executioner, not the damage dealer** — any argument of the form "most
  damage is lava, therefore X" is wrong. BALANCE 13A.
- ~~**Item levels 2-3 are near-worthless across the whole roster** (round 13)~~
  **SUPERSEDED AND WRONG — do not quote it.** That table's control item cost a
  flat 15 g at *every* level, so an item at lv3 (30-45 g) was scored against a
  45 g waste while the same item at lv1 was scored against a 15 g waste; the
  "collapse" was mostly that arithmetic. Against a control price-matched at every
  level, **every item's value RISES with its level** (round 15, BALANCE 15C).
- **What IS true about item levels**: they lose to BREADTH, not to their price.
  Level 2 of the boots beats 10 g of nothing by +6.5 points and loses to 10 g of
  the rest of the shop by 12.7. The cause is that **the Amulet (+64 at lv1) and
  the Blood Sword (+41) return 3-6× more per gold than anything else** — a seat
  that skips the amulet wins 0.4% of its games. ⚠ Therefore **escalating the cost
  of levels 2-3 would make them worse, not better**: Remi's flat cost is not the
  problem and was left alone. The amulet/sword outlier has still never had a
  ruling and is BALANCE.md open question A.
- **The Cape of the Magi cannot be measured by this lab and must NOT be buffed on
  its numbers** (round 15, BALANCE 15D): knockback resistance is worth **−20
  points to a Hard berserker and +26 to an Extreme stalker** — it changes SIGN
  with the pilot. A "buff" means pushing `kbMult` down, toward the value that
  measures −20 on the tier every table uses. Needs a playtest, not more games.
- **Elemental mode** ⚗️ (the DEFAULT ruleset): **11 elements** (round 16 —
  chronos removed), each 3 levels, **stackable with each other** (frost+ember
  works), and since round 16 they are **the fireball's entire progression** —
  every element is a fireball rider needing Fireball lv1 (which everyone owns
  from spawn). The five single-axis ones are CHEAP (6+5+5): ember 🔥 damage,
  terra 🪨 size, and — with a 12 g lv3 special — gale 🌪️ push (lv3: the
  stack-and-burst gust, ×2.4 on the 3rd private stack), arcane 🔮 fireball
  cooldown (lv3: every fireball hit refunds 1 s off your OTHER cooldowns, per
  enemy hit — **the fireball's own cd is excluded, self-refund measured as a
  74% feedback loop**), ghost 👻 fireball speed (lv3: pure passthrough — full
  hit on everyone in the line, all on-hits/lifesteal pay per victim, NO
  behind-bonus). The six originals keep 10+8+8: venom (ticks+trail — **#1 nerf
  candidate, 92% single-element, see BALANCE §0**), frost (3rd private stack
  detonates), momentum ⚙️ (permanent ramp, `rampDmg 0.022` since round 16 —
  re-sweep after ANY fireball change), mosquito 🦟 (sting arms, your fireball
  cashes: everything procs twice, knockback once), vampire 🧛 (every 5th ball
  heals >100%), midas 🪙 (+1 g/hit, halved fireball — REAL now that full buy
  lists exist: 2nd-best strategy). Stacks are **PRIVATE to the attacker who
  applied them** (round 12). Classic wire format untouched by elemental fields.
- **Draft mode 🎴** (round 12, S7, lobby toggle, **off by default**): an
  independent flag that composes with classic/elemental/co-op, not a fourth
  mode. Half the catalogue leaves the shop and becomes a pool, rolled once per
  game from the game's seeded rng (server-authoritative, identical for
  everyone); offers of 3 roughly gold-equivalent options land after rounds
  1, 4, 7…, first option pre-selected. Fireball is never in the pool; an offer
  never contains something you already own; power spells are filtered out of bot
  offers. **Unmeasured on purpose** — the elemental study can't express a random
  half-catalogue pool (see the scar about studies that can't express a variable).
- **Current 11-element standings** (`tools/arena.js --mode=elemental
  --games=800`, seeds 1/7 mean, Hard berserker/bruiser, baseline 25%,
  2026-08-08, post-rework): venom 91.8 · ember 61.5 · momentum 39.9 ·
  mosquito 33.3 · vampire 15.4 · arcane 11.1 · gale 7.3 · ghost 4.3 ·
  midas 3.2 · terra 2.4 · frost 1.8. **A ranking, not a strength meter** — and
  since round 16 the STRATEGY study (BALANCE §0) is the better instrument:
  this table is "commit to ONE element", which real play no longer is.
- **Gale's gust is the lv3 special since round 16** (lv1/2 are a flat kbAdd):
  one PRIVATE stack per landed gale fireball at lv3+, **normal (flat-boosted)
  knockback while stacking**, 3rd stack spent on `burstKbMult` 2.4 (scalar).
  It resolves in `galeHit()` and NOT in `applyElementsHit` with frost and
  venom, because its payload is knockback and knockback is applied before the
  riders run — same position in the pipeline as mosquito's mark. The
  stepProjectiles gate is `pr.elements.gale >= fx.burstAtLevel`.
- Bots: **four named tiers** (round 12, S6) — `grunt`/**Easy**,
  `brawler`/**Normal**, `berserker`/**Hard**, `stalker`/**Extreme**. Normal is
  the berserker brain with a longer reaction window and a bigger aim-error floor
  (`react`/`aimErr` in `BOTS`), which is why it needed no new AI. Kind KEYS are
  unchanged on purpose — `shared/campaign.js` and the labs reference them.
  Ladder verified with `tools/h2h.js`, 400 games each: **Normal beats Easy
  100%, Hard beats Normal 99.5%, Extreme beats Hard 100%**. Easy is now pure
  chaos (fully random since 2026-08-06), so every piloted tier crushes it 100%
  and **h2h *against Easy* is no longer a balance signal** — report #4's
  "★★ beats ★ 75%" is dead, do not quote it. The readable measurement is all
  four in one game (300 games): avg place **3.9 / 2.8 / 2.3 / 1.0**, avg kills
  **0.4 / 2.9 / 4.6 / 15.6**. Best bot builds: **boomer at every tier**
  (54–62% — bot artifact, nothing dodges or catches a boomerang), then
  berserker→bruiser, stalker→turtle.
- UI: own player wears a permanent red ring; kill banner + jingle on your
  kills; income breakdown on the round banner; gold rules printed in lobby
  and shop; items show one icon with a level badge.

## Co-op campaign 🛡️ (mode `coop`, lobby toggle cycles classic → elemental → co-op)

- **The whole lobby is one team** (`pl.team`) against AI waves. `team: null`
  means free-for-all, which is why classic/elemental are bit-for-bit
  unchanged.
- **FRIENDLY FIRE IS ON** (Remi, 2026-08-06 — it was off for about a day, so
  distrust any older note). Allies take full damage and full knockback from
  each other, lava included. `hostile()` is therefore a **targeting helper
  only** — bots use it to pick who to hunt and what to dodge. It must NEVER be
  put back on a collision or damage path, or friendly fire stops existing.
  A team kill still kills but **pays nothing**: no kill count, no gold, no
  multi-kill (`teamkill` event fires instead). That guard is mine, not Remi's
  — flip it if he wants team kills to score.
- **10 levels, all data** in `shared/campaign.js` (unit templates × counts ×
  arrival times). Every enemy is an existing bot kind × existing build with
  tuned `maxHp`/`spells`/`items`/`sizeMult`. **No new AI was written.**
- **Level != round.** Clearing advances the level; a wipe costs a round and
  you retry the same level one shop richer. `ROUND.COOP_MAX_ROUNDS` (13) is
  the budget for the whole run. Art/music/title come from the LEVEL, and the
  finale plays the intro theme over level 10's art.
- **What the lab found** (`tools/coop.js`, measured, not guessed):
  - **Extreme enemies are the difficulty cliff** (a lone Hard cannot beat one at
    any HP), so they must be *cheap to kill* (Shade: 40 hp) or they are
    unloseable walls. The boss is a Hard **berserker** with every upgrade, not
    an Extreme — an Extreme with boots kites forever (0% clear at every size).
  - **HP is a weak lever for berserkers, the whole fight for stalkers**: a
    berserker dies to the lava (Brute at 210 and 546 clear the same); a stalker
    never swims, so it has to be burned down.
  - **Enemy lightning is a solo-killer** — hitscan, undodgeable. Removing it
    from one unit moved the solo clear rate 4% → 70%.
  - **Party scaling has to be superlinear** (`COUNT_PER_PLAYER` 1.2): a party
    only wipes when EVERYONE is down. Chaff scales at the default rate; real
    threats need `perPlayer ~0.5` or the level explodes.
  - **Friendly fire helps the WAVE's victims, i.e. the party** — monsters are
    numerous and clustered, so they shred each other and shove each other into
    the lava far more than a 1-3 player party does (level 8: 57→93% clear).
    Corollary: **a wave that grows only in COUNT gets weaker as the party
    grows** (18 imps clear 100% at every size). Real packs scale `both`; real
    threats are hand-counted per party size (`minParty` + `scale: 'none'`).
  - **Staggering arrivals makes a level EASIER, not harder** (measured
    repeatedly, opposite of the intuition): a trickle gets fought one at a time
    and never surrounds anyone. Late `at` times are a *softening* lever.
  - **Chaff is a dead lever past level 5**; **Hounds are the fine grain, Shades
    the coarse one** (one Shade ≈ 30-45 clear points, one hound ≈ 10).
- Difficulty axis is verified, not assumed: an Easy party fails from level 4
  on (0-6%), a Hard party rides the intended curve, an Extreme party clears
  99-100%.
- **A LEVEL CAP ON ITEMS IS A CAMPAIGN NERF** (2026-08-07, the scar of this
  round). The party is bots that shop up to 13 times, so under the old uncapped
  stacking they reached level 9 carrying 8-13 copies of every item; every enemy
  is a fixed template owning ONE. Capping items at 3 levels took the party's
  late power and left the monsters untouched: full campaign 55/79/55 →
  **11/10/4%**. Nobody re-measured co-op when round 12 shipped the cap.
  **Any global change to items, gold or knockback re-prices the whole back half
  of the campaign — re-run `tools/coop.js --levels` in the same commit.**
- **Current curve** (Hard berserker/bruiser, 200 attempts/cell, seed 7,
  `tools/coop.js --levels`): L1-3 100% at every size, then 1p/2p/3p —
  L4 94/94/97, L5 98/96/91, L6 91/97/97, L7 69/75/73, L8 68/66/57,
  L9 39/46/44, L10 30/42/32. Non-increasing at every party size.
  Full campaign with retries inside the 13-round budget (200 runs/size):
  **37.0 / 55.5 / 41.0%**, 12.5-12.8 rounds/run.
  ⚠ Two open pacing notes, both measured, neither acted on: **the 13-round
  budget is now the binding constraint** (runs average 12.7 rounds and only
  ~72% ever reach level 10), and **L4-L6 sit at 91-98%**, a few points above
  where they were before round 12's constant knockback. `COOP_MAX_ROUNDS` is
  the one-line lever for the first; the second wants L5/L6 retuned, not a
  global revert.

## Hosting & multiplayer ops

- `npm run host` → cloudflared quick tunnel, public https URL (changes every
  restart — reshare it). Websocket join verified through the tunnel. The plan
  for a *stable* address and a one-button "Create game" is `docs/HOSTING.md`.
- **Ghost players**: tunnel sockets die without close frames. Two defenses:
  ws heartbeat (ping 15 s, terminate after 2 misses) and the lobby **✕ ban**
  button (blocks name + real IP via `CF-Connecting-IP`; "Unban all" lifts;
  bans die with the process). Kicked/banned up-to-date clients stop their
  reconnect loop; stale tabs hammer harmlessly.
- **Reconnect persistence (round 10)**: dropping mid-game stashes your
  progress (gold, goldEarned, kills, deaths, dmgDealt, maxHp, spells, items,
  elements) under your **normalized name**; rejoining with that name within
  10 min restores it, and `resetToLobby` clears every stash. Names are trusted
  inside a friends lobby — same trust model as the bans. If ALL humans vanish
  mid-game the lobby reset waits `RESET_GRACE_MS` (60 s) so a tunnel hiccup
  can't hand the game to the bots. Verified end-to-end by
  `node tools/reconnect-test.js` (real server, real sockets, hard `terminate`).
- **Final standings wait for everyone** (round 11): `case 'again'` no longer
  resets the lobby on the first click — every connected human must acknowledge,
  with a 45 s `AGAIN_GRACE_MS` fallback so one AFK player can't hold the lobby
  hostage. `againReady` is on the wire. This was the "the scores vanish before
  I can read them" report.
- After pulling: **restart the server** and hard-refresh clients.

## Verification ritual (run before claiming anything works)

```bash
npx vitest run                                   # 219 green
node test/harness/run.js test/harness/scenarios/bots.js
node test/harness/run.js test/harness/scenarios/coop.js
PLAY_MS=30000 node test/client-robustness.js     # chromium + webkit
node tools/reconnect-test.js                     # progress survives a drop
node tools/arena.js --games=60 --players=4       # games finish, sane kills
```
Kill stray servers when done (`pgrep -fl "server/index.js"`) — they've
bitten us three times now, including robustness-test leftovers. **But check
first that Remi isn't hosting a live game**: a blind `pkill` on that pattern
takes his session down with it.

## Known debt / next candidates (rough priority)

0. **START HERE: round 13 needs a feel report, and two of its questions can
   ONLY be answered by playing.** Ask him before touching numbers.
   - **Gale's burst in human hands.** The lab says the rework was
     impulse-neutral (23.5% before and after) but the lab's bots never bait,
     hold a shot, or notice they are on 2 stacks with the lava behind them —
     so that number is a floor. `burstKbMult` is a violently steep lever
     (+20% = +14 points): move it a little, never a lot.
   - **Whether the Blood Sword still FEELS weak** now that it measures as the
     2nd-strongest item in the shop. If it does, the fix is the recommended
     in-fight feedback (BALANCE 13B(ii)), not a bigger percentage — and that
     recommendation is deliberately not implemented, because it is a feel change.
   - **The Amulet.** New this round and never ruled on: +83 points at lv3
     against a do-nothing control while no other item clears +11.
   Still open from round 12 and still unjudgeable by the lab: **mosquito in
   human hands** (bots cash the mark for free, so 24-29% is an upper bound),
   **momentum's ramp speed** and whether the white bonus number fixes "I can't
   see it working", **ghost's trigger frequency** (3.07% because bots never line
   targets up), **whether constant knockback feels better**, **whether draft
   mode is fun** (unmeasured by design), and the **lava kill share**. His feel
   report outranks every table in BALANCE.md.
1. **Teach bots the power tier — AND the Stone Pillar.** meteor/hook/repulse/wall
   are still unmeasurable (bots pilot none), so all their numbers are design
   guesses. Round 15 measured all of them at **exactly the do-nothing control**
   (+2.0 / +0.4 / +0.4 / +0.0), which is the proof rather than the assertion —
   and it caught a new one: **`pilotOwnedSpells` casts `pillar` only for the Easy
   grunt** (the `['boomerang','lightning','rush','pillar']` loop), so
   Normal/Hard/Extreme never place one and the Pillar measures +0.0 too. No build
   list names it today, so nothing is currently wasting gold on it — but unlike
   the power tier it has **no structural guard** in `botShop` (that guard keys on
   `tier === 'power'`), and **draft mode can hand a bot a Pillar**, since only
   power spells are filtered out of bot offers. Adding it to a build list, or one
   draft roll, silently gives three of the four tiers a spell they never cast.
   **Also now more urgent**: round 12 made the power tier buyable from round 1,
   and the only thing keeping bots out of it is that no build list names one.
   Same for boomerang catches, which is why the lab over-rates boomer.
   Highest-value lab work left.
2. **The lava kill share needs a RULING, not another measurement.** 86% at
   launch → 68% → 47% → ~38% → **30%**, i.e. two deaths in three are now people
   being shot on the platform rather than shoved into the lava. It has been
   BALANCE.md open question #1 since round 10 and has never been answered, and
   every round retunes on top of it. Levers are one-line reverts
   (`KB_HP_FACTOR`, `KB_CONSTANT_MISSING`, `LAVA.SPEED_MULT`).
3. **The hosting / versioning work in `docs/`** is decided but unbuilt:
   `HOSTING.md`'s named tunnel + domain + one-button "Create game" + chat
   box→Worker→GitHub issue, and `VERSIONING.md` rev 2's arbitrary-code,
   distributed-maintenance model. Remi's stated direction; no code yet.
4. Known bot hotspots (accepted, documented): boomer 54–62% in every mirror,
   berserker/bruiser 55%; escape/rusher are bot-traps (0.6–12%) — raise via
   smarter piloting, not numbers.
5. Remi's **reaction-time dodge-window framework** (projectile speed ×
   hitbox × distance vs ~150 ms reaction) for the next feel pass. Round 10
   built the *bot* half (the lag model); the projectile-geometry half is open.
6. **Co-op polish left on the table**: enemy HP bars still render green like
   allies (one line in `client/render.js`); the level-8 3p fight averages
   ~100 s, the one pacing outlier; `waveUnits` has no per-wave `hp` override,
   which is why tuning is lumpy (between 3 and 4 Shades there is nothing).
7. Rendering perf round 2 if needed (cache rock/rim gradients per radius);
   client-side prediction if tunnel latency bothers; real SFX from Remi.

## Recent gotchas (learn from our scars)

- **An effect that refunds the cooldown of the spell that triggers it is a
  feedback loop, and it will win the whole table.** Arcane's lv3 refund at 1 s
  measured 74% as a lone element; even 0.5 s measured 47%. The loop was killed
  by EXCLUDING the triggering fireball (one-line guard in `arcaneRefund`), not
  by shrinking the number — the number was never the problem, the topology was.
  Chronos "got away with it" for a round only because the old fireball
  out-leveled the loop.
- **A global mechanic flag shipped without re-running the co-op lab broke the
  campaign for the second time.** `ARENA.NEVER_STOPS` (c38730f) collapsed
  level 8 from 68/66/57% clear to 80/46/6 — a ~100 s fight cannot live in a
  ring that reaches zero. Same lesson as the round-12 item cap: **any global
  arena/item/gold/knockback change re-prices the whole back half of the
  campaign — `tools/coop.js --levels` in the same commit, no exceptions.**
- **Re-sweep every ramp/percentage element after changing the thing it rides
  on.** Locking the fireball at lv1 silently tripled momentum's relative power
  (0.06/hit went from "on the 25% baseline" to 80-87%) and crowned venom at
  92% without either element changing at all. A retune of X is a stealth
  retune of everything priced against X.
- **Fast projectiles tunneled through Mirror Walls** — the side check read the
  POST-move position, so a ball crossing the wall plane inside one tick read
  as "moving away". Swept-collision checks must use the pre-move side. Found
  the day ghost became the speed element; latent for every projectile before.
- **A feature that is never rendered reads as a broken feature.** Round 11's
  mosquito put a bite on an arc of the victim's body; the bites were computed,
  they were on the wire, and **the client never drew them at all**. Remi
  reported "mosquito is broken" and three balance passes went looking in the
  numbers. Check the renderer before the spec when a player says a mechanic
  doesn't work.
- **A study cannot see a variable its design cannot express.** Round 12's
  private-frost-stacks change is invisible to the standard elemental study,
  because that study deals every seat a different element and one attacker's
  private counter IS the shared counter — verified by running the shipped sim
  and a shared-stacks patched copy side by side: byte-identical at 1 frost seat,
  2.4-3.9 points apart at 2 seats. Build the lab that can express the variable;
  a "no change" from the wrong lab is not evidence. (Draft mode is unmeasured
  for exactly this reason.)
- **The do-nothing floor is 2.7%, not 25%, so the mixed elemental table is a
  RANKING, not a strength meter.** In the absolute lab (1 element seat vs 3
  seats with NO element, 600 games) an element whose `fx` is literally `{}` —
  but which still pays its 26 g — scores **2.7%**. Frost at 19% in the mixed
  table wins 37-40% there against 20% for the no-element seats; ghost at 8%
  wins 18-20%. Before buffing anything for being "below baseline", check what it
  scores against nothing. The full ladder is in `constants.js` next to `frost`
  and `ghost`, and in BALANCE.md Finding 12A.
- **Before believing a "bot artifact" explanation, check whether you can
  DELETE the artifact.** Midas measured ~1% for months and three reports called
  it a gold-saturation artifact. Making items stackable gave gold somewhere to
  go and it instantly measured 43-64% — the artifact was real, the excuse was
  hiding a strong element, and Remi's human read had been right all along.
  Round 12's item cap brought it back (0.0% on 49 g unspent); attacked from
  three sides (longer build orders, scarcer gold, both) it climbs monotonically
  to 17-19%, so 0.0% is a floor. Sweep in `constants.js` next to `midas`.
- **A pip the HP bar covers is a pip nobody sees.** Round 13's gale stacks were
  first drawn at 1.9-2.2r above the body — which is precisely where the HP bar
  is (`y - r - 12`, an ABSOLUTE offset, so it covers that band at every zoom).
  They were completely invisible, and the code looked perfectly correct. Caught
  by screenshotting the renderer in a headless browser, not by reading it. The
  free bands are ~1.6r above (frost) and below the body (gale, mosquito).
- **A correct mechanic with imperceptible numbers is a bug in practice.**
  Critical ramped exactly as designed and Remi still reported it broken,
  because +0.45 dmg/hit is invisible. Momentum's answer was to change what the
  player is SHOWN (the white accumulated-bonus number), not to inflate the step.
- **Ask what a thing is FOR before nerfing its visible knob.** Mosquito's
  doubled proc also doubled the knockback (145 u/s vs 72.5) and measured 82%;
  Remi ruled the shove happens once, which removed the pressure and let the
  *fast* sting — the element's actual identity — survive intact.
- **A single 400-game run is not a measurement.** Momentum shipped at 0.08
  dmg/hit on one run reading "27.2%"; at 800 games × 3 seeds it is 39.8%.
  Elements play ~1/3 of an elemental study's games, so 2σ ≈ ±4.5-5.4 points at
  that size. Sweep across seeds and check monotonicity.
- **Any global knockback/lava/item/gold change silently re-prices everything
  built on top of it**: round 10's KB cut buried gale and crowned the sustain
  items; round 12's item cap broke the co-op campaign (55/79/55 → 11/10/4%) and
  brought back the midas artifact. Re-check multipliers, sustain AND
  `tools/coop.js --levels` in the same commit.
- **Stale browser cache / stale server process** ship mixed-version games:
  after pulling, restart the server AND hard-refresh.
- **Tunnel sockets die silently** — never assume 'close' fires; that's why
  the heartbeat exists.
- **Measure before AND after "obvious" fixes**: venom's dominance survived
  three number nerfs because the real cause was the credit-stamping bug.
  Same lesson as the boomerang double-tap: reason about the mechanism, the
  numbers follow.
- **The mixed Elo table hides difficulty-tier gaps.** Round 10: the ★★ read
  as only ~80 Elo above the ★ while actually winning 99.6% of head-to-head
  games. If the question is about a *tier*, use `tools/h2h.js`, not the Elo
  table — and note that h2h *against Easy* is no longer a signal at all, since
  Easy became fully random and every piloted tier beats it 100%.
- **A "reaction time" is a perception delay, not a handicap.** Aiming at where
  the target *was* under-leads by lag×speed forever, which is not what a human
  does — extrapolate the stale observation across the lag instead, so the bot
  leads correctly and only loses to genuine direction changes. The naive
  version dropped the ★★ *below* the ★.
- **Balance tests must read their numbers from the spec**, not hardcode them
  (`ELEMENTS.gale.fx.kbMult[0]`, not `1.25`). Several round-11 tests failed on
  intended retunes purely because they pinned old constants.
- `str.replace`-style bulk edits and orphan `===` echoes in zsh cause false
  alarms; prefer Edit-tool exact matches. Perl one-liners choke on `//` and
  unicode in patterns.
- Autoplay: all audio must start from a user gesture; music.js retries on
  the next gesture — keep that pattern.
- Emoji avatars/icons are load-bearing UI; no image assets for game objects.
- Voice transcriptions garble numbers and directions ("cooldown trop
  rapide... je le réduirai de 30%") — state your interpretation in
  REMI_NOTES and make it a one-line revert.
