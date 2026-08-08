# constants.js — sweep tables and design history (extracted 2026-08-08)

These blocks were moved verbatim (leading `//` markers stripped) from comments in `shared/constants.js`, which carries pointers back to the sections here.

## ARENA.NEVER_STOPS

```
2026-08-08 (Remi, TEST — one flag to revert): the ring never stops. It
shrinks continuously from START to NOTHING, so the whole arena eventually
becomes lava; MIN_RADIUS, OVERTIME_GRACE and OVERTIME_SHRINK are all
bypassed while this is true. Set to false and the classic hold-then-sudden-
death behaviour is back, untouched.
⚠ VERSUS ONLY since round 16: the co-op campaign is exempt (stepBattle).
It shipped without a co-op re-measure and level 8 (a ~100 s fight) fell
from 68/66/57% clear to 80/46/6 under it — the campaign is priced around
the holding ring. See the guard in shared/sim.js.
```

## ROUND.COOP_MAX_ROUNDS

```
Co-op campaign: 10 levels, and this many ROUNDS to clear them. Clearing a
level advances you; wiping costs a round and you retry the same level with
one more shop's worth of gold — so this is the retry budget (3 spare
rounds). Measured 2026-08-06 with tools/coop.js: a ★★ berserker party
spends 10.4 (3 players) to 12.2 (solo) rounds on a full run, and finishes
the campaign 100% / 95% / 81% of the time at 3 / 2 / 1 players. 14 rounds
is a formality, 12 locks a solo player out a third of the time.
```

## GOLD

```
Anti-snowball economy (2026-08-03 playtest): passive income dominates.
HARD CAP: in a 4-player game the max per-round income is
ROUND_BASE + 3*PER_KILL + ROUND_WIN, and the floor is ROUND_BASE — keeping
ROUND_BASE >= 3*PER_KILL + ROUND_WIN guarantees the player with EVERY kill
can never out-earn a player with none by more than 2x. (Bounties can't
break the cap: the leader never collects one — see kill() in sim.js.)
Totals tuned down 2026-08-03 evening playtest: with 11/3/2 everyone was
full-build before the end — the cap ratio was right, the volume wasn't.
```

## SPELLS (power tier)

```
---- power tier: expensive, but available from round 1 ------------------
Going for these is a real tradeoff (their entry costs rival a full item)
but they end fights. 2026-08-07 (Remi, round 12): the `minRound: 5` gate is
GONE — they are buyable from the first shop.
⚠ BOTS PILOT NONE OF THESE. Remi's rule: an AI must never buy a spell it
uses badly, so the power tier stays out of every BUILDS/BOT_BUILDS order
list (below) — that omission is the gate now, and it is load-bearing.
Teaching bots to pilot them is the open lab work (AGENTS.md debt #2).
```

## SPELLS.vanish

```
---- 2026-08-07 (Remi, round 12): invisibility -------------------------
No restrictions on purpose (casting, attacking and colliding all still
work) — the level buys DURATION only, linearly.
⚠ Two implementation rules, both non-negotiable, see docs/ROUND12.md N4:
it must be stripped in snapshot() (never merely skipped by the renderer,
or devtools sees through it), and bot perception must be masked too or the
top tier becomes an aimbot that ignores the spell.
```

## ITEMS

```
---- Items (passive, 3 LEVELS each) ------------------------------------
mode: 'elemental' marks wares that only exist (shop + buy)
when the game runs the elemental ruleset; classic never sees them.

2026-08-07 (Remi, round 12) — items are LEVELLED, like spells.
The history: items used to be unique (max 1), then freely stackable at +20%
per copy (2026-08-06). Stacking produced a meta nobody wanted — four or five
pairs of Boots, past the speed threshold where a good player simply cannot be
hit, and those seats topped the table. Remi's diagnosis is the general one and
worth keeping: *a single stacked dimension exacerbates whatever gameplay
problem it touches; let players chase one axis, but make breadth the better
default.* So: hard cap 3, the SAME gold cost at every level, and each level
worth less than the last. Cost no longer escalates — the diminishing effect is
the brake now.

Values below are ABSOLUTE CUMULATIVE totals at that level, matching how
SPELLS.damage and ELEMENTS already read (never per-level increments — an
agent should be able to read the answer off the array without doing algebra).
Boots are Remi's spec: +15% / +10% more / +7% more → 1.15 / 1.27 / 1.35.
```

## ITEMS.treads and cape (round 15)

