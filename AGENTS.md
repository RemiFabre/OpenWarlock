# AGENTS.md — handoff for the next session

*Last updated 2026-08-05, after rounds 6–9 (see REMI_NOTES.md for the
player-facing changelog of each round). Read this first; it replaces digging
through history.*

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
- He wants **data-driven balance** (thousands of headless games, documented
  iterations), not vibes — but bot data has limits: bots don't extract
  reactive-skill value (teleport, catches, trails). Flag bot-artifacts,
  don't number-buff around them.
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
| `shared/constants.js` | ALL game numbers (spells incl. power tier, items, 7 elements, arena, gold economy, bots, BUILDS) |
| `shared/sim.js` | pure simulation + bot AIs (grunt/berserker/stalker + generic pilotOwnedSpells layer) + elements, hazards, meteors, walls |
| `server/index.js` | authoritative server, 30 Hz tick, JSONL journal (`JOURNAL=`), crash dumps, `/health`, static serving, ws heartbeat reaper, lobby kick/ban |
| `scripts/host.js` | `npm run host`: server + cloudflared quick tunnel → public URL (verified end-to-end incl. websockets) |
| `client/` | canvas client: main.js (net/input/HUD/shop), render.js (full-res art + 1/3-res blob layer), music.js, sfx.js (synthesized) |
| `test/sim.test.js` | 92 vitest tests — `npx vitest run` must stay green |
| `test/harness/` | scenario runner + invariant checker + fuzzer (`node test/harness/run.js test/harness/scenarios/bots.js`) |
| `test/client-robustness.js` | 2-engine playwright test (`PLAY_MS=30000 node test/client-robustness.js`) |
| `tools/arena.js` | balance lab: mixed Elo, `--mirror=`, `--probe=`, `--mode=elemental --kind=` |
| `BALANCE.md` | report #3 (21k games) + round 8/9 addenda — **tables predate rounds 8–9, re-measure before citing** |
| `STRATEGIES.md` | bot difficulty × build chart + how to read arena reports |
| `REMI_NOTES.md` | per-round changelog Remi actually reads (newest on top) |

## Game rules snapshot (v7, post-round-9)

- First to **15 kills**, 25-round cap. countdown → battle → roundEnd (banner,
  art reveal, itemized income) → shop (full roster w/ kits; Ready skips).
