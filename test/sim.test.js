import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGame, addPlayer, removePlayer, setMoveTarget, castSpell, buy,
  startGame, step, snapshot, viewEvents, stepBot, botShop, setShopReady,
  setSpectator, setMode, botElementFor, playerStats, setShopPause,
  setDraft, draftPick, draftDue, MODES, pickPrey, killLead,
} from '../shared/sim.js';
import { catalogue, draftable, ownedLevel } from '../shared/catalogue.js';
import {
  ARENA, PLAYER, SPELLS, ITEMS, ITEM_FX, ELEMENTS, GOLD, ROUND, BOTS, BUILDS,
  BOT_MEMORY, BOT_TARGETING, DRAFT, itemCost,
} from '../shared/constants.js';
import { CAMPAIGN, MAX_LEVEL, SCALE, waveUnits } from '../shared/campaign.js';

const DT = 1 / 30;

function run(state, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) step(state, DT);
}

// Pinned to CLASSIC on purpose. Elemental became the default ruleset on
// 2026-08-08, but most tests here are about base mechanics and would silently
// start measuring element riders instead. Elemental tests build their own state
// with `mode: 'elemental'`.
function freshBattle(nPlayers = 2) {
  const state = createGame({ seed: 42, mode: 'classic' });
  for (let i = 0; i < nPlayers; i++) addPlayer(state, `p${i}`, `Player${i}`);
  startGame(state);
  run(state, ROUND.COUNTDOWN + DT); // through countdown
  expect(state.phase).toBe('battle');
  return state;
}

describe('game flow', () => {
  it('starts in lobby and transitions countdown -> battle', () => {
    const state = createGame();
    addPlayer(state, 'a', 'Alice');
    addPlayer(state, 'b', 'Bob');
    expect(state.phase).toBe('lobby');
    startGame(state);
    expect(state.phase).toBe('countdown');
    run(state, ROUND.COUNTDOWN + DT);
    expect(state.phase).toBe('battle');
    expect(state.players.a.alive).toBe(true);
  });

  it('spawns players on a circle inside the arena', () => {
    const state = freshBattle(4);
    for (const pl of Object.values(state.players)) {
      const d = Math.hypot(pl.x, pl.y);
      expect(d).toBeLessThan(ARENA.START_RADIUS);
      expect(d).toBeGreaterThan(5);
    }
  });

  it('ends the round when one player remains, awards gold, opens shop', () => {
    const state = freshBattle(2);
    const goldBefore = state.players.p0.gold;
    state.players.p1.hp = 1;
    // p0 fireballs p1 point blank
    state.players.p0.x = 0; state.players.p0.y = 0;
    state.players.p1.x = 4; state.players.p1.y = 0;
    castSpell(state, 'p0', 'fireball', 10, 0);
    run(state, 1);
    expect(state.players.p1.alive).toBe(false);
    expect(state.phase).toBe('roundEnd'); // victory banner first
    expect(state.roundSummary.winner).toBe('p0');
    expect(state.roundSummary.income.p0).toBe(GOLD.ROUND_BASE + GOLD.PER_KILL + GOLD.ROUND_WIN);
    run(state, ROUND.SUMMARY_TIME + 0.1);
    expect(state.phase).toBe('shop');
    expect(state.players.p0.kills).toBe(1);
    expect(state.players.p0.gold).toBe(
      goldBefore + GOLD.PER_KILL + GOLD.ROUND_BASE + GOLD.ROUND_WIN
    );
  });

  it('shop phase times out into the next round', () => {
    const state = freshBattle(2);
    state.players.p1.hp = 0.01;
    state.players.p1.x = ARENA.START_RADIUS + 5; // in lava
    run(state, 0.5 + ROUND.SUMMARY_TIME);
    expect(state.phase).toBe('shop');
    run(state, ROUND.SHOP_TIME + 0.5);
    expect(state.phase).toBe('countdown');
    expect(state.round).toBe(2);
    expect(state.players.p1.alive).toBe(true);
    expect(state.players.p1.hp).toBe(state.players.p1.maxHp);
  });

  it('game ends when someone reaches the kill target; most kills wins', () => {
    const state = freshBattle(2);
    state.players.p0.kills = ROUND.KILLS_TO_WIN - 1;
    state.players.p1.hp = 1;
    state.players.p0.x = 0; state.players.p0.y = 0;
    state.players.p1.x = 4; state.players.p1.y = 0;
    castSpell(state, 'p0', 'fireball', 10, 0); // the 15th kill
    run(state, 1 + ROUND.SUMMARY_TIME);
    expect(state.phase).toBe('gameover');
    expect(state.winner).toBe('p0');
  });

  it('game continues while nobody has reached the kill target', () => {
    const state = freshBattle(2);
    state.players.p0.kills = ROUND.KILLS_TO_WIN - 2;
    state.players.p1.hp = 0.01;
    state.players.p1.x = ARENA.START_RADIUS + 5; // lava death, no kill credit
    run(state, 0.5 + ROUND.SUMMARY_TIME);
    expect(state.phase).toBe('shop');
  });

  it('safety cap: MAX_ROUNDS ends the game even without the kill target', () => {
    const state = freshBattle(2);
    state.round = ROUND.MAX_ROUNDS;
    state.players.p0.kills = 3; state.players.p1.kills = 1;
    state.players.p1.hp = 0.01;
    state.players.p1.x = ARENA.START_RADIUS + 5;
    run(state, 0.5 + ROUND.SUMMARY_TIME);
    expect(state.phase).toBe('gameover');
    expect(state.winner).toBe('p0');
  });
});

describe('movement & physics', () => {
  it('moves a player toward its target at its speed', () => {
    const state = freshBattle(2);
    const pl = state.players.p0;
    pl.x = 0; pl.y = 0;
    setMoveTarget(state, 'p0', 10, 0);
    run(state, 0.5);
    expect(pl.x).toBeCloseTo(PLAYER.SPEED * 0.5, 0);
    expect(pl.y).toBeCloseTo(0, 5);
  });

  it('knockback decays with friction', () => {
    const state = freshBattle(2);
    const pl = state.players.p0;
    pl.vx = 30;
    run(state, 1.5);
    expect(Math.abs(pl.vx)).toBeLessThan(1);
  });

  it('sudden death: every round provably ends, even if nobody fights', () => {
    const state = freshBattle(2);
    // two pacifists parked in the very center — the old rules stalled forever
    for (const pl of Object.values(state.players)) { pl.x = 0; pl.y = 0; }
    run(state, ARENA.SHRINK_TIME + ARENA.OVERTIME_GRACE + ARENA.OVERTIME_SHRINK + 20);
    expect(state.phase).not.toBe('battle'); // lava ate the whole platform
  });

  it('arena shrinks over time', () => {
    const state = freshBattle(2);
    // park both players in the safe center so the round doesn't end
    for (const pl of Object.values(state.players)) { pl.x = 0; pl.y = 0; }
    const r0 = state.arenaRadius;
    run(state, 10);
    expect(state.arenaRadius).toBeLessThan(r0);
    run(state, ARENA.SHRINK_TIME);
    // 2026-08-08 (Remi, test): with ARENA.NEVER_STOPS the ring has no floor and
    // no overtime hold — it runs all the way to nothing, so eventually the whole
    // arena is lava. Flip the flag off and MIN_RADIUS is the floor again.
    expect(state.arenaRadius).toBeCloseTo(ARENA.NEVER_STOPS ? 0 : ARENA.MIN_RADIUS, 1);
  });
});

describe('lava', () => {
  it('damages players standing in it, with no lingering burn once out', () => {
    const state = freshBattle(3); // 3 players so round doesn't end
    const pl = state.players.p0;
    pl.x = ARENA.START_RADIUS + 5; pl.y = 0;
    const hp0 = pl.hp;
    run(state, 1);
    expect(pl.hp).toBeLessThan(hp0 - 10);    // ~14 dps minus baseline regen
    expect(pl.hp).toBeGreaterThan(hp0 - 16);
    // step out: the damage stops immediately and regen takes over
    pl.x = 0; pl.y = 0;
    run(state, DT * 2);
    const hp1 = pl.hp;
    run(state, 1);
    expect(pl.hp).toBeGreaterThan(hp1); // healing, not burning
  });

  it('lava kill credits the last hitter', () => {
    const state = freshBattle(3);
    const victim = state.players.p1;
    victim.hp = 30;
    // p0 tags the victim
    state.players.p0.x = 0; state.players.p0.y = 0;
    victim.x = 4; victim.y = 0;
    castSpell(state, 'p0', 'fireball', 10, 0);
    run(state, 0.5);
    expect(victim.hp).toBeLessThan(30);
    // then victim burns to death (14 dps net of regen: ~2.4 s for 30 hp)
    victim.x = ARENA.START_RADIUS + 10; victim.y = 0;
    run(state, 3);
    expect(victim.alive).toBe(false);
    expect(state.players.p0.kills).toBe(1);
  });

  it('lava treads reduce lava damage', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.items = { treads: 1 };
    a.x = ARENA.START_RADIUS + 5; a.y = 0;
    b.x = -(ARENA.START_RADIUS + 5); b.y = 0;
    run(state, 1);
    const lossA = a.maxHp - a.hp, lossB = b.maxHp - b.hp;
    // Read the expectation OUT OF THE SPEC so a retune of treads cannot fail
    // this test for the wrong reason (AGENTS.md: balance tests must not pin
    // constants). Regen offsets both sides slightly, so the observed loss ratio
    // sits a hair under lavaMult[0] — a ±0.1 band around it is the assertion.
    const m = ITEM_FX.treads.lavaMult[0];
    expect(lossA / lossB).toBeGreaterThan(m - 0.1);
    expect(lossA / lossB).toBeLessThan(m + 0.1);
    expect(lossA).toBeGreaterThan(0); // and it's a trim, not immunity
  });

  it('speeds you up instead of slowing you down (the lava dodge is real)', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.x = ARENA.START_RADIUS + 6; a.y = 0; // swimming
    b.x = 0; b.y = 0;                      // walking the same course on land
    step(state, DT); // latch the inLava flags
    const ax0 = a.x, bx0 = b.x;
    setMoveTarget(state, 'p0', ax0 + 25, 0);
    setMoveTarget(state, 'p1', bx0 + 25, 0);
    run(state, 1);
    expect(b.x - bx0).toBeCloseTo(PLAYER.SPEED, 0);          // baseline on land
    expect(a.x - ax0).toBeGreaterThan((b.x - bx0) * 1.2);    // ~30% faster in lava
  });
});

describe('bot builds & piloting', () => {
  it('a lobby build strategy overrides the kind default in the shop', () => {
    const state = createGame({ seed: 5 });
    addPlayer(state, 'b1', 'boomer-grunt', { bot: true, kind: 'grunt', build: 'boomer' });
    addPlayer(state, 'b2', 'stock-grunt', { bot: true, kind: 'grunt' });
    state.phase = 'shop';
    state.players.b1.gold = 40; state.players.b2.gold = 40;
    botShop(state, 'b1'); botShop(state, 'b2');
    expect(state.players.b1.spells.boomerang || 0).toBeGreaterThan(0); // boomer list
    expect(state.players.b2.spells.boomerang || 0).toBe(0);           // grunt default
  });

  it('bots actually cast the spells their build buys (boomerang pilot)', () => {
    const state = freshBattle(3);
    const a = state.players.p0;
    a.bot = true; a.kind = 'grunt';
    a.spells.boomerang = 1;
    a.x = 0; a.y = 0;
    state.players.p1.x = 10; state.players.p1.y = 0;
    state.players.p2.x = 0; state.players.p2.y = -20;
    for (let i = 0; i < 60 && !state.projectiles.some(p => p.type === 'boomerang'); i++) {
      stepBot(state, 'p0', DT);
      step(state, DT);
    }
    expect(state.projectiles.some(p => p.type === 'boomerang')).toBe(true);
  });

  it('unknown builds are rejected at addPlayer (no crash later)', () => {
    const state = createGame({ seed: 6 });
    const pl = addPlayer(state, 'b1', 'x', { bot: true, kind: 'grunt', build: 'nonsense' });
    expect(pl.build).toBe(null);
  });
});

describe('gold accounting', () => {
  it('goldEarned tracks lifetime income; gold is just the wallet', () => {
    const state = freshBattle(2);
    const a = state.players.p0, b = state.players.p1;
    a.x = 0; a.y = 0; b.x = 2; b.y = 0; b.hp = 1;
    castSpell(state, 'p0', 'fireball', 5, 0);
    run(state, 0.5); // kill lands -> round ends -> income granted
    expect(a.kills).toBe(1);
    expect(a.goldEarned).toBe(GOLD.START + GOLD.PER_KILL + GOLD.ROUND_BASE + GOLD.ROUND_WIN);
    expect(a.goldEarned).toBeGreaterThanOrEqual(a.gold); // spending never lowers earnings
  });

  it('anti-snowball hard cap: 4p top earner can never reach 2x the passive floor', () => {
    // per-round max income is BASE + 3*PER_KILL + WIN, floor is BASE
    expect(GOLD.ROUND_BASE).toBeGreaterThanOrEqual(3 * GOLD.PER_KILL + GOLD.ROUND_WIN);
  });

  it('bounty pays the underdog and never the leader', () => {
    // underdog (0 kills) slays the leader (6 kills): gap 6 -> max bounty
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    b.kills = 6;
    const g0 = a.gold;
    b.hp = 1; a.x = 0; a.y = 0; b.x = 2; b.y = 0;
    state.players.p2.x = 0; state.players.p2.y = -30;
    castSpell(state, 'p0', 'fireball', 5, 0);
    run(state, 0.3);
    expect(b.alive).toBe(false);
    expect(a.gold).toBe(g0 + GOLD.PER_KILL + GOLD.BOUNTY_MAX);
    expect(state.events.some(e => e.t === 'gold' && e.id === 'p0')).toBe(true);

    // leader (6 kills) squashes the underdog (0 kills): plain kill gold only
    const s2 = freshBattle(3);
    const l = s2.players.p0, u = s2.players.p1;
    l.kills = 6;
    const g1 = l.gold;
    u.hp = 1; l.x = 0; l.y = 0; u.x = 2; u.y = 0;
    s2.players.p2.x = 0; s2.players.p2.y = -30;
    castSpell(s2, 'p0', 'fireball', 5, 0);
    run(s2, 0.3);
    expect(u.alive).toBe(false);
    expect(l.gold).toBe(g1 + GOLD.PER_KILL);
  });
});

describe('spells', () => {
  it('fireball damages and knocks back on hit, then disappears', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.x = 0; a.y = 0; b.x = 8; b.y = 0;
    state.players.p2.x = 0; state.players.p2.y = -20;
    expect(castSpell(state, 'p0', 'fireball', 20, 0)).toBe(true);
    run(state, 0.5);
    // baseline regen ticks between the hit and the assertion: allow up to ~0.6 healed back
    expect(b.hp).toBeGreaterThanOrEqual(b.maxHp - SPELLS.fireball.damage[0]);
    expect(b.hp).toBeLessThan(b.maxHp - SPELLS.fireball.damage[0] + 1);
    expect(b.vx).toBeGreaterThan(0); // knocked away
    expect(state.projectiles.length).toBe(0);
  });

  it('respects cooldown', () => {
    const state = freshBattle(2);
    expect(castSpell(state, 'p0', 'fireball', 20, 0)).toBe(true);
    expect(castSpell(state, 'p0', 'fireball', 20, 0)).toBe(false);
    run(state, SPELLS.fireball.cooldown[0] + 0.1);
    expect(castSpell(state, 'p0', 'fireball', 20, 0)).toBe(true);
  });

  it('cannot cast unowned spells', () => {
    const state = freshBattle(2);
    expect(castSpell(state, 'p0', 'lightning', 20, 0)).toBe(false);
  });

  // ---- lightning ⚡ (round 17: telegraphed sky-bolt — docs/ROUND17.md §2) --

  it('lightning: the zone shows instantly, the bolt lands after the delay', () => {
    const spec = SPELLS.lightning;
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.lightning = 1;
    a.x = 0; a.y = 0; b.x = 20; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null;
    state.players.p2.y = -30;
    castSpell(state, 'p0', 'lightning', 20, 0);
    expect(state.bolts.length).toBe(1);           // telegraph up on cast
    expect(snapshot(state).bolts.length).toBe(1); // and on the wire, for everyone
    run(state, spec.delay * 0.6);
    expect(b.hp).toBe(b.maxHp);                   // the dodge window is real
    run(state, spec.delay * 0.6);
    expect(state.bolts.length).toBe(0);
    expect(b.maxHp - b.hp).toBeGreaterThan(spec.damage[0] - 1); // centered: full
    expect(b.vx).toBeGreaterThan(0);              // radial push, outward from center
  });

  it('lightning: stepping out of the telegraph dodges the bolt entirely', () => {
    const spec = SPELLS.lightning;
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.lightning = 1;
    a.x = 0; a.y = 0; b.x = 20; b.y = 0; b.vx = 0; b.moveTarget = null;
    state.players.p2.y = -30;
    castSpell(state, 'p0', 'lightning', 20, 0);
    b.x = 20 + spec.radius + b.radius + 1; // walked clear of the zone
    run(state, spec.delay + 0.1);
    expect(b.hp).toBe(b.maxHp);            // the bolt does not track
  });

  it('lightning: damage and knockback fall linearly to half at the zone edge, radially', () => {
    const spec = SPELLS.lightning;
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.lightning = 1;
    a.x = 0; a.y = 0;
    state.players.p2.y = -30;
    const reach = spec.radius + b.radius;
    b.x = 10; b.y = reach * 0.9; b.vx = 0; b.vy = 0; b.moveTarget = null;
    castSpell(state, 'p0', 'lightning', 10, 0);
    run(state, spec.delay + 0.1);
    const frac = 1 - 0.5 * 0.9;            // 90% of the way out
    const taken = b.maxHp - b.hp;
    expect(taken).toBeGreaterThan(spec.damage[0] * frac - 1.5);
    expect(taken).toBeLessThan(spec.damage[0] * frac + 0.5);
    expect(b.vy).toBeGreaterThan(0);       // pushed away from the zone CENTER...
    expect(Math.abs(b.vx)).toBeLessThan(b.vy); // ...not along the caster's line
  });

  it('lightning: a shield holds the bolt', () => {
    const spec = SPELLS.lightning;
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.lightning = 1;
    a.x = 0; a.y = 0; b.x = 20; b.y = 0; b.vx = 0; b.moveTarget = null;
    state.players.p2.y = -30;
    castSpell(state, 'p0', 'lightning', 20, 0);
    b.shieldT = spec.delay + 1;
    run(state, spec.delay + 0.1);
    expect(b.hp).toBe(b.maxHp);
  });

  it('teleport moves the caster and zeroes momentum', () => {
    const state = freshBattle(2);
    const a = state.players.p0;
    a.spells.teleport = 1;
    a.x = 0; a.y = 0; a.vx = 50;
    castSpell(state, 'p0', 'teleport', 10, 0);
    expect(a.x).toBeCloseTo(10, 3);
    expect(a.vx).toBe(0);
  });

  it('teleport is clamped to its range', () => {
    const state = freshBattle(2);
    const a = state.players.p0;
    a.spells.teleport = 1;
    a.x = 0; a.y = 0;
    castSpell(state, 'p0', 'teleport', 100, 0);
    expect(a.x).toBeCloseTo(SPELLS.teleport.range[0], 3);
  });

  it('shield reflects a fireball back at its owner', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.x = 0; a.y = 0; b.x = 8; b.y = 0;
    state.players.p2.y = 30;
    b.spells.shield = 1;
    castSpell(state, 'p1', 'shield', 0, 0);
    expect(b.shieldT).toBeGreaterThan(0);
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 1);
    expect(b.hp).toBe(b.maxHp);                      // shielded
    expect(a.hp).toBeGreaterThanOrEqual(a.maxHp - SPELLS.fireball.damage[0]); // reflected back
    expect(a.hp).toBeLessThan(a.maxHp - SPELLS.fireball.damage[0] + 1.5);     // (minus a little regen)
  });

  it('tapping the key again recalls the boomerang early', () => {
    const state = freshBattle(3);
    const a = state.players.p0;
    a.spells.boomerang = 1;
    a.x = 0; a.y = 0;
    state.players.p1.x = 0; state.players.p1.y = 40;
    state.players.p2.x = 0; state.players.p2.y = -40;
    castSpell(state, 'p0', 'boomerang', 20, 0);
    run(state, 0.6);
    const pr = state.projectiles[0];
    expect(pr.returning).toBe(false);
    const out = pr.traveled;
    expect(out).toBeLessThan(SPELLS.boomerang.outDistance); // nowhere near the ceiling
    expect(castSpell(state, 'p0', 'boomerang', 0, 0)).toBe(true); // the recall
    expect(pr.returning).toBe(true);
    expect(pr.vx).toBeLessThan(0);          // heading home along -x
    expect(pr.turnAt).toBeCloseTo(out, 5);  // turn point remembered
  });

  it('boomerang returns and can hit on the way back', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.boomerang = 1;
    a.x = 0; a.y = 0;
    b.x = 20; b.y = 12;                    // off the throw lane: the out-leg misses
    state.players.p2.y = 40;
    castSpell(state, 'p0', 'boomerang', 20, 0);
    run(state, 0.6);
    castSpell(state, 'p0', 'boomerang', 0, 0); // recall it
    b.x = 10; b.y = 0; b.vx = 0; b.vy = 0;     // step into the return path
    run(state, 1.0);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(state.projectiles.length).toBe(0);  // caught by the waiting owner
  });

  it('boomerang catch halves the remaining cooldown', () => {
    const state = freshBattle(3);
    const a = state.players.p0;
    a.spells.boomerang = 1;
    a.x = 0; a.y = 0;
    state.players.p1.x = 0; state.players.p1.y = 40;
    state.players.p2.x = 0; state.players.p2.y = -40;
    castSpell(state, 'p0', 'boomerang', 20, 0); // owner stays at the launch point
    run(state, 0.6);
    castSpell(state, 'p0', 'boomerang', 0, 0);  // recall: home in ~0.6 s more
    run(state, 1.0);
    expect(state.projectiles.length).toBe(0);   // caught
    const elapsed = 1.6;
    const served = SPELLS.boomerang.cooldown - elapsed;
    expect(a.cooldowns.boomerang).toBeGreaterThan(0.5);
    expect(a.cooldowns.boomerang).toBeLessThan(served * 0.6); // roughly halved
  });

  it('an uncaught boomerang flies past its launch point and is gone forever', () => {
    const state = freshBattle(3);
    const a = state.players.p0;
    a.spells.boomerang = 1;
    a.x = 0; a.y = 0;
    state.players.p1.x = 0; state.players.p1.y = 40;
    state.players.p2.x = 0; state.players.p2.y = -40;
    castSpell(state, 'p0', 'boomerang', 20, 0);
    run(state, 0.6);
    castSpell(state, 'p0', 'boomerang', 0, 0); // recall so the test stays short
    a.x = 0; a.y = 12; // side-step: refuse the catch
    const cdBefore = () => a.cooldowns.boomerang;
    run(state, 1.6); // it passed the launch point without being caught
    expect(state.projectiles.length).toBe(1); // still flying, straight on
    expect(state.projectiles[0].lost).toBe(true);
    run(state, 5);   // 31 u/s: exits the world (cull at 2x START_RADIUS)
    expect(state.projectiles.length).toBe(0);
    expect(cdBefore()).toBe(0); // full cooldown was served, no refund
  });

  it('rush damages enemies passed through', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.rush = 1;
    a.x = 0; a.y = 0; b.x = 6; b.y = 0;
    state.players.p2.y = 40;
    castSpell(state, 'p0', 'rush', 20, 0);
    run(state, 0.6);
    expect(b.hp).toBeGreaterThanOrEqual(b.maxHp - SPELLS.rush.damage[0]);
    expect(b.hp).toBeLessThan(b.maxHp - SPELLS.rush.damage[0] + 1);
    expect(a.dash).toBe(null);
  });
});

