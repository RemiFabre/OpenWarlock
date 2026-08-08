// Shared game constants — imported by server, client, and tests.
// Units: 1 unit ≈ 10 px at zoom 1. Times in seconds. Damage in HP.

export const TICK_RATE = 30;          // server simulation Hz
export const SNAPSHOT_RATE = 15;      // snapshots sent to clients Hz

export const ARENA = {
  START_RADIUS: 56,
  MIN_RADIUS: 10,
  // TEST flag (round 16): the ring shrinks continuously START→0 so the whole
  // arena becomes lava; MIN_RADIUS/OVERTIME_* bypassed. false = classic
  // hold-then-sudden-death, untouched.
  // ⚠ VERSUS ONLY since round 16 — the co-op campaign is exempt (guard in shared/sim.js).
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
  // START→MIN journey — this is that number, read only by the co-op branch in
  // stepBattle. Measured: with the slowed 113 s ring the mid-campaign drifted
  // 5-15 points easier (L8 68/66/57 → 81/82/81); with 65 the curve is back.
  COOP_SHRINK_TIME: 65,
  // the shrink RATE scales with deaths: rate *= 1 + ADAPT * (1 - alive/total)
  // (4 fighters, 2 dead -> 1.75x faster) so small fights don't wait on a big arena
  SHRINK_ADAPT: 1.5,
  OVERTIME_GRACE: 45,     // seconds the arena holds at MIN_RADIUS...
  OVERTIME_SHRINK: 30,    // ...then shrinks to 0 over this — every round ends
  SPAWN_RADIUS_FRAC: 0.6, // players spawn on this fraction of start radius
  // obsidian pillars on a fixed ring near the rim: cover vs projectiles and
  // knockback-stoppers; a pillar outside the current arena radius is sunk
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
  // knockback scales with the PERCENT of hp missing (hp/maxHp — amulet HP
  // counts): impulse *= 1 + KB_HP_FACTOR*(1 - hp/maxHp). Full HP = baseline,
  // near-death ≈ 1.55x. Body size plays NO role in knockback (audited
  // 2026-08-04: being big is only ever a disadvantage — easier to hit).
  KB_HP_FACTOR: 0.385, // was 0.8, then 0.55; −30% again 2026-08-05 (low-HP launches still too wild)
  // 2026-08-07 (Remi, round 12): TEST constant knockback without deleting the
  // mechanic. When set, the formula above is fed this fixed "fraction of HP
  // missing" instead of the real one, so everyone is knocked as if permanently
  // at 70% HP. Set to null to restore true HP-scaled knockback — that one line
  // is the whole revert, deliberately.
  KB_CONSTANT_MISSING: 0.30,
  // Round 17 (Remi): passive regen REMOVED — HP resets every round anyway,
  // and within a round regen mostly fed stalemates (which we then paid MORE
  // complexity to suppress, via the lock). Measured at removal: round-1 first
  // death 34.8 s (unchanged), venom −20 pts (its regen-denial premium became
  // universal), midfield healthier. Revert = 1.2 + restore the Ring.
  REGEN: 0,               // baseline hp/s (the Ring of Regeneration left with it)
  // Regen lock (2026-08-06): taking damage throttles regen for a moment.
  // Diagnosis behind it — a lv1 fireball is 5 dmg / 2.1 s = 2.38 dps if EVERY
  // shot lands, against 1.2 hp/s of passive regen, so two players trading lv1
  // fireballs literally could not kill each other. Round 1 (nobody has
  // upgrades yet) measured a median 51.9 s to the first death vs ~20 s in
  // round 3 — the lava did all the work. This makes landed hits stick.
  // Round 17 §9: the lock is a FULL STOP now — "taking damage pauses your
  // regen for 2 s" is one human sentence (×0.25-for-2.5 s was near-identical
  // value and unexplainable). Applies to lava damage too, on purpose.
  // ⚠ Re-check the round-1 first-death median (~31 s) — that number is WHY
  // the lock exists.
  // ⚠ INERT while REGEN is 0 and nothing grants regen — kept as the one-line
  // revert path for the whole regen system
  REGEN_LOCK: 2.0,        // seconds of paused regen after taking damage
  REGEN_LOCK_MULT: 0,     // regen multiplier while the lock is up (full stop)
};

