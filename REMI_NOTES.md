# Notes for Remi — OpenWarlock & the open web MOBA

*Round 21.8, 2026-08-11. Your post-playtest brief, applied. Round 21.7 (the key
collision, the rebind menu, the price pass) is archived at
`docs/history/2026-08-10-remi-notes-round-21.7.md`.*

## Player versions now open inside the game

The green **🧬 version selector** on the first screen and in the bottom-right
menu switches between the default game and published player ideas. Each idea
runs its exact branch commit at a permanent, shareable link; no experimental
code is merged into the default game. **Remi’s Blood Debt** is the first live
test version.
Plain GitHub issues are auto-queued too; the agent also catches unlabelled issues
if that automation ever fails.
The game and README now link directly to completed requests so visitors can see
the project activity; GitHub does not let a repo redefine its Issues-tab filter.

## The Bomb is gone. It is a Mine now.

Press it and a trap drops **where you stand** — instantly, no aiming. ⚠ That is
my reading of "you press the button, it just creates a trap where you are": the
click is ignored entirely. If you meant "throw it a short way", that is one line.

The ring is **1.32 units** — your 65% over the fireball's own 0.8. Bodies are
1.4 wide, so in practice someone trips it from about 2.7 units centre to centre:
close enough to walk onto by accident, far from a zone.

**Feeding it is the whole spell.** Your own fireballs are swallowed by your own
trap: one at level 1, two at level 2. An enemy standing behind your mine is safe
from you until it is full — that is the price you pay for the setup, exactly as
you described it. Enemy balls fly straight over; a full mine lets your own
through again.

**When someone steps on it**: the mine's damage lands first, then every stored
ball erupts into them point blank, **one tick apart** (0.033 s — your "as fast
as possible without being the same tick"; you see two balls, you cannot dodge
between them). Echo's rule handles the push: every ball but the last carries
**zero** knockback, so nobody is shoved out of their twin's path, and the last
one pushes at **max(the ball's push, the mine's)** — never the sum, as you said.

- **10 g, upgrade 5 g. Two levels.** Damage **10 / 15**, push **100**,
  cooldown 9 / 8 s. The level buys the second slot.
- **A Shield on top of it works exactly as you hoped**: the stored balls are
  real fireballs, so they reflect and fly off at whoever is behind — but the
  **ground still hits them** for the mine's own damage. Test-locked.
- **A statue never trips one**, and the mine is not spent — it waits.
- Teammates and you walk over your own traps freely. Mines die with the round.
- The stored ball is *your* ball: ember's damage, malady's sting, frost stacks,
  anger's claim, ghost's passthrough all ride along, because it literally is the
  projectile you fired, kept in a box.
- **On screen**: a thin dashed ring in your colour, a dark stud, and **one ember
  pip per stored ball** orbiting it — "that one is loaded" reads from across the
  arena. Quiet, not a red flare, per your brief.
- ⚠ One consequence worth knowing: standing on your own fresh trap, your **next
  fireball is eaten immediately**. Step off it first, or that is exactly how you
  load it in two seconds. I verified the whole loop in a real browser (plant →
  two balls swallowed → third flies past the full mine → bot steps on it and
  eats 15 + 7 + 7 with one shove).

## Malady is a damage element now

You wanted it to pay off the moment it catches two people, so I inverted it:
the sickness always lasts **4 seconds**, and the levels buy the **bite**:
**1 / 1.5 / 2 damage per tick**. The hover row is renamed "damage per tick", as
you asked, and shows those numbers.

Measured properly (400 games, 4 Hard seats all running the same build, one
element each, 25% = par — and the OLD element restored in-place for the
comparison, so nothing else differs):

| seed | malady before | malady after | where it lands |
|---|---|---|---|
| 1 | 40.3% | **62.7%** | 2nd of 11 (anger 95.6%) |
| 7 | 31.1% | **49.0%** | 3rd, level with vampire (anger 97.6%) |

**+18 to +22 points on both seeds.** That is a big buff — bigger than I expected
from "+0.5 and +1 damage per tick" — and it is a FLOOR, because bots never bunch
up so the contagion half does not show up in these numbers at all. If it feels
oppressive tonight, `tickDmg` is the one lever.

## The Slow Spoon 🥄

