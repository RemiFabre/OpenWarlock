# BRIEF: browser hosting (play from a link, host your own game)

*Written 2026-08-08 for a fresh agent. Read `AGENTS.md` first (context policy is
non-negotiable), then this. Supersedes HOSTING.md §A option 2 and its "Not planned: the
WebRTC rewrite" line; see §Why at the end.*

## Goal

**Someone opens a link and plays. No install, no terminal, nobody's server.**

Two phases, two commits. Phase A is a prerequisite for phase B either way, and carries none of
B's risk. Do not merge them.

| | Deliverable | Needs a server? | Accounts |
|---|---|---|---|
| **A** | Open the GitHub Pages URL → play solo vs bots, entirely in the tab | no | GitHub |
| **B** | Click "Host", send friends the link → they join over WebRTC | signalling only, and only while joining | GitHub (+ wherever the signaller runs) |

Phase A must not paint B into a corner. That is the only reason A is a refactor and not a
new file.

## The seam that makes this cheap

Verified by reading the code, not assumed:

- **The client's transport surface is four things.** `connect()` at `client/main.js:111`,
  `send(obj)` at `client/main.js:167`, and exactly three inbound message types handled in
  `sock.onmessage` (`client/main.js:122`): `welcome`, `snap`, `denied`. Nothing else in the
  1354-line client touches the socket.
- **`shared/sim.js` is pure and already runs in the browser**: `client/main.js` imports from
  it today.
- **`server/index.js` (485 lines) is game logic wearing a Node costume.** Only these parts are
  actually Node-bound: the http static server, `ws`, the JSONL journal, crash dumps, and
  IP-based bans (`ipOf`, `bannedIps`). Everything else (join seating, ghost/reconnect stash,
  `maybeAutoStart`, `resetToLobby`, the 30 Hz loop, the 15 Hz snapshot loop, the whole
  `switch (m.t)`) is portable.
- **Full game state is 4 KB and survives a JSON round-trip**, then keeps stepping correctly
  (measured 2026-08-08 on a 4-player game). This is what makes B4 host-migration cheap.

---

# PHASE A: static page, solo play, no server

## A1. `shared/engine.js`: a transport-agnostic authoritative room

Move the portable parts of `server/index.js` here. Suggested surface (adjust if the code
argues otherwise, but keep it transport-free):

```js
const engine = createEngine({ seed, maxPlayers: 10, onSend: (connId, msg) => {} });
engine.join(connId, { name, avatar })   // -> { ok } | { ok:false, reason }
engine.message(connId, msg)             // the existing switch (m.t)
engine.leave(connId)
engine.tick(dt)                         // step + stepBot + botShop + phase bookkeeping
engine.pushSnapshots()                  // per-viewer snapshot -> onSend
engine.setPing(connId, ms)              // adapter feeds RTT in; engine just reports it
engine.serialize() / createEngine({ state })   // needed by B4; add now, it is nearly free
```

**The line to hold: the engine knows connection ids and names. It never knows sockets, IPs,
files, or timers.** So:

- name-bans, ghosts/reconnect stash, kick → **engine** (they are game state)
- IP-bans, journal, crash dumps, `/health`, static serving → **stay in `server/index.js`**
- the clock lives in the caller: `tick`/`pushSnapshots` are called by whoever owns the loop

## A2. `server/index.js` becomes an adapter

Same behaviour, same wire protocol, byte-for-byte. It owns http + `ws` + journal + IP bans
and calls the engine. **`npm start`, `npm run host`, and every existing test must behave
identically.** If `test/integration.js`, `tools/reconnect-test.js` and the 245 vitest tests
stay green, the extraction was faithful. That is the safety net for the whole refactor.

## A3. `client/transport.js`: transports behind one interface

```js
{ connect(name), send(obj), onMessage(cb), onClose(cb) }
```

- `WsTransport`: today's code, moved verbatim from `client/main.js:111-165`.
- `LocalTransport`: constructs an engine in the tab, wires `onSend` back to `onMessage`
  (no JSON round-trip needed, but **`structuredClone` anything handed over** so the client
  cannot mutate authoritative state), and drives `tick` at 30 Hz / `pushSnapshots` at 15 Hz.
  Use `TICK_RATE` / `SNAPSHOT_RATE` from `shared/constants.js`; do not hardcode.

`client/main.js` changes should be near-mechanical: pick a transport, keep everything else.

**Selection rule** (deterministic, testable; phase B adds one line to it):

1. `?mode=solo` / `?mode=server` in the URL wins (tests use this).
2. Otherwise probe `GET /health` (it already exists) with a ~1 s timeout: 200 → `WsTransport`,
   anything else → `LocalTransport`.

Solo mode opens the lobby with the player seated. Bots, mode/draft/testing flags, shop and
gameover all work unchanged, because they go through the same engine.