export const LAVA = {
  DPS: 14,          // hp/s while swimming (was 20; -30% 2026-08 playtest round)
  // you move FASTER in lava, not slower: dipping through the lava is a real
  // play (dodge route, flank), the DPS is the price of admission.
  // 2026-08-05: 1.3 → 2.0 — at 1.3 a swimmer was still a sitting duck;
  // at 2x you can genuinely dodge while burning
  SPEED_MULT: 2.0,
};

export const ROUND = {
  COUNTDOWN: 3,
  SUMMARY_TIME: 3.5,      // victory/defeat banner between battle and shop
  SHOP_TIME: 25,
  KILLS_TO_WIN: 15,       // first to this many kills wins (checked at round end)
  MAX_ROUNDS: 25,         // safety cap: most kills wins if nobody gets there
  // Co-op campaign retry budget: 10 levels in this many rounds (3 spares).
  // Measured 2026-08-06 (tools/coop.js): 14 is a formality, 12 locks solo out.
  // history: docs/history/2026-08-08-constants-sweeps.md#round-coop_max_rounds
  COOP_MAX_ROUNDS: 13,
  KILL_CREDIT_WINDOW: 5,  // seconds: last hitter gets lava kills
  // kill this fast after your last one and it's a DOUBLE KILL (then triple…)
  MULTIKILL_WINDOW: 6,
};

// Multi-kill names, indexed by streak-2 (streak 2 = 'Double Kill').
export const MULTIKILL_NAMES = [
  'Double Kill', 'Triple Kill', 'Quadra Kill', 'Penta Kill', 'MASSACRE',
];

// Anti-snowball economy: keep ROUND_BASE >= 3*PER_KILL + ROUND_WIN so the player
// with EVERY kill never out-earns a kill-less one by more than 2x (bounties
// can't break the cap — the leader never collects one).
// history: docs/history/2026-08-08-constants-sweeps.md#gold
export const GOLD = {
  START: 12,
  PER_KILL: 2,
  ROUND_BASE: 8,   // = 3*PER_KILL + ROUND_WIN: sits exactly on the 2x cap
  ROUND_WIN: 2,
  FIRST_DEATH: 1,
  // Bounty: killing someone AHEAD of you on kills pays extra, scaled by the
  // kill gap — #2 sniping #1 earns little (the snowball would just move),
  // the last player toppling the leader is an event. Always modest.
  BOUNTY_PER_GAP: 0.5,  // gold per kill of gap, floored
  BOUNTY_MAX: 3,
};

