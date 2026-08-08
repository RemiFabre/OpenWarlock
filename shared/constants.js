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
  REGEN: 1.2,             // baseline hp/s for everyone (ring stacks on top)
  // Regen lock (2026-08-06): taking damage throttles regen for a moment.
  // Diagnosis behind it — a lv1 fireball is 5 dmg / 2.1 s = 2.38 dps if EVERY
  // shot lands, against 1.2 hp/s of passive regen, so two players trading lv1
  // fireballs literally could not kill each other. Round 1 (nobody has
  // upgrades yet) measured a median 51.9 s to the first death vs ~20 s in
  // round 3 — the lava did all the work. This makes landed hits stick.
  REGEN_LOCK: 2.5,        // seconds of throttled regen after taking damage
  REGEN_LOCK_MULT: 0.25,  // regen multiplier while the lock is up
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
    // last-hitting from across the map was too strong (2026-08-03):
    // range -30%, push removed entirely — damage untouched
    name: 'Lightning', hotkey: 'W', maxLevel: 3, costs: [10, 6, 6],
    cooldown: 5, range: 38, width: 1.2,
    damage: [5, 8, 12],
    desc: 'Instant mid-range bolt. No push — a pure finisher.',
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
    desc: 'Long throw, out and back to where you threw it. Tap again to recall it early. Catch it: cooldown halved. Miss it: gone.',
  },
  teleport: {
    name: 'Teleport', hotkey: 'F', maxLevel: 2, costs: [12, 8],
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
    cooldown: [14, 11], range: 20, radius: 2.2, duration: [10, 16],
    desc: 'Raise an obsidian pillar: cover, blocker, knockback-stopper. One standing at a time.',
  },
  // ---- power tier: expensive but fight-ending, buyable from the first shop --
  // ⚠ BOTS PILOT NONE OF THESE (Remi's rule): their omission from every
  // BUILDS/BOT_BUILDS order list IS the gate, and it is load-bearing (AGENTS.md debt #2).
  // history: docs/history/2026-08-08-constants-sweeps.md#spells-power-tier
  meteor: {
    name: 'Meteor', hotkey: 'T', tier: 'power', maxLevel: 2, costs: [22, 10],
    cooldown: [15, 13], range: 45, delay: 1.25, radius: 6,
    damage: [16, 24], knockback: [110, 130],
    desc: '☄️ Mark a spot; a rock falls: heavy damage, radial blast.',
  },
  hook: {
    // 2026-08-06 (Remi: "very hard to hit"): range +30% and the projectile
    // is 20% slower, so you can actually read and lead it
    name: 'Hook', hotkey: 'G', tier: 'power', maxLevel: 2, costs: [20, 8],
    cooldown: [13, 10], speed: 38, radius: 0.9, range: [34, 44],
    damage: [4, 6],
    desc: '🪝 Skewer the first enemy hit and yank them BEHIND you.',
  },
  repulse: {
    name: 'Repulse', hotkey: 'X', tier: 'power', maxLevel: 2, costs: [20, 8],
    cooldown: [16, 13], charge: 2, radius: [9, 11],
    damage: [8, 12], knockback: [130, 150],
    desc: '💥 Charge for 2 s (visibly — Teleport and Rush still work), then blast everyone around you away.',
  },
  wall: {
    name: 'Mirror Wall', hotkey: 'C', tier: 'power', maxLevel: 2, costs: [24, 10],
    cooldown: [18, 15], range: 20, length: [8, 11], duration: 5,
    desc: '🪞 A wall that reflects ENEMY projectiles and blocks their lightning. Yours pass.',
  },
  // Invisibility (round 12): no restrictions on purpose — levels buy DURATION only.
  // ⚠ Non-negotiable: strip it in snapshot() AND mask bot perception, or devtools
  // sees through it / the top bot tier becomes an aimbot (docs/ROUND12.md N4).
  // history: docs/history/2026-08-08-constants-sweeps.md#spells-vanish
  vanish: {
    name: 'Vanish', hotkey: 'V', maxLevel: 3, costs: [12, 8, 8],
    cooldown: [14, 13, 12], duration: [0.75, 1.5, 2.25],
    desc: '👁️ Vanish completely for a moment. You can still cast, hit and be hit — nobody can see you do it.',
  },
};