```
---- 2026-08-08 (round 15): Remi asked directly whether the Cape and the
Lava Treads should be buffed, having read the round-13 item table. They got
OPPOSITE answers, and the reason is worth more than either number.
Both were measured in the isolation lab (`tools/arena.js --isolate=`, see
BALANCE 15A for what it is): 4 identical seats, one holds the item, the
other three hold a price-matched do-nothing control, so the baseline is
exactly 25% by symmetry and the number is points over wasting the same gold.

 · THE TREADS WERE REAL AND TOO SMALL. Points over 25, 800 games/cell,
   Hard berserker, seeds 1 and 7 (2σ ≈ ±3.1 on one cell):
       lavaMult              lv1     lv2     lv3
       [0.85,0.74,0.68] ship +1.4    +2.9    +6.4     <- was worth ~nothing
       [0.60,0.45,0.35]      +4.4     --    +11.4
     **[0.50,0.36,0.28]      +6.0    +8.1   +12.7  <- SHIPPED**
       [0.45,0.30,0.20]      +7.9     --    +11.0
       [0,   0,   0   ] ceil +16.5    --    +20.0     <- total lava immunity
   The ceiling is the important row: even IMMUNITY to the lava is only worth
   ~+17 at this price, because the lava is 8.5% of all damage dealt (BALANCE
   13A). So the treads can be made worth their gold, and can never be made
   a headline item — the value is bounded by that 8.5%, not by this array.
   Value scales roughly linearly with the fraction of burn removed, which is
   why the shipped −15% measured as nothing: 15% of a small thing.
   ⚠ Checked for the trap below: the sign is the SAME at every bot tier
   (Extreme reads +2.5 shipped / +13.8 at the new values, i.e. the same
   story roughly doubled), so this is a number problem and a number fixes it.

 · THE CAPE IS NOT A NUMBER PROBLEM — NOTHING CHANGED HERE, DELIBERATELY.
   Its measured value depends on WHO IS WEARING IT, and it changes SIGN:
       cape lv1, 800 games, seed 1  shipped (0.92)   kbMult 0 (immune)
       Normal  (brawler)                  --             −11.5
       Hard    (berserker)               +0.9            −19.8
       Extreme (stalker)                 +1.1            +25.6
   (lv3 on Extreme: +9.1, against −2.0 on Hard. On Hard the direction sweep
   is 0 → −19.8, 0.5 → −10.4, 0.92 → +0.9, 1.25 → −5.0: the peak is at "no
   cape at all", and moving either way from ×1.0 loses points.)
   Knockback resistance is worth −20 points to a
   berserker and +26 to a stalker. A bot that charges in and never retreats
   is HELPED by being shoved out of a fight it is losing; a bot that dodges,
   kites and holds its ground is helped by not being shoved at all. A human
   is at least as positional as the stalker.
   So the honest reading is that the Hard-tier number Remi saw (11.7 in the
   round-13 table, ~0 here) is a BOT ARTIFACT, and buffing the cape on it
   would be tuning the item for the pilot that misuses it — the exact
   mistake AGENTS.md says to flag rather than pay for. Note also that a
   "buff" here means pushing kbMult DOWN, i.e. toward the value that
   measures −19 on Hard: the lab would report the buffed cape as worse.
   ⚠ THIS ONE NEEDS REMI, NOT MORE GAMES. If it feels weak in his hands the
   lever is this array; if it feels fine, the round-13 table was reading a
   berserker's mistake. See BALANCE 15D.
```

## ITEMS.sword

```
---- 2026-08-07: Remi played a game with it and reported *"the sword that
does lifesteal is very expensive and when I looked at my numbers with it, it
was really really weak"*, with the hypothesis that *"a lot of damage comes
from the lava... lifesteal only works on the damage we deal ourselves, so in
the end it's not that much"*. Both halves were measured. NOTHING CHANGED
HERE, and here is why.

 (i) THE LAVA HYPOTHESIS IS FALSE, and it is the cleanest number in the
     study. Across 300-game mirrors, of ALL damage absorbed by all bodies
     the lava is **8.4-8.8%** and other players are 91.2-91.6% — same in
     classic and elemental, same at seeds 1 and 7, and flat at ~8% in EVERY
     round from 2 to 18 (only round 1 is higher, 15-16%, because spells are
     still level 1). From the dealer's side, 91.3% of the damage you are
     credited with causing is your own hits, i.e. lifesteal-eligible.
     The lava is the EXECUTIONER, not the damage dealer: it takes ~30% of
     the kills (AGENTS.md) off ~8.5% of the damage, because it finishes
     people who were already chipped down by players. So lifesteal's ceiling
     is barely dented by it, and "make lifesteal pay on lava too" would be
     chasing a cause that does not exist. (dmgTakenLava/dmgTakenDirect were
     added to the sim for this; nothing had ever recorded uncredited burn.)

 (ii) THE SWORD IS THE SECOND-STRONGEST ITEM IN THE GAME, not a weak one.
     Measured against a lab-only CONTROL item — same 15 g, three levels,
     `fx` literally `{}` — in mirror games where every seat runs an
     identical long build order and only the probe purchase differs
     (3000 games, Hard berserker/bruiser, seed 1, ~2400 games/arm, 2σ ±1.8).
     Points over wasting the SAME gold on the control:
         item     lv1 vs control1    lv3 vs control3    lv3 − lv1
         amulet        +39.1              +83.0            +43.3
         sword         +36.5              +40.0             −3.6
         boots         +27.5               +8.2            −32.2
         ring          +24.9              +10.7            −28.9
         treads        +19.7               +3.7            −32.5
         cape          +11.7               +0.4            −30.6
     The control is 15 g at every level, so it is exactly price-matched to
     the SWORD and 3-5 g dearer than everything else — the bias runs against
     the sword and it still places 2nd at both levels. Calibration for the
     absolute scale (the item-side twin of the 2.7% do-nothing element):
     burning 15 g on the control scores 7.8% and burning 45 g scores 0.7%,
     against 31.6% for a seat that just buys the tail. 15 g is worth ~24
     points in this game; the sword returns ~36.

 (iii) WHAT IS REAL IN HIS REPORT is the LEVELS and the SCOREBOARD.
     · Levels: sword lv3 is 3.6 points WORSE than lv1 (44.3 -> 40.7) because
       30 g of lifesteal loses to 30 g of the rest of the shop. That is
       true of every item except the amulet, and by far the least badly for
       the sword — so it is an ITEM-LEVELS question (see the note in ITEMS
       above), not a sword question. Build-dependent: lv2/lv3 are free in a
       bruiser (39.1/37.0 vs 38.4 at lv1), mildly bad in a turtle, and a
       disaster in a rusher (46.6 -> 28.3 -> 17.3), whose budget is tighter.
     · Scoreboard: the standings print "Lifesteal" directly beside "Regen",
       and for a sword-lv1 bruiser those columns read 349 and 357. The 15 g
       item appears to heal slightly LESS than the free passive regen — so
       the number he read is real, and it understates the item, because
       lifesteal arrives mid-fight while regen is throttled to 25% for 2.5 s
       after every hit (PLAYER.REGEN_LOCK). In-combat hp and out-of-combat
       hp are not the same hp. THIS is the "really really weak" reading.
     The recommended fix SHIPPED in round 16 (Remi asked for it directly):
     every lifesteal heal >= 1 hp now pops the green "+N hp" on the healer
     — see applyDamage in sim.js. The sword is no longer silent.

 ⚠ BOT CAVEAT on all of the above: bots never dodge, never bait, and never
 make the trade a human makes with a lifesteal build ("I can win this
 brawl because I heal through it"). Lifesteal is a mechanic that rewards
 choosing to fight, and nothing in this lab chooses.
```