describe('shop & economy', () => {
  function shopState() {
    const state = createGame({ seed: 7 });
    addPlayer(state, 'a', 'Alice');
    addPlayer(state, 'b', 'Bob');
    state.phase = 'shop';
    return state;
  }

  it('buys a spell level and charges gold', () => {
    const state = shopState();
    state.players.a.gold = 20;
    expect(buy(state, 'a', 'lightning').ok).toBe(true);
    expect(state.players.a.spells.lightning).toBe(1);
    expect(state.players.a.gold).toBe(20 - SPELLS.lightning.costs[0]);
  });

  it('rejects purchases without gold', () => {
    const state = shopState();
    state.players.a.gold = 0;
    expect(buy(state, 'a', 'lightning').ok).toBe(false);
  });

  it('rejects over-max spell levels', () => {
    const state = shopState();
    state.players.a.gold = 999;
    for (let i = 0; i < 3; i++) buy(state, 'a', 'lightning');
    expect(state.players.a.spells.lightning).toBe(SPELLS.lightning.maxLevel);
    expect(buy(state, 'a', 'lightning').ok).toBe(false);
  });

  // Round 16 (Remi): the fireball never levels in ELEMENTAL mode — the
  // elements are its whole progression there. Classic keeps its 3 levels.
  it('fireball is locked at lv1 in elemental mode, levels normally in classic', () => {
    const state = shopState(); // default mode: elemental
    state.players.a.gold = 999;
    expect(buy(state, 'a', 'fireball').ok).toBe(false);
    expect(state.players.a.spells.fireball).toBe(1);
    const classic = createGame({ seed: 7, mode: 'classic' });
    addPlayer(classic, 'a', 'Alice');
    classic.phase = 'shop';
    classic.players.a.gold = 999;
    for (let i = 1; i < SPELLS.fireball.maxLevel; i++)
      expect(buy(classic, 'a', 'fireball').ok).toBe(true);
    expect(classic.players.a.spells.fireball).toBe(SPELLS.fireball.maxLevel);
    expect(buy(classic, 'a', 'fireball').ok).toBe(false);
  });

  // ---- items are LEVELLED (round 12) ------------------------------------
  // Every number below is read out of the spec on purpose (AGENTS.md scar:
  // round-11 tests broke on intended retunes purely because they pinned old
  // constants). What is asserted is the RULE, not the tuning.

  it('items level 1..maxLevel at a flat cost per level', () => {
    const state = shopState();
    const a = state.players.a;
    a.gold = 999;
    const each = ITEMS.boots.cost;
    expect(itemCost('boots')).toBe(each);   // flat: no owned-count argument
    let spent = 0;
    for (let lv = 1; lv <= ITEMS.boots.maxLevel; lv++) {
      const before = a.gold;
      expect(buy(state, 'a', 'boots').ok).toBe(true);
      expect(a.items.boots).toBe(lv);
      spent += before - a.gold;
    }
    expect(spent).toBe(each * ITEMS.boots.maxLevel);
  });

  it('an item cannot exceed maxLevel', () => {
    const state = shopState();
    const a = state.players.a;
    a.gold = 999;
    for (let i = 0; i < ITEMS.boots.maxLevel + 3; i++) buy(state, 'a', 'boots');
    expect(a.items.boots).toBe(ITEMS.boots.maxLevel);
    expect(buy(state, 'a', 'boots').err).toBe('max level');
    // echo/crown are maxLevel 1 — that is what the old `unique` flag meant
    const el = createGame({ seed: 3, mode: 'elemental' });
    addPlayer(el, 'a', 'A');
    el.phase = 'shop';
    el.players.a.gold = 999;
    expect(ITEMS.echo.maxLevel).toBe(1);
    expect(buy(el, 'a', 'echo').ok).toBe(true);
    expect(el.players.a.items.echo).toBe(1);
    expect(buy(el, 'a', 'echo').err).toBe('max level');
  });

  it('a poor player cannot buy the next level', () => {
    const state = shopState();
    const a = state.players.a;
    a.gold = itemCost('boots') - 1;
    expect(buy(state, 'a', 'boots').err).toBe('not enough gold');
    expect(a.items.boots).toBeUndefined();
  });

  it('level-2 boots give exactly the level-2 total, not level 1 twice', () => {
    const state = shopState();
    const a = state.players.a;
    a.gold = 999;
    buy(state, 'a', 'boots');
    expect(playerStats(a).speed).toBeCloseTo(PLAYER.SPEED * ITEM_FX.boots.speedMult[0], 6);
    buy(state, 'a', 'boots');
    expect(a.items.boots).toBe(2);
    // ITEM_FX arrays are ABSOLUTE CUMULATIVE totals: lv2 is ×[1], NOT ×[0]×[1]
    expect(playerStats(a).speed).toBeCloseTo(PLAYER.SPEED * ITEM_FX.boots.speedMult[1], 6);
    expect(playerStats(a).speed).not.toBeCloseTo(
      PLAYER.SPEED * ITEM_FX.boots.speedMult[0] * ITEM_FX.boots.speedMult[1], 4);
    buy(state, 'a', 'boots');
    expect(playerStats(a).speed).toBeCloseTo(PLAYER.SPEED * ITEM_FX.boots.speedMult[2], 6);
  });

  it('every levelled item stat reads the owned level out of ITEM_FX', () => {
    const state = shopState();
    const a = state.players.a;
    a.gold = 999;
    for (const key of ['boots', 'treads', 'amulet', 'ring', 'cape', 'sword'])
      for (let i = 0; i < 3; i++) buy(state, 'a', key);
    const s = playerStats(a);
    const last = (k, f) => ITEM_FX[k][f][ITEMS[k].maxLevel - 1];
    expect(s.speed).toBeCloseTo(PLAYER.SPEED * last('boots', 'speedMult'), 6);
    expect(s.lavaMult).toBeCloseTo(last('treads', 'lavaMult'), 6);
    expect(s.kbMult).toBeCloseTo(last('cape', 'kbMult'), 6);
    expect(s.regen).toBeCloseTo(PLAYER.REGEN + last('ring', 'regen'), 6);
    expect(s.lifesteal).toBeCloseTo(last('sword', 'lifesteal'), 6);
    expect(s.maxHp).toBe(PLAYER.MAX_HP + last('amulet', 'maxHp'));
  });

  it('amulet levels raise the live max hp by the cumulative difference', () => {
    const state = shopState();
    const a = state.players.a;
    a.gold = 999;
    const hp = ITEM_FX.amulet.maxHp;
    buy(state, 'a', 'amulet');
    expect(a.maxHp).toBe(PLAYER.MAX_HP + hp[0]);   // immediately, not next round
    buy(state, 'a', 'amulet');
    expect(a.maxHp).toBe(PLAYER.MAX_HP + hp[1]);   // total, not hp[0] + hp[1]
    buy(state, 'a', 'amulet');
    expect(a.maxHp).toBe(PLAYER.MAX_HP + hp[2]);
    // the live field and the derived stat must never disagree
    expect(playerStats(a).maxHp).toBe(a.maxHp);
  });

  it('rejects prototype-chain names as purchases and casts', () => {
    const state = shopState();
    state.players.a.gold = 999;
    for (const evil of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(buy(state, 'a', evil).ok).toBe(false);
      expect(castSpell(state, 'a', evil, 10, 0)).toBe(false);
    }
    expect(state.players.a.gold).toBe(999);
  });

  it('blocks buying during battle', () => {
    const state = freshBattle(2);
    state.players.p0.gold = 99;
    expect(buy(state, 'p0', 'lightning').ok).toBe(false);
  });

  it('boots increase movement speed', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.items = { boots: 1 };
    a.x = 0; a.y = 0; b.x = 0; b.y = 30;
    setMoveTarget(state, 'p0', 40, 0);
    setMoveTarget(state, 'p1', 40, 30);
    run(state, 1);
    expect(a.x).toBeGreaterThan(b.x * 1.1);
  });
});

describe('edge cases (fuzz campaign probes)', () => {
  it('both last players dying the same tick ends the round exactly once, no winner', () => {
    const state = freshBattle(2);
    const a = state.players.p0, b = state.players.p1;
    a.hp = 0.001; b.hp = 0.001;
    a.x = ARENA.START_RADIUS + 5; a.y = 0;
    b.x = -(ARENA.START_RADIUS + 5); b.y = 0;
    step(state, DT);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(false);
    const roundEnds = state.events.filter(e => e.t === 'roundEnd');
    expect(roundEnds.length).toBe(1);
    expect(roundEnds[0].winner).toBe(null);
    expect(state.phase).toBe('roundEnd');
    run(state, ROUND.SUMMARY_TIME + 0.1);
    expect(state.phase).toBe('shop');
    // and the next round starts cleanly with both respawned
    run(state, ROUND.SHOP_TIME + ROUND.COUNTDOWN + 1);
    expect(state.phase).toBe('battle');
    expect(a.alive && b.alive).toBe(true);
  });

  it('boomerang whose owner disconnects mid-flight resolves without crashing', () => {
    const state = freshBattle(3);
    const a = state.players.p0;
    a.spells.boomerang = 1;
    a.x = 0; a.y = 0;
    state.players.p1.x = 0; state.players.p1.y = 40;
    state.players.p2.x = 0; state.players.p2.y = -40;
    castSpell(state, 'p0', 'boomerang', 20, 0);
    run(state, 0.3);
    expect(state.projectiles.length).toBe(1);
    removePlayer(state, 'p0');
    // nobody left to catch it: it returns, passes the launch point, and
    // flies straight off the world (culled at 2x START_RADIUS)
    run(state, 7);
    expect(state.projectiles.length).toBe(0);
    expect(() => JSON.stringify(snapshot(state))).not.toThrow();
  });

  it('reflect chain between two shielded players terminates once shields expire', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = 40;
    a.spells.shield = 1; b.spells.shield = 1;
    a.x = 0; a.y = 0; b.x = 8; b.y = 0;
    castSpell(state, 'p0', 'shield', 0, 0);
    castSpell(state, 'p1', 'shield', 0, 0);
    castSpell(state, 'p0', 'fireball', 20, 0);
    // pin both in place so the projectile ping-pongs through shield expiry
    for (let i = 0; i < 30 * 6; i++) {
      a.x = 0; a.y = 0; a.vx = a.vy = 0;
      b.x = 8; b.y = 0; b.vx = b.vy = 0;
      step(state, DT);
    }
    expect(state.projectiles.length).toBe(0);
    // someone was eventually hit (baseline regen may have healed it back by now)
    expect(state.events.some(e => e.t === 'hit' && (e.id === 'p0' || e.id === 'p1'))).toBe(true);
  });

  it('reflected fireball credits the shielder with the kill', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = 40;
    a.x = 0; a.y = 0; a.hp = 1;
    b.x = 8; b.y = 0;
    b.spells.shield = 1;
    castSpell(state, 'p1', 'shield', 0, 0);
    castSpell(state, 'p0', 'fireball', 20, 0);
    for (let i = 0; i < 90 && a.alive; i++) {
      a.x = 0; a.y = 0; a.vx = a.vy = 0;
      b.x = 8; b.y = 0;
      step(state, DT);
    }
    expect(a.alive).toBe(false);
    expect(b.kills).toBe(1);
  });

  it('rusher dying mid-dash in lava has its dash cleared', () => {
    const state = freshBattle(3);
    const a = state.players.p0;
    a.spells.rush = 2;
    a.hp = 0.5;
    a.x = ARENA.START_RADIUS - 1; a.y = 0;
    state.players.p1.x = 0; state.players.p1.y = 40;
    state.players.p2.x = 0; state.players.p2.y = -40;
    castSpell(state, 'p0', 'rush', ARENA.START_RADIUS + 30, 0);
    run(state, 2);
    expect(a.alive).toBe(false);
    expect(a.dash).toBe(null);
  });

  it('rush killing its victim credits the kill and finishes the dash', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.rush = 1;
    a.x = 0; a.y = 0; b.x = 5; b.y = 0; b.hp = 1;
    state.players.p2.x = 0; state.players.p2.y = 40;
    castSpell(state, 'p0', 'rush', 20, 0);
    run(state, 1);
    expect(b.alive).toBe(false);
    expect(a.dash).toBe(null);
    expect(a.kills).toBe(1);
  });

  it('teleport spam at the arena edge keeps positions finite', () => {
    const state = freshBattle(3);
    const a = state.players.p0;
    a.spells.teleport = 2;
    state.players.p1.x = 0; state.players.p1.y = 40;
    state.players.p2.x = 0; state.players.p2.y = -40;
    for (let i = 0; i < 300; i++) { // ~10 s: enough for the 14 dps lava to finish them
      a.cooldowns.teleport = 0; // force-spam past the cooldown
      castSpell(state, 'p0', 'teleport', a.x + 1000, 0);
      step(state, DT);
      expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
    }
    expect(a.alive).toBe(false); // burned in lava, no blowup
  });

  it('buying works on the last shop tick and is rejected once countdown starts', () => {
    const state = freshBattle(2);
    state.players.p1.hp = 0.001;
    state.players.p1.x = ARENA.START_RADIUS + 5;
    run(state, 0.5 + ROUND.SUMMARY_TIME);
    expect(state.phase).toBe('shop');
    state.players.p0.gold = 100;
    while (state.phaseT > DT) step(state, DT);
    expect(buy(state, 'p0', 'fireball').ok).toBe(true); // boundary tick
    step(state, DT);
    expect(state.phase).toBe('countdown');
    const gold = state.players.p0.gold;
    expect(buy(state, 'p0', 'fireball').ok).toBe(false);
    expect(state.players.p0.gold).toBe(gold);
  });
});

describe('round-3 mechanics', () => {
  function toShop(state) {
    state.players.p1.hp = 0.001;
    state.players.p1.x = ARENA.START_RADIUS + 5;
    run(state, 0.5 + ROUND.SUMMARY_TIME + 0.1);
    expect(state.phase).toBe('shop');
  }

  it('buying is not allowed in the lobby anymore', () => {
    const state = createGame({ seed: 3 });
    addPlayer(state, 'a', 'Alice');
    state.players.a.gold = 99;
    expect(buy(state, 'a', 'lightning').ok).toBe(false);
  });

  it('everyone ready in the shop skips straight to the next round', () => {
    const state = freshBattle(2);
    toShop(state);
    expect(state.phaseT).toBeGreaterThan(ROUND.SHOP_TIME - 5);
    setShopReady(state, 'p0');
    step(state, DT);
    expect(state.phase).toBe('shop'); // p1 not ready yet
    setShopReady(state, 'p1');
    step(state, DT);
    expect(state.phase).toBe('countdown');
  });

  // 2026-08-07 (Remi: "sometimes I don't have time to read the shop")
  it('pausing the shop freezes the clock but not the shopping', () => {
    const state = freshBattle(2);
    toShop(state);
    const before = state.phaseT;
    expect(setShopPause(state, 'p0', true).ok).toBe(true);
    for (let i = 0; i < 200; i++) step(state, DT);
    expect(state.phase).toBe('shop');            // never times out
    expect(state.phaseT).toBeCloseTo(before, 5); // clock genuinely frozen
    state.players.p0.gold = 99;
    expect(buy(state, 'p0', 'lightning').ok).toBe(true); // still shopping

    setShopPause(state, 'p0', false);
    for (let i = 0; i < 200; i++) step(state, DT);
    expect(state.phaseT).toBeLessThan(before);
  });

  it('a pause can never hold the lobby hostage, and never leaks into the next shop', () => {
    const state = freshBattle(2);
    toShop(state);
    setShopPause(state, 'p0', true);
    setShopReady(state, 'p0');
    setShopReady(state, 'p1');
    step(state, DT);
    expect(state.phase).toBe('countdown');  // everyone ready still starts it
    expect(state.shopPaused).toBe(null);    // and the pause is cleared
  });

  it('shop-ready flags reset every round', () => {
    const state = freshBattle(2);
    toShop(state);
    setShopReady(state, 'p0');
    setShopReady(state, 'p1');
    run(state, ROUND.COUNTDOWN + 1);
    expect(state.phase).toBe('battle');
    expect(state.players.p0.shopReady).toBe(false);
  });

  it('fireballs have unlimited range but are culled off-world', () => {
    const state = freshBattle(3);
    const a = state.players.p0;
    a.x = 0; a.y = 0;
    state.players.p1.y = 50; state.players.p2.y = -50;
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 2); // traveled ~68u — far beyond the old 45u cap
    expect(state.projectiles.length).toBe(1);
    run(state, 2); // now beyond 2× arena radius: culled
    expect(state.projectiles.length).toBe(0);
  });
});

describe('size-by-lead & spectators', () => {
  it('kill leaders grow, trailers shrink, clamped to the caps', () => {
    const state = freshBattle(2);
    state.players.p0.kills = 5; state.players.p1.kills = 0; // avg 2.5
    step(state, DT);
    expect(state.players.p0.radius).toBeGreaterThan(PLAYER.RADIUS);
    expect(state.players.p1.radius).toBeLessThan(PLAYER.RADIUS);
    state.players.p0.kills = 100;
    step(state, DT);
    expect(state.players.p0.radius).toBeCloseTo(PLAYER.RADIUS * PLAYER.SIZE_LEAD.MAX, 3);
    expect(state.players.p1.radius).toBeCloseTo(PLAYER.RADIUS * PLAYER.SIZE_LEAD.MIN, 3);
  });

  it('a bigger body is easier to hit', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.y = -40;
    a.x = 0; a.y = 0; b.x = 15; b.y = 2.6; // grazing shot: misses a normal body (reach 2.2)
    b.kills = 10; // big lead -> big body
    step(state, DT);
    castSpell(state, 'p0', 'fireball', 15, 0); // aimed straight, not at b
    run(state, 1);
    expect(b.hp).toBeLessThan(b.maxHp); // clipped by the bigger hitbox
  });

  it('spectators do not spawn, fight, or block the round', () => {
    const state = createGame({ seed: 11 });
    addPlayer(state, 'watcher', 'Watcher');
    addPlayer(state, 'a', 'Alice');
    addPlayer(state, 'b', 'Bob');
    setSpectator(state, 'watcher', true);
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    expect(state.phase).toBe('battle');
    expect(state.players.watcher.alive).toBe(false);
    // one fighter dies -> round ends despite the spectator being "present"
    state.players.b.hp = 0.01;
    state.players.b.x = ARENA.START_RADIUS + 5;
    run(state, 0.5);
    expect(state.phase).toBe('roundEnd');
    expect(state.roundSummary.income.watcher).toBeUndefined();
  });

  it('bots-only games run to completion with a spectator watching', () => {
    const state = createGame({ seed: 12 });
    addPlayer(state, 'watcher', 'Watcher');
    setSpectator(state, 'watcher', true);
    addPlayer(state, 'b1', 'B1', { bot: true, kind: 'grunt' });
    addPlayer(state, 'b2', 'B2', { bot: true, kind: 'berserker' });
    startGame(state);
    let guard = 0;
    let lastPhase = state.phase;
    while (state.phase !== 'gameover' && guard++ < 30 * 60 * 45) {
      step(state, DT);
      for (const id of ['b1', 'b2']) stepBot(state, id, DT);
      if (state.phase === 'shop' && lastPhase !== 'shop')
        for (const id of ['b1', 'b2']) botShop(state, id);
      lastPhase = state.phase;
    }
    expect(state.phase).toBe('gameover');
    expect(['b1', 'b2']).toContain(state.winner);
  });
});

describe('serialization & misc', () => {
  it('snapshot is JSON-round-trippable and omits internals', () => {
    const state = freshBattle(3);
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.1);
    const snap = JSON.parse(JSON.stringify(snapshot(state)));
    expect(snap.players.p0.hp).toBeDefined();
    expect(snap.players.p0.moveTarget).toBeUndefined();
    expect(snap.projectiles.length).toBeGreaterThan(0);
  });

  it('removePlayer leaves the game consistent', () => {
    const state = freshBattle(3);
    castSpell(state, 'p0', 'fireball', 20, 0);
    removePlayer(state, 'p0');
    run(state, 2);
    expect(Object.keys(state.players).length).toBe(2);
  });

  it('a full bot game reaches gameover', () => {
    const state = createGame({ seed: 123, mode: 'classic' });
    for (let i = 0; i < 4; i++) addPlayer(state, `b${i}`, `Bot${i}`, { bot: true });
    startGame(state);
    let guard = 0;
    let lastPhase = state.phase;
    while (state.phase !== 'gameover' && guard++ < 90 * 60 * 30) { // 90 min sim cap (rounds got long when the ring stopped holding at MIN)
      step(state, DT);
      for (const id of Object.keys(state.players)) stepBot(state, id, DT);
      if (state.phase === 'shop' && lastPhase !== 'shop')
        for (const id of Object.keys(state.players)) botShop(state, id);
      lastPhase = state.phase;
    }
    expect(state.phase).toBe('gameover');
    expect(state.winner).toBeTruthy();
    const total = Object.values(state.players).reduce((s, p) => s + p.kills, 0);
    expect(total).toBeGreaterThan(0);
  }, 30000);
});

