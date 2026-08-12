> ⚠️ **ARCHIVED 2026-08-07. DO NOT TRUST ANY NUMBER IN THIS FILE.**
> This is the original v1 design sketch. It has been overtaken so thoroughly
> that an audit found **twelve contradictions with the code in fifty lines**:
> lava DPS, afterburn (removed entirely), shrink time, "no obstacles in v1"
> (there are 6 pillars), roster size, every fireball stat, lightning knockback,
> boomerang damage, item stacking, and four item values. It is kept only as a
> record of where the project started.
> **The live sources of truth are `shared/constants.js` for numbers, `AGENTS.md`
> for the rules snapshot, and `docs/ROUND12.md` for current work.**

# OpenWarlock, Design Document (v1, historical)

A web-native remake of the Warcraft III minigame **Warlock** (a.k.a. Warlock Brawl):
top-down arena, physics-driven knockback spells, shrinking lava ring, gold and a shop
between rounds. Fully open source, server-authoritative, hostable by anyone.

This is also the pathfinder project for the bigger "open web MOBA" idea; see
`REMI_NOTES.md` for the discussion.

## Core loop

1. **Lobby**: host starts the server, shares a URL. Players open it in a browser,
   pick a name/color, click Ready.
2. **Round**: everyone spawns on a circle in the arena with full HP and their
   spells off cooldown. 3-second countdown, then fight. The lava ring closes in
   over time. Last warlock standing ends the round.
3. **Shop**: everyone gets gold (kills + survival + base income) and 25 seconds
   to buy spells, spell upgrades, and items.
4. Win condition: **first to 15 kills** (checked at round end; safety cap of
   25 rounds, then most kills wins). Kills ARE the leaderboard, no separate
   score. Typical 4-player games run 8–11 rounds, deep into item builds.

## The arena

- Circular platform, radius **56 units** (1 unit ≈ 10 px at zoom 1), centered at origin.
- Outside the platform: **lava**. Standing in lava: **20 HP/s** damage plus an
  **afterburn** of 8 HP over 2 s when you get out (re-applied while inside).
- The platform shrinks linearly from radius 56 to **10** over **75 s**, holds
  there for **45 s**, then **sudden death**: it shrinks to nothing over 30 s,
  so a round can never stall forever.
- No obstacles in v1: pure open circle, like classic Warlock's default arena.

## Warlocks

- **100 max HP** (items can raise it), no mana (spells are limited by cooldowns only).
- **Size-by-lead**: your body (and hitbox) scales with your kill lead:
  `radius × clamp(1 + 0.08·(kills − average), 0.5, 2.0)`, live. Leaders are
  big, obvious targets; trailers are slippery. Self-balancing and readable.
- Movement: **right-click to move** (WC3-style), server-side pathing is trivial
  (straight line, no obstacles). Base speed **11 u/s**; Boots put you near the old 14.
- Physics: warlocks have velocity. Spell hits apply an **impulse**; friction
  (exponential damping, ~3.4/s) brings you back to controlled movement. While being
  knocked back you keep your move order.
- Death: HP ≤ 0 → you're out for the round (spectate). Killer gets credit;
  if lava kills you, the last warlock who hit you in the past 5 s gets the kill.

## Spells (v1 roster: 6)

Everyone starts with Fireball level 1. Spells are bought/upgraded in the shop.
All aimed spells fire toward the cursor. Hotkeys: `Q W E R D F` in buy order.