// ---- Spells -------------------------------------------------------------
// costs[i] = cost to reach level i+1 (level 0 = not owned)
export const SPELLS = {
  fireball: {
    // 2026-08-08 (Remi, round 16): in ELEMENTAL mode the fireball NEVER levels
    // — buy() locks it at lv1 there, because a fireball level bought damage AND
    // push AND cadence in one purchase (OP and unreadable). The elements are
    // its progression now, one axis each: ember=damage, gale=push,
    // arcane=cadence, terra=size, ghost=speed. Classic keeps these levels.
    name: 'Fireball', hotkey: 'Q', maxLevel: 3, costs: [0, 8, 8],
    // lv1 spam was too strong (2026-08-03): ~30% slower at lv1, upgrades
    // buy the old cadence back
    // lv1 damage 5 → 7 (2026-08-06): at 5 a lv1 fireball could not out-damage
    // passive regen, which is what made round 1 a 52-second stalemate
    cooldown: [2.1, 1.85, 1.6], speed: 41, radius: 0.8, range: Infinity,
    damage: [7, 10, 14], knockback: [65, 70, 76],
    desc: 'Your bread and butter. Medium projectile, strong knockback.',
  },
  lightning: {
    // Round 17 (docs/ROUND17.md §2): hitscan → telegraphed sky-bolt. Mark a
    // spot in range; the zone shows INSTANTLY, the bolt lands `delay` later.
    // Damage and knockback fall linearly to HALF at the zone edge; knockback
    // is RADIAL from the zone center. Falls from the SKY: pillars and mirror
    // walls never block it — the anti-cover tool, by design.
    // ⚠ delay and radius NEVER change with level (Remi's ruler: a human with
    // boots must escape a bolt centered on them — never balance the dodge
    // window against bots). Damage/kb/cd are FIRST TRY, provisional until
    // Session C's bot support makes them measurable.
    name: 'Lightning', hotkey: 'W', maxLevel: 3, costs: [10, 6, 6],
    cooldown: [6, 5.5, 5], range: Infinity, radius: 2.2, delay: 0.5,
    damage: [12, 15, 18], knockback: [70, 78, 86],
    desc: '⚡ Mark a spot: the bolt strikes it 0.5 s later. No pillar or wall can shield it.',
  },
  boomerang: {
    // 2026-08-06 rework (Remi: "nobody ever plays it, make it exciting"):
    // fireball-grade reach, and YOU choose the turn point — tapping the key
    // again while it flies recalls it early. It still returns to the LAUNCH
    // POINT, so catching it (halving the cooldown) is a real read.
    // outDistance is now a ceiling, not a plan.
    name: 'Boomerang', hotkey: 'R', maxLevel: 3, costs: [10, 6, 6],
    cooldown: 5.5, speed: 31, radius: 1.4, outDistance: 52,
    damage: [4, 6, 8], knockback: [50, 59, 68],
    desc: 'Out and back. Tap again to recall it early; catch it to halve the cooldown.',
  },
  teleport: {
    name: 'Blink', hotkey: 'F', maxLevel: 2, costs: [12, 8],
    cooldown: [16, 12], range: [18, 26],
    desc: 'Blink to cursor. Cancels your momentum — the lava save.',
  },
  shield: {
    name: 'Shield', hotkey: 'D', maxLevel: 2, costs: [12, 6],
    cooldown: [15, 12], duration: 1.25,
    desc: 'Reflects projectiles back at their owner for 1.25 s.',
  },
  rush: {
    name: 'Rush', hotkey: 'E', maxLevel: 2, costs: [10, 6],
    cooldown: [10, 8], distance: 16, speed: 60, hitRadius: 1.6,
    damage: [5, 8], knockback: [79, 79],
    desc: 'Dash through enemies, blasting them aside.',
  },
  pillar: {
    name: 'Stone Pillar', hotkey: 'S', maxLevel: 2, costs: [10, 6],
    cooldown: [14, 11], range: Infinity, radius: 2.2, duration: [10, 16],
    desc: 'Raise an obsidian pillar: cover, blocker, knockback-stopper.',
  },
  // ---- power tier: expensive but fight-ending, buyable from the first shop --
  // ⚠ BOTS PILOT NONE OF THESE (Remi's rule): their omission from every
  // BUILDS/BOT_BUILDS order list IS the gate, and it is load-bearing (AGENTS.md debt #2).
  // history: docs/history/2026-08-08-constants-sweeps.md#spells-power-tier
  meteor: {
    name: 'Meteor', hotkey: 'T', tier: 'power', maxLevel: 2, costs: [14, 8],
    cooldown: [15, 13], range: Infinity, delay: 1.25, radius: 6,
    damage: [16, 24], knockback: [110, 130],
    desc: '☄️ Mark a spot; a rock falls: heavy damage, radial blast.',
  },
  swap: {
    // Round 17 (docs/ROUND17.md §3 + Remi live): full position+velocity
    // exchange; 1 dmg stamps the last-hitter (lava credit). ONE level since
    // round 17.2, range doubled — the lava-save fantasy needs the reach.
    name: 'Swap', hotkey: 'G', tier: 'power', maxLevel: 1, costs: [12],
    cooldown: 13, speed: 38, radius: 0.9, range: 68,
    damage: 1,
    desc: '🔀 Hit an enemy to TRADE PLACES — position and momentum both.',
  },
  repulse: {
    name: 'Repulse', hotkey: 'X', tier: 'power', maxLevel: 2, costs: [12, 8],
    cooldown: [16, 13], charge: 2, radius: [9, 11],
    damage: [8, 12], knockback: [130, 150],
    desc: '💥 Charge 2 s, then blast everyone around you away. Blink and Rush still work while charging.',
  },
  wall: {
    name: 'Mirror Wall', hotkey: 'C', tier: 'power', maxLevel: 2, costs: [14, 8],
    cooldown: [18, 15], range: Infinity, length: [8, 11], duration: 5,
    desc: '🪞 A wall that reflects enemy projectiles. Yours pass.',
  },
  // Invisibility (round 12): no restrictions on purpose — levels buy DURATION only.
  // ⚠ Non-negotiable: strip it in snapshot() AND mask bot perception, or devtools
  // sees through it / the top bot tier becomes an aimbot (docs/ROUND12.md N4).
  // history: docs/history/2026-08-08-constants-sweeps.md#spells-vanish
  vanish: {
    // round 17 (Remi): 1/2/3 s at a flat 10 g per level (was 0.75/1.5/2.25 at 12+8+8)
    name: 'Vanish', hotkey: 'V', maxLevel: 3, costs: [10, 10, 10],
    cooldown: [14, 13, 12], duration: [1, 2, 3],
    desc: '👁️ Invisible for a moment. You can still cast — and still be hit.',
  },
};