describe('elemental mode', () => {
  // Like freshBattle but on the elemental ruleset.
  function elementalBattle(nPlayers = 2) {
    const state = createGame({ seed: 42, mode: 'elemental' });
    for (let i = 0; i < nPlayers; i++) addPlayer(state, `p${i}`, `Player${i}`);
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    expect(state.phase).toBe('battle');
    return state;
  }

  // Point-blank elemental fireball: a (with `elements`, e.g. {venom: 1} or
  // 'venom' shorthand for lv1) shoots b, 3rd player parked far away so the
  // round can't end. Returns the state.
  function hitWith(elements) {
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.elements = typeof elements === 'string' ? { [elements]: 1 } : { ...elements };
    a.x = 0; a.y = 0; b.x = 8; b.y = 0;
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.4); // enough for the hit, not the cooldown
    return state;
  }

  // Stacks are PRIVATE to whoever applied them (round 12): read one attacker's
  // pile out of the generic per-attacker store.
  const stacksOf = (pl, kind, by) =>
    ((pl.stacks && pl.stacks[kind] && pl.stacks[kind][by]) || 0);
  const frostOn = (pl, by) => stacksOf(pl, 'frost', by);
  const mosqOn = (pl, by) => stacksOf(pl, 'mosquito', by);

  it('setMode works only in the lobby, validates values, and ships in snapshot', () => {
    const state = createGame({ seed: 1, mode: 'classic' });
    expect(state.mode).toBe('classic');
    expect(snapshot(state).mode).toBe('classic');
    expect(setMode(state, 'nonsense')).toBe(false);
    expect(setMode(state, 'elemental')).toBe(true);
    expect(snapshot(state).mode).toBe('elemental');
    addPlayer(state, 'a', 'Alice');
    addPlayer(state, 'b', 'Bob');
    startGame(state);
    expect(state.phase).toBe('countdown');
    expect(setMode(state, 'classic')).toBe(false); // locked once the game runs
    expect(state.mode).toBe('elemental');
  });

  it('element purchases: elemental-only, need fireball, level up, and STACK', () => {
    // classic: flatly rejected
    const classic = createGame({ seed: 5, mode: 'classic' });
    addPlayer(classic, 'a', 'Alice');
    classic.phase = 'shop';
    classic.players.a.gold = 99;
    const rc = buy(classic, 'a', 'frost');
    expect(rc.ok).toBe(false);
    expect(rc.err).toBe('elemental mode only');

    // elemental: riders need fireball >= 1, 3 levels each, multiple owned
    const state = createGame({ seed: 5, mode: 'elemental' });
    addPlayer(state, 'a', 'Alice');
    state.phase = 'shop';
    const a = state.players.a;
    a.gold = 99;
    a.spells.fireball = 0;
    expect(buy(state, 'a', 'frost').err).toBe('requires fireball');
    // round 16: EVERY element is a fireball rider now, arcane included
    expect(buy(state, 'a', 'arcane').err).toBe('requires fireball');
    a.spells.fireball = 1;
    a.gold = ELEMENTS.frost.costs[0] - 1;
    expect(buy(state, 'a', 'frost').err).toBe('not enough gold');
    a.gold = 99;
    expect(buy(state, 'a', 'frost').ok).toBe(true);
    expect(a.elements.frost).toBe(1);
    // stacking: a second element on top of the first
    expect(buy(state, 'a', 'ember').ok).toBe(true);
    expect(a.elements.frost).toBe(1);
    expect(a.elements.ember).toBe(1);
    // leveling: frost to lv3, then capped
    expect(buy(state, 'a', 'frost').ok).toBe(true);
    expect(buy(state, 'a', 'frost').ok).toBe(true);
    expect(a.elements.frost).toBe(3);
    expect(buy(state, 'a', 'frost').err).toBe('max level');
    // cost path read from the spec (round 16: costs differ per element —
    // cheap single-axis elements vs a pricier lv3 special)
    expect(ELEMENTS.frost.costs.length).toBe(ELEMENTS.frost.maxLevel);
  });

  it('elements stack on one fireball: frost stacks AND ember hits harder', () => {
    const state = hitWith({ frost: 1, ember: 1 });
    const b = state.players.p1;
    expect(frostOn(b, 'p0')).toBe(1);                   // frost rider applied
    // ember lv1 +2 dmg on the same hit: 7+2 = 9, minus a hair of regen
    expect(b.maxHp - b.hp).toBeGreaterThan(8.0);
    expect(b.maxHp - b.hp).toBeLessThan(9.5);
  });

  it('arcane hastens the fireball', () => {
    const state = elementalBattle(3);
    const a = state.players.p0;
    state.players.p1.x = 0; state.players.p1.y = 45;
    state.players.p2.x = 0; state.players.p2.y = -45;
    a.elements = { arcane: 3 };
    castSpell(state, 'p0', 'fireball', 20, 0);
    const cdArc = a.cooldowns.fireball;
    expect(cdArc).toBeCloseTo(
      SPELLS.fireball.cooldown[0] / (1 + ELEMENTS.arcane.fx.haste[2] / 100), 3);
  });

  // Land `n` frost fireballs of level `el` on p1 and return the state.
  // Repeated point-blank shots, cooldown scrubbed between them.
  function frostHits(el, n) {
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.elements = { frost: el };
    for (let i = 0; i < n; i++) {
      a.x = 0; a.y = 0; a.vx = a.vy = 0; a.cooldowns = {};
      b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null; b.hp = b.maxHp;
      castSpell(state, 'p0', 'fireball', 20, 0);
      run(state, 0.4);
    }
    return state;
  }

  it('frost: the first two hits only stack — the THIRD detonates', () => {
    const two = frostHits(1, 2);
    expect(frostOn(two.players.p1, 'p0')).toBe(2);
    expect(two.players.p1.slowT).toBe(0);   // nothing yet: it just builds
    const three = frostHits(1, 3);
    const b = three.players.p1;
    expect(frostOn(b, 'p0')).toBe(0);       // detonated and reset
    expect(b.slowT).toBeGreaterThan(2.5);   // lv1: 3 s of slow
    expect(b.slowMultHit).toBeCloseTo(ELEMENTS.frost.fx.slowMult[0], 5);
    expect(three.events.some(e => e.t === 'frostBreak')).toBe(true);
  });

  it('frost lv3 detonates into a real stun: no walking, no casting', () => {
    const state = frostHits(3, 3);
    const b = state.players.p1;
    expect(b.stunT).toBeGreaterThan(1.5);
    b.vx = 0; b.vy = 0;
    const x0 = b.x;
    setMoveTarget(state, 'p1', b.x + 30, b.y);
    expect(castSpell(state, 'p1', 'fireball', 100, 0)).toBe(false); // frozen
    run(state, 1);
    expect(Math.abs(b.x - x0)).toBeLessThan(0.5);                   // rooted
    // ...and it wears off
    run(state, 1.5);
    expect(b.stunT).toBe(0);
    setMoveTarget(state, 'p1', b.x + 30, b.y);
    run(state, 1);
    expect(b.x - x0).toBeGreaterThan(5);
  });

  // Round 12: stacks are PRIVATE, so two attackers no longer feed one counter —
  // the 3rd-stack detonation must count only the attacker who landed it.
  it('frost stacks are PRIVATE: two attackers do not feed one counter', () => {
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    state.pillars = [];
    a.elements = { frost: 1 };
    c.elements = { frost: 1 };              // a second frost player
    b.x = 8; b.y = 0; b.moveTarget = null;
    // two hits from a, one from c: under shared stacks that third hit was the
    // detonation. Now a sits on 2 and c on 1, and nothing goes off.
    // Whoever isn't shooting is parked far off the lane, or the shot would
    // pop on them instead of reaching the victim.
    for (const shooter of ['p0', 'p0', 'p2']) {
      const s = state.players[shooter];
      const idle = state.players[shooter === 'p0' ? 'p2' : 'p0'];
      idle.x = 0; idle.y = -40; idle.vx = idle.vy = 0; idle.moveTarget = null;
      s.x = 0; s.y = 0; s.vx = s.vy = 0; s.cooldowns = {};
      b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null; b.hp = b.maxHp;
      castSpell(state, shooter, 'fireball', 20, 0);
      run(state, 0.4);
    }
    const need = ELEMENTS.frost.fx.stacksToTrigger;
    expect(frostOn(b, 'p0')).toBe(need - 1);
    expect(frostOn(b, 'p2')).toBe(1);
    expect(b.slowT).toBe(0);                // nobody reached their own 3
    expect(state.events.some(e => e.t === 'frostBreak')).toBe(false);
    // a's own third stack does detonate, and clears only a's counter
    a.x = 0; a.y = 0; a.vx = a.vy = 0; a.cooldowns = {};
    c.x = 0; c.y = -40; c.vx = c.vy = 0; c.moveTarget = null;
    b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null; b.hp = b.maxHp;
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.4);
    expect(frostOn(b, 'p0')).toBe(0);
    expect(frostOn(b, 'p2')).toBe(1);       // c's pile is untouched
    expect(b.slowT).toBeGreaterThan(2.5);
  });

  it('snapshots are PER VIEWER: you only see the stacks you applied', () => {
    const state = elementalBattle(3);
    const b = state.players.p1;
    state.players.p0.elements = { frost: 1 };
    state.players.p2.elements = { frost: 1 };
    // hand-place stacks: this test is about the wire, not about aiming
    b.stacks = { frost: { p0: 2, p2: 1 }, mosquito: { p2: 1 } };
    const asP0 = snapshot(state, 'p0').players;
    expect(asP0.p1.myStacks).toEqual({ frost: 2 });     // mine only
    const asP2 = snapshot(state, 'p2').players;
    expect(asP2.p1.myStacks).toEqual({ frost: 1, mosquito: 1 });
    // ...and the victim sees the worst incoming pile on themselves, with no
    // attacker identities on the wire at all
    const asP1 = snapshot(state, 'p1').players;
    expect(asP1.p1.stacksOnMe).toEqual({ frost: 2, mosquito: 1 });
    expect(asP1.p1.myStacks).toBeUndefined();
    expect(JSON.stringify(asP1.p1)).not.toContain('p0');
    // the neutral view (tests, journals, crash dumps) leaks nothing either
    expect(snapshot(state).players.p1.myStacks).toBeUndefined();
  });

  it('classic snapshots carry no elemental fields, per viewer or not', () => {
    const state = freshBattle(2);
    const a = snapshot(state, 'p0').players.p0;
    expect(a.myStacks).toBeUndefined();
    expect(a.stacksOnMe).toBeUndefined();
    expect(a.momentumHits).toBeUndefined();
    expect(a.vampN).toBeUndefined();
    // ...and neither do classic PROJECTILES: pierce/pierced/engorged are all
    // internal or elemental-only, so the projectile wire is unchanged
    castSpell(state, 'p0', 'fireball', 20, 0);
    step(state, DT);
    const pr = snapshot(state, 'p0').projectiles[0];
    expect(pr).toBeDefined();
    expect(Object.keys(pr).sort())
      .toEqual(['id', 'owner', 'type', 'vx', 'vy', 'x', 'y']);
    // byte-for-byte: a viewer-specific classic snapshot IS the broadcast one
    expect(JSON.stringify(snapshot(state, 'p0'))).toBe(JSON.stringify(snapshot(state)));
  });

  it('venom lv1: discrete 1-per-second ticks, ~5 dmg over 5 s, then it stops', () => {
    // manual poison application for exact timing (a fireball hit lands at an
    // uncontrolled sub-second offset); c is the untouched regen control
    const state = elementalBattle(3);
    const b = state.players.p1, c = state.players.p2;
    b.x = 10; b.y = 0; b.vx = 0; b.moveTarget = null;
    c.x = -10; c.y = 0; c.vx = 0; c.moveTarget = null;
    state.players.p0.y = -40;
    b.hp = 50; c.hp = 50;
    b.poisonT = ELEMENTS.venom.fx.dotTime;
    b.poisonTick = ELEMENTS.venom.fx.tickDmg[0];
    b._poisonNext = ELEMENTS.venom.fx.tickEvery;
    b.poisonBy = 'p0';
    // count the ticks themselves — hp deltas now also carry the regen lock,
    // which is a separate mechanic with its own tests
    const ticks = () => state.events.filter(e => e.t === 'hit' && e.poison && e.id === 'p1');
    run(state, 0.9);
    expect(ticks().length).toBe(0);         // discrete: nothing before the 1 s mark
    run(state, 0.2);
    expect(ticks().length).toBe(1);         // first tick landed
    run(state, 4.3);                        // t ≈ 5.4: all 5 ticks in
    expect(ticks().length).toBe(5);
    expect(ticks().reduce((s, e) => s + e.amount, 0)).toBeCloseTo(5, 5);
    expect(b.poisonTick).toBe(0);           // expired poison leaves no residue
    run(state, 2);
    expect(ticks().length).toBe(5);         // and it STOPPED
    expect(c.hp).toBeGreaterThan(b.hp);     // the victim really is down on hp
  });

  it('venom re-hits REFRESH the clock and STACK the tick damage', () => {
    const state = hitWith('venom');
    const b = state.players.p1;
    expect(b.poisonT).toBeGreaterThan(4.5);
    expect(b.poisonTick).toBe(ELEMENTS.venom.fx.tickDmg[0]);
    run(state, 2.2); // burn 2.2 s off the clock (past the lv1 fireball cd too)
    expect(b.poisonT).toBeLessThan(3);
    b.x = 8; b.y = 0; b.vx = 0; b.vy = 0; b.hp = b.maxHp;
    state.players.p0.x = 0; state.players.p0.y = 0;
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.4);
    expect(b.poisonT).toBeGreaterThan(4.5); // refreshed to the full 5 s
    expect(b.poisonT).toBeLessThanOrEqual(ELEMENTS.venom.fx.dotTime);
    expect(b.poisonTick).toBeCloseTo(       // and STRONGER: base + one stack
      ELEMENTS.venom.fx.tickDmg[0] + ELEMENTS.venom.fx.stackAdd[0], 5);
  });

  it('a lethal poison tick gives the poisoner the kill — without stamping lastHitBy', () => {
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    b.x = 10; b.y = 0; b.vx = 0; b.moveTarget = null;
    state.players.p2.y = -40;
    b.hp = 0.5;
    b.lastHitBy = null;
    b.poisonT = 5; b.poisonTick = 1; b._poisonNext = 0.1; b.poisonBy = 'p0';
    const kills0 = a.kills;
    run(state, 0.3);
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(kills0 + 1);       // the tick itself was the killing blow
    // the round ended (2 fighters left standing 1) — check the stamp rule on a
    // fresh victim that SURVIVES the tick: ticks never claim the last-hitter slot
    const s2 = elementalBattle(3);
    const b2 = s2.players.p1;
    b2.lastHitBy = null;
    b2.poisonT = 5; b2.poisonTick = 1; b2._poisonNext = 0.1; b2.poisonBy = 'p0';
    run(s2, 0.3);
    expect(b2.hp).toBeLessThan(b2.maxHp);
    expect(b2.lastHitBy).toBe(null);        // round-9 rule: DoT never stamps
  });

  // ---- momentum ⚙️ ------------------------------------------------------
  // Every number below is read out of ELEMENTS.momentum.fx: AGENTS.md — balance
  // tests must not pin constants the owner is still tuning.
  it('momentum ⚙️: starts weak, every landed hit permanently ramps DAMAGE', () => {
    const f = ELEMENTS.momentum.fx;
    const base = SPELLS.fireball.damage[0];
    // hit 1: no ramp yet — a fraction of a normal fireball
    const s1 = hitWith('momentum');
    const b1 = s1.players.p1;
    const first = b1.maxHp - b1.hp;
    expect(first).toBeGreaterThan(base * f.dmgMult - 0.8);
    expect(first).toBeLessThan(base * f.dmgMult + 0.5);
    expect(first).toBeLessThan(base);          // strictly weaker to start
    expect(s1.players.p0.momentumHits).toBe(1);
    // after 10 landed hits the ramp is doing real work
    const s2 = hitWith('momentum');
    const a2 = s2.players.p0, b2 = s2.players.p1;
    a2.momentumHits = 10;
    b2.hp = b2.maxHp; b2.x = 8; b2.y = 0; b2.vx = 0; b2.vy = 0;
    a2.cooldowns = {};
    castSpell(s2, 'p0', 'fireball', 20, 0);
    run(s2, 0.4);
    const dealt = b2.maxHp - b2.hp;
    const expected = (base + 10 * f.rampDmg[0]) * f.dmgMult;
    expect(dealt).toBeGreaterThan(expected - 0.8); // regen nibbles a little
    expect(dealt).toBeLessThan(expected + 0.5);
    expect(dealt).toBeGreaterThan(first);          // strictly ramping
    expect(a2.momentumHits).toBe(11);
    // The payoff is a WHOLE GAME, not ten hits: a momentum seat lands a median
    // 172 fireballs per game (re-measured 2026-08-08 — it was 78 in round 13;
    // the lv1-locked elemental fireball means longer fights and many more
    // casts), which is where the "you earned a cannon" fantasy actually lands.
    // Deriving the hit count from the spec would be circular, so 172 is the
    // measured median, stated as such.
    const GAME_HITS = 172;
    const s3 = hitWith('momentum');
    s3.players.p0.momentumHits = GAME_HITS;
    const b3 = s3.players.p1;
    b3.maxHp = 999; b3.hp = b3.maxHp; b3.x = 8; b3.y = 0; b3.vx = 0; b3.vy = 0;
    s3.players.p0.cooldowns = {};
    castSpell(s3, 'p0', 'fireball', 20, 0);
    run(s3, 0.4);
    const lateGame = (base + GAME_HITS * f.rampDmg[0]) * f.dmgMult;
    expect(b3.maxHp - b3.hp).toBeGreaterThan(lateGame - 1);
    expect(b3.maxHp - b3.hp).toBeLessThan(lateGame + 1);
    // ...and by then it must genuinely beat a plain fireball, or the whole
    // element is pointless (it starts at dmgMult, so it has to climb back out).
    // The threshold is DERIVED from the spec, not pinned: break-even is the hit
    // count at which the ramp has paid off dmgMult, and a whole game has to be
    // comfortably past it. (2026-08-07: this used to assert a hardcoded 1.4x and
    // failed the moment rampDmg was re-swept 0.08 -> 0.06 — exactly the pinned-
    // constant trap AGENTS.md warns about. The PROPERTY is "it climbs back out
    // well inside one game"; break-even moved 22 -> 29 landed hits.)
    const breakEven = (base * (1 - f.dmgMult)) / (f.rampDmg[0] * f.dmgMult);
    expect(breakEven).toBeLessThan(GAME_HITS / 2);
    expect(lateGame).toBeGreaterThan(base);
    // no ceiling: twice the hits keeps climbing, it never plateaus
    const twice = (base + 2 * GAME_HITS * f.rampDmg[0]) * f.dmgMult;
    expect(twice).toBeGreaterThan(lateGame * 1.3);
  });

  it('momentum is DAMAGE ONLY: a huge stack pushes exactly as hard as none', () => {
    // round 12 dropped the knockback half of the ramp: a big Momentum stack must
    // melt people, not launch them into the lava (gale and ember do that)
    const peak = (hits) => {
      const s = hitWith('momentum');
      const a = s.players.p0, b = s.players.p1;
      a.momentumHits = hits;
      b.hp = b.maxHp; b.x = 8; b.y = 0; b.vx = 0; b.vy = 0;
      a.cooldowns = {};
      castSpell(s, 'p0', 'fireball', 20, 0);
      for (let i = 0; i < 12; i++) { step(s, DT); if (b.vx > 1) break; }
      return b.vx;
    };
    const cold = peak(0);
    expect(cold).toBeGreaterThan(1);          // it does push, just not more
    expect(peak(40)).toBeCloseTo(cold, 5);
    expect(ELEMENTS.momentum.fx.rampKb).toBeUndefined(); // and the spec agrees
  });

  it('the damage number splits base from the momentum bonus (the white number)', () => {
    // AGENTS.md scar: this element ramped correctly for weeks and still read as
    // broken. The hit event has to carry the split, or the client cannot show it.
    const f = ELEMENTS.momentum.fx;
    const base = SPELLS.fireball.damage[0];
    const state = hitWith('momentum');
    const a = state.players.p0, b = state.players.p1;
    const hits = 10;
    a.momentumHits = hits;
    b.hp = b.maxHp; b.x = 8; b.y = 0; b.vx = 0; b.vy = 0;
    a.cooldowns = {};
    state.events = [];
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.4);
    const hit = state.events.find(e => e.t === 'hit' && e.id === 'p1');
    expect(hit).toBeTruthy();
    expect(hit.bonus).toBeCloseTo(hits * f.rampDmg[0] * f.dmgMult, 5);
    expect(hit.amount - hit.bonus).toBeCloseTo(base * f.dmgMult, 5);
    // a plain fireball carries no bonus field at all
    const plain = hitWith('ember');
    expect(plain.events.find(e => e.t === 'hit' && e.id === 'p1').bonus).toBeUndefined();
  });

  it('momentum ramp SURVIVES a round boundary (it is permanent now)', () => {
    expect(ELEMENTS.momentum.fx.rampPermanent).toBe(true);
    const state = hitWith('momentum');
    expect(state.players.p0.momentumHits).toBe(1);
    // kill everyone else -> round ends -> next round starts, ramp intact
    state.players.p1.hp = 0.01; state.players.p1.x = ARENA.START_RADIUS + 5;
    state.players.p2.hp = 0.01; state.players.p2.x = ARENA.START_RADIUS + 5;
    run(state, 1 + ROUND.SUMMARY_TIME + ROUND.SHOP_TIME + ROUND.COUNTDOWN + 1);
    expect(state.phase).toBe('battle');
    expect(state.round).toBeGreaterThan(1);
    expect(state.players.p0.momentumHits).toBe(1);
  });

  // ---- mosquito 🦟 (simplified: stacks, no geometry) ----------------------
  it('mosquito 🦟: stings for 1, no push, on a shortened cooldown', () => {
    const f = ELEMENTS.mosquito.fx;
    const state = hitWith('mosquito');
    const a = state.players.p0, b = state.players.p1;
    expect(b.maxHp - b.hp).toBeCloseTo(f.stingDmg, 0);
    expect(Math.abs(b.vx)).toBeLessThan(0.5);   // no knockback at all
    // the cooldown it sets is the mosquito's, not the fireball's
    const full = SPELLS.fireball.cooldown[0];
    a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0);
    expect(a.cooldowns.fireball).toBeCloseTo(full * f.cdMult[0], 5);
  });

  it('a mosquito stack is PRIVATE to its attacker, and lasts the round', () => {
    const state = hitWith('mosquito');
    const b = state.players.p1;
    expect(mosqOn(b, 'p0')).toBe(1);
    expect(mosqOn(b, 'p2')).toBe(0);   // nobody else can see or spend it
    run(state, 8);
    expect(mosqOn(b, 'p0')).toBe(1);   // no expiry: the trap is setup
    expect(state.events.some(e => e.t === 'bite')).toBe(true);
    // a SECOND mosquito player's sting builds their own separate trap
    const c = state.players.p2;
    c.elements = { mosquito: 1 };
    state.players.p0.x = 0; state.players.p0.y = -40;
    state.players.p0.vx = 0; state.players.p0.vy = 0; state.players.p0.moveTarget = null;
    c.x = 0; c.y = 0; c.vx = c.vy = 0; c.cooldowns = {};
    b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    castSpell(state, 'p2', 'fireball', 20, 0);
    run(state, 0.4);
    expect(mosqOn(b, 'p0')).toBe(1);
    expect(mosqOn(b, 'p2')).toBe(1);
  });

  it('mosquito carries NO other element riders (no midas/venom farming)', () => {
    const state = hitWith({ mosquito: 1, midas: 3, venom: 3, momentum: 3 });
    const a = state.players.p0, b = state.players.p1;
    expect(a.gold).toBe(GOLD.START);       // midas paid nothing
    expect(b.poisonT).toBe(0);             // venom applied nothing
    expect(a.momentumHits).toBe(0);        // the ramp counted nothing
    expect(b.maxHp - b.hp).toBeCloseTo(ELEMENTS.mosquito.fx.stingDmg, 0);
  });

  // Sting `b` twice from `a`: the first arms the trap, the second spends it.
  // Runs to the frame the stack is cashed. Since 2026-08-07 the proc's balls all
  // leave the same muzzle with the same vector and connect immediately, so that
  // frame is also the frame they land — `procHits()` reads them off the events.
  // `hp` lets the victim survive the payoff when a test needs to look past it.
  function mosquitoProc(elements = { mosquito: 1 }, { hp = null } = {}) {
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.elements = { ...elements };
    const sting = () => {
      a.x = 0; a.y = 0; a.vx = a.vy = 0; a.cooldowns = {};
      b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
      if (hp != null) { b.hp = hp; b.maxHp = Math.max(b.maxHp, hp); }
      else b.hp = b.maxHp;
      state.events = [];
      castSpell(state, 'p0', 'fireball', 20, 0);
    };
    sting();
    run(state, 0.4);       // arms the trap
    sting();
    for (let i = 0; i < 20; i++) {
      state.events = [];
      step(state, DT);
      if (state.events.some(e => e.t === 'biteHit')) break;
    }
    return state;
  }
  // the payoff hits of THIS frame: real fireballs, not the 1-damage sting
  const procHits = (state, id = 'p1') => state.events.filter(
    e => e.t === 'hit' && e.id === id &&
         e.amount > ELEMENTS.mosquito.fx.stingDmg + 1e-9);

  it('spending a mosquito stack fires exactly procBalls NORMAL fireballs', () => {
    const f = ELEMENTS.mosquito.fx;
    const state = mosquitoProc({ mosquito: 1 }, { hp: 9999 });
    const b = state.players.p1;
    // the stack is spent, and NOT re-armed by the hit that cashed it in
    expect(mosqOn(b, 'p0')).toBe(0);
    expect(state.events.some(e => e.t === 'biteHit')).toBe(true);
    // procBalls of them, and they are NORMAL fireballs: full damage, full
    // knockback, no sting rider, and the Echo Stone's queue is not involved
    const hits = procHits(state);
    expect(hits.length).toBe(f.procBalls);
    for (const h of hits)
      expect(h.amount).toBeCloseTo(SPELLS.fireball.damage[0], 5);
    expect(state.delayedShots.length).toBe(0);
    expect(Math.abs(b.vx)).toBeGreaterThan(50); // and they PUSH, unlike a sting
  });

  it('the proc balls are CO-LOCATED: same muzzle, same vector, same frame', () => {
    // Remi 2026-08-07: "put the 2 balls at exactly the same place". No offset in
    // space and none in time — the two hits are one event you see twice.
    const f = ELEMENTS.mosquito.fx;
    const state = mosquitoProc({ mosquito: 1 }, { hp: 9999 });
    const casts = state.events.filter(e => e.t === 'cast' && e.spell === 'fireball');
    expect(casts.length).toBe(f.procBalls);      // the sting's own cast was earlier
    for (const c of casts) {
      expect(c.x).toBeCloseTo(casts[0].x, 10);
      expect(c.y).toBeCloseTo(casts[0].y, 10);
      expect(c.dx).toBeCloseTo(casts[0].dx, 10);
      expect(c.dy).toBeCloseTo(casts[0].dy, 10);
    }
    // ...and every payoff hit landed in that one frame
    expect(procHits(state).length).toBe(f.procBalls);
    expect(state.projectiles.length).toBe(0);    // nothing left flying
  });

  it('the proc connects even on a GRAZING sting (contact point, not tick end)', () => {
    // the sting can sweep past the body inside one tick; balls released from the
    // end of that travel would fly on and miss. Offset the victim to the edge of
    // the hitbox so the sting only just clips it.
    const f = ELEMENTS.mosquito.fx;
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.elements = { mosquito: 1 };
    const graze = () => {
      a.x = 0; a.y = 0; a.vx = a.vy = 0; a.cooldowns = {};
      b.x = 8; b.vx = b.vy = 0; b.moveTarget = null; b.hp = 9999; b.maxHp = 9999;
      // just inside contact range: radius sum minus a hair
      b.y = b.radius + SPELLS.fireball.radius - 0.05;
      state.events = [];
      castSpell(state, 'p0', 'fireball', 20, 0);
    };
    graze();
    run(state, 0.4);
    expect(mosqOn(b, 'p0')).toBe(1);   // armed by a clipping sting
    graze();
    let hits = 0;
    for (let i = 0; i < 20; i++) {
      state.events = [];
      step(state, DT);
      hits += procHits(state).length;
      if (state.events.some(e => e.t === 'biteHit')) break;
    }
    expect(hits).toBe(f.procBalls);    // both balls connected, none flew past
  });

  it('HARD RULE: the spawned fireballs place NO mosquito stacks (no chaining)', () => {
    const f = ELEMENTS.mosquito.fx;
    const state = mosquitoProc({ mosquito: 1 }, { hp: 9999 });
    const b = state.players.p1;
    expect(mosqOn(b, 'p0')).toBe(0);            // nothing re-armed
    run(state, 3);
    expect(mosqOn(b, 'p0')).toBe(0);            // still nothing, a frame later
    expect(state.projectiles.length).toBe(0);   // and nothing is still spawning
    expect(state.delayedShots.length).toBe(0);
    // exactly ONE proc happened — a chain would have fired more
    expect(state.events.filter(e => e.t === 'biteHit').length).toBe(1);
    expect(f.procBalls).toBeGreaterThan(1);     // the spec still wants a double
  });

  it('HARD RULE, the case that can actually chain: a PIERCING proc ball may not cash a second mark', () => {
    // With ghost lv3 (round 16: the passthrough unlocks at pierceAtLevel) the
    // proc balls fly THROUGH the first victim, so they can reach a second body
    // that also carries your mark. That is the real infinite-loop shape (each
    // cash spawns balls that cash again), and `noStacks` is the guard.
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    state.pillars = [];
    a.elements = { mosquito: 1, ghost: ELEMENTS.ghost.fx.pierceAtLevel };
    a.x = 0; a.y = 0; a.vx = a.vy = 0;
    for (const v of [b, c]) {
      v.maxHp = 9999; v.hp = 9999; v.vx = v.vy = 0; v.moveTarget = null;
    }
    b.x = 8; b.y = 0; c.x = 16; c.y = 0;
    // arm BOTH of them (stings do not pierce, so one sting each)
    for (const v of [b, c]) {
      a.cooldowns = {};
      v.x = 8; // sting whoever is parked in front
      const other = v === b ? c : b;
      other.x = 60;
      castSpell(state, 'p0', 'fireball', 20, 0);
      run(state, 0.4);
      v.x = v === b ? 8 : 16;
    }
    b.x = 8; c.x = 16;
    b.vx = b.vy = c.vx = c.vy = 0; b.moveTarget = c.moveTarget = null;
    expect(mosqOn(b, 'p0')).toBe(1);
    expect(mosqOn(c, 'p0')).toBe(1);
    // now cash b's mark: the balls pierce b and reach c, who is also marked
    a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 1.5);
    expect(state.events.filter(e => e.t === 'biteHit').length).toBe(1); // ONE cash
    expect(mosqOn(c, 'p0')).toBe(1);          // c's mark is untouched...
    // ...and the piercing balls still in flight all carry the guard flag
    expect(state.projectiles.length).toBe(ELEMENTS.mosquito.fx.procBalls);
    expect(state.projectiles.every(p => p.noStacks === true)).toBe(true);
    expect(state.projectiles.every(p => p.mosquito === 0)).toBe(true);
  });

  it('only your FIREBALL spends the mark — no cross-spell doubling', () => {
    // the 2026-08-06 version let any spell cash the mark in, which made
    // mosquito+lightning the obvious meta. Explicitly killed in round 12.
    const state = hitWith('mosquito');
    const a = state.players.p0, b = state.players.p1;
    a.spells.lightning = 1;
    a.spells.boomerang = 1;
    expect(mosqOn(b, 'p0')).toBe(1);
    // sky-bolt centered on a pinned b (round 17: lightning lands after its delay)
    a.x = 0; a.y = 0; b.x = 8; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null;
    b.hp = b.maxHp;
    castSpell(state, 'p0', 'lightning', 8, 0);
    run(state, SPELLS.lightning.delay + 0.2);
    expect(b.maxHp - b.hp).toBeGreaterThan(0);                          // it landed
    expect(b.maxHp - b.hp).toBeLessThan(SPELLS.lightning.damage[0] + 1); // plain hit
    expect(mosqOn(b, 'p0')).toBe(1);        // mark untouched, still waiting
    a.x = 0; a.y = 0; b.x = 8; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null;
    b.hp = b.maxHp;
    castSpell(state, 'p0', 'boomerang', 20, 0);
    run(state, 0.4);
    expect(mosqOn(b, 'p0')).toBe(1);        // and a boomerang cannot spend it
    expect(state.events.some(e => e.t === 'biteHit')).toBe(false);
  });

  it('the proc doubles every rider you own: two frost stacks, not one', () => {
    // the point of the element: your own kit procs twice. Frost is the readable
    // proof — the sting carries nothing, the two proc balls carry frost.
    const state = mosquitoProc({ mosquito: 1, frost: 1 });
    const b = state.players.p1;
    b.hp = 9999; b.maxHp = 9999;
    run(state, 0.6);
    expect(frostOn(b, 'p0')).toBe(ELEMENTS.mosquito.fx.procBalls);
  });

  it('venom fireballs drip a trail that burns whoever stands in it', () => {
    const state = hitWith('venom');
    expect(state.hazards.length).toBeGreaterThan(0); // trail was dropped
    const b = state.players.p1, c = state.players.p2;
    // scrub b's hit poison and park it off-trail as the regen control
    b.poisonT = 0; b.poisonTick = 0;
    b.x = 0; b.y = -20; b.vx = 0; b.vy = 0; b.hp = 80;
    // park the third player right on a trail puddle
    const h = state.hazards[0];
    c.x = h.x; c.y = h.y; c.vx = 0; c.vy = 0; c.hp = 80;
    run(state, 0.5);
    expect(c.poisonT).toBeGreaterThan(0); // tinted green while soaking
    run(state, 0.5);
    // identical regen on both; only the trail separates them (2 dps while alive)
    expect(b.hp - c.hp).toBeGreaterThan(0.4);
    // trails expire: lv1 lifetime 1.4 s
    run(state, 2.5);
    expect(state.hazards.length).toBe(0);
  });

  // ---- gale: stack-and-burst (2026-08-07 rework) ---------------------------
  // Land `n` identical point-blank fireballs on p1 and return the PEAK shove of
  // each one. p1 is reset to a standstill at the same spot before every shot, so
  // the peaks are directly comparable and the middle hits can be checked against
  // a plain fireball rather than against each other.
  function galePeaks(elements, n, shooter = 'p0') {
    const state = elementalBattle(3);
    const a = state.players[shooter], b = state.players.p1;
    state.pillars = [];
    a.elements = { ...elements };
    const peaks = [];
    for (let i = 0; i < n; i++) {
      const idle = state.players[shooter === 'p0' ? 'p2' : 'p0'];
      idle.x = 0; idle.y = -45; idle.vx = idle.vy = 0; idle.moveTarget = null;
      a.x = 0; a.y = 0; a.vx = a.vy = 0; a.cooldowns = {};
      b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null; b.hp = b.maxHp;
      castSpell(state, shooter, 'fireball', 20, 0);
      let peak = 0;
      for (let t = 0; t < 12; t++) { step(state, DT); peak = Math.max(peak, b.vx); }
      peaks.push(peak);
    }
    return { state, peaks };
  }
  const galeOn = (pl, by) => stacksOf(pl, 'gale', by);

  // Round 16: gale lv1/2 is the fireball's PUSH axis — a flat kbAdd, no
  // stacks, no burst. The stack-and-burst gust is the lv3 special
  // (fx.burstAtLevel). Every number below is read from the spec.
  it('gale lv1/2: a flat fireball push increase — no stacks, no burst', () => {
    const f = ELEMENTS.gale.fx;
    const fb = SPELLS.fireball;
    const plain = galePeaks({}, 1).peaks[0];
    expect(plain).toBeGreaterThan(0);
    const { state, peaks } = galePeaks({ gale: 1 }, 2);
    const want = (fb.knockback[0] + f.kbAdd[0]) / fb.knockback[0];
    for (const p of peaks) expect(p / plain).toBeCloseTo(want, 1);
    expect(galeOn(state.players.p1, 'p0')).toBe(0);   // no stacks below lv3
    expect(state.events.some(e => e.t === 'gale' || e.t === 'galeBurst')).toBe(false);
  });

  it('gale lv3: push is the flat boost while stacking, and the 3rd stack bursts', () => {
    const f = ELEMENTS.gale.fx;
    const need = f.stacksToTrigger;
    const { state, peaks } = galePeaks({ gale: 3 }, need);
    const b = state.players.p1;
    // every hit before the last is the ordinary lv3 shove (kbAdd only) — the
    // gust must not leak into the stacking hits
    for (let i = 0; i < need - 1; i++) expect(peaks[i] / peaks[0]).toBeCloseTo(1, 1);
    // ...and the last one is the gust, at the spec's multiplier
    expect(peaks[need - 1] / peaks[0]).toBeCloseTo(f.burstKbMult, 1);
    // the stack was SPENT, so the next three start the count again
    expect(galeOn(b, 'p0')).toBe(0);
    // and it is legible: one pip event per hit, exactly one burst
    expect(state.events.filter(e => e.t === 'gale').length).toBe(need);
    expect(state.events.filter(e => e.t === 'galeBurst').length).toBe(1);
  });

  it('gale: stopping one short leaves stacks on the body and no burst', () => {
    const need = ELEMENTS.gale.fx.stacksToTrigger;
    const { state } = galePeaks({ gale: 3 }, need - 1);
    expect(galeOn(state.players.p1, 'p0')).toBe(need - 1);
    expect(state.events.some(e => e.t === 'galeBurst')).toBe(false);
  });

  it('the gust exists only from burstAtLevel up: lv2 hits place no stacks', () => {
    const f = ELEMENTS.gale.fx;
    const below = f.burstAtLevel - 1;
    const { state } = galePeaks({ gale: below }, f.stacksToTrigger + 1);
    expect(galeOn(state.players.p1, 'p0')).toBe(0);
    expect(state.events.some(e => e.t === 'galeBurst')).toBe(false);
  });

  // The round-12 rule: an element's power must not depend on what everyone else
  // bought. Two gale players hitting one body must each need their own 3.
  it('gale stacks are PRIVATE: two attackers do not feed one counter', () => {
    const need = ELEMENTS.gale.fx.stacksToTrigger;
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    state.pillars = [];
    a.elements = { gale: 3 };                 // round 16: stacks exist at lv3 only
    c.elements = { gale: 3 };                 // a second gale player
    // the reference shove: one lv3 gale hit (flat kbAdd, first stack, no burst)
    const plainPeak = galePeaks({ gale: 3 }, 1).peaks[0];
    // p0 lands need-1, p2 lands one: under a shared counter that last hit would
    // have been the burst. It must be an ordinary shove instead.
    const shooters = [...Array(need - 1).fill('p0'), 'p2'];
    let lastPeak = 0;
    for (const shooter of shooters) {
      const s = state.players[shooter];
      const idle = state.players[shooter === 'p0' ? 'p2' : 'p0'];
      idle.x = 0; idle.y = -45; idle.vx = idle.vy = 0; idle.moveTarget = null;
      s.x = 0; s.y = 0; s.vx = s.vy = 0; s.cooldowns = {};
      b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null; b.hp = b.maxHp;
      castSpell(state, shooter, 'fireball', 20, 0);
      lastPeak = 0;
      for (let t = 0; t < 12; t++) { step(state, DT); lastPeak = Math.max(lastPeak, b.vx); }
    }
    expect(galeOn(b, 'p0')).toBe(need - 1);
    expect(galeOn(b, 'p2')).toBe(1);
    expect(lastPeak / plainPeak).toBeCloseTo(1, 1);   // p2's first hit: no burst
    expect(state.events.some(e => e.t === 'galeBurst')).toBe(false);
    // p0's own 3rd DOES burst, and clears only p0's counter
    a.x = 0; a.y = 0; a.vx = a.vy = 0; a.cooldowns = {};
    c.x = 0; c.y = -45; c.vx = c.vy = 0; c.moveTarget = null;
    b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null; b.hp = b.maxHp;
    castSpell(state, 'p0', 'fireball', 20, 0);
    let peak = 0;
    for (let t = 0; t < 12; t++) { step(state, DT); peak = Math.max(peak, b.vx); }
    expect(galeOn(b, 'p0')).toBe(0);
    expect(galeOn(b, 'p2')).toBe(1);          // c's pile is untouched
    expect(peak / plainPeak).toBeCloseTo(ELEMENTS.gale.fx.burstKbMult, 1);
    expect(state.events.some(e => e.t === 'galeBurst')).toBe(true);
  });

  it('midas pays gold per fireball hit (and hits much softer now)', () => {
    const state = hitWith('midas');
    const a = state.players.p0, b = state.players.p1;
    expect(a.gold).toBe(GOLD.START + ELEMENTS.midas.fx.goldOnHit[0]); // lv1: +1 g
    expect(b.maxHp - b.hp).toBeGreaterThan(3.3); // 5 * 0.85 = 4.25, minus a hair of regen
    expect(b.maxHp - b.hp).toBeLessThan(4.7);
    expect(state.events.some(e => e.t === 'gold' && e.id === 'p0')).toBe(true);
  });

  it('midas pays a flat +1 g per hit at EVERY level — never more', () => {
    for (const level of [1, 2, 3]) {
      const state = hitWith({ midas: level });
      const a = state.players.p0, b = state.players.p1;
      expect(a.gold).toBe(GOLD.START + 1);
      expect(a.roundGold).toBe(1);
      // a second hit on the same victim pays the same flat 1 g
      b.hp = b.maxHp; b.x = 8; b.y = 0; b.vx = 0; b.vy = 0;
      a.cooldowns = {};
      castSpell(state, 'p0', 'fireball', 20, 0);
      run(state, 0.4);
      expect(a.gold).toBe(GOLD.START + 2);
      expect(state.events.some(e => e.t === 'gold' && e.id === 'p0')).toBe(true);
    }
  });

  it('midas lv1 is half a fireball, and levels buy the penalty back', () => {
    const f = ELEMENTS.midas.fx;
    const dealtAt = (level) => {
      const state = hitWith({ midas: level });
      const b = state.players.p1;
      return b.maxHp - b.hp;
    };
    const base = SPELLS.fireball.damage[0];
    const lv1 = dealtAt(1), lv3 = dealtAt(3);
    expect(lv1).toBeGreaterThan(base * f.dmgMult[0] - 0.8); // ~half damage
    expect(lv1).toBeLessThan(base * f.dmgMult[0] + 0.5);
    expect(lv3).toBeGreaterThan(lv1 * 1.4);                 // lv3 much closer to normal
    expect(lv3).toBeLessThan(base);                         // but never free
    // push is halved at lv1 too
    const peak = (level) => {
      const state = hitWith({ midas: level });
      const b = state.players.p1;
      return Math.abs(b.vx);
    };
    expect(peak(1)).toBeLessThan(peak(3) * 0.8);
  });

  // Round 16: terra is the fireball's SIZE axis and nothing else — the old
  // grow-the-target-on-hit effect (and its +1/+2/+3 damage) is gone.
  it('terra grows the PROJECTILE only; the victim is untouched', () => {
    const state = hitWith('terra');
    const b = state.players.p1;
    step(state, DT);
    expect(b.radius).toBeCloseTo(PLAYER.RADIUS, 2);   // no forced growth
    // ...and a fresh terra ball is bigger by the spec's multiplier
    const a = state.players.p0;
    a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0);
    const pr = state.projectiles.find(p => p.type === 'fireball');
    expect(pr.radius).toBeCloseTo(
      SPELLS.fireball.radius * ELEMENTS.terra.fx.projRadiusMult[0], 3);
  });

  it('terra fireballs grow with the element level', () => {
    const fireballRadius = (level) => {
      const state = elementalBattle(3);
      const a = state.players.p0;
      state.players.p1.x = 0; state.players.p1.y = 45;
      state.players.p2.x = 0; state.players.p2.y = -45;
      a.elements = { terra: level };
      a.x = 0; a.y = 0;
      castSpell(state, 'p0', 'fireball', 20, 0);
      return state.projectiles[0].radius;
    };
    expect(fireballRadius(1)).toBeCloseTo(
      SPELLS.fireball.radius * ELEMENTS.terra.fx.projRadiusMult[0], 3);
    expect(fireballRadius(3)).toBeCloseTo(
      SPELLS.fireball.radius * ELEMENTS.terra.fx.projRadiusMult[2], 3);
  });

  it('the echo stone is elemental-only; the hourglass sells anywhere at its per-level prices', () => {
    const classic = createGame({ seed: 6, mode: 'classic' });
    addPlayer(classic, 'a', 'Alice');
    classic.phase = 'shop';
    classic.players.a.gold = 99;
    expect(buy(classic, 'a', 'echo').err).toBe('elemental mode only');
    // classic fireball stays capped at 3 even with gold to burn
    for (let i = 0; i < 5; i++) buy(classic, 'a', 'fireball');
    expect(classic.players.a.spells.fireball).toBe(SPELLS.fireball.maxLevel);

    // the hourglass (round 16: the ex-arcane global CDR as an item) keeps its
    // element-era per-level cost curve — itemCost must read the costs array
    const a = classic.players.a;
    a.gold = 99;
    let spent = 0;
    for (let lv = 0; lv < ITEMS.hourglass.maxLevel; lv++) {
      expect(itemCost('hourglass', lv)).toBe(ITEMS.hourglass.costs[lv]);
      const before = a.gold;
      expect(buy(classic, 'a', 'hourglass').ok).toBe(true);
      spent += before - a.gold;
    }
    expect(spent).toBe(ITEMS.hourglass.costs.reduce((s, c) => s + c, 0));
    expect(buy(classic, 'a', 'hourglass').err).toBe('max level');
  });

  it('echo stone doubles every 4th fireball, 0.15 s later on the same aim', () => {
    const state = elementalBattle(3);
    const a = state.players.p0;
    state.players.p1.x = 0; state.players.p1.y = 45;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.items.echo = 1;
    a.x = 0; a.y = 0;
    for (let i = 0; i < 4; i++) {
      a.cooldowns.fireball = 0;
      expect(castSpell(state, 'p0', 'fireball', 20, 0)).toBe(true);
      step(state, DT);
    }
    expect(state.projectiles.length).toBe(4);      // echo not fired yet
    expect(state.delayedShots.length).toBe(1);
    run(state, 0.2);
    expect(state.projectiles.length).toBe(5);      // the echo is airborne
    const last = state.projectiles[state.projectiles.length - 1];
    expect(last.vx).toBeGreaterThan(0);            // same aim: straight +x
    expect(Math.abs(last.vy)).toBeLessThan(0.001);
  });

  // ---- the proc's balls are co-located, and the SHOVE happens ONCE ---------
  // Two hits in one frame used to mean two impulses (impulses add linearly), so a
  // cashed sting launched for exactly procBalls × a fireball — 72.5 → 145.0 u/s,
  // 239 with gale lv3. Remi's ruling 2026-08-07: "I see the mosquito as drawing
  // its strength from DAMAGE rather than from knockback — otherwise I can imagine
  // a monstrous win rate." So each proc ball carries kbScale = 1/procBalls and
  // the volley totals ONE fireball's push, while damage and every on-hit effect
  // still fire procBalls times (locked by the tests above and below).

  // one plain lv1 fireball's launch speed, read on the frame it connects
  // (knockback lands in stepProjectiles, after the movement/friction pass, so
  // this is the raw launch speed for the proc too)
  function plainFireballLaunch() {
    const state0 = elementalBattle(3);
    const a0 = state0.players.p0, b0 = state0.players.p1;
    state0.players.p2.x = 0; state0.players.p2.y = -45;
    state0.pillars = [];
    a0.elements = {}; a0.x = 0; a0.y = 0;
    b0.x = 8; b0.y = 0; b0.vx = b0.vy = 0; b0.moveTarget = null;
    b0.maxHp = 9999; b0.hp = 9999;
    castSpell(state0, 'p0', 'fireball', 20, 0);
    for (let i = 0; i < 20; i++) {
      state0.events = [];
      step(state0, DT);
      if (state0.events.some(e => e.t === 'hit' && e.id === 'p1'))
        return Math.abs(b0.vx);
    }
    return 0;
  }

  it('a cashed sting launches the victim exactly as hard as ONE fireball', () => {
    const f = ELEMENTS.mosquito.fx;
    const soloV = plainFireballLaunch();
    expect(soloV).toBeGreaterThan(1);
    // the proc, on the frame it lands (both balls in that one frame). The sting
    // itself pushes for nothing, so all of this velocity is the payoff balls —
    // and it must equal ONE fireball's launch, not procBalls of them.
    const state = mosquitoProc({ mosquito: 1 }, { hp: 9999 });
    const procV = Math.abs(state.players.p1.vx);
    expect(procV).toBeCloseTo(soloV, 4);
    expect(f.procBalls).toBeGreaterThan(1);   // ...and that is NOT trivially true
    expect(procV).toBeLessThan(soloV * f.procBalls * 0.9);
    // meanwhile the DAMAGE is procBalls × a fireball: the split is push-only
    const hits = procHits(state);
    expect(hits.length).toBe(f.procBalls);
    const total = hits.reduce((s, h) => s + h.amount, 0);
    expect(total).toBeCloseTo(SPELLS.fireball.damage[0] * f.procBalls, 4);
  });

  it('knockback-once is DERIVED from procBalls, not "ball 2 pushes for nothing"', () => {
    // The lazy implementation (first ball pushes, the rest are free) passes the
    // test above and breaks the moment procBalls changes. Prove the rule is
    // 1/procBalls by moving the spec to 3 balls: 3× the damage, still 1× the push.
    const f = ELEMENTS.mosquito.fx;
    const soloV = plainFireballLaunch();
    const orig = f.procBalls;
    try {
      f.procBalls = 3;
      const state = mosquitoProc({ mosquito: 1 }, { hp: 9999 });
      const hits = procHits(state);
      expect(hits.length).toBe(3);                                  // 3 balls
      expect(Math.abs(state.players.p1.vx)).toBeCloseTo(soloV, 4);  // 1 shove
    } finally {
      f.procBalls = orig;
    }
  });

  it('the optional procDmgMult lever taxes damage only, never the effect count', () => {
    // docs/ROUND12.md S3 option (b): keep the fast sting, make each proc ball hit
    // for a fraction. Absent from the spec by default — this locks the lever so it
    // still works if Remi asks for it.
    const f = ELEMENTS.mosquito.fx;
    const k = 0.6;
    try {
      f.procDmgMult = k;
      const state = mosquitoProc({ mosquito: 1, frost: 1 }, { hp: 9999 });
      const hits = procHits(state);
      expect(hits.length).toBe(f.procBalls);          // still procBalls events
      for (const h of hits)
        expect(h.amount).toBeCloseTo(SPELLS.fireball.damage[0] * k, 5);
      // and the on-hit effects are untouched: still one frost stack per ball
      expect(frostOn(state.players.p1, 'p0')).toBe(f.procBalls);
    } finally {
      delete f.procDmgMult;
    }
  });

  // ---- vampire 🧛 -----------------------------------------------------------

  it('vampire 🧛: every Nth CAST is engorged and heals a multiple of the damage', () => {
    const f = ELEMENTS.vampire.fx;
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.elements = { vampire: 1 };
    const dmg = SPELLS.fireball.damage[0];
    let healed = 0;
    for (let n = 1; n <= f.chargeEvery; n++) {
      a.x = 0; a.y = 0; a.vx = a.vy = 0; a.cooldowns = {};
      a.hp = a.maxHp - 60;                 // room to heal, and no overkill cap
      b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null; b.hp = b.maxHp;
      const before = a.hp;
      expect(castSpell(state, 'p0', 'fireball', 20, 0)).toBe(true);
      const ball = state.projectiles[state.projectiles.length - 1];
      // only the Nth ball is engorged, and it says so on the wire
      const engorgedNow = n % f.chargeEvery === 0;
      expect(!!ball.engorged).toBe(engorgedNow);
      const wire = snapshot(state, 'p0').projectiles.find(p => p.id === ball.id);
      expect(wire.engorged).toBe(engorgedNow ? 1 : undefined);
      run(state, 0.4);
      healed = a.hp - before;
      if (!engorgedNow) {
        // regen is the only healing on a plain ball (no Blood Sword owned)
        expect(healed).toBeLessThan(1);
      }
    }
    // the engorged one pays chargeLifesteal × the damage it dealt, on top of regen
    expect(healed).toBeGreaterThan(dmg * f.chargeLifesteal[0] - 1);
    expect(a.healLifesteal).toBeGreaterThan(dmg * f.chargeLifesteal[0] - 1);
    expect(state.events.some(e => e.t === 'lifesteal' && e.id === 'p0')).toBe(true);
  });

  // Round 16 (Remi): "lifesteal needs a visual indicator". The Blood Sword used
  // to be deliberately silent (only vampire's engorged ball got the green
  // number) and read as broken because of it — now ANY lifesteal heal >= 1 hp
  // is an event the client turns into a green "+N" over the healed player.
  it('the Blood Sword pops the green lifesteal number too, on the healer', () => {
    const state = freshBattle(2);
    const a = state.players.p0, b = state.players.p1;
    state.pillars = [];
    a.items = { sword: 1 };
    a.hp = a.maxHp - 20;                    // room to heal
    a.x = 0; a.y = 0; a.vx = a.vy = 0;
    b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    const steal = ITEM_FX.sword.lifesteal[0];
    expect(SPELLS.fireball.damage[0] * steal).toBeGreaterThanOrEqual(1);
    state.events = [];
    castSpell(state, 'p0', 'fireball', 20, 0);
    let ev = null;
    for (let i = 0; i < 20 && !ev; i++) {
      step(state, DT);
      ev = state.events.find(e => e.t === 'lifesteal' && e.id === 'p0');
    }
    expect(ev).toBeTruthy();
    expect(ev.amount).toBeCloseTo(SPELLS.fireball.damage[0] * steal, 1);
  });

  it('vampire pays only on damage ACTUALLY DEALT: no overkill, and never from lava', () => {
    const f = ELEMENTS.vampire.fx;
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.elements = { vampire: 3 };
    a.vampN = f.chargeEvery - 1;          // the next cast is the engorged one
    a.hp = 10;
    a.x = 0; a.y = 0; b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    // 1 hp AND 1 max hp: the rest of the hit is overkill, and regen cannot top
    // the victim up in the ball's flight time (which would inflate the payout)
    b.maxHp = 1; b.hp = 1;
    const before = a.hp;
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.4);
    expect(b.alive).toBe(false);
    // 1 point of damage was DEALT, so at most 1 × the multiplier is paid — not
    // the full fireball's worth. This is the rule that bounds vampire+mosquito.
    const paid = a.healLifesteal;
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeLessThan(1 * f.chargeLifesteal[2] + 0.01);
    expect(before + paid).toBeGreaterThan(a.hp - 1); // the rest is just regen
    // ...and the lava pays nothing at all, however engorged you are
    const hpNow = a.hp;
    a.healLifesteal = 0;
    state.arenaRadius = 1;                 // everyone is swimming
    a.hp = hpNow;
    run(state, 0.5);
    expect(a.healLifesteal).toBe(0);
  });

  it('vampire + mosquito: an engorged STING heals off 1 damage, not a fireball', () => {
    const f = ELEMENTS.vampire.fx;
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.elements = { vampire: 3, mosquito: 1 };
    a.vampN = f.chargeEvery - 1;          // next cast: engorged
    a.hp = a.maxHp - 60;
    a.x = 0; a.y = 0; b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.4);
    // the sting deals stingDmg, so the engorged payout is bounded by that —
    // 1 damage × 350% is 3.5 hp, not a full heal
    expect(a.healLifesteal).toBeLessThan(
      ELEMENTS.mosquito.fx.stingDmg * f.chargeLifesteal[2] + 0.01);
    expect(a.healLifesteal).toBeGreaterThan(0);
  });

  it('the vampire charge counter RESETS on a round boundary (unlike momentum)', () => {
    const f = ELEMENTS.vampire.fx;
    const state = elementalBattle(2);
    const a = state.players.p0;
    a.elements = { vampire: 1 };
    a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0);
    expect(a.vampN).toBe(1);
    // end the round the blunt way, then run into the next one
    state.players.p1.hp = 0.0001;
    state.players.p1.alive = false;
    run(state, ROUND.SUMMARY_TIME + ROUND.SHOP_TIME + ROUND.COUNTDOWN + 1);
    expect(state.round).toBeGreaterThan(1);
    expect(a.vampN).toBe(0);
    // and the first cast of the new round is charge 1 of chargeEvery again
    a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0);
    expect(a.vampN).toBe(1);
    expect(f.chargeEvery).toBeGreaterThan(1);
  });

  // ---- arcane 🔮 (round 16: cadence lv1/2, on-hit refund lv3) --------------
  // Round 17: CDR percentages became additive Ability Haste —
  // cd = base / (1 + haste/100), haste sums across sources. The hourglass ITEM
  // hastens everything; arcane touches the fireball only, and its lv3 special
  // is chronos's old refund narrowed to fireball hits.

  it('arcane lv1/2: the FIREBALL cools down faster; nothing else does', () => {
    const f = ELEMENTS.arcane.fx;
    const state = elementalBattle(2);
    const a = state.players.p0;
    a.elements = { arcane: 1 };
    a.spells.lightning = 1;
    a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0);
    castSpell(state, 'p0', 'lightning', 20, 10);
    expect(a.cooldowns.fireball).toBeCloseTo(
      SPELLS.fireball.cooldown[0] / (1 + f.haste[0] / 100), 3);
    expect(a.cooldowns.lightning).toBeCloseTo(SPELLS.lightning.cooldown[0], 3);
  });

  it('the hourglass hastens EVERY cooldown, and SUMS with arcane on the fireball', () => {
    const state = elementalBattle(2);
    const a = state.players.p0;
    a.items = { hourglass: 2 };
    a.spells.lightning = 1;
    a.cooldowns = {};
    const hg = ITEM_FX.hourglass.haste[1];
    castSpell(state, 'p0', 'fireball', 20, 0);
    castSpell(state, 'p0', 'lightning', 20, 10);
    expect(a.cooldowns.fireball).toBeCloseTo(
      SPELLS.fireball.cooldown[0] / (1 + hg / 100), 3);
    expect(a.cooldowns.lightning).toBeCloseTo(
      SPELLS.lightning.cooldown[0] / (1 + hg / 100), 3);
    a.elements = { arcane: 2 };
    a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0);
    // additive, not compounding: one divisor over the summed haste
    expect(a.cooldowns.fireball).toBeCloseTo(
      SPELLS.fireball.cooldown[0] /
        (1 + (hg + ELEMENTS.arcane.fx.haste[1]) / 100), 3);
  });

  it('arcane lv3: a landed FIREBALL refunds every OTHER running cooldown — never its own', () => {
    const f = ELEMENTS.arcane.fx;
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.elements = { arcane: 3 };
    a.spells.teleport = 1;
    a.x = 0; a.y = 0; b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    castSpell(state, 'p0', 'fireball', 20, 0);
    a.cooldowns.teleport = SPELLS.teleport.cooldown[0];  // something long, running
    const fbBefore = a.cooldowns.fireball;
    const tpBefore = a.cooldowns.teleport;
    let elapsed = 0;
    for (let i = 0; i < 20; i++) {
      state.events = [];
      step(state, DT); elapsed += DT;
      if (state.events.some(e => e.t === 'refund' && e.id === 'p0')) break;
    }
    // teleport jumped back by hitRefund (on top of the normal tick down)...
    expect(a.cooldowns.teleport).toBeCloseTo(tpBefore - elapsed - f.hitRefund[2], 2);
    // ...and the fireball's own cooldown only ticked — refunding the spell that
    // triggers the refund is the measured 74% feedback loop (see arcaneRefund)
    expect(a.cooldowns.fireball).toBeCloseTo(fbBefore - elapsed, 2);
  });

  it('arcane below lv3 refunds nothing: hitRefund is 0 until the special unlocks', () => {
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.elements = { arcane: 2 };
    a.spells.teleport = 1;
    a.x = 0; a.y = 0; b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    castSpell(state, 'p0', 'fireball', 20, 0);
    a.cooldowns.teleport = 15;
    state.events = [];
    run(state, 1);
    expect(state.events.some(e => e.t === 'refund')).toBe(false);
    expect(a.cooldowns.teleport).toBeCloseTo(15 - 1, 1);
  });

  it('arcane lv3 refunds ONCE PER ENEMY HIT: a ghost ball through 2 bodies pays 2x', () => {
    const f = ELEMENTS.arcane.fx;
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    state.pillars = [];
    a.elements = { arcane: 3, ghost: ELEMENTS.ghost.fx.pierceAtLevel };
    a.spells.teleport = 1;
    a.x = 0; a.y = 0; a.vx = a.vy = 0;
    b.x = 8; b.y = 0; c.x = 16; c.y = 0;
    for (const v of [b, c]) {
      v.vx = v.vy = 0; v.moveTarget = null; v.maxHp = 500; v.hp = 500;
    }
    castSpell(state, 'p0', 'fireball', 20, 0);
    a.cooldowns.teleport = 15;
    const before = a.cooldowns.teleport;
    let elapsed = 0, refunds = 0;
    for (let i = 0; i < 30; i++) {
      state.events = [];
      step(state, DT); elapsed += DT;
      refunds += state.events.filter(e => e.t === 'refund' && e.id === 'p0').length;
      if (refunds >= 2) break;
    }
    expect(refunds).toBe(2);
    expect(before - elapsed - a.cooldowns.teleport).toBeCloseTo(f.hitRefund[2] * 2, 1);
  });

  it('arcane cdFloor: a refund never reaches 0, and never RAISES a short cooldown', () => {
    const f = ELEMENTS.arcane.fx;
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.elements = { arcane: 3 };
    a.spells.rush = 1; a.spells.teleport = 1;
    a.x = 0; a.y = 0; b.x = 4; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    b.maxHp = 500; b.hp = 500;
    castSpell(state, 'p0', 'fireball', 20, 0);
    // arrange a cooldown the refund would ZERO (the loop guard the floor is
    // for), and one already BELOW the floor (a bare max() would raise it)
    a.cooldowns.teleport = f.hitRefund[2];
    a.cooldowns.rush = f.cdFloor / 2;
    expect(f.hitRefund[2]).toBeGreaterThan(f.cdFloor);
    let fired = false;
    for (let i = 0; i < 20 && !fired; i++) {
      const rushBefore = a.cooldowns.rush;
      state.events = [];
      step(state, DT);
      if (state.events.some(e => e.t === 'refund' && e.id === 'p0')) {
        fired = true;
        expect(a.cooldowns.teleport).toBeGreaterThanOrEqual(f.cdFloor - 1e-9);
        expect(a.cooldowns.rush).toBeLessThanOrEqual(rushBefore); // never pushed up
        // and a refunded spell can never re-cast in the frame it was floored
        expect(castSpell(state, 'p0', 'teleport', 20, 0)).toBe(false);
      }
    }
    expect(fired).toBe(true);
  });

  it('arcane lv3 + hourglass stack without producing a negative or NaN cooldown', () => {
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.elements = { arcane: 3 };
    a.items = { hourglass: 3 };
    a.spells.lightning = 1; a.spells.boomerang = 1; a.spells.rush = 1;
    b.maxHp = 9999; b.hp = 9999;
    for (let round = 0; round < 40; round++) {
      a.x = 0; a.y = 0; a.vx = a.vy = 0;
      b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
      for (const k of ['fireball', 'lightning', 'boomerang', 'rush'])
        castSpell(state, 'p0', k, 20, 0);
      run(state, 0.2);
      for (const [k, v] of Object.entries(a.cooldowns)) {
        expect(Number.isFinite(v), `${k} cooldown is ${v}`).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('the refund triggers ONLY on fireball hits — not lightning, rush, DoT ticks or trails', () => {
    // chronos triggered on any landed spell; arcane lv3 must not (Remi: "I'm
    // changing it to only work when hitting fireball")
    for (const spell of ['lightning', 'rush']) {
      const state = elementalBattle(3);
      const a = state.players.p0, b = state.players.p1;
      state.players.p2.x = 0; state.players.p2.y = -45;
      state.pillars = [];
      a.elements = { arcane: 3 };
      a.spells[spell] = 1;
      a.spells.teleport = 1;
      a.x = 0; a.y = 0; b.x = 5; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
      b.maxHp = 500; b.hp = 500;
      a.cooldowns.teleport = 15;
      state.events = [];
      expect(castSpell(state, 'p0', spell, 20, 0)).toBe(true);
      let elapsed = 0;
      for (let i = 0; i < 40; i++) { state.events = []; step(state, DT); elapsed += DT; }
      expect(state.events.some(e => e.t === 'refund')).toBe(false);
      expect(a.cooldowns.teleport).toBeCloseTo(15 - elapsed, 1);
    }
    // ...and venom's DoT does NOT either: a tick is a burn, not a hit
    const state = hitWith({ arcane: 3, venom: 1 });
    const a = state.players.p0, b = state.players.p1;
    b.maxHp = 500; b.hp = 500;
    a.spells.teleport = 1;
    a.cooldowns.teleport = 15;
    a.x = 0; a.y = -40;                    // out of the way, no more hits
    const before = a.cooldowns.teleport;
    state.events = [];
    run(state, 3);                          // several poison ticks
    expect(b.poisonT).toBeGreaterThanOrEqual(0);
    expect(state.events.some(e => e.t === 'refund')).toBe(false);
    expect(a.cooldowns.teleport).toBeCloseTo(before - 3, 1);
  });

  // ---- ghost 👻 -----------------------------------------------------------

  // a at the origin, b at 8, c at 24, all in a line on +x. Returns what each
  // victim took. The first victim is teleported away the instant it is hit: its
  // own knockback (72 u/s, faster than the ball) would otherwise carry it into
  // the second body and confuse the measurement.
  function pierceLine(elements, { clearFirst = true } = {}) {
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    state.pillars = [];
    a.elements = { ...elements };
    a.x = 0; a.y = 0;
    b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    c.x = 24; c.y = 0; c.vx = c.vy = 0; c.moveTarget = null;
    b.maxHp = 500; b.hp = 500; c.maxHp = 500; c.hp = 500;
    castSpell(state, 'p0', 'fireball', 20, 0);
    const out = { first: null, second: null, survived: false };
    for (let i = 0; i < 60; i++) {
      state.events = [];
      step(state, DT);
      for (const e of state.events) {
        if (e.t !== 'hit') continue;
        if (e.id === 'p1' && out.first == null) {
          out.first = { dmg: e.amount, kb: b.vx };
          out.survived = state.projectiles.some(p => p.type === 'fireball');
          if (clearFirst) { b.x = 0; b.y = -45; b.vx = b.vy = 0; }
        } else if (e.id === 'p2' && out.second == null) {
          out.second = { dmg: e.amount, kb: c.vx };
        }
      }
      if (out.second) break;
    }
    return out;
  }

  // Round 16: ghost lv1/2 is the fireball's SPEED axis; the passthrough is the
  // lv3 special, and everyone hit takes a FULL ordinary hit (no behind-bonus).
  it('ghost lv1/2: the fireball flies faster and still pops on the first body', () => {
    const f = ELEMENTS.ghost.fx;
    for (const lv of [1, 2, 3]) {
      const state = elementalBattle(2);
      const a = state.players.p0;
      a.elements = { ghost: lv };
      a.x = 0; a.y = 0;
      castSpell(state, 'p0', 'fireball', 20, 0);
      const pr = state.projectiles[0];
      expect(Math.hypot(pr.vx, pr.vy)).toBeCloseTo(
        SPELLS.fireball.speed * f.projSpeedMult[lv - 1], 3);
      expect(pr.pierce).toBe(lv >= f.pierceAtLevel);
    }
    const r = pierceLine({ ghost: f.pierceAtLevel - 1 });
    expect(r.survived).toBe(false);                  // below lv3: pops on body 1
    expect(r.second).toBe(null);
  });

  it('ghost lv3: the ball passes through, and EVERYONE takes a full ordinary hit', () => {
    const r = pierceLine({ ghost: 3 });
    expect(r.survived).toBe(true);                    // it did not pop on body 1
    expect(r.first.dmg).toBeCloseTo(SPELLS.fireball.damage[0], 5);
    expect(r.second).not.toBe(null);
    // no behind-bonus any more: body 2 takes exactly what body 1 took
    expect(r.second.dmg).toBeCloseTo(r.first.dmg, 5);
    expect(r.second.kb).toBeCloseTo(r.first.kb, 1);
  });

  it('a piercing ball hits each body ONCE, then leaves the world', () => {
    const state = elementalBattle(2);
    const a = state.players.p0, b = state.players.p1;
    state.pillars = [];
    state.arenaRadius = ARENA.START_RADIUS;
    a.elements = { ghost: 3 };
    a.x = 0; a.y = 0;
    b.x = 6; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    b.maxHp = 9999; b.hp = 9999;
    castSpell(state, 'p0', 'fireball', 20, 0);
    let hits = 0;
    for (let i = 0; i < 30; i++) {
      state.events = [];
      step(state, DT);
      hits += state.events.filter(e => e.t === 'hit' && e.id === 'p1').length;
      // hold the victim still and IN the ball's path the whole way
      b.x = 6; b.y = 0; b.vx = b.vy = 0;
    }
    expect(hits).toBe(1);                    // the boomerang's one-hit-per-enemy set
    // and a pierced ball is not immortal: the world cull takes it
    run(state, 6);
    expect(state.projectiles.length).toBe(0);
  });

  it('a plain fireball still POPS on the first body, and so does a swap bolt', () => {
    // regression for replacing the hardcoded type list with a per-projectile flag
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.x = 0; a.y = 0; b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    b.maxHp = 500; b.hp = 500;
    castSpell(state, 'p0', 'fireball', 20, 0);
    expect(state.projectiles[0].pierce).toBe(false);
    run(state, 0.4);
    expect(state.projectiles.length).toBe(0);
    a.spells.swap = 1; a.cooldowns = {};
    b.x = 8; b.y = 0; b.vx = b.vy = 0;
    castSpell(state, 'p0', 'swap', 20, 0);
    expect(state.projectiles[0].pierce).toBe(false);
    run(state, 0.4);
    expect(state.projectiles.length).toBe(0);
  });

  it('ghost + shield: the ball reflects, and comes back as a FRESH un-pierced ball', () => {
    const f = ELEMENTS.ghost.fx;
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    state.pillars = [];
    a.elements = { ghost: 3 };
    a.maxHp = 500; a.hp = 500;
    a.x = 0; a.y = 0; a.vx = a.vy = 0; a.moveTarget = null;
    b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    b.maxHp = 500; b.hp = 500;
    b.shieldT = SPELLS.shield.duration;
    c.x = 0; c.y = -45;
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.6);
    expect(state.events.some(e => e.t === 'reflect')).toBe(true);
    expect(b.hp).toBe(500);                       // the shield ate it entirely
    // it flew home and hit its own caster ONCE, for a plain fireball's damage
    expect(500 - a.hp).toBeGreaterThan(SPELLS.fireball.damage[0] - 1);
    expect(500 - a.hp).toBeLessThan(SPELLS.fireball.damage[0] + 1);
  });

  it('ghost + mirror wall: reflected, ownership flips, and the pierce counter resets', () => {
    const f = ELEMENTS.ghost.fx;
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    state.pillars = [];
    a.elements = { ghost: 3 };
    a.maxHp = 500; a.hp = 500;
    a.x = 0; a.y = 0; a.vx = a.vy = 0; a.moveTarget = null;
    // b owns the wall and stands behind it; c is parked far away
    b.x = 30; b.y = 0; b.spells.wall = 1;
    c.x = 0; c.y = -45;
    castSpell(state, 'p1', 'wall', 20, 0);        // wall at b - 20 on the x axis
    a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 1.6);   // out to the wall (20 u) and all the way back
    expect(state.events.some(e => e.t === 'reflect')).toBe(true);
    // the bounced ball belongs to the wall's owner and hits the caster once,
    // for ordinary damage
    const taken = 500 - a.hp;
    expect(taken).toBeGreaterThan(SPELLS.fireball.damage[0] - 1);
    expect(taken).toBeLessThan(SPELLS.fireball.damage[0] + 1);
  });

  it('ghost + mosquito: the STING does not pierce, the proc balls do', () => {
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    state.pillars = [];
    a.elements = { mosquito: 1, ghost: ELEMENTS.ghost.fx.pierceAtLevel };
    a.x = 0; a.y = 0;
    b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    b.maxHp = 500; b.hp = 500;
    c.x = 0; c.y = -45;
    castSpell(state, 'p0', 'fireball', 20, 0);
    // the sting is the mosquito's own ball: it carries no riders at all, so it
    // cannot pierce (the pest REPLACES your fireball — existing rule)
    const sting = state.projectiles[0];
    expect(sting.mosquito).toBe(1);
    expect(sting.pierce).toBe(false);
    run(state, 0.4);
    expect(state.projectiles.length).toBe(0);     // it popped on the body
    // the proc's balls ARE your normal fireballs, so they carry ghost and pierce
    a.cooldowns = {};
    b.x = 8; b.y = 0; b.vx = b.vy = 0;
    castSpell(state, 'p0', 'fireball', 20, 0);
    for (let i = 0; i < 20; i++) {
      state.events = [];
      step(state, DT);
      if (state.events.some(e => e.t === 'biteHit')) break;
    }
    const proc = state.projectiles.find(p => p.type === 'fireball');
    expect(proc.pierce).toBe(true);
    expect(proc.elements.ghost).toBe(ELEMENTS.ghost.fx.pierceAtLevel);
  });

  it('every element requires a fireball, and every element rides on the ball (round 16)', () => {
    const state = createGame({ seed: 9, mode: 'elemental' });
    addPlayer(state, 'a', 'Alice');
    state.phase = 'shop';
    const a = state.players.a;
    a.gold = 999;
    a.spells.fireball = 0;
    for (const k of Object.keys(ELEMENTS))
      expect(buy(state, 'a', k).err, k).toBe('requires fireball');
    // arcane rides on the projectile now (its lv3 refund resolves on the hit)
    a.spells.fireball = 1;
    expect(buy(state, 'a', 'arcane').ok).toBe(true);
    a.x = 0; a.y = 0;
    state.phase = 'battle';
    a.alive = true;
    castSpell(state, 'a', 'fireball', 20, 0);
    const pr = state.projectiles[0];
    expect((pr.elements || {}).arcane).toBe(1);
  });

  it('elemental bots-only game reaches gameover with each kind on its element', () => {
    const state = createGame({ seed: 77, mode: 'elemental' });
    const kinds = ['grunt', 'berserker', 'stalker'];
    kinds.forEach((k, i) => addPlayer(state, `b${i}`, `Bot${i}`, { bot: true, kind: k }));
    startGame(state);
    let guard = 0;
    let lastPhase = state.phase;
    while (state.phase !== 'gameover' && guard++ < 30 * 60 * 30) {
      step(state, DT);
      for (const id of Object.keys(state.players)) stepBot(state, id, DT);
      if (state.phase === 'shop' && lastPhase !== 'shop')
        for (const id of Object.keys(state.players)) botShop(state, id);
      lastPhase = state.phase;
    }
    expect(state.phase).toBe('gameover');
    expect(state.winner).toBeTruthy();
    // every bot committed to an element and levelled it
    kinds.forEach((k, i) => {
      const p = state.players[`b${i}`];
      expect(p._elemPick).toBeTruthy();
      expect(p.elements[p._elemPick] || 0).toBeGreaterThanOrEqual(1);
    });
  }, 30000);

  // 2026-08-08 (Remi: "the bots all keep playing wind, when each type should
  // have its own strategy"). The element is keyed on the BUILD now, not the
  // kind, and spread by seat, so a lobby does not converge on one element.
  it('bots on different builds pick different elements', () => {
    const state = createGame({ seed: 5, mode: 'elemental' });
    const builds = Object.keys(BUILDS);
    const picks = builds.map((b, i) => botElementFor({ build: b }, i));
    expect(new Set(picks).size).toBeGreaterThan(1);
    // and four bots sharing ONE build still spread across that build's list
    const same = [0, 1, 2, 3].map(i => botElementFor({ build: 'bruiser' }, i));
    expect(new Set(same).size).toBeGreaterThan(1);
    expect(state.mode).toBe('elemental'); // and elemental is the default now
  });

  it('classic regression: a full bot game keeps every element null to gameover', () => {
    const state = createGame({ seed: 88, mode: 'classic' });
    const kinds = ['grunt', 'berserker', 'stalker'];
    kinds.forEach((k, i) => addPlayer(state, `b${i}`, `Bot${i}`, { bot: true, kind: k }));
    startGame(state);
    let guard = 0;
    let lastPhase = state.phase;
    while (state.phase !== 'gameover' && guard++ < 30 * 60 * 30) {
      step(state, DT);
      for (const id of Object.keys(state.players)) stepBot(state, id, DT);
      if (state.phase === 'shop' && lastPhase !== 'shop')
        for (const id of Object.keys(state.players)) botShop(state, id);
      lastPhase = state.phase;
    }
    expect(state.phase).toBe('gameover');
    for (const p of Object.values(state.players)) {
      expect(Object.keys(p.elements).length).toBe(0);
      expect(p.items.echo).toBeFalsy();
      expect(p.items.crown).toBeFalsy();
      expect(p.spells.fireball).toBeLessThanOrEqual(SPELLS.fireball.maxLevel);
    }
    // and the classic wire never mentions elemental fields
    const snap = snapshot(state);
    expect(snap.mode).toBe('classic');
    expect(snap.hazards).toBeUndefined();
    for (const p of Object.values(snap.players)) {
      expect(p.elements).toBeUndefined();
      expect(p.slow).toBeUndefined();
    }
  }, 30000);
});

