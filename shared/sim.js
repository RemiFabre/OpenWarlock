// The whole game simulation. Pure-ish: no I/O, no wall clock, no randomness
// except through state.rng (seeded). Runs on the server; unit-testable.

import {
  ARENA, PLAYER, LAVA, ROUND, GOLD, SPELLS, ITEMS, ITEM_FX, ELEMENTS, COLORS,
  BOTS, BUILDS, MULTIKILL_NAMES, BOT_MEMORY, BOT_TARGETING, DRAFT, itemCost,
} from './constants.js';
import { draftable, kindOf, ownedLevel } from './catalogue.js';
import { itemBonuses, itemFxDelta } from './items.js';
import {
  TEAM, ENEMY_COLOR, CAMPAIGN, MAX_LEVEL, levelFor, waveUnits, levelRoster,
} from './campaign.js';

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

// The rulesets a game can run. 'coop' is the campaign (see shared/campaign.js):
// a party (team 'party') against AI waves (team 'ai') instead of a free-for-all.
export const MODES = ['classic', 'elemental', 'coop'];

// 2026-08-08 (Remi): ELEMENTAL is the default ruleset now, and is no longer
// called experimental. Classic still exists and is still bit-for-bit the old
// game — it is just no longer what you land on.
export function createGame({ seed = 1, mode = 'elemental' } = {}) {
  return {
    phase: 'lobby',        // lobby | countdown | battle | shop | gameover
    phaseT: 0,             // time remaining in countdown/shop
    // Shop pause (2026-08-07, Remi: "sometimes I don't have time to read").
    // Freezes the shop COUNTDOWN only — buying, readying and everything else
    // keep working, and everyone being ready still starts the round. Holds the
    // name of whoever paused so the banner can say who, since anyone in the
    // lobby may pause or resume (same friends-lobby trust model as the bans).
    shopPaused: null,      // null = running, else the pauser's display name
    mode: MODES.includes(mode) ? mode : 'elemental',
    // Draft mode (docs/ROUND12.md S7) — an INDEPENDENT flag, not a fourth mode:
    // it composes with classic, elemental and co-op alike. OFF means every field
    // below stays exactly as it is here for the whole game, which is what keeps
    // classic byte-identical.
    draft: false,
    draftPool: null,       // [key] pulled out of the shop; rolled once per game
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
    bolts: [],             // lightning sky-bolts (round 17): {x,y,t,owner,level}
    walls: [],             // mirror walls: {x1,y1,x2,y2,nx,ny,owner,until}
    events: [],            // transient, drained by the server each snapshot
    nextId: 1,
    nextWaveId: 1,         // co-op: id counter for spawned campaign enemies
    coopLevel: 1,          // co-op: campaign progress (advances only on a clear)
    coopAttempt: 0,        // co-op: tries spent on the current level
    coop: null,            // co-op: {level, name, brief, roster, pending, ...}
    winner: null,
    seed,
  };
}

// Ruleset toggle — lobby only, so a running game can never change rules.
export function setMode(state, mode) {
  if (state.phase !== 'lobby') return false;
  if (!MODES.includes(mode)) return false;
  state.mode = mode;
  return true;
}

// Draft toggle — lobby only, same rule as the ruleset: a running game can never
// change the deal. Independent of `mode` on purpose (docs/ROUND12.md S7).
export function setDraft(state, on) {
  if (state.phase !== 'lobby') return false;
  state.draft = !!on;
  return true;
}

function rng(state) {
  if (!state._rng) state._rng = makeRng(state.seed);
  return state._rng();
}

// ---- players ------------------------------------------------------------