// ---- Items (passive, 3 LEVELS each) ------------------------------------
// mode: 'elemental' = exists only under the elemental ruleset. Hard cap 3
// levels, SAME gold cost per level — the diminishing effect is the brake.
// Values are ABSOLUTE CUMULATIVE totals at that level, never per-level increments.
// history: docs/history/2026-08-08-constants-sweeps.md#items
export const ITEMS = {
  boots:  { name: 'Boots of Speed',       cost: 10, maxLevel: 3, desc: 'Move speed.' },
  treads: { name: 'Lava Treads',          cost: 10, maxLevel: 3, desc: 'Lava resistance.', long: 'Swimming burns you for much less.' },
  // Round 17 §9 (ruling: no item may be mandatory by win rate — amulet lv0 sat
  // at 0.2% on the ladder): amulet and ring trimmed, FIRST TRY values.
  // Target: any forbidden-item ladder seat stays ≥ ~15%.
  amulet: { name: 'Amulet of Health',     cost: 12, maxLevel: 3, desc: 'Max HP.' },
  // (Ring of Regeneration removed with passive regen, round 17 — see PLAYER.REGEN)
  // Round 15 isolation lab: treads buffed to [0.50,0.36,0.28] (real but too
  // small before); value is bounded by lava being ~8.5% of all damage.
  // ⚠ Cape deliberately NOT changed: its value flips SIGN by pilot — the weak
  // Hard-tier number is a bot artifact. Needs Remi's feel read (BALANCE 15D).
  // history: docs/history/2026-08-08-constants-sweeps.md#items-treads-and-cape-round-15
  cape:   { name: 'Cape of the Magi',     cost: 12, maxLevel: 3, desc: 'Knockback resistance.', long: 'You get knocked around less — and into the lava less.' },
  // Studied 2026-08-07 after Remi's "really really weak" report: lava is only
  // ~8.5% of all damage (hypothesis false) and the sword measured 2nd-strongest
  // item; the weak FEEL was scoreboard vs regen-lock — round 16 added the green
  // "+N hp" popup. ⚠ Bot-measured floor: bots never choose fights lifesteal rewards.
  // history: docs/history/2026-08-08-constants-sweeps.md#items-sword
  sword:  { name: 'Blood Sword',          cost: 15, maxLevel: 3, desc: 'Lifesteal.', long: 'Your damage heals you (poison too — lava excluded). The only healing there is.' },
  echo:   { name: 'Echo Stone', cost: 16, mode: 'elemental', maxLevel: 1,
            desc: 'Extra fireballs.', long: '⚗️ Every 4th fireball echoes: a second one fires right behind it, same aim.' },
  // 2026-08-08 (Remi, round 16): arcane's old GLOBAL cooldown reduction moved
  // here from the element roster, same costs (10+8+8) and same numbers — his
  // reasoning: elements are the FIREBALL's progression now, and a thing that
  // affects ALL spells is thematically an item. `costs` is a per-level price
  // array (itemCost reads it); items without one keep their flat cost.
  hourglass: { name: 'Hourglass of Haste', cost: 10, costs: [10, 8, 8], maxLevel: 3,
            desc: 'Ability Haste.', long: 'ALL your cooldowns run faster — spells included.' },
};