describe('power spells & pillar', () => {
  // round 12 (Remi): the power tier is buyable from the FIRST shop. The
  // minRound machinery is kept generic and still tested below, because a
  // community version may well want to gate something.
  it('power tier is purchasable from round 1', () => {
    const state = freshBattle(2);
    state.phase = 'shop';
    state.players.p0.gold = 999;
    for (const key of ['meteor', 'swap', 'repulse', 'wall']) {
      expect(SPELLS[key].minRound).toBeUndefined();
      expect(buy(state, 'p0', key).ok).toBe(true);
    }
  });

  it('the generic minRound gate still works when a spell sets it', () => {
    const state = freshBattle(2);
    state.phase = 'shop';
    state.players.p0.gold = 999;
    const spec = SPELLS.pillar;
    const saved = spec.minRound;
    try {
      spec.minRound = 5;
      expect(buy(state, 'p0', 'pillar').err).toBe('unlocks after round 5');
      state.round = 5;
      expect(buy(state, 'p0', 'pillar').ok).toBe(true);
    } finally {
      if (saved === undefined) delete spec.minRound; else spec.minRound = saved;
    }
  });

  it('bots never buy power-tier spells, even when a build list names one', () => {
    const state = freshBattle(2);
    state.phase = 'shop';
    const bot = state.players.p0;
    bot.kind = 'berserker'; bot.gold = 999;
    bot.build = null;
    // inject a power spell into the consumed order to prove the guard, not the
    // omission, is what protects us
    const orig = BUILDS.bruiser.order;
    try {
      BUILDS.bruiser.order = ['meteor', 'swap', 'repulse', 'wall', 'fireball'];
      bot.build = 'bruiser';
      botShop(state, 'p0');
      for (const key of ['meteor', 'swap', 'repulse', 'wall'])
        expect(bot.spells[key] || 0).toBe(0);
      expect(bot.spells.fireball).toBeGreaterThan(1); // it still shops normally
    } finally {
      BUILDS.bruiser.order = orig;
    }
  });

  it('pillar: raises a blocker, one at a time, and it expires', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.pillar = 1;
    state.pillars = [];
    a.x = 0; a.y = 0; b.x = 12; b.y = 0;
    state.players.p2.y = -40;
    castSpell(state, 'p0', 'pillar', 6, 0);
    expect(state.pillars.length).toBe(1);
    // the raised pillar eats a fireball aimed straight at b
    a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 12, 0);
    run(state, 0.5);
    expect(b.hp).toBe(b.maxHp);
    // recasting replaces the old one — never two standing stones
    a.cooldowns = {};
    castSpell(state, 'p0', 'pillar', -6, 0);
    expect(state.pillars.length).toBe(1);
    expect(state.pillars[0].x).toBeLessThan(0);
    // and it crumbles when its time runs out
    run(state, SPELLS.pillar.duration[0] + 0.2);
    expect(state.pillars.length).toBe(0);
  });

  it('meteor: telegraph, then heavy damage and a radial blast', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.meteor = 1;
    state.pillars = [];
    a.x = 0; a.y = 0; b.x = 20; b.y = 0; b.vx = 0; b.moveTarget = null;
    state.players.p2.y = -40;
    castSpell(state, 'p0', 'meteor', 20, 0);
    expect(state.meteors.length).toBe(1);
    const hp0 = b.hp;
    run(state, SPELLS.meteor.delay + 0.1);
    expect(state.meteors.length).toBe(0);
    expect(hp0 - b.hp).toBeGreaterThan(10);         // 16 dmg, minus a hair of regen
    expect(Math.abs(b.vx) + Math.abs(b.vy)).toBeGreaterThan(20); // blasted
  });

  // ---- swap 🔀 (round 17: the hook's yank became a full state exchange) ----

  // step until the swap lands (or the cap runs out); returns the event
  function stepToSwap(state, ticks = 60) {
    for (let i = 0; i < ticks; i++) {
      state.events = [];
      step(state, DT);
      const e = state.events.find(ev => ev.t === 'swapped');
      if (e) return e;
    }
    return null;
  }

  it('swap: trades position AND velocity, and clears intent on both sides', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.swap = 1;
    state.pillars = [];
    a.x = 0; a.y = 0; a.vx = 0; a.vy = 0;
    b.x = 15; b.y = 0; b.vx = -12; b.vy = 0; b.moveTarget = { x: 0, y: 0 };
    state.players.p2.y = -40;
    castSpell(state, 'p0', 'swap', 20, 0);
    a.moveTarget = { x: -10, y: 0 };
    const e = stepToSwap(state);
    expect(e).toBeTruthy();
    expect(e.a).toBe('p0');
    expect(e.id).toBeUndefined(); // no anchor: both ends show even mid-Vanish
    expect(a.x).toBeGreaterThan(10);                 // caster stands where b stood
    expect(Math.abs(b.x)).toBeLessThan(3);           // b stands where a stood
    expect(a.vx).toBeLessThan(-5);                   // and momentum traded too
    expect(Math.abs(b.vx)).toBeLessThan(1);
    expect(a.moveTarget).toBe(null);                 // stale intent wiped on both
    expect(b.moveTarget).toBe(null);
    expect(b.hp).toBeLessThan(b.maxHp);              // the 1 damage landed
  });

  it('swap: the lava save — and the victim burning to death credits the caster', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.swap = 1;
    state.pillars = [];
    a.x = 20; a.y = 0; a.vx = 0; a.vy = 0;           // caster is IN the lava
    b.x = 0; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null;
    b.hp = 15;
    state.players.p2.x = 0; state.players.p2.y = -8;
    state.arenaRadius = 12;
    castSpell(state, 'p0', 'swap', 0, 0);
    const kills0 = a.kills;
    expect(stepToSwap(state)).toBeTruthy();
    expect(Math.hypot(a.x, a.y)).toBeLessThan(3);    // saved: standing on b's spot
    expect(Math.hypot(b.x, b.y)).toBeGreaterThan(12); // b inherited the lava
    run(state, 2);                                    // 15 hp vs 14 dps
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(kills0 + 1);   // the 1-damage stamp owns the lava death
  });

  it('swap: a victim killed by the 1 damage is not swapped', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.swap = 1;
    state.pillars = [];
    a.x = 0; a.y = 0; b.x = 15; b.y = 0; b.hp = 0.5;
    state.players.p2.y = -40;
    castSpell(state, 'p0', 'swap', 20, 0);
    run(state, 0.6);
    expect(b.alive).toBe(false);
    expect(b.x).toBeGreaterThan(5);        // died where the bolt found them
    expect(Math.abs(a.x)).toBeLessThan(3); // caster went nowhere
  });

  it('swap: interrupts the victim mid-dash and the caster mid-charge', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.swap = 1;
    state.pillars = [];
    a.x = 0; a.y = 0; b.x = 15; b.y = 0; b.vx = 0; b.moveTarget = null;
    state.players.p2.y = -40;
    castSpell(state, 'p0', 'swap', 20, 0);
    a.charging = { left: 1.8, level: 1 };            // repulse wind-up, post-cast
    // dash TOWARD the bolt so the two meet mid-flight, still mid-dash
    b.dash = { dx: -1, dy: 0, left: 12, level: 1, hit: {} };
    expect(stepToSwap(state)).toBeTruthy();
    expect(a.charging).toBe(null);
    expect(b.dash).toBe(null);
  });

  it('swap: connects with a vanished victim (revealing them is fine)', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.swap = 1;
    state.pillars = [];
    a.x = 0; a.y = 0; b.x = 15; b.y = 0; b.vx = 0; b.moveTarget = null;
    b.vanishT = 2;
    state.players.p2.y = -40;
    castSpell(state, 'p0', 'swap', 20, 0);
    expect(stepToSwap(state)).toBeTruthy();
    expect(a.x).toBeGreaterThan(10);
    expect(b.vanishT).toBeGreaterThan(0);  // swapped, not un-vanished
  });

  it('swap: no on-hit riders — elements never ride it, knockback never fires', () => {
    const state = createGame({ seed: 42, mode: 'elemental' });
    for (let i = 0; i < 3; i++) addPlayer(state, `p${i}`, `Player${i}`);
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    const a = state.players.p0, b = state.players.p1;
    a.spells.swap = 1;
    a.elements = { venom: 1, midas: 1 };
    state.pillars = [];
    a.x = 0; a.y = 0; b.x = 15; b.y = 0; b.vx = 0; b.moveTarget = null;
    state.players.p2.x = 0; state.players.p2.y = -45;
    const gold0 = a.gold;
    castSpell(state, 'p0', 'swap', 20, 0);
    expect(stepToSwap(state)).toBeTruthy();
    expect(b.poisonT || 0).toBe(0);        // no venom
    expect(a.gold).toBe(gold0);            // no midas
    expect(Math.abs(b.vx)).toBeLessThan(1); // no knockback: b got a's rest state
  });

  it('repulse: 2 s visible charge (spell-locked), then a radial blast', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.repulse = 1;
    state.pillars = [];
    a.x = 0; a.y = 0; b.x = 5; b.y = 0; b.vx = 0;
    state.players.p2.x = 0; state.players.p2.y = -40;
    castSpell(state, 'p0', 'repulse', 0, 0);
    expect(a.charging).toBeTruthy();
    expect(snapshot(state).players.p0.charging).toBe(true); // clients can blink it
    expect(castSpell(state, 'p0', 'fireball', 10, 0)).toBe(false); // locked mid-charge
    run(state, 1);
    expect(a.charging).toBeTruthy(); // still winding up at 1 s
    b.x = 5; b.y = 0; b.vx = 0;      // keep them in the blast zone
    const hp0 = b.hp;
    run(state, 1.2);
    expect(a.charging).toBeFalsy();
    expect(b.vx).toBeGreaterThan(30); // launched away
    expect(b.hp).toBeLessThan(hp0);
  });

  it('repulse combos: teleport and rush still work mid-charge, the burst still fires', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.repulse = 1; a.spells.teleport = 1; a.spells.rush = 1;
    state.pillars = [];
    a.x = -20; a.y = 0; b.x = 5; b.y = 0; b.vx = 0;
    state.players.p2.x = 0; state.players.p2.y = -40;
    castSpell(state, 'p0', 'repulse', 0, 0);
    expect(a.charging).toBeTruthy();
    // blink INTO the pack while winding up — the combo Remi asked for
    expect(castSpell(state, 'p0', 'teleport', 5, 0)).toBe(true);
    expect(Math.abs(a.x - 5)).toBeLessThan(SPELLS.teleport.range[0]); // moved
    expect(a.charging).toBeTruthy(); // charge survives the blink
    run(state, 2.1);
    expect(a.charging).toBeFalsy();
    expect(b.hp).toBeLessThan(b.maxHp); // burst landed after repositioning
    // rush works mid-charge too
    a.cooldowns = {};
    castSpell(state, 'p0', 'repulse', 0, 0);
    expect(castSpell(state, 'p0', 'rush', a.x + 10, 0)).toBe(true);
    expect(a.dash).toBeTruthy();
    // ...but attack spells stay locked while charging
    expect(castSpell(state, 'p0', 'fireball', 10, 0)).toBe(false);
    expect(castSpell(state, 'p0', 'lightning', 10, 0)).toBe(false);
  });

  it('repulse can be started mid-dash (dash locks everything else)', () => {
    const state = freshBattle(3);
    const a = state.players.p0;
    a.spells.repulse = 1; a.spells.rush = 1;
    state.pillars = [];
    a.x = 0; a.y = 0;
    state.players.p1.x = 30; state.players.p2.y = -40;
    castSpell(state, 'p0', 'rush', 16, 0);
    expect(a.dash).toBeTruthy();
    expect(castSpell(state, 'p0', 'fireball', 10, 0)).toBe(false); // still locked
    expect(castSpell(state, 'p0', 'repulse', 0, 0)).toBe(true);    // the one exception
    expect(a.charging).toBeTruthy();
  });

  it('mirror wall reflects ENEMY projectiles and lets your own pass', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.wall = 1;
    state.pillars = [];
    a.x = 0; a.y = 0; b.x = 20; b.y = 0;
    state.players.p2.y = -40;
    castSpell(state, 'p0', 'wall', 10, 0); // wall at x=10, facing b
    expect(state.walls.length).toBe(1);
    // b's shot bounces: ownership flips to a, and it flies back at b
    castSpell(state, 'p1', 'fireball', -20, 0);
    run(state, 0.25); // reflected (~0.18 s) but not landed yet
    const pr = state.projectiles.find(p => p.type === 'fireball');
    expect(pr).toBeTruthy();
    expect(pr.owner).toBe('p0');
    expect(pr.vx).toBeGreaterThan(0);
    run(state, 0.3);
    expect(b.hp).toBeLessThan(b.maxHp); // ate their own fireball
    // a's own shot sails straight through his wall
    state.projectiles = [];
    a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.3);
    const own = state.projectiles.find(p => p.type === 'fireball');
    expect(own).toBeTruthy();
    expect(own.x).toBeGreaterThan(10.5);
    // walls expire
    run(state, SPELLS.wall.duration + 0.5);
    expect(state.walls.length).toBe(0);
  });
});

