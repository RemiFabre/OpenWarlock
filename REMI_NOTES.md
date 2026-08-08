# Notes for Remi — OpenWarlock & the open web MOBA

*Written 2026-08-08 by Claude, working autonomously while you playtested.*

## ROUND 17 — all four sessions, in one day (2026-08-08)

Everything in docs/ROUND17.md is shipped, tested and pushed: Session A
(haste / Swap / sky-bolt), Session B (midas mark / momentum tiers / venom /
ember / sustain) with its measurement battery, Session C (bots, own agent),
Session D (visuals + shop rows, own agent) — plus your three mid-session
requests. 237/237 tests green; full evidence in
`docs/history/2026-08-08-round17-battery.md`. Pull, restart the server,
hard-refresh.

### Your mid-session requests, all live

- **🧪 Testing sandbox**: a lobby toggle next to Draft (works over elemental
  AND classic). Set the starting gold (0-999), and the game opens in a shop
  whose clock never runs — inspect anything, assemble a combo, ready up to
  start round 1. Bots count as always ready.
- **Hard bots dodge 50% of lightning**: each bot commits ONCE per bolt to
  dodging or eating it — no re-roll, so it's a real coin flip, not an oracle.
  Normal 35%, Extreme 85% (dodging is its identity — say the word if you want
  Extreme lower). Writing the test found a real bug: a bolt dropped EXACTLY
  on a bot produced a zero escape vector and was never dodged at all. Fixed.
- **AI strategy texts rewritten**: the tier descs now state the dodge odds,
  and each build's desc names the elements it actually picks in elemental
  (bruiser = vampire/ember/momentum, etc). The lobby chart is generated from
  these, so it updated everywhere at once.

### The two headline results from the battery

**Your midas-cdr problem is dead (question J closed).** Haste sums where CDR
compounded, and the midas mark halves income rate: midas-cdr 86.2% → **24.3%
on both seeds** — exactly baseline. double-cdr 49 → ~11, mosquito-midas 70 →
30. No polite-nerf residue; the topology fix worked.

**Venom's FIRST TRY ticks measured 96% — worse than round 16 — and I retuned
them under §7's own mandate.** With stacking deleted, tick damage is finally
a real lever (it wasn't in round 16): [1,2,3] 96 → [0.7,1.4,2] 79 →
**[0.5,1,1.5] 56 = shipped** (out of the 90s, #2, top-third — your stated
target). Two things you should know:
- The full-stop regen lock made every DoT a permanent regen-denial (each tick
  re-arms the 2 s pause). I measured that interaction alone: worth only ~8 of
  venom's 96 points — the ticks were the engine, so the number fix is the
  honest one. The lock stays exactly as you ruled.
- A ½-damage tick would have been invisible (the damage floater hides
  amounts < 1 — the mosquito scar), so poison ticks are now exempt from that
  filter. You'll see "0.5" ticking.

### What still needs YOUR ruling (numbers ready, nothing acted on)

1. **Momentum is the new #1 on bot tables** (86/89% mixed) — but its STRATEGY
   is healthy (28.5%), and the number rides on bot carriers landing 172
   hits/game; you'll mostly see tier 1. Smells like bot inflation, so per
   your own rule I didn't nerf it. Measured lever if it FEELS oppressive:
   thresholds 40/90/150 → 60/130/220 takes it to 72. (Question K.)
2. **The Blood Sword is the one mandatory item left** (ladder seat without it
   wins 1.3%), and cutting its numbers doesn't fix it: under the full-stop
   lock, lifesteal is the only heal that works mid-fight. Structural, so per
   §9's own letter I left it. Options in BALANCE.md question L.
3. **CDR builds landed bottom-third** (~11%) after the un-degeneration. If
   you want cadence viable-but-honest, say so. (Question M.)

### Late additions (your live requests, all measured before shipping)

- **Passive regen is GONE — and the Ring of Regeneration with it.** Your
  instinct measured out: with HP resetting every round, regen's only in-round
  job was feeding stalemates. Removal: round-1 first blood unchanged
  (34.8 s), venom drops another 20 pts (its regen-denial premium became
  universal), ember/vampire/mosquito rise into a healthier midfield. The lock
  machinery stays in the code as the one-line revert (`PLAYER.REGEN` back to
  1.2). The no-lock experiment you asked about is archived too: without the
  lock, round 1 was a 51 s stalemate and momentum hit 98.7%.
- **The readability batch** (short descs, hover details, next-level buy
  lines, no Powerful shelf, infinite ground-target range, Blink, unlimited
  pillars, vanish 1/2/3 s, flat haste deltas, stable lobby). Two holds,
  both measured: arcane self-refund = 66.4% as a lone element (the old
  feedback loop survives in the haste world — your call), and the ring was
  measurably WEAK, not strong (now moot — it's gone).

### Everything else that shipped, one line each

- Sustain: amulet [18,32,42]; hourglass haste [10,18,26] (your flat-delta
  ruling; the ladder-measured [8,18,28] was the same ballpark) — amulet's
  forbidden ladder seat went 0.4% → 12.9%. (Ring: later removed with regen.)
- Momentum HUD shows tier + hits-to-next-evolution; the ball itself grows
  flame wings and motes per tier (Session D's layered visual system — every
  element paints its own tell, the engorged ball owns the color war).
- Shop: two labeled element rows — Elements ⚗️ (stat axes) and Mutations 🧬.
- Bots: targeting is a weighted DRAW now (softmax, temperature in
  BOT_TARGETING) — 3+ hunters on one victim fell 35% → 26%, h2h ladder intact
  at 100/99.8/100; bots also raise pillar cover when ganged/low and cast Swap
  as a lava save (fires only via draft until they can buy power spells).
- Ember [1,2,4] landed as planned (61.5 → ~28 mixed).
- Midas mark: 🪙 pip on the victim, quiet ring when planted, gold popup on
  the cash — income rate halved, which is half of what killed midas-cdr.

*The strategy-study tables in STRATEGIES.md predate the softmax bots and the
venom retune — treat them as the shape of the meta, not gospel; the study
re-runs in ~6 min when wanted.*

---

*Round 16 is archived at `docs/history/2026-08-08-remi-notes-round-16.md`;
rounds 1-15 at `docs/history/2026-08-08-remi-notes-rounds-1-15.md`.*