// Price of the next level of `key` when you already own `owned` levels. Flat by
// design for most items (round 12): every level costs the same, and the
// shrinking effect is the brake. An item may carry a `costs` array instead
// (round 16: the hourglass keeps its element-era 10+8+8 curve).
export function itemCost(key, owned = 0) {
  const spec = ITEMS[key];
  if (!spec) return 0;
  if (Array.isArray(spec.costs)) return spec.costs[Math.min(owned, spec.costs.length - 1)];
  return spec.cost;
}

// Per-level effect totals, indexed by level-1. Scalars apply at every level.
// Round 15: vs price-matched controls every item's value RISES with level, but
// levels lose to BREADTH (amulet/sword outliers — BALANCE 15C); flat cost kept.
// ⚠ Boots lv3 re-cut over Remi's hand spec — one-line revert [1.15, 1.27, 1.35].
// history: docs/history/2026-08-08-constants-sweeps.md#item_fx-level-curve-round-15
export const ITEM_FX = {
  boots: { speedMult: [1.15, 1.29, 1.42] },
  treads: { lavaMult: [0.50, 0.36, 0.28] },
  amulet: { maxHp: [18, 32, 42] },   // round 17 §9 trim (was [25, 43, 56])
  cape: { kbMult: [0.92, 0.85, 0.80] },
  sword: { lifesteal: [0.18, 0.30, 0.38] },
  echo: { every: 4, delay: 0.15 },   // handled in castSpell/stepBattle
  // Ability Haste (round 17, ex-cdrMult): cd = base / (1 + haste/100), and
  // haste SUMS across sources — so stacking it with arcane's fireball haste
  // has diminishing returns where the old multipliers compounded (midas-cdr
  // 86% — question J, closed). Deltas +10/+8/+8 per Remi's ruling: a later
  // level must never give MORE than the one before it. [8,18,28] measured
  // lv0 12.9% on the ladder; this is the same ballpark.
  // history: docs/history/2026-08-08-round17-battery.md
  hourglass: { haste: [10, 18, 26] },
};

