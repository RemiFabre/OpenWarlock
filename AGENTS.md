# AGENTS.md — handoff for the next session

*Last updated 2026-08-08 (round 16 + the context diet). Read this first, then
REMI_NOTES.md (latest round only) — that is the whole entry set.*

## ⚠ CONTEXT POLICY (Remi, 2026-08-08 — non-negotiable)

Agent context usage on this project is **CRITICAL**. The rules:

- **Entry set** = this file + `REMI_NOTES.md` + the files you actually touch.
  Everything else is read on demand, and `docs/history/` is read on demand
  ONLY (grep for the specific value/finding, read the matching section, stop).
- **`docs/history/` is the append-only archive** (see its README): full
  reports, sweep tables, superseded designs, scar stories — date-prefixed
  files, never edited, never deleted, never read wholesale.
- **Living docs are edited IN PLACE and stay lean**: AGENTS.md ≤ ~200 lines,
  BALANCE.md = current truths only, REMI_NOTES.md = latest round only (archive
  the previous round when you write a new one). Long reports are NEW dated
  files in `docs/history/` that the living docs point to.
- **Code comments**: what the value means + current intent + active ⚠
  warnings, ≤ ~5 lines, then a pointer like
  `// history: docs/history/2026-08-08-constants-sweeps.md#momentum`.
  **Never paste a sweep table into code.**
- **Work style**: prefer one-commit-sized briefs; delegate mechanical grinds
  (reference hunts, test fixes after a spec change, doc propagation, archive
  moves) to clean-context subagents — **Opus-class or better, bound by the
  same anti-bloat rules** — and review their diffs; the labs stay
  quiet when stderr is not a TTY. Do not add a fourth living doc — extend
  these.

## State right now

- **ROUND17 shipped IN FULL and pushed** (2026-08-08): all four sessions, the
  battery, Remi's live-playtest batch (testing sandbox, boltDodge, tag descs,
  readability pass, PASSIVE REGEN REMOVED, Blink, infinite ranges, cheap
  ex-power spells, unlimited pillars, vanish 1/2/3 s). Two measured retunes:
  venom `tickDmg [0.5,1,1.5]`, hourglass `haste [10,18,26]`. Questions J and
  G CLOSED. Story: REMI_NOTES.md; numbers: BALANCE.md →
  `docs/history/2026-08-08-round17-battery.md` + `...-value-analysis.md`.
- **Waiting on Remi — questions K/L/M in BALANCE.md** (momentum tiers on bot
  tables, sword mandatory-by-structure, CDR builds bottom-third) + standing
  feel items (B, E, F, H). He also has UNSHIPPED ideas incoming (gameplay +
  UI); expect voice-dictated orders.
- ⚠ STRATEGIES.md's 25-row table + BALANCE's mixed/ladder tables predate the
  regen removal — re-run the instruments before quoting them.
- **Remi may be hosting when you start**: check `pgrep -fl "server/index.js"`
  before anything that spawns/kills servers (`test/client-robustness.js`,
  `tools/reconnect-test.js`). Vitest and the `tools/` labs are pure and safe.

## What this is

**OpenWarlock** (`github.com/RemiFabre/OpenWarlock`, push directly to main,
keep commits short) — an open-source web remake of the WC3 *Warlock* arena
brawler, pathfinder for Remi's open player-hosted MOBA idea. Vanilla JS, no
build step, Node ESM, only dep is `ws`.

## How Remi works

- Voice-dictated feedback after playtests (often French, sometimes garbled —
  **state your interpretation** and make changes one-line revertible). Ship a
  playable commit fast when he's waiting; polish after.
- Everything in the project is written in **English**.
- **Data-driven balance** (seeded headless games, sweeps, 2+ seeds, check
  monotonicity) — but bots can't price reactive skill: **flag bot artifacts,
  never number-buff around them**. His feel report outranks every table.
- **Reports must explain themselves** (Remi, reinforced 2026-08-08 after
  three "what does this number mean" questions): EVERY section that shows
  numbers opens with 1-3 lines saying exactly what the number is, vs what
  baseline, measured how — repeated AT the table, not in a block far above.
  Strategy/build names are decoded where used (composition + buy order).
  State what the instrument CANNOT see next to its results.
- Non-QWERTY keyboard → keybindings stay rebindable. He supplies art/music
  (`assets/`; `sips` JPEG q65, never downscale; `afconvert` AAC 96k).

## Map

