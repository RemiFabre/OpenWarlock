# Known issues / observations (fuzz campaign, 2026-08-01)

All reproducible bugs found by the campaign were fixed (see server/index.js,
test/harness/bot-client.js, test/harness/check.js). One design-level liveness
observation remains, documented here because it is a game-design decision,
not a code bug, and "fixing" it would change the rules:

## ~~Rounds can last forever if nobody attacks (pacifist stalemate)~~ FIXED

**Resolved 2026-08-01**: sudden death added. After `SHRINK_TIME` the arena
holds at `MIN_RADIUS` for `OVERTIME_GRACE` (45 s), then shrinks to **0** over
`OVERTIME_SHRINK` (30 s). Every round provably ends (unit test:
"sudden death: every round provably ends, even if nobody fights").
Original observation kept below for the record.

## Original observation

- The arena shrinks from radius 56 to **10 and then holds** (DESIGN.md:
  "shrinks linearly from radius 56 to 10 over 75 s, then holds").
- The safe zone at radius 10 is large enough for any number of players to
  coexist indefinitely without taking lava damage.
- Therefore, if every remaining player refuses to attack, `alive` never drops
  to 1 and the round never ends. Observed live: the `duel` scenario stalled in
  round 1 for 400+ s when both scripted clients dropped below 30 HP in the
  same round and switched to pure flee (both parked at y = ±2.14, hp 20/20,
  zero casts for 12,000 ticks). The harness autopilot was fixed to kite
  instead of flee, but two *human* griefers can still stall a match this way.
- Possible rule-level fixes if this ever matters for real play: keep shrinking
  to radius 0, ramp LAVA.DPS over time after SHRINK_TIME, or add a
  sudden-death round timer. Any of these changes game balance, so it is left
  as a design decision.

(For the record, the originally reported "freeze when a bot died" never
reproduced server-side across 60+ fuzzed matches and a 9-minute
1-human+3-bots autopilot game with 24 deaths; the one game-killing bug found
(the `GET /%` HTTP crash) is fixed.)
