# Round 24.7: the report page + the roster rework (2026-08-14)

Remi's voice brief: (1) every balance run should end as a small web page that
opens on his machine, ranking readable at a glance, full build (order
included) one hover away, zero agent context spent; (2) rework the roster
around one-variable comparisons: keep the Faker rows, iterate around
D1-warlord, isolate each mutation on a fixed scaffold, redesign the gold
build (the midas-echo combo died with the 24.1 midas rework), respec vampire
to frequency, and add synergy probes. Review gate: he sees the page BEFORE
any full elo run.

## 1. The report page (tools/report.js)

- `node tools/elo.js ...` now ALWAYS ends by writing a self-contained HTML
  report to `docs/history/<date>-elo-<games>g-seed<seed>.html` (suffixed on
  collision) and opening it in the browser (`open`/`xdg-open`).
  `--no-report` skips it (smoke runs), `--no-open` writes without opening,
  `--report=path` and `--notes=path` override. The `--json` payload gained
  `placeSum` and `unfinished` so a report can be rebuilt from it later:
  `node tools/report.js --json=run.json`.
- `node tools/report.js --roster` renders the REVIEW page: no numbers,
  builds grouped by family.
- The page: ranking list left (ember gauge, family chip, cost, mean place,
  seats), sticky detail panel right that follows the hovered row (click
  pins). Detail = fantasy, what it isolates, agent `note`, caps ("never
  buys"), kind badge, and the BUY ORDER as one emoji chip per purchased
  level with the level as a subscript; auto-fill chips are dimmed after an
  "auto-fill" divider and a second divider marks the ~145 g an average seat
  actually earns (buys past it rarely happen). Icons come from
  ELEMENTS[key].icon and client/ui.js ICONS, names/costs from constants, so
  the page can never drift from the game.
- Scar honored: a seat with 0 games shows "no data", never the fitter's
  leftover number; a run whose ids do not match ROSTER throws.
- Guards: test/report.test.js (7 tests: band from spec, family-M uniformity,
  caps survive the padder, G1/G2 slot identity, page sanity, unknown-id
  throw).

## 2. Roster changes (tools/roster.js; 42 -> 53 rows)

### Family G, NEW: the Warlord, one variable at a time (control = D1-warlord)

D1's core is now the shared `WARLORD_CORE` const; each G row changes exactly
one thing, so the elo delta vs D1 prices that choice. G1/G2 use the same
slots and cost, so they also price Shield vs Blood Debt head to head (both
are the same 12+6 g family, and 24.6 gave Hard+ the same imminent-ball read
for both).

- **G1-warlord-shield** (155 g): +Shield 1 early, Shield 2 after arcane.
- **G2-warlord-debt** (155 g): +Blood Debt in G1's exact slots. First roster
  row (with D13) to SHOP debt, closing 24.6's open question.
- **G3-warlord-no-sword** (155 g): sword banned via `caps` (the padder now
  respects caps: a "without x" probe used to be handed x back by the
  auto-fill; fixed this round). Prices lifesteal-by-structure (question L).
- **G4-warlord-no-arcane** (150 g): arcane banned via caps; prices the haste
  axis inside the base build.

### Family M, NEW: one mutation maxed first, identical scaffold

Remi's isolation ask: max ONE mutation, then "normal stuff" = sword+amulet,
lv1 of each stat element, sword/amulet 2, lv2 of each, sword/amulet 3, lv3
of each; spells only from the shared exhaust tail. Every mutation costs
26 g, the scaffold 140 g, so all six cores are 166 g and M row vs M row is a
direct price on the mutations: M1 anger, M2 frost, M3 malady, M4 echo
(mosquito), M5 midas, M6 vampire. Test-locked identical (cost + tail).

### Reworked rows

- **D3-tycoon** (gold build): the old premise (echo doubles midas per-hit
  gold) died in 24.1 (midas = timed mark, +2 g flat on the claim; nothing
  per-hit to amplify). Now D2-executioner's EXACT chase core with midas
  swapped for anger (both 26 g, identical padding), so D2 vs D3 prices
  anger's +0.5 dmg forever against midas's +2 g, claim-for-claim.
- **D4-leech** (vampire): Remi's call: feast heals per MARK and marks land
  per HIT, so the build should buy FREQUENCY, not damage. Now vampire 3 +
  arcane 3 + hourglass 2 + echo 3 (haste both ways, pair casts), damage
  elements refused. The 24.5 dive keys on vampire, unchanged.
- **D13-bastion**, NEW: Shield 2 + Blood Debt 2 + amulet/cape/treads/sword.
  The defensive-synergy probe 24.6 unlocked (both reactive windows piloted
  at Hard+); D8-juggernaut stays as armor-without-buttons, D13 is armor
  WITH buttons.

### Kept as-is

Families A, B, C, E, F (system probes still coherent post-reworks) and K
(Remi: the Faker rows stay; the driving gap is the point). B3 overlaps
M1-anger-first in spirit but keeps its role as the depth-vs-breadth probe
and as K5's Hard-brain control.

## 3. Instrument notes

- 53 rows at the standard 2000-game run = ~150 seats/row (was ~190 at 42).
  Neighbour noise grows a little; the ruling stays ONE seed, 2000 games.
- paddedCore(entry) is caps-aware now (see G3). Nothing else about padding
  changed; the cost table prints 53 rows, all in band or flagged by design.
- Debt purchasability proven in-sim: 8 probe games, G2 ended all 8 at debt
  lv2 (D13 7 of 8); G3's sword ban held through padder AND exhaust tail.

## 4. Verified

526 vitest green (7 new), harness bots scenario exit 0, arena 60x4p and
60x8p healthy (48%/46% lava share, comebacks present), elo smoke
(--games=60) end-to-end including report generation and screenshot review
of both page modes. No client/server/sim code touched; wire labs not run.
The smoke elo numbers are NOISE (1-12 seats/row) and are deliberately not
quoted.

## 5. Waiting on Remi (the review gate)

The review page (roster mode, notes at top) opens automatically; the full
2000-game seed-1 run happens only after his verdict on:
- the G variants (add/remove one-variable questions?),
- the M scaffold order (items before elements level 1?),
- D3/D4 respecs and D13,
- whether any old rows should retire to keep seats/row up.
