// The whole game simulation. Pure-ish: no I/O, no wall clock, no randomness
// except through state.rng (seeded). Runs on the server; unit-testable.

import {
  ARENA, PLAYER, LAVA, ROUND, GOLD, SCORE, SPELLS, ITEMS, ITEM_FX, COLORS,
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

export function createGame({ seed = 1 } = {}) {
  return {
    phase: 'lobby',        // lobby | countdown | battle | shop | gameover
    phaseT: 0,             // time remaining in countdown/shop
    round: 0,
    time: 0,               // elapsed battle time this round
    arenaRadius: ARENA.START_RADIUS,
    players: {},
    projectiles: [],
    events: [],            // transient, drained by the server each snapshot
    nextId: 1,
    winner: null,
    seed,
  };
}

function rng(state) {
  if (!state._rng) state._rng = makeRng(state.seed);
  return state._rng();
}

// ---- players ------------------------------------------------------------

export function addPlayer(state, id, name, { bot = false, color } = {}) {
  const n = Object.keys(state.players).length;
  state.players[id] = {
    id, name: String(name).slice(0, 16) || 'warlock', bot,
    color: color || COLORS[n % COLORS.length],
    x: 0, y: 0, vx: 0, vy: 0,
    moveTarget: null,
    hp: PLAYER.MAX_HP, maxHp: PLAYER.MAX_HP,
    alive: false,          // becomes true at round start
    ready: false,
    gold: GOLD.START, score: 0, kills: 0, deaths: 0,
    spells: { fireball: 1 },
    items: [],
    cooldowns: {},
    burn: 0,               // afterburn time remaining
    shieldT: 0,
    dash: null,            // {dx, dy, left, hit:Set-as-object}
    lastHitBy: null,       // {id, t}  t = state.time when hit
    diedFirst: false,
    roundKills: 0,
  };
  return state.players[id];
}

export function removePlayer(state, id) {
  delete state.players[id];
  // drop their projectiles' ownership but let them fly
  for (const p of state.projectiles) if (p.owner === id) p.owner = null;
}

function stats(pl) {
  let speed = PLAYER.SPEED, lavaMult = 1, kbMult = 1, regen = 0, lifesteal = 0;
  let maxHp = PLAYER.MAX_HP, afterburnImmune = false;
  for (const it of pl.items) {
    const fx = ITEM_FX[it];
    if (!fx) continue;
    if (fx.speedMult) speed *= fx.speedMult;
    if (fx.lavaMult != null) { lavaMult *= fx.lavaMult; afterburnImmune = true; }
    if (fx.kbMult) kbMult *= fx.kbMult;
    if (fx.regen) regen += fx.regen;
    if (fx.lifesteal) lifesteal += fx.lifesteal;
    if (fx.maxHp) maxHp += fx.maxHp;
  }
  return { speed, lavaMult, kbMult, regen, lifesteal, maxHp, afterburnImmune };
}

// Per-level value helper: spec fields may be scalar or per-level arrays.
function lvl(spec, field, level) {
  const v = spec[field];
  return Array.isArray(v) ? v[Math.min(level, v.length) - 1] : v;
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
  if (pl.dash) return false;

  let dx = tx - pl.x, dy = ty - pl.y;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  pl.cooldowns[key] = lvl(spec, 'cooldown', level);

  switch (key) {
    case 'fireball':
    case 'boomerang': {
      // spawn at the caster: the owner is excluded from collisions, and this
      // makes point-blank shots connect instead of spawning past the target
      state.projectiles.push({
        id: state.nextId++, type: key, owner: id, level,
        x: pl.x + dx * PLAYER.RADIUS * 0.5,
        y: pl.y + dy * PLAYER.RADIUS * 0.5,
        vx: dx * spec.speed, vy: dy * spec.speed,
        traveled: 0,
        returning: false,           // boomerang only
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
  }
  state.events.push({ t: 'cast', id, spell: key, x: pl.x, y: pl.y, dx, dy });
  return true;
}

function fireLightning(state, pl, level, dx, dy) {
  const spec = SPELLS.lightning;
  // hitscan: first live enemy within `width` of the ray, up to `range`
  let best = null, bestT = Infinity;
  for (const other of Object.values(state.players)) {
    if (other === pl || !other.alive) continue;
    const ox = other.x - pl.x, oy = other.y - pl.y;
    const t = ox * dx + oy * dy;                 // projection along ray
    if (t < 0 || t > spec.range) continue;
    const perp = Math.abs(ox * dy - oy * dx);    // distance from ray
    if (perp <= spec.width + PLAYER.RADIUS && t < bestT) { best = other; bestT = t; }
  }
  const endT = best ? bestT : spec.range;
  state.events.push({
    t: 'beam', id: pl.id,
    x1: pl.x, y1: pl.y, x2: pl.x + dx * endT, y2: pl.y + dy * endT,
  });
  if (best) {
    if (best.shieldT > 0) return; // shield blocks (no reflect for hitscan)
    applyKnockback(state, best, dx, dy, lvl(spec, 'knockback', level));
    applyDamage(state, best, lvl(spec, 'damage', level), pl.id);
  }
}

export function buy(state, id, thing) {
  const pl = state.players[id];
  if (!pl) return { ok: false, err: 'no player' };
  if (state.phase !== 'shop' && state.phase !== 'lobby')
    return { ok: false, err: 'shop is closed' };

  if (Object.hasOwn(SPELLS, thing)) {
    const spec = SPELLS[thing];
    const level = pl.spells[thing] || 0;
    if (level >= spec.maxLevel) return { ok: false, err: 'max level' };
    const cost = spec.costs[level];
    if (pl.gold < cost) return { ok: false, err: 'not enough gold' };
    pl.gold -= cost;
    pl.spells[thing] = level + 1;
    return { ok: true };
  }
  if (Object.hasOwn(ITEMS, thing)) {
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
  target.vx += dx * magnitude * kbMult;
  target.vy += dy * magnitude * kbMult;
}

function applyDamage(state, target, amount, sourceId, { silent = false } = {}) {
  if (!target.alive) return;
  target.hp -= amount;
  if (sourceId != null && sourceId !== target.id) {
    target.lastHitBy = { id: sourceId, t: state.time };
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
  // credit: direct source, else last hitter within the window
  let killerId = directSourceId != null && directSourceId !== target.id ? directSourceId : null;
  if (killerId == null && target.lastHitBy &&
      state.time - target.lastHitBy.t <= ROUND.KILL_CREDIT_WINDOW) {
    killerId = target.lastHitBy.id;
  }
  const killer = killerId != null ? state.players[killerId] : null;
  if (killer && killer !== target) {
    killer.kills++;
    killer.roundKills++;
    killer.gold += GOLD.PER_KILL;
    killer.score += SCORE.PER_KILL;
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
  state.projectiles = [];
  const ids = Object.keys(state.players);
  const r = ARENA.START_RADIUS * ARENA.SPAWN_RADIUS_FRAC;
  ids.forEach((id, i) => {
    const pl = state.players[id];
    const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
    pl.x = Math.cos(a) * r; pl.y = Math.sin(a) * r;
    pl.vx = 0; pl.vy = 0;
    pl.moveTarget = null;
    pl.hp = pl.maxHp;
    pl.alive = true;
    pl.cooldowns = {};
    pl.burn = 0; pl.shieldT = 0; pl.dash = null;
    pl.lastHitBy = null;
    pl.roundKills = 0;
  });
  state.events.push({ t: 'round', n: state.round });
}

function endRound(state) {
  const alive = Object.values(state.players).filter(p => p.alive);
  const winner = alive.length === 1 ? alive[0] : null;
  for (const pl of Object.values(state.players)) {
    pl.gold += GOLD.ROUND_BASE;
    if (pl === winner) { pl.gold += GOLD.ROUND_WIN; pl.score += SCORE.ROUND_WIN; }
    if (pl.diedFirstRound === state.round) pl.gold += GOLD.FIRST_DEATH;
    pl.dash = null; pl.moveTarget = null;
  }
  state.projectiles = [];
  state.events.push({ t: 'roundEnd', winner: winner ? winner.id : null });

  const champion = Object.values(state.players).find(p => p.score >= ROUND.SCORE_TO_WIN);
  if (champion || state.round >= ROUND.MAX_ROUNDS) {
    const ranked = Object.values(state.players).sort((a, b) => b.score - a.score);
    state.winner = ranked[0] ? ranked[0].id : null;
    state.phase = 'gameover';
    state.events.push({ t: 'gameover', winner: state.winner });
  } else {
    state.phase = 'shop';
    state.phaseT = ROUND.SHOP_TIME;
  }
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
    case 'shop':
      state.phaseT -= dt;
      if (state.phaseT <= 0) startRound(state);
      return;
    case 'battle':
      stepBattle(state, dt);
      return;
  }
}

function stepBattle(state, dt) {
  state.time += dt;

  // arena shrink; after an overtime grace it shrinks to nothing (sudden
  // death), so a round can never stall forever
  const f = Math.min(1, state.time / ARENA.SHRINK_TIME);
  state.arenaRadius = ARENA.START_RADIUS + (ARENA.MIN_RADIUS - ARENA.START_RADIUS) * f;
  const overtime = state.time - ARENA.SHRINK_TIME - ARENA.OVERTIME_GRACE;
  if (overtime > 0)
    state.arenaRadius = Math.max(0, ARENA.MIN_RADIUS * (1 - overtime / ARENA.OVERTIME_SHRINK));

  const players = Object.values(state.players);

  for (const pl of players) {
    if (!pl.alive) continue;
    const st = stats(pl);

    // cooldowns / timers
    for (const k of Object.keys(pl.cooldowns))
      pl.cooldowns[k] = Math.max(0, pl.cooldowns[k] - dt);
    if (pl.shieldT > 0) pl.shieldT = Math.max(0, pl.shieldT - dt);

    // dash movement (overrides normal control)
    if (pl.dash) {
      const spec = SPELLS.rush;
      const move = Math.min(spec.speed * dt, pl.dash.left);
      pl.x += pl.dash.dx * move; pl.y += pl.dash.dy * move;
      pl.dash.left -= move;
      for (const other of players) {
        if (other === pl || !other.alive || pl.dash.hit[other.id]) continue;
        if (Math.hypot(other.x - pl.x, other.y - pl.y) <= spec.hitRadius + PLAYER.RADIUS) {
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

    // lava (radius 0 = the whole world is lava)
    const inLava = state.arenaRadius <= 0 || Math.hypot(pl.x, pl.y) > state.arenaRadius;
    if (inLava) {
      applyDamage(state, pl, LAVA.DPS * st.lavaMult * dt, null, { silent: true });
      if (!st.afterburnImmune) pl.burn = LAVA.AFTERBURN_TIME;
    } else if (pl.burn > 0) {
      pl.burn = Math.max(0, pl.burn - dt);
      applyDamage(state, pl, LAVA.AFTERBURN_DPS * dt, null, { silent: true });
    }
    if (pl.alive) pl.inLava = inLava;

    // regen
    if (pl.alive && st.regen > 0) pl.hp = Math.min(pl.maxHp, pl.hp + st.regen * dt);
  }

  stepProjectiles(state, dt);

  // round end: needs ≥2 players to ever start ending (solo practice runs forever)
  const total = players.length;
  const alive = players.filter(p => p.alive).length;
  if (total >= 2 && alive <= 1) endRound(state);
  else if (total === 1 && alive === 0) endRound(state); // solo died: still cycle
}

function stepProjectiles(state, dt) {
  const players = Object.values(state.players);
  const keep = [];
  for (const pr of state.projectiles) {
    const spec = SPELLS[pr.type];

    if (pr.type === 'boomerang' && pr.returning) {
      // home toward owner's current position
      const owner = state.players[pr.owner];
      if (!owner) continue; // owner left: boomerang vanishes
      const dx = owner.x - pr.x, dy = owner.y - pr.y;
      const d = Math.hypot(dx, dy) || 1;
      pr.vx = (dx / d) * spec.speed; pr.vy = (dy / d) * spec.speed;
      if (d < PLAYER.RADIUS + spec.radius) continue; // caught
    }

    const px0 = pr.x, py0 = pr.y; // for swept collision below
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    pr.traveled += Math.hypot(pr.vx, pr.vy) * dt;

    // range expiry
    if (pr.type === 'fireball' && pr.traveled >= spec.range) continue;
    if (pr.type === 'boomerang' && !pr.returning && pr.traveled >= spec.outDistance) {
      pr.returning = true;
      pr.hit = {};
    }
    if (pr.type === 'boomerang' && pr.returning && pr.traveled > spec.outDistance + spec.homing) continue;

    // collide with players (swept: closest approach on this tick's segment)
    let dead = false;
    for (const other of players) {
      if (!other.alive || other.id === pr.owner || pr.hit[other.id]) continue;
      const dist = segmentPointDist(px0, py0, pr.x, pr.y, other.x, other.y);
      if (dist > spec.radius + PLAYER.RADIUS) continue;

      if (other.shieldT > 0) {
        // reflect: reverse velocity, transfer ownership
        pr.vx = -pr.vx; pr.vy = -pr.vy;
        pr.owner = other.id;
        pr.hit = {};
        pr.traveled = 0;
        if (pr.type === 'boomerang') pr.returning = false;
        state.events.push({ t: 'reflect', id: other.id, x: pr.x, y: pr.y });
        break;
      }

      const v = Math.hypot(pr.vx, pr.vy) || 1;
      applyKnockback(state, other, pr.vx / v, pr.vy / v, lvl(spec, 'knockback', pr.level));
      applyDamage(state, other, lvl(spec, 'damage', pr.level), pr.owner);
      state.events.push({ t: 'boom', x: pr.x, y: pr.y, spell: pr.type });

      if (pr.type === 'fireball') dead = true;      // fireball pops on hit
      else pr.hit[other.id] = true;                 // boomerang passes through
      break;
    }
    if (!dead) keep.push(pr);
  }
  state.projectiles = keep;
}

// ---- serialization ------------------------------------------------------

// Strip internals for the wire. Events are drained separately by the server.
export function snapshot(state) {
  const players = {};
  for (const [id, p] of Object.entries(state.players)) {
    players[id] = {
      id: p.id, name: p.name, color: p.color, bot: p.bot,
      x: round2(p.x), y: round2(p.y),
      hp: Math.ceil(p.hp), maxHp: p.maxHp,
      alive: p.alive, ready: p.ready,
      gold: p.gold, score: p.score, kills: p.kills, deaths: p.deaths,
      spells: p.spells, items: p.items,
      cooldowns: mapRound(p.cooldowns),
      shieldT: round2(p.shieldT),
      inLava: !!p.inLava, burn: p.burn > 0,
      dashing: !!p.dash,
    };
  }
  return {
    phase: state.phase, phaseT: round2(state.phaseT),
    round: state.round, time: round2(state.time),
    arenaRadius: round2(state.arenaRadius),
    winner: state.winner,
    players,
    projectiles: state.projectiles.map(p => ({
      id: p.id, type: p.type, x: round2(p.x), y: round2(p.y),
      vx: round2(p.vx), vy: round2(p.vy), owner: p.owner,
    })),
  };
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

// ---- bot AI (server-side practice dummies) ------------------------------

export function stepBot(state, id, dt) {
  const pl = state.players[id];
  if (!pl || !pl.alive || state.phase !== 'battle') return;
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
  let best = null, bestD = Infinity;
  for (const other of Object.values(state.players)) {
    if (other === pl || !other.alive) continue;
    const dd = Math.hypot(other.x - pl.x, other.y - pl.y);
    if (dd < bestD) { best = other; bestD = dd; }
  }
  if (best && (pl.cooldowns.fireball || 0) <= 0) {
    const err = (rng(state) - 0.5) * bestD * 0.25;
    // lead the target a little using its knockback velocity
    const tx = best.x + best.vx * 0.15 - (best.y - pl.y) / (bestD || 1) * err;
    const ty = best.y + best.vy * 0.15 + (best.x - pl.x) / (bestD || 1) * err;
    castSpell(state, id, 'fireball', tx, ty);
  }
}

// Bots spend their gold too (so long games stay challenging).
export function botShop(state, id) {
  const order = ['boots', 'fireball', 'amulet', 'teleport', 'fireball', 'cape',
    'lightning', 'ring', 'sword', 'treads', 'lightning', 'teleport'];
  for (const thing of order) {
    buy(state, id, thing); // ignores failures (owned / poor / maxed)
  }
}
