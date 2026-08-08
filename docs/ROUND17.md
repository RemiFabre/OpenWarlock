# ROUND 17 — the work order (dictated by Remi, 2026-08-08)

*Voice-dictated in French right after the round-16 context diet; transcribed
and structured by the round-16 agent. Interpretation calls on garbled passages
are flagged `⚑ interpretation`. The **“Outgoing agent’s opinion”** blocks are
NOT Remi’s words — they are the round-16 agent’s intuitions and first values
to try, written while its measured context (35k games) was still in memory.
Treat them as informed guesses to verify, never as rulings.*

*Execution note (context policy): this is 3-4 sessions of work, not one.
Suggested split at the bottom. Read AGENTS.md first; grep `docs/history/`
only when a specific number is needed.*

## ⚑ STATUS UPDATE (same day, second dictation): APPROVED

Remi reviewed this document and **approved every “Outgoing agent’s opinion”
below** — read those blocks as the chosen direction and their first values as
the values to implement first (still: measure, don’t trust). The second
dictation also added three things, folded in below:

- **§5b — the venom redesign** (his ruling on the element this doc had left
  open);
- **§11 — a projectile identity & visual-evolution pass** (a full work item,
  its own agent);
- **ember nerf approved**: `dmgAdd [2, 4, 6] → [2, 3, 5]` as the first try —
  and “per-fireball damage evolving a bit less overall” is acceptable to him.

### Delegation rules (Remi)

Each section is tagged **MAIN** (the principal agent does it — interdependent
judgment) or **DELEGABLE** (may go to a subagent). Subagent constraints:

- **Opus-class model or better, always.**
- Subagents obey the same anti-bloat law as everyone: **no flood of useless
  comments, no exaggerated/over-engineered code** — match the codebase’s
  existing density and idiom; the CONTEXT POLICY in AGENTS.md binds them too.
- The principal agent reviews every subagent diff before committing.

---

## 1. Co-op: mothball it (P0, trivial) — DELEGABLE

Every agent keeps sinking energy into co-op even though, as it stands, **it is
not fun to play**. Remi will redesign it properly himself someday. Until then:

- Remove co-op from the lobby rules toggle (classic ⇄ elemental only). Keep
  the code, the campaign data and the tests (they are cheap and stop the mode
  from rotting) — just make it unreachable from the UI, marked “under
  construction”.
- Corollary for future agents: **stop re-measuring/re-tuning co-op** unless a
  change breaks its tests.

> **Outgoing agent’s opinion**: agree, and cheap. Keep `tools/coop.js` and the
> coop vitest/harness coverage green (they cost seconds and protect the code
> for the future redesign); drop the “re-run coop --levels in the same commit”
> rule down to “only if its tests break”, and note that in AGENTS.md.

## 2. Lightning rework: a telegraphed bolt from the sky (P0, the big one) — MAIN

Replace the instant short-range hitscan entirely. New design:

- **Long-range, dodgeable, falls from the sky** — mechanically the meteor:
  click a spot → the impact zone indicator appears INSTANTLY → after a fixed
  delay the bolt strikes.
- **Moderate damage, moderate pushback**, and both **scale with proximity to
  the zone’s center** — a perfectly-placed bolt is more rewarding than a
  grazing one.
- **Pushback is radial from the bolt’s center** through the victim. This is
  deliberate gameplay: the classic play is bolting someone swimming back from
  the lava — but if the swimmer repositions to the far side of the indicator,
  the same bolt shoves them back ONTO the platform. Remi loves this emergent
  double edge; do not “fix” it.
- **Small impact zone** — his intuition: “about a level-1 fireball” in radius
  (⚑ he flags himself unsure; maybe too small). **Delay ≈ 0.5 s** between
  indicator and strike.
- **Design ruler**: a human reacting at ~0.2 s, wearing boots, should be able
  to escape a bolt centered exactly on them. (⚑ the dictation garbled which
  boots level; read it as “with boots”.) Do NOT balance the dodge window
  against bots — reaction time is meaningless to them.
- **Intended combo**: frost’s stun should guarantee (or nearly) a centered
  bolt. That is a feature.
- **Per level**: cooldown, damage, pushback may all improve; the bolt’s color
  shifts slightly per level. **Delay and impact radius NEVER change with
  level** — keep those constant.

