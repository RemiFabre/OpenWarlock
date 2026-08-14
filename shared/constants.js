// Shared game constants, imported by server, client, and tests.
// Units: 1 unit ≈ 10 px at zoom 1. Times in seconds. Damage in HP.

export const TICK_RATE = 30;          // server simulation Hz
export const SNAPSHOT_RATE = 15;      // snapshots sent to clients Hz

export const ARENA = {
  START_RADIUS: 56,       // the 5-player arena (see SCALE_ANCHOR_PLAYERS)
  MIN_RADIUS: 10,
  // Round 21.2 (Remi): play AREA PER PLAYER is constant above the anchor;
  // radius = START_RADIUS * sqrt(n / ANCHOR) for n > ANCHOR, unchanged below
  // (a 3-player game keeps the 5-player floor). n = seats at game start
  // (humans + bots, interpretation), frozen for the whole game: a late joiner
  // never resizes a live arena. Set ANCHOR huge = revert to a fixed arena.
  SCALE_ANCHOR_PLAYERS: 5,
  // Round 18 (Remi): 4 portals out in the lava. Fixed positions (diagonals, a
  // bit beyond the starting rim), versus only; the swim there is priced in
  // lava HP. Round 24.1 (Remi): the exact-center exit was a mine magnet (one
  // mine at 0,0 punished every arrival), so each portal now has its OWN exit:
  // on the portal->center line, EXIT_DIST past the center (a bit more than a
  // player diameter, and beyond a center mine's trigger ring + body). The
  // four exits form a cross, marked on the floor by the client.
  // Remi (same day): 2.5 landed too bunched; doubled to 5.
  PORTALS: { COUNT: 4, DIST_FRAC: 1.25, RADIUS: 2.2, ANGLE: Math.PI / 4,
             EXIT_DIST: 5 },
  // TEST flag (round 16): the ring shrinks continuously START→0 so the whole
  // arena becomes lava; MIN_RADIUS/OVERTIME_* bypassed. false = classic
  // hold-then-sudden-death, untouched.
  // ⚠ VERSUS ONLY since round 16 (the co-op campaign is exempt; guard in shared/sim.js).
  // history: docs/history/2026-08-08-constants-sweeps.md#arena-never_stops
  NEVER_STOPS: true,
  // "30% slower" is read as the shrink RATE, not the duration (voice-dictated,
  // stating the interpretation per the AGENTS.md convention). Old: 46 units in
  // 65 s = 0.708 u/s. New: 0.708 × 0.7 = 0.496 u/s, and the journey is now the
  // full 56 units rather than 46, so 56 / 0.496 ≈ 113 s.
  // While NEVER_STOPS is true this is the time from START to ZERO; when false it
  // is the old "START to MIN" and you want 65 back.
  SHRINK_TIME: 113,
  // Co-op keeps the classic hold-then-sudden-death ring (NEVER_STOPS is versus
  // only, round 16) and its whole campaign was priced at the old 65 s
  // START→MIN journey; this is that number, read only by the co-op branch in
  // stepBattle. Measured: with the slowed 113 s ring the mid-campaign drifted
  // 5-15 points easier (L8 68/66/57 → 81/82/81); with 65 the curve is back.
  COOP_SHRINK_TIME: 65,
  // the shrink RATE scales with deaths: rate *= 1 + ADAPT * (1 - alive/total)
  // (4 fighters, 2 dead -> 1.75x faster) so small fights don't wait on a big arena
  SHRINK_ADAPT: 1.5,
  OVERTIME_GRACE: 45,     // seconds the arena holds at MIN_RADIUS...
  OVERTIME_SHRINK: 30,    // ...then shrinks to 0 over this, so every round ends
  SPAWN_RADIUS_FRAC: 0.6, // players spawn on this fraction of start radius
  // obsidian pillars on a fixed ring near the rim: cover vs projectiles and
  // knockback-stoppers. RING is written for the 5-player arena and rides the
  // arena scale; since round 21.2 lava never sinks a pillar (shared/sim.js)
  PILLARS: {
    COUNT: 6,
    RADIUS: 2.5,
    RING: 40,             // between the spawn ring (33.6) and the start rim (56)
    BASE_ANGLE: Math.PI / 6, // keeps pillars off the axes (spawn/shot lanes)
    JITTER: 0.12,         // per-pillar angle jitter span (radians), from the seed
  },
};

export const PLAYER = {
  RADIUS: 1.4,            // bigger bodies = spells actually connect
  // your body grows with your kill lead (bigger target when winning) and
  // shrinks when trailing: radius = RADIUS * clamp(1 + PER_KILL*(kills-avg))
  SIZE_LEAD: { PER_KILL: 0.08, MIN: 0.5, MAX: 2.0 },
  MAX_HP: 100,
  SPEED: 11,              // u/s (boots-maxed ≈ the old base speed)
  FRICTION: 3.1,          // exponential velocity damping per second (more slide)
  STOP_EPSILON: 0.3,
  // knockback scales with the PERCENT of hp missing (hp/maxHp; amulet HP
  // counts): impulse *= 1 + KB_HP_FACTOR*(1 - hp/maxHp). Full HP = baseline,
  // near-death ≈ 1.55x. Body size plays NO role in knockback (audited
  // 2026-08-04: being big is only ever a disadvantage, easier to hit).
  KB_HP_FACTOR: 0.385, // was 0.8, then 0.55; −30% again 2026-08-05 (low-HP launches still too wild)
  // 2026-08-07 (Remi, round 12): TEST constant knockback without deleting the
  // mechanic. When set, the formula above is fed this fixed "fraction of HP
  // missing" instead of the real one, so everyone is knocked as if permanently
  // at 70% HP. Set to null to restore true HP-scaled knockback; that one line
  // is the whole revert, deliberately.
  KB_CONSTANT_MISSING: 0.30,
  // Round 17 (Remi): passive regen REMOVED. HP resets every round anyway,
  // and within a round regen mostly fed stalemates (which we then paid MORE
  // complexity to suppress, via the lock). Measured at removal: round-1 first
  // death 34.8 s (unchanged), venom −20 pts (its regen-denial premium became
  // universal), midfield healthier. Revert = 1.2 + restore the Ring.
  REGEN: 0,               // baseline hp/s (the Ring of Regeneration left with it)
  // Regen lock (2026-08-06): taking damage throttles regen for a moment.
  // Diagnosis behind it: a lv1 fireball is 5 dmg / 2.1 s = 2.38 dps if EVERY
  // shot lands, against 1.2 hp/s of passive regen, so two players trading lv1
  // fireballs literally could not kill each other. Round 1 (nobody has
  // upgrades yet) measured a median 51.9 s to the first death vs ~20 s in
  // round 3 (the lava did all the work). This makes landed hits stick.
  // Round 17 §9: the lock is a FULL STOP now; "taking damage pauses your
  // regen for 2 s" is one human sentence (×0.25-for-2.5 s was near-identical
  // value and unexplainable). Applies to lava damage too, on purpose.
  // ⚠ Re-check the round-1 first-death median (~31 s); that number is WHY
  // the lock exists.
  // ⚠ INERT while REGEN is 0 and nothing grants regen; kept as the one-line
  // revert path for the whole regen system
  REGEN_LOCK: 2.0,        // seconds of paused regen after taking damage
  REGEN_LOCK_MULT: 0,     // regen multiplier while the lock is up (full stop)
};

export const LAVA = {
  DPS: 16,          // hp/s while swimming (Remi round 23: 14 felt too cheap, +~15%)
  // you move FASTER in lava, not slower: dipping through the lava is a real
  // play (dodge route, flank), the DPS is the price of admission.
  // 2026-08-05: 1.3 → 2.0. At 1.3 a swimmer was still a sitting duck;
  // at 2x you can genuinely dodge while burning
  SPEED_MULT: 2.0,
};

export const ROUND = {
  COUNTDOWN: 3,
  SUMMARY_TIME: 3.5,      // victory/defeat banner between battle and shop
  SHOP_TIME: 25,
  // First to this many kills wins. Round 21.3: a TEAM wins at KILLS_TO_WIN x
  // its size, so the per-player average is always this number and a lobby of
  // solo teams is exactly the old rule.
  KILLS_TO_WIN: 15,
  MAX_ROUNDS: 25,         // safety cap: best kills-per-member wins if nobody gets there
  // Co-op campaign retry budget: 10 levels in this many rounds (3 spares).
  // Measured 2026-08-06 (tools/coop.js): 14 is a formality, 12 locks solo out.
  // history: docs/history/2026-08-08-constants-sweeps.md#round-coop_max_rounds
  COOP_MAX_ROUNDS: 13,
  // ⚠ INERT since round 21.8 (Remi): there is NO time limit on kill credit any
  // more: the last player who damaged you owns your death, however long the
  // swim takes (`lastHitBy` is wiped every round start, so it can never reach
  // across rounds). Kept as the one-line revert path: put the comparison back in
  // kill() and in applyDamage's lava branch, both in shared/sim.js.
  KILL_CREDIT_WINDOW: 5,  // seconds, unused; the revert path
  // kill this fast after your last one and it's a DOUBLE KILL (then triple…)
  MULTIKILL_WINDOW: 6,
};

