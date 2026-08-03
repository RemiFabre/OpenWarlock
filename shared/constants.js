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
  DPS: 14,          // hp/s while swimming (was 20; -30% 2026-08 playtest round)
  // you move FASTER in lava, not slower: dipping through the lava is a real
  // play (dodge route, flank), the DPS is the price of admission
  SPEED_MULT: 1.3,
};

export const ROUND = {
  COUNTDOWN: 3,
  SUMMARY_TIME: 3.5,      // victory/defeat banner between battle and shop
  SHOP_TIME: 25,
  KILLS_TO_WIN: 15,       // first to this many kills wins (checked at round end)
  MAX_ROUNDS: 25,         // safety cap: most kills wins if nobody gets there
  KILL_CREDIT_WINDOW: 5,  // seconds: last hitter gets lava kills
};

// Anti-snowball economy (2026-08-03 playtest): passive income dominates.
// HARD CAP: in a 4-player game the max per-round income is
// ROUND_BASE + 3*PER_KILL + ROUND_WIN, and the floor is ROUND_BASE — keeping
// ROUND_BASE >= 3*PER_KILL + ROUND_WIN guarantees the player with EVERY kill
// can never out-earn a player with none by more than 2x. (Bounties can't
// break the cap: the leader never collects one — see kill() in sim.js.)
export const GOLD = {
  START: 12,
  PER_KILL: 3,
  ROUND_BASE: 11,
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
    // the 4th damage/knockback/cost entries are only reachable in elemental
    // mode via the Cinder Crown (maxLevel stays 3 in classic — buy() enforces)
    name: 'Fireball', hotkey: 'Q', maxLevel: 3, costs: [0, 8, 8, 8],
    // lv1 spam was too strong (2026-08-03): ~30% slower at lv1, upgrades
    // buy the old cadence back
    cooldown: [2.1, 1.85, 1.6, 1.5], speed: 41, radius: 0.8, range: Infinity,
    damage: [5, 9, 13, 17], knockback: [65, 70, 76, 83],
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
    name: 'Boomerang', hotkey: 'R', maxLevel: 3, costs: [10, 6, 6],
    cooldown: 4.5, speed: 31, radius: 1.4, outDistance: 20, homing: 40,
    damage: [5, 8, 10], knockback: [50, 59, 68],
    desc: 'Flies out and returns. Can hit on both legs.',
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
};

// ---- Items (passive, max 1 each) ---------------------------------------
// mode: 'elemental' marks experimental wares that only exist (shop + buy)
// when the game runs the elemental ruleset; classic never sees them.
export const ITEMS = {
  boots:  { name: 'Boots of Speed',       cost: 10, desc: '+20% move speed' },
  treads: { name: 'Lava Treads',          cost: 10, desc: '-20% lava damage' },
  amulet: { name: 'Amulet of Health',     cost: 12, desc: '+25 max HP' },
  ring:   { name: 'Ring of Regeneration', cost: 10, desc: '+0.9 HP/s' },
  cape:   { name: 'Cape of the Magi',     cost: 12, desc: '-10% knockback taken' },
  sword:  { name: 'Blood Sword',          cost: 14, desc: 'Heal 25% of spell damage you deal' },
  echo:   { name: 'Echo Stone', cost: 16, mode: 'elemental',
            desc: '⚗️ experimental — every 4th fireball echoes: a second one fires 0.15 s later, same aim' },
  crown:  { name: 'Cinder Crown', cost: 18, mode: 'elemental',
            desc: '⚗️ experimental — unlocks Fireball lv4 (buy it for the usual 8 g: +4 dmg, +7 push)' },
};

// 2026-08-03 1k-game study: sustain items dominated every mirror table
// (turtle 48-50%, bruiser 42-65% win rates vs the 25% baseline) after the
// lava -30% / knockback -10% retune made chip damage weaker. All five
// trimmed one gentle step; mobility spells got cheaper entries instead.
export const ITEM_FX = {
  boots: { speedMult: 1.2 },
  treads: { lavaMult: 0.8 },
  amulet: { maxHp: 25 },
  ring: { regen: 0.9 },
  cape: { kbMult: 0.9 },
  sword: { lifesteal: 0.25 },
  echo: { every: 4, delay: 0.15 },   // handled in castSpell/stepBattle
  crown: { fireballMax: 1 },         // handled in buy()
};

// ---- Elements (elemental mode only) --------------------------------------
// One-time, exclusive fireball transformations: pick exactly one, ever.
// Requires Fireball >= 1. buy() rejects them entirely in classic mode.
export const ELEMENTS = {
  ember: { name: 'Ember', icon: '🔥', cost: 10,
           desc: 'Pure fire: +4 damage, +5 push.',
           fx: { dmgAdd: 4, kbAdd: 5 } },
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