## ITEM_FX (level curve, round 15)

```
Per-level effect totals, indexed by level-1. Scalars apply at every level.
2026-08-03 1k-game study: sustain items dominated every mirror table
(turtle 48-50%, bruiser 42-65% win rates vs the 25% baseline) after the
lava -30% / knockback -10% retune made chip damage weaker. All five
trimmed one gentle step; mobility spells got cheaper entries instead.
Level 1 is a small NERF vs the old single copy (boots 1.2 → 1.15, treads
0.8 → 0.85, cape 0.9 → 0.92) because three levels are now reachable.
---- 2026-08-08 (round 15): the LEVEL curve, measured level by level -------
The round-13 addendum reported "item levels 2-3 are near-worthless across the
whole roster, lv1→lv3 is −29 to −33 points". That does NOT reproduce, and the
reason is a flaw in how it was measured: its control item cost a flat 15 g at
every level, so a level-3 item (30-45 g) was being compared against a 45 g
waste while a level-1 item (10-15 g) was compared against a 15 g waste — the
mismatch grew with the level. Against a control that is price-matched AT EVERY
LEVEL, every item's value RISES with its level (`--isolate=items`, 800
games/cell, mean of seeds 1 and 7, points over wasting the same gold):
    item     lv1     lv2     lv3        item     lv1     lv2     lv3
    amulet  +63.5   +73.9   +74.9*      boots    +8.7   +18.9   +19.0
    sword   +41.0   +58.8   +64.4       treads   +1.4    +2.9    +6.4
    ring    +12.0   +20.8   +27.9       cape     −0.2    −0.9    −1.4
  (*the amulet wins 100.0% of its games at lv2-3: the instrument saturates
   there and cannot resolve the last two levels. See BALANCE 15C.)

So levels 2-3 are NOT worthless. What is true — and it is the real finding —
is that they LOSE TO BREADTH. The level ladder (`--ladder=`, four identical
seats capped at 0/1/2/3 levels of one item, everyone spending the saved gold
on the same shared list, so 25% = "this level is exactly worth its price"):
    item    lv0    lv1    lv2    lv3     reading
    amulet   0.2    3.4   37.6   58.9    mandatory, and deep
    sword    3.9   21.5   33.3   41.5    every level pays
    boots   32.3   31.6   21.8   14.4    level 1 breaks even, 2-3 are traps
    ring    32.1   31.7   22.1   14.2    same shape
    treads  48.6   28.8   15.7    7.0    even level 1 lost to the alternative
    cape    53.7   29.8   12.9    3.6    the worst purchase in the shop
Both tables are true at once: level 2 of the boots beats 10 g of NOTHING by
+10 points and loses to 10 g of THE REST OF THE SHOP by 10. That gap is the
amulet and the sword, which return 3-6x more per gold than anything else.

⚠ THE FLAT COST IS NOT THE PROBLEM, so it was NOT touched (Remi's explicit
round-12 instruction, and the measurement backs it): the levels lose to
breadth, so ESCALATING their cost would make them worse, not better, and the
measured cause is the amulet/sword outlier, not the price of a second pair of
boots. Deliberately not acted on here — nerfing the two best items in the shop
is a much bigger change than this round's brief, and it is BALANCE 15C's open
question for Remi.
The one thing that WAS a curve problem is boots level 3, which measured as
adding literally nothing (+18.9 → +19.0, i.e. 0 ± 3 across two seeds). The
falloff was too steep at the last step only:
    speedMult                lv2     lv3
    [1.15,1.27,1.35] shipped +18.9   +19.0   <- level 3 buys nothing
  **[1.15,1.29,1.42]         +16.6   +26.9   <- SHIPPED (seeds 1/7: 25.7/28.1)**
Level 1 is untouched at ×1.15 — that is Remi's own spec ("+15%, then +10%
more, then +7% more") and only the last step is re-cut, to +14pp/+13pp instead
of +12pp/+8pp. ⚠ This is still an edit to a number he specced by hand: the
one-line revert is [1.15, 1.27, 1.35]. Round 11's 4-5-boots meta cannot come
back from it — that needed UNCAPPED stacking (1.2^5 = ×2.49); this is ×1.42
behind a hard cap of 3.
```

## ELEMENTS