// Versus TEAMS (round 21.3, Remi): a LOBBY PROPERTY, never a mode. Every player
// owns a team number and the default is their own unique one, so a lobby where
// nobody touches the selector is bit-for-bit the old free-for-all. Any shape
// works (2v1v1, 3v2). MAX is only the number selector's ceiling; you can never
// need more numbers than seats.
// TINTS is UI only (the number is the truth; the hue just finds your side fast).
export const TEAMS = {
  MAX: 10,
  TINTS: ['#e8b23a', '#5fa8e8', '#7ad07a', '#e0787a', '#b98be0',
    '#e0a86a', '#6fd3c9', '#d47ab8', '#9aa4b0', '#c8d06a'],
};
export const teamTint = (t) => TEAMS.TINTS[(Math.max(1, +t || 1) - 1) % TEAMS.TINTS.length];

// Multi-kill names, indexed by streak-2 (streak 2 = 'Double Kill').
export const MULTIKILL_NAMES = [
  'Double Kill', 'Triple Kill', 'Quadra Kill', 'Penta Kill', 'MASSACRE',
];

// Anti-snowball economy: keep ROUND_BASE >= 3*PER_KILL + ROUND_WIN so the player
// with EVERY kill never out-earns a kill-less one by more than 2x (bounties
// can't break the cap; the leader never collects one).
// history: docs/history/2026-08-08-constants-sweeps.md#gold
// Human avatar roster (round 22.1, Remi: bigger and cooler than the old 12).
// SHARED because the engine assigns a random FREE one to a joiner who did not
// pick, and refuses duplicates (one face per warlock in a lobby). The old 12
// are all still here, so every saved owAvatar keeps working.
// The Golden Pillar (round 24, Remi: "The Gathering has the pillar, add the
// golden pillar too"). The VALUE carries a sparkle so an untranslated site
// still shows something sensible; every real render site swaps it for NOPE's
// gold-tinted moai (avatarHtml/.goldicon in HTML, ctx.filter on canvas).
export const AVATAR_GOLD = '🗿✨';
export const AVATARS = [
  '🧙', '🧙‍♀️', '🧝', '🧛', '🧞‍♂️', '🧜‍♀️', '🥷', '🦹', '🧚', '🧟',
  '💀', '☠️', '👻', '🎃', '👹', '👺', '😈', '👿', '🤡', '🗿', AVATAR_GOLD,
  '🤖', '👽', '🐉', '🐲', '🦂', '🐍', '🦇', '🦉', '🦅', '🦊',
  '🐺', '🐗', '🦈', '🐊', '🦖', '🦍', '🐙', '🕷️', '🐢', '🐸',
  '⚡', '🔥', '❄️', '🌪️', '☄️', '🌑', '🔮', '🧿', '🎭', '👁️',
  '⚔️', '🛡️', '🏹', '🪓', '🥶', '😱',
];

export const GOLD = {
  START: 12,
  PER_KILL: 2,
  ROUND_BASE: 8,   // = 3*PER_KILL + ROUND_WIN: sits exactly on the 2x cap
  ROUND_WIN: 2,
  FIRST_DEATH: 1,
  // Bounty: killing someone AHEAD of you on kills pays extra, scaled by the
  // kill gap: #2 sniping #1 earns little (the snowball would just move),
  // the last player toppling the leader is an event. Always modest.
  BOUNTY_PER_GAP: 0.5,  // gold per kill of gap, floored
  BOUNTY_MAX: 3,
};

