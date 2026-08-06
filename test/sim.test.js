import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGame, addPlayer, removePlayer, setMoveTarget, castSpell, buy,
  startGame, step, snapshot, stepBot, botShop, setShopReady, setSpectator,
  setMode, BOT_ELEMENTS, playerStats,
} from '../shared/sim.js';
import { ARENA, PLAYER, SPELLS, ITEMS, ITEM_FX, ELEMENTS, GOLD, ROUND, itemCost } from '../shared/constants.js';

const DT = 1 / 30;

// Smallest signed angle between two bearings — bites live on arcs.
function angDist(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function run(state, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) step(state, DT);
}

function freshBattle(nPlayers = 2) {
  const state = createGame({ seed: 42 });
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
    expect(state.arenaRadius).toBeCloseTo(ARENA.MIN_RADIUS, 1);
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
    a.items = ['treads'];
    a.x = ARENA.START_RADIUS + 5; a.y = 0;
    b.x = -(ARENA.START_RADIUS + 5); b.y = 0;
    run(state, 1);
    const lossA = a.maxHp - a.hp, lossB = b.maxHp - b.hp;
    // treads lavaMult 0.8: net-of-regen loss ratio ≈ (14·0.8−1.2)/(14−1.2) ≈ 0.78
    expect(lossA).toBeLessThan(lossB * 0.88);
    expect(lossA).toBeGreaterThan(lossB * 0.6); // and it's a trim, not immunity
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

  it('lightning hits instantly along a ray', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.lightning = 1;
    a.x = 0; a.y = 0; b.x = 20; b.y = 0.5;
    state.players.p2.y = -30;
    castSpell(state, 'p0', 'lightning', 30, 0);
    expect(b.hp).toBe(b.maxHp - SPELLS.lightning.damage[0]);
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
    for (let i = 0; i < 3; i++) buy(state, 'a', 'fireball');
    expect(state.players.a.spells.fireball).toBe(SPELLS.fireball.maxLevel);
    expect(buy(state, 'a', 'fireball').ok).toBe(false);
  });

  it('items stack, and each extra copy costs 20% more (rounded up)', () => {
    const state = shopState();
    const a = state.players.a;
    a.gold = 999;
    const base = ITEMS.boots.cost;                       // 10
    expect(itemCost('boots', 0)).toBe(base);             // 10
    expect(itemCost('boots', 1)).toBe(Math.ceil(base * 1.2));      // 12
    expect(itemCost('boots', 2)).toBe(Math.ceil(base * 1.2 ** 2)); // 15
    let spent = 0;
    for (let i = 0; i < 3; i++) {
      const before = a.gold;
      expect(buy(state, 'a', 'boots').ok).toBe(true);
      spent += before - a.gold;
    }
    expect(a.items.filter(i => i === 'boots').length).toBe(3);
    expect(spent).toBe(itemCost('boots', 0) + itemCost('boots', 1) + itemCost('boots', 2));
    // the effects really do pile up: 1.2^3 speed
    expect(playerStats(a).speed).toBeCloseTo(PLAYER.SPEED * ITEM_FX.boots.speedMult ** 3, 4);
    // ...and a poor player can't afford the escalated price
    a.gold = itemCost('boots', 3) - 1;
    expect(buy(state, 'a', 'boots').err).toBe('not enough gold');
  });

  it('stacked amulets each add max hp; unique items still reject a 2nd copy', () => {
    const state = shopState();
    const a = state.players.a;
    a.gold = 999;
    buy(state, 'a', 'amulet');
    buy(state, 'a', 'amulet');
    expect(a.maxHp).toBe(PLAYER.MAX_HP + 2 * ITEM_FX.amulet.maxHp);
    // echo/crown are one-per-customer (elemental mode only)
    const el = createGame({ seed: 3, mode: 'elemental' });
    addPlayer(el, 'a', 'A');
    el.phase = 'shop';
    el.players.a.gold = 999;
    expect(buy(el, 'a', 'echo').ok).toBe(true);
    expect(buy(el, 'a', 'echo').err).toBe('already owned');
  });

  it('amulet raises max hp immediately', () => {
    const state = shopState();
    state.players.a.gold = 99;
    buy(state, 'a', 'amulet');
    expect(state.players.a.maxHp).toBe(PLAYER.MAX_HP + ITEM_FX.amulet.maxHp);
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
    a.items = ['boots'];
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
    const state = createGame({ seed: 123 });
    for (let i = 0; i < 4; i++) addPlayer(state, `b${i}`, `Bot${i}`, { bot: true });
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

  it('setMode works only in the lobby, validates values, and ships in snapshot', () => {
    const state = createGame({ seed: 1 });
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
    const classic = createGame({ seed: 5 });
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
    expect(buy(state, 'a', 'arcane').ok).toBe(true); // arcane is global: no fireball needed
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
    // cost path: 10 + 8 + 8 for a full element
    expect(ELEMENTS.frost.costs.reduce((s, c) => s + c, 0)).toBe(26);
  });

  it('elements stack on one fireball: frost stacks AND ember hits harder', () => {
    const state = hitWith({ frost: 1, ember: 1 });
    const b = state.players.p1;
    expect(b.frostStacks).toBe(1);                      // frost rider applied
    // ember lv1 +2 dmg on the same hit: 7+2 = 9, minus a hair of regen
    expect(b.maxHp - b.hp).toBeGreaterThan(8.0);
    expect(b.maxHp - b.hp).toBeLessThan(9.5);
  });

  it('arcane shortens every cooldown', () => {
    const state = elementalBattle(3);
    const a = state.players.p0;
    state.players.p1.x = 0; state.players.p1.y = 45;
    state.players.p2.x = 0; state.players.p2.y = -45;
    a.elements = { arcane: 3 }; // -25%
    castSpell(state, 'p0', 'fireball', 20, 0);
    const cdArc = a.cooldowns.fireball;
    expect(cdArc).toBeCloseTo(SPELLS.fireball.cooldown[0] * ELEMENTS.arcane.fx.cdrMult[2], 3);
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
    expect(two.players.p1.frostStacks).toBe(2);
    expect(two.players.p1.slowT).toBe(0);   // nothing yet: it just builds
    const three = frostHits(1, 3);
    const b = three.players.p1;
    expect(b.frostStacks).toBe(0);          // detonated and reset
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

  it('frost stacks are shared: two attackers feed the same counter', () => {
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    state.pillars = [];
    a.elements = { frost: 1 };
    c.elements = { frost: 1 };              // a second frost player
    b.x = 8; b.y = 0; b.moveTarget = null;
    // two hits from a, one from c — the third stack (c's) detonates.
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
    expect(b.frostStacks).toBe(0);
    expect(b.slowT).toBeGreaterThan(2.5);
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

  it('critical 💢: starts weak, every landed hit ramps damage and push', () => {
    const f = ELEMENTS.critical.fx;
    const base = SPELLS.fireball.damage[0];
    // hit 1: no ramp yet — a fraction of a normal fireball
    const s1 = hitWith('critical');
    const b1 = s1.players.p1;
    const first = b1.maxHp - b1.hp;
    expect(first).toBeGreaterThan(base * f.dmgMult - 0.8);
    expect(first).toBeLessThan(base * f.dmgMult + 0.5);
    expect(first).toBeLessThan(base);          // strictly weaker to start
    expect(s1.players.p0.critHits).toBe(1);
    // after 10 landed hits the ramp is doing real work
    const s2 = hitWith('critical');
    const a2 = s2.players.p0, b2 = s2.players.p1;
    a2.critHits = 10;
    b2.hp = b2.maxHp; b2.x = 8; b2.y = 0; b2.vx = 0; b2.vy = 0;
    a2.cooldowns = {};
    castSpell(s2, 'p0', 'fireball', 20, 0);
    run(s2, 0.4);
    const dealt = b2.maxHp - b2.hp;
    const expected = (base + 10 * f.rampDmg[0]) * f.dmgMult;
    expect(dealt).toBeGreaterThan(expected - 0.8); // regen nibbles a little
    expect(dealt).toBeLessThan(expected + 0.5);
    expect(dealt).toBeGreaterThan(base * 1.5);     // and it's now MONSTROUS
    expect(a2.critHits).toBe(11);
    // knockback ramps too: same hit, compare fresh vs ramped launch speed
    const peak = (hits) => {
      const s = hitWith('critical');
      const a = s.players.p0, b = s.players.p1;
      a.critHits = hits;
      b.hp = b.maxHp; b.x = 8; b.y = 0; b.vx = 0; b.vy = 0;
      a.cooldowns = {};
      castSpell(s, 'p0', 'fireball', 20, 0);
      for (let i = 0; i < 12; i++) { step(s, DT); if (b.vx > 1) break; }
      return b.vx;
    };
    expect(peak(15)).toBeGreaterThan(peak(0) * 1.25);
    // the ramp is capped
    const s3 = hitWith('critical');
    s3.players.p0.critHits = 500;
    const b3 = s3.players.p1;
    b3.hp = b3.maxHp; b3.x = 8; b3.y = 0; b3.vx = 0; b3.vy = 0;
    s3.players.p0.cooldowns = {};
    castSpell(s3, 'p0', 'fireball', 20, 0);
    run(s3, 0.4);
    const capped = (base + f.rampCap * f.rampDmg[0]) * f.dmgMult;
    expect(b3.maxHp - b3.hp).toBeLessThan(capped + 0.5);
  });

  it('mosquito 🦟: stings for 1, no push, at double the fire rate', () => {
    const state = hitWith('mosquito');
    const a = state.players.p0, b = state.players.p1;
    expect(b.maxHp - b.hp).toBeCloseTo(ELEMENTS.mosquito.fx.stingDmg, 0);
    expect(Math.abs(b.vx)).toBeLessThan(0.5);   // no knockback at all
    // the cooldown it set is the mosquito's, not the fireball's
    const full = SPELLS.fireball.cooldown[0];
    expect(a.cooldowns.fireball).toBeLessThan(full * 0.6);
  });

  it('mosquito leaves a bite where it stung, and it lasts the round', () => {
    const state = hitWith('mosquito');
    const b = state.players.p1;
    expect(b.bites.length).toBe(1);
    expect(b.bites[0].by).toBe('p0');
    // the sting came from the west, so the bite sits on the west side
    expect(Math.abs(angDist(b.bites[0].a, Math.PI))).toBeLessThan(0.6);
    run(state, 8);
    expect(b.bites.length).toBe(1); // no expiry
    expect(state.events.some(e => e.t === 'bite')).toBe(true);
  });

  it('mosquito carries NO other element riders (no midas/venom farming)', () => {
    const state = hitWith({ mosquito: 1, midas: 3, venom: 3, critical: 3 });
    const a = state.players.p0, b = state.players.p1;
    expect(a.gold).toBe(GOLD.START);       // midas paid nothing
    expect(b.poisonT).toBe(0);             // venom applied nothing
    expect(a.critHits).toBe(0);            // critical counted nothing
    expect(b.maxHp - b.hp).toBeCloseTo(ELEMENTS.mosquito.fx.stingDmg, 0);
  });

  it('another spell landing ON a bite hits double and consumes it', () => {
    const state = hitWith('mosquito');
    const a = state.players.p0, b = state.players.p1;
    a.spells.lightning = 1;
    expect(b.bites.length).toBe(1);
    b.hp = b.maxHp;
    run(state, ELEMENTS.mosquito.fx.biteArm); // let the bite swell
    b.hp = b.maxHp;
    // lightning down the same lane strikes the same (west) side of the body
    castSpell(state, 'p0', 'lightning', 20, 0);
    run(state, 0.2);
    const doubled = SPELLS.lightning.damage[0] * ELEMENTS.mosquito.fx.biteMult[0];
    expect(b.maxHp - b.hp).toBeGreaterThan(doubled - 1);
    expect(b.bites.length).toBe(0);        // cashed in
    expect(state.events.some(e => e.t === 'biteHit')).toBe(true);
  });

  it('stinging your own bite lands the PLAIN fireball, doubled', () => {
    const state = hitWith('mosquito');
    const a = state.players.p0, b = state.players.p1;
    expect(b.bites.length).toBe(1);
    run(state, ELEMENTS.mosquito.fx.biteArm); // let the bite swell
    b.hp = b.maxHp; b.x = 8; b.y = 0; b.vx = 0; b.vy = 0;
    a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0); // same lane: onto the bite
    run(state, 0.4);
    const doubled = SPELLS.fireball.damage[0] * ELEMENTS.mosquito.fx.biteMult[0];
    expect(b.maxHp - b.hp).toBeGreaterThan(doubled - 1.5);
    expect(Math.abs(b.vx)).toBeGreaterThan(50); // and it PUSHES, unlike a sting
    expect(b.bites.length).toBe(0);
  });

  it('a hit on the wrong side of the body misses the bite', () => {
    const state = hitWith('mosquito');
    const a = state.players.p0, b = state.players.p1;
    a.spells.lightning = 1;
    expect(b.bites.length).toBe(1);        // bite is on b's west side
    b.hp = b.maxHp;
    a.x = 20; a.y = 0;                     // shoot from the EAST instead
    castSpell(state, 'p0', 'lightning', b.x - 10, 0);
    run(state, 0.2);
    expect(b.maxHp - b.hp).toBeLessThan(SPELLS.lightning.damage[0] + 1); // plain hit
    expect(b.bites.length).toBe(1);        // bite untouched, still waiting
  });

  it('critical ramp resets at round start', () => {
    const state = hitWith('critical');
    expect(state.players.p0.critHits).toBe(1);
    // kill everyone else -> round ends -> next round starts fresh
    state.players.p1.hp = 0.01; state.players.p1.x = ARENA.START_RADIUS + 5;
    state.players.p2.hp = 0.01; state.players.p2.x = ARENA.START_RADIUS + 5;
    run(state, 1 + ROUND.SUMMARY_TIME + ROUND.SHOP_TIME + ROUND.COUNTDOWN + 1);
    expect(state.phase).toBe('battle');
    expect(state.players.p0.critHits).toBe(0);
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

  it('gale pushes measurably further than ember on the same hit', () => {
    const peakVx = (element) => {
      const state = elementalBattle(3);
      const a = state.players.p0, b = state.players.p1;
      state.players.p2.x = 0; state.players.p2.y = -45;
      state.pillars = [];
      a.elements = typeof element === 'string' ? { [element]: 1 } : element || {};
      a.x = 0; a.y = 0; b.x = 8; b.y = 0;
      castSpell(state, 'p0', 'fireball', 20, 0);
      let peak = 0;
      for (let i = 0; i < 30; i++) { step(state, DT); peak = Math.max(peak, b.vx); }
      return peak;
    };
    const gale3 = peakVx({ gale: 3 });
    const gale1 = peakVx({ gale: 1 });
    const plain = peakVx(null);
    expect(plain).toBeGreaterThan(0);
    // read the ladder out of the spec so retunes can't make this test lie:
    // every level pushes harder than plain, and lv3 clearly beats lv1
    const kb = ELEMENTS.gale.fx.kbMult;
    expect(gale1 / plain).toBeCloseTo(kb[0], 1);
    expect(gale3 / plain).toBeCloseTo(kb[2], 1);
    expect(gale3).toBeGreaterThan(gale1 * 1.1);
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

  it('terra grows the target and respects the total 2.2x size cap', () => {
    const state = hitWith('terra');
    const b = state.players.p1;
    expect(b.growT).toBeGreaterThan(2);
    step(state, DT);
    // equal kills -> lead mult 1, grown radius = RADIUS * growMult lv1 (1.1)
    expect(b.radius).toBeCloseTo(PLAYER.RADIUS * ELEMENTS.terra.fx.growMult[0], 2);
    // with a maxed size lead (2.0x) the grow would exceed the cap -> 2.2x
    b.kills = 100;
    step(state, DT);
    expect(b.radius).toBeCloseTo(PLAYER.RADIUS * ELEMENTS.terra.fx.growCap, 2);
    // and once growT expires the cap logic no longer applies
    run(state, ELEMENTS.terra.fx.growT + 0.1);
    expect(b.radius).toBeCloseTo(PLAYER.RADIUS * PLAYER.SIZE_LEAD.MAX, 2);
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

  it('combo items are elemental-only; the crown unlocks fireball lv4', () => {
    const classic = createGame({ seed: 6 });
    addPlayer(classic, 'a', 'Alice');
    classic.phase = 'shop';
    classic.players.a.gold = 99;
    expect(buy(classic, 'a', 'echo').err).toBe('elemental mode only');
    expect(buy(classic, 'a', 'crown').err).toBe('elemental mode only');
    // classic fireball stays capped at 3 even with gold to burn
    for (let i = 0; i < 5; i++) buy(classic, 'a', 'fireball');
    expect(classic.players.a.spells.fireball).toBe(SPELLS.fireball.maxLevel);

    const state = createGame({ seed: 6, mode: 'elemental' });
    addPlayer(state, 'a', 'Alice');
    state.phase = 'shop';
    const a = state.players.a;
    a.gold = 99;
    buy(state, 'a', 'fireball'); buy(state, 'a', 'fireball'); // -> lv3
    expect(buy(state, 'a', 'fireball').err).toBe('max level'); // no crown yet
    expect(buy(state, 'a', 'echo').ok).toBe(true);
    expect(buy(state, 'a', 'crown').ok).toBe(true);
    const gold = a.gold;
    expect(buy(state, 'a', 'fireball').ok).toBe(true); // lv4 unlocked
    expect(a.spells.fireball).toBe(4);
    expect(a.gold).toBe(gold - SPELLS.fireball.costs[3]);
    expect(buy(state, 'a', 'fireball').err).toBe('max level'); // 4 is the end
  });

  it('echo stone doubles every 4th fireball, 0.15 s later on the same aim', () => {
    const state = elementalBattle(3);
    const a = state.players.p0;
    state.players.p1.x = 0; state.players.p1.y = 45;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.items.push('echo');
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
    // each kind bought (and leveled) its signature element
    kinds.forEach((k, i) =>
      expect(state.players[`b${i}`].elements[BOT_ELEMENTS[k]] || 0).toBeGreaterThanOrEqual(1));
  }, 30000);

  it('classic regression: a full bot game keeps every element null to gameover', () => {
    const state = createGame({ seed: 88 }); // classic by default
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
      expect(p.items).not.toContain('echo');
      expect(p.items).not.toContain('crown');
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
  it('power tier is locked until round 5, then purchasable', () => {
    const state = freshBattle(2);
    state.phase = 'shop';
    state.players.p0.gold = 99;
    for (const key of ['meteor', 'hook', 'repulse', 'wall'])
      expect(buy(state, 'p0', key).err).toBe('unlocks after round 5');
    expect(buy(state, 'p0', 'pillar').ok).toBe(true); // pillar is a normal spell
    state.round = 5;
    for (const key of ['meteor', 'hook', 'repulse', 'wall'])
      expect(buy(state, 'p0', key).ok).toBe(true);
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

  it('hook: yanks the victim to right behind the caster', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.hook = 1;
    state.pillars = [];
    a.x = 0; a.y = 0; b.x = 15; b.y = 0;
    state.players.p2.y = -40;
    castSpell(state, 'p0', 'hook', 20, 0);
    run(state, 0.6);
    expect(b.x).toBeLessThan(-1);          // hook flew +x, victim lands a full
    expect(b.x).toBeGreaterThan(-8);       // body BEHIND the caster (throw side flipped)
    expect(Math.abs(b.y)).toBeLessThan(1);
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(1); // momentum wiped
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('hook: a victim killed by the hook damage is not yanked', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.hook = 1;
    state.pillars = [];
    a.x = 0; a.y = 0; b.x = 15; b.y = 0; b.hp = 1;
    state.players.p2.y = -40;
    castSpell(state, 'p0', 'hook', 20, 0);
    run(state, 0.6);
    expect(b.alive).toBe(false);
    expect(b.x).toBeGreaterThan(5); // died where the hook found them
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
    const state = createGame({ seed: 13 });
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
  it('low-HP players fly measurably further from the same hit', () => {
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
    const full = peakKnockVx(1.0);
    const low = peakKnockVx(0.2);
    expect(full).toBeGreaterThan(0);
    // 20% hp -> 1 + 0.55*0.8 = 1.44x the impulse
    expect(low).toBeGreaterThan(full * 1.25);
    expect(low).toBeLessThan(full * 1.6);
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

  it('a pillar blocks lightning (the ray stops at the pillar)', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    a.spells.lightning = 1;
    a.x = 0; a.y = 0; b.x = 20; b.y = 0;
    state.pillars = [{ x: 10, y: 0, r: 2.5, sunk: false }];
    castSpell(state, 'p0', 'lightning', 30, 0);
    expect(b.hp).toBe(b.maxHp);
    const beam = state.events.find(e => e.t === 'beam');
    expect(beam).toBeTruthy();
    expect(beam.x2).toBeLessThan(10); // truncated at the pillar face
    expect(beam.x2).toBeGreaterThan(6);
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

describe('lifesteal (Blood Sword)', () => {
  // p0 owns a sword and sits at 50 hp; p2, parked far away and also at 50 hp,
  // is the regen control — any hp gap between them is lifesteal healing.
  function swordBattle() {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    state.pillars = [];
    a.items = ['sword'];
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
    expect(a.hp - c.hp).toBeCloseTo(SPELLS.fireball.damage[0] * ITEM_FX.sword.lifesteal, 1);
  });

  it('heals from your poison ticks — DoT damage counts', () => {
    const state = swordBattle();
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    b.poisonT = 3; b.poisonTick = 2; b._poisonNext = 0.1; b.poisonBy = 'p0';
    run(state, 0.5); // exactly one tick of 2
    expect(a.hp - c.hp).toBeCloseTo(2 * ITEM_FX.sword.lifesteal, 1);
  });

  it('heals from your ground trails', () => {
    const state = swordBattle();
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    state.hazards.push({ x: b.x, y: b.y, r: 1.3, owner: 'p0', dps: 2, until: state.time + 5 });
    run(state, 1);
    expect(a.hp - c.hp).toBeCloseTo(2 * ITEM_FX.sword.lifesteal, 1);
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
    expect(a.hp - c.hp).toBeCloseTo(2 * ITEM_FX.sword.lifesteal, 1);
  });
});
