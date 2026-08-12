# ROUND 17: implementation order (converged 2026-08-08)

*Instructions, not history. Everything here is decided; values marked FIRST
TRY are starting points to implement and then sweep (the measurement decides
the final number, the design does not move). Work in the session split at the
bottom. Sections are tagged MAIN (principal agent) or DELEGABLE.*

**Delegation rules**: subagents are Opus-class or better, always. They obey
the same law as everyone: no useless comments, no over-engineered code.
Match the codebase's density and idiom (CONTEXT POLICY in AGENTS.md binds
them). The principal agent reviews every subagent diff before committing.

**General tuning principle (Remi)**: as a first approximation, per-level
gains are LINEAR with cost. The one allowed exception: the LAST level may
carry a premium step. Going all-in on one axis deserves a reward, and it
matches the "lv3 unlocks something" pattern. Never ship a curve where level 1
is markedly more cost-efficient than level 3.

---

## 1. Mothball co-op (DELEGABLE)

- Remove co-op from the lobby rules toggle (classic ⇄ elemental only). Keep
  the code, campaign data and tests green; the mode is just unreachable from
  the UI, marked "under construction" until Remi redesigns it.
- Update AGENTS.md: the "re-run `coop --levels` in the same commit" rule
  becomes "only if its tests break". Future agents stop tuning co-op.

## 2. Lightning → telegraphed sky-bolt (MAIN)

Replace the hitscan entirely. Mechanics (clone the meteor path in
`shared/sim.js`; `state.meteors` already does telegraph → delayed AoE):

- Click a spot anywhere in range → impact-zone indicator appears INSTANTLY →
  bolt strikes after a fixed delay.
- Damage AND knockback scale linearly with proximity to the zone center.
- Knockback is radial from the zone center through the victim. This cuts both
  ways on a lava swimmer (far-side positioning pushes them back onto the
  platform). Intended, do not "fix".
- The bolt falls from the sky: **pillars and mirror walls do not block it**.
  Intended: lightning becomes the anti-cover tool. State it in its desc.
- FIRST TRY: impact radius **2.2**, delay **0.5 s**, damage **12 → 6**
  (center → edge), knockback **70 → 35**, cooldown **6 / 5.5 / 5**, damage
  per level **12 / 15 / 18** (center), knockback **70 / 78 / 86**, costs
  unchanged (10+6+6).
- **Delay and impact radius NEVER change with level.** Per-level: cooldown,
  damage, knockback only, plus a slight color shift on the bolt.
- Design ruler for any re-tune: a human (~0.2 s reaction) with boots must be
  able to escape a bolt centered on them. Never balance the dodge window
  against bots. Frost's stun guaranteeing a centered bolt is the intended
  combo.
- **Ship in the same commit**: minimal bot support, or every measurement of
  the spell is garbage. Bots must place the bolt at a target's predicted
  position AND step out of telegraph markers (the stalker's dodge only sees
  projectile rays today). Rewrite the lightning branch of `pilotOwnedSpells`;
  the old hitscan logic dies with the spell.
- Tests: most lightning tests assume hitscan. Rewrite them around telegraph
  timing, falloff, radial direction, and wall/pillar immunity.

## 3. Hook → Swap (MAIN)

Replace the yank. A projectile (keep the hook shell: speed 38, range 34-44,
costs 20+8; level 2 buys cooldown and range); on impact:

- **Full state exchange between caster and victim**: x, y, vx, vy all swap;
  `moveTarget`/`dash`/`charging` cleared on both. (Velocities must swap or
  the lava-save fantasy breaks: the caster would keep their own lava-bound
  momentum from the new position.)
- Deals **1 damage**, stamps the last-hitter (so a following lava death
  credits the caster). No knockback, no on-hit riders (it is not a fireball).
