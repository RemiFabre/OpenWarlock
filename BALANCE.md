# Balance report #3 — after the "faster lava" playtest retune

*2026-08-03. ~21,000 headless games via `tools/arena.js` (rerun commands at
the bottom). Report #2 (the 46k-game v5 campaign) is preserved in git history
at `9a96b47` and earlier — all of its numbers are obsolete: this campaign
re-measured everything after Remi's playtest retune and the bot-piloting fix.*

---

## How to read this report (start here)

Games are 4-player free-for-alls, so **every percentage has the same
baseline: 25%**. A strategy/item at 25% is perfectly neutral; the further
from 25%, the stronger the signal.

| Metric | Meaning | Neutral | Worry when |
|---|---|---|---|
| **win rate** | how often it finished 1st of 4 | 25% | > ~45% (dominant) or < ~10% (trap) |
| **Elo** | rating from *pairwise placements* — finishing 2nd still beats the two below you, so it's more stable than win rate | 1000 | gaps > 150 within one skill tier |
| **avg-place** | mean finishing position, 1–4 | 2.5 | — (sanity check on win rate) |
| **lava kill share** | deaths in lava vs to direct damage | — | far from ~75–86%: knockback-into-lava IS the game |
| **comeback rate** | winner was ≥4 kills behind at some point | — | near 0%: games decided too early |

**Strategy = difficulty × build.** `stalker/sniper` means the ★★★ combat
profile playing the lightning-first shopping list. What each difficulty does
and what each build buys is charted in `STRATEGIES.md` — read that first if
the codenames (bruiser, boomer, …) mean nothing to you.

**Two kinds of tables, two kinds of conclusions:**

- **Mixed study**: all 21 strategies thrown together. It mostly measures
  *piloting skill* — every stalker build outrates every berserker build.
  Use it for the big picture, never to compare builds.
- **Mirror study** (`--mirror=stalker`): all four seats are the SAME
  difficulty, only builds differ. This isolates the shopping question and
  is the primary balance instrument.
- **Item probe** (`--probe=berserker`): all seats same difficulty AND same
  build tail; only the *first purchase* differs. This kills the survivor
  bias in "winner-held" item tables (items bought late are held by players
  who were already winning).

**Caveat that explains most weird numbers**: bots extract far less value
from *reactive* spells (teleport, shield) than humans do. A bot-trap build
is not automatically a human-trap build — those cells are flagged, not
nerfed into oblivion.

---

## What changed going into this campaign

Remi's 2026-08-03 playtest feedback, applied before measuring:

| Change | Old → New |
|---|---|
| Lava damage | 20 → **14 DPS** (−30%) |
| Lava movement | normal → **+30% speed** (lava is a dodge route now) |
| Afterburn (lingering burn) | 4 DPS × 2 s → **removed** |
| All spell knockback | **−10%** |
| Fireball | speed 34 → **41**, radius 1.0 → **0.8** |
| Boomerang | radius 1.0 → **1.4** (+40%) |
| All spell damage | **+30%** (mid-campaign, also from Remi: "almost impossible to kill without lava") — fireball 5/9/13, lightning 5/8/12, boomerang 5/8/10, rush 5/8 |
| Bots | now cast **everything their build buys** (pilot layer) — report #2's finding 0 is fixed, so build ratings are finally real |

## Finding 1 — the retune made sustain king (fixed)

First 1k-game sweep + mirrors, before any balance changes: **turtle won
48–50%** of mirror games on two of three tiers and **bruiser 42–65%**, while
every mobility build starved. The winner-held item table was a defense
monoculture: cape 59%, treads 57%, sword 57%.

Cause: lava −30% and knockback −10% weakened chip damage across the board,
so regen/HP/lifesteal items could out-heal what spells dished out. (The
mid-campaign +30% spell damage pushed the same direction as the item trims
below — offense caught back up from both sides.)

**Applied fixes (one gentle step each):**

| Item / spell | Old → New |
|---|---|
| Ring of Regeneration | +1.2 → **+0.9 HP/s** |
| Amulet of Health | +30 → **+25 max HP** |
| Cape of the Magi | −15% → **−10% knockback taken** |
| Blood Sword | 35% → **25% lifesteal** (two steps; the item probe still had sword-first at 53% after the first) |
| Lava Treads | −30% → **−20% lava damage** |
| Teleport | entry cost 14 → **12 g** |
| Rush | entry cost 12 → **10 g** |

