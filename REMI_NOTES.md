# Notes for Remi — OpenWarlock & the open web MOBA

*Written 2026-08-08 by Claude, working in an isolated worktree while you
hosted a live game — nothing here touched your running server. Merge + pull +
restart + hard-refresh when your game is done.*

## ROUND 18 — your four mid-game orders (2026-08-08)

All four shipped on branch `worktree-round18`, 245/245 tests green, client
screenshotted (portals + ping badge both visible). One quick lab pass ran;
the full battery has not — numbers below say exactly what was measured.

### 1. Ping badge on every player 📶

The server pings every socket every 2 s and reads the echo, so each player's
round-trip shows next to their name — in the lobby list and on every
scoreboard (shop, spectator, end screen). Green < 80 ms, amber < 180 ms, red
above. Bots show nothing (they have no network). Two honest limits:
- It prices the NETWORK path only — if your friend's ping is green but their
  game still stutters, the problem is their machine (tab/CPU), not the link.
- The zombie reaper is untouched: a tunnel stall still gets its old 30 s of
  grace before the seat is cleared.

### 2. Spawn seats reshuffled every round 🎲

The spawn circle is the same; who stands where is dealt fresh each round
(seeded — replays and tests stay deterministic). Until now your neighbours on
the wheel were a game-long constant. Versus only; co-op keeps its party arc.

### 3. Lava portals 🌀

Four portals out in the lava on the diagonals, at 1.25× the starting rim
("a bit far" — the swim there costs real HP at 14/s). Touch one and you
surface at the arena center, dead stop, teleport flash at both ends. They
render as cool blue vortices so they can't be mistaken for lava FX. Versus
only. Interpretation I chose (say the word to change): fixed positions all
game even as the ring shrinks, no cooldown (the trip is one-way, the lava is
the price), and a vanished traveller's flashes stay hidden like all their
other events.

### 4. Mosquito rework 🦟 — on-hit amp identity

Exactly your dictation, stated back:
- **First hit (arming sting)**: 1 damage, no push, and it now APPLIES all
  your on-hit effects — venom DoT, midas mark, frost stack, momentum points,
  arcane refund.
- **Second hit (cashing sting)**: still 1 damage, fires TWO real co-located
  fireballs; the on-hits ride those two balls, not the sting itself.
- Net: **3 on-hit procs for 2 landed casts** — the number you asked for. (If
  the cashing sting ALSO applied its own riders it would be 4; I read your "3
  for 2" as the spec and coded that.)
- **Levels 1/2/3 = +20/40/60 fireball haste**, replacing the old cooldown
  multipliers (which were ≈ +25/43/69 haste — lv3 is a touch slower than
  before). Haste sums with arcane and the hourglass; no compounding, so the
  question-J engine can't come back.
- Fun fallout you'll notice: mosquito+frost now detonates on every
  armed+cashed pair (1+2 = exactly frost's 3 stacks). Test-locked.

Measured (element mirror, 600 games, seed 1, berserker mirror — a bot read,
and bots can't aim the amp fantasy): mosquito 43.5% at 17.2 → 46.1% after the
rework. Value-neutral on bot tables; its real buyer is a human stacking
on-hit elements.

### ⚠ One thing you should see (not round 18's doing)

The same instrument shows **momentum at 99.6-100% both before AND after these
changes** — the 17.2 uncapped ramp (+3 dmg per 50 points) on bot carriers
that land ~172 hits/game. Your question K just got louder: a human banks a
fraction of that, so the round-12 rule (don't number-nerf a bot artifact)
still holds, but if it FEELS oppressive the levers are `pointsPerHit` or
`evolveEvery`. Nothing was touched without you.

---

*Round 17 is archived at `docs/history/2026-08-08-remi-notes-round-17.md`;
rounds 1-15 at `docs/history/2026-08-08-remi-notes-rounds-1-15.md`.*