// ---- Spells -------------------------------------------------------------
// costs[i] = cost to reach level i+1 (level 0 = not owned)
// Round 21.1 PRICING RULE (Remi): a spell's BASE is one of exactly three tiers
// (8 cheap / 10 medium / 12 expensive) and EVERY upgrade level costs half its
// base (4 / 5 / 6). Fireball is exempt (base 0: locked at lv1 in elemental).
// Old prices: git.
export const SPELLS = {
  fireball: {
    // 2026-08-08 (Remi, round 16): in ELEMENTAL mode the fireball NEVER levels
    // (buy() locks it at lv1 there), because a fireball level bought damage AND
    // push AND cadence in one purchase (OP and unreadable). The elements are
    // its progression now, one axis each: ember=damage, gale=push,
    // arcane=cadence, terra=size, ghost=speed. Classic keeps these levels.
    name: 'Fireball', hotkey: 'Q', maxLevel: 3, costs: [0, 8, 8],
    // lv1 spam was too strong (2026-08-03): ~30% slower at lv1, upgrades
    // buy the old cadence back
    // lv1 damage 5 → 7 (2026-08-06): at 5 a lv1 fireball could not out-damage
    // passive regen, which is what made round 1 a 52-second stalemate
    // Round 22.5 (Remi): NOT infinite anymore. You must step toward the
    // danger to play; no spamming from across the arena. 50 = the 5-player
    // spawn-neighbor distance (2 x 56 x 0.6 x sin(36) = 39.5) + ~27%, inside
    // his "+20-50%" bracket: the opening shot on your neighbor still lands.
    // Distance-based (pr.traveled), so ghost speed does not extend it, and a
    // reflected ball starts a fresh 50 (traveled resets, round 21.0 ruling).
    cooldown: [2.1, 1.85, 1.6], speed: 41, radius: 0.8, range: 50,
    damage: [7, 10, 14], knockback: [65, 70, 76],
    desc: 'Your bread and butter: a medium projectile with strong knockback.',
  },
  lightning: {
    // Round 17 (docs/ROUND17.md §2): hitscan → telegraphed sky-bolt. Mark a
    // spot in range; the zone shows INSTANTLY, the bolt lands `delay` later.
    // Damage and knockback fall linearly to HALF at the zone edge; knockback
    // is RADIAL from the zone center. Falls from the SKY: pillars and mirror
    // walls never block it: the anti-cover tool, by design.
    // ⚠ delay and radius NEVER change with level (Remi's ruler: a human with
    // boots must escape a bolt centered on them; never balance the dodge
    // window against bots). Damage/kb/cd are FIRST TRY, provisional until
    // Session C's bot support makes them measurable.
    name: 'Lightning', hotkey: 'W', maxLevel: 3, costs: [10, 5, 5],
    cooldown: [6, 5.5, 5], range: Infinity, radius: 2.2, delay: 0.5,
    damage: [12, 15, 18], knockback: [70, 78, 86],
    desc: 'Mark a spot, the bolt strikes it. No pillar or wall can shield it.',
  },
  boomerang: {
    // 2026-08-06 rework (Remi: "nobody ever plays it, make it exciting"):
    // fireball-grade reach, and YOU choose the turn point: tapping the key
    // again while it flies recalls it early. It still returns to the LAUNCH
    // POINT, so catching it (halving the cooldown) is a real read.
    // outDistance is now a ceiling, not a plan.
    // Round 19.4 (Remi): the ceiling is GONE. Throw as far as you like, the
    // recall tap is the turn control (was outDistance 52).
    name: 'Boomerang', hotkey: 'R', maxLevel: 3, costs: [10, 5, 5],
    cooldown: 5.5, speed: 31, radius: 1.4, outDistance: Infinity,
    damage: [4, 6, 8], knockback: [50, 59, 68],
    desc: 'Tap again to recall it early; catch it to halve the cooldown.',
  },
  teleport: {
    // round 18.1 (Remi): cheaper, FLAT range; lv2 buys cooldown only.
    // Round 19.1: [8,6] was too cheap on his read ("let's try 10, 8").
    // ⚠ Round 21.1: base stays 10 (his 19.1 call), upgrade → half base = 5.
    // Revert path: costs [12, 8], range [18, 26].
    name: 'Blink', hotkey: 'F', maxLevel: 2, costs: [10, 5],
    cooldown: [16, 12], range: [22, 22],
    desc: 'Blink to your cursor. Your momentum is cancelled.',
  },
  shield: {
    name: 'Shield', hotkey: 'D', maxLevel: 2, costs: [12, 6],
    cooldown: [15, 12], duration: 1.25,
    desc: 'Reflects projectiles back at their owner.',
    // round 21.0 (Remi): say what it does NOT stop. Energy = anything that
    // flies as a projectile (fireball, boomerang, Switcheroo) plus the bolt and
    // a Repulse blast; the physical drops (Meteor, Bomb) land through it.
    long: 'Reflects energy projectiles (fireballs, boomerangs, Switcheroo) back at their owner, and holds a Lightning bolt or a Repulse blast; physical impacts (Meteor, Bomb) go straight through it.',
  },
  debt: {
    // Blood Debt (issue #1): Shield's cost/cooldown family. While `duration`
    // runs, ALL damage and push become gray health (debtDamage). A fireball
    // hit within `repay` s dumps it on the victim; otherwise the caster takes
    // it, push-less. lv2 buys cooldown; duration and repay never level.
    name: 'Blood Debt', hotkey: 'Y', maxLevel: 2, costs: [12, 6],
    cooldown: [15, 12], duration: 1.25, repay: 5,
    desc: 'Absorb, then transfer.',
    long: 'For a moment, all damage and push become gray health. Hit an enemy with a fireball within 5 seconds to give them the stored damage; otherwise you take it yourself, without pushback.',
  },
  rush: {
    name: 'Rush', hotkey: 'E', maxLevel: 2, costs: [10, 5],
    cooldown: [10, 8], distance: 16, speed: 60, hitRadius: 1.6,
    damage: [5, 8], knockback: [79, 79],
    desc: 'Dash through enemies: damage and knockback on the way. Casting cancels your momentum.',
  },
  pillar: {
    // Round 21.1 (Remi): the pillar is the CHEAP tier now.
    name: 'Stone Pillar', hotkey: 'S', maxLevel: 2, costs: [8, 4],
    // Round 21.2 (Remi): pillars are PERMANENT; `duration` is inert (kept as
    // the revert path, see the cast in shared/sim.js), so lv2 buys cooldown.
    cooldown: [14, 11], range: Infinity, radius: 2.2, duration: [10, 16],
    desc: 'Raise a permanent obsidian pillar: it blocks projectiles, bodies and knockback.',
  },
  statue: {
    // Round 21.4 (Remi, voice; final design): cast on yourself, instantly
    // become a GOLDEN STONE PILLAR. For `duration` s you cannot move, cast or
    // be moved (knockback immune, portals included), you take ZERO damage from
    // EVERYTHING (spells, zones, lava, DoT) and nothing applies to you (frost,
    // malady, anger, gale). Your body BLOCKS projectiles like a real pillar:
    // they explode ON you for nothing, a Switcheroo bolt fizzles instead of
    // trading, and terra lv3 does NOT smash you. The downside is entirely
    // positional: you are rooted and telegraphed, so the enemy pre-places
    // artillery and zones on your exit.
    // ⚠ The duration NEVER levels (Remi): lv2 buys cooldown only, like Blink.
    // Name (round 21.7, Remi's pick): DISPLAY is 'NOPE'; the internal key stays
    // `statue` everywhere (code, tests, logs), exactly like mosquito/Echo.
    // Its icon is the pillar's 🗿 tinted GOLD in the client (client/main.js
    // ICONS + .goldicon), so the shop reads "grey pillar / gold pillar".
    name: 'NOPE', hotkey: 'A', maxLevel: 2, costs: [10, 5],
    cooldown: [16, 12], duration: 2,
    desc: 'Become an invincible statue.',
    long: 'For 2 seconds you turn to solid gold: nothing damages you and nothing can push you, and your body blocks balls like a pillar, but you cannot move or cast.',
  },
  firewalk: {
    // Round 22 (Remi): active self-buff; ZERO lava damage while it runs.
    // Only the lava tick reads the timer; the ×2 lava swim SPEED stays, so it
    // buys crossings and rim escapes, not a new home. lv2 buys duration; the
    // cooldown never levels. Price matches Blink/Mine. Public on the wire as
    // `fw` (client draws a flame ring); chasing them in must be an informed
    // mistake. Default key h (free in both layouts; loadKeys de-conflicts).
    name: 'Fire Walk', hotkey: 'H', maxLevel: 2, costs: [10, 5],
    cooldown: 15, duration: [3, 5],
    desc: 'Walk on lava.',
    // Remi (24.2 polish): one sentence only; short shop text is the house style.
    long: 'For a few seconds lava deals you no damage at all.',
  },
  // ---- power tier: expensive but fight-ending, buyable from the first shop --
  // ⚠ BOTS PILOT NONE OF THESE **except meteor** (round 20: CC-gated cast, see
  // BOT_CC_CAST + PILOTED_POWER in shared/sim.js). For the rest, omission from
  // every BUILDS/BOT_BUILDS order list IS the gate, and it is load-bearing
  // (AGENTS.md debt #2). history: docs/history/2026-08-08-constants-sweeps.md#spells-power-tier
  genki: {
    // Issue #12 + Remi's rework (2026-08-13). Two presses: charge above your
    // head (3 dmg/s flat, capped at dmgCap[level]; area grows linearly so
    // radius = radius * sqrt(t/calibT), 1.3x the issue-branch ball), then fire
    // at the cursor. smashR = a Terra-3 ball: stage 1 smashes pillars and flies
    // on; unstoppableAfter s later stage 2 ignores shields and mirror walls.
    name: 'Genki', hotkey: 'K', tier: 'power', maxLevel: 3, costs: [12, 6, 6],
    cooldown: 4, speed: 41, radius: 0.8 * 1.3, range: Infinity,
    kbBase: 65,   // push starts at a fireball's and grows +3/s with the charge
    dmgPerSec: 3, calibT: 2.5, dmgCap: [30, 60, 90],
    smashR: 0.8 * 1.65, unstoppableAfter: 5,
    desc: 'Charge one omega ball.',
    long: 'Press to charge a ball above your head, press again to fire it: it gains 3 damage per second up to the level cap (30/60/90) and keeps growing until then; at Terra-3 size it smashes pillars and flies on, and 5 seconds later nothing reflects it. You move and cast freely while it charges, but a direct hit ends the charge AND adds the stored damage to that hit (lava, burns and sickness never do).',
  },
  meteor: {
    // Round 21.1: 14 was off the tier ladder; expensive tier is 12.
    name: 'Meteor', hotkey: 'T', tier: 'power', maxLevel: 2, costs: [12, 6],
    cooldown: [15, 13], range: Infinity, delay: 1.25, radius: 6,
    // Round 21.8 (Remi): lv2 24 → 30; the upgrade was not worth its 6 g.
    damage: [16, 30], knockback: [110, 130],
    // Round 24.1 (Remi, from Ju's hole idea but WALKABLE): the impact breaks
    // the ground into a permanent lava pool of craterR. It is real lava
    // (LAVA.DPS, treads, Fire Walk, swim speed), not a hazard with an owner.
    craterR: [3, 4],
    desc: 'Mark a spot, a rock falls on it: heavy damage, a radial blast, and the ground breaks into lava.',
  },
  nova: {
    // Round 21.8 REWORK (Remi, voice; the Bomb was "unsatisfying: not much
    // damage, not easy to hit, no push"): the artillery orb is gone, this is a
    // MINE. Internal key stays `nova` (logs, tests, roster), display is Mine.
    //  - Cast plants it AT YOUR FEET, instantly (⚠ interpretation of "you press
    //    the button, it just creates a trap where you are"; the aim is
    //    ignored. Revert to a placed trap = clamp to a `range` like meteor).
    //  - `radius` is the trigger ring: 1.65 × the fireball's own radius, his
    //    number. Enemies only; a teammate, the owner and a statue never set it
    //    off. It waits out the round, is visible to everyone, single use.
    //  - CHARGING is the whole spell: your OWN fireballs are swallowed by your
    //    own mine (up to `stores` of them, level-many) and wait inside it. So
    //    shooting past your own trap costs you the shot; that is the setup.
    //  - On trigger: mine damage, then every stored ball fires at the victim
    //    `ballDelay` apart (ONE tick: "as fast as possible without being the
    //    same tick"; you must SEE two balls). Echo's rule handles the push:
    //    every ball but the last carries no knockback, so nobody is shoved out
    //    of their twin's path, and the LAST one pushes at
    //    max(its own push, the mine's), never the sum (Remi: sums get silly).
    //    A loaded mine's own push is therefore folded into that ball.
    // ⚠ The victim can answer with a Shield: the stored balls are REAL
    //    projectiles, so they reflect, but the mine's own damage still lands
    //    (it is the ground, not a projectile). Remi's ruling, test-locked.
    // ⚠ A TRAP OUTLIVES ITS TRAPPER (Remi's ruling, test-locked): a mine keeps
    //    arming, triggering and CREDITING after the planter dies: the kill, the
    //    bounty, the damage column and every on-hit rider the stored balls carry
    //    are all still theirs. Only effects that need a living body are skipped
    //    (healing, arcane's refund), which the existing `src.alive` guards in
    //    applyDamage already handle. Contrast Decoy, whose clones die with you.
    name: 'Mine', hotkey: 'B', tier: 'power', maxLevel: 2, costs: [10, 5],
    cooldown: [9, 8], radius: 1.32, damage: [10, 15], knockback: 100,
    stores: [1, 2], ballDelay: 1 / TICK_RATE,
    desc: 'Plant a trap. Feed it your own fireballs.',
    long: 'Drops an armed trap where you stand. Your own fireballs are swallowed by it and stored; when an enemy steps on the mine it hits them, and every stored fireball fires into them point blank.',
  },
  swap: {
    // Round 17 (docs/ROUND17.md §3 + Remi live): full position+velocity
    // exchange; 1 dmg stamps the last-hitter (lava credit). Round 18.1: back
    // to 3 levels (they buy range + CDR), bolt sped up 38 -> 50.
    // Revert path (17.2): maxLevel 1, costs [12], cooldown 13, speed 38, range 68.
    // Round 19.2: renamed Switcheroo 🎭 (Remi: fun trickster energy, still
    // legible). His to re-pick; candidates brainstormed in REMI_NOTES.
    name: 'Switcheroo', hotkey: 'G', tier: 'power', maxLevel: 3, costs: [10, 5, 5],
    cooldown: [13, 12, 11], speed: 50, radius: 0.9, range: [40, 55, 70],
    // Round 19.2 (Remi): the VICTIM is stunned after the trade; the combo
    // window ("swap them, then hit them"); the caster stays free.
    // Round 20.5 (Remi's ruling): that window now SCALES with the distance
    // actually swapped, so the attacker ALWAYS has time to land the follow-up.
    // After the trade the two stand exactly the swapped distance apart, so a
    // base fireball needs dist / SPELLS.fireball.speed seconds of flight; `pad`
    // is the human cast-reaction on top, `min` keeps short swaps at the old
    // 1 s feel. Computed at resolution from the REAL positions (sim.js).
    // Round 21.0 (Remi playtested: "the combo is still too hard"): pad
    // 0.35 → 0.55 (+0.2 s of reaction everywhere) and a `max` ceiling so a
    // freak long swap can't hold someone forever. 1.00 / 1.53 / 2.26 / 3.00 s
    // at 10 / 40 / 70 / 120 units swapped.
    // Revert path (round 19.2): drop `stun`, restore `stunT: 1`.
    damage: 1, stun: { pad: 0.55, min: 1, max: 3 },
    desc: 'Hit an enemy to trade places, position and momentum. They wake up stunned. The longer the swap, the longer the stun.',
  },
  repulse: {
    name: 'Repulse', hotkey: 'X', tier: 'power', maxLevel: 2, costs: [12, 6],
    cooldown: [16, 13], charge: 2, radius: [9, 11],
    damage: [8, 12], knockback: [130, 150],
    desc: 'Charge, then blast everyone around you. Blink and Rush still work while charging.',
  },
  wall: {
    // Round 21.1 (Remi): the wall is a 12, not a 14.
    name: 'Mirror Wall', hotkey: 'C', tier: 'power', maxLevel: 2, costs: [12, 6],
    cooldown: [18, 15], range: Infinity, length: [8, 11], duration: 5,
    desc: 'Raise a wall that reflects enemy projectiles back at them. Your own pass through.',
  },
  decoy: {
    // Round 21.6 (Remi, final design): a pure MIRAGE. On cast, `clones` copies
    // of you appear where you stand and live `duration` s. They render exactly
    // like you (body, name, HP bar, team ring; appearance copied at spawn),
    // wander erratically at your move speed, and MIME every cast you make
    // (phantom balls that collide with nothing). Nothing a clone does has any
    // gameplay effect: everything passes through them, they cannot be targeted,
    // damaged or killed, and they never touch a counter, a stack or a stat.
    // ⚠ lv2 buys the SECOND clone, so the cooldown is flat (contrast Statue,
    // where lv2 buys cd); the upgrade is the lie getting harder to read.
    // ⚠ tier 'power': bots cannot pilot a bluff, so the guard keeps them from
    // buying it (they would measure it at the do-nothing floor). Fooling bots
    // is explicitly out of scope (BALANCE.md).
    name: 'Decoy', hotkey: 'Z', tier: 'power', maxLevel: 2, costs: [10, 5],
    // Round 21.8 (Remi): duration 5 → 4 s. Revert is this number.
    cooldown: 16, duration: 4, clones: [1, 2],
    desc: 'A harmless double.',
    long: 'Spawns 4-second mirages of you that wander and ape your casts; they deal nothing, and everything passes straight through them.',
  },
  // Invisibility (round 12): no restrictions on purpose; levels buy DURATION only.
  // ⚠ Non-negotiable: strip it in snapshot() AND mask bot perception, or devtools
  // sees through it / the top bot tier becomes an aimbot (docs/ROUND12.md N4).
  // history: docs/history/2026-08-08-constants-sweeps.md#spells-vanish
  vanish: {
    // round 17 (Remi): 1/2/3 s at a flat 10 g per level (was 0.75/1.5/2.25 at 12+8+8)
    // round 18.1 (Remi): casting anything else REVEALS you (see castSpell)
    // round 21.1: upgrades follow the half-base rule like every other spell.
    name: 'Vanish', hotkey: 'V', maxLevel: 3, costs: [10, 5, 5],
    cooldown: [14, 13, 12], duration: [1, 2, 3],
    desc: 'Invisible for a moment. Casting reveals you, and you can still be hit.',
  },
};

