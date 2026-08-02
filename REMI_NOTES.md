# Notes for Remi — OpenWarlock & the open web MOBA

*Written 2026-08-01 by Claude, working autonomously. Everything below is either
a decision I made (and you may want to change) or an answer to the questions
you asked before leaving.*

---

## ROUND 4 — kills win, size-by-lead, spectating, and the balance lab

- **Win condition**: first to **15 kills** (`ROUND.KILLS_TO_WIN`), checked at
  round end; 25-round safety cap. Score is gone — kills are the leaderboard,
  crown on the leader, "first to 15 kills" always visible. Typical 4-player
  games: 8–11 rounds.
- **Size-by-lead**: `radius × clamp(1 + 0.08·(kills − avg), 0.5, 2.0)`, live
  (hitbox AND visual). Tune in `PLAYER.SIZE_LEAD`. My 0.08/kill is a guess —
  experiment #4 in BALANCE.md measures whether it actually produces comebacks.
- **Spectator mode**: "Playing ⚔ / Watching 👁" toggle in the lobby. Bots-only
  games with you watching are first-class (your "I want to see the bots play"
  mode). Needs ≥2 fighters; bots count.
- **Balance lab**: `tools/arena.js` — strategy = bot profile × build scheme,
  Elo from pairwise placements, fully seeded. 4,500 games ran in ~100 s.
  **Read `BALANCE.md`** for the full report. Headlines: skill (dodging,
  aim-leading) dominates items by a huge margin; within equal skill, damage+HP
  builds (Fireball ups + Amulet + Sword; or Shield/Amulet/Ring turtle) crush
  mobility-first builds; items still matter 4× within a tier. Caveat: bots
  undervalue utility spells — don't nerf Teleport on this data alone.
- Earlier in this round (already reported): round-end VICTORY/DEFEAT banner
  with gold earned, shop Ready button that skips the wait, three bot tiers
  (Grunt ★ / Berserker ★★ / Stalker ★★★ — the stalker dodges, leads shots,
  and teleport-saves), synthesized sound effects + mute, no more lobby shop,
  bigger hitboxes, faster infinite-range fireballs, less damage / more push.

Your reaction-time framework idea (map dodge windows: projectile speed ×
hitbox × distance vs ~150 ms human reaction) is noted as the right way to do
the next projectile-feel pass — the arena can compute exactly which shots are
dodgeable at what range. Soundtrack: waiting on your files; SFX are
placeholder-quality synth, easy to swap.

---

## ROUND 3 — OpenWarlock on GitHub + your five requests

- **Repo**: pushed to `github.com/RemiFabre/OpenWarlock` as ~20 short commits
  (the remote was empty — your snippet hadn't been run — so I recreated the
  history from "first commit" up). Local folder renamed to `~/OpenWarlock`.
- **Rebindable keys**: ⌨ Keys panel on the join screen and in the lobby.
  Click a binding, press a key; conflicts swap; Esc cancels; QWERTY and
  AZERTY presets; stored in localStorage; every key label in the UI updates.
- **Speed**: base move speed 14 → **11**; Boots (+20%) ≈ the old speed, as you
  asked. Friction 4 → 3.4 so knockback slides further.
- **Knockback +~35% across the board** (Fireball 30/35/40, Boomerang 24,
  Rush 38, Lightning 14). Combined with slower movement, positioning and lava
  throws matter much more now. All numbers in `shared/constants.js`.
- **Avatars**: pick one of 12 emoji on the join screen; drawn on your colored
  circle in-game, shown in lobby/scoreboard/standings. Bots got monster faces.
  (Proper sprites/skins are a v2 art question — emoji was the zero-asset way.)
- **Informative shop**: every spell shows dmg/kb/cd/range; owning a spell
  shows the upgrade as explicit deltas ("lv 1→2 · dmg 10→13 · kb 30→35").
- **Clear game end**: games are a **fixed 10 rounds** (your preference — every
  game reaches late-game builds), highest score wins, ties break on kills.
  The HUD shows "round 3 / 10" at all times and the lobby states the format.