| Spell | Cost (up/lvl) | CD | Effect |
|---|---|---|---|
| **Fireball** | free, +6/lvl (max 3) | 1.6 s | Projectile, speed 30, radius 1.0, **10/13/16 dmg**, knockback 30/35/40 |
| **Lightning** | 10, +6/lvl (max 3) | 5 s | Near-instant bolt, long range 40, thin, **8/11/14 dmg**, knockback 14; a sniping/finisher tool |
| **Boomerang** | 10, +6/lvl (max 3) | 6 s | Projectile that returns to you; can hit on the way back. **9/12/15 dmg**, knockback 24 per hit |
| **Teleport** | 12, +6/lvl (max 2) | 12/9 s | Blink to cursor, max range 18/26. Clears your velocity (lava save!) |
| **Shield** | 12, +6/lvl (max 2) | 13/10 s | 1.5 s reflective bubble: incoming projectiles bounce back at their owner |
| **Rush** | 12, +6/lvl (max 2) | 10/8 s | Dash 16 u; enemies you pass take **8/12 dmg** + strong knockback 38 sideways-out |

Knockback numbers are impulse magnitudes (u/s added to velocity).

## Items (passive, stack limit 1 each)

| Item | Cost | Effect |
|---|---|---|
| Boots of Speed | 10 | +20% move speed |
| Lava Treads | 10 | −50% lava damage, no afterburn |
| Amulet of Health | 12 | +30 max HP |
| Ring of Regeneration | 10 | +1.2 HP/s |
| Cape of the Magi | 12 | −25% knockback taken |
| Blood Sword | 14 | Heal 35% of spell damage you deal |

## Economy

- Round income: **3 gold** base, **+4 per kill**, **+3 round win**, +1 consolation if
  you died first 😄 (keeps last place progressing).
- Starting gold: **12** (several real opening choices: any tier-1 spell, an item, or Fireball lv2 + savings). The shop is also open in the lobby, so you can open
  round 1 with Fireball lv2 or save up (a deliberate, debatable choice, see
  REMI_NOTES.md).

## Netcode

- **Authoritative Node.js server**: the host's machine decides everything
  (hits, damage, deaths). Clients send *inputs only* (`move`, `cast`, `buy`).
- Tick: **30 Hz** simulation. Snapshots: full-state JSON at **15 Hz** to each client
  (state is tiny: ≤10 players + ≤40 projectiles).
- Client renders ~100 ms in the past and **interpolates** between the two
  bracketing snapshots (standard technique, hides jitter, no client prediction
  in v1: input→action latency = your ping; acceptable ≤150 ms for this genre,
  same as WC3 Battle.net was).
- Transport: **WebSocket** (`ws` package). WebRTC unordered datagrams would be
  lower-latency under packet loss but 10× the complexity (discussed in REMI_NOTES).
- Rooms: one server process hosts one game (Warlock-style). Lobby = pre-game state.
  Late joiners become spectators; they join as players next round if slots remain.
- **Spectator mode**: any human can toggle "Watching" in the lobby; bots-only
  games with a human audience are a first-class mode (for gameplay study and
  for fun). ≥2 fighters (bots count) are needed to start.

## Tech choices

- **No build step, no framework.** Server: Node 18+, ESM, deps = `ws` only.
  Client: vanilla JS modules + Canvas 2D. `vitest` as dev-dep for tests.
- Shared simulation module (`shared/sim.js`): pure functions, fully unit-testable,
  and importable by both server and (later, for prediction) client.
- Deterministic-ish sim (fixed dt), but we don't rely on lockstep determinism;
  server state is the truth.

## Internet play (the hard requirement)

`npm run host` starts the server and tries to get a **public URL**:
1. If `cloudflared` is installed → Cloudflare quick tunnel (best: free, fast, TLS).
2. Else → `npx localtunnel` (zero-install fallback, pure JS).
3. Else → prints LAN IP + port-forwarding instructions.

The tunnel gives an `https://…` URL anyone in the world can open. WebSockets work
through both tunnels. Latency: adds one relay hop (~10–50 ms), fine for v1.

## Out of scope for v1 (candidates for v2)

Wind Walk (invisibility), Meteor/Cluster AoE spells, obstacles/multiple arenas,
team mode, client-side prediction, binary protocol, matchmaking/master-server,
spectator polish, sound, gamepad.