```
---- Elements (elemental mode only) --------------------------------------
Each element is a 3-LEVEL upgrade path and they STACK — frost+ember is a
chilling fire; buy as many as you can afford. Adds are summed, mults
multiplied across everything you own. Per-level values are arrays indexed by
level-1; scalars apply at every level. Every element is a fireball rider
(needs Fireball >= 1 — which everyone owns from spawn).

2026-08-08 (Remi, round 16): ELEMENTS ARE THE FIREBALL'S PROGRESSION, and
that is all they are. The fireball no longer levels in elemental mode (one
purchase used to buy damage AND push AND cadence — OP and unreadable), so
that bundle is split into single-axis elements, CHEAP on purpose ("sometimes
you're low on gold and it gives you something to do in the shop"):
  ember = damage · gale = push · arcane = cadence · terra = size · ghost = speed
Level 3 of gale / arcane / ghost costs more and unlocks a SPECIAL instead of
a third stat step; ember and terra stay cheap all the way (Remi: "do it like
fire"). Anything touching ALL spells is thematically an ITEM now: arcane's
old global CDR became the Hourglass of Haste, and CHRONOS WAS REMOVED — its
on-hit refund, narrowed to fireball hits only, is arcane's lv3 special.
Pre-round-16 specs and their sweep tables: git c38730f:shared/constants.js.
```

## ELEMENTS.frost

```
2026-08-06 rework (Remi: the old always-on chill "wasn't impactful").
Now it BUILDS: every frost hit leaves a stack that never melts, and the
3rd one detonates. Stacks are on the VICTIM and, since round 12 (S2), are
PRIVATE to each attacker — you see and consume only your own.

---- WHY frost reads ~17% in the 12-element table, and why it is NOT retuned
(investigated 2026-08-07; three candidate causes, each tested separately)
 (i) THE PRIVATE-STACKS CHANGE — RULED OUT BY MEASUREMENT. The standard
     elemental study deals every seat a DIFFERENT element, so it contains
     exactly ONE frost player, and with one attacker private and shared
     counters are the same number. Verified rather than argued: the shipped
     sim and a lab copy patched to share stacks produce BYTE-IDENTICAL
     results at 1 frost seat (37.2% vs 37.2% at seed 7, 39.5% vs 39.5% at
     seed 23, 600 games each). Where the change IS visible — 2 frost seats
     in one game — it costs 2.4-3.9 points (private 24.9/24.7/23.3 vs shared
     27.3/28.5/27.2 at seeds 7/23/41), and ~1 point at 3 seats. That is the
     whole nerf, and it only exists in multi-frost lineups.
 (ii) DISPLACEMENT BY THE ROUND-12 NEWCOMERS — real but small. Dropping
     vampire+chronos+ghost from the pool leaves frost at 17.0% (both seeds);
     also dropping the reworked mosquito lifts it to 19.8%. So ~3 points.
 (iii) PRE-EXISTING, and this is most of it. Frost's berserker-mirror number
     has always been low and swingy: 27.1% (round 10 report), 23.2% (round
     11 report), 16.9% now — and 16.0% for the grunt tier as far back as
     round 10. The "29.4%" in docs/ROUND12.md is a single unreplicated cell.
     16.9% is ~1.2σ under round 11's 23.2% at this study's precision.
 Also ruled out: constant knockback (S1). Restoring HP-scaled knockback
 (KB_CONSTANT_MISSING=null) moves frost 16.5 -> 18.0% and 17.9 -> 18.6%.

⚠ AND THE MIXED TABLE IS THE WRONG RULER for "is this element weak". In the
absolute lab (1 element seat vs 3 seats with NO element, 600 games — see the
ghost block below for the 2.7% no-op calibration) frost wins 37.2/39.5%
while the no-element seats win 20.2-20.9%. Frost is a MID-STRENGTH element
in a very strong field, not a broken one: same lab, vampire 68-71 · mosquito
60-62 · momentum 59-62 · venom 58-60 · ember 50-53 · arcane 48.7 · terra
43.8 · chronos 42.5 · frost 37-40 · gale 34-38 · ghost 18-20 · midas 0.5-1.0.
Buying frost up toward 25% in the mixed table would just inflate the field.
NOTHING CHANGED HERE 2026-08-07.
```

## ELEMENTS.gale

```
2026-08-08 (Remi, round 16): gale is the fireball's PUSH axis — a cheap
flat kbAdd at lv1/2 (the fireball's own kb is 65, so +7/+14 ≈ +11/+22%),
and the pricier lv3 unlocks the round-13 stack-and-burst gust: every gale
fireball that lands leaves one PRIVATE stack, knockback is normal while
they build, and the 3rd stack is spent on one enormous shove
(burstKbMult, resolved in galeHit — sim gates it on burstAtLevel).
⚠ The burst lever is VIOLENTLY STEEP (round-13 sweep: +20% on the burst
was +14 points); the old three-level burst [1.84, 2.38, 2.95] and its full
sweep are at git c38730f:shared/constants.js. 2.4 = the mid value.
⚠ Bot caveat carried forward: bots never bait or time a burst, so every
lab number on the gust is a floor on its value in human hands.
```

## ELEMENTS.midas

