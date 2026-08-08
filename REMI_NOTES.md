# Notes for Remi — OpenWarlock & the open web MOBA

*Written 2026-08-08 by Claude, working autonomously.*

## ROUND 17 — Session A: haste, Swap, the sky-bolt (2026-08-08)

Session A of your ROUND17 split is done and committed: §1 (delegated), §4, §3,
§2, in that order. 226/226 tests green plus the full verification ritual.
**Nothing here is measured yet** — per your plan, Session B runs the one
battery at the end, and the new spells stay unmeasurable until Session C's
bots anyway. Every value below is your FIRST TRY number, shipped as dictated.

### What changed, playtest-ready

- **Co-op is mothballed** (§1): the lobby button now cycles elemental ⇄
  classic only. All the code, campaign data and tests stay green — it is one
  array entry in `client/coop.js` to bring back after your redesign.
- **CDR is now Ability Haste** (§4): `cooldown = base / (1 + haste/100)`,
  and haste SUMS across sources instead of compounding. Hourglass
  **+10/+22/+38** (all spells), arcane **+18/+39** (fireball only) — both
  converted value-neutral from the old percentages, so a single source feels
  identical. The STACK is what got quieter: hourglass lv3 + arcane lv2 used to
  multiply to ×0.52 on the fireball; now it divides to ×0.56 — and unlike the
  old multipliers, a third source would barely move it. Arcane lv3's refund is
  untouched, as you ruled. midas-cdr re-measures after Session B (question J).
- **Hook is now Swap 🔀** (§3): same projectile shell (speed, range, costs);
  on impact you and the victim trade x/y AND velocity, both sides' move
  orders / dashes / charges wiped. It deals exactly **1 damage** to stamp the
  last-hitter — swap someone into your lava and their death is YOUR kill
  (test-locked, along with: swap mid-dash, swap on a vanished target, no
  on-hit riders ever). It has its own crossing sound (two tones trading
  pitch) and a flash at both ends.
- **Lightning is now a telegraphed sky-bolt ⚡** (§2): click a spot in range,
  the zone (radius **2.2**) appears instantly, the bolt lands **0.5 s** later.
  Damage **12/15/18** at the center falling linearly to half at the edge;
  knockback **70/78/86**, RADIAL from the zone center — a bolt on the far
  side of a lava swimmer pushes them back ONTO the platform, on purpose.
  Cooldown 6/5.5/5. **Pillars and Mirror Walls do not block it** — it is the
  anti-cover tool now, and the desc says so. Delay and radius never change
  with level (your escape ruler); the bolt's tint shifts per level.
  The old hitscan code is deleted, not parked.

### Interpretations I had to make (flag if wrong)

- **Sky-bolt vs shield**: unspecified in ROUND17. I kept "shield holds the
  bolt" (the old hitscan rule, and repulse's rule). Meteor still punches
  through shields, so the two AoEs differ — one line in `stepBattle` if you
  want the bolt meteor-like instead.
- **Sky-bolt self-hit**: the caster CAN be under their own bolt (meteor's
  rule — it's ground-targeted AoE now). Bots are guarded against dropping it
  on their own heads.
- **Swap icon**: 🔀 (you only ruled OUT 🔁, echo's).

### Bots, minimally (the §2 mandatory part — Session C owns the rest)

Berserker and stalker (so Hard AND Extreme) now step out of telegraph zones,
and every aiming tier places the bolt at the target's predicted position one
delay ahead. Without that, any measurement of the new lightning would have
been garbage. Swap still reads at the do-nothing floor for bots — expected,
not to be number-buffed (your §3 note); its lava-save heuristic is Session C.

### Next sessions (per your split)

- **B**: midas mark → momentum tiers → venom de-stack → ember trim → sustain
  pass, then the single measurement battery.
- **C** (own agent): stochastic bot focus + piloting the new kit.
- **D** (own agent): projectile visual identity. §10 shop grouping anytime.

---

*Round 16 (elements rework + strategy study) is archived at
`docs/history/2026-08-08-remi-notes-round-16.md`; rounds 1-15 at
`docs/history/2026-08-08-remi-notes-rounds-1-15.md`.*