// ---- Elements (elemental mode only) --------------------------------------
// 3-level fireball riders (need Fireball >= 1) and they STACK: adds summed,
// mults multiplied. Round 16: elements ARE the fireball's progression, one axis
// each — ember=damage · gale=push · arcane=cadence · terra=size · ghost=speed.
// history: docs/history/2026-08-08-constants-sweeps.md#elements
export const ELEMENTS = {
  // Round 17 §8: [2,4,6] → [1,2,4] — ember was the best 6 g in the game
  // (+39.8 isolated). Linear cost↔gain with the premium last step (the
  // general tuning principle: going all-in deserves the reward).
  ember: { name: 'Ember', icon: '🔥', maxLevel: 3, costs: [6, 5, 5],
           desc: 'More damage.',
           long: 'Every fireball hits harder. Cheap, no tricks.',
           fx: { dmgAdd: [1, 2, 4] } },
  // Stack-and-detonate (2026-08-06 rework): stacks never melt, the 3rd triggers;
  // stacks PRIVATE per attacker since round 12. The ~17% mixed-table read is
  // mostly pre-existing variance; mid-strength in the absolute lab — NOT retuned.
  // ⚠ The mixed table is the wrong ruler for "is this element weak".
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-frost
  frost: { name: 'Frost', icon: '❄️', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Crowd control.',
           long: 'Hits stack frost: the 3rd stack slows the victim — or freezes them SOLID at lv3.',
           fx: { stacksToTrigger: 3, slowMult: [0.7, 0.5, 1], slowT: [3, 3, 0],
                 stunT: [0, 0, 2] } },
  // Round 17 §7: tick STACKING deleted (it was the 92% engine) — re-hits only
  // refresh the clock. Identity: venom deals LESS total than ember; its edge
  // is that the DoT ticks after you disengage and a lethal tick TAKES the
  // kill, even in lava (test-locked credit rule — it IS the identity).
  // tickDmg measured 2026-08-08 (600-game mixed table, monotone): [1,2,3] 96%
  // · [0.7,1.4,2] 79% · [0.5,1,1.5] 56% = the top-third-not-#1 target. Sub-1
  // ticks stay visible via the poison exception on the hit floater.
  // history: docs/history/2026-08-08-round17-battery.md#venom
  venom: { name: 'Venom', icon: '🐍', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Damage over time.',
           long: 'Hits poison: ½ damage per second for 3 / 5 / 7 s — levels buy DURATION, not damage. It keeps ticking after you disengage, and a lethal tick is YOUR kill, even in lava.',
           fx: { dmgMult: 0.85, tickDmg: [0.5, 0.5, 0.5], dotTime: [3, 5, 7], tickEvery: 1,
                 trailT: [1.4, 1.9, 2.4], trailDps: 2, trailStep: 2.5, trailR: 1.3 } },
  // Round 16: gale is the fireball's PUSH axis — cheap flat kbAdd at lv1/2;
  // lv3 unlocks the stack-and-burst gust (3rd private stack = one enormous shove).
  // ⚠ The burst lever is VIOLENTLY STEEP (+20% ≈ +14 points); old sweep at git c38730f.
  // ⚠ Bots never bait or time a burst — every lab number on the gust is a floor.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-gale
  gale:  { name: 'Gale', icon: '🌪️', maxLevel: 3, costs: [6, 5, 12],
           desc: 'More push.',
           long: 'Wind under your fireball. Lv3: every 3rd hit on the same target is one enormous gust.',
           fx: { kbAdd: [7, 14, 14], stacksToTrigger: 3, burstKbMult: 2.4,
                 burstAtLevel: 3 } },
  // Round 17 §5: the +1 g is a TWO-HIT rhythm now — the first hit on a target
  // plants a 🪙 mark (private, like frost's stacks), the NEXT hit on that same
  // target cashes +1 g and clears it. Halves the income RATE, which was the
  // engine of the midas-cdr 86% auto-win (question J). +1 g cap unchanged
  // forever; levels still only buy back the damage/push penalty.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-midas
  midas: { name: 'Midas', icon: '🪙', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Gold generation.',
           long: 'Your first hit marks 🪙, the next hit on them cashes +1 g. The price: −50% fireball at lv1, −25% at lv2 — and NO penalty at lv3.',
           fx: { goldOnHit: [1, 1, 1], dmgMult: [0.5, 0.75, 1], kbMult: [0.5, 0.75, 1] } },
  // 2026-08-08 (Remi, round 16): terra is the fireball's SIZE axis and nothing
  // else — the +1/+2/+3 dmgAdd and the grow-the-target-on-hit effect are GONE
  // (his instruction: "one only increases speed, the other only size", and
  // terra's lv3 is "like fire": a cheap third step, no special).
  terra: { name: 'Terra', icon: '🪨', maxLevel: 3, costs: [6, 5, 5],
           desc: 'Bigger fireball.',
           long: 'A bigger ball is much easier to land. Cheap, no tricks — and every on-hit effect loves the extra hits.',
           fx: { projRadiusMult: [1.25, 1.45, 1.65] } },
  // Round 17.2 (Remi, live): element levels buy BANKING SPEED (points/hit),
  // never bigger bonuses; every evolveEvery points = +evolveDmg damage,
  // linear and UNCAPPED. Points are game-long (permanence is the design).
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-momentum
  momentum: { name: 'Momentum', icon: '⚙️', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Late-game scaling.',
           long: 'Every landed fireball banks evolution points — 1, 2 or 3 per hit by level. Every 50 points your fireball permanently EVOLVES: +3 damage, forever.',
           fx: { pointsPerHit: [1, 2, 3], evolveEvery: 50, evolveDmg: 3,
                 rampPermanent: true } },
  // Round 18 (Remi): the ARMING sting now APPLIES on-hit riders (1 dmg, no
  // push); the cashing sting doesn't — its 2 proc balls do. 3 on-hit procs per
  // armed+cashed pair. Levels are fireball haste (ex-cdMult [0.80,0.70,0.59]).
  // ⚠ Proc balls must NOT place stacks (chains forever) — test-locked, ROUND12 S3.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-mosquito
  mosquito: { name: 'Mosquito', icon: '🦟', maxLevel: 3, costs: [10, 8, 8],
           desc: 'On-hit amplification.',
           long: 'Your fireball becomes a fast 1-damage sting that applies your on-hit effects and arms a trap: sting them again and TWO real fireballs land at once — 3 on-hit procs per pair. Levels speed up your fireball.',
           fx: { mosquito: true, haste: [20, 40, 60], stingDmg: 1,
                 procBalls: 2 } },
  // Round 16: arcane is the fireball's CADENCE axis, FIREBALL cooldown only
  // (global haste is the Hourglass item). Round 17: percentages → additive
  // Ability Haste (sums with the hourglass; converted from [0.85, 0.72]).
  // Lv3 = ex-chronos refund on fireball hits, never the fireball's own CD
  // (self-refund = 74% feedback loop; revert on arcaneRefund in sim.js).
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-arcane
  arcane:{ name: 'Arcane', icon: '🔮', maxLevel: 3, costs: [6, 5, 12],
           desc: 'Faster casting.',
           long: 'Your fireball fires more often. Lv3: every fireball hit refunds 1 s of your other cooldowns.',
           fx: { haste: [18, 32, 32], hitRefund: [0, 0, 1],
                 cdFloor: 0.25 } },
  // Every 5th fireball engorged: heals >100% of damage dealt — an EVENT, not a
  // trickle. As specced it won 74.7%; retuned across BOTH knobs (every 5 × 0.7).
  // ⚠ Lifesteal pays only on damage ACTUALLY dealt (no lava/overkill) — test it.
  // ⚠ Probably bot-over-measured; chargeEvery/chargeLifesteal are one-line levers.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-vampire
  vampire: { name: 'Vampire', icon: '🧛', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Burst lifesteal.',
           long: 'Every 5th fireball is engorged: it heals you for MORE than the damage it deals.',
           fx: { chargeEvery: 5, chargeLifesteal: [1.4, 1.92, 2.45] } },
  // (Chronos — refund on ANY landed spell — was REMOVED in round 16: its
  // effect lives on as arcane's lv3, fireball-triggered. Old spec: git
  // c38730f:shared/constants.js.)
  // Round 16 rework: ghost is the fireball's SPEED axis (cheap lv1/2); lv3
  // unlocks pure passthrough — everyone on the line takes a full hit and every
  // on-hit effect pays per enemy. Old pierce spec + sweeps: git c38730f.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-ghost
  ghost: { name: 'Ghost', icon: '👻', maxLevel: 3, costs: [6, 5, 12],
           desc: 'Faster projectile.',
           long: 'Your fireball flies faster. Lv3: it passes THROUGH people, hitting everyone on the line.',
           fx: { projSpeedMult: [1.15, 1.3, 1.3], pierce: true,
                 pierceAtLevel: 3 } },
};