```
2026-08-06 rework (Remi, from human play — the lab's 1% win rate is a
gold-saturation artifact, see BALANCE.md): +1 g per hit is ALREADY strong,
so the payout is capped there forever and the levels buy back a real
drawback instead of raising income. Level 1 is half a fireball.

---- 2026-08-07: midas measures 0.0% again. NOTHING CHANGED, and here is why.
Round 12 capped items at 3 levels, which partly undid the round-11 stacking
that had given bot gold somewhere to go — and midas immediately fell back to
0.0% while ending games on 54.3 average gold against ~13.8 for every other
seat. AGENTS.md's rule is "before believing 'bot artifact', try to DELETE the
artifact", so it was attacked from three directions (800 games/cell):
  · MORE TO BUY. Appending every spell a bruiser bot can actually pilot
    (lightning, rush, boomerang, shield, teleport, pillar) to its build order:
    midas 0.0% -> 7.0 / 10.0 / 8.9% (seeds 1/7/23) and its leftover gold
    54.3 -> 27-29. Adding crown+echo on top changed nothing further.
  · SCARCER GOLD. GOLD.ROUND_BASE 8 -> 5 -> 3 with the shipped build order:
    0.0 -> 4.4 -> 12.5%, leftover gold 54.3 -> 30.9 -> 24.1.
  · BOTH AT ONCE (ROUND_BASE 3 + the long order): 17.3 / 19.0%.
Every axis that makes gold matter moves midas monotonically up, and it is
still saturated (20.6 g left over) at the far end. So 0.0% is a FLOOR set by
the −50% damage drawback, not a measurement of the element.
The control that proves the drawback half is real and the income half is
invisible: midas with goldOnHit forced to 0 measures 0.0% with 3.3 kills;
shipped midas measures 0.0% with 7.9 kills. The income buys 4.6 kills' worth
of tempo and zero wins, because everyone finishes their build anyway.
⚠ Calibration for whoever reads a 0.0% next: in the absolute lab (see ghost)
an element that does literally nothing but still costs its 26 g scores 2.7%.
Midas scores 0.5-1.0% — i.e. it is currently measured as slightly WORSE than
paying 26 gold for nothing, which is exactly what "a real drawback plus an
unspendable upside" looks like. Remi's human read was right the last time
this number was 1%; do not act on it.
```

## ELEMENTS.momentum

```
2026-08-07 (Remi, round 12) — REWORKED and RENAMED from 'critical', a name
that never described what it did. History worth keeping, it is two lessons:
the original ramp was correct but invisible (+0.45 dmg/hit), so Remi
reported a working mechanic as broken; uncapping it moved the lab number
only 21→24% because bots rarely pass 15 stacks. Both times the mechanic was
fine and the FEEL was the bug.
Now the stacking is PERMANENT — it accumulates across the whole game, not
the round, so a player who keeps landing fireballs ends the match with a
cannon they earned over 20 rounds. Damage ONLY: knockback stays normal, so
a big Momentum stack melts people rather than launching them into the lava.
The white bonus number over the damage number is not decoration, it is the
fix for the 2026-08-06 report — see docs/ROUND12.md S5.
rampDmg was Remi's suggested +1/hit and it MEASURED 100% win rate (2026-08-07,
1000 games): a momentum seat lands a median 78 fireballs per game (max 108
over ~15 rounds), so +1/hit is +78 damage on a 7-14 damage fireball against
100 max HP — exactly the one-shotting the design ⚠ predicted.

---- RE-SWEPT 2026-08-08 (round 16): locking the fireball at lv1 in
elemental mode silently TRIPLED momentum's relative power — the ramp used
to compete with a fireball that grew to 14 damage, and now rides one stuck
at 7, so the round-13 value (0.06) measured 80-87% across three seeds, the
strongest element ever recorded here. Swept on the standard elemental
study (4 seats, baseline 25%), 400 games × 2-3 seeds per row, keeping the
1:1.5:2 level ratio throughout:
  rampDmg lv1: 0.06 → 81.8% · 0.045 → 67.0 · 0.035 → 50.7 ·
               0.025 → 32.5 · 0.02 → 24.5 · 0.015 → 11.8
0.02 confirmed at 800 games × seeds 1/7/23: 24.1 / 21.0 / 23.3 (mean 22.8).
**SHIPPED 0.022** (interpolates to ~27%): 0.02 put the break-even against a
plain fireball at 87.5 landed hits, a hair PAST half a median game — the
median is 172 hits/game now (re-measured round 16; it was 78 in round 13,
because a lv1-locked fireball means longer fights and far more casts), and
the test-locked design property is that the ramp climbs back out of its
0.8 penalty well inside one game. 0.022 keeps the 1:1.5:2 ratio exactly.
The curve is still violently steep (one notch is ±8-15 points) — re-run
800×3 after ANY change to the fireball, ember, knockback or the lava.
(The round-13 sweep that chose 0.06, and the "0.08 is not 27.2%" scar, are
at git c38730f:shared/constants.js — the method there still applies.)
The small per-hit step does NOT re-create the 2026-08-06 "I can't see it
working" complaint, because the feedback now comes from the accumulated
white number on the damage popup, not from the size of one step.
⚠ Bot-measured. Bots spam fireballs; if Remi's human read says the ramp
feels too slow to earn, rampDmg is the one-line lever — raise it, don't
touch the permanence (accumulating across the whole game is Remi's design).
```

## ELEMENTS.mosquito

