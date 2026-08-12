// The whole game simulation. Pure-ish: no I/O, no wall clock, no randomness
// except through state.rng (seeded). Runs on the server; unit-testable.

import {
  ARENA, PLAYER, LAVA, ROUND, GOLD, SPELLS, ITEMS, ITEM_FX, ELEMENTS, COLORS,
  BOTS, BUILDS, MULTIKILL_NAMES, BOT_MEMORY, BOT_TARGETING, BOT_CC_CAST,
  DRAFT, TEAMS, STACK_DECAY, itemCost,
} from './constants.js';
import { draftable, kindOf, ownedLevel } from './catalogue.js';
import { itemBonuses, itemFxAt, itemFxDelta } from './items.js';
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
// game; it is just no longer what you land on.
export function createGame({ seed = 1, mode = 'elemental' } = {}) {
  return {
    phase: 'lobby',        // lobby | countdown | battle | shop | gameover
    phaseT: 0,             // time remaining in countdown/shop
    // Shop pause (2026-08-07, Remi: "sometimes I don't have time to read").
    // Freezes the shop COUNTDOWN only; buying, readying and everything else
    // keep working, and everyone being ready still starts the round. Holds the
    // name of whoever paused so the banner can say who, since anyone in the
    // lobby may pause or resume (same friends-lobby trust model as the bans).
    shopPaused: null,      // null = running, else the pauser's display name
    testing: null,         // testing sandbox (versus only): {gold}; a lobby flag like draft
    mode: MODES.includes(mode) ? mode : 'elemental',
    // Draft mode (docs/ROUND12.md S7), an INDEPENDENT flag, not a fourth mode:
    // it composes with classic, elemental and co-op alike. OFF means every field
    // below stays exactly as it is here for the whole game, which is what keeps
    // classic byte-identical.
    draft: false,
    draftPool: null,       // [key] pulled out of the shop; rolled once per game
    round: 0,
    time: 0,               // elapsed battle time this round
    arenaRadius: ARENA.START_RADIUS,
    // this game's un-shrunk arena: frozen at startGame from the seat count
    // (round 21.2, see arenaStartRadius). Everything sized off the arena
    // (spawn ring, shrink rate, portals, world cull) reads THIS, not the constant.
    startRadius: ARENA.START_RADIUS,
    graceT: ARENA.OVERTIME_GRACE, // overtime grace left once radius hits MIN
    roundFighters: 0,      // fighters seated at round start (adaptive shrink)
    pillars: [],           // [{x, y, r, sunk}] set each round start
    players: {},
    projectiles: [],
    delayedShots: [],      // mosquito: trailing balls waiting to fire (elemental)
    // Decoy (round 21.6, SPELLS.decoy): pure cosmetics, kept OUT of `players`
    // and OUT of `projectiles` on purpose: nothing that resolves damage,
    // targeting or scoring can reach them, which is the whole safety argument.
    clones: [],            // mirages: {id, owner, x, y, vx, vy, hp, maxHp, r, speed, left, ...}
    phantoms: [],          // the balls those mirages "throw": motion + culling only
    hazards: [],           // generic ground hazards (no live spawner since round 19): {x,y,r,until,owner,dps}
    meteors: [],           // falling meteors: {x,y,t,owner,level}
    // Mine (round 21.8, SPELLS.nova; key unchanged, the artillery bomb is gone)
    mines: [],             // planted traps: {id,x,y,r,owner,level,charges:[ball payloads]}
    mineShots: [],         // stored balls waiting their tick: {t,owner,x,y,target,ball,...}
    bolts: [],             // lightning sky-bolts (round 17): {x,y,t,owner,level}
    walls: [],             // mirror walls: {x1,y1,x2,y2,nx,ny,owner,until}
    events: [],            // transient, drained by the server each snapshot
    nextId: 1,
    nextWaveId: 1,         // co-op: id counter for spawned campaign enemies
    coopLevel: 1,          // co-op: campaign progress (advances only on a clear)
    coopAttempt: 0,        // co-op: tries spent on the current level
    coop: null,            // co-op: {level, name, brief, roster, pending, ...}
    winner: null,
    winTeam: null,         // versus: the team number that won the game (round 21.3)
    seed,
  };
}

// Ruleset toggle: lobby only, so a running game can never change rules.
export function setMode(state, mode) {
  if (state.phase !== 'lobby') return false;
  if (!MODES.includes(mode)) return false;
  state.mode = mode;
  return true;
}

// Draft toggle, lobby only, same rule as the ruleset: a running game can never
// change the deal. Independent of `mode` on purpose (docs/ROUND12.md S7).
export function setDraft(state, on) {
  if (state.phase !== 'lobby') return false;
  state.draft = !!on;
  return true;
}

