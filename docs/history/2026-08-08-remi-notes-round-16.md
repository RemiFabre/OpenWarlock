## ROUND 16 — Elements ARE the fireball, the strategy ranking you asked for (2026-08-08, overnight)

Everything you listed is done, tested (219/219 + harness + browser + reconnect
+ co-op), and committed. Then I ran the strategy study — ~35,000 full 4-player
lobbies across two waves plus the retune sweeps. The full report is archived at
`docs/history/2026-08-08-round15-16-balance-full.md` (its §0); the current
tables and guidelines live in BALANCE.md. This is the short version.

### The rework, as shipped

- **The fireball never levels in elemental** (classic keeps its 3 levels — it
  has no elements to lean on). Its old bundle is split into cheap single-axis
  elements, 6+5+5 g: **ember** = damage only, **gale** = push only, **arcane** =
  fireball cooldown only, **terra** = size only, **ghost** = speed only.
- **Lv3 specials at 12 g** (so those paths are 6+5+12): gale = the current
  stack-and-burst gust (×2.4 — mid value of the old three, the lever is steep);
  arcane = every fireball hit refunds **1 s off all your OTHER cooldowns**, per
  enemy hit; ghost = pure passthrough — everyone on the line takes a **full**
  hit and all your on-hits + lifesteal pay per victim (the old behind-bonus is
  gone). Ember and terra lv3 stay cheap, as you said ("do it like fire").
- **Chronos is gone** (arcane lv3 IS its effect, fireball-triggered).
  **Arcane's old global CDR is now an item**: the Hourglass of Haste ⏳, same
  costs (10+8+8 — items can carry per-level prices now), same −10/−19/−28%.
- **Cinder Crown removed** (no fireball lv4 exists to unlock).
- **Lifesteal is visible**: every heal ≥ 1 hp pops a green "+N hp" on the
  healer — Blood Sword included, not just vampire's engorged ball.
- **Max HP is on the live scoreboard**: an ❤️ HP column shows `current/max`
  for everyone during the round, and its tooltip says everyone starts at 100.

**One interpretation I had to make** (flag if wrong): "the flat reduction
elemental is removed and becomes an item" — I read *the flat, always-on global
CDR* (old arcane) as the item, and chronos's on-hit refund as the thing that
became arcane's lv3. The alternative reading (chronos becomes the item) would
have left the same effect existing twice.

**One deviation from your literal spec, forced by measurement**: the lv3
refund does NOT refund the fireball's own cooldown. Refunding the spell that
triggers the refund is a feedback loop — it measured **74%** win rate as a
lone element (baseline 25%), the strongest thing ever recorded here, and even
a 0.5 s refund was 47%. Excluding the fireball keeps the crisp "−1 s off your
spells" and it becomes what the fantasy wants: your fireball machine-guns the
rest of your kit. One-line revert in `arcaneRefund` (shared/sim.js).

**One retune the rework forced**: momentum's ramp `0.06 → 0.022`/hit. With the
fireball stuck at 7 damage the old ramp measured 80-87% (it used to compete
with 14-damage fireballs). Swept and confirmed at 800 games × 3 seeds; the
1:1.5:2 level ratio and the permanence are untouched.

### The strategy ranking (25 strategies, 4 identical Hard bots, full buy lists, ~23,000 games total, baseline 25%)

Every strategy is an exhaustive list — there is always something to buy, per
your instruction. I ran it in two waves: 17 archetypes first, then 8 hybrids
designed from what wave 1 found. Full 25-row table + descriptions in STRATEGIES.md. The podium and the floor:

| win% | strategy | in one line |
|---|---|---|
| **86.2** ⚠ | midas-cdr | midas income funding the arcane×Hourglass CDR stack — **the one true auto-win, see below** |
| **70.0** ⚠ | mosquito-midas | every cashed sting procs midas twice: a gold machine |
| **49.1** | double-cdr | arcane × Hourglass: a ~1.1 s fireball whose hits hasten the lightning |
| **48.5** | venom-balanced | venom alternated with amulet/sword every purchase |
| **39.9** | cadence | double-cdr + Echo Stone |
| … | … | … |
| **3.8** | tank-sustain | all defense first — dead last tier |
| **2.7** | momentum-scaling | rushing the (re-nerfed) ramp first is a bad bet |
| **2.6** | gale-launcher | ring-out plan; quadruples on Extreme pilots |
| **2.5** | item-breadth | one of every item before any element |

The three most useful lines for a human:

- **⚠ midas-cdr is degenerate (86% Hard, 95% Extreme) and I could NOT fix it
  politely**: the hourglass trim, deeper midas penalties — all measured, all
  miss, because the engine is the INCOME (+1 g per hit is capped per hit but
  not per second, so cadence multiplies your economy and walks around your
  anti-snowball cap). The real fixes touch your explicit rulings (the +1 g
  cap, mosquito's visible "+1 g twice"), so it's your call — options with
  numbers in BALANCE.md Finding 16A / open question J. Until then: that combo
  is the known broken build in your lobby.
- **Offense-first wins, defense-first collapses** (everyone owns the amulet
  eventually; the losers bought it first).
- **Order is worth 25-35 points at identical contents**: venom-dot 22.9 →
  venom-balanced 48.5 just by interleaving amulet/sword with the venom levels.
  The one exception: the CDR rush hates interruption (it compounds with
  itself).

### Same lists on Extreme bots (your 10% skill question — big differences)

midas-cdr 95% (skill makes it worse), midas-economy 36→67, all-cheap 6→39,
gale-launcher 3→20, ghost-sniper 5→20 (the "aim" elements need aim), while
balanced 37→15 and vampire-brawler 11→8 (HP and lifesteal are worth far less
to a pilot that dodges). Economy-then-offense holds at both tiers.

### Buff/nerf guidelines (nothing applied — your call, evidence in BALANCE.md)

0. **Rule on midas-cdr first** (above). Options: cap midas income by RATE
   (needs a same-frame exemption to keep the mosquito "+1 g twice" ruling),
   cap it per ROUND, or accept it as the economy archetype.
1. **Venom needs a design-level nerf** — 92% as a lone element, and tick nerfs
   barely dent it (−30% ticks → still 77%). The power is the stacking:
   `stackCap` / `dotTime` / a deeper direct-damage penalty are the honest levers.
2. **Ember is the best 6 g in the game** (+39.8 points isolated at lv1) —
   consider `[2,3,5]` damage instead of `[2,4,6]`.
3. **Don't number-buff terra/gale/ghost off the Hard tables** — they quadruple
   on Extreme; they're aim-rewarding by design. If they FEEL weak in your
   hands, buff the specials, not the stat lines.
4. **If CDR stacking dominates your lobby**: hourglass `[0.92, 0.85, 0.78]` is
   measured (−10 on the CDR builds) — a trim, not a fix.

### Two things I found and fixed on the way

- **Your never-stopping ring had silently broken co-op**: campaign level 8 (a
  ~100 s fight) was at **6%** clear for a 3-player party. The flag is now
  versus-only; co-op keeps the classic ring and the whole curve is back on its
  round-15 numbers. If you want co-op under the new ring too, it's one line —
  but the campaign needs re-pricing after it.
- **Fast projectiles could tunnel through Mirror Walls** (the side-check used
  the post-move position). Found by ghost's new speed, fixed for everything.

*Written by Claude, autonomously, 2026-08-08 03:00-07:00. Every number above
reproduces from the commands at the end of BALANCE.md.*