| Path | What |
|---|---|
| `shared/constants.js` | ALL game numbers (spells, 3-level items, 11 elements, arena, gold, DRAFT, bots, BUILDS). Lean comments + pointers into `docs/history/` — grep there before re-deriving any value |
| `shared/items.js` | the ONE place that knows `ITEM_FX`'s shape: `pl.items` is `{key: level}`, fx arrays are **absolute cumulative totals** |
| `shared/catalogue.js` | one enumerable view over spells+elements+items per ruleset (draft pool, gold equivalence, shop gate read it). A VIEW, not a second truth |
| `shared/sim.js` | pure simulation + bot brains (grunt random, berserker piloted, stalker dodging; Normal = berserker brain with worse params) + elements, hazards, Vanish wire-masking |
| `shared/campaign.js` | co-op campaign: 10 levels as pure data. Levels are data, never code |
| `server/index.js` | authoritative server, 30 Hz, JSONL journal, `/health`, ws heartbeat reaper, lobby kick/ban, draft offers |
| `scripts/host.js` | `npm run host`: server + cloudflared quick tunnel |
| `client/` | canvas client: main.js (net/input/HUD/shop/floaters), render.js, coop.js, music.js, sfx.js |
| `test/sim.test.js` | 237 vitest tests — must stay green; balance tests read numbers FROM THE SPEC, never pinned |
| `test/harness/` | scenario runner + invariant checker + fuzzer (`scenarios/bots.js`, `scenarios/coop.js`) |
| `test/client-robustness.js` | 2-engine playwright test (`PLAY_MS=30000`) |
| `tools/arena.js` | balance lab: `--isolate=` (points over a price-matched do-nothing; ⚠ saturates at the top in elemental since round 16), `--ladder=`, `--fx=key.field=a,b,c` (sweep without editing), `--mirror=`, `--mode=elemental`, self-test (trust it at ≥1600 games) |
| `tools/strategy-study.js` | **the round-16 ranking instrument**: exhaustive shopping strategies in 4-seat mirrors. `--list`, `--kind=stalker`, `--only=`, `--json=` |
| `tools/duel.js` | 1v1 gold-matched archetype kits at early/mid/late snapshots — prices an UPGRADE PATH, blind to multi-target/economy |
| `tools/h2h.js` | difficulty-ladder check (2v2 seats, 50% = parity) — the Elo table hides tier gaps |
| `tools/coop.js` | co-op lab: `--levels` is the tuning view. Co-op is mothballed — re-run **only if its tests break** |
| `tools/reconnect-test.js` | e2e reconnect persistence (spawns a real server) |
| `BALANCE.md` | current balance truths + open questions + repro commands. Full reports: `docs/history/` |
| `STRATEGIES.md` | bot tiers × builds chart, the 25-strategy ranking, how to read arena reports |
| `REMI_NOTES.md` | the changelog Remi reads — latest round only |
| `docs/` | design docs (`HOSTING.md`, `VERSIONING.md` rev 2, `ROUND12.md`, `NAMING.md`) + **`history/` (append-only archive — read on demand only)** |

## Game rules snapshot (post-round-17, one line each — details in constants.js and BALANCE.md)

- First to **15 kills**, 25-round cap; countdown → battle → roundEnd → shop.
  The 🧪 **testing sandbox** (lobby flag like draft): chosen gold, game opens
  in an UNTIMED shop, ready-up starts round 1.
- **Lava** 14 DPS, ×2 swim speed; versus ring **never stops** (`NEVER_STOPS`);
  co-op keeps the classic ring. Lava kill share: keep reporting, no target.
- **NO PASSIVE REGEN** (round 17, measured): `PLAYER.REGEN 0`, the Ring is
  deleted, the regen-lock machinery is inert-but-kept as the revert path.
  Damage is permanent within a round; the Blood Sword is the ONLY healing.
- **Knockback is CONSTANT** (`KB_CONSTANT_MISSING 0.30`; `null` = revert).
- **Anti-snowball economy**: 8 g/round + 2/kill + 2 win + 1 first death; 2×
  earn-spread cap test-enforced. Midas is a mark-then-cash rhythm (question J
  closed).
- **Fireball locked at lv1 in elemental** (default ruleset) — 11 elements are
  its progression, all private-stacked riders: ember=damage, terra=size,
  gale=push (lv3 gust), arcane=haste [18,32] + lv3 kit refund (NEVER its own
  fireball — 66-74% feedback loop, twice measured), ghost=speed (lv3 pierce),
  venom=refresh-only DoT (lethal tick takes the kill), frost=stacks-to-CC,
  momentum=EVOLUTION TIERS at 40/90/150 game-long landed hits, mosquito=sting
  trap (procs twice, shoves once), vampire=every-5th engorged heal, midas.
  Classic keeps the 3-level fireball.
- **Shop text is TAGS** (Remi): `desc` = 2-4 words on the button, `long` = the
  mechanism sentence on hover. Keep new things in that shape.
- **Items: 3 levels**, cumulative `ITEM_FX` totals. Sword is mandatory by
  structure (question L). Cape is pilot-sign-flipping — never buff it off
  Hard-bot tables.
- **Spells** (round 17): lightning = telegraphed sky-bolt (2.2 zone, 0.5 s,
  ignores pillars/walls; delay+radius NEVER level); hook → **Swap** (full
  position+velocity trade, 1 dmg stamps lava credit); Teleport is named
  **Blink**; pillars are unlimited per caster; vanish 1/2/3 s at flat 10 g;
  ground-targeted spells have INFINITE range (bots use `BOLT_ENGAGE`-style
  caps instead); ex-"power" spells sit in the normal shop at 12-14 g but
  `tier: 'power'` REMAINS as the bot guard + draft filter.