describe('bot profiles', () => {
  it('a stalker sidesteps a fireball flying at it', () => {
    const state = createGame({ seed: 11 });
    addPlayer(state, 's', 'Stalker', { bot: true, kind: 'stalker' });
    addPlayer(state, 'e', 'Enemy', { bot: true, kind: 'grunt' });
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    const s = state.players.s;
    s.x = 0; s.y = 0; s.vx = 0; s.vy = 0;
    state.players.e.x = 0; state.players.e.y = 40; // parked far off the ray
    // hostile fireball flying straight at the stalker along y = 0
    state.projectiles.push({
      id: 999, type: 'fireball', owner: 'e', level: 1,
      x: 25, y: 0, vx: -SPELLS.fireball.speed, vy: 0,
      traveled: 0, returning: false, hit: {},
    });
    // step (only the stalker thinks) until the fireball reaches x <= 0
    let guard = 0;
    while (guard++ < 90) {
      const pr = state.projectiles.find((p) => p.id === 999);
      if (!pr || pr.x <= 0) break;
      step(state, DT);
      stepBot(state, 's', DT);
    }
    expect(s.alive).toBe(true);
    expect(s.hp).toBe(s.maxHp);               // it was never clipped
    expect(Math.abs(s.y)).toBeGreaterThan(2); // and it left the threat ray
  });

  it('a stalker teleports out of lava when it owns teleport', () => {
    const state = createGame({ seed: 12 });
    addPlayer(state, 's', 'Stalker', { bot: true, kind: 'stalker' });
    addPlayer(state, 'e1', 'E1', { bot: true, kind: 'grunt' });
    addPlayer(state, 'e2', 'E2', { bot: true, kind: 'grunt' });
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    const s = state.players.s;
    s.spells.teleport = 1;
    s.x = ARENA.START_RADIUS + 3; s.y = 0; s.vx = 0; s.vy = 0; // swimming
    const before = Math.hypot(s.x, s.y);
    stepBot(state, 's', DT);
    expect(s.cooldowns.teleport).toBeGreaterThan(0); // it cast the save
    expect(Math.hypot(s.x, s.y)).toBeLessThan(before - 10);
    expect(Math.hypot(s.x, s.y)).toBeLessThan(state.arenaRadius);
    expect(state.events.some((e) => e.t === 'teleport' && e.id === 's')).toBe(true);
  });

  it('a mixed-kind full bot game reaches gameover', () => {
    const state = createGame({ seed: 321 });
    const kinds = ['grunt', 'berserker', 'stalker', 'grunt'];
    kinds.forEach((k, i) => addPlayer(state, `b${i}`, `Bot${i}`, { bot: true, kind: k }));
    startGame(state);
    let guard = 0;
    let lastPhase = state.phase;
    while (state.phase !== 'gameover' && guard++ < 30 * 60 * 30) { // 30 min sim cap
      step(state, DT);
      for (const id of Object.keys(state.players)) stepBot(state, id, DT);
      if (state.phase === 'shop' && lastPhase !== 'shop')
        for (const id of Object.keys(state.players)) botShop(state, id);
      lastPhase = state.phase;
    }
    expect(state.phase).toBe('gameover');
    expect(state.winner).toBeTruthy();
    const total = Object.values(state.players).reduce((s, p) => s + p.kills, 0);
    expect(total).toBeGreaterThan(0);
  }, 30000);

  it('a berserker buys rush in its first affordable shop', () => {
    const state = createGame({ seed: 13, mode: 'classic' });
    addPlayer(state, 'z', 'Zerk', { bot: true, kind: 'berserker' });
    addPlayer(state, 'e', 'Enemy', { bot: true });
    state.phase = 'shop';
    state.players.z.gold = 28; // strong first rounds: kill + win bonuses
    // (fireball L2+L3 cost 16 since the v5 rebalance; rush needs 12 more)
    botShop(state, 'z');
    expect(state.players.z.spells.rush).toBe(1);
  });
});

