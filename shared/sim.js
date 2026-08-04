// The whole game simulation. Pure-ish: no I/O, no wall clock, no randomness
// except through state.rng (seeded). Runs on the server; unit-testable.

import {
  ARENA, PLAYER, LAVA, ROUND, GOLD, SPELLS, ITEMS, ITEM_FX, ELEMENTS, COLORS,
  BUILDS,
} from './constants.js';

// Tiny deterministic RNG (mulberry32) so tests are reproducible.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame({ seed = 1, mode = 'classic' } = {}) {
  return {
    phase: 'lobby',        // lobby | countdown | battle | shop | gameover
    phaseT: 0,             // time remaining in countdown/shop
    mode: mode === 'elemental' ? 'elemental' : 'classic',
    round: 0,
    time: 0,               // elapsed battle time this round
    arenaRadius: ARENA.START_RADIUS,
    graceT: ARENA.OVERTIME_GRACE, // overtime grace left once radius hits MIN
    roundFighters: 0,      // fighters seated at round start (adaptive shrink)
    pillars: [],           // [{x, y, r, sunk}] set each round start
    players: {},
    projectiles: [],
    delayedShots: [],      // Echo Stone: fireballs waiting to fire (elemental)
    hazards: [],           // venom ground trails (elemental): {x,y,r,until,owner,dps}
    meteors: [],           // falling meteors: {x,y,t,owner,level}
    walls: [],             // mirror walls: {x1,y1,x2,y2,nx,ny,owner,until}
    events: [],            // transient, drained by the server each snapshot
    nextId: 1,
    winner: null,
    seed,
  };
}

// Ruleset toggle — lobby only, so a running game can never change rules.
export function setMode(state, mode) {
  if (state.phase !== 'lobby') return false;
  if (mode !== 'classic' && mode !== 'elemental') return false;
  state.mode = mode;
  return true;
}

function rng(state) {
  if (!state._rng) state._rng = makeRng(state.seed);
  return state._rng();
}

// ---- players ------------------------------------------------------------

export function addPlayer(state, id, name, { bot = false, color, avatar, kind, build } = {}) {
  const n = Object.keys(state.players).length;
  state.players[id] = {
    id, name: String(name).slice(0, 16) || 'warlock', bot,
    color: color || COLORS[n % COLORS.length],
    avatar: typeof avatar === 'string' && avatar.trim() ? avatar.trim().slice(0, 8) : '🧙',
    kind: bot ? (kind || 'grunt') : null,
    // bots only: shop build strategy (BUILDS key); null = the kind's default
    build: bot && build && Object.hasOwn(BUILDS, build) ? build : null,
    shopReady: false,
    x: 0, y: 0, vx: 0, vy: 0,
    moveTarget: null,
    hp: PLAYER.MAX_HP, maxHp: PLAYER.MAX_HP,
    alive: false,          // becomes true at round start
    ready: false,
    gold: GOLD.START, goldEarned: GOLD.START, kills: 0, deaths: 0,
    dmgDealt: 0,           // damage dealt to enemies (incl. credited lava burn)
    spectator: false,
    radius: PLAYER.RADIUS,
    spells: { fireball: 1 },
    items: [],
    cooldowns: {},
    shieldT: 0,
    // ---- elemental mode only (all stay empty/0 for the whole game in classic)
    elements: {},          // owned element levels, e.g. {frost: 2, ember: 1}
    slowT: 0,              // frost: seconds of slow remaining
    slowMultHit: 1,        // frost: strength of the slow that hit us
    poisonT: 0,            // venom: seconds of DoT remaining
    poisonDps: 0,          // venom: dps of the poison that hit us
    poisonBy: null,        // venom: who poisoned us (kill credit)
    growT: 0,              // terra: seconds of forced growth remaining
    growMultHit: 1,        // terra: strength of the grow that hit us
    echoN: 0,              // echo stone: fireballs cast this round
    dash: null,            // {dx, dy, left, hit:Set-as-object}
    lastHitBy: null,       // {id, t}  t = state.time when hit
    diedFirst: false,
    roundKills: 0,
  };
  return state.players[id];
}

export function fighters(state) {
  return Object.values(state.players).filter(p => !p.spectator);
}

export function setSpectator(state, id, on) {
  const pl = state.players[id];
  if (!pl || state.phase !== 'lobby') return;
  pl.spectator = !!on;
  if (on) pl.alive = false;
}

// Size-by-lead: leaders grow (easier to hit), trailers shrink. Recomputed
// live so a mid-round kill visibly changes you.
function updateRadii(state) {
  const fs = fighters(state);
  if (!fs.length) return;
  const avg = fs.reduce((sum, p) => sum + p.kills, 0) / fs.length;
  const { PER_KILL, MIN, MAX } = PLAYER.SIZE_LEAD;
  for (const pl of fs) {
    let mult = clamp(1 + PER_KILL * (pl.kills - avg), MIN, MAX);
    // terra hits force the target bigger for a moment; stacks multiplicatively
    // with size-by-lead but the TOTAL multiplier is capped (elemental only —
    // growT stays 0 in classic)
    if (pl.growT > 0) {
      mult = Math.min(ELEMENTS.terra.fx.growCap, mult * (pl.growMultHit || 1.15));
    }
    pl.radius = PLAYER.RADIUS * mult;
  }
}

export function removePlayer(state, id) {
  delete state.players[id];
  // drop their projectiles' ownership but let them fly
  for (const p of state.projectiles) if (p.owner === id) p.owner = null;
}

function stats(pl) {
  // everyone regenerates a little: spells only tickle — the lava is the killer
  let speed = PLAYER.SPEED, lavaMult = 1, kbMult = 1, regen = PLAYER.REGEN, lifesteal = 0;
  let maxHp = PLAYER.MAX_HP;
  for (const it of pl.items) {
    const fx = ITEM_FX[it];
    if (!fx) continue;
    if (fx.speedMult) speed *= fx.speedMult;
    if (fx.lavaMult != null) lavaMult *= fx.lavaMult;
    if (fx.kbMult) kbMult *= fx.kbMult;
    if (fx.regen) regen += fx.regen;
    if (fx.lifesteal) lifesteal += fx.lifesteal;
    if (fx.maxHp) maxHp += fx.maxHp;
  }
  if (pl.inLava) speed *= LAVA.SPEED_MULT; // lava is fast — and it burns
  if (pl.slowT > 0) speed *= (pl.slowMultHit || 0.6); // frost chill (elemental)
  return { speed, lavaMult, kbMult, regen, lifesteal, maxHp };
}

// Per-level value helper: spec fields may be scalar or per-level arrays.
function lvl(spec, field, level) {
  const v = spec[field];
  return Array.isArray(v) ? v[Math.min(level, v.length) - 1] : v;
}

// Same idea for raw element fx values (scalar, or array indexed by level-1).
function efxV(v, level) {
  return Array.isArray(v) ? v[Math.min(level, v.length) - 1] : v;
}

// Arcane (elemental): global cooldown multiplier for everything you cast.
function cdrOf(state, pl) {
  if (state.mode !== 'elemental') return 1;
  const el = pl.elements && pl.elements.arcane;
  return el ? efxV(ELEMENTS.arcane.fx.cdrMult, el) : 1;
}

// ---- inputs -------------------------------------------------------------

export function setMoveTarget(state, id, x, y) {
  const pl = state.players[id];
  if (!pl || !pl.alive || pl.dash) return;
  const m = 90; // sanity clamp, generous margin beyond arena
  pl.moveTarget = { x: clamp(x, -m, m), y: clamp(y, -m, m) };
}