```
2026-08-07 (Remi, round 12) — SIMPLIFIED. The 2026-08-06 version put a bite
on an ARC of the victim's body and let any OTHER spell double on it. Two
things killed it: it was too fiddly to aim and too invisible to read (the
bites were on the wire but the client never drew them AT ALL, which is why
"mosquito feels broken" was a rendering gap, not a numbers problem), and
cross-spell doubling made mosquito+lightning the obvious meta. Remi's call:
drop both. Doubling now applies ONLY to your own fireball.

The model is frost's: your sting leaves ONE stack on whoever it hits, no
geometry involved. Land a fireball on a target already carrying YOUR stack
(never anyone else's) and the stack is spent: TWO of your normal fireballs
appear at the sting's contact point and land TOGETHER. So every on-hit effect
you own fires TWICE — double frost, double venom, double midas. That is the
whole fantasy: the pest is setup, your own kit is the payoff.

cdMult buys sting cadence — how often you get to set the trap up. See the
BALANCE block below for what each value actually measured.

⚠ 2026-08-07 (Remi, explicit — SIMPLER ON PURPOSE): the balls used to be
offset in time (`procGap`) and behind the impact (`procSpawnBack`), so a
perfectly timed teleport could dodge the second one. That offset is what let
constant knockback shove the victim out of the second ball's path, and the
fix for it (an intercept re-solve at release plus a muzzle that followed the
victim) was more machinery than the effect is worth. His call, verbatim:
*"put the 2 balls at exactly the same place. We'd just need to clearly see
all the on-hit indicators pop twice (for example seeing +1 gold twice)."*
Both knobs are GONE. The dodge window is gone with them, and the FEEDBACK is
now the feature: co-located popups fan sideways and stagger by a couple of
frames on the client (pushFloater in client/main.js) so two damage numbers,
two `+1 g`, two frost pips are legible as two events.
⚠ KNOCKBACK HAPPENS ONCE (Remi's ruling, 2026-08-07 — this replaced the ×2
shove described below). Two simultaneous hits used to mean two impulses, and
impulses simply add, so a cashed sting launched a full-HP victim at 145.0 u/s
against a plain lv1 fireball's 72.5 (×2.00 exactly; 239 u/s with gale lv3).
His call, in translation: *"it will hit twice in damage and twice in all the
on-hits, yes. But the knockback, that will only happen once — I see the
mosquito as drawing its strength from DAMAGE rather than from knockback,
otherwise I can imagine a monstrous win rate."* So every proc ball now
carries `kbScale: 1 / procBalls` (shared/sim.js, spawnFireball → the collision
block) and the volley totals EXACTLY one fireball's push whatever procBalls
is. Damage and every on-hit effect still fire procBalls times: two damage
numbers, two `+1 g`, two frost pips — all test-locked, including a run with
procBalls forced to 3 so the rule cannot silently degrade into "ball 2 is
free".
⚠ HARD RULE: the spawned fireballs must NOT place mosquito stacks, or
the effect chains forever. Test-locked — see docs/ROUND12.md S3.

---- BALANCE, RE-SWEPT under knockback-once (2026-08-07, later) ------------
Standard lab: tools/arena.js elemental study, 12-element pool, 4 seats,
baseline 25%. (Older 9-element-pool numbers in this file and in
docs/ROUND12.md are NOT comparable — the pool grew in round 12.)

Removing the doubled shove cost the element far more than it cost the
spreadsheet, exactly as predicted: the lava is the primary killer, so a sting
that no longer launches anybody into it stops converting hits into kills.
Every table below is knockback-once. 400 games/seed for the wide sweep,
800 games × 3 seeds for the band that decided it (mosquito's own n is ~1/3 of
the games, so at 800 games one cell is ~270-315 games, 2σ ≈ ±4.5 points —
which is why the wide sweep looked non-monotone between 0.86 and 0.95 and the
fine sweep does not):
  [0.98,0.85,0.72] (what shipped with ×2 kb, 21.8/27.8%) → **4.8 / 5.3%**
  [0.95,0.82,0.70] → 6.8 / 6.0%      [0.92,0.80,0.68] → 14.3 / 9.8%
  [0.90,0.78,0.66] → 17.7 / 16.5%
  [0.86,0.75,0.63] → 15.2 / 16.4 / 18.9%   (mean 16.8, 800 games)
  [0.83,0.72,0.61] → 15.9 / 17.5 / 18.6%   (mean 17.3, 800 games)
  **[0.80,0.70,0.59] → 28.3 / 23.9 / 20.4% (mean 24.2, 800 games) ← SHIPPED**
  [0.75,0.65,0.55] (the pre-nerf value) → 48.6 / 42.2 / 46.8% (mean 45.9)
  [0.55,0.50,0.45] (the original) → 78.2 / 78.9%
  [0.45,0.40,0.35] → 94.6 / 92.5%
SHIPPED [0.80, 0.70, 0.59]: the FASTEST sting that still lands on the 25%
baseline, chosen deliberately over the safer-looking 0.83/0.86 because the
fast sting IS this element's identity and ×1.3 had effectively deleted it
(lv1 sting 2.06 s vs a plain fireball's 2.10 s — a "double-rate sting" that
was 2% faster than not taking the element at all). At 0.80 the sting is
1.68 s at lv1 and 0.94 s at lv3 against a plain fireball's 2.10/1.60, i.e.
20% and 41% faster: a pest again.
⚠ The response curve is brutally steep either side of this point — one notch
faster (0.75) is 45%, one notch slower (0.83) is 17%. Do not eyeball this
knob; re-run 800 games × 3 seeds after any change to knockback, the lava or
the fireball's own numbers.
The `procDmgMult` lever (proc-ball damage only, absent = 1.0) is still
implemented and still test-locked, but it is NOT needed any more: it existed
to pay for the double shove, which no longer exists. Its old sweep was
measured against the ×2 version and is void.
⚠ Bot-measured, and bots flatter this element: a bot re-hits its nearest
enemy constantly, so it cashes the mark for free and never has to hunt a
marked target. Treat 24% as an UPPER bound on how hard the setup is, and
Remi's feel report outranks the table — the sweep above says what each step
buys.
```

## ELEMENTS.arcane