## Finding 2 — escape and rusher were part pilot-hole (partly fixed)

`berserker/escape` won **0.9%** of its mirror games — the berserker never
cast teleport at all, so the build was 20 g of dead gold. Fixes: every kind
now teleport- or rush-saves out of lava, grunts blink out of melee pressure
when wounded, non-berserkers only use rush as a weapon against rim-standers
(dash-to-close was measured at 3–6% — it strands the caster at point-blank),
and the escape build now carries max fireball ("an escape button on a real
damage kit") instead of double-teleport-first.

Result: improved but still weak (see final tables). The residual gap is
structural — teleport's value is reactive human skill the pilot can't fake.
**Escape and rusher are bot-traps, not proven human-traps.** Flagged for
playtesting, deliberately not compensated with number buffs that would
land on human players too.

## Final state (all numbers from the locked build)

### Mirror tables — the build balance verdict (1000 games each)

```
stalker ★★★          berserker ★★           grunt ★
win%  build          win%  build            win%  build
43.1  turtle         57.4  bruiser          46.0  boomer
42.1  sniper         34.8  turtle           43.1  sniper
38.8  boomer         32.2  boomer           38.3  turtle
29.0  bruiser        24.8  sniper           35.5  bruiser
12.4  rusher         23.6  rusher            7.7  rusher
10.1  escape          3.1  escape            4.7  escape
 0.0  greedless       0.0  greedless         0.0  greedless
```

Reading it: the four "real" builds (turtle/sniper/boomer/bruiser) sit in a
healthy 25–46% band on stalker and grunt. Two cells stand out and are
**accepted as identity, not bugs**:

- `berserker/bruiser` 57% — a point-blank brawler with max fireball +
  lifesteal is *supposed* to be the brawler's best build.
- `grunt/boomer` 46% — the 40%-wider boomerang is the forgiving spell, and
  sloppy-aim grunts benefit most.

Per-difficulty best picks (useful when setting up lobby bots):
**stalker → turtle/sniper · berserker → bruiser · grunt → boomer/sniper**.
Avoid rusher/escape on bots for now.

### Mixed study — the big picture (1000 games)

Top and bottom of the Elo table (full run via the repro commands):

```
elo    win%   strategy            elo    win%   strategy
1688   83.9   stalker/sniper      760     3.4   grunt/sniper
1535   65.6   stalker/bruiser     727     2.7   grunt/bruiser
1510   72.1   stalker/boomer      ...
1108   19.9   berserker/bruiser   589     0.0   grunt/greedless
```

Piloting still dwarfs shopping (a greedless stalker at Elo 1060 beats every
berserker build) — that's the difficulty ladder working as intended.

### Item probe — first-purchase value on a berserker (1400 games)

```
win%   first item          win%   first item
45.6   sword               17.3   treads
42.4   ring                14.0   boots
22.7   amulet              11.9   cape
21.2   none (control)
```

Sword and ring remain the strong openers for a brawler (down from 53%
pre-trim); cape and boots are *late-game* value — buying them first is worse
than buying nothing (the control sits at 21%). The winner-held mixed table
still shows cape at 55%, which is exactly the survivor bias the probe
exists to expose.

### Health metrics

- **Lava kill share 76.7%** (was ~86%): spells can finally kill on their own
  — the +30% damage did what Remi asked — while lava remains the main killer.
- **Comeback rate 13.4%** mixed, 25–39% in mirrors: games aren't decided in
  round 3.

## Open questions for the next campaign

1. **Teleport for humans**: indirectly nerfed by the whole retune (weaker
   lava, less knockback = fewer saves needed). Entry cheapened to 12 g;
   whether it's worth it now is a playtest question, not a lab question.
2. **Escape/rusher bot floor**: raising it means smarter piloting (kiting
   with mobility, dash-cancel plays), not bigger numbers.
3. **Elemental mode untouched** this campaign: venom-overtuned and
   midas-snowball flags from report #2 still stand.
4. Whether `grunt/boomer` at 46% creeps further as boomerang players
   level it — watch after the next feel pass.

## Reproduce

```bash
node tools/arena.js --games=1000 --players=4 --seed=41            # mixed
node tools/arena.js --mirror=stalker   --games=1000 --seed=43     # per tier
node tools/arena.js --mirror=berserker --games=1000 --seed=43
node tools/arena.js --mirror=grunt     --games=1000 --seed=43
node tools/arena.js --probe=berserker  --games=1400 --seed=47     # item probe
```
