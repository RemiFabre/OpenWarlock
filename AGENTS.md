# AGENTS.md — handoff for the next session

*Last updated 2026-08-07, after round 11 + the co-op campaign (see REMI_NOTES.md for the
player-facing changelog of each round). Read this first; it replaces digging
through history.*

## ⚠ State of the repo right now (read before your first command)

- **ELEVEN commits are on local `main` and NOT pushed** (`origin/main` is at
  `41c4b7d`, local HEAD at `f28ce9d`): the whole of round 12 — item levels,
  private stacks, momentum, the mosquito rework, constant knockback, four named
  difficulty tiers, Vanish, draft mode, vampire/chronos/ghost. All verified
  (196 vitest, both harness scenarios). They were held back because Remi was
  **mid-playtest** and pushing mid-session invites a confusing pull+restart.
  Confirm with him, then `git push origin main`.
- **Uncommitted on top of that (2026-08-07 balance pass, NOT committed on
  purpose)**: the co-op item-cap repair (`shared/campaign.js`), momentum's
  `rampDmg` re-sweep + the frost/midas/ghost investigation notes
  (`shared/constants.js`), one de-pinned momentum test (`test/sim.test.js`) and
  this file. 196 vitest green, both harness scenarios pass, h2h ladder monotone.
- **Remi may still be playing.** Do not `pkill` anything matching
  `server/index.js` and do not run `test/client-robustness.js` or
  `tools/reconnect-test.js` without checking first — they spawn and kill
  servers, and a stray kill takes down his live game. `npx vitest run` and the
  `tools/arena.js` / `tools/coop.js` labs are pure and always safe.

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
| `shared/constants.js` | ALL game numbers (spells incl. power tier, **stackable** items, **9 elements**, arena, gold economy, bots, BUILDS) |
| `shared/sim.js` | pure simulation + bot AIs (grunt/berserker/stalker + generic pilotOwnedSpells layer) + elements, hazards, meteors, walls |
| `server/index.js` | authoritative server, 30 Hz tick, JSONL journal (`JOURNAL=`), crash dumps, `/health`, static serving, ws heartbeat reaper, lobby kick/ban |
| `scripts/host.js` | `npm run host`: server + cloudflared quick tunnel → public URL (verified end-to-end incl. websockets) |
| `client/` | canvas client: main.js (net/input/HUD/shop), render.js (full-res art + 1/3-res blob layer), music.js, sfx.js (synthesized) |
| `test/sim.test.js` | 196 vitest tests — `npx vitest run` must stay green |
| `test/harness/` | scenario runner + invariant checker + fuzzer (`node test/harness/run.js test/harness/scenarios/bots.js`, and `scenarios/coop.js`) |
| `test/client-robustness.js` | 2-engine playwright test (`PLAY_MS=30000 node test/client-robustness.js`) |
| `tools/arena.js` | balance lab: mixed Elo, `--mirror=`, `--probe=`, `--mode=elemental --kind=` |
| `tools/h2h.js` | **difficulty-ladder check** (2 seats vs 2 seats, 50% = parity) — the mixed Elo table hides tier gaps; this one doesn't |
| `shared/campaign.js` | **co-op campaign**: the 10 levels as pure data (unit templates + waves + the party-scaling rule). Levels are data, never code |
| `tools/coop.js` | co-op lab: `--levels` (isolated per-level clear rates, the tuning view), no flag (full campaign runs), `--roster` |
| `client/coop.js` | co-op client: level card, battle status strip, the 3-way rules toggle. Self-contained on purpose |
| `tools/reconnect-test.js` | e2e reconnect-persistence test (spawns a real server + ws clients) |
| `BALANCE.md` | **round-11 addendum on top of report #4 (round 10, ~58k games) — current**; #3/#2 in git history at `ab48932` / `9a96b47` |
| `STRATEGIES.md` | bot difficulty × build chart + how to read arena reports |
| `REMI_NOTES.md` | per-round changelog Remi actually reads (newest on top) |
| `docs/` | **design + decision docs, all current**: `ROUND12.md` (the live work order — the round-12 batch as dictated, with the traps), `VERSIONING.md` (community-versions architecture: a version is a data patch, not a branch), `NAMING.md` + `CONTRIBUTING-LEGAL.md` (name/licence/contributor answers) |

## Game rules snapshot (v9, post-round-11)

- First to **15 kills**, 25-round cap. countdown → battle → roundEnd (banner,
  art reveal, itemized income) → shop (full roster w/ kits; Ready skips).