```
2026-08-05: buffed (−10/−18/−25 felt invisible in play) and the HUD now
badges every spell slot with 🔮 so the owner SEES it working.
2026-08-08 (Remi, round 16): arcane is the fireball's CADENCE axis. Its
old global CDR ("ALL your cooldowns run faster") moved to the Hourglass of
Haste item, same costs and numbers — see ITEMS. Here, cdrMult now touches
THE FIREBALL'S COOLDOWN ONLY (0.72 ≈ the cadence the old fireball lv3
bought: 2.1 s → 1.51 vs 1.6). The pricier lv3 unlocks chronos's old
effect, narrowed exactly as Remi specced it ("currently hitting ANY spell
triggers it, I'm changing it to only work when hitting fireball"): every
FIREBALL hit refunds hitRefund seconds off every cooldown you have
running, per enemy hit — EXCEPT the fireball's own (measured 2026-08-08:
self-refund is a feedback loop that took arcane to 74% alone; the full
sweep and the one-line revert live on arcaneRefund in sim.js). cdFloor: a
refund can never drive a cooldown to 0 in the same frame and re-cast in a
loop (chronos's old guard, test-locked).
```

## ELEMENTS.vampire

```
---- 2026-08-07 (Remi, round 12): three new elements -------------------
Remi's read was that the lifesteal fantasy is under-exploited — the Blood
Sword pays 18% and nobody notices. This chases much bigger numbers, but
rarely, so it is an EVENT rather than a passive trickle. The counter runs on
YOUR casts, so unlike mosquito it needs no setup on a specific target.
⚠ Interaction to keep bounded: lifesteal is paid on damage ACTUALLY dealt
(overkill excluded, never from lava), which is what stops vampire+mosquito's
1-damage sting from healing anything meaningful. Test it, don't assume it.
MEASURED AND RETUNED 2026-08-07, same session it was written. As specced
(every 3rd cast, 200/275/350%) it won **74.7%** of games — 3x the 25%
baseline, the most dominant element ever measured here, because sustain is
this game's strongest axis (see the 2026-08-03 study: sustain items topped
every mirror table, and round 10's knockback cut crowned them again).
Both knobs swept independently at 400 games, seed 7, standard elemental
study (baseline 25%):
  chargeEvery, % kept at spec: 3 → 74.7 · 5 → 48.6 · 7 → 31.5 · 9 → 15.8 ·
                               12 → 6.8 · 16 → 4.1
  chargeLifesteal ×k, every 3: 1.0 → 74.7 · 0.6 → 51.4 · 0.4 → 34.9 ·
                               0.25 → 17.8 · 0.15 → 11.0
  combinations: every 8 at spec% → 21.2 · every 6 ×0.8 → 34.9 ·
                **every 5 ×0.7 → 26.7** · every 5 ×0.55 → 28.1 ·
                every 4 ×0.55 → 41.1
Split across BOTH knobs on purpose, because each one alone deletes half the
design: shrinking only the % (0.35x, i.e. ~70%) makes the engorged ball heal
LESS than the Blood Sword already pays passively, and stretching only the
cadence to every 8th makes it unreadable and hostage to short rounds. At
every 5th × 0.7 the lifesteal is still ABOVE 100% at every level — the ball
still heals you for more than it hit for, which is the whole fantasy — and it
measures 26.7%. The level ratio is untouched (1 : 1.37 : 1.75).
⚠ Probably still generous in Remi's hands, and probably OVER-measured by
bots: a bruiser berserker brawls point-blank forever, which is the ideal
lifesteal engine. `chargeEvery` and `chargeLifesteal` are both one-line
levers; raise them if his feel report says the ball is not an event.
```

## ELEMENTS.ghost

```
2026-08-08 (Remi, round 16): REWORKED — the old ghost (pierce from lv1,
with a damage/push bonus on victims behind the first) measured at the
no-op floor in bot hands because bots never line targets up, and Remi's
call was to rebuild it: ghost is the fireball's SPEED axis now (cheap
lv1/2 — a faster ball is harder to dodge and lands more often), and the
pricier lv3 unlocks the passthrough as a pure passive: the ball goes
straight through people, EVERYONE hit takes a full ordinary hit (no
behind-bonus any more), and every on-hit effect — lifesteal included —
pays per enemy hit. Old spec + its sweeps: git c38730f:shared/constants.js.
```

## DRAFT

```
---- Draft mode (2026-08-07, Remi, round 12) -----------------------------
Optional lobby toggle, OFF by default. The problem it attacks: with 12
elements, 12 spells and 8 items all permanently available, a single optimal
build eventually calcifies into the meta and everyone plays it. When draft is
on, half the catalogue leaves the shop entirely and becomes a random pool;
every few rounds you are handed a free choice of three from it. Availability
becomes the thing you adapt to, so ADAPTING is the skill being tested, and
rare-but-spectacular combos get to exist because nobody can plan around them.
The pool split is rolled per GAME (so no two matches feel alike), decided
server-side, and identical for every player in the lobby.
Implementation notes, all decided 2026-08-07 and all one-liners to revert:
  · "The catalogue" is shared/catalogue.js — one enumerable list of spells +
    elements + items for the current ruleset, MINUS the starting kit
    (Fireball: everyone owns lv1 and every rider element hangs off it, so
    draft-locking it would lock half the shop behind one roll).
  · A pool thing is unbuyable until you own it; the moment you draft it, it is
    back on the shelf at its normal price for levels 2 and 3. "Do you own any
    level of it" IS the gate — no second bookkeeping list.
  · Offers land in the shop after rounds 1, 4, 7… (EVERY_ROUNDS apart, but
    starting with the FIRST shop rather than the third: you draft before you
    have calcified, which is the whole point).
  · An offer is never something you already own at any level, which is what
    makes "a drafted thing arrives at level 1" true.
```

## BOTS

