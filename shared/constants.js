// Shared game constants — imported by server, client, and tests.
// Units: 1 unit ≈ 10 px at zoom 1. Times in seconds. Damage in HP.

export const TICK_RATE = 30;          // server simulation Hz
export const SNAPSHOT_RATE = 15;      // snapshots sent to clients Hz

export const ARENA = {
  START_RADIUS: 56,
  MIN_RADIUS: 10,
  SHRINK_TIME: 65,        // seconds from START to MIN at the base rate
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
  // knockback scales with missing hp: impulse *= 1 + KB_HP_FACTOR*(1 - hp/maxHp)
  // full HP = baseline, near-death ≈ 1.8x — wounded warlocks fly
  KB_HP_FACTOR: 0.8,
  REGEN: 1.2,             // baseline hp/s for everyone (ring stacks on top)
};

export const LAVA = {
  DPS: 20,
  AFTERBURN_DPS: 4,
  AFTERBURN_TIME: 2,
};

export const ROUND = {
  COUNTDOWN: 3,
  SUMMARY_TIME: 3.5,      // victory/defeat banner between battle and shop
  SHOP_TIME: 25,
  KILLS_TO_WIN: 15,       // first to this many kills wins (checked at round end)
  MAX_ROUNDS: 25,         // safety cap: most kills wins if nobody gets there
  KILL_CREDIT_WINDOW: 5,  // seconds: last hitter gets lava kills
};

export const GOLD = {
  START: 12,
  PER_KILL: 4,
  ROUND_BASE: 3,
  ROUND_WIN: 3,
  FIRST_DEATH: 1,
};

// ---- Spells -------------------------------------------------------------
// costs[i] = cost to reach level i+1 (level 0 = not owned)
export const SPELLS = {
  fireball: {
    // the 4th damage/knockback/cost entries are only reachable in elemental
    // mode via the Cinder Crown (maxLevel stays 3 in classic — buy() enforces)
    name: 'Fireball', hotkey: 'Q', maxLevel: 3, costs: [0, 8, 8, 8],
    cooldown: 1.6, speed: 34, radius: 1.0, range: Infinity,
    damage: [4, 7, 10, 13], knockback: [72, 78, 84, 92],
    desc: 'Your bread and butter. Medium projectile, strong knockback.',
  },
  lightning: {
    name: 'Lightning', hotkey: 'W', maxLevel: 3, costs: [10, 6, 6],
    cooldown: 5, range: 55, width: 1.2,
    damage: [4, 6, 9], knockback: [32, 32, 32],
    desc: 'Instant long-range bolt. Low knockback — a finisher.',
  },
  boomerang: {
    name: 'Boomerang', hotkey: 'E', maxLevel: 3, costs: [10, 6, 6],
    cooldown: 4.5, speed: 31, radius: 1.0, outDistance: 20, homing: 40,
    damage: [4, 6, 8], knockback: [56, 66, 76],
    desc: 'Flies out and returns. Can hit on both legs.',
  },
  teleport: {
    name: 'Teleport', hotkey: 'R', maxLevel: 2, costs: [14, 8],
    cooldown: [16, 12], range: [18, 26],
    desc: 'Blink to cursor. Cancels your momentum — the lava save.',
  },
  shield: {
    name: 'Shield', hotkey: 'D', maxLevel: 2, costs: [12, 6],
    cooldown: [15, 12], duration: 1.25,
    desc: 'Reflects projectiles back at their owner for 1.25 s.',
  },
  rush: {
    name: 'Rush', hotkey: 'F', maxLevel: 2, costs: [12, 6],
    cooldown: [10, 8], distance: 16, speed: 60, hitRadius: 1.6,
    damage: [4, 6], knockback: [88, 88],
    desc: 'Dash through enemies, blasting them aside.',
  },
};

