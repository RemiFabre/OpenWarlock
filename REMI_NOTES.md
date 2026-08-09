# Notes for Remi — OpenWarlock & the open web MOBA

*Round 20, 2026-08-09 (r207). Your shipped changes, then the measurement pass
you asked for: **no balance changes were made in this pass — results only**.*

## ROUND 20 — what shipped

- **Mosquito reworked** (your final call): no more damage/knockback tax, no
  more arm/cash trap. Every 6th / 5th / 4th fireball you cast fires as a
  **pair** — a lead ball that does **zero knockback** (full damage, every
  rider) and a fully normal ball 0.15 s behind it on the same aim. The **Echo
  Stone is deleted**, merged into mosquito. A trailing ball counts as a cast
  for vampire and advances mosquito's own counter, but can never chain.
- **Anger nerfed**: a mark now appears every **20 / 15 / 10 s** (was 10/7/5) —
  half the claims.
- **Every item is flat-priced**: 6 g per level for boots/treads/cape, 8 g for
  sword/amulet/hourglass ("buy an item every round even with zero kills").
- **Malady buffed**: sickness lasts 4/5/6 s, aura radius 10/14/18.
- **Ghost lv3** 12 → 10 g. **Terra lv3** now smashes stone pillars.
- **Lobby builds** are the ten tournament archetypes, ordered strongest first.

## ROUND 20 — the measurement pass (no changes made)

Full report, with every table explained where it stands:
**`docs/history/2026-08-09-round20-elo.md`**. The instrument is the strategy
ELO tournament — 30 shopping strategies, random 4-bot lobbies, **8000 games ×
2 seeds** (16 000 games, zero unfinished, seeds agree to 26 Elo). **1500 is the
roster average and +173 Elo ≈ a 73% pairwise favourite.**

**⚠ Read every number below as a RANKING.** The maths pins the average at
1500, so a build can gain 200 Elo purely because its rivals got worse. It
cannot tell you whether something got stronger in absolute terms.

### 1. The mosquito rework moved the meta more than anything else

The old mosquito's arm/cash trap fired **four rider procs per pair**; the new
pair is just **+20-33% balls**. Everything that was leaning on it fell:

| build | what it paired mosquito with | before | now |
|---|---|---|---|
| tycoon | midas (gold per hit) | 1909 — **#1 of 28** | 1571 (#12 of 30) |
| leech | vampire (every-5th-cast heal) | 1701 (#7) | 1455 (#17) |
| the Chainer | frost + gale + lightning | 1504 (#14) | 1251 (#25) |

So "midas × mosquito is the best economy in the game" is **no longer true** —
that finding was the old trap. ⚠ And the new pair has **never been in human
hands**: the no-push lead exists so both balls land on someone a normal shot
would have shoved away, which is a positioning payoff bots never look for.
Your feel report on it is the missing measurement.

### 2. Anger is #1 and #3 — after the nerf

Anger-first-then-sustain is **2037** (top of 30) and anger-plus-chase-mobility
is **1878** (#3), both up ~200 places-worth from before. That is *not* the
nerf failing: the mosquito builds above vacated the rank space and anger
filled it. What this lab genuinely cannot do is price anger's real cost —
hunting one named target while three people shoot you — because bots claim
marks near-perfectly. Still your call (question K).

### 3. Making items cheap did NOT fix items

Every item got cheaper this round, and the item builds ended up in the same
place: the band was 982-1387, it is now **1099-1341**, still the bottom of the
table, with the mobility-items build **last of 30**. For comparison, the
elements-only build sits at **1673 while spending 102 g in total** — more
result for less gold than any item line. Items being the weak shelf survived a
price cut aimed straight at it.

### 4. Your CDR question, answered — "I don't get why CDR isn't OP"

I built two cooldown builds and ran them. **CDR is real but not OP, and what
you point it at matters more than how much you buy:**

| build | the haste is spent on | Elo | rank |
|---|---|---|---|
| **chronomancer** (my design) | arcane3 + hourglass3, then **five** pilotable buttons at lv1 and their cooldown levels | **1697** | **7 of 30** |
| stormcaller (already existed) | same haste, **one** spell (lightning) maxed | 1531 | 14 of 30 |
| **hastemaker** (your order) | arcane3 + mosquito3 + hourglass1, then buttons | 1438 | 18 of 30 |

Why the maths says stacking it isn't OP — three lines:

1. **Haste adds up instead of multiplying, and the formula flattens.** The
   first 18 haste speeds you up 18%; a fully maxed **24 g** Hourglass on top of
   maxed arcane only speeds you up **19.7%**. Meanwhile ember's **last 5 g**
   takes your fireball from 9 to 11 damage — **+22%**. *Five gold of ember
   beats twenty-four gold of Hourglass on the same fireball.* Gold for gold,
   the full 47 g cooldown core buys **0.041 damage-per-second per gold**;
   16 g of ember buys **0.119** — nearly three times better.
2. **Casting faster multiplies most things, but not the two that matter.** It
   never touches the fireball's own cooldown (that guard exists because
   refunding the spell that triggers the refund measured a 74% win rate), and
   it does almost nothing for **anger** — marks come on a clock, so firing 58%
   faster raises your claim odds from ~98.7% to ~99.9%. The strongest build on
   the table is the one CDR can't help.
3. **Extra balls are worth less than the first ones.** Measured in a
   purpose-built 4-seat probe (500 games × 2 seeds): a maxed-CDR seat really
   does fire **×1.575** as often — bots do cast on cooldown, so this isn't the
   lab being lazy — but each ball lands **5% less damage**, and mosquito's
   extra balls **7% less**. The reason is your own knockback: hitting someone
   throws them out of the path of your next shot. (That is exactly why the
   mosquito pair's lead ball has no push — the fix works, it just can't fully
   escape the tax.)

Where CDR *does* shine is arcane lv3: every fireball hit takes 1 s off every
**other** cooldown, which at real hit rates is worth roughly **+25 to +37
haste on your whole kit for 12 g**. That is a *kit width* effect — which is
exactly why chronomancer (five buttons) beat stormcaller (one button) by 166
Elo and your hastemaker order by 259. Whether 7th-of-30 is where you want a
cooldown build is a feel call, and it's yours.

### What I did NOT do

No balance numbers were touched — you asked for measurement only. The only
code change is the strategy roster (`tools/roster.js`): I stripped the deleted
Echo Stone out of it and added the two cooldown builds, then regenerated
`docs/ARCHETYPES.md` from it.

---

*Round 19 is archived at `docs/history/2026-08-09-remi-notes-round-19.md`;
older rounds in the same folder.*