Verified after all changes: 40 unit tests, chaos + duel scenarios, visual
test, client robustness in Chromium + WebKit.

---

## ROUND 2 (same day, after your first playtest)

You asked for: the freeze investigated, an AI-playable test harness, substantial
robustness work via subagents, and a better round-1 economy. All done.

### The freeze — what I found

I could **not reproduce it server-side**, and I tried hard: your exact setup
(1 human + 3 bots) scripted for 9 minutes with 24 deaths, ~70 fuzzed matches,
real Chromium *and* WebKit sessions with forced kills — the sim and server never
stalled. But the hunt found the most likely culprit in the client: the render
loop had **no exception containment** — a single thrown error inside a frame
(canvas gradient calls throw on non-finite coordinates, which a death +
interpolation edge can produce) killed `requestAnimationFrame` forever. Perfect
symptom match: game visually freezes, no error shown, server keeps running.

That class of bug is now structurally impossible:
- The frame loop catches per-frame exceptions, **reports them in a visible red
  banner**, and always reschedules itself.
- All rendering/UI code is defensive against missing players, NaN coordinates,
  malformed snapshots.
- A dropped connection shows a persistent "reconnecting…" banner and
  auto-rejoins every 2 s (before, it flashed a 1.8 s toast and sat on stale
  state — the other prime "freeze" suspect).

So: if it EVER "freezes" again, you will see a red banner with the exact error.
Copy it to me and it's a 5-minute fix instead of a ghost hunt.

### The AI test harness (your scripting-language idea — built)

Exactly what you described, three layers:

1. **Scenario language** — matches are data. Players are scripted with commands
   like `ready`, `hunt 20`, `cast fireball at nearest`, `buy boots`, `spam 50`
   (malformed packets), `disconnect`/`reconnect`, `auto 120` (full autopilot).
   `node test/harness/run.js test/harness/scenarios/duel.js`
2. **Journaling server** — with `JOURNAL=file`, the server logs every input,
   game event, phase change, per-second state digest, and crash dump (JSONL).
3. **Invariant checker** — replays a journal and verifies game law: no tick
   stalls, finite positions, HP/gold bounds, legal phase transitions, rounds
   end exactly when ≤1 stands, cooldowns respected.
   Plus a **fuzzer**: `node test/harness/fuzz.js 20` generates seeded random
   adversarial matches; failures save scenario + journal for exact replay.

### What the harness caught on day one (all fixed)

1. **`buy "constructor"` crashed the server** — prototype-chain lookup in the
   shop; any player could kill the whole game with one packet.
2. **`GET /%` crashed the server** — `decodeURIComponent` throwing on a
   malformed URL took down the process (this one could genuinely have been
   your freeze if anything on your network probed the port).
3. **Pacifist stalemate** — the arena floor held at radius 10 forever, so a
   round could literally never end if the last players refused to fight (two
   scripted cowards proved it: 400+ seconds, zero deaths). Fixed with **sudden
   death**: after 45 s of overtime the arena shrinks to *zero* over 30 s.
   Every round now provably ends — there's a unit test asserting it.
4. **Instant anticlimax round** — someone who disconnected during the
   countdown and rejoined was seated as dead, so the round started with one
   fighter and ended in 0.03 s. New rule: joining during the countdown seats
   you straight into the starting round; only mid-battle joins wait.
5. Several harness/infra bugs (watchdog false positives, lost crash dumps,
   journal event ordering).

Test suite now: **39 unit tests**, 4 scripted scenarios (duel, chaos,
mechanics, remi-freeze), a 2-engine browser robustness test (Chromium +
WebKit: 95 s of play, server SIGKILL mid-battle, reconnect), fuzz batches —
30 consecutive clean fuzzed matches after the fixes.

### Economy change you asked for

Starting gold **8 → 12**, tier-1 prices flattened (Lightning/Boomerang 10,
Teleport/Shield/Rush 12). Round 1 now opens with real choices: any second
spell, an item (Boots 10 / Treads 10 / Ring 10 / Amulet 12 / Cape 12), or
Fireball lv2 + 6 saved. Kept lobby shopping enabled.

### Still worth discussing

