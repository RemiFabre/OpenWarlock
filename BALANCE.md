# Balance addendum — round 11 (2026-08-06)

*~25,000 games on top of report #4 (which follows below and is still the
reference for everything this addendum doesn't touch). Round 11 changed the
economy, two elements, one spell and the ★ bot, so the report-#4 tables for
those are superseded by the ones here.*

## Finding A — stackable items deleted a two-month-old measurement artifact

Report #4 (and #3, and #2) all carried the same caveat: **Midas measured ~1%
and I kept saying it was a bot artifact** — gold-saturated bots finish their
shopping list by round 6 and then sit on 250+ unspendable gold, so an
economic element measures as pure downside.

Round 11 made items repeatable (each copy +20%, per Remi). That gave gold
somewhere to go, and the artifact evaporated in one run:

| | before stacking | after stacking |
|---|---|---|
| average end-of-game gold | 60–80 | **14–15** |
| Midas win rate (3 tiers) | 0.5% / 1.3% / 1.8% | **43% / 59% / 64%** |

Same element, same numbers, opposite verdict. Remi's human read ("Midas felt
very strong, especially with Earth") was right all along and the lab simply
could not see it. **Lesson for the next campaign: before believing a
"bot artifact" explanation, check whether the artifact can be removed.**

Midas then needed two real nerfs (it is now capped at +1 g per hit forever,
with a damage/push penalty the levels only partly buy back): 43/59/64% →
13/24/52% → **13/11/37%**.

## Finding B — round 1 was mathematically unkillable

Remi: *"round 1 is completely different from the rest — whatever we do our
fireballs are useless, kills only happen at the very end when the ring is
tiny. After round 1 the game is interesting."*

Measured across 60 games, median time to the first death of the round:

| round | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| before | **51.9 s** | 31.4 s | 19.8 s | 20.5 s | 22.0 s |
| after | **31.3 s** | 25.4 s | 18.5 s | 18.0 s | 18.4 s |

The cause was not "lv1 fireball is weak" in isolation — it is the ratio
against passive regen. A lv1 fireball was 5 damage on a 2.1 s cooldown =
**2.38 dps if every single shot lands**, against **1.2 hp/s of regen**. Two
players trading lv1 fireballs could not kill each other at all; only the
closing lava could. Every later round hides this because someone has bought
fireball lv2 (4.86 dps), which is exactly why Remi felt it in round 1 and
nowhere else, even when he personally skipped the upgrade.

Fixed in two places: lv1 damage 5 → 7, and **regen is throttled to 25% for
2.5 s after taking damage** so landed hits stick. The second one also answers
report #4's open question 2 (ring/regen being un-nerfable by price).

## Finding C — Critical was implemented correctly and still felt broken

Remi thought the element was bugged or misimplemented. It wasn't: it ramped
within the round exactly as specified. It was just far too shallow to
perceive — +0.45 damage per landed hit, so eight consecutive hits took a
fireball from 4.25 to 6.9 damage, i.e. still worse than a plain fireball for
the first two hits.

