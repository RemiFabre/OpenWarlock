# OpenWarlock 🔥

## ▶ [Play it now — no install](https://remifabre.github.io/OpenWarlock/client/)

An open-source, web-native remake of **Warlock**, the classic Warcraft III
minigame: knock other warlocks into the lava with physics-driven spells, earn
gold, buy upgrades between rounds, and be the last one standing as the arena
shrinks.

The link above plays solo against bots in your browser, and **📡 Host online**
turns your tab into the server: you get a room code to share, friends open it
and join over WebRTC. Nothing to install for anyone.

## How to play

- **Right-click** — move (WC3 style). Letter keys cast at your cursor; every
  binding is rebindable (QWERTY and AZERTY presets ship).
- Spells **knock enemies back**. The real killer is the lava ring closing in.
- **First to 15 kills wins the game.** Between rounds you shop: 8 g per round,
  +2 per kill, +2 for winning it. The economy is anti-snowball by design — the
  player with every kill can never out-earn a kill-less one by more than 2×.
- **Elemental mode** (lobby toggle) replaces fireball levels with eleven
  elements that stack: more damage, more push, faster casts, contagion, a red
  mark that makes you stronger forever…
- **Teams** are a lobby setting, not a mode: pick the same team number as a
  friend and your spells pass through each other. Any shape works (2v2, 3v2).
- **Add bot** fills seats at four difficulties — they fight and they shop.

## Run it yourself

```bash
npm install
npm start                 # -> http://localhost:3000  (LAN play)
npm run host              # -> a public https URL to share (cloudflared)
```

The host machine is the authoritative server: it decides every hit, so nobody
has to trust anyone else's client.

## Architecture

Vanilla JS, no build step, Node ESM, one dependency (`ws`).

```
shared/constants.js   every game number (spells, elements, items, economy)
shared/sim.js         the whole simulation — pure functions, no I/O
shared/engine.js      the authoritative room; the Node server and the in-tab
                      solo/host mode both run it behind one transport seam
client/               canvas client, snapshot interpolation
test/                 vitest units + a scriptable match harness + playwright
tools/                headless balance labs (thousands of games, Elo ratings)
```

Clients render ~130 ms in the past and interpolate; the server simulates at
30 Hz and broadcasts 15 Hz snapshots. House rules are a fork away — the numbers
all live in one file.

## Tests and labs

```bash
npx vitest run                                          # unit tests
node test/harness/run.js test/harness/scenarios/bots.js # scripted match + invariants
node test/harness/fuzz.js 20                            # 20 random matches
node tools/arena.js --games=2000 --players=4            # balance lab, Elo per strategy
node tools/elo.js --games=8000 --seed=1                 # the strategy ranking
```

The game is built to be tested by agents: every server session can journal to
JSONL, and `test/harness/check.js` re-validates the game's laws over that log
(no tick stalls, legal phase transitions, cooldowns respected, rounds ending
exactly when they should). Fuzz failures are saved with their seed and replay.

Contributors: read `AGENTS.md` first.

## License

MIT. OpenWarlock is a from-scratch homage to the Warlock/Warlock Brawl game
concept; it uses no assets, code, or names from Blizzard or the original map.
