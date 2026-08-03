import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGame, addPlayer, removePlayer, setMoveTarget, castSpell, buy,
  startGame, step, snapshot, stepBot, botShop, setShopReady, setSpectator,
} from '../shared/sim.js';
import { ARENA, PLAYER, SPELLS, ITEMS, GOLD, ROUND } from '../shared/constants.js';

const DT = 1 / 30;

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
  it('damages players standing in it and applies afterburn', () => {
    const state = freshBattle(3); // 3 players so round doesn't end
    const pl = state.players.p0;
    pl.x = ARENA.START_RADIUS + 5; pl.y = 0;
    const hp0 = pl.hp;
    run(state, 1);
    expect(pl.hp).toBeLessThan(hp0 - 15); // ~20 dps
    // step out: afterburn keeps ticking
    pl.x = 0; pl.y = 0;
    const hp1 = pl.hp;
    run(state, 1);
    expect(pl.hp).toBeLessThan(hp1);
    expect(pl.hp).toBeGreaterThan(hp1 - 8);
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
    // then victim burns to death
    victim.x = ARENA.START_RADIUS + 10; victim.y = 0;
    run(state, 2);
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
    // treads lavaMult 0.65: loss ratio sits a bit above 0.65 after flat regen
    expect(lossA).toBeLessThan(lossB * 0.75);
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
    run(state, SPELLS.fireball.cooldown + 0.1);
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

  it('boomerang returns and can hit on the way back', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.boomerang = 1;
    a.x = 0; a.y = 0;
    b.x = 30; b.y = 0;                    // beyond outDistance: missed going out
    state.players.p2.y = 40;
    castSpell(state, 'p0', 'boomerang', 20, 0);
    run(state, 0.9);                       // flew out ~20u, turning back
    b.x = 10; b.y = 0;                     // step into the return path
    run(state, 1.5);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(state.projectiles.length).toBe(0); // caught by owner
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

  it('rejects over-max spell levels and duplicate items', () => {
    const state = shopState();
    state.players.a.gold = 999;
    for (let i = 0; i < 3; i++) buy(state, 'a', 'fireball');
    expect(state.players.a.spells.fireball).toBe(SPELLS.fireball.maxLevel);
    expect(buy(state, 'a', 'fireball').ok).toBe(false);
    expect(buy(state, 'a', 'boots').ok).toBe(true);
    expect(buy(state, 'a', 'boots').ok).toBe(false);
  });

  it('amulet raises max hp immediately', () => {
    const state = shopState();
    state.players.a.gold = 99;
    buy(state, 'a', 'amulet');
    expect(state.players.a.maxHp).toBe(PLAYER.MAX_HP + 30);
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
    run(state, 5);
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
    for (let i = 0; i < 200; i++) {
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
    a.x = 0; a.y = 0; b.x = 15; b.y = 3.0; // grazing shot: misses a normal body (reach 2.4)
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
    // 20% hp -> 1 + 0.8*0.8 = 1.64x the impulse
    expect(low).toBeGreaterThan(full * 1.4);
    expect(low).toBeLessThan(full * 1.9);
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