Rebuilt to the intent ("if you've survived a long time your fireballs are
truly destructive"): start at 65% power, big step per landed hit, 15-stack
cap. Measured point-blank ramp is now 4.6 → 10.0 damage over 8 hits (push
42 → 70). **A correct mechanic with imperceptible numbers is a bug in
practice** — the fix was numbers plus a HUD readout of the stack count.

## Finding D — Mosquito needed three passes to stop being a cannon

The new element (sting for 1 at double fire rate, leave a bite on a third of
the victim's body, cash the bite in with any other spell for double damage):

| version | berserker-tier win rate | why |
|---|---|---|
| v1: up to 6 bites | **93.1%** | 3 non-overlapping bites tile the whole body, so *every* shot cashed in → ~4× fireball dps with no setup at all |
| v2: 1 bite per attacker | 56.2% | still a self-feeding sting→cash→sting loop on a half cooldown |
| v3: + bite must swell 0.5 s, + self-cash costs the fire-rate bonus | **28.8%** | the payoff now has to come from a *setup*, which is the design |

Both guards are deliberately aimed at the self-loop only; comboing a bite
with your **other** spells — the actual point of the element — is untouched.

## Finding E — the ★ grunt is now a chaos control, not a difficulty tier

Per Remi, the easiest bot is now genuinely random: it walks to random points
and fires at random bearings, with one instinct (don't drown). That makes the
head-to-head ladder absolute — **★★ beats ★ 100%/0%, ★★★ beats ★★ 100%/0%** —
and it means **the grunt-tier tables are no longer a balance signal**. Read
the berserker and stalker tiers for element balance; the grunt tier now only
answers "what still works when nobody aims".

## Round-11 element table (900 games per tier, 9 elements, 25% baseline)

| Element | ★★ berserker | ★★★ stalker |
|---|---|---|
| venom 🐍 | **37.1%** | 33.8% |
| terra 🪨 | 25.8% | **41.6%** |
| midas 🪙 | 11.3% | 37.3% |
| mosquito 🦟 | 24.0% | 34.6% |
| arcane 🔮 | 30.8% | 16.9% |
| ember 🔥 | 28.5% | 10.9% |
| frost ❄️ | 23.2% | 16.1% |
| gale 🌪️ | 22.9% | 13.1% |
| critical 💢 | 21.2% | 20.6% |

Spread 10.9–41.6% with legible affinities. Two caveats before anyone tunes
further: **mosquito's number is a floor** (bots never deliberately aim at a
bite arc, which is the whole skill of the element), and **critical's is too**
(bots don't preserve a ramp they can't perceive). Both should be judged by
human play.

Health metrics after all of the above: lava kill share **37.5%** (down again
from 47.3% — see report #4 open question 1, still unanswered and now more
pressing), comeback rate 11.9%, zero unfinished games.

---

# Balance report #4 — the round-10 campaign

*2026-08-05. ~58,000 headless games via `tools/arena.js` and the new
`tools/h2h.js`, across five measure-change-remeasure iterations (rerun
commands at the bottom). This report supersedes report #3 in full: every
number below was re-measured on the locked round-10 build. Report #3 (21k
games, 2026-08-03) and report #2 (46k games, v5) live in git history at
`ab48932` and `9a96b47` — their tables are obsolete, the *lessons* in them
are not.*

**One-line summary:** round 10's feel changes (softer low-HP knockback,
escapable lava, poison ticks, bot reaction time) pushed the game from
*knockback-execution* toward *attrition*, which quietly crowned the sustain
items; they were trimmed twice, and the lava kill share fell from ~68% to
**~47%** — the one number in here that needs a human ruling, not a lab one.

---

## How to read this report (start here)

Games are 4-player free-for-alls, so **every percentage has the same
baseline: 25%**. A strategy or item at 25% is perfectly neutral; the further
from 25%, the stronger the signal.

| Metric | What it means | Neutral | Worry when |
|---|---|---|---|
| **win rate** | how often it finished 1st of 4 | 25% | > ~45% (dominant) or < ~10% (trap) |
| **Elo** | rating from *pairwise placements* — finishing 2nd still beats the two below you, so it is far more stable than win rate | 1000 | gaps > 150 **within** one difficulty tier |
| **avg-place** | mean finishing position, 1–4 | 2.5 | — (sanity check on win rate) |
| **lava kill share** | share of deaths that happened in the lava rather than to direct damage | — | see the open question below — the target moved this round |
| **comeback rate** | share of games where the eventual winner was ≥4 kills behind at some point | — | near 0% means games are decided too early |
| **h2h win%** | in `tools/h2h.js`, two seats of tier A vs two of tier B: each side's neutral share is **50%** | 50% | used only to check the ★/★★/★★★ ladder |

**Strategy = difficulty × build.** `stalker/sniper` means the ★★★ combat
profile playing the lightning-first shopping list. What each difficulty does
and what each build buys is charted in **`STRATEGIES.md`** — read that first
if the codenames (bruiser, boomer, turtle…) mean nothing to you.

**Four instruments, four different questions:**

- **Mixed study** (all 21 strategies together) — the big picture. It mostly
  measures *piloting skill*: every stalker build outrates every berserker
  build. Never use it to compare builds.
