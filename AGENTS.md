# AGENTS.md — handoff for the next session

*Last updated 2026-08-05, after round 10 (see REMI_NOTES.md for the
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
| `test/sim.test.js` | 107 vitest tests — `npx vitest run` must stay green |
| `test/harness/` | scenario runner + invariant checker + fuzzer (`node test/harness/run.js test/harness/scenarios/bots.js`) |
| `test/client-robustness.js` | 2-engine playwright test (`PLAY_MS=30000 node test/client-robustness.js`) |
| `tools/arena.js` | balance lab: mixed Elo, `--mirror=`, `--probe=`, `--mode=elemental --kind=` |
| `tools/h2h.js` | **difficulty-ladder check** (2 seats vs 2 seats, 50% = parity) — the mixed Elo table hides tier gaps; this one doesn't |
| `tools/reconnect-test.js` | e2e reconnect-persistence test (spawns a real server + ws clients) |
| `BALANCE.md` | **report #4 (round 10, ~58k games) — current**; #3/#2 in git history at `ab48932` / `9a96b47` |
| `STRATEGIES.md` | bot difficulty × build chart + how to read arena reports |
| `REMI_NOTES.md` | per-round changelog Remi actually reads (newest on top) |

## Game rules snapshot (v8, post-round-10)

- First to **15 kills**, 25-round cap. countdown → battle → roundEnd (banner,
  art reveal, itemized income) → shop (full roster w/ kits; Ready skips).
- **Lava**: 14 DPS, **×2 move speed** while in it (swimming is a real escape
  route now, round 10), no afterburn. Ring shrinks faster as fighters die;
  sudden death after overtime. 6 pillars sink as it shrinks. **Lava kill
  share now ~47%** (86% at launch → 68% after round 9 → 47% after round 10's
  softer knockback + faster swimming). This is BALANCE.md open question #1 —
  Remi hasn't ruled on it; both levers are one-line reverts.
- **Knockback**: HP-scaled by % missing (`KB_HP_FACTOR 0.385`, −30% in round
  10), no size term (audited, regression-tested — big is only ever a
  disadvantage).
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
  hook G (yanks victim a full body behind caster; **visible chain + 🪝 head**
  since round 10 — it used to render as nothing at all), repulse X (2 s
  visible charge; **Teleport and Rush are castable mid-charge** since round
  10, everything else stays locked, and repulse can start mid-dash; shield
  blocks the burst), mirror wall C (reflects ENEMY projectiles — ownership
  flips — blocks enemy lightning; own pass).
  **Bots don't pilot any of these** → unmeasured, human playtest decides.
- **Credit rule**: DoT ticks (poison, trails) NEVER stamp last-hitter — but
  since round 10 a **lethal poison tick does take the kill** (the poisoner is
  passed as the direct source). Both halves are test-locked. The round-9
  discovery this protects: poison re-stamping 30×/s stole nearly every lava
  kill (venom measured 75–86% before the fix, ~15% after, same numbers).
- **Lifesteal** heals on damage *actually dealt* (overkill excluded), from
  every sourced hit including DoT ticks and trails, never from lava. 5 tests.
- **Elemental mode** ⚗️ (lobby toggle): **8 elements**, each 3 levels
  (10+8+8 g), **stackable** (frost+ember works); arcane 🔮 = global CDR, no
  fireball needed; venom drips ground trails (`state.hazards`) *and* poisons
  in **discrete 1/s ticks for 5 s that refresh+stack on re-hit**; terra
  size/level; **critical 💢 (new round 10)** ramps dmg+push per fireball you
  LAND, capped at 20 hits, resets each round. Measured spread 7–44% per tier
  with clear affinities (terra→stalker, ember→grunt/berserker,
  critical→grunt). **Midas 0.5–1.8% is a bot artifact** — those seats end on
  215–260 gold vs 53–80 for everyone else: they can't spend it. Judge by
  humans. Classic wire format untouched by elemental fields.
- Bots: ★/★★/★★★ × build strategy (lobby dropdown, 🎲 random); pilot layer
  casts whatever the build buys (except power spells); best bot picks:
  **boomer at every tier** (54–62% — bot artifact, nothing dodges or catches
  a boomerang), then berserker→bruiser, stalker→turtle.
  **★★ has a reaction time since round 10**: ~0.21 s decisions + aim from a
  lag-extrapolated stale observation + absolute error floor. It leads you fine
  while you hold a heading and whiffs when you change direction inside its
  window. Ladder verified with `tools/h2h.js`: ★★★ beats ★★ 100%, ★★ beats ★
  75% (was **99.6%** before the pass — that was Remi's "unbeatable up close").
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
- **Reconnect persistence (round 10)**: dropping mid-game stashes your
  progress (gold, goldEarned, kills, deaths, dmgDealt, maxHp, spells, items,
  elements) under your **normalized name**; rejoining with that name within
  10 min restores it, and `resetToLobby` clears every stash. Names are trusted
  inside a friends lobby — same trust model as the bans. If ALL humans vanish
  mid-game the lobby reset now waits `RESET_GRACE_MS` (60 s) so a tunnel
  hiccup can't hand the game to the bots. Verified end-to-end by
  `node tools/reconnect-test.js` (real server, real sockets, hard `terminate`).
- After pulling: **restart the server** and hard-refresh clients.

## Verification ritual (run before claiming anything works)

```bash
npx vitest run                                   # 107 green
node test/harness/run.js test/harness/scenarios/bots.js
PLAY_MS=30000 node test/client-robustness.js     # chromium + webkit
node tools/reconnect-test.js                     # progress survives a drop
node tools/arena.js --games=60 --players=4       # games finish, sane kills
```
Kill stray servers when done (`pgrep -fl "server/index.js"`) — they've
bitten us three times now, including robustness-test leftovers.

## Known debt / next candidates (rough priority)

1. **Human playtest verdicts pending** (all 6 are BALANCE.md's open
   questions): **lava kill share is now ~47%** — is that the game Remi
   wants? (one-line reverts: `KB_HP_FACTOR`, `LAVA.SPEED_MULT`); does the ★★
   duel feel fair at 75%?; regen — numbers or an in-combat rule?; boomer at
   54–62%; the whole power tier incl. round-10 repulse combos + visible hook;
   critical and midas in human hands.
2. **Teach bots the power tier** — meteor/hook/repulse/wall are still
   unmeasurable (bots pilot none), so all their numbers are design guesses.
   Same for boomerang catches, which is why the lab over-rates boomer. This is
   the highest-value lab work left.
3. Known bot hotspots (accepted, documented): boomer 54–62% in every mirror,
   berserker/bruiser 55%; escape/rusher are bot-traps (0.6–12%) — raise via
   smarter piloting, not numbers.
4. Remi's **reaction-time dodge-window framework** (projectile speed ×
   hitbox × distance vs ~150 ms reaction) for the next feel pass. Round 10
   built the *bot* half of this (★★ lag model); the projectile-geometry half
   is still open.
5. Rendering perf round 2 if needed (cache rock/rim gradients per radius);
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
- **The mixed Elo table hides difficulty-tier gaps.** Round 10: the ★★ read
  as only ~80 Elo above the ★ while actually winning 99.6% of head-to-head
  games. If the question is about a *tier*, use `tools/h2h.js`, not the Elo
  table.
- **A "reaction time" is a perception delay, not a handicap.** Aiming at where
  the target *was* under-leads by lag×speed forever, which is not what a human
  does — extrapolate the stale observation across the lag instead, so the bot
  leads correctly and only loses to genuine direction changes. The naive
  version dropped the ★★ *below* the ★.
- **Any global knockback/lava change silently re-prices everything built on
  top of it**: round 10's KB cut buried gale (a push multiplier) and crowned
  the sustain items. Re-check multipliers and sustain in the same commit.
- `str.replace`-style bulk edits and orphan `===` echoes in zsh cause false
  alarms; prefer Edit-tool exact matches. Perl one-liners choke on `//` and
  unicode in patterns.
- Autoplay: all audio must start from a user gesture; music.js retries on
  the next gesture — keep that pattern.
- Emoji avatars/icons are load-bearing UI; no image assets for game objects.
- Voice transcriptions garble numbers and directions ("cooldown trop
  rapide... je le réduirai de 30%") — state your interpretation in
  REMI_NOTES and make it a one-line revert.