- Sudden-death timings (45 s grace + 30 s collapse) are my guess — tune in
  `shared/constants.js` → `ARENA`.
- Reconnecting mid-game gives you a fresh identity (you lose your gold/score).
  Persistent identity across reconnects (a token in localStorage) is the next
  robustness step if that annoys you.
- Bots still don't dodge; they're food. Say the word and I'll give them
  projectile evasion.

## TL;DR

- **A playable Warlock remake exists in `~/warlock-web`.** `npm start` to play
  locally (add bots from the lobby), `npm run host` to get a public URL your
  friends anywhere can open. Verified end-to-end: unit tests, two real
  WebSocket clients playing a round over the actual server, headless-browser
  screenshots, and an HTTP+WebSocket check through a real Cloudflare tunnel.
- **Your MOBA idea is technically sound.** Browser tech is not the bottleneck;
  netcode discipline and community/legal hygiene are the two things to get
  right from day one. Details below.

---

## Part 1 — Your technical questions about the open web MOBA

### Is a web-based MOBA feasible?

Yes, comfortably. A MOBA is close to a best case for the browser:

- **Rendering**: 10 champions + ~60 minions + projectiles is trivial for
  WebGL/WebGPU (PixiJS, Three.js, or plain canvas for a 2D art style). LoL
  itself is not graphically demanding; the browser can do that fidelity.
- **Simulation**: a MOBA tick is small — dozens of units, simple physics,
  no rigid-body stacking. A single JS process handles this at 30 Hz with ease
  (our Warlock sim steps a full 4-player game thousands of times per second
  in the test suite).
- **Input latency**: MOBAs are click-to-move with cast points and travel
  times, which is *far* more latency-tolerant than a shooter. 60–120 ms feels
  fine, which is what you'll get browser→host over WebSocket.
- **Distribution is the superpower**: "click a link, you're in the game" is
  something Riot cannot offer. For a community-modded game it also means
  every fork/house-rule server is equally frictionless to try.

The genuinely hard parts are not web-specific: pathfinding quality (crowd
flow, unit avoidance), fog of war done server-side (see cheating, below),
balance, and art volume. Those are person-years of design work, not
technology risk. That's exactly why starting with Warlock was the right call:
it shares the netcode DNA (authoritative server, projectiles, knockback,
economy) with ~1% of the content surface.

### Player-hosted servers, no central infrastructure — does it work?

Yes, with eyes open about the trade-offs:

- **The host is authoritative** (what I built): the host's machine decides
  every hit. This kills client-side cheating (aimbots aside) for everyone
  *except the host*, who can in principle run a modified server. In friendly/
  community play that's fine — same trust model as a WC3 host or a Minecraft
  server. Competitive integrity beyond that needs trusted community servers,
  not P2P tricks.
- **NAT is the real enemy** of "host at home". I solved it with tunnels
  (Cloudflare quick tunnel → free `https://…trycloudflare.com` URL, zero
  config, WebSockets pass through; localtunnel as fallback). It adds one
  relay hop (~10–50 ms). Alternatives worth knowing: Tailscale (great with
  friends, needs install), port forwarding (best latency, most hassle),
  WebRTC with ICE/STUN (true P2P, punches most NATs, but needs a public
  signaling server *somewhere* and much more code).
- **Host advantage**: the host plays at 0 ms ping. In Warlock-class games
  nobody will care; in a serious MOBA ladder it matters — the eventual answer
  is community-run dedicated servers (a $5 VPS runs this fine), which the
  same codebase already supports since the server is just `node server/index.js`.
- **Fog of war caveat for the MOBA**: an authoritative server must send each
  client only what it can see, otherwise map-hack cheats are trivial.
  Per-client interest filtering has to be in the snapshot layer from early on.
  (Warlock has no fog, so our snapshots are global — fine here.)

### WebSocket vs WebRTC

I used WebSocket (TCP). Rationale: 10× simpler, works through tunnels and
proxies, and for a 10-player arena the head-of-line-blocking risk only shows
up on lossy Wi-Fi. The client hides jitter by rendering ~130 ms in the past
and interpolating. For the MOBA I'd still *start* WebSocket and add WebRTC
unreliable datagrams (or WebTransport) later as an optimization — the
architecture (inputs up, snapshots down) doesn't change.