// ---- Draft mode (round 12): optional lobby toggle, OFF by default ----------
// Half the catalogue (rolled per game, server-side) leaves the shop and becomes
// a free pick of three every few rounds — availability is the thing you adapt
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
  brawler:   { name: 'Brawler', label: 'Normal', difficulty: 2, brain: 'berserker',
               react: [0.30, 0.16], aimErr: [0.9, 0.16], boltDodge: 0.35,
               desc: 'Hunts you and trades, but it reads you slowly and its aim is loose. Walks out of a lightning mark only a third of the time. A fair fight.' },
  berserker: { name: 'Berserker', label: 'Hard', difficulty: 3, brain: 'berserker',
               react: [0.16, 0.10], aimErr: [0.35, 0.10], boltDodge: 0.5,
               desc: 'Hyper-aggressive. Hunts you down, rushes, never retreats, and leads its shots well. Dodges your lightning half the time — a coin flip, not an oracle.' },
  // ⚠ stalker aimErr is [0.4, 0.05] on purpose (bigger floor, much flatter
  // distance term = accurate at range) — NOT the berserker's pair; 65f5597
  // copied that in by mistake. Corrected with no behaviour change (h2h verified).
  // history: docs/history/2026-08-08-constants-sweeps.md#bots-stalker-aimerr
  stalker:   { name: 'Stalker', label: 'Extreme', difficulty: 4, brain: 'stalker',
               react: [0.12, 0.08], aimErr: [0.4, 0.05], boltDodge: 0.85,
               desc: 'Dodges your projectiles AND nearly every lightning mark, leads its shots with a real intercept, and saves itself with blink and shield.' },
};