export function castSpell(state, id, key, tx, ty) {
  const pl = state.players[id];
  // hasOwn: never resolve names like 'constructor' through the prototype chain
  const spec = Object.hasOwn(SPELLS, key) ? SPELLS[key] : null;
  if (!pl || !spec || !pl.alive || state.phase !== 'battle') return false;
  const level = pl.spells[key] || 0;
  if (level < 1) return false;
  if ((pl.cooldowns[key] || 0) > 0) return false;
  if (pl.dash || pl.charging) return false;

  let dx = tx - pl.x, dy = ty - pl.y;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  pl.cooldowns[key] = lvl(spec, 'cooldown', level) * cdrOf(state, pl);

  switch (key) {
    case 'fireball': {
      spawnFireball(state, pl, level, dx, dy);
      // Echo Stone (elemental): every Nth fireball fires a second one shortly
      // after, along the same aim direction
      if (state.mode === 'elemental' && pl.items.includes('echo')) {
        pl.echoN = (pl.echoN || 0) + 1;
        if (pl.echoN % ITEM_FX.echo.every === 0)
          state.delayedShots.push({ t: ITEM_FX.echo.delay, owner: id, level, dx, dy });
      }
      break;
    }
    case 'boomerang': {
      // spawn at the caster: the owner is excluded from collisions, and this
      // makes point-blank shots connect instead of spawning past the target.
      // ox/oy remember the LAUNCH POINT: the boomerang flies back there (not
      // to the player) — stand in its path to catch it (halves the cooldown),
      // or let it fly on past forever.
      const ox = pl.x + dx * pl.radius * 0.5;
      const oy = pl.y + dy * pl.radius * 0.5;
      state.projectiles.push({
        id: state.nextId++, type: key, owner: id, level,
        x: ox, y: oy, ox, oy,
        vx: dx * spec.speed, vy: dy * spec.speed,
        traveled: 0,
        returning: false,           // boomerang only
        lost: false,                // flew past its launch point: uncatchable
        hit: {},                    // players hit this leg
      });
      break;
    }
    case 'lightning': {
      fireLightning(state, pl, level, dx, dy);
      break;
    }
    case 'teleport': {
      const range = lvl(spec, 'range', level);
      const dist = Math.min(d, range);
      pl.x += dx * dist; pl.y += dy * dist;
      pl.vx = 0; pl.vy = 0;
      pl.moveTarget = null;
      state.events.push({ t: 'teleport', id, x: pl.x, y: pl.y });
      break;
    }
    case 'shield': {
      pl.shieldT = spec.duration;
      break;
    }
    case 'rush': {
      pl.dash = { dx, dy, left: spec.distance, level, hit: {} };
      pl.moveTarget = null;
      break;
    }
    case 'pillar': {
      // raise a standing stone at the cursor (clamped); a new one replaces
      // your previous — one piece of personal architecture at a time
      const dist = Math.min(d, spec.range);
      const px = pl.x + dx * dist, py = pl.y + dy * dist;
      state.pillars = state.pillars.filter(p => p.placedBy !== id);
      state.pillars.push({
        x: px, y: py, r: spec.radius, sunk: false,
        placedBy: id, until: state.time + lvl(spec, 'duration', level),
      });
      state.events.push({ t: 'pillarUp', x: px, y: py });
      break;
    }
    case 'meteor': {
      const dist = Math.min(d, spec.range);
      state.meteors.push({
        x: pl.x + dx * dist, y: pl.y + dy * dist,
        t: spec.delay, owner: id, level,
      });
      break;
    }
    case 'hook': {
      state.projectiles.push({
        id: state.nextId++, type: 'hook', owner: id, level,
        x: pl.x + dx * pl.radius * 0.5,
        y: pl.y + dy * pl.radius * 0.5,
        vx: dx * spec.speed, vy: dy * spec.speed,
        traveled: 0, returning: false, hit: {},
      });
      break;
    }
    case 'repulse': {
      // 2 s of visible charging, then the burst fires in stepBattle
      pl.charging = { left: spec.charge, level };
      break;
    }
    case 'wall': {
      // the wall stands PERPENDICULAR to your aim, at the cursor (clamped)
      const dist = Math.min(d, spec.range);
      const cx = pl.x + dx * dist, cy = pl.y + dy * dist;
      const half = lvl(spec, 'length', level) / 2;
      const px = -dy, py = dx; // wall axis: perpendicular to the aim
      state.walls = state.walls.filter(w => w.owner !== id); // one wall each
      state.walls.push({
        x1: cx - px * half, y1: cy - py * half,
        x2: cx + px * half, y2: cy + py * half,
        nx: dx, ny: dy, owner: id, until: state.time + spec.duration,
      });
      state.events.push({ t: 'wallUp', x: cx, y: cy });
      break;
    }
  }
  state.events.push({ t: 'cast', id, spell: key, x: pl.x, y: pl.y, dx, dy });
  return true;
}

// Fireball factory shared by castSpell and the Echo Stone delayed shot.
// Spawns at the caster (owner is excluded from collisions; point-blank shots
// connect). In elemental mode ALL the caster's rider elements (everything
// but arcane) ride on the projectile at their current levels.
function spawnFireball(state, pl, level, dx, dy) {
  const spec = SPELLS.fireball;
  let elements = null;
  if (state.mode === 'elemental' && pl.elements) {
    for (const [k, v] of Object.entries(pl.elements)) {
      if (k === 'arcane' || !(v > 0)) continue;
      (elements = elements || {})[k] = v;
    }
  }
  const radius = spec.radius * (elements && elements.terra
    ? efxV(ELEMENTS.terra.fx.projRadiusMult, elements.terra) : 1);
  state.projectiles.push({
    id: state.nextId++, type: 'fireball', owner: pl.id, level,
    x: pl.x + dx * pl.radius * 0.5,
    y: pl.y + dy * pl.radius * 0.5,
    vx: dx * spec.speed, vy: dy * spec.speed,
    traveled: 0,
    returning: false,
    hit: {},
    elements, radius,
  });
}

function fireLightning(state, pl, level, dx, dy) {
  const spec = SPELLS.lightning;
  // pillars block the bolt: the ray stops at the first pillar intersection
  let rayMax = spec.range;
  for (const pil of state.pillars) {
    if (pil.sunk) continue;
    const t = rayCircleT(pl.x, pl.y, dx, dy, pil.x, pil.y, pil.r);
    if (t != null && t < rayMax) rayMax = t;
  }
  // enemy mirror walls block the bolt too (your own walls let it through)
  for (const w of state.walls) {
    if (w.owner === pl.id) continue;
    const t = raySegT(pl.x, pl.y, dx, dy, w.x1, w.y1, w.x2, w.y2);
    if (t != null && t < rayMax) rayMax = t;
  }
  // hitscan: first live enemy within `width` of the ray, up to the block point
  let best = null, bestT = Infinity;
  for (const other of Object.values(state.players)) {
    if (other === pl || !other.alive) continue;
    const ox = other.x - pl.x, oy = other.y - pl.y;
    const t = ox * dx + oy * dy;                 // projection along ray
    if (t < 0 || t > rayMax) continue;
    const perp = Math.abs(ox * dy - oy * dx);    // distance from ray
    if (perp <= spec.width + other.radius && t < bestT) { best = other; bestT = t; }
  }
  const endT = best ? bestT : rayMax;
  state.events.push({
    t: 'beam', id: pl.id,
    x1: pl.x, y1: pl.y, x2: pl.x + dx * endT, y2: pl.y + dy * endT,
  });
  if (best) {
    if (best.shieldT > 0) return; // shield blocks (no reflect for hitscan)
    const kb = lvl(spec, 'knockback', level);
    if (kb) applyKnockback(state, best, dx, dy, kb); // lightning has no push
    applyDamage(state, best, lvl(spec, 'damage', level), pl.id);
  }
}

export function buy(state, id, thing) {
  const pl = state.players[id];
  if (!pl) return { ok: false, err: 'no player' };
  if (state.phase !== 'shop')
    return { ok: false, err: 'shop is closed' };

  if (Object.hasOwn(SPELLS, thing)) {
    const spec = SPELLS[thing];
    // power tier: locked until enough rounds have been fought
    if (spec.minRound && state.round < spec.minRound)
      return { ok: false, err: `unlocks after round ${spec.minRound}` };
    const level = pl.spells[thing] || 0;
    // Cinder Crown (elemental) raises the fireball cap by one
    let maxLevel = spec.maxLevel;
    if (thing === 'fireball' && state.mode === 'elemental' && pl.items.includes('crown'))
      maxLevel += ITEM_FX.crown.fireballMax;
    if (level >= maxLevel) return { ok: false, err: 'max level' };
    const cost = spec.costs[level];
    if (pl.gold < cost) return { ok: false, err: 'not enough gold' };
    pl.gold -= cost;
    pl.spells[thing] = level + 1;
    return { ok: true };
  }
  if (Object.hasOwn(ELEMENTS, thing)) {
    // stackable, 3-level fireball elements — elemental ruleset only.
    // Own as many as you like (frost+ember = chilling fire).
    if (state.mode !== 'elemental') return { ok: false, err: 'elemental mode only' };
    const espec = ELEMENTS[thing];
    if (thing !== 'arcane' && (pl.spells.fireball || 0) < 1)
      return { ok: false, err: 'requires fireball' };
    const elevel = pl.elements[thing] || 0;
    if (elevel >= espec.maxLevel) return { ok: false, err: 'max level' };
    const cost = espec.costs[elevel];
    if (pl.gold < cost) return { ok: false, err: 'not enough gold' };
    pl.gold -= cost;
    pl.elements[thing] = elevel + 1;
    return { ok: true };
  }
  if (Object.hasOwn(ITEMS, thing)) {
    if (ITEMS[thing].mode === 'elemental' && state.mode !== 'elemental')
      return { ok: false, err: 'elemental mode only' };
    if (pl.items.includes(thing)) return { ok: false, err: 'already owned' };
    const cost = ITEMS[thing].cost;
    if (pl.gold < cost) return { ok: false, err: 'not enough gold' };
    pl.gold -= cost;
    pl.items.push(thing);
    if (thing === 'amulet') { pl.maxHp += ITEM_FX.amulet.maxHp; pl.hp += ITEM_FX.amulet.maxHp; }
    return { ok: true };
  }
  return { ok: false, err: 'unknown' };
}

// ---- combat helpers -----------------------------------------------------

function applyKnockback(state, target, dx, dy, magnitude) {
  const { kbMult } = stats(target);
  // the lower your hp PERCENTAGE, the further you fly (full HP = baseline,
  // near-death ≈ 1+KB_HP_FACTOR). Cape still multiplies on top. Deliberately
  // NO size/radius term: small and big bodies take identical impulses —
  // being big must only ever be a disadvantage (bigger target).
  const hpFrac = clamp(target.hp / target.maxHp, 0, 1);
  const hpScale = 1 + PLAYER.KB_HP_FACTOR * (1 - hpFrac);
  target.vx += dx * magnitude * kbMult * hpScale;
  target.vy += dy * magnitude * kbMult * hpScale;
}