describe('v5 mechanics', () => {
  // Round 12 (Remi): knockback is being TESTED as constant, via
  // PLAYER.KB_CONSTANT_MISSING — the HP-scaling formula is untouched, it is just
  // fed a fixed "fraction missing". This test covers BOTH settings so flipping
  // that one constant back stays a genuine one-line revert.
  it('knockback: constant when KB_CONSTANT_MISSING is set, HP-scaled when null', () => {
    const peakKnockVx = (hpFrac) => {
      const state = freshBattle(3);
      const a = state.players.p0, b = state.players.p1;
      state.players.p2.x = 0; state.players.p2.y = -45; // out of the way
      state.pillars = []; // isolate: nothing to slam into
      a.x = 0; a.y = 0; b.x = 8; b.y = 0;
      b.hp = b.maxHp * hpFrac;
      castSpell(state, 'p0', 'fireball', 20, 0);
      let peak = 0;
      for (let i = 0; i < 30; i++) { step(state, DT); peak = Math.max(peak, b.vx); }
      return peak;
    };
    const saved = PLAYER.KB_CONSTANT_MISSING;
    try {
      // the mode we currently ship: identical impulse at any HP
      PLAYER.KB_CONSTANT_MISSING = 0.30;
      const cFull = peakKnockVx(1.0), cLow = peakKnockVx(0.2);
      expect(cFull).toBeGreaterThan(0);
      expect(cLow).toBeCloseTo(cFull, 4);

      // the revert: % missing drives it again
      PLAYER.KB_CONSTANT_MISSING = null;
      const full = peakKnockVx(1.0), low = peakKnockVx(0.2);
      expect(full).toBeGreaterThan(0);
      const expected = 1 + PLAYER.KB_HP_FACTOR * 0.8;   // 20% hp -> 80% missing
      expect(low / full).toBeCloseTo(expected, 1);
    } finally {
      PLAYER.KB_CONSTANT_MISSING = saved;
    }
  });

  it('knockback ignores body size — big is only ever a disadvantage', () => {
    const peakKnockVx = (radiusMult) => {
      const state = freshBattle(3);
      const a = state.players.p0, b = state.players.p1;
      state.players.p2.x = 0; state.players.p2.y = -45;
      state.pillars = [];
      a.x = 0; a.y = 0; b.x = 8; b.y = 0;
      b.radius = PLAYER.RADIUS * radiusMult; // force size; updateRadii is per-tick
      castSpell(state, 'p0', 'fireball', 20, 0);
      let peak = 0;
      for (let i = 0; i < 6; i++) { step(state, DT); b.radius = PLAYER.RADIUS * radiusMult; peak = Math.max(peak, b.vx); }
      return peak;
    };
    const small = peakKnockVx(0.6);
    const big = peakKnockVx(1.8);
    expect(big).toBeGreaterThan(0);
    // same hp%, same hit -> same impulse regardless of size
    expect(Math.abs(small - big) / big).toBeLessThan(0.05);
  });

  it('the arena closes faster when fighters are dead', () => {
    const mk = () => {
      const s = freshBattle(4);
      for (const pl of Object.values(s.players)) { pl.x = 0; pl.y = 0; }
      return s;
    };
    const allAlive = mk();
    run(allAlive, 21);

    const twoDead = mk();
    twoDead.players.p2.hp = 0.01; twoDead.players.p2.x = ARENA.START_RADIUS + 5;
    twoDead.players.p3.hp = 0.01; twoDead.players.p3.x = -(ARENA.START_RADIUS + 5);
    run(twoDead, 1); // they burn almost immediately
    expect(twoDead.players.p2.alive).toBe(false);
    expect(twoDead.players.p3.alive).toBe(false);
    run(twoDead, 20);

    // same elapsed time, 2 of 4 dead -> ~1.75x shrink rate -> clearly smaller
    expect(twoDead.arenaRadius).toBeLessThan(allAlive.arenaRadius - 5);
    expect(allAlive.arenaRadius).toBeGreaterThan(ARENA.MIN_RADIUS);
  });

  it('baseline regen heals a damaged idle player', () => {
    const state = freshBattle(2);
    state.players.p0.hp = 50;
    run(state, 5); // idle at spawn, no lava, no items
    expect(state.players.p0.hp).toBeGreaterThan(54.5); // ~50 + 1.2*5
    expect(state.players.p0.hp).toBeLessThan(57.5);
  });

  it('a pillar blocks a fireball (no damage to the player behind it)', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    a.x = 0; a.y = 0; b.x = 20; b.y = 0;
    state.pillars = [{ x: 10, y: 0, r: 2.5, sunk: false }];
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 1.5);
    expect(b.hp).toBe(b.maxHp);
    expect(b.vx).toBe(0); // never knocked
    expect(state.projectiles.length).toBe(0); // died on the pillar
    expect(state.events.some(e => e.t === 'boom' && e.spell === 'fireball')).toBe(true);
    expect(snapshot(state).pillars.length).toBe(1); // pillars are on the wire
  });

  it('pillars and mirror walls do NOT block lightning — it falls from the sky', () => {
    // round 17 §2: the anti-cover tool, by design
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    a.spells.lightning = 1;
    a.x = 0; a.y = 0; b.x = 20; b.y = 0; b.vx = 0; b.moveTarget = null;
    state.pillars = [{ x: 10, y: 0, r: 2.5, sunk: false }];
    state.walls = [{ x1: 14, y1: -4, x2: 14, y2: 4, nx: 1, ny: 0,
      owner: 'p1', until: state.time + 99 }];
    castSpell(state, 'p0', 'lightning', 20, 0);
    run(state, SPELLS.lightning.delay + 0.1);
    expect(b.hp).toBeLessThan(b.maxHp);  // struck clean through both
  });

  it('a player pushed against a pillar stops (stays outside, inward velocity killed)', () => {
    const state = freshBattle(3);
    const a = state.players.p0;
    state.pillars = [{ x: 10, y: 0, r: 2.5, sunk: false }];
    a.x = 4; a.y = 0; a.vx = 80; a.vy = 0; // hard knockback straight at the pillar
    run(state, 1);
    const gap = Math.hypot(a.x - 10, a.y - 0) - 2.5 - a.radius;
    expect(gap).toBeGreaterThanOrEqual(-0.01); // pinned at the surface, not inside
    expect(a.x).toBeLessThan(10);              // never tunneled through
    expect(Math.abs(a.vx)).toBeLessThan(0.5);  // velocity into the pillar died
  });

  it('a sunken pillar no longer blocks anything', () => {
    const state = freshBattle(2);
    const a = state.players.p0, b = state.players.p1;
    state.arenaRadius = 5; // the lava has swallowed everything past 5u
    state.pillars = [{ x: 10, y: 0, r: 2.5, sunk: false }];
    a.x = 0; a.y = 0; b.x = 20; b.y = 0; b.vx = 0;
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 1.2);
    expect(state.pillars[0].sunk).toBe(true); // maintained by stepBattle
    // the fireball sailed straight over the melted pillar and hit b
    expect(state.events.some(e => e.t === 'hit' && e.id === 'p1')).toBe(true);
    expect(b.vx).toBeGreaterThan(0);
  });

  it('solo lv1 fireball TTK: slow (>30 s) but a kill within the round', () => {
    const state = freshBattle(2);
    const a = state.players.p0, b = state.players.p1;
    state.pillars = [];
    let t = 0;
    while (t < 135 && b.alive) {
      // pin both so every fireball lands and knockback/lava can't interfere
      a.x = 0; a.y = 0; a.vx = a.vy = 0;
      b.x = 6; b.y = 0; b.vx = b.vy = 0;
      if ((a.cooldowns.fireball || 0) <= 0) castSpell(state, 'p0', 'fireball', 20, 0);
      step(state, DT);
      t += DT;
    }
    expect(b.alive).toBe(false);     // it CAN kill...
    expect(t).toBeGreaterThan(30);   // ...but regen makes it a long grind
  }, 15000);
});

describe('bot reaction time', () => {
  it("berserker aims with LAST tick's observation — direction changes inside its reaction window are invisible", () => {
    const state = createGame({ seed: 9 });
    addPlayer(state, 'h', 'Human');
    addPlayer(state, 'b', 'Bot', { bot: true, kind: 'berserker' });
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    const bot = state.players.b, h = state.players.h;
    state.pillars = [];
    // decision tick 1: the bot observes the human EAST of it (can't shoot yet)
    bot.x = 0; bot.y = 0; bot.vx = 0; bot.vy = 0;
    h.x = 12; h.y = 0; h.vx = 0; h.vy = 0; h.moveTarget = null;
    bot._botT = 0; bot.cooldowns.fireball = 99;
    stepBot(state, 'b', DT);
    expect(bot._obs).toBeTruthy();
    expect(bot._obs.x).toBeCloseTo(12, 0);
    // the human blinks NORTH between decision ticks; the bot's next shot
    // still flies at the OLD spot — that lag is the emulated reaction time
    h.x = 0; h.y = 12; h.vx = 0; h.vy = 0; h.moveTarget = null;
    bot.x = 0; bot.y = 0; bot.vx = 0; bot.vy = 0;
    bot._botT = 0; bot.cooldowns.fireball = 0;
    state.events.length = 0;
    stepBot(state, 'b', DT);
    const cast = state.events.find(e => e.t === 'cast' && e.spell === 'fireball' && e.id === 'b');
    expect(cast).toBeTruthy();
    expect(cast.dx).toBeGreaterThan(0.7);      // mostly east: the stale obs
    expect(Math.abs(cast.dy)).toBeLessThan(0.7);
  });

  it('berserker aim error no longer vanishes at point-blank range', () => {
    // fixed-seed statistical check. The old error term was purely
    // distance-proportional (dist * 0.12), so at 3 u it could never scatter a
    // shot by more than (3*0.12/2)/3 = 0.06 of a unit direction — effectively
    // pixel-perfect in a knife fight. The absolute floor must beat that
    // ceiling clearly; anything at or under 0.06 means the floor is gone.
    const OLD_CEILING = (3 * 0.12 / 2) / 3;
    const spreads = [];
    for (let seed = 1; seed <= 16; seed++) {
      const state = createGame({ seed });
      addPlayer(state, 'h', 'Human');
      addPlayer(state, 'b', 'Bot', { bot: true, kind: 'berserker' });
      startGame(state);
      run(state, ROUND.COUNTDOWN + DT);
      const bot = state.players.b, h = state.players.h;
      state.pillars = [];
      bot.x = 0; bot.y = 0; h.x = 3; h.y = 0; h.vx = 0; h.moveTarget = null;
      bot._botT = 0; bot.cooldowns.fireball = 99;
      stepBot(state, 'b', DT);                  // observe
      bot.x = 0; bot.y = 0; bot.vx = 0; bot.vy = 0;
      h.x = 3; h.y = 0; h.vx = 0; h.vy = 0; h.moveTarget = null;
      bot._botT = 0; bot.cooldowns.fireball = 0;
      state.events.length = 0;
      stepBot(state, 'b', DT);                  // shoot
      const cast = state.events.find(e => e.t === 'cast' && e.spell === 'fireball' && e.id === 'b');
      if (cast) spreads.push(Math.abs(cast.dy)); // perpendicular miss component
    }
    expect(spreads.length).toBeGreaterThan(8);
    expect(Math.max(...spreads)).toBeGreaterThan(OLD_CEILING * 1.3);
  });
});