- **Mirror study** (`--mirror=stalker`) — all four seats are the SAME
  difficulty, only builds differ. This isolates the shopping question and is
  the primary build-balance instrument.
- **Item probe** (`--probe=berserker`) — all seats same difficulty AND same
  build tail; only the *first purchase* differs. This kills the survivor bias
  in "winner-held" item tables (items bought late are mostly held by players
  who were already winning).
- **Head-to-head** (`tools/h2h.js berserker grunt`, new this round) — two
  seats of each difficulty in the same game. The mixed Elo table dilutes the
  tier question across lineups; this answers it directly.

**The caveat that explains most weird numbers:** bots extract far less value
from *reactive* tools than humans do — teleport saves, shield timing,
boomerang catches, and all four power spells (bots pilot **none** of the
power tier). A bot-trap is not automatically a human-trap. Those cells are
flagged below, not nerfed into oblivion.

---

## What changed going into this campaign

Remi's 2026-08-05 playtest notes, all implemented before measuring (player-
facing changelog in `REMI_NOTES.md`):

| Change | Old → New |
|---|---|
| Low-HP knockback (`KB_HP_FACTOR`) | 0.55 → **0.385** (−30%) |
| Lava movement | +30% → **×2 speed** (swimming is a real escape now) |
| Poison (venom) | continuous 4/7/10 dmg over 4 s → **discrete 1 tick/s for 5 s**, re-hits refresh the clock *and* stack the tick, **a lethal tick takes the kill** |
| Midas | +1/+1/+2 g per hit, −10% dmg → flat **+1 g**, lv3 pays **+2 g on the first hit of each enemy each round**, −15% dmg |
| Arcane (CDR) | −10/−18/−25% → **−10/−19/−28%**, and 🔮 now badges every owned spell slot |
| **New element: Critical 💢** | — → every fireball you *land* this round ramps the next ones (+dmg +push, capped at 20 hits, resets each round), −15% base dmg |
| Repulse | fully spell-locked while charging → **Teleport and Rush still work** mid-charge (and repulse can start mid-dash) |
| Hook | invisible projectile, victim landed flush against you → **visible chain + 🪝 head**, victim lands a full body *behind* you |
| Lifesteal (Blood Sword) | healed on raw damage incl. overkill → heals on **damage actually dealt**, all sources incl. DoT, never lava (5 new tests lock the rule) |
| Bot ★★ berserker | 0.14 s decisions, distance-proportional aim error | **~0.21 s decisions + reaction-lag aim + absolute error floor** |
| Sustain items (mid-campaign, see Finding 1) | sword 25% @14 g, ring 0.9 HP/s @10 g → **sword 18% @15 g, ring 0.7 HP/s @12 g** |
| Gale (mid-campaign, see Finding 3) | 1.18/1.32/1.45× push, −5% dmg → **1.22/1.38/1.55×, no damage penalty** |

---

## Finding 1 — the feel changes made attrition king (trimmed twice)

The first 12,900-game sweep on the round-10 build showed the sustain items
running away with the game. In the de-confounded item probe (only the *first*
purchase differs, so this is not survivor bias):

| First purchase | win% before the trim | (baseline 25%) |
|---|---|---|
| Blood Sword | **61.3%** | |
| Ring of Regeneration | **59.2%** | |
| Lava Treads | 12.5% | |
| Boots of Speed | 11.3% | |
| *nothing* (control) | 10.4% | |
| Amulet of Health | 10.0% | |
| Cape of the Magi | 8.8% | |

**Why it happened — the mechanism, not the numbers.** Two round-10 changes
both push the same direction: −30% low-HP knockback means a wounded player is
much harder to *launch*, and ×2 lava speed means the ones you do launch swim
back out. Fights therefore last longer, and in a long fight healing per
second compounds while burst damage does not. This is the same shape as
report #3's Finding 1 (the lava −30% retune crowned sustain then too) — the
lesson repeats: **whenever knockback or lava gets weaker, sustain gets
stronger, and it needs re-checking in the same commit.**

**What was done.** Two gentle steps rather than one big swing, re-measured
between them: sword 25% → 21% → **18%** lifesteal (cost 14 → 15 g), ring
0.9 → 0.8 → **0.7 HP/s** (cost 10 → 12 g).