## A4. Make the page work under a GitHub Pages subpath

Pages serves at `RemiFabre.github.io/OpenWarlock/`, so **every absolute path 404s today.**
Three real offenders, all verified:

- `client/index.html:602`: `<script type="module" src="/client/main.js">`
- `client/music.js:38`: `fetch('/assets/manifest.json')`
- `assets/manifest.json`: every `music:` and `background:` value is `/assets/...`

Resolve against a base derived from `import.meta.url` / `document.baseURI` rather than
hand-editing paths, so the Node server and Pages work from the same files. Add a root
`index.html` that redirects to `client/`. **No build step** (that constraint is in AGENTS.md).

## Phase A verification (required before claiming done)

1. `npx vitest run`: 245 green, no new skips.
2. `node test/integration.js` and `node tools/reconnect-test.js`: green. These prove the
   `server/index.js` extraction changed nothing.
3. `node test/client-robustness.js`: green (⚠ `pgrep -fl "server/index.js"` first; Remi may
   be hosting).
4. **New**: a headless test driving `shared/engine.js` directly. Join, add 3 bots, autostart,
   full round to `shop`, buy, reach `gameover`. No sockets.
5. **New**: a playwright test that loads the client from a **dumb static file server with no
   game server running**, enters solo, adds a bot, reaches a running round. This is the actual
   deliverable; if it passes, the Pages link works.
6. Screenshot solo running with no `server/index.js` process alive.

---

# PHASE B: host your own game over WebRTC

**Do not start B until B0 passes.** If B0 fails, stop and report; the fallback is that hosting
stays on Remi's Mac (HOSTING.md option 3) and phase A still stands on its own.

## B0. Gate: does a 30 Hz loop survive a backgrounded tab?

