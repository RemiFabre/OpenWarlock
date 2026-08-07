# Round 12 — the change batch, as I understood it

*Remi's voice feedback, 2026-08-07. Per AGENTS.md convention: this is **my
interpretation** of a dictated batch — correct anything wrong before I build it.
Every ⚠️ is a trap I think will bite us; every ❓ is a decision I need from you.*

## Systemic changes (change how the whole game feels)

### S1 — Knockback becomes effectively constant
Today knockback scales with % HP missing (`KB_HP_FACTOR 0.385`). You want to
*test* constant knockback, at the value you'd currently get at **70% HP
remaining (30% missing)**, without ripping out the mechanic.

Implementation: keep the formula untouched, add `KB_CONSTANT_MISSING: 0.30`.
When set, the formula is fed `0.30` instead of the real missing fraction; set it
to `null` to restore today's behaviour. **One constant, one-line revert**, as
you asked.

⚠️ AGENTS.md scar: *"any global knockback change silently re-prices everything
built on top of it"* — round 10's KB cut buried gale and crowned sustain items.
Gale (`kbMult`), sustain items, and lava kill share all need re-measuring **in
the same commit**. Lava share is already drifting down (~37-39%); this will move
it again, probably up for healthy players and down for low ones.

### S2 — Stacks are private to whoever applied them
Reverses the earlier "shared stacks" decision. Frost stacks are currently shared
by *all* attackers; you now want each player to see and consume only their own.
Rationale you gave: shared stacks make your element's power depend on what
everyone else picked — too much variance.

~~⚠️ This is a real nerf to frost, needing a compensating retune.~~
**MEASURED WRONG, 2026-08-07 — no compensation applied, and none needed.** The
standard elemental study literally cannot see this effect: it gives each seat a
different element, so there is only ever *one* frost player, and with one
attacker shared and private stacks are provably identical (byte-identical
tables). A purpose-built frost-share lab found the real answer: **1 frost seat
7.8% → 7.8% (unchanged), 2 seats 20.8% → 17.0%, 3 seats 21.2% → 18.6%.** The nerf
is 2.6–3.8 points and *only* in multi-frost lineups — not the cliff I predicted.
Also worth recording: frost's apparent 29.4% → 15.7% collapse in the mixed table
is **displacement, not this nerf** — mosquito went 0% → 21.6% and took wins from
venom, gale and ember too.
*Lesson for the next agent: when a study's design can't express the variable,
its "no change" is not evidence. Build the lab that can.*
✅ It also makes the new mosquito (S3) coherent by construction, and it's the
right call for the same reason you gave.

### S3 — Mosquito, simplified
**Out:** the bite-arc on a third of the victim's body, and any other spell
doubling on it. You were explicit that cross-spell doubling is bad design
(it makes mosquito+lightning *the* meta), and killing it deletes a lot of code.

**In:** mosquito's fireball is a 1-damage, 0-knockback, double-rate sting that
places **one mosquito stack** on whoever it hits — the frost model. If your
fireball hits a target that already carries **your** stack, the stack is
consumed and, a few pixels before impact, **two of your normal fireballs**
appear slightly offset and land in quick succession. So every on-hit effect you
own procs **twice**: double frost, double venom, double midas.

Your framing, kept: rare but spectacular, and the offset means a perfectly
timed teleport can dodge the second ball — real skill expression.

⚠️ **Infinite loop risk:** the two spawned fireballs must NOT themselves apply
mosquito stacks, or the effect chains forever. Hard rule in code + a test. *Done
and test-locked.*

~~⚠️ This is a large net buff, to be paid for elsewhere.~~
**MEASURED WRONG, 2026-08-07 — nothing paid, and the old version was simply
broken.** With momentum excluded from the pool: berserker **0.0% → 18.6%** (avg
kills 1.0 → 10.6), stalker **0.0% → 1.0%** (kills 1.4 → 8.5). The bite-arc
mosquito was not "strong and fiddly", it was **unable to kill anybody**; the new
one sits *below* the 25% baseline. So the cdMult I pre-nerfed on spec
(0.55/0.5/0.45 → 0.75/0.65/0.55) was a guess against a phantom — it is left in
place only because the honest read is the next one:
⚠️ **Likely bot artifact, and AGENTS.md forbids number-buffing around those.**
Bots never deliberately re-target a marked victim, which is this element's entire
skill expression, so 18.6% is a floor and a human should score well above it.
**Remi's feel report decides mosquito's numbers, not the lab.** If it feels weak
in his hands, `cdMult` is the lever back.

