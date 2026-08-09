# Notes for Remi — OpenWarlock & the open web MOBA

*Written overnight 2026-08-09 by Claude while you slept, from your pre-sleep
dictation. Built by sequential focused subagents, each change one commit.
**278 tests green, full ritual passed** (vitest, both harness scenarios,
chromium+webkit robustness, reconnect e2e, arena sanity, and the new
static-solo test). Pull, restart the server, hard-refresh everyone.*

## ROUND 19.6 — treads/cape/rush + your regen theory ANSWERED

Shipped (r190): treads soften to −25/−50/−65% lava damage (a 10 g full
counter to lava play was too extreme — your call), cape −15/−26/−35%, and
Rush now cancels your momentum at cast (the combo escape; the purge spell
stays a future idea). The combo-bot build is being built by an agent —
separate report when it lands.

### Your regen theory: tested, and it does NOT hold (5 configs, 2 seeds each)

The theory: no regen → sticky damage double-dips (kill pressure + lifesteal
sustain), explaining ember ~50% and anger ~100%. Measured (800-game element
mirrors, seeds 1+7, plus round-1 first-blood as the stalemate gauge; full
tables in `docs/history/2026-08-09-regen-theory-experiments.md`):
- **Regen 1.2 + the lock**: ember/anger UNCHANGED. The full-stop lock makes
  regen combat-inert; it only slows first blood (33.7 → 37.5 s).
- **Pure regen, lock off** (your "no weird stuff" case): flat damage still
  untouched, but the 51 s round-1 stalemate comes straight back, malady is
  DELETED (regen erases 1-dmg chip), and midas quadruples (stalling = gold).
- **No Blood Sword**: ember drops 13 pts — looks like your theory! — but the
  control run (ALL healing zeroed, vampire too) shows ember bouncing back to
  ~49 while vampire collapses. The drop was zero-sum points flowing to the
  last remaining healer, not damage deflation. Ember's true lifesteal
  double-dip ≈ **2.5 points of its ~50**.
- Conclusion: keep the no-regen world. Ember/anger's numbers are bot-volume
  inflation plus genuine strength, not a regen artifact. If they need
  taming, tune their own knobs (ember dmgAdd; anger markEvery/markDmg). If
  you still feel the double-dip in HUMAN games, the cheap live test is one
  session with sword lifesteal halved — say the word and I'll prep a flag.
- Instrument honesty: anger reads 98.5-100 in ALL five configs — the mirror
  is ceilinged and cannot rank anger at all; and bots under-use lifesteal,
  so the human double-dip is plausibly bigger than 2.5 pts.

## ROUND 19.5 — your mosquito correction (pushed)

- **Your numbers shipped verbatim**: fireball reductions 50/40/30% by level
  (multipliers [0.5, 0.6, 0.7]). Stated for the record: the engine's
  armed+cashed pair is 4 damage instances (the trigger ball still lands its
  own hit before the two extras), so fully-paired damage reads ×1.0 / ×1.2 /
  ×1.4 of two plain balls — the lv3 "small dps boost" is ~+40% when
  everything pairs, ±0 when nothing does. Both curves are in BALANCE.md; the
  next feel-pass decides.
- **Bots buy mosquito last now**: a bot never opens on it (seat-draw guard,
  test-locked) and the study builds buy their on-hit user (malady/midas)
  before the amplifier.
- **Vampire × mosquito, your ruling**: the two proc balls count as CASTS —
  the counter advances by 2 and an on-threshold proc ball IS engorged and
  heals (it won't render red mid-volley; the green number + counter reset
  tell the story). Test-locked.
- **Post-change instrument read** (4-seat strategy mirror, 2000 games, 25% =
  even): mosquito-midas 24.9 (exactly baseline — the gold amp pays),
  mosquito-combo still 0.8 even buying malady first — amplifying 1-damage
  ticks doesn't buy back the fireball tax on bot tables. The usual caveats
  (bots never cluster for contagion), but the shape suggests mosquito's
  partner matters more than its own numbers: it works with midas, not with
  malady. Anger-scaling 65% in this pool.

## ROUND 19.4 — your hour-away batch + the AI-games read (all pushed, r186)