export function addPlayer(state, id, name, { bot = false, color, avatar, kind, build, team = null } = {}) {
  const n = Object.keys(state.players).length;
  state.players[id] = {
    id, name: String(name).slice(0, 16) || 'warlock', bot,
    color: color || COLORS[n % COLORS.length],
    avatar: typeof avatar === 'string' && avatar.trim() ? avatar.trim().slice(0, 8) : '🧙',
    // team: null = free-for-all (classic/elemental — everyone is everyone's
    // enemy, which is what keeps those rulesets byte-identical). In co-op the
    // party shares TEAM.PARTY and the campaign waves share TEAM.AI.
    team: team || null,
    sizeMult: 1,           // co-op: bosses are visibly bigger (see updateRadii)
    wave: false,           // co-op: true for a spawned campaign enemy
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
    roundGold: 0,          // gold earned THIS round (scoreboard column)
    dmgDealt: 0,           // damage you landed yourself (spells, DoT, trails)
    dmgLava: 0,            // lava burn credited to you (you shoved them in)
    // What KILLED you, from the receiving end. dmgDealt/dmgLava are the dealer's
    // view and only count CREDITED burn; these two are the victim's and always
    // add up to the total damage this body absorbed. Added 2026-08-07 to answer
    // "how much of the damage in this game is the lava?" — a question three
    // rounds of balance work had no number for, because uncredited lava burn was
    // recorded nowhere at all. Pure accounting: nothing reads them but the
    // scoreboard and the labs.
    dmgTakenLava: 0,       // burn absorbed from the lava (sourceId null)
    dmgTakenDirect: 0,     // damage absorbed from other players (any sourced hit)
    healLifesteal: 0,      // hp clawed back by the Blood Sword
    healRegen: 0,          // hp regenerated (baseline + rings)
    regenLockT: 0,         // seconds of suppressed regen after taking a hit
    multiKillBest: 0,      // best multi-kill streak this game (2 = double…)
    spectator: false,
    radius: PLAYER.RADIUS,
    spells: { fireball: 1 },
    items: {},           // owned item levels, e.g. {boots: 2, cape: 1}
    // draft mode only: this shop's free offer, {round, options:[key], picked}.
    // Stays null for the whole game when the toggle is off.
    draftOffer: null,
    cooldowns: {},
    shieldT: 0,
    // Vanish: seconds of invisibility left. NEVER goes on the wire for anyone
    // but you (snapshot() strips the whole position instead — see there), and it
    // is masked out of bot perception too (see seenBy/perceive).
    vanishT: 0,
    // ---- elemental mode only (all stay empty/0 for the whole game in classic)
    elements: {},          // owned element levels, e.g. {frost: 2, ember: 1}
    slowT: 0,              // frost: seconds of slow remaining
    slowMultHit: 1,        // frost: strength of the slow that hit us
    // Per-attacker stack store: {kind: {attackerId: n}}. Stacks are PRIVATE to
    // whoever applied them (2026-08-07, round 12 — reverses the shared-counter
    // decision: your element's power must not depend on what everyone else
    // picked). One generic store, three users today: frost, gale and mosquito.
    stacks: {},
    stunT: 0,              // frost lv3: seconds frozen solid (no move, no cast)
    poisonT: 0,            // venom: seconds of DoT remaining
    poisonTick: 0,         // venom: damage per 1 s tick (re-hits stack it)
    poisonBy: null,        // venom: who poisoned us (kill credit)
    vampN: 0,              // vampire: fireballs CAST this round (every 3rd is engorged)
    // momentum: fireball hits landed for the WHOLE GAME (the ramp is permanent
    // — deliberately NOT cleared in startRound, see ELEMENTS.momentum)
    momentumHits: 0,
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

// ---- friend or foe --------------------------------------------------------
// The universal rule used to be "any other alive player". It still is whenever
// either side has no team (team null = free-for-all), so classic/elemental
// behaviour is bit-for-bit unchanged. In co-op, same team = allies: their
// shots pass through each other, their AoE skips each other and their bots
// never target each other.
//
// FRIENDLY FIRE IS ON (2026-08-06, Remi): in co-op your spells hit your
// teammates for full damage and full knockback, lava included. So this is a
// TARGETING helper only — bots use it to pick who to hunt and what to dodge.
// It must NOT gate collision or damage, or friendly fire stops existing.

function hostile(a, b) {
  if (!a || !b) return true;   // unknown owner (left the game): hostile to all
  if (a === b) return false;
  return a.team == null || b.team == null || a.team !== b.team;
}


// The co-op party (everyone not on the AI team) and the live campaign enemies.
export function partyOf(state) {
  return fighters(state).filter(p => p.team !== TEAM.AI);
}
function waveOf(state) {
  return Object.values(state.players).filter(p => p.team === TEAM.AI);
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
  // co-op: campaign enemies are sized by their descriptor, not by the kill
  // lead, and they are EXCLUDED from the average. (Eight zero-kill wave bots
  // would otherwise collapse the mean and inflate the whole party toward the
  // 2.0x cap — the party would grow into giant targets for clearing waves.)
  const pool = state.mode === 'coop' ? fs.filter(p => p.team !== TEAM.AI) : fs;
  const avg = pool.length
    ? pool.reduce((sum, p) => sum + p.kills, 0) / pool.length : 0;
  const { PER_KILL, MIN, MAX } = PLAYER.SIZE_LEAD;
  for (const pl of fs) {
    if (pl.team === TEAM.AI) { pl.radius = PLAYER.RADIUS * (pl.sizeMult || 1); continue; }
    const mult = clamp(1 + PER_KILL * (pl.kills - avg), MIN, MAX);
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
  // items are levelled: itemBonuses() reads each owned level's ABSOLUTE total
  // out of ITEM_FX (see shared/items.js) — no compounding happens here.
  const { mult, add } = itemBonuses(pl.items);
  if (mult.speedMult != null) speed *= mult.speedMult;
  if (mult.lavaMult != null) lavaMult *= mult.lavaMult;
  if (mult.kbMult != null) kbMult *= mult.kbMult;
  regen += add.regen || 0;
  lifesteal += add.lifesteal || 0;
  maxHp += add.maxHp || 0;
  if (pl.inLava) speed *= LAVA.SPEED_MULT; // lava is fast — and it burns
  if (pl.slowT > 0) speed *= (pl.slowMultHit || 0.6); // frost chill (elemental)
  if (pl.stunT > 0) speed = 0;                        // frost stun (elemental)
  // recently hurt? regen is throttled. Without this a lv1 fireball (2.38 dps
  // if EVERY shot lands) loses to the 1.2 hp/s baseline and nobody can die.
  if (pl.regenLockT > 0) regen *= PLAYER.REGEN_LOCK_MULT;
  return { speed, lavaMult, kbMult, regen, lifesteal, maxHp };
}

// Effective stats after items/elements, for the shop panel, the stats table
// and tests. `stats()` itself stays private (it runs 30×/s in the hot loop).
export function playerStats(pl) {
  return stats(pl);
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

// ---- per-attacker stack store (elemental) ---------------------------------
// `target.stacks` is {kind: {attackerId: count}} — see addPlayer. Every stacking
// element goes through these three helpers, so "private to whoever applied it"
// is one mechanism rather than one implementation per element. An ownerless
// projectile (its caster left the game) can neither place nor spend a stack:
// there is nobody to own the counter.
function stackCount(target, kind, byId) {
  if (byId == null) return 0;
  const s = target.stacks && target.stacks[kind];
  return (s && s[byId]) || 0;
}

function addStack(target, kind, byId, n = 1) {
  if (byId == null) return 0;
  const store = target.stacks || (target.stacks = {});
  const s = store[kind] || (store[kind] = {});
  return (s[byId] = (s[byId] || 0) + n);
}

function clearStacks(target, kind, byId) {
  const s = target.stacks && target.stacks[kind];
  if (s && byId != null) delete s[byId];
}

// The worst single attacker's count of `kind` riding on this body. This is the
// only honest "a detonation is coming" reading now that counters are private,
// and it is shown to the victim only (snapshot's `stacksOnMe`).
function worstStack(target, kind) {
  const s = target.stacks && target.stacks[kind];
  if (!s) return 0;
  let max = 0;
  for (const n of Object.values(s)) if (n > max) max = n;
  return max;
}

// Mosquito level a player is flying with, or 0 (elemental mode only).
function mosquitoLevel(state, pl) {
  if (state.mode !== 'elemental') return 0;
  return (pl.elements && pl.elements.mosquito) || 0;
}

// Ability Haste (round 17, ex-CDR percentages): cd = base / (1 + haste/100),
// haste SUMS across sources. Additive stacking is the point — hourglass ×
// arcane used to COMPOUND (midas-cdr 86%, BALANCE.md question J).
// Hourglass (item, any mode): haste on everything you cast.
function hasteOf(state, pl) {
  const { add } = itemBonuses(pl.items);
  return add.haste || 0;
}

// Arcane (elemental, round 16): extra haste on the fireball only.
function fireballHasteOf(state, pl) {
  if (state.mode !== 'elemental') return 0;
  const el = pl.elements && pl.elements.arcane;
  return el ? efxV(ELEMENTS.arcane.fx.haste, el) : 0;
}

// Arcane lv3 (elemental, round 16 — chronos's old effect, narrowed to fireball
// hits): every FIREBALL of yours that lands on an enemy hands you `refund`
// seconds back off everything currently on cooldown, per enemy hit. Called
// from applyElementsHit, which only ever runs for a landed fireball's riders —
// that is the "only works when hitting fireball" rule by construction (a
// poison tick, a trail or a lightning bolt never gets here).
//
// ⚠ cdFloor: a refund never drives a cooldown to zero (that would allow a
// same-frame re-cast loop), and it never RAISES one that is already below the
// floor. Test-locked since the chronos era.
//
// ⚠ THE FIREBALL'S OWN COOLDOWN IS EXCLUDED (measured, 2026-08-08). Refunding
// the spell that triggers the refund is a positive feedback loop: with
// arcane's own lv1/2 CDR the fireball sits at ~1.5 s, so a 1 s refund per hit
// turned "land your shots" into a near-cooldownless machine gun — arcane alone
// measured 74% in the mixed element study (baseline 25%, 600 games × 2 seeds),
// and shrinking the refund to 0.5 s still measured 47%. Excluding the fireball
// keeps the crisp "−1 s" on everything else — the Rise-style "your fireball
// accelerates your whole kit" fantasy — and lands a dedicated cadence build at
// ~40-50% instead of 81%. One-line revert: delete the guard below (and re-run
// the sweep before believing the result).
function arcaneRefund(state, pl, refund, cdFloor) {
  let any = false;
  for (const k of Object.keys(pl.cooldowns)) {
    if (k === 'fireball') continue; // self-refund is a feedback loop, see above
    const cd = pl.cooldowns[k];
    if (cd > cdFloor) {
      pl.cooldowns[k] = Math.max(cdFloor, cd - refund);
      any = true;
    }
  }
  if (any) state.events.push({ t: 'refund', id: pl.id, x: pl.x, y: pl.y });
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
  if (pl.stunT > 0) return false; // frost lv3 stun: no casting either
  const level = pl.spells[key] || 0;
  if (level < 1) return false;
  // boomerang recall: while yours is still flying OUT, the key turns it round
  // early instead of being a dead press (the cooldown is running, so this has
  // to be checked before the cooldown gate). You pick the turn point.
  if (key === 'boomerang') {
    const mine = state.projectiles.find(
      p => p.type === 'boomerang' && p.owner === id && !p.returning);
    if (mine) { turnBoomerangHome(state, mine); return true; }
  }
  if ((pl.cooldowns[key] || 0) > 0) return false;
  // power combos (2026-08-05): a charging repulse may still reposition —
  // teleport/rush into the pack and let the burst land there. Everything
  // else stays locked, and mid-dash you may only START the charge.
  if (pl.dash && key !== 'repulse') return false;
  if (pl.charging && key !== 'teleport' && key !== 'rush') return false;

  let dx = tx - pl.x, dy = ty - pl.y;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  let haste = hasteOf(state, pl);
  // arcane (round 16): the fireball's own cadence axis
  if (key === 'fireball') haste += fireballHasteOf(state, pl);
  let cd = lvl(spec, 'cooldown', level) / (1 + haste / 100);
  // the mosquito is a pest, not a cannon: it stings for 1 at double the rate
  if (key === 'fireball' && mosquitoLevel(state, pl))
    cd *= efxV(ELEMENTS.mosquito.fx.cdMult, mosquitoLevel(state, pl));
  pl.cooldowns[key] = cd;

  switch (key) {
    case 'fireball': {
      // Vampire (elemental): the counter runs on YOUR CASTS, so unlike mosquito
      // it needs no setup on a particular target — every chargeEvery'th fireball
      // flies engorged and pays back a multiple of the damage it deals. Only a
      // real cast advances it: the Echo Stone's second ball and the mosquito
      // proc's balls are extra shots, not casts, so they neither tick the
      // counter nor inherit the engorgement (that would turn one charge into
      // two or three heals and delete the rhythm the counter exists to sell).
      let engorged = 0;
      const vampLv = state.mode === 'elemental' && pl.elements
        ? (pl.elements.vampire || 0) : 0;
      if (vampLv) {
        pl.vampN = (pl.vampN || 0) + 1;
        if (pl.vampN % ELEMENTS.vampire.fx.chargeEvery === 0)
          engorged = efxV(ELEMENTS.vampire.fx.chargeLifesteal, vampLv);
      }
      spawnFireball(state, pl, level, dx, dy, { engorged });
      // Echo Stone (elemental): every Nth fireball fires a second one shortly
      // after, along the same aim direction
      if (state.mode === 'elemental' && (pl.items.echo || 0) > 0) {
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
        pierce: true,               // never pops on a body: one hit each, flies on
        pierced: 0,
      });
      break;
    }
    case 'lightning': {
      // round 17: telegraphed sky-bolt on the meteor's path — the zone shows
      // instantly (snapshot carries state.bolts), the strike lands in stepBattle
      const dist = Math.min(d, spec.range);
      state.bolts.push({
        x: pl.x + dx * dist, y: pl.y + dy * dist,
        t: spec.delay, owner: id, level,
      });
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
    case 'vanish': {
      // No restrictions at all (Remi, docs/ROUND12.md N4): you keep casting,
      // hitting and being hit — the level buys duration only. Re-casting
      // refreshes rather than stacking.
      pl.vanishT = Math.max(pl.vanishT || 0, lvl(spec, 'duration', level));
      // Both this and the generic 'cast' event below carry a position, which for
      // an invisible player is exactly what must not leak — viewEvents drops
      // every event anchored on a hidden player, so they reach the caster only.
      state.events.push({ t: 'vanish', id, x: pl.x, y: pl.y,
        duration: lvl(spec, 'duration', level) });
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
    case 'swap': {
      state.projectiles.push({
        id: state.nextId++, type: 'swap', owner: id, level,
        x: pl.x + dx * pl.radius * 0.5,
        y: pl.y + dy * pl.radius * 0.5,
        vx: dx * spec.speed, vy: dy * spec.speed,
        traveled: 0, returning: false, hit: {},
        pierce: false, pierced: 0,   // trades with the FIRST body and stops there
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

// Fireball factory shared by castSpell, the Echo Stone delayed shot and the
// mosquito proc. Spawns at the caster (owner is excluded from collisions;
// point-blank shots connect). In elemental mode ALL the caster's rider elements
// (everything but arcane) ride on the projectile at their current levels.
//
// opts, all used by the mosquito proc (ELEMENTS.mosquito):
//   plain    — never turn this into a sting: it is one of your NORMAL
//              fireballs, carrying every rider you own EXCEPT mosquito
//   noStacks — HARD RULE: this ball can neither place nor spend a mosquito
//              stack. Without it the proc chains forever (test-locked).
//   x, y     — spawn origin override (the proc fires from the sting's contact point)
//   dmgMult  — scales this ball's damage only (the mosquito proc's optional
//              nerf lever, ELEMENTS.mosquito.fx.procDmgMult; unset = 1)
//   kbScale  — scales this ball's KNOCKBACK only (unset = 1). The proc passes
//              1/procBalls so that all its co-located balls TOGETHER shove for
//              exactly one ordinary fireball: Remi's ruling is that the mosquito
//              draws its strength from damage, never from push.
//
// opts.engorged (ELEMENTS.vampire) is the extra lifesteal FRACTION this ball
// pays, resolved at cast time so the projectile carries everything it needs.
function spawnFireball(state, pl, level, dx, dy, opts = {}) {
  const spec = SPELLS.fireball;
  let elements = null;
  const mosq = opts.plain ? 0 : mosquitoLevel(state, pl);
  if (mosq) {
    // the mosquito REPLACES the fireball and carries nothing else: a 1-damage
    // pellet on a much shorter cooldown would otherwise farm midas gold, venom
    // stacks and the momentum ramp for free
    elements = { mosquito: mosq };
  } else if (state.mode === 'elemental' && pl.elements) {
    for (const [k, v] of Object.entries(pl.elements)) {
      if (!(v > 0)) continue;
      if (k === 'mosquito') continue; // the pest is the setup, never a rider
      (elements = elements || {})[k] = v;
    }
  }
  const radius = spec.radius * (elements && elements.terra
    ? efxV(ELEMENTS.terra.fx.projRadiusMult, elements.terra) : 1);
  // ghost lv1/2 (round 16): the fireball's SPEED axis — it just flies faster
  const speed = spec.speed * (elements && elements.ghost
    ? efxV(ELEMENTS.ghost.fx.projSpeedMult, elements.ghost) : 1);
  state.projectiles.push({
    id: state.nextId++, type: 'fireball', owner: pl.id, level,
    // an explicit origin is used verbatim (the proc places its own muzzle);
    // otherwise the ball starts half a body ahead of the caster
    x: opts.x != null ? opts.x : pl.x + dx * pl.radius * 0.5,
    y: opts.y != null ? opts.y : pl.y + dy * pl.radius * 0.5,
    vx: dx * speed, vy: dy * speed,
    traveled: 0,
    returning: false,
    hit: {},
    // ghost lv3 (elemental): this ball passes THROUGH bodies. `pierce` is the
    // per-projectile flag that decides whether a hit pops the shot at all (the
    // boomerang has always been a piercing projectile; a hook and a plain
    // fireball are not); `pierced` counts victims already hit. Round 16:
    // everyone on the line takes a FULL ordinary hit (the old behind-bonus is
    // gone), and the passthrough unlocks at `pierceAtLevel`. Read off the SPEC
    // (any rider whose fx declares `pierce` at a sufficient owned level), not
    // off the element's name, so ELEMENTS.ghost.fx is the real switch.
    pierce: !!(elements && Object.entries(elements).some(([k, v]) =>
      ELEMENTS[k].fx.pierce && v >= (ELEMENTS[k].fx.pierceAtLevel || 1))),
    pierced: 0,
    elements, radius, mosquito: mosq || 0,
    ...(opts.noStacks ? { noStacks: true } : {}),
    ...(opts.dmgMult != null ? { dmgMult: opts.dmgMult } : {}),
    ...(opts.kbScale != null ? { kbScale: opts.kbScale } : {}),
    ...(opts.engorged ? { engorged: opts.engorged } : {}),
  });
}

export function buy(state, id, thing) {
  const pl = state.players[id];
  if (!pl) return { ok: false, err: 'no player' };
  if (state.phase !== 'shop')
    return { ok: false, err: 'shop is closed' };
  // draft mode: half the catalogue is not for sale in this game at all — until
  // you draft it, after which its remaining levels are bought normally
  if (draftLocked(state, pl, thing))
    return { ok: false, err: 'not sold this game — draft it first' };

  if (Object.hasOwn(SPELLS, thing)) {
    const spec = SPELLS[thing];
    // power tier: locked until enough rounds have been fought
    if (spec.minRound && state.round < spec.minRound)
      return { ok: false, err: `unlocks after round ${spec.minRound}` };
    const level = pl.spells[thing] || 0;
    // Round 16 (Remi): in ELEMENTAL mode the fireball never levels — the
    // elements are its whole progression (one axis each; see ELEMENTS).
    // Classic keeps the 3-level fireball: it has no elements to lean on.
    let maxLevel = spec.maxLevel;
    if (thing === 'fireball' && state.mode === 'elemental') maxLevel = 1;
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
    // every element is a fireball rider (round 16 — the last global element,
    // arcane, became fireball-scoped and chronos became the hourglass item)
    if ((pl.spells.fireball || 0) < 1)
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
    // items are LEVELLED like spells: 1..maxLevel, usually the same flat cost
    // every level with each level worth less than the last (echo is maxLevel 1,
    // which is what used to be the `unique` flag; the hourglass has a per-level
    // costs array — itemCost handles both).
    const level = pl.items[thing] || 0;
    if (level >= ITEMS[thing].maxLevel) return { ok: false, err: 'max level' };
    const cost = itemCost(thing, level);
    if (pl.gold < cost) return { ok: false, err: 'not enough gold' };
    pl.gold -= cost;
    pl.items[thing] = level + 1;
    // max HP is a live field, not derived, so the upgrade grants the DIFFERENCE
    // between the two cumulative totals.
    if (thing === 'amulet') {
      const gain = itemFxDelta('amulet', 'maxHp', level + 1);
      pl.maxHp += gain; pl.hp += gain;
    }
    return { ok: true };
  }
  return { ok: false, err: 'unknown' };
}

// ---- draft mode (docs/ROUND12.md S7) -------------------------------------
// OFF by default and every function here is a no-op while it is off, so classic
// and elemental stay bit-for-bit what they were.
//
// The shape: at game start the server rolls HALF the catalogue out of the shop
// into `state.draftPool` — one roll, from the game's own seeded rng, so it is
// authoritative and identical for everybody. Every DRAFT.EVERY_ROUNDS rounds each
// player is handed DRAFT.OPTIONS free picks out of that pool, roughly
// gold-equivalent to each other. A pick arrives at LEVEL 1 and then behaves like
// anything else in the shop: its next levels cost their normal price.

// Is this thing locked away in this game's pool for this player? A pool thing
// you already own is NOT locked — that is how a drafted thing goes back on sale
// (and it is why no separate "drafted" list has to exist).
export function draftLocked(state, pl, thing) {
  if (!state.draft || !state.draftPool) return false;
  if (!state.draftPool.includes(thing)) return false;
  return ownedLevel(pl, thing) < 1;
}

// Rolled once, at the moment the game leaves the lobby (so the ruleset — and
// therefore the catalogue — is final). Uses the game rng: same seed, same split,
// and every player reads the one list off the wire.
function rollDraftPool(state) {
  const keys = draftable(state.mode).map(e => e.key);
  for (let i = keys.length - 1; i > 0; i--) {           // Fisher-Yates
    const j = Math.floor(rng(state) * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  state.draftPool = keys.slice(0, Math.round(keys.length * DRAFT.POOL_FRAC)).sort();
}

// Which shops carry an offer: the FIRST one (after round 1) and every
// EVERY_ROUNDS after it. Starting at round 1 rather than round EVERY_ROUNDS is
// deliberate — the point of draft is to shape a build before it calcifies, and
// waiting three rounds for your first pick makes the opening rounds poorer than
// classic instead of different from it.
export function draftDue(round) {
  return round >= 1 && (round - 1) % DRAFT.EVERY_ROUNDS === 0;
}

// DRAFT.OPTIONS things out of the pool, roughly gold-equivalent to each other:
// anchor on one random candidate and take the ones nearest it in price. Never
// something already owned (so a pick always arrives at level 1 — which also
// covers "never offer what is already maxed"), and never a power spell to a bot,
// which cannot pilot one (see botShop: buying it would just burn its gold).
function draftOptionsFor(state, pl) {
  const cands = draftable(state.mode).filter(e =>
    state.draftPool.includes(e.key) &&
    ownedLevel(pl, e.key) < 1 &&
    !(pl.bot && e.kind === 'spell' && e.spec.tier === 'power'));
  // shuffle first so the price sort's ties (most things cost 10 g) are random
  // rather than catalogue order
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(rng(state) * (i + 1));
    [cands[i], cands[j]] = [cands[j], cands[i]];
  }
  if (!cands.length) return [];
  const anchor = cands[Math.floor(rng(state) * cands.length)];
  const near = cands
    .map((e, i) => ({ e, i }))       // index keeps the sort deterministic
    .sort((a, b) => Math.abs(a.e.cost - anchor.cost) - Math.abs(b.e.cost - anchor.cost) ||
                    a.i - b.i)
    .slice(0, DRAFT.OPTIONS)
    .map(x => x.e.key);
  // ...and shuffle the shortlist, so the pre-selected first option is not
  // systematically the anchor
  for (let i = near.length - 1; i > 0; i--) {
    const j = Math.floor(rng(state) * (i + 1));
    [near[i], near[j]] = [near[j], near[i]];
  }
  return near;
}

// Called when the shop opens. Bots take their pick on the spot (the first
// option, which is already a random gold-equivalent draw from their filtered
// candidates) so they never sit on an unresolved offer.
function rollDraftOffers(state) {
  if (!state.draft || !state.draftPool) return;
  for (const pl of Object.values(state.players)) {
    if (pl.spectator || pl.wave) continue;
    const options = draftOptionsFor(state, pl);
    pl.draftOffer = options.length ? { round: state.round, options, picked: null } : null;
    if (pl.draftOffer && pl.bot) draftPick(state, pl.id, options[0]);
  }
}

// The pick itself: free, level 1, no gold involved. Grants immediately so the
// shop can show it and you can buy level 2 in the same visit.
function grantDraft(state, pl, key) {
  switch (kindOf(key)) {
    case 'spell': pl.spells[key] = Math.max(pl.spells[key] || 0, 1); break;
    case 'element': pl.elements[key] = Math.max(pl.elements[key] || 0, 1); break;
    case 'item': {
      if ((pl.items[key] || 0) > 0) return;
      pl.items[key] = 1;
      // maxHp is a live field, not derived — same rule buy() follows
      if (key === 'amulet') {
        const gain = itemFxDelta('amulet', 'maxHp', 1);
        pl.maxHp += gain; pl.hp += gain;
      }
      break;
    }
    default: return;
  }
  state.events.push({ t: 'drafted', id: pl.id, thing: key });
}

export function draftPick(state, id, thing) {
  const pl = state.players[id];
  if (!pl) return { ok: false, err: 'no player' };
  if (state.phase !== 'shop') return { ok: false, err: 'shop is closed' };
  const off = pl.draftOffer;
  if (!off) return { ok: false, err: 'nothing on offer' };
  if (off.picked) return { ok: false, err: 'already drafted' };
  const key = String(thing || '');
  if (!off.options.includes(key)) return { ok: false, err: 'not on offer' };
  grantDraft(state, pl, key);
  off.picked = key;
  return { ok: true };
}

// The shop is closing: anyone who never clicked gets the pre-selected FIRST
// option (DRAFT.AUTO_PICK_FIRST — "a player who clicks nothing still receives
// it"), then the offer is retired.
function resolveDraftOffers(state) {
  if (!state.draft) return;
  for (const pl of Object.values(state.players)) {
    const off = pl.draftOffer;
    if (!off) continue;
    if (!off.picked && DRAFT.AUTO_PICK_FIRST && off.options.length) {
      grantDraft(state, pl, off.options[0]);
      off.picked = off.options[0];
    }
    pl.draftOffer = null;
  }
}

// ---- combat helpers -----------------------------------------------------

function applyKnockback(state, target, dx, dy, magnitude) {
  const { kbMult } = stats(target);
  // the lower your hp PERCENTAGE, the further you fly (full HP = baseline,
  // near-death ≈ 1+KB_HP_FACTOR). Cape still multiplies on top. Deliberately
  // NO size/radius term: small and big bodies take identical impulses —
  // being big must only ever be a disadvantage (bigger target).
  // KB_CONSTANT_MISSING (round 12) overrides the real HP fraction with a fixed
  // one, making knockback constant for everyone without touching this formula.
  // Set it to null in constants.js and true HP scaling is back — that is the
  // whole revert.
  const missing = PLAYER.KB_CONSTANT_MISSING == null
    ? 1 - clamp(target.hp / target.maxHp, 0, 1)
    : PLAYER.KB_CONSTANT_MISSING;
  const hpScale = 1 + PLAYER.KB_HP_FACTOR * missing;
  target.vx += dx * magnitude * kbMult * hpScale;
  target.vy += dy * magnitude * kbMult * hpScale;
}

// opts.stamp: whether this damage claims the "last hitter" slot (kill/lava
// credit). Direct hits do; DoT ticks (poison, trails) must NOT — a 30 Hz
// poison tick would otherwise re-stamp forever and steal every lava kill
// from the player who actually landed the shove.
// `bonus` is the part of `amount` that came from the Momentum ramp. It rides on
// the hit event so the client can print it as a separate white number above the
// damage — AGENTS.md scar: this element ramped correctly for weeks and still
// read as broken because +0.45/hit is invisible. Visibility is the feature.
// `lifesteal` is EXTRA lifesteal for this one hit, on top of whatever the
// source's items pay (ELEMENTS.vampire's engorged ball). It obeys the same rule
// as the Blood Sword and deliberately reuses its code path: paid on damage
// actually dealt, so overkill is excluded, and lava (sourceId null) never pays.
function applyDamage(state, target, amount, sourceId,
  { silent = false, stamp = true, bonus = 0, lifesteal: bonusLifesteal = 0 } = {}) {
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
  // victim-side accounting, independent of who gets the credit: lava is the one
  // and only sourceless damage in the game (stepBattle's burn tick), so this
  // split is exact rather than heuristic. Self-damage (a meteor dropped on your
  // own head) counts as direct — it is still a spell.
  if (effective > 0) {
    if (sourceId == null) target.dmgTakenLava += effective;
    else target.dmgTakenDirect += effective;
  }
  if (creditId != null) {
    const cr = state.players[creditId];
    // the scoreboard splits these: dmgDealt is damage YOU landed (spells,
    // DoT, trails), dmgLava is burn credited to you because you shoved them
    // in. Very different bragging rights, so they get their own columns.
    if (cr) {
      if (sourceId == null) cr.dmgLava += effective;
      else cr.dmgDealt += effective;
    }
  }
  // taking damage suppresses regen for a moment (see stats/REGEN_LOCK): a
  // lv1 fireball duel used to be fully cancelled by passive regen, which is
  // what made round 1 feel dead
  if (effective > 0) target.regenLockT = PLAYER.REGEN_LOCK;
  if (sourceId != null && sourceId !== target.id) {
    if (stamp) target.lastHitBy = { id: sourceId, t: state.time };
    const src = state.players[sourceId];
    if (src && src.alive) {
      // heal on EFFECTIVE damage (overkill doesn't feed the sword); works on
      // everything with a source — spells, DoT ticks, trails — never lava
      const { lifesteal } = stats(src);
      const total = lifesteal + bonusLifesteal;
      if (total > 0) {
        const before = src.hp;
        src.hp = Math.min(src.maxHp, src.hp + effective * total);
        const healed = src.hp - before;
        src.healLifesteal += healed;   // scoreboard column
        // 2026-08-08 (Remi, round 16): EVERY meaningful lifesteal heal gets a
        // green "+N" over the healed player — the Blood Sword used to be
        // deliberately silent and read as broken because of it (the momentum/
        // mosquito scar: a correct mechanic with no on-screen presence is a bug
        // in practice). The >= 1 floor keeps sub-point poison-tick heals from
        // spamming; a full point is a popup, a rounding crumb is not.
        if (healed >= 1)
          state.events.push({
            t: 'lifesteal', id: src.id, amount: healed, x: src.x, y: src.y,
          });
      }
    }
  }
  if (!silent)
    state.events.push({
      t: 'hit', id: target.id, amount, x: target.x, y: target.y,
      ...(bonus > 0 ? { bonus } : {}),  // momentum: shown above the damage
    });
  if (target.hp <= 0) kill(state, target, sourceId);
}

function kill(state, target, directSourceId) {
  target.hp = 0;
  target.alive = false;
  target.deaths++;
  target.moveTarget = null;
  target.dash = null;
  target.charging = null;
  // dying reveals you: a corpse and its death burst must be visible to everyone,
  // and a hidden body would also silently vanish from the standings
  target.vanishT = 0;
  // credit: direct source, else last hitter within the window
  let killerId = directSourceId != null && directSourceId !== target.id ? directSourceId : null;
  if (killerId == null && target.lastHitBy &&
      state.time - target.lastHitBy.t <= ROUND.KILL_CREDIT_WINDOW) {
    killerId = target.lastHitBy.id;
  }
  const killer = killerId != null ? state.players[killerId] : null;
  // Friendly fire kills your teammate for real, but it must never PAY. No
  // kill count, no gold, no "Double Kill" for dropping your own party into
  // the lava — the death (and the hole in your team) is the whole penalty.
  const teamKill = killer && killer !== target && !hostile(killer, target);
  if (teamKill) {
    killer._mkStreak = 0;
    state.events.push({ t: 'teamkill', id: killer.id, victim: target.id, x: target.x, y: target.y });
  }
  if (killer && killer !== target && !teamKill) {
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
    killer.roundGold += GOLD.PER_KILL + bounty;
    // multi-kill: chain kills inside MULTIKILL_WINDOW and the announcer wakes
    // up (double → triple → quadra → penta → MASSACRE)
    killer._mkStreak = (state.time - (killer._mkAt ?? -Infinity) <= ROUND.MULTIKILL_WINDOW)
      ? (killer._mkStreak || 1) + 1 : 1;
    killer._mkAt = state.time;
    if (killer._mkStreak >= 2) {
      const name = MULTIKILL_NAMES[Math.min(killer._mkStreak - 2, MULTIKILL_NAMES.length - 1)];
      killer.multiKillBest = Math.max(killer.multiKillBest, killer._mkStreak);
      state.events.push({
        t: 'multikill', id: killer.id, n: killer._mkStreak, name,
        x: killer.x, y: killer.y,
      });
    }
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
  // draft mode: the split is rolled ONCE here, when the ruleset can no longer
  // change, and lives on state for the whole game
  if (state.draft) rollDraftPool(state);
  startRound(state);
}

function startRound(state) {
  // the shop is closing: an untouched offer still pays out its first option
  resolveDraftOffers(state);
  state.round++;
  state.shopPaused = null;   // never let a pause leak into the next shop
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
  state.bolts = [];
  state.walls = [];
  const coop = state.mode === 'coop';
  if (coop) coopPrepareRound(state);   // clears last level's monsters, sets teams
  const fs = fighters(state);
  // co-op: the lava's adaptive shrink must count the PARTY only, or clearing a
  // wave would rush the lava in as a punishment for winning
  state.roundFighters = coop ? partyOf(state).length : fs.length;
  const r = ARENA.START_RADIUS * ARENA.SPAWN_RADIUS_FRAC;
  fs.forEach((pl, i) => {
    // co-op parties spawn together on one side (the waves come from the other)
    const a = coop
      ? -Math.PI / 2 + (fs.length > 1 ? (i / (fs.length - 1) - 0.5) * (Math.PI / 3) : 0)
      : (i / fs.length) * Math.PI * 2 - Math.PI / 2;
    pl.x = Math.cos(a) * r; pl.y = Math.sin(a) * r;
    pl.vx = 0; pl.vy = 0;
    pl.moveTarget = null;
    pl.hp = pl.maxHp;
    pl.alive = true;
    pl.cooldowns = {};
    pl.inLava = false; pl.shieldT = 0; pl.dash = null; pl.charging = null;
    pl.vanishT = 0;   // nobody starts a round already invisible
    pl.slowT = 0; pl.slowMultHit = 1;
    pl.stunT = 0; pl.regenLockT = 0; pl.roundGold = 0;
    pl.stacks = {};   // frost/gale/mosquito stacks are round-long, like the hp bar
    pl.poisonT = 0; pl.poisonTick = 0; pl.poisonBy = null; pl._poisonNext = 0;
    pl.echoN = 0;
    // vampire's charge counter resets with the round, exactly like the Echo
    // Stone's (the other "every Nth cast" mechanic). Deliberate: the rhythm you
    // are asked to count is "my 3rd fireball of this fight", and carrying a
    // half-charged counter across a shop would make the first shot of a round
    // randomly engorged with nothing on screen having explained why. Momentum is
    // the one element that persists, and that is stated in its spec — this one
    // is not, so it follows the local precedent. Test-locked.
    pl.vampN = 0;
    // pl.momentumHits is DELIBERATELY not reset: the Momentum ramp is permanent
    // for the whole game (ELEMENTS.momentum.fx.rampPermanent). Adding it here
    // would silently delete the element's entire point.
    pl._mkStreak = 0; pl._mkAt = -Infinity;
    pl.lastHitBy = null;
    pl.roundKills = 0;
    pl.roundBounty = 0;
    pl.shopReady = false;
  });
  for (const pl of Object.values(state.players)) {
    if (pl.spectator) { pl.alive = false; pl.shopReady = false; }
  }
  if (coop) coopSpawnWave(state, 0);   // everything with at <= 0 is on the field
  updateRadii(state);
  state.events.push({ t: 'round', n: state.round });
}

// ---- co-op campaign -------------------------------------------------------
// Round N is campaign level N (which is what buys the level art, music and
// title card for free — the client already maps round -> level). Everything
// here is bookkeeping around shared/campaign.js; no new AI, no new combat.

function coopPrepareRound(state) {
  // last level's monsters are gone for good
  for (const pl of waveOf(state)) removePlayer(state, pl.id);
  // everyone still seated is the party (humans and their bot stand-ins)
  for (const pl of Object.values(state.players)) {
    if (pl.team !== TEAM.AI) pl.team = TEAM.PARTY;
  }
  const party = partyOf(state).filter(p => !p.spectator);
  // the campaign level is NOT the round number: clearing advances you, wiping
  // costs you a round and you try the same level again (with a shop, and the
  // round income, in between). ROUND.MAX_ROUNDS is the retry budget — 10
  // levels in 25 rounds.
  const level = levelFor(state.coopLevel);
  state.coopAttempt = (state.coopAttempt || 0) + 1;
  state.coop = {
    level: level.n, name: level.name, brief: level.brief,
    attempt: state.coopAttempt,
    partySize: Math.max(1, party.length),
    roster: levelRoster(level, Math.max(1, party.length)),
    pending: waveUnits(level, Math.max(1, party.length)),
    cleared: false, wiped: false, spawned: 0,
  };
}

// Seat every pending unit whose arrival time has come. Mid-round spawns have
// to do by hand what startRound does for seated players: alive, hp, position.
function coopSpawnWave(state, time) {
  const c = state.coop;
  if (!c) return;
  const due = c.pending.filter(u => (u.at || 0) <= time);
  if (!due.length) return;
  c.pending = c.pending.filter(u => (u.at || 0) > time);
  const r = ARENA.START_RADIUS * ARENA.SPAWN_RADIUS_FRAC;
  const spread = Math.min(Math.PI * 1.2, 0.35 * Math.max(1, due.length - 1));
  due.forEach((u, i) => {
    const a = Math.PI / 2 + (due.length > 1 ? (i / (due.length - 1) - 0.5) * spread : 0);
    const id = `w${state.nextWaveId++}`;
    const pl = addPlayer(state, id, u.name, {
      bot: true, kind: u.kind, build: u.build, avatar: u.avatar,
      color: ENEMY_COLOR, team: TEAM.AI,
    });
    pl.wave = true;
    pl.sizeMult = u.sizeMult;
    pl.maxHp = u.maxHp;
    pl.hp = u.maxHp;
    pl.spells = { ...u.spells };
    pl.items = { ...u.items };
    pl.gold = 0; pl.goldEarned = 0;   // monsters never shop (see botShop)
    pl.ready = true;
    pl.alive = true;
    // spawn just inside the current rim, on the far side from the party
    const rr = Math.min(r, Math.max(4, state.arenaRadius - 4));
    pl.x = Math.cos(a) * rr; pl.y = Math.sin(a) * rr;
    pl.radius = PLAYER.RADIUS * (u.sizeMult || 1);
    c.spawned++;
    state.events.push({ t: 'waveSpawn', id, name: u.name, x: pl.x, y: pl.y });
  });
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
  const coop = state.mode === 'coop' && !!state.coop;
  const alive = fighters(state).filter(p => p.alive);
  // co-op has no single survivor: the whole surviving party "wins" the round
  // (and a 3-survivor clear must not render as "nobody survives round n")
  const winner = coop ? null : (alive.length === 1 ? alive[0] : null);
  const won = coop
    ? new Set(state.coop.cleared ? partyOf(state).map(p => p.id) : [])
    : new Set(winner ? [winner.id] : []);
  const income = {};
  const detail = {};
  for (const pl of coop ? partyOf(state) : fighters(state)) {
    // kill + bounty gold shown here, already granted at kill time
    let g = GOLD.ROUND_BASE + pl.roundKills * GOLD.PER_KILL + (pl.roundBounty || 0);
    pl.gold += GOLD.ROUND_BASE; pl.goldEarned += GOLD.ROUND_BASE; pl.roundGold += GOLD.ROUND_BASE;
    if (won.has(pl.id)) { pl.gold += GOLD.ROUND_WIN; pl.goldEarned += GOLD.ROUND_WIN; pl.roundGold += GOLD.ROUND_WIN; g += GOLD.ROUND_WIN; }
    if (pl.diedFirstRound === state.round) { pl.gold += GOLD.FIRST_DEATH; pl.goldEarned += GOLD.FIRST_DEATH; pl.roundGold += GOLD.FIRST_DEATH; g += GOLD.FIRST_DEATH; }
    income[pl.id] = g;
    // itemized for the round-end banner: where did each gold piece come from
    detail[pl.id] = {
      base: GOLD.ROUND_BASE,
      kills: pl.roundKills * GOLD.PER_KILL,
      bounty: pl.roundBounty || 0,
      win: won.has(pl.id) ? GOLD.ROUND_WIN : 0,
      first: pl.diedFirstRound === state.round ? GOLD.FIRST_DEATH : 0,
    };
    pl.dash = null; pl.moveTarget = null;
    pl.shopReady = false;
  }
  state.projectiles = [];
  const topKills = Math.max(0, ...fighters(state).map(p => p.kills));
  state.roundSummary = {
    n: state.round, winner: winner ? winner.id : null, income, detail,
    // a campaign run ends when the last level falls or the retry budget does —
    // never on the classic kill race (one player farming 15 wave kills would
    // otherwise silently end the run mid-campaign)
    final: coop
      ? ((state.coop.cleared && state.coop.level >= MAX_LEVEL) ||
         state.round >= ROUND.COOP_MAX_ROUNDS)
      : (topKills >= ROUND.KILLS_TO_WIN || state.round >= ROUND.MAX_ROUNDS),
    ...(coop ? {
      coop: {
        level: state.coop.level, name: state.coop.name,
        attempt: state.coop.attempt,
        cleared: !!state.coop.cleared, wiped: !!state.coop.wiped,
        survivors: partyOf(state).filter(p => p.alive).length,
        partySize: state.coop.partySize,
        victory: !!state.coop.cleared && state.coop.level >= MAX_LEVEL,
      },
    } : {}),
  };
  state.events.push({ t: 'roundEnd', winner: winner ? winner.id : null });
  if (coop) {
    // the level's monsters leave with the level: no corpses in the shop
    // standings, no monsters in the "everyone ready?" check
    for (const pl of waveOf(state)) removePlayer(state, pl.id);
    // clearing is the only thing that advances the campaign
    if (state.coop.cleared) { state.coopLevel = state.coop.level + 1; state.coopAttempt = 0; }
  }
  // the fight is over: nobody stays invisible into the banner and the shop
  // (the timer only ticks during battle, so it would otherwise freeze there)
  for (const pl of Object.values(state.players)) pl.vanishT = 0;
  state.phase = 'roundEnd';
  state.phaseT = ROUND.SUMMARY_TIME;
}

function afterSummary(state) {
  if (state.roundSummary && state.roundSummary.final) {
    // co-op: the campaign is over (wiped, or level 10 cleared) — rank the
    // party, never the monsters
    const ranked = (state.mode === 'coop' ? partyOf(state) : fighters(state))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || b.gold - a.gold);
    state.winner = ranked[0] ? ranked[0].id : null;
    state.phase = 'gameover';
    state.events.push({ t: 'gameover', winner: state.winner });
  } else {
    state.phase = 'shop';
    state.phaseT = ROUND.SHOP_TIME;
    // state.round is the round just fought, so this shop belongs to it
    if (state.draft && draftDue(state.round)) rollDraftOffers(state);
  }
}

// Mark a player done with shopping; when everyone (bots count as always
// done) is ready the next round starts early.
export function setShopReady(state, id, ready = true) {
  const pl = state.players[id];
  if (!pl || state.phase !== 'shop') return;
  pl.shopReady = !!ready;
}

// Pause/resume the shop countdown. Anyone in the lobby may do either — this is
// a friends lobby, the same trust model as the kick/ban buttons — and the
// banner names who did it. Bots never pause. Cleared on every round start, so a
// forgotten pause cannot survive into the next shop.
export function setShopPause(state, id, on) {
  const pl = state.players[id];
  if (!pl || pl.bot || state.phase !== 'shop') return { ok: false, err: 'not in a shop' };
  state.shopPaused = on ? (pl.name || 'someone') : null;
  return { ok: true };
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
      // paused freezes the clock ONLY — everyone readying up still starts the
      // round, so a pause can never hold the lobby hostage
      if (!state.shopPaused) state.phaseT -= dt;
      const everyoneReady = Object.values(state.players).length > 0 &&
        Object.values(state.players).every(p => p.bot || p.spectator || p.shopReady);
      if ((state.phaseT <= 0 && !state.shopPaused) || everyoneReady) startRound(state);
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
  // co-op: measure the shrink over the PARTY only — monsters dying must not
  // accelerate the lava (clearing a wave would punish the party)
  const fsNow = state.mode === 'coop' ? partyOf(state) : fighters(state);
  const totalF = Math.max(1, state.roundFighters || fsNow.length);
  const aliveF = fsNow.filter(p => p.alive).length;
  const speedMult = 1 + ARENA.SHRINK_ADAPT * (1 - Math.min(aliveF, totalF) / totalF);
  if (ARENA.NEVER_STOPS && state.mode !== 'coop') {
    // One continuous journey from START to nothing: no floor, no grace, no
    // sudden-death branch. The adaptive rate still applies, so a round with
    // three dead players still closes fast.
    // ⚠ VERSUS ONLY (2026-08-08, round 16): the co-op campaign keeps the
    // classic hold-then-sudden-death ring. NEVER_STOPS shipped in c38730f
    // without a co-op re-measure, and the whole late campaign is priced around
    // long fights (level 8 averages ~100 s) — under a ring that never stops it
    // collapsed from 68/66/57% clear to 80/46/6% (200 attempts/cell, seed 7).
    // Scoping the flag to PvP restored the documented curve exactly.
    const baseRate = ARENA.START_RADIUS / ARENA.SHRINK_TIME;
    state.arenaRadius = Math.max(0, state.arenaRadius - baseRate * speedMult * dt);
  } else if (state.arenaRadius > ARENA.MIN_RADIUS) {
    // co-op runs the campaign's own (faster) journey: SHRINK_TIME was retuned
    // for the never-stopping versus ring, and the campaign is priced at 65 s
    const shrinkT = state.mode === 'coop' ? ARENA.COOP_SHRINK_TIME : ARENA.SHRINK_TIME;
    const baseRate = (ARENA.START_RADIUS - ARENA.MIN_RADIUS) / shrinkT;
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
        // everyone under the rock eats it, the caster included
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

  // lightning sky-bolts (round 17): the meteor's telegraph→impact shape, but
  // damage AND knockback fall linearly to HALF at the zone's edge, and the
  // knockback is RADIAL from the zone center — far-side positioning pushes a
  // lava swimmer back onto the platform, near-side throws them out (intended,
  // both ways). No pillar or wall check anywhere: it falls from the SKY.
  if (state.bolts.length) {
    const rest = [];
    const spec = SPELLS.lightning;
    for (const m of state.bolts) {
      m.t -= dt;
      if (m.t > 0) { rest.push(m); continue; }
      state.events.push({ t: 'boltHit', x: m.x, y: m.y, r: spec.radius, level: m.level });
      for (const pl of Object.values(state.players)) {
        if (!pl.alive) continue;
        const ddx = pl.x - m.x, ddy = pl.y - m.y;
        const dd = Math.hypot(ddx, ddy);
        const reach = spec.radius + pl.radius;
        if (dd > reach) continue;
        if (pl.shieldT > 0) continue; // shield holds the bolt (as it held the beam)
        const fall = 1 - 0.5 * (dd / reach);
        const nx = dd > 1e-6 ? ddx / dd : 1, ny = dd > 1e-6 ? ddy / dd : 0;
        applyKnockback(state, pl, nx, ny, lvl(spec, 'knockback', m.level) * fall);
        applyDamage(state, pl, lvl(spec, 'damage', m.level) * fall,
          pl.id === m.owner ? null : m.owner);
      }
    }
    state.bolts = rest;
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
        if (h.owner === pl.id) continue; // your own puddle spares only you
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
    if (pl.vanishT > 0) pl.vanishT = Math.max(0, pl.vanishT - dt);

    if (pl.regenLockT > 0) pl.regenLockT = Math.max(0, pl.regenLockT - dt);

    // elemental timed effects (all timers stay 0 in classic mode)
    if (pl.slowT > 0) pl.slowT = Math.max(0, pl.slowT - dt);
    if (pl.stunT > 0) pl.stunT = Math.max(0, pl.stunT - dt);
    if (pl.poisonT > 0) {
      // discrete ticks (2026-08-05 rework): one bite of poisonTick damage per
      // tickEvery seconds. The tick runs BEFORE the clock decrement so the
      // final tick can't be lost to float residue on the last frame. A lethal
      // tick passes the poisoner as the direct source (they get the kill,
      // even mid-lava) but never stamps lastHitBy — the round-9 credit rule.
      if (pl.poisonTick > 0) {
        pl._poisonNext = (pl._poisonNext ?? ELEMENTS.venom.fx.tickEvery) - dt;
        if (pl._poisonNext <= 0) {
          pl._poisonNext += ELEMENTS.venom.fx.tickEvery;
          applyDamage(state, pl, pl.poisonTick, pl.poisonBy, { silent: true, stamp: false });
          state.events.push({ t: 'hit', id: pl.id, amount: pl.poisonTick, x: pl.x, y: pl.y, poison: true });
        }
      }
      pl.poisonT = Math.max(0, pl.poisonT - dt);
      if (pl.poisonT === 0) { pl.poisonTick = 0; pl.poisonBy = null; }
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
          if (other === pl || !other.alive) continue; // friendly fire: allies too
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

    // regen (throttled for REGEN_LOCK seconds after taking damage)
    if (pl.alive && st.regen > 0) {
      const before = pl.hp;
      pl.hp = Math.min(pl.maxHp, pl.hp + st.regen * dt);
      pl.healRegen += pl.hp - before; // scoreboard column
    }
  }

  // Echo Stone delayed fireballs (elemental; the list is empty in classic).
  // The mosquito proc used to ride this queue too; it doesn't any more — its
  // balls all leave at once from the same muzzle (see fireMosquitoProc), so this
  // is back to the one thing it was written for.
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

  // co-op: reinforcements arrive on the clock, and the round ends on
  // "wave cleared" / "party wiped" instead of "one fighter left standing"
  // (three survivors would never end a round under the classic predicate).
  if (state.mode === 'coop' && state.coop) {
    coopSpawnWave(state, state.time);
    const party = partyOf(state);
    const partyAlive = party.filter(p => p.alive).length;
    const waveAlive = waveOf(state).filter(p => p.alive).length;
    if (party.length && partyAlive === 0) { state.coop.wiped = true; endRound(state); }
    else if (!waveAlive && !state.coop.pending.length && state.coop.spawned) {
      state.coop.cleared = true; endRound(state);
    }
    return;
  }

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
      // lost once it has flown its own out-leg again, i.e. past the launch
      // point — measured from where it actually turned, since a recall can
      // turn it anywhere
      if (pr.traveled >= (pr.turnAt ?? spec.outDistance) * 2 + 1) pr.lost = true;
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
    if (pr.type === 'swap' && pr.traveled >= lvl(spec, 'range', pr.level)) continue;
    if (Math.hypot(pr.x, pr.y) > ARENA.START_RADIUS * 2) continue;
    if (pr.type === 'boomerang' && !pr.returning && pr.traveled >= spec.outDistance)
      turnBoomerangHome(state, pr); // hit the ceiling without being recalled

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
    // The side check stops a just-reflected shot from re-triggering. It reads
    // the PRE-move position on purpose: a fast ball (ghost lv3 is +30%) can
    // cross the wall plane inside one tick, and the post-move side then reads
    // as "moving away" — the ball tunneled straight through. Found by the
    // ghost+wall test the day ghost became the speed element.
    let mirrored = false;
    for (const w of state.walls) {
      if (w.owner === pr.owner) continue;
      const side = (px0 - w.x1) * w.nx + (py0 - w.y1) * w.ny;
      const vn = pr.vx * w.nx + pr.vy * w.ny;
      if (side * vn >= 0) continue; // moving away from the plane: no hit
      if (segSegDist(px0, py0, pr.x, pr.y, w.x1, w.y1, w.x2, w.y2) > prRadius + 0.4) continue;
      pr.vx -= 2 * vn * w.nx;
      pr.vy -= 2 * vn * w.ny;
      pr.owner = w.owner;
      pr.hit = {};
      pr.pierced = 0;   // ghost: a mirrored ball is a fresh ball, first victim again
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
      // friendly fire is on: the only body a projectile ignores is its owner's
      if (!other.alive || other.id === pr.owner || pr.hit[other.id]) continue;
      const dist = segmentPointDist(px0, py0, pr.x, pr.y, other.x, other.y);
      if (dist > prRadius + other.radius) continue;

      if (other.shieldT > 0) {
        // reflect: reverse velocity, transfer ownership
        pr.vx = -pr.vx; pr.vy = -pr.vy;
        pr.owner = other.id;
        pr.hit = {};
        pr.pierced = 0;  // ghost: reflected back at you as a fresh, un-pierced ball
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
      // Momentum's earned bonus rides along in its own accumulator so the
      // floating damage number can show base and bonus separately (the white
      // number over the red one IS the feature — see ELEMENTS.momentum). Every
      // damage multiplier applies to both halves, so the split is exact and
      // does not depend on which order the riders happen to be iterated in.
      let ramp = 0;
      // Mosquito payoff: does this hit land on a victim already carrying THIS
      // owner's stack? Decided BEFORE the sting plants its own, or a single
      // sting would arm and cash itself in the same frame. A proccing hit does
      // not re-arm — you have to sting again to set the next one up.
      // FIREBALLS ONLY: the 2026-08-06 version let any other spell cash the mark
      // in, and the owner killed that outright ("mosquito+lightning becomes THE
      // meta"). A boomerang must not spend the stack either.
      const procMosq = pr.type === 'fireball' && !pr.noStacks && pr.owner != null &&
        stackCount(other, 'mosquito', pr.owner) > 0;
      if (procMosq) clearStacks(other, 'mosquito', pr.owner);
      if (pr.mosquito) {
        // the sting: 1 damage, zero knockback, no geometry
        dmg = ELEMENTS.mosquito.fx.stingDmg; kb = 0;
      } else if (pr.elements) { // every rider element bends the numbers, stacking
        for (const [ek, el] of Object.entries(pr.elements)) {
          const f = ELEMENTS[ek].fx;
          if (f.dmgAdd) dmg += efxV(f.dmgAdd, el);
          if (f.kbAdd) kb += efxV(f.kbAdd, el);
          if (f.rampDmg) {
            // momentum: the ramp counts every fireball this owner has landed
            // ALL GAME, read at hit time. Damage only — knockback is untouched
            // on purpose, so a big stack melts people instead of launching them.
            const own = state.players[pr.owner];
            ramp += ((own && own.momentumHits) || 0) * efxV(f.rampDmg, el);
          }
          if (f.dmgMult) { dmg *= efxV(f.dmgMult, el); ramp *= efxV(f.dmgMult, el); }
          // flat knockback multiplier. Gale used to be the loud user of this;
          // since the 2026-08-07 rework its push is a burst and lives below.
          // midas still rides it (its levels buy back a push/damage penalty),
          // so deleting this line silently un-nerfs midas — it did, and the
          // midas test caught it.
          if (f.kbMult) kb *= efxV(f.kbMult, el);
        }
        // Gale lv3 (elemental): stack-and-burst, so its multiplier is NOT a
        // constant and cannot be folded into the loop above — it depends on how
        // many of THIS owner's stacks the victim is already carrying. Resolved
        // here because knockback is applied a few lines below, before the
        // on-hit riders run. Multiplies whatever the loop produced, so a
        // gale+midas build still pays midas's push penalty on the gust.
        // Levels 1-2 are the flat kbAdd in the loop above; the gust (and its
        // stacking) exists only from burstAtLevel up.
        if (pr.elements.gale >= (ELEMENTS.gale.fx.burstAtLevel || 1))
          kb *= galeHit(state, pr, other, pr.elements.gale);
      }
      // (Ghost's old behind-the-first-victim damage/push bonus was removed in
      // round 16 — a pierced ball now lands a full ordinary hit on everyone.)
      // per-ball damage scale (mosquito's proc balls, if the lever is set).
      // Damage only: knockback and every on-hit effect are untouched, because the
      // stated fantasy is "every on-hit effect procs twice", not "double damage".
      if (pr.dmgMult != null) { dmg *= pr.dmgMult; ramp *= pr.dmgMult; }
      // per-ball knockback scale. The mosquito proc sets 1/procBalls on every
      // ball it fires, so its co-located volley adds up to exactly ONE
      // fireball's impulse (Remi's ruling: damage and every on-hit effect proc
      // procBalls times, the SHOVE happens once). Applies after every element
      // multiplier, so gale/critical still price the total the same way they
      // price a single fireball.
      if (pr.kbScale != null) kb *= pr.kbScale;
      if (kb) applyKnockback(state, other, pr.vx / v, pr.vy / v, kb);
      applyDamage(state, other, dmg + ramp, pr.owner,
        { bonus: ramp, lifesteal: pr.engorged || 0 });
      if (pr.elements) applyElementsHit(state, pr, other);
      // the sting arms the trap: one mosquito stack of this attacker only.
      // `noStacks` balls (the proc's own fireballs) can never arm anything —
      // that is the hard rule that stops the effect chaining forever.
      if (pr.mosquito && !pr.noStacks && !procMosq)
        plantMosquitoStack(state, other, pr.owner);
      if (procMosq) fireMosquitoProc(state, pr, other);
      state.events.push({ t: 'boom', x: pr.x, y: pr.y, spell: pr.type });

      // swap (round 17): full state exchange with the (surviving) victim —
      // position AND velocity. Velocities must swap too, or the caster would
      // keep their own lava-bound momentum from the new spot and the lava-save
      // fantasy breaks. moveTarget/dash/charging are cleared on BOTH: each
      // player wakes up somewhere new with no stale intent.
      if (pr.type === 'swap' && other.alive) {
        const owner = state.players[pr.owner];
        if (owner && owner.alive) {
          [owner.x, other.x] = [other.x, owner.x];
          [owner.y, other.y] = [other.y, owner.y];
          [owner.vx, other.vx] = [other.vx, owner.vx];
          [owner.vy, other.vy] = [other.vy, owner.vy];
          for (const p of [owner, other]) {
            p.moveTarget = null; p.dash = null; p.charging = null;
          }
          // no `id` field on purpose: a swap always shows both ends, even if
          // one of them is vanished (revealing is the accepted cost)
          state.events.push({ t: 'swapped', a: owner.id, b: other.id,
            x: owner.x, y: owner.y, x2: other.x, y2: other.y });
        }
      }

      // Pops on the body it hits — unless the projectile PIERCES, which is now a
      // per-projectile flag instead of a hardcoded type list (the boomerang has
      // always pierced; a ghost fireball does too). Piercing shots remember
      // every body they have already touched, so one lingering ball can never
      // hit the same person twice, and `pierced` tells the next victim they are
      // standing behind someone.
      if (!pr.pierce) dead = true;
      else { pr.hit[other.id] = true; pr.pierced = (pr.pierced || 0) + 1; }
      break;
    }
    if (!dead) keep.push(pr);
  }
  state.projectiles = keep;
}

// ---- mosquito (elemental) -------------------------------------------------
// 2026-08-07 rework: no geometry at all. A sting leaves ONE stack of its owner
// on the victim (the same private store frost uses); the owner's next hit on
// that victim spends it and buys them TWO of their own normal fireballs,
// slightly staggered in time. Every on-hit effect the owner has therefore fires
// twice — and a well-timed teleport can still dodge the second ball.

function plantMosquitoStack(state, target, ownerId) {
  if (ownerId == null) return;
  // one stack, not a growing pile: the trap is either armed or it is not
  const store = target.stacks || (target.stacks = {});
  const s = store.mosquito || (store.mosquito = {});
  if (s[ownerId]) return;
  s[ownerId] = 1;
  state.events.push({ t: 'bite', id: target.id, by: ownerId, x: target.x, y: target.y });
}

// Spend already done by the caller: fire `procBalls` of the owner's NORMAL
// fireballs. 2026-08-07, Remi's call — ALL of them leave from the SAME point
// with the SAME vector, so they land together and there is nothing to aim, chase
// or re-solve. (The previous version staggered them by `procGap` and re-aimed
// each release at the victim's live position; the stagger is what let constant
// knockback carry the victim out of the second ball's path, and the fix for that
// was more machinery than the whole effect is worth. His framing: *"put the 2
// balls at exactly the same place — we'd just need to clearly see all the on-hit
// indicators pop twice"*. The feedback IS the feature, so it moved to the
// client: co-located popups fan out and stagger there — see pushFloater in
// client/main.js — and the sim just fires N identical balls.)
//
// The muzzle is the CONTACT point of the sting, not the end of its tick's
// travel: the ball that cashed the mark may have swept a little past the body
// this frame, and a grazing hit released from there would fly on and miss. Every
// ball therefore starts exactly where the sting touched, which puts the victim
// on its path by construction. All of them carry `noStacks`, the hard rule that
// stops the proc triggering itself.
function fireMosquitoProc(state, pr, target) {
  const owner = state.players[pr.owner];
  if (!owner) return;
  const f = ELEMENTS.mosquito.fx;
  const v = Math.hypot(pr.vx, pr.vy) || 1;
  const dx = pr.vx / v, dy = pr.vy / v;
  const level = owner.spells.fireball || pr.level || 1;
  // how far past the victim's closest approach this tick's travel carried us
  const ahead = Math.max(0, (pr.x - target.x) * dx + (pr.y - target.y) * dy);
  const x = pr.x - dx * ahead, y = pr.y - dy * ahead;
  state.events.push({ t: 'biteHit', id: target.id, by: pr.owner, x, y });
  for (let i = 0; i < f.procBalls; i++) {
    spawnFireball(state, owner, level, dx, dy, {
      x, y, plain: true, noStacks: true,
      // OPTIONAL nerf lever, absent from the spec by default (see ELEMENTS
      // .mosquito): scales the proc balls' damage only, leaving every on-hit
      // effect procing `procBalls` times.
      ...(f.procDmgMult != null ? { dmgMult: f.procDmgMult } : {}),
      // KNOCKBACK ONCE (Remi, 2026-08-07): impulses add linearly, so N
      // co-located balls at 1/N each shove for exactly one fireball, whatever
      // procBalls is. Damage and every on-hit effect still fire N times.
      kbScale: 1 / f.procBalls,
    });
    state.events.push({
      t: 'cast', id: owner.id, spell: 'fireball', x, y, dx, dy,
    });
  }
}

// Turn a boomerang around toward its LAUNCH POINT (not the thrower — standing
// in its path to catch it is the skill). Used by the recall key and by the
// automatic turn at max range; `turnAt` remembers the out-leg length so the
// "flew past the origin, gone forever" rule works for early recalls too.
function turnBoomerangHome(state, pr) {
  const spec = SPELLS.boomerang;
  pr.returning = true;
  pr.turnAt = pr.traveled;
  // pr.hit is deliberately KEPT: the out-leg knockback shoves victims along
  // the throw lane and a straight return would re-hit them for free — one hit
  // per enemy per throw; the return leg only threatens fresh targets.
  const bx = (pr.ox ?? pr.x) - pr.x, by = (pr.oy ?? pr.y) - pr.y;
  const bd = Math.hypot(bx, by);
  if (bd > 1e-6) { pr.vx = (bx / bd) * spec.speed; pr.vy = (by / bd) * spec.speed; }
  else { pr.vx = -pr.vx; pr.vy = -pr.vy; }
  state.events.push({ t: 'recall', id: pr.owner, x: pr.x, y: pr.y });
}

// ---- gale (elemental) -----------------------------------------------------
// 2026-08-07 rework (Remi: *"change the wind's gameplay to redo it like with the
// ice, where the pushback is enormous after three stacks and normal the rest of
// the time"*). Gale used to be a flat `kbMult` on every hit; it is now frost's
// shape — one private stack per landed gale fireball, ordinary knockback while
// they build, and the 3rd stack spent on one enormous gust.
//
// Why this is a function of its own instead of another branch in
// applyElementsHit next to frost and venom: gale's payload is KNOCKBACK, and
// knockback is computed and applied BEFORE the on-hit riders run. So gale has to
// resolve at the same point mosquito's mark does — decided on the way in, not on
// the way out. Returns the knockback multiplier for THIS hit: 1 while stacking,
// the level's burst multiplier on the 3rd.
//
// The counter is the generic per-attacker store (addStack/clearStacks), so
// "private to whoever applied them" is the same one mechanism frost and mosquito
// use rather than a third implementation. An ownerless ball (its caster left)
// can neither place nor spend a stack: there is nobody to own the counter.
function galeHit(state, pr, target, level) {
  const f = ELEMENTS.gale.fx;
  if (pr.owner == null) return 1;
  const n = addStack(target, 'gale', pr.owner);
  // every landing is an event, exactly like frost's pips: the player has to be
  // able to watch the gust winding up or this reads as a random shove
  state.events.push({
    t: 'gale', id: target.id, stacks: n, by: pr.owner,
    of: f.stacksToTrigger, x: target.x, y: target.y,
  });
  if (n < f.stacksToTrigger) return 1;
  clearStacks(target, 'gale', pr.owner);
  state.events.push({
    t: 'galeBurst', id: target.id, by: pr.owner, x: target.x, y: target.y,
  });
  return efxV(f.burstKbMult, level);
}

// Elemental on-hit riders (frost / venom / midas / terra), each at its own
// level. Ember is a pure number tweak handled at the damage/knockback
// computation above; gale is resolved there too, by galeHit().
function applyElementsHit(state, pr, target) {
  for (const [ek, el] of Object.entries(pr.elements)) {
    const f = ELEMENTS[ek].fx;
    // frost: stacks build on the VICTIM but are PRIVATE to each attacker
    // (2026-08-07, round 12 — reverses the 2026-08-06 shared counter). Only
    // your own 3 detonate, so your element's power no longer depends on what
    // everyone else bought. The level of whoever lands the 3rd decides how bad
    // it is, and only that attacker's counter is cleared.
    //
    // ⚠ Keyed on the element NAME, not on `f.stacksToTrigger` alone: gale is a
    // stack-and-burst element too now and declares the same field. The body
    // below is frost-specific anyway (it names the 'frost' stack kind and pushes
    // frost/frostBreak events) — gale's twin lives in galeHit(), because its
    // payload is knockback and that is resolved before the riders run.
    if (ek === 'frost' && f.stacksToTrigger) {
      const n = addStack(target, 'frost', pr.owner);
      state.events.push({
        t: 'frost', id: target.id, stacks: n, by: pr.owner,
        of: f.stacksToTrigger, x: target.x, y: target.y,
      });
      if (n >= f.stacksToTrigger) {
        clearStacks(target, 'frost', pr.owner);
        const stun = efxV(f.stunT, el);
        const slowT = efxV(f.slowT, el);
        if (stun > 0) {
          target.stunT = Math.max(target.stunT || 0, stun);
          target.moveTarget = null;
          target.dash = null;
          target.charging = null;
        }
        if (slowT > 0) {
          target.slowT = slowT;
          target.slowMultHit = efxV(f.slowMult, el);
        }
        state.events.push({
          t: 'frostBreak', id: target.id, stun: stun > 0,
          x: target.x, y: target.y,
        });
      }
    }
    if (f.tickDmg) {
      // re-hits REFRESH the clock and STACK the tick damage (capped);
      // a fresh victim starts a new clock with the base tick
      if (target.poisonT > 0) {
        target.poisonTick = Math.min(efxV(f.stackCap, el),
          (target.poisonTick || 0) + efxV(f.stackAdd, el));
      } else {
        target.poisonTick = efxV(f.tickDmg, el);
        target._poisonNext = f.tickEvery;
      }
      target.poisonT = f.dotTime;
      target.poisonBy = pr.owner;
    }
    if (f.goldOnHit && pr.owner != null) {
      const owner = state.players[pr.owner];
      if (owner) {
        // capped at +1 g per hit at every level, forever (2026-08-06): the
        // levels buy back the damage/push penalty instead of raising income
        const pay = efxV(f.goldOnHit, el);
        owner.gold += pay;
        owner.goldEarned += pay;
        owner.roundGold += pay;
        state.events.push({ t: 'gold', id: pr.owner, amount: pay, x: pr.x, y: pr.y });
      }
    }
    if (f.rampDmg && pr.owner != null) {
      // momentum: one more permanent point of fireball damage, banked for the
      // rest of the GAME (never reset in startRound)
      const owner = state.players[pr.owner];
      if (owner) owner.momentumHits = (owner.momentumHits || 0) + 1;
    }
    // arcane lv3 (round 16): a landed FIREBALL refunds seconds off every
    // cooldown the owner has running, per enemy hit. hitRefund is 0 below the
    // unlock level, so this line prices lv1/2 at nothing by construction.
    if (f.hitRefund && pr.owner != null) {
      const refund = efxV(f.hitRefund, el);
      const owner = refund > 0 ? state.players[pr.owner] : null;
      // only an enemy's blood buys you time (friendly fire heals no cooldowns)
      if (owner && owner.alive && hostile(owner, target))
        arcaneRefund(state, owner, refund, f.cdFloor);
    }
  }
}

// ---- serialization ------------------------------------------------------

// The stacks `viewerId` has personally applied to `p`, as {kind: n}. Omitted
// entirely when there are none, so an ordinary snapshot carries no extra bytes.
function viewStacks(p, viewerId) {
  const out = {};
  for (const kind of Object.keys(p.stacks || {})) {
    const n = stackCount(p, kind, viewerId);
    if (n > 0) out[kind] = n;
  }
  return Object.keys(out).length ? { myStacks: out } : {};
}

// What is riding on your own body: per kind, the biggest single attacker's pile.
function ownStacks(p) {
  const out = {};
  for (const kind of Object.keys(p.stacks || {})) {
    const n = worstStack(p, kind);
    if (n > 0) out[kind] = n;
  }
  return Object.keys(out).length ? { stacksOnMe: out } : {};
}

// Strip internals for the wire. Events are drained separately by the server.
//
// PER-VIEWER (2026-08-07, round 12): `viewerId` is the player this snapshot is
// being built for. Stacks are private to whoever applied them, so a single
// broadcast blob can no longer serve everyone — the server builds one snapshot
// per socket. Pass null (tests, journals, crash dumps) for the neutral view.
// Everything viewer-dependent lives behind the `elemental` guard, so classic and
// co-op snapshots are byte-identical whatever viewerId says.
// Events that must reach EVERY viewer even when they belong to an invisible
// player: a death is public (and clears vanishT anyway), and so is the fact that
// somebody just killed a teammate.
const PUBLIC_EVENTS = new Set(['death', 'teamkill']);

// Per-viewer event filter — the twin of snapshot()'s per-viewer player view, and
// just as load-bearing for Vanish. Events carry positions (`cast`, `hit`, `gold`,
// `teleport`, `frost`…), so stripping a player's position from the snapshot and
// then broadcasting their casts would hand the position straight back. Anything
// anchored on an invisible player is dropped for everyone but that player.
// ⚠ What deliberately still leaks: `boom` (a projectile detonating on an
// invisible body) and the victim's own damage numbers if THEY are visible. You
// can still be hit while invisible, and a hit that produced no feedback at all
// would be a bug, not stealth.
export function viewEvents(state, events, viewerId = null) {
  if (!events || !events.length) return events;
  let anyHidden = false;
  for (const p of Object.values(state.players))
    if (p.vanishT > 0) { anyHidden = true; break; }
  if (!anyHidden) return events;   // the overwhelmingly common case: no copy
  return events.filter((e) => {
    if (!e || e.id == null || e.id === viewerId) return true;
    const p = state.players[e.id];
    if (!p || !(p.vanishT > 0)) return true;
    return PUBLIC_EVENTS.has(e.t);
  });
}

export function snapshot(state, viewerId = null) {
  const elemental = state.mode === 'elemental';
  const coop = state.mode === 'coop';
  const players = {};
  for (const [id, p] of Object.entries(state.players)) {
    // Vanish (SPELLS.vanish): an invisible player's POSITION never reaches
    // anyone else's snapshot — docs/ROUND12.md N4 is explicit that skipping the
    // draw client-side is not good enough, because devtools sees through it.
    // The roster entry stays (name, colour, kills, gold), so the topbar does not
    // flicker somebody out of the standings every time they blink out; what
    // leaves is x/y and everything drawn AT x/y. The renderer already skips any
    // player whose x/y is not finite, so this needs no client cooperation —
    // client/render.js just never gets a place to draw.
    const hidden = p.vanishT > 0 && p.id !== viewerId;
    players[id] = {
      id: p.id, name: p.name, color: p.color, bot: p.bot, avatar: p.avatar,
      kind: p.kind, build: p.build || null, shopReady: p.shopReady,
      // co-op-only wire fields — classic snapshots stay byte-identical
      ...(coop ? { team: p.team || null, wave: !!p.wave } : {}),
      ...(hidden ? {} : { x: round2(p.x), y: round2(p.y) }),
      hp: Math.ceil(p.hp), maxHp: p.maxHp,
      alive: p.alive, ready: p.ready,
      gold: p.gold, goldEarned: p.goldEarned, kills: p.kills, deaths: p.deaths,
      // per-ROUND counters, beside the per-GAME ones above. Both are on the wire
      // because the live spectator scoreboard shows them side by side and the
      // player has to be able to tell "this round" from "this game" at a glance
      // (the table labels them; see statsTable() in client/main.js).
      roundGold: p.roundGold, roundKills: p.roundKills,
      dmgDealt: Math.round(p.dmgDealt), dmgLava: Math.round(p.dmgLava),
      healLifesteal: Math.round(p.healLifesteal), healRegen: Math.round(p.healRegen),
      multiKillBest: p.multiKillBest,
      spectator: p.spectator, radius: round2(p.radius),
      againReady: !!p.againReady,
      spells: p.spells, items: p.items,
      cooldowns: mapRound(p.cooldowns),
      // effective stats at your current item levels — the shop/stats panel
      // shows these so "what did lv 3 rings actually buy me" is answerable
      stats: (() => {
        const s = stats(p);
        return {
          speed: round2(s.speed), regen: round2(s.regen),
          lifesteal: round2(s.lifesteal), kbMult: round2(s.kbMult),
          lavaMult: round2(s.lavaMult),
        };
      })(),
      shieldT: round2(p.shieldT),
      inLava: !!p.inLava,
      dashing: !!p.dash,
      charging: !!p.charging,
      // your OWN invisibility, so the client can show you that it is running and
      // when it is about to end. Never present on anybody else's entry.
      ...(p.vanishT > 0 && p.id === viewerId ? { vanishT: round2(p.vanishT) } : {}),
      // draft mode: your OWN free offer, nobody else's. Absent entirely when the
      // toggle is off (and when it is on but this shop carries no offer).
      ...(p.draftOffer && p.id === viewerId ? { draftOffer: p.draftOffer } : {}),
      // elemental-only wire fields — classic snapshots stay byte-identical
      ...(elemental ? {
        elements: p.elements,
        slow: p.slowT > 0, poison: p.poisonT > 0,
        stun: p.stunT > 0,
        momentumHits: p.momentumHits || 0, // so the HUD can show the ramp building
        // vampire: casts banked toward the next engorged ball, so the HUD can
        // count it down for you (2/3 → the next one is the big one)
        vampN: p.vampN || 0,
        // PRIVATE: only the stacks the VIEWER put on this body. This is the one
        // thing you need to see to play a stacking element — is my frost
        // detonation one hit away, is my mosquito trap armed on that target —
        // and nobody else's counter is on the wire at all.
        ...(viewerId != null && p.id !== viewerId
          ? viewStacks(p, viewerId) : {}),
        // ...and on your OWN body, the worst single attacker's count, which is
        // the honest "a detonation is coming" warning. Attacker identities stay
        // off the wire.
        ...(p.id === viewerId ? ownStacks(p) : {}),
      } : {}),
    };
  }
  return {
    phase: state.phase, phaseT: round2(state.phaseT),
    mode: state.mode,
    // absent while running, so a classic snapshot is unchanged
    ...(state.shopPaused ? { shopPaused: state.shopPaused } : {}),
    // draft mode: the flag (so the lobby toggle reads back) and the pool, which
    // is public by design — it is the same for everyone, and the shop has to know
    // which shelves are empty this game. Both absent while the toggle is off, so
    // a classic snapshot is unchanged.
    ...(state.draft ? { draft: true, draftPool: state.draftPool || [] } : {}),
    round: state.round, time: round2(state.time),
    arenaRadius: round2(state.arenaRadius),
    pillars: (state.pillars || []).map(p => ({
      x: round2(p.x), y: round2(p.y), r: round2(p.r), sunk: !!p.sunk,
    })),
    winner: state.winner,
    roundSummary: state.roundSummary || null,
    meteors: (state.meteors || []).map(m => ({ x: round2(m.x), y: round2(m.y), t: round2(m.t) })),
    // sky-bolt telegraphs are public by design: the dodge window IS the spell
    bolts: (state.bolts || []).map(m => ({
      x: round2(m.x), y: round2(m.y), t: round2(m.t), level: m.level,
    })),
    walls: (state.walls || []).map(w => ({
      x1: round2(w.x1), y1: round2(w.y1), x2: round2(w.x2), y2: round2(w.y2), owner: w.owner,
    })),
    players,
    projectiles: state.projectiles.map(p => ({
      id: p.id, type: p.type, x: round2(p.x), y: round2(p.y),
      vx: round2(p.vx), vy: round2(p.vy), owner: p.owner,
      ...(p.elements ? { elements: p.elements } : {}),
      // vampire: the engorged ball must LOOK different — both fields can only
      // ever be set in elemental mode, so a classic projectile is byte-identical
      ...(p.engorged ? { engorged: 1 } : {}),
    })),
    // campaign HUD state, co-op only
    ...(coop && state.coop ? {
      coop: {
        level: state.coop.level, name: state.coop.name, brief: state.coop.brief,
        roster: state.coop.roster, maxLevel: MAX_LEVEL,
        attempt: state.coop.attempt, roundsLeft: ROUND.COOP_MAX_ROUNDS - state.round,
        partyAlive: partyOf(state).filter(p => p.alive).length,
        partySize: state.coop.partySize,
        waveAlive: waveOf(state).filter(p => p.alive).length,
        pending: state.coop.pending.length,
        cleared: !!state.coop.cleared, wiped: !!state.coop.wiped,
      },
    } : {}),
    // venom ground trails, elemental only (a = remaining-life fade 0..1)
    ...(elemental ? {
      hazards: (state.hazards || []).map(h => ({
        x: round2(h.x), y: round2(h.y), r: round2(h.r),
        a: round2(clamp((h.until - state.time) / 1.5, 0, 1)),
      })),
    } : {}),
  };
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
// FOUR difficulty tiers, dispatched on the kind's `brain` (see BOTS in
// constants.js) — never on the kind itself, which is why Normal costs no new AI:
//   grunt     Easy    'grunt'     wanders and throws at nothing — cannon fodder
//   brawler   Normal  'berserker' the same brawler with a slower read and looser aim
//   berserker Hard    'berserker' rushes in, leads its shots, shoves you off the rim
//   stalker   Extreme 'stalker'   dodges projectiles, teleport lava saves
// Adding a tier is therefore a BOTS entry (label + brain + react/aimErr) plus a
// BOT_BUILDS/BOT_ELEMENTS line, and nothing here.

const BRAINS = {
  grunt: stepGrunt,
  berserker: stepBerserker,
  stalker: stepStalker,
};

export function stepBot(state, id, dt) {
  const pl = state.players[id];
  if (!pl || !pl.alive || state.phase !== 'battle') return;
  const spec = BOTS[pl.kind];
  // refresh perception BEFORE deciding: everything a bot knows about where the
  // enemies are comes from this (see rememberEnemies / enemiesSeen)
  rememberEnemies(state, pl);
  (BRAINS[spec && spec.brain] || stepGrunt)(state, pl, dt);
  pilotOwnedSpells(state, pl, dt);
  unwedgeFromPillars(state, pl, dt);
}

// A tier's piloting numbers, read off BOTS with today's hardcoded values as the
// fallback so a BOTS entry that omits them cannot silently change how a bot
// plays. `react: [base, jitter]` is the decision interval (a PERCEPTION delay,
// not a handicap — see the aim block in stepBerserker) and `aimErr:
// [floor, perUnit]` is the aim error, floor + distance × perUnit.
function botTune(pl, key, dflt) {
  const spec = BOTS[pl.kind];
  const v = spec && spec[key];
  return Array.isArray(v) && v.length === 2 && v.every(n => Number.isFinite(n))
    ? v : dflt;
}

// Telegraph awareness (round 17, minimal — Session C owns the full pilot):
// where to step to leave the nearest sky-bolt zone covering this bot, or null.
// Without this every measurement of the new lightning is garbage — a bot that
// stands in a marked circle prices the spell as unmissable.
function boltEscape(state, pl) {
  if (!state.bolts.length) return null;
  let worst = null, worstD = Infinity;
  for (const m of state.bolts) {
    const dd = Math.hypot(pl.x - m.x, pl.y - m.y);
    if (dd < SPELLS.lightning.radius + pl.radius + 0.6 && dd < worstD) {
      worst = m; worstD = dd;
    }
  }
  if (!worst) return null;
  const dd = worstD > 1e-6 ? worstD : 1;
  const nx = (pl.x - worst.x) / dd, ny = (pl.y - worst.y) / dd;
  const hop = SPELLS.lightning.radius + pl.radius + 1.5;
  let ex = worst.x + nx * hop, ey = worst.y + ny * hop;
  // never step out of the bolt into the lava: cross to the far side instead
  if (Math.hypot(ex, ey) > state.arenaRadius - 1) {
    ex = worst.x - nx * hop; ey = worst.y - ny * hop;
  }
  return { x: ex, y: ey };
}

// Aim for the new lightning (round 17): the bolt lands `delay` after the cast,
// so lead the target by exactly that — and never drop it on your own head.
function boltAim(state, pl, target) {
  const spec = SPELLS.lightning;
  const v = estVel(target);
  const x = target.x + v.vx * spec.delay, y = target.y + v.vy * spec.delay;
  if (Math.hypot(x - pl.x, y - pl.y) < spec.radius + pl.radius + 1) return null;
  return { x, y };
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

  // the ★ grunt is pure chaos by design (2026-08-06): it doesn't aim ANY of
  // its spells, it just lets them off in random directions. Shield is the one
  // exception — a randomly-timed shield is indistinguishable from no shield.
  if (pl.kind === 'grunt') {
    for (const k of ['boomerang', 'lightning', 'rush', 'pillar']) {
      if (!owns(k)) continue;
      if (k === 'rush' && pl.dash) continue;
      const a = rng(state) * Math.PI * 2;
      if (castSpell(state, pl.id, k, pl.x + Math.cos(a) * 20, pl.y + Math.sin(a) * 20)) return;
    }
    if (owns('shield') && rng(state) < 0.05) castSpell(state, pl.id, 'shield', pl.x, pl.y);
    return;
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
    const errMult = pl.kind === 'grunt' ? 0.3 : pl.kind === 'berserker' ? 0.18 : 0.04;
    const err = (rng(state) - 0.5) * dist * errMult;
    if (castSpell(state, pl.id, 'boomerang',
        target.x + v.vx * t - (tdy / dist) * err,
        target.y + v.vy * t + (tdx / dist) * err)) return;
  }

  // lightning poke (stalker uses it natively): drop the sky-bolt on the
  // target's predicted spot (round 17); grunts stay a bit sloppy
  if (pl.kind !== 'stalker' && owns('lightning') && dist < SPELLS.lightning.range - 2) {
    const aim = boltAim(state, pl, target);
    const err = pl.kind === 'grunt' ? (rng(state) - 0.5) * dist * 0.15 : 0;
    if (aim && castSpell(state, pl.id, 'lightning',
        aim.x - (tdy / dist) * err,
        aim.y + (tdx / dist) * err)) return;
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

// Bot PERCEPTION. Bots read the simulation directly, so without this a Vanish
// would be worth nothing against them and Extreme would be an aimbot that
// ignores the spell (docs/ROUND12.md N4). Rather than blinding them — which is
// LESS human than seeing you, since a person does not forget you exist the
// instant you blink out — every bot keeps a short memory of where it last saw
// each enemy and keeps shooting THERE for BOT_MEMORY seconds. So vanishing makes
// a bot's aim stale (walk out of the ghost and its shots go where you were), and
// staying invisible past the memory makes it lose you entirely.
//
// `enemiesSeen` returns, per hostile enemy: the live player if visible, or a
// frozen stand-in at the remembered position if not, or nothing once forgotten.
// The stand-in carries vx/vy = 0 and moveTarget/dash = null, so estVel and
// interceptPoint aim straight at the last known spot with no lead — which is
// exactly what a human does with a target that disappeared.
// Is anybody hidden right now? Perception costs nothing in the overwhelmingly
// common case (nobody owns Vanish), and both helpers below fall straight through
// to reading the live players.
function anyHidden(state) {
  for (const p of Object.values(state.players)) if (p.vanishT > 0) return true;
  return false;
}

// Does the spell exist in this game at all? The memory has to be recorded BEFORE
// someone blinks out — gating it on "somebody is hidden right now" would leave
// every bot with an empty memory at exactly the moment it needs one — so the
// trigger is owning the spell, not using it.
function vanishInPlay(state) {
  for (const p of Object.values(state.players))
    if (p.vanishT > 0 || (p.spells && p.spells.vanish > 0)) return true;
  return false;
}

function rememberEnemies(state, pl) {
  if (!pl.bot || !vanishInPlay(state)) return;  // nothing to remember for
  const mem = pl._seen || (pl._seen = {});
  for (const other of Object.values(state.players)) {
    if (other === pl || !other.alive || !hostile(pl, other)) continue;
    if (other.vanishT > 0) continue;         // can't see it, can't record it
    const m = mem[other.id];
    if (m) {
      m.x = other.x; m.y = other.y; m.hp = other.hp;
      m.radius = other.radius; m.t = state.time;
    } else {
      mem[other.id] = {
        id: other.id, x: other.x, y: other.y, hp: other.hp,
        radius: other.radius, t: state.time,
      };
    }
  }
}

function enemiesSeen(state, pl) {
  const out = [];
  const hiding = anyHidden(state);
  const mem = pl._seen;
  for (const other of Object.values(state.players)) {
    if (other === pl || !other.alive || !hostile(pl, other)) continue;
    if (!hiding || !(other.vanishT > 0)) { out.push(other); continue; }
    const m = mem && mem[other.id];
    if (!m || state.time - m.t > BOT_MEMORY) continue;  // lost them
    out.push({
      id: m.id, x: m.x, y: m.y, hp: m.hp, radius: m.radius,
      vx: 0, vy: 0, moveTarget: null, dash: null, alive: true,
      spells: other.spells, items: other.items, elements: other.elements,
      // the kill count is SCOREBOARD, not position: everyone can read it off
      // the topbar whether or not you are invisible, so the leader bias below
      // must not flicker on and off with a Vanish. Nothing here is a leak.
      kills: other.kills,
      maxHp: other.maxHp, _ghost: true,   // a memory, not a body
    });
  }
  return out;
}

// How many kills `e` is AHEAD of `pl` — exactly the gap the gold bounty is paid
// on (kill(): `target.kills - killer.kills`, floored at 0, GOLD.BOUNTY_PER_GAP),
// so the economy and the AI agree about who is "ahead". Floored at 0 means the
// leader never hunts anybody for being ahead, and a level field yields 0 for
// everyone — the bias only wakes up once somebody actually pulls away.
//
// Free-for-all ONLY. In co-op the whole party is one team and the wave has its
// own targeting; a monster's kill tally is not a scoreboard anyone is racing, so
// `pl.team != null` (any co-op fighter, party or wave) switches this off.
export function killLead(pl, e) {
  if (!pl || !e) return 0;
  if (pl.team != null || pl.wave) return 0;   // co-op: no leader race
  return Math.max(0, (e.kills || 0) - (pl.kills || 0));
}

// The prey-score discount for a target's kill lead, in ARENA UNITS of apparent
// distance (see BOT_TARGETING.LEADER_BIAS). Subtract it from a distance-shaped
// score; multiply by the score's distance coefficient elsewhere.
function leadPull(pl, e) {
  return killLead(pl, e) * BOT_TARGETING.LEADER_BIAS;
}

function nearestEnemy(state, pl, hpWeight = 0, leadBias = false) {
  // lowest (distance + hp*weight): weight 0 = strictly nearest,
  // small weight = prefer wounded targets among comparably close ones.
  // `leadBias` additionally makes a runaway kill leader feel closer than it is
  // — a bias inside the same score, not an override (BOT_TARGETING.LEADER_BIAS).
  let best = null, bestScore = Infinity;
  for (const other of enemiesSeen(state, pl)) {
    const d = Math.hypot(other.x - pl.x, other.y - pl.y);
    const score = d + other.hp * hpWeight - (leadBias ? leadPull(pl, other) : 0);
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
// NOT masked by Vanish, deliberately: you are invisible, your spells are not
// (docs/ROUND12.md N4), so a fireball thrown by an invisible player is dodged
// like any other. It is also the one cue that gives you away — as it should.
function scanThreats(state, pl, horizon, margin) {
  let worst = null;
  for (const pr of state.projectiles) {
    // an ally's fireball is not a threat: don't dodge it, don't burn a shield
    if (pr.owner === pl.id) continue; // friendly fire: an ally's shot hurts too
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

// -- grunt ★: pure chaos ----------------------------------------------------
// 2026-08-06 (Remi: "make the easiest one completely random"). It no longer
// aims at anybody: it wanders to random spots and fires in random directions.
// The ONE instinct it keeps is not drowning — a grunt that walks into the
// lava on round 1 stops being even a punching bag. Everything else is dice.

function stepGrunt(state, pl, dt) {
  const id = pl.id;
  pl._botT = (pl._botT || 0) - dt;
  if (pl._botT > 0) return;
  pl._botT = 0.25 + rng(state) * 0.3;

  // the single instinct: if we're swimming (or about to), head back inside
  const d = Math.hypot(pl.x, pl.y);
  const safe = Math.max(2, state.arenaRadius - 6);
  if (d > safe) {
    const s = (safe - 2) / (d || 1);
    setMoveTarget(state, id, pl.x * s, pl.y * s);
  } else if (rng(state) < 0.35) {
    const a = rng(state) * Math.PI * 2, r = rng(state) * safe;
    setMoveTarget(state, id, Math.cos(a) * r, Math.sin(a) * r);
  }

  // fire into the void: a uniformly random bearing, no target, no lead
  if ((pl.cooldowns.fireball || 0) <= 0) {
    const a = rng(state) * Math.PI * 2;
    castSpell(state, id, 'fireball', pl.x + Math.cos(a) * 20, pl.y + Math.sin(a) * 20);
  }
}

// Berserker target choice: closest wins, but wounded, isolated, rim-standing,
// or FAR AHEAD ON KILLS enemies are tastier. Lower score = better prey.
//
// The kill-lead term (2026-08-07) is deliberately one weighted term among five
// and not a rule: at BOT_TARGETING.LEADER_BIAS = 2.5 a 10-kill lead is worth 25
// arena units of apparent distance out of a 56-unit start radius, which flips
// the choice between two roughly equal candidates and still loses to "half-dead
// and 30 units nearer". That is the balance Remi asked for — a rebalancing
// tendency, not a 3-v-1 rule.
//
// Exported for the tests: this is THE bot-targeting seam, and the leader bias
// is only observable here without reverse-engineering a strafe ring.
export function pickPrey(state, pl) {
  const arena = Math.max(state.arenaRadius, 1);
  const enemies = enemiesSeen(state, pl);   // a vanished enemy is a memory or nothing
  let best = null, bestScore = Infinity;
  for (const e of enemies) {
    const d = Math.hypot(e.x - pl.x, e.y - pl.y);
    let crowd = 0; // how much backup this enemy has nearby
    for (const o of enemies) {
      if (o === e) continue;
      crowd += Math.max(0, 18 - Math.hypot(o.x - e.x, o.y - e.y));
    }
    const rim = Math.min(1, Math.hypot(e.x, e.y) / arena); // 1 = at the edge
    // 0.8 = this score's distance coefficient, so leadPull stays in arena units
    const score = d * 0.8 + e.hp * 0.35 + crowd * 0.8 - rim * 8
      - leadPull(pl, e) * 0.8;
    if (score < bestScore) { best = e; bestScore = score; }
  }
  return best;
}

// -- berserker ★★: relentless brawler ---------------------------------------
// Hunts the nearest (slightly preferring wounded) enemy, rushes to close,
// fireballs point-blank with intercept aim, and herds rim-standers into the
// lava by aiming past them. Only ever retreats from the lava edge itself.
// 2026-08-05 reaction-time pass: the ★★ used to decide every 0.14 s and its
// aim error was proportional to distance — i.e. PERFECT at point-blank, which
// made end-game duels feel unwinnable. Now it (a) decides every ~0.21 s,
// (b) aims from the PREVIOUS tick's observation of its mark, extrapolated
// across that lag (see the aim block: it leads you fine while you hold a
// heading, and eats the whiff when you change direction inside its reaction
// window), and (c) carries an absolute aim-error floor so point-blank stays
// human. Calibrated with `node tools/h2h.js berserker grunt` (2 seats each,
// 50% = parity): the old ★★ won 99.6% of those games, this one wins ~75%,
// while `h2h.js stalker berserker` still reads 100% — the ★/★★/★★★ ladder
// is intact and only the knife-fight aimbot is gone.

function stepBerserker(state, pl, dt) {
  const id = pl.id;
  // both tiers on this brain read their numbers from BOTS: Hard (berserker) has
  // [0.16, 0.10], Normal (brawler) is the SAME code with a slower read
  const [reactBase, reactJitter] = botTune(pl, 'react', [0.16, 0.10]);
  pl._botT = (pl._botT || 0) - dt;
  if (pl._botT > 0) return;
  pl._botT = reactBase + rng(state) * reactJitter;

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

  // telegraph threat (round 17): even the berserker steps out of a marked
  // sky-bolt zone — standing in one is not aggression, it is a donation
  if (!fleeing) {
    const esc = boltEscape(state, pl);
    if (esc) { setMoveTarget(state, id, esc.x, esc.y); return; }
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
  for (const o of enemiesSeen(state, pl)) {
    if (o.hp > 16) continue;
    if (Math.hypot(o.x - pl.x, o.y - pl.y) > 24) continue;
    if (!mark || o.hp < mark.hp) mark = o;
  }
  if (!mark) mark = nearestEnemy(state, pl);
  // reaction lag: refresh the observation of the mark every decision tick,
  // but aim from the PREVIOUS one, extrapolated forward across the lag.
  // (A human who saw you a moment ago still leads you correctly while you
  // hold a heading — what they cannot do is react to a direction change
  // inside their reaction window. Aiming at the raw stale POSITION instead
  // would under-lead by lag×speed ≈ 2.3 u on every shot, which measured as
  // a total whiff machine: the ★★ fell to ★ strength in head-to-head.)
  let seen = null;
  if (mark) {
    seen = pl._obs && pl._obs.id === mark.id ? pl._obs : null;
    const mv = estVel(mark);
    pl._obs = { id: mark.id, x: mark.x, y: mark.y, vx: mv.vx, vy: mv.vy, t: state.time };
  }
  if (mark && (pl.cooldowns.fireball || 0) <= 0) {
    const mdx = mark.x - pl.x, mdy = mark.y - pl.y;
    const mDist = Math.hypot(mdx, mdy) || 1;
    const lag = seen ? Math.max(0, Math.min(0.5, state.time - seen.t)) : 0;
    const ghost = seen
      ? { x: seen.x + seen.vx * lag, y: seen.y + seen.vy * lag,
          vx: seen.vx, vy: seen.vy, moveTarget: null, dash: null }
      : { x: mark.x, y: mark.y, vx: 0, vy: 0, moveTarget: null, dash: null };
    const aim = interceptPoint(pl, ghost, SPELLS.fireball.speed);
    let ax = aim.x, ay = aim.y;
    const mCenter = Math.hypot(mark.x, mark.y);
    // only bend the shot outward when we're already shooting outward-ish,
    // otherwise the shift just turns a clean intercept into a whiff
    const outward = (mdx * mark.x + mdy * mark.y) / (mDist * (mCenter || 1));
    if (mCenter > arena * 0.55 && mCenter > 1 && outward > 0.5) {
      ax += (mark.x / mCenter) * 2.5;
      ay += (mark.y / mCenter) * 2.5;
    }
    // error floor: the old term (dist * 0.12) vanished at point-blank, which is
    // what made knife fights feel unwinnable. Per-tier, off BOTS.
    const [errFloor, errPerUnit] = botTune(pl, 'aimErr', [0.35, 0.10]);
    const err = (rng(state) - 0.5) * (errFloor + mDist * errPerUnit);
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
  const [reactBase, reactJitter] = botTune(pl, 'react', [0.12, 0.08]);
  pl._botT = (pl._botT || 0) - dt;
  if (pl._botT > 0) return;
  pl._botT = reactBase + rng(state) * reactJitter; // short human-ish, not aimbot

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

  // -- telegraph threat (round 17): step OUT of a marked sky-bolt zone. Held
  // like a projectile dodge so the kite step doesn't walk straight back in.
  if (!doomed && !dodging) {
    const esc = boltEscape(state, pl);
    if (esc) {
      setMoveTarget(state, id, esc.x, esc.y);
      dodging = true;
      pl._dodgeT = Math.max(pl._dodgeT, 0.3);
    }
  }

  // the stalker gets the same kill-leader bias as pickPrey (its whole target
  // choice is this one call, so leaving it out would exempt Extreme)
  const target = nearestEnemy(state, pl, 0.04, true);
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

  // -- lightning: finish the wounded or poke from afar — the sky-bolt lands
  // where the target WILL be, one delay from now (round 17)
  if ((pl.spells.lightning || 0) > 0 && (pl.cooldowns.lightning || 0) <= 0 &&
      dist < SPELLS.lightning.range - 2 && (target.hp <= 20 || dist > 24)) {
    const aim = boltAim(state, pl, target);
    if (aim) castSpell(state, id, 'lightning', aim.x, aim.y);
  }

  // -- fireball with a proper intercept solve; error shrinks at close range
  if ((pl.spells.fireball || 0) > 0 && (pl.cooldowns.fireball || 0) <= 0) {
    const aim = interceptPoint(pl, target, SPELLS.fireball.speed);
    const [errFloor, errPerUnit] = botTune(pl, 'aimErr', [0.4, 0.05]);
    const err = (rng(state) - 0.5) * (errFloor + dist * errPerUnit);
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
  // brawler (Normal) shares the berserker brain, so it shares its shopping
  // list too — the tier difference is reaction/aim only, never gear.
  brawler: ['fireball', 'fireball', 'rush', 'sword', 'amulet', 'boots',
    'rush', 'cape', 'treads'],
  stalker: ['teleport', 'fireball', 'lightning', 'boots', 'fireball',
    'shield', 'lightning', 'cape', 'ring', 'teleport', 'lightning', 'shield'],
};

// In elemental mode each bot kind commits to a fixed element (bought as soon
// as affordable) so bots-only elemental games exercise the effect code paths.
// Their combat logic needs no changes — elements apply passively on hit.
// 2026-08-08 (Remi: "the bots all keep playing wind, when each type should have
// its own strategy"). The element used to be keyed on the bot KIND, so a lobby
// of four bots at the same difficulty all bought the same element — and since
// most seats are berserkers, that meant everybody played gale.
// It is keyed on the BUILD now, which is what "strategy" means here: it is
// per-bot, it is the lobby dropdown, and 🎲 random varies it. Each build gets a
// small themed list, indexed by seat, so even four bots on the SAME build spread
// across different elements instead of stacking one.
const BUILD_ELEMENTS = {
  bruiser: ['vampire', 'ember', 'momentum'],   // stands and trades: sustain + raw damage
  sniper:  ['venom', 'ghost', 'momentum'],     // pokes from range: DoT and line shots
  escape:  ['arcane', 'ghost', 'mosquito'],    // slippery: cadence, speed, setup
  turtle:  ['frost', 'terra', 'venom'],        // outlasts: control and attrition
  rusher:  ['gale', 'terra', 'ember'],         // dives and shoves: push and bulk
  boomer:  ['arcane', 'midas', 'ember'],       // throws a lot: cadence and income
};
const FALLBACK_ELEMENTS = ['ember', 'frost', 'venom', 'gale', 'terra', 'arcane'];

export function botElementFor(pl, seat = 0) {
  const list = (pl.build && BUILD_ELEMENTS[pl.build]) || FALLBACK_ELEMENTS;
  return list[Math.abs(seat) % list.length];
}

export function botShop(state, id) {
  const pl = state.players[id];
  if (!pl) return;
  if (pl.wave) return; // campaign monsters are their descriptor, they never shop
  if (state.mode === 'elemental') {
    // pinned at seat time so a bot never drifts between elements mid-game
    if (!pl._elemPick) {
      const seat = Object.keys(state.players).indexOf(id);
      pl._elemPick = botElementFor(pl, seat < 0 ? 0 : seat);
    }
    // one element level per shop, walking the build's themed list from the
    // seat's pick: primary to max, then the next one. Elements are the
    // fireball's whole progression since round 16 (it no longer levels here),
    // so a bot that stopped at one maxed element would simply stop scaling.
    const list = (pl.build && BUILD_ELEMENTS[pl.build]) || FALLBACK_ELEMENTS;
    const from = Math.max(0, list.indexOf(pl._elemPick));
    for (let i = 0; i < list.length; i++) {
      if (buy(state, id, list[(from + i) % list.length]).ok) break;
    }
  }
  // an explicit build strategy (lobby pick) beats the kind's default list
  const order = (pl.build && BUILDS[pl.build] && BUILDS[pl.build].order) ||
    BOT_BUILDS[pl.kind] || BOT_BUILDS.grunt;
  for (const thing of order) {
    // Remi's rule (round 12): a bot must NEVER buy a spell it pilots badly.
    // The power tier lost its minRound gate, so nothing else stops a bot from
    // sinking 20+ gold into a Meteor it will never cast. The build lists happen
    // to omit them today; this makes it structural, and test-locked, so adding
    // a power spell to a list can't silently gut every difficulty tier and the
    // whole co-op curve. Delete this ONLY together with teaching bots to cast
    // them (AGENTS.md debt #2 — the highest-value lab work left).
    if (SPELLS[thing] && SPELLS[thing].tier === 'power') continue;
    buy(state, id, thing); // ignores failures (owned / poor / maxed)
  }
}