- **Vanish**: position stripped in `snapshot()` AND masked from bot perception
  (`BOT_MEMORY`) — both load-bearing, test-locked.
- **Credit rules**: DoT never stamps last-hitter; a lethal poison tick DOES
  take the kill. Lifesteal pays on damage actually dealt, never lava; heals
  ≥ 1 hp pop a green +N; poison ticks are exempt from the ≥1 floater filter.
- **Draft mode**: optional flag over any ruleset. Unmeasured by design.
- **Bots**: Easy/Normal/Hard/Extreme (`grunt/brawler/berserker/stalker` keys).
  Ladder h2h 100/99.8/100. Targeting is a SOFTMAX draw (`BOT_TARGETING`,
  TEMPERATURE 6); sky-bolt dodge is a committed per-bolt roll (`boltDodge`
  0.35/0.5/0.85 — Remi set Hard's 50%); bots pressure the kill leader
  (`LEADER_BIAS 2.5`).

## Co-op campaign (mode `coop`) — MOTHBALLED

- **Under construction (ROUND17 §1): do not tune it, do not balance around
  it.** The mode is off the lobby button (`MODES` in `client/coop.js`) and
  waits for Remi's redesign; the code, the campaign data and the tests stay
  live. Keep them green — that is the whole obligation.
- One team vs data-defined waves; **friendly fire is ON** (team kills pay
  nothing); `hostile()` is a targeting helper only — never put it on a damage
  path. Level ≠ round: wipes cost a round, `COOP_MAX_ROUNDS` 13 is the budget.
- Old tuning levers and measured lessons, for whoever picks the redesign up:
  `docs/history/2026-08-08-agents-full-pre-diet.md` §co-op.

## Hosting & ops

- `npm run host` → cloudflared quick tunnel (URL changes each restart).
- ws heartbeat + lobby ban button handle ghost players; reconnect persistence
  restores progress by normalized name within 10 min (e2e test-locked).
- Final standings wait for every human (45 s grace). After pulling: restart
  the server AND hard-refresh clients.

## Verification ritual (run before claiming anything works)

```bash
npx vitest run                                   # 237 green
node test/harness/run.js test/harness/scenarios/bots.js
node test/harness/run.js test/harness/scenarios/coop.js
PLAY_MS=30000 node test/client-robustness.js     # chromium + webkit
node tools/reconnect-test.js                     # progress survives a drop
node tools/arena.js --games=60 --players=4       # games finish, sane kills
```
Kill stray servers when done (`pgrep -fl "server/index.js"`) — **but check
first that Remi isn't hosting a live game.**

## Known debt (rough priority)

0. **Remi's rulings first**: midas-cdr (J), venom (G), offense-first meta (H),
   plus the standing feel items (gale burst, Blood Sword feel, mosquito in
   human hands, constant knockback, draft fun, lava share).
1. **Teach bots the power tier and the Stone Pillar** — all five measure at
   exactly the do-nothing control; highest-value lab work left. (Draft can
   hand a bot a Pillar today; only power spells are filtered from offers.)
2. Hosting/versioning work in `docs/` is decided but unbuilt.
3. Bot hotspots (accepted): boomer over-rated everywhere (nothing dodges or
   catches one); escape/rusher are bot-traps — fix with piloting, not numbers.
4. Co-op polish (enemy HP bars render green; L8-3p pacing; no per-wave `hp`) —
   parked with the mode until Remi's redesign, do not pick it up.

## Scars (one line each — full stories: `docs/history/2026-08-08-agents-full-pre-diet.md`)

- A refund that pays the spell that triggers it is a feedback loop; fix the
  topology, not the number (arcane, 74%).
- Any global arena/item/gold/knockback change re-prices everything priced
  against it — re-sweep ramps/percentages (the fireball lock silently tripled
  momentum and crowned venom). It re-prices the mothballed co-op campaign too:
  `coop --levels` only if its tests break (NEVER_STOPS broke L8 to 6%).
- Swept-collision side checks must use the PRE-move position (fast balls
  tunneled through Mirror Walls).
- A feature that is never rendered — or renders under the HP bar, or moves by
  imperceptible steps — reads as broken; screenshot the client, don't just
  read the code.
- A study cannot see a variable its design cannot express; build the lab that
  can, a "no change" from the wrong lab is not evidence.
- The do-nothing floor is ~3%, not 25%: mixed tables are rankings. Before
  believing "bot artifact", try to DELETE the artifact (midas).
- A single 400-game run is not a measurement: 2+ seeds, check monotonicity;
  the isolation self-test itself needs ≥1600 games.
- Ask what a thing is FOR before nerfing its visible knob (mosquito's shove).
- h2h for tier questions (Elo hides gaps); h2h vs Easy is no signal.
- Bot reaction time is a perception delay — extrapolate stale observations,
  don't under-lead.
- Balance tests read numbers from the spec, never pinned constants.
- Stale server/browser after pulling ships mixed-version games; tunnel sockets
  die silently (hence the heartbeat); audio must start from a user gesture;
  emoji icons are load-bearing UI; voice transcriptions garble numbers —
  state your interpretation.