❓ Do the two spawned balls each get full damage and full knockback? Assumed
**yes, two genuinely normal fireballs of yours** — implemented that way.
**Two implementation calls made deliberately** (say if you disagree, both are
one-liners): (1) only *your fireball* can cash the mark — a boomerang or
lightning landing on it does nothing, because letting other spells cash it would
quietly revive the cross-spell doubling you explicitly killed; (2) cashing
consumes the stack and does **not** re-arm it, so you must sting again — if it
re-armed, every sting after the first would fire two fireballs, which is a
permanent machine gun rather than "rare but spectacular".

### S4 — Items get levels instead of unlimited stacks
Today: buy any item repeatedly, effects pile up, each copy costs +20%. The
emergent meta was 4-5 boots and an untouchable speed threshold — unfun, and it
topped the leaderboard.

New: items work like spells — **levels 1/2/3, hard cap 3, same gold cost each
level**, with each level giving *less* than the last. Boots: **+15% / +10% /
+7%** (level 1 is already a nerf from today's +20%). UI: one icon with a small
level number, not three icons side by side. Different pedestal art per level is
welcome.

Design principle you stated, worth writing down: *let players chase one
dimension, but make breadth the better default.* Diminishing returns do exactly
that.

⚠️ **This may resurrect the gold-saturation artifact.** AGENTS.md: making items
stackable is what finally gave bot gold somewhere to go, and that instantly
revealed midas was strong all along (1% → 43-64%). Capping at 3 with flat cost
partially undoes that. Mitigating factor: S8 unlocks the power tier and we're
adding 4 elements, so there's more to buy. **Must re-measure, not assume.**

### S5 — Critical, reworked (and probably renamed)
You're not happy with it, and you noted the name is wrong. New design: every
fireball you **land** permanently increases your fireball damage by a flat
amount — **for the whole game, not just the round**. Damage only; knockback
stays normal. Level 1/2/3 increases the per-hit gain.

Feedback requirement (this is the actual fix): the damage number shows **base
damage, with the accumulated bonus above it in white.** AGENTS.md scar: *"a
correct mechanic with imperceptible numbers is a bug in practice"* — critical
already ramped exactly as designed and you still called it broken, because
+0.45/hit is invisible. Visibility is the feature.

⚠️ Removing the round reset makes this genuinely unbounded over a 25-round game.
At +1/hit with 100+ landed hits, late-game fireballs one-shot. I'll start at
+1/hit level 1 and let the arena tell us whether it needs a curve or a soft cap.
❓ Name — **Bloodthirst**? **Momentum**? **Tyranny 👑**? I lean **Momentum ⚙️**:
it says "this grows because you're winning", which is the fantasy.

### S6 — AI difficulty: four named tiers
Today's ★ is chaotic bots running nowhere — that's **Easy**, and it was never
what you asked for. Today's ★★ → **Hard**. ★★★ → **Extreme**. And a new
**Normal** between Easy and Hard.

Cheap correct implementation: Normal reuses the ★★ brain (AGENTS.md: ~0.21 s
reaction + aim from a lag-extrapolated stale observation + error floor) with a
**longer reaction window and a bigger aim error floor**. Same machinery, worse
parameters — no new AI to write.

Verification is non-negotiable here: `tools/h2h.js` must show a monotone ladder
(Extreme > Hard > Normal > Easy). AGENTS.md warns the mixed Elo table hides
exactly this kind of tier gap.

### S7 — Draft mode (toggle, default **off**)
When enabled: **half of all content** (spells, items, elements) is pulled out of
the shop entirely and becomes a **draft pool**. Every 3 rounds each player is
offered **3 roughly gold-equivalent options, free**. The offer sits at the **top
of the shop, unmissable**. The **first option is pre-selected by default**, so a
player who clicks nothing still gets something; clicking picks another. A drafted
item arrives at **level 1**, and further levels are bought normally in the shop
afterwards.

Your reasoning, recorded because it's the real design goal: with everything
always available, a single optimal build eventually calcifies into the meta.
Randomised availability makes *adapting* the skill being tested, keeps runs
fresh, and lets rare-but-spectacular combos live.

❓ Is the pool split **randomised per game** (fresher, each game distinct) or a
**fixed curated half**? I recommend randomised per game — it serves your stated
goal better. Server-authoritative either way.
⚠️ Details I'll handle unless you say otherwise: options never offer something
you already own at max level; bots auto-pick; the split must be identical for
every player in the lobby.

### S8 — Power tier available from round 1
Drop the `minRound: 5` gate on meteor / hook / repulse / mirror wall.

⚠️ **Genuine trap:** AGENTS.md says *bots pilot none of the power tier.* Unlock
it and bots will happily **buy** spells they can never cast — burning gold for
nothing and quietly tanking every difficulty tier and the whole co-op curve.
Fix before shipping: exclude the power tier from bot buy priorities (cheap), or
teach bots to pilot it (that's AGENTS.md debt item #2, the highest-value lab
work left — out of scope for this batch).

## New content

### N1 — Vampire 🧛 (new element)
Chases the lifesteal fantasy you think is under-exploited. **Every 3rd
fireball** carries ~**200% lifesteal**. Internal counter on *your* casts — no
need to re-hit the same target (unlike mosquito). Level scales… ❓ the lifesteal
%, or the frequency (every 3rd → 2nd)? I recommend **the %**, keeping the rhythm
readable at every level.
Numbers are placeholders to be arena-tuned: you want *visible* — rare is fine if
it's memorable. Needs a loud visual + sound on the empowered ball.
⚠️ Interaction to bound: vampire + mosquito means a 1-damage sting healing on
almost nothing, and vampire's ball doubling. Lifesteal is on damage *actually
dealt*, so it self-limits, but it needs a test.

### N2 — Chronos ⏳ (new element)
Every spell of yours that **hits an enemy** refunds **0.5 / 1 / 1.5 s** off
**every cooldown currently running**, and it **stacks per enemy hit** — repulse
into 4 players = 4× the refund. It applies to the spell that just hit, too, so
some builds get a near-instant fireball back.

The build you're imagining, recorded: level 1 of *everything* — boomerang,
lightning, fireball, repulse, hook — and machine-gun them, using repulse's AoE
to refund the whole kit. Rise, circa 2013.
✅ Distinct from arcane 🔮 (flat global CDR) because it's earned on-hit, not
passive. They *will* stack into something absurd — which is what you asked for.
⚠️ Refunding the just-hit spell to ~zero cooldown risks a same-frame re-cast
loop. Needs a minimum floor per spell, plus a test.

### N3 — Ghost 👻 (new element) — piercing fireball
The ball passes **through** players instead of stopping. First victim: exactly a
normal fireball. Anyone hit **after** the first takes **bonus damage and bonus
knockback**. Level scales **how big that bonus is**, deliberately *not* per
victim, so a lucky 4-player line can't produce a nonsense number.
✅ Cheap to build: boomerang already implements "one hit per enemy per throw" —
we reuse that set, plus a `pierce` flag.

### N4 — Invisibility (new spell)
No restrictions for now: you simply go invisible. Level scales duration only,
linearly: **0.75 / 1.5 / 2.25 s**.

⚠️ **Must be hidden on the wire, not in the renderer.** If the server keeps
sending your position and the client just skips drawing you, anyone with devtools
sees through it. Server stops sending the position; you still see yourself.
⚠️ Bots read game state directly, so they'd see invisible players for free. Bot
perception has to be masked too, or Extreme becomes an aimbot that ignores your
spell.

## Not in this batch (agreed)
- **Co-op rework.** You called the current state weak — too many enemies, not
  enough diversity. Real work, deserves its own round.
- **Reducing the roster for new players.** Superseded by S7, which attacks the
  same problem from a better angle.

## Suggested sequencing

**12a — systems** (S1, S2, S4, S6, S8 + frost retune + the bot-buy fix). All
five change how the existing game feels. Ship these alone so your feel report
isn't confounded by new content, and so we can re-measure lava share, gale,
sustain, and the difficulty ladder against a stable roster.

**12b — content** (S3, S5, N1-N4, S7). Four elements, a spell, a rework, and
draft mode. This is where the element/spell registry refactor pays for itself —
see [VERSIONING.md](VERSIONING.md) tier 2: making it cheap for *us* to add an
element is the same work as letting the community add one.

Splitting also keeps each playtest interpretable, which matters more than usual
here: 13 changes at once and we'll never know which one you liked.