Your friend's idea, your joke, 7 g per level, three levels: **+1 / +1.5 / +2 HP
every time you damage an enemy**, flat, whatever the damage was. One proc **per
victim**, so a ghost-3 ball through three bodies heals you three times, and a
gale/frost utility build finally has sustain that does not scale off damage.

⚠ **Auras and sicknesses pay nothing** — not Malady's ticks, not the Hat of
Aura's burn. That exclusion is the item's whole balance (a burn would pay every
second for free), it is written into the shop text, and it is test-locked.

## Hat of Aura: the burn follows you out

The ring is unchanged; leaving it is no longer an escape. The burn keeps ticking
for **3 / 4 / 5 seconds** after you step out (your second set of numbers, the one
you called more balanced). A burning body wears a faint ember ring so you can see
who is still cooking.

## Meteor, and two trims

Meteor level 2 damage **24 → 30**. Decoy's mirages last **4 s** instead of 5.
The **Mine moved to the Special row** in the shop, next to the Stone Pillar —
both are things you leave somewhere rather than throw.

## You were right to push on the lab. Two real problems.

**1. Three labs had been dead since round 20.2.** When the legacy builds were
retired, `bruiser` was still named in the DEFAULTS of the element study, `h2h`
and the co-op lab — so they threw "not iterable" and nobody could have run them
since. My first fix made them return an empty list, which is worse: the study ran
and printed a full table of seats that bought **nothing**. That is the number I
sent you an hour ago, and it was wrong. Now they ride `warlord`, and an unknown
build name **throws by name** instead of quietly measuring nothing.

**2. The arena lab was playing classic while the game plays elemental.** You are
right that elemental is the default — `createGame` has defaulted to it for a long
time — but `tools/arena.js` still opened its games in classic. So every Elo
table, mirror and item-pick number that lab has printed measured the mode almost
nobody plays. It now defaults to elemental, takes `--ruleset=classic` if you ever
want the old comparison, and **prints which ruleset it played on every table**.

⚠ Neither problem touched **`tools/elo.js`** — the 30-strategy roster ranking,
the one the balance decisions actually rest on. It has always run elemental off
explicit buy lists and never went near a build name. The standing table in
`docs/history/2026-08-10-round21-elo.md` is intact.

## And the ELO table, re-run on the new roster

Full write-up (33 strategies, 8000 games × 2 seeds, what it can and cannot see):
`docs/history/2026-08-11-round21.8-elo.md`. The roster now carries the three
additions bots can genuinely use — the Hat of Aura, the Slow Spoon and NOPE —
and leaves out the Mine and the Decoy, which no bot can set or be fooled by.

