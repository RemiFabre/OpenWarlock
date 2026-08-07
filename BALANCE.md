# Balance addendum — round 14 (2026-08-07)

*One balance question this round: make the bots lean on whoever is winning,
without turning every game into a 3-v-1. The round-13 addendum follows below and
is unchanged by this one.*

## Finding 14A — a kill-leader targeting bias buys +2.3 points of comeback and costs no game length

Remi: *"a tendency to group up against whoever has the most kills, or at least
for that to bias their targeting… it mustn't be extreme."*

**What it is.** One extra weighted term in `pickPrey()` — the berserker/brawler
prey score that already weighs distance, wounds, isolation and rim proximity —
and in the stalker's single `nearestEnemy()` call, which is its whole target
choice. Not an override: a nearly-dead enemy standing next to you still beats a
leader across the map. The lead is **exactly the gold bounty's gap**
(`target.kills - self.kills`, floored at 0, `GOLD.BOUNTY_PER_GAP`), so the
economy and the AI now agree about who is ahead, and the leader — who never
collects a bounty — likewise never hunts anyone for being ahead. Off in co-op
(`pl.team != null`). The whole lever is `BOT_TARGETING.LEADER_BIAS`, in **arena
units of apparent distance per kill of lead**.

**Method.** Mixed 4-player study, same lineup sampler as `tools/arena.js`'s
default, 3 seeds × 2500 games = **7500 games per cell**, every cell replaying
the *same* lineups and seeds so the weight is the only difference (a paired
comparison, so the usual ±0.8-point 2σ band overstates the noise here). Cell 0
was checked byte-identical to the pre-change build: same Elo table, same lava
share, same comeback rate. The term is provably inert at 0, so row 0 is the old
game rather than an approximation of it.

| bias | comeback% (3 seeds) | mean | mean rounds/game | games hitting `MAX_ROUNDS` |
|---|---|---|---|---|
| 0 | 12.6 / 12.7 / 12.2 | 12.5 | 9.13 | 0.0% |
| 1 | 13.0 / 14.0 / 12.7 | 13.2 | 9.21 | 0.0% |
| 1.5 | 13.4 / 14.5 / 13.0 | 13.6 | 9.25 | 0.0% |
| **2.5** | 14.9 / 14.7 / 14.8 | **14.8** | 9.30 | 0.0% |
| 4 | 14.8 / 13.8 / 14.9 | 14.5 | 9.31 | 0.0% |

Comeback climbs monotonically to 2.5 and then stops — 4.0 beats 2.5 on no seed,
and an earlier 1200-game run had 8.0 bouncing around erratically. **2.5 is the
top of the useful range, not a point on a slope**, which is the happiest place
to sit given the instruction not to be extreme.

**The feared failure mode never appeared.** "The leader can never close it out
and games drag to the round cap" would show as capped games; there were **zero
at every weight, on every seed**, and mean game length moved 9.13 → 9.30 rounds
(+1.9%). Lava kill share 30.3% → 30.4%.

**The ladder is untouched.** `tools/h2h.js`, 400 games/pair, before and after:
Normal beats Easy 100%, Hard beats Normal 99.5%, Extreme beats Hard 100% — the
same three numbers as AGENTS.md.

**Second lab, where the mechanic has the most room.** Four *equal* Hard
berserkers (only builds differ), 800 games, seed 7 — the comeback rate is high
there by construction because nobody is outclassed: 44.3% at 0 → 53.6% at 1.5 →
**54.6% at 2.5** → 58.5% at 4. Rounds 13.95 → 15.20, still 0 capped games. Same
shape, ~5× the amplitude, which is what "a bias that only matters between
comparable opponents" should look like.

**Co-op is provably unaffected**: `tools/coop.js --levels` output is
byte-identical with the mechanic on and off, and `killLead()` returns 0 for any
fighter carrying a team.

⚠ **What this lab cannot see.** Bots do not experience being ganged up on. The
comeback rate says the *outcome* distribution flattened; it says nothing about
whether a human in the lead feels unfairly swarmed or pleasantly pressured. That
needs a playtest. `1.5` is the measured step down (+1.1 instead of +2.3 points)
and `0` removes the mechanic; both are one-line edits.

---

# Balance addendum — round 13 (2026-08-07)

*Two questions this round, both from Remi's playtest: rework Gale into a
stack-and-burst element, and find out whether the Blood Sword is worth 15 g.
The round-12 addendum follows below and is superseded only where this one says
so; its Finding 12A (the do-nothing floor) is the method this round leans on
hardest and should still be read first.*

## Finding 13A — the lava does 8.5% of the damage and 30% of the killing

Remi's hypothesis for why lifesteal underperforms was: *"a lot of damage — even
if the kills don't come directly from the lava — a lot of damage comes from the
lava. So lifesteal only works on the damage we deal ourselves."* It is testable
and it is **false**.

