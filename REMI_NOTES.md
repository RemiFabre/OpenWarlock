# Notes for Remi (OpenWarlock & the open web MOBA)

*Rounds 23.1 + 24 + 24.1 + 24.2, 2026-08-14: the netcode agent's playout
fix (23.1), the vampire/lobby round (24), your second voice list (24.1:
midas, mark-hunting bots, meteor craters, portal exits), and the 1/x cadence
ruling (24.2), merged here in shipping order. Round 23 is archived at
`docs/history/2026-08-13-remi-notes-round-23.md`.*

## 23.1: Your friend's jerk was a REWIND, and it was ours

You two played on the current version and it was still bad for him. That
matters: round 21.11 already fixed the wire (keyframes ride beside the deltas,
the host can no longer go silent for seconds), so what was left had to be on
the drawing side. It was.

**What was happening.** His wifi delivers every update (he gets the same 14.1
per second you do) but in CLUMPS: gaps up to 284 ms in his measured trace,
because wifi re-sends late instead of dropping. The client draws the world a
little in the past, and it sized that "little" by jumping INSTANTLY to cover
the worst recent gap. One 284 ms clump made it jump +313 ms in a single frame,
and the drawn world visibly REWINDS a third of a second, then fast-forwards.
That, over and over, is "jerky, like low freq". His wifi supplies the clumps;
our code turned them into rewinds.

**What I changed (shipped).** The delay now WALKS instead of jumping: widening
runs the world at 0.8x for a moment (invisible), tightening at 1.03x, and the
drawn clock can never move backwards, by construction. On a healthy link
nothing changes.

**The honest cost.** Smoothness is paid in delay on a bad link. In the lab, a
3%-packet-loss wifi player goes from 13 rewinds a minute (4 seconds of
backward motion!) and 2.2 s/min frozen, to ZERO rewinds and 0.3 s/min frozen,
but plays ~0.46 s in the past instead of ~0.19. A healthy link pays ~20-35 ms.
If he now says "smooth but heavy", there are knobs to trade back; tell me the
feel and I tune.

**Anchored, as you asked.** `tools/rtclab.js` now simulates the player's eyes
(rewinds, freezes, felt delay) on top of the wire, and 8 new tests replay his
actual measured trace through the real code; the old behavior fails them, the
new one passes. Full story: `docs/history/2026-08-14-playout-rewind.md`.

## 23.1: Your two questions from the voice note

- **Prediction: not now.** It fixes baseline delay (which nobody complains
  about), not spikes (his problem), and it is the biggest complexity injection
  into the files we keep clean. Your instinct to keep it simple is right.
- **The delta-burst theory: right mechanism, already half-fixed.** The wire
  side of it was 21.11's fix. I also tested the tempting client-side version
  (hold the burst until its base arrives): it BACKFIRES in simulation, holding
  also withholds the acks and the host thinks the link is dying. Not shipped.

## 23.1: The one measurement still worth doing

Play one full game with him and run the recorder I'll give you (it now tags
the round number). If the trace thrashes from round 1, "fine early, bad late"
was perception; if it genuinely degrades late on current code, that is new
signal we measure before theorizing. Either way he should FEEL the difference
already: no more backward motion.

## 24: Vampire mark-and-feast (the build you described, shipped)

Your diagnosis (damage-scaling made it a damage build, the flat heal made it
a frequency build) is now designed around rather than retuned: the heal is
gated on PROXIMITY and on your own missing hp, two axes no other purchase
scales.

- Every fireball hit banks a **blood mark** on that victim. Marks never fade
  and never expire; they die when you die, when they die, or with the round.
- Walk inside your **feast ring** (radius 7 = Hat of Aura lv3, your number)
  and the whole pile on that enemy vacuums back: one mark per 0.1 s, each
  healing **2/3/4** (vampire lv1/2/3) **x 1 to 3, linear on YOUR missing hp**,
  re-read at every gulp. A started feast always finishes, even if they blink
  away (your ruling); your death voids your marks and the rest of the drain.
- No feast through Vanish or NOPE; reflections can never mark yourself.
- You (and everyone) see your ring: dotted dark red, deliberately not the
  Hat's warm solid ring. Marked bodies wear a blood pip + count; the vacuum
  is animated (pips fly home one by one) with the slurp on trigger.
- HUD chip: how many marks you have out, and what one mark pays right now.

**Measured** (the standard 2000-game Elo run, seeds 1 and 2; 1500 = roster
average, neighbours +/-40): D4-leech, the roster's vampire build, went
**1397 to 1603/1605, rank 19 to 7 of 42**, level with the best non-Faker row,
while the control rows moved <40. In a 400-game head-to-head it healed
3083 hp/game vs 923 for a Blood-Sword build. WARNING, both flags point the
same way: bots brawl INSIDE the ring all game and never burst a low vampire,
so 1600 is bot-flattered; your feel verdict rules. One-line levers if it is
too strong live: `markHeal` [2,3,4], `lowHpMax` 3.
Full report: `docs/history/2026-08-14-round24-vampire-feast.md`.