// opts.stamp: whether this damage claims the "last hitter" slot (kill/lava
// credit). Direct hits do; DoT ticks (poison, trails) must NOT — a 30 Hz
// poison tick would otherwise re-stamp forever and steal every lava kill
// from the player who actually landed the shove.
function applyDamage(state, target, amount, sourceId, { silent = false, stamp = true } = {}) {
  if (!target.alive) return;
  const effective = Math.min(amount, Math.max(0, target.hp)); // no overkill credit
  target.hp -= amount;
  // damage attribution: the direct source — or, for sourceless lava ticks,
  // the last hitter within the kill-credit window (they knocked the victim
  // in; the burn is theirs by the same rule that credits the kill)
  let creditId = sourceId != null && sourceId !== target.id ? sourceId : null;
  if (creditId == null && sourceId == null && target.lastHitBy &&
      target.lastHitBy.id !== target.id &&
      state.time - target.lastHitBy.t <= ROUND.KILL_CREDIT_WINDOW) {
    creditId = target.lastHitBy.id;
  }
  if (creditId != null) {
    const cr = state.players[creditId];
    if (cr) cr.dmgDealt += effective;
  }
  if (sourceId != null && sourceId !== target.id) {
    if (stamp) target.lastHitBy = { id: sourceId, t: state.time };
    const src = state.players[sourceId];
    if (src && src.alive) {
      const { lifesteal } = stats(src);
      if (lifesteal > 0) src.hp = Math.min(src.maxHp, src.hp + amount * lifesteal);
    }
  }
  if (!silent)
    state.events.push({ t: 'hit', id: target.id, amount, x: target.x, y: target.y });
  if (target.hp <= 0) kill(state, target, sourceId);
}

function kill(state, target, directSourceId) {
  target.hp = 0;
  target.alive = false;
  target.deaths++;
  target.moveTarget = null;
  target.dash = null;
  target.charging = null;
  // credit: direct source, else last hitter within the window
  let killerId = directSourceId != null && directSourceId !== target.id ? directSourceId : null;
  if (killerId == null && target.lastHitBy &&
      state.time - target.lastHitBy.t <= ROUND.KILL_CREDIT_WINDOW) {
    killerId = target.lastHitBy.id;
  }
  const killer = killerId != null ? state.players[killerId] : null;
  if (killer && killer !== target) {
    // bounty: pays only when the victim was AHEAD of the killer on kills
    // (gap taken before this kill counts). The leader can never collect one,
    // which is what keeps the 2x income hard cap in constants.js intact.
    const gap = target.kills - killer.kills;
    const bounty = Math.min(GOLD.BOUNTY_MAX,
      Math.max(0, Math.floor(gap * GOLD.BOUNTY_PER_GAP)));
    killer.kills++;
    killer.roundKills++;
    killer.gold += GOLD.PER_KILL + bounty;
    killer.goldEarned += GOLD.PER_KILL + bounty;
    if (bounty > 0) {
      killer.roundBounty = (killer.roundBounty || 0) + bounty;
      state.events.push({ t: 'gold', id: killer.id, amount: bounty, x: target.x, y: target.y });
    }
  }
  if (!Object.values(state.players).some(p => p.deaths > 0 && p !== target && p.diedFirstRound === state.round)) {
    target.diedFirstRound = state.round;
  }
  state.events.push({ t: 'death', id: target.id, killer: killerId, x: target.x, y: target.y });
}

// ---- round flow ---------------------------------------------------------

export function startGame(state) {
  if (state.phase !== 'lobby') return;
  startRound(state);
}

function startRound(state) {
  state.round++;
  state.phase = 'countdown';
  state.phaseT = ROUND.COUNTDOWN;
  state.time = 0;
  state.arenaRadius = ARENA.START_RADIUS;
  state.graceT = ARENA.OVERTIME_GRACE;
  state.pillars = makePillars(state);
  state.projectiles = [];
  state.delayedShots = [];
  state.hazards = [];
  state.meteors = [];
  state.walls = [];
  const fs = fighters(state);
  state.roundFighters = fs.length;
  const r = ARENA.START_RADIUS * ARENA.SPAWN_RADIUS_FRAC;
  fs.forEach((pl, i) => {
    const a = (i / fs.length) * Math.PI * 2 - Math.PI / 2;
    pl.x = Math.cos(a) * r; pl.y = Math.sin(a) * r;
    pl.vx = 0; pl.vy = 0;
    pl.moveTarget = null;
    pl.hp = pl.maxHp;
    pl.alive = true;
    pl.cooldowns = {};
    pl.inLava = false; pl.shieldT = 0; pl.dash = null; pl.charging = null;
    pl.slowT = 0; pl.slowMultHit = 1;
    pl.poisonT = 0; pl.poisonDps = 0; pl.poisonBy = null; pl._poisonAcc = 0;
    pl.growT = 0; pl.growMultHit = 1; pl.echoN = 0;
    pl.lastHitBy = null;
    pl.roundKills = 0;
    pl.roundBounty = 0;
    pl.shopReady = false;
  });
  for (const pl of Object.values(state.players)) {
    if (pl.spectator) { pl.alive = false; pl.shopReady = false; }
  }
  updateRadii(state);
  state.events.push({ t: 'round', n: state.round });
}

// Obsidian pillars: a fixed ring near the rim, slight per-pillar angle jitter
// from the seeded rng so every round reads a little different but stays
// deterministic (and identical on server and in replays).
function makePillars(state) {
  const { COUNT, RADIUS, RING, BASE_ANGLE, JITTER } = ARENA.PILLARS;
  const out = [];
  for (let i = 0; i < COUNT; i++) {
    const a = BASE_ANGLE + (i / COUNT) * Math.PI * 2 + (rng(state) - 0.5) * JITTER;
    out.push({ x: Math.cos(a) * RING, y: Math.sin(a) * RING, r: RADIUS, sunk: false });
  }
  return out;
}

function endRound(state) {
  const alive = fighters(state).filter(p => p.alive);
  const winner = alive.length === 1 ? alive[0] : null;
  const income = {};
  const detail = {};
  for (const pl of fighters(state)) {
    // kill + bounty gold shown here, already granted at kill time
    let g = GOLD.ROUND_BASE + pl.roundKills * GOLD.PER_KILL + (pl.roundBounty || 0);
    pl.gold += GOLD.ROUND_BASE; pl.goldEarned += GOLD.ROUND_BASE;
    if (pl === winner) { pl.gold += GOLD.ROUND_WIN; pl.goldEarned += GOLD.ROUND_WIN; g += GOLD.ROUND_WIN; }
    if (pl.diedFirstRound === state.round) { pl.gold += GOLD.FIRST_DEATH; pl.goldEarned += GOLD.FIRST_DEATH; g += GOLD.FIRST_DEATH; }
    income[pl.id] = g;
    // itemized for the round-end banner: where did each gold piece come from
    detail[pl.id] = {
      base: GOLD.ROUND_BASE,
      kills: pl.roundKills * GOLD.PER_KILL,
      bounty: pl.roundBounty || 0,
      win: pl === winner ? GOLD.ROUND_WIN : 0,
      first: pl.diedFirstRound === state.round ? GOLD.FIRST_DEATH : 0,
    };
    pl.dash = null; pl.moveTarget = null;
    pl.shopReady = false;
  }
  state.projectiles = [];
  const topKills = Math.max(0, ...fighters(state).map(p => p.kills));
  state.roundSummary = {
    n: state.round, winner: winner ? winner.id : null, income, detail,
    final: topKills >= ROUND.KILLS_TO_WIN || state.round >= ROUND.MAX_ROUNDS,
  };
  state.events.push({ t: 'roundEnd', winner: winner ? winner.id : null });
  state.phase = 'roundEnd';
  state.phaseT = ROUND.SUMMARY_TIME;
}

function afterSummary(state) {
  if (state.roundSummary && state.roundSummary.final) {
    const ranked = fighters(state)
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || b.gold - a.gold);
    state.winner = ranked[0] ? ranked[0].id : null;
    state.phase = 'gameover';
    state.events.push({ t: 'gameover', winner: state.winner });
  } else {
    state.phase = 'shop';
    state.phaseT = ROUND.SHOP_TIME;
  }
}

// Mark a player done with shopping; when everyone (bots count as always
// done) is ready the next round starts early.
export function setShopReady(state, id, ready = true) {
  const pl = state.players[id];
  if (!pl || state.phase !== 'shop') return;
  pl.shopReady = !!ready;
}

// ---- main step ----------------------------------------------------------

export function step(state, dt) {
  switch (state.phase) {
    case 'lobby':
    case 'gameover':
      return;
    case 'countdown':
      state.phaseT -= dt;
      if (state.phaseT <= 0) { state.phase = 'battle'; state.time = 0; }
      return;
    case 'roundEnd':
      state.phaseT -= dt;
      if (state.phaseT <= 0) afterSummary(state);
      return;
    case 'shop': {
      state.phaseT -= dt;
      const everyoneReady = Object.values(state.players).length > 0 &&
        Object.values(state.players).every(p => p.bot || p.spectator || p.shopReady);
      if (state.phaseT <= 0 || everyoneReady) startRound(state);
      return;
    }
    case 'battle':
      stepBattle(state, dt);
      return;
  }
}