// Same stream as makeRng(seed), but the cursor lives ON the state (rngA) so a
// serialize/restore resumes mid-stream; host migration (browser-hosting §B4)
// needs a restored game to replay step-for-step, and a closure can't survive a
// JSON round-trip. rngA is lazily seeded, so pre-existing states just work.
function rng(state) {
  if (state.rngA == null) state.rngA = state.seed >>> 0;
  let a = state.rngA | 0;
  a = (a + 0x6D2B79F5) | 0;
  state.rngA = a >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---- players ------------------------------------------------------------

// The smallest unused team NUMBER: a joining player's default team, so
// "everyone solo" needs no UI at all and numbers stay small and readable
// (1, 2, 3…). A leaver frees their number for the next joiner: teams are a
// lobby arrangement, not an identity.
export function freeTeam(state) {
  const used = new Set(Object.values(state.players).map(p => p.team));
  let t = 1;
  while (used.has(t)) t++;
  return t;
}

// Set your own team (lobby only; the engine also lets the host set a bot's).
// Co-op is excluded: there the team field is the campaign's party/AI switch.
export function setTeam(state, id, n) {
  const pl = state.players[id];
  if (!pl || state.phase !== 'lobby' || state.mode === 'coop') return false;
  const t = Math.round(+n);
  if (!Number.isFinite(t) || t < 1 || t > TEAMS.MAX) return false;
  pl.team = t;
  return true;
}

export function addPlayer(state, id, name, { bot = false, color, avatar, kind, build, team = null } = {}) {
  const n = Object.keys(state.players).length;
  state.players[id] = {
    id, name: String(name).slice(0, 16) || 'warlock', bot,
    color: color || COLORS[n % COLORS.length],
    avatar: typeof avatar === 'string' && avatar.trim() ? avatar.trim().slice(0, 8) : '🧙',
    // team: in versus a NUMBER, defaulting to your own unique one; everyone
    // solo is exactly the old free-for-all (round 21.3). Same number = allies:
    // their spells ignore each other and they win the round together. In co-op
    // it is the campaign's switch instead: the party shares TEAM.PARTY (a
    // string) and the waves share TEAM.AI, set at round start.
    team: team != null ? team : freeTeam(state),
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
    // "how much of the damage in this game is the lava?", a question three
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
    // but you (snapshot() strips the whole position instead; see there), and it
    // is masked out of bot perception too (see seenBy/perceive).
    vanishT: 0,
    // Statue (round 21.4, SPELLS.statue): seconds left as a golden pillar;
    // invincible, rooted, unpushable, and a solid body that eats projectiles.
    // ONE timer drives all of it; the guards live in applyDamage,
    // applyKnockback, castSpell, stats() and stepProjectiles.
    statueT: 0,
    // Fire Walk (round 22, SPELLS.firewalk): seconds of lava immunity left.
    // ONE consumer: the lava tick in step(). Public in snapshot() as `fw`.
    fireWalkT: 0,
    // ---- elemental mode only (all stay empty/0 for the whole game in classic)
    elements: {},          // owned element levels, e.g. {frost: 2, ember: 1}
    slowT: 0,              // frost: seconds of slow remaining
    slowMultHit: 1,        // frost: strength of the slow that hit us
    // Per-attacker stack store: {kind: {attackerId: n}}. Stacks are PRIVATE to
    // whoever applied them (2026-08-07, round 12; reverses the shared-counter
    // decision: your element's power must not depend on what everyone else
    // picked). One generic store, users today: frost, gale, midas, malady, anger.
    stacks: {},
    stunT: 0,              // frost lv3: seconds frozen solid (no move, no cast)
    poisonT: 0,            // malady: seconds of sickness remaining (the DoT engine)
    poisonTick: 0,         // malady: damage per tick (flat 1 at every level)
    poisonBy: null,        // malady: who a lethal tick credits (creator or spreader)
    malady: null,          // malady: {inst, by}, the infection riding this body
    vampN: 0,              // vampire: fireballs CAST this round (every 3rd is engorged)
    // anger: marks CLAIMED for the WHOLE GAME (the bonus is permanent;
    // deliberately NOT cleared in startRound, see ELEMENTS.anger)
    angerMarks: 0,
    _angerTarget: null,    // anger: who carries my mark right now (round-scoped)
    _angerNext: Infinity,  // anger: state.time the next mark may land (startRound arms it)
    mosqN: 0,              // mosquito: fireballs cast since the last pair
    mosqDue: false,        // mosquito: a threshold crossed on a trailing ball, owed to the next real cast
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
// TARGETING helper only: bots use it to pick who to hunt and what to dodge.
// It must NOT gate collision or damage, or friendly fire stops existing.

function hostile(a, b) {
  if (!a || !b) return true;   // unknown owner (left the game): hostile to all
  if (a === b) return false;
  return a.team == null || b.team == null || a.team !== b.team;
}

// ---- versus teams: the DAMAGE/EFFECT-path predicate ------------------------
// Round 21.3 ruling (Remi, exact words): "we just ignore each other's spells
// from the same team (no damage, no pushback, no on-hit effects), except
// pillars, which are part of the map". So unlike hostile() above, THIS one sits
// on the damage path: a teammate's ball passes clean through you, their repulse
// does not shove you, their frost/gale/malady/midas/anger never touch you, and
// a Switcheroo cannot hook you (nothing to collide with). Pillars and mirror
// terrain are the map, not a spell against you... except that a Mirror Wall IS
// a spell, so an ally's wall lets your shots through too.
//
// ⚠ CO-OP IS EXEMPT: its friendly fire is ON by design (AGENTS.md) and its
// team field is a string, not a number. The mode guard is the whole protection;
// do not remove it.
function allied(state, a, b) {
  if (state.mode === 'coop') return false;
  if (!a || !b || a === b) return false;
  return a.team != null && b.team != null && a.team === b.team;
}
// id-flavoured twin, for the paths that only know an owner id
function alliedIds(state, aId, bId) {
  if (aId == null || bId == null) return false;
  return allied(state, state.players[aId], state.players[bId]);
}

// Versus standings by team: [{team, members, ids, size, kills, target, avg}],
// best first. `target` is the team's win line: KILLS_TO_WIN x size, so the
// per-player average is always KILLS_TO_WIN and a lobby of solo teams is the
// old first-to-15 exactly. PURE: it takes a list, so the client HUD ranks with
// this same function instead of a second copy of the rule (client/main.js).
export function rankTeams(list) {
  const by = new Map();
  for (const p of list) {
    const t = p.team != null ? p.team : p.id;
    if (!by.has(t)) by.set(t, { team: t, members: [], ids: [], size: 0, kills: 0 });
    const e = by.get(t);
    e.members.push(p); e.ids.push(p.id); e.size++; e.kills += p.kills || 0;
  }
  const out = [...by.values()].map(e => ({
    ...e, target: ROUND.KILLS_TO_WIN * e.size, avg: e.kills / Math.max(1, e.size),
  }));
  // won-first, then by kills per member. The second key is also the 25-round
  // cap rule (interpretation, round 21.3: "highest sum/size wins"): a 3-stack
  // that farmed 30 kills has not beaten a solo on 12 unless it beat 45.
  out.sort((a, b) => (b.kills >= b.target) - (a.kills >= a.target) ||
    b.avg - a.avg || b.kills - a.kills);
  return out;
}
// Spectators and campaign monsters are never in the race.
export function teamTally(state) {
  return rankTeams(fighters(state).filter(p => !p.wave));
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
  // 2.0x cap; the party would grow into giant targets for clearing waves.)
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
  // everyone regenerates a little: spells only tickle; the lava is the killer
  let speed = PLAYER.SPEED, lavaMult = 1, kbMult = 1, regen = PLAYER.REGEN, lifesteal = 0;
  let healOnHit = 0;   // Slow Spoon: flat hp per damaging hit (round 21.8)
  let maxHp = PLAYER.MAX_HP;
  // items are levelled: itemBonuses() reads each owned level's ABSOLUTE total
  // out of ITEM_FX (see shared/items.js); no compounding happens here.
  const { mult, add } = itemBonuses(pl.items);
  if (mult.speedMult != null) speed *= mult.speedMult;
  if (mult.lavaMult != null) lavaMult *= mult.lavaMult;
  if (mult.kbMult != null) kbMult *= mult.kbMult;
  regen += add.regen || 0;
  lifesteal += add.lifesteal || 0;
  healOnHit += add.healOnHit || 0;
  maxHp += add.maxHp || 0;
  if (pl.inLava) speed *= LAVA.SPEED_MULT; // lava is fast, and it burns
  if (pl.slowT > 0) speed *= (pl.slowMultHit || 0.6); // frost chill (elemental)
  if (pl.stunT > 0) speed = 0;                        // frost stun (elemental)
  if (pl.statueT > 0) speed = 0;                      // statue: rooted (any mode)
  // recently hurt? regen is throttled. Without this a lv1 fireball (2.38 dps
  // if EVERY shot lands) loses to the 1.2 hp/s baseline and nobody can die.
  if (pl.regenLockT > 0) regen *= PLAYER.REGEN_LOCK_MULT;
  return { speed, lavaMult, kbMult, regen, lifesteal, healOnHit, maxHp };
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
// `target.stacks` is {kind: {attackerId: count}}; see addPlayer. Every stacking
// element goes through these three helpers, so "private to whoever applied it"
// is one mechanism rather than one implementation per element. An ownerless
// projectile (its caster left the game) can neither place nor spend a stack:
// there is nobody to own the counter.
function stackCount(target, kind, byId) {
  if (byId == null) return 0;
  const s = target.stacks && target.stacks[kind];
  return (s && s[byId] && s[byId].n) || 0;
}

function addStack(target, kind, byId, n = 1) {
  if (byId == null) return 0;
  const store = target.stacks || (target.stacks = {});
  const s = store[kind] || (store[kind] = {});
  const e = s[byId] || (s[byId] = { n: 0, t: 0 });
  e.n += n;
  // round 22.4: (re)applying a kind resets its fade clock (STACK_DECAY);
  // non-fading kinds carry the field unused
  e.t = STACK_DECAY.seconds;
  return e.n;
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
  for (const e of Object.values(s)) if (e.n > max) max = e.n;
  return max;
}

// Vampire's cast counter: advance it and return this ball's engorged
// lifesteal fraction (0 = plain). Shared by castSpell and mosquito's trailing
// ball (round 20.1, Remi: every every-N counter counts the trailing ball).
function vampireCharge(state, pl) {
  const vampLv = state.mode === 'elemental' && pl.elements
    ? (pl.elements.vampire || 0) : 0;
  if (!vampLv) return 0;
  pl.vampN = (pl.vampN || 0) + 1;
  if (pl.vampN % ELEMENTS.vampire.fx.chargeEvery !== 0) return 0;
  return efxV(ELEMENTS.vampire.fx.chargeLifesteal, vampLv);
}

// Ability Haste (round 17, ex-CDR percentages): cd = base / (1 + haste/100),
// haste SUMS across sources. Additive stacking is the point: hourglass ×
// arcane used to COMPOUND (midas-cdr 86%, BALANCE.md question J).
// Hourglass (item, any mode): haste on everything you cast.
function hasteOf(state, pl) {
  const { add } = itemBonuses(pl.items);
  return add.haste || 0;
}

// Extra haste on the fireball only: arcane (round 16). Additive with the
// hourglass pool, so it can never re-open question J's compounding.
// (Mosquito's round-18 haste levels were removed in 18.2; its levels buy
// back the dmg/kb penalty instead, plain fx multipliers in the hit code.)
function fireballHasteOf(state, pl) {
  if (state.mode !== 'elemental' || !pl.elements) return 0;
  let h = 0;
  if (pl.elements.arcane) h += efxV(ELEMENTS.arcane.fx.haste, pl.elements.arcane);
  return h;
}

// Arcane lv3 (elemental, round 16; chronos's old effect, narrowed to fireball
// hits): every FIREBALL of yours that lands on an enemy hands you `refund`
// seconds back off everything currently on cooldown, per enemy hit. Called
// from applyElementsHit, which only ever runs for a landed fireball's riders;
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
// turned "land your shots" into a near-cooldownless machine gun; arcane alone
// measured 74% in the mixed element study (baseline 25%, 600 games × 2 seeds),
// and shrinking the refund to 0.5 s still measured 47%. Excluding the fireball
// keeps the crisp "−1 s" on everything else (the Rise-style "your fireball
// accelerates your whole kit" fantasy) and lands a dedicated cadence build at
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
  // Statue (round 21.4): a pillar has no hands; no cast of any kind, not even
  // a second statue to extend it. Being unable to act IS the price.
  if (pl.statueT > 0) return false;
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
  // power combos (2026-08-05): a charging repulse may still reposition.
  // Teleport/rush into the pack and let the burst land there. Everything
  // else stays locked, and mid-dash you may only START the charge.
  if (pl.dash && key !== 'repulse') return false;
  // vanish joined the mid-charge whitelist in round 19: charge VISIBLY, then
  // disappear: the burst fires from stealth but everyone saw the windup start
  // (the reverse order, vanish-then-charge, now reveals at the repulse press).
  if (pl.charging && key !== 'teleport' && key !== 'rush' && key !== 'vanish') return false;

  let dx = tx - pl.x, dy = ty - pl.y;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  let haste = hasteOf(state, pl);
  // arcane (round 16): the fireball's own cadence axis
  if (key === 'fireball') haste += fireballHasteOf(state, pl);
  const cd = lvl(spec, 'cooldown', level) / (1 + haste / 100);
  pl.cooldowns[key] = cd;

  // Round 18.1 (Remi): a cast REVEALS an invisible caster; re-casting vanish
  // refreshes instead (its case below). The auto repulse burst in stepBattle
  // is a charge completing, NOT a cast: it never reveals.
  // ⚠ Decoy is an ordinary cast here, so casting it while invisible reveals you
  // (test-locked); the clones are the only thing left standing.
  if (pl.vanishT > 0 && key !== 'vanish') pl.vanishT = 0;

  // Decoy (round 21.6): the clones that MIME this cast are the ones standing
  // BEFORE it resolves, so a Decoy cast is never mimed by the clones it just
  // spawned; and `projFrom` lets mimicCast copy whatever projectiles this cast
  // happens to create (fireball, its mosquito lead, boomerang, swap) without
  // knowing a thing about which spell made them.
  const miming = state.clones && state.clones.length
    ? state.clones.filter(c => c.owner === id) : null;
  const projFrom = state.projectiles.length;

  switch (key) {
    case 'fireball': {
      // Vampire (elemental): the counter runs on YOUR CASTS; every
      // chargeEvery'th fireball flies engorged and pays back a multiple of the
      // damage it deals. Round 20.1 (Remi's ruling, "all every-N counters
      // count"): a mosquito TRAILING ball counts as a cast here too, so it can
      // itself be the engorged one (it won't render red, accepted; the green
      // heal tells the story); see the delayed-shot queue in stepBattle.
      //
      // Mosquito (elemental): on the doubleEvery'th cast this ball is the PAIR's
      // LEAD: kbScale 0 (zero knockback from every source: base, kbAdd riders
      // and gale's gust alike; damage and every on-hit rider are untouched),
      // and the trailing ball is queued a beat behind on the same aim.
      const pair = mosquitoPair(state, pl, false);
      spawnFireball(state, pl, level, dx, dy, {
        engorged: vampireCharge(state, pl),
        ...(pair ? { kbScale: 0 } : {}),
      });
      if (pair) {
        // ⚠ RULING (round 21.0, Remi: "part of the game physics"): only the AIM
        // is pinned. The trail leaves from the owner's CURRENT position a beat
        // later, so a knock/portal/blink inside trailDelay really does move
        // where the twin comes from. Round 20.4 pinned the muzzle; reverted;
        // do not re-"fix" this.
        state.delayedShots.push(
          { t: ELEMENTS.mosquito.fx.trailDelay, owner: id, level, dx, dy });
      }
      break;
    }
    case 'boomerang': {
      // spawn at the caster: the owner is excluded from collisions, and this
      // makes point-blank shots connect instead of spawning past the target.
      // ox/oy remember the LAUNCH POINT: the boomerang flies back there (not
      // to the player); stand in its path to catch it (halves the cooldown),
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
      // round 17: telegraphed sky-bolt on the meteor's path; the zone shows
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
    case 'statue': {
      // Turn to gold where you stand. `duration` is a scalar on purpose (it
      // never levels) and momentum dies at the cast: you cannot be moved, so
      // there is no leftover knockback to carry when you turn back.
      // moveTarget is deliberately LEFT alone: stats() zeroes your speed for
      // the duration, so a click during the freeze is your queued escape.
      pl.statueT = spec.duration;
      pl.vx = 0; pl.vy = 0;
      state.events.push({ t: 'statueUp', id, x: pl.x, y: pl.y, duration: spec.duration });
      break;
    }
    case 'firewalk': {
      // Fire Walk (round 22): lava immunity for `duration` seconds. The lava
      // tick in step() is the only reader; movement, knockback and every other
      // damage source are untouched. Re-casting can't overlap (cooldown 15 >
      // duration), so plain assignment is the whole cast.
      pl.fireWalkT = lvl(spec, 'duration', level);
      break;
    }
    case 'vanish': {
      // You keep moving and can still be hit; the level buys duration only,
      // and re-casting refreshes rather than stacking. Round 18.1: any OTHER
      // cast reveals you (the gate above the switch).
      pl.vanishT = Math.max(pl.vanishT || 0, lvl(spec, 'duration', level));
      // Both this and the generic 'cast' event below carry a position, which for
      // an invisible player is exactly what must not leak; viewEvents drops
      // every event anchored on a hidden player, so they reach the caster only.
      state.events.push({ t: 'vanish', id, x: pl.x, y: pl.y,
        duration: lvl(spec, 'duration', level) });
      break;
    }
    case 'rush': {
      // Round 19.6 (Remi): the dash CANCELS your momentum; knockback velocity
      // zeroed at cast, so Rush is a real combo/lava escape (interpretation of
      // "rush could also cancel momentum, allows you to get out of combos").
      pl.vx = 0; pl.vy = 0;
      pl.dash = { dx, dy, left: spec.distance, level, hit: {} };
      pl.moveTarget = null;
      break;
    }
    case 'pillar': {
      // raise a standing stone at the cursor. Round 17 (Remi): no per-caster
      // limit any more; the duration/cooldown ratio is the real cap.
      const dist = Math.min(d, spec.range);
      const px = pl.x + dx * dist, py = pl.y + dy * dist;
      state.pillars.push({
        x: px, y: py, r: spec.radius, sunk: false,
        // Round 21.2 ruling (Remi): a placed pillar is PERMANENT: no timer,
        // and it survives every later round (see startRound). Revert = put
        // `until: state.time + lvl(spec, 'duration', level)` back.
        placedBy: id, until: null,
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
    case 'nova': {
      // Mine (round 21.8): planted AT YOUR FEET; the aim is ignored on
      // purpose (⚠ interpretation, SPELLS.nova). It then just waits: the
      // trigger, the charging and the discharge all live in stepBattle.
      state.mines.push({
        id: state.nextId++, x: pl.x, y: pl.y, r: spec.radius,
        owner: id, level, charges: [],
      });
      state.events.push({ t: 'mineUp', id, x: pl.x, y: pl.y, r: spec.radius });
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
    case 'decoy': {
      // Re-casting REPLACES your mirages rather than stacking them (the
      // cooldown is 3× the lifetime, so this only ever matters in the sandbox).
      spawnClones(state, pl, level);
      break;
    }
  }
  if (miming && miming.length)
    mimicCast(state, pl, miming, key, dx, dy, state.projectiles.slice(projFrom));
  state.events.push({ t: 'cast', id, spell: key, x: pl.x, y: pl.y, dx, dy });
  return true;
}

// ---- Decoy: the mirage (SPELLS.decoy, round 21.6) -------------------------
// A clone is COSMETIC ONLY. It has no body, no collision, no team interaction
// and no counters: enemy and friendly projectiles, repulse, zones, terra smash,
// portals and lava all ignore it, and it ignores them back. It expires on its
// own timer, when its caster dies, or at the round boundary, whichever first.
//
// ⚠ RULINGS (mine, round 21.6; Remi's to veto, each is one line):
//  - HP shown is the caster's hp AT SPAWN and never changes. The tell is real
//    and deliberate: shoot the crowd and only the true body's bar moves.
//  - The wander target is clamped INSIDE the safe ring, so a clone never walks
//    into the lava (it would take no damage there and out itself instantly).
//  - Appearance is the caster's LIVE look (colour, avatar, team, items; the
//    client copies it every frame); only hp and the body radius are frozen.
function spawnClones(state, pl, level) {
  const spec = SPELLS.decoy;
  state.clones = (state.clones || []).filter(c => c.owner !== pl.id);
  const n = lvl(spec, 'clones', level);
  for (let i = 0; i < n; i++) {
    state.clones.push({
      id: `${pl.id}~d${state.nextId++}`, owner: pl.id,
      x: pl.x, y: pl.y, vx: 0, vy: 0,
      hp: Math.max(1, Math.ceil(pl.hp)), maxHp: pl.maxHp, r: pl.radius,
      speed: stats(pl).speed, left: spec.duration, pickT: 0, tx: pl.x, ty: pl.y,
    });
  }
  state.events.push({ t: 'decoyUp', id: pl.id, x: pl.x, y: pl.y, n });
}

// Mirror one cast onto every clone: the same `cast` event (so the client's
// existing flash/sound path fires at the clone) plus a PHANTOM copy of every
// projectile the real cast produced, offset to the clone's position.
// ⚠ `phantom: true` is the harness tag; test/harness/check.js must not count
// these against the caster's cooldown, exactly like mosquito's `trail: true`.
// Nothing here calls spawnFireball/vampireCharge/mosquitoPair, so no real
// counter (vampire, mosquito, anger, malady, midas) can ever advance on a mime.
function mimicCast(state, pl, clones, key, dx, dy, spawned) {
  if (!state.phantoms) state.phantoms = [];
  for (const c of clones) {
    state.events.push({ t: 'cast', id: c.id, spell: key, x: c.x, y: c.y, dx, dy, phantom: true });
    for (const pr of spawned) {
      state.phantoms.push({
        id: state.nextId++, type: pr.type, owner: c.id, level: pr.level,
        x: c.x + (pr.x - pl.x), y: c.y + (pr.y - pl.y),
        vx: pr.vx, vy: pr.vy, traveled: 0,
        ...(pr.radius != null ? { radius: pr.radius } : {}),
        ...(pr.elements ? { elements: pr.elements } : {}),
        ...(pr.engorged ? { engorged: pr.engorged } : {}),
      });
    }
  }
}

// Wander + expiry. Movement is the player's own: walk toward a target at the
// caster's move speed, no friction games, no knockback; it just has to read as
// a warlock kiting, so the target is re-picked every 0.5-1 s a short hop away.
function stepClones(state, dt) {
  if (!state.clones) state.clones = [];
  if (!state.phantoms) state.phantoms = [];
  if (state.clones.length) {
    const keep = [];
    for (const c of state.clones) {
      const owner = state.players[c.owner];
      c.left -= dt;
      if (c.left <= 0 || !owner || !owner.alive) {
        state.events.push({ t: 'decoyGone', id: c.id, x: c.x, y: c.y });
        continue;
      }
      c.pickT -= dt;
      if (c.pickT <= 0 || Math.hypot(c.tx - c.x, c.ty - c.y) < 0.4) {
        c.pickT = 0.5 + rng(state) * 0.5;
        const a = rng(state) * Math.PI * 2;
        const hop = 3 + rng(state) * 6;
        // ...and the drift bias: keep the previous heading half-weighted, so a
        // clone crosses the ground like someone with a plan instead of jittering
        const bx = c.tx - c.x, by = c.ty - c.y;
        const bn = Math.hypot(bx, by) || 1;
        let tx = c.x + (Math.cos(a) + (bx / bn) * 0.5) * hop;
        let ty = c.y + (Math.sin(a) + (by / bn) * 0.5) * hop;
        // clamp INSIDE the safe ring (see the ruling above)
        const safe = Math.max(0, state.arenaRadius - c.r * 2);
        const d = Math.hypot(tx, ty);
        if (d > safe) { tx = tx / d * safe; ty = ty / d * safe; }
        c.tx = tx; c.ty = ty;
      }
      const dx = c.tx - c.x, dy = c.ty - c.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        const move = Math.min(c.speed * dt, d);
        c.x += (dx / d) * move; c.y += (dy / d) * move;
      }
      keep.push(c);
    }
    state.clones = keep;
  }
  // Phantom balls: the real projectile step MINUS every interaction. Motion,
  // range expiry and the world cull, nothing else. They pass through bodies,
  // pillars, walls, shields and each other because no code but this touches them.
  if (state.phantoms.length) {
    const keep = [];
    for (const pr of state.phantoms) {
      const spec = SPELLS[pr.type];
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      pr.traveled += Math.hypot(pr.vx, pr.vy) * dt;
      if (pr.type === 'fireball' && pr.traveled >= spec.range) continue;
      if (pr.type === 'swap' && pr.traveled >= lvl(spec, 'range', pr.level)) continue;
      if (Math.hypot(pr.x, pr.y) > state.startRadius * 2) continue;
      keep.push(pr);
    }
    state.phantoms = keep;
  }
}

// Fireball factory shared by castSpell and the mosquito trailing shot. Spawns
// at the caster (owner is excluded from collisions; point-blank shots connect).
// In elemental mode ALL the caster's rider elements ride on the projectile at
// their current levels.
//
// opts.kbScale scales this ball's KNOCKBACK only (unset = 1), applied after
// every element multiplier and after gale's gust, so it is a true kill switch.
// One user today: mosquito's pair LEAD passes 0 (ELEMENTS.mosquito).
//
// opts.engorged (ELEMENTS.vampire) is the extra lifesteal FRACTION this ball
// pays, resolved at cast time so the projectile carries everything it needs.
function spawnFireball(state, pl, level, dx, dy, opts = {}) {
  const spec = SPELLS.fireball;
  let elements = null;
  if (state.mode === 'elemental' && pl.elements) {
    for (const [k, v] of Object.entries(pl.elements)) {
      if (!(v > 0)) continue;
      (elements = elements || {})[k] = v;
    }
  }
  const radius = spec.radius * (elements && elements.terra
    ? efxV(ELEMENTS.terra.fx.projRadiusMult, elements.terra) : 1);
  // ghost lv1/2 (round 16): the fireball's SPEED axis; it just flies faster
  const speed = spec.speed * (elements && elements.ghost
    ? efxV(ELEMENTS.ghost.fx.projSpeedMult, elements.ghost) : 1);
  state.projectiles.push({
    id: state.nextId++, type: 'fireball', owner: pl.id, level,
    // half a body ahead of the caster
    x: pl.x + dx * pl.radius * 0.5,
    y: pl.y + dy * pl.radius * 0.5,
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
    elements, radius,
    ...(opts.kbScale != null ? { kbScale: opts.kbScale } : {}),
    ...(opts.engorged ? { engorged: opts.engorged } : {}),
  });
}

// A ball a mine swallowed, erupting back out point blank (round 21.8). It IS
// the ball you shot (same level, elements, size, ghost passthrough, even a
// vampire charge it was carrying); only its position, its aim and its push are
// new. Reusing the projectile object is what makes every on-hit rider (ember,
// malady, frost, gale, anger, midas) pay exactly as if you had landed the shot.
function spawnStoredBall(state, sh, dx, dy) {
  const b = sh.ball;
  const speed = SPELLS.fireball.speed * (b.elements && b.elements.ghost
    ? efxV(ELEMENTS.ghost.fx.projSpeedMult, b.elements.ghost) : 1);
  state.projectiles.push({
    ...b,
    id: state.nextId++, owner: sh.owner,
    x: sh.x, y: sh.y, vx: dx * speed, vy: dy * speed,
    traveled: 0, hit: {}, pierced: 0,
    // the queue decides the push: 0 for every ball but the last, and a FLOOR of
    // the mine's own knockback on the last one (never a sum)
    kbScale: sh.kbScale != null ? sh.kbScale : (b.kbScale != null ? b.kbScale : null),
    ...(sh.kbMin != null ? { kbMin: sh.kbMin } : {}),
  });
  state.events.push({ t: 'mineShot', id: sh.owner, x: sh.x, y: sh.y, dx, dy });
}

export function buy(state, id, thing) {
  const pl = state.players[id];
  if (!pl) return { ok: false, err: 'no player' };
  if (state.phase !== 'shop')
    return { ok: false, err: 'shop is closed' };
  // Misclick insurance (round 22.2, Remi): before every successful HUMAN buy,
  // remember the whole purchasable state; undoBuy() restores the last memo.
  // The stack dies when the round starts (startRound), so nothing bought in an
  // earlier shop can ever be refunded. Restore-blob, not inverse logic: an
  // undo can never miss a side effect a future item adds.
  const memo = () => {
    if (pl.bot) return;
    (pl.shopUndo ||= []).push({
      gold: pl.gold, maxHp: pl.maxHp, hp: pl.hp,
      spells: { ...pl.spells }, items: { ...pl.items }, elements: { ...pl.elements },
    });
    if (pl.shopUndo.length > 32) pl.shopUndo.shift();
  };
  // draft mode: half the catalogue is not for sale in this game at all until
  // you draft it, after which its remaining levels are bought normally
  if (draftLocked(state, pl, thing))
    return { ok: false, err: 'not sold this game (draft it first)' };

  if (Object.hasOwn(SPELLS, thing)) {
    const spec = SPELLS[thing];
    // power tier: locked until enough rounds have been fought
    if (spec.minRound && state.round < spec.minRound)
      return { ok: false, err: `unlocks after round ${spec.minRound}` };
    const level = pl.spells[thing] || 0;
    // Round 16 (Remi): in ELEMENTAL mode the fireball never levels; the
    // elements are its whole progression (one axis each; see ELEMENTS).
    // Classic keeps the 3-level fireball: it has no elements to lean on.
    let maxLevel = spec.maxLevel;
    if (thing === 'fireball' && state.mode === 'elemental') maxLevel = 1;
    if (level >= maxLevel) return { ok: false, err: 'max level' };
    const cost = spec.costs[level];
    if (pl.gold < cost) return { ok: false, err: 'not enough gold' };
    memo();
    pl.gold -= cost;
    pl.spells[thing] = level + 1;
    return { ok: true };
  }
  if (Object.hasOwn(ELEMENTS, thing)) {
    // stackable, 3-level fireball elements (elemental ruleset only).
    // Own as many as you like (frost+ember = chilling fire).
    if (state.mode !== 'elemental') return { ok: false, err: 'elemental mode only' };
    const espec = ELEMENTS[thing];
    // every element is a fireball rider (round 16; the last global element,
    // arcane, became fireball-scoped and chronos became the hourglass item)
    if ((pl.spells.fireball || 0) < 1)
      return { ok: false, err: 'requires fireball' };
    const elevel = pl.elements[thing] || 0;
    if (elevel >= espec.maxLevel) return { ok: false, err: 'max level' };
    const cost = espec.costs[elevel];
    if (pl.gold < cost) return { ok: false, err: 'not enough gold' };
    memo();
    pl.gold -= cost;
    pl.elements[thing] = elevel + 1;
    return { ok: true };
  }
  if (Object.hasOwn(ITEMS, thing)) {
    if (ITEMS[thing].mode === 'elemental' && state.mode !== 'elemental')
      return { ok: false, err: 'elemental mode only' };
    // items are LEVELLED like spells: 1..maxLevel, usually the same flat cost
    // every level with each level worth less than the last (a spec may carry a
    // per-level `costs` array instead; itemCost handles both).
    const level = pl.items[thing] || 0;
    if (level >= ITEMS[thing].maxLevel) return { ok: false, err: 'max level' };
    const cost = itemCost(thing, level);
    if (pl.gold < cost) return { ok: false, err: 'not enough gold' };
    memo();
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

// Pop the last buy memo and restore it wholesale. Shop phase only, like buy().
export function undoBuy(state, id) {
  const pl = state.players[id];
  if (!pl) return { ok: false, err: 'no player' };
  if (state.phase !== 'shop') return { ok: false, err: 'shop is closed' };
  const m = pl.shopUndo && pl.shopUndo.pop();
  if (!m) return { ok: false, err: 'nothing to undo' };
  pl.gold = m.gold; pl.maxHp = m.maxHp; pl.hp = m.hp;
  pl.spells = m.spells; pl.items = m.items; pl.elements = m.elements;
  return { ok: true };
}

// ---- draft mode (docs/ROUND12.md S7) -------------------------------------
// OFF by default and every function here is a no-op while it is off, so classic
// and elemental stay bit-for-bit what they were.
//
// The shape: at game start the server rolls HALF the catalogue out of the shop
// into `state.draftPool`: one roll, from the game's own seeded rng, so it is
// authoritative and identical for everybody. Every DRAFT.EVERY_ROUNDS rounds each
// player is handed DRAFT.OPTIONS free picks out of that pool, roughly
// gold-equivalent to each other. A pick arrives at LEVEL 1 and then behaves like
// anything else in the shop: its next levels cost their normal price.

// Is this thing locked away in this game's pool for this player? A pool thing
// you already own is NOT locked; that is how a drafted thing goes back on sale
// (and it is why no separate "drafted" list has to exist).
export function draftLocked(state, pl, thing) {
  if (!state.draft || !state.draftPool) return false;
  if (!state.draftPool.includes(thing)) return false;
  return ownedLevel(pl, thing) < 1;
}

// Rolled once, at the moment the game leaves the lobby (so the ruleset, and
// therefore the catalogue, is final). Uses the game rng: same seed, same split,
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
// deliberate: the point of draft is to shape a build before it calcifies, and
// waiting three rounds for your first pick makes the opening rounds poorer than
// classic instead of different from it.
export function draftDue(round) {
  return round >= 1 && (round - 1) % DRAFT.EVERY_ROUNDS === 0;
}

// DRAFT.OPTIONS things out of the pool, roughly gold-equivalent to each other:
// anchor on one random candidate and take the ones nearest it in price. Never
// something already owned (so a pick always arrives at level 1, which also
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
      // maxHp is a live field, not derived; same rule buy() follows
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
// option (DRAFT.AUTO_PICK_FIRST; "a player who clicks nothing still receives
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
  // Statue (round 21.4): a pillar does not move. One guard at the single
  // impulse choke point covers every source: balls, repulse, gale gust,
  // rush, meteor, bolt.
  if (target.statueT > 0) return;
  const { kbMult } = stats(target);
  // the lower your hp PERCENTAGE, the further you fly (full HP = baseline,
  // near-death ≈ 1+KB_HP_FACTOR). Cape still multiplies on top. Deliberately
  // NO size/radius term: small and big bodies take identical impulses;
  // being big must only ever be a disadvantage (bigger target).
  // KB_CONSTANT_MISSING (round 12) overrides the real HP fraction with a fixed
  // one, making knockback constant for everyone without touching this formula.
  // Set it to null in constants.js and true HP scaling is back; that is the
  // whole revert.
  const missing = PLAYER.KB_CONSTANT_MISSING == null
    ? 1 - clamp(target.hp / target.maxHp, 0, 1)
    : PLAYER.KB_CONSTANT_MISSING;
  const hpScale = 1 + PLAYER.KB_HP_FACTOR * missing;
  target.vx += dx * magnitude * kbMult * hpScale;
  target.vy += dy * magnitude * kbMult * hpScale;
}

// opts.stamp: whether this damage claims the "last hitter" slot (kill/lava
// credit). Direct hits do; DoT ticks (poison, trails) must NOT: a 30 Hz
// poison tick would otherwise re-stamp forever and steal every lava kill
// from the player who actually landed the shove.
// `bonus` is the part of `amount` that came from the Momentum ramp. It rides on
// the hit event so the client can print it as a separate white number above the
// damage (AGENTS.md scar: this element ramped correctly for weeks and still
// read as broken because +0.45/hit is invisible). Visibility is the feature.
// `lifesteal` is EXTRA lifesteal for this one hit, on top of whatever the
// source's items pay (ELEMENTS.vampire's engorged ball). It obeys the same rule
// as the Blood Sword and deliberately reuses its code path: paid on damage
// actually dealt, so overkill is excluded, and lava (sourceId null) never pays.
// `procs` says what KIND of damage this is, for the Slow Spoon only:
//   true    = a hit you landed: the full flat heal
//   'tick'  = damage over time (malady's sickness, the Hat's burn): a TENTH of
//             it (ITEM_FX.spoon.tickFrac), and at most once a second per victim
//   false   = pays nothing (the off switch; unused today)
// ⚠ The once-a-second gate is INSURANCE, not balance: every tick source in the
// game runs at 1/s today, so it changes nothing, but a future poison ticking
// 10x faster for a tenth of the damage would otherwise multiply this item by 10
// while leaving the poison itself untouched (Remi, round 21.8).
// Lifesteal is deliberately untouched by all of it: the Blood Sword has always
// paid its percentage on ticks too, which is why plague builds like it.
const SPOON_TICK_EVERY = 1;   // seconds, per (attacker, victim) pair
// Smallest heal that earns a green floater. ⚠ DISPLAY ONLY; the hp itself is
// always credited in full, fractions included (Remi, round 21.8): the heal is
// applied and banked in the scoreboard column BEFORE this floor is consulted.
const HEAL_FLOAT_MIN = 1;

function applyDamage(state, target, amount, sourceId,
  { silent = false, stamp = true, bonus = 0, lifesteal: bonusLifesteal = 0,
    procs = true } = {}) {
  if (!target.alive) return;
  // Statue (round 21.4): ZERO damage from everything while the gold holds:
  // spells, zones, hazards, lava, poison ticks. Every damage source in the game
  // funnels through here, so this one line IS the invincibility; it also means
  // no hit floater, no regen lock and no lifesteal for the attacker, because
  // nothing happened.
  if (target.statueT > 0) return;
  const effective = Math.min(amount, Math.max(0, target.hp)); // no overkill credit
  target.hp -= amount;
  // damage attribution: the direct source, or, for sourceless lava ticks,
  // the last hitter, with NO time limit since round 21.8 (they knocked the
  // victim in; the burn is theirs by the same rule that credits the kill)
  let creditId = sourceId != null && sourceId !== target.id ? sourceId : null;
  // (same no-window rule as kill(): the last hitter owns the burn they caused)
  if (creditId == null && sourceId == null && target.lastHitBy &&
      target.lastHitBy.id !== target.id) {
    creditId = target.lastHitBy.id;
  }
  // victim-side accounting, independent of who gets the credit: lava is the one
  // and only sourceless damage in the game (stepBattle's burn tick), so this
  // split is exact rather than heuristic. Self-damage (a meteor dropped on your
  // own head) counts as direct; it is still a spell.
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
      // everything with a source (spells, DoT ticks, trails), never lava
      const { lifesteal, healOnHit } = stats(src);
      const total = lifesteal + bonusLifesteal;
      // Slow Spoon (round 21.8): a FLAT heal per damaging hit, no damage
      // scaling: the sustain item for wide, low-damage, utility builds. One
      // proc per victim per hit, so a piercing ball through three bodies pays
      // three times; a DoT tick pays a tenth, rate-limited (see `procs`).
      let flat = 0;
      if (healOnHit > 0 && effective > 0) {
        if (procs === true) flat = healOnHit;
        else if (procs === 'tick' && spoonTickDue(state, src, target))
          flat = healOnHit * (ITEM_FX.spoon.tickFrac || 0);
      }
      if (total > 0 || flat > 0) {
        const before = src.hp;
        src.hp = Math.min(src.maxHp, src.hp + effective * total + flat);
        const healed = src.hp - before;
        src.healLifesteal += healed;   // scoreboard column
        // 2026-08-08 (Remi, round 16): EVERY meaningful lifesteal heal gets a
        // green "+N" over the healed player; the Blood Sword used to be
        // deliberately silent and read as broken because of it (the old ramp/
        // mosquito scar: a correct mechanic with no on-screen presence is a bug
        // in practice). The floor keeps rounding crumbs off the screen.
        // ⚠ Round 21.8 (Remi's ruling): the floor is COSMETIC; hp is credited
        // above, whatever the size. Consequence to watch: a lv1 sword at 10%
        // heals 0.7 off a bare fireball, so it pops no number; the bar and the
        // scoreboard still move (the round-16 scar's edge case).
        if (healed >= HEAL_FLOAT_MIN)
          state.events.push({
            t: 'lifesteal', id: src.id, amount: healed, x: src.x, y: src.y,
          });
      }
    }
  }
  if (!silent)
    state.events.push({
      t: 'hit', id: target.id, amount, x: target.x, y: target.y,
      ...(bonus > 0 ? { bonus } : {}),  // anger: shown above the damage
      // Trash Talk (issue #4): who dealt it, so the SENDER can react to their
      // own hit. Cosmetic only; the client refuses to speak for an attacker
      // it cannot see, which is what keeps a Vanish quiet.
      ...(sourceId != null && sourceId !== target.id ? { src: sourceId } : {}),
    });
  if (target.hp <= 0) kill(state, target, sourceId);
}

// The Slow Spoon's tick gate: has this attacker been paid for this victim's
// damage-over-time within the last second? Bookkeeping lives on the ATTACKER as
// a plain {victimId: time} map, so it stays JSON-safe for crash dumps, and it is
// wiped at every round start like the other per-round maps.
function spoonTickDue(state, src, target) {
  const seen = (src._spoonTick = src._spoonTick || {});
  const last = seen[target.id];
  if (last != null && state.time - last < SPOON_TICK_EVERY - 1e-6) return false;
  seen[target.id] = state.time;
  return true;
}

function kill(state, target, directSourceId) {
  target.hp = 0;
  target.alive = false;
  target.deaths++;
  target.moveTarget = null;
  target.dash = null;
  // DEATH is the ONE thing that cancels a repulse charge (round 21.0 ruling,
  // interpretation: "you blow up eventually" assumes you are alive to do it).
  target.charging = null;
  // dying reveals you: a corpse and its death burst must be visible to everyone,
  // and a hidden body would also silently vanish from the standings
  target.vanishT = 0;
  // a statue cannot be killed (applyDamage returns early), so this only ever
  // runs for a body that died some other way; keep the flag off a corpse
  target.statueT = 0;
  target.fireWalkT = 0; // a corpse doesn't glow lava-proof (wire stays lean)
  // decoy: your mirages die with you, on the same frame (round 21.6); a
  // corpse with three copies still kiting would be a lie nobody paid for
  if (state.clones && state.clones.length) {
    for (const c of state.clones)
      if (c.owner === target.id) state.events.push({ t: 'decoyGone', id: c.id, x: c.x, y: c.y });
    state.clones = state.clones.filter(c => c.owner !== target.id);
  }
  // credit: direct source, else last hitter within the window
  let killerId = directSourceId != null && directSourceId !== target.id ? directSourceId : null;
  // ⚠ RULING (Remi, round 21.8): NO TIME WINDOW. Whoever hit you last owns your
  // death, however long ago it was: you shove someone into the lava and the
  // kill is yours even if they burn for ten seconds. `lastHitBy` is wiped at
  // every round start, so a claim can only ever come from the round you are in.
  // Revert = re-add `state.time - target.lastHitBy.t <= ROUND.KILL_CREDIT_WINDOW`.
  if (killerId == null && target.lastHitBy) killerId = target.lastHitBy.id;
  const killer = killerId != null ? state.players[killerId] : null;
  // Friendly fire kills your teammate for real, but it must never PAY. No
  // kill count, no gold, no "Double Kill" for dropping your own party into
  // the lava; the death (and the hole in your team) is the whole penalty.
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

// Testing sandbox (Remi, 2026-08-08): a lobby FLAG over classic/elemental,
// like draft, never a ruleset. Everyone starts with the chosen gold and the
// game opens in a shop whose clock never runs (see step), so items can be
// inspected and combos assembled before the first fight. Lobby only.
export function setTesting(state, on, gold) {
  if (state.phase !== 'lobby') return;
  state.testing = on ? { gold: clamp(Math.round(+gold) || 0, 0, 999) } : null;
}

// Round 21.2 (Remi): constant play AREA per player above the anchor.
export function arenaStartRadius(n) {
  const anchor = Math.max(1, ARENA.SCALE_ANCHOR_PLAYERS || 1);
  return ARENA.START_RADIUS * Math.sqrt(Math.max(anchor, n || 0) / anchor);
}

export function startGame(state) {
  if (state.phase !== 'lobby') return;
  // arena size is frozen here, from the seats at kickoff (humans + bots)
  state.startRadius = arenaStartRadius(fighters(state).length);
  state.arenaRadius = state.startRadius;
  // draft mode: the split is rolled ONCE here, when the ruleset can no longer
  // change, and lives on state for the whole game
  if (state.draft) rollDraftPool(state);
  if (state.testing && state.mode !== 'coop') {
    // sandbox: hand out the chosen gold and open the pre-game shop; round 1
    // starts when everyone readies up (bots always count as ready)
    for (const pl of Object.values(state.players)) pl.gold = state.testing.gold;
    state.phase = 'shop';
    state.phaseT = ROUND.SHOP_TIME;
    return;
  }
  startRound(state);
}

function startRound(state) {
  // the shop is closing: an untouched offer still pays out its first option
  resolveDraftOffers(state);
  state.round++;
  state.shopPaused = null;   // never let a pause leak into the next shop
  // the shop is over: its buys are final (undo covers THIS shop's misclicks only)
  for (const p of Object.values(state.players)) delete p.shopUndo;
  state.phase = 'countdown';
  state.phaseT = ROUND.COUNTDOWN;
  state.time = 0;
  state.arenaRadius = state.startRadius;
  state.graceT = ARENA.OVERTIME_GRACE;
  // Round 21.2 ruling (Remi): PLACED pillars persist for the whole game. The
  // reset re-deals the arena's default ring and KEEPS every pillar any player
  // raised in an earlier round; no cap, a long game fills up (counterplay:
  // lightning, nova, blink, portals, terra 3). Revert = `makePillars(state)`.
  state.pillars = [...state.pillars.filter(p => p.placedBy), ...makePillars(state)];
  state.projectiles = [];
  state.delayedShots = [];
  state.clones = [];       // decoy: no mirage outlives the round it was cast in
  state.phantoms = [];
  state.hazards = [];
  state.meteors = [];
  state.mines = [];        // a trap never outlives the round it was planted in
  state.mineShots = [];
  state.bolts = [];
  state.walls = [];
  const coop = state.mode === 'coop';
  if (coop) coopPrepareRound(state);   // clears last level's monsters, sets teams
  const fs = fighters(state);
  // co-op: the lava's adaptive shrink must count the PARTY only, or clearing a
  // wave would rush the lava in as a punishment for winning
  state.roundFighters = coop ? partyOf(state).length : fs.length;
  const r = state.startRadius * ARENA.SPAWN_RADIUS_FRAC;
  // Round 18 (Remi): versus seats are DEALT FRESH each round; a fixed wheel
  // made your neighbours a game-long constant. Seeded rng: same seed, same
  // deals. Co-op keeps its stable party arc (the waves aim at it).
  const seat = fs.map((_, i) => i);
  if (!coop) {
    for (let i = seat.length - 1; i > 0; i--) {
      const j = Math.floor(rng(state) * (i + 1));
      [seat[i], seat[j]] = [seat[j], seat[i]];
    }
  }
  fs.forEach((pl, k) => {
    const i = seat[k];
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
    // (a round boundary, not a cancel: nothing survives the respawn)
    pl.inLava = false; pl.shieldT = 0; pl.dash = null; pl.charging = null;
    pl.vanishT = 0;   // nobody starts a round already invisible
    pl.statueT = 0;   // …nor already golden
    pl.fireWalkT = 0; // …nor already lava-proof
    pl.slowT = 0; pl.slowMultHit = 1;
    pl.stunT = 0; pl.regenLockT = 0; pl.roundGold = 0;
    pl.stacks = {};   // frost/gale/midas stacks are round-long, like the hp bar
    pl.poisonT = 0; pl.poisonTick = 0; pl.poisonBy = null; pl._poisonNext = 0;
    pl.malady = null; // infections die with the round (instances go with them)
    // the Hat of Aura's burns die with the round (they are victim-side since
    // 21.8: {ownerId: {left, next}}; see the aura engine in stepBattle)
    pl._burns = {};
    pl._spoonTick = {};   // Slow Spoon: the per-victim tick clock is per round
    pl.mosqN = 0; pl.mosqDue = false;
    // vampire's charge counter resets with the round, exactly like mosquito's
    // (the other "every Nth cast" mechanic). Deliberate: the rhythm you
    // are asked to count is "my 3rd fireball of this fight", and carrying a
    // half-charged counter across a shop would make the first shot of a round
    // randomly engorged with nothing on screen having explained why. Anger is
    // the one element that persists, and that is stated in its spec; this one
    // is not, so it follows the local precedent. Test-locked.
    pl.vampN = 0;
    // pl.angerMarks is DELIBERATELY not reset: Anger's claimed-mark bonus is
    // permanent for the whole game (ELEMENTS.anger.fx.rampPermanent). Adding it
    // here would silently delete the element's entire point. The MARK itself
    // dies with the round (stacks wiped above); the hunt re-arms below.
    pl._angerTarget = null;
    pl._angerNext = ELEMENTS.anger.fx.markDelay;
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
// title card for free; the client already maps round -> level). Everything
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
  // costs you a round and you try the same level again (with a shop, and the
  // round income, in between). ROUND.MAX_ROUNDS is the retry budget: 10
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
  const r = state.startRadius * ARENA.SPAWN_RADIUS_FRAC;
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
  // RING is written for the 5-player arena, so it rides the arena scale
  // (round 21.2); the default ring stays between spawn ring and rim.
  const ring = RING * (state.startRadius / ARENA.START_RADIUS);
  const out = [];
  for (let i = 0; i < COUNT; i++) {
    const a = BASE_ANGLE + (i / COUNT) * Math.PI * 2 + (rng(state) - 0.5) * JITTER;
    out.push({ x: Math.cos(a) * ring, y: Math.sin(a) * ring, r: RADIUS, sunk: false });
  }
  return out;
}

function endRound(state) {
  // decoy: the mirages die with the round they were cast in; otherwise they
  // would stand frozen on the round-end screen (nothing steps them there)
  state.clones = [];
  state.phantoms = [];
  const coop = state.mode === 'coop' && !!state.coop;
  const alive = fighters(state).filter(p => p.alive);
  // co-op has no single survivor: the whole surviving party "wins" the round
  // (and a 3-survivor clear must not render as "nobody survives round n")
  const winner = coop ? null : (alive.length === 1 ? alive[0] : null);
  // Round 21.3: the round is called when one TEAM is all that is left, and
  // EVERY surviving member is paid the round-win gold. Solo teams make this
  // the single survivor again, so the old payout is unchanged.
  const winTeam = coop || !alive.length ? null : alive[0].team;
  const won = coop
    ? new Set(state.coop.cleared ? partyOf(state).map(p => p.id) : [])
    : new Set(alive.map(p => p.id));
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
  // the game's win line is per TEAM now: KILLS_TO_WIN x size (solo teams =
  // first to KILLS_TO_WIN, unchanged). teamTally() owns the rule.
  const tally = coop ? [] : teamTally(state);
  state.roundSummary = {
    n: state.round, winner: winner ? winner.id : null, income, detail,
    // who took the round: the team number and every surviving member. The
    // client's banner and its victory/defeat verdict read these, so a winning
    // teammate is never told "defeat" (render.js).
    ...(coop ? {} : { winTeam, winners: [...won] }),
    // a campaign run ends when the last level falls or the retry budget does,
    // never on the classic kill race (one player farming 15 wave kills would
    // otherwise silently end the run mid-campaign)
    final: coop
      ? ((state.coop.cleared && state.coop.level >= MAX_LEVEL) ||
         state.round >= ROUND.COOP_MAX_ROUNDS)
      : (tally.some(t => t.kills >= t.target) || state.round >= ROUND.MAX_ROUNDS),
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
    // co-op: the campaign is over (wiped, or level 10 cleared); rank the
    // party, never the monsters
    const ranked = (state.mode === 'coop' ? partyOf(state) : fighters(state))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || b.gold - a.gold);
    // Versus: the WINNING TEAM is teamTally()'s first row (its target met, else
    // best kills-per-member at the 25-round cap) and `winner` is that team's
    // top scorer; with solo teams both reduce to "most kills wins".
    if (state.mode !== 'coop') {
      const top = teamTally(state)[0];
      state.winTeam = top ? top.team : null;
      const champ = top ? ranked.find(p => p.team === top.team) : null;
      state.winner = champ ? champ.id : (ranked[0] ? ranked[0].id : null);
    } else {
      state.winner = ranked[0] ? ranked[0].id : null;
    }
    state.phase = 'gameover';
    state.events.push({ t: 'gameover', winner: state.winner, ...(state.winTeam != null ? { team: state.winTeam } : {}) });
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

// Pause/resume the shop countdown. Anyone in the lobby may do either (this is
// a friends lobby, the same trust model as the kick/ban buttons), and the
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
      // paused freezes the clock ONLY; everyone readying up still starts the
      // round, so a pause can never hold the lobby hostage. Testing mode never
      // runs the clock at all: readying up is the only way forward.
      if (!state.shopPaused && !state.testing) state.phaseT -= dt;
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
  // co-op: measure the shrink over the PARTY only; monsters dying must not
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
    // long fights (level 8 averages ~100 s); under a ring that never stops it
    // collapsed from 68/66/57% clear to 80/46/6% (200 attempts/cell, seed 7).
    // Scoping the flag to PvP restored the documented curve exactly.
    const baseRate = state.startRadius / ARENA.SHRINK_TIME;
    state.arenaRadius = Math.max(0, state.arenaRadius - baseRate * speedMult * dt);
  } else if (state.arenaRadius > ARENA.MIN_RADIUS) {
    // co-op runs the campaign's own (faster) journey: SHRINK_TIME was retuned
    // for the never-stopping versus ring, and the campaign is priced at 65 s
    const shrinkT = state.mode === 'coop' ? ARENA.COOP_SHRINK_TIME : ARENA.SHRINK_TIME;
    const baseRate = (state.startRadius - ARENA.MIN_RADIUS) / shrinkT;
    state.arenaRadius = Math.max(ARENA.MIN_RADIUS, state.arenaRadius - baseRate * speedMult * dt);
  } else if (state.graceT > 0) {
    state.graceT = Math.max(0, state.graceT - dt);
  } else {
    state.arenaRadius = Math.max(0, state.arenaRadius - (ARENA.MIN_RADIUS / ARENA.OVERTIME_SHRINK) * dt);
  }

  // Round 21.2 ruling (Remi): LAVA NEVER DESTROYS A PILLAR. Pillars stand and
  // block out in the lava, default ring included; `sunk` stays on the wire and
  // in the render/collision paths but is now permanently false. Only terra-lv3
  // smash removes one. Revert = restore the two lines:
  //   state.pillars = state.pillars.filter(p => !p.until || p.until > state.time);
  //   for (const pil of state.pillars) pil.sunk = Math.hypot(pil.x, pil.y) > state.arenaRadius;

  // mirror walls expire
  if (state.walls.length) state.walls = state.walls.filter(w => w.until > state.time);

  // falling meteors: telegraph counts down, then the rock lands. Heavy
  // damage and a radial blast for everyone under it (including the caster)
  if (state.meteors.length) {
    const rest = [];
    for (const m of state.meteors) {
      m.t -= dt;
      if (m.t > 0) { rest.push(m); continue; }
      const spec = SPELLS.meteor;
      state.events.push({ t: 'meteorHit', x: m.x, y: m.y, r: spec.radius, by: m.owner });
      for (const pl of Object.values(state.players)) {
        // everyone under the rock eats it, the caster included, but never a
        // teammate (round 21.3: same team = spells ignore each other)
        if (!pl.alive || alliedIds(state, m.owner, pl.id)) continue;
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

  // ---- Mines (round 21.8, SPELLS.nova) -------------------------------------
  // Trigger: an ENEMY body overlapping the ring sets it off. The owner and their
  // teammates walk over their own traps freely, and a statue never trips one
  // (nothing applies to gold; the mine simply waits, it is not consumed).
  // Discharge order matters: the mine's own damage lands FIRST and always (a
  // Shield answers the balls, never the ground), then the stored balls queue
  // one tick apart. Only the LAST ball pushes (Echo's rule, so the victim is
  // not shoved out of their twin's path), and it pushes at
  // max(ball, mine) via `kbMin`. A mine with nothing stored keeps its own push.
  if (state.mines && state.mines.length) {
    const spec = SPELLS.nova;
    const rest = [];
    for (const m of state.mines) {
      let victim = null;
      for (const pl of Object.values(state.players)) {
        if (!pl.alive || pl.id === m.owner || pl.statueT > 0) continue;
        if (alliedIds(state, m.owner, pl.id)) continue;
        if (Math.hypot(pl.x - m.x, pl.y - m.y) > m.r + pl.radius) continue;
        victim = pl;
        break;
      }
      if (!victim) { rest.push(m); continue; }
      const n = m.charges.length;
      state.events.push({ t: 'mineHit', id: m.owner, x: m.x, y: m.y, r: m.r, n });
      if (!n) {
        // bare trap: its own shove, radially out of the ring. ⚠ dead centre is
        // a real case (a blink or a swap can land you exactly on it) and a zero
        // vector would silently push nobody; fall back to the way they were
        // already moving, then to a fixed direction.
        let ddx = victim.x - m.x, ddy = victim.y - m.y;
        let dd = Math.hypot(ddx, ddy);
        if (dd < 1e-6) { ddx = victim.vx; ddy = victim.vy; dd = Math.hypot(ddx, ddy); }
        if (dd < 1e-6) { ddx = 1; ddy = 0; dd = 1; }
        applyKnockback(state, victim, ddx / dd, ddy / dd, spec.knockback);
      }
      applyDamage(state, victim, lvl(spec, 'damage', m.level), m.owner);
      m.charges.forEach((ball, i) => {
        state.mineShots.push({
          t: i * spec.ballDelay, owner: m.owner, x: m.x, y: m.y,
          target: victim.id, ball,
          // every ball but the last is push-less; the last one carries the
          // mine's shove as a FLOOR on its own (never a sum, per Remi)
          ...(i === n - 1 ? { kbMin: spec.knockback } : { kbScale: 0 }),
        });
      });
    }
    state.mines = rest;
  }

  // stored balls erupting out of a sprung mine, one tick apart
  if (state.mineShots && state.mineShots.length) {
    const rest = [];
    for (const sh of state.mineShots) {
      sh.t -= dt;
      if (sh.t > 1e-6) { rest.push(sh); continue; }
      const owner = state.players[sh.owner];
      const target = state.players[sh.target];
      if (!owner) continue;               // owner left the game: the shot dies
      // aim at where the victim is NOW (they are standing on it, so this is
      // point blank); a corpse still gets its ball thrown at its last spot
      const ax = (target ? target.x : sh.x) - sh.x;
      const ay = (target ? target.y : sh.y) - sh.y;
      const d = Math.hypot(ax, ay) || 1;
      spawnStoredBall(state, sh, ax / d, ay / d);
    }
    state.mineShots = rest;
  }

  // lightning sky-bolts (round 17): the meteor's telegraph→impact shape, but
  // damage AND knockback fall linearly to HALF at the zone's edge, and the
  // knockback is RADIAL from the zone center; far-side positioning pushes a
  // lava swimmer back onto the platform, near-side throws them out (intended,
  // both ways). No pillar or wall check anywhere: it falls from the SKY.
  if (state.bolts.length) {
    const rest = [];
    const spec = SPELLS.lightning;
    for (const m of state.bolts) {
      m.t -= dt;
      if (m.t > 0) { rest.push(m); continue; }
      // `by` is for instruments (tools/combo.js separates whose bolt chained);
      // the client ignores it
      state.events.push({ t: 'boltHit', x: m.x, y: m.y, r: spec.radius, level: m.level, by: m.owner });
      for (const pl of Object.values(state.players)) {
        if (!pl.alive || alliedIds(state, m.owner, pl.id)) continue; // teammates: no bolt
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

  // Ground hazards (generic; empty in classic). No element spawns these since
  // the venom trail died with the round-19 malady rework; the stepping stays
  // for whatever uses them next. Damage credits the owner, plus the green tint.
  if (state.hazards && state.hazards.length) {
    state.hazards = state.hazards.filter(h => h.until > state.time);
    for (const pl of players) {
      if (!pl.alive) continue;
      for (const h of state.hazards) {
        if (h.owner === pl.id) continue; // your own puddle spares only you
        if (alliedIds(state, h.owner, pl.id)) continue; // …and your team's, since 21.3
        if (Math.hypot(pl.x - h.x, pl.y - h.y) <= h.r + pl.radius * 0.5) {
          applyDamage(state, pl, h.dps * dt, h.owner, { silent: true, stamp: false });
          if (pl.alive) pl.poisonT = Math.max(pl.poisonT, 0.3); // green tint
          break; // trails don't stack on one victim
        }
      }
    }
  }

  // Malady contagion (elemental, round 19): every infected body radiates its
  // instance's aura: any OTHER living player inside catches the SAME instance
  // (fresh clock) unless it already infected them once: immunity is forever,
  // so a plague can never ping-pong, and since round 20.3 the creator is
  // seeded immune to their own. Since 21.3 it also skips the creator's VERSUS
  // teammates (allied() is the damage-path predicate; hostile() stays targeting).
  if (state.mode === 'elemental') {
    for (const pl of players) {
      if (!pl.alive || !pl.malady || !(pl.poisonT > 0)) continue;
      const inst = pl.malady.inst;
      const r = efxV(ELEMENTS.malady.fx.auraR, inst.level);
      for (const q of players) {
        if (q === pl || !q.alive || inst.immune[q.id]) continue;
        // round 21.3: the plague is its CREATOR's spell, so it never takes one
        // of the creator's teammates; the carrier can be anybody
        if (alliedIds(state, inst.creator, q.id)) continue;
        if (Math.hypot(q.x - pl.x, q.y - pl.y) <= r) infectMalady(state, q, inst, pl.id);
      }
    }
  }

  // Hat of Aura (ITEMS.brazier; the key is unchanged, the display name is not:
  // round 21.7 renamed the Coal Brazier). The owner burns every hostile body
  // inside auraR for auraDps, in discrete bites, and since round 21.8 the burn
  // LINGERS: standing in the ring only refreshes a timer, so walking out costs
  // you `linger` more seconds of it. The bookkeeping is VICTIM-side and keyed by
  // owner ({ownerId: {left, next}}), which is what keeps two owners burning the
  // same body independently, and what lets the burn outlive the ring.
  // Credit follows the DoT rule exactly (round 21.8, Remi: "DoT needs to be able
  // to credit kills, that is part of their identity"): a burn tick STAMPS the
  // last-hitter slot like any other damage, so a victim who burns and then dies
  // to the lava is yours, and a lethal tick still credits the owner directly. `procs: false` keeps it out of the Slow Spoon
  // (round 21.8: a ticking aura must never pay a per-hit heal). Ticks go through
  // applyDamage, so a statue takes zero; a statue'd OWNER keeps burning
  // (⚠ RULING, round 21.5: the aura is passive, and being an unmissable rooted
  // target is already the price).
  // ⚠ VANISH RULING (Remi, round 21.5): passive damage does NOT break stealth.
  // The aura keeps burning while invisible, nothing here is anchored on the
  // OWNER (the hit event rides the victim) and the ring is not drawn, because a
  // vanished player has no position on the wire at all.
  // ⚠ CO-OP is skipped, matching malady's contagion (elemental-only): co-op
  // friendly fire is ON and allied() is exempt there, so an aura would roast
  // the party. The campaign is not priced with passive damage.
  if (state.mode !== 'coop') {
    const tickEvery = ITEMS.brazier.tickEvery;
    for (const pl of players) {
      const lv = pl.items && pl.items.brazier;
      if (!pl.alive || !(lv > 0)) continue;
      const r = itemFxAt('brazier', 'auraR', lv);
      const linger = itemFxAt('brazier', 'linger', lv) || 0;
      for (const q of players) {
        if (q === pl || !q.alive || allied(state, pl, q)) continue;
        if (Math.hypot(q.x - pl.x, q.y - pl.y) > r) continue;
        const burns = (q._burns = q._burns || {});
        const b = burns[pl.id] || (burns[pl.id] = { left: linger, next: tickEvery, dps: 0 });
        // inside the ring: the linger clock is HELD (`in`), the bite cadence runs
        b.left = linger;
        b.in = true;
        b.dps = itemFxAt('brazier', 'auraDps', lv);
      }
    }
    // the burn itself, wherever the victim now is
    for (const q of players) {
      if (!q._burns) continue;
      for (const [ownerId, b] of Object.entries(q._burns)) {
        if (!q.alive) { delete q._burns[ownerId]; continue; }
        b.next -= dt;
        if (b.next <= 1e-6) {
          b.next += tickEvery;
          applyDamage(state, q, b.dps * tickEvery, ownerId, { procs: 'tick' });
        }
        if (b.in) { b.in = false; continue; }   // still standing in the ring
        b.left -= dt;
        if (b.left <= 1e-6) delete q._burns[ownerId];
      }
    }
  }

  // Anger mark hunt (elemental VERSUS only; co-op never deals a mark, the
  // campaign is priced without it). Each anger owner has at most ONE mark out:
  // markDelay s into the round, then markEvery s after each claim or after the
  // marked victim dies, a random LIVING opponent gets the red mark. Seeded rng:
  // same seed, same hunt. The claim itself lives in applyElementsHit.
  if (state.mode === 'elemental') {
    const fA = ELEMENTS.anger.fx;
    for (const pl of players) {
      if (!pl.alive || !pl.elements || !(pl.elements.anger > 0)) continue;
      if (pl._angerTarget != null) {
        const tgt = state.players[pl._angerTarget];
        if (tgt && tgt.alive) continue;              // the hunt is on
        if (tgt) clearStacks(tgt, 'anger', pl.id);   // victim died (or left):
        pl._angerTarget = null;                      // fresh roll after the cadence
        pl._angerNext = state.time + efxV(fA.markEvery, pl.elements.anger);
        continue;
      }
      if (state.time < (pl._angerNext ?? fA.markDelay)) continue;
      // a statue takes no marks either (nothing applies during the freeze);
      // it just is not a candidate this tick; the roll retries next one
      const cands = players.filter(
        q => q !== pl && q.alive && q.statueT <= 0 && hostile(pl, q));
      if (!cands.length) continue;                   // nobody to hunt: retry next tick
      const victim = cands[Math.floor(rng(state) * cands.length)];
      addStack(victim, 'anger', pl.id);
      pl._angerTarget = victim.id;
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
    if (pl.fireWalkT > 0) pl.fireWalkT = Math.max(0, pl.fireWalkT - dt);
    // Stack fade (round 22.4, Remi): an unfed frost/gale/malady pile loses one
    // stack per STACK_DECAY.seconds; the clock restarts after each loss and
    // resets whenever that kind lands again (addStack).
    if (pl.stacks) {
      for (const kind of STACK_DECAY.kinds) {
        const s = pl.stacks[kind];
        if (!s) continue;
        for (const [by, e] of Object.entries(s)) {
          e.t -= dt;
          if (e.t > 0) continue;
          e.n--; e.t = STACK_DECAY.seconds;
          if (e.n <= 0) delete s[by];
        }
      }
    }
    // Statue (round 21.4): rooted and unpushable. stats() already zeroed the
    // walk speed for this tick; zeroing the velocity keeps any impulse that
    // landed on the same frame as the cast from carrying over when it ends.
    // The end event lets the client pop the transform back.
    if (pl.statueT > 0) {
      pl.vx = 0; pl.vy = 0;
      pl.statueT = Math.max(0, pl.statueT - dt);
      if (pl.statueT === 0)
        state.events.push({ t: 'statueDown', id: pl.id, x: pl.x, y: pl.y });
    }

    if (pl.regenLockT > 0) pl.regenLockT = Math.max(0, pl.regenLockT - dt);

    // elemental timed effects (all timers stay 0 in classic mode)
    if (pl.slowT > 0) pl.slowT = Math.max(0, pl.slowT - dt);
    if (pl.stunT > 0) pl.stunT = Math.max(0, pl.stunT - dt);
    if (pl.poisonT > 0) {
      // discrete ticks (2026-08-05 rework): one bite of poisonTick damage per
      // tickEvery seconds. The tick runs BEFORE the clock decrement so the
      // final tick can't be lost to float residue on the last frame. A lethal
      // tick passes poisonBy as the direct source (they get the kill, even
      // mid-lava), and since round 21.8 an ordinary tick also STAMPS the
      // last-hitter slot (Remi: taking kills is part of the plague's identity)
      // and a victim your sickness chased into the lava dies as your kill.
      // ⚠ Consequence, accepted: a DoT ticking every second usually out-claims
      // the player who shoved them in, because it damaged them more recently.
      // That IS the rule: last damage owns the death. Revert = `stamp: false`.
      if (pl.poisonTick > 0) {
        pl._poisonNext = (pl._poisonNext ?? ELEMENTS.malady.fx.tickEvery) - dt;
        // 1e-6 slack: dotTime is an exact multiple of tickEvery, so the LAST
        // tick races float residue against the cure: a lv1 malady that ticks
        // once instead of twice is half the element gone
        if (pl._poisonNext <= 1e-6) {
          pl._poisonNext += ELEMENTS.malady.fx.tickEvery;
          // `procs: false`: a sickness tick is not a hit, so no Slow Spoon heal
          applyDamage(state, pl, pl.poisonTick, pl.poisonBy,
            { silent: true, procs: 'tick' });
          state.events.push({ t: 'hit', id: pl.id, amount: pl.poisonTick, x: pl.x, y: pl.y, poison: true });
        }
      }
      pl.poisonT = Math.max(0, pl.poisonT - dt);
      if (pl.poisonT === 0) { pl.poisonTick = 0; pl.poisonBy = null; pl.malady = null; } // CURED
    }

    // repulse charge: 2 s of visible wind-up, then a radial burst.
    // ⚠ RULING (round 21.0, Remi: "if you start charging, you blow up
    // eventually"): the charge is UNCANCELLABLE. Nothing interrupts it (not
    // frost, not a Switcheroo, not a portal), and the tick is deliberately NOT
    // gated on stunT: a frozen charger still detonates, wherever they now are.
    // Only death stops it (kill()). Every other `charging = null` was removed.
    if (pl.charging) {
      pl.charging.left -= dt;
      if (pl.charging.left <= 0) {
        const spec = SPELLS.repulse;
        const level = pl.charging.level;
        pl.charging = null;
        // `r` IS the spell's radius: the client draws the ring at exactly this
        // size, so the blast you see is the blast that hit (client/render.js).
        state.events.push({ t: 'repulse', id: pl.id, x: pl.x, y: pl.y, r: lvl(spec, 'radius', level) });
        for (const other of players) {
          // co-op friendly fire hits allies too; a VERSUS teammate is skipped
          if (other === pl || !other.alive || allied(state, pl, other)) continue;
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
        if (allied(state, pl, other)) continue; // rush runs straight through a teammate
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
    // component INTO the pillar: knockback slams you against cover and stops
    collidePillars(state, pl);

    // Lava portals (round 18, versus only): touch one and you are home at the
    // center: dead stop, intent cleared. The event carries `id`, so a
    // VANISHED traveller's flashes are masked for everyone else by viewEvents
    // (the standard vanish rule; unlike Swap, nobody else is touched, so
    // there is nothing that must be revealed). Checked BEFORE the lava so the
    // porting tick doesn't also burn you.
    // (a statue cannot be moved, portals included; it also cannot walk onto
    // one, so this guard is belt-and-braces for a portal placed under a cast)
    if (state.mode !== 'coop' && pl.alive && pl.statueT <= 0) {
      const P = ARENA.PORTALS;
      const d = state.startRadius * P.DIST_FRAC;
      for (let i = 0; i < P.COUNT; i++) {
        const a = P.ANGLE + (i / P.COUNT) * Math.PI * 2;
        const px = Math.cos(a) * d, py = Math.sin(a) * d;
        if (Math.hypot(pl.x - px, pl.y - py) > P.RADIUS + pl.radius) continue;
        pl.x = 0; pl.y = 0;
        pl.vx = 0; pl.vy = 0;
        // a charging repulse SURVIVES the trip (round 21.0 ruling) and
        // detonates at the center; everything else stale is cleared
        pl.moveTarget = null; pl.dash = null;
        state.events.push({ t: 'portal', id: pl.id, x: 0, y: 0, fx: px, fy: py });
        break;
      }
    }

    // lava (radius 0 = the whole world is lava). No lingering burn: step out
    // and the damage stops; the price is only paid while swimming. Fire Walk
    // (round 22) zeroes the damage outright while its timer runs; the ×2 lava
    // speed in stats() is deliberately untouched.
    const inLava = state.arenaRadius <= 0 || Math.hypot(pl.x, pl.y) > state.arenaRadius;
    if (inLava && pl.fireWalkT <= 0)
      applyDamage(state, pl, LAVA.DPS * st.lavaMult * dt, null, { silent: true });
    if (pl.alive) pl.inLava = inLava;

    // regen (throttled for REGEN_LOCK seconds after taking damage)
    if (pl.alive && st.regen > 0) {
      const before = pl.hp;
      pl.hp = Math.min(pl.maxHp, pl.hp + st.regen * dt);
      pl.healRegen += pl.hp - before; // scoreboard column
    }
  }

  // Mosquito's TRAILING balls (elemental; the list is empty in classic: the
  // queue is the ex-Echo Stone's, which round 20.1 merged into the element).
  // A trailing ball is a fully NORMAL fireball: knockback included, and it
  // counts for BOTH every-N counters (vampire may engorge it, mosquito's own
  // counter advances), but mosquitoPair's guard means it can never double.
  // ⚠ RULING (round 21.0): it leaves from the owner's CURRENT position on the
  // original aim; being moved inside trailDelay really does move the twin.
  if (state.delayedShots && state.delayedShots.length) {
    const rest = [];
    for (const ds of state.delayedShots) {
      ds.t -= dt;
      if (ds.t > 0) { rest.push(ds); continue; }
      const owner = state.players[ds.owner];
      if (owner && owner.alive) {
        mosquitoPair(state, owner, true);
        const projFrom = state.projectiles.length;
        spawnFireball(state, owner, ds.level, ds.dx, ds.dy,
          { engorged: vampireCharge(state, owner) });
        // decoy (21.6): the mirages throw the twin too, or an Echo owner's
        // pair would count the bodies for the enemy
        const miming = (state.clones || []).filter(c => c.owner === owner.id);
        if (miming.length)
          mimicCast(state, owner, miming, 'fireball', ds.dx, ds.dy,
            state.projectiles.slice(projFrom));
        // `trail: true` marks this as the pair's SECOND ball, not a keypress.
        // The client renders/sounds it exactly like any cast (it IS a fireball
        // leaving the muzzle); the harness's cooldown invariant skips it, since
        // no cooldown was paid for it (test/harness/check.js).
        state.events.push({ t: 'cast', id: owner.id, spell: 'fireball',
          x: owner.x, y: owner.y, dx: ds.dx, dy: ds.dy, trail: true });
      }
    }
    state.delayedShots = rest;
  }

  // Decoy's mirages and their phantom balls (round 21.6). Stepped AFTER the
  // players and BEFORE the projectiles on purpose: they are cosmetics, and
  // stepProjectiles must never see one; nothing here can hit anything.
  stepClones(state, dt);

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

  // Round end: over when every survivor belongs to ONE team (round 21.3).
  // With the default solo teams that is "one player left standing", exactly the
  // old rule. Needs ≥2 fighters to ever start ending (solo practice runs on).
  const fs = fighters(state);
  const total = fs.length;
  const alive = fs.filter(p => p.alive);
  const teamsLeft = new Set(alive.map(p => p.team)).size;
  if (total >= 2 && teamsLeft <= 1) endRound(state);
  else if (total === 1 && alive.length === 0) endRound(state); // solo died: still cycle
}

// ---- pillar geometry ------------------------------------------------------

// Push a player out of any live pillar it overlaps (along the surface normal).
// Returns true if a hit was resolved. Position-only; used by the dash.
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
      // it has flown past the launch point it is lost: straight on, forever.
      const owner = state.players[pr.owner];
      if (owner && owner.alive &&
          Math.hypot(owner.x - pr.x, owner.y - pr.y) < owner.radius + spec.radius) {
        owner.cooldowns.boomerang = (owner.cooldowns.boomerang || 0) / 2;
        state.events.push({ t: 'catch', id: owner.id, x: pr.x, y: pr.y });
        continue; // caught
      }
      // lost once it has flown its own out-leg again, i.e. past the launch
      // point, measured from where it actually turned, since a recall can
      // turn it anywhere
      if (pr.traveled >= (pr.turnAt ?? spec.outDistance) * 2 + 1) pr.lost = true;
    }

    const px0 = pr.x, py0 = pr.y; // for swept collision below
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    pr.traveled += Math.hypot(pr.vx, pr.vy) * dt;

    // range expiry / world cull (fireballs have infinite range)
    if (pr.type === 'fireball' && pr.traveled >= spec.range) continue;
    if (pr.type === 'swap' && pr.traveled >= lvl(spec, 'range', pr.level)) continue;
    if (Math.hypot(pr.x, pr.y) > state.startRadius * 2) continue;
    if (pr.type === 'boomerang' && !pr.returning && pr.traveled >= spec.outDistance)
      turnBoomerangHome(state, pr); // hit the ceiling without being recalled

    // pillars eat projectiles (swept against this tick's segment, from the
    // PRE-move position; a fast ball crosses a pillar inside one tick).
    // terra lv3 "Demolisher": a fireball carrying a rider that declares
    // `smashPillars` at a high enough level DESTROYS the pillar instead of
    // just popping on it. The ball is still consumed (no pass-through).
    const smashes = pr.type === 'fireball' && pr.elements &&
      Object.entries(pr.elements).some(([k, v]) =>
        ELEMENTS[k].fx.smashPillars && v >= (ELEMENTS[k].fx.smashAtLevel || 1));
    let blocked = false;
    for (let i = 0; i < state.pillars.length; i++) {
      const pil = state.pillars[i];
      if (pil.sunk) continue;
      if (segmentPointDist(px0, py0, pr.x, pr.y, pil.x, pil.y) > prRadius + pil.r) continue;
      state.events.push({ t: 'boom', x: pr.x, y: pr.y, spell: pr.type });
      if (smashes) {
        state.pillars.splice(i, 1);
        state.events.push({ t: 'pillarBroken', x: pil.x, y: pil.y, r: pil.r });
      }
      blocked = true;
      break;
    }
    if (blocked) continue;

    // Your own MINE swallows your own fireball (round 21.8): the trap stores the
    // ball and the shot is spent. That is the whole cost of arming one: a
    // target standing behind your own trap is safe from you until it is full.
    // Enemy balls fly straight over; a full mine lets your own pass too.
    if (pr.type === 'fireball' && state.mines && state.mines.length) {
      let stored = false;
      for (const m of state.mines) {
        if (m.owner !== pr.owner) continue;
        if (m.charges.length >= lvl(SPELLS.nova, 'stores', m.level)) continue;
        if (segmentPointDist(px0, py0, pr.x, pr.y, m.x, m.y) > prRadius + m.r) continue;
        m.charges.push(pr);
        state.events.push({ t: 'mineCharge', id: m.owner, x: m.x, y: m.y,
          n: m.charges.length });
        stored = true;
        break;
      }
      if (stored) continue;
    }

    // mirror walls: ENEMY projectiles bounce (mirrored across the wall's
    // normal, ownership flips to the wall's owner); your own shots pass.
    // The side check stops a just-reflected shot from re-triggering. It reads
    // the PRE-move position on purpose: a fast ball (ghost lv3 is +30%) can
    // cross the wall plane inside one tick, and the post-move side then reads
      // as "moving away": the ball tunneled straight through. Found by the
    // ghost+wall test the day ghost became the speed element.
    let mirrored = false;
    for (const w of state.walls) {
      if (w.owner === pr.owner) continue;
      // a teammate's wall is a teammate's spell: your shots pass through it too
      if (alliedIds(state, w.owner, pr.owner)) continue;
      const side = (px0 - w.x1) * w.nx + (py0 - w.y1) * w.ny;
      const vn = pr.vx * w.nx + pr.vy * w.ny;
      if (side * vn >= 0) continue; // moving away from the plane: no hit
      if (segSegDist(px0, py0, pr.x, pr.y, w.x1, w.y1, w.x2, w.y2) > prRadius + 0.4) continue;
      pr.vx -= 2 * vn * w.nx;
      pr.vy -= 2 * vn * w.ny;
      if (pr.elemOwner == null) pr.elemOwner = pr.owner; // riders stay the caster's (22.4)
      pr.owner = w.owner;
      pr.hit = {};
      pr.pierced = 0;   // ghost: a mirrored ball is a fresh ball, first victim again
      pr.traveled = 0;
      // ⚠ RULING (round 21.0, Remi: "reflect the ball as it was"): per-ball
      // flags SURVIVE the mirror: a mosquito lead comes back no-push, as cast.
      // Round 20.4 deleted kbScale here; reverted, do not re-"fix" it.
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
      // co-op friendly fire is on: the only body a projectile ignores there is
      // its owner's. In VERSUS a teammate is skipped BEFORE the collision test
      // (round 21.3); the ball flies through them, so no damage, no push, no
      // riders, no shield reflect and no Switcheroo hook on a teammate.
      if (!other.alive || other.id === pr.owner || pr.hit[other.id]) continue;
      if (allied(state, state.players[pr.owner], other)) continue;
      const dist = segmentPointDist(px0, py0, pr.x, pr.y, other.x, other.y);
      if (dist > prRadius + other.radius) continue;

      // Statue (round 21.4): the body IS a pillar, so the ball collides on it
      // and explodes for NOTHING: cover, not a window. Deliberately ahead of
      // the shield branch (a statue eats the ball, it does not reflect it) and
      // it consumes PIERCING shots too, exactly like the stone pillars above.
      // A Switcheroo bolt therefore fizzles: no trade, no stun, cooldown spent.
      // A TEAMMATE's ball still passes through (allied() skipped it before the
      // collision test): allies ignore each other's spells, and a statue is a
      // spell; the stone pillars are the map, this is not.
      if (other.statueT > 0) {
        state.events.push({ t: 'boom', x: pr.x, y: pr.y, spell: pr.type });
        dead = true;
        break;
      }

      if (other.shieldT > 0) {
        // reflect: reverse velocity, transfer ownership
        pr.vx = -pr.vx; pr.vy = -pr.vy;
        if (pr.elemOwner == null) pr.elemOwner = pr.owner; // riders stay the caster's (22.4)
        pr.owner = other.id;
        pr.hit = {};
        pr.pierced = 0;  // ghost: reflected back at you as a fresh, un-pierced ball
        pr.traveled = 0;
        // ⚠ RULING (round 21.0, Remi: "reflect the ball as it was"): the shield
        // sends the ball back AS IT WAS: a mosquito lead keeps kbScale 0 and
        // returns push-less. Round 20.4 deleted it here; reverted, leave it.
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
      // Anger's earned bonus rides along in its own accumulator so the
      // floating damage number can show base and bonus separately (the white
      // number over the red one IS the feature; see ELEMENTS.anger). Every
      // damage multiplier applies to both halves, so the split is exact and
      // does not depend on which order the riders happen to be iterated in.
      let ramp = 0;
      if (pr.elements) { // every rider element bends the numbers, stacking
        for (const [ek, el] of Object.entries(pr.elements)) {
          const f = ELEMENTS[ek].fx;
          if (f.dmgAdd) dmg += efxV(f.dmgAdd, el);
          if (f.kbAdd) kb += efxV(f.kbAdd, el);
          if (f.markDmg) {
            // anger: every CLAIMED mark is +markDmg, banked ALL GAME (linear,
            // uncapped). Damage only; knockback untouched so a big bank melts,
            // never launches.
            const own = state.players[pr.owner];
            ramp += ((own && own.angerMarks) || 0) * f.markDmg;
          }
          if (f.dmgMult) { dmg *= efxV(f.dmgMult, el); ramp *= efxV(f.dmgMult, el); }
          // flat knockback multiplier. Gale used to be the loud user of this;
          // since the 2026-08-07 rework its push is a burst and lives below.
          // midas still rides it (its levels buy back a push/damage penalty),
          // so deleting this line silently un-nerfs midas; it did, and the
          // midas test caught it.
          if (f.kbMult) kb *= efxV(f.kbMult, el);
        }
        // Gale (round 19): stack-and-burst at EVERY level, and the gust is a
        // flat ADD, not a multiplier (a % gust scaled weirdly with other push
        // riders, per Remi). Resolved here because knockback is applied below,
        // before the on-hit riders run. Added AFTER the multiplier loop so the
        // gust value is truly constant whatever else rides the ball.
        if (pr.elements.gale)
          kb += galeHit(state, pr, other, pr.elements.gale);
      }
      // (Ghost's old behind-the-first-victim damage/push bonus was removed in
      // round 16; a pierced ball now lands a full ordinary hit on everyone.)
      // Per-ball knockback scale, applied LAST, after every element multiplier
      // AND after gale's flat gust, so 0 really is "no push from any source".
      // Mosquito's pair lead is the only user (ELEMENTS.mosquito): the lead
      // stings for full damage with every rider, and pushes nobody out of the
      // trailing ball's path.
      if (pr.kbScale != null) kb *= pr.kbScale;
      // a mine's last stored ball carries the trap's own shove as a FLOOR
      // (round 21.8, Remi: max of the two, never their sum; SPELLS.nova)
      if (pr.kbMin != null) kb = Math.max(kb, pr.kbMin);
      if (kb) applyKnockback(state, other, pr.vx / v, pr.vy / v, kb);
      applyDamage(state, other, dmg + ramp, pr.owner,
        { bonus: ramp, lifesteal: pr.engorged || 0 });
      if (pr.elements) applyElementsHit(state, pr, other);
      state.events.push({ t: 'boom', x: pr.x, y: pr.y, spell: pr.type });

      // swap (round 17): full state exchange with the (surviving) victim:
      // position AND velocity. Velocities must swap too, or the caster would
      // keep their own lava-bound momentum from the new spot and the lava-save
      // fantasy breaks. moveTarget/dash are cleared on BOTH: each player wakes
      // up somewhere new with no stale intent. `charging` is NOT (round 21.0
      // ruling): a swapped charger keeps charging and detonates at the new
      // position; swapping a charger pulls the bomb onto yourself.
      if (pr.type === 'swap' && other.alive) {
        const owner = state.players[pr.owner];
        if (owner && owner.alive) {
          [owner.x, other.x] = [other.x, owner.x];
          [owner.y, other.y] = [other.y, owner.y];
          [owner.vx, other.vx] = [other.vx, owner.vx];
          [owner.vy, other.vy] = [other.vy, owner.vy];
          for (const p of [owner, other]) {
            p.moveTarget = null; p.dash = null;
          }
          // round 19.2 (Remi): the victim wakes up stunned; the caster's
          // combo window. Spec-driven; the caster is deliberately free.
          // Round 20.5 (Remi's ruling): the window must ALWAYS cover a combo
          // fireball. Positions are already traded here, so the gap between
          // them IS the distance swapped (the real one, never the nominal
          // range): a base fireball (no element riders) crosses it in
          // d / speed s, `pad` buys the human cast reaction, `min` floors short
          // swaps at the old flat feel, `max` caps a freak long trade (round
          // 21.0: pad 0.55, min 1, max 3). Revert: flat `spec.stunT`.
          const stunSpec = spec.stun;
          let stun = spec.stunT || 0;
          if (stunSpec) {
            const d = Math.hypot(owner.x - other.x, owner.y - other.y);
            stun = Math.max(stunSpec.min, stunSpec.pad + d / SPELLS.fireball.speed);
            if (stunSpec.max) stun = Math.min(stun, stunSpec.max);
          }
          if (stun) other.stunT = Math.max(other.stunT || 0, stun);
          // no `id` field on purpose: a swap always shows both ends, even if
          // one of them is vanished (revealing is the accepted cost)
          state.events.push({ t: 'swapped', a: owner.id, b: other.id,
            x: owner.x, y: owner.y, x2: other.x, y2: other.y });
        }
      }

      // Pops on the body it hits, unless the projectile PIERCES, which is now a
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
// Round 20.1 rework (Remi, final; the Echo Stone item was merged in here and
// deleted): every doubleEvery'th CAST fireball fires as a PAIR. This function
// IS the counter; call it once per fireball leaving the caster. Returns true
// only for the pair's LEAD ball, which castSpell then fires with kbScale 0 (no
// push from any source) and follows with a trailing ball trailDelay s later.
//
// HARD CHAIN GUARD (`trailing`): the descendant of the old trap's `noStacks`
// scar, whose failure mode was unbounded self-triggering: a trailing ball
// ADVANCES the counter (Remi: "all every-N counters count") but can never
// double. A threshold crossed on one is remembered in `mosqDue` and paid by the
// next player-initiated cast instead. Test-locked.
function mosquitoPair(state, pl, trailing) {
  const lv = state.mode === 'elemental' && pl.elements
    ? (pl.elements.mosquito || 0) : 0;
  if (!lv) return false;
  const every = efxV(ELEMENTS.mosquito.fx.doubleEvery, lv);
  pl.mosqN = (pl.mosqN || 0) + 1;
  let due = !!pl.mosqDue;
  // `>=`, not `===`: buying a level shortens the cadence under a counter that
  // is already past the new threshold, and that ball should still pair.
  if (pl.mosqN >= every) { pl.mosqN = 0; due = true; }
  if (!due) return false;
  pl.mosqDue = trailing;   // carried to the next real cast, or spent here
  return !trailing;
}

// Turn a boomerang around toward its LAUNCH POINT (not the thrower; standing
// in its path to catch it is the skill). Used by the recall key and by the
// automatic turn at max range; `turnAt` remembers the out-leg length so the
// "flew past the origin, gone forever" rule works for early recalls too.
function turnBoomerangHome(state, pr) {
  const spec = SPELLS.boomerang;
  pr.returning = true;
  pr.turnAt = pr.traveled;
  // pr.hit is deliberately KEPT: the out-leg knockback shoves victims along
  // the throw lane and a straight return would re-hit them for free: one hit
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
// shape: one private stack per landed gale fireball, ordinary knockback while
// they build, and the 3rd stack spent on one enormous gust.
//
// Why this is a function of its own instead of another branch in
// applyElementsHit next to frost and malady: gale's payload is KNOCKBACK, and
// knockback is computed and applied BEFORE the on-hit riders run. So gale has to
// resolve on the way in, not on the way out. Returns the flat knockback ADD for
// THIS hit: 0 while stacking, the level's burst value on the 3rd (round 19;
// was a multiplier). ⚠ Mosquito's pair lead zeroes this along with every other
// push source (kbScale 0 in the hit code); the stack still lands.
//
// The counter is the generic per-attacker store (addStack/clearStacks), so
// "private to whoever applied them" is the same one mechanism frost and midas
// use rather than a third implementation. An ownerless ball (its caster left)
// can neither place nor spend a stack: there is nobody to own the counter.
function galeHit(state, pr, target, level) {
  const f = ELEMENTS.gale.fx;
  // riders belong to whoever OWNS the element, which a reflection never
  // changes (pr.elemOwner, round 22.4) — else a shield or wall lets the
  // reflector feed their own pile with someone else's element
  const eo = pr.elemOwner != null ? pr.elemOwner : pr.owner;
  if (eo == null) return 0;
  const n = addStack(target, 'gale', eo);
  // every landing is an event, exactly like frost's pips: the player has to be
  // able to watch the gust winding up or this reads as a random shove
  state.events.push({
    t: 'gale', id: target.id, stacks: n, by: eo,
    of: f.stacksToTrigger, x: target.x, y: target.y,
  });
  if (n < f.stacksToTrigger) return 0;
  clearStacks(target, 'gale', eo);
  state.events.push({
    t: 'galeBurst', id: target.id, by: eo, x: target.x, y: target.y,
  });
  return efxV(f.burstKbAdd, level);
}

// One malady instance = one plague: `creator` (whose element, whose kill
// credit), `level` (creator's malady level at infection time; sizes the aura
// and the clock), `immune` = {playerId: 1} for every body it has EVER taken;
// an instance infects each player at most once, which is the no-ping-pong
// rule. Plain object, never a Set: state must stay JSON-safe (crash dumps).
// Round 20.3 (Remi's ruling): the creator is seeded INTO the set at creation,
// so their own plague can never come back on them; they still catch every
// OTHER player's instance normally. Revert = drop them from the seed below.
function infectMalady(state, target, inst, byId) {
  if (!target.alive) return;
  // Statue (round 21.4): nothing APPLIES to a golden pillar; no infection, and
  // the instance does not even burn its once-per-body immunity on the attempt.
  if (target.statueT > 0) return;
  const f = ELEMENTS.malady.fx;
  inst.immune[target.id] = 1;
  target.malady = { inst, by: byId };
  target.poisonTick = efxV(f.tickDmg, inst.level);
  target.poisonT = efxV(f.dotTime, inst.level);
  target._poisonNext = f.tickEvery;   // fresh sickness, fresh cadence
  // lethal-tick credit: always the creator's plague. Since round 20.3 the
  // creator is immune to their own instance, so there is no spreader case.
  target.poisonBy = inst.creator;
  state.events.push({ t: 'infected', id: target.id, by: byId, x: target.x, y: target.y });
}

// Elemental on-hit riders (frost / malady / midas / terra), each at its own
// level. Ember is a pure number tweak handled at the damage/knockback
// computation above; gale is resolved there too, by galeHit().
function applyElementsHit(state, pr, target) {
  // same rule as galeHit: element identity survives reflections (22.4)
  const eo = pr.elemOwner != null ? pr.elemOwner : pr.owner;
  for (const [ek, el] of Object.entries(pr.elements)) {
    const f = ELEMENTS[ek].fx;
    // frost: stacks build on the VICTIM but are PRIVATE to each attacker
    // (2026-08-07, round 12; reverses the 2026-08-06 shared counter). Only
    // your own 3 detonate, so your element's power no longer depends on what
    // everyone else bought. The level of whoever lands the 3rd decides how bad
    // it is, and only that attacker's counter is cleared.
    //
    // ⚠ Keyed on the element NAME, not on `f.stacksToTrigger` alone: gale is a
    // stack-and-burst element too now and declares the same field. The body
    // below is frost-specific anyway (it names the 'frost' stack kind and pushes
    // frost/frostBreak events); gale's twin lives in galeHit(), because its
    // payload is knockback and that is resolved before the riders run.
    if (ek === 'frost' && f.stacksToTrigger) {
      const n = addStack(target, 'frost', eo);
      state.events.push({
        t: 'frost', id: target.id, stacks: n, by: eo,
        of: f.stacksToTrigger, x: target.x, y: target.y,
      });
      if (n >= f.stacksToTrigger) {
        clearStacks(target, 'frost', eo);
        const stun = efxV(f.stunT, el);
        const slowT = efxV(f.slowT, el);
        if (stun > 0) {
          target.stunT = Math.max(target.stunT || 0, stun);
          target.moveTarget = null;
          target.dash = null;
          // NOT `charging`: freezing a charging repulse does not defuse it
          // (round 21.0 ruling); they blow up frozen in place.
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
    if (ek === 'malady' && eo != null) {
      // Round 19 (ex-venom): a two-hit rhythm on the private-stack store, like
      // midas. First hit plants the 🦠 stack; the second by the same owner
      // spends it and INFECTS; contagion and kill credit live in
      // infectMalady() and the stepBattle aura loop.
      if (stackCount(target, 'malady', eo) > 0) {
        clearStacks(target, 'malady', eo);
        // round 20.3: the creator is seeded immune to their OWN instance
        infectMalady(state, target,
          { creator: eo, level: el, immune: { [eo]: 1 } }, eo);
      } else {
        addStack(target, 'malady', eo);
      }
    }
    if (f.goldOnHit && eo != null) {
      const owner = state.players[eo];
      if (owner) {
        // Round 17 §5: a two-hit rhythm on the private-stack store. First hit
        // plants a 🪙 mark on THIS target; the next hit on the same target
        // cashes +1 g (still capped there forever) and clears it. Halves the
        // income RATE, the midas-cdr engine (question J). Mosquito's pair is
        // two real fireballs here: lead plants, trailing cashes.
        if (stackCount(target, 'midas', eo) > 0) {
          clearStacks(target, 'midas', eo);
          const pay = efxV(f.goldOnHit, el);
          owner.gold += pay;
          owner.goldEarned += pay;
          owner.roundGold += pay;
          state.events.push({ t: 'gold', id: eo, amount: pay, x: pr.x, y: pr.y });
        } else {
          addStack(target, 'midas', eo);
          state.events.push({ t: 'midasMark', id: target.id, by: eo,
            x: target.x, y: target.y });
        }
      }
    }
    // anger: a FIREBALL hit on YOUR marked target claims the mark; +1 to the
    // permanent bank (never reset in startRound), and the next mark waits
    // markEvery s from NOW. FIREBALLS ONLY (the round-12 ruling that stopped
    // "lightning claims the mark" from being the whole meta).
    if (f.markDmg && eo != null && pr.type === 'fireball' &&
        stackCount(target, 'anger', eo) > 0) {
      const owner = state.players[eo];
      if (owner) {
        clearStacks(target, 'anger', eo);
        owner.angerMarks = (owner.angerMarks || 0) + 1;
        owner._angerTarget = null;
        owner._angerNext = state.time + efxV(f.markEvery, el);
        state.events.push({ t: 'angerClaim', id: target.id, by: eo,
          x: target.x, y: target.y });
      }
    }
    // arcane lv3 (round 16): a landed FIREBALL refunds seconds off every
    // cooldown the owner has running, per enemy hit. hitRefund is 0 below the
    // unlock level, so this line prices lv1/2 at nothing by construction.
    if (f.hitRefund && eo != null) {
      const refund = efxV(f.hitRefund, el);
      const owner = refund > 0 ? state.players[eo] : null;
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
// broadcast blob can no longer serve everyone; the server builds one snapshot
// per socket. Pass null (tests, journals, crash dumps) for the neutral view.
// Everything viewer-dependent lives behind the `elemental` guard, so classic and
// co-op snapshots are byte-identical whatever viewerId says.
// Events that must reach EVERY viewer even when they belong to an invisible
// player: a death is public (and clears vanishT anyway), and so is the fact that
// somebody just killed a teammate.
const PUBLIC_EVENTS = new Set(['death', 'teamkill']);

// Per-viewer event filter: the twin of snapshot()'s per-viewer player view, and
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
    // anyone else's snapshot; docs/ROUND12.md N4 is explicit that skipping the
    // draw client-side is not good enough, because devtools sees through it.
    // The roster entry stays (name, colour, kills, gold), so the topbar does not
    // flicker somebody out of the standings every time they blink out; what
    // leaves is x/y and everything drawn AT x/y. The renderer already skips any
    // player whose x/y is not finite, so this needs no client cooperation;
    // client/render.js just never gets a place to draw.
    const hidden = p.vanishT > 0 && p.id !== viewerId;
    players[id] = {
      id: p.id, name: p.name, color: p.color, bot: p.bot, avatar: p.avatar,
      kind: p.kind, build: p.build || null, shopReady: p.shopReady,
      // team: a NUMBER in versus (round 21.3; the lobby selector, the ally
      // rules and the scoreboard grouping all read it), the campaign's
      // party/AI string in co-op. Survives reconnect (engine.js ghosts).
      team: p.team != null ? p.team : null,
      ...(coop ? { wave: !!p.wave } : {}),
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
      // effective stats at your current item levels; the shop/stats panel
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
      // Statue (round 21.4): PUBLIC; being an unmissable golden pillar is the
      // whole downside, so everyone sees it (the client draws the body as a
      // gold column). Absent when 0, so nothing changes for anyone not casting it.
      ...(p.statueT > 0 ? { statueT: round2(p.statueT) } : {}),
      // Fire Walk (round 22): PUBLIC like statueT; the flame ring must warn a
      // pursuer that the lava is free for this player. Absent when inactive.
      ...(p.fireWalkT > 0 ? { fw: round2(p.fireWalkT) } : {}),
      inLava: !!p.inLava,
      // Hat of Aura (round 21.8): on fire, i.e. inside someone's ring, or still
      // burning after leaving it. A bare flag: whose burn it is stays private.
      // ⚠ Outside the elemental block on purpose: it is an ITEM, it burns in
      // classic too.
      ...(p._burns && Object.keys(p._burns).length ? { burning: true } : {}),
      dashing: !!p.dash,
      charging: !!p.charging,
      // your OWN invisibility, so the client can show you that it is running and
      // when it is about to end. Never present on anybody else's entry.
      ...(p.vanishT > 0 && p.id === viewerId ? { vanishT: round2(p.vanishT) } : {}),
      // draft mode: your OWN free offer, nobody else's. Absent entirely when the
      // toggle is off (and when it is on but this shop carries no offer).
      ...(p.draftOffer && p.id === viewerId ? { draftOffer: p.draftOffer } : {}),
      // how many of YOUR buys this shop can still be undone (drives the button)
      ...(p.id === viewerId && p.shopUndo && p.shopUndo.length ? { undoN: p.shopUndo.length } : {}),
      // elemental-only wire fields; classic snapshots stay byte-identical
      ...(elemental ? {
        elements: p.elements,
        slow: p.slowT > 0, poison: p.poisonT > 0,
        stun: p.stunT > 0,
        // malady: numbers only; the aura circle the client must draw around
        // an infected body (radius = the INSTANCE's level) and its clock. The
        // instance itself (creator, immunity set) never reaches the wire.
        ...(p.malady && p.poisonT > 0 ? {
          maladyT: round2(p.poisonT),
          maladyR: round2(efxV(ELEMENTS.malady.fx.auraR, p.malady.inst.level)),
        } : {}),
        angerMarks: p.angerMarks || 0, // HUD + scoreboard: claimed marks = the permanent bonus
        // vampire: casts banked toward the next engorged ball, so the HUD can
        // count it down for you (2/3 → the next one is the big one)
        vampN: p.vampN || 0,
        // PRIVATE: only the stacks the VIEWER put on this body. This is the one
        // thing you need to see to play a stacking element (is my frost
        // detonation one hit away, is my midas mark waiting on that target?),
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
    // is public by design; it is the same for everyone, and the shop has to know
    // which shelves are empty this game. Both absent while the toggle is off, so
    // a classic snapshot is unchanged.
    ...(state.draft ? { draft: true, draftPool: state.draftPool || [] } : {}),
    // testing sandbox flag (so the lobby toggle reads back and the shop shows ∞)
    ...(state.testing ? { testing: { gold: state.testing.gold } } : {}),
    round: state.round, time: round2(state.time),
    arenaRadius: round2(state.arenaRadius),
    // this game's un-shrunk arena (round 21.2): the client sizes its camera,
    // the rim ghost and the portals off it, never off the constant
    startRadius: round2(state.startRadius),
    pillars: (state.pillars || []).map(p => ({
      x: round2(p.x), y: round2(p.y), r: round2(p.r), sunk: !!p.sunk,
    })),
    winner: state.winner,
    ...(state.winTeam != null ? { winTeam: state.winTeam } : {}),
    roundSummary: state.roundSummary || null,
    meteors: (state.meteors || []).map(m => ({ x: round2(m.x), y: round2(m.y), t: round2(m.t) })),
    // Mines are PUBLIC (round 21.8, Remi: "visible, a circle on the ground,
    // not a red glowing thing"): everyone sees the ring and how many balls are
    // loaded, including whose it is, so stepping on one is a read, not a coin
    // flip. A vanished owner's mine stays visible; it is not anchored on them.
    mines: (state.mines || []).map(m => ({
      id: m.id, x: round2(m.x), y: round2(m.y), r: round2(m.r),
      owner: m.owner, level: m.level, n: m.charges.length,
    })),
    // sky-bolt telegraphs are public by design: the dodge window IS the spell
    bolts: (state.bolts || []).map(m => ({
      x: round2(m.x), y: round2(m.y), t: round2(m.t), level: m.level,
    })),
    walls: (state.walls || []).map(w => ({
      x1: round2(w.x1), y1: round2(w.y1), x2: round2(w.x2), y2: round2(w.y2), owner: w.owner,
    })),
    players,
    // Decoy (round 21.6): the mirages ride in their OWN list, never in
    // `players`; the scoreboard, the kill feed, the team HUD and the ranking
    // all read `players`, so a clone can never reach any of them. The client
    // rebuilds a player-shaped copy from `owner`'s entry at draw time, which is
    // what makes a clone identical to its caster for free (name, colour,
    // avatar, team ring, item auras). Absent when nobody has one out.
    // ⚠ Known limit: devtools can tell a clone from a body (the vanish scar
    // says client-side hiding is not enough). Accepted: Decoy is a bluff
    // against a player's eyes, not an information-theoretic disguise.
    ...(state.clones && state.clones.length ? {
      clones: state.clones.map(c => ({
        id: c.id, owner: c.owner, x: round2(c.x), y: round2(c.y),
        hp: Math.ceil(c.hp), maxHp: c.maxHp, r: round2(c.r),
      })),
    } : {}),
    // phantom balls are merged into the REAL projectile list and carry no tell
    // of their own: on the wire a mime is a fireball like any other (its
    // `owner` is a clone id, which only the swap tether ever looks up).
    projectiles: [...state.projectiles, ...(state.phantoms || [])].map(p => ({
      id: p.id, type: p.type, x: round2(p.x), y: round2(p.y),
      vx: round2(p.vx), vy: round2(p.vy), owner: p.owner,
      ...(p.elements ? { elements: p.elements } : {}),
      // vampire: the engorged ball must LOOK different; both fields can only
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
    // ground hazards, elemental only (a = remaining-life fade 0..1)
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
// constants.js), never on the kind itself, which is why Normal costs no new AI:
//   grunt     Easy    'grunt'     wanders and throws at nothing (cannon fodder)
//   brawler   Normal  'berserker' the same brawler with a slower read and looser aim
//   berserker Hard    'berserker' rushes in, leads its shots, shoves you off the rim
//   stalker   Extreme 'stalker'   dodges projectiles, teleport lava saves
// Adding a tier is therefore a BOTS entry (label + brain + react/aimErr) plus a
// BOT_BUILDS/BOT_ELEMENTS line, and nothing here.

const BRAINS = {
  grunt: stepGrunt,
  berserker: stepBerserker,
  stalker: stepStalker,
  faker: stepFaker,
  runner: stepRunner,
  // Dummy (round 22): the immobile training tier; no step, no cast, ever
  // (contrast the Runner, which flees after the first hit). Knockback, lava
  // and death still apply; `spar: true` on BOTS keeps pilotOwnedSpells silent.
  dummy: () => {},
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
// not a handicap; see the aim block in stepBerserker) and `aimErr:
// [floor, perUnit]` is the aim error, floor + distance × perUnit.
function botTune(pl, key, dflt) {
  const spec = BOTS[pl.kind];
  const v = spec && spec[key];
  return Array.isArray(v) && v.length === 2 && v.every(n => Number.isFinite(n))
    ? v : dflt;
}

// Telegraph awareness (round 17, minimal; Session C owns the full pilot):
// where to step to leave the nearest sky-bolt OR meteor zone covering this
// bot, or null. Without this every measurement of a telegraphed spell is
// garbage: a bot that stands in a marked circle prices it as unmissable.
// Meteors joined round 20 (bots buy meteor via the combo builds now); the
// same boltDodge commitment covers both.
function boltEscape(state, pl) {
  if (!state.bolts.length && !state.meteors.length) return null;
  let worst = null, worstD = Infinity, worstR = 0;
  const consider = (m, spec) => {
    const dd = Math.hypot(pl.x - m.x, pl.y - m.y);
    if (dd < spec.radius + pl.radius + 0.6 && dd < worstD) {
      // Not an oracle (Remi, round 17): the bot COMMITS once per bolt to
      // whether it bothers dodging: BOTS[kind].boltDodge of the time it
      // steps out, otherwise it eats this one on purpose. The roll is stored
      // on the bolt per bot: re-rolling every decision tick would compound
      // back into a near-certain dodge.
      const rolls = m._dodge || (m._dodge = {});
      if (rolls[pl.id] === undefined) {
        const bspec = BOTS[pl.kind];
        const chance = bspec && bspec.boltDodge != null ? bspec.boltDodge : 1;
        rolls[pl.id] = rng(state) < chance;
      }
      if (!rolls[pl.id]) return;
      worst = m; worstD = dd; worstR = spec.radius;
    }
  };
  for (const m of state.bolts) consider(m, SPELLS.lightning);
  for (const m of state.meteors) consider(m, SPELLS.meteor);
  if (!worst) return null;
  // dead-centered bolt (the classic "dropped right on you"): any direction
  // beats a zero vector, which would "escape" to the zone center itself
  let nx = pl.x - worst.x, ny = pl.y - worst.y;
  if (worstD > 1e-6) { nx /= worstD; ny /= worstD; }
  else { nx = 1; ny = 0; }
  const hop = worstR + pl.radius + 1.5;
  let ex = worst.x + nx * hop, ey = worst.y + ny * hop;
  // never step out of the bolt into the lava: cross to the far side instead
  if (Math.hypot(ex, ey) > state.arenaRadius - 1) {
    ex = worst.x - nx * hop; ey = worst.y - ny * hop;
  }
  return { x: ex, y: ey };
}

// Bots don't drop bolts from across the map: the SPELL's range is infinite
// since round 17 (Remi: no range indicators to learn), so the old spec-range
// engagement gate lives on here as a bot discipline, not a rule of the game.
const BOLT_ENGAGE = 36;

// Aim for the new lightning (round 17): the bolt lands `delay` after the cast,
// so lead the target by exactly that, and never drop it on your own head.
function boltAim(state, pl, target) {
  const spec = SPELLS.lightning;
  const v = estVel(target);
  const x = target.x + v.vx * spec.delay, y = target.y + v.vy * spec.delay;
  if (Math.hypot(x - pl.x, y - pl.y) < spec.radius + pl.radius + 1) return null;
  return { x, y };
}

// ---- CC-gated casting (round 20, BOT_CC_CAST) ------------------------------
// Is `target` HELD from `pl`'s point of view: stunned, slowed, or wearing
// enough of pl's OWN frost stacks that the next hit triggers? A held target is
// where a telegraphed cast stops being a coin flip, so bots drop the bolt dead
// ON the body instead of leading it. Memory ghosts (Vanish) read as not held.
function ccHeld(pl, target) {
  return (target.stunT || 0) > 0 || (target.slowT || 0) > 0 ||
    stackCount(target, 'frost', pl.id) >= BOT_CC_CAST.FROST_STACKS;
}

// Meteor's stricter window: the hold must outlast the fall (`delay` s). Only a
// stun (frost lv3: 2 s > meteor's 1.25 s) or a heavy slow (speed mult ≤
// METEOR_SLOW_MAX) qualifies; under a light slow the body still leaves the
// 6-radius circle before the rock lands.
function ccPinned(target, delay) {
  if ((target.stunT || 0) >= delay) return true;
  return (target.slowT || 0) >= delay &&
    (target.slowMultHit || 1) <= BOT_CC_CAST.METEOR_SLOW_MAX;
}

// Drop point for a telegraphed cast on a held target: the body itself, unless
// that would land on our own head too (both spells hit the caster's zone).
function heldAim(pl, target, spec) {
  const d = Math.hypot(target.x - pl.x, target.y - pl.y);
  if (d < spec.radius + pl.radius + 1) return null;
  return { x: target.x, y: target.y };
}

// ---- Faker (issue #7) ------------------------------------------------------
// The tier ABOVE Extreme. Its body is the stalker's (every dodge, every save,
// the same intercept aim), and the tier is the LAYER in front of it: a combo
// planner that runs on its own tighter clock and, when it fires, takes the tick.
//
// The one idea underneath all three of Remi's examples is the same: a body that
// has just been shoved, or frozen, is a body whose position `delay` seconds from
// now is KNOWN. Everything else is bookkeeping around that.

// Where a body will be after `t` seconds if nothing but friction acts on it.
// Velocity decays as e^(-k t) (stepBattle's exponential damping), so the
// distance travelled is the integral of that: (v / k)(1 - e^(-k t)).
function driftTo(target, t) {
  const k = PLAYER.FRICTION;
  const f = (1 - Math.exp(-k * t)) / k;
  return { x: target.x + target.vx * f, y: target.y + target.vy * f };
}

// The combo layer. Returns true when it has spent the tick on a cast.
function comboStep(state, pl) {
  const spec = BOTS[pl.kind] || {};
  const C = spec.combo;
  if (!C) return false;
  const id = pl.id;
  const ready = (k) => (pl.spells[k] || 0) > 0 && (pl.cooldowns[k] || 0) <= 0;
  const seen = enemiesSeen(state, pl);
  if (!seen.length) return false;

  // the juiciest victim first: airborne beats held, and faster beats slower;
  // a body still travelling is the one whose landing spot is worth a rock
  const scored = seen.map((t) => {
    const speed = Math.hypot(t.vx || 0, t.vy || 0);
    return { t, speed, held: (t.stunT || 0) > 0 };
  }).sort((a, b) => (b.speed + (b.held ? 100 : 0)) - (a.speed + (a.held ? 100 : 0)));

  // Minefield: the trap this bot is STANDING ON, if any; with a hook loaded it
  // is a detonator (the swap drops the victim exactly onto it), and every ball
  // the stalker layer fires meanwhile is swallowed INTO it (nova `stores`), so
  // the wait charges the payload on its own.
  const trap = (state.mines || []).find(m =>
    m.owner === id && Math.hypot(m.x - pl.x, m.y - pl.y) <= m.r * 0.8);

  for (const { t: mark, speed, held } of scored) {
    if (!mark.alive) continue;
    const dist = Math.hypot(mark.x - pl.x, mark.y - pl.y);
    const hookRange = (pl.spells.swap || 0) > 0 ? lvl(SPELLS.swap, 'range', pl.spells.swap) : 0;

    // 0. THE DETONATOR (issue #7, Remi's own chain): trap underfoot + hook off
    //    cooldown → Switcheroo drops the victim ON the trap. The burst fires
    //    every stored ball point-blank and shoves; the swap's own stun holds
    //    them for it; the landing branch below finishes with the bolt.
    if (trap && ready('swap') && !held && dist <= hookRange && dist > 4 &&
        castSpell(state, id, 'swap', mark.x, mark.y)) return true;
    //    ...and the trap is PLANTED only when the hook is ready and a victim is
    //    hookable; a mine this bot cannot detonate is just gold on the floor.
    if (!trap && ready('nova') && ready('swap') && !held && dist <= hookRange + 8 &&
        castSpell(state, id, 'nova', pl.x, pl.y)) return true;

    // 1. HELD (frost freeze, or the stun a Switcheroo leaves behind): the body
    //    cannot move, so the telegraphed cast goes straight onto it, and the
    //    fireball rides behind the bolt for free.
    if (held) {
      if (ready('meteor') && ccPinned(mark, SPELLS.meteor.delay)) {
        const aim = heldAim(pl, mark, SPELLS.meteor);
        if (aim && castSpell(state, id, 'meteor', aim.x, aim.y)) return true;
      }
      if (ready('lightning')) {
        const aim = heldAim(pl, mark, SPELLS.lightning);
        if (aim && castSpell(state, id, 'lightning', aim.x, aim.y)) return true;
      }
      if ((pl.cooldowns.fireball || 0) <= 0 && dist < 40 &&
          castSpell(state, id, 'fireball', mark.x, mark.y)) return true;
    }

    // Minefield discipline: with the trap set and the hook loaded (or nearly),
    // the bolt is RESERVED for the detonation; an ordinary shove does not get
    // to spend it. A held body still does: that IS the detonation follow-up.
    const saveBolt = !!trap && (pl.cooldowns.swap || 0) <= 2 && !held;

    // 2. IN THE AIR: solve where the body lands and put the spell THERE. The
    //    trust check refuses the cast when the prediction and the body have
    //    barely diverged; at that point it is an ordinary shot, and the
    //    stalker layer below takes it with a cheaper cooldown.
    if (speed >= C.flySpeed && !saveBolt) {
      if (ready('meteor') && speed >= C.meteorFly) {
        const p = driftTo(mark, SPELLS.meteor.delay);
        if (Math.hypot(p.x - mark.x, p.y - mark.y) >= C.aimTrust &&
            Math.hypot(p.x - pl.x, p.y - pl.y) > SPELLS.meteor.radius + pl.radius + 1 &&
            castSpell(state, id, 'meteor', p.x, p.y)) return true;
      }
      if (ready('lightning')) {
        const p = driftTo(mark, SPELLS.lightning.delay);
        if (Math.hypot(p.x - mark.x, p.y - mark.y) >= C.aimTrust &&
            Math.hypot(p.x - pl.x, p.y - pl.y) > SPELLS.lightning.radius + pl.radius + 1 &&
            castSpell(state, id, 'lightning', p.x, p.y)) return true;
      }
    }

    // 3. OPENERS. Switcheroo is the hook: the victim wakes stunned, which is
    //    branch 1 on the next tick. Only worth it when the follow-up is
    //    actually loaded, or the trade is a pure gift to the enemy.
    if (!held && ready('swap') && dist <= hookRange &&
        (ready('lightning') || ready('meteor') || (pl.cooldowns.fireball || 0) <= 0) &&
        castSpell(state, id, 'swap', mark.x, mark.y)) return true;

    // 4. Spend the TRIGGER stack on purpose: frost's third freezes, gale's
    //    third gusts (a shove branch 2 follows up on). With the bolt loaded the
    //    next fireball is not a shot, it is the start of the chain.
    if (!held && pl.elements &&
        (ready('lightning') || ready('meteor')) && (pl.cooldowns.fireball || 0) <= 0 &&
        ['frost', 'gale'].some(el => pl.elements[el] &&
          stackCount(mark, el, id) >= ELEMENTS[el].fx.stacksToTrigger - 1)) {
      const aim = interceptPoint(pl, mark, SPELLS.fireball.speed);
      if (castSpell(state, id, 'fireball', aim.x, aim.y)) return true;
    }
  }
  return false;
}

function stepFaker(state, pl, dt) {
  const C = (BOTS[pl.kind] || {}).combo;
  pl._comboT = (pl._comboT || 0) - dt;
  if (C && pl._comboT <= 0) {
    const [base, jitter] = C.think;
    pl._comboT = base + rng(state) * jitter;
    if (comboStep(state, pl)) return;
  }
  stepStalker(state, pl, dt);
}

// ---- Runner (issue #7): the sparring partner ------------------------------
// Not a difficulty but a measuring instrument (Remi, reworked 2026-08-12): a
// DUMMY that does not move and does not cast until the first hit of the round
// lands on it. Then it runs from whoever hit it, and it never casts ANYTHING,
// so every hit after the first landed on a body that was genuinely trying to
// leave. The ban set below covers the generic pilot layer, which would
// otherwise hand it a blink the moment it owned one.
const RUNNER_BANNED = new Set(Object.keys(SPELLS));

function stepRunner(state, pl, dt) {
  const id = pl.id;
  // the combo has not started: a statue with a health bar. No step, no shot.
  if (!pl.lastHitBy) return;

  const [reactBase, reactJitter] = botTune(pl, 'react', [0.14, 0.08]);
  pl._botT = (pl._botT || 0) - dt;
  if (pl._botT > 0) return;
  pl._botT = reactBase + rng(state) * reactJitter;

  // fleeing is the whole point: away from the attacker, but never into the lava
  const arena = state.arenaRadius;
  const src = state.players[pl.lastHitBy.id];
  if (!src) return;
  let ax = pl.x - src.x, ay = pl.y - src.y;
  const an = Math.hypot(ax, ay) || 1;
  let tx = pl.x + (ax / an) * 20, ty = pl.y + (ay / an) * 20;
  if (Math.hypot(tx, ty) > arena - 3) {
    // pinned against the rim: run along it instead of off it
    const t = Math.atan2(pl.y, pl.x) + (rng(state) < 0.5 ? 0.7 : -0.7);
    const r = Math.max(0, arena - 6);
    tx = Math.cos(t) * r; ty = Math.sin(t) * r;
  }
  setMoveTarget(state, id, tx, ty);
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
  // ⚠ issue #7: the Runner's ban is enforced HERE too, not just in its brain;
  // this generic layer is what would otherwise hand it a blink or a shield.
  const banned = (BOTS[pl.kind] || {}).spar ? RUNNER_BANNED : null;
  const owns = (k) => !(banned && banned.has(k)) &&
    (pl.spells[k] || 0) > 0 && (pl.cooldowns[k] || 0) <= 0;

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

  // Swap as the lava save (round 17 §11): being launched at the rim is exactly
  // what a position trade is for: hit anybody still standing safely inside and
  // take their spot, sending them out with our momentum. Fired PREDICTIVELY,
  // while the knockback is still carrying us: pl.vx/vy is pure knockback (walk
  // speed lives in the move target), so a magnitude well above SPEED means we
  // were hit hard, and the lookahead beats the projectile's own flight time.
  // No build list contains a power spell, so today this only fires in draft.
  const kbSpeed = Math.hypot(pl.vx, pl.vy);
  if (arena > 2 && owns('swap') && kbSpeed > PLAYER.SPEED &&
      Math.hypot(pl.x + pl.vx * 0.6, pl.y + pl.vy * 0.6) > arena) {
    const reach = lvl(SPELLS.swap, 'range', pl.spells.swap);
    let mark = null, markD = Infinity;
    for (const e of enemiesSeen(state, pl)) {
      if (Math.hypot(e.x, e.y) > arena - 4) continue;   // no point trading into the lava
      const d = Math.hypot(e.x - pl.x, e.y - pl.y);
      if (d > reach - 2 || d >= markD) continue;
      mark = e; markD = d;
    }
    if (mark) {
      const aim = interceptPoint(pl, mark, SPELLS.swap.speed);
      if (castSpell(state, pl.id, 'swap', aim.x, aim.y)) return;
    }
  }

  // the ★ grunt is pure chaos by design (2026-08-06): it doesn't aim ANY of
  // its spells, it just lets them off in random directions. Shield is the one
  // exception: a randomly-timed shield is indistinguishable from no shield.
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

  // Statue (round 21.4): shield's heuristic, mirrored; the ONE reading a bot
  // can make of a 2 s total-invulnerability root. Panic button only: hurt, a
  // ball about to land, and standing somewhere the closing ring will not have
  // eaten by the time we can move again (rooting at the rim would surface us in
  // the lava). No native kind pilots it, so this block is the whole AI for it.
  if (owns('statue') && pl.hp < pl.maxHp * 0.5 && !pl.inLava &&
      Math.hypot(pl.x, pl.y) < arena - 6) {
    const threat = scanThreats(state, pl, 0.4, 2.0);
    if (threat && castSpell(state, pl.id, 'statue', pl.x, pl.y)) return;
  }

  // pressure blink: a wounded grunt with a teleport gets out of melee range
  // (stalker does this natively; the berserker never retreats, by design)
  if (pl.kind === 'grunt' && owns('teleport') && arena > 2 &&
      pl.hp < pl.maxHp * 0.5 && dist < 5) {
    let ex = pl.x - (tdx / dist) * 14, ey = pl.y - (tdy / dist) * 14;
    if (Math.hypot(ex, ey) > arena - 4) { ex = 0; ey = 0; }
    if (castSpell(state, pl.id, 'teleport', ex, ey)) return;
  }

  // Stone Pillar as cover (round 17 §11): raise it BETWEEN us and the nearest
  // threat, but only when it is actually worth a cooldown: ganged up on (2+
  // enemies inside the engagement ring) or hurt. Placed just outside our own
  // body so it blocks the incoming line without shoving us, and never so close
  // to the threat that it is behind them.
  const GANG_R = 20, COVER_GAP = pl.radius + SPELLS.pillar.radius + 1;
  if (owns('pillar') && dist > COVER_GAP + 4) {
    let near = 0;
    for (const e of enemiesSeen(state, pl))
      if (Math.hypot(e.x - pl.x, e.y - pl.y) < GANG_R) near++;
    const px = pl.x + (tdx / dist) * COVER_GAP, py = pl.y + (tdy / dist) * COVER_GAP;
    if ((near >= 2 || pl.hp < pl.maxHp * 0.4) && Math.hypot(px, py) < arena - SPELLS.pillar.radius &&
        castSpell(state, pl.id, 'pillar', px, py)) return;
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
  // target's predicted spot (round 17); grunts stay a bit sloppy. A HELD
  // target (round 20, ccHeld) gets it dead on the body, no error; the CC
  // covers the 0.5 s telegraph, that is the whole frost+bolt combo.
  if (pl.kind !== 'stalker' && owns('lightning') && dist < BOLT_ENGAGE) {
    const held = ccHeld(pl, target);
    const aim = held ? heldAim(pl, target, SPELLS.lightning)
      : boltAim(state, pl, target);
    const err = !held && pl.kind === 'grunt' ? (rng(state) - 0.5) * dist * 0.15 : 0;
    if (aim && castSpell(state, pl.id, 'lightning',
        aim.x - (tdy / dist) * err,
        aim.y + (tdx / dist) * err)) return;
  }

  // meteor (round 20): the ONE power spell bots pilot. Cast ONLY into a hold
  // that outlasts the 1.25 s fall: frost lv3's stun or a heavy slow
  // (ccPinned). Without that hold it never fires: an un-CC'd meteor against
  // anything that walks is a 14-gold miss.
  if (owns('meteor') && dist < BOLT_ENGAGE && ccPinned(target, SPELLS.meteor.delay)) {
    const aim = heldAim(pl, target, SPELLS.meteor);
    if (aim && castSpell(state, pl.id, 'meteor', aim.x, aim.y)) return;
  }

  // rush as a WEAPON only against rim-standers (berserker rushes natively).
  // Blindly dashing to close the gap strands a grunt/stalker at point-blank
  // where it gets traded down; the study measured that as a 3-6% win rate.
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
// ignores the spell (docs/ROUND12.md N4). Rather than blinding them (which is
// LESS human than seeing you, since a person does not forget you exist the
// instant you blink out), every bot keeps a short memory of where it last saw
// each enemy and keeps shooting THERE for BOT_MEMORY seconds. So vanishing makes
// a bot's aim stale (walk out of the ghost and its shots go where you were), and
// staying invisible past the memory makes it lose you entirely.
//
// `enemiesSeen` returns, per hostile enemy: the live player if visible, or a
// frozen stand-in at the remembered position if not, or nothing once forgotten.
// The stand-in carries vx/vy = 0 and moveTarget/dash = null, so estVel and
// interceptPoint aim straight at the last known spot with no lead, which is
// exactly what a human does with a target that disappeared.
// Is anybody hidden right now? Perception costs nothing in the overwhelmingly
// common case (nobody owns Vanish), and both helpers below fall straight through
// to reading the live players.
function anyHidden(state) {
  for (const p of Object.values(state.players)) if (p.vanishT > 0) return true;
  return false;
}

// Does the spell exist in this game at all? The memory has to be recorded BEFORE
// someone blinks out; gating it on "somebody is hidden right now" would leave
// every bot with an empty memory at exactly the moment it needs one, so the
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

// How many kills `e` is AHEAD of `pl`: exactly the gap the gold bounty is paid
// on (kill(): `target.kills - killer.kills`, floored at 0, GOLD.BOUNTY_PER_GAP),
// so the economy and the AI agree about who is "ahead". Floored at 0 means the
// leader never hunts anybody for being ahead, and a level field yields 0 for
// everyone; the bias only wakes up once somebody actually pulls away.
//
// Free-for-all ONLY. In co-op the whole party is one team and the wave has its
// own targeting; a monster's kill tally is not a scoreboard anyone is racing, so
// a CO-OP team (the string TEAM.PARTY / TEAM.AI) switches this off.
// ⚠ Round 21.3: versus teams are NUMBERS and every versus player now has one,
// so the old `pl.team != null` guard would have silently disabled the leader
// bias for the whole game. The test is the co-op team values, not "has a team".
export function killLead(pl, e) {
  if (!pl || !e) return 0;
  if (pl.wave || pl.team === TEAM.PARTY || pl.team === TEAM.AI) return 0;
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
  // (a bias inside the same score, not an override; BOT_TARGETING.LEADER_BIAS).
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
// like any other. It is also the one cue that gives you away, as it should.
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
// The ONE instinct it keeps is not drowning; a grunt that walks into the
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

// The marks a bot can read on a body to mean "I have been working on this one":
// every stacking element whose payoff comes from ITS OWN stacks piling up.
// Private per attacker (stackCount), so this reads as "MY investment", never
// "someone is about to pop this", which would be information nobody has.
const PREY_MARKS = ['frost', 'gale', 'midas', 'malady'];

// Berserker target choice: closest wins, but wounded, isolated, rim-standing,
// carrying my marks, or FAR AHEAD ON KILLS enemies are tastier. Every term is
// in arena units of apparent distance and every weight lives in BOT_TARGETING.
//
// Round 17 §11: this is a SOFTMAX DRAW, not an argmin. Four argmin bots in a
// 4-player arena all compute the same "tastiest" answer and land on one victim
// at once: the pile-on Remi asked us to break. The draw keeps the same
// preferences (the best score is still the most likely pick) and just stops
// them from being unanimous; BOT_TARGETING.TEMPERATURE is how far from the
// argmin it goes. Uses the seeded rng, so a seed still replays exactly.
//
// The draw is FRESH ON EVERY CALL, not cached: pickPrey is called exactly once
// per decision tick (stepBerserker, after its `_botT` clock fires), so "once
// per call" already IS "re-rolled on the decision clock"; a cache would only
// add a second notion of time that has to be kept in sync with the first.
//
// The kill-lead term (2026-08-07) is deliberately one weighted term among six
// and not a rule: at LEADER_BIAS = 2.5 a 10-kill lead is worth 25 arena units
// out of a 56-unit start radius, which flips the choice between two roughly
// equal candidates and still loses to "half-dead and 30 units nearer". That is
// the balance Remi asked for: a rebalancing tendency, not a 3-v-1 rule.
//
// Exported for the tests: this is THE bot-targeting seam, and the leader bias
// is only observable here without reverse-engineering a strafe ring.
export function pickPrey(state, pl) {
  const arena = Math.max(state.arenaRadius, 1);
  const W = BOT_TARGETING;
  const enemies = enemiesSeen(state, pl);   // a vanished enemy is a memory or nothing
  if (!enemies.length) return null;
  const scores = [];
  let bestScore = Infinity;
  for (const e of enemies) {
    const d = Math.hypot(e.x - pl.x, e.y - pl.y);
    let crowd = 0; // how much backup this enemy has nearby
    for (const o of enemies) {
      if (o === e) continue;
      crowd += Math.max(0, 18 - Math.hypot(o.x - e.x, o.y - e.y));
    }
    let mine = 0;  // marks I put on this body myself
    for (const k of PREY_MARKS) mine += stackCount(e, k, pl.id);
    const rim = Math.min(1, Math.hypot(e.x, e.y) / arena); // 1 = at the edge
    const missing = Math.max(0, (e.maxHp || e.hp) - e.hp);
    const score = d * W.PROXIMITY + crowd * W.CROWD
      - missing * W.WOUNDED - rim * W.RIM - mine * W.MY_STACKS
      - leadPull(pl, e) * W.PROXIMITY;
    scores.push(score);
    if (score < bestScore) bestScore = score;
  }
  // softmax over -score/T, offset by the best score so exp() never overflows.
  // T <= 0 degenerates to the old argmin, which is a legitimate setting.
  const t = W.TEMPERATURE;
  if (!(t > 0)) return enemies[scores.indexOf(bestScore)];
  const w = scores.map(s => Math.exp((bestScore - s) / t));
  let roll = rng(state) * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < enemies.length; i++) {
    roll -= w[i];
    if (roll <= 0) return enemies[i];
  }
  return enemies[enemies.length - 1];   // float dust only
}

// -- berserker ★★: relentless brawler ---------------------------------------
// Hunts the nearest (slightly preferring wounded) enemy, rushes to close,
// fireballs point-blank with intercept aim, and herds rim-standers into the
// lava by aiming past them. Only ever retreats from the lava edge itself.
// 2026-08-05 reaction-time pass: the ★★ used to decide every 0.14 s and its
// aim error was proportional to distance, i.e. PERFECT at point-blank, which
// made end-game duels feel unwinnable. Now it (a) decides every ~0.21 s,
// (b) aims from the PREVIOUS tick's observation of its mark, extrapolated
// across that lag (see the aim block: it leads you fine while you hold a
// heading, and eats the whiff when you change direction inside its reaction
// window), and (c) carries an absolute aim-error floor so point-blank stays
// human. Calibrated with `node tools/h2h.js berserker grunt` (2 seats each,
// 50% = parity): the old ★★ won 99.6% of those games, this one wins ~75%,
// while `h2h.js stalker berserker` still reads 100%; the ★/★★/★★★ ladder
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

  // hard lava avoidance; the one concession to self-preservation.
  // Predictive: knockback momentum about to dump us in counts as danger.
  const fx = pl.x + pl.vx * 0.35, fy = pl.y + pl.vy * 0.35;
  const fleeing = dCenter > arena - 2.5 || Math.hypot(fx, fy) > arena - 1;
  if (fleeing) {
    // already swimming? rush toward center; the dash is 5x walk speed
    if (dCenter > arena && (pl.spells.rush || 0) > 0 &&
        (pl.cooldowns.rush || 0) <= 0 && !pl.dash &&
        castSpell(state, id, 'rush', 0, 0)) return;
    const s = Math.max(0, arena - 6) / (dCenter || 1);
    setMoveTarget(state, id, pl.x * s, pl.y * s);
  }

  // telegraph threat (round 17): even the berserker steps out of a marked
  // sky-bolt zone: standing in one is not aggression, it is a donation
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
    // Round 22 standoff (Remi: "less point-blank oppression"): BOTS[kind]
    // .standoff is a preferred MINIMUM engagement distance; it floors the
    // ring, wounded-prey dive included, so the bot backs off between casts
    // instead of camping a face nobody can out-react. Revert = drop the knob.
    let ring = target.hp <= 30 ? 1.5 : 8.5; // wounded prey gets no breathing room
    ring = Math.max(ring, (BOTS[pl.kind] || {}).standoff || 0);
    const tCenter = Math.hypot(target.x, target.y) || 1;
    // blend "our side of the prey" with "the center side of the prey"
    let dx = -(tdx / dist) * 0.5 - (target.x / tCenter) * 0.5;
    let dy = -(tdy / dist) * 0.5 - (target.y / tCenter) * 0.5;
    const dn = Math.hypot(dx, dy) || 1;
    // strafe grows with distance: a straight-line charge is a shooting-range
    // target, a spiral approach walks between the incoming fireballs
    const sw = Math.min(10, 4 + dist * 0.3) * pl._strafe;
    let cx = target.x + (dx / dn) * ring - (tdy / dist) * sw;
    let cy = target.y + (dy / dn) * ring + (tdx / dist) * sw;
    // keeping distance must never mean backing into the lava: when the ring
    // point falls off the solid ground, pull it radially back inside; the
    // bot closes in instead when the arena leaves no room.
    const cd = Math.hypot(cx, cy);
    if (cd > arena - 2.5) { cx *= (arena - 3) / cd; cy *= (arena - 3) / cd; }
    setMoveTarget(state, id, cx, cy);
  }

  // fireball with intercept aim; near the rim, aim past the target toward
  // the outside so the knockback shoves them into the lava (a ~10u shove,
  // worth far more than the fireball's damage). Shoot whoever is closest,
  // except when someone in range is one fireball from death; secure that.
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
  // hold a heading; what they cannot do is react to a direction change
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
  // A triggered dodge is held (no kiting) until the projectile has passed;
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
      // dead-on shot leaves the choice open; then pick the side off the lava
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

  // -- lightning: finish the wounded or poke from afar; the sky-bolt lands
  // where the target WILL be, one delay from now (round 17). A HELD target
  // (round 20, ccHeld) waives the finish/poke gate and takes the bolt dead on
  // the body: the CC covers the telegraph.
  const held = ccHeld(pl, target);
  if ((pl.spells.lightning || 0) > 0 && (pl.cooldowns.lightning || 0) <= 0 &&
      dist < BOLT_ENGAGE && (held || target.hp <= 20 || dist > 24)) {
    const aim = held ? heldAim(pl, target, SPELLS.lightning)
      : boltAim(state, pl, target);
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
    'lightning', 'sword', 'treads', 'lightning', 'teleport'],
  berserker: ['fireball', 'fireball', 'rush', 'sword', 'amulet', 'boots',
    'rush', 'cape', 'treads'],
  // brawler (Normal) shares the berserker brain, so it shares its shopping
  // list too; the tier difference is reaction/aim only, never gear.
  brawler: ['fireball', 'fireball', 'rush', 'sword', 'amulet', 'boots',
    'rush', 'cape', 'treads'],
  stalker: ['teleport', 'fireball', 'lightning', 'boots', 'fireball',
    'shield', 'lightning', 'cape', 'teleport', 'lightning', 'shield'],
  // Issue #7: the Faker buys the combo, in the order it needs it; the hook and
  // the bolt first, the rock as the payoff, boots and cape to survive getting
  // there. Meteor is on the PILOTED_POWER list, so the guard lets it through.
  faker: ['lightning', 'fireball', 'swap', 'boots', 'lightning', 'meteor',
    'teleport', 'cape', 'lightning', 'meteor', 'shield'],
  // The Runner buys nothing that would let it escape (its ban is enforced in
  // code as well, so this list is only about not wasting its gold).
  // A dummy never casts, so its gold goes to STAYING MEASURABLE: hp to survive
  // longer chains, then legs and lava-proofing for the flee phase.
  runner: ['amulet', 'amulet', 'boots', 'amulet', 'treads', 'cape', 'boots'],
  // The Dummy never moves or casts: hp is the only purchase that keeps it a
  // usable target for longer. Nothing else would ever be exercised.
  dummy: ['amulet', 'amulet', 'amulet'],
};

// In elemental mode each bot kind commits to a fixed element (bought as soon
// as affordable) so bots-only elemental games exercise the effect code paths.
// Their combat logic needs no changes; elements apply passively on hit.
// 2026-08-08 (Remi: "the bots all keep playing wind, when each type should have
// its own strategy"). The element used to be keyed on the bot KIND, so a lobby
// of four bots at the same difficulty all bought the same element, and since
// most seats are berserkers, that meant everybody played gale.
// It is keyed on the BUILD now, which is what "strategy" means here: it is
// per-bot, it is the lobby dropdown, and 🎲 random varies it. Each build gets a
// small themed list, indexed by seat, so even four bots on the SAME build spread
// across different elements instead of stacking one.
// ⚠ These lists are quoted in the BUILDS descs (shared/constants.js); the
// in-game strategy chart is generated from those, so change both together.
const BUILD_ELEMENTS = {
  // Round 20.2: the modern builds sequence their elements in their ORDER
  // (which skips this pre-walk); only the item-only build needs a themed
  // list here. Legacy six retired with their BUILDS entries.
  juggernaut: ['terra', 'frost', 'vampire'],   // the wall still scales: bulk, control, sustain
};
const FALLBACK_ELEMENTS = ['ember', 'frost', 'malady', 'gale', 'terra', 'arcane'];

export function botElementFor(pl, seat = 0) {
  const list = (pl.build && BUILD_ELEMENTS[pl.build]) || FALLBACK_ELEMENTS;
  return list[Math.abs(seat) % list.length];
}

// Round 20: the power spells that HAVE a bot pilot (the CC-gated cast in
// pilotOwnedSpells). Only these may appear in a build/strategy order and be
// bought; the structural no-power guard below covers everything else.
// Power spells a bot may BUY, because it has real logic to use them. Round 20
// opened it for meteor (CC-gated cast); round 21.8 adds statue; stepBot has a
// full panic-button heuristic for it (hurt + a ball inbound + not near the rim),
// so it is no longer a spell they would own and never press. ⚠ Mine, Decoy,
// Switcheroo, Repulse, Wall stay OUT: no bot can read a trap or a bluff.
// Revert = drop the entry; the roster's C7 core then measures nothing.
// Issue #7: the Faker pilots Switcheroo as a combo OPENER and the Mine as its
// detonator payload (comboStep branch 0), so the guard has to let its builds
// buy them. Only faker-only builds list either, so nothing else changes;
// that is exactly what this set is for.
const PILOTED_POWER = new Set(['meteor', 'statue', 'swap', 'nova']);

export function botShop(state, id) {
  // Testing sandbox (round 19.8, Remi): the ONE untimed shop stands in for
  // many rounds of shopping; a bot handed 100 g must follow its whole
  // strategy now, not one polite pass. Normal rounds keep one pass (the
  // per-round pacing is deliberate). Bounded: each pass either spends gold
  // or the loop stops.
  const passes = state.testing ? 30 : 1;
  for (let i = 0; i < passes; i++) {
    const before = state.players[id] && state.players[id].gold;
    botShopPass(state, id);
    const pl = state.players[id];
    if (!pl || pl.gold === before) break;
  }
}

function botShopPass(state, id) {
  const pl = state.players[id];
  if (!pl) return;
  if (pl.wave) return; // campaign monsters are their descriptor, they never shop
  // an explicit build strategy (lobby pick) beats the kind's default list
  const order = (pl.build && BUILDS[pl.build] && BUILDS[pl.build].order) ||
    BOT_BUILDS[pl.kind] || BOT_BUILDS.grunt;
  if (state.mode === 'elemental') {
    // pinned at seat time so a bot never drifts between elements mid-game.
    // (Round 20.1: the "never open on mosquito" guard is gone with the element's
    // tax; the reworked mosquito is pure upside, so it opens like any other.)
    if (!pl._elemPick) {
      const seat = Object.keys(state.players).indexOf(id);
      pl._elemPick = botElementFor(pl, seat < 0 ? 0 : seat);
    }
    // one element level per shop, walking the build's themed list from the
    // seat's pick: primary to max, then the next one. Elements are the
    // fireball's whole progression since round 16 (it no longer levels here),
    // so a bot that stopped at one maxed element would simply stop scaling.
    // Round 20: SKIPPED for a build whose order sequences its own elements
    // (chainer); the walk here would front-run frost to max before the bolt.
    if (!order.some(k => Object.hasOwn(ELEMENTS, k))) {
      const list = (pl.build && BUILD_ELEMENTS[pl.build]) || FALLBACK_ELEMENTS;
      const from = Math.max(0, list.indexOf(pl._elemPick));
      for (let i = 0; i < list.length; i++) {
        if (buy(state, id, list[(from + i) % list.length]).ok) break;
      }
    }
  }
  for (const thing of order) {
    // Remi's rule (round 12): a bot must NEVER buy a spell it pilots badly.
    // The power tier lost its minRound gate, so nothing else stops a bot from
    // sinking 20+ gold into a spell it will never cast. The build lists happen
    // to omit them today; this makes it structural, and test-locked, so adding
    // a power spell to a list can't silently gut every difficulty tier and the
    // whole co-op curve. Round 20 opened the ONE exception, PILOTED_POWER
    // (meteor): a build that explicitly lists it may buy it, because the
    // CC-gated cast exists (AGENTS.md debt #2, partially paid).
    if (SPELLS[thing] && SPELLS[thing].tier === 'power' &&
        !PILOTED_POWER.has(thing)) continue;
    buy(state, id, thing); // ignores failures (owned / poor / maxed)
  }

  // Round 19.1 (Remi): "a bot should never stop buying stuff". ONLY once the
  // whole build path is maxed (list entries can fail on gold; saving toward
  // them stays sacred), leftovers go on random upgrades: items first, then
  // pilotable spells, then mutations. Seeded rng keeps games replayable.
  const maxed = (k) => {
    if (Object.hasOwn(SPELLS, k)) {
      const ml = k === 'fireball' && state.mode === 'elemental' ? 1 : SPELLS[k].maxLevel;
      return (pl.spells[k] || 0) >= ml;
    }
    if (Object.hasOwn(ITEMS, k)) return (pl.items[k] || 0) >= ITEMS[k].maxLevel;
    if (Object.hasOwn(ELEMENTS, k))
      return state.mode !== 'elemental' || (pl.elements[k] || 0) >= ELEMENTS[k].maxLevel;
    return true;
  };
  // The pre-walk element list gates the fallback ONLY for builds that use
  // the pre-walk; an order-driven build (round 20.2: most of them) skips it,
  // so demanding its list here would lock the fallback out forever.
  const orderHasElements = order.some(k => Object.hasOwn(ELEMENTS, k));
  const elemList = state.mode === 'elemental' && !orderHasElements
    ? ((pl.build && BUILD_ELEMENTS[pl.build]) || FALLBACK_ELEMENTS) : [];
  const pathDone =
    order.every(k => maxed(k) ||
      (SPELLS[k] && SPELLS[k].tier === 'power' && !PILOTED_POWER.has(k))) &&
    elemList.every(maxed);
  if (!pathDone) return;
  const pools = [
    Object.keys(ITEMS),
    Object.keys(SPELLS).filter(k => SPELLS[k].tier !== 'power'),
    state.mode === 'elemental' ? Object.keys(ELEMENTS) : [],
  ];
  for (const pool of pools) {
    const cands = pool.slice();
    while (cands.length) {
      const i = Math.floor(rng(state) * cands.length);
      // a success keeps the candidate (next levels exist); any failure
      // (maxed, mode-gated, draft-locked, too poor) retires it
      if (!buy(state, id, cands[i]).ok) cands.splice(i, 1);
    }
  }
}