**Result on the locked build** (1400-game probes, both tiers):

| First purchase | berserker | stalker |
|---|---|---|
| Blood Sword | 52.6% | 30.9% |
| Ring of Regeneration | 51.0% | 49.6% |
| Lava Treads | 14.7% | 24.2% |
| Cape of the Magi | 10.9% | 19.4% |
| Amulet of Health | 15.6% | 18.9% |
| Boots of Speed | 11.6% | 17.4% |
| *nothing* (control) | 17.6% | 14.9% |

**Honest reporting: this is a partial fix.** Sword came down hard (61% → 53%
on berserkers, and it is merely good rather than dominant on stalkers at
31%). Ring barely moved — 59% → 51% on berserkers, 50% on stalkers — and a
−22% strength cut plus a +20% price rise buying only ~8 points tells us the
*cost* is not the lever. Any first-purchase sustain item is still worth ~3×
the "buy nothing" control in bot hands, and I stopped there deliberately
rather than nerf regen into uselessness on a bot signal.

**Why I believe this is substantially a bot artifact.** Bots do not burst:
their aim error, cooldown discipline and target switching mean damage arrives
in a thin, steady trickle, which is precisely the input regen is best
against. A human landing fireball → hook → fireball delivers a lump of damage
that outruns 0.7 HP/s entirely. **The real lever if Remi wants regen weaker
is mechanical, not numeric**: suppress or halve regen for a couple of seconds
after taking damage (an "in combat" rule). That is a design change, so it is
an open question below rather than something I shipped unasked.

## Finding 2 — the ★★ berserker was an execution machine, and my first fix broke it

Remi's report: *"the medium bots are fine in normal play (from afar) but
unbeatable from close up, typically in an end-game duel — I suspect they play
with 0 reaction time and perfect aim."*

**He was right, and the mixed Elo table had been hiding it.** In the mixed
study the ★★ sits only ~80 Elo above the ★, which reads like a modest gap.
Put them in the same game with `tools/h2h.js` (new this round) and the truth
appears:

| Head-to-head, 2 seats each (50% = parity) | ★★ berserker | ★ grunt |
|---|---|---|
| Before this round | **99.6%** | 0.4% |

The cause was exactly as diagnosed: its aim error was `distance × 0.12`,
which **vanishes at point-blank** (±0.18 u at 3 u — pixel-perfect), and it
re-decided every 0.14 s with a live, current-frame read of the target.

**The fix, and the mistake inside it.** I gave it (a) a slower ~0.21 s
decision tick, (b) an absolute aim-error floor so knife range is no longer
exact, and (c) *reaction-lag aim*: it aims from the previous tick's
observation of its target, not the current one. The first implementation of
(c) aimed at the raw stale **position** — which under-leads by
`lag × speed ≈ 2.3 u` on every single shot, against a hit window of about
2.2 u. That is not a reaction time, it is a permanent handicap, and it
measured as one:

| Head-to-head | ★★ berserker | ★ grunt |
|---|---|---|
| Raw stale-position aim (rejected) | 46.3% | 53.8% |

The ★★ had fallen *below* the ★. **The corrected model:** take the stale
observation and extrapolate it forward across the lag, then lead the shot
from there. A human who saw you a moment ago still leads you correctly while
you hold a heading; what they cannot do is react to a direction change inside
their reaction window — and that is now exactly what the bot cannot do.

**Locked-build ladder** (800 games each, `bruiser` build both sides):

| Head-to-head, 2 seats each | winner | loser |
|---|---|---|
| ★★★ stalker vs ★★ berserker | **100.0%** (avg place 1.50) | 0.0% |
| ★★ berserker vs ★ grunt | **75.4%** (avg place 2.06) | 24.6% |

The ladder ★ < ★★ < ★★★ is strictly intact, the hardest bot is untouched (as
Remi asked), and the ★★ went from winning 99.6% of its games against a ★ to
75.4% — still clearly the better fighter, no longer an aimbot in a duel.
**Whether the duel now *feels* fair is a human verdict**; the lab can only
confirm the aimbot is gone and the tier survived.

## Finding 3 — gale had been buried by two unrelated knockback nerfs