- **Lava**: 14 DPS, **×2 move speed** while in it (swimming is a real escape
  route now, round 10), no afterburn. Ring shrinks faster as fighters die;
  sudden death after overtime. 6 pillars sink as it shrinks. **Lava kill
  share now ~30%** (86% at launch → 68% after round 9 → 47% after round
  10's softer knockback + faster swimming → ~38% after round 11's regen lock
  and stacking sustain → **30.0% / 30.2%** measured 2026-08-07 at 60 and 1000
  games, after round 12's constant knockback and item levels). This is
  BALANCE.md open question #1 and it keeps drifting DOWN every round — Remi
  still hasn't ruled on it. The levers are one-line reverts: `KB_HP_FACTOR`,
  `PLAYER.KB_CONSTANT_MISSING`, `LAVA.SPEED_MULT`. Comeback rate over the same
  runs: 11.7% / 12.4%.
- **Knockback**: HP-scaled by % missing (`KB_HP_FACTOR 0.385`, −30% in round
  10), no size term (audited, regression-tested — big is only ever a
  disadvantage).
- **Economy (anti-snowball)**: 8 g/round + 2 g/kill + 2 g round win + 1 g
  first death; invariant `ROUND_BASE >= 3*PER_KILL + ROUND_WIN` caps 4p earn
  spread at 2× (test-enforced). Gap bounty max 3 g; the leader never
  collects one. `goldEarned` + `dmgDealt` tracked (DoT/lava credit rules
  below); standings show earnings, not wallet.
- **Spells**: fireball 41 u/s r0.8 dmg **7**/10/14 cd 2.1→1.6 (lv1 raised in
  round 11 — see the regen note below); lightning range 38 NO push (finisher);
  boomerang **out 52 (fireball-grade reach) and recallable — tapping the key
  mid-flight turns it round early**, returns to the LAUNCH POINT, catch =
  half cd, uncaught flies off forever, one hit per enemy per throw;
  teleport F, rush E, boomerang R (both presets); **pillar S** (placeable
  blocker, one each, 10–16 s).
- **Regen lock (round 11)**: taking damage throttles regen to 25% for 2.5 s.
  This exists because a lv1 fireball (2.38 dps if EVERY shot lands) lost to
  1.2 hp/s of passive regen, so round 1 was unkillable — median first death
  51.9 s vs ~20 s in round 3, now 31.3 s. Don't remove it without re-measuring
  that number.
- **Items have 3 LEVELS** (round 12, S4 — this line said "items STACK freely"
  until 2026-08-07 and that is now WRONG): hard cap 3, the same flat gold cost
  at every level, each level worth less than the last (`ITEM_FX` arrays are
  cumulative totals). Round 11's free stacking produced a 4-5-boots meta Remi
  didn't want. ⚠ Two measured consequences to carry forward: it **partly
  resurrected the gold-saturation artifact** (midas back to 0.0% on ~49 g of
  unspent gold — see the scars below) and it **broke the co-op campaign**
  (see the co-op section: the party is bots that shop 13 times).
- **Power tier, buyable from round 1** (round 12 dropped `minRound`; the gate is
  now that no bot build list contains one, enforced in `botShop`),
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
- **Elemental mode** ⚗️ (lobby toggle): **9 elements**, each 3 levels
  (10+8+8 g), **stackable** (frost+ember works); arcane 🔮 = global CDR, no
  fireball needed; venom drips ground trails (`state.hazards`) *and* poisons
  in **discrete 1/s ticks for 5 s that refresh+stack on re-hit**; terra
  size/level; **critical 💢** starts at 65% power and ramps dmg+push per
  fireball you LAND — **UNCAPPED** since Remi asked (the round reset is the
  only ceiling; uncapping moved the lab number only 21→24% because bots rarely
  pass 15 stacks, so this is a human-facing power fantasy, not a lab knob);
  **frost ❄️ is stack-based** (3rd stack
  detonates: slow / deeper slow / 2 s stun, and stacks are shared by ALL
  attackers); **mosquito 🦟 (new round 11)** turns your fireball into a
  1-damage double-rate sting that leaves a bite on a third of the victim's
  body — any OTHER spell landing on that arc hits double. **REWORKED in round
  12** (docs/ROUND12.md S3): mosquito measured 24.0%/34.6% (BALANCE.md:101) and
  was reported broken because the client **never drew the bites at all** — they
  were on the wire and rendered nowhere, so this was a rendering gap, not a
  numbers problem. (The 10.9–41.6% figure earlier handoffs attached to mosquito
  is the spread across ALL NINE elements, BALANCE.md:113.)
  ~~**The midas artifact is GONE**~~ — it came BACK with round 12's item cap
  (0.0% on ~49 g of unspent gold; see the scars). The ★ grunt tier is now a
  chaos control, not a balance signal. Classic wire format untouched by
  elemental fields.
- **Current 12-element standings** (`tools/arena.js --mode=elemental
  --games=1000`, ★★ berserker/bruiser, baseline 25%, 2026-08-07):
  venom 38.8 · vampire 38.7 · ember 35.8 · arcane 32.4 · terra 29.3 ·
  mosquito 28.9 · momentum 24.2 · gale 23.5 · chronos 21.0 · frost 19.4 ·
  ghost 8.3 · midas 0.0. **Read this as a ranking, not a strength meter** — the
  absolute-lab note in the scars explains why 25% is not the floor.
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
  - **★★★ enemies are the difficulty cliff.** The h2h ladder is real: a lone
    ★★ cannot beat a ★★★ at any HP. ★★★ units must be *cheap to kill*
    (Shade: 40 hp) or they are unloseable walls, not enemies.
  - **HP is a weak lever for berserkers, the whole fight for stalkers.** A
    berserker dies to the lava, so a Brute at 210 and at 546 clear the same;
    a stalker never swims, so it has to be burned down.
  - **Enemy lightning is a solo-killer** — hitscan, undodgeable. Removing it
    from one unit moved the solo clear rate 4% → 70%.
  - **Party scaling has to be superlinear** (`COUNT_PER_PLAYER` 1.2): a party
    only wipes when EVERYONE is down, so 3 players are far more than 3× as
    durable. Chaff scales at the default rate; real threats need
    `perPlayer ~0.5` or the level explodes.
  - The boss is a ★★ **berserker** with every upgrade, not a ★★★: a ★★★ with
    boots kites forever (measured 0% clear at every party size).
  - **Friendly fire helps the WAVE's victims, i.e. the party.** Monsters are
    numerous and clustered, so they shred each other and shove each other into
    the lava far more than a 1-3 player party does. Turning FF on made the
    campaign *easier* (level 8: 57→93% clear) and flattened the curve. Levels
    4-10 were retuned for it.
  - **A wave that grows only in COUNT gets weaker as the party grows** under
    FF — 18 imps clear 100% at every size because they kill each other. Real
    packs now scale `both` (count AND hp); real threats are hand-counted per
    party size (`minParty` + `scale: 'none'`).
  - **Staggering arrivals makes a level EASIER, not harder** (measured
    repeatedly, opposite of the intuition): a trickle gets fought one at a time
    and never surrounds anyone. Late `at` times are a *softening* lever.
  - **Chaff (imps, cultists) is a dead lever past level 5** — no configuration
    of it threatens a geared party. It stays as flavour and gold income.
- Difficulty axis is verified, not assumed: ★ grunt party fails from level 4
  on (0-6%), ★★ berserker rides the intended curve, ★★★ stalker clears 99-100%.
  - **A LEVEL CAP ON ITEMS IS A CAMPAIGN NERF** (2026-08-07, the scar of this
    round). The party is bots that shop up to 13 times, so under the old
    uncapped stacking they reached level 9 carrying 8-13 copies of every item;
    every enemy is a fixed template owning ONE copy. Capping items at 3 levels
    took the party's late power and left the monsters untouched: L9 44→22%,
    L10 38→23%, full campaign 55/79/55 → **11/10/4%**. Nobody re-measured co-op
    when round 12 shipped the cap. **Any global change to items, gold or
    knockback re-prices the whole back half of the campaign — re-run
    `tools/coop.js --levels` in the same commit.**
  - **Hounds are the fine grain, Shades are the coarse one.** One Shade is worth
    ~30-45 clear points; one hound ~10. If a level is 15 points off, add hounds.
- **Current curve** (★★ Hard berserker/bruiser, 200 attempts/cell, seed 7,
  `tools/coop.js --levels`): L1-3 100% at every size, then 1p/2p/3p —
  L4 94/94/97, L5 98/96/91, L6 91/97/97, L7 69/75/73, L8 68/66/57,
  L9 39/46/44, L10 30/42/32. Non-increasing at every party size.
  Full campaign with retries inside the 13-round budget (200 runs/size):
  **37.0 / 55.5 / 41.0%**, 12.5-12.8 rounds/run.
  ⚠ Two open pacing notes, both measured, neither acted on: **the 13-round
  budget is now the binding constraint** (runs average 12.7 rounds and only
  ~72% of runs ever reach level 10), and **L4-L6 sit at 91-98%**, a few points
  above where they were before round 12's constant knockback. `COOP_MAX_ROUNDS`
  is the one-line lever for the first; the second wants L5/L6 retuned, not a
  global revert.

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
- **Final standings wait for everyone** (round 11): `case 'again'` no longer
  resets the lobby on the first click — every connected human must acknowledge,
  with a 45 s `AGAIN_GRACE_MS` fallback so one AFK player can't hold the lobby
  hostage. `againReady` is on the wire. This was the "the scores vanish before
  I can read them" report: one player's click used to wipe the table for all.
- After pulling: **restart the server** and hard-refresh clients.

## Verification ritual (run before claiming anything works)

```bash
npx vitest run                                   # 196 green
node test/harness/run.js test/harness/scenarios/bots.js
PLAY_MS=30000 node test/client-robustness.js     # chromium + webkit
node tools/reconnect-test.js                     # progress survives a drop
node tools/arena.js --games=60 --players=4       # games finish, sane kills
```
Kill stray servers when done (`pgrep -fl "server/index.js"`) — they've
bitten us three times now, including robustness-test leftovers. **But check
first that Remi isn't hosting a live game**: a blind `pkill` on that pattern
takes his session down with it.

## Known debt / next candidates (rough priority)

0. **START HERE: a playtest happened on 2026-08-06 and its feedback has NOT
   been collected.** Remi was mid-session when work stopped ("we're playing,
   don't do anything that breaks the game now"). Ask him how round 11 felt
   before touching numbers — especially the things the lab cannot judge:
   mosquito's bite combo, uncapped critical, the reworked boomerang recall,
   frost's 3-stack detonation, and whether co-op friendly fire is fun or
   infuriating. **His feel report outranks every table in BALANCE.md.**
1. **Human playtest verdicts pending** (BALANCE.md's open questions):
   **lava kill share is now ~30% and still falling** — is that the game
   Remi wants? (one-line reverts: `KB_HP_FACTOR`, `KB_CONSTANT_MISSING`,
   `LAVA.SPEED_MULT`); regen —
   the round-11 regen lock partly answered this, is it enough?; boomer at
   54–62%; the whole power tier incl. repulse combos + visible hook; critical,
   mosquito and midas in human hands.
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
5. **Co-op polish left on the table**: enemy HP bars still render green like
   allies (monsters are distinguishable by a blood-red dot + monster emoji, but
   a red bar would be better — one line in `client/render.js`); the level-8 3p
   fight averages ~100 s, the one pacing outlier; `waveUnits` has no per-wave
   `hp` override, which is why tuning is lumpy (between 3 and 4 Shades there is
   nothing).
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
- **Before believing a "bot artifact" explanation, check whether you can
  DELETE the artifact.** Midas measured ~1% for months and three reports
  called it a measurement artifact (gold-saturated bots can't spend). Making
  items stackable gave gold somewhere to go and it instantly measured 43-64% —
  the artifact was real, the excuse was hiding a genuinely strong element, and
  Remi's human read had been right the whole time. (Round 12's item cap brought
  the artifact back: midas is 0.0% again on 49 g of unspent gold. It was
  attacked from three sides in 2026-08-07 — longer bot build orders, scarcer
  gold, both — and climbs monotonically to 17-19% as gold starts to matter, so
  the 0.0% is still a floor and midas's numbers were again left alone. The
  sweep is in `shared/constants.js` next to `midas`.)
- **The mixed elemental table is a RANKING, not a strength meter, and its
  25% baseline is not the floor.** The absolute lab (1 element seat vs 3 seats
  with NO element, `runElementalStudy`'s cousin) says an element whose fx is
  literally `{}` — but which still pays its 26 g — scores **2.7%**, not 25%.
  Frost at 17% in the mixed table wins 37-40% in that lab against 20% for the
  no-element seats; ghost at 8% wins 18-20% against a 2.7% floor. Before
  buffing anything for being "below baseline", check what it scores against
  nothing. The whole ladder is in `constants.js` next to `frost` and `ghost`.
- **A study cannot see a variable its design cannot express.** Round 12's
  private-frost-stacks change is invisible to the standard elemental study,
  because that study deals every seat a different element and one attacker's
  private counter IS the shared counter — verified 2026-08-07 by running the
  shipped sim and a shared-stacks patched copy side by side: byte-identical at
  1 frost seat, 2.4-3.9 points apart at 2 seats. Build the lab that can express
  the variable; a "no change" from the wrong lab is not evidence.
- **A correct mechanic with imperceptible numbers is a bug in practice.**
  Critical ramped exactly as designed and Remi still reported it broken,
  because +0.45 dmg/hit is invisible. If a player says a feature doesn't work,
  check the magnitude and the feedback before checking the logic.
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