// ---- Items (passive, 3 LEVELS each) ------------------------------------
// mode: 'elemental' = exists only under the elemental ruleset. Hard cap 3
// levels, SAME gold cost per level; the diminishing effect is the brake.
// Values are ABSOLUTE CUMULATIVE totals at that level, never per-level increments.
// Round 20 reprice (Remi's ruling: "buy an item every round even with zero
// kills"): every item is FLAT per level; round 21.1 cut another gold off both
// tiers (Remi: items still measure weak), so cheap 5 g, premium 7 g.
// Revert: boots/treads 10, cape 12, amulet 12, sword 15, hourglass costs [10,8,8].
// history: docs/history/2026-08-08-constants-sweeps.md#items
export const ITEMS = {
  boots:  { name: 'Boots of Speed',       cost: 5, maxLevel: 3, desc: 'Move speed.' },
  treads: { name: 'Lava Treads',          cost: 5, maxLevel: 3, desc: 'Lava resistance.' },
  // Round 17 §9 (ruling: no item may be mandatory by win rate; amulet lv0 sat
  // at 0.2% on the ladder): amulet and ring trimmed, FIRST TRY values.
  // Target: any forbidden-item ladder seat stays ≥ ~15%.
  amulet: { name: 'Health Amulet',     cost: 7, maxLevel: 3, desc: 'Max HP.' },
  // (Ring of Regeneration removed with passive regen, round 17; see PLAYER.REGEN)
  // Round 15 isolation lab: treads buffed to [0.50,0.36,0.28] (real but too
  // small before); value is bounded by lava being ~8.5% of all damage.
  // ⚠ The cape is set on FEEL, never on a lab table: its value flips SIGN by
  // pilot, so the weak Hard-tier number is a bot artifact (BALANCE 15D). Round
  // 21.7 is Remi's hand spec; see ITEM_FX.cape.
  // history: docs/history/2026-08-08-constants-sweeps.md#items-treads-and-cape-round-15
  cape:   { name: 'Cape of the Magi',     cost: 5, maxLevel: 3, desc: 'Knockback resistance.' },
  // Studied 2026-08-07 after Remi's "really really weak" report: lava is only
  // ~8.5% of all damage (hypothesis false) and the sword measured 2nd-strongest
  // item; the weak FEEL was scoreboard vs regen-lock (round 16 added the green
  // "+N hp" popup). ⚠ Bot-measured floor: bots never choose fights lifesteal rewards.
  // history: docs/history/2026-08-08-constants-sweeps.md#items-sword
  sword:  { name: 'Blood Sword',          cost: 7, maxLevel: 3, desc: 'Lifesteal: your damage heals you.' },
  // Round 21.8 (Remi): the sustain item for LOW-damage, wide, utility builds.
  // Lifesteal pays a % of damage, so a gale/frost combo pilot heals nothing off
  // it. This pays a FLAT amount per damaging hit instead, once per victim per
  // hit, so hitting three people pays three times. ⚠ Auras and DoTs are
  // excluded BY DESIGN (malady's ticks, the Hat's burn; they would pay every
  // second for free); that exclusion is in the shop text, not just here.
  // Name: his joke. The slowest murder in history is committed with a spoon.
  spoon:  { name: 'Slow Spoon',           cost: 7, maxLevel: 3, desc: 'Heal on every hit.',
            long: 'Every enemy you damage heals you a flat amount, once per victim per hit: hitting three at once heals three times. Burns and sicknesses heal a tenth of that, at most once a second per enemy.' },
  // (Echo Stone deleted in round 20.1, merged into ELEMENTS.mosquito. Its old
  // spec: `git show 58ba4e7:shared/constants.js`.)
  // 2026-08-08 (Remi, round 16): arcane's old GLOBAL cooldown reduction moved
  // here from the element roster. His reasoning: elements are the FIREBALL's
  // progression now, and a thing that affects ALL spells is thematically an
  // item. Round 20: its element-era `costs` curve dropped, flat 8 g like every
  // other item. (`costs` is still supported by itemCost; elements use it.)
  hourglass: { name: 'Hourglass' /* of Haste: the full name wrapped into the level pips (22.3) */, cost: 7, maxLevel: 3,
            desc: 'Ability Haste: all your cooldowns run faster.' },
  // Round 21.5 (Remi): the first PASSIVE-DAMAGE item; a burning ring around
  // you, 1 dmg/s flat at every level, only the RADIUS levels (ITEM_FX below).
  // `tickEvery` is the cadence of that damage (malady's machinery: discrete
  // bites, never per-frame); the per-tick bite is auraDps × tickEvery, so the
  // spec's "1 per second" stays the single truth. Owner + teammates never burn.
  // Round 21.7 (Remi): renamed Hat of Aura 🎩, 6 g, and the ring is a real
  // threat radius now ([5, 6, 7]; lv1 = malady's lv1 aura). Revert: name
  // 'Coal Brazier' 🪔, cost 7, auraR [3, 3.8, 4.6].
  brazier: { name: 'Hat of Aura', cost: 6, maxLevel: 3, tickEvery: 1,
            desc: 'Burns nearby foes.',
            long: 'Enemies standing inside a ring around you burn for 1 damage per second; the ring grows with the level. Teammates and you never feel it.' },
};

