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
  // knockback scales with the PERCENT of hp missing (hp/maxHp — amulet HP
  // counts): impulse *= 1 + KB_HP_FACTOR*(1 - hp/maxHp). Full HP = baseline,
  // near-death ≈ 1.55x. Body size plays NO role in knockback (audited
  // 2026-08-04: being big is only ever a disadvantage — easier to hit).
  KB_HP_FACTOR: 0.385, // was 0.8, then 0.55; −30% again 2026-08-05 (low-HP launches still too wild)
  REGEN: 1.2,             // baseline hp/s for everyone (ring stacks on top)
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
  KILL_CREDIT_WINDOW: 5,  // seconds: last hitter gets lava kills
};

// Anti-snowball economy (2026-08-03 playtest): passive income dominates.
// HARD CAP: in a 4-player game the max per-round income is
// ROUND_BASE + 3*PER_KILL + ROUND_WIN, and the floor is ROUND_BASE — keeping
// ROUND_BASE >= 3*PER_KILL + ROUND_WIN guarantees the player with EVERY kill
// can never out-earn a player with none by more than 2x. (Bounties can't
// break the cap: the leader never collects one — see kill() in sim.js.)
// Totals tuned down 2026-08-03 evening playtest: with 11/3/2 everyone was
// full-build before the end — the cap ratio was right, the volume wasn't.
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
    // 2026-08-03 rework: +40% reach, and it returns to the LAUNCH POINT, not
    // to the player. Catch it there (touch it on the return leg) to halve the
    // cooldown; let it pass and it flies on in a straight line, gone forever.
    name: 'Boomerang', hotkey: 'R', maxLevel: 3, costs: [10, 6, 6],
    cooldown: 5.5, speed: 31, radius: 1.4, outDistance: 28,
    damage: [4, 6, 8], knockback: [50, 59, 68],
    desc: 'Out and back to where you threw it. Catch it: cooldown halved. Miss it: gone.',
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
  // ---- power tier: expensive, unlockable only after round 5 ---------------
  // Going for these is a real tradeoff (their entry costs rival a full item)
  // but they end fights: buy() enforces minRound.
  meteor: {
    name: 'Meteor', hotkey: 'T', tier: 'power', minRound: 5, maxLevel: 2, costs: [22, 10],
    cooldown: [15, 13], range: 45, delay: 1.25, radius: 6,
    damage: [16, 24], knockback: [110, 130],
    desc: '☄️ Mark a spot; a rock falls: heavy damage, radial blast. From round 6.',
  },
  hook: {
    name: 'Hook', hotkey: 'G', tier: 'power', minRound: 5, maxLevel: 2, costs: [20, 8],
    cooldown: [13, 10], speed: 48, radius: 0.9, range: [26, 34],
    damage: [4, 6],
    desc: '🪝 Skewer the first enemy hit and yank them BEHIND you. From round 6.',
  },
  repulse: {
    name: 'Repulse', hotkey: 'X', tier: 'power', minRound: 5, maxLevel: 2, costs: [20, 8],
    cooldown: [16, 13], charge: 2, radius: [9, 11],
    damage: [8, 12], knockback: [130, 150],
    desc: '💥 Charge for 2 s (visibly — Teleport and Rush still work), then blast everyone around you away. From round 6.',
  },
  wall: {
    name: 'Mirror Wall', hotkey: 'C', tier: 'power', minRound: 5, maxLevel: 2, costs: [24, 10],
    cooldown: [18, 15], range: 20, length: [8, 11], duration: 5,
    desc: '🪞 A wall that reflects ENEMY projectiles and blocks their lightning. Yours pass. From round 6.',
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
// 2026-08-04 rework (Remi): each element is a 3-LEVEL upgrade path and they
// STACK — frost+ember is a chilling fire; buy as many as you can afford.
// Adds are summed, mults multiplied across everything you own. Per-level
// values are arrays indexed by level-1; scalars apply at every level.
// Riders need Fireball >= 1; arcane is global (no fireball needed).
// Balance notes vs the old one-pick system: gale and midas nerfed (were
// dominant), venom buffed (+ground trail), terra size now scales per level.
export const ELEMENTS = {
  ember: { name: 'Ember', icon: '🔥', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Pure fire: more damage and push each level.',
           fx: { dmgAdd: [2, 4, 6], kbAdd: [2, 4, 6] } },
  frost: { name: 'Frost', icon: '❄️', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Hits chill the target — deeper and longer each level.',
           fx: { slowMult: [0.65, 0.55, 0.45], slowT: [1.5, 1.8, 2.1] } },
  // 2026-08-05 rework: the DoT is now DISCRETE ticks (1/s for 5 s) and
  // re-hits refresh the clock AND stack the tick damage (capped). A lethal
  // tick gives the poisoner the kill — even in lava — but ticks still never
  // stamp the last-hitter slot (the round-9 credit rule).
  venom: { name: 'Venom', icon: '🐍', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Hits poison: 1 tick/s for 5 s. Re-hits refresh the clock AND strengthen the ticks. Trail on the ground. −15% direct damage.',
           fx: { dmgMult: 0.85, tickDmg: [1, 1.5, 2], stackAdd: [0.5, 0.75, 1],
                 stackCap: [3, 4.5, 6], dotTime: 5, tickEvery: 1,
                 trailT: [1.4, 1.9, 2.4], trailDps: 2, trailStep: 2.5, trailR: 1.3 } },
  gale:  { name: 'Gale', icon: '🌪️', maxLevel: 3, costs: [10, 8, 8],
           desc: 'A gust in a ball: more push each level. −5% damage.',
           fx: { kbMult: [1.18, 1.32, 1.45], dmgMult: 0.95 } },
  // 2026-08-05 nerf (Remi: "2 g per hit is a kill's worth"): every hit pays
  // a flat 1 g; lv3's edge is a +1 bonus on the FIRST hit on each enemy each
  // round — farming one victim pays no better than spreading it around.
  // Damage penalty deepened 10% → 15%.
  midas: { name: 'Midas', icon: '🪙', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Hits pay +1 g. At lv3 your first hit on each enemy each round pays +2 g. −15% damage.',
           fx: { goldOnHit: [1, 1, 1], firstHitBonus: [0, 0, 1], dmgMult: 0.85 } },
  terra: { name: 'Terra', icon: '🪨', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Bigger fireball each level; hits briefly grow the target.',
           fx: { projRadiusMult: [1.25, 1.45, 1.65], growMult: [1.1, 1.15, 1.2], growT: 3, growCap: 2.2 } },
  // 2026-08-05 (Remi): snowball-within-the-round element — every fireball you
  // LAND this round makes the next ones hit harder and push further (capped,
  // resets at round start). Starts weak by design: −20% base damage.
  critical: { name: 'Critical', icon: '💢', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Every fireball you LAND this round rams the next ones: more damage and push per hit. Starts weak: −20% damage.',
           fx: { dmgMult: 0.8, rampDmg: [0.35, 0.5, 0.65], rampKb: [1.5, 2.2, 3], rampCap: 20 } },
  // 2026-08-05: buffed (−10/−18/−25 felt invisible in play) and the HUD now
  // badges every spell slot with 🔮 so the owner SEES it working.
  arcane:{ name: 'Arcane', icon: '🔮', maxLevel: 3, costs: [10, 8, 8],
           desc: 'ALL your cooldowns run faster: −12% / −22% / −32%.',
           fx: { cdrMult: [0.88, 0.78, 0.68] } },
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
