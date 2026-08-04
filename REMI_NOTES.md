# Notes for Remi — OpenWarlock & the open web MOBA

*Written 2026-08-01 by Claude, working autonomously. Everything below is either
a decision I made (and you may want to change) or an answer to the questions
you asked before leaving.*

---

## ROUND 9 — la grosse nuit : élémental v2, sorts puissants, ~14 000 games (2026-08-04)

Tout ce que tu as demandé est implémenté, équilibré au lab, vérifié (92
tests, harness, 2 navigateurs) et poussé. Redémarre le serveur + hard-refresh.

### Élémental v2 — multi-éléments, 3 niveaux

- **Chaque élément a 3 niveaux** (10+8+8 g) et **ils se cumulent** : glace+feu
  marche exactement comme tu l'imaginais — les deux effets montent sur chaque
  boule de feu. Le shop les affiche comme les sorts (lv, prix du niveau suivant).
- **Nouvel élément Arcane 🔮** : −10/−18/−25 % de cooldown sur TOUS tes sorts
  (pas besoin de fireball, c'est un passif global).
- **Poison buffé + traînée au sol** : tes boules de feu laissent des flaques
  toxiques (vertes, qui s'estompent) — y marcher brûle un peu et teinte la
  cible. DoT 4/7/10 sur 4 s.
- **Terre** : la taille du projectile monte par niveau (+25/+45/+65 %).
- **Air nerfé** : la poussée est étalée sur 3 niveaux (1.18/1.32/1.45×) — le
  1.45× ne coûte plus 10 g mais 26 g. **Gold nerfé** doucement (−10 % dégâts).
- **La vraie découverte de la nuit** : le poison **volait tous les kills
  lave** — chaque tick de DoT re-stampait « dernier tireur » 30 fois par
  seconde, donc un empoisonné qui tombait dans la lave créditait toujours le
  venom. Corrigé (les DoT ne prennent plus le crédit) ; le venom passait de
  50-86 % de win rate à ~10 %, puis remonté avec de vrais chiffres. Les
  premières mesures « air/gold cheatés » de l'ancien système souffraient
  peut-être du même biais.
- Spread final par élément (800 games par tier, baseline 25 %) : tout le
  monde entre 10 et 48 % avec des affinités nettes — terre→stalker,
  arcane/ember→berserker, venom→grunt. **Midas reste au sol chez les bots
  (~3 %)** : c'est un élément ÉCONOMIQUE et les bots saturés n'ont rien à
  acheter avec l'or (300+ g d'or inutile en fin de game). À juger en vrai.

### Sorts nouveaux

- **🗿 Pilier (sort normal, touche S)** : pose un pilier d'obsidienne au
  curseur (10-16 s, un seul à la fois, le nouveau remplace l'ancien). Cover,
  stoppeur de knockback, bloqueur de hook/météore-esquive.
- **Tier "Puissant" — débloqué à la fin du round 5, cher, décisif** :
  - **☄️ Météore (T, 22 g)** : marque au sol qui clignote 1,25 s, puis 16-24
    dégâts + blast radial énorme (110-130 push). Touche aussi le lanceur !
  - **🪝 Hook (G, 20 g)** : harponne le premier ennemi touché et le tire
    JUSTE DERRIÈRE toi. Momentum annulé. Ton dos face à la lave = son problème.
  - **💥 Répulsion (X, 20 g)** : 2 s de charge (double anneau qui clignote
    fort, autres sorts verrouillés), puis tout le monde autour valse
    (130-150 push). Le shield la bloque.
  - **🪞 Mur miroir (C, 24 g)** : mur perpendiculaire à ta visée qui
    **renvoie les projectiles ennemis** (ils changent de propriétaire !) et
    bloque leurs éclairs ; les tiens passent. 5 s, un seul à la fois.
- Les bots ne pilotent pas encore ces sorts — c'est du contenu joueur ;
  l'arène ne peut donc pas les équilibrer, vos parties le feront.

### Knockback

- **Multiplicateur bas-PV réduit** : 0.8 → **0.55** (près de la mort ≈
  1.55× au lieu de 1.8×).
- **Audit du "bug petits joueurs"** : le knockback n'a AUCUN terme de
  taille (test de régression ajouté) et il était déjà fonction du **% de PV
  manquants** (l'amulette compte). La perception venait du fait que les
  petits (à la traîne) sont souvent bas en PV%.
- Effet mesurable : la part de kills lave descend à ~68 % (77 % avant) —
  moins de morts « valse dans la lave » depuis les bas PV. À toi de dire si
  c'est le bon curseur.

---

## ROUND 8 — feedback en français, deux phases (2026-08-03, late evening)

Phase 1 (anti-snowball + feel) shipped first at `9347bd4` so you could play;
phase 2 (boomerang rework) and your post-game gold correction follow in the
next commit. 82 tests green, harness + 2 browsers pass.

### L'économie anti-snowball

- **Hard cap as requested**: with 4 players it is now *mathematically
  impossible* for the player with every kill to earn 2× more than a player
  with none. The invariant is `ROUND_BASE ≥ 3×PER_KILL + ROUND_WIN`, it's
  enforced by a test, and the comment in constants.js explains it.
- **First pass (11/3/2) had the right ratio, too much volume** — your
  post-game note confirmed everyone ended full-build. Now: **+8 g/round,
  +2 g/kill, +2 g round win** (still exactly on the cap).
- **Bounty, gap-scaled exactly as you specified**: killing someone ahead of
  you pays `floor(gap/2)` capped at +3 g. The #2 sniping the #1 gets ~+1;
  the last player toppling the leader gets +3; **the leader collects
  nothing** (nobody is ahead of them) — which is also what makes the 2× cap
  unbreakable by bounties. Bounty pops as a gold float on the kill.
- **Round-end banner now itemizes income**: "+12 gold — 8 round · 4 kills ·
  2 round win" so gold-per-kill vs gold-per-round is never a mystery.

### Lisibilité

- **Liseré rouge** permanent around YOUR warlock (plus the white stroke).
- **Kill feedback**: a golden "⚔ kill" banner + a bright three-note jingle
  whenever a kill is credited to you (works for lava shoves too, via the
  last-hitter rule).

### Équilibrage sorts

- **Lightning**: damage untouched, **push removed entirely**, range −30%
  (55 → 38). The cross-map last-hit is dead; it's a mid-range finisher now.
- **Fireball**: interpreted your (garbled) transcription as "lv1 spams too
  fast" → **lv1 cooldown 1.6 → 2.1 s**, and upgrades now buy the cadence
  back (lv2 1.85, lv3 1.6). If you meant the opposite — a 30% FASTER lv1 —
  say so, it's a one-line change in constants.js.

### Le boomerang (phase 2 — le rework profond)

Exactly your design: **+40% reach** (20 → 28 u), it returns **to the launch
point** (not to you), and the choice is yours: **catch it** (touch it on the
return leg) → **cooldown halved**; let it pass → it flies on in a straight
line, gone forever. Catching plays a crisp snap sound. A shielded reflect
re-launches it as the reflector's, returning to the reflect spot.

Balance guardrails I had to add after measuring (the raw rework won 77% of
grunt-mirror games): damage back to 4/6/8 (the doubled corridor IS the +30%
buff for this spell), cooldown 4.5 → 5.5 s (catchers get ~2.75 s effective —
the skill is the buff), and one throw can hit each enemy only once (the
out-leg knockback shoves victims along the lane; the straight return was a
guaranteed free double-tap). It still lands at ~46–58% in bot mirrors —
strongest in dumb-bot tiers because a wide spell forgives bad aim; humans
who sidestep and catch will experience it very differently. Playtest verdict
is yours.

---

## ROUND 7 — the 21k-game balance campaign (2026-08-03, same evening)

You asked for 1k games; it turned into ~21k across four iterations (mixed
studies, per-difficulty mirrors, item probes). **BALANCE.md is rewritten
from scratch** in the new format — it now explains every metric before using
it, starting with the one number that decodes everything: *4 players, so
25% win rate = perfectly neutral; "3/5" style confusion shouldn't happen
again anywhere.* Read it top to bottom, it's built for you.

### What the games said, and what I changed

- **Your retune made defense king.** With lava −30% and knockback −10%,
  chip damage couldn't outpace regen: turtle won 48–50% of same-difficulty
  games, bruiser up to 65%, and the item table was a defense monoculture.
  Fix: one gentle trim each — ring 1.2→0.9 HP/s, amulet +30→+25, cape
  −15%→−10% kb, sword 35%→25% lifesteal, treads −30%→−20% lava.
- **Your +30% damage request landed mid-campaign** (fireball 5/9/13,
  lightning 5/8/12, boomerang 5/8/10, rush 5/8, ember +4) and pulled the
  same direction. Result: **lava kill share 86% → 77%** — killing without
  the lava is finally real, and lava still rules.
- **Mobility got cheaper instead of stronger**: teleport 14→12 g,
  rush 12→10 g entry.
- **Escape/rusher are bot-traps, maybe not human-traps**: bots can't fake
  the reactive skill teleport rewards. I fixed the worst pilot holes (all
  kinds now lava-save; wounded grunts blink out of melee; rush only used
  to shove rim-standers) and gave escape a real damage kit, but they still
  sit at 3–12% in bot hands. Deliberately NOT buffing their numbers off
  bot data — that lands on you too. Playtest teleport and tell me.
- **Healthy identity, kept on purpose**: bruiser is *the* berserker build
  (57%), boomer is the sloppy-aim grunt's equalizer (46%). Bot picking
  guide: stalker → turtle/sniper, berserker → bruiser, grunt → boomer.

### Your three quick asks, also in

- **Stats readability**: the "3/5" fraction is gone — the shop roster now
  shows ⚔ kills, 💀 deaths, and 🗡 **damage dealt** separately (lava burn
  you caused is credited to you by the same last-hitter rule as kills).
  Damage is also a column on the final standings.
- **Keys**: blink (teleport) is now **F**, dash (rush) is **E**, boomerang
  moved to R — both QWERTY and AZERTY presets. Your saved custom bindings
  still win over presets.
- All 78 tests green, harness + 2-browser robustness pass, everything pushed.

---

## ROUND 6 — your playtest feedback, applied (2026-08-03)

All nine changes from your voice notes are in and verified (78 tests green,
harness + 2-browser robustness + arena all pass). Restart the server and
hard-refresh after pulling.

### Feel changes — the numbers you asked for

- **Lava now makes you FASTER, not slower.** There never was a slow — the
  helpless feeling was 20 DPS + knockback momentum. Now: **+30% move speed
  in lava** (`LAVA.SPEED_MULT`), **lava damage −30%** (20 → 14 DPS), and
  **no more lingering burn** — step out and the damage stops instantly.
  Diving through the lava to dodge or flank is now a real play.
- **Fireballs: 20% slimmer (radius 1.0 → 0.8), 20% faster (34 → 41).**
  Snappier to fire, easier to dodge. (I read "the blaze" in your dictation
  as the fireball — shout if you meant something else.)
- **Boomerang 40% wider** (radius 1.0 → 1.4). It's now the easy-to-land spell.
- **Knockback −10% on every spell** (fireball 72→65 lv1, lightning 32→29,
  boomerang 56→50, rush 88→79, ember's bonus 6→5). Lava kill share measured
  after the change: still ~86% — the identity is intact.

### Gold — the "bug" and the clarity pass

- The end screen showed your **unspent wallet**, not your income — buy three
  items and of course it looks pathetic. The game now tracks **gold earned**
  separately and the standings show that (wallet in the tooltip).
- Income rules are now written where you can see them (lobby + shop):
  **+3 g every round · +4 g per kill · +3 g round win · +1 g if you died
  first.** You start with 12 g.
- **The shop now shows a full roster** during the lull: everyone's kills,
  deaths, gold now + earned, and every upgrade they own as icons.

### Bots — pick their strategy

- Each difficulty button in the lobby now has a **strategy dropdown**:
  🎲 random (default) or bruiser / sniper / escape artist / turtle / rusher /
  boomer — the exact builds the balance lab rates. The lobby list shows each
  bot's rolled strategy.
- **"Bot difficulties & strategies explained"** (collapsible, in the lobby)
  is the chart you asked for: what each difficulty does, what each strategy
  buys and why. Long version: `STRATEGIES.md`, which also documents how to
  read the arena reports (win rate baseline 25%, Elo, mirror tables…) — and
  I've made "explain the metrics" a standing rule for future reports.
- **Bots now cast what they buy** (the old debt #1): a generic pilot layer
  throws boomerangs, zaps, shields, rushes and lava-saves with teleport for
  any build. The arena's boomerang crutch is gone — lab and live games now
  measure the same thing.

### Backgrounds — found the blur, twice over

Your originals are fine (1024×1536). Two things were degrading them:
1. The committed JPEGs had been **downscaled to 682×1024** — recommitted at
   native resolution (q65, ~6 MB total) from
   `~/reachy_mini_apps/fire_nation_attacked_assets/`.
2. The renderer painted the art on the **1/3-resolution backdrop layer** and
   stretched it up. The art now draws full-res on the main canvas; only the
   lava-blob gradients (the actually-expensive paints) stay on the cheap layer.

### Worth a fresh balance campaign

Knockback −10%, lava −30%, faster+slimmer fireballs, wide boomerang AND bots
that finally use their kits — the old BALANCE.md numbers are stale now. Next
session should re-run the full study (and write the report per the new
explain-everything rule).

---

## ROUND 5 — the overnight build (read this over coffee ☕)

Everything you asked for is in, verified, and pushed. Four phases, each
delegated to a subagent and verified between phases. `npm start` to play.

### 1. Your six mechanics changes (all in, all tested)

- **Knockback 2×** (fireball lv1 push now 72) and **friction 3.4 → 3.1** so
  the impulse reads as flight. Measured result: **~86% of all deaths are
  lava** — the game is now about throwing people in, exactly your intent.
- **HP-scaled pushback**: `× (1 + 0.8·(1 − hp/maxHp))` — near-death players
  fly ~1.8× further. Smash-style. `PLAYER.KB_HP_FACTOR` to tune.
- **Adaptive lava**: base shrink 65 s, and the ring closes up to ~1.75×
  faster as fighters die (`ARENA.SHRINK_ADAPT`) — no more waiting on a big
  empty arena after a double kill.
- **Damage halved + baseline regen 1.2 hp/s**: lv1-fireball-only TTK measured
  at ~75–80 s (possible, hard). Damage builds still kill; lava does the rest.
- **Six pillars** on a ring near the rim: block projectiles, lightning, and
  dashes; you can slam someone against one (it kills their velocity) or be
  cornered by one; the lava swallows them as the ring shrinks. Bots learned
  not to wedge against them.

### 2. Your art + music are in the game 🎨🎵

Round n plays your level-n track (looping, ~900 ms crossfade) with its
background painted dimly behind the lava sea; past round 10 it picks
deterministically-random (all clients hear the same track). The countdown
shows each level's title — Round 3 arrives as *"Locked in."* Separate ♫
music mute next to the SFX mute. Assets compressed 106 MB → 8.3 MB (AAC/JPEG)
and committed; the game works fine without them if they ever 404.

### 3. The balance campaign — 46,000 games, 6 iterations (BALANCE.md)

You asked to see iterations, not vibes. BALANCE.md report #2 has every step:
measure → hypothesis → change → result. Highlights:

- **New instruments**: mirror mode (same bot, builds differ) and an **item
  probe** (identical bots, only the FIRST purchase differs — it caught the
  winner-held stat lying: pricier treads *raised* its winner-held share
  because only rich winners could buy it. Selection bias, proven and dodged).
- **Changes kept**: fireball upgrades cost 8 g and push nerfed a hair; treads
  −50% → −35% lava damage; cape −25% → −15% push taken; **boomerang rescued**
  (cd 4.5, speed 31, push grows per level — its win rate tripled); teleport
  and shield slightly slower.
- **Your size-by-lead mechanic works**: with it OFF, comebacks (winning after
  being ≥4 kills behind) happen far less; with it ON, up to **37% of
  evenly-matched games feature one**. Data, not opinion.
- **Honest residue** (in the report): bruiser dominates mirror matches mostly
  because bots don't *cast* most spells they buy (a bot-pilot limitation, not
  a numbers problem — top of the next campaign's list); venom see below.

### 4. Elemental mode ⚗️ — your brainstorm, playable, fully separate

Lobby button: **Rules: Classic / ⚗️ Elemental**. Classic is untouched (a test
proves the wire format is byte-identical). In elemental mode, after Fireball
lv1 you pick ONE element (10 g, permanent):

🔥 Ember +3 dmg +6 push · ❄️ Frost slows 45% for 1.6 s · 🐍 Venom 6 dmg over
4 s DoT · 🌪️ Gale +45% push −25% dmg · 🪙 Midas +1 gold per hit ·
🪨 Terra bigger fireball, target grows +15% for 3 s

Plus two experimental combo items: **Echo Stone** (every 4th fireball fires a
twin) and **Cinder Crown** (unlocks Fireball lv4) — weak early, fun when the
build comes online, and they compose with any element (echo×venom, crown×ember).

First elemental data (100-game sanity runs, in the agent's report): **venom
is overtuned** (DoT keeps kill credit alive in a lava-kill world) and
**midas snowballs gold** (90–140 g banks) — bots can't spend it, a human
might be degenerate with it. Left as-is per "brainstorm mode": that's what
your play test is for.

### State of the suite

**73 unit tests**, 4 harness scenarios, 2-engine browser robustness, arena
classic + elemental sanity runs — all green at the final commit. ~15 commits
pushed tonight, each small.

### Things I'd flag for your session

1. Knockback×2 + HP-scaling + pillars is a BIG feel change — the two dials
   are `KB_HP_FACTOR` and the spell knockback arrays.
2. Try elemental with 3 stalker bots: frost-vs-gale fights around pillars are
   the most fun thing the arena stats can't capture.
3. Say the word and the next campaign gives bots real element/spell piloting,
   then re-balances venom/midas with data.

---

## ROUND 4 — kills win, size-by-lead, spectating, and the balance lab

- **Win condition**: first to **15 kills** (`ROUND.KILLS_TO_WIN`), checked at
  round end; 25-round safety cap. Score is gone — kills are the leaderboard,
  crown on the leader, "first to 15 kills" always visible. Typical 4-player
  games: 8–11 rounds.
- **Size-by-lead**: `radius × clamp(1 + 0.08·(kills − avg), 0.5, 2.0)`, live
  (hitbox AND visual). Tune in `PLAYER.SIZE_LEAD`. My 0.08/kill is a guess —
  experiment #4 in BALANCE.md measures whether it actually produces comebacks.
- **Spectator mode**: "Playing ⚔ / Watching 👁" toggle in the lobby. Bots-only
  games with you watching are first-class (your "I want to see the bots play"
  mode). Needs ≥2 fighters; bots count.
- **Balance lab**: `tools/arena.js` — strategy = bot profile × build scheme,
  Elo from pairwise placements, fully seeded. 4,500 games ran in ~100 s.
  **Read `BALANCE.md`** for the full report. Headlines: skill (dodging,
  aim-leading) dominates items by a huge margin; within equal skill, damage+HP
  builds (Fireball ups + Amulet + Sword; or Shield/Amulet/Ring turtle) crush
  mobility-first builds; items still matter 4× within a tier. Caveat: bots
  undervalue utility spells — don't nerf Teleport on this data alone.
- Earlier in this round (already reported): round-end VICTORY/DEFEAT banner
  with gold earned, shop Ready button that skips the wait, three bot tiers
  (Grunt ★ / Berserker ★★ / Stalker ★★★ — the stalker dodges, leads shots,
  and teleport-saves), synthesized sound effects + mute, no more lobby shop,
  bigger hitboxes, faster infinite-range fireballs, less damage / more push.

Your reaction-time framework idea (map dodge windows: projectile speed ×
hitbox × distance vs ~150 ms human reaction) is noted as the right way to do
the next projectile-feel pass — the arena can compute exactly which shots are
dodgeable at what range. Soundtrack: waiting on your files; SFX are
placeholder-quality synth, easy to swap.

---

## ROUND 3 — OpenWarlock on GitHub + your five requests

- **Repo**: pushed to `github.com/RemiFabre/OpenWarlock` as ~20 short commits
  (the remote was empty — your snippet hadn't been run — so I recreated the
  history from "first commit" up). Local folder renamed to `~/OpenWarlock`.
- **Rebindable keys**: ⌨ Keys panel on the join screen and in the lobby.
  Click a binding, press a key; conflicts swap; Esc cancels; QWERTY and
  AZERTY presets; stored in localStorage; every key label in the UI updates.
- **Speed**: base move speed 14 → **11**; Boots (+20%) ≈ the old speed, as you
  asked. Friction 4 → 3.4 so knockback slides further.
- **Knockback +~35% across the board** (Fireball 30/35/40, Boomerang 24,
  Rush 38, Lightning 14). Combined with slower movement, positioning and lava
  throws matter much more now. All numbers in `shared/constants.js`.
- **Avatars**: pick one of 12 emoji on the join screen; drawn on your colored
  circle in-game, shown in lobby/scoreboard/standings. Bots got monster faces.
  (Proper sprites/skins are a v2 art question — emoji was the zero-asset way.)
- **Informative shop**: every spell shows dmg/kb/cd/range; owning a spell
  shows the upgrade as explicit deltas ("lv 1→2 · dmg 10→13 · kb 30→35").
- **Clear game end**: games are a **fixed 10 rounds** (your preference — every
  game reaches late-game builds), highest score wins, ties break on kills.
  The HUD shows "round 3 / 10" at all times and the lobby states the format.

Verified after all changes: 40 unit tests, chaos + duel scenarios, visual
test, client robustness in Chromium + WebKit.

---

## ROUND 2 (same day, after your first playtest)

You asked for: the freeze investigated, an AI-playable test harness, substantial
robustness work via subagents, and a better round-1 economy. All done.

### The freeze — what I found

I could **not reproduce it server-side**, and I tried hard: your exact setup
(1 human + 3 bots) scripted for 9 minutes with 24 deaths, ~70 fuzzed matches,
real Chromium *and* WebKit sessions with forced kills — the sim and server never
stalled. But the hunt found the most likely culprit in the client: the render
loop had **no exception containment** — a single thrown error inside a frame
(canvas gradient calls throw on non-finite coordinates, which a death +
interpolation edge can produce) killed `requestAnimationFrame` forever. Perfect
symptom match: game visually freezes, no error shown, server keeps running.

That class of bug is now structurally impossible:
- The frame loop catches per-frame exceptions, **reports them in a visible red
  banner**, and always reschedules itself.
- All rendering/UI code is defensive against missing players, NaN coordinates,
  malformed snapshots.
- A dropped connection shows a persistent "reconnecting…" banner and
  auto-rejoins every 2 s (before, it flashed a 1.8 s toast and sat on stale
  state — the other prime "freeze" suspect).

So: if it EVER "freezes" again, you will see a red banner with the exact error.
Copy it to me and it's a 5-minute fix instead of a ghost hunt.

### The AI test harness (your scripting-language idea — built)

Exactly what you described, three layers:

1. **Scenario language** — matches are data. Players are scripted with commands
   like `ready`, `hunt 20`, `cast fireball at nearest`, `buy boots`, `spam 50`
   (malformed packets), `disconnect`/`reconnect`, `auto 120` (full autopilot).
   `node test/harness/run.js test/harness/scenarios/duel.js`
2. **Journaling server** — with `JOURNAL=file`, the server logs every input,
   game event, phase change, per-second state digest, and crash dump (JSONL).
3. **Invariant checker** — replays a journal and verifies game law: no tick
   stalls, finite positions, HP/gold bounds, legal phase transitions, rounds
   end exactly when ≤1 stands, cooldowns respected.
   Plus a **fuzzer**: `node test/harness/fuzz.js 20` generates seeded random
   adversarial matches; failures save scenario + journal for exact replay.

### What the harness caught on day one (all fixed)

1. **`buy "constructor"` crashed the server** — prototype-chain lookup in the
   shop; any player could kill the whole game with one packet.
2. **`GET /%` crashed the server** — `decodeURIComponent` throwing on a
   malformed URL took down the process (this one could genuinely have been
   your freeze if anything on your network probed the port).
3. **Pacifist stalemate** — the arena floor held at radius 10 forever, so a
   round could literally never end if the last players refused to fight (two
   scripted cowards proved it: 400+ seconds, zero deaths). Fixed with **sudden
   death**: after 45 s of overtime the arena shrinks to *zero* over 30 s.
   Every round now provably ends — there's a unit test asserting it.
4. **Instant anticlimax round** — someone who disconnected during the
   countdown and rejoined was seated as dead, so the round started with one
   fighter and ended in 0.03 s. New rule: joining during the countdown seats
   you straight into the starting round; only mid-battle joins wait.
5. Several harness/infra bugs (watchdog false positives, lost crash dumps,
   journal event ordering).

Test suite now: **39 unit tests**, 4 scripted scenarios (duel, chaos,
mechanics, remi-freeze), a 2-engine browser robustness test (Chromium +
WebKit: 95 s of play, server SIGKILL mid-battle, reconnect), fuzz batches —
30 consecutive clean fuzzed matches after the fixes.

### Economy change you asked for

Starting gold **8 → 12**, tier-1 prices flattened (Lightning/Boomerang 10,
Teleport/Shield/Rush 12). Round 1 now opens with real choices: any second
spell, an item (Boots 10 / Treads 10 / Ring 10 / Amulet 12 / Cape 12), or
Fireball lv2 + 6 saved. Kept lobby shopping enabled.

### Still worth discussing

- Sudden-death timings (45 s grace + 30 s collapse) are my guess — tune in
  `shared/constants.js` → `ARENA`.
- Reconnecting mid-game gives you a fresh identity (you lose your gold/score).
  Persistent identity across reconnects (a token in localStorage) is the next
  robustness step if that annoys you.
- Bots still don't dodge; they're food. Say the word and I'll give them
  projectile evasion.

## TL;DR

- **A playable Warlock remake exists in `~/warlock-web`.** `npm start` to play
  locally (add bots from the lobby), `npm run host` to get a public URL your
  friends anywhere can open. Verified end-to-end: unit tests, two real
  WebSocket clients playing a round over the actual server, headless-browser
  screenshots, and an HTTP+WebSocket check through a real Cloudflare tunnel.
- **Your MOBA idea is technically sound.** Browser tech is not the bottleneck;
  netcode discipline and community/legal hygiene are the two things to get
  right from day one. Details below.

---

## Part 1 — Your technical questions about the open web MOBA

### Is a web-based MOBA feasible?

Yes, comfortably. A MOBA is close to a best case for the browser:

- **Rendering**: 10 champions + ~60 minions + projectiles is trivial for
  WebGL/WebGPU (PixiJS, Three.js, or plain canvas for a 2D art style). LoL
  itself is not graphically demanding; the browser can do that fidelity.
- **Simulation**: a MOBA tick is small — dozens of units, simple physics,
  no rigid-body stacking. A single JS process handles this at 30 Hz with ease
  (our Warlock sim steps a full 4-player game thousands of times per second
  in the test suite).
- **Input latency**: MOBAs are click-to-move with cast points and travel
  times, which is *far* more latency-tolerant than a shooter. 60–120 ms feels
  fine, which is what you'll get browser→host over WebSocket.
- **Distribution is the superpower**: "click a link, you're in the game" is
  something Riot cannot offer. For a community-modded game it also means
  every fork/house-rule server is equally frictionless to try.

The genuinely hard parts are not web-specific: pathfinding quality (crowd
flow, unit avoidance), fog of war done server-side (see cheating, below),
balance, and art volume. Those are person-years of design work, not
technology risk. That's exactly why starting with Warlock was the right call:
it shares the netcode DNA (authoritative server, projectiles, knockback,
economy) with ~1% of the content surface.

### Player-hosted servers, no central infrastructure — does it work?

Yes, with eyes open about the trade-offs:

- **The host is authoritative** (what I built): the host's machine decides
  every hit. This kills client-side cheating (aimbots aside) for everyone
  *except the host*, who can in principle run a modified server. In friendly/
  community play that's fine — same trust model as a WC3 host or a Minecraft
  server. Competitive integrity beyond that needs trusted community servers,
  not P2P tricks.
- **NAT is the real enemy** of "host at home". I solved it with tunnels
  (Cloudflare quick tunnel → free `https://…trycloudflare.com` URL, zero
  config, WebSockets pass through; localtunnel as fallback). It adds one
  relay hop (~10–50 ms). Alternatives worth knowing: Tailscale (great with
  friends, needs install), port forwarding (best latency, most hassle),
  WebRTC with ICE/STUN (true P2P, punches most NATs, but needs a public
  signaling server *somewhere* and much more code).
- **Host advantage**: the host plays at 0 ms ping. In Warlock-class games
  nobody will care; in a serious MOBA ladder it matters — the eventual answer
  is community-run dedicated servers (a $5 VPS runs this fine), which the
  same codebase already supports since the server is just `node server/index.js`.
- **Fog of war caveat for the MOBA**: an authoritative server must send each
  client only what it can see, otherwise map-hack cheats are trivial.
  Per-client interest filtering has to be in the snapshot layer from early on.
  (Warlock has no fog, so our snapshots are global — fine here.)

### WebSocket vs WebRTC

I used WebSocket (TCP). Rationale: 10× simpler, works through tunnels and
proxies, and for a 10-player arena the head-of-line-blocking risk only shows
up on lossy Wi-Fi. The client hides jitter by rendering ~130 ms in the past
and interpolating. For the MOBA I'd still *start* WebSocket and add WebRTC
unreliable datagrams (or WebTransport) later as an optimization — the
architecture (inputs up, snapshots down) doesn't change.

### Copyright — how close can "heavily inspired by LoL" be?

Game *rules and mechanics are not copyrightable* — last-hitting, three lanes,
towers, items, cooldowns, a shrinking arena: all free to reimplement. What
you must not copy:

- **Expression**: champion names, splash/skill art, models, sounds, voice
  lines, item names *as a set*, map art, lore text. (Riot sued Moonton over
  Mobile Legends and won a lot of money — that case was about copied names,
  icons, and marketing art, not about the genre.)
- **Trademarks**: don't put "League of Legends" in your name or marketing
  ("a LoL clone!") beyond factual comparison.
- **A near-1:1 stat clone** of a specific champion kit with a soundalike name
  is where "inspired" drifts into trouble. Change names, art, numbers, and
  flavor; keep the *feel*.

Warlock itself is a game concept from a community map; I reimplemented rules
from scratch with my own numbers, original text, no WC3 assets, and credited
the inspiration in the README. That's the pattern I'd keep for the MOBA
(think: how Dota→LoL→HoN→Smite all share mechanics legally).

One more thing for an open project: pick licenses early — **code under MIT or
AGPL** (AGPL forces server-side forks to stay open, worth considering given
your "anyone hosts, rules stay open" philosophy) and **art/design under
CC-BY-SA** so skins/champions contributed by the community stay remixable.
Require DCO or CLA-lite sign-off so you can never be held hostage by a
contributor later.

### Minion collision & elevation — your design instincts

I agree with both, and they're conveniently also *cheaper* to implement:

- **Minion collision**: soft collision (units can push through each other
  slowly, RTS-crowd style) or none at all removes LoL's most frustrating
  "stuck on my own wave" deaths, AND it makes server pathfinding nearly
  trivial. Dota-style turn rates + hard collision is a whole pathfinding
  research project; skip it. In Warlock Web, warlocks have **no body-block
  collision** — only physics knockback — and it feels right.
- **Elevation**: LoL's elevation is almost purely visual plus a vision rule.
  You can keep the *strategic* part (high ground grants vision, maybe
  accuracy) on a completely flat simulation plane — elevation becomes a
  property of a tile, not 3D geometry. Counterintuitive stacked-cliff visuals
  gone, one less source of "why did my skillshot do that".

### "AI agents improving the game" — how to make that real

This shaped several code decisions in Warlock Web, and I'd triple down for
the MOBA:

- **All balance numbers in one plain data file** (`shared/constants.js`).
  An agent (or a human) can change a cooldown without touching logic.
- **Pure, deterministic simulation** with no I/O and a seeded RNG
  (`shared/sim.js`) — agents can run thousands of headless games to test a
  balance change and report win-rate deltas. The test suite already plays
  full bot games; that's the seed of an automated balance pipeline.
- **Tests as the contract**: 29 unit tests + an integration test that plays a
  real game over a real socket. Agents can refactor confidently; CI catches
  regressions the way a human reviewer never would.
- For the MOBA: champions/spells as *data + small scripts* (the WC3/Dota
  lesson — Dota existed because WC3 made rules moddable). If a champion is a
  JSON file plus a handful of behavior functions, community members and their
  agents can PR new champions, and "house rules" become a diff you can share.

### House rules / skins / custom champions distribution

Since the host's server is authoritative, **the host's rule-set simply *is*
the game** — that's your "push your rules, people choose to play them" model
with zero extra infrastructure: fork, edit constants, `npm run host`, share
URL. Skins are client-side only and could be a URL parameter. Later, a tiny
"rules manifest" (JSON hash shown in the lobby) lets players see exactly
what mods a host is running before they ready up.

---

## Part 2 — What I built and the calls I made

### What exists (all verified)

- Full game loop: lobby (ready-up, bots) → countdown → battle → shop →
  … → game over → back to lobby. Score 10 (or 15 rounds) ends the game.
- Physics knockback, shrinking lava ring (75 s to minimum), afterburn,
  lava-kill credit to the last hitter within 5 s.
- 6 spells (Fireball, Lightning, Boomerang, Teleport, Shield/reflect, Rush)
  with levels, 6 passive items, gold economy (4/kill, 3/round, 3/round-win,
  1 consolation for first death).
- Server-side bots that fight (aim with target-leading + error) and spend
  gold in the shop — so you can play alone tonight.
- Canvas client: animated lava, molten rim, interpolated movement, damage
  numbers, spell bar with cooldowns, scoreboard, shop UI, spectate-on-death.
- `npm run host` → working public URL (tested through a real tunnel,
  including the WebSocket path).

### Decisions you might want to revisit (my honest list)

1. **Numbers are mine, not the original's.** The original Warlock's exact
   stats aren't published anywhere I could find (warlockbrawl.com's handbook
   is an index without values), so I designed my own around "fireball TTK
   ≈ 7–10 hits, lava is the real killer". Balance is *untested against
   humans*. Everything is in `shared/constants.js` — tune freely.
2. **No client-side prediction.** Your own movement reacts after one RTT
   (~30–100 ms). For this genre I judged it acceptable (WC3 was the same or
   worse). If it bothers you in play, the fix is predicting *only your own
   warlock's* movement locally — a contained change, sim is already shared.
3. **JSON snapshots, full state, 15 Hz.** ~2–6 KB/snap for 4 players. Fine
   for ≤10 players; a binary delta protocol would be v2 polish, not needed now.
4. **One game per server process.** Warlock-style: the URL *is* the room.
   Multiple rooms per process would be easy to add but complicates the UX
   promise ("this link is my game").
5. **Shopping is allowed in the lobby** with your 8 starting gold (design doc
   said "after round 1"; I kept lobby shopping because it's fun to open with
   a plan). May be a balance mistake — first-round Fireball lv2 is strong.
6. **Knockback model**: impulse + exponential friction, and knockback doesn't
   interrupt your move order. Original Warlock feels more "icy". If it feels
   too controllable, lower `PLAYER.FRICTION` (4 → 2.5) for more slide.
7. **Shield reflects toward the projectile's reverse direction** (not toward
   the original caster), and doesn't reflect Lightning (hitscan) — it just
   blocks it. Simpler; arguably less spectacular.
8. **Host advantage accepted** (0-ping host). See Part 1.
9. **Bots are simple** (kite-less fireball spam with aim error). Good enough
   to test and warm a lobby, not a challenge for you.
10. **No sound.** Biggest missing juice item, plain scope cut.

### Known rough edges

- Late joiners during a running game sit dead until the next round starts —
  intended, but there's no "you'll play next round" message yet.
- If the host laptop sleeps, the game freezes for everyone (obviously).
- Mobile: renders, but there are no touch controls — desktop only for now.
- The trycloudflare URL changes every time you restart `npm run host`.

### Suggested next steps (in the order I'd do them)

1. Play a real game with friends; tune `constants.js` from actual feel.
2. Sound effects (even 5 retro bleeps transform game feel).
3. Own-movement client prediction if latency annoys you.
4. Wind Walk + one AoE spell (Meteor) — the two most-missed archetypes from
   the original roster.
5. Obstacles/arena variants, then team mode.
6. Then have the "is this the seed of the MOBA or a separate repo?" talk.

### How the verification was done (evidence, not vibes)

- `npm test` — 29 sim tests, including a scripted full bot game to game-over.
- `npm run test:e2e` — real server + 2 WebSocket clients: join, ready,
  countdown, battle, damage, kill credit, exact expected gold (18), shop
  purchase, disconnect handling. Passes.
- `npm run test:visual` — headless Chromium drives the actual UI (join click,
  lobby buy, ready, casts) and fails on any page error. Screenshots reviewed.
- Public-internet path: started `npm run host`, fetched the page over the
  `trycloudflare.com` URL (HTTP 200) and completed a WebSocket join through
  it ("joined as c1").
- One real bug was found *by* the integration test and fixed: point-blank
  fireballs spawned past their target and never hit; projectiles now spawn at
  the caster and use swept-segment collision (test `git log` for the story).
