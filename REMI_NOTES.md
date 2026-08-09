# Notes for Remi — OpenWarlock & the open web MOBA

*Written overnight 2026-08-09 by Claude while you slept, from your pre-sleep
dictation. Built by sequential focused subagents, each change one commit.
**278 tests green, full ritual passed** (vitest, both harness scenarios,
chromium+webkit robustness, reconnect e2e, arena sanity, and the new
static-solo test). Pull, restart the server, hard-refresh everyone.*

## ROUND 19 — the overnight batch

## ⚠ READ FIRST: what the voice transcription garbled (my calls, all revertible)

1. **The new spell's NAME didn't survive transcription** ("I have a friend
   named …"). It shipped as **Nova 🧨, key B** — tell me the real name and
   it's a one-line rename.
2. **"The mirror wall should be tangled"** → I read *tangible*: walls now
   BLOCK players (both sides slam against them like pillars). If you meant
   something else, one commit reverts it.
3. **Mosquito + midas combined tax**: your combined number came through as
   "55%". I made the penalties multiply like every other rider (lv1+lv1 =
   0.5 × 0.5 = 25% damage). If you wanted additive or a floor, say so.
4. **Gale's gust value**: per your recipe — old lv3 gust total ≈ 190 push,
   ×70% ≈ 133, minus the hit's own 86 → gust ADD ≈ 45, laddered [15, 30, 45]
   by level. Stacking now lives at ALL levels, costs [10, 8, 8].
5. **Anger's numbers are mine** (you delegated): marks every **[10, 7, 5] s**
   by level, **+0.5 fireball damage per claim, forever**. See the balance
   section — the bot lab literally cannot judge this one.
6. **Malady details I chose**: icon 🦠; in co-op the plague spreads to ANY
   nearby player including allies (friendly-fire precedent). Venom's old
   hidden −15% fireball tax did NOT survive the rework (the new shop text
   promises no weaker hits).

## The reworks

### 🦠 Malady (was Venom) — "Spread disease, steal kills."

Two hits on the same target infect them: **1 damage per tick**, sickness
lasts **2/3/4 s** by level, then they're cured. While sick they carry a
visible green aura (**radius 4/6/8** by level) — anyone who steps inside
catches the SAME plague, **once each, ever** (no ping-pong chains; a cured
player can't re-catch that instance, and whoever infected you can't get it
back from you… but a patient CAN pass it back to the ORIGINAL caster if the
caster comes close — and if it kills them, the kill goes to the player who
gave it to them). All other malady deaths credit the instance's creator, and
a lethal tick still takes the kill. The old lava trail is gone with the
rename.

**Verified for you**: venom's frequent lava kill credit never came from the
ticks — ticks don't stamp last-hitter; the fireball that applied the DoT
does, and lava credits the last hitter. Same story now.

### 🔴 Anger (was Momentum) — "Hunt the mark."

Every few seconds (**10/7/5 s** by level — levels buy FREQUENCY) a red mark
pops on one random enemy; the first one 0.5 s into every round. Hit the
marked player with your fireball to claim it: **+0.5 fireball damage,
forever**, with a kill-jingle on the claim. One mark of yours out at a time;
your next appears on the cadence after a claim. The mark is a red orb pip on
their body — you see your target, they see they're hunted. Your total bonus
shows in the scoreboard kit (🔴 +N) and rides the white bonus number on every
hit. The old tier system, point banking and 26-gold cliff are gone — and so
are the giant tier balls: **the ball's hitbox never lies now** (red tint +
tight embers within the real radius; the vampire ball was the quality bar).

### 🦟 Mosquito — normal balls, honest tax

No more 1-damage sting. **Every ball you throw is a completely normal
fireball** — full riders, vampire's engorged heal works, kill credit and
pushes behave like anyone else's. The price: your fireballs deal
**×0.5 / ×0.75 / ×1.0 damage AND push** by level. The trap stays: a hit arms
a sting, the next hit on that target cashes it — TWO extra real fireballs
land at once. Per armed+cashed pair that's **4 on-hit applications for 2
casts** (your midas/malady/anger/frost riders all pay 4 times).