> **Outgoing agent’s opinion — feasibility & first values.**
> - Implementation is low-risk: `state.meteors` already does telegraph →
>   delayed radial AoE; clone that path with falloff. Expect most of the work
>   in the client (indicator, per-level tint, strike fx) and in the TESTS
>   (many lightning tests assume hitscan).
> - **Dodge math** (from constants): base speed 11 u/s, boots lv1 ≈ 12.7,
>   lv3 ≈ 15.6. With delay 0.5 s and reaction 0.2 s you get 0.3 s of escape:
>   3.3 u bare, ~3.8 u boots lv1, ~4.7 u lv3. A “fireball-sized” zone
>   (effective radius ≈ 2.2 u vs a 1.4 u body) is escapable even bootless with
>   ~0.1 s to spare — that matches “dodgeable, boots make it comfortable”, and
>   it makes the frost combo the real kill line, as intended. **First try:
>   radius 2.2, delay 0.5, damage 12 center → 6 edge (linear), knockback 70
>   center → 35 edge, cooldown 6 s, costs unchanged (10+6+6); per level
>   damage 12/15/18 and kb 70/78/86 at center, cooldown 6/5.5/5.**
> - **A sky strike ignores pillars and mirror walls** (nothing blocks it).
>   That is a big niche change — lightning becomes the anti-cover tool instead
>   of the finisher — and probably desirable, but say it out loud in the
>   patch notes so it is a decision, not an accident.
> - ⚠ **The lab is blind to this spell until bots handle telegraphs.** No bot
>   dodges a ground marker today (the stalker dodges projectile RAYS), and no
>   bot leads a 0.5 s delay. Ship the rework together with §7’s minimal bot
>   support (place at predicted position; step out of markers) or every
>   measurement of it will be garbage — the round-12 scar about labs that
>   can’t express the variable.
> - The old lightning is load-bearing in bot builds (`sniper`, several
>   strategy-study cores) and in `pilotOwnedSpells`. Rewrite the pilot logic
>   in the same commit or those builds crater in the tables for a fake reason.

## 3. Hook rework: the position swap (P0, small and delicious) — MAIN

Replace the yank with an **inversion**: a projectile; on impact, **the caster
and the victim swap positions at that instant**.

- The fantasy: you are mid-launch into the lava, you fire it, it connects —
  now THEY are on the lava trajectory and you are safe on the platform. A
  defensive/outplay tool, “very fun to play”.
- **Special sound** on the swap (it is an event).
- Deals **1 damage** — solely so a subsequent lava death credits the caster
  (the existing last-hitter window handles the rest).

> **Outgoing agent’s opinion.**
> - **Swap velocities too, not just positions** — otherwise the caster keeps
>   their own lava-bound momentum from the new spot and the fantasy breaks.
>   A full state exchange (x, y, vx, vy; clear both `moveTarget`/`dash`/
>   `charging`) reads as “we traded bodies” and makes the lava save actually
>   work. Test that exact scenario.
> - Reuse the hook projectile shell (speed 38, range ~34-44) and its costs
>   (20+8) as the starting point; level 2 buys cooldown and maybe range.
> - Name suggestion: **Swap** (icon 🔁 is taken by echo — try ⇄ or 🔀).
> - Bots cannot use this well; it will measure at the do-nothing control.
>   Fine — flag it, don’t buff it for that. One cheap bot heuristic exists:
>   “my velocity points into lava and is large → cast at nearest enemy” (§7).
> - Edge cases to test-lock: swap during the victim’s dash/charge, swap with a
>   vanished player (position reveal is fine — dying reveals too), swap must
>   not trigger knockback or on-hit riders (it is not a fireball).

## 4. CDR → Ability Haste (P0, systemic fix) — MAIN

The measured CDR degeneracy (multiplicative stacking; cast frequency explodes
as cooldowns approach zero) gets the League of Legends fix: **replace
cooldown-reduction percentages with Ability Haste** — same formula family as
armor: `effective cd = base / (1 + haste/100)`, haste **adds** across sources,
so cast FREQUENCY grows linearly and the knob becomes balanceable.

- **Keep arcane lv3’s flat refund mechanic** — strong combos are a fantasy
  Remi wants possible. He is explicitly not shocked by a late-game build that
  nearly resets its fireball on every hit. Balance around it, don’t delete it.

> **Outgoing agent’s opinion.**
> - Straightforward: `haste` becomes an ADD field in `itemBonuses`
>   (`shared/items.js`), `castSpell` divides instead of multiplying. Convert
>   at equal value then round: hourglass `cdrMult [0.9, 0.81, 0.72]` →
>   **haste +10/+22/+38 (all spells)**; arcane lv1/2 `[0.85, 0.72]` →
>   **fireball haste +18/+39**. At today’s two sources this is nearly neutral
>   (additive 77 haste ≈ ×0.56 vs multiplicative ×0.52) — the win is that a
>   THIRD source can now exist without detonating the game.
> - Prediction to verify: haste-linearization plus §5’s midas gating pulls
>   `double-cdr` from 49% to ~35-40% and is half the fix for `midas-cdr`
>   (86%). Re-run the strategy study after; open question J may close itself.