Gale (the push element) measured 8.9–15.6% across all three tiers — a trap.
Nothing had been done to gale itself since round 9; it was collateral damage
from two *global* knockback cuts (round 9's `KB_HP_FACTOR` 0.8 → 0.55 and
this round's 0.55 → 0.385). A push-multiplier element is worth exactly as
much as the push it multiplies.

Restored to 1.22/1.38/1.55× and its −5% damage penalty dropped (the penalty
was priced against a stronger baseline). It now lands at 21.6–27.2% — neutral
to slightly favoured, which is where a pure-utility element belongs.
**Standing lesson: element multipliers are priced against global constants,
so any global constant change silently re-prices them.**

## Finding 4 — Critical 💢 landed playable, and the ramp is self-correcting

The new element needed two iterations. First numbers (ramp 0.35/0.5/0.65 per
hit, −20% base damage) were too timid on the two lower tiers (13.2% and
21.4%); a jump to 0.5/0.7/0.9 overshot on grunts (50.2%, a clear outlier).
Settled at **0.45/0.6/0.8 (+1.8/2.6/3.5 push), −15% base damage**, which
reads 21.5–36.7% across the tiers.

The interesting part is *why* it self-corrects: the ramp only counts hits you
**land**, so it rewards exactly the players who were already connecting and
gives nothing to the ones who are missing. That makes it a snowball *within*
a round (it resets every round, so it cannot snowball a whole game) and it
tends to sit highest for the tier whose aim is worst-but-not-hopeless — hence
grunt 36.7% > berserker 21.5%. In human hands its ceiling is higher than any
of these numbers, because a human who is hitting keeps hitting.

## Finding 5 — poison's round-9 credit rule survived the rework

Round 9's discovery was that poison DoT ticks re-stamped the "last hitter"
slot 30×/s and stole nearly every lava kill (venom measured 75–86% before the
fix, ~15% after, with identical damage numbers). Round 10 deliberately gave
poison ticks *more* power — a lethal tick now takes the kill outright, so you
can finish someone in the lava with a tick — which is exactly the kind of
change that could resurrect that bug.

It did not. Ticks pass the poisoner as the **direct** damage source (so the
kill is theirs) while still never writing `lastHitBy` (so they cannot steal
credit for a lava death they did not cause). Both halves are locked by tests,
and venom's measured spread is 27.2–39.0% — strong, not degenerate. Tick
damage stacking was trimmed one step during the campaign
(+0.5/0.75/1.0 → **+0.4/0.6/0.8** per re-hit) after venom read 39–47%.

## Finding 6 — arcane's buff had to be walked halfway back

Remi's note was that the CDR upgrade *"didn't seem very strong — either buff
it or make it more visible."* Both were done, and the buff alone
(−12/−22/−32%) measured 42.8–59.1%, i.e. the best element in the game on two
of three tiers. Global cooldown reduction scales with *everything* you own,
so it is worth more the longer a game runs — and round 10's longer fights
amplified it further.

Settled at **−10/−19/−28%** (26.9–38.7%). The visibility half is the part
that probably mattered more anyway and cost no balance at all: the 🔮 icon
now appears on **every owned spell slot** in the HUD, not just fireball, so
you can see the thing you bought doing its job.

---

## Final state (all numbers from the locked build)

### Head-to-head — the difficulty ladder (800 games each)

| Matchup | Result |
|---|---|
| ★★★ stalker vs ★★ berserker | 100.0% / 0.0% |
| ★★ berserker vs ★ grunt | 75.4% / 24.6% |

### Mirror tables — the build balance verdict (1500 games each)

All four seats the same difficulty; only the shopping list differs.

| Build | ★ grunt | ★★ berserker | ★★★ stalker |
|---|---|---|---|
| **boomer** | **61.7%** | **62.3%** | **54.0%** |
| **bruiser** | 37.4% | 54.8% | 36.3% |
| **turtle** | 36.9% | 22.8% | 45.6% |
| **sniper** | 27.6% | 6.4% | 20.2% |
| **rusher** | 8.7% | 25.5% | 11.9% |
| **escape** | 1.4% | 0.6% | 5.1% |
| *greedless* (control) | 0.0% | 0.0% | 0.0% |
| lava kill share | 45.7% | 39.3% | 60.2% |
| comeback rate | 40.5% | 39.0% | 44.0% |

**Boomer is the strongest bot build at every tier (54–62%) and is deliberately
NOT nerfed.** The mechanism is a bot artifact: the boomerang is a large, slow,
long-lived projectile that hits on both legs, and *no bot dodges it* — the ★★★
stalker's dodge routine reacts to a projectile's current velocity ray, which
is the one thing a returning boomerang violates. Meanwhile the human upside of
the round-8 rework (catching it at the launch point to halve the cooldown) is
worth 0 to a bot: they never catch it. So the lab both over-rates the weapon
and under-rates the skill in it. **If human play confirms it is too strong,
the honest levers are the reactive ones** (shorter return window, or a catch
that is harder to line up), not damage.

**Escape and rusher remain bot-traps (0.6–11.9%), also unchanged**, for the
reason report #3 gave: their value is in reactive piloting a bot cannot
express. Raising them means smarter bot code, not bigger numbers.

The sniper collapse on berserkers (6.4%) is a *fit* problem, not a balance
one: lightning is a mid-range finisher with no push, handed to the one profile
whose entire plan is to be in your face.

### Mixed study — the big picture (2500 games)

Top and bottom of the 21-strategy table; the middle is monotonic.

| Elo | win% | strategy |
|---|---|---|
| 1764 | 80.0% | stalker/boomer |
| 1741 | 72.0% | stalker/bruiser |
| 1666 | 62.7% | stalker/turtle |
| 1657 | 74.2% | stalker/sniper |
| 1629 | 60.7% | stalker/rusher |
| 1495 | 52.2% | stalker/escape |
| 904 | 16.4% | berserker/bruiser |
| 897 | 25.4% | berserker/boomer |
| 833 | 9.2% | grunt/bruiser |
| 825 | 18.7% | grunt/boomer |
| 573 | 2.1% | berserker/escape |
| 409 | 0.0% | berserker/greedless |

Read this as a *skill* table, not a build table: the six stalker rows occupy
the entire top of it. The `greedless` controls (never buy anything) sitting at
the very bottom at 0.0% is the sanity check that the shop matters at all.

### Item / spell winner-held share (2500 games — confounded, kept for continuity)

| win% | picked | thing |
|---|---|---|
| 41.3% | 1458 | boomerang |
| 37.9% | 3726 | sword |
| 33.2% | 6477 | ring |
| 33.1% | 5487 | amulet |
| 32.7% | 2630 | treads |
| 30.8% | 6158 | cape |
| 29.2% | 7195 | boots |
| 28.2% | 1406 | shield |
| 27.9% | 1454 | lightning |
| 25.3% | 1366 | rush |
| 18.1% | 1517 | teleport |

**This table is survivor-biased by construction** — items late in a build
order are bought mostly by players who were already winning. The item probe
in Finding 1 is the de-confounded version and should win any disagreement.
Teleport at 18.1% is the standing bot-artifact flag: it is a *reactive* save
button, and bots barely use it.

### Elemental mode — per-element spread (1200 games per tier, 8 elements)

All seats the same difficulty and build; only the element pick differs.

| Element | ★ grunt | ★★ berserker | ★★★ stalker |
|---|---|---|---|
| ember 🔥 | **42.0%** | **44.3%** | 25.3% |
| venom 🐍 | 39.0% | 36.9% | 27.2% |
| critical 💢 | 36.7% | 21.5% | 25.1% |
| arcane 🔮 | 30.4% | 38.7% | 27.6% |
| gale 🌪️ | 22.3% | 23.5% | 21.6% |
| frost ❄️ | 16.0% | 27.1% | 31.4% |
| terra 🪨 | 12.3% | 7.4% | **39.4%** |
| midas 🪙 | 0.5% | 1.3% | 1.8% |

Seven of eight elements sit between 7% and 44% with legible tier affinities:
raw damage (ember) for the sloppy tiers, projectile size (terra) for the tier
that already aims well, frost for the kiter. Nothing here is degenerate.

**Midas at 0.5–1.8% is a measurement artifact, not a balance verdict, and I
did not touch its numbers because of it.** The tell is in the same table: the
midas seats finish with **215–260 average gold** against 53–80 for everyone
else. They are not losing because Midas is weak — they are drowning in gold
they cannot spend, because a bot's shopping list is finite and ends. Midas is
an *economic* element in a simulation with no economy left by round 6. It was
still nerfed this round (Remi's call: 2 g per hit was a kill's worth of
income), and that nerf is unmeasurable here **by design** — the first-hit-per-
enemy rule specifically punishes farming one target, which is a human
behaviour bots don't exhibit. **Human verdict required.**

### Health metrics

| Metric | Report #3 | Round 10 | Note |
|---|---|---|---|
| lava kill share (mixed) | ~73% → ~68% | **47.3%** | see open question 1 |
| lava kill share (mirrors) | — | 39.3–60.2% | lowest for the brawler tier |
| comeback rate (mixed) | ~17% | **17.5%** | healthy, unchanged |
| comeback rate (mirrors) | — | 39.0–44.0% | healthy |
| unfinished games | 0 | **0** | every game reached a winner |

---

## Open questions — these need Remi, not more games

1. **Is a ~47% lava kill share the game you want?** This is the biggest
   number in the report. It was ~86% at launch, ~68% after round 9, and
   **47.3% now** — the direct consequence of two changes you asked for
   (−30% low-HP knockback so launches are survivable, ×2 lava speed so
   swimmers get out). Knockback-into-lava used to be *the* win condition;
   now it is roughly half of deaths, and the other half is people being shot
   to death on the platform. Both one-line reverts are in
   `shared/constants.js` (`KB_HP_FACTOR`, `LAVA.SPEED_MULT`) with dated
   comments. **The lab cannot answer this one — it is a taste question.**
2. **Regen: numbers or a mechanic?** Ring-first still wins ~51% of probe
   games after a −22% strength cut and a +20% price rise. If it feels
   oppressive in human play, the effective fix is an **in-combat rule**
   (regen suppressed or halved for ~2 s after taking damage) rather than
   another number. That is a design change and I did not ship it unasked.
3. **Boomer at 54–62% in every mirror** — bot artifact (nothing dodges a
   boomerang, nothing catches one either). Does it feel oppressive to *play
   against*? If yes, nerf the reactive side, not the damage.
4. **The whole power tier is still unmeasured.** Bots pilot none of meteor /
   hook / repulse / mirror wall, so every number in them remains a design
   guess — including this round's new repulse combos (teleport/rush
   mid-charge) and the now-visible hook. Teaching bots to pilot them is the
   top item in the lab backlog; until then these are decided by your games.