### 🌪️ Gale — uniform

Stack-and-burst from **level 1** (was a lv3 exclusive), gust is a **flat
+push value** [15/30/45] instead of a multiplier (percentages scaled weirdly
with other push riders), fireball push +7/14/21 by level, costs [10, 8, 8].
Level 3's gust total is ~70% of the old one, per your call.

## The new spell — 🧨 Nova (NAME IS A PLACEHOLDER)

Throw a bomb at a spot (max range 45 — a bit less than the arena): the orb
flies straight there **over everything** — bodies, pillars, walls never stop
it; the half-second FUSE is the counterplay (a pulsing ring shows the exact
blast area). Then a flat-damage explosion: **10/14/18 damage** in radius
**4.5/5.5/6.5**, NO pushback, no element riders (it is not a fireball —
midas/malady/anger don't proc from it). 3 levels, 10 g entry, cooldown
9/8/7 s, default key **B**. Bots don't buy it yet (same guard as the other
power-tier spells).

## Spell retunes

- **🔀 Swap**: 3 levels now (10 g, then 6/6). Projectile speed 38 → **50**
  (flat), range **40/55/70**, cooldown 13/12/11. Still trades position AND
  momentum, still stamps lava credit.
- **🌀 Blink**: cheaper (12/8 → **8/6 g**), range FLAT at 22 both levels
  (lv2 buys cooldown 16 → 12). It no longer out-ranges at lv2.