- **The Hat of Aura is the winner of the round**: the new aura+plague core enters
  **4th of 33**, ahead of every damage and CDR build, and the plain plague build
  gained +129. Your two buffs (the lingering burn, malady's bigger bite) landed
  hard — and this is a floor, since bots never bunch up.
- **Anger is unmoved at #1.** Nothing this round touched it.
- **Items finally moved — because of content, not price.** Every item build
  gained 58-126 points. Three rounds of price cuts had moved them zero; two items
  that actually DO something moved them in one round. They are still the bottom
  third, so: items were never too expensive, they were too boring.
- **NOPE lands at exactly the roster average (1500).** That is the honest score
  for a panic button no bot can time — the spell is yours to judge.
- **The Slow Spoon's own build is 32nd of 33 — and that number prices the KIT,
  not the spoon.** I deliberately gave it the worst host (frost+gale, low damage
  by design) and bots cannot convert CC into damage; the neighbouring frost/gale
  build has always sat there too. The same spoon inside the item builds raised
  them. It needs your hands, not more bot games.
- ⚠ **Your meteor buff is invisible** (24 → 30 at lv2, the maxed-meteor build
  moved −1 and is still last). If the meteor should be a real pick, the lever is
  its cast rules, not its damage.

## The sustain pass — blade, spoon and hourglass

Your three numbers, shipped: **blade 10/20/30%**, **spoon 1/2/3 flat per hit**
with **ticks paying a tenth** (0.1 / 0.2 / 0.3), and **hourglass 10/20/30**.

**Why a tenth.** Ticks vastly outnumber hits — a Hat+plague player lands **984**
of them a game against 157 real hits. At a tenth, the two fantasies pay almost
exactly the same, which is what you asked for:

| build, hp healed per game (lv3) | blade | spoon |
|---|---|---|
| anger (big hits) | **722** | 526 (−27%) |
| plague | 646 | **768** (+19%) |
| Hat + plague | 681 | **766** (+13%) |
| plain low-damage kit | 456 | **624** (+37%) |
| ember burst kit | **629** | 588 (−7%) |

**anger + blade = 722 vs plague + spoon = 768**, six percent apart — play your
fantasy, get your reward. At 0.05 the ticks were too small to matter (the Hat
build would still rather have the blade); at 0.2 it ran +56% and the spoon
became an aura item.

**One rule, one line of text**, as you wanted — no aura/poison split: *"Every
enemy you damage heals you. Burns and sickness heal a tenth of that, at most
once a second per enemy."*

**The once-a-second cap is in, and it does nothing today** — every tick source
runs at 1/s. It is there for exactly the future you described: a poison at ten
ticks a second for a tenth of the damage would leave the poison unchanged and
multiply this item by ten. There is a test that runs malady at 10× speed and
checks the spoon still gets paid three times in three seconds.

⚠ Two things to watch when you play it. Your **lv1 blade now heals 0.7 off a
bare fireball, so it pops no green number** until lv2 — the hp is credited (the
bar and the scoreboard both move), it just does not shout. And bots never bunch
up, so **the plague side of this is a floor**: contagion spreads further in your
hands than in any of these numbers. If plague+spoon feels oppressive, 0.08 is
the same rule with a smaller tenth.

## The green numbers whisper now

You were right that they got noisy once everyone has some lifesteal. The size
curve keeps its ceiling and drops its floor, and it is concave now so the middle
does not get dragged down with the crumbs:

| heal | before | now |
|---|---|---|
| +1 hp | 10 px | **6 px** (−40%, your number) |
| +2 hp | 11 px | 9 px |
| +5 hp | 12 px | 12 px |
| +10 hp | 13 px | **15 px** (slightly louder — it is a real heal) |
| +20 hp | 16 px | 18 px |
| +50 hp and up | 26 px | **26 px** (unchanged) |

Screenshotted all six side by side in a real game: +1 is a whisper you notice
only if you look, +10 reads at a glance, +50 still shouts.

## The measurement that led here: spoon vs blade, before the change

Same kit, one item swapped: maxed cadence (arcane 3 + hourglass 3), Echo pairs
and three buttons — a build that lands as many hits as possible. Both items cost
21 g, and each seat was **banned from buying the other one**.

| | hp healed / game | kills | won% | ELO |
|---|---|---|---|---|
| Slow Spoon lv3 | 74.8 | 11.7 | 17.7% | 1223 / 1226 |
| Blood Sword lv3 | 115.3 | 12.7 | 32.3% | **1277 / 1303** |

**+54 and +77 Elo to the sword on the two seeds**, and it heals half again as
much — in the build designed to favour the spoon. Three separate seeds of the
head-to-head agree.

**The reason is one number.** The spoon beats the sword only on hits smaller
than `flat heal ÷ lifesteal %` — **about 5 damage, at every level**. The
smallest hit in the game is a bare level-1 fireball at **7**. So the sword wins
on essentially every hit that exists, and the spoon's own exclusions (Malady's
ticks, the Hat's burn) are exactly the sub-5-damage sources that would have
favoured it.

If you want it to be the low-damage-build item you described, **1 / 1.5 / 2 →
2 / 3 / 4** puts the break-even at ~10 damage: better than the sword for pokes
and combos, worse for real hits. One line, say the word.

⚠ And a lab scar worth knowing: the shared "buy everything" tail that every
strategy falls into contains BOTH healing items, so my first attempt had each
seat quietly buying its rival's item — it measured buy order, not the item. The
roster can ban a thing outright now, and there is a new `tools/pair.js` that
answers "what did each side actually DO", not just who won.

## What I verified

389 unit tests (13 new ones for the mine, the spoon and the linger), both
harness scenarios, the 2-engine browser test, the reconnect test, 60-game bot
smokes at 4 and 8 seats, and a real browser session driving the mine end to end.
⚠ Your server was running the whole time — nothing I ran touched it.

## Still waiting on you

The mine's name (**Mine** is mine to defend — "elemental mine" felt long; Trap
and Snare are one line), whether the trap should be throwable rather than
underfoot; the two 21.7 sounds; whether a 3v1 team's kill target should be
capped by how many enemies exist; anger's strength (you said it is fine — I have
left it alone); and names for Switcheroo 🎭.
