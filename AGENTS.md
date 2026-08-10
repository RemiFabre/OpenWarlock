# AGENTS.md — handoff for the next session

*Last updated 2026-08-11 (round 21.8). Read this first, then
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
- **Code comments**: keep then short. At maximum: what the value means + current intent + active ⚠
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

- **THE GAME IS PUBLIC** (2026-08-09): GitHub Pages serves it at
  remifabre.github.io/OpenWarlock/client/ — solo play AND player hosting
  (📡 Host online → room code/link over WebRTC; signalling relay = HF Space
  RemiFabre/openwarlock-signal, redeploy via scripts/deploy-signal-hf.sh).
  Anonymous usage beacons → relay /stats → in-game 📊 panel; history persists
  to the private HF dataset openwarlock-stats. A pre-commit hook stamps
  shared/version.js (rN, corner display, welcome-handshake mismatch warning)
  — NEVER bypass it; Pages lags pushes by up to ~10 min (CDN).
- ⚠ STRATEGIES.md's 25-row table predates rounds 17.2-21 — quote
  `docs/history/2026-08-10-round21-elo.md` instead.
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
| `shared/engine.js` | the authoritative ROOM behind a transport seam (round 19): seating, wire switch, ghosts, bans, snapshots. Node server AND the in-tab solo mode both run it |
| `server/index.js` | now an ADAPTER over engine.js: http, `/health`, ws + heartbeat/RTT pings, JSONL journal, IP bans |
| `client/transport.js` | ws + solo + RTC transports behind one seam (`?mode=`, `#r=CODE`, else /health probe). Hosting record: `docs/history/2026-08-09-browser-hosting-phaseB.md` |
| `server/signal.js` | optional WebRTC signalling relay (`npm run signal`), ~100 lines, zero game logic, disposable mid-game |
| `scripts/host.js` | `npm run host`: server + cloudflared quick tunnel |
| `client/` | canvas client: main.js (net/input/HUD/shop/floaters), render.js, coop.js, music.js, sfx.js |
| `test/sim.test.js` | 389 vitest tests — must stay green; balance tests read numbers FROM THE SPEC, never pinned |
| `test/harness/` | scenario runner + invariant checker + fuzzer (`scenarios/bots.js`, `scenarios/coop.js`) |
| `test/client-robustness.js` | 2-engine playwright test (`PLAY_MS=30000`) |
| `tools/arena.js` | balance lab: `--isolate=` (points over a price-matched do-nothing; ⚠ saturates at the top in elemental since round 16), `--ladder=`, `--fx=key.field=a,b,c` (sweep without editing), `--mirror=`, `--mode=elemental`, self-test (trust it at ≥1600 games) |
| `tools/strategy-study.js` | **the round-16 ranking instrument**: exhaustive shopping strategies in 4-seat mirrors. `--list`, `--kind=stalker`, `--only=`, `--json=` |
| `tools/roster.js` | the ELO strategy roster AS CODE (level-explicit cores, auto-pad to 150-185 g). `docs/ARCHETYPES.md` is GENERATED from it: `node tools/roster.js --doc` |
| `tools/elo.js` | **the strategy ranking instrument**: random 4-of-roster Hard lobbies, Bradley-Terry over pairwise placements, Elo-scaled around 1500. `--games=8000 --seed=1` (~20 min). Latest table: `docs/history/2026-08-10-round21-elo.md` |
| `tools/duel.js` | 1v1 gold-matched archetype kits at early/mid/late snapshots — prices an UPGRADE PATH, blind to multi-target/economy |
| `tools/h2h.js` | difficulty-ladder check (2v2 seats, 50% = parity) — the Elo table hides tier gaps |
| `tools/coop.js` | co-op lab: `--levels` is the tuning view. Co-op is mothballed — re-run **only if its tests break** |
| `tools/reconnect-test.js` | e2e reconnect persistence (spawns a real server) |
| `BALANCE.md` | current balance truths + open questions + repro commands. Full reports: `docs/history/` |
| `STRATEGIES.md` | bot tiers × builds chart, the 25-strategy ranking, how to read arena reports |
| `REMI_NOTES.md` | the changelog Remi reads — latest round only |
| `docs/` | design docs (`HOSTING.md`, `VERSIONING.md` rev 2, `ROUND12.md`, `NAMING.md`) + **`history/` (append-only archive — read on demand only)** |

## Game rules snapshot (post-round-21, one line each — details in constants.js and BALANCE.md)