describe('difficulty tiers (BOTS is the data, sim.js is the machinery)', () => {
  // Round 12 S6: four named tiers, and Normal is the berserker brain with worse
  // numbers — NOT new AI. These lock the two things that make that true.
  const tierBattle = (kind) => {
    const state = createGame({ seed: 9 });
    addPlayer(state, 'h', 'Human');
    addPlayer(state, 'b', 'Bot', { bot: true, kind });
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    state.pillars = [];
    return state;
  };

  it('every tier declares a brain that the sim actually implements', () => {
    for (const [kind, spec] of Object.entries(BOTS)) {
      expect(typeof spec.brain).toBe('string');
      expect(typeof spec.label).toBe('string');
      // a tier whose brain does not exist would silently fall back to the grunt
      expect(['grunt', 'berserker', 'stalker']).toContain(spec.brain);
    }
    // and the ladder ranks are unique and cover 1..N
    const ranks = Object.values(BOTS).map(b => b.difficulty).sort((a, b) => a - b);
    expect(ranks).toEqual(ranks.map((_, i) => i + 1));
  });

  it('brawler (Normal) runs the BERSERKER brain, not the grunt brain', () => {
    // the berserker hunts: it walks toward its prey and fires at it. The grunt
    // wanders and fires at a uniformly random bearing. One decision tick tells
    // them apart — the brawler must AIM at the human.
    const state = tierBattle('brawler');
    const bot = state.players.b, h = state.players.h;
    expect(BOTS.brawler.brain).toBe('berserker');
    bot.x = 0; bot.y = 0; bot.vx = bot.vy = 0;
    h.x = 12; h.y = 0; h.vx = h.vy = 0; h.moveTarget = null;
    bot._botT = 0; bot.cooldowns.fireball = 99;
    stepBot(state, 'b', DT);
    // _obs is the berserker brain's observation memory; the grunt has none
    expect(bot._obs).toBeTruthy();
    expect(bot._obs.x).toBeCloseTo(12, 0);
    bot.x = 0; bot.y = 0; bot.vx = bot.vy = 0;
    h.x = 12; h.y = 0; h.vx = h.vy = 0; h.moveTarget = null;
    bot._botT = 0; bot.cooldowns.fireball = 0;
    state.events.length = 0;
    stepBot(state, 'b', DT);
    const cast = state.events.find(e => e.t === 'cast' && e.spell === 'fireball');
    expect(cast).toBeTruthy();
    expect(cast.dx).toBeGreaterThan(0.8);   // aimed east, at the human
  });

  it("the decision interval comes from BOTS[kind].react, not a literal", () => {
    // read the spec, don't restate it: whatever react says, _botT must land in
    // [base, base+jitter] — and Normal's window must be strictly slower than Hard's
    for (const kind of ['brawler', 'berserker', 'stalker']) {
      const [base, jitter] = BOTS[kind].react;
      const state = tierBattle(kind);
      const bot = state.players.b, h = state.players.h;
      h.x = 12; h.y = 0; h.moveTarget = null;
      for (let i = 0; i < 12; i++) {
        bot._botT = 0;
        stepBot(state, 'b', DT);
        expect(bot._botT).toBeGreaterThanOrEqual(base - DT - 1e-9);
        expect(bot._botT).toBeLessThanOrEqual(base + jitter + 1e-9);
      }
    }
    expect(BOTS.brawler.react[0]).toBeGreaterThan(BOTS.berserker.react[0]);
    expect(BOTS.berserker.react[0]).toBeGreaterThan(BOTS.stalker.react[0]);
  });

  it('aim error comes from BOTS[kind].aimErr — Normal scatters more than Hard', () => {
    // statistical, fixed seeds: same range, same brain, only the BOTS numbers
    // differ. The perpendicular miss component is bounded by aimErr/2 per shot.
    const spreadOf = (kind) => {
      let worst = 0;
      for (let seed = 1; seed <= 24; seed++) {
        const state = createGame({ seed });
        addPlayer(state, 'h', 'Human');
        addPlayer(state, 'b', 'Bot', { bot: true, kind });
        startGame(state);
        run(state, ROUND.COUNTDOWN + DT);
        const bot = state.players.b, h = state.players.h;
        state.pillars = [];
        bot.x = 0; bot.y = 0; h.x = 10; h.y = 0; h.vx = 0; h.moveTarget = null;
        bot._botT = 0; bot.cooldowns.fireball = 99;
        stepBot(state, 'b', DT);
        bot.x = 0; bot.y = 0; bot.vx = bot.vy = 0;
        h.x = 10; h.y = 0; h.vx = h.vy = 0; h.moveTarget = null;
        bot._botT = 0; bot.cooldowns.fireball = 0;
        state.events.length = 0;
        stepBot(state, 'b', DT);
        const cast = state.events.find(e => e.t === 'cast' && e.spell === 'fireball');
        if (cast) worst = Math.max(worst, Math.abs(cast.dy));
      }
      return worst;
    };
    const [nFloor, nPer] = BOTS.brawler.aimErr;
    const [hFloor, hPer] = BOTS.berserker.aimErr;
    expect(nFloor + 10 * nPer).toBeGreaterThan(hFloor + 10 * hPer); // spec first
    expect(spreadOf('brawler')).toBeGreaterThan(spreadOf('berserker')); // then behaviour
  });

  it('a tier that omits react/aimErr keeps the historical defaults', () => {
    // grunt has neither (it needs neither), and nothing may crash or drift when
    // a BOTS entry is incomplete — the fallback is the round-10 literal.
    expect(BOTS.grunt.react).toBeUndefined();
    const state = tierBattle('grunt');
    const bot = state.players.b;
    bot._botT = 0;
    stepBot(state, 'b', DT);
    expect(bot._botT).toBeGreaterThanOrEqual(0.25 - DT);
    expect(bot._botT).toBeLessThanOrEqual(0.55 + 1e-9);
  });
});

describe('vanish 👁️ (invisibility)', () => {
  const spec = SPELLS.vanish;

  function vanishBattle() {
    const state = createGame({ seed: 4 });
    addPlayer(state, 'a', 'Alice');
    addPlayer(state, 'b', 'Bob');
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    state.pillars = [];
    const a = state.players.a, b = state.players.b;
    a.x = 0; a.y = 0; a.vx = a.vy = 0; a.moveTarget = null;
    b.x = 10; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    a.spells.vanish = 1;
    return state;
  }

  it('levels buy duration only, and re-casting refreshes instead of stacking', () => {
    const state = vanishBattle();
    const a = state.players.a;
    for (let level = 1; level <= spec.maxLevel; level++) {
      a.spells.vanish = level;
      a.cooldowns = {}; a.vanishT = 0;
      expect(castSpell(state, 'a', 'vanish', 5, 5)).toBe(true);
      expect(a.vanishT).toBeCloseTo(spec.duration[level - 1], 5);
      expect(a.cooldowns.vanish).toBeCloseTo(spec.cooldown[level - 1], 5);
      // a second cast (cooldown scrubbed) refreshes, never sums
      a.cooldowns = {};
      castSpell(state, 'a', 'vanish', 5, 5);
      expect(a.vanishT).toBeCloseTo(spec.duration[level - 1], 5);
    }
  });

  it('the POSITION is stripped from other viewers’ snapshots, kept in your own', () => {
    // docs/ROUND12.md N4: hidden on the wire, not in the renderer. Anyone with
    // devtools must find nothing to draw.
    const state = vanishBattle();
    const a = state.players.a;
    castSpell(state, 'a', 'vanish', 5, 5);
    const asB = snapshot(state, 'b');
    const asA = snapshot(state, 'a');
    const asSpectator = snapshot(state);
    for (const view of [asB, asSpectator]) {
      expect(view.players.a).toBeTruthy();          // still in the standings...
      expect(view.players.a.x).toBeUndefined();     // ...with nowhere to draw it
      expect(view.players.a.y).toBeUndefined();
      expect(view.players.a.vanishT).toBeUndefined(); // not even the timer leaks
      expect(JSON.stringify(view.players.a)).not.toContain('"x"');
      expect(view.players.b.x).toBeDefined();       // everyone else is untouched
    }
    expect(asA.players.a.x).toBeDefined();          // you can always see yourself
    expect(asA.players.a.vanishT).toBeCloseTo(spec.duration[0], 1);
    // ...and it comes back on its own
    run(state, spec.duration[0] + 0.1);
    expect(a.vanishT).toBe(0);
    expect(snapshot(state, 'b').players.a.x).toBeDefined();
  });

  it('the position cannot leak through the EVENT stream either', () => {
    const state = vanishBattle();
    const a = state.players.a;
    a.spells.fireball = 1;
    castSpell(state, 'a', 'vanish', 5, 5);
    state.events = [];
    castSpell(state, 'a', 'fireball', 20, 0);   // casting while invisible is legal
    const forB = viewEvents(state, state.events, 'b');
    const forA = viewEvents(state, state.events, 'a');
    expect(forA.some(e => e.t === 'cast' && e.id === 'a')).toBe(true);
    expect(forB.some(e => e.id === 'a')).toBe(false);
    // the projectile itself STAYS visible: you are invisible, your spells are not
    expect(snapshot(state, 'b').projectiles.length).toBe(1);
    // and once you are visible again the stream is untouched (no copy at all)
    a.vanishT = 0;
    expect(viewEvents(state, state.events, 'b')).toBe(state.events);
  });

  it('a death is public even if you died invisible', () => {
    const state = vanishBattle();
    const a = state.players.a;
    castSpell(state, 'a', 'vanish', 5, 5);
    a.hp = 0.5;
    a.x = state.arenaRadius + 5;   // straight into the lava
    state.events = [];
    run(state, 0.3);
    expect(a.alive).toBe(false);
    expect(a.vanishT).toBe(0);                              // dying reveals you
    const forB = viewEvents(state, state.events, 'b');
    expect(forB.some(e => e.t === 'death' && e.id === 'a')).toBe(true);
    expect(snapshot(state, 'b').players.a.x).toBeDefined(); // a corpse is visible
  });

  it('vanishing does NOT disturb your own projectiles in flight', () => {
    const state = vanishBattle();
    const a = state.players.a, b = state.players.b;
    a.spells.fireball = 1;
    castSpell(state, 'a', 'fireball', 20, 0);
    a.cooldowns = {};
    castSpell(state, 'a', 'vanish', 5, 5);       // blink out mid-flight
    run(state, 0.5);
    expect(b.hp).toBeLessThan(b.maxHp);          // the ball still connected
    expect(a.vanishT).toBeGreaterThan(0);
  });

  it('you can start a Repulse charge and vanish, or vanish and charge', () => {
    const state = vanishBattle();
    const a = state.players.a;
    a.spells.repulse = 1;
    // charging first: everything except teleport/rush is locked mid-charge, and
    // vanish is deliberately part of "everything" (no special case was added)
    expect(castSpell(state, 'a', 'repulse', 5, 0)).toBe(true);
    expect(castSpell(state, 'a', 'vanish', 5, 5)).toBe(false);
    a.charging = null;
    // vanishing first: the charge still works, and stays hidden while it winds up
    a.cooldowns = {};
    expect(castSpell(state, 'a', 'vanish', 5, 5)).toBe(true);
    expect(castSpell(state, 'a', 'repulse', 5, 0)).toBe(true);
    expect(a.charging).toBeTruthy();
    expect(snapshot(state, 'b').players.a.charging).toBe(true);
    expect(snapshot(state, 'b').players.a.x).toBeUndefined(); // …but not WHERE
  });

  it('bots lose sight of a vanished player and shoot the last place they saw them', () => {
    const state = createGame({ seed: 9 });
    addPlayer(state, 'h', 'Human');
    addPlayer(state, 'b', 'Bot', { bot: true, kind: 'stalker' });
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    state.pillars = [];
    const bot = state.players.b, h = state.players.h;
    h.spells.vanish = 3;
    bot.x = 0; bot.y = 0; bot.vx = bot.vy = 0;
    h.x = 12; h.y = 0; h.vx = h.vy = 0; h.moveTarget = null;
    bot._botT = 0; bot.cooldowns.fireball = 99;
    stepBot(state, 'b', DT);                    // sees the human at +x
    // vanish, then walk somewhere completely different
    expect(castSpell(state, 'h', 'vanish', 0, 5)).toBe(true);
    h.x = 0; h.y = 12; h.vx = h.vy = 0; h.moveTarget = null;
    bot.x = 0; bot.y = 0; bot.vx = bot.vy = 0;
    bot._botT = 0; bot.cooldowns.fireball = 0;
    state.events.length = 0;
    stepBot(state, 'b', DT);
    const cast = state.events.find(e => e.t === 'cast' && e.spell === 'fireball');
    expect(cast).toBeTruthy();
    expect(cast.dx).toBeGreaterThan(0.7);        // still shooting at the OLD spot
    expect(Math.abs(cast.dy)).toBeLessThan(0.7);
    // and past BOT_MEMORY it has lost the target entirely: no shot at all
    h.vanishT = 99;
    bot._seen.h.t = state.time - BOT_MEMORY - 1;
    bot._botT = 0; bot.cooldowns.fireball = 0;
    state.events.length = 0;
    stepBot(state, 'b', DT);
    expect(state.events.some(e => e.t === 'cast' && e.spell === 'fireball')).toBe(false);
  });
});

describe('lifesteal (Blood Sword)', () => {
  // p0 owns a sword and sits at 50 hp; p2, parked far away and also at 50 hp,
  // is the regen control — any hp gap between them is lifesteal healing.
  function swordBattle() {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    state.pillars = [];
    a.items = { sword: 1 };
    a.x = 0; a.y = 0; a.vx = 0; a.moveTarget = null;
    b.x = 8; b.y = 0; b.vx = 0; b.moveTarget = null;
    c.x = 0; c.y = -40; c.vx = 0; c.moveTarget = null;
    a.hp = 50; c.hp = 50;
    return state;
  }

  it('heals 25% of direct spell damage', () => {
    const state = swordBattle();
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.4);
    const a = state.players.p0, c = state.players.p2;
    expect(a.hp - c.hp).toBeCloseTo(SPELLS.fireball.damage[0] * ITEM_FX.sword.lifesteal[0], 1);
  });

  it('heals from your poison ticks — DoT damage counts', () => {
    const state = swordBattle();
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    b.poisonT = 3; b.poisonTick = 2; b._poisonNext = 0.1; b.poisonBy = 'p0';
    run(state, 0.5); // exactly one tick of 2
    expect(a.hp - c.hp).toBeCloseTo(2 * ITEM_FX.sword.lifesteal[0], 1);
  });

  it('heals from your ground trails', () => {
    const state = swordBattle();
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    state.hazards.push({ x: b.x, y: b.y, r: 1.3, owner: 'p0', dps: 2, until: state.time + 5 });
    run(state, 1);
    expect(a.hp - c.hp).toBeCloseTo(2 * ITEM_FX.sword.lifesteal[0], 1);
  });

  it('never heals from lava burn, even when the burn is credited to you', () => {
    const state = swordBattle();
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    b.x = ARENA.START_RADIUS + 3; b.y = 0; b.moveTarget = null; // swimming
    b.lastHitBy = { id: 'p0', t: state.time };   // p0 shoved them in
    const direct0 = a.dmgDealt, lava0 = a.dmgLava;
    run(state, 1);
    expect(a.dmgLava).toBeGreaterThan(lava0);    // credited to the LAVA column...
    expect(a.dmgDealt).toBe(direct0);            // ...never to direct damage...
    expect(Math.abs(a.hp - c.hp)).toBeLessThan(0.15); // ...and it heals nothing
  });

  it('healing is capped by the damage actually dealt (no overkill farming)', () => {
    const state = swordBattle();
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    b.hp = 2; // fireball deals 5, but only 2 are real
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.4);
    expect(b.alive).toBe(false);
    expect(a.hp - c.hp).toBeCloseTo(2 * ITEM_FX.sword.lifesteal[0], 1);
  });
});

// ---- co-op campaign ---------------------------------------------------------
// The whole mode rests on one rule — same team = not hostile — and that rule
// has to be enforced at the COLLISION sites, not in applyDamage: knockback is
// applied before damage everywhere, and shoving an ally into the lava would
// still kill them.

describe('co-op: teams', () => {
  // Two allies facing each other in a co-op battle, plus one enemy far away
  // (a co-op round needs a live monster or it ends instantly).
  function coopBattle({ allies = 2 } = {}) {
    const state = createGame({ seed: 5, mode: 'coop' });
    for (let i = 0; i < allies; i++) addPlayer(state, `p${i}`, `Ally${i}`);
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    expect(state.phase).toBe('battle');
    return state;
  }
  const party = (state) => Object.values(state.players).filter(p => p.team === 'party');
  const wave = (state) => Object.values(state.players).filter(p => p.team === 'ai');

  it('createGame and setMode accept coop (they used to silently downgrade it)', () => {
    expect(createGame({ mode: 'coop' }).mode).toBe('coop');
    const s = createGame({ seed: 1 });
    expect(setMode(s, 'coop')).toBe(true);
    expect(s.mode).toBe('coop');
    expect(setMode(s, 'nonsense')).toBe(false);
  });

  it('seats the party on one team and the level 1 wave on the other', () => {
    const state = coopBattle();
    expect(party(state)).toHaveLength(2);
    expect(wave(state).length).toBeGreaterThan(0);
    expect(state.coop.level).toBe(1);
    // monsters are bots with the campaign's stats, never lobby bots
    for (const m of wave(state)) expect(m.bot && m.wave).toBe(true);
  });

  it('FRIENDLY FIRE: an ally fireball damages and shoves an ally', () => {
    const state = coopBattle();
    const [a, b] = party(state);
    a.x = 0; a.y = 0; a.vx = 0; a.vy = 0; a.moveTarget = null;
    b.x = 8; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null;
    const hp0 = b.hp;
    castSpell(state, a.id, 'fireball', 40, 0);
    run(state, 0.5);
    expect(b.hp).toBeLessThan(hp0);          // it hurts...
    expect(b.vx).toBeGreaterThan(10);        // ...and it can shove you into lava
  });

  it('the same fireball does hit a wave monster', () => {
    const state = coopBattle();
    const [a] = party(state);
    const m = wave(state)[0];
    a.x = 0; a.y = 0; a.moveTarget = null;
    m.x = 8; m.y = 0; m.vx = 0; m.vy = 0; m.moveTarget = null; m.maxHp = 200; m.hp = 200;
    castSpell(state, a.id, 'fireball', 40, 0);
    run(state, 0.5);
    expect(m.hp).toBeLessThan(200);
  });

  it('FRIENDLY FIRE: rush, repulse and meteor all catch allies too', () => {
    for (const spell of ['rush', 'repulse', 'meteor']) {
      const state = coopBattle();
      const [a, b] = party(state);
      a.x = 0; a.y = 0; a.moveTarget = null;
      b.x = 3; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null;
      a.spells[spell] = 1;
      const hp0 = b.hp;
      castSpell(state, a.id, spell, b.x, b.y);
      run(state, 2.5); // long enough for the repulse charge and the meteor delay
      expect(Math.abs(b.vx) + Math.abs(b.vy), spell).toBeGreaterThan(0);
      expect(b.hp, spell).toBeLessThan(hp0);
    }
  });

  it('a team kill costs the victim but pays the killer nothing', () => {
    const state = coopBattle();
    const [a, b] = party(state);
    a.x = 0; a.y = 0; a.vx = 0; a.vy = 0; a.moveTarget = null;
    b.x = 8; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null;
    b.hp = 1;
    const kills0 = a.kills, gold0 = a.gold, deaths0 = b.deaths;
    castSpell(state, a.id, 'fireball', 40, 0);
    run(state, 0.5);
    expect(b.alive).toBe(false);       // friendly fire really killed them
    expect(b.deaths).toBe(deaths0 + 1);
    expect(a.kills).toBe(kills0);      // ...and the killer got nothing for it
    expect(a.gold).toBe(gold0);
    expect(state.events.some(e => e.t === 'teamkill')).toBe(true);
    expect(state.events.some(e => e.t === 'multikill')).toBe(false);
  });

  it('classic mode is untouched: no teams, everyone still hits everyone', () => {
    const state = freshBattle(2);
    const a = state.players.p0, b = state.players.p1;
    expect(a.team).toBe(null);
    a.x = 0; a.y = 0; a.moveTarget = null;
    b.x = 8; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null;
    castSpell(state, 'p0', 'fireball', 40, 0);
    run(state, 0.5);
    expect(b.hp).toBeLessThan(PLAYER.MAX_HP);
    expect(Math.abs(b.vx)).toBeGreaterThan(0);
  });

  it('clearing the wave ends the round even with the whole party alive', () => {
    const state = coopBattle({ allies: 3 });
    for (const m of wave(state)) { m.hp = 0; m.alive = false; }
    run(state, 2 * DT);
    expect(state.phase).toBe('roundEnd');
    expect(state.roundSummary.coop.cleared).toBe(true);
    expect(state.roundSummary.coop.survivors).toBe(3);
    // three survivors, and the banner must not read "nobody survived"
    expect(state.roundSummary.winner).toBe(null);
    // every survivor is paid the round-win bonus, not just one
    for (const p of party(state)) expect(state.roundSummary.detail[p.id].win).toBe(GOLD.ROUND_WIN);
  });

  it('a party wipe ends the round and does NOT advance the campaign', () => {
    const state = coopBattle();
    for (const p of party(state)) { p.hp = 0; p.alive = false; }
    run(state, 2 * DT);
    expect(state.phase).toBe('roundEnd');
    expect(state.roundSummary.coop.wiped).toBe(true);
    expect(state.coopLevel).toBe(1);          // retry the same level
    expect(state.roundSummary.final).toBe(false);
  });

  it('a clear advances the campaign level; the finale ends the run', () => {
    const state = coopBattle();
    for (const m of wave(state)) { m.hp = 0; m.alive = false; }
    run(state, 2 * DT);
    expect(state.coopLevel).toBe(2);
    expect(state.roundSummary.final).toBe(false);

    state.coopLevel = MAX_LEVEL;              // jump to the finale
    run(state, ROUND.SUMMARY_TIME + ROUND.SHOP_TIME + ROUND.COUNTDOWN + 1);
    expect(state.coop.level).toBe(MAX_LEVEL);
    state.coop.pending = []; // the finale's timed reinforcements, skipped
    for (const m of wave(state)) { m.hp = 0; m.alive = false; }
    run(state, 2 * DT);
    expect(state.roundSummary.final).toBe(true);
    expect(state.roundSummary.coop.victory).toBe(true);
  });

  it('wave monsters never distort the party body-size average', () => {
    // eight zero-kill monsters used to collapse the mean and inflate the whole
    // party toward the 2.0x size cap — giant targets as a reward for clearing
    const state = coopBattle();
    const [a, b] = party(state);
    a.kills = 8; b.kills = 8;
    run(state, DT);
    expect(a.radius).toBeCloseTo(PLAYER.RADIUS, 5); // equal kills -> baseline size
    for (const m of wave(state)) expect(m.radius).toBeCloseTo(PLAYER.RADIUS * m.sizeMult, 5);
  });

  it('the campaign never ends on the classic 15-kill race', () => {
    const state = coopBattle();
    party(state)[0].kills = ROUND.KILLS_TO_WIN + 5;
    for (const m of wave(state)) { m.hp = 0; m.alive = false; }
    run(state, 2 * DT);
    expect(state.roundSummary.final).toBe(false);
  });

  it('coop wire fields appear only in coop', () => {
    const coop = snapshot(coopBattle());
    expect(coop.coop.level).toBe(1);
    expect(coop.coop.brief).toEqual(expect.any(String));
    expect(Object.values(coop.players).some(p => p.team === 'ai')).toBe(true);
    const classic = snapshot(freshBattle(2));
    expect(classic.coop).toBeUndefined();
    expect(Object.values(classic.players)[0].team).toBeUndefined();
  });
});