- **Lava**: 14 DPS, **+30% move speed** while in it (dodge route by design),
  no afterburn. Ring shrinks faster as fighters die; sudden death after
  overtime. 6 pillars sink as it shrinks. Lava kill share currently ~68%
  (was ~86% pre-retunes — Remi hasn't ruled on the new value yet).
- **Knockback**: HP-scaled by % missing (`KB_HP_FACTOR 0.55`), no size term
  (audited, regression-tested — big is only ever a disadvantage).
- **Economy (anti-snowball)**: 8 g/round + 2 g/kill + 2 g round win + 1 g
  first death; invariant `ROUND_BASE >= 3*PER_KILL + ROUND_WIN` caps 4p earn
  spread at 2× (test-enforced). Gap bounty max 3 g; the leader never
  collects one. `goldEarned` + `dmgDealt` tracked (DoT/lava credit rules
  below); standings show earnings, not wallet.
- **Spells**: fireball 41 u/s r0.8 dmg 5/9/13 cd 2.1→1.6; lightning range 38
  NO push (finisher); boomerang out 28 returns to LAUNCH POINT, catch =
  half cd, uncaught flies off forever, one hit per enemy per throw;
  teleport F, rush E, boomerang R (both presets); **pillar S** (placeable
  blocker, one each, 10–16 s).
- **Power tier, unlocked after round 5** (buy() enforces `minRound`),
  expensive by design: meteor T (1.25 s telegraph, AoE hits caster too),
  hook G (yanks victim behind caster), repulse X (2 s visible charge,
  spell-locked, radial burst; shield blocks it), mirror wall C (reflects
  ENEMY projectiles — ownership flips — blocks enemy lightning; own pass).
  **Bots don't pilot any of these** → unmeasured, human playtest decides.
- **Credit rule**: DoT ticks (poison, trails) NEVER stamp last-hitter. This
  was the round-9 discovery: poison re-stamping 30×/s stole nearly every
  lava kill (venom measured 75–86% before the fix, ~15% after, same numbers).
- **Elemental mode** ⚗️ (lobby toggle): 7 elements, each 3 levels (10+8+8 g),
  **stackable** (frost+ember works); arcane 🔮 = global CDR, no fireball
  needed; venom drips ground trails (`state.hazards`); terra size/level.
  Measured spread 10–48% per tier with clear affinities (terra→stalker,
  arcane/ember→berserker, venom→grunt). **Midas ~3% is a bot artifact**
  (saturated bots can't use gold) — judge by humans. Classic wire format
  untouched by elemental fields.
- Bots: ★/★★/★★★ × build strategy (lobby dropdown, 🎲 random); pilot layer
  casts whatever the build buys (except power spells); best bot picks:
  stalker→turtle/sniper, berserker→bruiser, grunt→boomer.
- UI: own player wears a permanent red ring; kill banner + jingle on your
  kills; income breakdown on the round banner; gold rules printed in lobby
  and shop.

## Hosting & multiplayer ops

- `npm run host` → cloudflared quick tunnel, public https URL (changes every
  restart — reshare it). Websocket join verified through the tunnel.
- **Ghost players**: tunnel sockets die without close frames. Two defenses:
  ws heartbeat (ping 15 s, terminate after 2 misses) and the lobby **✕ ban**
  button (blocks name + real IP via `CF-Connecting-IP`; "Unban all" lifts;
  bans die with the process). Kicked/banned up-to-date clients stop their
  reconnect loop; stale tabs hammer harmlessly.
- After pulling: **restart the server** and hard-refresh clients.

## Verification ritual (run before claiming anything works)

```bash
npx vitest run                                   # 92 green
node test/harness/run.js test/harness/scenarios/bots.js
PLAY_MS=30000 node test/client-robustness.js     # chromium + webkit
node tools/arena.js --games=60 --players=4       # games finish, sane kills
```
Kill stray servers when done (`pgrep -fl "server/index.js"`) — they've
bitten us three times now, including robustness-test leftovers.

## Known debt / next candidates (rough priority)

1. **Human playtest verdicts pending**: power spells (all numbers are design
   guesses), boomerang catch feel, teleport at 12 g, lava share ~68% ok?,
   elemental v2 spread, midas in human hands.
2. **Full balance campaign re-run** (BALANCE.md report #4): everything since
   report #3 (economy, KB 0.55, lightning nerf, boomerang rework, elemental
   v2) — write it per the explain-everything rule. Consider piloting power
   spells + boomerang catches for bots first so the lab can see them.
3. Known bot hotspots (accepted, documented): grunt/boomer ~58%,
   berserker/bruiser ~57%; escape/rusher are bot-traps (3–12%) — raise via
   smarter piloting, not numbers.
4. Remi's **reaction-time dodge-window framework** (projectile speed ×
   hitbox × distance vs ~150 ms reaction) for the next feel pass.
5. Persistent identity across reconnects (gold/score lost on rejoin) — bans
   are name+ip until then.
6. Rendering perf round 2 if needed (cache rock/rim gradients per radius);
   client-side prediction if tunnel latency bothers; real SFX from Remi.

## Recent gotchas (learn from our scars)

- **Stale browser cache / stale server process** ship mixed-version games:
  after pulling, restart the server AND hard-refresh.
- **Tunnel sockets die silently** — never assume 'close' fires; that's why
  the heartbeat exists.
- **Measure before AND after "obvious" fixes**: venom's dominance survived
  three number nerfs because the real cause was the credit-stamping bug.
  Same lesson as the boomerang double-tap: reason about the mechanism, the
  numbers follow.
- `str.replace`-style bulk edits and orphan `===` echoes in zsh cause false
  alarms; prefer Edit-tool exact matches. Perl one-liners choke on `//` and
  unicode in patterns.
- Autoplay: all audio must start from a user gesture; music.js retries on
  the next gesture — keep that pattern.
- Emoji avatars/icons are load-bearing UI; no image assets for game objects.
- Voice transcriptions garble numbers and directions ("cooldown trop
  rapide... je le réduirai de 30%") — state your interpretation in
  REMI_NOTES and make it a one-line revert.