// Price of the next level of `key` when you already own `owned` levels. Flat by
// design (round 12, universal since round 20): every level costs the same, and
// the shrinking effect is the brake. A spec may carry a `costs` array instead
// (no item does today; elements do).
export function itemCost(key, owned = 0) {
  const spec = ITEMS[key];
  if (!spec) return 0;
  if (Array.isArray(spec.costs)) return spec.costs[Math.min(owned, spec.costs.length - 1)];
  return spec.cost;
}

// Per-level effect totals, indexed by level-1. Scalars apply at every level.
// Round 15: vs price-matched controls every item's value RISES with level, but
// levels lose to BREADTH (amulet/sword outliers, BALANCE 15C); flat cost kept.
// ⚠ Boots lv3 re-cut over Remi's hand spec; one-line revert [1.15, 1.27, 1.35].
// history: docs/history/2026-08-08-constants-sweeps.md#item_fx-level-curve-round-15
export const ITEM_FX = {
  boots: { speedMult: [1.15, 1.29, 1.42] },
  // Round 23 (Remi): nerfed to the cape's 25/40/50% curve alongside the lava
  // DPS buff (was [0.75, 0.50, 0.35]; 19.6 history: [0.50, 0.36, 0.28]).
  treads: { lavaMult: [0.75, 0.60, 0.50] },
  amulet: { maxHp: [18, 32, 42] },   // round 17 §9 trim (was [25, 43, 56])
  // Round 21.7 (Remi's hand spec): −25/−40/−50% knockback. History:
  // [0.92,0.85,0.80] → 19.2 [0.88,0.78,0.70] → 19.6 [0.85,0.74,0.65] → now.
  cape: { kbMult: [0.75, 0.60, 0.50] },
  // Round 21.8 (Remi, after the spoon A/B): 18/30/38 → 10/20/30%. Two jobs at
  // once: it nerfs the item the labs call mandatory-by-structure (question L),
  // and it moves the spoon's break-even from ~5 damage a hit to 13-20, which is
  // where a flat heal is supposed to win. Revert: [0.18, 0.30, 0.38].
  sword: { lifesteal: [0.10, 0.20, 0.30] },
  // Ability Haste (round 17, ex-cdrMult): cd = base / (1 + haste/100), and
  // haste SUMS across sources, so stacking it with arcane's fireball haste
  // has diminishing returns where the old multipliers compounded (midas-cdr
  // 86%; question J, closed). Deltas +10/+8/+8 per Remi's ruling: a later
  // level must never give MORE than the one before it. [8,18,28] measured
  // lv0 12.9% on the ladder; this is the same ballpark.
  // history: docs/history/2026-08-08-round17-battery.md
  // Round 21.8 (Remi): [10, 18, 26] → [10, 20, 30]. ⚠ The old rule was "a later
  // level must never give MORE than the one before"; equal steps still satisfy
  // it, because cd = base/(1+h/100) is concave: +10 haste is worth 9.1%, then
  // 8.3%, then 7.7% off your cooldowns. Revert: [10, 18, 26].
  hourglass: { haste: [10, 20, 30] },
  // Hat of Aura (ex-Coal Brazier): damage is FLAT (Remi: every level burns for
  // the same 1/s), the RADIUS is the whole upgrade. Round 21.7 (his call):
  // [3, 3.8, 4.6] → [5, 6, 7], so lv1 equals malady's lv1 aura and lv3 still
  // sits under its lv3. Measured centre-to-centre, and the client ring is drawn
  // at exactly these numbers.
  // ⚠ Neither field is a passive stat, so items.js ignores both by design.
  // `linger` (round 21.8, Remi's buff; "the burn should last"): seconds the
  // burn keeps ticking AFTER you leave the ring. Standing inside just refreshes
  // it, so the ring is the same 1 dmg/s and walking out is no longer a full
  // escape. Revert = linger 0 (the engine then behaves exactly as in 21.5).
  brazier: { auraDps: 1, auraR: [5, 6, 7], linger: [3, 4, 5] },
  // Slow Spoon: FLAT hp per damaging hit, no damage scaling anywhere in it.
  // ⚠ `healOnHit` must stay in items.js's ADD_FIELDS to reach stats().
  // Slow Spoon (round 21.8 final, Remi). `healOnHit` is the flat heal per enemy
  // per hit; against the sword's 10/20/30% that is a break-even of a flat
  // **10 damage at every level**, which sits in the gap between a bare fireball
  // (7) and an ember-3 one (11), so the item wins low-damage kits and loses to
  // lifesteal in damage kits, by construction.
  // `tickFrac`: damage-over-time (malady's sickness, the Hat's burn) pays a
  // TENTH, one rule for every tick; Remi ruled out splitting auras from poison
  // as too much to explain. Sized so the two fantasies pay the same: anger+blade
  // heals 722 hp/game and plague+spoon 768 (+6%), while each item still wins its
  // own build (blade +27% in anger, spoon +19% in plague, +37% in a plain kit).
  // At 0.05 the ticks stop mattering; at 0.2 the aura build runs +56%.
  // history: docs/history/2026-08-11-round21.8-elo.md#addendum
  spoon: { healOnHit: [1, 2, 3], tickFrac: 0.1 },
};

// ---- Elements (elemental mode only) --------------------------------------
// 3-level fireball riders (need Fireball >= 1) and they STACK: adds summed,
// mults multiplied. Round 16: elements ARE the fireball's progression, one axis
// each: ember=damage · gale=push · arcane=cadence · terra=size · ghost=speed.
// history: docs/history/2026-08-08-constants-sweeps.md#elements

// Round 22.4 (Remi: "the new ice is too strong"): the three victim-side stack
// piles FADE. A pile untouched for `seconds` loses 1 stack, and the timer
// restarts (reapplying that kind resets it). Midas marks and anger claims are
// different rhythms by design and never fade.
export const STACK_DECAY = { seconds: 9, kinds: ['frost', 'gale', 'malady'] };

