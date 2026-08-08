# Round 17 §11 — stochastic bot focus + piloting the kit (measured 2026-08-08)

Session C. What shipped: `pickPrey` became a **softmax draw** over the same
weighted score (weights + temperature in `BOT_TARGETING`), a new "carries MY
stacks" term, Stone Pillar and Swap piloting, and one new arena metric.

## BOT_TARGETING

All weights are in **arena units of apparent distance** — a term worth 10 makes
a target feel 10 units nearer. `score = d*PROXIMITY + crowd*CROWD −
missing*WOUNDED − rim*RIM − myMarks*MY_STACKS − killLead*LEADER_BIAS*PROXIMITY`,
then `p(i) ∝ exp(−score_i / TEMPERATURE)`.

| key | value | note |
|---|---|---|
| `PROXIMITY` | 0.8 | unchanged coefficient — it is what keeps `LEADER_BIAS` in arena units |
| `WOUNDED` | 0.35 | was `hp * 0.35` as a penalty; now **missing** hp as a bonus (same ranking at equal maxHp, different once someone buys an amulet) |
| `CROWD` | 0.8 | unchanged |
| `RIM` | 8 | unchanged |
| `MY_STACKS` | 4 | NEW. Per frost/gale/mosquito/midas stack **this bot itself** placed (private store, `stackCount`). 2 marks ≈ 8 units of pull |
| `LEADER_BIAS` | 2.5 | unchanged |
| `TEMPERATURE` | 6 | NEW. 0 = the old argmin. A score gap of `TEMPERATURE` = ~73/27 odds |

The draw is **fresh on every call**, deliberately: `pickPrey` is called exactly
once per decision tick (`stepBerserker`, after `_botT` fires), so "once per
call" already is "re-rolled on the decision clock".

## Does it actually break the pile-on?

Diagnostic: 20 seeded 4-berserker games per row, sampling every bot's `pickPrey`
at 2 Hz over the first 20 s of each round, ~13.5k samples per row. The number
that matters is **3+**: the whole field converging on one victim.

| TEMPERATURE | 2+ hunters on one victim | 3+ (the full gang-up) |
|---|---|---|
| 0 (argmin) | 72.9% | **34.9%** |
| 3 | 72.5% | 31.1% |
| 6 (shipped) | 79.3% | **26.1%** |
| 10 | 86.2% | 21.9% |

The 3+ rate falls ~25% relative at the shipped setting. The 2+ rate *rises*
because the distribution moves from "all three on one" toward "two on one, one
elsewhere" — with 3 hunters and 3 candidates, even a uniform draw gives ~78%
"2+", so 2+ is not the anti-focus signal. 3+ is.

## The arena metric — and why it does not move

`tools/arena.js` now reports, next to lava share and comeback rate:

```
multi-enemy focus (2+ within 16u): 2.7s of the first 20s (13.7%)
```

Per §11's definition: a player is focused while 2+ living enemies stand inside
16 u; sampled at 5 Hz over the first 20 s of each round (where the pile-on
happens); averaged over every player, so it is comparable across game lengths.
`node tools/arena.js --games=60 --players=4` reads **13.7%**.

⚠ **It barely responds to `TEMPERATURE`** (200-game runs, 2 seeds): 12.9/12.2 at
T=0, 12.9/12.4 at T=3, 13.8/13.0 at T=6, 15.2/14.1 at T=10 — i.e. it drifts
slightly *up*. It measures where BODIES are, not where AIM goes, and spreading
targets makes bots wander into each other's engagement rings instead of
stacking on one corpse. Keep reporting it (it is the number Remi asked for, and
it prices the *feel* of being crowded), but read the table above for whether the
targeting fix works. Scar: a study cannot see a variable its design cannot
express.

## Ladder (tools/h2h.js, 400 games, 2 seats each, bruiser)

| | brawler/grunt | berserker/brawler | stalker/berserker |
|---|---|---|---|
| before (post-Session-B worktree) | 100.0 | 98.8 | 100.0 |
| after (TEMPERATURE 6) | 100.0 | 99.8 | 100.0 |
| TEMPERATURE 10 | 100.0 | 99.0 | 100.0 |
| TEMPERATURE 14 | 100.0 | 100.0 | 100.0 |

Round-16 reference was 100 / 99.5 / 100. Parity-or-better on every tier; no
temperature reduction was needed. The T=10/14 rows are an in-process
replication of `tools/h2h.js` (validated: it reproduces the real tool exactly at
T=6) and say the **ladder is not the binding constraint** — it survives the
lever far past where it was set. 6 ships because it is the smallest setting that
moves the 3+ convergence number, not because 10 broke anything. If the pile-on
still feels bad in Remi's hands, raising it is cheap.

⚠ h2h is bot-vs-bot: it cannot price what spread targeting feels like to a
human. Remi's report outranks this table.

## Piloting

- **Stone Pillar** (`pilotOwnedSpells`): raised between self and the nearest
  threat when ganged up on (2+ enemies within 20 u) or below 40% hp, at
  `radius + 2.2 + 1` from the body so it blocks the incoming line without
  shoving the caster, and only when the threat is far enough that the pillar
  lands *between* them. Grunts keep their random-direction chaos pillar.
- **Swap** (`pilotOwnedSpells`, in the lava-save block): fired when knockback
  velocity alone exceeds `PLAYER.SPEED` and a 0.6 s lookahead puts the bot past
  the rim, aimed with an intercept solve at the nearest enemy still safely
  inside (`< arena − 4`) and within range.
- Neither spell is in any `BUILDS`/`BOT_BUILDS` order — the power-tier gate
  (AGENTS.md) is untouched. Today both reach a bot only through draft; the code
  is ready for Remi's ruling on the power tier.