- First to **15 kills** (per TEAM: `15 × size`, and solo teams are the default —
  round 21.3), 25-round cap; countdown → battle → roundEnd → shop.
  Spawn seats are DEALT FRESH each round (seeded, versus only — round 18).
  The 🧪 **testing sandbox** (lobby flag like draft): chosen gold, game opens
  in an UNTIMED shop, ready-up starts round 1.
- **Teams are a lobby property, not a mode** (21.3): everyone has a team number,
  default = their own, so an untouched lobby is bit-identical to free-for-all.
  Teammates' spells pass THROUGH each other (`allied()` on every damage/effect
  path); pillars still block everyone. Any shape works (2v2, 3v2, 2v1v1).
- **Arena size is per-game** (21.2): `state.startRadius`, never `ARENA.START_RADIUS`,
  is the un-shrunk arena — constant play area per player above 5 seats.
- **Pillars are permanent** (21.2): lava-proof, they persist across rounds and
  accumulate all game; terra lv3 is the only remover.
- **Lava** 14 DPS, ×2 swim speed; versus ring **never stops** (`NEVER_STOPS`);
  co-op keeps the classic ring. Lava kill share: keep reporting, no target.
  **4 portals** in the lava (diagonals, 1.25× rim, `ARENA.PORTALS`, versus
  only): touch → teleport to center, dead stop (round 18).
- **NO PASSIVE REGEN** (round 17, measured): `PLAYER.REGEN 0`, the Ring is
  deleted, the regen-lock machinery is inert-but-kept as the revert path.
  Damage is permanent within a round; the Blood Sword is the ONLY healing.
- **Knockback is CONSTANT** (`KB_CONSTANT_MISSING 0.30`; `null` = revert).
- **Anti-snowball economy**: 8 g/round + 2/kill + 2 win + 1 first death; 2×
  earn-spread cap test-enforced. Midas is a mark-then-cash rhythm (question J
  closed).