// ---- Items (passive, 3 LEVELS each) ------------------------------------
// mode: 'elemental' = exists only under the elemental ruleset. Hard cap 3
// levels, SAME gold cost per level — the diminishing effect is the brake.
// Values are ABSOLUTE CUMULATIVE totals at that level, never per-level increments.
// history: docs/history/2026-08-08-constants-sweeps.md#items
export const ITEMS = {
  boots:  { name: 'Boots of Speed',       cost: 10, maxLevel: 3, desc: '+15% move speed, then +29% and +42%' },
  treads: { name: 'Lava Treads',          cost: 10, maxLevel: 3, desc: '-50% lava damage, then -64% and -72%' },
  amulet: { name: 'Amulet of Health',     cost: 12, maxLevel: 3, desc: '+25 max HP, then +43 and +56' },
  ring:   { name: 'Ring of Regeneration', cost: 12, maxLevel: 3, desc: '+0.7 HP/s, then +1.2 and +1.55' },
  // Round 15 isolation lab: treads buffed to [0.50,0.36,0.28] (real but too
  // small before); value is bounded by lava being ~8.5% of all damage.
  // ⚠ Cape deliberately NOT changed: its value flips SIGN by pilot — the weak
  // Hard-tier number is a bot artifact. Needs Remi's feel read (BALANCE 15D).
  // history: docs/history/2026-08-08-constants-sweeps.md#items-treads-and-cape-round-15
  cape:   { name: 'Cape of the Magi',     cost: 12, maxLevel: 3, desc: '-8% knockback taken, then -15% and -20%' },
  // Studied 2026-08-07 after Remi's "really really weak" report: lava is only
  // ~8.5% of all damage (hypothesis false) and the sword measured 2nd-strongest
  // item; the weak FEEL was scoreboard vs regen-lock — round 16 added the green
  // "+N hp" popup. ⚠ Bot-measured floor: bots never choose fights lifesteal rewards.
  // history: docs/history/2026-08-08-constants-sweeps.md#items-sword
  sword:  { name: 'Blood Sword',          cost: 15, maxLevel: 3, desc: 'Heal 18% of damage dealt, then 30% and 38% (poison too — lava excluded)' },
  echo:   { name: 'Echo Stone', cost: 16, mode: 'elemental', maxLevel: 1,
            desc: '⚗️ every 4th fireball echoes: a second one fires 0.15 s later, same aim' },
  // 2026-08-08 (Remi, round 16): arcane's old GLOBAL cooldown reduction moved
  // here from the element roster, same costs (10+8+8) and same numbers — his
  // reasoning: elements are the FIREBALL's progression now, and a thing that
  // affects ALL spells is thematically an item. `costs` is a per-level price
  // array (itemCost reads it); items without one keep their flat cost.
  hourglass: { name: 'Hourglass of Haste', cost: 10, costs: [10, 8, 8], maxLevel: 3,
            desc: 'ALL your cooldowns run faster: −10%, then −19% and −28%' },
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
  amulet: { maxHp: [25, 43, 56] },
  ring: { regen: [0.7, 1.2, 1.55] },
  cape: { kbMult: [0.92, 0.85, 0.80] },
  sword: { lifesteal: [0.18, 0.30, 0.38] },
  echo: { every: 4, delay: 0.15 },   // handled in castSpell/stepBattle
  // global CDR (round 16, ex-element arcane). castSpell multiplies EVERY
  // cooldown by it; the arcane ELEMENT's cdrMult touches the fireball only.
  hourglass: { cdrMult: [0.9, 0.81, 0.72] },
};

