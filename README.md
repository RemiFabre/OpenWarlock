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
- Letter keys cast the matching spell at your cursor. Every binding is
  rebindable in the Keys panel (QWERTY and AZERTY presets ship).
- Spell hits **knock enemies back**. The real killer is the lava ring, which
  closes in over 65 seconds.
- Last warlock standing wins the round. Kills are everything: the first
  warlock to **15 kills** wins the game. Your body grows with your kill lead
  (easier to hit) and shrinks when you trail — the arena self-balances.
- Between rounds, spend gold in the shop (8 g per round, +2 g per kill,
  +2 g for winning the round). The economy is deliberately anti-snowball:
  the player with every kill can never out-earn the player with none by more
  than 2×.
- In the lobby: **Add bot** to fill seats (they fight, and they go shopping).

### Spells

Default QWERTY bindings — the source of truth is `KEY_PRESETS` in
`client/main.js`, not this table.

| Key | Spell | What it does |
|---|---|---|
| Q | Fireball | Medium projectile, strong knockback. You start with it. |
| W | Lightning | Instant mid-range bolt, no push — a pure finisher. |
| R | Boomerang | Long throw, out and back to where you threw it. Tap again to recall early; catching it halves the cooldown. |
| F | Teleport | Blink to cursor, cancels momentum — the lava save. |
| D | Shield | Reflects projectiles back at their owner for 1.25 s. |
| E | Rush | Dash through enemies, blasting them aside. |
| S | Stone Pillar | Raise a blocker: cover, and it stops knockback. |
| V | Vanish | Go completely invisible for a moment. You can still cast and be hit. |
| T | Meteor | ☄️ Mark a spot; a rock falls for heavy damage and a radial blast. |
| G | Hook | 🪝 Skewer the first enemy hit and yank them behind you. |
| X | Repulse | 💥 Charge visibly, then blast everyone around you away. |
| C | Mirror Wall | 🪞 Reflects enemy projectiles and blocks their lightning; yours pass. |

The last four are the **power tier** — expensive enough that buying one is a
real trade-off against a full item.

**Items** have three levels each, at a flat cost per level, with each level
worth less than the last: Boots of Speed, Lava Treads, Amulet of Health, Ring of
Regeneration, Cape of the Magi, Blood Sword. See the in-game shop for numbers.

**Elemental mode** (lobby toggle) adds twelve elements that reshape your
fireball and stack with each other. See the shop.

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