### Copyright — how close can "heavily inspired by LoL" be?

Game *rules and mechanics are not copyrightable* — last-hitting, three lanes,
towers, items, cooldowns, a shrinking arena: all free to reimplement. What
you must not copy:

- **Expression**: champion names, splash/skill art, models, sounds, voice
  lines, item names *as a set*, map art, lore text. (Riot sued Moonton over
  Mobile Legends and won a lot of money — that case was about copied names,
  icons, and marketing art, not about the genre.)
- **Trademarks**: don't put "League of Legends" in your name or marketing
  ("a LoL clone!") beyond factual comparison.
- **A near-1:1 stat clone** of a specific champion kit with a soundalike name
  is where "inspired" drifts into trouble. Change names, art, numbers, and
  flavor; keep the *feel*.

Warlock itself is a game concept from a community map; I reimplemented rules
from scratch with my own numbers, original text, no WC3 assets, and credited
the inspiration in the README. That's the pattern I'd keep for the MOBA
(think: how Dota→LoL→HoN→Smite all share mechanics legally).

One more thing for an open project: pick licenses early — **code under MIT or
AGPL** (AGPL forces server-side forks to stay open, worth considering given
your "anyone hosts, rules stay open" philosophy) and **art/design under
CC-BY-SA** so skins/champions contributed by the community stay remixable.
Require DCO or CLA-lite sign-off so you can never be held hostage by a
contributor later.

### Minion collision & elevation — your design instincts

I agree with both, and they're conveniently also *cheaper* to implement:

- **Minion collision**: soft collision (units can push through each other
  slowly, RTS-crowd style) or none at all removes LoL's most frustrating
  "stuck on my own wave" deaths, AND it makes server pathfinding nearly
  trivial. Dota-style turn rates + hard collision is a whole pathfinding
  research project; skip it. In Warlock Web, warlocks have **no body-block
  collision** — only physics knockback — and it feels right.
- **Elevation**: LoL's elevation is almost purely visual plus a vision rule.
  You can keep the *strategic* part (high ground grants vision, maybe
  accuracy) on a completely flat simulation plane — elevation becomes a
  property of a tile, not 3D geometry. Counterintuitive stacked-cliff visuals
  gone, one less source of "why did my skillshot do that".

### "AI agents improving the game" — how to make that real

This shaped several code decisions in Warlock Web, and I'd triple down for
the MOBA:

- **All balance numbers in one plain data file** (`shared/constants.js`).
  An agent (or a human) can change a cooldown without touching logic.
- **Pure, deterministic simulation** with no I/O and a seeded RNG
  (`shared/sim.js`) — agents can run thousands of headless games to test a
  balance change and report win-rate deltas. The test suite already plays
  full bot games; that's the seed of an automated balance pipeline.
- **Tests as the contract**: 29 unit tests + an integration test that plays a
  real game over a real socket. Agents can refactor confidently; CI catches
  regressions the way a human reviewer never would.
- For the MOBA: champions/spells as *data + small scripts* (the WC3/Dota
  lesson — Dota existed because WC3 made rules moddable). If a champion is a
  JSON file plus a handful of behavior functions, community members and their
  agents can PR new champions, and "house rules" become a diff you can share.

### House rules / skins / custom champions distribution

Since the host's server is authoritative, **the host's rule-set simply *is*
the game** — that's your "push your rules, people choose to play them" model
with zero extra infrastructure: fork, edit constants, `npm run host`, share
URL. Skins are client-side only and could be a URL parameter. Later, a tiny
"rules manifest" (JSON hash shown in the lobby) lets players see exactly
what mods a host is running before they ready up.

---

## Part 2 — What I built and the calls I made

### What exists (all verified)

- Full game loop: lobby (ready-up, bots) → countdown → battle → shop →
  … → game over → back to lobby. Score 10 (or 15 rounds) ends the game.
- Physics knockback, shrinking lava ring (75 s to minimum), afterburn,
  lava-kill credit to the last hitter within 5 s.
