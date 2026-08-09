# 2026-08-09 — browser hosting phase B shipped: host from a tab, friends join by link

*Working record for docs/BRIEF-browser-hosting.md §B. Follows
2026-08-09-browser-hosting-phaseA.md (the seam this builds on). B1–B3 are
built and verified end-to-end; B4 (host migration) did NOT ship, but every
blocker recorded by phase A is now cleared — exact status below.*

Remi's rulings this morning, honored here: **the B0 gate is waived** ("the
player needs to keep the browser up front, that's a limitation of our game and
the price to pay") — the limitation is surfaced permanently in the host UI
instead (`#hostbar`: "You are the server — keep this tab open"); and the goal
is the final form: share the game, people host their own games.

## What shipped, in one line

On the static page (GitHub Pages), a player clicks **📡 Host online**, gets a
5-char room code and an invite link (`…/client/#r=CODE`); friends open the
link and land in the host's lobby over WebRTC — the host's tab runs the same
engine the Node server runs, and the only server involved is a tiny
signalling relay used for a few seconds while each guest joins.

## The pieces (one commit each)

1. **rng cursor** (`shared/sim.js`): `rng(state)` now advances a plain field
   `game.rngA` (identical mulberry32 stream — all 281 pre-existing tests
   unchanged) instead of a closure. `engine.serialize()` → restore now replays
   **step-for-step identically**, test-locked in `test/engine.test.js`
   (20 s of 4-seat bot combat, blob-compared every 2 s). This was phase A's
   documented B4 blocker; it is gone.
2. **`shared/snapdelta.js`**: delta snapshots for the snap channel. Wire:
   `{t:'snap', q, f}` keyframe / `{t:'snap', q, b, d}` delta against message
   `b`. The channel is unreliable+unordered BY DESIGN, so the framing survives
   both: stale (q ≤ applied) drops, a lost base makes the decoder demand a
   keyframe over ctrl. Keyframes go out on join, phase change, gap, and every
   30 snaps (~2 s) as belt-and-braces. Test-locked over a real engine round,
   including 14% loss + reordering (`test/snapdelta.test.js`).
3. **`server/signal.js`** (~100 lines, no game logic): ws rendezvous.
   `create[+code]` → `room{code}`, `join{code}` → `ok`/`peer`, `sig{to,data}`
   relayed verbatim (data never parsed), `gone`/`hostgone` on departures,
   rooms idle-expire after 10 min, codes are 5 chars from
   `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O 1/l/I). A LIVE code can't be
   stolen; a dead one can be re-registered (host re-dials after a relay
   restart; B4 migration will reuse this). `npm run signal`; `npm start` and
   `npm run host` are untouched — the relay is optional and separate.
4. **`RtcTransport` + flows** (`client/transport.js`, `client/main.js`,
   `client/index.html`): host side = the solo in-tab engine (same worker
   clock) + per-guest `ctrl` (reliable/ordered: join/welcome/denied, inputs,
   events, hot spare) and `snap` (`{ordered:false, maxRetransmits:0}`: delta
   snapshots) channels; guest side = same 4-method transport interface as
   ws/solo. Selection rule gained its promised first case: `#r=CODE` → rtc.
   STUN only (Google + Cloudflare), **no TURN** (per the brief; adding it
   later is a config array change). ICE dead-ends surface as plain language
   after 20 s, not a hang.

## Where the signalling URL comes from (Remi decides deployment)

`client/transport.js` resolution order: `?signal=ws://…` in the URL (tests /
one-offs) → the `SIGNAL_URL` constant (empty today — **set it once a relay is
deployed**) → `ws(s)://<page-host>:3001` (local dev: `npm run signal`).

Deployment options, Remi's call — deliberately NOT picked in code:
- **A $0-4/mo VPS or free-tier PaaS** (fly.io, render): `node server/signal.js`,
  put the wss URL in `SIGNAL_URL`. Simplest, and the process is so small it
  never needs attention; a restart mid-match is invisible (hosts re-register).
- **Cloudflare Worker + Durable Object**: the room Map maps 1:1 onto a DO;
  the protocol was kept to 6 message types so the port is an afternoon.
- **Remi's Mac + cloudflared** (like `npm run host`): works, but the quick
  tunnel URL changes per restart, which fights the "set a constant once" model.

## B4 host migration — NOT shipped; exact status

Everything the protocol needs is already in place and test-locked:
- deterministic `serialize()`/restore (piece 1),
- the **hot spare**: the host broadcasts `{t:'spare', code, state}` on ctrl
  every 2 s; guests hold the latest (`window.__spare`, asserted in the e2e),
- same-code re-registration at the relay (signal.test.js locks it),
- guests already redial through the relay on any drop.