This is the one genuine risk and it is cheap to settle. Throwaway page (`tools/tabtest.html`,
delete or archive after): run a 30 Hz counter, background the tab for 10 minutes, report
missed ticks. Test three variants: plain `setInterval`, a **Web Worker** clock, and a Web
Worker clock **plus a silent looping `AudioContext`** (audio playback is a documented
exemption from Chrome's intensive throttling). Run on desktop Chrome, desktop Safari, and a
phone browser.

Report the numbers. **Pass = the worker+audio variant holds ≥ 25 Hz backgrounded for 10 min on
desktop Chrome and Safari.** Phones are expected to fail; that is fine, phones are not the
target (the game needs mouse+keyboard).

Whatever variant wins becomes `LocalTransport`'s clock in phase A too.

## B1. Signalling: `server/signal.js`, ~80 lines, no game logic

A standalone WebSocket rendezvous. **It never sees game traffic and can be restarted
mid-match with no effect** (it only matters while someone is joining).

```
host → { t:'create' }                      ← { t:'room', code }
join → { t:'join', code }                  ← { t:'peer', peerId }  (to host)
both → { t:'sig', to, data }               → relayed verbatim to that peer
```

`data` is an opaque blob (SDP offer/answer, ICE candidates). The signaller must not parse it.
Rooms are in-memory, expire after ~10 min idle, and use 12 cryptographically
random characters from an unambiguous alphabet (no `0/O`, `1/l/I`).

Keep the transport pluggable behind one small module so this can be swapped for a Cloudflare
Worker + Durable Object, or public-infrastructure signalling, without touching the client.
Deployment is Remi's call (document the options, do not pick one in code). Default the client
to a configurable URL constant, not a hardcoded host.

## B2. `RtcTransport`: the same interface as A3

Two data channels, because they have different needs:

- **`ctrl`**: reliable, ordered. `join`/`welcome`/`denied`, and all lobby/shop/cast/buy input.
- **`snap`**: **unreliable, unordered** (`{ ordered: false, maxRetransmits: 0 }`) for
  snapshots. A stale snapshot is worthless; the client already buffers and interpolates
  (`snaps` ring at `client/main.js:134`), so loss is already handled. Do not make snapshots
  reliable (head-of-line blocking on a lossy link is exactly the failure this avoids).

`iceServers`: **public STUN only. Ship no TURN.** Rationale in §Why; adding TURN later is a
config array change, not a redesign.

If ICE fails after a reasonable timeout, say so in plain language ("couldn't reach the host;
try a different host, or ask Remi to host it") rather than hanging.

## B3. Host and join flows

- **Host**: clicks "Host game" → creates an engine in the tab (same code path as solo) →
  opens a signalling room → shows the invite link. The host is a player, not a spectator.
- **Join**: opens `<pages-url>/#r=CODE` → connects to signalling → WebRTC to the host → sends
  `join` on `ctrl`. Use the **hash**, so Pages needs no routing.
- The transport selection rule from A3 gains a first case: `#r=CODE` present → `RtcTransport`.
- Host fans out per-viewer snapshots to N peers: same `pushSnapshots()`, one `onSend` per
  peer. Measured cost at 6 players: 4.16 KB/snapshot, 3.07 Mbit/s up uncompressed.

**Also do in B: delta snapshots.** Data channels have no `permessage-deflate` equivalent, and
this is where it starts to matter. Measured on a live 6-player game: full 4.16 KB → changed
fields only 0.72 KB → delta+deflate 0.28 KB, i.e. **15×**, 3.07 → 0.21 Mbit/s. Send a full
snapshot on join and on phase change, deltas otherwise. (While in there, add
`perMessageDeflate: true` to `WebSocketServer` at `server/index.js:165`: one line, ~5× on the
Node path, free.)

## B4. Host migration: the objection that kills naive P2P, and why it does not apply here

Closing the host tab must not end the game. Full state is JSON-round-trippable,
so: the host broadcasts `engine.serialize()` on `ctrl` as a hot spare. If the host
vanishes, peers deterministically elect a successor (lowest peer id among survivors), that
peer calls `createEngine({ state })`, re-opens a signalling room under the **same code**, and
the others reconnect.

> ⚠ 21.11 (Remi): the hot-spare broadcast is **deleted from the code** until migration
> itself is built. It grew with the game state (~40 KB in long games, not 4 KB) and was
> the biggest late-game stream per guest, drowning thin downlinks
> (`docs/history/2026-08-12-rtc-lag-rootcause.md`). Re-add it WITH the election logic,
> throttled (rotate one guest per beat, idle channel only, or shop-phase only).

**Verify determinism before relying on this**: two engines built from the same serialized
state and stepped with the same inputs must produce identical snapshots. If they diverge,
find the unserialized field (do not paper over it).

If B is running long, ship B1-B3 first and B4 as a follow-up, but **keep the periodic state
broadcast in B3** so migration needs no protocol change later.

## B5. What is genuinely lost, and what to do about it

- **IP bans**: WebRTC gives no usable IP (browsers mDNS-obfuscate local ICE candidates). Keep
  name-bans and kick-by-peer-id. Acceptable: these are private lobbies among friends.
- **JSONL journal / crash dumps**: the host tab has no filesystem. Buffer to memory and offer
  a "download debug log" button. Do not drop it silently; it is the debugging story.
- **`/health` and the reaper**: irrelevant, no processes to reap.
- **The host can cheat**, since the host is authoritative. Private lobbies among friends →
  acceptable. Say so in the UI, do not pretend otherwise.

## Phase B verification (required before claiming done)

1. Everything in phase A verification, still green.
2. **B0 numbers pasted**, per browser and variant.
3. Two real browser instances (playwright), one hosting and one joining over a locally-run
   `server/signal.js`, reaching a running round with both players alive and moving.
4. Kill the signalling server mid-match → **the game continues**. This proves the signaller is
   not in the data path.
5. Delta snapshots: assert a client reconstructing from full+deltas matches the host's
   authoritative snapshot exactly, over a full round.
6. If B4 shipped: close the host tab mid-round, assert a survivor takes over and the round
   continues from the same state.

Report what you actually ran. Do not claim green without pasting the counts.

---

## Out of scope for both phases

- TURN, Turnstile, accounts, matchmaking, a lobby browser, spectator links.
- Any change to `shared/sim.js` balance, spells or constants.
- Co-op (mothballed).
- Packaging a desktop app (HOSTING.md option 1).

## Why this over the plan in HOSTING.md

HOSTING.md ranked browser P2P last on cost and background-tab risk. Both were re-examined
2026-08-08 with measurements:

- **The cost argument was wrong.** TURN is priced per **GB relayed**, not storage; a fully
  relayed 6-player game is ~1.2 GB/h against a 1000 GB/month free tier, and only ~10-20% of
  connections need relay at all (a figure skewed by mobile/CGNAT, i.e. not this game's
  desktop audience). Phase B therefore ships **no TURN**: STUN is free and account-less, and
  the fallback for a player who cannot punch through is "let someone else host" or "host it on
  Remi's Mac", which was already in the design. ICE failure is per-pair, so it means one friend
  can't join, not that the lobby dies.
- **Distribution is genuinely free**: GitHub Pages, one account Remi already has.
- **Signalling is a weak dependency**, not always-on infrastructure: it is needed for a few
  seconds while joining and can die mid-match with no effect. HOSTING.md counted it as "you
  still run servers"; that overstates it.
- **The host-tab-dies objection dissolves** at 4 KB of round-trippable state (B4).
- **The one real risk is background-tab throttling**, which is why B0 is a gate and not an
  assumption, and which **does not touch phase A at all**, since a solo player's tab is the
  foreground tab.

HOSTING.md's option 3 (Remi's Mac as the server) stays valid and stays in the design as the
fallback host. This brief does not remove it; it removes the *requirement* for it.