- 6 spells (Fireball, Lightning, Boomerang, Teleport, Shield/reflect, Rush)
  with levels, 6 passive items, gold economy (4/kill, 3/round, 3/round-win,
  1 consolation for first death).
- Server-side bots that fight (aim with target-leading + error) and spend
  gold in the shop — so you can play alone tonight.
- Canvas client: animated lava, molten rim, interpolated movement, damage
  numbers, spell bar with cooldowns, scoreboard, shop UI, spectate-on-death.
- `npm run host` → working public URL (tested through a real tunnel,
  including the WebSocket path).

### Decisions you might want to revisit (my honest list)

1. **Numbers are mine, not the original's.** The original Warlock's exact
   stats aren't published anywhere I could find (warlockbrawl.com's handbook
   is an index without values), so I designed my own around "fireball TTK
   ≈ 7–10 hits, lava is the real killer". Balance is *untested against
   humans*. Everything is in `shared/constants.js` — tune freely.
2. **No client-side prediction.** Your own movement reacts after one RTT
   (~30–100 ms). For this genre I judged it acceptable (WC3 was the same or
   worse). If it bothers you in play, the fix is predicting *only your own
   warlock's* movement locally — a contained change, sim is already shared.
3. **JSON snapshots, full state, 15 Hz.** ~2–6 KB/snap for 4 players. Fine
   for ≤10 players; a binary delta protocol would be v2 polish, not needed now.
4. **One game per server process.** Warlock-style: the URL *is* the room.
   Multiple rooms per process would be easy to add but complicates the UX
   promise ("this link is my game").
5. **Shopping is allowed in the lobby** with your 8 starting gold (design doc
   said "after round 1"; I kept lobby shopping because it's fun to open with
   a plan). May be a balance mistake — first-round Fireball lv2 is strong.
6. **Knockback model**: impulse + exponential friction, and knockback doesn't
   interrupt your move order. Original Warlock feels more "icy". If it feels
   too controllable, lower `PLAYER.FRICTION` (4 → 2.5) for more slide.
7. **Shield reflects toward the projectile's reverse direction** (not toward
   the original caster), and doesn't reflect Lightning (hitscan) — it just
   blocks it. Simpler; arguably less spectacular.
8. **Host advantage accepted** (0-ping host). See Part 1.
9. **Bots are simple** (kite-less fireball spam with aim error). Good enough
   to test and warm a lobby, not a challenge for you.
10. **No sound.** Biggest missing juice item, plain scope cut.

### Known rough edges

- Late joiners during a running game sit dead until the next round starts —
  intended, but there's no "you'll play next round" message yet.
- If the host laptop sleeps, the game freezes for everyone (obviously).
- Mobile: renders, but there are no touch controls — desktop only for now.
- The trycloudflare URL changes every time you restart `npm run host`.

### Suggested next steps (in the order I'd do them)

1. Play a real game with friends; tune `constants.js` from actual feel.
2. Sound effects (even 5 retro bleeps transform game feel).
3. Own-movement client prediction if latency annoys you.
4. Wind Walk + one AoE spell (Meteor) — the two most-missed archetypes from
   the original roster.
5. Obstacles/arena variants, then team mode.
6. Then have the "is this the seed of the MOBA or a separate repo?" talk.

### How the verification was done (evidence, not vibes)

- `npm test` — 29 sim tests, including a scripted full bot game to game-over.
- `npm run test:e2e` — real server + 2 WebSocket clients: join, ready,
  countdown, battle, damage, kill credit, exact expected gold (18), shop
  purchase, disconnect handling. Passes.
- `npm run test:visual` — headless Chromium drives the actual UI (join click,
  lobby buy, ready, casts) and fails on any page error. Screenshots reviewed.
- Public-internet path: started `npm run host`, fetched the page over the
  `trycloudflare.com` URL (HTTP 200) and completed a WebSocket join through
  it ("joined as c1").
- One real bug was found *by* the integration test and fixed: point-blank
  fireballs spawned past their target and never hit; projectiles now spawn at
  the caster and use swept-segment collision (test `git log` for the story).