What is missing is client orchestration, and it is honest work, not a tweak:
1. **Election**: survivors pick the lowest guest conn id from the last
   snapshot's players — deterministic, but needs a timeout fallback for "the
   elected heir died with the host".
2. **Seat identity remap**: the heir's own seat in the restored game is its
   old guest id, while `createRtcHostTransport` seats the local player as
   `p1`; the transport needs a `localId` override.
3. **Orphan re-seating**: `serialize()` carries seated players, not the
   engine's ghost stash; the heir must convert every other non-bot seat into
   a name-keyed ghost so rejoining guests restore their progress (new engine
   surface + tests), and its conn-id counter must not collide with seats.
4. A mid-session guest→host transport swap in main.js, plus a 3-context
   playwright e2e that closes the host tab mid-round.

Estimate: a focused session. Until then: the host closing the tab ends the
game — the hostbar says exactly that, and guests get "the host closed their
tab — the room is gone" and land back on the join screen.

## B5 — what is genuinely lost vs the Node server, and what was done about it

- **JSONL journal / crash dumps**: a tab has no filesystem. The engine's
  `onLog` stream is buffered in memory (capped at 20k entries, oldest 5k
  dropped at the cap) and leaves through the hostbar's **⬇ log** button as
  a .jsonl download. Not silent, but also not crash-proof: a tab that dies
  takes the buffer with it (the Node path's crash dump has no equivalent).
- **IP bans**: WebRTC exposes no usable peer IP. Name-bans and kick work
  unchanged (they live in the engine); `externalBans` is simply never fed.
  Acceptable for private lobbies among friends.
- **Per-player RTT badges**: the ws adapter measures RTT on real sockets;
  nothing feeds `engine.setPing()` on the RTC path, so no ms badge (absent,
  not zero — same as solo). A datachannel ping stream would be ~30 lines if
  Remi misses it.
- **`/health` + the zombie reaper**: no processes to reap. RTC connection
  state changes replace the heartbeat (failed/closed → the seat is freed and
  ghost-stashed exactly like a ws drop).
- **Reconnect ghosts are KEPT**: the stash lives in the engine, so a guest
  who drops and rejoins with the same name within 10 min gets their kit back
  — same rule as the Node server.
- **The host can cheat** (authoritative tab). True and accepted for friends
  lobbies; not hidden.
- **Host tab must stay open AND foreground-ish**: the waived B0. The worker
  clock held 30 Hz backgrounded on Chrome (phase A record); Safari numbers
  remain unmeasured. The hostbar states the rule plainly.

## Decisions worth remembering

- **Events ride ctrl, snapshots ride snap**: the ws wire loses neither, so a
  "lossy" port had to choose — a lost death event is a lost kill cue forever,
  while a lost snapshot is obsolete 66 ms later. Guests buffer events and
  attach them to the next accepted snapshot (≤ 1 snap interval of delay).
- **Guest conn ids are the host's own counter (`r1…`), never the relay's ids**:
  relay restarts reset its `g` counter, and reusing those would collide seats.
- **`perMessageDeflate` on the Node ws server** (brief §B3 aside): NOT done —
  the mission pinned `npm start` byte-identical and Remi is playtesting from
  main today. It is still the documented one-line, ~5× win when wanted.
- Headless-chromium WebRTC needs `--disable-features=WebRtcHideLocalIpsWithMdns`
  (no mDNS responder in headless → the obfuscated candidates never resolve);
  no fake-media flags — RTCDataChannel needs none.

## Verification record (all green 2026-08-09, this branch)

1. `npx vitest run` — **294 passed** (281 pre-existing + 1 rng determinism +
   6 snapdelta + 6 signal).
2. `node test/harness/run.js …/bots.js` → `PASS — bots (seed 21)`;
   `…/coop.js` → `PASS — coop (seed 31)`.
3. `PLAY_MS=30000 node test/client-robustness.js` → chromium PASS, webkit
   PASS (ws path incl. kill-server reconnect).
4. `node tools/reconnect-test.js` → `ALL OK`.
5. `node test/integration.js 4590` (against a fresh adapter) → `INTEGRATION OK`.
6. `node test/solo-static.js` → `SOLO STATIC OK` on chromium AND
   `ENGINE=webkit`.
7. `node tools/arena.js --games=60 --players=4` → sane (lava share 19.7%).
8. **New** `node test/rtc-host.js` (ran twice, stable): static subpath page +
   relay child; host context clicks Host online (hostbar shows the keep-open
   notice + code), guest context opens `#r=CODE`, joins over WebRTC, both
   ready + a berserker bot, battle runs on both ends, **relay SIGKILLed
   mid-battle** → guest snapshots kept flowing (121→247), round resolved to
   shop, hot spare verified on the guest (incl. `rngA`).