## 5. Stacking mechanics — midas & momentum (P0, needs the most judgment) — MAIN

Remi’s diagnosis, systemic: **linear per-hit scaling turns super-linear when
the scaled resource has second-order effects** (enough gold → buy everything;
enough damage → win everything), and it is amplified because some builds push
fire rate too high and bots trade hits far too often. Hence the whiplash:
momentum needed a 3× nerf and is now “extremely weak” as a rush (2.7%!), midas
is an auto-win engine. **Both verdicts: momentum must be BUFFED, midas
probably nerfed — but keep the infinite-stacking fantasy alive** (Veigar,
Nasus, Aurelion Sol energy). The +1 g popup on hit feels GREAT; keep the feel.

Ideas he put on the table (pick/measure, he has no fixed ruling):

1. **Gate the payout behind lv3** (midas’s +1 g/hit, maybe momentum’s ramp,
   become the capstone — more setup). Downside: the archetype only comes
   alive late; lv1/2 need a reason to exist.
2. **Consecutive-hit gating**: the on-hit only pays when you hit **the same
   target twice in a row** — a rate limiter with targeting texture.
3. **Tiered evolutions (“mini-quests”)**: e.g. 4 tiers, ~50 landed hits each;
   each tier the ball visibly changes (color) and the bonus steps up. Pros:
   full control of the curve’s shape, bounded tail, visible progression.
   Cons: opaque numbers, needs quest-progress UI.
4. **Systemic**: globally lower cast frequency (fire rates are too high
   across the board), which deflates every per-hit scaler at once.

> **Outgoing agent’s opinion — the shapes I’d try first.**
> - **Midas → the mark (idea 2), at every level.** Implement it with the
>   existing private-stack store (the frost/gale/mosquito machinery): first
>   hit on a target plants a 🪙 mark, the next hit on that SAME target cashes
>   **+1 g** and clears it. Halves the income rate, adds a real decision
>   (“stay on my marked target”), keeps the beloved popup, and the pip UX is
>   already proven. Levels can buy the buyback of the damage penalty exactly
>   as today. **Prediction: with §4’s haste fix this takes `midas-cdr` from
>   86% into the 40s** — then trim, don’t redesign further.
> - **Momentum → tiered evolutions (idea 3).** It is the one element whose
>   fantasy IS the visible arc, and the tier cap fixes the tail that forced
>   the 3× nerf. Key measured fact to design against: a bot carrier lands a
>   **median 172 fireballs/game** (humans: guess 60-120, verify). First try:
>   permanent tiers at **40 / 90 / 150 landed hits**, ball damage
>   **+2 / +5 / +9** (cumulative, on the 7-damage ball), drop the 0.8 early
>   penalty entirely, ball color shifts per tier, and show `hits until next
>   evolution` where the white bonus number already lives. Element levels
>   1/2/3 can buy the tier bonuses up (e.g. +2/+5/+9 → +3/+7/+12). This is a
>   real buff at the median AND a hard cap on the degenerate tail.
> - **Do NOT reach for idea 4 (global fire-rate nerf) yet** — it re-prices
>   every element and item at once (the round-16 scar: a retune of X is a
>   stealth retune of everything priced against X). Try 2+3 first; they are
>   local.
> - Whatever ships: **re-sweep venom, ember and the strategy study in the
>   same session.** Venom (92% single-element) is still the #1 element
>   outlier and Remi did not address it in this dictation — raise it with him
>   or fold it into this pass (my measured note: tick-size nerfs don’t work;
>   the stacking is the lever — consecutive-hit gating à la midas would fit
>   venom too and would unify the design language).

## 5b. Venom redesign (RULED, second dictation) — MAIN

The stacking tick (re-hits refresh the clock AND grow the tick toward
`stackCap`) is the problem: land 4 hits in a row and the DoT is monstrous,
land one and it is negligible — inherently hard to balance, and it is what
kept venom at 92% through every tick-size nerf.

**The new identity: the kill-stealer.** A sneaky build — less raw damage than
the pure-damage axes, but its DoT keeps ticking after you disengage, and the
existing credit rule (a lethal poison tick takes the kill, even in lava) means
venom collects kills other people set up. Remi: “essayons ça”.

