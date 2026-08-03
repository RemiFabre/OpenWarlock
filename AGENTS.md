# AGENTS.md — handoff for the next session

*Last updated 2026-08-03. Read this first; it replaces digging through history.*

## What this is

**OpenWarlock** (`github.com/RemiFabre/OpenWarlock`, push directly to main,
keep commits short) — an open-source web remake of the WC3 *Warlock* arena
brawler, and the pathfinder for Remi's bigger idea: an open, web-native,
player-hosted MOBA with community house rules and an AI-agent-friendly
codebase. Vanilla JS everywhere, no build step, Node ESM, only dep is `ws`.

## How Remi works (owner preferences)

- Voice-dictated feedback after playtests → batch of concrete changes. He
  wants **data-driven balance** (thousands of headless games, documented
  iterations — see BALANCE.md), not vibes.
- Non-QWERTY keyboard → keybindings must stay rebindable (client Keys panel).
- Knockback-into-lava is the heart of the game (~86% of deaths are lava, by
  design). Damage is deliberately low; baseline regen 1.2.
- He supplies art/music (`assets/`, from his Fire Nation Attacked project;
  compress before committing: `afconvert` AAC 96k, `sips` JPEG).
- Use subagents liberally; verify between phases; he reads REMI_NOTES.md.

## Map

| Path | What |
|---|---|
| `shared/constants.js` | ALL game numbers (spells, items, elements, arena, bots roster) |
| `shared/sim.js` | pure simulation + bot AIs (grunt/berserker/stalker) + elemental effects |
| `server/index.js` | one-process authoritative server, 30 Hz tick, JSONL journal (`JOURNAL=` env), crash dumps, `/health`, static serving (no-cache for code, 1-day for assets) |
| `client/` | canvas client: main.js (net/input/HUD), render.js (world + offscreen backdrop layer), music.js, sfx.js (synthesized) |
| `assets/` | Remi's level art+music, `manifest.json` (10 levels + intro track) |
| `test/sim.test.js` | 73 vitest tests — `npx vitest run` must stay green |
| `test/harness/` | scenario runner + invariant checker + fuzzer (`node test/harness/run.js test/harness/scenarios/bots.js`) |
| `test/client-robustness.js` | 2-engine playwright test (`PLAY_MS=30000 node test/client-robustness.js`) |
| `tools/arena.js` | balance lab: Elo per strategy, `--mirror=`, `--probe=`, `--mode=elemental` |
| `BALANCE.md` | report #2: the 46k-game rebalance campaign, iteration by iteration |
| `REMI_NOTES.md` | per-round changelog Remi actually reads (newest on top) |
| `BUGS.md` | resolved liveness issues, for the record |

## Game rules snapshot (v5/v6)

First to **15 kills** (25-round cap). Rounds: countdown → battle → roundEnd
(banner + art reveal) → shop (Ready skips) → …; lava ring shrinks faster as
fighters die, sudden-death to 0 after overtime; 6 pillars sink into the lava;
knockback doubled and HP-scaled (`KB_HP_FACTOR`); size-by-lead (leaders grow);
spectator mode; bot tiers ★/★★/★★★; **elemental mode** ⚗️ (lobby toggle):
6 fireball elements + Echo Stone/Cinder Crown, classic wire-format untouched.
Music: intro track on menus/gameover, level n track+art per round, art reveal
at round end (world fades 0.6 s, art full for ~3 s).

## Verification ritual (run before claiming anything works)

```bash
npx vitest run                                   # 73 green
node test/harness/run.js test/harness/scenarios/bots.js
PLAY_MS=30000 node test/client-robustness.js     # chromium + webkit
node tools/arena.js --games=60 --players=4       # games finish, sane kills
```
Playwright chromium+webkit installed. Server for manual poking:
`PORT=3123 node server/index.js`. Kill stray servers when done
(`pgrep -fl OpenWarlock`) — stale processes have bitten us twice.

## Known debt / next candidates (rough priority)

1. **Bots don't cast most spells they buy** (only stalker uses its kit) —
   biggest balance confound (BALANCE.md finding 0). Fix piloting, re-balance.
2. **Elemental balance**: venom overtuned, midas gold-snowball (flagged, not
   tuned — Remi playtests first).
3. Remi's **reaction-time dodge-window framework** (map projectile speed ×
   hitbox × distance vs ~150 ms reaction) for the next projectile-feel pass.
4. Rendering perf round 2 if needed: cache rock/rim gradients per radius;
   current state is offscreen backdrop + DPR 1.5 cap (15→42 FPS headless).
5. Persistent identity across reconnects (gold/score lost on rejoin).
6. Client-side prediction of own movement if latency ever bothers.
7. Sound: SFX are synthesized placeholders; Remi may supply real ones.

## Recent gotchas (learn from our scars)

- **Stale browser cache** shipped mixed-version clients for days — fixed via
  Cache-Control headers, but remember: server processes load sim at start;
  after pulling, **restart the server**, and if in doubt hard-refresh.
- Rounds journal (`test/harness/logs/`) and `failures/` are gitignored.
- `str.replace`-style bulk edits and orphan `=== X ===` echoes in zsh have
  both caused false alarms; prefer Edit-tool exact matches.
- Autoplay: all audio must start from a user gesture; music.js retries
  blocked playback on the next gesture — keep that pattern.
- Emoji avatars/icons are load-bearing UI; no image assets for game objects.
