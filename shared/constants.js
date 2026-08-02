// Shared game constants — imported by server, client, and tests.
// Units: 1 unit ≈ 10 px at zoom 1. Times in seconds. Damage in HP.

export const TICK_RATE = 30;          // server simulation Hz
export const SNAPSHOT_RATE = 15;      // snapshots sent to clients Hz

export const ARENA = {
  START_RADIUS: 56,
  MIN_RADIUS: 10,
  SHRINK_TIME: 75,        // seconds from START to MIN
  OVERTIME_GRACE: 45,     // seconds the arena holds at MIN_RADIUS...
  OVERTIME_SHRINK: 30,    // ...then shrinks to 0 over this — every round ends
  SPAWN_RADIUS_FRAC: 0.6, // players spawn on this fraction of start radius
};

export const PLAYER = {
  RADIUS: 1.4,            // bigger bodies = spells actually connect
  MAX_HP: 100,
  SPEED: 11,              // u/s (boots-maxed ≈ the old base speed)
  FRICTION: 3.4,          // exponential velocity damping per second (more slide)
  STOP_EPSILON: 0.3,
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
  TOTAL_ROUNDS: 10,       // fixed length: every game reaches late game
  KILL_CREDIT_WINDOW: 5,  // seconds: last hitter gets lava kills
};

export const GOLD = {
  START: 12,
  PER_KILL: 4,
  ROUND_BASE: 3,
  ROUND_WIN: 3,
  FIRST_DEATH: 1,
};

export const SCORE = { PER_KILL: 1, ROUND_WIN: 2 };

// ---- Spells -------------------------------------------------------------
// costs[i] = cost to reach level i+1 (level 0 = not owned)
export const SPELLS = {
  fireball: {
    name: 'Fireball', hotkey: 'Q', maxLevel: 3, costs: [0, 6, 6],
    cooldown: 1.6, speed: 34, radius: 1.0, range: Infinity,
    damage: [8, 11, 14], knockback: [36, 42, 48],
    desc: 'Your bread and butter. Medium projectile, strong knockback.',
  },
  lightning: {
    name: 'Lightning', hotkey: 'W', maxLevel: 3, costs: [10, 6, 6],
    cooldown: 5, range: 55, width: 1.2,
    damage: [7, 9, 12], knockback: [16, 16, 16],
    desc: 'Instant long-range bolt. Low knockback — a finisher.',
  },
  boomerang: {
    name: 'Boomerang', hotkey: 'E', maxLevel: 3, costs: [10, 6, 6],
    cooldown: 6, speed: 26, radius: 1.0, outDistance: 20, homing: 40,
    damage: [8, 10, 13], knockback: [28, 28, 28],
    desc: 'Flies out and returns. Can hit on both legs.',
  },
  teleport: {
    name: 'Teleport', hotkey: 'R', maxLevel: 2, costs: [12, 6],
    cooldown: [12, 9], range: [18, 26],
    desc: 'Blink to cursor. Cancels your momentum — the lava save.',
  },
  shield: {
    name: 'Shield', hotkey: 'D', maxLevel: 2, costs: [12, 6],
    cooldown: [13, 10], duration: 1.5,
    desc: 'Reflects projectiles back at their owner for 1.5 s.',
  },
  rush: {
    name: 'Rush', hotkey: 'F', maxLevel: 2, costs: [12, 6],
    cooldown: [10, 8], distance: 16, speed: 60, hitRadius: 1.6,
    damage: [7, 10], knockback: [44, 44],
    desc: 'Dash through enemies, blasting them aside.',
  },
};

// ---- Items (passive, max 1 each) ---------------------------------------
export const ITEMS = {
  boots:  { name: 'Boots of Speed',       cost: 10, desc: '+20% move speed' },
  treads: { name: 'Lava Treads',          cost: 10, desc: '-50% lava damage, no afterburn' },
  amulet: { name: 'Amulet of Health',     cost: 12, desc: '+30 max HP' },
  ring:   { name: 'Ring of Regeneration', cost: 10, desc: '+1.2 HP/s' },
  cape:   { name: 'Cape of the Magi',     cost: 12, desc: '-25% knockback taken' },
  sword:  { name: 'Blood Sword',          cost: 14, desc: 'Heal 35% of spell damage you deal' },
};

export const ITEM_FX = {
  boots: { speedMult: 1.2 },
  treads: { lavaMult: 0.5 },
  amulet: { maxHp: 30 },
  ring: { regen: 1.2 },
  cape: { kbMult: 0.75 },
  sword: { lifesteal: 0.35 },
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
