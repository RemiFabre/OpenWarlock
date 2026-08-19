# Round 24: vampire mark-and-feast (2026-08-14)

Remi's voice brief, verbatim intent: vampire kept collapsing into one
synergy. Heal-a-%-of-damage (pre-22.5) made it playable only with high-damage
builds; the 22.5 flat every-5th-ball heal moved the same problem to
high-FREQUENCY builds. He wants vampire playable regardless of the rest of
the build, with a risky low-hp identity: weak sustain while healthy, huge
swings while low, burstable in the window it needs for full value.

## The design (his spec, my interpretation of the garbled bits)

- Every fireball HIT banks one **blood mark** on that victim
  ("every time you hit a final move" read as "every time you hit a
  fireball"). Marks are private per-attacker stacks like frost/midas piles,
  **never fade** (deliberately NOT in `STACK_DECAY.kinds`), and die when
  either party dies (and with the round, like all stacks).
- Stepping inside the **feast ring** (`feastR` 7 = Hat of Aura lv3 `auraR`,
  his named number) commits the victim's WHOLE pile at once: one mark flies
  back per `gulpEvery` 0.1 s (his ~100 ms), each healing
  `markHeal` [2,3,4] × (1 → `lowHpMax` 3, linear on the vampire's own
  missing hp, re-read at EVERY gulp, so healing up damps the tail).
- **A started feast always finishes** (his explicit ruling: partial vacuums
  would be frustrating): escaping the ring changes nothing; the victim's
  death does not stop committed gulps; the VAMPIRE's death voids everything
  they own (marks out + queue).
- No feast through Vanish (a vacuum that finds an invisible body is a
  wallhack tell) or NOPE (immune to everything by contract). No self-marks
  off reflections (`pr.elemOwner` guard); a self-mark inside your own ring
  would be a free heal loop.
- The ring is drawn radius-TRUE for the owner AND everyone else (his call),
  dotted dark blood red, deliberately unlike the Hat of Aura's warm solid
  ring so owning both never confuses.

Everything is spec-driven in `ELEMENTS.vampire.fx`; 8 vitest cases lock the
rules above (test/sim.test.js, the 🧛 block). The engorged-ball machinery
(vampN counter, projectile field, halo, HUD countdown) is deleted; revert =
git, this file is the pointer.

## Measured: the standard Elo runs

`node tools/elo.js --games=2000 --seed=1` (and seed 2), the round-23
instrument: random 4-of-roster Hard lobbies, Bradley-Terry over pairwise
placements, 1500 = roster average, ±40 ≈ neighbour noise. D4-leech is the
roster's vampire strategy (vampire 3 + mosquito + sword/amulet, 153 g).
Baseline = `2026-08-13-round23-elo-faker-anger.md` (r368, old vampire).

| row | r368 baseline | seed 1 now | seed 2 now |
|---|---|---|---|
| D4-leech | 1397 (rank 19, place 2.51) | **1603 (rank 7, place 1.91)** | **1605 (place 1.86)** |
| C4-boomerang-main (control) | 1620 | 1605 | 1660 |
| B3-mutation-depth (control) | 1560 | 1549 | 1586 |
| D1-warlord (control) | 1552 | 1552 | 1521 |

+~206 Elo on both seeds while every control stayed inside ±40: the movement
is the rework, not table churn. D4 is now level with the best non-Faker row.

Head-to-head (`node tools/pair.js D4-leech D1-warlord --games=400 --seed=1`,
2 seats each; "healed" = hp actually restored per game, all sources):
D4 healed **3083**/game vs D1's 923 (Blood Sword lifesteal only), mean place
1.66 vs 3.34. The heal engine works at bot ranges.

## ⚠ What the instrument cannot see (flags, not numbers to tune around)

- Berserker/Hard brains PROWL at standoff ~5-8, i.e. inside or brushing the
  r-7 feast ring all game: bot vampires get a near-permanent vacuum for
  free. A human keeping range starves the build; bots never do.
- No bot ever bursts a low-hp vampire on purpose, and the low-hp window is
  the build's designed weakness. Both flags push the same way: **1600 is a
  bot-flattered ceiling, not a human forecast.** Remi's feel verdict rules.
- One-line levers if live play agrees it is too strong: `markHeal` [2,3,4],
  `lowHpMax` 3 (and `gulpEvery` for pacing only).

## Also in round 24 (no balance impact)

- **Golden Pillar avatar** (`AVATAR_GOLD` in constants): the Gathering's
  choose-avatar grid offers the gold moai next to the stone one; HTML sites
  render it via `avatarHtml()` (.goldicon), the canvas via ctx.filter (a
  no-filter engine falls back to the plain moai).
- **Bot ladder**: picker + chart sort by spec `difficulty` (Dummy first) and
  skip `unlisted` tiers; Runner is `unlisted: true` (kept for the combo lab
  and Faker arsenals; engine still accepts addBot for it).

## Verification

505 vitest green (8 new vampire cases), harness bots+coop, client-robustness
chromium+webkit, solo-static, reconnect-test, arena 60×4p and 60×8p sane.
Screenshot-verified (tools/shot.js staging): dotted ring, mark pip + count,
pip clearing on commit, gulp pip in flight, gold moai in grid + on the body,
bot picker order.