// ---- Elements (elemental mode only) --------------------------------------
// 3-level fireball riders (need Fireball >= 1) and they STACK: adds summed,
// mults multiplied. Round 16: elements ARE the fireball's progression, one axis
// each — ember=damage · gale=push · arcane=cadence · terra=size · ghost=speed.
// history: docs/history/2026-08-08-constants-sweeps.md#elements
export const ELEMENTS = {
  ember: { name: 'Ember', icon: '🔥', maxLevel: 3, costs: [6, 5, 5],
           desc: 'Pure fire: +2 fireball damage, then +4 and +6. Cheap, no tricks.',
           fx: { dmgAdd: [2, 4, 6] } },
  // Stack-and-detonate (2026-08-06 rework): stacks never melt, the 3rd triggers;
  // stacks PRIVATE per attacker since round 12. The ~17% mixed-table read is
  // mostly pre-existing variance; mid-strength in the absolute lab — NOT retuned.
  // ⚠ The mixed table is the wrong ruler for "is this element weak".
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-frost
  frost: { name: 'Frost', icon: '❄️', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Hits leave a frost stack that never melts. The 3rd stack detonates: lv1 −30% speed 3 s · lv2 −50% speed 3 s · lv3 FROZEN SOLID 2 s. Everyone\'s stacks count toward the same 3.',
           fx: { stacksToTrigger: 3, slowMult: [0.7, 0.5, 1], slowT: [3, 3, 0],
                 stunT: [0, 0, 2] } },
  // 2026-08-05 rework: the DoT is now DISCRETE ticks (1/s for 5 s) and
  // re-hits refresh the clock AND stack the tick damage (capped). A lethal
  // tick gives the poisoner the kill — even in lava — but ticks still never
  // stamp the last-hitter slot (the round-9 credit rule).
  venom: { name: 'Venom', icon: '🐍', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Hits poison: 1 tick/s for 5 s. Re-hits refresh the clock AND strengthen the ticks. Trail on the ground. −15% direct damage.',
           fx: { dmgMult: 0.85, tickDmg: [1, 1.5, 2], stackAdd: [0.4, 0.6, 0.8],
                 stackCap: [3, 4.5, 6], dotTime: 5, tickEvery: 1,
                 trailT: [1.4, 1.9, 2.4], trailDps: 2, trailStep: 2.5, trailR: 1.3 } },
  // Round 16: gale is the fireball's PUSH axis — cheap flat kbAdd at lv1/2;
  // lv3 unlocks the stack-and-burst gust (3rd private stack = one enormous shove).
  // ⚠ The burst lever is VIOLENTLY STEEP (+20% ≈ +14 points); old sweep at git c38730f.
  // ⚠ Bots never bait or time a burst — every lab number on the gust is a floor.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-gale
  gale:  { name: 'Gale', icon: '🌪️', maxLevel: 3, costs: [6, 5, 12],
           desc: 'Wind under your fireball: +7 push, then +14. Lv3 unlocks the gust: your hits leave a stack, and the 3rd is spent on one enormous shove (×2.4). Only YOUR stacks count.',
           fx: { kbAdd: [7, 14, 14], stacksToTrigger: 3, burstKbMult: 2.4,
                 burstAtLevel: 3 } },
  // +1 g per hit, capped there forever; levels buy back the −50% damage/push
  // penalty. Lab 0.0% is a gold-saturation FLOOR (every gold-scarcity axis moves
  // it up monotonically), not a measurement of the element.
  // ⚠ Calibration: a do-nothing 26 g element scores 2.7% — do not act on a 0.0%.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-midas
  midas: { name: 'Midas', icon: '🪙', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Every hit pays +1 g — never more, at any level. The price: your fireball is HALVED at lv1 (−50% damage and push). Levels buy the penalty back: −38% at lv2, −28% at lv3.',
           fx: { goldOnHit: [1, 1, 1], dmgMult: [0.5, 0.62, 0.72], kbMult: [0.5, 0.62, 0.72] } },
  // 2026-08-08 (Remi, round 16): terra is the fireball's SIZE axis and nothing
  // else — the +1/+2/+3 dmgAdd and the grow-the-target-on-hit effect are GONE
  // (his instruction: "one only increases speed, the other only size", and
  // terra's lv3 is "like fire": a cheap third step, no special).
  terra: { name: 'Terra', icon: '🪨', maxLevel: 3, costs: [6, 5, 5],
           desc: 'A bigger fireball each level (+25%, +45%, +65% radius): much easier to land. Cheap, no tricks.',
           fx: { projRadiusMult: [1.25, 1.45, 1.65] } },
  // Permanent whole-game ramp on LANDED fireballs, damage only (round 12 rework
  // of 'critical'); rampDmg re-swept round 16 at 0.022, 1:1.5:2 ratio kept.
  // ⚠ Violently steep: re-run 800×3 after ANY fireball/ember/knockback/lava change.
  // ⚠ If it feels slow raise rampDmg only — game-long permanence is Remi's design.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-momentum
  momentum: { name: 'Momentum', icon: '⚙️', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Starts at 80% damage. EVERY fireball you LAND makes your fireball permanently stronger — for the whole game, not just the round, with no ceiling. Damage only: your push never changes.',
           fx: { dmgMult: 0.8, rampDmg: [0.022, 0.033, 0.044], rampPermanent: true } },
  // Round 12: sting leaves ONE private stack; hitting a stacked target spends it
  // — two co-located fireballs, every on-hit pays TWICE, knockback happens ONCE.
  // ⚠ Proc balls must NOT place stacks (chains forever) — test-locked, ROUND12 S3.
  // ⚠ cdMult curve is brutally steep: re-run 800×3 after any kb/lava/fireball change.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-mosquito
  mosquito: { name: 'Mosquito', icon: '🦟', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Your fireball becomes a mosquito: 1 damage, no push, and a much faster sting that leaves a mosquito stack on whoever it hits. Sting someone who already carries YOUR stack and it spends it: two of your normal fireballs land at once, so every effect you own procs twice — double damage, double frost, double gold. The push, though, is only ever a single fireball.',
           fx: { mosquito: true, cdMult: [0.80, 0.70, 0.59], stingDmg: 1,
                 procBalls: 2 } },
  // Round 16: arcane is the fireball's CADENCE axis — cdrMult hits the FIREBALL
  // cooldown only (global CDR moved to the Hourglass item). Lv3 = ex-chronos
  // refund on fireball hits, never the fireball's own CD (self-refund = 74%
  // feedback loop; sweep + revert on arcaneRefund in sim.js). cdFloor stops re-cast loops.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-arcane
  arcane:{ name: 'Arcane', icon: '🔮', maxLevel: 3, costs: [6, 5, 12],
           desc: 'Your fireball cools down faster: −15%, then −28%. Lv3 unlocks: every fireball HIT refunds 1 s off all your OTHER cooldowns (per enemy hit).',
           fx: { cdrMult: [0.85, 0.72, 0.72], hitRefund: [0, 0, 1],
                 cdFloor: 0.25 } },
  // Every 5th fireball engorged: heals >100% of damage dealt — an EVENT, not a
  // trickle. As specced it won 74.7%; retuned across BOTH knobs (every 5 × 0.7).
  // ⚠ Lifesteal pays only on damage ACTUALLY dealt (no lava/overkill) — test it.
  // ⚠ Probably bot-over-measured; chargeEvery/chargeLifesteal are one-line levers.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-vampire
  vampire: { name: 'Vampire', icon: '🧛', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Every 5th fireball is engorged: it heals you for 140% of the damage it deals (192% / 245% at higher levels). Rare, loud, and it turns a won trade around.',
           fx: { chargeEvery: 5, chargeLifesteal: [1.4, 1.92, 2.45] } },
  // (Chronos — refund on ANY landed spell — was REMOVED in round 16: its
  // effect lives on as arcane's lv3, fireball-triggered. Old spec: git
  // c38730f:shared/constants.js.)
  // Round 16 rework: ghost is the fireball's SPEED axis (cheap lv1/2); lv3
  // unlocks pure passthrough — everyone on the line takes a full hit and every
  // on-hit effect pays per enemy. Old pierce spec + sweeps: git c38730f.
  // history: docs/history/2026-08-08-constants-sweeps.md#elements-ghost
  ghost: { name: 'Ghost', icon: '👻', maxLevel: 3, costs: [6, 5, 12],
           desc: 'Your fireball flies faster: +15%, then +30%. Lv3 unlocks: it passes straight THROUGH people — everyone on the line takes a full hit, and your on-hit effects (lifesteal too) pay for each of them.',
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
               desc: 'Wanders and throws at nothing in particular. Cannon fodder.' },
  brawler:   { name: 'Brawler', label: 'Normal', difficulty: 2, brain: 'berserker',
               react: [0.30, 0.16], aimErr: [0.9, 0.16],
               desc: 'Hunts you and trades, but it reads you slowly and its aim is loose. A fair fight.' },
  berserker: { name: 'Berserker', label: 'Hard', difficulty: 3, brain: 'berserker',
               react: [0.16, 0.10], aimErr: [0.35, 0.10],
               desc: 'Hyper-aggressive. Hunts you down, rushes, never retreats, and leads its shots well.' },
  // ⚠ stalker aimErr is [0.4, 0.05] on purpose (bigger floor, much flatter
  // distance term = accurate at range) — NOT the berserker's pair; 65f5597
  // copied that in by mistake. Corrected with no behaviour change (h2h verified).
  // history: docs/history/2026-08-08-constants-sweeps.md#bots-stalker-aimerr
  stalker:   { name: 'Stalker', label: 'Extreme', difficulty: 4, brain: 'stalker',
               react: [0.12, 0.08], aimErr: [0.4, 0.05],
               desc: 'Dodges your projectiles, leads its shots, and saves itself with teleport and shield.' },
};