## 24: The Gathering

- **Golden Pillar avatar**: the choose-avatar grid now has the gold moai
  right after the stone one (NOPE's tint everywhere, including on the
  battlefield body).
- **Bot ladder**: Runner is no longer offered (it stays in the code for the
  combo lab and the Faker arsenals); the picker and the explainer chart now
  read Dummy, Easy, Normal, Hard, Extreme, Faker, sorted by difficulty.

## 24: Your Frost question, answered (nothing was changed)

The "frost freezes in place and banks the push" version is **NOT on main**.
It lives only on the `issue-5-sharpshooter` branch (commit `9770f0c`, the
published Sharpshooter version). Main's frost is unchanged: 3rd stack slows
(lv1/2) or freezes solid 2 s (lv3), knockback still applies normally.

## 24: Verified

505 vitest green (8 new vampire cases), harness bots+coop, client-robustness
chromium+webkit, solo-static, reconnect, arena 4p/8p, and screenshots of the
ring, the pips, the gulp flight, the gold moai and the bot picker. Round 24
touched no wire code; 23.1's own verification is in its history file.

## 24.1: Midas pays, it never taxes

Your ruling (spending gold must never make you weaker) is in: the -30/-15%
fireball malus and the plant-then-cash chore are deleted. Midas is Anger's
twin now: every 30/25/20 s (anger's exact cadence, your instruction) a BIG
gold mark lands on a random enemy; your fireball hit on them claims **+2 g
flat** and re-arms the clock. The mark is anger's orb restyled in gold, the
HUD confirms "mark is OUT: +2 g", and a coin burst plays on the claim.

## 24.1: Hard and above hunt their marks

Berserker, stalker and faker targeting now treats the enemy carrying YOUR
anger or midas mark as drastically closer than it is (`HUNT_MARK 40`
apparent units; softmax, so it is a strong pull, not a scripted override).
Gated on the bot KIND: Normal shares the Hard brain but keeps the old
behaviour exactly, as you asked. Consequence you should expect in the table:
anger rows (K5 above all) climb, because the mark no longer sits unclaimed.

## 24.1: Meteor breaks the ground (Ju's idea, made walkable)

The rock now leaves a permanent lava crater where it lands (radius 3, or 4
at lv2; the blast radius stays 6). It is REAL lava: 16 DPS, treads resist
it, Fire Walk ignores it, you swim faster through it, and a shove into it
credits the shover. Impact plays a ground-break: rock shards fly and a lava
geyser climbs and falls back into the fresh pool. Craters persist across
rounds like pillars; spawn seats slide sideways so nobody starts a round in
one. Ju's version made holes you cannot enter; yours is terrain you can
gamble on crossing.

## 24.1: Portal exits form a cross (the mine-camp fix)

Exact-center exits meant one mine at 0,0 punished every arrival. Each portal
now has its OWN exit: on its portal-to-center line, 5 units PAST the center
(your same-day correction: 2.5 was too bunched) and beyond a center mine's
trigger ring. The four exits form a cross, each marked with a small "x"
floor rune so everyone knows something arrives there. One mine can no longer cover
them all; camping now costs four mines on four telegraphed spots.

## 24.2: The 1/x ruling, applied to both mark hunts

Your rule is now in AGENTS.md (the handoff every session reads): levels that
scale a cooldown-gated effect are computed in FREQUENCY space, because the
felt thing is the rate (1/CD). "+p% per level" = divide the cooldown by
(1+p), round to the integer; haste already behaves this way, hand-set
cadences get hand-computed values with the formula in the comment.

Applied at +35% mark rate per level:
- **Anger markEvery [30,25,20] -> [36, 27, 20]**, anchored at lv3 = 20 s
  (your correction: no anger buff; 20 x 1.35 = 27, x 1.35 again = 36.45).
  lv1 is slightly slower than before, lv3 identical.
- **Midas markEvery [30,25,20] -> [20, 15, 11]** (your new 20 s base, same
  +35% steps). Base income roughly +50% at lv1 on top of the rework, which
  also answers yesterday's "midas gold is thin for bots" finding.

## 24.3: The normalization pass (your numbers)

- Pure-frequency family near the 35% default: Pillar [14,10], Shield
  [15,11], Blood Debt [15,11], Rush [10,7].
- **Meteor dmg [16,30] -> [25,35]**: the doubling is gone, lv1 is a real
  buff (dps step +116% -> +61%), and **the ground-break is the LEVEL 2
  special now** (craterR [0,4]): lv1 leaves the floor intact.
- **Mine cd flat 9** (was [9,8]): lv2 already buys damage + the second
  stored ball, which is almost the whole gimmick; the cd trim on top was
  excessive. Damage kept at [10,15].
- Repulse and the rest: accepted as they are (your call: low-frequency
  spells buying radius/length/damage instead is coherent).

## 24.4: The instrument cleanup (your call after the sweep/elo confusion)

Four tools, one question each, zero overlap now:
- **elo.js** ranks the 42 builds (2000 games, ONE seed, the standard run).
- **pair.js** explains a gap head-to-head (and carries the `--fx` sweep hook).
- **arena.js** is the smoke + health lab, slimmed: games finish, lava share,
  comebacks, focus, any seat count, seconds. Its `--isolate`, `--ladder`,
  `--mirror` and `--probe` options are RETIRED (superseded).
- **h2h.js** orders the bot tiers.
Deleted outright: `strategy-study.js` (the round-16 ranking, superseded by
elo.js; its shared `EXHAUST_PASS` tail moved to roster.js) and `duel.js`
(pair.js answers it with real builds). Everything retired is one `git show
ad9d54e` away.

## 24.4b: The Gathering regression, root-caused and fixed (your report)

Both bugs were real and both were regressions, found by a review agent and
verified with automated spam-click tests:
- **The picker drift**: round 23's lobby-scroll commit (ae577ab) accidentally
  deleted the round-22 "reserved height" rule, so the vertically centered
  slab GREW with each bot row and everything above the list slid up. The
  reserve is back (one CSS token); the add-bot buttons now sit at pixel-
  identical positions before and after adding 4 bots.
- **The unreliable cross**: the warlock list was wiped and rebuilt on EVERY
  snapshot (15 times a second), so the ✕ you pressed was usually destroyed
  between mousedown and mouseup and no click ever fired. The list now
  rebuilds only when a rendered fact actually changes (ping badges update in
  place); four single clicks removed four bots in the test, no retries.
The fix DELETED per-frame DOM churn instead of adding machinery.

## 24.4c: Bots (your feel pass)

- **Extreme and Faker never eat a telegraphed bolt** (boltDodge 0.85/0.95
  -> 1, your ruling).
- **The wounded-prey dive is deleted**: the berserker brain used to close to
  1.5 units on any target under 30 hp, an unreactable shield-or-die kill.
  One prowl ring at every hp now.
- **Prowl rings: Hard 12, Normal 18** (was effectively 8.5 / 13). ⚠ Measured
  side effect: the Hard-vs-Normal h2h gap WIDENED to 82% (was 66-69),
  because Normal's loose aim lands little from 18 units. If Normal now feels
  too passive, its standoff (or aimErr) is the lever.

## 24.5: Melee builds DIVE half the time (your spec, both cuts measured)

Bots whose build owns vampire or the Hat of Aura now DIVE to the old 1.5
ring 50% of the time, re-rolled every 5 s (your second cut; the first cut
used the old 8.5 prowl ring and measured exactly zero: 8.5 never reached
the 7-unit auras). Raw elo verdict on the dive: it COSTS the bots about 100
(D4-leech 1427 -> 1332, hatburner 1392 -> 1327). The old dive was a
finishing move on wounded prey; the unconditional dive parks a bot in
point-blank range of healthy enemies and the feast does not pay for what it
eats. Bots cannot time it; humans can: treat those rows as design floors.
Shipped as specced (bots now visibly play their archetype). Middle option if
the feel is off: close ring 6 (inside the auras, outside point-blank).
Tables: `docs/history/2026-08-14-round245-elo-close-in.md` and
`...round245b-elo-dive.md`.

## 24.6: Bots and Blood Debt (your ask, with one correction)

Correction first: bots ALREADY pilot the reflection Shield, at every tier
that owns one; any inbound ball inside the threat window triggers it (the
stalker even chooses between sidestepping and shielding). So the gap was
only Blood Debt, and it is closed: Hard and above now cast Debt on the same
imminent-ball read, as the understudy when Shield is absent or cooling
(owning both stacks the two windows). Normal and below unchanged, per your
spec. ⚠ One honest catch: no build or roster row BUYS debt yet, so this
logic is live only in draft and testing lobbies until you say which builds
should shop it (the roster review proposed nothing there; one word and I
add it to a build or the shared tail).

## 24.7: Balance runs are a web page now, and the roster speaks your questions

**The page.** Every `tools/elo.js` run now ends by writing a small
self-contained HTML page into `docs/history/` and opening it in your browser
(no flags needed; `--no-open` exists). Ranking on the left; hover any row
(click pins it) and the right panel shows the full build: what it isolates,
agent notes, and the WHOLE buy order as spell/item symbols with the level as
a small number, auto-fill dimmed, plus a marker at the ~145 g an average
seat actually earns. Zero agent context is spent: the tool does it itself.
`node tools/report.js --roster` renders the same page with no numbers, for
reviewing builds (that page should be open in front of you now).

**The roster** (42 -> 53 rows, full reasoning in
`docs/history/2026-08-14-round247-roster-rework.md`):
- **Family G**: D1-warlord is the base; each row changes ONE thing. G1
  +Shield, G2 +Blood Debt (same slots as G1, so G1-G2 is also Shield vs
  Debt), G3 no sword (banned, padder included, a hole I had to fix), G4 no
  arcane. Read each against D1.
- **Family M**: one mutation maxed FIRST, then an identical scaffold (items,
  then elements lv1, lv2, lv3). All six cost 166 g exactly, so M vs M prices
  the mutations directly.
- **D3-tycoon redesigned**: the echo-amplifies-midas premise died with 24.1;
  it is now D2-executioner's exact chase core with the gold mark instead of
  the red one, so D2 vs D3 prices the two mark hunts against each other.
- **D4-leech respecced** to your frequency read: vampire + arcane +
  hourglass + echo, no damage elements. Marks land per hit; cast rate IS the
  build.
- **D13-bastion, new**: Shield 2 + Blood Debt 2 + armor. With G2 this closes
  24.6's "which builds shop debt" question.
- Faker family K untouched, as you asked. A, B, C, E, F kept (still
  coherent post-reworks).

**Measured** (you approved; your per-build ruling applied: 2500 games keeps
~190 seats/row at 53 rows, one seed as always; page auto-opened, raw table +
full reading in `docs/history/2026-08-14-round247-elo.md`):
- Faker rows still own ranks 1-5 (K5 2919); the driving gap you wanted
  visible is ~+1000 elo over the same builds on Hard.
- Warlord variants vs D1 (1479): **+Blood Debt +243** (best non-Faker row),
  +Shield +159, no-sword -94, no-arcane -23 (noise). ⚠ Debt/Shield are
  bot-timed since 24.6, so those two are likely FLATTERED: feel before
  pricing.
- Mutations on the identical scaffold: anger 1650 > malady 1611 > midas
  1581 > vampire 1479 > echo 1417 > frost 1353.
- The two mark hunts, same chase shell: anger (D2 1407) out-earns midas
  (D3 1205) by ~200; midas prefers the M scaffold (1581), where its gold
  feeds a real curve.
- D4-leech (frequency respec) 1520, mid-pack above D1; D13-bastion 1355 =
  buttons are worth ~170 over armor-only D8, defense still under average.

## 24.7c: The all-Faker mirror table (your ask)

Same roster, same 2500 games, every seat on the Faker brain. ⚠ Raw elo is
not comparable across the two tables (the K rows hand back their driving
edge and Bradley-Terry redistributes it); read each row against D1-warlord,
which sits ~1470 in both. Full movement analysis:
`docs/history/2026-08-14-round247-elo-faker.md`. The short version:
- **The mark hunts explode with a real pilot**: D3-tycoon swings +862 vs D1
  (rank 47 → 3), M5-midas is rank 2, M1-anger rank 1. Midas never needed a
  buff, it needed hands. My earlier "D3 is a trap" verdict was a
  Hard-pilot verdict; I withdraw it.
- **The K combo arsenals collapse vs equals** (K1 rank 5 → 51): combos prey
  on opponents who eat telegraphed bolts; vs peers only K5 (plain anger)
  stays good. Not a live-play nerf signal: no human dodges like a Faker.
- **Defense climbs when enemies aim** (D8, D13, sumo, the item rows all
  up); **volume-sustain collapses** (D4-leech, spoon rows, the E family
  down): dodgers dry up per-hit healing.
- **Frost is vindicated** (−126 → +315 vs D1): Hard bots waste the freeze,
  Fakers spend it. The two tables now BRACKET the skill spectrum.
- **Stable on both tables, so most believable**: Debt/Shield are the two
  best Warlord buys (Debt's +243 halves to +123, converging with Shield);
  arcane is skippable in the Warlord shell; echo and C6-bolt-combo are
  weak everywhere (the honest balance candidates).

## Still waiting on you

The 21.9 leftovers (mine throwability, the two 21.7 sounds, 3v1 kill-target
cap, Switcheroo names), the Normal/Hard standoff verdict, whether the demo
Faker returns to fresh lobbies, a feel pass on lava 16 + the treads nerf, a
feel pass on the vampire feast numbers, a feel pass on the 24.1 batch
(midas +2 g, crater sizes, the portal cross), the one-game trace with
your friend (23.1 above), and the 24.7 follow-ups: a live feel-check on
Blood Debt (the table's best non-Faker purchase, possibly bot-flattered),
whether D3-tycoon's 1205 asks for a midas value bump or just a different
home, whether frost-last is expected, and whether any old rows retire.
(24.6's "which builds shop debt" is answered: G2 and D13.)
