# OpenWarlock 🔥

An open-source, web-native remake of **Warlock**, the classic Warcraft III
minigame: knock other warlocks into the lava with physics-driven spells,
earn gold, buy upgrades between rounds, and be the last one standing as the
arena shrinks.

No install for players — the host runs one command, everyone else just opens
a URL in a browser.

## Quick start

```bash
npm install

# play on your machine / LAN
npm start                 # -> http://localhost:3000

# host a game for friends anywhere in the world
npm run host              # -> prints a public https URL to share
```

`npm run host` uses a [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-tunnel/)
if `cloudflared` is installed (`brew install cloudflared`), otherwise falls
back to `npx localtunnel`. The host's machine is the authoritative game
server — it decides every hit, so nobody needs to trust anyone else's client.

## How to play

- **Right-click** — move (WC3 style)
- **Q W E R D F** — cast the matching spell at your cursor
- Spell hits **knock enemies back**. The real killer is the lava ring, which
  closes in over 75 seconds.
- Last warlock standing wins the round. Kills are everything: the first
  warlock to **15 kills** wins the game. Your body grows with your kill lead
  (easier to hit) and shrinks when you trail — the arena self-balances.
- Between rounds, spend gold in the shop (kills +4 g, round win +3 g).
- In the lobby: **Add bot** to fill seats (they fight, and they go shopping).

### Spells

| Key | Spell | What it does |
|---|---|---|
| Q | Fireball | Medium projectile, strong knockback. You start with it. |
| W | Lightning | Instant long-range bolt, low knockback — a finisher. |
| E | Boomerang | Flies out and returns; hits on both legs. |
| R | Teleport | Blink to cursor, cancels momentum — the lava save. |
| D | Shield | Reflects projectiles back at their owner for 1.5 s. |
| F | Rush | Dash through enemies, blasting them aside. |

Items: Boots of Speed, Lava Treads, Amulet of Health, Ring of Regeneration,
Cape of the Magi, Blood Sword. See the in-game shop for numbers.

## Architecture

```
shared/constants.js   all game numbers (spells, items, economy) in one file
shared/sim.js         the entire simulation — pure functions, no I/O
server/index.js       Node server: static files + WebSocket + 30 Hz game loop
client/               vanilla JS + canvas; snapshot interpolation, no build step
test/                 vitest unit tests, WebSocket integration test,
                      headless-browser visual test (playwright)
```

- **Server-authoritative**: clients send inputs (`move`, `cast`, `buy`);
  the server simulates at 30 Hz and broadcasts 15 Hz JSON snapshots.
- Clients render ~130 ms in the past and interpolate between snapshots.
- Everything gameplay-related lives in `shared/` — tweak numbers in
  `constants.js`, add spells in `sim.js`, and both server and tests pick
  them up. House rules are a fork away.

## Tests

```bash
npm test                  # unit tests (simulation)
npm start &               # then, against the live server:
npm run test:e2e          # two WebSocket clients play a real round
npm run test:visual       # headless Chromium joins and screenshots the UI
```

## Balance lab — thousands of headless games

`node tools/arena.js --games=2000 --players=4` plays full games directly
against the simulation (no server) between *strategies* (bot profile × build
scheme), maintains an **Elo rating per strategy**, and reports item/spell win
rates. Use it to test balance changes with data instead of vibes.

## AI test harness — script whole matches, check everything

The game is designed to be tested by agents (human or AI). The harness spawns
a real instrumented server, connects scripted players, and verifies invariants
over the full journal of what happened:

```bash
node test/harness/run.js test/harness/scenarios/duel.js     # scripted match
node test/harness/fuzz.js 20                                # 20 random matches
node test/harness/check.js <journal.jsonl>                  # re-check a log
```

Players are scripted in a tiny command language (see `test/harness/bot-client.js`):

```js
{ name: 'Gremlin', script: [
  'ready', 'hunt 20', 'cast fireball at nearest',
  'buy boots', 'spam 50', 'disconnect', 'wait 3', 'reconnect', 'auto 60',
] }
```

Every server session can journal to JSONL (`JOURNAL=file node server/index.js`):
all inputs, events, phase changes, per-second state digests, and crash dumps.
The checker (`test/harness/check.js`) validates game laws over a journal: no
tick stalls, finite positions, HP/gold bounds, legal phase transitions, rounds
ending exactly when ≤1 player stands, cooldowns respected. Fuzz failures are
saved with their scenario + journal under `test/harness/failures/` and are
reproducible by seed.

## License

MIT. OpenWarlock is a from-scratch homage to the Warlock/Warlock Brawl
game concept; it uses no assets, code, or names from Blizzard or the
original map.
