# 2026-08-09 — browser hosting phase A shipped; phase B status

*Working record for docs/BRIEF-browser-hosting.md. Phase A (play from a static
link, solo vs bots, no server) is built and verified. Phase B (host for friends
over WebRTC) was NOT started: its B0 gate needs desktop Safari numbers this
environment cannot produce — everything learned for B is recorded below.*

## What phase A is, in one line

Serve the repo as static files (GitHub Pages), open `index.html` → it forwards
to `client/` → the client probes `/health`, finds no game server, and runs a
full authoritative game room **inside the tab** (solo + lobby bots) through the
same code the Node server uses.

## What changed (one commit each)

1. **`shared/engine.js` extracted from `server/index.js`** — the
   transport-agnostic room: seating, the whole wire switch, ghost/reconnect
   stash, name-bans, kick, autostart, again/lobby-reset grace timers,
   per-viewer snapshots, ping blob, `serialize()`. The engine knows connection
   ids and names, never sockets/IPs/files/the loop clock. `server/index.js` is
   now an adapter (http, ws + both ping streams, journal, crash dumps, IP
   bans) — same wire protocol, provably zero behavior change (all suites below
   green at that commit).
2. **`client/transport.js`** — `{connect, send, onMessage, onClose}` with a
   ws transport (old code verbatim) and a solo transport (engine in the tab,
   `structuredClone` across the seam, worker-driven 30/15 Hz clocks).
   Selection: `?mode=solo|server` wins, else 1 s `/health` probe.
3. **Subpath-proofing** — `client/index.html` loads `./main.js`; `music.js`
   resolves all assets against `import.meta.url`'s repo root; manifest paths
   are root-relative; root `index.html` forwards static hosts into `client/`;
   the Node server 302s `/` → `/client/` (query preserved).
4. **New gates** — `test/engine.test.js` (headless room: join → bots →
   autostart → shop buy → gameover; serialize round-trip; kick/ban hooks) and
   `test/solo-static.js` (repo served under an `/OpenWarlock/` subpath by a
   dumb static server, NO game server: page detects solo, adds a bot, plays;
   `ENGINE=webkit` covers the Safari-shaped engine).

Deploying = enabling GitHub Pages on the repo (root, main). Nothing else.

## Brief-vs-code adaptations (the code was the truth)

- The wire has grown since the brief: `snap` carries `bans` and `pings`
  extras, per-viewer `viewEvents`, draft/testing/shopPause/kick/unbanAll
  messages. All of it moved into the engine unchanged.
- The RTT ping stream is ws-specific. Behind the seam the adapter feeds
  `engine.setPing()`; solo feeds nothing → no `pings` blob → no ms badge
  (a badge would be a lie in-tab; render code already treats absent as "no
  badge").
- The engine keeps `setTimeout` for the two long grace windows (again /
  lobby-reset): portable in browser+Node, and tick-time deadlines would have
  changed observable timing. The 30/15 Hz clocks stay with the caller as the
  brief demanded.
- `bans` count spans engine name-bans + adapter IP-bans: engine takes an
  `externalBans()` callback instead of owning IPs.
- `broadcast()` in the old server was dead code; dropped, not ported.
- ⚠ `serialize()` (B4 prep) is in, with a known blocker: `game._rng` is a
  closure, lazily rebuilt from `seed` after a round-trip, so the rng STREAM
  restarts on restore. Resuming play works (test-locked); step-for-step
  deterministic replay does not. Fix before relying on B4 host migration:
  make the rng cursor a serializable field on the game.

## Phase B status — NOT started, here is exactly where it stands

**B0 gate (30 Hz loop in a backgrounded tab, 10 min):** measured on real
Chrome (for Testing 151, macOS, via `tools/tabtest-run.js` — spawns a real
browser; playwright CANNOT measure this, it emulates focus on every page so
background tabs never throttle, which fakes a pass):

- naive main-thread `setInterval`: 1.1 Hz at minute 1, 0 Hz from minute 2 on
  — dead, as the brief predicted (and proof the environment really throttles).
- worker clock / worker+quiet-audio / worker+open-RTCPeerConnection:
  **held 30.2-30.4 Hz backgrounded through minute 9 of 10** — 4+ minutes
  INSIDE Chrome's intensive-throttling regime (starts at 5 min), zero decay.
  (The driver was reaped before the minute-10 line; the by-minute log is the
  evidence, re-runnable via `node tools/tabtest-run.js` in 10 min:
  `1m 30.3 · 2m 30.3 · 3m 30.3 · 4m 30.3 · 5m 30.3 · 6m 30.3 · 7m 30.3 · 8m 30.2 · 9m 30.3`.)
- **Desktop Safari and phones: unmeasured** — no way to drive real Safari from
  this environment (playwright's webkit is not Safari's power heuristics).
  The gate says pass = Chrome AND Safari, so the gate is formally OPEN.
  → Remi: open `tools/tabtest.html?v=worker&beacon=0` (and `worker-audio`,
  with a click on Start) in Safari, background the tab 10 min, read the
  on-page report. That closes B0 either way.
- Relevant find: an open `RTCPeerConnection` — which a phase-B host always
  has — is itself exempt-from-intensive-throttling territory in Chrome and
  held 30 Hz; the audio trick may be unnecessary in practice.

**Already in place for B:** the transport seam (selection rule has room for
`#r=CODE`), the engine running in a tab (the host is the solo path + N
conns), `serialize()` + restore (minus the rng caveat above), the worker
clock. **Not built:** `server/signal.js`, `RtcTransport`, host/join UI, delta
snapshots, host migration (B1-B4).

## Verification record (phase A checklist, all green 2026-08-09)

1. `npx vitest run` — **278 passed** (274 existing + 4 engine tests).
2. `node test/integration.js 4501` — INTEGRATION OK (against the adapter).
3. `node tools/reconnect-test.js` — ALL OK.
4. `PLAY_MS=30000 node test/client-robustness.js` — chromium PASS, webkit PASS
   (ws path incl. kill-server reconnect, through the transport seam).
5. `node test/harness/run.js .../bots.js` and `.../coop.js` — PASS, PASS.
6. `node tools/arena.js --games=60 --players=4` — sane (lava share 20.8%).
7. `node test/solo-static.js` — SOLO STATIC OK (chromium AND webkit): static
   subpath origin, no game server process involved, solo battle screenshotted.
