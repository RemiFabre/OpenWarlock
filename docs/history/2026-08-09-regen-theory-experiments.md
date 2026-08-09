# 2026-08-09 — Regen / lifesteal experiments: does sticky damage double-dip?

**Remi's theory under test**: removing passive regen (round 17 late) made ANY
sticky damage over-valued, because lifesteal became the only in-round healing
and lifesteal scales off damage — so flat damage (ember +[1,2,4], anger's
permanent ramp) would be double-dipping: kill pressure + implicit sustain.
Prediction 1: restoring regen deflates flat damage. Prediction 2: deleting
lifesteal deflates it. Both tested; **neither holds** — the full story below.

## Instrument

Every number in this file comes from
`node tools/arena.js --mode=elemental --games=800 --players=4 --seed={1,7}`
run in a measurement worktree at HEAD `a3733e0` (round 19.6): 4 identical Hard bots
(berserker/bruiser — the bruiser build buys the Blood Sword), only the element
pick differs, elements drawn 4-of-11 per game so each element plays ~280-330
games per seed. **Win% baseline is 25%** and the table is a **zero-sum
ranking**: a point one element gains is a point off the other ten; the
do-nothing floor is ~3%, not 25%. Every config ran seeds 1 AND 7 (house
rule); a delta is only claimed when both seeds agree on its sign.

**Round-1 first death**: no first-blood metric exists in shipped arena.js (any
mode) — the round-17 battery's "first death" column was ad-hoc. This study
added worktree-only instrumentation to `playGame`: record `state.time` at the
first `death` event while `state.round === 1` (lava deaths included — lava
ending a stalemate IS the stalemate signature), report the median over all
800 games. It reproduces the recorded numbers exactly (HEAD 33.7 s vs the
34.8 s noted at regen removal; no-lock 51.1 s vs the historical 51.9/51.4 s),
so it is the same ruler.