- **Remove tick stacking entirely** (`stackAdd`/`stackCap` are deleted):
  re-hits only REFRESH the duration.
- Since stacking is gone, **buff the tick**: first try
  `tickDmg [1, 1.5, 2] → [2, 3, 4]`. Keep the −15% direct-damage penalty and
  the ground trail as they are.
- **Verification pass required**: mixed table + strategy study. Target: venom
  leaves the 90s and lands in the top third without being #1. The lethal-tick
  credit rule and the “DoT never stamps last-hitter” rule are test-locked —
  do not touch them, they ARE the identity now.

## 6. Element / Mutation split (P1) — DELEGABLE (approved: presentational only)

The roster is drifting into two natures: **basic axes** (ember/terra/gale/
arcane/ghost — one ball stat, lv3 special) vs **gameplay changers** (mosquito,
vampire, midas, venom…). Ideas aired: make changers single-level (Remi
*dislikes* this — he likes maxing venom/vampire as a fantasy), find a second
name for the changer category (he asks for suggestions), and one new changer
concept: **a “bullet” ball — no pushback at all, big damage** (a rifle shot
instead of a fireball).

> **Outgoing agent’s opinion.**
> - Keep all elements 3-level (the uniform shop grammar is load-bearing and
>   the max-one-axis fantasy is exactly what the strategy study measures
>   well). Make the split **presentational only**: two labeled shop rows.
>   Naming suggestion: keep **Elements** for the stat axes, call the changers
>   **Mutations** (fits “your fireball becomes something else”; alternatives:
>   Pacts, Curses, Aspects).
> - The bullet: fun and cheap to add as a mutation. First try:
>   `dmgMult ×1.6/×1.85/×2.1, kbMult ×0.15` (not 0 — a zero-push ball can’t
>   interrupt anything and will feel dead). ⚠ It stacks with momentum (both
>   damage-only) — measure that pair explicitly before shipping.

## 7. Bots: stochastic focus + pilot the kit (P1) — DELEGABLE (its own session/agent)

Two pains: **being rushed by 1-2 AIs from the first second is miserable**
(near-unplayable at 2), while leader-focus as a comeback force is good and
should stay. And bots still can’t use half the kit.

Remi’s proposal: **stochastic target prioritization** — periodically, the AI
re-picks its focus from a probability distribution weighted by proximity,
victim’s missing HP (finish the wounded), kill lead (pressure the leader), and
**“carries MY stacks”** (frost/gale/mosquito/midas-mark setups want to be
cashed). He thinks it is a realistic implementation axis and explicitly wants
it **delegated to a separate agent**. Also: teach bots the pillar, the new
lightning (including dodging telegraphs), and any other cheap wins.

> **Outgoing agent’s opinion.**
> - Right shape, and the codebase is ready for it: `pickPrey` is already a
>   weighted score with `leadPull`; turn the argmax into a **softmax draw**
>   re-rolled on the existing `_botT` decision clock, weights in
>   `BOT_TARGETING`, temperature = the “how extreme” lever Remi asked for.
>   The my-stacks term reads straight out of the private-stack store.
> - Verify after: h2h ladder (must stay 100/99.5/100), comeback rate, and a
>   new cheap metric worth adding to arena.js — **“seconds under multi-focus
>   in the first 20 s”** — since that is the pain being fixed.
> - Priority order for piloting: telegraph-dodge (mandatory with §2),
>   telegraph-placement for the new lightning, pillar-when-focused, the swap
>   lava-save heuristic. The stack-cashing targeting handles the elements.
> - This is AGENTS.md debt #1 finally becoming tractable — one dedicated
>   session, clean context, its own commit.

## 8. Map / anti-focus brainstorm (P2, ideas only — no commitment) — PARKED

Teleporter pads? Lava that carves non-circular shapes as it shrinks? Both are
just brainstorm; the underlying desire is **give the focused player
counterplay** (the swap spell is one answer; pillars and shield are others).

> **Outgoing agent’s opinion**: defer non-circular lava hard — `hypot(x,y) >
> arenaRadius` is the lava test EVERYWHERE (sim, bots, labs, client); it is a
> cross-cutting refactor for unproven fun. Teleporter pads are feasible (a
> fixed pair, blink-with-cooldown, bots can learn “focused & near pad → take
> it”), but I’d ship §3 + §7 first and re-ask whether the pain persists.

## 9. Transparency & sustain items (P1, part of Remi’s balance pass) — MAIN