export const ELEMENTS = {
  // Round 17 §8: [2,4,6] → [1,2,4]; ember was the best 6 g in the game
  // (+39.8 isolated). Linear cost↔gain with the premium last step (the
  // general tuning principle: going all-in deserves the reward).
  // Round 21.7 (Remi's price pass over the whole roster; his hand spec):
  // ember [5,5,7], terra [6,6,7], gale [6,6,6], arcane [6,6,10], ghost [6,6,10].
  ember: { name: 'Ember', icon: '🔥', maxLevel: 3, costs: [5, 5, 7],
           desc: 'More damage.',
           long: 'Every fireball hits harder.',
           fx: { dmgAdd: [1, 2, 4] } },
  // Stack-and-detonate (2026-08-06 rework): stacks never melt, the 3rd triggers;
  // stacks PRIVATE per attacker since round 12. The ~17% mixed-table read is
  // mostly pre-existing variance; mid-strength in the absolute lab (NOT retuned).
  // ⚠ The mixed table is the wrong ruler for "is this element weak".
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-frost
  frost: { name: 'Frost', icon: '❄️', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Crowd control.',
           long: 'Hits stack frost: the 3rd stack slows the victim, or freezes them solid at lv3.',
           fx: { stacksToTrigger: 3, slowMult: [0.7, 0.5, 1], slowT: [3, 3, 0],
                 stunT: [0, 0, 2] } },
  // Round 19 (Remi): venom → MALADY, the contagion rework. Two hits infect
  // (private stack, like midas); the sickness radiates auraR: anyone close
  // catches the SAME instance once each, ever (immunity set = no ping-pong).
  // Tick flat at 1; levels buy duration + aura. Lethal tick is always the
  // CREATOR's kill. Trail dead.
  // history: docs/history/2026-08-08-round17-battery.md#venom (the old DoT)
  // Round 20.3 (Remi's ruling, live play): the aura was blanketing the arena.
  // It was HALVED, and the creator is now immune to their OWN instance (they still
  // catch other players' plagues; see infectMalady in shared/sim.js).
  // Revert: auraR [10, 14, 18] (round 20; earlier [8,12,16], then [4,6,8]).
  malady: { name: 'Malady', icon: '🦠', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Spread diseases.',
           long: 'Two hits infect: 1 damage per tick, plus a contagious aura that infects anyone who comes close, once each.',
           // Round 21.8 (Remi): malady is a DAMAGE element that must pay off the
           // moment it hits two people, so the clock is FLAT 4 s at every level
           // and the levels buy the bite instead. Revert: tickDmg 1,
           // dotTime [4, 5, 6].
           fx: { tickDmg: [1, 1.5, 2], dotTime: 4, tickEvery: 1, auraR: [5, 7, 9] } },
  // Round 16: gale is the fireball's PUSH axis. Cheap flat kbAdd at lv1/2;
  // lv3 unlocks the stack-and-burst gust (3rd private stack = one enormous shove).
  // ⚠ The burst lever is VIOLENTLY STEEP (+20% ≈ +14 points); old sweep at git c38730f.
  // ⚠ Bots never bait or time a burst, so every lab number on the gust is a floor.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-gale
  // Round 19 (Remi): uniform across levels; stack-and-burst from LV1, gust is
  // a flat ADD (a multiplier scaled weirdly with other push riders). Sized off
  // the old lv3 gust (79×2.4≈190) at ~70%: 65+21+45=131. Revert: kbAdd
  // [7,14,14], burstKbMult 2.4, burstAtLevel 3, costs [6,5,12].
  // Round 21.7 (Remi): gale is a 6/6/6 element now, and the gust is nerfed with
  // the discount: burstKbAdd [30,60,90] → [25,50,75].
  gale:  { name: 'Gale', icon: '🌪️', maxLevel: 3, costs: [6, 6, 6],
           desc: 'More push.',
           long: 'Your fireball pushes harder, and every 3rd hit on the same target is one big gust.',
           fx: { kbAdd: [10, 20, 30], stacksToTrigger: 3,
                 burstKbAdd: [25, 50, 75] } },
  // Round 17 §5: the +1 g is a TWO-HIT rhythm now; the first hit on a target
  // plants a 🪙 mark (private, like frost's stacks), the NEXT hit on that same
  // Round 24.1 (Remi): buying midas used to buy a MALUS (the -30/-15% fireball
  // and the plant-then-cash chore). His ruling: spending gold must never make
  // you weaker, even if it pays off later. Midas is Anger's twin now: every
  // markEvery s a GOLD mark lands on a random enemy; your fireball hit on
  // them claims +goldOnClaim g and re-arms the clock. Cadence = anger's exact
  // numbers (his instruction); the flat 2 g is his first-try value.
  // Old spec (tax + two-hit cash): git show ad9d54e:shared/constants.js.
  midas: { name: 'Midas', icon: '🪙', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Gold generation.',
           long: 'Every few seconds a gold mark appears on an enemy. Claim it with a fireball hit for +2 g.',
           // Round 24.2 (Remi): base 20 s (was anger's 30), +35% mark rate per
           // level in FREQUENCY space (1/x ruling): 20 -> 14.8 -> 11.0, rounded.
           fx: { markEvery: [20, 15, 11], markDelay: 0.5, goldOnClaim: 2 } },
  // 2026-08-08 (Remi, round 16): terra is the fireball's SIZE axis and nothing
  // else; the +1/+2/+3 dmgAdd and the grow-the-target-on-hit effect are GONE
  // (his instruction: "one only increases speed, the other only size", and
  // terra's lv3 is "like fire": a cheap third step, no special).
  // Round 20.2 (Remi): terra finally gets a lv3 hook, Demolisher. Your
  // fireballs SMASH Stone Pillars: the pillar is destroyed and the ball is
  // consumed with it (pass-through was ruled too strong). Pillars only;
  // Mirror Walls are untouched. Read off the fx flags, never the element name.
  terra: { name: 'Terra', icon: '🪨', maxLevel: 3, costs: [6, 6, 7],
           desc: 'Bigger fireball.',
           long: 'A bigger ball is easier to land. At lv3 your fireballs smash Stone Pillars apart (the ball breaks on impact too).',
           fx: { projRadiusMult: [1.25, 1.45, 1.65],
                 smashPillars: true, smashAtLevel: 3 } },
  // Anger (Remi's mark-hunt rework of momentum): markDelay s into each round,
  // then markEvery s after each claim, ONE red mark lands on a random enemy:
  // a fireball hit on them banks +markDmg damage, game-long and uncapped.
  // Levels buy mark FREQUENCY only. Round 20 nerf (Remi): markEvery slowed
  // again; revert is [15, 10, 5] (round 19.3, itself from [10,7,5]).
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-momentum
  anger: { name: 'Anger', icon: '🔴', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Infinite scaling.',
           long: 'Every few seconds a red mark appears on an enemy. Claim it with a fireball hit for +0.5 fireball damage, forever.',
           // Round 24.2 (Remi): mark cadences are computed in FREQUENCY space
           // (the 1/x ruling in AGENTS.md): +35% mark rate per level, so
           // CD_next = CD / 1.35, rounded. 30 -> 22.2 -> 16.5.
           // (22.5's linear [30,25,20] was +20%, +25% per level: uneven.)
           fx: { markEvery: [30, 22, 16], markDmg: 0.5, markDelay: 0.5,
                 rampPermanent: true } },
  // Round 20.1 REWORK (Remi, final): NO tax and NO trap; every ordinary ball is
  // a plain fireball, and every doubleEvery'th CAST fires as a PAIR: the lead
  // ball (your own cast) carries ZERO knockback, the trailing one leaves
  // trailDelay s later on the same aim and is fully normal. Damage and every
  // on-hit rider are untouched on both. Why no push on the lead: the old
  // design's shove threw the victim out of the second ball's path (high
  // variance); a no-push lead lets the pair BOTH land, for 2× damage and 1×
  // push. The deleted Echo Stone item is merged in here (its delayed-cast
  // queue is what fires the trailing ball).
  // Counters (Remi): a trailing ball counts as a cast for vampire AND advances
  // this counter, but can NEVER double (chain guard in sim.js, test-locked).
  // Pre-rework spec (tax + arm/cash trap): `git show 58ba4e7:shared/constants.js`.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-mosquito
  // ⚠ Round 21.1 (Remi): DISPLAY RENAME ONLY; Mosquito 🦟 is now Echo 👯. The
  // internal key stays `mosquito` EVERYWHERE (code, tests, roster, archetypes);
  // never rename it.
  // Round 21.7 (Remi wanted "the ripple a drop makes on water"): icon 👯 → 🫧.
  // Alternates, one line each: 💧 🌊 (🌀 is Blink's, ◎ is not an emoji).
  mosquito: { name: 'Echo', icon: '🫧', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Doubled casts.',
           long: 'Every 6/5/4th fireball you throw is doubled: the lead ball hits without pushback so its twin can land too.',
           fx: { doubleEvery: [6, 5, 4], trailDelay: 0.15 } },
  // Round 16: arcane is the fireball's CADENCE axis, FIREBALL cooldown only
  // (global haste is the Hourglass item). Round 17: percentages → additive
  // Ability Haste (sums with the hourglass; converted from [0.85, 0.72]).
  // Lv3 = ex-chronos refund on fireball hits, never the fireball's own CD
  // (self-refund = 74% feedback loop; revert on arcaneRefund in sim.js).
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-arcane
  arcane:{ name: 'Arcane', icon: '🔮', maxLevel: 3, costs: [6, 6, 10],
           desc: 'Faster casting.',
           long: 'Your fireball fires more often. Lv3: every fireball hit refunds 1 s of your other cooldowns (never the fireball\'s own).',
           fx: { haste: [18, 32, 32], hitRefund: [0, 0, 1],
                 cdFloor: 0.25 } },
  // Round 24 (Remi): mark-and-feast. Damage-scaled healing made vampire a
  // high-damage-only pick (22.5's fix), the flat every-5th heal made it a
  // high-FREQUENCY-only pick; both were the same too-strong synergy. Now the
  // heal is gated on PROXIMITY and on the vampire's own missing hp instead:
  // every fireball hit banks a mark on that victim (never fades, dies with
  // either of you); stepping inside feastR vacuums the whole pile back, one
  // mark per gulpEvery seconds, each healing markHeal × (1 → lowHpMax as your
  // own hp runs out, linear, read at each gulp). feastR 7 = Hat of Aura lv3.
  // ⚠ A started feast always finishes: escaping the ring mid-drain pays anyway.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-vampire (old)
  vampire: { name: 'Vampire', icon: '🧛', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Mark, then feast.',
           long: 'Your fireball hits leave blood marks that never fade. Get close and every mark on that enemy flies back to you, healing 2/3/4 each, up to tripled the lower your own hp.',
           fx: { markHeal: [2, 3, 4], feastR: 7, gulpEvery: 0.1, lowHpMax: 3 } },
  // (Chronos, refund on ANY landed spell, was REMOVED in round 16: its
  // effect lives on as arcane's lv3, fireball-triggered. Old spec: git
  // c38730f:shared/constants.js.)
  // Round 16 rework: ghost is the fireball's SPEED axis (cheap lv1/2); lv3
  // unlocks pure passthrough: everyone on the line takes a full hit and every
  // on-hit effect pays per enemy. Old pierce spec + sweeps: git c38730f.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-ghost
  // Round 20 (Remi): lv3 price cut 12 -> 10.
  ghost: { name: 'Ghost', icon: '👻', maxLevel: 3, costs: [6, 6, 10],
           desc: 'Faster projectile.',
           long: 'Your fireball flies faster. Lv3: it passes through people, hitting everyone on the line.',
           fx: { projSpeedMult: [1.15, 1.3, 1.3], pierce: true,
                 pierceAtLevel: 3 } },
};