// Seconds a bot keeps aiming at an enemy's last SEEN position (Vanish masking,
// docs/ROUND12.md N4). Sized between Vanish lv1 (0.75 s) and lv3 (2.25 s): a
// cheap Vanish only makes bot aim stale, a maxed one buys real untracked time.
// history: docs/history/2026-08-08-constants-sweeps.md#bot_memory
export const BOT_MEMORY = 1.5;

// ---- Bot targeting (pickPrey). Every weight is in ARENA UNITS OF APPARENT
// DISTANCE: a term worth 10 makes a target feel 10 units nearer. Round 17 §11:
// the pick is a SOFTMAX DRAW over those scores, not an argmin — four bots no
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
  WOUNDED: 0.35,       // per missing HP — finish what someone already started
  CROWD: 0.8,          // per unit of "how much backup this one has within 18"
  RIM: 8,              // full bonus for standing on the edge, 0 at the centre
  MY_STACKS: 4,        // per frost/gale/mosquito/midas mark of MINE on the body
};

// ---- Bot build strategies -------------------------------------------------
// A bot = a combat profile (BOTS kind: HOW it fights) × a build strategy
// (WHAT it buys). Each order list is consumed greedily every shop: first
// affordable next step, skipping what's owned/maxed. Selectable per bot in
// the lobby ('random' picks one at seat time); the balance lab (tools/
// arena.js) rates every kind × build pairing.
// desc format (round 17, Remi: "rewrite the strategy texts"): what it buys +
// how that feels to fight + the elements it actually picks in elemental —
// ⚠ the element lists MUST match BUILD_ELEMENTS in shared/sim.js, which is
// where the shopping really happens.
export const BUILDS = {
  bruiser: { name: 'Bruiser',
    desc: 'Stands its ground and trades: HP and lifesteal under the fireball. Elemental picks: vampire, ember, momentum — it heals through you now and out-damages you later.',
    order: ['fireball', 'amulet', 'fireball', 'boots', 'sword', 'cape', 'treads'] },
  sniper:  { name: 'Sniper',
    desc: 'Lightning first: marks the ground under your feet from long range and finishes the wounded. Elemental picks: venom, ghost, momentum — the poison keeps working while it repositions.',
    order: ['lightning', 'fireball', 'boots', 'lightning', 'fireball', 'lightning', 'cape'] },
  escape:  { name: 'Escape artist',
    desc: 'A fireball with an escape button: slippery, never where you aimed. Elemental picks: arcane, ghost, mosquito — fast, faster, and a trap on your body.',
    order: ['boots', 'fireball', 'teleport', 'fireball', 'fireball', 'cape', 'teleport'] },
  turtle:  { name: 'Turtle',
    desc: 'Shield and HP: outlasts you and lets the lava do the work. Elemental picks: frost, terra, venom — slow you, hit big, and bleed you out.',
    order: ['shield', 'amulet', 'cape', 'shield', 'treads', 'fireball', 'fireball'] },
  rusher:  { name: 'Rusher',
    desc: 'Rush and lifesteal: dives in and shoves you toward the lava. Elemental picks: gale, terra, ember — every hit pushes, and the big ones push HARD.',
    order: ['rush', 'fireball', 'boots', 'sword', 'fireball', 'rush', 'amulet', 'cape'] },
  boomer:  { name: 'Boomer',
    desc: 'Boomerang stacking: wide throws that hit going out AND coming back. Elemental picks: arcane, midas, ember — volume, income, damage.',
    order: ['boomerang', 'fireball', 'boots', 'boomerang', 'amulet', 'boomerang', 'sword'] },
};