Shipped: anger hover trimmed + every "Next:" tooltip footer removed; malady
buffed (sickness 3/4/5 s, aura 8/12/16) and its tick damage confirmed in the
stats table; boomerang ceiling deleted (throw ∞, shown ∞/∞); mosquito
re-mathed (below); join screen = two buttons (Play / 📡 Host online) + your
manifesto under a quiet "what is this?" fold.

### ⚠ Mosquito: your dictation shipped faithfully, and the bots hate it

First, corrected arithmetic: an armed+cashed pair is **4 damage hits** (arm
+ trigger + 2 procs), not 3 — so the live lv3 you played was **+100%**
damage per pair, not +50%. Your ruling "no more damage penalty in practice
at lv3" = pair-neutral = ×0.5 per ball at lv3. Shipped ladder **[0.4, 0.45,
0.5]**: paired damage −20% / −10% / ±0% vs plain fireballs; unpaired pokes
pay the full tax; on-hits still land ×4 per pair. The extra balls never add
push (and the text now says so).

What the instruments say about that (both read BOTS, and the caveats
matter): the solo-element mirror puts mosquito at **0.0/0.3%** — correct
instrument behavior, not a bug: alone it now has zero damage upside and
nothing to amplify, so solo-mosquito is strictly a tax. The combo instrument
(4-seat strategy mirror, 2000 games): mosquito-midas 20.3% (≈ baseline 25 —
fine, midas pays gold not damage), but mosquito-combo **1.3%** (it maxes the
tax first and pays −20% damage all early game — 5.6 kills/game). So on bot
tables the element is now purely an amplifier that costs real damage.
**This is exactly what you dictated and what "On-hit amplification" claims —
but you liked lv1's feel BEFORE (which was pair-neutral ×0.5), so know that
today's lv1 is strictly worse than what you played.** One-line levers if it
feels dead: back to [0.5, 0.5, 0.5] (levels would need a new axis), or
[0.45, 0.48, 0.5], or give lv3 a small pair-bonus [0.4, 0.45, 0.55].

### The rest of the AI-games read (800 games × seeds 1/7 mirror + strategies)

| element | s1 | s7 | | element | s1 | s7 |
|---|---|---|---|---|---|---|
| 🔴 Anger | 100 | 99.1 | | ❄️ Frost | 8.7 | 5.7 |
| 🔥 Ember | 50.5 | 51.9 | | 🦠 Malady | 8.6 | 8.3 |
| 🧛 Vampire | 47.2 | 47.1 | | 🪨 Terra | 7.0 | 6.7 |
| 🔮 Arcane | 22.3 | 17.2 | | 🪙 Midas | 4.7 | 7.0 |
| 🌪️ Gale | 11.9 | 13.5 | | 🦟 Mosquito | 0.0 | 0.3 |
| 👻 Ghost | 9.1 | 9.1 | | | | |

- **Gale buff is visible even to bots**: 1-2% → 12-13.5%, and it dragged
  ember/vampire up as the mirror re-spread. Humans exploit gusts far better
  than bots — expect it to feel bigger than this reads.
- **Malady** 4-5% → **8.6/8.3%** from the buff — still a bot-floor number
  (bots never cluster), but the direction confirms the levers work. The real
  test is your crowded human games.
- **Anger stays saturated at ~100% for bots** even at 15/10/5 s marks (bots
  claim near-perfectly; cadence only delays them). The STRATEGY instrument
  puts anger-scaling at **78.2%** vs momentum-scaling's old 28.5% — even
  discounting bot inflation, anger is a much stronger design than momentum
  was. Your slower marks are live; your feel stays the judge (question K).
- **Cape ladder read** (1200 games/level, 25% = worth its price): lv0 53.4,
  lv1 29.0, lv2 11.8, lv3 5.8 — the ladder STILL says "skip the cape", same
  as before the buff. This is the known question-B artifact (bots with kb
  resist take fights they shouldn't; the cape's sign flips by pilot), so per
  the standing rule the buffed numbers ship on your feel and the ladder is
  recorded, not obeyed. For scale: amulet 10.9/21/31.5/36.5 and hourglass
  11.5/21.7/31.2/35.7 both price cleanly; sword lv0 is still 1.5 (question L
  unchanged).