function stepBattle(state, dt) {
  state.time += dt;

  // arena shrink, integrated (not closed-form) so the RATE can adapt to
  // deaths: the fewer fighters standing, the faster the lava closes. After
  // the radius reaches MIN it holds for an overtime grace, then shrinks to
  // nothing (sudden death), so a round can never stall forever.
  const fsNow = fighters(state);
  const totalF = Math.max(1, state.roundFighters || fsNow.length);
  const aliveF = fsNow.filter(p => p.alive).length;
  if (state.arenaRadius > ARENA.MIN_RADIUS) {
    const baseRate = (ARENA.START_RADIUS - ARENA.MIN_RADIUS) / ARENA.SHRINK_TIME;
    const speedMult = 1 + ARENA.SHRINK_ADAPT * (1 - Math.min(aliveF, totalF) / totalF);
    state.arenaRadius = Math.max(ARENA.MIN_RADIUS, state.arenaRadius - baseRate * speedMult * dt);
  } else if (state.graceT > 0) {
    state.graceT = Math.max(0, state.graceT - dt);
  } else {
    state.arenaRadius = Math.max(0, state.arenaRadius - (ARENA.MIN_RADIUS / ARENA.OVERTIME_SHRINK) * dt);
  }

  // a pillar whose center the lava has passed is submerged: no collision,
  // no blocking, just a melting stub for the client to render. Player-placed
  // pillars also crumble when their timer runs out.
  state.pillars = state.pillars.filter(p => !p.until || p.until > state.time);
  for (const pil of state.pillars) pil.sunk = Math.hypot(pil.x, pil.y) > state.arenaRadius;

  // mirror walls expire
  if (state.walls.length) state.walls = state.walls.filter(w => w.until > state.time);

  // falling meteors: telegraph counts down, then the rock lands — heavy
  // damage and a radial blast for everyone under it (including the caster)
  if (state.meteors.length) {
    const rest = [];
    for (const m of state.meteors) {
      m.t -= dt;
      if (m.t > 0) { rest.push(m); continue; }
      const spec = SPELLS.meteor;
      state.events.push({ t: 'meteorHit', x: m.x, y: m.y, r: spec.radius });
      for (const pl of Object.values(state.players)) {
        if (!pl.alive) continue;
        const ddx = pl.x - m.x, ddy = pl.y - m.y;
        const dd = Math.hypot(ddx, ddy);
        if (dd > spec.radius + pl.radius) continue;
        const nx = dd > 1e-6 ? ddx / dd : 1, ny = dd > 1e-6 ? ddy / dd : 0;
        applyKnockback(state, pl, nx, ny, lvl(spec, 'knockback', m.level));
        applyDamage(state, pl, lvl(spec, 'damage', m.level),
          pl.id === m.owner ? null : m.owner);
      }
    }
    state.meteors = rest;
  }

  const players = Object.values(state.players);
  updateRadii(state);

  // venom ground trails (elemental; empty in classic): standing in one burns
  // slowly — direct damage credited to the trail's owner, plus the poison
  // tint. Doesn't touch an active stronger poison's dps.
  if (state.hazards && state.hazards.length) {
    state.hazards = state.hazards.filter(h => h.until > state.time);
    for (const pl of players) {
      if (!pl.alive) continue;
      for (const h of state.hazards) {
        if (h.owner === pl.id) continue;
        if (Math.hypot(pl.x - h.x, pl.y - h.y) <= h.r + pl.radius * 0.5) {
          applyDamage(state, pl, h.dps * dt, h.owner, { silent: true, stamp: false });
          if (pl.alive) pl.poisonT = Math.max(pl.poisonT, 0.3); // green tint
          break; // trails don't stack on one victim
        }
      }
    }
  }

  for (const pl of players) {
    if (!pl.alive) continue;
    const st = stats(pl);

    // cooldowns / timers
    for (const k of Object.keys(pl.cooldowns))
      pl.cooldowns[k] = Math.max(0, pl.cooldowns[k] - dt);
    if (pl.shieldT > 0) pl.shieldT = Math.max(0, pl.shieldT - dt);

    // elemental timed effects (all timers stay 0 in classic mode)
    if (pl.slowT > 0) pl.slowT = Math.max(0, pl.slowT - dt);
    if (pl.growT > 0) pl.growT = Math.max(0, pl.growT - dt);
    if (pl.poisonT > 0) {
      pl.poisonT = Math.max(0, pl.poisonT - dt);
      const dps = pl.poisonDps || 0; // per-hit strength (venom level)
      if (dps > 0) {
        pl._poisonAcc = (pl._poisonAcc || 0) + dps * dt;
        applyDamage(state, pl, dps * dt, pl.poisonBy, { silent: true, stamp: false });
        // surface the DoT as a green tick roughly once a second (cheap fx)
        if (pl.alive && pl._poisonAcc >= dps) {
          state.events.push({ t: 'hit', id: pl.id, amount: pl._poisonAcc, x: pl.x, y: pl.y, poison: true });
          pl._poisonAcc = 0;
        }
      }
    }

    // repulse charge: 2 s of visible wind-up, then a radial burst
    if (pl.charging) {
      pl.charging.left -= dt;
      if (pl.charging.left <= 0) {
        const spec = SPELLS.repulse;
        const level = pl.charging.level;
        pl.charging = null;
        state.events.push({ t: 'repulse', id: pl.id, x: pl.x, y: pl.y, r: lvl(spec, 'radius', level) });
        for (const other of players) {
          if (other === pl || !other.alive) continue;
          const ddx = other.x - pl.x, ddy = other.y - pl.y;
          const dd = Math.hypot(ddx, ddy);
          if (dd > lvl(spec, 'radius', level) + other.radius) continue;
          const nx = dd > 1e-6 ? ddx / dd : 1, ny = dd > 1e-6 ? ddy / dd : 0;
          if (other.shieldT > 0) continue; // shield holds the blast
          applyKnockback(state, other, nx, ny, lvl(spec, 'knockback', level));
          applyDamage(state, other, lvl(spec, 'damage', level), pl.id);
        }
      }
    }

    // dash movement (overrides normal control)
    if (pl.dash) {
      const spec = SPELLS.rush;
      const move = Math.min(spec.speed * dt, pl.dash.left);
      pl.x += pl.dash.dx * move; pl.y += pl.dash.dy * move;
      pl.dash.left -= move;
      // a pillar stops the dash cold
      if (resolvePillarHit(state, pl)) pl.dash = null;
    }
    if (pl.dash) {
      const spec = SPELLS.rush;
      for (const other of players) {
        if (other === pl || !other.alive || pl.dash.hit[other.id]) continue;
        if (Math.hypot(other.x - pl.x, other.y - pl.y) <= spec.hitRadius + other.radius) {
          pl.dash.hit[other.id] = true;
          // push outward: perpendicular to dash direction, away from the path
          const side = Math.sign((other.x - pl.x) * -pl.dash.dy + (other.y - pl.y) * pl.dash.dx) || 1;
          const kx = -pl.dash.dy * side * 0.8 + pl.dash.dx * 0.4;
          const ky = pl.dash.dx * side * 0.8 + pl.dash.dy * 0.4;
          const n = Math.hypot(kx, ky) || 1;
          applyKnockback(state, other, kx / n, ky / n, lvl(spec, 'knockback', pl.dash.level));
          applyDamage(state, other, lvl(spec, 'damage', pl.dash.level), pl.id);
        }
      }
      if (pl.dash.left <= 0) pl.dash = null;
    } else {
      // control movement toward target
      if (pl.moveTarget) {
        const dx = pl.moveTarget.x - pl.x, dy = pl.moveTarget.y - pl.y;
        const d = Math.hypot(dx, dy);
        if (d < PLAYER.STOP_EPSILON) pl.moveTarget = null;
        else {
          const move = Math.min(st.speed * dt, d);
          pl.x += (dx / d) * move; pl.y += (dy / d) * move;
        }
      }
    }

    // knockback velocity + friction
    pl.x += pl.vx * dt; pl.y += pl.vy * dt;
    const damp = Math.exp(-PLAYER.FRICTION * dt);
    pl.vx *= damp; pl.vy *= damp;

    // pillars: push the player out along the normal and kill the velocity
    // component INTO the pillar — knockback slams you against cover and stops
    collidePillars(state, pl);

    // lava (radius 0 = the whole world is lava). No lingering burn: step out
    // and the damage stops — the price is only paid while swimming.
    const inLava = state.arenaRadius <= 0 || Math.hypot(pl.x, pl.y) > state.arenaRadius;
    if (inLava) applyDamage(state, pl, LAVA.DPS * st.lavaMult * dt, null, { silent: true });
    if (pl.alive) pl.inLava = inLava;

    // regen
    if (pl.alive && st.regen > 0) pl.hp = Math.min(pl.maxHp, pl.hp + st.regen * dt);
  }

  // Echo Stone delayed fireballs (elemental; the list is empty in classic)
  if (state.delayedShots && state.delayedShots.length) {
    const rest = [];
    for (const ds of state.delayedShots) {
      ds.t -= dt;
      if (ds.t > 0) { rest.push(ds); continue; }
      const owner = state.players[ds.owner];
      if (owner && owner.alive) {
        spawnFireball(state, owner, ds.level, ds.dx, ds.dy);
        state.events.push({ t: 'cast', id: owner.id, spell: 'fireball', x: owner.x, y: owner.y, dx: ds.dx, dy: ds.dy });
      }
    }
    state.delayedShots = rest;
  }

  stepProjectiles(state, dt);

  // round end: needs ≥2 fighters to ever start ending (solo practice runs forever)
  const fs = fighters(state);
  const total = fs.length;
  const alive = fs.filter(p => p.alive).length;
  if (total >= 2 && alive <= 1) endRound(state);
  else if (total === 1 && alive === 0) endRound(state); // solo died: still cycle
}

// ---- pillar geometry ------------------------------------------------------

// Push a player out of any live pillar it overlaps (along the surface normal).
// Returns true if a hit was resolved. Position-only — used by the dash.
function resolvePillarHit(state, pl) {
  let hit = false;
  for (const pil of state.pillars) {
    if (pil.sunk) continue;
    const dx = pl.x - pil.x, dy = pl.y - pil.y;
    const d = Math.hypot(dx, dy);
    const min = pil.r + pl.radius;
    if (d >= min) continue;
    const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0;
    pl.x = pil.x + nx * min;
    pl.y = pil.y + ny * min;
    hit = true;
  }
  return hit;
}