// Seconds a bot keeps aiming at an enemy's last SEEN position (Vanish masking,
// docs/ROUND12.md N4). Sized between Vanish lv1 (0.75 s) and lv3 (2.25 s): a
// cheap Vanish only makes bot aim stale, a maxed one buys real untracked time.
// history: docs/history/2026-08-08-constants-sweeps.md#bot_memory
export const BOT_MEMORY = 1.5;

// ---- Bot targeting: comeback lever, a WEIGHT inside pickPrey (never an
// override). Unit: arena units of apparent distance per kill of lead (per-
// observer, floored at 0, FFA only). Swept: 2.5 = top of the useful range.
// ⚠ Bots can't feel being ganged up on — if oppressive, 1.5 is the measured step down.
// history: docs/history/2026-08-08-constants-sweeps.md#bot_targeting
export const BOT_TARGETING = {
  LEADER_BIAS: 2.5,
};

// ---- Bot build strategies -------------------------------------------------
// A bot = a combat profile (BOTS kind: HOW it fights) × a build strategy
// (WHAT it buys). Each order list is consumed greedily every shop: first
// affordable next step, skipping what's owned/maxed. Selectable per bot in
// the lobby ('random' picks one at seat time); the balance lab (tools/
// arena.js) rates every kind × build pairing.
export const BUILDS = {
  bruiser: { name: 'Bruiser',
    desc: 'Max fireball, then HP and lifesteal. Stands its ground and trades.',
    order: ['fireball', 'amulet', 'fireball', 'boots', 'sword', 'ring', 'cape', 'treads'] },
  sniper:  { name: 'Sniper',
    desc: 'Lightning first. Pokes from long range and finishes low targets.',
    order: ['lightning', 'fireball', 'boots', 'lightning', 'fireball', 'lightning', 'cape', 'ring'] },
  escape:  { name: 'Escape artist',
    desc: 'Max fireball with an escape button. Slippery, still dangerous.',
    order: ['boots', 'fireball', 'teleport', 'fireball', 'fireball', 'cape', 'teleport', 'ring'] },
  turtle:  { name: 'Turtle',
    desc: 'Shield, regen and HP. Outlasts you and lets the lava do the work.',
    order: ['shield', 'amulet', 'ring', 'cape', 'shield', 'treads', 'fireball', 'fireball'] },
  rusher:  { name: 'Rusher',
    desc: 'Rush and lifesteal. Dives in and shoves you off the platform.',
    order: ['rush', 'fireball', 'boots', 'sword', 'fireball', 'rush', 'amulet', 'cape'] },
  boomer:  { name: 'Boomer',
    desc: 'Boomerang stacking. Wide throws that hit on the way out and back.',
    order: ['boomerang', 'fireball', 'boots', 'boomerang', 'amulet', 'boomerang', 'ring', 'sword'] },
};