// ---- Items (passive, max 1 each) ---------------------------------------
// mode: 'elemental' marks experimental wares that only exist (shop + buy)
// when the game runs the elemental ruleset; classic never sees them.
export const ITEMS = {
  boots:  { name: 'Boots of Speed',       cost: 10, desc: '+20% move speed' },
  treads: { name: 'Lava Treads',          cost: 10, desc: '-30% lava damage, no afterburn' },
  amulet: { name: 'Amulet of Health',     cost: 12, desc: '+30 max HP' },
  ring:   { name: 'Ring of Regeneration', cost: 10, desc: '+1.2 HP/s' },
  cape:   { name: 'Cape of the Magi',     cost: 12, desc: '-15% knockback taken' },
  sword:  { name: 'Blood Sword',          cost: 14, desc: 'Heal 35% of spell damage you deal' },
  echo:   { name: 'Echo Stone', cost: 16, mode: 'elemental',
            desc: '⚗️ experimental — every 4th fireball echoes: a second one fires 0.15 s later, same aim' },
  crown:  { name: 'Cinder Crown', cost: 18, mode: 'elemental',
            desc: '⚗️ experimental — unlocks Fireball lv4 (buy it for the usual 8 g: +3 dmg, +8 push)' },
};

export const ITEM_FX = {
  boots: { speedMult: 1.2 },
  treads: { lavaMult: 0.7 },
  amulet: { maxHp: 30 },
  ring: { regen: 1.2 },
  cape: { kbMult: 0.85 },
  sword: { lifesteal: 0.35 },
  echo: { every: 4, delay: 0.15 },   // handled in castSpell/stepBattle
  crown: { fireballMax: 1 },         // handled in buy()
};

// ---- Elements (elemental mode only) --------------------------------------
// One-time, exclusive fireball transformations: pick exactly one, ever.
// Requires Fireball >= 1. buy() rejects them entirely in classic mode.
export const ELEMENTS = {
  ember: { name: 'Ember', icon: '🔥', cost: 10,
           desc: 'Pure fire: +3 damage, +6 push.',
           fx: { dmgAdd: 3, kbAdd: 6 } },
  frost: { name: 'Frost', icon: '❄️', cost: 10,
           desc: 'Hits chill: target moves at 55% speed for 1.6 s.',
           fx: { slowMult: 0.55, slowT: 1.6 } },
  venom: { name: 'Venom', icon: '🐍', cost: 10,
           desc: 'Hits poison: 6 dmg over 4 s (re-hits refresh, not stack). −25% direct damage.',
           fx: { dmgMult: 0.75, dotDamage: 6, dotTime: 4 } },
  gale:  { name: 'Gale', icon: '🌪️', cost: 10,
           desc: 'A gust in a ball: +45% push, −25% damage.',
           fx: { kbMult: 1.45, dmgMult: 0.75 } },
  midas: { name: 'Midas', icon: '🪙', cost: 10,
           desc: 'Every hit pays +1 gold. −25% damage.',
           fx: { goldOnHit: 1, dmgMult: 0.75 } },
  terra: { name: 'Terra', icon: '🪨', cost: 10,
           desc: '40% bigger fireball; hits make the target grow +15% for 3 s (easier to hit).',
           fx: { projRadiusMult: 1.4, growMult: 1.15, growT: 3, growCap: 2.2 } },
};

export const COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6',
  '#e67e22', '#1abc9c', '#fd79a8', '#95a5a6', '#00cec9',
];

// ---- Bots ----------------------------------------------------------------
// Behavior lives in shared/sim.js (stepBot); this is the roster contract
// shared by server (spawning) and client (lobby UI).
export const BOTS = {
  grunt:     { name: 'Grunt',     difficulty: 1, desc: 'Wanders and throws. Cannon fodder.' },
  berserker: { name: 'Berserker', difficulty: 2, desc: 'Hyper-aggressive. Hunts you down, rushes, never retreats.' },
  stalker:   { name: 'Stalker',   difficulty: 3, desc: 'Dodges, leads its shots, saves itself with teleport and shield.' },
};