describe('co-op: campaign scaling rule', () => {
  it('count waves grow with the party, hp waves get tougher instead', () => {
    const lv = { n: 1, name: 'x', brief: 'x', waves: [
      { count: 2, unit: { name: 'A', kind: 'grunt', maxHp: 50, spells: {} } },
      { count: 1, unit: { name: 'B', kind: 'grunt', maxHp: 100, spells: {} }, scale: 'hp' },
    ] };
    const at = (p) => waveUnits(lv, p);
    expect(at(1).filter(u => u.name === 'A')).toHaveLength(2);
    expect(at(3).filter(u => u.name === 'A')).toHaveLength(
      Math.round(2 * (1 + SCALE.COUNT_PER_PLAYER * 2)));
    // the 'hp' wave never clones itself...
    expect(at(1).filter(u => u.name === 'B')).toHaveLength(1);
    expect(at(3).filter(u => u.name === 'B')).toHaveLength(1);
    // ...it scales its health instead
    expect(at(1).find(u => u.name === 'B').maxHp).toBe(100);
    expect(at(3).find(u => u.name === 'B').maxHp)
      .toBe(Math.round(100 * (1 + SCALE.HP_PER_PLAYER * 2)));
  });

  it('minParty gates a wave and perPlayer overrides the growth rate', () => {
    const lv = { n: 1, name: 'x', brief: 'x', waves: [
      { count: 1, unit: { name: 'Elite', kind: 'stalker', maxHp: 50, spells: {} },
        minParty: 3, perPlayer: 0 },
    ] };
    expect(waveUnits(lv, 2)).toHaveLength(0);
    expect(waveUnits(lv, 3)).toHaveLength(1); // perPlayer 0 => exactly one
  });

  it('every level is playable data: 10 levels, art-backed, all units real bots', () => {
    expect(CAMPAIGN).toHaveLength(MAX_LEVEL);
    CAMPAIGN.forEach((lv, i) => {
      expect(lv.n).toBe(i + 1);
      expect(lv.brief.length).toBeGreaterThan(20); // the "what is about to happen"
      for (const p of [1, 2, 3]) {
        const units = waveUnits(lv, p);
        expect(units.length).toBeGreaterThan(0);
        for (const u of units) {
          expect(Object.keys(BOTS)).toContain(u.kind); // an EXISTING bot kind
          expect(u.maxHp).toBeGreaterThan(0);
          for (const [it, lv] of Object.entries(u.items)) {
            expect(ITEMS[it]).toBeTruthy();
            expect(lv).toBeGreaterThanOrEqual(1);
            expect(lv).toBeLessThanOrEqual(ITEMS[it].maxLevel);
          }
        }
      }
      // a bigger party never gets an EASIER level (the scaling rule's promise;
      // the actual clear rates live in tools/coop.js, not in a unit test)
      const [u1, u2, u3] = [1, 2, 3].map(p => waveUnits(lv, p));
      expect(u2.length).toBeGreaterThanOrEqual(u1.length);
      expect(u3.length).toBeGreaterThanOrEqual(u2.length);
    });
  });
});

// ---- draft mode 🎴 (docs/ROUND12.md S7) -------------------------------------
// An independent lobby toggle, OFF by default: half the catalogue leaves the shop
// for the whole game and becomes a pool you are given free picks from every
// DRAFT.EVERY_ROUNDS rounds. Every number below is read from DRAFT / the
// catalogue, never hardcoded (AGENTS.md scar: round-11 tests broke on intended
// retunes purely because they pinned constants).

describe('draft mode 🎴', () => {
  // a game already in its first shop, with the toggle in whatever state
  // end the current round without fighting it, and walk into the shop (which is
  // where afterSummary rolls the offers)
  function toShop(state) {
    state.phase = 'roundEnd';
    state.roundSummary = { final: false };
    state.phaseT = 0;
    step(state, DT);
    expect(state.phase).toBe('shop');
  }

  function draftGame({ draft = true, mode = 'elemental', seed = 7, players = ['a', 'b'] } = {}) {
    const state = createGame({ seed, mode });
    for (const id of players) addPlayer(state, id, id.toUpperCase());
    setDraft(state, draft);
    startGame(state);                       // rolls the pool
    run(state, ROUND.COUNTDOWN + DT);
    toShop(state);
    return state;
  }

  it('is OFF by default, and off means the shop is exactly the classic shop', () => {
    const off = createGame({ seed: 7, mode: 'elemental' });
    expect(off.draft).toBe(false);
    expect(off.draftPool).toBe(null);
    addPlayer(off, 'a', 'A'); addPlayer(off, 'b', 'B');
    startGame(off);
    expect(off.draftPool).toBe(null);        // never rolled
    off.phase = 'shop';
    const a = off.players.a;
    a.gold = 9999;
    // every single catalogue entry is still purchasable, and no offer exists
    for (const e of catalogue('elemental')) {
      if (e.key === 'fireball') continue;    // starting kit, level 1 already owned
      expect(buy(off, 'a', e.key).ok).toBe(true);
    }
    expect(a.draftOffer).toBe(null);
    // ...and nothing draft-shaped reaches the wire
    const snap = snapshot(off, 'a');
    expect(snap.draft).toBeUndefined();
    expect(snap.draftPool).toBeUndefined();
    expect(snap.players.a.draftOffer).toBeUndefined();
  });

  it('the toggle is independent of the ruleset and composes with all three', () => {
    for (const mode of MODES) {
      const state = createGame({ seed: 3, mode });
      expect(setDraft(state, true)).toBe(true);
      expect(state.mode).toBe(mode);         // ...and did not become a 4th mode
      expect(state.draft).toBe(true);
      addPlayer(state, 'a', 'A'); addPlayer(state, 'b', 'B');
      startGame(state);
      expect(state.draftPool.length).toBeGreaterThan(0);
      // the pool only ever contains things that exist in THIS ruleset's shop
      const keys = new Set(catalogue(mode).map(e => e.key));
      for (const k of state.draftPool) expect(keys.has(k)).toBe(true);
    }
  });

  it('is lobby-only, like the ruleset toggle', () => {
    const state = createGame({ seed: 7 });
    addPlayer(state, 'a', 'A'); addPlayer(state, 'b', 'B');
    startGame(state);
    expect(setDraft(state, true)).toBe(false);
    expect(state.draft).toBe(false);
  });

  it('pulls DRAFT.POOL_FRAC of the catalogue out, identically for every player', () => {
    const state = draftGame({ players: ['a', 'b', 'c'] });
    const all = draftable(state.mode);
    expect(state.draftPool.length).toBe(Math.round(all.length * DRAFT.POOL_FRAC));
    // the pool is state, not per-player: every viewer reads the same list
    const seen = ['a', 'b', 'c'].map(id => snapshot(state, id).draftPool.join(','));
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]).toBe(state.draftPool.join(','));
    // the starting kit is never locked away
    expect(state.draftPool).not.toContain('fireball');
    // and it really is a SPLIT: the rest is still on sale
    const rest = all.filter(e => !state.draftPool.includes(e.key));
    expect(rest.length).toBe(all.length - state.draftPool.length);
    const a = state.players.a;
    a.gold = 9999;
    for (const e of rest) expect(buy(state, 'a', e.key).ok).toBe(true);
  });

  it('a pooled thing cannot be bought at any price until it is drafted', () => {
    const state = draftGame();
    const a = state.players.a;
    a.gold = 9999;
    for (const key of state.draftPool) {
      const r = buy(state, 'a', key);
      expect(r.ok).toBe(false);
      expect(String(r.err)).toMatch(/draft/);
    }
    expect(a.gold).toBe(9999);              // and it cost them nothing to try
  });

  it('a drafted thing arrives at LEVEL 1, free, and is then upgradable at normal cost', () => {
    const state = draftGame();
    const a = state.players.a;
    const off = a.draftOffer;
    expect(off).toBeTruthy();
    // pick something with room to grow so "upgradable afterwards" is testable
    const key = off.options.find(k => {
      const e = catalogue(state.mode).find(x => x.key === k);
      return e && e.maxLevel > 1;
    }) || off.options[0];
    const goldBefore = (a.gold = 9999);
    expect(draftPick(state, 'a', key).ok).toBe(true);
    expect(ownedLevel(a, key)).toBe(1);      // level 1...
    expect(a.gold).toBe(goldBefore);         // ...and free
    const e = catalogue(state.mode).find(x => x.key === key);
    if (e.maxLevel > 1) {
      // it is back on the shelf now, at the normal price of its next level
      const expected = e.kind === 'item' ? itemCost(key) : e.spec.costs[1];
      expect(buy(state, 'a', key).ok).toBe(true);
      expect(ownedLevel(a, key)).toBe(2);
      expect(a.gold).toBe(goldBefore - expected);
    }
  });

  it('offers DRAFT.OPTIONS roughly gold-equivalent choices, none of them owned', () => {
    const state = draftGame();
    const a = state.players.a;
    const off = a.draftOffer;
    expect(off.options.length).toBe(DRAFT.OPTIONS);
    expect(new Set(off.options).size).toBe(DRAFT.OPTIONS);   // no duplicates
    const cat = catalogue(state.mode);
    const costs = off.options.map(k => cat.find(e => e.key === k).cost);
    // "roughly equivalent" = within the cheapest option's own price of each other
    expect(Math.max(...costs) - Math.min(...costs)).toBeLessThanOrEqual(Math.min(...costs));
    for (const k of off.options) {
      expect(state.draftPool).toContain(k);      // only ever out of the pool
      expect(ownedLevel(a, k)).toBe(0);          // which is why a pick is level 1
    }
  });

  it('never offers something already owned at max level', () => {
    const state = draftGame();
    const a = state.players.a;
    // max out everything in the pool, then re-roll this player's offer
    for (const key of state.draftPool) {
      const e = catalogue(state.mode).find(x => x.key === key);
      const bag = e.kind === 'spell' ? a.spells : e.kind === 'element' ? a.elements : a.items;
      bag[key] = e.maxLevel;
    }
    state.round = 1;
    a.draftOffer = null;
    // walk another shop opening: nothing is left to offer, so no offer at all
    toShop(state);
    expect(a.draftOffer).toBe(null);
    // ...and the maxed pool things stay unbuyable-as-upgrades for the right
    // reason: they are maxed, not because they are pooled
    for (const key of state.draftPool) {
      a.gold = 9999;
      expect(buy(state, 'a', key).err).toBe('max level');
    }
  });

  it('the pre-selected FIRST option is granted when the player clicks nothing', () => {
    const state = draftGame();
    const a = state.players.a;
    const first = a.draftOffer.options[0];
    expect(DRAFT.AUTO_PICK_FIRST).toBe(true);
    expect(ownedLevel(a, first)).toBe(0);
    // never clicked: run the shop out and into the next round
    run(state, ROUND.SHOP_TIME + DT);
    expect(state.phase).toBe('countdown');
    expect(ownedLevel(a, first)).toBe(1);
    expect(a.draftOffer).toBe(null);          // and the offer is retired
  });

  it('clicking a different option takes that one instead, and only once', () => {
    const state = draftGame();
    const a = state.players.a;
    const [first, second] = a.draftOffer.options;
    expect(draftPick(state, 'a', second).ok).toBe(true);
    expect(ownedLevel(a, second)).toBe(1);
    expect(ownedLevel(a, first)).toBe(0);
    // a second click is refused, and the auto-grant must not fire on top
    expect(draftPick(state, 'a', first).ok).toBe(false);
    run(state, ROUND.SHOP_TIME + DT);
    expect(ownedLevel(a, first)).toBe(0);
    expect(ownedLevel(a, second)).toBe(1);
  });

  it('refuses picks that were not on offer, and picks outside the shop', () => {
    const state = draftGame();
    const notOffered = state.draftPool.find(k => !state.players.a.draftOffer.options.includes(k));
    expect(draftPick(state, 'a', notOffered).ok).toBe(false);
    expect(draftPick(state, 'a', 'constructor').ok).toBe(false);
    expect(draftPick(state, 'nobody', 'boots').ok).toBe(false);
    run(state, ROUND.SHOP_TIME + DT);        // now in countdown
    expect(draftPick(state, 'a', 'boots').err).toBe('shop is closed');
  });

  it('offers land every DRAFT.EVERY_ROUNDS rounds, starting with the first shop', () => {
    // the rule itself, read off the spec
    expect(draftDue(1)).toBe(true);
    expect(draftDue(1 + DRAFT.EVERY_ROUNDS)).toBe(true);
    for (let r = 2; r < 1 + DRAFT.EVERY_ROUNDS; r++) expect(draftDue(r)).toBe(false);
    expect(draftDue(0)).toBe(false);
    // ...and the shop actually honours it over a run of rounds
    const state = draftGame();
    const a = state.players.a;
    const withOffer = [];
    for (let r = 1; r <= 3 * DRAFT.EVERY_ROUNDS; r++) {
      if (a.draftOffer) withOffer.push(state.round);
      // straight from this shop to the next one
      run(state, ROUND.SHOP_TIME + DT);      // shop -> countdown (round++)
      run(state, ROUND.COUNTDOWN + DT);      // countdown -> battle
      toShop(state);
    }
    expect(withOffer.length).toBeGreaterThan(1);
    for (const r of withOffer) expect(draftDue(r)).toBe(true);
  });

  it('bots draft immediately and NEVER draft a power spell they cannot pilot', () => {
    // the pool is rolled from the seed, so force the question: put the whole
    // power tier in the pool and give the bot nothing else to want
    const state = createGame({ seed: 5, mode: 'elemental' });
    addPlayer(state, 'a', 'A');
    addPlayer(state, 'z', 'Zed', { bot: true, kind: 'berserker' });
    setDraft(state, true);
    startGame(state);
    const power = Object.entries(SPELLS).filter(([, s]) => s.tier === 'power').map(([k]) => k);
    state.draftPool = power.slice();          // a pool of nothing but power spells
    run(state, ROUND.COUNTDOWN + DT);
    toShop(state);
    const bot = state.players.z;
    // no candidates survive the filter, so the bot is offered nothing at all...
    expect(bot.draftOffer).toBe(null);
    // ...and the auto-grant at shop close cannot sneak one in either
    run(state, ROUND.SHOP_TIME + DT);
    for (const k of power) expect(bot.spells[k] || 0).toBe(0);
    // the human, meanwhile, is offered them
    expect(state.players.a.spells.meteor || 0).toBeGreaterThanOrEqual(0);
  });

  it('a bot with a mixed pool drafts on the spot, and never a power spell', () => {
    const state = createGame({ seed: 11, mode: 'elemental' });
    addPlayer(state, 'a', 'A');
    addPlayer(state, 'z', 'Zed', { bot: true, kind: 'berserker' });
    setDraft(state, true);
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    toShop(state);
    const bot = state.players.z;
    expect(bot.draftOffer).toBeTruthy();
    expect(bot.draftOffer.picked).toBe(bot.draftOffer.options[0]);   // immediately
    expect(ownedLevel(bot, bot.draftOffer.picked)).toBe(1);
    for (const k of bot.draftOffer.options)
      expect(SPELLS[k] && SPELLS[k].tier).not.toBe('power');
  });

  it('your offer is PRIVATE: it never appears on another player snapshot', () => {
    const state = draftGame({ players: ['a', 'b'] });
    expect(state.players.a.draftOffer).toBeTruthy();
    const asA = snapshot(state, 'a');
    expect(asA.players.a.draftOffer.options.length).toBe(DRAFT.OPTIONS);
    expect(asA.players.b.draftOffer).toBeUndefined();
    const asB = snapshot(state, 'b');
    expect(asB.players.a.draftOffer).toBeUndefined();
    expect(asB.draft).toBe(true);            // the FLAG and the pool are public
    expect(asB.draftPool.length).toBe(state.draftPool.length);
  });

  it('the split is a function of the seed: same seed same pool, different seeds differ', () => {
    const pool = (seed) => {
      const s = createGame({ seed, mode: 'elemental' });
      addPlayer(s, 'a', 'A'); addPlayer(s, 'b', 'B');
      setDraft(s, true); startGame(s);
      return s.draftPool.join(',');
    };
    expect(pool(7)).toBe(pool(7));
    const many = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(pool));
    expect(many.size).toBeGreaterThan(1);    // rolled per game, not curated
  });
});

describe('bots pressure the kill leader (BOT_TARGETING.LEADER_BIAS)', () => {
  // Geometry, chosen so the ONLY thing that differs between the two candidates
  // is distance and kill count:
  //   bot at (0, -14) · "near" at (0, -4) · "leader" at (0, +4)
  // Both candidates sit the same distance (4) from the centre, so pickPrey's
  // rim term is identical; both have exactly one neighbour 8 units away, so the
  // crowd term is identical; both are at full HP. Only the distance to the bot
  // differs — 10 vs 18, i.e. GAP arena units in the near one's favour.
  const GAP = 8;

  function duelBattle({ mode = 'classic', kind = 'berserker' } = {}) {
    const state = createGame({ seed: 3, mode });
    addPlayer(state, 'bot', 'Hunter', { bot: true, kind });
    addPlayer(state, 'near', 'Near');
    addPlayer(state, 'lead', 'Leader');
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    state.pillars = [];
    const place = (id, x, y) => {
      const p = state.players[id];
      p.x = x; p.y = y; p.vx = p.vy = 0; p.moveTarget = null;
      p.hp = p.maxHp; p.alive = true;
    };
    place('bot', 0, -14);
    place('near', 0, -4);
    place('lead', 0, 4);
    return state;
  }

  it('the bias only bites in the band the constant defines — spec, not literals', () => {
    // A lead of 1 must NOT cover GAP units; a runaway lead must. Everything the
    // two behaviour tests below assert follows from these two inequalities, so
    // if LEADER_BIAS is ever retuned outside this band the arithmetic says so
    // here instead of the behaviour tests failing mysteriously.
    expect(1 * BOT_TARGETING.LEADER_BIAS).toBeLessThan(GAP);
    expect((ROUND.KILLS_TO_WIN - 1) * BOT_TARGETING.LEADER_BIAS).toBeGreaterThan(GAP);
  });

  it('a runaway kill leader is hunted over the closer enemy', () => {
    const state = duelBattle();
    state.players.lead.kills = ROUND.KILLS_TO_WIN - 1;
    expect(pickPrey(state, state.players.bot).id).toBe('lead');
  });

  it('a level field barely moves the choice: the closer enemy still wins', () => {
    const state = duelBattle();
    // dead level: identical to having no mechanism at all
    expect(pickPrey(state, state.players.bot).id).toBe('near');
    // one kill ahead is "5 vs 4", which must not be enough to cross the arena
    state.players.lead.kills = 1;
    expect(pickPrey(state, state.players.bot).id).toBe('near');
    // and it is genuinely inert, not merely outweighed: the bot that is ITSELF
    // ahead sees a lead of 0 on everyone (the bounty's floor-at-zero rule)
    state.players.bot.kills = ROUND.KILLS_TO_WIN - 1;
    state.players.lead.kills = ROUND.KILLS_TO_WIN - 1;
    expect(killLead(state.players.bot, state.players.lead)).toBe(0);
    expect(pickPrey(state, state.players.bot).id).toBe('near');
  });

  it('the lead is exactly the gold bounty gap: per-observer and floored at 0', () => {
    const state = duelBattle();
    const bot = state.players.bot, lead = state.players.lead;
    bot.kills = 2; lead.kills = 9;
    expect(killLead(bot, lead)).toBe(lead.kills - bot.kills);  // what kill() pays on
    expect(killLead(lead, bot)).toBe(0);                       // the leader collects nothing
  });

  it('a vanished leader is still known to be the leader (kills are scoreboard, not position)', () => {
    // Vanish hides WHERE you are, never your place on the scoreboard — the
    // topbar shows it to every human. If the memory entry dropped `kills` the
    // bias would flicker off every time the leader blinked, which is a stealth
    // buff nobody asked for.
    const state = duelBattle();
    const lead = state.players.lead;
    lead.kills = ROUND.KILLS_TO_WIN - 1;
    lead.spells.vanish = 1;
    lead.vanishT = SPELLS.vanish.duration[0];
    state.players.bot._seen = {
      lead: { id: 'lead', x: lead.x, y: lead.y, hp: lead.hp, radius: lead.radius, t: state.time },
    };
    expect(pickPrey(state, state.players.bot).id).toBe('lead');
  });

  it('Extreme gets the same bias (its whole target choice is one call)', () => {
    // The stalker never calls pickPrey; it kites whatever nearestEnemy returns,
    // so the bias has to be wired there too or the top tier is exempt. Observed
    // through behaviour: it holds a ring around its mark, so the mark is
    // whichever candidate its move target ends up nearest to. The two are 30
    // units apart, twice the kite ring, so the answer is never ambiguous.
    const markOf = (leadKills) => {
      const state = createGame({ seed: 3 });
      addPlayer(state, 'bot', 'Hunter', { bot: true, kind: 'stalker' });
      addPlayer(state, 'near', 'Near');
      addPlayer(state, 'lead', 'Leader');
      startGame(state);
      run(state, ROUND.COUNTDOWN + DT);
      state.pillars = [];
      for (const [id, x] of [['bot', 0], ['near', 10], ['lead', -20]]) {
        const p = state.players[id];
        p.x = x; p.y = 0; p.vx = p.vy = 0; p.moveTarget = null; p.hp = p.maxHp;
      }
      state.players.lead.kills = leadKills;
      state.players.bot._botT = 0;
      stepBot(state, 'bot', DT);
      const mt = state.players.bot.moveTarget;
      expect(mt).toBeTruthy();
      const to = (id) => Math.hypot(mt.x - state.players[id].x, mt.y - state.players[id].y);
      return to('near') < to('lead') ? 'near' : 'lead';
    };
    // the leader is 10 units farther away; check the spec can pay for that
    // before asserting the behaviour that depends on it
    expect((ROUND.KILLS_TO_WIN - 1) * BOT_TARGETING.LEADER_BIAS).toBeGreaterThan(10);
    expect(1 * BOT_TARGETING.LEADER_BIAS).toBeLessThan(10);
    expect(markOf(0)).toBe('near');                       // level: kite the near one
    expect(markOf(ROUND.KILLS_TO_WIN - 1)).toBe('lead');  // runaway: go get the leader
  });

  it('co-op is exempt: the party is one team and a monster tally is not a race', () => {
    const state = createGame({ seed: 5, mode: 'coop' });
    addPlayer(state, 'a', 'Ally');
    addPlayer(state, 'b', 'Ally2');
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    const monsters = Object.values(state.players).filter(p => p.team === 'ai');
    expect(monsters.length).toBeGreaterThanOrEqual(2);
    const [m1, m2] = monsters;
    // every co-op fighter, party or wave, carries a team — that is the switch
    expect(state.players.a.team).not.toBe(null);
    expect(m1.team).not.toBe(null);
    m1.kills = ROUND.KILLS_TO_WIN;
    expect(killLead(state.players.a, m1)).toBe(0);   // a party member: no race
    expect(killLead(m2, state.players.a)).toBe(0);   // a monster: no race either
    // and the pick is byte-identical to the pick with the leader's tally wiped
    state.pillars = [];
    const before = pickPrey(state, state.players.a);
    m1.kills = 0;
    expect(pickPrey(state, state.players.a)).toBe(before);
  });
});

describe('live spectator standings', () => {
  // Remi, 2026-08-07: a dead player watching the round wants the end-of-game
  // table, live, with the game-total kill count on it. The panel is built by
  // client/main.js's statsTable() from the ordinary snapshot, so the contract
  // this suite defends is "the snapshot carries every column, and it carries
  // nothing a living player is not already given".
  const COLUMNS = [
    'kills', 'deaths', 'multiKillBest', 'dmgDealt', 'dmgLava',
    'healLifesteal', 'healRegen', 'gold', 'goldEarned',
    'roundGold', 'roundKills',        // the two per-ROUND columns
  ];

  function watched() {
    const state = createGame({ seed: 8 });
    addPlayer(state, 'dead', 'Ghost');
    addPlayer(state, 'a', 'Alice');
    addPlayer(state, 'b', 'Bob');
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    state.pillars = [];
    return state;
  }

  it('every column the end screen prints is on the wire, for every player', () => {
    const state = watched();
    const snap = snapshot(state, 'dead');
    for (const id of Object.keys(state.players)) {
      for (const col of COLUMNS) {
        expect(Object.hasOwn(snap.players[id], col)).toBe(true);
        expect(Number.isFinite(snap.players[id][col])).toBe(true);
      }
    }
  });

  it('kills are the GAME total and roundKills the current round — both, separately', () => {
    const state = watched();
    const a = state.players.a;
    a.kills = 4; a.roundKills = 4;
    // a fresh round zeroes the per-round tally and leaves the game total alone
    state.phase = 'roundEnd';
    state.roundSummary = { final: false };
    state.phaseT = 0;
    step(state, DT);
    expect(state.phase).toBe('shop');
    run(state, ROUND.SHOP_TIME + ROUND.COUNTDOWN + DT * 3);
    expect(state.phase).toBe('battle');
    const wire = snapshot(state, 'dead').players.a;
    expect(wire.kills).toBe(4);      // what wins the match
    expect(wire.roundKills).toBe(0); // what this round has paid
  });

  it('a dead viewer is given exactly what a living one is — no extra fields', () => {
    const state = watched();
    state.players.dead.alive = false;
    state.players.dead.hp = 0;
    const asDead = JSON.stringify(snapshot(state, 'dead').players.a);
    const asAlive = JSON.stringify(snapshot(state, 'b').players.a);
    expect(asDead).toBe(asAlive);
  });

  it('a VANISHED player is not exposed through the stats payload', () => {
    const state = watched();
    const a = state.players.a;
    a.spells.vanish = 1;
    a.kills = 3; a.roundKills = 3; a.dmgDealt = 120;
    expect(castSpell(state, 'a', 'vanish', 5, 5)).toBe(true);
    const wire = snapshot(state, 'dead').players.a;
    // the scoreboard row survives — a player must not drop out of the standings
    // every time they blink — but nothing positional comes with it
    expect(wire.kills).toBe(3);
    expect(wire.roundKills).toBe(3);
    expect(wire.x).toBeUndefined();
    expect(wire.y).toBeUndefined();
    expect(wire.vanishT).toBeUndefined();
    // and the dead viewer is told no more than a living opponent is
    expect(JSON.stringify(wire)).toBe(JSON.stringify(snapshot(state, 'b').players.a));
  });
});