- **👁️ Vanish**: casting ANY spell while invisible now **reveals you
  instantly** — no more invisible repulse windups. Two things deliberately
  still work: re-casting vanish refreshes it, and you can now cast vanish
  MID-CHARGE — charge the repulse in the open, vanish, and the burst fires
  from stealth (everyone saw the windup start; that's the trade). Fun fact:
  the "charge then vanish" order you described was actually impossible
  before tonight — vanish was locked during a charge; the OP combo was the
  reverse order, and that one is now visible.
- **🪞 Mirror Wall**: tangible (garble call #2 above).

## Quality of life

- **📶 Ping is everywhere now**: lobby list, in-game top-right board, and
  every scoreboard (shop / spectator / end screen) — green < 80 ms, amber
  < 180, red above. If you "weren't running the correct version" last night,
  this is also insurance: it only needed a hard refresh.
- **⌨️ Rebind keys in the shop**: every spell button has a small key chip in
  its corner. Click it → "press the key you want" → Esc cancels, a key that
  belongs to another spell cancels with a message naming the owner, anything
  else rebinds instantly and persists on that browser. (Also fixed a real
  pre-existing bug found on the way: toasts were invisible behind the shop.)
- **Heal numbers scale with size** (+1 is small, +50 is big); damage numbers
  already show base red + bonus white side by side — anger rides that.

## Your two friends' lag — analysis, not guesses

- **Friend 1 (late info, per-session, restarts helped)**: that signature —
  same game, some sessions bad, a restart re-rolls it — matches the
  **cloudflared quick tunnel**, which picks a possibly-different Cloudflare
  edge/route every `npm run host`. The new ping badge turns this from a vibe
  into a number: if he sits amber/red all session while others are green,
  it's the route, and re-hosting re-rolls it. Options if it keeps happening:
  a named tunnel (stable route), or the browser-hosting work below (no
  tunnel at all).
- **Friend 2 (low framerate all game)**: a render/machine problem, not
  network — and now provable: green ping + choppy screen = his machine. The
  usual suspects on his side: browser hardware acceleration off, battery
  saver, or an old GPU fighting the lava gradients. If it recurs I can add a
  "low graphics" toggle — say the word.
- **Frost, verified as you suspected**: the slow only touches MOVE speed —
  knockback is a separate velocity channel, so slowed targets fly exactly as
  far. Lv1 is already exactly a 30% slow, stun stays 2 s ("let's keep it
  this way" — nothing changed).

## Balance read (bot labs, honest about their limits)

Element mirror, 800 games × seeds 1/7, all-Hard, 25% = even (a RANKING, not
a strength meter — the do-nothing floor is ~3%):

| element | s1 | s7 | | element | s1 | s7 |
|---|---|---|---|---|---|---|
| 🔴 Anger | 97.4 | 97.9 | | 🪙 Midas | 6.1 | 3.9 |
| 🦟 Mosquito | 63.8 | 62.1 | | 🦠 Malady | 5.2 | 4.0 |
| 🧛 Vampire | 35.8 | 29.3 | | ❄️ Frost | 4.7 | 4.0 |
| 🔥 Ember | 33.6 | 38.6 | | 🪨 Terra | 3.2 | 3.0 |
| 🔮 Arcane | 13.7 | 10.5 | | 👻 Ghost | 3.2 | 4.4 |
| | | | | 🌪️ Gale | 2.2 | 1.1 |

- **Anger ~98% is the instrument saturating, not a verdict**: bots claim
  marks near-perfectly (they're always shooting someone), so the mirror
  can't price the human cost of chasing a specific target. I swept it:
  slower marks [16,12,8] → 94.1, smaller claims (+0.3) → 87.3 — the knobs
  barely move a saturated table, so I shipped the fun numbers and kept the
  levers documented. This is momentum's old question-K shape wearing a new
  name; your feel report decides it.
- **Human math at my numbers**: a dedicated lv3 hunter claiming over half
  their marks earns roughly +2/round — noticeable by midgame, scary by
  round 12+, and they paid 26 g and a lot of chasing for it.
- **Mosquito ~63%** (was ~46 as the sting): the tax version is stronger on
  bot tables — volume bots love 4-procs-per-pair. Top-third, not degenerate;
  yours to feel.
- **Malady 4-5% and gale 1-2% are floor readings I do NOT trust**: bots
  never cluster (contagion's whole value) and never exploit gust positioning.
  The labs measurably cannot express either mechanic — human games are the
  only instrument here (the round-12 rule cuts both ways: no panic buffs off
  a blind lab).

## Browser hosting (your big task) — Phase A SHIPPED, Phase B needs one thing from you

**Phase A is done, merged and verified**: serve the repo as plain static
files and the page detects there's no server, announces solo mode, and runs
the full game in the tab against bots — lobby, shop, every ruleset. It works
under a `/OpenWarlock/` subpath, i.e. the exact GitHub Pages shape.
**To put it live, the only step left is yours: repo Settings → Pages →
deploy from main, root.** Your `npm run host` flow is byte-identical on the
wire and was fully re-verified (both browsers, reconnect, integration).

Under the hood (matters for the MOBA dream): the whole authoritative room
moved into `shared/engine.js` behind a transport seam — the Node server is
now just an adapter, and the tab runs the same engine for solo. That seam is
exactly where phase B (player-hosted lobbies over WebRTC, no server at all)
plugs in.

**Phase B is honestly gated, not started.** Its go/no-go question is: does a
hidden browser tab keep simulating at ~30 Hz for 10 minutes? On Chrome:
measured with a real Chrome (not an emulator — those lie about tab
throttling): a worker-driven loop holds 30.2-30.4 Hz through minute 9+ of
10, flawless. **Safari can't be measured from here — that part is yours**:
open `tools/tabtest.html?v=worker` in Safari, press Start, background the
tab for 10 minutes, read the on-page report (then once more with
`?v=worker-audio`). Green numbers there = phase B is a go. Full handoff:
`docs/history/2026-08-09-browser-hosting-phaseA.md`.

One solo-mode choice to know: no ping badge in solo (there's no network —
a number would be a lie).

---

*Round 18 is archived at `docs/history/2026-08-09-remi-notes-round-18.md`;
older rounds in the same folder.*