- **Special sound** on the swap (new sfx.js synth) + a distinct visual event.
- Rename: **Swap** (pick an icon not already used; 🔁 is echo's).
- Test-lock: the lava-save scenario itself; swap during the victim's
  dash/charge; swap with a vanished player (revealing is fine); no riders
  fire.
- Bots will measure it at the do-nothing control. Expected, don't buff for
  it. Session C adds the one cheap heuristic (see §11).

## 4. CDR → Ability Haste (MAIN)

Replace all cooldown-reduction PERCENTAGES with additive haste:
`effective cd = base / (1 + haste/100)`. Haste sums across sources (new ADD
field in `shared/items.js` `itemBonuses`; `castSpell` divides).

- Conversions (value-neutral at today's sources, then round):
  hourglass `cdrMult [0.9, 0.81, 0.72]` → **haste +10 / +22 / +38** (all
  spells); arcane lv1/2 `cdrMult [0.85, 0.72]` → **fireball haste +18 / +39**.
- **Arcane lv3's flat refund stays as is** (fireball's own cd still excluded).
  Strong late-game refund combos are wanted; balance around them.
- After §4+§5 ship, re-run the strategy study: `midas-cdr` (86%) and
  `double-cdr` (49%) are expected to fall into a sane band; BALANCE.md open
  question J closes if they do.

## 5. Midas → the mark (MAIN)

The +1 g per hit becomes a two-hit rhythm, at every level, using the existing
private-stack store (the frost/gale/mosquito machinery):

- First fireball hit on a target plants a 🪙 mark (visible pip on the victim,
  like frost's). The NEXT hit on that SAME target cashes **+1 g** (the
  existing gold popup) and clears the mark. Hitting a different target plants
  a new mark there; marks are private per attacker and persist like frost's.
- Everything else about midas is unchanged: +1 g cap forever, levels buy back
  the damage/push penalty exactly as today.
- Mosquito interaction: proc balls are real fireballs, so a cashed sting can
  plant and/or cash marks per the same rule, and the "+1 g twice" visibility
  ruling stands where two cashes genuinely happen.

## 6. Momentum → tiered evolutions (MAIN)

Replace the per-hit ramp with visible, permanent evolution tiers:

- Landed fireballs count for the whole game (permanence unchanged). At
  **40 / 90 / 150 landed hits** (FIRST TRY) the ball evolves: **+2 / +5 / +9**
  damage (cumulative, on the 7-damage ball). Drop the 0.8 early damage
  penalty entirely.
- Element levels 1/2/3 buy the tier bonuses up. FIRST TRY lv3 tiers
  **+3 / +7 / +12**, lv2 between.
- The HUD shows hits-until-next-evolution where the white bonus number lives
  today; the ball itself shows the tier (see §12, trails/particles per tier).
- Calibration facts: a bot carrier lands a median **172 hits/game**; humans
  land far fewer. Verify with a human-paced estimate before final tiers.

## 7. Venom → the kill-stealer (MAIN)

- **Remove tick stacking** (`stackAdd`/`stackCap` deleted). Re-hits only
  REFRESH the duration. Tick damage FIRST TRY **[1, 2, 3]** (linear, per the
  general principle; 1 tick/s for 5 s as today). Keep the −15% direct-damage
  penalty and the ground trail unchanged.
- Identity: venom deals LESS total damage than ember-style pure damage. Its
  edge is that the DoT keeps ticking after you disengage and **a lethal tick
  takes the kill, even in lava** (existing test-locked credit rule; do not
  touch it, it IS the identity). The sneaky build.
- **Balance target**: ember out-damages venom in total; venom out-steals it.
  Verify venom leaves the 90s (mixed table) and lands top-third, not #1.

## 8. Ember nerf, MAIN (one line, ships with §7's re-measure)

- `dmgAdd [2, 4, 6]` → **[1, 2, 4]**: linear cost↔gain with a premium last
  step (the all-in reward). Per-fireball damage growing less overall is
  accepted.

## 9. Sustain items & transparency (MAIN)

Ruling: **no item may be mandatory by win rate.** Measured target: on the
level ladder (`--ladder=`), a seat forbidden any given item stays ≥ ~15%
(amulet lv0 sits at 0.2% today).

- FIRST TRY: amulet `maxHp [25, 43, 56]` → **[18, 32, 42]**; ring
  `regen [0.7, 1.2, 1.55]` → **[0.5, 0.85, 1.1]**. Sword untouched initially
  (the green +N popup shipped; with regen trimmed, active lifesteal must
  clearly out-heal passive play when hits land; verify, then touch the sword
  only if it still fails that).
- **Regen lock becomes explainable**: change ×0.25-for-2.5 s to a FULL stop
  for **2.0 s** (near-identical value, one human sentence), and SAY it in the
  ring/amulet descs and stats panel: "taking damage pauses your regen for
  2 s". It applies to lava damage too (that is current behavior, keep it).
  Re-check the round-1 first-death median (~31 s) after; that number is why
  the lock exists.
- Sequencing: this section's re-measures run in the SAME battery as §5-§8.

## 10. Shop grouping: Elements vs Mutations (DELEGABLE)

Presentational only, no mechanical change, all elements stay 3-level:

- Shop row 1 **"Elements"**: ember, terra, gale, arcane, ghost (the ball-stat
  axes with lv3 specials).
- Shop row 2 **"Mutations"**: venom, frost, momentum, mosquito, vampire,
  midas (the gameplay changers).

## 11. Bots: stochastic focus + pilot the kit. DELEGABLE (own agent, Session C)

- **Stochastic target selection**: `pickPrey`'s weighted score becomes a
  softmax draw, re-rolled on the existing `_botT` decision clock. Weight
  terms: proximity, victim's missing HP (finish the wounded), kill lead
  (keep `LEADER_BIAS`), and "carries MY stacks" (frost/gale/mosquito/midas
  marks read from the private-stack store). Weights + temperature live in
  `BOT_TARGETING`; temperature is the "how extreme" lever.
- **Pilot additions**, in priority order: step out of telegraph markers
  (mandatory for §2), place the new lightning at predicted positions, raise
  a pillar between self and nearest threat when focused/low, cast Swap when
  own velocity points into lava with large magnitude.
- **Verification**: h2h ladder must stay 100 / 99.5 / 100; comeback rate
  tracked; add one metric to arena.js: seconds spent under multi-enemy focus
  in the first 20 s of a round (the pain this fixes).

## 12. Projectile identity & visual evolution. DELEGABLE (own agent, Session D)

One layered, ADDITIVE visual system in `client/render.js` (unify the existing
per-element one-offs): base ball → element tint accents → evolution particles
→ event override.

- Every modifier contributes its own layer (particles, trails, tint accents)
  and layers STACK: two effects mixed must stay readable, and the player
  must be able to see each choice they made on the ball.
- **Momentum's tier is visible on the ball itself**: extra flame-trails /
  particle count = current evolution tier, plus the quest counter in the HUD
  (§6).
- **Event-balls win color conflicts**: vampire's engorged ball is an intense,
  unmissable red; mosquito's near-harmless sting looks clearly different from
  a real fireball. An event-ball carries the other layers when possible; when
  stuck, the event owns the base color.
- Two acceptance criteria, both first-class: the OWNER sees their spells
  evolve in the direction they chose; a DEFENDER understands what an incoming
  projectile will do. Screenshot-verify in a headless browser (renderer
  changes are only real once seen).

## 13. Parked (do not implement)

- **Charged fireball** (hold Q, release to fire, possibly slowed while
  charging, a telegraphed big hit): a future mutation idea, maybe ember's
  someday. Recorded, not for this round.
- Teleporter pads; non-circular lava shapes. Re-evaluate the anti-focus pain
  after §3 + §11 ship.

## Verification & measurement plan

- Session A ships mechanics with tests + the AGENTS.md ritual; no balance
  battery yet (the spells are unmeasurable until Session C's bot support
  anyway; flag their numbers as provisional).
- Session B runs ONE battery at the end (not per-change): mixed element
  table (2 seeds), strategy study (2 seeds Hard + 1 Extreme), item ladder for
  amulet/ring. Targets: venom top-third-not-#1; midas-cdr and double-cdr out
  of degenerate territory (question J); no item's lv0 ladder seat below ~15%;
  momentum-rush archetype alive (well above its current 2.7%).
- Anything still degenerate after Session B: report options with numbers,
  don't freelance a redesign (Remi rules).

## Session split

1. **Session A (MAIN)**: §1 (delegate) → §4 haste → §3 swap → §2 lightning.
2. **Session B (MAIN)**: §5 midas mark → §6 momentum tiers → §7 venom →
   §8 ember → §9 sustain, then the single measurement battery.
3. **Session C (DELEGATE, own agent)**: §11 bots.
4. **Session D (DELEGATE, own agent)**: §12 visuals. §10 anytime.