// ---- Draft mode (round 12): optional lobby toggle, OFF by default ----------
// Half the catalogue (rolled per game, server-side) leaves the shop and becomes
// a free pick of three every few rounds; availability is the thing you adapt
// to, so adapting is the skill. Owning any level of a thing IS the gate.
// history: docs/history/2026-08-08-constants-sweeps.md#draft
export const DRAFT = {
  POOL_FRAC: 0.5,      // fraction of the catalogue pulled out of the shop
  EVERY_ROUNDS: 3,     // a free pick is offered this often
  OPTIONS: 3,          // choices offered, roughly gold-equivalent
  // The first option is pre-selected, so a player who never clicks still gets
  // something. Clicking picks another. Bots pick immediately.
  AUTO_PICK_FIRST: true,
};

export const COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6',
  '#e67e22', '#1abc9c', '#fd79a8', '#95a5a6', '#00cec9',
];

// ---- Bots: roster contract; behavior lives in shared/sim.js (stepBot) ------
// Tiers Easy/Normal/Hard/Extreme; `kind` keys unchanged on purpose (co-op
// templates). react=[base,jitter] s perception delay; aimErr=[floor,perUnit].
// ⚠ Verify the ladder with tools/h2h.js, NOT the mixed Elo table (it hides gaps).
// history: docs/history/2026-08-08-constants-sweeps.md#bots
export const BOTS = {
  grunt:     { name: 'Grunt', label: 'Easy', difficulty: 1, brain: 'grunt',
               desc: 'Wanders and throws at nothing in particular. Never dodges anything. Cannon fodder.' },
  // boltDodge (round 17, Remi: "Hard dodging 100% of lightnings is a bit
  // tough"): the chance a bot bothers stepping out of a sky-bolt telegraph,
  // committed ONCE per bolt. Missing = always dodges.
  // Round 22 `standoff` (Remi: less point-blank oppression): the preferred
  // MINIMUM engagement distance the berserker brain keeps when the arena has
  // room; it floors the prowl ring, wounded-prey dive included. Normal holds
  // a real gap (the melee chase is gone); Hard only refuses melee (its 8.5
  // prowl ring is untouched, the 1.5 finish dive stops at 5). Extreme/Faker
  // kite on their own brain and take no knob. Revert = delete the fields.
  brawler:   { name: 'Brawler', label: 'Normal', difficulty: 2, brain: 'berserker',
               react: [0.30, 0.16], aimErr: [0.9, 0.16], boltDodge: 0.35, standoff: 13,
               desc: 'Hunts you and trades, but it reads you slowly, its aim is loose, and it keeps a respectful distance. Walks out of a lightning mark only a third of the time. A fair fight.' },
  berserker: { name: 'Berserker', label: 'Hard', difficulty: 3, brain: 'berserker',
               react: [0.16, 0.10], aimErr: [0.35, 0.10], boltDodge: 0.5, standoff: 5,
               desc: 'Hyper-aggressive. Hunts you down, rushes, never retreats, and leads its shots well. Dodges your lightning half the time (a coin flip, not an oracle).' },
  // ⚠ stalker aimErr is [0.4, 0.05] on purpose (bigger floor, much flatter
  // distance term = accurate at range), NOT the berserker's pair; 65f5597
  // copied that in by mistake. Corrected with no behaviour change (h2h verified).
  // history: docs/history/2026-08-08-constants-sweeps.md#bots-stalker-aimerr
  stalker:   { name: 'Stalker', label: 'Extreme', difficulty: 4, brain: 'stalker',
               react: [0.12, 0.08], aimErr: [0.4, 0.05], boltDodge: 0.85,
               desc: 'Dodges your projectiles AND nearly every lightning mark, leads its shots with a real intercept, and saves itself with blink and shield.' },
  // Issue #7 (Remi): a tier ABOVE Extreme whose whole identity is the combo:
  // it keeps every stalker behaviour and adds a layer that follows up on a body
  // it has just put in the air or on the floor. `combo` is that layer's own
  // clock and its windows; see stepFaker in shared/sim.js.
  faker:     { name: 'Faker', label: 'Faker', difficulty: 5, brain: 'faker',
               react: [0.10, 0.06], aimErr: [0.25, 0.03], boltDodge: 0.95,
               combo: {
                 // how often the combo layer gets to look, in seconds
                 think: [0.05, 0.05],
                 // a body moving this fast (u/s) is under someone's knockback
                 flySpeed: 26,
                 // ...and is worth a rock rather than a bolt from this far up
                 meteorFly: 40,
                 // it will not spend a telegraphed cast on a body it predicts
                 // will be further than this from the drop point
                 aimTrust: 2.2,
               },
               desc: 'Everything Extreme does, plus the follow-up: it reads where your body is going to land and puts the lightning there before you arrive.' },
  // Issue #7: the sparring partner, not a difficulty. It fights until the first
  // hit of the round lands on it, then runs from whoever hit it, and it NEVER
  // casts a mobility or defensive spell, so a combo that lands on it landed
  // because it was a combo.
  // Round 24 (Remi): `unlisted` pulls it OUT of the lobby picker and chart (it
  // muddied the difficulty ladder); the kind itself stays for the combo lab
  // and the Faker arsenals. The engine still accepts addBot for it.
  runner:    { name: 'Runner', label: 'Runner', difficulty: 2, brain: 'runner',
               react: [0.14, 0.08], aimErr: [0.6, 0.12], boltDodge: 0,
               spar: true, unlisted: true,
               desc: 'A sparring dummy (Remi\'s spec): it stands perfectly still until the first hit lands on it, then it just runs. It never casts anything, so whatever chains onto it was a real combo.' },
  // Round 22 (Remi): the immobile training tier. Unlike the Runner it never
  // reacts AT ALL: no step, no cast, hit or not. It still takes knockback,
  // burns in lava and dies normally. `spar` mutes the generic spell pilot.
  dummy:     { name: 'Dummy', label: 'Dummy', difficulty: 0, brain: 'dummy',
               boltDodge: 0, spar: true,
               desc: 'A stationary target. It never moves and never casts, even under fire. Pure aim and combo practice.' },
};

// Seconds a bot keeps aiming at an enemy's last SEEN position (Vanish masking,
// docs/ROUND12.md N4). Sized between Vanish lv1 (0.75 s) and lv3 (2.25 s): a
// cheap Vanish only makes bot aim stale, a maxed one buys real untracked time.
// history: docs/history/2026-08-08-constants-sweeps.md#bot_memory
export const BOT_MEMORY = 1.5;

// ---- Bot targeting (pickPrey). Every weight is in ARENA UNITS OF APPARENT
// DISTANCE: a term worth 10 makes a target feel 10 units nearer. Round 17 §11:
// the pick is a SOFTMAX DRAW over those scores, not an argmin; four bots no
// longer all converge on one victim, which is the whole anti-focus fix.
// ⚠ TEMPERATURE is the "how extreme" lever, same units: 0 = the old argmin, a
// score gap of TEMPERATURE = ~73/27 odds. 6 is the SMALLEST setting that moves
// the convergence number; the ladder was measured intact all the way to 14, so
// raising it is cheap if bots still feel like they gang up.
// LEADER_BIAS is per kill of lead (per-observer, floored at 0, FFA only).
// history: docs/history/2026-08-08-constants-sweeps.md#bot_targeting
//          docs/history/2026-08-08-round17-bot-targeting-softmax.md
export const BOT_TARGETING = {
  LEADER_BIAS: 2.5,
  TEMPERATURE: 6,
  PROXIMITY: 0.8,      // per unit of real distance (the score's distance coefficient)
  WOUNDED: 0.35,       // per missing HP: finish what someone already started
  CROWD: 0.8,          // per unit of "how much backup this one has within 18"
  RIM: 8,              // full bonus for standing on the edge, 0 at the centre
  MY_STACKS: 4,        // per frost/gale/malady stack of MINE on the body
  // Round 24.1 (Remi): Hard and above HUNT the anger/midas mark "whenever
  // possible". 40 apparent units ≈ most of the arena: the marked enemy wins
  // the draw unless someone else is drastically closer or nearly dead.
  // Gated on BOTS[kind].difficulty >= Hard in pickPrey; Normal shares the
  // brain but not the kind, so it is untouched by construction.
  HUNT_MARK: 40,
};