**What this instrument cannot see**: bots never bait, aim bursts, or refuse
trades — volume-scaling things (anger, ember) read inflated; lifesteal reads
at a bot FLOOR (constants.js: "bots never choose fights lifesteal rewards"),
so the human-play double-dip could be larger than what is measured here.
Anger sits at 98.5-100% in EVERY config — the metric is ceilinged and can
show nothing about anger's deflation either way. Malady/gale read at their
known false floors (bots don't cluster or position gusts).

## The matrix

Five configs. All are HEAD plus the stated change only; "fx" overrides are
CLI-only (no file edit), constants edits were made in the worktree and
reverted between configs.

| # | config | change vs HEAD |
|---|---|---|
| A | baseline | none (same-day re-run) |
| B | regen + lock | `PLAYER.REGEN 0 → 1.2` (full-stop lock re-arms: damage pauses regen 2 s) |
| C | pure regen | `REGEN 1.2` AND `REGEN_LOCK_MULT 0 → 1` (regen never pauses) |
| D | no lifesteal | `--fx=sword.lifesteal=0,0,0` (Blood Sword dead; vampire's engorged heal REMAINS) |
| E | no healing at all | D + `--fx=vampire.chargeLifesteal=0,0,0` (clarifying run — see below why) |

### Key elements, win% (seed 1 / seed 7), + round-1 first death

Win% = share of that element's ~280-330 games finished 1st of 4 (baseline
25%, zero-sum vs the other ten elements). First death = median seconds into
round 1 before anyone dies (both seeds gave identical medians in every
config). No config produced unfinished games — game-finishing intact
everywhere.

| config | anger | ember | vampire | malady | first death |
|---|---|---|---|---|---|
| A baseline | 99.4 / 99.1 | 50.2 / 52.6 | 45.3 / 40.6 | 7.4 / 7.6 | 33.7 s |
| B regen + lock | 99.7 / 99.4 | 51.2 / 52.3 | 40.0 / 36.6 | 7.1 / 4.3 | 37.5 s |
| C pure regen | 100 / 100 | 44.2 / 52.3 | 35.8 / 34.1 | 3.3 / 2.3 | **51.1 s** |
| D no lifesteal | 99.4 / 98.5 | **39.2 / 37.5** | **56.6 / 52.9** | 5.6 / 5.0 | 33.7 s |
| E no healing | 99.7 / 98.5 | 47.8 / 49.8 | 3.0 / 2.5 | 9.7 / 8.6 | 33.7 s |

Secondary reads worth keeping (same runs):

| config | midas | arcane | mosquito | midas avg-gold |
|---|---|---|---|---|
| A baseline | 4.3 / 4.6 | 16.3 / 12.6 | 17.1 / 20.4 | 75 / 71 |
| B regen + lock | 7.2 / 7.0 | 19.3 / 15.4 | 13.8 / 15.6 | 91 / 86 |
| C pure regen | 19.9 / 15.8 | 12.7 / 10.9 | 16.8 / 15.0 | 119 / 109 |
| D no lifesteal | 2.2 / 1.4 | 18.0 / 16.5 | 14.4 / 15.0 | 62 / 55 |
| E no healing | 2.9 / 2.5 | 27.7 / 26.7 | 21.5 / 21.3 | 64 / 59 |

## Findings

**1. Restoring regen does NOT deflate flat damage.**
- Config B (regen under the shipped full-stop lock): ember 51.2/52.3 vs
  baseline 50.2/52.6 — unchanged; anger unchanged at ceiling. The lock makes
  regen inert exactly when damage matters (you never regen while being hit),
  so it cannot compete with lifesteal as in-combat sustain. Its only effects
  are pacing (+3.8 s to first blood, 33.7 → 37.5 s) and a small vampire dip
  (45.3/40.6 → 40.0/36.6, both seeds down — out-of-combat regen refills what
  engorged heals used to be needed for).
- Config C (pure regen, no lock — Remi's "without any weird stuff" case):
  ember 44.2/52.3 — the seeds DISAGREE (−6 vs −0.3), so no deflation claim
  survives the house rule; anger pins at exactly 100/100. What C does do,
  unambiguously: **round-1 first death 51.1 s** — the exact stalemate that
  got regen locked and then removed (historical 51.9 s) — malady crushed
  (7.4/7.6 → 3.3/2.3: regen erases DoT chip between engagements), and midas
  quadrupled (4.5 → ~18%, avg-gold 75 → 114: longer, safer games are pure
  midas food). Pure regen re-buys every problem it was removed for and does
  not touch the thing Remi wanted deflated.

**2. Deleting lifesteal LOOKS like it deflates ember — but it's redistribution,
not deflation.**
- Config D: ember drops ~13 pts (50.2/52.6 → 39.2/37.5, both seeds) — at face
  value, theory confirmed. But vampire (whose engorged heal survives the
  sword deletion) simultaneously jumps +11/+12 to 56.6/52.9 and becomes the
  top non-anger element. In a zero-sum table those are the same arithmetic.
- Config E (the clarifying run: vampire's heal ALSO zeroed, so NO in-round
  healing exists anywhere): ember rebounds to 47.8/49.8 — within ~2.5 pts of
  baseline on both seeds. If ember's premium were sustain-fed, a world with
  zero healing should deflate it the most; it doesn't. So config D's ember
  drop was vampire eating the table, and **ember's true lifesteal double-dip
  premium is ~2.5 pts, not ~25** (50.2→47.8 and 52.6→49.8, consistently
  signed, so a small real effect — with the caveat that bot lifesteal is a
  floor read and the human premium is plausibly larger).
- D also confirms the predicted trap Remi flagged: kill the sword and
  sustain doesn't leave the game, it concentrates in the next healer
  (vampire), which the round-17 battery already found from the other
  direction ("the sword is mandatory by STRUCTURE").

**3. Anger is unmeasurable with this instrument.** 98.5-100% in all five
configs — the mirror is ceilinged. Nothing in this file says anger is or
isn't over-valued; it says the element mirror cannot rank changes to it.
Reading anger requires a different ruler (the strategy mirror where
anger-scaling reads 78.2%, or a capped/duel lab).

**4. Why ember reads ~50% at all**: with sustain ruled out (finding 2), the
premium is what BALANCE.md already warns about — bots land a median ~172
fireballs/game, so a flat +4 per hit is ~688 free damage at bot volume, and
it costs 16 g total. The mirror number is a volume artifact plus real
strength, not a healing loop.

**5. Free findings from the secondary table**: midas win% is a clean stall
barometer across configs (1.4 → 19.9 tracking first-death time and game
safety); arcane at 27.7/26.7 in the no-healing world (vs 16.3/12.6 baseline)
says cadence gains value when nothing can heal chip back — mild support for
"any sustain devalues volume damage", the inverse of Remi's theory statement.

## Recommendation

Keep HEAD exactly as is. Both regen restorations fail their purpose: with the
lock, regen is combat-inert and only slows first blood; without the lock it
resurrects the 51 s round-1 stalemate, deletes malady from the meta, and
feeds midas stalling — while ember/anger stand untouched in both. Deleting
the Blood Sword's lifesteal doesn't deflate flat damage either; it crowns
vampire as the sole healer (+12 pts) and starves midas. The theory's
mechanism (damage double-dips via lifesteal) is real but tiny at bot level
(~2.5 pts of ember's ~50%), and ember/anger's big mirror numbers are volume
artifacts of the instrument plus genuine strength — if they need deflating,
the lever is their own numbers (dmgAdd, markDmg/markEvery) or a
better-aimed instrument, not the healing system. If Remi still suspects the
double-dip matters in HUMAN games (where lifesteal reads above its bot
floor), the test is a live playtest with `sword.lifesteal` halved, not a
regen revert.

## Provenance

- Worktree at `a3733e0` (round 19.6), 2026-08-09. Ten 800-game runs (5 configs × seeds
  1/7) + one 60-game smoke run. No gameplay change shipped; the only code
  touched was worktree-local instrumentation in tools/arena.js (r1 first
  death) and the REGEN/REGEN_LOCK_MULT constants for configs B/C (reverted).
- Config D/E overrides via the arena's `--fx` flag: `sword.lifesteal=0,0,0`,
  `vampire.chargeLifesteal=0,0,0`.
- Full 11-element tables for every run are reproducible from the command
  lines above; key rows are quoted in this file.