Nothing in the repo could answer it: `dmgDealt` and `dmgLava` are the *dealer's*
view and only count burn that a last-hitter got credit for. So `dmgTakenLava` and
`dmgTakenDirect` were added to `addPlayer`/`applyDamage` — pure accounting, from
the victim's side, always summing to the total damage a body absorbed. Lava is
the only sourceless damage in the game (`stepBattle`'s burn tick passes
`sourceId = null`), so the split is exact rather than heuristic.

| condition (300-game 4-player mirrors, Hard berserker/bruiser) | lava share of all damage taken |
|---|---|
| classic, seed 1 | 8.4% |
| classic, seed 7 | 8.8% |
| elemental, seed 1 | 8.7% |

Dealer side, same runs: **91.3% of the damage a player is credited with causing
is their own hits** — i.e. lifesteal-eligible. Only 8.7% is shoved-in burn,
which pays no lifesteal.

**It does not rise as the ring closes**, which was the other half of the
question. Per round index the lava share is ~8% in every round from 2 to 18,
dead flat. Round 1 is the only outlier at 15-16%, and that is because spells are
still level 1, so there is less *player* damage to dilute it — not because there
is more lava.

**The real shape of it: the lava is the executioner, not the damage dealer.** It
takes ~30% of the kills (unchanged, re-measured this round) off 8.5% of the
damage, because it finishes players whom other players already chipped down. Any
future reasoning of the form "lava does most of the damage, therefore X" is
wrong; the correct form is "lava does most of the *finishing*".

⚠ One number in this measurement is a bot artifact: **essentially 0% of lava
burn goes uncredited** (0.02-0.1%). That is only true because bots are
permanently in a firefight, so somebody has hit you within
`ROUND.KILL_CREDIT_WINDOW` (5 s) of every burn tick. A human who walks into the
lava alone generates uncredited burn; the lab never does.

## Finding 13B — the Blood Sword is the second-strongest item in the game

Finding 12A established that an *element* that does nothing scores 2.7%, not
25%. Items needed the same calibration before any "the sword is weak" claim
could be interpreted, so this round built it: a lab-only **control item**, 15 g,
three levels, `fx` literally `{}`. Every seat then runs an identical long build
order (every spell a bot pilots plus every item to level 3 — the "more to buy"
lever that kills the gold-saturation artifact; seats end on ~15 unspent gold,
not the ~100 a short order leaves) and **only the probe purchase differs**.
3000 games per item, Hard berserker/bruiser, seed 1, ~2400 games/arm, 2σ ±1.8.

**The calibration itself:** a seat that buys the tail and nothing else scores
31.6%. Burning 15 g on the control drops it to **7.8%**; burning 45 g drops it to
**0.7%**. So 15 g is worth roughly 24 points in this game — which is the number
that makes every row below readable.

| item | lv1 − control1 | lv3 − control3 | lv3 − lv1 |
|---|---|---|---|
| Amulet of Health | +39.1 | **+83.0** | **+43.3** |
| **Blood Sword** | **+36.5** | **+40.0** | −3.6 |
| Boots of Speed | +27.5 | +8.2 | −32.2 |
| Ring of Regeneration | +24.9 | +10.7 | −28.9 |
| Lava Treads | +19.7 | +3.7 | −32.5 |
| Cape of the Magi | +11.7 | +0.4 | −30.6 |

⚠ **Read the delta column, not the raw win rates.** The `none` arm is not
comparable across rows: each run strips the item under test from the shared
tail, so `none` scores 1.8% in the amulet run (no HP items at all) and 69.6% in
the cape run (losing the cape costs nearly nothing). `lvN − controlN` is clean,
because both arms sit in the same games with the same tail.

⚠ **The control is 15 g at every level**, so it is exactly price-matched to the
sword and 3-5 g *dearer* than every other item. The bias runs against the sword,
and the sword still places second at both levels. The conclusion is conservative.

Three readings:

1. **The sword is not weak.** At level 1 it returns +36.5 points against wasting
   the same gold, second only to the amulet, and it does so while being the
   most expensive item in the shop.
2. **Item levels 2-3 are near-worthless across the whole roster** — every item
   except the amulet loses 29-33 points going from lv1 to lv3. The sword loses
   3.6, by far the least. So "the sword's levels are bad" is true but it is an
   *item-levels* finding, not a sword finding. This is the flat-cost,
   diminishing-effect design from round 12 (S4) meeting a long build order:
   the third copy of anything loses to the first copy of something else.
3. **The Amulet is the outlier and has never had a ruling.** +83 points at lv3,
   while nothing else clears +11. This report does not act on it — it is a much
   larger change than the round's brief — but it is now the open item question.

### 13B(i) — build dependence, and where the sword actually is bad

Same lab, tail flavoured by build (the build's own order first, then the generic
tail), 4000 games, seed 1. Win rates, control-calibrated:

| build | none | sword1 | sword2 | sword3 | control1 | control3 |
|---|---|---|---|---|---|---|
| bruiser (mean of seeds 1/7/23) | 27.8 | **39.7** | 39.1 | 36.1 | 6.6 | 0.6 |
| turtle | 32.5 | **39.1** | 35.9 | 27.0 | 13.9 | 1.3 |
| rusher | 48.5 | 46.6 | 28.3 | 17.3 | 8.6 | 0.2 |

Remi asked whether it is fine in some builds and bad in others. It is: **level 1
is good everywhere**, and the *levels* collapse in proportion to how tight the
build's budget is — free in a bruiser, mildly bad in a turtle, catastrophic in a
rusher (−29 points from lv1 to lv3).

### 13B(ii) — why it read as "really really weak", which is a UI finding

The sword returns real HP: **349 hp/game at lv1**, 551 at lv2, 646 at lv3 for a
bruiser. The standings table prints that under **Lifesteal** — directly beside
**Regen**, which for the same seat reads **357**. The 15 g item appears to have
healed slightly *less* than the free passive regen.

The number Remi read is correct and it understates the item, because the two
columns are not the same currency: lifesteal lands mid-fight, while regen is
throttled to 25% for 2.5 s after every hit taken (`PLAYER.REGEN_LOCK`). And the
sword has **no in-fight feedback at all** — deliberately silent in `applyDamage`,
where only vampire's engorged ball produces a green number.

This is the third instance of the same scar (mosquito's invisible bites,
momentum's invisible ramp). **Recommended, not applied**, because it is a feel
change rather than a number: give the Blood Sword some visible in-fight return.

## Finding 13C — Gale reworked into stack-and-burst, and impulse beat distribution

Gale was an always-on `kbMult: [1.28, 1.46, 1.65]`. It is now frost's shape:
one private stack per landed gale fireball, **completely normal knockback while
stacking**, and the 3rd stack spent on one large gust.

Sweep for `burstKbMult`, standard elemental study, 1000 games:

| burstKbMult | seed 1 | seed 7 | seed 23 |
|---|---|---|---|
| pre-rework (flat kbMult) | 23.5% | 28.0% | 28.1% |
| **[1.84, 2.38, 2.95]** (shipped) | **23.5%** | **26.4%** | **24.3%** |
| [2.20, 2.85, 3.55] | — | 40.4% | 36.7% |
| [2.60, 3.40, 4.20] | 48.4% | — | — |
| [3.20, 4.20, 5.20] | 64.2% | — | — |
| [4.00, 5.20, 6.40] | 81.7% | — | — |

Two lessons:

- **The impulse-neutral value was the right one.** Gale now pushes ×1 twice and
  ×B once, so `B = 3M − 2` preserves the average impulse per hit. The prediction
  going in was that concentrating the same average shove into one hit would be
  worth *more* (only a big shove reaches the lava); measured, it changed the win
  rate by less than noise. **In bot hands, total impulse is what counts and its
  distribution does not.**
- **The lever is violently steep.** +20% on the burst is +14 points. Do not round
  this constant up without re-running the table.

⚠ **Bot artifact, flagged not corrected.** Everything a burst is *for* — timing
it, holding it, walking a victim toward the edge before spending it — is
invisible to a lab whose bots never bait and never notice they are on 2 stacks.
So 23.5% is a **floor** on gale's value in human hands, and "unchanged" means
"unchanged for players who don't aim it". This is the one number in the round
that Remi's playtest, not the lab, has to settle.

Post-rework 12-element table (1000 games, seed 1): venom 39.2 · vampire 37.4 ·
ember 34.4 · arcane 33.2 · mosquito 31.8 · terra 28.7 · momentum 24.8 ·
**gale 23.5** · chronos 20.1 · frost 18.6 · ghost 8.6 · midas 0.0. Gale holds
8th of 12, exactly where it was. Lava kill share 30.0%, comeback rate 11.7%,
both unchanged. Co-op is untouched by construction (elements are gated to
`mode === 'elemental'`) and re-measured bit-identical to the round-12 curve.

---

# Balance addendum — round 12 (2026-08-07)

*Tens of thousands of headless games on top of the round-11 addendum (which follows below,
and is superseded only where this one says so). Round 12 changed items,
knockback, one element's whole design, renamed and rebuilt another, added three
elements, a spell, four bot tiers and an optional draft ruleset — so **every
element table below round 12 is obsolete**, and the round-11 addendum's Findings
A-E are kept for their lessons, not their numbers.*

**Read Finding 12A first even if you read nothing else.** It says that the
baseline this report and all four before it have been read against is not the
floor, and that several past "this is below baseline, therefore weak" readings
were wrong.

---

## How to read this addendum

Everything in report #4's *"How to read this report"* section (baseline,
metrics, the four instruments) still applies and is not repeated. Three
additions this round:

| Term | Definition |
|---|---|
| **win rate / 25% baseline** | Games are 4-player free-for-alls, so a neutral thing wins **25%** of the games it is in. Every percentage in this report has that baseline unless it explicitly says otherwise. |
| **the standard elemental study** | `tools/arena.js --mode=elemental`: four seats, all the **Hard (berserker) profile on the bruiser build** — max fireball, then HP and lifesteal, stands its ground and trades — and **only the element pick differs**. See `STRATEGIES.md` for what every profile × build codename means. Each of the 12 elements therefore appears in roughly a third of the games; at 1000 games that is ~330 games per element. |
| **the absolute element lab** (new this round) | **One** element seat against **three seats carrying no element at all**, same profile and build everywhere, 600 games. Its neutral point is not 25% — see Finding 12A. This is the instrument that answers *"is this element weak"*; the standard study answers *"where does it rank"*. |
| **trigger rate** | For a conditional effect, the share of that element's fireballs on which the condition actually fired. Used for Ghost and Mosquito, where the *setup*, not the payoff, is the thing under suspicion. |

**The caveat that explains most weird numbers is unchanged and got worse this
round:** bots extract far less value from *reactive* and *positional* play than
humans do. Round 12 added two elements whose entire skill expression is
something bots never do — Ghost needs you to line two enemies up, Mosquito needs
you to hunt a marked victim — and unlocked a power tier bots still cannot pilot.
Those cells are flagged, not nerfed.

## Finding 12A — the do-nothing floor is 2.7%, not 25%, and this reframes every past report

This is the most important measurement of the round and it is a methodological
one, not a balance one.

The standard elemental study deals each of the four seats a *different* element,
so its 25% baseline is the average over the pool. It has always been used as
though 25% were also the *neutral* point for a single element — "frost is at
19%, therefore frost is under-powered". **That inference is invalid**, and the
absolute element lab was built to show why.

The lab runs one element seat against three seats that buy no element at all,
and its calibration control is an element whose effect table is literally empty
— it does nothing whatsoever, but it still costs its 10+8+8 g and is still
bought first:

| Absolute lab, 600 games, seeds 7 / 23 | win rate | (the three no-element seats share the rest) |
|---|---|---|
| **the no-op control** — an element with an empty effect table | **2.7% / 2.8%** | the element seat is simply 26 gold behind three seats that spent it all on their build |
| Ghost, pierce kept but its bonus neutralised (multipliers set to 1.0) | 8.5% / 8.5% | piercing alone is worth ~+6 points |
| Ghost as shipped | 18.0% / 20.3% | the bonus is worth another ~+10 |

**So the floor of "I bought an element and got nothing for my 26 gold" is
2.7%, not 25%.** An element at 8% in the mixed table is not broken; it is a
working element ranked last in a strong field. Buying it up toward 25% in the
mixed table would only inflate the field, because the mixed table is
zero-sum — every point given to one element is taken from another.

**The mixed 12-element table is therefore a RANKING of strong things, not a
strength meter.** Same lab, same 600 games, every element measured against three
element-less seats:

| Absolute strength (1 element seat vs 3 with none; 2.7% = bought nothing, 20% = the no-element seats' own share) |
|---|
| vampire 68-71 · mosquito 60-62 · momentum 59-62 · venom 58-60 · ember 50-53 · arcane 48.7 · terra 43.8 · chronos 42.5 · frost 37-40 · gale 34-38 · ghost 18-20 · midas 0.5-1.0 |

Read that against the mixed table in *Final state* below and the two orderings
broadly agree — which is the point: the ranking was never wrong, the *reading of
the distance from 25%* was. Frost sits at 19.4% mixed and 37-40% absolute
against no-element seats at 20-21%: a mid-strength element in a strong field.
**Nothing was retuned on the strength of a mixed-table number this round.**

*Practical rule for the next agent: before buffing anything for being "below
baseline", measure what it scores against nothing.*

## Finding 12B — a study cannot see a variable its design cannot express

Round 12 made element stacks **private to the attacker who applied them**
(Remi's call, reversing the round-11 shared-stacks decision). The obvious
prediction was that this is a significant nerf to frost, needing compensation.
The standard elemental study showed no change at all — and that "no change" was
**not evidence**.

The study deals every seat a different element, so it contains **exactly one
frost player**, and with a single attacker private and shared counters are the
same number by construction. Verified rather than argued: the shipped simulation
and a lab copy patched back to shared stacks produce **byte-identical** tables at
one frost seat (37.2% vs 37.2% at seed 7; 39.5% vs 39.5% at seed 23, 600 games
each).

A purpose-built lab that *can* express the variable — deliberately seating two
and three frost players in the same game — found the real answer:

| frost seats in the game | shared stacks | private stacks | delta |
|---|---|---|---|
| 1 | 7.8% | 7.8% | none, by construction |
| 2 | 20.8% | 17.0% | −2.4 to −3.8 points (seeds 7/23/41) |
| 3 | 21.2% | 18.6% | ~−1 point |

The nerf is real, small, and exists **only in multi-frost lineups**. No
compensation was applied. Frost's apparent collapse in the mixed table over the
same period is **displacement, not this change**: dropping the three new
elements from the pool leaves frost at 17.0%, and also dropping the reworked
Mosquito lifts it to 19.8%, so the newcomers account for ~3 points. The rest is
pre-existing — frost's number in this study has been low and swingy for three
rounds (27.1% in report #4, 23.2% in the round-11 addendum, 16.9-19.4% across
the round-12 runs), and the round-11→12 step is within about 1.2σ at this
study's precision. Constant knockback was also ruled out by measurement
(restoring HP-scaled knockback moves frost by ~1.5 points).

**Lesson, now in AGENTS.md: when a study's design cannot express the variable,
its "no change" is not evidence. Build the lab that can.**

## Finding 12C — Mosquito was never a balance problem; the client never drew it

The round-11 addendum's Finding D tuned Mosquito through three passes and
reported it at 24.0% / 34.6%, with the honest note that "bots never deliberately
aim at a bite arc". Remi then played it and reported it broken.

**He was right, and the cause was not in the numbers.** The old design put a
*bite* on an arc of the victim's body, and **the client never rendered the
bites at all** — they were computed server-side, they were on the wire, and
nothing drew them. Players were being asked to aim at an invisible target. In a
control run with the element's payoff isolated, the bite-arc Mosquito on the
Hard/bruiser profile scored **0.0%** and averaged **1.0 kills per game**; the
replacement scores 18.6% and 10.6 kills on the identical pool. It was not
"strong and fiddly", it was **unable to kill anybody**.

**Scar, now in AGENTS.md: a feature that is never rendered reads as a broken
feature.** Check the renderer before the spec.

**The rework, and the one ruling that decided its numbers.** The bite arc and
cross-spell doubling are gone (Remi: cross-spell doubling would make
mosquito+lightning the meta). The sting now leaves one stack; landing your own
fireball on your own stack spends it and lands **two of your fireballs at the
same point in the same frame**, so every on-hit effect procs twice.

Two simultaneous impulses simply add, so the first build of that shoved a
full-HP victim at **145.0 u/s against a plain level-1 fireball's 72.5** —
exactly ×2 — and the element measured **82.3%**. Remi ruled that the knockback
must happen **once**: *"it hits twice in damage and twice in all the on-hits,
yes; but the knockback only once — the mosquito draws its strength from damage
rather than from knockback, otherwise I can imagine a monstrous win rate."*

That ruling cost the element far more than the arithmetic suggests, and the
mechanism is worth recording: **the lava is the primary killer, so a sting that
no longer launches anybody into it stops converting hits into kills.** Every
value below is knockback-once, on the standard elemental study, with the band
that decided it re-run at 800 games × 3 seeds (Mosquito plays ~1/3 of the games,
so one cell is ~270-315 games and 2σ ≈ ±4.5 points):

| sting cooldown multiplier | level-1 sting cadence | win rate (25% baseline) |
|---|---|---|
| `[0.98, 0.85, 0.72]` — what the ×2-knockback build shipped with | 2.06 s | **4.8 / 5.3%** |
| `[0.90, 0.78, 0.66]` | 1.89 s | 17.7 / 16.5% |
| `[0.86, 0.75, 0.63]` | 1.81 s | 15.2 / 16.4 / 18.9% (mean 16.8) |
| `[0.83, 0.72, 0.61]` | 1.74 s | 15.9 / 17.5 / 18.6% (mean 17.3) |
| **`[0.80, 0.70, 0.59]` ← shipped** | **1.68 s** | **28.3 / 23.9 / 20.4% (mean 24.2)** |
| `[0.75, 0.65, 0.55]` | 1.58 s | 48.6 / 42.2 / 46.8% (mean 45.9) |
| `[0.55, 0.50, 0.45]` — the original | 1.16 s | 78.2 / 78.9% |

**Shipped value: the fastest sting that still sits on the baseline.** The safer
0.83 and 0.86 were rejected deliberately, because a "double-rate sting" that
fires 2% faster than not taking the element at all has no identity left. At 0.80
the sting is 20% faster than a plain fireball at level 1 and 41% faster at level
3. ⚠ **The response curve is brutally steep either side of this point** — one
notch faster is 45%, one notch slower is 17% — so this knob must be re-swept at
800 games × 3 seeds after any change to knockback, the lava or the fireball.
Mosquito's own spread illustrates the precision: the three 800-game seeds mean
24.2%, the 1000-game seed-1 table in *Final state* reads 28.9%, and an earlier
1000-game run recorded in `docs/ROUND12.md` read 25.1%. **All three are the same
cell** — quote the sweep, not one run.

⚠ **Bots flatter this element.** A bot re-hits its nearest enemy constantly and
therefore cashes the mark for free; a human has to *hunt* a marked victim. Its
24-29% is an **upper bound on how easy the setup is**, and Remi's feel report
decides it.

## Finding 12D — Momentum: the design was right, the first two numbers were not

Critical was renamed **Momentum ⚙️** and rebuilt: every fireball you *land*
permanently raises your fireball damage **for the whole game**, damage only,
push unchanged.

**Remi's suggested +1 damage per landed hit measured a 100% win rate** (1000
games). The mechanism is arithmetic, not subtlety: a Momentum seat lands a
**median of 78 fireballs per game** (max 108 over ~15 rounds), so +1/hit is +78
damage on a 7-14 damage fireball against 100 max HP. Every late-game fireball
one-shots.

The second wrong number is a methodology point. A per-hit step of 0.08 was
shipped on the strength of a **single 400-game run reporting 27.2%**. It does
not reproduce. Re-measured properly — 800 games × 3 seeds on the standard study:

| damage per landed hit (level 1) | seed 1 | seed 7 | seed 23 | mean |
|---|---|---|---|---|
| 0.08 — what shipped as "27.2%" | 43.1% | 37.9% | 38.5% | **39.8%** |
| **0.06 ← shipped** | 23.6% | 24.6% | 25.0% | **24.4%** |
| 0.05 | 16.1% | 13.6% | 15.1% | 14.9% |
| 0.04 | 8.6% | 11.8% | 10.7% | 10.4% |
| 0.03 | 6.0% | 5.4% | 7.1% | 6.2% |

Monotone at every seed, and 0.06 is the tightest cell in the sweep (1.4 points
of spread across three seeds). At 0.06 a long game ends around **+4.7 damage**
at level 1 and **+9.4** at level 3, on a 7-14 damage fireball, earned over 20
rounds — which is the design. The permanence is untouched.

**The small step does not re-create round 11's "I can't see it working"
complaint, because the feedback moved**: the damage popup now shows the base
hit with **the accumulated bonus in white above it**. Round-11 Finding C's
lesson — *a correct mechanic with imperceptible numbers is a bug in practice* —
was addressed by changing what the player is shown, not by inflating the step.
One honest caveat for the feel report: the white number only appears once the
accumulated bonus reaches 0.5 damage, i.e. after ~9 landed fireballs at level 1.

## Finding 12E — capping items brought the gold-saturation artifact back

Round-11 Finding A celebrated the death of a two-month-old measurement artifact:
freely stackable items gave bot gold somewhere to go, average end-of-game gold
fell from 60-80 to 14-15, and Midas jumped from ~1% to 43-64%.

Round 12 capped items at 3 levels at flat cost (Remi's call — the 5-boots meta).
**That partly undid it.** In the 1000-game standard study, Midas measures
**0.0%** while finishing games on **49.1 average gold against 14.0 for every
other seat.** The saturation is back, visible in one column of the same table.

Following the round-11 rule — *before believing a "bot artifact" explanation,
check whether you can delete the artifact* — it was attacked from three
directions, 800 games per cell:

| Intervention | Midas win rate | Midas leftover gold |
|---|---|---|
| shipped build orders (the control) | 0.0% | 54.3 |
| **more to buy**: append every spell a bruiser bot can actually pilot to its shopping list | 7.0 / 10.0 / 8.9% | 27-29 |
| **scarcer gold**: round income 8 → 5 → 3 g | 4.4% → 12.5% | 30.9 → 24.1 |
| **both at once** (income 3 g + the long shopping list) | 17.3 / 19.0% | 20.6 |

Every axis that makes gold *matter* moves Midas monotonically upward, and it is
still saturated at the far end. **0.0% is a floor set by Midas's −50% damage
drawback, not a measurement of the element.** The control that separates the two
halves: Midas with its income forced to zero scores 0.0% with 3.3 kills, and
Midas as shipped scores 0.0% with 7.9 kills — the income buys 4.6 kills' worth of
tempo and zero wins, because every bot finishes its shopping list anyway.
Calibrated against Finding 12A, Midas at 0.5-1.0% absolute is measured as slightly
*worse* than paying 26 gold for nothing, which is exactly what "a real drawback
plus an unspendable upside" looks like. **Midas's numbers were left alone.
Remi's human read was right the last time this number was 1%.**

## Finding 12F — an item cap is a co-op campaign nerf, and nobody re-measured it

The co-op campaign party is **bots**, and a bot shops up to 13 times in a run.
Under free stacking they reached level 9 carrying **8-13 copies of every item**;
every enemy in `shared/campaign.js` is a fixed template owning exactly one.
Capping items at 3 levels removed the party's late-game power and left the
monsters untouched. Nothing in the item change mentioned co-op, and the campaign
was not re-run when it shipped:

| Full campaign clear rate (200 runs per party size, inside the 13-round budget) | 1p | 2p | 3p |
|---|---|---|---|
| before the item cap | 55% | 79% | 55% |
| after the item cap, before repair | **11%** | **10%** | **4%** |
| after retuning levels 8-10 | **37.0%** | **55.5%** | **41.0%** |

Per-level clear rates after the repair (`tools/coop.js --levels`, 200 attempts
per level per party size, Hard berserker/bruiser party, seed 7): L1-3 100% at
every size, L4 94/94/97, L5 98/96/91, L6 91/97/97, L7 69/75/73, L8 68/66/57,
L9 39/46/44, L10 30/42/32 — **non-increasing at every party size**, which is the
property the curve is tuned for.

**Rule, now in AGENTS.md: any global change to items, gold or knockback
re-prices the whole back half of the campaign. Re-run `tools/coop.js --levels`
in the same commit.**

## Finding 12G — Ghost's problem is its trigger rate, and that is a bot artifact

Ghost's fireball pierces; anyone hit *after* the first takes a damage and push
bonus. It measures **8.3%** in the mixed table, last of twelve. The numbers on
the bonus are not the problem — **the trigger rate is**:

- Over 60 games and **11,880 ghost fireballs**, 51.1% hit somebody and only
  **3.07% reached a second body**. That is ~6 bonus hits per whole game, about
  21 extra damage across ~15 rounds.
- Scaling the bonus does move the table, but only at values that break the game:
  ×2 → 6.6%, ×3 → 11.0%, ×5 → 28.7%. At ×5 a second victim takes more than a
  Meteor. That is not a retune, it is a different element.
- In the absolute lab (Finding 12A) Ghost scores **18-20%** against a 2.7% no-op
  floor: it is a *working* element, ranked last in a strong field.

**Bots never line two enemies up, and "line them up" is this element's entire
skill expression** — precisely the case the project rule says to flag rather
than pay for. A human in a late round, ring at radius 10 with everyone
clustered, should trigger it far more often than 3%. **Numbers left alone.** If
Remi's feel report says it is weak in human hands, the honest lever is
**frequency**, not a bigger multiplier.

## Finding 12H — the four-tier difficulty ladder is monotone, and the old "★★ beats ★ 75%" is dead

Round 12 named the tiers **Easy / Normal / Hard / Extreme** and added Normal as
the Hard brain with a longer reaction window and a bigger aim-error floor — the
same machinery with worse parameters, deliberately not new AI. The ladder was
verified with `tools/h2h.js` (two seats of each tier in one game, **50% is
parity**, bruiser build, 400 games each), because the mixed Elo table
demonstrably hides tier gaps:

| Head-to-head, 2 seats each (50% = parity) | winner | loser |
|---|---|---|
| Normal vs Easy | **100.0%** | 0.0% |
| Hard vs Normal | **99.5%** | 0.5% |
| Extreme vs Hard | **100.0%** | 0.0% |
| Hard vs Easy | **100.0%** | 0.0% |

**Report #4's "★★ beats ★ 75%" no longer holds and should not be quoted.** It
was measured before the Easy tier was made fully random on 2026-08-06; against
a bot that aims at nothing, every piloted tier wins 100%, so head-to-heads
*against Easy* are no longer a difficulty signal at all.

The readable measurement is all four tiers in one game (300 games, bruiser
build, seat order rotated so spawn position cannot favour a tier):

| Tier | avg place (2.5 = neutral) | avg kills | win rate |
|---|---|---|---|
| Easy (grunt) | 3.91 | 0.4 | 0.0% |
| Normal (brawler) | 2.82 | 2.9 | 0.0% |
| Hard (berserker) | 2.27 | 4.6 | 0.0% |
| Extreme (stalker) | **1.00** | **15.6** | **100.0%** |

Extreme finishing first in 300 of 300 games is the honest shape of this ladder:
the tiers are ordered, and the top one is a different animal.

## Final state — the 12-element table

`node tools/arena.js --mode=elemental --games=1000` (seed 1). Four seats, all
**Hard (berserker) on the bruiser build** — max fireball, then HP and lifesteal,
stands its ground and trades — with only the element pick differing. Each
element appears in ~330 of the 1000 games. **Baseline 25%**, and per Finding 12A
this is a **ranking**, not a strength meter.

| Element | win% | avg place | avg gold left | avg kills |
|---|---|---|---|---|
| venom 🐍 | 38.8% | 2.02 | 14.1 | 12.2 |
| vampire 🧛 | 38.7% | 1.97 | 14.3 | 12.4 |
| ember 🔥 | 35.8% | 2.13 | 14.0 | 11.8 |
| arcane 🔮 | 32.4% | 2.27 | 14.3 | 11.7 |
| terra 🪨 | 29.3% | 2.31 | 14.1 | 11.2 |
| mosquito 🦟 | 28.9% | 2.41 | 14.1 | 10.8 |
| momentum ⚙️ | 24.2% | 2.72 | 14.5 | 9.3 |
| gale 🌪️ | 23.5% | 2.42 | 14.1 | 11.2 |
| chronos ⏳ | 21.0% | 2.47 | 14.0 | 10.9 |
| frost ❄️ | 19.4% | 2.71 | 14.0 | 10.3 |
| ghost 👻 | 8.3% | 3.06 | 13.8 | 8.7 |
| midas 🪙 | 0.0% | 3.52 | **49.1** | 6.3 |

The spread is 0-39% across twelve elements, which looks alarming and is not:
against Finding 12A's absolute lab the same twelve run 0.5% to 71%, with the
bottom two explained (Ghost by a 3% trigger rate in bot hands, Midas by the
gold column in this very table). The two brand-new elements that landed on the
baseline did so after being retuned *down* — Vampire from 74.7% and Mosquito
from 82.3%.

⚠ **Two cells in this table are upper bounds and two are lower bounds.**
Mosquito and Vampire are flattered by bots (bots cash a mosquito mark for free;
a point-blank brawling bot is the ideal lifesteal engine). Ghost and Midas are
under-measured for the reasons in Findings 12E and 12G. Nothing in this table was
tuned against those four numbers.

### Health metrics

| Metric | Definition | Round 11 | **Round 12** |
|---|---|---|---|
| lava kill share | share of deaths in the lava rather than to direct damage | 37.5% | **30.0%** (60 games) / **30.2%** (1000 games) |
| comeback rate | share of games where the eventual winner was ≥4 kills behind at some point | 11.9% | **11.7% / 12.4%** |
| unfinished games | games that hit the round cap with no winner | 0 | **0** |
| automated tests | `npx vitest run` | 135 | **196 green** |

## Open questions — these need Remi, not more games

1. **The lava kill share is 30% and has fallen every single round: 86% at
   launch → 68% (round 9) → 47% (round 10) → ~38% (round 11) → 30% now.** This
   has been open question #1 in every report since round 10 and **has never been
   ruled on**. Two deaths in three are now people being shot on the platform;
   knockback-into-lava used to be *the* win condition. The lab cannot answer a
   taste question, but every round retunes on top of a drifting number. All
   three levers are one-line reverts in `shared/constants.js`:
   `PLAYER.KB_HP_FACTOR`, `PLAYER.KB_CONSTANT_MISSING`, `LAVA.SPEED_MULT`.
2. **Does constant knockback feel better?** `KB_CONSTANT_MISSING = 0.30` shoves
   everyone as if permanently at 70% HP. It makes low HP more survivable and
   full HP less so, and it moved frost, gale and the sustain items by 1-2 points
   each — small in the lab, possibly large in the hand.
3. **Mosquito in human hands.** The sweep in Finding 12C says exactly what each
   step of the cadence knob buys; the 24-29% is an upper bound on how *easy* the
   setup is. Feel report, not a number, please — the curve is too steep to
   eyeball.
4. **Ghost's frequency in human hands.** 3.07% of fireballs trigger it in bot
   games. If a human clustering fight does not lift that substantially, the fix
   is frequency, not multipliers.
5. **Draft mode is entirely unmeasured, on purpose.** The elemental study gives
   each seat one element by design, which a random half-catalogue pool cannot
   express — the same trap Finding 12B describes. A number for draft needs its own
   lab, and a verdict on whether it is *fun* needs a game.
6. **The whole power tier is still unmeasured, and it is now more urgent**:
   round 12 made meteor / hook / repulse / mirror wall buyable from round 1
   while bots still pilot none of them. The only thing keeping them out of bot
   hands is that no bot shopping list contains one. Every number in the power
   tier remains a design guess.

## Reproduce

Seeds are fixed; these reproduce exactly on the round-12 build.

```bash
# the 12-element table (Final state)
node tools/arena.js --mode=elemental --games=1000

# the difficulty ladder (Finding 12H) — 50% is parity
node tools/h2h.js --games=400 brawler   grunt
node tools/h2h.js --games=400 berserker brawler
node tools/h2h.js --games=400 stalker   berserker

# the co-op campaign (Finding 12F)
node tools/coop.js --levels        # per-level clear rates, the tuning view
node tools/coop.js                 # full campaign runs with retries

# health metrics + a smoke test that games still finish
node tools/arena.js --games=60 --players=4
```

The absolute element lab (Finding 12A), the frost-share lab (Finding 12B) and the
Midas artifact-deletion runs (Finding 12E) were purpose-built throwaway harnesses
around `tools/arena.js`'s exports; their full result tables are recorded in
`shared/constants.js` next to `ghost`, `frost` and `midas` respectively, which
is where the next agent will be standing when the question comes up again.

---

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
