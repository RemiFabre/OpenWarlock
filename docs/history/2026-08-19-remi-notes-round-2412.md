# Notes for Remi (OpenWarlock & the open web MOBA)

*Round 24.12, 2026-08-19 (same day as 24.11, which is archived at
`docs/history/2026-08-19-remi-notes-round-2411.md`): echo un-nerfed with an
honest button, and your Anger rework: the held charge.*

## 24.12: Echo keeps its strength AND its honest button

Your call after seeing the history: 24.11's [6,5,4] had silently taken back
24.8's measured strength patch (M4-echo 1417 -> 1516 on Hard; echo was never
strong). So `doubleEvery` is [5,4,3] again, and the TEXT changed instead:
"Every 4/3/2nd fireball you throw is doubled", which is the felt cadence
(the trailing ball advances the counter, your 20.1 ruling). At level 3 you
fire: normal, double, normal, double. No logic changed.

## 24.12: Anger is a held charge now (your design, shipped)

The 24.9 release bar is deleted. Owning Anger (any level) turns your
fireball key into a HOLD, using the issue-6 Hold the Line machinery:

- **Five equal-time tiers over 1.5 s**, gains back-loaded: the top tier is
  only the last 0.3 s before the fizzle, so a perfect charge is a real
  timing read ("the later stages are faster and harder to hit").
- **The ball GROWS**: radius x [1, 1.08, 1.16, 1.26, 1.4] (+40% at full,
  your number), on top of terra's multiplier.
- **The bank rides the hold**: released damage bonus = bank x
  [0, 0.15, 0.35, 0.6, 1]. A tap is tier 0 = ZERO bank: spam now pays
  nothing at all (the 24.9 bar still paid a spammer ~50%).
- **Overcharge = the cast is lost**: the cooldown was spent at the press;
  hold past 1.5 s and the ball simply never comes out.
- The charge bar is PUBLIC (five segments over your head, gold at full,
  flashing red when about to fizzle) and your own hold previews the growing
  ball. Mobility stays live mid-hold (blink/rush/vanish, the repulse
  whitelist); marks, the [36,27,20] cadence, the revenge first mark and
  +0.5/claim are all untouched.

**Bots charge** (your spec): every bot that owns anger commits to a hold
length at the press. Extreme and Faker hold a perfect 100%; Hard (and any
tier below, my interpretation of "all bots charge") rolls 50-100% of the
window per cast, seeded. No bot ever fizzles.

⚠ Two honest flags before the numbers:
- A bot's AIM is frozen at the press, so a 1.5 s perfect hold fires along a
  1.5 s stale line. Bots therefore UNDERPRICE the charge against anything
  that moves; a human who holds while tracking the target does not have
  this problem. Bot-artifact rule applies: read the elo shift as a floor.
- The Faker combo layer sequences casts without knowing about holds, so
  K-family combo timings may read worse than a human would play them.

## 24.12: The elo verdict (standard run, 2565 games, seed 1, 54 rows)

Two runs, and the pair tells the story better than either alone (raw
tables + full reading: `docs/history/2026-08-19-round2412-elo.md`; page:
`...elo-2565g-seed1-2.html`):

- **First run, bots NOT tracking during the hold**: the whole anger family
  collapsed to rank-bottom (M1 825, D2 639). Diagnosis: a bot's aim froze
  at the press, so every ball flew down a 1.5 s stale line, and no human
  plays like that (you hold while moving the cursor). I taught the bot to
  re-aim its committed target at release (first-order lead, never through
  Vanish) and reran.
- **The real table** (vs 24.10 baseline, D1 anchor stable 1598 -> 1604):
  anger rows UP on Hard: **M1 1529 -> 1614, D2 1117 -> 1440, D14 1236 ->
  1338** (Hard now releases a mean ~75% of the bank where the old bar paid
  a spammer ~50%, and bigger balls land more); K5 2621 -> 2537 (small; a
  full hold delays the Faker combo layer). **M4-echo 1572 -> 1579**: the
  deliberate consistency probe, cadence identical to 24.10, did not move.
  **The 24.11 trims read mild and as intended**: M5-midas -62, D4-leech
  -63.
- The two runs bracket the value of tracking alone at +500-800 elo on
  anger rows. What NO table prices: the release-timing mind game (early
  release to fake, holding to zone). Your feel verdict rules, as always.

## 24.12: Verified

532 vitest green (3 rewritten for the hold, 2 new: the charge
grow/bank/fizzle contract and the bot hold rules; plus the decoy suite
caught that clones must mime the RELEASE, which is in). Harness bots+coop,
arena 4p/8p, client-robustness chromium+webkit, solo-static, and a
screenshot pass: the five-segment bar, the growing-ball preview, the
near-fizzle red flash and the reworked HUD chip all render (the bar sits
above the name plate, per the round-21 under-the-HP-bar scar).

## Still waiting on you

Everything from 24.11's list (coin melt feel, midas per-cast question, the
21.9 leftovers, Normal/Hard standoff, demo Faker, lava 16 + treads feel,
crater sizes + portal cross, the friend trace, Blood Debt feel, A4/B4
floor), plus new: does the held charge feel right at 1.5 s / 5 tiers, is
+40% size the right ceiling, and should a fizzle have a sound.