- **Fireball locked at lv1 in elemental** (default ruleset) — 11 elements are
  its progression, all private-stacked riders: ember=damage [1,2,4],
  terra=size (lv3 SMASHES pillars, ball consumed — round 20.2),
  gale=push + flat gust every 3rd stack from LV1 (round 19), arcane=haste
  [18,32,32] + lv3 kit refund 1 s/hit (NEVER its own fireball — 66-74%
  feedback loop, twice measured), ghost=speed (lv3 pierce, 10 g),
  malady=ex-venom two-hit CONTAGION (21.8: `tickDmg [1,1.5,2]`, `dotTime` FLAT 4,
  aura r [5,7,9] — round 20.3, once-per-instance immunity, creator IMMUNE to
  their own instance (still catches other players');
  lethal tick credits creator/spreader), frost=stacks-to-CC,
  anger=ex-momentum MARK HUNT (red mark on a random enemy every
  **[20,15,10] s** — round 20 nerf, claim = +0.5 fireball dmg forever),
  mosquito (DISPLAYS as **Echo 🫧** since 21.1, key unchanged)=every [6,5,4]th
  cast fires a PAIR (no-push lead + normal trailing ball, round 20.1),
  vampire=every-5th engorged heal, midas.
  Classic keeps the 3-level fireball.
- **Shop text is TAGS** (Remi): `desc` = 2-4 words on the button, `long` = the
  mechanism sentence on hover. Keep new things in that shape.
- **Items: 3 levels**, cumulative `ITEM_FX` totals, **flat price per level
  since round 20**: 5 g boots/treads/cape, 7 g sword/amulet/hourglass (21.1)
  6 g `brazier` (DISPLAYS as **Hat of Aura 🎩**: burn aura `auraR [5,6,7]`,
  and since 21.8 the burn LINGERS `[3,4,5]` s after you leave the ring) and
  7 g `spoon` (**Slow Spoon 🥄**, 21.8: a FLAT `healOnHit [1,1.5,2]` per
  damaging hit, once per victim — ⚠ auras and DoT ticks are excluded via
  `applyDamage`'s `procs` flag, which is the item's whole balance) — so the
  WHOLE shelf is 147 g, and the cuts did NOT move items off the bottom of the
  strategy table. Sword is mandatory by
  structure (question L). Cape is pilot-sign-flipping — never buff it off
  Hard-bot tables; Remi hand-set it to −25/−40/−50% in 21.7. Echo Stone is
  DELETED (merged into mosquito, round 20.1).
- **Spells** (round 19): lightning = telegraphed sky-bolt (2.2 zone, 0.5 s,
  ignores pillars/walls; delay+radius NEVER level); **Swap** 3 levels 10 g,
  speed 50, range [40,55,70], cd −1 s/lv, 1 dmg stamps lava credit, victim stun
  SCALES with the distance actually swapped, measured between the two TRADED
  positions at the switch (round 21.0: `stun {pad .55, min 1, max 3}`
  + d / fireball speed → 1.00/1.53/2.26/3.00 s at d = 10/40/70/120);
  **Blink**
  [10,5] g flat range 22 (lv2 = cd); **Mine** 💣 (key `nova` — the round-19 Bomb was reworked away in 21.8)
  = a trap planted AT YOUR FEET, trigger ring 1.32 (= 1.65 × the fireball),
  [10,5] g, 2 levels. It SWALLOWS the owner's own fireballs (`stores` [1,2]);
  stepping on it costs the mine's damage [10,15] plus every stored ball fired
  point blank one TICK apart, all push-less but the last, which pushes at
  max(ball, mine) (`kbMin`). A Shield answers the balls, never the ground;
  pillars unlimited; `statue` (DISPLAYS as **NOPE** since 21.7, gold-tinted 🗿 —
  the Stone Pillar has the plain 🗿 back) = 2 s of golden-pillar total invulnerability,
  rooted + silenced + unpushable, body eats projectiles ([10,5], cd [16,12],
  duration FLAT); **Decoy** 👥 = 5 s mirages that ape your casts and have zero
  gameplay effect ([10,5], lv2 = a second clone, cd flat, power tier);
  vanish 1/2/3 s at 10 g — ANY cast while invisible
  REVEALS (vanish itself + the auto repulse burst don't; vanish is castable
  mid-charge); walls reflect projectiles ONLY (the round-19 "tangible" order was a transcription ghost — Remi reverted it); infinite ground-target
  range; `tier: 'power'` = bot guard + draft filter only. Spell keys are
  REBINDABLE from the shop chips and the Keys panel (owKeys localStorage);
  since 21.7 `loadKeys()` DE-CONFLICTS on load (saved wins, a defaulted spell
  takes qwerty → azerty → first free key) and rebinding always swaps + toasts.
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
  waits for Remi's redesign;

## Hosting & ops

- `npm run host` → cloudflared quick tunnel (URL changes each restart).
- ws heartbeat + lobby ban button handle ghost players; reconnect persistence
  restores progress by normalized name within 10 min (e2e test-locked).
- Per-player ping (round 18): a SECOND 2 s ws ping stream (timestamp payload)
  → `pings` beside snap → ms badge. NEVER fold its cadence into the reaper.
- Final standings wait for every human (45 s grace). After pulling: restart
  the server AND hard-refresh clients.

## Verification ritual (run before claiming anything works)

```bash
npx vitest run                                   # 389 green
node test/harness/run.js test/harness/scenarios/bots.js
node test/harness/run.js test/harness/scenarios/coop.js
PLAY_MS=30000 node test/client-robustness.js     # chromium + webkit
node tools/reconnect-test.js                     # progress survives a drop
node tools/arena.js --games=60 --players=4       # games finish, sane kills
node tools/arena.js --games=60 --players=8       # ditto at the scaled arena (21.2)
```
Kill stray servers when done (`pgrep -fl "server/index.js"`) — **but check
first that Remi isn't hosting a live game.**

## Scars (one line each — full stories: `docs/history/2026-08-08-agents-full-pre-diet.md`)
- Swept-collision side checks must use the PRE-move position (fast balls
  tunneled through Mirror Walls).
- A feature that is never rendered — or renders under the HP bar, or moves by
  imperceptible steps — reads as broken; screenshot the client, don't just
  read the code.
- A single 400-game run is not a measurement: 2+ seeds, check monotonicity;
  the isolation self-test itself needs ≥1600 games.
- h2h for tier questions (Elo hides gaps); h2h vs Easy is no signal.
- Bot reaction time is a perception delay — extrapolate stale observations,
  don't under-lead.
- Balance tests read numbers from the spec, never pinned constants.
- A new spell's DEFAULT key landing on a returning player's SAVED binding is a
  silently dead spell (round 21.7: Statue and Decoy, both invisible to Remi).
  Never assume the presets describe what a real player's client is bound to.
- Stale server/browser after pulling ships mixed-version games; tunnel sockets
  die silently (hence the heartbeat); audio must start from a user gesture;
  emoji icons are load-bearing UI; voice transcriptions garble numbers —
  state your interpretation.