## ROUND 19.2 — the playtest batch (all pushed)

- **Gale buffed hard**: fireball push +10/20/30 by level, gust +30/60/90
  flat. Cape: knockback taken ×0.88/0.78/0.70 (starts at your −12%).
- **Switcheroo (ex-Swap) 🎭**: renamed, and it now STUNS THE VICTIM 1 s
  after the trade (you stay free — that is the combo window; honest note:
  the stun was in your original dictation's garbled section, so it only
  landed now that you asked). Name/icon brainstorm if 🎭 Switcheroo isn't
  it: Castling ♟️ (chess castle-swap), Trickster's Trade 🃏, Uno Reverse 🔄,
  Doppel 👥, Hexchange 🪄. One line to apply any.
- **Shop 2.0, your minimal-text doctrine**: cards are icon + name + cost
  (+ key chip on spells) — everything else lives on hover (short line,
  mechanism sentence, FULL per-level table, next-level line). Spells sit in
  three quiet edge-labelled rows: Offense / Defense / Special; elements one
  row, mutations one, items one. Every desc/long rewritten: one line, no
  emoji in text, no em dashes, no flavor clauses; your dictated lines used
  verbatim. Stats tables never leave cells empty (range 45/45/45, Bomb
  shows push 0/0/0).
- **Rebind rule, your fix**: a conflicting key only denies when the other
  spell is OWNED this game; unowned spells swap keys automatically with a
  toast saying what swapped.
- **Meteor now falls**: a rock streaks down over the delay with an ember
  trail — the impact reads instead of popping.
- **Bots**: unchanged since 19.1 (never stop shopping).

### 🌐 Browser hosting is FEATURE-COMPLETE for hosting (phase B merged)

From the static page: **📡 Host online** → you get a 5-letter room code and
a copy-invite link; friends open the link and land in your lobby over
WebRTC — no game server anywhere. The host tab shows "You are the server —
keep this tab open" (your accepted price). The signalling relay
(`npm run signal`, ~100 lines, zero game logic) is only needed for the
handshake: the e2e KILLS it mid-battle and the game doesn't blink.
Verified end-to-end headless: two browsers, one hosts, one joins by link, a
real round plays (`test/rtc-host.js`).

**Your two clicks to go fully live**: (1) repo Settings → Pages → deploy
main/root (that's solo play + hosting UI on a public link); (2) a public
home for the relay — options in
`docs/history/2026-08-09-browser-hosting-phaseB.md`. Until then hosting
works anywhere a relay runs (`?signal=` or `npm run signal`).

Known trade-offs, all documented in the history file: STUN-only (a friend
behind a weird carrier NAT may fail to connect, with a plain message), no
ping badges on the RTC path yet, journal becomes an in-memory download
button, host migration (host closes tab = game over) is designed but not
built — the protocol blockers were cleared (deterministic engine
serialization landed), it's one focused session away if you want it.

## ROUND 19.1 — your morning feedback, all applied

- **Mirror wall reverted to projectiles-only** — you were right, the
  "tangible" order was a transcription ghost (garble flag #2 confirmed).
  Walls reflect shots and block nothing else, exactly as before; a test now
  locks that bodies walk through.
- **Blink costs [10, 8]** (the overnight [8, 6] was too cheap on your read).
- **The new spell is now 'Bomb' 💣** (second try — was Nova 🧨; both were my
  guesses, still one line to rename when you pick the real name).
- **Bots never stop shopping**: once a bot's build path is fully maxed, it
  spends leftovers on random upgrades — items first, then spells it can
  pilot, then mutations. Two guards, both test-locked: it still SAVES while
  its list has unmet entries (no torching savings mid-build), and the
  power-tier no-buy rule survives (bots still can't waste gold on
  Meteor/Bomb they can't aim).
- **Anger / gale / the rest**: untouched, awaiting your playtest as agreed.
- **Browser hosting phase B is underway in parallel** (details at the end of
  this file) — it lives behind the transport seam on its own branch, so your
  gameplay feedback and that work can never collide; keep the ideas coming.

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