```
---- Bots ----------------------------------------------------------------
Behavior lives in shared/sim.js (stepBot); this is the roster contract
shared by server (spawning) and client (lobby UI).
2026-08-07 (Remi, round 12): FOUR named tiers — Easy / Normal / Hard /
Extreme. The old ★ was never meant to be the entry level: it wanders and
shoots at nothing, which is Easy, and Remi asked for a real Normal between
that and the old ★★. `label` is what the UI shows; `difficulty` is only the
rank used for sorting. The `kind` KEYS are unchanged on purpose — they are
combat profiles referenced by shared/campaign.js and the labs, and renaming
them would break the co-op templates for no gain.

`brain` says which step function pilots it, so Normal is NOT new AI: it is
the berserker brain with two numbers made worse, which is the whole reason it
can be trusted. `react: [base, jitter]` is the decision interval in seconds
(`_botT = base + rng*jitter`) and `aimErr: [floor, perUnit]` is the aim error
(`(rng-0.5) * (floor + dist*perUnit)`).
The 2026-08-05 lesson these numbers encode: a reaction time is a PERCEPTION
delay, not a handicap — the bot aims from a stale observation extrapolated
across the lag, so it leads you correctly and only loses to genuine direction
changes. Aiming at where you *were* under-leads forever and dropped the ★★
BELOW the ★.
⚠ Verify the ladder with `tools/h2h.js` (2 seats vs 2 seats, 50% = parity),
NOT the mixed Elo table, which demonstrably hides tier gaps: it once read the
★★ as ~80 Elo above the ★ while it actually won 99.6% of head-to-heads.
Required: extreme > hard > normal > easy, monotonically.
```

## BOTS.stalker (aimErr)

```
⚠ the stalker's aimErr is [0.4, 0.05], NOT the berserker's [0.35, 0.10]:
Extreme has always carried a slightly bigger floor and a much flatter
distance term (that is what makes it accurate at range), and the 65f5597
data-ification copied the berserker's pair in by mistake. Corrected to the
values stepStalker has actually used since round 10, so wiring the data up
changed no behaviour — verified with tools/h2h.js (stalker still beats
berserker 100%).
```

## BOT_MEMORY

```
How long (seconds) a bot keeps aiming at the last place it SAW an enemy.
Bots read the simulation directly, so Vanish (SPELLS.vanish) has to be masked
in their perception too or Extreme becomes an aimbot that ignores the spell
(docs/ROUND12.md N4). Masked perception alone would be worse than human — a
bot would forget you existed the instant you blinked out — so instead it keeps
shooting at your last known position and gives up after this. Sized just under
the lv3 duration (2.25 s) so a fully levelled Vanish buys a real moment of not
being tracked at all, and above lv1 (0.75 s) so a cheap Vanish only ever
makes the bot's aim stale, not blind.
```

## BOT_TARGETING

```
---- Bot targeting: pressure on the kill leader ---------------------------
A comeback lever, asked for 2026-08-07: "a tendency to group up against
whoever has the most kills, or at least for that to bias their targeting…
it mustn't be extreme". So it is a WEIGHT inside the existing prey score
(pickPrey / nearestEnemy in sim.js), never an override — "this one is nearly
dead and standing next to me" still beats "the leader is across the map".

Unit: **arena units of apparent distance per kill of lead**. A target the bot
is N kills behind feels `N * LEADER_BIAS` units closer than it is. The lead is
the SAME gap the gold bounty pays on (GOLD.BOUNTY_PER_GAP, kill() in sim.js):
per-observer, floored at 0, so the leader never hunts anyone for being ahead
and a field that is level produces no bias at all. Free-for-all only — co-op
parties are one team and monsters have their own targeting (see killLead()).

SWEPT 2026-08-07. Mixed 4-player study (the same sampler tools/arena.js's
default study uses), 3 seeds x 2500 games = **7500 games per cell**, and every
cell replays the SAME lineups and seeds, so the only thing that differs
between rows is this number. "comeback" = the eventual winner was at some
point >= 4 kills behind, i.e. exactly what arena.js prints. Cell 0 was
verified byte-identical to the pre-change build (same Elo table, same lava
share) — the term is provably inert at 0, so row 0 IS the old game.
  bias   comeback%          mean   avg rounds   games hitting MAX_ROUNDS
  0     12.6 / 12.7 / 12.2  12.5      9.13              0.0%
  1     13.0 / 14.0 / 12.7  13.2      9.21              0.0%
  1.5   13.4 / 14.5 / 13.0  13.6      9.25              0.0%
  2.5   14.9 / 14.7 / 14.8  14.8      9.30              0.0%   <- shipped
  4     14.8 / 13.8 / 14.9  14.5      9.31              0.0%
Comeback climbs monotonically to 2.5 and then flattens/declines (4.0 is not an
improvement on any seed pair and 8.0 was erratic in an earlier 1200-game run),
so 2.5 is the top of the useful range rather than a step along it. The feared
failure mode — the leader can never close it out and games run to the 25-round
cap — **did not appear at any weight**: no cell had a single capped game, and
mean game length moved 9.13 -> 9.30 rounds (+1.9%). Lava kill share 30.3% ->
30.4%, i.e. untouched. The difficulty ladder is untouched too: tools/h2h.js at
400 games/pair reads Normal>Easy 100%, Hard>Normal 99.5%, Extreme>Hard 100%
both before and after, the same figures as AGENTS.md.
Second lab, where the mechanic has the most room (4 EQUAL Hard berserkers,
builds differing only, 800 games, seed 7): comeback 44.3% at 0 -> 54.6% at
2.5, again 0 capped games, mean rounds 13.95 -> 15.20.
⚠ What no lab here can see: bots do not experience being ganged up on. If it
feels oppressive in a real game, 1.5 is the measured step down (+1.1 instead
of +2.3 points) and 0 removes the mechanic entirely.
```