- **No hidden mechanics.** The regen lock (regen ×0.25 for 2.5 s after taking
  damage — and yes, lava damage triggers it too) must be stated in-game,
  briefly, on the things it affects (ring/amulet descs, stats panel): e.g.
  *“after taking damage, your regen pauses for ~2 s”*.
- Passive-regen numbers should stay **modest**; the ACTIVE sustain path
  (lifesteal — requires landing hits and taking risks) must clearly out-heal
  passive play when you connect. His scoreboard impression: passive regen
  totals often exceed lifesteal totals, and sustain items’ win rates are
  persistently high.
- **The ruling that unblocks it all: “no item should be mandatory by win
  rate.”** This finally answers the round-13/15 open question A — the
  amulet/sword outlier may now be nerfed. Remi will drive the pass; he wants
  suggested values.

> **Outgoing agent’s opinion — first values for the pass.**
> - Measured target: on the level ladder (`--ladder=`), a seat FORBIDDEN an
>   item should not fall below ~15% (amulet lv0 sits at **0.2%** today).
> - First tries: amulet `maxHp [25,43,56] → [18,32,42]`; ring
>   `regen [0.7,1.2,1.55] → [0.5,0.85,1.1]`. Leave the sword alone initially
>   — with the green +N popup shipped and regen trimmed, lifesteal wins the
>   in-fight comparison naturally; re-measure before touching it.
> - Simplification worth taking while editing the text: make the regen lock a
>   FULL stop for 2.0 s instead of ×0.25 for 2.5 s — near-identical value,
>   and it becomes a one-line human sentence. Re-check the round-1
>   first-death median (~31 s) after, it is the number the lock exists for.
> - ⚠ Sequencing: do §9 in the SAME session as §5’s re-measures or in a
>   session right after — sustain nerfs shift every strategy-table number.

## 10. Standing rulings recorded from this dictation

- **Lava kill share (open question C): no ruling needed.** The falling share
  is not a problem per se; keep reporting the metric every round. He is glad
  lava is no longer certain death — swim-back gameplay is wanted.
- **Co-op is officially out of scope** until Remi redesigns it (§1).
- **“No mandatory items”** is now the item-balance target (§9).
- The stacking fantasy (infinite/visible scaling) is protected design intent;
  nerf its RATE and SHAPE, never delete it (§5).
- Strong late-game combos (e.g. near-certain fireball reset on hit) are
  desired fantasies, balanced not banned (§4).

## 11. Projectile identity & visual-evolution pass (P1) — DELEGABLE (its own agent)

Many things now modify the fireball and the combinations are getting hard to
read. A full visual pass, with one core principle:

- **Modifications must be visually ADDITIVE and stackable.** Each modifier
  contributes its own layer — particles, trails, tint accents — rather than
  replacing the ball’s look, so two effects mixed stay legible and the player
  can SEE the impact of each choice they made.
- **Momentum’s quest must be visible on the ball itself**: each evolution
  tier adds something countable — extra flame-trails / more particles — so the
  trail literally shows your tier. (Find one nice, unique representation.)
- **Punctual event-balls take priority when layers conflict** (a color can’t
  be two colors): vampire’s engorged ball should be unmissable — an intense
  red — and mosquito’s near-harmless sting must look clearly different from a
  real fireball. Ideally an event-ball carries the other layers with it;
  when stuck, the event wins the base color.
- Two goals, both first-class: **(a) the owner’s satisfaction** — you watch
  your spells evolve in the direction you chose; **(b) the defender’s
  clarity** — you understand what an incoming projectile will do to you.

> **Outgoing agent’s note**: `client/render.js` already tints per element and
> draws vampire 🧛 / ghost rings — the pass should unify those one-offs into
> one layered system (base ball → element accents → evolution particles →
> event override). Screenshot-verify in a headless browser: the “pip under
> the HP bar” scar says renderer changes are only real once seen.

## Suggested session split (context policy)

1. **Session A (mechanics, MAIN)**: §1 co-op mothball (delegate) → §4 haste →
   §3 swap → §2 lightning (biggest last, with its minimal bot support).
   Tests + ritual.
2. **Session B (balance, MAIN)**: §5 midas/momentum shapes + §5b venom +
   ember `[2,3,5]` + §9 sustain values — then ONE strategy-study battery at
   the end, not per-change.
3. **Session C (bots, DELEGATE — own agent)**: §7 stochastic focus + kit
   piloting, verified against the ladder and the new focus metric.
4. **Session D (visuals, DELEGATE — own agent)**: §11 projectile identity
   pass, screenshot-verified.
5. §6 shop grouping (small, delegate anytime) and §8 stay parked until Remi
   reacts to A+B.
