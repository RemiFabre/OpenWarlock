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

export function addPlayer(state, id, name, { bot = false, color, avatar, kind } = {}) {
  const n = Object.keys(state.players).length;
  state.players[id] = {
    id, name: String(name).slice(0, 16) || 'warlock', bot,
    color: color || COLORS[n % COLORS.length],
    avatar: typeof avatar === 'string' && avatar.trim() ? avatar.trim().slice(0, 8) : '🧙',
    kind: bot ? (kind || 'grunt') : null,
    shopReady: false,
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
  if (state.phase !== 'shop')
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
    pl.shopReady = false;
  });
  state.events.push({ t: 'round', n: state.round });
}

function endRound(state) {
  const alive = Object.values(state.players).filter(p => p.alive);
  const winner = alive.length === 1 ? alive[0] : null;
  const income = {};
  for (const pl of Object.values(state.players)) {
    let g = GOLD.ROUND_BASE + pl.roundKills * GOLD.PER_KILL; // kill gold shown, already granted at kill time
    pl.gold += GOLD.ROUND_BASE;
    if (pl === winner) { pl.gold += GOLD.ROUND_WIN; pl.score += SCORE.ROUND_WIN; g += GOLD.ROUND_WIN; }
    if (pl.diedFirstRound === state.round) { pl.gold += GOLD.FIRST_DEATH; g += GOLD.FIRST_DEATH; }
    income[pl.id] = g;
    pl.dash = null; pl.moveTarget = null;
    pl.shopReady = false;
  }
  state.projectiles = [];
  state.roundSummary = {
    n: state.round, winner: winner ? winner.id : null, income,
    final: state.round >= ROUND.TOTAL_ROUNDS,
  };
  state.events.push({ t: 'roundEnd', winner: winner ? winner.id : null });
  state.phase = 'roundEnd';
  state.phaseT = ROUND.SUMMARY_TIME;
}

function afterSummary(state) {
  if (state.roundSummary && state.roundSummary.final) {
    const ranked = Object.values(state.players)
      .sort((a, b) => b.score - a.score || b.kills - a.kills);
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
        Object.values(state.players).every(p => p.bot || p.shopReady);
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

    // range expiry / world cull (fireballs have infinite range)
    if (pr.type === 'fireball' && pr.traveled >= spec.range) continue;
    if (Math.hypot(pr.x, pr.y) > ARENA.START_RADIUS * 2) continue;
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
      id: p.id, name: p.name, color: p.color, bot: p.bot, avatar: p.avatar,
      kind: p.kind, shopReady: p.shopReady,
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
    roundSummary: state.roundSummary || null,
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

// ---- bot AI --------------------------------------------------------------
// Three difficulty tiers, dispatched on pl.kind (see BOTS in constants.js):
//   grunt     ★   wanders and throws — cannon fodder
//   berserker ★★  hyper-aggressive brawler, rushes in, shoves you off the rim
//   stalker   ★★★ dodges projectiles, leads its shots, teleport lava saves

export function stepBot(state, id, dt) {
  const pl = state.players[id];
  if (!pl || !pl.alive || state.phase !== 'battle') return;
  switch (pl.kind) {
    case 'berserker': return stepBerserker(state, pl, dt);
    case 'stalker': return stepStalker(state, pl, dt);
    default: return stepGrunt(state, pl, dt);
  }
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

export function botShop(state, id) {
  const pl = state.players[id];
  if (!pl) return;
  const order = BOT_BUILDS[pl.kind] || BOT_BUILDS.grunt;
  for (const thing of order) {
    buy(state, id, thing); // ignores failures (owned / poor / maxed)
  }
}