// ---- CC-gated casting (round 20: Remi's frost+gale+mosquito combo) ---------
// A bot HOLDS its target when the target is stunned, slowed, or wearing this
// many of the bot's OWN frost stacks (the next hit triggers). A held target is
// where a telegraphed spell stops being a coin flip: the sky-bolt drops dead ON
// the body, and meteor (the one power spell bots pilot) is cast ONLY into a
// hold that outlasts its fall (frost lv3's 2 s stun > meteor's 1.25 s delay).
export const BOT_CC_CAST = {
  FROST_STACKS: 2,      // ≥ my frost stacks on the body = about to break: pre-aim
  METEOR_SLOW_MAX: 0.5, // a slow this strong (speed mult ≤) pins a meteor; lighter walks out
};

// ---- Bot build strategies -------------------------------------------------
// A bot = a combat profile (BOTS kind: HOW it fights) × a build strategy
// (WHAT it buys). Each order list is consumed greedily every shop: first
// affordable next step, skipping what's owned/maxed. Selectable per bot in
// the lobby ('random' picks one at seat time); the balance lab (tools/
// arena.js) rates every kind × build pairing.
// desc format (round 17, Remi: "rewrite the strategy texts"): what it buys +
// how that feels to fight + the elements it actually picks in elemental.
// ⚠ the element lists MUST match BUILD_ELEMENTS in shared/sim.js, which is
// where the shopping really happens.
export const BUILDS = {
  // Round 20.2 (Remi): the modern ten only, ordered strongest -> weakest
  // by the measured ELO baseline (docs/history/2026-08-09-strategy-elo-
  // tournament.md), deliberately UNLABELED in the UI. Legacy six
  // (bruiser/sniper/escape/turtle/rusher/boomer) retired the same day.
  tycoon: { name: 'Tycoon',
    desc: 'Gets rich, then out-shops everyone: it hunts its gold mark and every claim pays. Kill it EARLY or fight its round-10 build. Elemental picks: midas, mosquito.',
    order: ['fireball', 'midas', 'mosquito', 'midas', 'hourglass', 'midas', 'mosquito',
      'sword', 'amulet', 'sword', 'amulet', 'sword', 'boots', 'amulet', 'boots'] },
  warlord: { name: 'Warlord',
    desc: 'No tricks, bigger numbers: raw damage over lifesteal and HP. The honest yardstick. Elemental picks: ember, arcane.',
    order: ['fireball', 'ember', 'ember', 'sword', 'amulet', 'ember', 'sword', 'amulet',
      'arcane', 'arcane', 'sword', 'amulet', 'boots', 'boots', 'cape'] },
  leech: { name: 'Leech',
    desc: 'Heals off your face: hits bank blood marks, then it dives in to vacuum them back as healing. Burst it while it is low; that is when it feeds hardest. Elemental picks: vampire, mosquito.',
    order: ['fireball', 'vampire', 'vampire', 'mosquito', 'sword', 'vampire', 'mosquito',
      'spoon', 'amulet', 'sword', 'spoon', 'amulet', 'mosquito', 'sword', 'amulet', 'boots'] },
  executioner: { name: 'Executioner',
    desc: 'Hunts the red mark and grows stronger forever. Deny the claims or watch the fireball snowball. Elemental picks: anger, ghost.',
    order: ['fireball', 'anger', 'boots', 'anger', 'ghost', 'anger', 'boots', 'ghost',
      'sword', 'boots', 'ghost', 'sword', 'amulet', 'amulet', 'sword'] },
  chainer: { name: 'Chainer',
    desc: 'Freeze, bolt, shove: frost holds you, the sky-bolt lands where you stand, gale throws you at the lava. Dodge BEFORE the third stack. Elemental picks: frost, gale, mosquito.',
    order: ['fireball', 'frost', 'lightning', 'gale', 'mosquito',
      'frost', 'lightning', 'gale', 'mosquito',
      'frost', 'lightning', 'gale', 'mosquito', 'sword', 'amulet'] },
  stormcaller: { name: 'Stormcaller',
    desc: 'The sky never stops: haste on everything, a bolt every window. Use cover and punish its paper body. Elemental picks: arcane.',
    order: ['fireball', 'arcane', 'arcane', 'lightning', 'arcane', 'hourglass', 'lightning',
      'hourglass', 'lightning', 'hourglass', 'boots', 'amulet', 'amulet', 'sword'] },
  phantom: { name: 'Phantom',
    desc: 'One line, three victims: fast fireballs that pass THROUGH bodies. Never queue up behind a teammate. Elemental picks: ghost, ember.',
    order: ['fireball', 'ghost', 'ghost', 'ember', 'ember', 'ghost', 'ember',
      'sword', 'amulet', 'sword', 'amulet', 'sword', 'amulet', 'boots'] },
  juggernaut: { name: 'Juggernaut',
    desc: 'The wall: max HP, armor, lava boots, and it turns to solid gold when you finally corner it. Focus it together or leave it for last. Elemental picks: terra, frost, vampire.',
    order: ['fireball', 'amulet', 'cape', 'statue', 'treads', 'amulet', 'sword',
      'brazier', 'cape', 'amulet', 'statue', 'sword', 'brazier', 'treads', 'cape', 'sword'] },
  plaguebearer: { name: 'Plaguebearer',
    desc: 'Wades into the pack; everyone leaves sick, and burning. Keep your distance from the green aura. Elemental picks: malady, terra.',
    order: ['fireball', 'malady', 'malady', 'brazier', 'terra', 'treads', 'malady',
      'brazier', 'terra', 'amulet', 'treads', 'brazier', 'terra', 'amulet', 'sword', 'sword'] },
  sumo: { name: 'Sumo',
    desc: "Never mind damage: you fly, it doesn't, and every shove heals it a little. Every 3rd hit is a gust, so stay off the rim. Elemental picks: gale.",
    order: ['fireball', 'gale', 'cape', 'gale', 'spoon', 'boots', 'gale', 'cape',
      'spoon', 'treads', 'cape', 'spoon', 'boots', 'treads', 'amulet', 'amulet'] },
  // ---- Issue #7: the Faker's combo arsenals. `kinds` restricts a build to
  // those bot tiers; a combo bot without its pieces is just Extreme, and no
  // other tier can pilot these pieces, so the lobby offers them ONLY on Faker.
  // Each desc opens with the chain the build exists to land (stepFaker).
  hookstorm: { name: 'Hookstorm', kinds: ['faker'],
    desc: 'Combo: Switcheroo hook (the stun scales with the distance) → lightning onto the held body → the shove → meteor where it lands. Elemental picks: ember.',
    order: ['fireball', 'lightning', 'swap', 'boots', 'ember', 'lightning', 'meteor',
      'swap', 'cape', 'lightning', 'meteor', 'swap', 'sword', 'amulet'] },
  permafrost: { name: 'Permafrost', kinds: ['faker'],
    desc: 'Combo: two frost balls bank the stacks, the third is spent ON PURPOSE with the bolt loaded. Freeze, lightning, fireball, all on a body that cannot move. Elemental picks: frost.',
    order: ['fireball', 'frost', 'lightning', 'frost', 'hourglass', 'frost', 'lightning',
      'boots', 'hourglass', 'lightning', 'sword', 'amulet', 'hourglass'] },
  minefield: { name: 'Minefield', kinds: ['faker'],
    desc: 'Combo: a loaded trap at its own feet → Switcheroo drops you ON it → the burst launches you → lightning where you come down. Elemental picks: ember.',
    order: ['fireball', 'lightning', 'nova', 'swap', 'boots', 'nova', 'ember',
      'swap', 'lightning', 'cape', 'swap', 'sword', 'amulet'] },
  galeforce: { name: 'Galeforce', kinds: ['faker'],
    desc: 'Combo: every third ball is a gust. The wind is the setup, and the lightning is already falling where it puts you. Elemental picks: gale, arcane.',
    order: ['fireball', 'gale', 'lightning', 'gale', 'arcane', 'gale', 'lightning',
      'boots', 'arcane', 'lightning', 'arcane', 'sword', 'amulet'] },
};