// Full player-vs-pillar resolution: push out AND kill the inward velocity.
function collidePillars(state, pl) {
  for (const pil of state.pillars) {
    if (pil.sunk) continue;
    const dx = pl.x - pil.x, dy = pl.y - pil.y;
    const d = Math.hypot(dx, dy);
    const min = pil.r + pl.radius;
    if (d >= min) continue;
    const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0;
    pl.x = pil.x + nx * min;
    pl.y = pil.y + ny * min;
    const vn = pl.vx * nx + pl.vy * ny;
    if (vn < 0) { pl.vx -= vn * nx; pl.vy -= vn * ny; }
  }
}

// Smallest non-negative t where the unit-direction ray (ox,oy)+(dx,dy)t
// enters the circle, or null if it never does.
function rayCircleT(ox, oy, dx, dy, cx, cy, r) {
  const fx = ox - cx, fy = oy - cy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / 2, t2 = (-b + sq) / 2;
  if (t1 >= 0) return t1;
  if (t2 >= 0) return 0; // origin inside the pillar: blocked immediately
  return null;
}

function stepProjectiles(state, dt) {
  const players = Object.values(state.players);
  const keep = [];
  for (const pr of state.projectiles) {
    const spec = SPELLS[pr.type];
    // per-projectile radius (terra fireballs are larger); others use the spec
    const prRadius = pr.radius != null ? pr.radius : spec.radius;

    if (pr.type === 'boomerang' && pr.returning && !pr.lost) {
      // returning along its own path toward the LAUNCH point. The owner can
      // catch it anywhere on this leg (halves the remaining cooldown); once
      // it has flown past the launch point it is lost — straight on, forever.
      const owner = state.players[pr.owner];
      if (owner && owner.alive &&
          Math.hypot(owner.x - pr.x, owner.y - pr.y) < owner.radius + spec.radius) {
        owner.cooldowns.boomerang = (owner.cooldowns.boomerang || 0) / 2;
        state.events.push({ t: 'catch', id: owner.id, x: pr.x, y: pr.y });
        continue; // caught
      }
      if (pr.traveled >= spec.outDistance * 2 + 1) pr.lost = true; // grace past origin
    }

    const px0 = pr.x, py0 = pr.y; // for swept collision below
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    pr.traveled += Math.hypot(pr.vx, pr.vy) * dt;

    // venom rider: the fireball drips a toxic trail as it flies (elemental)
    if (pr.type === 'fireball' && pr.elements && pr.elements.venom) {
      const f = ELEMENTS.venom.fx;
      if (pr.traveled - (pr._trailAt || 0) >= f.trailStep) {
        pr._trailAt = pr.traveled;
        state.hazards.push({
          x: pr.x, y: pr.y, r: f.trailR, owner: pr.owner, dps: f.trailDps,
          until: state.time + efxV(f.trailT, pr.elements.venom),
        });
      }
    }

    // range expiry / world cull (fireballs have infinite range)
    if (pr.type === 'fireball' && pr.traveled >= spec.range) continue;
    if (pr.type === 'hook' && pr.traveled >= lvl(spec, 'range', pr.level)) continue;
    if (Math.hypot(pr.x, pr.y) > ARENA.START_RADIUS * 2) continue;
    if (pr.type === 'boomerang' && !pr.returning && pr.traveled >= spec.outDistance) {
      // turn: fly back toward the launch point (NOT the player). pr.hit is
      // deliberately KEPT: the out-leg knockback shoves victims along the
      // throw lane and the straight return would re-hit them for free — one
      // hit per enemy per throw; the return leg only threatens fresh targets
      pr.returning = true;
      const bx = (pr.ox ?? pr.x) - pr.x, by = (pr.oy ?? pr.y) - pr.y;
      const bd = Math.hypot(bx, by);
      if (bd > 1e-6) { pr.vx = (bx / bd) * spec.speed; pr.vy = (by / bd) * spec.speed; }
      else { pr.vx = -pr.vx; pr.vy = -pr.vy; }
    }

    // pillars eat projectiles (swept against this tick's segment)
    let blocked = false;
    for (const pil of state.pillars) {
      if (pil.sunk) continue;
      if (segmentPointDist(px0, py0, pr.x, pr.y, pil.x, pil.y) <= prRadius + pil.r) {
        state.events.push({ t: 'boom', x: pr.x, y: pr.y, spell: pr.type });
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    // mirror walls: ENEMY projectiles bounce (mirrored across the wall's
    // normal, ownership flips to the wall's owner); your own shots pass.
    // The side check stops a just-reflected shot from re-triggering.
    let mirrored = false;
    for (const w of state.walls) {
      if (w.owner === pr.owner) continue;
      const side = (pr.x - w.x1) * w.nx + (pr.y - w.y1) * w.ny;
      const vn = pr.vx * w.nx + pr.vy * w.ny;
      if (side * vn >= 0) continue; // moving away from the plane: no hit
      if (segSegDist(px0, py0, pr.x, pr.y, w.x1, w.y1, w.x2, w.y2) > prRadius + 0.4) continue;
      pr.vx -= 2 * vn * w.nx;
      pr.vy -= 2 * vn * w.ny;
      pr.owner = w.owner;
      pr.hit = {};
      pr.traveled = 0;
      if (pr.type === 'boomerang') {
        pr.returning = false; pr.lost = false;
        pr.ox = pr.x; pr.oy = pr.y;
      }
      state.events.push({ t: 'reflect', id: w.owner, x: pr.x, y: pr.y });
      mirrored = true;
      break;
    }
    if (mirrored) { keep.push(pr); continue; }

    // collide with players (swept: closest approach on this tick's segment)
    let dead = false;
    for (const other of players) {
      if (!other.alive || other.id === pr.owner || pr.hit[other.id]) continue;
      const dist = segmentPointDist(px0, py0, pr.x, pr.y, other.x, other.y);
      if (dist > prRadius + other.radius) continue;

      if (other.shieldT > 0) {
        // reflect: reverse velocity, transfer ownership
        pr.vx = -pr.vx; pr.vy = -pr.vy;
        pr.owner = other.id;
        pr.hit = {};
        pr.traveled = 0;
        if (pr.type === 'boomerang') {
          // the reflector re-launches it: fresh legs, returns to THIS spot
          pr.returning = false;
          pr.lost = false;
          pr.ox = pr.x; pr.oy = pr.y;
        }
        state.events.push({ t: 'reflect', id: other.id, x: pr.x, y: pr.y });
        break;
      }

      const v = Math.hypot(pr.vx, pr.vy) || 1;
      let dmg = lvl(spec, 'damage', pr.level);
      let kb = lvl(spec, 'knockback', pr.level);
      if (pr.elements) { // every rider element bends the numbers, stacking
        for (const [ek, el] of Object.entries(pr.elements)) {
          const f = ELEMENTS[ek].fx;
          if (f.dmgAdd) dmg += efxV(f.dmgAdd, el);
          if (f.kbAdd) kb += efxV(f.kbAdd, el);
          if (f.dmgMult) dmg *= efxV(f.dmgMult, el);
          if (f.kbMult) kb *= efxV(f.kbMult, el);
        }
      }
      if (kb) applyKnockback(state, other, pr.vx / v, pr.vy / v, kb);
      applyDamage(state, other, dmg, pr.owner);
      if (pr.elements) applyElementsHit(state, pr, other);
      state.events.push({ t: 'boom', x: pr.x, y: pr.y, spell: pr.type });

      // hook: yank the (surviving) victim to right BEHIND the caster —
      // momentum wiped, pillars still respected
      if (pr.type === 'hook' && other.alive) {
        const owner = state.players[pr.owner];
        if (owner && owner.alive) {
          other.x = owner.x - (pr.vx / v) * (owner.radius + other.radius + 0.6);
          other.y = owner.y - (pr.vy / v) * (owner.radius + other.radius + 0.6);
          other.vx = 0; other.vy = 0;
          other.moveTarget = null;
          resolvePillarHit(state, other);
          state.events.push({ t: 'hooked', id: other.id, x: other.x, y: other.y });
        }
      }

      if (pr.type === 'fireball' || pr.type === 'hook') dead = true; // pops on hit
      else pr.hit[other.id] = true;                 // boomerang passes through
      break;
    }
    if (!dead) keep.push(pr);
  }
  state.projectiles = keep;
}

// Elemental on-hit riders (frost / venom / midas / terra), each at its own
// level. Ember and gale are pure number tweaks handled at the
// damage/knockback computation above.
function applyElementsHit(state, pr, target) {
  for (const [ek, el] of Object.entries(pr.elements)) {
    const f = ELEMENTS[ek].fx;
    if (f.slowMult) {
      target.slowT = efxV(f.slowT, el);
      target.slowMultHit = efxV(f.slowMult, el);
    }
    if (f.dotDamage) {
      // re-hits REFRESH the duration; the dps never stacks
      target.poisonT = f.dotTime;
      target.poisonDps = efxV(f.dotDamage, el) / f.dotTime;
      target.poisonBy = pr.owner;
    }
    if (f.goldOnHit && pr.owner != null) {
      const owner = state.players[pr.owner];
      if (owner) {
        const pay = efxV(f.goldOnHit, el);
        owner.gold += pay;
        owner.goldEarned += pay;
        state.events.push({ t: 'gold', id: pr.owner, amount: pay, x: pr.x, y: pr.y });
      }
    }
    if (f.growMult) {
      target.growT = f.growT;
      target.growMultHit = efxV(f.growMult, el);
      state.events.push({ t: 'grow', id: target.id, x: target.x, y: target.y });
    }
  }
}

// ---- serialization ------------------------------------------------------

// Strip internals for the wire. Events are drained separately by the server.
export function snapshot(state) {
  const elemental = state.mode === 'elemental';
  const players = {};
  for (const [id, p] of Object.entries(state.players)) {
    players[id] = {
      id: p.id, name: p.name, color: p.color, bot: p.bot, avatar: p.avatar,
      kind: p.kind, build: p.build || null, shopReady: p.shopReady,
      x: round2(p.x), y: round2(p.y),
      hp: Math.ceil(p.hp), maxHp: p.maxHp,
      alive: p.alive, ready: p.ready,
      gold: p.gold, goldEarned: p.goldEarned, kills: p.kills, deaths: p.deaths,
      dmgDealt: Math.round(p.dmgDealt),
      spectator: p.spectator, radius: round2(p.radius),
      spells: p.spells, items: p.items,
      cooldowns: mapRound(p.cooldowns),
      shieldT: round2(p.shieldT),
      inLava: !!p.inLava,
      dashing: !!p.dash,
      charging: !!p.charging,
      // elemental-only wire fields — classic snapshots stay byte-identical
      ...(elemental ? {
        elements: p.elements,
        slow: p.slowT > 0, poison: p.poisonT > 0, grow: p.growT > 0,
      } : {}),
    };
  }
  return {
    phase: state.phase, phaseT: round2(state.phaseT),
    mode: state.mode,
    round: state.round, time: round2(state.time),
    arenaRadius: round2(state.arenaRadius),
    pillars: (state.pillars || []).map(p => ({
      x: round2(p.x), y: round2(p.y), r: round2(p.r), sunk: !!p.sunk,
    })),
    winner: state.winner,
    roundSummary: state.roundSummary || null,
    meteors: (state.meteors || []).map(m => ({ x: round2(m.x), y: round2(m.y), t: round2(m.t) })),
    walls: (state.walls || []).map(w => ({
      x1: round2(w.x1), y1: round2(w.y1), x2: round2(w.x2), y2: round2(w.y2), owner: w.owner,
    })),
    players,
    projectiles: state.projectiles.map(p => ({
      id: p.id, type: p.type, x: round2(p.x), y: round2(p.y),
      vx: round2(p.vx), vy: round2(p.vy), owner: p.owner,
      ...(p.elements ? { elements: p.elements } : {}),
    })),
    // venom ground trails, elemental only (a = remaining-life fade 0..1)
    ...(elemental ? {
      hazards: (state.hazards || []).map(h => ({
        x: round2(h.x), y: round2(h.y), r: round2(h.r),
        a: round2(clamp((h.until - state.time) / 1.5, 0, 1)),
      })),
    } : {}),
  };
}

// Smallest non-negative t where the unit ray (ox,oy)+(dx,dy)t crosses the
// segment a-b, or null. Solves p + t·d = a + s·(b−a) with s in [0,1].
function raySegT(ox, oy, dx, dy, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-9) return null; // parallel
  const t = ((ax - ox) * ey - (ay - oy) * ex) / denom;
  const s = ((ax - ox) * dy - (ay - oy) * dx) / denom;
  return t >= 0 && s >= 0 && s <= 1 ? t : null;
}

// Minimum distance between segments p1-p2 and q1-q2 (0 if they cross).
function segSegDist(p1x, p1y, p2x, p2y, q1x, q1y, q2x, q2y) {
  // proper intersection?
  const d = (x1, y1, x2, y2, x3, y3) => (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  const a = d(p1x, p1y, p2x, p2y, q1x, q1y), b = d(p1x, p1y, p2x, p2y, q2x, q2y);
  const c = d(q1x, q1y, q2x, q2y, p1x, p1y), e = d(q1x, q1y, q2x, q2y, p2x, p2y);
  if (a * b < 0 && c * e < 0) return 0;
  return Math.min(
    segmentPointDist(p1x, p1y, p2x, p2y, q1x, q1y),
    segmentPointDist(p1x, p1y, p2x, p2y, q2x, q2y),
    segmentPointDist(q1x, q1y, q2x, q2y, p1x, p1y),
    segmentPointDist(q1x, q1y, q2x, q2y, p2x, p2y),
  );
}

function segmentPointDist(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

function round2(v) { return Math.round(v * 100) / 100; }
function mapRound(o) {
  const r = {};
  for (const [k, v] of Object.entries(o)) if (v > 0.01) r[k] = round2(v);
  return r;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---- bot AI --------------------------------------------------------------
// Three difficulty tiers, dispatched on pl.kind (see BOTS in constants.js):
//   grunt     ★   wanders and throws — cannon fodder
//   berserker ★★  hyper-aggressive brawler, rushes in, shoves you off the rim
//   stalker   ★★★ dodges projectiles, leads its shots, teleport lava saves

export function stepBot(state, id, dt) {
  const pl = state.players[id];
  if (!pl || !pl.alive || state.phase !== 'battle') return;
  switch (pl.kind) {
    case 'berserker': stepBerserker(state, pl, dt); break;
    case 'stalker': stepStalker(state, pl, dt); break;
    default: stepGrunt(state, pl, dt); break;
  }
  pilotOwnedSpells(state, pl, dt);
  unwedgeFromPillars(state, pl, dt);
}

// Generic "use what you own" pilot. Each kind's native logic covers its own
// kit; this layer opportunistically casts the REST of a build's spells (a
// sniper-build grunt actually zaps, a boomer-build berserker actually
// throws). Native casts always win: cooldowns gate everything here. Runs on
// its own slow, jittered timer so bots don't turn into spell turrets.
function pilotOwnedSpells(state, pl, dt) {
  pl._pilotT = (pl._pilotT || 0) - dt;
  if (pl._pilotT > 0) return;
  pl._pilotT = 0.3 + rng(state) * 0.3;
  const arena = state.arenaRadius;
  const owns = (k) => (pl.spells[k] || 0) > 0 && (pl.cooldowns[k] || 0) <= 0;

  // lava saves for whoever owns the tools (stalker teleports natively; the
  // 1k-game study showed a build with unpiloted escapes is just dead gold:
  // berserker/escape won 0.9% of its games before this block existed)
  const dCenter = Math.hypot(pl.x, pl.y);
  if (dCenter > arena && arena > 2) {
    if (pl.kind !== 'stalker' && owns('teleport') &&
        castSpell(state, pl.id, 'teleport', 0, 0)) return;
    if (pl.kind !== 'berserker' && owns('rush') && !pl.dash &&
        castSpell(state, pl.id, 'rush', 0, 0)) return; // dash is 5x walk speed
  }

  const target = nearestEnemy(state, pl);
  if (!target) return;
  const tdx = target.x - pl.x, tdy = target.y - pl.y;
  const dist = Math.hypot(tdx, tdy) || 1;

  // shield an imminent projectile (stalker does this natively)
  if (pl.kind !== 'stalker' && owns('shield')) {
    const threat = scanThreats(state, pl, 0.4, 2.0);
    if (threat && castSpell(state, pl.id, 'shield', threat.pr.x, threat.pr.y)) return;
  }

  // pressure blink: a wounded grunt with a teleport gets out of melee range
  // (stalker does this natively; the berserker never retreats — by design)
  if (pl.kind === 'grunt' && owns('teleport') && arena > 2 &&
      pl.hp < pl.maxHp * 0.5 && dist < 5) {
    let ex = pl.x - (tdx / dist) * 14, ey = pl.y - (tdy / dist) * 14;
    if (Math.hypot(ex, ey) > arena - 4) { ex = 0; ey = 0; }
    if (castSpell(state, pl.id, 'teleport', ex, ey)) return;
  }

  // boomerang at anything the out-leg can reach. Aim error and engagement
  // range scale with the kind: a grunt lobbing lab-grade intercepts from max
  // range measured 58-77% win rates in grunt mirrors (nobody in that tier
  // dodges), so grunts only throw at closer targets, and sloppily.
  const boomMaxD = pl.kind === 'grunt' ? 20 : SPELLS.boomerang.outDistance + 4;
  if (owns('boomerang') && dist < boomMaxD) {
    const t = dist / SPELLS.boomerang.speed;
    const v = estVel(target);
    const errMult = pl.kind === 'grunt' ? 0.3 : pl.kind === 'berserker' ? 0.12 : 0.04;
    const err = (rng(state) - 0.5) * dist * errMult;
    if (castSpell(state, pl.id, 'boomerang',
        target.x + v.vx * t - (tdy / dist) * err,
        target.y + v.vy * t + (tdx / dist) * err)) return;
  }

  // lightning poke (stalker uses it natively); grunts stay a bit sloppy
  if (pl.kind !== 'stalker' && owns('lightning') && dist < SPELLS.lightning.range - 2) {
    const v = estVel(target);
    const err = pl.kind === 'grunt' ? (rng(state) - 0.5) * dist * 0.15 : 0;
    if (castSpell(state, pl.id, 'lightning',
        target.x + v.vx * 0.06 - (tdy / dist) * err,
        target.y + v.vy * 0.06 + (tdx / dist) * err)) return;
  }

  // rush as a WEAPON only against rim-standers (berserker rushes natively).
  // Blindly dashing to close the gap strands a grunt/stalker at point-blank
  // where it gets traded down — the study measured that as a 3-6% win rate.
  // Against prey near the rim, aim a hair center-side so the dash's
  // perpendicular shove throws them outward, into the lava.
  if (pl.kind !== 'berserker' && owns('rush') && !pl.dash &&
      dist > 3 && dist < SPELLS.rush.distance + 4) {
    const tc = Math.hypot(target.x, target.y);
    if (tc > arena * 0.55 && tc > 1) {
      const rx = target.x - (target.x / tc) * 1.2;
      const ry = target.y - (target.y / tc) * 1.2;
      const ex = pl.x + (tdx / dist) * SPELLS.rush.distance;
      const ey = pl.y + (tdy / dist) * SPELLS.rush.distance;
      if (Math.hypot(ex, ey) < arena - 1.5)
        castSpell(state, pl.id, 'rush', rx, ry);
    }
  }
}

// Anti-wedge: a bot that sits pressed against a pillar for >1 s while its
// path to the move target runs through that pillar gets its target nudged
// tangentially, so it walks around the column instead of grinding into it.
function unwedgeFromPillars(state, pl, dt) {
  let near = null, nearGap = Infinity;
  for (const pil of state.pillars) {
    if (pil.sunk) continue;
    const gap = Math.hypot(pl.x - pil.x, pl.y - pil.y) - pil.r - pl.radius;
    if (gap < nearGap) { nearGap = gap; near = pil; }
  }
  if (!near || nearGap > 1.5) { pl._wedgeT = 0; return; }
  pl._wedgeT = (pl._wedgeT || 0) + dt;
  if (pl._wedgeT < 1 || !pl.moveTarget || pl.dash) return;
  const mt = pl.moveTarget;
  // only intervene when the pillar actually blocks the intended path
  if (segmentPointDist(pl.x, pl.y, mt.x, mt.y, near.x, near.y) > near.r + pl.radius) return;
  const nx = pl.x - near.x, ny = pl.y - near.y;
  const n = Math.hypot(nx, ny) || 1;
  const side = pl._strafe || 1;
  const tx = (-ny / n) * side, ty = (nx / n) * side; // tangent around the pillar
  setMoveTarget(state, pl.id, pl.x + tx * 8, pl.y + ty * 8);
}

// -- shared bot helpers -----------------------------------------------------

function nearestEnemy(state, pl, hpWeight = 0) {
  // lowest (distance + hp*weight): weight 0 = strictly nearest,
  // small weight = prefer wounded targets among comparably close ones
  let best = null, bestScore = Infinity;
  for (const other of Object.values(state.players)) {
    if (other === pl || !other.alive) continue;
    const d = Math.hypot(other.x - pl.x, other.y - pl.y);
    const score = d + other.hp * hpWeight;
    if (score < bestScore) { best = other; bestScore = score; }
  }
  return best;
}

// A player's total velocity right now: knockback momentum + control movement.
function estVel(target) {
  let vx = target.vx, vy = target.vy;
  if (target.moveTarget && !target.dash) {
    const dx = target.moveTarget.x - target.x, dy = target.moveTarget.y - target.y;
    const d = Math.hypot(dx, dy);
    if (d > PLAYER.STOP_EPSILON) {
      const sp = stats(target).speed;
      vx += (dx / d) * sp; vy += (dy / d) * sp;
    }
  }
  return { vx, vy };
}

// First-order intercept: where to aim a projectile of speed s so it meets the
// target if the target keeps its current velocity. Falls back to the target's
// position when no intercept exists.
function interceptPoint(pl, target, s) {
  const { vx, vy } = estVel(target);
  const rx = target.x - pl.x, ry = target.y - pl.y;
  const a = vx * vx + vy * vy - s * s;
  const b = 2 * (rx * vx + ry * vy);
  const c = rx * rx + ry * ry;
  let t = Math.hypot(rx, ry) / s; // fallback: flight time to current position
  if (Math.abs(a) > 1e-6) {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
      const cand = Math.min(...[t1, t2].filter((v) => v > 0));
      if (Number.isFinite(cand)) t = cand;
    }
  }
  t = Math.min(t, 1.5); // don't lead absurdly far on distant targets
  return { x: target.x + vx * t, y: target.y + vy * t, t };
}

// Most urgent hostile projectile whose current velocity ray brings it within
// `margin` of the bot within `horizon` seconds.
function scanThreats(state, pl, horizon, margin) {
  let worst = null;
  for (const pr of state.projectiles) {
    if (pr.owner === pl.id) continue;
    const px = pl.x - pr.x, py = pl.y - pr.y;
    const v2 = pr.vx * pr.vx + pr.vy * pr.vy;
    if (v2 < 1e-6) continue;
    const t = (px * pr.vx + py * pr.vy) / v2; // time of closest approach
    if (t < 0 || t > horizon) continue;
    const miss = Math.hypot(px - pr.vx * t, py - pr.vy * t);
    if (miss > margin) continue;
    if (!worst || t < worst.t) worst = { pr, t, miss };
  }
  return worst;
}

// -- grunt ★: wanders, spams fireballs with sloppy aim ----------------------

function stepGrunt(state, pl, dt) {
  const id = pl.id;
  pl._botT = (pl._botT || 0) - dt;
  if (pl._botT > 0) return;
  pl._botT = 0.25 + rng(state) * 0.3;

  // stay away from lava: head toward a safe ring
  const d = Math.hypot(pl.x, pl.y);
  const safe = Math.max(2, state.arenaRadius - 6);
  if (d > safe) {
    const s = (safe - 2) / (d || 1);
    setMoveTarget(state, id, pl.x * s, pl.y * s);
  } else if (rng(state) < 0.35) {
    const a = rng(state) * Math.PI * 2, r = rng(state) * safe;
    setMoveTarget(state, id, Math.cos(a) * r, Math.sin(a) * r);
  }

  // shoot nearest enemy with a bit of aim error
  const best = nearestEnemy(state, pl);
  if (best && (pl.cooldowns.fireball || 0) <= 0) {
    const bestD = Math.hypot(best.x - pl.x, best.y - pl.y);
    const err = (rng(state) - 0.5) * bestD * 0.25;
    // lead the target a little using its knockback velocity
    const tx = best.x + best.vx * 0.15 - (best.y - pl.y) / (bestD || 1) * err;
    const ty = best.y + best.vy * 0.15 + (best.x - pl.x) / (bestD || 1) * err;
    castSpell(state, id, 'fireball', tx, ty);
  }
}

// Berserker target choice: closest wins, but wounded, isolated, or
// rim-standing enemies are tastier. Lower score = better prey.
function pickPrey(state, pl) {
  const arena = Math.max(state.arenaRadius, 1);
  const enemies = Object.values(state.players)
    .filter((o) => o !== pl && o.alive);
  let best = null, bestScore = Infinity;
  for (const e of enemies) {
    const d = Math.hypot(e.x - pl.x, e.y - pl.y);
    let crowd = 0; // how much backup this enemy has nearby
    for (const o of enemies) {
      if (o === e) continue;
      crowd += Math.max(0, 18 - Math.hypot(o.x - e.x, o.y - e.y));
    }
    const rim = Math.min(1, Math.hypot(e.x, e.y) / arena); // 1 = at the edge
    const score = d * 0.8 + e.hp * 0.35 + crowd * 0.8 - rim * 8;
    if (score < bestScore) { best = e; bestScore = score; }
  }
  return best;
}

// -- berserker ★★: relentless brawler ---------------------------------------
// Hunts the nearest (slightly preferring wounded) enemy, rushes to close,
// fireballs point-blank with intercept aim, and herds rim-standers into the
// lava by aiming past them. Only ever retreats from the lava edge itself.

function stepBerserker(state, pl, dt) {
  const id = pl.id;
  pl._botT = (pl._botT || 0) - dt;
  if (pl._botT > 0) return;
  pl._botT = 0.14 + rng(state) * 0.1;

  const arena = state.arenaRadius;
  const dCenter = Math.hypot(pl.x, pl.y);

  // hard lava avoidance — the one concession to self-preservation.
  // Predictive: knockback momentum about to dump us in counts as danger.
  const fx = pl.x + pl.vx * 0.35, fy = pl.y + pl.vy * 0.35;
  const fleeing = dCenter > arena - 2.5 || Math.hypot(fx, fy) > arena - 1;
  if (fleeing) {
    // already swimming? rush toward center — the dash is 5x walk speed
    if (dCenter > arena && (pl.spells.rush || 0) > 0 &&
        (pl.cooldowns.rush || 0) <= 0 && !pl.dash &&
        castSpell(state, id, 'rush', 0, 0)) return;
    const s = Math.max(0, arena - 6) / (dCenter || 1);
    setMoveTarget(state, id, pl.x * s, pl.y * s);
  }

  // hunt the best prey: near, wounded, isolated from its friends (charging
  // into the middle of a pack is how a brawler dies), near the rim (shovable)
  const target = pickPrey(state, pl);
  if (!target) return;
  const tdx = target.x - pl.x, tdy = target.y - pl.y;
  const dist = Math.hypot(tdx, tdy) || 1;

  // rush to close the gap (never dash into the lava though). Against prey
  // near the rim, aim the dash a hair center-side of them: the dash shoves
  // victims away from its path, i.e. straight out into the lava.
  if (!fleeing && (pl.spells.rush || 0) > 0 && (pl.cooldowns.rush || 0) <= 0 &&
      dist > 2.5 && dist < SPELLS.rush.distance + 5) {
    const v = estVel(target);
    let rx = target.x + v.vx * 0.15, ry = target.y + v.vy * 0.15;
    const tc = Math.hypot(target.x, target.y);
    if (tc > arena * 0.5 && tc > 1) {
      rx -= (target.x / tc) * 1.2;
      ry -= (target.y / tc) * 1.2;
    }
    const ex = pl.x + (tdx / dist) * SPELLS.rush.distance;
    const ey = pl.y + (tdy / dist) * SPELLS.rush.distance;
    if (Math.hypot(ex, ey) < arena - 1.5 &&
        castSpell(state, id, 'rush', rx, ry)) return;
  }

  // prowl a tight ring around the prey, biased toward its center side (so
  // our knockback shoves them outward and theirs shoves us to safety), with a
  // constant tangential strafe that grunt-grade aim can't track. Dive to
  // point-blank only for the finish.
  if (!fleeing) {
    if (!pl._strafe) pl._strafe = rng(state) < 0.5 ? 1 : -1;
    else if (rng(state) < 0.14) pl._strafe = -pl._strafe;
    const ring = target.hp <= 30 ? 1.5 : 8.5; // wounded prey gets no breathing room
    const tCenter = Math.hypot(target.x, target.y) || 1;
    // blend "our side of the prey" with "the center side of the prey"
    let dx = -(tdx / dist) * 0.5 - (target.x / tCenter) * 0.5;
    let dy = -(tdy / dist) * 0.5 - (target.y / tCenter) * 0.5;
    const dn = Math.hypot(dx, dy) || 1;
    // strafe grows with distance: a straight-line charge is a shooting-range
    // target, a spiral approach walks between the incoming fireballs
    const sw = Math.min(10, 4 + dist * 0.3) * pl._strafe;
    const cx = target.x + (dx / dn) * ring - (tdy / dist) * sw;
    const cy = target.y + (dy / dn) * ring + (tdx / dist) * sw;
    setMoveTarget(state, id, cx, cy);
  }

  // fireball with intercept aim; near the rim, aim past the target toward
  // the outside so the knockback shoves them into the lava (a ~10u shove —
  // worth far more than the fireball's damage). Shoot whoever is closest,
  // except when someone in range is one fireball from death — secure that.
  let mark = null;
  for (const o of Object.values(state.players)) {
    if (o === pl || !o.alive || o.hp > 16) continue;
    if (Math.hypot(o.x - pl.x, o.y - pl.y) > 24) continue;
    if (!mark || o.hp < mark.hp) mark = o;
  }
  if (!mark) mark = nearestEnemy(state, pl);
  if (mark && (pl.cooldowns.fireball || 0) <= 0) {
    const mdx = mark.x - pl.x, mdy = mark.y - pl.y;
    const mDist = Math.hypot(mdx, mdy) || 1;
    const aim = interceptPoint(pl, mark, SPELLS.fireball.speed);
    let ax = aim.x, ay = aim.y;
    const mCenter = Math.hypot(mark.x, mark.y);
    // only bend the shot outward when we're already shooting outward-ish,
    // otherwise the shift just turns a clean intercept into a whiff
    const outward = (mdx * mark.x + mdy * mark.y) / (mDist * (mCenter || 1));
    if (mCenter > arena * 0.55 && mCenter > 1 && outward > 0.5) {
      ax += (mark.x / mCenter) * 2.5;
      ay += (mark.y / mCenter) * 2.5;
    }
    const err = (rng(state) - 0.5) * mDist * 0.12;
    castSpell(state, id, 'fireball', ax - (mdy / mDist) * err, ay + (mdx / mDist) * err);
  }
}

// -- stalker ★★★: the skilled one -------------------------------------------
// Sidesteps incoming projectiles (or shields when there's no time), leads its
// fireballs with a real intercept solve, finishes with lightning, teleports
// out of lava and point-blank pressure, and kites harder when hurt.

function stepStalker(state, pl, dt) {
  const id = pl.id;
  pl._dodgeT = Math.max(0, (pl._dodgeT || 0) - dt); // dodge-hold countdown
  pl._botT = (pl._botT || 0) - dt;
  if (pl._botT > 0) return;
  pl._botT = 0.12 + rng(state) * 0.08; // short human-ish reaction, not aimbot

  const arena = state.arenaRadius;
  const dCenter = Math.hypot(pl.x, pl.y);

  // -- lava save: in the lava now, or momentum about to carry us in
  const fx = pl.x + pl.vx * 0.35, fy = pl.y + pl.vy * 0.35;
  const doomed = dCenter > arena || Math.hypot(fx, fy) > arena + 0.3;
  if (doomed) {
    if (arena > 2 && (pl.spells.teleport || 0) > 0 &&
        (pl.cooldowns.teleport || 0) <= 0 &&
        castSpell(state, id, 'teleport', 0, 0)) return; // blink toward center
    const s = Math.max(0, arena - 6) / (dCenter || 1);
    setMoveTarget(state, id, pl.x * s, pl.y * s); // no teleport: sprint inward
  }

  // -- projectile threat: sidestep off the ray, or shield if it's too late.
  // A triggered dodge is held (no kiting) until the projectile has passed —
  // otherwise the kite step would walk straight back into the shot.
  const threat = scanThreats(state, pl, 0.8, 2.5);
  let dodging = pl._dodgeT > 0;
  if (threat) {
    if (threat.t < 0.35 && threat.miss < 1.9 &&
        (pl.spells.shield || 0) > 0 && (pl.cooldowns.shield || 0) <= 0) {
      castSpell(state, id, 'shield', threat.pr.x, threat.pr.y);
    } else {
      const v = Math.hypot(threat.pr.vx, threat.pr.vy) || 1;
      const nx = -threat.pr.vy / v, ny = threat.pr.vx / v; // perpendicular
      const hop = 4.5;
      // keep dodging to whichever side of the ray we're already on; only a
      // dead-on shot leaves the choice open — then pick the side off the lava
      const off = (pl.x - threat.pr.x) * nx + (pl.y - threat.pr.y) * ny;
      let side;
      if (Math.abs(off) > 0.7) side = off > 0 ? 1 : -1;
      else {
        const d1 = Math.hypot(pl.x + nx * hop, pl.y + ny * hop);
        const d2 = Math.hypot(pl.x - nx * hop, pl.y - ny * hop);
        side = d1 <= d2 ? 1 : -1;
      }
      setMoveTarget(state, id, pl.x + nx * hop * side, pl.y + ny * hop * side);
      dodging = true;
      pl._dodgeT = threat.t + 0.15;
    }
  }

  const target = nearestEnemy(state, pl, 0.04);
  if (!target) return;
  const tdx = target.x - pl.x, tdy = target.y - pl.y;
  const dist = Math.hypot(tdx, tdy) || 1;

  // -- escape point-blank pressure with a blink
  if (!doomed && dist < 4.5 && pl.hp < 60 && arena > 2 &&
      (pl.spells.teleport || 0) > 0 && (pl.cooldowns.teleport || 0) <= 0) {
    let ex = pl.x - (tdx / dist) * 14, ey = pl.y - (tdy / dist) * 14;
    if (Math.hypot(ex, ey) > arena - 4) { ex = 0; ey = 0; }
    if (castSpell(state, id, 'teleport', ex, ey)) return;
  }

  // -- kite: hold a ring around the target, strafe, farther when hurt
  if (!dodging && !doomed) {
    const want = pl.hp < pl.maxHp * 0.4 ? 20 : 12;
    if (!pl._strafe) pl._strafe = rng(state) < 0.5 ? 1 : -1;
    else if (rng(state) < 0.12) pl._strafe = -pl._strafe;
    const ux = -tdx / dist, uy = -tdy / dist; // target -> us
    let mx = target.x + ux * want - uy * pl._strafe * 5;
    let my = target.y + uy * want + ux * pl._strafe * 5;
    const md = Math.hypot(mx, my), cap = Math.max(1.5, arena - 4);
    if (md > cap) { mx *= cap / md; my *= cap / md; }
    setMoveTarget(state, id, mx, my);
  }

  // -- lightning: finish the wounded or poke from afar (it's hitscan)
  if ((pl.spells.lightning || 0) > 0 && (pl.cooldowns.lightning || 0) <= 0 &&
      dist < SPELLS.lightning.range - 2 && (target.hp <= 20 || dist > 24)) {
    const v = estVel(target);
    castSpell(state, id, 'lightning', target.x + v.vx * 0.06, target.y + v.vy * 0.06);
  }

  // -- fireball with a proper intercept solve; error shrinks at close range
  if ((pl.spells.fireball || 0) > 0 && (pl.cooldowns.fireball || 0) <= 0) {
    const aim = interceptPoint(pl, target, SPELLS.fireball.speed);
    const err = (rng(state) - 0.5) * (0.4 + dist * 0.05);
    castSpell(state, id, 'fireball',
      aim.x - (tdy / dist) * err, aim.y + (tdx / dist) * err);
  }
}

// Bots spend their gold too (so long games stay challenging).
// Each kind has its own build order; buy() quietly skips what it can't afford
// or already owns, so re-running the list every shop just fills the gaps.
const BOT_BUILDS = {
  grunt: ['boots', 'fireball', 'amulet', 'teleport', 'fireball', 'cape',
    'lightning', 'ring', 'sword', 'treads', 'lightning', 'teleport'],
  berserker: ['fireball', 'fireball', 'rush', 'sword', 'amulet', 'boots',
    'rush', 'cape', 'treads'],
  stalker: ['teleport', 'fireball', 'lightning', 'boots', 'fireball',
    'shield', 'lightning', 'cape', 'ring', 'teleport', 'lightning', 'shield'],
};

// In elemental mode each bot kind commits to a fixed element (bought as soon
// as affordable) so bots-only elemental games exercise the effect code paths.
// Their combat logic needs no changes — elements apply passively on hit.
export const BOT_ELEMENTS = { berserker: 'gale', stalker: 'frost', grunt: 'ember' };

export function botShop(state, id) {
  const pl = state.players[id];
  if (!pl) return;
  if (state.mode === 'elemental')
    buy(state, id, BOT_ELEMENTS[pl.kind] || 'ember'); // one level per shop; maxes out quietly
  // an explicit build strategy (lobby pick) beats the kind's default list
  const order = (pl.build && BUILDS[pl.build] && BUILDS[pl.build].order) ||
    BOT_BUILDS[pl.kind] || BOT_BUILDS.grunt;
  for (const thing of order) {
    buy(state, id, thing); // ignores failures (owned / poor / maxed)
  }
}