5. **Does the ★★ duel feel fair now?** 99.6% → 75.4% against a ★ says the
   aimbot is gone and the tier survived, but "can I juke it at point-blank"
   is a feel question only you can answer.
6. **Critical in human hands** should outperform every number in this report
   (a human who is hitting keeps hitting, and the ramp only counts landed
   hits). Watch for it being *too* strong late in a round.

## Reproduce

Every table above, in order. Seeds are fixed, so these reproduce exactly on
the locked build.

```bash
# difficulty ladder (Finding 2)
node tools/h2h.js berserker grunt --games=800
node tools/h2h.js stalker berserker --games=800

# mirrors — the build verdict
node tools/arena.js --mirror=grunt     --games=1500 --seed=201
node tools/arena.js --mirror=berserker --games=1500 --seed=202
node tools/arena.js --mirror=stalker   --games=1500 --seed=203

# mixed study — the big picture
node tools/arena.js --games=2500 --players=4 --seed=101

# item probes — de-confounded first-purchase value (Finding 1)
node tools/arena.js --probe=berserker --games=1400 --seed=204
node tools/arena.js --probe=stalker   --games=1400 --seed=205

# elemental mode — per-element spread
node tools/arena.js --mode=elemental --kind=grunt     --games=1200 --seed=401
node tools/arena.js --mode=elemental --kind=berserker --games=1200 --seed=402
node tools/arena.js --mode=elemental --kind=stalker   --games=1200 --seed=403
```
