import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGame, addPlayer, removePlayer, setMoveTarget, castSpell, buy,
  startGame, step, snapshot, viewEvents, stepBot, botShop, setShopReady,
  setSpectator, setMode, botElementFor, playerStats, setShopPause,
  setDraft, setTesting, draftPick, draftDue, MODES, pickPrey, killLead,
  arenaStartRadius, setTeam, teamTally,
} from '../shared/sim.js';
import { catalogue, draftable, ownedLevel } from '../shared/catalogue.js';
import {
  ARENA, PLAYER, SPELLS, ITEMS, ITEM_FX, ELEMENTS, GOLD, ROUND, BOTS, BUILDS,
  BOT_MEMORY, BOT_TARGETING, DRAFT, TEAMS, itemCost,
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
    // step out: the damage stops immediately — and stays (round 17: passive
    // regen is REMOVED, so lava scars don't heal back between fights)
    pl.x = 0; pl.y = 0;
    run(state, DT * 2);
    const hp1 = pl.hp;
    run(state, 3);
    expect(pl.hp).toBeCloseTo(hp1, 5);  // no lingering burn, no free healing
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
    addPlayer(state, 'b1', 'storm-grunt', { bot: true, kind: 'grunt', build: 'stormcaller' });
    addPlayer(state, 'b2', 'stock-grunt', { bot: true, kind: 'grunt' });
    state.phase = 'shop';
    state.players.b1.gold = 60; state.players.b2.gold = 60;
    botShop(state, 'b1'); botShop(state, 'b2');
    // hourglass discriminates: stormcaller's list buys it, no kind default does
    expect(state.players.b1.items.hourglass || 0).toBeGreaterThan(0);
    expect(state.players.b2.items.hourglass || 0).toBe(0);
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

  // Round 17 §11: two spells no bot build list contains — they reach a bot
  // through the draft today, and through Remi's power-tier ruling tomorrow.
  function pilotBattle(setup) {
    const state = freshBattle(3);
    state.pillars = [];                       // only the bot's own cover, please
    const a = state.players.p0;
    a.bot = true; a.kind = 'berserker'; a.x = 0; a.y = 0;
    setup(state, a);
    for (let i = 0; i < 60; i++) stepBot(state, 'p0', DT);
    return state;
  }

  it('a ganged-up-on bot raises its pillar BETWEEN itself and the threat', () => {
    const state = pilotBattle((state, a) => {
      a.spells.pillar = 1;
      state.players.p1.x = 12; state.players.p1.y = 0;   // two of them, both close
      state.players.p2.x = 14; state.players.p2.y = 3;
    });
    const pil = state.pillars.find(p => p.placedBy === 'p0');
    expect(pil).toBeTruthy();
    // on the threat's side, clear of our own body, and short of the threat
    expect(pil.x).toBeGreaterThan(state.players.p0.radius + pil.r);
    expect(pil.x).toBeLessThan(12);
    expect(Math.abs(pil.y)).toBeLessThan(pil.r);
  });

  it('one enemy at full health is not worth a pillar', () => {
    const state = pilotBattle((state, a) => {
      a.spells.pillar = 1;
      state.players.p1.x = 12; state.players.p1.y = 0;
      state.players.p2.x = 0; state.players.p2.y = -40;  // far away: not a gang
    });
    expect(state.pillars.some(p => p.placedBy === 'p0')).toBe(false);
  });

  it('Swap is the lava save: fired at somebody safely inside while flying out', () => {
    const state = pilotBattle((state, a) => {
      a.spells.swap = 1;
      a.x = state.arenaRadius - 4; a.y = 0;
      a.vx = PLAYER.SPEED * 3; a.vy = 0;                 // knocked straight out
      state.players.p1.x = state.arenaRadius - 30;       // standing safe inside
      state.players.p1.y = 0;
      state.players.p2.x = state.arenaRadius - 1; state.players.p2.y = 4; // also doomed
    });
    const shot = state.projectiles.find(p => p.type === 'swap' && p.owner === 'p0');
    expect(shot).toBeTruthy();
    expect(shot.vx).toBeLessThan(0);   // aimed inward, at the one worth trading with
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
    for (const key of ['boots', 'treads', 'amulet', 'cape', 'sword'])
      for (let i = 0; i < 3; i++) buy(state, 'a', key);
    const s = playerStats(a);
    const last = (k, f) => ITEM_FX[k][f][ITEMS[k].maxLevel - 1];
    expect(s.speed).toBeCloseTo(PLAYER.SPEED * last('boots', 'speedMult'), 6);
    expect(s.lavaMult).toBeCloseTo(last('treads', 'lavaMult'), 6);
    expect(s.kbMult).toBeCloseTo(last('cape', 'kbMult'), 6);
    expect(s.regen).toBeCloseTo(PLAYER.REGEN, 6); // 0 since round 17 — no regen items exist
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

  // Point-blank elemental fireball: a (with `elements`, e.g. {malady: 1} or
  // 'malady' shorthand for lv1) shoots b, 3rd player parked far away so the
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
    // ember lv1 dmgAdd on the same hit (regen is fully locked after damage,
    // so the number is exact)
    expect(b.maxHp - b.hp).toBeCloseTo(
      SPELLS.fireball.damage[0] + ELEMENTS.ember.fx.dmgAdd[0], 1);
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
    b.stacks = { frost: { p0: 2, p2: 1 }, midas: { p2: 1 } };
    const asP0 = snapshot(state, 'p0').players;
    expect(asP0.p1.myStacks).toEqual({ frost: 2 });     // mine only
    const asP2 = snapshot(state, 'p2').players;
    expect(asP2.p1.myStacks).toEqual({ frost: 1, midas: 1 });
    // ...and the victim sees the worst incoming pile on themselves, with no
    // attacker identities on the wire at all
    const asP1 = snapshot(state, 'p1').players;
    expect(asP1.p1.stacksOnMe).toEqual({ frost: 2, midas: 1 });
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
    expect(a.angerMarks).toBeUndefined();
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

  // ---- malady 🦠 (round 19: venom → contagion rework) -----------------------
  // Every number below is read from ELEMENTS.malady.fx — spec, never pinned.
  const MF = () => ELEMENTS.malady.fx;
  const efx = (v, lv) => (Array.isArray(v) ? v[lv - 1] : v);

  // p0 (malady at `lv`) is the shooter, p1 the victim, everyone else parked far
  // south, out of every aura but inside the arena (START_RADIUS 56).
  function maladyBattle(lv = 1, nPlayers = 3) {
    const state = elementalBattle(nPlayers);
    state.pillars = [];
    state.players.p0.elements = { malady: lv };
    for (let i = 2; i < nPlayers; i++) {
      const p = state.players[`p${i}`];
      p.x = 0; p.y = -45; p.vx = p.vy = 0; p.moveTarget = null;
    }
    return state;
  }
  // One landed fireball from p0 on p1 (cooldown scrubbed). The victim stands
  // just beyond the SPEC's widest aura so a fresh max-level plague never laps
  // back over the shooter within the landing frame — derived, not pinned
  // (the round-19.4 aura buff broke the old hardcoded 10). Stepping stops AT
  // impact rather than for a fixed slice, so shrinking the aura (round 20.3
  // halved it) can't quietly burn the fresh DoT clock the callers assert on.
  function landHit(state) {
    const a = state.players.p0, b = state.players.p1;
    const safe = Math.max(...ELEMENTS.malady.fx.auraR) + 4;
    a.x = 0; a.y = 0; a.vx = a.vy = 0; a.cooldowns = {};
    b.x = safe; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    castSpell(state, 'p0', 'fireball', safe * 3, 0);
    for (let i = 0; i < Math.round(1.5 / DT) && state.projectiles.length; i++) step(state, DT);
  }

  it('malady 🦠: the first hit plants a private stack, the SECOND infects', () => {
    expect(ELEMENTS.venom).toBeUndefined();        // the rename is total
    expect(ELEMENTS.malady.name).toBe('Malady');
    const state = maladyBattle(1);
    const b = state.players.p1;
    landHit(state);
    expect(stacksOf(b, 'malady', 'p0')).toBe(1);   // armed, not sick
    expect(b.poisonT).toBe(0);
    expect(b.malady || null).toBe(null);
    landHit(state);
    expect(stacksOf(b, 'malady', 'p0')).toBe(0);   // the stack was spent
    expect(b.poisonT).toBeGreaterThan(efx(MF().dotTime, 1) - 0.5);
    expect(b.poisonT).toBeLessThanOrEqual(efx(MF().dotTime, 1));
    expect(b.poisonTick).toBe(efx(MF().tickDmg, 1));
    expect(b.malady.inst.creator).toBe('p0');      // the instance: who and how bad
    expect(b.malady.inst.level).toBe(1);
    expect(b.malady.inst.immune.p1).toBeTruthy();  // it can never take b again
    expect(b.malady.by).toBe('p0');                // direct infection: by = creator
    expect(b.poisonBy).toBe('p0');                 // lethal-tick credit target
    expect(state.events.some(e => e.t === 'infected' && e.id === 'p1' && e.by === 'p0'))
      .toBe(true);                                 // the client FX/sound hook
  });

  it('malady: 1 damage per tick at EVERY level; levels buy duration, then CURED', () => {
    for (let lv = 1; lv <= ELEMENTS.malady.maxLevel; lv++) {
      const state = maladyBattle(lv);
      const b = state.players.p1;
      landHit(state); landHit(state);
      expect(b.poisonTick).toBe(efx(MF().tickDmg, lv));
      expect(efx(MF().tickDmg, lv)).toBe(efx(MF().tickDmg, 1)); // flat: never scales
      const dot = efx(MF().dotTime, lv);
      if (lv > 1) expect(dot).toBeGreaterThan(efx(MF().dotTime, lv - 1));
      state.events = [];
      const ticks = () => state.events.filter(e => e.t === 'hit' && e.poison && e.id === 'p1');
      run(state, dot + 0.6);                       // every tick in, clock out
      const nTicks = Math.floor(dot / MF().tickEvery);
      expect(ticks().length).toBe(nTicks);
      // the poison flag is the client's ≥1-damage floater exemption — every
      // tick must carry it (a tick you cannot see is the mosquito scar)
      for (const e of ticks()) expect(e.amount).toBe(efx(MF().tickDmg, lv));
      expect(b.poisonT).toBe(0);                   // CURED: no residue at all
      expect(b.poisonTick).toBe(0);
      expect(b.malady || null).toBe(null);
      run(state, 1.5);
      expect(ticks().length).toBe(nTicks);         // and it STOPPED
    }
  });

  it('contagion: inside the aura catches the SAME instance — outside never', () => {
    const state = maladyBattle(1, 4);
    const a = state.players.p0, b = state.players.p1;
    const c = state.players.p2, d = state.players.p3;
    landHit(state); landHit(state);
    const inst = b.malady.inst;
    const r = efx(MF().auraR, 1);
    // carrier at the center, creator far away; one body just inside the aura,
    // one just outside — on opposite sides so a fresh catch can't chain over
    a.x = 0; a.y = -40; a.vx = a.vy = 0; a.moveTarget = null;
    b.x = 0; b.y = 0; b.vx = b.vy = 0;
    c.x = r - 0.5; c.y = 0; c.vx = c.vy = 0; c.moveTarget = null;
    d.x = -(r + 1.5); d.y = 0; d.vx = d.vy = 0; d.moveTarget = null;
    run(state, 0.2);
    expect(c.malady && c.malady.inst).toBe(inst);  // the SAME plague object
    expect(c.malady.by).toBe('p1');                // caught from the patient
    expect(c.poisonT).toBeGreaterThan(efx(MF().dotTime, 1) - 0.4); // fresh clock
    expect(c.poisonBy).toBe('p0');                 // credit: the CREATOR
    expect(inst.immune.p2).toBeTruthy();
    expect(d.malady || null).toBe(null);           // outside: never caught it
    expect(d.poisonT).toBe(0);
  });

  it('the contagion radius grows with the INSTANCE level (auraR by level)', () => {
    expect(efx(MF().auraR, 3)).toBeGreaterThan(efx(MF().auraR, 1));
    const state = maladyBattle(3, 4);
    const a = state.players.p0, b = state.players.p1;
    const c = state.players.p2, d = state.players.p3;
    landHit(state); landHit(state);
    const r = efx(MF().auraR, 3);
    a.x = 0; a.y = -40; a.vx = a.vy = 0; a.moveTarget = null;
    b.x = 0; b.y = 0; b.vx = b.vy = 0;
    c.x = r - 0.5; c.y = 0; c.vx = c.vy = 0; c.moveTarget = null;
    d.x = -(r + 1.5); d.y = 0; d.vx = d.vy = 0; d.moveTarget = null;
    run(state, 0.2);
    expect(c.poisonT).toBeGreaterThan(0);          // lv3 reach caught it
    expect(d.malady || null).toBe(null);           // just past lv3 reach: safe
  });

  it('immunity: one instance takes each body ONCE — no bounce-back, no re-catch', () => {
    const state = maladyBattle(1, 3);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    landHit(state); landHit(state);
    const inst = b.malady.inst;
    a.x = 0; a.y = -40; a.vx = a.vy = 0; a.moveTarget = null;
    b.x = 0; b.y = 0; b.vx = b.vy = 0;
    c.x = 2; c.y = 0; c.vx = c.vy = 0; c.moveTarget = null;
    run(state, 0.2);
    expect(c.malady && c.malady.inst).toBe(inst);  // c caught it from b
    // make c a long carrier (manual clock) so b's own cure happens first
    c.poisonT = 30;
    run(state, efx(MF().dotTime, 1) + 1);
    expect(b.poisonT).toBe(0);                     // b is cured...
    expect(b.malady || null).toBe(null);
    expect(c.poisonT).toBeGreaterThan(0);          // ...standing by a live carrier
    run(state, 1);
    expect(b.poisonT).toBe(0);                     // the instance can NEVER re-take b
    expect(b.malady || null).toBe(null);
    // ...but a NEW instance can: the creator re-runs the two-hit rhythm
    // (carrier first parked off the firing line — it would eat the ball)
    c.x = 20; c.y = -20; c.vx = c.vy = 0;
    landHit(state); landHit(state);
    expect(b.poisonT).toBeGreaterThan(0);
    expect(b.malady.inst).not.toBe(inst);
  });

  // Round 20.3 (Remi's ruling): the creator is seeded into the instance's
  // immunity set, so standing in their own contagion is free. Replaces the
  // round-19 "creator catches it back / lethal tick is the spreader's" test.
  it('round 20.3: the creator is IMMUNE to their OWN instance, forever', () => {
    const state = maladyBattle(1, 4);              // 4 seats: a death can't end the round
    const a = state.players.p0, b = state.players.p1;
    landHit(state); landHit(state);
    const inst = b.malady.inst;
    expect(inst.immune.p0).toBeTruthy();           // seeded at creation
    b.x = 0; b.y = 0; b.vx = b.vy = 0;
    a.x = 1.5; a.y = 0; a.vx = a.vy = 0; a.moveTarget = null;  // hugging the carrier
    run(state, Math.min(1.5, efx(MF().dotTime, 1) - 0.5));
    expect(a.malady || null).toBe(null);           // his own plague never takes him
    expect(a.poisonT).toBe(0);
    expect(b.poisonT).toBeGreaterThan(0);          // the carrier is still sick
    expect(b.poisonBy).toBe('p0');                 // credit stays with the creator
  });

  it("round 20.3: the creator still catches ANOTHER player's malady", () => {
    const state = maladyBattle(1, 4);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    // p1 owns a malady of their own and infects p2; p0 (a malady owner too)
    // then hugs that carrier and must catch p1's instance normally.
    b.elements = { malady: 1 };
    b.x = 0; b.y = 0; b.vx = b.vy = 0; b.cooldowns = {};
    c.x = 20; c.y = 0; c.vx = c.vy = 0; c.moveTarget = null;
    a.x = 0; a.y = -40; a.vx = a.vy = 0; a.moveTarget = null;
    for (let i = 0; i < 2; i++) {
      b.cooldowns = {};
      castSpell(state, 'p1', 'fireball', 60, 0);
      run(state, 0.9);
      c.x = 20; c.y = 0; c.vx = c.vy = 0; c.moveTarget = null;
    }
    expect(c.malady).toBeTruthy();                 // p2 carries p1's plague
    const inst = c.malady.inst;
    expect(inst.creator).toBe('p1');
    expect(inst.immune.p0).toBeFalsy();            // p0 is NOT in someone else's set
    a.x = 21; a.y = 0; a.vx = a.vy = 0; a.moveTarget = null;
    run(state, 0.2);
    expect(a.malady && a.malady.inst).toBe(inst);  // caught it
    expect(a.poisonBy).toBe('p1');                 // credit: that instance's creator
  });

  it("kill credit: a lethal tick is the CREATOR's kill — even on a contagion catch", () => {
    const state = maladyBattle(1, 4);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    landHit(state); landHit(state);
    a.x = 0; a.y = -40; a.vx = a.vy = 0; a.moveTarget = null;
    b.x = 0; b.y = 0; b.vx = b.vy = 0;
    c.x = 2; c.y = 0; c.vx = c.vy = 0; c.moveTarget = null;
    run(state, 0.2);
    expect(c.poisonBy).toBe('p0');
    c.hp = 0.5; c.lastHitBy = null;
    const ka0 = a.kills, kb0 = b.kills;
    run(state, MF().tickEvery + 0.3);
    expect(c.alive).toBe(false);
    expect(a.kills).toBe(ka0 + 1);                 // the creator, never the carrier
    expect(b.kills).toBe(kb0);
  });

  it('the venom trail is DEAD: malady balls drip nothing (generic hazards stay)', () => {
    const state = maladyBattle(3);
    landHit(state); landHit(state);
    expect(state.hazards.length).toBe(0);          // no trail ever spawned
    expect(MF().trailT).toBeUndefined();           // deleted from the spec too
    expect(MF().trailDps).toBeUndefined();
  });

  it('malady on the wire: numbers only — poison flag, maladyT/maladyR, no instance leak', () => {
    const state = maladyBattle(2);
    const b = state.players.p1;
    landHit(state);
    let pb = snapshot(state).players.p1;
    expect(pb.maladyR).toBeUndefined();            // armed is not infected
    landHit(state);
    pb = snapshot(state).players.p1;
    expect(pb.poison).toBe(true);                  // the green-tint flag
    expect(pb.maladyT).toBeCloseTo(b.poisonT, 1);  // the clock, for the client
    expect(pb.maladyR).toBe(efx(MF().auraR, 2));   // the instance level sizes it
    expect(pb.malady).toBeUndefined();             // the instance stays server-side
    expect(() => JSON.parse(JSON.stringify(snapshot(state)))).not.toThrow();
    const pa = snapshot(state).players.p0;
    expect(pa.maladyR).toBeUndefined();            // healthy body: no aura fields
  });

  it('a lethal DoT tick gives the credited player the kill — without stamping lastHitBy', () => {
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

  // ---- anger 🔴 (momentum → Anger rework: the mark hunt) -----------------
  // Every number below is read out of ELEMENTS.anger.fx: AGENTS.md — balance
  // tests must not pin constants the owner is still tuning.
  const angerOn = (pl, by) => stacksOf(pl, 'anger', by);
  const totalAnger = (state, by) =>
    Object.values(state.players).reduce((s, q) => s + angerOn(q, by), 0);

  it('anger 🔴: the first mark lands markDelay after battle starts, on ONE living opponent', () => {
    const f = ELEMENTS.anger.fx;
    const state = elementalBattle(3);
    state.players.p0.elements = { anger: 1 };
    // park everyone so nothing dies or hits while we watch the clock
    state.players.p1.x = 10; state.players.p1.y = 0;
    state.players.p2.x = -10; state.players.p2.y = 5;
    run(state, f.markDelay - 3 * DT);       // just before the delay elapses
    expect(totalAnger(state, 'p0')).toBe(0);
    run(state, 5 * DT);                     // ...and just after
    expect(totalAnger(state, 'p0')).toBe(1);
    expect(angerOn(state.players.p0, 'p0')).toBe(0);   // never self
    // owner-private on the wire: the owner sees it (myStacks), the victim sees
    // it (stacksOnMe), a third party sees nothing at all
    const vid = state.players.p0._angerTarget;
    expect(['p1', 'p2']).toContain(vid);
    const asOwner = snapshot(state, 'p0').players[vid];
    expect(asOwner.myStacks && asOwner.myStacks.anger).toBe(1);
    const asVictim = snapshot(state, vid).players[vid];
    expect(asVictim.stacksOnMe && asVictim.stacksOnMe.anger).toBe(1);
    const third = vid === 'p1' ? 'p2' : 'p1';
    expect(snapshot(state, third).players[vid].myStacks).toBeUndefined();
  });

  it('one active mark per owner: the cadence never deals a second while one is out', () => {
    const f = ELEMENTS.anger.fx;
    const state = elementalBattle(3);
    state.players.p0.elements = { anger: 3 };   // lv3 = the fastest cadence
    state.players.p1.x = 10; state.players.p1.y = 0;
    state.players.p2.x = -10; state.players.p2.y = 5;
    run(state, f.markDelay + 2 * f.markEvery[2] + 1);   // several cadences pass, unclaimed
    expect(totalAnger(state, 'p0')).toBe(1);
    // levels buy FREQUENCY: higher level = shorter wait, never a bigger bonus
    expect(f.markEvery[1]).toBeLessThan(f.markEvery[0]);
    expect(f.markEvery[2]).toBeLessThan(f.markEvery[1]);
    expect(Array.isArray(f.markDmg)).toBe(false);
  });

  it('claiming: a fireball on YOUR marked target banks +1 forever; the NEXT hit carries the bonus', () => {
    const f = ELEMENTS.anger.fx;
    const base = SPELLS.fireball.damage[0];
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.elements = { anger: 1 };
    b.stacks = { anger: { p0: 1 } };   // hand-place the mark: this test is the claim
    a._angerTarget = 'p1';
    a.x = 0; a.y = 0; b.x = 8; b.y = 0;
    state.events = [];
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.4);
    expect(a.angerMarks).toBe(1);
    expect(angerOn(b, 'p0')).toBe(0);                  // consumed
    const claim = state.events.find(e => e.t === 'angerClaim');
    expect(claim && claim.id).toBe('p1');
    expect(claim.by).toBe('p0');
    // the claiming hit itself was a plain fireball — the +markDmg starts NEXT hit
    const h0 = state.events.find(e => e.t === 'hit' && e.id === 'p1');
    expect(h0.bonus).toBeUndefined();
    expect(h0.amount).toBeCloseTo(base, 5);
    // next fireball: base red number + markDmg white bonus, split on the event
    b.hp = b.maxHp; b.x = 8; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null;
    a.x = 0; a.y = 0; a.cooldowns = {};
    state.events = [];
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.4);
    const h1 = state.events.find(e => e.t === 'hit' && e.id === 'p1');
    expect(h1.bonus).toBeCloseTo(f.markDmg, 5);
    expect(h1.amount - h1.bonus).toBeCloseTo(base, 5);
    expect(a.angerMarks).toBe(1);   // the unmarked hit banked nothing
  });

  it('a hit on a NON-marked target grants nothing: no mark, no bonus, no event', () => {
    const state = hitWith('anger');
    expect(state.players.p0.angerMarks).toBe(0);
    expect(state.events.some(e => e.t === 'angerClaim')).toBe(false);
    const h = state.events.find(e => e.t === 'hit' && e.id === 'p1');
    expect(h.bonus).toBeUndefined();
  });

  it('cadence: after a claim the next mark waits exactly markEvery seconds', () => {
    const f = ELEMENTS.anger.fx;
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = -10; state.players.p2.y = 5;
    state.pillars = [];
    a.elements = { anger: 3 };
    b.stacks = { anger: { p0: 1 } };
    a._angerTarget = 'p1';
    a.x = 0; a.y = 0; b.x = 8; b.y = 0;
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.4);
    expect(a.angerMarks).toBe(1);
    const claim = state.events.find(e => e.t === 'angerClaim');
    expect(claim).toBeTruthy();
    // park the pair so nothing else happens while the cadence runs
    b.x = 10; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null;
    const wait = f.markEvery[2];   // lv3 owner: the fastest cadence
    run(state, wait - 1);          // claim happened ≤0.4 s in: still inside the wait
    expect(totalAnger(state, 'p0')).toBe(0);
    run(state, 1.5);               // the cadence has now elapsed
    expect(totalAnger(state, 'p0')).toBe(1);
  });

  it('a marked player DYING clears the mark; the fresh roll waits the cadence', () => {
    const f = ELEMENTS.anger.fx;
    const state = elementalBattle(4);
    const a = state.players.p0;
    a.elements = { anger: 3 };
    for (const [id, pos] of [['p1', [10, 0]], ['p2', [-10, 5]], ['p3', [0, 12]]])
      Object.assign(state.players[id], { x: pos[0], y: pos[1], vx: 0, vy: 0, moveTarget: null });
    run(state, f.markDelay + 2 * DT);
    const vid = a._angerTarget;
    expect(vid).toBeTruthy();
    // drown the marked victim in the lava
    const v = state.players[vid];
    v.hp = 0.01; v.x = ARENA.START_RADIUS + 5; v.moveTarget = null;
    run(state, 0.2);
    expect(v.alive).toBe(false);
    expect(angerOn(v, 'p0')).toBe(0);          // the corpse carries no mark
    expect(a._angerTarget == null).toBe(true);
    const tClear = state.time;
    run(state, f.markEvery[2] - 0.5 - (state.time - tClear));
    expect(totalAnger(state, 'p0')).toBe(0);   // fresh roll only AFTER the cadence
    run(state, 1);
    expect(totalAnger(state, 'p0')).toBe(1);
    const nid = a._angerTarget;
    expect(nid).not.toBe(vid);                 // a LIVING opponent, never the corpse
    expect(state.players[nid].alive).toBe(true);
  });

  it('anger marks (the bonus) SURVIVE a round boundary; the MARK itself does not', () => {
    expect(ELEMENTS.anger.fx.rampPermanent).toBe(true);
    const state = elementalBattle(3);
    const a = state.players.p0;
    a.elements = { anger: 1 };
    a.angerMarks = 3;                            // hand-banked: the claim path is covered above
    state.players.p2.stacks = { anger: { p0: 1 } };
    a._angerTarget = 'p2';
    // kill everyone else -> round ends -> next round starts, bank intact
    state.players.p1.hp = 0.01; state.players.p1.x = ARENA.START_RADIUS + 5;
    state.players.p2.hp = 0.01; state.players.p2.x = ARENA.START_RADIUS + 5;
    run(state, 1 + ROUND.SUMMARY_TIME + ROUND.SHOP_TIME + ROUND.COUNTDOWN + 1);
    expect(state.phase).toBe('battle');
    expect(state.round).toBeGreaterThan(1);
    expect(state.players.p0.angerMarks).toBe(3);
    // startRound wiped the old mark; ~1 s into the new battle the hunt re-dealt
    // exactly ONE fresh one (never a stale duplicate)
    expect(totalAnger(state, 'p0')).toBe(1);
  });

  it('marks roll off the SEEDED rng: same seed, same hunt sequence', () => {
    const f = ELEMENTS.anger.fx;
    const hunt = (seed) => {
      const state = createGame({ seed, mode: 'elemental' });
      for (let i = 0; i < 4; i++) addPlayer(state, `p${i}`, `P${i}`);
      startGame(state);
      run(state, ROUND.COUNTDOWN + DT);
      const a = state.players.p0;
      a.elements = { anger: 3 };
      const seq = [];
      while (seq.length < 10 && state.phase === 'battle') {
        step(state, DT);
        if (a._angerTarget) {
          seq.push(a._angerTarget);
          // hand-claim so the hunt rolls again immediately (rng order intact)
          const v = state.players[a._angerTarget];
          v.stacks = {};
          a._angerTarget = null;
          a._angerNext = state.time;
        }
      }
      return seq.join(',');
    };
    expect(hunt(7)).toBe(hunt(7));
    expect(hunt(7).split(',').length).toBe(10);
    expect(f.markDelay).toBeGreaterThan(0);   // and the delay is a real number
  });

  it('co-op: anger marks never spawn (the campaign stays untouched)', () => {
    const f = ELEMENTS.anger.fx;
    const state = createGame({ seed: 3, mode: 'coop' });
    addPlayer(state, 'h', 'Hero');
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    expect(state.phase).toBe('battle');
    state.players.h.elements = { anger: 3 };
    run(state, f.markDelay + f.markEvery[2] + 1);
    expect(totalAnger(state, 'h')).toBe(0);
    expect(state.players.h._angerTarget == null).toBe(true);
  });

  it('every damage multiplier scales BOTH halves: midas lv1 halves base AND bonus', () => {
    const f = ELEMENTS.anger.fx;
    const base = SPELLS.fireball.damage[0];
    const mult = ELEMENTS.midas.fx.dmgMult[0];
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.elements = { anger: 1, midas: 1 };
    a.angerMarks = 4;                          // an earned bank, mid-game sized
    a.x = 0; a.y = 0; b.x = 8; b.y = 0;
    state.events = [];
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.4);
    const h = state.events.find(e => e.t === 'hit' && e.id === 'p1');
    expect(h.bonus).toBeCloseTo(4 * f.markDmg * mult, 5);
    expect(h.amount - h.bonus).toBeCloseTo(base * mult, 5);
  });

  // ---- mosquito 🦟 (round 20.1 rework: every Nth cast fires as a PAIR) -----
  // The dmg/kb tax and the arm/cash trap are GONE (the Echo Stone item was
  // merged in here and deleted): an ordinary ball is a plain fireball, and
  // every doubleEvery'th CAST fires as a pair — a LEAD ball with zero knockback
  // from any source plus a fully normal TRAILING ball trailDelay s behind on the
  // same aim. Every number below is read off ELEMENTS.mosquito.fx.

  // one plain lv1 fireball's launch speed, read on the frame it connects
  // (knockback lands in stepProjectiles, after the movement/friction pass, so
  // this is the raw launch speed the pair's trailing ball must match)
  function plainFireballLaunch() {
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -20;
    state.pillars = [];
    a.elements = {}; a.x = 0; a.y = 0;
    b.x = 6; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    b.maxHp = 9999; b.hp = 9999;
    castSpell(state, 'p0', 'fireball', 20, 0);
    for (let i = 0; i < 20; i++) {
      state.events = [];
      step(state, DT);
      if (state.events.some(e => e.t === 'hit' && e.id === 'p1'))
        return Math.abs(b.vx);
    }
    return 0;
  }

  // Cast n fireballs into empty space at mosquito `level`, waiting between casts
  // for any trailing ball to have LEFT (it advances the counter, so the wait is
  // part of the cadence being measured). Returns the 1-based cast numbers that
  // queued a trailing ball.
  function pairsAt(level, n) {
    const state = elementalBattle(3);
    const a = state.players.p0;
    state.players.p1.x = 0; state.players.p1.y = 20;
    state.players.p2.x = 0; state.players.p2.y = -20;
    state.pillars = [];
    a.elements = { mosquito: level };
    const out = [];
    for (let i = 1; i <= n; i++) {
      a.x = 0; a.y = 0; a.vx = a.vy = 0; a.cooldowns = {};
      const before = state.delayedShots.length;
      expect(castSpell(state, 'p0', 'fireball', 20, 0)).toBe(true);
      if (state.delayedShots.length > before) out.push(i);
      run(state, ELEMENTS.mosquito.fx.trailDelay + 2 * DT);
      expect(state.delayedShots.length).toBe(0);   // the trail always leaves
    }
    return out;
  }

  it('an UNPAIRED mosquito ball is a completely normal fireball — no tax anywhere', () => {
    const f = ELEMENTS.mosquito.fx;
    expect(f.dmgMult).toBeUndefined();     // the round-19.5 tax is deleted...
    expect(f.kbMult).toBeUndefined();      // ...on both axes
    const ctrl = hitWith({});
    const state = hitWith('mosquito');     // the 1st cast is never the pair
    const b = state.players.p1, cb = ctrl.players.p1;
    expect(b.maxHp - b.hp).toBeCloseTo(cb.maxHp - cb.hp, 5);
    expect(Math.abs(b.vx)).toBeCloseTo(Math.abs(cb.vx), 5);
    // and no haste/cooldown of its own either
    const a = state.players.p0;
    a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0);
    expect(a.cooldowns.fireball).toBeCloseTo(SPELLS.fireball.cooldown[0], 5);
  });

  it('the pair CADENCE is the spec: every doubleEvery-th cast, per level', () => {
    const every = ELEMENTS.mosquito.fx.doubleEvery;
    for (let lv = 1; lv <= ELEMENTS.mosquito.maxLevel; lv++) {
      // n = the level's cadence: the first n-1 casts are single balls
      expect(pairsAt(lv, every[lv - 1])).toEqual([every[lv - 1]]);
    }
    // levels buy FREQUENCY and nothing else, so the wait only ever shortens
    expect(every[1]).toBeLessThan(every[0]);
    expect(every[2]).toBeLessThan(every[1]);
  });

  it("a trailing ball advances mosquito's OWN counter: each next pair is one cast sooner", () => {
    // Remi's ruling: every every-N counter counts the trailing ball. So after
    // the first pair at cast n, the trail eats one count and the next pair
    // lands at 2n-1, then 3n-2 (bounded growth — never a chain).
    const n = ELEMENTS.mosquito.fx.doubleEvery[0];
    expect(pairsAt(1, 3 * n)).toEqual([n, 2 * n - 1, 3 * n - 2]);
  });

  it('the pair LEAD stings without pushing: full damage, every rider, ZERO knockback', () => {
    const f = ELEMENTS.mosquito.fx, gf = ELEMENTS.gale.fx;
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -20;
    state.pillars = [];
    // gale lv3 one stack from its gust, plus malady: the lead must suppress the
    // SHOVE (base kb, kbAdd and the gust alike) and nothing else.
    a.elements = { mosquito: 1, gale: 3, malady: 1 };
    a.mosqN = f.doubleEvery[0] - 1;        // the next cast is the pair's lead
    b.stacks = { gale: { p0: gf.stacksToTrigger - 1 } };
    a.x = 0; a.y = 0; a.cooldowns = {};
    b.x = 6; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    b.maxHp = 9999; b.hp = 9999;
    castSpell(state, 'p0', 'fireball', 20, 0);
    const lead = state.projectiles[state.projectiles.length - 1];
    expect(lead.kbScale).toBe(0);
    let hit = null;
    for (let i = 0; i < 4 && !hit; i++) {
      state.events = [];
      step(state, DT);
      hit = state.events.find(e => e.t === 'hit' && e.id === 'p1');
    }
    expect(hit).toBeTruthy();
    expect(hit.amount).toBeCloseTo(SPELLS.fireball.damage[0], 5);  // full damage
    expect(b.vx).toBe(0);                                          // and no push
    expect(b.vy).toBe(0);
    expect(state.events.some(e => e.t === 'galeBurst')).toBe(true); // gust spent...
    expect(gf.burstKbAdd[2]).toBeGreaterThan(0);                    // ...and it is a real shove
    expect(stacksOf(b, 'malady', 'p0')).toBe(1);                    // rider ran
  });

  it('the TRAILING ball is fully normal: same damage AND one whole fireball of push', () => {
    const f = ELEMENTS.mosquito.fx;
    const solo = plainFireballLaunch();
    expect(solo).toBeGreaterThan(1);
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -20;
    state.pillars = [];
    a.elements = { mosquito: 1 };
    a.mosqN = f.doubleEvery[0] - 1;
    a.x = 0; a.y = 0; a.cooldowns = {};
    b.x = 6; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    b.maxHp = 9999; b.hp = 9999;
    state.events = [];
    castSpell(state, 'p0', 'fireball', 20, 0);
    // the LEAD is a keypress; the trailing ball is not — it is tagged `trail`
    // so cooldown-auditing consumers (test/harness/check.js) can tell them
    // apart, while the client still renders and sounds both as casts.
    const leadCast = state.events.find(e => e.t === 'cast' && e.spell === 'fireball');
    expect(leadCast.trail).toBeUndefined();
    const hits = [];
    const trailCasts = [];
    let peak = 0;
    for (let i = 0; i < 30; i++) {
      state.events = [];
      step(state, DT);
      for (const e of state.events) {
        if (e.t === 'hit' && e.id === 'p1') hits.push(e);
        if (e.t === 'cast' && e.spell === 'fireball') trailCasts.push(e);
      }
      peak = Math.max(peak, Math.abs(b.vx));
    }
    expect(trailCasts.length).toBe(1);
    expect(trailCasts[0].trail).toBe(true);
    // the pair BOTH landed (the point of the no-push lead), for 2× damage...
    expect(hits.length).toBe(2);
    for (const h of hits) expect(h.amount).toBeCloseTo(SPELLS.fireball.damage[0], 5);
    // ...and exactly 1× push, all of it the trailing ball's
    expect(peak).toBeCloseTo(solo, 4);
  });

  it('HARD RULE: a trailing ball can never trigger a pair of its own (no chaining)', () => {
    // The descendant of the old trap's `noStacks` scar: unbounded
    // self-triggering is this element's failure mode. A threshold crossed on a
    // trailing ball is DEFERRED to the next player-initiated cast.
    const f = ELEMENTS.mosquito.fx;
    const every = f.doubleEvery[0];
    const state = elementalBattle(3);
    const a = state.players.p0;
    state.players.p1.x = 0; state.players.p1.y = 20;
    state.players.p2.x = 0; state.players.p2.y = -20;
    state.pillars = [];
    a.elements = { mosquito: 1 };
    a.mosqN = every - 1;
    a.x = 0; a.y = 0; a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0);
    expect(state.delayedShots.length).toBe(1);
    // force the worst case: the counter sits ON the threshold when the trailing
    // ball leaves (a chaining implementation would queue another one here)
    a.mosqN = every - 1;
    run(state, f.trailDelay + 2 * DT);
    expect(state.delayedShots.length).toBe(0);   // nothing re-queued: no chain
    expect(a.mosqDue).toBe(true);                // the crossing is remembered...
    a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0);
    expect(state.delayedShots.length).toBe(1);   // ...and paid by the next cast
    expect(a.mosqDue).toBe(false);
  });

  it('a trailing ball counts as a CAST for vampire, and can be the engorged one', () => {
    // Remi (round 20.1): "the player should be rewarded for casting, all
    // every-N counters count" — so the trailing ball advances vampN and an
    // on-threshold trailing ball flies engorged.
    const f = ELEMENTS.mosquito.fx, vf = ELEMENTS.vampire.fx;
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -20;
    state.pillars = [];
    a.elements = { mosquito: 1, vampire: 1 };
    a.mosqN = f.doubleEvery[0] - 1;      // this cast is the pair's lead
    a.vampN = vf.chargeEvery - 2;        // lead -> N-1, trailing -> N (engorged)
    a.hp = a.maxHp - 60;
    a.x = 0; a.y = 0; a.cooldowns = {};
    b.x = 6; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    b.maxHp = 9999; b.hp = 9999;
    castSpell(state, 'p0', 'fireball', 20, 0);
    expect(!!state.projectiles[state.projectiles.length - 1].engorged).toBe(false);
    run(state, 1);
    expect(a.vampN).toBe(vf.chargeEvery);        // the trail advanced the counter
    expect(a.healLifesteal).toBeCloseTo(
      SPELLS.fireball.damage[0] * vf.chargeLifesteal[0], 1);
  });

  // ⚠ Two ROUND 21.0 RULINGS (Remi: "reflect the ball as it was" / "part of the
  // game physics"). Round 20.4 "fixed" both of these and was reverted — these
  // tests exist so nobody fixes them again.
  //
  // Shoot b (shielded, so the ball comes straight back) and return the PEAK
  // shove the reflected ball puts on the caster. `pair` = make it the pair's
  // no-push LEAD; otherwise it is an ordinary fireball, the control.
  function reflectedShove(pair) {
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.elements = { mosquito: 1 };
    if (pair) a.mosqN = ELEMENTS.mosquito.fx.doubleEvery[0] - 1;
    a.x = 0; a.y = 0; a.vx = a.vy = 0; a.moveTarget = null; a.cooldowns = {};
    a.maxHp = 9999; a.hp = 9999;
    b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    b.shieldT = SPELLS.shield.duration;
    castSpell(state, 'p0', 'fireball', 20, 0);
    state.delayedShots = []; // measure the LEAD alone: the trail would add a 2nd push
    let peak = 0;
    for (let i = 0; i < 20; i++) {
      state.events = [];
      step(state, DT);
      peak = Math.max(peak, Math.abs(a.vx));
      if (state.events.some(e => e.t === 'hit' && e.id === 'p0')) break;
    }
    return peak;
  }

  it('RULING: a reflected ball comes back AS IT WAS — a pair lead still has no push', () => {
    const control = reflectedShove(false);
    expect(control).toBeGreaterThan(1);       // an ordinary ball does shove
    expect(reflectedShove(true)).toBe(0);     // the no-push lead stays no-push
  });

  it('RULING: the TRAILING ball leaves from where the owner IS, on the original aim', () => {
    // Being knocked/portalled/blinked inside trailDelay really does move where
    // the twin comes from — only the aim was pinned at cast time.
    const f = ELEMENTS.mosquito.fx;
    const state = elementalBattle(3);
    const a = state.players.p0;
    state.players.p1.x = 0; state.players.p1.y = 45;
    state.players.p2.x = 0; state.players.p2.y = -45;
    state.pillars = [];
    a.elements = { mosquito: 1 };
    a.mosqN = f.doubleEvery[0] - 1;
    a.x = 0; a.y = 0; a.vx = a.vy = 0; a.moveTarget = null; a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0);
    const lead = state.projectiles[state.projectiles.length - 1];
    const aim = { vx: lead.vx, vy: lead.vy };
    expect(lead.y).toBeCloseTo(0, 5);
    expect(state.delayedShots.length).toBe(1);
    a.x = 0; a.y = 25; a.vx = a.vy = 0;   // portalled/knocked mid-delay
    const leadId = lead.id;
    const evs = [];
    // stop on the frame the trail leaves: it has flown exactly one tick then
    for (let i = 0; i < Math.round((f.trailDelay + 2 * DT) / DT); i++) {
      state.events = [];
      step(state, DT);
      for (const e of state.events) if (e.t === 'cast' && e.trail) evs.push(e);
      if (!state.delayedShots.length) break;
    }
    expect(state.delayedShots.length).toBe(0);
    const trail = state.projectiles.find(p => p.id > leadId && p.type === 'fireball');
    expect(trail).toBeTruthy();
    expect(trail.y).toBeCloseTo(25, 5);         // the owner's NEW y, not the muzzle's 0
    expect(trail.vx).toBeCloseTo(aim.vx, 5);    // ...but the SAME aim
    expect(trail.vy).toBeCloseTo(aim.vy, 5);
    expect(evs.length).toBe(1);                 // the client draws it there too
    expect(evs[0].y).toBeCloseTo(25, 5);
  });

  it('the Echo Stone is GONE — merged into mosquito, absent from the catalogue', () => {
    expect(ITEMS.echo).toBeUndefined();
    expect(ITEM_FX.echo).toBeUndefined();
    expect(catalogue('elemental').some(e => e.key === 'echo')).toBe(false);
    expect(catalogue('classic').some(e => e.key === 'echo')).toBe(false);
    const el = createGame({ seed: 3, mode: 'elemental' });
    addPlayer(el, 'a', 'A');
    el.phase = 'shop';
    el.players.a.gold = 999;
    expect(buy(el, 'a', 'echo').ok).toBe(false);
    expect(el.players.a.items.echo).toBeUndefined();
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

  // Round 19 (Remi): gale is UNIFORM across levels — flat kbAdd per level,
  // stack-and-burst from LEVEL 1, and the gust adds a flat VALUE (never a
  // multiplier, which scaled weirdly with other push riders). Spec-read.
  it('gale: a flat fireball push increase at every level', () => {
    const f = ELEMENTS.gale.fx;
    const fb = SPELLS.fireball;
    const plain = galePeaks({}, 1).peaks[0];
    expect(plain).toBeGreaterThan(0);
    const { peaks } = galePeaks({ gale: 1 }, 2);
    const want = (fb.knockback[0] + f.kbAdd[0]) / fb.knockback[0];
    for (const p of peaks) expect(p / plain).toBeCloseTo(want, 1);
  });

  it('gale: stacking lives at LEVEL 1 — the 3rd hit gusts by a flat value', () => {
    const f = ELEMENTS.gale.fx;
    const fb = SPELLS.fireball;
    const need = f.stacksToTrigger;
    const { state, peaks } = galePeaks({ gale: 1 }, need);
    const b = state.players.p1;
    // hits before the last are the ordinary lv1 shove — no gust leak
    for (let i = 0; i < need - 1; i++) expect(peaks[i] / peaks[0]).toBeCloseTo(1, 1);
    // ...and the last adds the spec's flat gust value on top
    const base = fb.knockback[0] + f.kbAdd[0];
    expect(peaks[need - 1] / peaks[0]).toBeCloseTo((base + f.burstKbAdd[0]) / base, 1);
    expect(galeOn(b, 'p0')).toBe(0);   // spent
    expect(state.events.filter(e => e.t === 'gale').length).toBe(need);
    expect(state.events.filter(e => e.t === 'galeBurst').length).toBe(1);
  });

  it('gale: the gust value ladders by level (lv3 > lv1, both flat)', () => {
    const f = ELEMENTS.gale.fx;
    const fb = SPELLS.fireball;
    const need = f.stacksToTrigger;
    const lv3 = galePeaks({ gale: 3 }, need).peaks;
    const base3 = fb.knockback[0] + f.kbAdd[2];
    expect(lv3[need - 1] / lv3[0]).toBeCloseTo((base3 + f.burstKbAdd[2]) / base3, 1);
    expect(f.burstKbAdd[2]).toBeGreaterThan(f.burstKbAdd[0]);
  });

  it('gale: stopping one short leaves stacks on the body and no burst', () => {
    const need = ELEMENTS.gale.fx.stacksToTrigger;
    const { state } = galePeaks({ gale: 1 }, need - 1);
    expect(galeOn(state.players.p1, 'p0')).toBe(need - 1);
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
    // plainPeak is itself a lv3 gale hit (kbAdd included), so the burst ratio
    // is (base + gust) / base with base = fireball kb + kbAdd[2]
    const gf = ELEMENTS.gale.fx;
    const base = SPELLS.fireball.knockback[0] + gf.kbAdd[2];
    expect(peak / plainPeak).toBeCloseTo((base + gf.burstKbAdd[2]) / base, 1);
    expect(state.events.some(e => e.t === 'galeBurst')).toBe(true);
  });

  it('midas (round 17): the first hit plants a 🪙 mark, the SECOND cashes +1 g', () => {
    const state = hitWith('midas');
    const a = state.players.p0, b = state.players.p1;
    // hit 1: no gold yet — the mark is planted (private, on the stack store)
    expect(a.gold).toBe(GOLD.START);
    expect(stacksOf(b, 'midas', 'p0')).toBe(1);
    expect(state.events.some(e => e.t === 'midasMark' && e.id === 'p1')).toBe(true);
    expect(b.maxHp - b.hp).toBeGreaterThan(3.3); // the −50% penalty still applies
    expect(b.maxHp - b.hp).toBeLessThan(4.7);
    // hit 2 on the SAME target: cash — and the mark is spent
    b.hp = b.maxHp; b.x = 8; b.y = 0; b.vx = 0; b.vy = 0;
    a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.4);
    expect(a.gold).toBe(GOLD.START + ELEMENTS.midas.fx.goldOnHit[0]);
    expect(stacksOf(b, 'midas', 'p0')).toBe(0);
    expect(state.events.some(e => e.t === 'gold' && e.id === 'p0')).toBe(true);
  });

  it('midas marks are per-target and private per attacker', () => {
    // a mark on b does not pay out on c: hitting c plants c's OWN mark
    const state = hitWith('midas');
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    expect(stacksOf(b, 'midas', 'p0')).toBe(1);
    c.x = 8; c.y = 0; c.vx = 0; c.vy = 0; c.moveTarget = null; c.maxHp = 500; c.hp = 500;
    b.x = 0; b.y = 30; b.vx = 0; b.vy = 0;   // parked out of the shot line
    a.x = 0; a.y = 0; a.cooldowns = {};
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.4);
    expect(a.gold).toBe(GOLD.START);          // no cash: c had no mark
    expect(stacksOf(c, 'midas', 'p0')).toBe(1);
    expect(stacksOf(b, 'midas', 'p0')).toBe(1); // b's mark still waiting
  });

  it('midas cashes +1 g at EVERY level — never more', () => {
    for (const level of [1, 2, 3]) {
      const state = hitWith({ midas: level });
      const a = state.players.p0, b = state.players.p1;
      // two hits = plant + cash, at every level the same flat +1 g
      b.hp = b.maxHp; b.x = 8; b.y = 0; b.vx = 0; b.vy = 0;
      a.cooldowns = {};
      castSpell(state, 'p0', 'fireball', 20, 0);
      run(state, 0.4);
      expect(a.gold).toBe(GOLD.START + 1);
      expect(a.roundGold).toBe(1);
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
    expect(lv3).toBeGreaterThan(lv1 * 1.4);                 // lv3 buys it all back...
    expect(lv3).toBeCloseTo(base, 1);                       // ...to a PENALTY-FREE fireball (round 17.2)
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

  // Round 20.2 — terra lv3 "Demolisher": your fireballs smash Stone Pillars.
  // The pillar dies, the ball dies with it (Remi ruled pass-through too strong).
  // Levels are read off the spec (smashAtLevel), never pinned.
  describe('terra lv3 Demolisher (pillars)', () => {
    // one player at the origin, one pillar at x=10, the others parked far away
    // so nothing else can end the round or eat the ball
    const shootAtPillar = (setup) => {
      const state = elementalBattle(3);
      const a = state.players.p0;
      state.players.p1.x = 0; state.players.p1.y = 45;
      state.players.p2.x = 0; state.players.p2.y = -45;
      state.pillars = [{ x: 10, y: 0, r: 2.5, sunk: false }];
      state.walls = [];
      a.x = 0; a.y = 0;
      const spell = setup(a) || 'fireball';
      state.events = [];
      castSpell(state, 'p0', spell, 30, 0);
      run(state, 0.6);
      return state;
    };
    const smashLvl = ELEMENTS.terra.fx.smashAtLevel;

    it('a terra-lv3 fireball destroys the pillar and is consumed with it', () => {
      const state = shootAtPillar((a) => { a.elements = { terra: smashLvl }; });
      expect(state.pillars.length).toBe(0);
      expect(state.projectiles.length).toBe(0);         // no pass-through
      const ev = state.events.find(e => e.t === 'pillarBroken');
      expect(ev).toBeTruthy();
      expect(ev.x).toBeCloseTo(10, 5);
      expect(ev.y).toBeCloseTo(0, 5);
    });

    it('below lv3 terra the pillar just blocks the ball, as always', () => {
      const state = shootAtPillar((a) => { a.elements = { terra: smashLvl - 1 }; });
      expect(state.pillars.length).toBe(1);
      expect(state.projectiles.length).toBe(0);         // still eaten
      expect(state.events.some(e => e.t === 'pillarBroken')).toBe(false);
    });

    it('Mirror Walls are NOT demolished: a terra-lv3 ball still bounces off one', () => {
      const state = elementalBattle(3);
      const a = state.players.p0;
      state.players.p1.x = 0; state.players.p1.y = 45;
      state.players.p2.x = 0; state.players.p2.y = -45;
      state.pillars = [];
      a.elements = { terra: smashLvl };
      a.x = 0; a.y = 0;
      state.walls = [{ x1: 14, y1: -6, x2: 14, y2: 6, nx: 1, ny: 0,
        owner: 'p1', until: state.time + 99 }];
      state.events = [];
      castSpell(state, 'p0', 'fireball', 30, 0);
      run(state, 0.6);
      expect(state.walls.length).toBe(1);               // untouched
      expect(state.events.some(e => e.t === 'reflect')).toBe(true);
      expect(state.events.some(e => e.t === 'pillarBroken')).toBe(false);
    });

    it('only fireballs demolish: the same owner\'s boomerang bounces off the pillar', () => {
      const state = shootAtPillar((a) => {
        a.elements = { terra: smashLvl };
        a.spells.boomerang = 1;
        return 'boomerang';
      });
      // it really did reach the pillar (the boom is the pillar eating it)
      expect(state.events.some(e => e.t === 'boom' && e.spell === 'boomerang')).toBe(true);
      expect(state.pillars.length).toBe(1);
      expect(state.events.some(e => e.t === 'pillarBroken')).toBe(false);
    });
  });

  it('the hourglass sells anywhere, at its per-level prices', () => {
    const classic = createGame({ seed: 6, mode: 'classic' });
    addPlayer(classic, 'a', 'Alice');
    classic.phase = 'shop';
    classic.players.a.gold = 99;
    // classic fireball stays capped at 3 even with gold to burn
    for (let i = 0; i < 5; i++) buy(classic, 'a', 'fireball');
    expect(classic.players.a.spells.fireball).toBe(SPELLS.fireball.maxLevel);

    // the hourglass (round 16: the ex-arcane global CDR as an item) sells in
    // classic too, at whatever the spec prices each level — flat `cost`, or a
    // `costs` array if one is ever added back
    const spec = ITEMS.hourglass;
    const price = (lv) => (Array.isArray(spec.costs)
      ? spec.costs[Math.min(lv, spec.costs.length - 1)] : spec.cost);
    const a = classic.players.a;
    a.gold = 99;
    let spent = 0, want = 0;
    for (let lv = 0; lv < spec.maxLevel; lv++) {
      expect(itemCost('hourglass', lv)).toBe(price(lv));
      want += price(lv);
      const before = a.gold;
      expect(buy(classic, 'a', 'hourglass').ok).toBe(true);
      spent += before - a.gold;
    }
    expect(spent).toBe(want);
    expect(buy(classic, 'a', 'hourglass').err).toBe('max level');
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
    // the full fireball's worth. This is the rule that bounds every-N lifesteal.
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

  it('the vampire charge counter RESETS on a round boundary (unlike anger marks)', () => {
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
    // ...and a DoT tick does NOT either: a tick is a burn, not a hit
    // (manual poison fields: malady's two-hit infection is its own test)
    const state = hitWith({ arcane: 3, malady: 1 });
    const a = state.players.p0, b = state.players.p1;
    b.maxHp = 500; b.hp = 500;
    b.poisonT = 4; b.poisonTick = 1; b._poisonNext = 0.5; b.poisonBy = 'p0';
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

  it('ghost + mosquito: BOTH balls of a pair pierce, and carry the full rider set', () => {
    // The pair is two of the owner's ordinary fireballs, so every rider rides
    // both: ghost's passthrough on the lead AND on the trailing ball.
    const f = ELEMENTS.mosquito.fx;
    const state = elementalBattle(3);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    state.pillars = [];
    a.elements = { mosquito: 1, ghost: ELEMENTS.ghost.fx.pierceAtLevel };
    a.mosqN = f.doubleEvery[0] - 1;        // the next cast is the pair's lead
    a.x = 0; a.y = 0; a.cooldowns = {};
    for (const v of [b, c]) {
      v.vx = v.vy = 0; v.moveTarget = null; v.maxHp = 9999; v.hp = 9999;
    }
    b.x = 6; b.y = 0; c.x = 12; c.y = 0;
    castSpell(state, 'p0', 'fireball', 20, 0);
    const lead = state.projectiles[state.projectiles.length - 1];
    expect(lead.pierce).toBe(true);
    expect(lead.kbScale).toBe(0);
    expect(lead.elements.mosquito).toBe(1);
    // let the trailing ball leave, and check it the same way
    let trail = null;
    for (let i = 0; i < 12 && !trail; i++) {
      step(state, DT);
      trail = state.projectiles.find(p => p.id !== lead.id && p.type === 'fireball');
    }
    expect(trail).toBeTruthy();
    expect(trail.pierce).toBe(true);
    expect(trail.kbScale).toBeUndefined();   // the trail pushes normally
    expect(trail.elements.ghost).toBe(ELEMENTS.ghost.fx.pierceAtLevel);
    expect(trail.elements.mosquito).toBe(1);
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
    const same = [0, 1, 2, 3].map(i => botElementFor({ build: 'warlord' }, i));
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

  it('bots never buy power-tier spells a build lists — EXCEPT meteor (round 20: piloted)', () => {
    const state = freshBattle(2);
    state.phase = 'shop';
    const bot = state.players.p0;
    bot.kind = 'berserker'; bot.gold = 999;
    bot.build = null;
    // inject power spells into the consumed order to prove the guard, not the
    // omission, is what protects us. Meteor is the ONE exception: it has a
    // pilot now (the CC-gated cast), so an order that explicitly lists it may
    // buy it — everything else in the tier stays structurally unbuyable.
    const orig = BUILDS.warlord.order;
    try {
      BUILDS.warlord.order = ['meteor', 'swap', 'repulse', 'wall', 'nova', 'fireball'];
      bot.build = 'warlord';
      botShop(state, 'p0');
      for (const key of ['swap', 'repulse', 'wall', 'nova'])
        expect(bot.spells[key] || 0).toBe(0);
      expect(bot.spells.meteor).toBe(1);              // the piloted exception
      expect(bot.spells.fireball).toBeGreaterThan(1); // it still shops normally
    } finally {
      BUILDS.warlord.order = orig;
    }
  });

  it('meteor never reaches a bot whose order does not list it (leftover pool excluded)', () => {
    // round 19.1 leftover shopping buys "everything" once the path is maxed —
    // the power tier must stay out of that random pool, meteor included.
    const state = freshBattle(2);
    state.phase = 'shop';
    const bot = state.players.p0;
    bot.kind = 'berserker'; bot.build = 'warlord'; bot.gold = 999;
    for (let i = 0; i < 12; i++) botShop(state, 'p0');
    for (const key of Object.keys(SPELLS))
      if (SPELLS[key].tier === 'power') expect(bot.spells[key] || 0).toBe(0);
  });

  it('pillar: raises a blocker, stacks freely (round 17), and NEVER expires (21.2)', () => {
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
    // round 17 (Remi): no per-caster limit — recasting ADDS a second stone
    a.cooldowns = {};
    castSpell(state, 'p0', 'pillar', -6, 0);
    expect(state.pillars.length).toBe(2);
    // round 21.2 ruling: pillars are PERMANENT — both stones outlive the old
    // duration and every timer the sim knows about
    run(state, SPELLS.pillar.duration[0] + SPELLS.pillar.duration[1] + 2);
    expect(state.pillars.length).toBe(2);
    expect(state.pillars.every(p => !p.until)).toBe(true);
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
    // round 19.2 (Remi): the VICTIM is stunned after the trade (the combo
    // window), the caster stays free to act on it. Round 20.5: the duration is
    // computed from the swapped distance — 15 units here, which is short enough
    // to sit on the floor.
    expect(b.stunT).toBeCloseTo(swapStun(15), 5);
    expect(b.stunT).toBeCloseTo(SPELLS.swap.stun.min, 5);
    expect(a.stunT).toBe(0);
    expect(castSpell(state, 'p1', 'fireball', 0, 0)).toBe(false); // stunned = silent
  });

  // Round 20.5 (Remi's ruling): the stun must ALWAYS cover the caster's
  // follow-up fireball. Every number below is recomputed from the spec —
  // `pad` + flight time of a BASE fireball over the distance actually swapped,
  // floored by `min`, capped only if the spec grows a `max`.
  function swapStun(d) {
    const s = SPELLS.swap.stun;
    let t = Math.max(s.min, s.pad + d / SPELLS.fireball.speed);
    if (s.max) t = Math.min(t, s.max);
    return t;
  }

  // Swap the two players over `d` units and report the stun the victim woke
  // with. Level 3 so the bolt's range never limits the distance under test.
  function stunAfterSwapOver(d) {
    const state = freshBattle(2);
    const a = state.players.p0, b = state.players.p1;
    a.spells.swap = 3;
    state.pillars = [];
    a.x = -d / 2; a.y = 0; a.vx = 0; a.vy = 0; a.moveTarget = null;
    b.x = d / 2; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null;
    castSpell(state, 'p0', 'swap', d, 0);
    expect(stepToSwap(state, 300)).toBeTruthy();
    return b.stunT;
  }

  it('swap: a short swap keeps the floor, a long swap buys fireball flight time', () => {
    // short: pad + 10/speed is under the floor, so the floor is what lands
    expect(SPELLS.swap.stun.pad + 10 / SPELLS.fireball.speed)
      .toBeLessThan(SPELLS.swap.stun.min);
    expect(stunAfterSwapOver(10)).toBeCloseTo(SPELLS.swap.stun.min, 2);
    // long: the formula clears the floor and the stun is exactly pad + d/speed
    for (const d of [40, 70]) {
      expect(swapStun(d)).toBeGreaterThan(SPELLS.swap.stun.min);
      expect(stunAfterSwapOver(d)).toBeCloseTo(swapStun(d), 2);
    }
  });

  it('swap: the stun never shrinks as the swap gets longer, and always outlasts the combo ball', () => {
    const ds = [5, 10, 20, 40, 55, 70];
    const stuns = ds.map(stunAfterSwapOver);
    for (let i = 1; i < stuns.length; i++) {
      expect(stuns[i]).toBeGreaterThanOrEqual(stuns[i - 1] - 1e-6);
    }
    // the whole point: the victim is still frozen when the follow-up base
    // fireball (no element riders) crosses the gap the swap opened
    for (let i = 0; i < ds.length; i++) {
      expect(stuns[i]).toBeGreaterThan(ds[i] / SPELLS.fireball.speed);
    }
  });

  it('swap: the stun is CLAMPED at spec `max` — an absurd trade still wakes you at 3 s', () => {
    // Round 21.0 (Remi). The gap is measured between the two traded positions AT
    // the switch moment, so anything that moves either end during the bolt's
    // flight lengthens the stun — unbounded without a ceiling. It is not a
    // theoretical ceiling: a full cross-arena trade (2 × START_RADIUS) already
    // asks for more than `max`.
    const s = SPELLS.swap.stun;
    expect(s.pad + 2 * ARENA.START_RADIUS / SPELLS.fireball.speed).toBeGreaterThan(s.max);
    const state = freshBattle(2);
    const a = state.players.p0, b = state.players.p1;
    a.spells.swap = 1;
    state.pillars = [];
    a.x = 0; a.y = 0; a.vx = a.vy = 0; a.moveTarget = null;
    a.maxHp = 9999; a.hp = 9999;                       // he spends the trip in lava
    b.x = 12; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    castSpell(state, 'p0', 'swap', 40, 0);
    step(state, DT);
    a.x = -200; a.vx = a.vy = 0; a.moveTarget = null;  // blown absurdly far mid-bolt
    expect(stepToSwap(state, 300)).toBeTruthy();
    expect(s.pad + 212 / SPELLS.fireball.speed).toBeGreaterThan(5);  // raw formula
    expect(swapStun(212)).toBe(s.max);                               // clamped
    expect(b.stunT).toBeCloseTo(s.max, 5);
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

  it('swap: interrupts the victim mid-dash (but NOT a repulse charge — round 21.0)', () => {
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
    expect(a.charging).toBeTruthy();   // the charge rides along (see the ruling below)
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
    a.elements = { malady: 1, midas: 1 };
    state.pillars = [];
    a.x = 0; a.y = 0; b.x = 15; b.y = 0; b.vx = 0; b.moveTarget = null;
    state.players.p2.x = 0; state.players.p2.y = -45;
    const gold0 = a.gold;
    castSpell(state, 'p0', 'swap', 20, 0);
    expect(stepToSwap(state)).toBeTruthy();
    expect((b.stacks && b.stacks.malady && b.stacks.malady.p0) || 0).toBe(0); // no malady
    expect(a.gold).toBe(gold0);            // no midas
    expect(Math.abs(b.vx)).toBeLessThan(1); // no knockback: b got a's rest state
  });

  it('swap: range and cooldown come from the spec at lv1 and lv3 (round 18.1)', () => {
    const spec = SPELLS.swap;
    expect(spec.maxLevel).toBe(3);
    for (const level of [1, spec.maxLevel]) {
      const state = freshBattle(3);
      const a = state.players.p0;
      state.pillars = [];
      a.x = 0; a.y = 0; a.vx = a.vy = 0; a.moveTarget = null;
      // park the others OFF the flight path so the bolt expires on range
      state.players.p1.x = 0; state.players.p1.y = 45; state.players.p1.moveTarget = null;
      state.players.p2.x = 0; state.players.p2.y = -45; state.players.p2.moveTarget = null;
      a.spells.swap = level; a.cooldowns = {};
      expect(castSpell(state, 'p0', 'swap', 20, 0)).toBe(true);
      expect(a.cooldowns.swap).toBeCloseTo(spec.cooldown[level - 1], 5);
      let traveled = 0, flying = true;
      for (let i = 0; i < 200 && flying; i++) {
        step(state, DT);
        const pr = state.projectiles.find(p => p.type === 'swap');
        if (pr) traveled = pr.traveled; else flying = false;
      }
      const range = spec.range[level - 1];
      expect(flying).toBe(false);                  // expired on range, not the loop cap
      expect(traveled).toBeLessThan(range);        // culled the tick it crossed
      expect(traveled).toBeGreaterThan(range - spec.speed * DT * 2);
    }
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

  // ⚠ ROUND 21.0 RULING (Remi: "if you start charging, you blow up eventually").
  // The repulse wind-up is UNCANCELLABLE: frost, Switcheroo and lava portals all
  // used to null it, and none of them may again. Only death defuses the bomb.
  //
  // Step until p<id> detonates and return the `repulse` event (null if it never
  // does) — the event carries the blast's position and radius.
  function stepToBoom(state, id, ticks = 200) {
    for (let i = 0; i < ticks; i++) {
      state.events = [];
      step(state, DT);
      const e = state.events.find(ev => ev.t === 'repulse' && ev.id === id);
      if (e) return e;
    }
    return null;
  }

  it('RULING: a frost stun does not defuse the charge — frozen solid, they still blow up', () => {
    const state = createGame({ seed: 42, mode: 'elemental' });
    for (let i = 0; i < 3; i++) addPlayer(state, `p${i}`, `Player${i}`);
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    const a = state.players.p0, b = state.players.p1;
    state.players.p2.x = 0; state.players.p2.y = -45; state.players.p2.moveTarget = null;
    state.pillars = [];
    a.elements = { frost: 3 };          // lv3 frost = a real stun on the 3rd stack
    b.spells.repulse = 1;
    b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    expect(castSpell(state, 'p1', 'repulse', 8, 0)).toBe(true);
    for (let i = 0; i < 3; i++) {       // three point-blank frost fireballs
      a.x = 0; a.y = 0; a.vx = a.vy = 0; a.cooldowns = {};
      b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null; b.hp = b.maxHp;
      castSpell(state, 'p0', 'fireball', 20, 0);
      run(state, 0.4);
    }
    expect(b.stunT).toBeGreaterThan(0);   // frozen...
    expect(b.charging).toBeTruthy();      // ...and still winding up
    state.projectiles = [];
    b.x = 8; b.y = 0; b.vx = b.vy = 0;                       // undo the last shove
    a.x = 8; a.y = 2; a.vx = a.vy = 0; a.moveTarget = null;  // stand on the bomb
    const hp0 = a.hp;
    expect(stepToBoom(state, 'p1')).toBeTruthy();
    expect(b.charging).toBeFalsy();
    expect(a.hp).toBeLessThan(hp0);
  });

  it('RULING: a Switcheroo does not defuse either charge — each bomb travels with its owner', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    a.spells.swap = 1;
    state.pillars = [];
    a.x = 0; a.y = 0; a.vx = a.vy = 0; a.moveTarget = null;
    b.x = 15; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null;
    state.players.p2.x = 0; state.players.p2.y = -40; state.players.p2.moveTarget = null;
    castSpell(state, 'p0', 'swap', 20, 0);
    a.charging = { left: 1.5, level: 1 };   // both ends winding up when they trade
    b.charging = { left: 1.5, level: 1 };
    expect(stepToSwap(state)).toBeTruthy();
    expect(a.charging).toBeTruthy();
    expect(b.charging).toBeTruthy();
    // each detonates where its owner ENDED UP: swapping a charger drags the
    // blast onto your own old spot. Both are on the same clock, so collect
    // them in ONE pass — they land on the same tick.
    const at = {};
    for (let i = 0; i < 200 && !(at.p0 && at.p1); i++) {
      state.events = [];
      step(state, DT);
      for (const e of state.events) if (e.t === 'repulse') at[e.id] = e;
    }
    expect(at.p0).toBeTruthy();
    expect(at.p1).toBeTruthy();
    expect(at.p0.x).toBeGreaterThan(10);    // p0 blew up at p1's old place
    expect(Math.abs(at.p1.x)).toBeLessThan(5);
  });

  it('RULING: a lava portal does not defuse the charge — it detonates at the center', () => {
    const state = freshBattle(3);
    const a = state.players.p0;
    const P = ARENA.PORTALS;
    const ang = P.ANGLE;
    const d = ARENA.START_RADIUS * P.DIST_FRAC;
    state.pillars = [];
    a.spells.repulse = 1;
    a.x = Math.cos(ang) * d; a.y = Math.sin(ang) * d;
    a.vx = a.vy = 0; a.moveTarget = null; a.maxHp = 9999; a.hp = 9999;
    state.players.p1.x = 0; state.players.p1.y = 40; state.players.p1.moveTarget = null;
    state.players.p2.x = 0; state.players.p2.y = -40; state.players.p2.moveTarget = null;
    expect(castSpell(state, 'p0', 'repulse', a.x, a.y)).toBe(true);
    const e = stepToBoom(state, 'p0');
    expect(e).toBeTruthy();
    expect(Math.hypot(e.x, e.y)).toBeLessThan(2);   // ported home, blew up there
    // and the ring the client draws is the spell's OWN radius
    expect(e.r).toBe(SPELLS.repulse.radius[0]);
  });

  it('RULING: death is the ONE thing that defuses a charge', () => {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.pillars = [];
    b.spells.repulse = 1;
    a.x = 0; a.y = 0; a.vx = a.vy = 0; a.moveTarget = null; a.cooldowns = {};
    b.x = 8; b.y = 0; b.vx = b.vy = 0; b.moveTarget = null; b.hp = 1;
    state.players.p2.x = 0; state.players.p2.y = -40; state.players.p2.moveTarget = null;
    expect(castSpell(state, 'p1', 'repulse', 8, 0)).toBe(true);
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 0.4);
    expect(b.alive).toBe(false);
    expect(b.charging).toBe(null);
    expect(stepToBoom(state, 'p1', 90)).toBe(null);  // no posthumous blast
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

  it('mirror wall never blocks BODIES — projectiles only (Remi, round 19.1)', () => {
    // Round 18.1 briefly made walls tangible off a garbled transcription;
    // Remi's ruling: he never asked — walls reflect shots and nothing else.
    const state = freshBattle(3);
    state.pillars = [];
    const a = state.players.p0;
    a.x = -6; a.y = 0; a.vx = a.vy = 0;
    state.walls = [{ x1: 0, y1: -5, x2: 0, y2: 5, nx: -1, ny: 0,
      owner: 'p1', until: state.time + 60 }];
    setMoveTarget(state, 'p0', 10, 0);
    run(state, 2);
    expect(a.x).toBeGreaterThan(5); // walked straight through
  });
});

describe('testing sandbox: bots spend their pile (round 19.8)', () => {
  it('a bot given 100 g follows its whole strategy in the one untimed shop', () => {
    const state = createGame({ seed: 3, mode: 'elemental' });
    addPlayer(state, 'h', 'H');
    addPlayer(state, 'b', 'B', { bot: true, kind: 'berserker', build: 'warlord' });
    setTesting(state, true, 100);
    startGame(state);
    expect(state.phase).toBe('shop');
    const b = state.players.b;
    expect(b.gold).toBe(100);
    botShop(state, 'b');     // the engine's shop-entry hook calls this once
    // deep spend, not one polite pass: the pile is gone into the strategy
    expect(b.gold).toBeLessThan(20);
    expect(Object.values(b.elements).some(v => v > 1)).toBe(true); // multi-level
    // and it is stable: a second call changes nothing (no oscillation)
    const g = b.gold;
    botShop(state, 'b');
    expect(b.gold).toBe(g);
  });

  it('normal rounds keep the one-pass pacing (no change outside testing)', () => {
    const state = createGame({ seed: 3, mode: 'elemental' });
    addPlayer(state, 'h', 'H');
    addPlayer(state, 'b', 'B', { bot: true, kind: 'berserker', build: 'warlord' });
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    state.phase = 'shop';
    const b = state.players.b;
    b.gold = 999;
    botShop(state, 'b');
    // ONE pass never reaches the random fallback: warlord's list holds arcane
    // twice (max 3) and cape once, so the path cannot complete in one pass —
    // nothing outside the list may appear (treads/ghost are not in it)
    expect(b.items.treads || 0).toBe(0);
    expect(b.elements.ghost || 0).toBe(0);
  });
});

describe('rush cancels momentum (round 19.6)', () => {
  it('casting rush zeroes knockback velocity — the combo escape', () => {
    const state = freshBattle(2);
    const a = state.players.p0;
    a.spells.rush = 1;
    a.x = 0; a.y = 0;
    a.vx = 60; a.vy = -40;   // mid-launch toward the lava
    expect(castSpell(state, 'p0', 'rush', -10, 0)).toBe(true);
    expect(a.vx).toBe(0);
    expect(a.vy).toBe(0);
    expect(a.dash).toBeTruthy(); // and the dash itself proceeds
  });
});

describe('Chainer build & CC-gated casts (round 20)', () => {
  // Remi's playtest combo: frost holds, the telegraphed spell lands ON the
  // hold. Build order: fireball, then frost → lightning → gale → mosquito at
  // lv1, then those four round-robin to max (mosquito last in the order).
  function chainerShop(gold) {
    const state = createGame({ seed: 11, mode: 'elemental' });
    addPlayer(state, 'b', 'B', { bot: true, kind: 'berserker', build: 'chainer' });
    addPlayer(state, 'h', 'H');
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    state.phase = 'shop';
    state.players.b.gold = gold;
    botShop(state, 'b');
    return state.players.b;
  }

  it("buys Remi's sequence: frost, then lightning, then gale, then mosquito", () => {
    // each lv1 costs 10, so the budget says how deep into the order we get
    const at10 = chainerShop(10);
    expect(at10.elements.frost).toBe(1);
    expect(at10.spells.lightning || 0).toBe(0);
    const at20 = chainerShop(20);
    expect(at20.elements.frost).toBe(1);
    expect(at20.spells.lightning).toBe(1);
    expect(at20.elements.gale || 0).toBe(0);
    const at40 = chainerShop(40);
    expect(at40.elements.frost).toBe(1);       // lv1s of all four BEFORE any lv2
    expect(at40.spells.lightning).toBe(1);
    expect(at40.elements.gale).toBe(1);
    expect(at40.elements.mosquito).toBe(1);    // mosquito last of the four
  });

  it('a bot drops the bolt ON a held body instead of leading it', () => {
    // target walking north: an un-held cast leads by delay × speed (~5+ units),
    // a held cast (≥ BOT_CC_CAST.FROST_STACKS of MY frost) drops on the body.
    const boltFor = (stacks) => {
      const state = freshBattle(2);
      const a = state.players.p0, v = state.players.p1;
      a.bot = true; a.kind = 'berserker'; a.spells = { fireball: 1, lightning: 1 };
      a.x = 0; a.y = 0; v.x = 12; v.y = 0;
      v.moveTarget = { x: 12, y: 40 };            // walking straight north
      if (stacks) v.stacks = { frost: { p0: stacks } };
      for (let i = 0; i < 60 && !state.bolts.length; i++) stepBot(state, 'p0', DT);
      return state.bolts[0];
    };
    const held = boltFor(2);
    expect(held).toBeTruthy();
    expect(Math.hypot(held.x - 12, held.y - 0)).toBeLessThan(1);
    const led = boltFor(0);
    expect(led).toBeTruthy();
    expect(led.y).toBeGreaterThan(2);            // it led the walk — not held
  });

  it('the stalker waives its finish/poke gate for a stunned target', () => {
    const boltFor = (stunT) => {
      const state = freshBattle(2);
      const a = state.players.p0, v = state.players.p1;
      a.bot = true; a.kind = 'stalker'; a.spells = { fireball: 1, lightning: 1 };
      a.x = 0; a.y = 0; v.x = 12; v.y = 0;       // near + full hp: gate says no
      v.stunT = stunT;
      for (let i = 0; i < 60 && !state.bolts.length; i++) stepBot(state, 'p0', DT);
      return state.bolts[0];
    };
    expect(boltFor(0)).toBeUndefined();          // full-hp target at 12: no cast
    const bolt = boltFor(2);
    expect(bolt).toBeTruthy();                   // stunned: bolt, dead on the body
    expect(Math.hypot(bolt.x - 12, bolt.y - 0)).toBeLessThan(1);
  });

  it('meteor fires ONLY into a hold that outlasts the fall (stun or heavy slow)', () => {
    const meteorFor = (setup) => {
      const state = freshBattle(2);
      const a = state.players.p0, v = state.players.p1;
      a.bot = true; a.kind = 'berserker'; a.spells = { fireball: 1, meteor: 1 };
      a.x = 0; a.y = 0; v.x = 12; v.y = 0;
      setup(v);
      for (let i = 0; i < 60 && !state.meteors.length; i++) stepBot(state, 'p0', DT);
      return state.meteors[0];
    };
    expect(meteorFor(() => {})).toBeUndefined();                    // no CC: never
    expect(meteorFor(v => { v.slowT = 3; v.slowMultHit = 0.7; }))   // light slow:
      .toBeUndefined();                                             // walks out
    const pinned = meteorFor(v => { v.slowT = 3; v.slowMultHit = 0.5; });
    expect(pinned).toBeTruthy();                                    // heavy slow
    const stunned = meteorFor(v => { v.stunT = ELEMENTS.frost.fx.stunT[2]; });
    expect(stunned).toBeTruthy();                                   // frost lv3
    expect(ELEMENTS.frost.fx.stunT[2]).toBeGreaterThan(SPELLS.meteor.delay);
    expect(Math.hypot(stunned.x - 12, stunned.y - 0)).toBeLessThan(1);
  });

  it('bots step out of a meteor telegraph like a bolt telegraph', () => {
    const state = freshBattle(2);
    const a = state.players.p0;
    a.bot = true; a.kind = 'stalker'; a.x = 10; a.y = 0;
    state.players.p1.x = -30; state.players.p1.y = 0;
    state.meteors.push({ x: 10, y: 0, t: SPELLS.meteor.delay, owner: 'p1', level: 1 });
    for (let i = 0; i < 30; i++) { stepBot(state, 'p0', DT); step(state, DT); }
    expect(Math.hypot(a.x - 10, a.y - 0))
      .toBeGreaterThan(SPELLS.meteor.radius * 0.5); // it moved off the mark
  });
});

describe('bot shopping never stops (round 19.1)', () => {
  // Remi: "a bot should never stop buying stuff" — once its build path is
  // fully maxed, leftovers go on random upgrades: items first, then
  // pilotable spells, then mutations. Seeded rng, so games stay replayable.
  function shopBot(mode, gold) {
    const state = createGame({ seed: 3, mode });
    addPlayer(state, 'h', 'H');
    addPlayer(state, 'b', 'B', { bot: true, kind: 'berserker', build: 'warlord' });
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    state.phase = 'shop';
    const b = state.players.b;
    b.gold = gold;
    // a real game calls botShop once per shop; the build path advances one
    // level per entry per pass, so simulate a dozen shops
    for (let i = 0; i < 12; i++) botShop(state, 'b');
    return state;
  }

  it('classic: with a fat purse, nothing buyable is left after one shop', () => {
    const state = shopBot('classic', 400);
    for (const key of [...Object.keys(SPELLS), ...Object.keys(ITEMS)]) {
      if (SPELLS[key] && SPELLS[key].tier === 'power') continue; // bot guard
      expect(buy(state, 'b', key).ok).toBe(false); // maxed or genuinely too poor
    }
  });

  it('elemental: mutations join the fallback', () => {
    const state = shopBot('elemental', 500);
    for (const key of Object.keys(ELEMENTS))
      expect(buy(state, 'b', key).ok).toBe(false);
  });

  it('the power-tier guard survives the fallback', () => {
    const state = shopBot('classic', 500);
    const b = state.players.b;
    for (const [k, s] of Object.entries(SPELLS))
      if (s.tier === 'power') expect(b.spells[k] || 0).toBe(0);
  });

  it('a bot still SAVES while its build path has unmet entries', () => {
    // gold below the next list purchase: the fallback must not torch savings
    const state = createGame({ seed: 3, mode: 'classic' });
    addPlayer(state, 'h', 'H');
    addPlayer(state, 'b', 'B', { bot: true, kind: 'berserker', build: 'warlord' });
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    state.phase = 'shop';
    const b = state.players.b;
    b.gold = 2; // can afford nothing on the list — and nothing else either
    botShop(state, 'b');
    expect(b.gold).toBe(2);
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

  it('a damaged idle player STAYS damaged (round 17: no passive regen)', () => {
    const state = freshBattle(2);
    state.players.p0.hp = 50;
    run(state, 5); // idle at spawn, no lava, no items
    expect(state.players.p0.hp).toBeCloseTo(50, 5); // damage is permanent now
    expect(PLAYER.REGEN).toBe(0);
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

  it('round 21.2: lava never destroys a pillar — one out in the lava still blocks', () => {
    const state = freshBattle(2);
    const a = state.players.p0, b = state.players.p1;
    state.arenaRadius = 5; // the lava has swallowed everything past 5u
    state.pillars = [{ x: 10, y: 0, r: 2.5, sunk: false }];
    a.x = 0; a.y = 0; b.x = 20; b.y = 0; b.vx = 0;
    castSpell(state, 'p0', 'fireball', 20, 0);
    run(state, 1.2);
    expect(state.pillars.length).toBe(1);
    expect(state.pillars[0].sunk).toBe(false);   // `sunk` is dead machinery now
    expect(state.events.some(e => e.t === 'boom' && e.spell === 'fireball')).toBe(true);
    expect(state.events.some(e => e.t === 'hit' && e.id === 'p1')).toBe(false);
  });

  it('round 21.2: a pillar placed in round N is still standing in round N+1', () => {
    const state = freshBattle(2);
    const a = state.players.p0, b = state.players.p1;
    a.spells.pillar = 1;
    const defaults = state.pillars.length;   // the arena's own ring
    castSpell(state, 'p0', 'pillar', 6, 6);
    expect(state.pillars.length).toBe(defaults + 1);
    // both swim into the lava on their last hit point: the round ends at once
    a.hp = 0.01; a.x = ARENA.START_RADIUS + 5; a.y = 0; a.moveTarget = null;
    b.hp = 0.01; b.x = -(ARENA.START_RADIUS + 5); b.y = 0; b.moveTarget = null;
    step(state, DT);
    run(state, ROUND.SUMMARY_TIME + ROUND.SHOP_TIME + ROUND.COUNTDOWN + 1);
    expect(state.round).toBe(2);
    expect(state.phase).toBe('battle');
    // the default ring is re-dealt and the placed stone rode along
    expect(state.pillars.length).toBe(defaults + 1);
    const mine = state.pillars.filter(p => p.placedBy === 'p0');
    expect(mine.length).toBe(1);
    expect(Math.hypot(mine[0].x - 6, mine[0].y - 6)).toBeLessThan(0.01);
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
    // round 17 §9: the full-stop regen lock makes hits stick harder, so the
    // grind shortened (~29.5 s, was >30 under the ×0.25 throttle) — the
    // PROPERTY is "slow, not a burst kill", so the floor moved with it
    expect(t).toBeGreaterThan(25);   // ...but regen makes it a long grind
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
    // 32 seeds, one shot each: at 16 the max-spread draw sat close enough to
    // the threshold that any change in rng-stream consumption (e.g. the round
    // 18 spawn-shuffle draws) could flip it. More samples, same bar.
    for (let seed = 1; seed <= 32; seed++) {
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

describe('bot telegraph dodge (boltDodge)', () => {
  // Remi, round 17: Hard dodging 100% of sky-bolts was too tough — the dodge
  // is a committed per-bolt roll now. 0 and 1 make it deterministic to test;
  // the shipped values live in BOTS and are the tuning surface.
  const escapeDist = (chance) => {
    const state = createGame({ seed: 5 });
    addPlayer(state, 'h', 'H');
    addPlayer(state, 'b', 'Bot', { bot: true, kind: 'berserker' });
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    const bot = state.players.b, h = state.players.h;
    state.pillars = [];
    bot.x = 0; bot.y = 0; bot.vx = 0; bot.vy = 0;
    h.x = 30; h.y = 0; h.spells.lightning = 1;
    castSpell(state, 'h', 'lightning', 0, 0);   // bolt centered on the bot
    const saved = BOTS.berserker.boltDodge;
    try {
      BOTS.berserker.boltDodge = chance;
      bot._botT = 0;
      stepBot(state, 'b', DT);
    } finally {
      BOTS.berserker.boltDodge = saved;
    }
    // where did the decision send it? a dodge hop lands just outside the zone
    // (~5 u from the bolt center); the normal hunt ring is ~20 u away at the prey
    return bot.moveTarget ? Math.hypot(bot.moveTarget.x, bot.moveTarget.y) : 0;
  };

  it('boltDodge 1 steps out of the zone; 0 commits to eating the bolt', () => {
    expect(escapeDist(1)).toBeGreaterThan(SPELLS.lightning.radius);
    expect(escapeDist(1)).toBeLessThan(8);
    expect(escapeDist(0)).toBeGreaterThan(12); // went hunting instead
  });

  it('every tier carries an explicit boltDodge (grunts never dodge at all)', () => {
    for (const kind of ['brawler', 'berserker', 'stalker']) {
      expect(BOTS[kind].boltDodge).toBeGreaterThan(0);
      expect(BOTS[kind].boltDodge).toBeLessThanOrEqual(1);
    }
    // Hard is the tier the request named: a coin flip, not an oracle
    expect(BOTS.berserker.boltDodge).toBeLessThanOrEqual(0.5);
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
    state.events = [];
    castSpell(state, 'a', 'vanish', 5, 5);
    const forB = viewEvents(state, state.events, 'b');
    const forA = viewEvents(state, state.events, 'a');
    expect(forA.some(e => e.t === 'vanish' && e.id === 'a')).toBe(true);
    expect(forB.some(e => e.id === 'a')).toBe(false);
    // round 18.1: casting anything ELSE reveals you, so its events are public
    // (before this, the fireball cast was the masked event in this test)
    state.events = [];
    castSpell(state, 'a', 'fireball', 20, 0);
    expect(a.vanishT).toBe(0);
    expect(snapshot(state, 'b').projectiles.length).toBe(1);
    // visible again: the stream is untouched (no copy at all)
    expect(viewEvents(state, state.events, 'b')).toBe(state.events);
  });

  it('casting anything else while invisible REVEALS you; re-casting vanish refreshes', () => {
    const state = vanishBattle();
    const a = state.players.a;
    a.spells.fireball = 1;
    castSpell(state, 'a', 'vanish', 5, 5);
    run(state, 0.3);
    expect(a.vanishT).toBeGreaterThan(0);
    // re-casting vanish refreshes the timer, never reveals
    a.cooldowns = {};
    expect(castSpell(state, 'a', 'vanish', 5, 5)).toBe(true);
    expect(a.vanishT).toBeCloseTo(spec.duration[0], 5);
    // any other cast: revealed on the spot, the snapshot position returns
    expect(castSpell(state, 'a', 'fireball', 20, 0)).toBe(true);
    expect(a.vanishT).toBe(0);
    expect(snapshot(state, 'b').players.a.x).toBeDefined();
  });

  it('an auto-completing repulse burst is NOT a cast: it does not reveal', () => {
    const state = vanishBattle();
    const a = state.players.a;
    a.spells.repulse = 1;
    expect(castSpell(state, 'a', 'repulse', 5, 0)).toBe(true);
    // vanish is spell-locked mid-charge, so grant the invisibility by hand:
    // the point under test is the BURST (stepBattle), not the cast path
    a.vanishT = 5;
    state.events = [];
    run(state, SPELLS.repulse.charge + 0.2);
    expect(a.charging).toBeFalsy();
    expect(state.events.some(e => e.t === 'repulse')).toBe(true);
    expect(a.vanishT).toBeGreaterThan(0);   // the burst kept you hidden
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
    // charging first (round 19): vanish joined the mid-charge whitelist — you
    // charge VISIBLY, disappear, and the burst fires from stealth. Everyone
    // saw the windup start, which is the point of the reveal rule.
    expect(castSpell(state, 'a', 'repulse', 5, 0)).toBe(true);
    expect(castSpell(state, 'a', 'vanish', 5, 5)).toBe(true);
    expect(a.charging).toBeTruthy();     // the charge survives the vanish
    expect(a.vanishT).toBeGreaterThan(0); // and vanishing never reveals itself
    a.charging = null; a.vanishT = 0;
    // vanishing first: the repulse cast still works, but since round 18.1 the
    // cast itself REVEALS you (it used to stay hidden through the wind-up)
    a.cooldowns = {};
    expect(castSpell(state, 'a', 'vanish', 5, 5)).toBe(true);
    expect(castSpell(state, 'a', 'repulse', 5, 0)).toBe(true);
    expect(a.charging).toBeTruthy();
    expect(a.vanishT).toBe(0);
    expect(snapshot(state, 'b').players.a.charging).toBe(true);
    expect(snapshot(state, 'b').players.a.x).toBeDefined();
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
    // round 21.3: versus players carry their OWN unique team number, which is
    // free-for-all spelled differently — different numbers, so still enemies
    expect(a.team).not.toBe(b.team);
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
    expect(Object.values(classic.players)[0].wave).toBeUndefined();
    // `team` IS on the versus wire since round 21.3 (the lobby selector and the
    // scoreboard grouping read it) — as a number, never the campaign's string
    expect(Object.values(classic.players)[0].team).toEqual(expect.any(Number));
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

describe('testing sandbox 🧪', () => {
  it('chosen gold, opens in an UNTIMED shop, ready-up starts round 1', () => {
    const state = createGame({ seed: 42, mode: 'elemental' });
    addPlayer(state, 'a', 'A');
    addPlayer(state, 'b', 'B');
    setTesting(state, true, 120);
    startGame(state);
    expect(state.phase).toBe('shop');
    expect(state.round).toBe(0);              // no round fought yet
    expect(state.players.a.gold).toBe(120);
    expect(state.players.b.gold).toBe(120);
    expect(snapshot(state).testing.gold).toBe(120);
    run(state, ROUND.SHOP_TIME + 2);           // the clock never runs
    expect(state.phase).toBe('shop');
    expect(buy(state, 'a', 'ember').ok).toBe(true);  // and the shop is real
    setShopReady(state, 'a');
    setShopReady(state, 'b');
    step(state, DT);
    expect(state.phase).toBe('countdown');
    expect(state.round).toBe(1);
  });

  it('is lobby-only, clamps the gold, and toggles off clean', () => {
    const state = createGame({ seed: 42, mode: 'classic' });
    addPlayer(state, 'a', 'A');
    setTesting(state, true, 5000);
    expect(state.testing.gold).toBe(999);      // clamped
    setTesting(state, false);
    expect(state.testing).toBe(null);
    startGame(state);
    expect(state.phase).toBe('countdown');     // off = the normal game
    setTesting(state, true, 50);               // mid-game: ignored
    expect(state.testing).toBe(null);
  });
});

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

describe('bot target choice (BOT_TARGETING: a softmax draw, round 17 §11)', () => {
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

  // Round 17 §11: the pick is a SOFTMAX DRAW, so one call is a sample and not
  // an answer. Every behaviour assertion below is a frequency over draws, and
  // every threshold is derived from BOT_TARGETING — never a pinned literal.
  const DRAWS = 2000;
  function preyShare(state, id) {
    let hits = 0;
    for (let i = 0; i < DRAWS; i++) if (pickPrey(state, state.players.bot).id === id) hits++;
    return hits / DRAWS;
  }
  // With exactly two candidates the softmax collapses to the plain logistic:
  // the odds of picking the one whose score is `advantage` arena units BETTER
  // (lower) than the other. This is the shape the draw is checked against.
  const pick = (advantage) =>
    1 / (1 + Math.exp(-advantage / BOT_TARGETING.TEMPERATURE));
  const DIST_GAP = GAP * BOT_TARGETING.PROXIMITY;   // the near one's head start

  it('the bias only bites in the band the constant defines — spec, not literals', () => {
    // A lead of 1 must NOT cover GAP units; a runaway lead must. Everything the
    // two behaviour tests below assert follows from these two inequalities, so
    // if LEADER_BIAS is ever retuned outside this band the arithmetic says so
    // here instead of the behaviour tests failing mysteriously.
    expect(1 * BOT_TARGETING.LEADER_BIAS).toBeLessThan(GAP);
    expect((ROUND.KILLS_TO_WIN - 1) * BOT_TARGETING.LEADER_BIAS).toBeGreaterThan(GAP);
  });

  it('the draw follows the spec: two candidates, odds set by TEMPERATURE', () => {
    // The whole point of §11: the tastiest target is FAVOURED, not mandated —
    // four bots stop converging on one victim. A level field leaves only the
    // distance term, so the measured share must land on the logistic the
    // constants predict, and both candidates must really get picked.
    expect(BOT_TARGETING.TEMPERATURE).toBeGreaterThan(0);
    const expected = pick(DIST_GAP);
    expect(expected).toBeLessThan(0.95);   // a draw, not a disguised argmin
    expect(preyShare(duelBattle(), 'near')).toBeCloseTo(expected, 1);
  });

  it('a runaway kill leader is hunted over the closer enemy', () => {
    const state = duelBattle();
    state.players.lead.kills = ROUND.KILLS_TO_WIN - 1;
    const edge = (ROUND.KILLS_TO_WIN - 1) * BOT_TARGETING.LEADER_BIAS *
      BOT_TARGETING.PROXIMITY - DIST_GAP;
    expect(pick(edge)).toBeGreaterThan(0.9);          // the spec makes it lopsided
    expect(preyShare(state, 'lead')).toBeCloseTo(pick(edge), 1);
  });

  it('a level field barely moves the choice: the closer enemy is still the usual pick', () => {
    const state = duelBattle();
    // dead level: identical to having no mechanism at all
    expect(preyShare(state, 'near')).toBeCloseTo(pick(DIST_GAP), 1);
    // one kill ahead is "5 vs 4", which must not be enough to cross the arena
    state.players.lead.kills = 1;
    const oneKill = DIST_GAP - BOT_TARGETING.LEADER_BIAS * BOT_TARGETING.PROXIMITY;
    expect(oneKill).toBeGreaterThan(0);               // still the near one's fight
    expect(preyShare(state, 'near')).toBeCloseTo(pick(oneKill), 1);
    // and it is genuinely inert, not merely outweighed: the bot that is ITSELF
    // ahead sees a lead of 0 on everyone (the bounty's floor-at-zero rule)
    state.players.bot.kills = ROUND.KILLS_TO_WIN - 1;
    state.players.lead.kills = ROUND.KILLS_TO_WIN - 1;
    expect(killLead(state.players.bot, state.players.lead)).toBe(0);
    expect(preyShare(state, 'near')).toBeCloseTo(pick(DIST_GAP), 1);
  });

  it('the wounded are finished: MISSING hp pulls the pick, not absolute hp', () => {
    const state = duelBattle();
    // enough missing hp on the FAR one to out-weigh its distance handicap
    const missing = Math.ceil(DIST_GAP / BOT_TARGETING.WOUNDED) + 10;
    state.players.lead.hp = state.players.lead.maxHp - missing;
    const edge = missing * BOT_TARGETING.WOUNDED - DIST_GAP;
    expect(edge).toBeGreaterThan(0);
    expect(preyShare(state, 'lead')).toBeCloseTo(pick(edge), 1);
  });

  it('my own marks pull the pick — and only mine (the stack store is private)', () => {
    const marks = Math.ceil(DIST_GAP / BOT_TARGETING.MY_STACKS) + 2;
    const edge = marks * BOT_TARGETING.MY_STACKS - DIST_GAP;
    expect(edge).toBeGreaterThan(0);

    const mine = duelBattle();
    mine.players.lead.stacks = { frost: { bot: marks } };
    expect(preyShare(mine, 'lead')).toBeCloseTo(pick(edge), 1);

    // the same marks placed by SOMEBODY ELSE are invisible to this bot: they
    // are not its investment, and knowing about them would be a free read on
    // another player's setup
    const theirs = duelBattle();
    theirs.players.lead.stacks = { frost: { near: marks } };
    expect(preyShare(theirs, 'near')).toBeCloseTo(pick(DIST_GAP), 1);
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
    expect(preyShare(state, 'lead')).toBeGreaterThan(0.8);
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
    // Two identically seeded games differing ONLY in a monster's tally: same
    // seed means the same rng stream, so if the tally were read at all the two
    // draw sequences would diverge.
    const build = (monsterKills) => {
      const state = createGame({ seed: 5, mode: 'coop' });
      addPlayer(state, 'a', 'Ally');
      addPlayer(state, 'b', 'Ally2');
      startGame(state);
      run(state, ROUND.COUNTDOWN + DT);
      state.pillars = [];
      const monsters = Object.values(state.players).filter(p => p.team === 'ai');
      monsters[0].kills = monsterKills;
      return { state, monsters };
    };
    const { state, monsters } = build(ROUND.KILLS_TO_WIN);
    expect(monsters.length).toBeGreaterThanOrEqual(2);
    const [m1, m2] = monsters;
    // every co-op fighter, party or wave, carries a team — that is the switch
    expect(state.players.a.team).not.toBe(null);
    expect(m1.team).not.toBe(null);
    expect(killLead(state.players.a, m1)).toBe(0);   // a party member: no race
    expect(killLead(m2, state.players.a)).toBe(0);   // a monster: no race either
    const seq = (s) => Array.from({ length: 50 },
      () => { const p = pickPrey(s, s.players.a); return p && p.id; });
    expect(seq(state)).toEqual(seq(build(0).state));
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

// Round 21.2 (Remi): play AREA per player is constant above the anchor, so the
// radius grows as sqrt(n/ANCHOR). n = seats at startGame; below the anchor the
// arena is exactly what it always was. Every number here is read off the spec.
describe('arena scales with the seat count (round 21.2)', () => {
  const seated = (n, opts = {}) => {
    const state = createGame({ seed: 3, mode: 'classic', ...opts });
    for (let i = 0; i < n; i++) addPlayer(state, `p${i}`, `P${i}`, opts.bots ? { bot: true } : {});
    startGame(state);
    return state;
  };
  const A = ARENA.SCALE_ANCHOR_PLAYERS;

  it('at or below the anchor the arena is the classic one', () => {
    for (const n of [2, 4, A]) expect(seated(n).startRadius).toBeCloseTo(ARENA.START_RADIUS, 6);
  });

  it('above the anchor the radius grows as sqrt(n / anchor)', () => {
    const big = seated(A + 3);   // anchor 5 -> 8 players
    expect(big.startRadius).toBeCloseTo(ARENA.START_RADIUS * Math.sqrt((A + 3) / A), 6);
    // ...which is exactly "constant play area per player"
    const per = (s, n) => Math.PI * s.startRadius ** 2 / n;
    expect(per(big, A + 3)).toBeCloseTo(per(seated(A), A), 6);
    expect(arenaStartRadius(A + 3)).toBeCloseTo(big.startRadius, 6);
  });

  it('bots count as seats, and a late joiner never resizes a live arena', () => {
    const state = seated(A + 3, { bots: true });
    const r = state.startRadius;
    expect(r).toBeGreaterThan(ARENA.START_RADIUS);
    for (let i = 0; i < 4; i++) addPlayer(state, `late${i}`, `Late${i}`);
    run(state, ROUND.COUNTDOWN + 1);
    expect(state.startRadius).toBeCloseTo(r, 6);
  });

  it('the rim, the spawn ring and the portals all ride the scale', () => {
    const big = seated(A + 3);
    expect(big.arenaRadius).toBeCloseTo(big.startRadius, 6);   // starts un-shrunk
    expect(snapshot(big).startRadius).toBeCloseTo(big.startRadius, 2); // on the wire
    run(big, ROUND.COUNTDOWN + DT);
    const k = big.startRadius / ARENA.START_RADIUS;
    // spawns sit on the same FRACTION of the (bigger) rim
    for (const pl of Object.values(big.players))
      expect(Math.hypot(pl.x, pl.y)).toBeCloseTo(big.startRadius * ARENA.SPAWN_RADIUS_FRAC, 4);
    // a portal at the scaled diagonal still swallows you
    const P = ARENA.PORTALS;
    const d = ARENA.START_RADIUS * P.DIST_FRAC * k;
    const pl = big.players.p0;
    pl.x = Math.cos(P.ANGLE) * d; pl.y = Math.sin(P.ANGLE) * d;
    pl.moveTarget = null; pl.vx = 0; pl.vy = 0;
    step(big, DT);
    expect(Math.hypot(pl.x, pl.y)).toBeLessThan(1);
  });
});

describe('lava portals (round 18)', () => {
  const portalXY = (i) => {
    const P = ARENA.PORTALS;
    const a = P.ANGLE + (i / P.COUNT) * Math.PI * 2;
    const d = ARENA.START_RADIUS * P.DIST_FRAC;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d };
  };

  it('all portals sit out in the lava', () => {
    const P = ARENA.PORTALS;
    expect(P.COUNT).toBe(4);
    for (let i = 0; i < P.COUNT; i++) {
      const { x, y } = portalXY(i);
      expect(Math.hypot(x, y)).toBeGreaterThan(ARENA.START_RADIUS);
    }
  });

  it('touching a portal teleports you to the arena center, dead stop', () => {
    const state = freshBattle(2);
    const pl = state.players.p0;
    const { x, y } = portalXY(1);
    pl.x = x; pl.y = y; pl.vx = 30; pl.vy = -10;
    pl.moveTarget = { x: x + 5, y };
    pl.hp = pl.maxHp;
    state.events = [];
    step(state, DT);
    expect(Math.hypot(pl.x, pl.y)).toBeLessThan(1);
    expect(pl.vx).toBe(0);
    expect(pl.vy).toBe(0);
    expect(pl.moveTarget).toBe(null);
    expect(state.events.some(e => e.t === 'portal' && e.id === 'p0')).toBe(true);
    // the tick that ports you home does not also burn you: you left the lava
    expect(pl.hp).toBe(pl.maxHp);
  });

  it('swimming NEAR a portal does not trigger it', () => {
    const state = freshBattle(2);
    const pl = state.players.p0;
    const { x, y } = portalXY(0);
    const P = ARENA.PORTALS;
    pl.x = x + P.RADIUS + pl.radius + 1; pl.y = y;
    pl.vx = 0; pl.vy = 0; pl.moveTarget = null;
    step(state, DT);
    expect(Math.hypot(pl.x - x, pl.y - y)).toBeGreaterThan(P.RADIUS);
  });

  it('co-op ignores portals (the mothballed mode keeps its classic ring)', () => {
    const state = createGame({ seed: 5, mode: 'coop' });
    addPlayer(state, 'p0', 'Ally0');
    addPlayer(state, 'p1', 'Ally1');
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    expect(state.phase).toBe('battle');
    const pl = state.players.p0;
    const { x, y } = portalXY(0);
    pl.x = x; pl.y = y; pl.vx = 0; pl.vy = 0; pl.moveTarget = null;
    pl.hp = 9999; pl.maxHp = 9999;
    step(state, DT);
    expect(Math.hypot(pl.x - x, pl.y - y)).toBeLessThan(2); // still out there
  });
});

describe('spawn shuffle (round 18)', () => {
  // Drive a running battle through roundEnd -> shop -> next countdown, so
  // startRound re-seats everyone. Kills all but p0 in lava (no kill credit).
  function nextRound(state) {
    for (const pl of Object.values(state.players)) {
      if (pl.id === 'p0') continue;
      pl.hp = 0.01;
      pl.x = ARENA.START_RADIUS + 5; pl.y = 0;
    }
    run(state, 0.5 + ROUND.SUMMARY_TIME);
    expect(state.phase).toBe('shop');
    run(state, ROUND.SHOP_TIME + 0.5);
    expect(state.phase).toBe('countdown');
  }
  const seats = (state) => Object.values(state.players)
    .map(p => `${p.id}:${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  it('deals the spawn seats fresh each round (same slots, new owners)', () => {
    const state = freshBattle(4);
    const slotSet = (s) => Object.values(s.players)
      .map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort().join(' ');
    const before = seats(state), slotsBefore = slotSet(state);
    // one reshuffle can deal the identity permutation; across three rounds
    // (seed 42) at least one deal must differ or the shuffle does not exist
    let changed = false;
    for (let r = 0; r < 3 && !changed; r++) {
      nextRound(state);
      changed = seats(state) !== before;
      expect(slotSet(state)).toBe(slotsBefore); // the circle itself never moves
    }
    expect(changed).toBe(true);
  });

  it('is seeded: two games with the same seed deal identically', () => {
    const mk = () => {
      const s = createGame({ seed: 7, mode: 'classic' });
      for (let i = 0; i < 4; i++) addPlayer(s, `p${i}`, `P${i}`);
      startGame(s);
      run(s, ROUND.COUNTDOWN + DT);
      nextRound(s);
      return seats(s);
    };
    expect(mk()).toBe(mk());
  });
});

describe('bomb 💣 (fused artillery — name still awaiting Remi)', () => {
  const spec = SPELLS.nova;

  // freshBattle + the meteor test's furniture: clean floor, parked bystander
  function novaBattle() {
    const state = freshBattle(3);
    const a = state.players.p0, b = state.players.p1;
    state.pillars = [];
    a.x = 0; a.y = 0; a.vx = 0; a.vy = 0; a.moveTarget = null;
    b.x = 10; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null;
    state.players.p2.x = 0; state.players.p2.y = -40;
    state.players.p2.moveTarget = null;
    return state;
  }

  it('is power-tier (the bot guard + draft filter), no minRound, costs from spec', () => {
    expect(spec.tier).toBe('power');
    expect(spec.minRound).toBeUndefined();
    const state = freshBattle(2);
    state.phase = 'shop';
    const a = state.players.p0;
    a.gold = 999;
    for (let level = 1; level <= spec.maxLevel; level++) {
      const g0 = a.gold;
      expect(buy(state, 'p0', 'nova').ok).toBe(true);
      expect(a.spells.nova).toBe(level);
      expect(g0 - a.gold).toBe(spec.costs[level - 1]);
    }
    expect(buy(state, 'p0', 'nova').ok).toBeFalsy(); // max level wall
  });

  it('cast starts the spec cooldown for the owned level', () => {
    const state = novaBattle();
    const a = state.players.p0;
    for (let level = 1; level <= spec.maxLevel; level++) {
      a.spells.nova = level;
      a.cooldowns = {};
      expect(castSpell(state, 'p0', 'nova', 20, 0)).toBe(true);
      expect(a.cooldowns.nova).toBeCloseTo(spec.cooldown[level - 1], 5);
    }
  });

  it('orb travels straight at spec speed and parks at the clicked point', () => {
    const state = novaBattle();
    state.players.p0.spells.nova = 1;
    state.players.p1.y = -30; // off the flight path for this one
    castSpell(state, 'p0', 'nova', 20, 0);
    expect(state.novas.length).toBe(1);
    const n = state.novas[0];
    run(state, 0.3);
    expect(n.x).toBeCloseTo(spec.speed * 0.3, 0); // en route, on the line
    expect(n.y).toBeCloseTo(0, 5);
    run(state, 0.6); // 20 u at speed 26 ≈ 0.77 s: parked now, fuse burning
    expect(n.x).toBeCloseTo(20, 5);
    expect(n.y).toBeCloseTo(0, 5);
    expect(n.t).toBeGreaterThan(0);
  });

  it('a click beyond max range clamps the stop point to spec.range', () => {
    const state = novaBattle();
    state.players.p0.spells.nova = 1;
    castSpell(state, 'p0', 'nova', 100, 0);
    expect(state.novas[0].tx).toBeCloseTo(spec.range, 5);
    expect(state.novas[0].ty).toBeCloseTo(0, 5);
  });

  it('flies OVER a body, a pillar and an enemy mirror wall without popping', () => {
    const state = novaBattle();
    const a = state.players.p0, b = state.players.p1;
    a.spells.nova = 1;
    // all three obstacles sit ON the flight path to (20, 0)
    state.pillars.push({ x: 14, y: 0, r: 2.2, sunk: false });
    state.walls.push({ x1: 16, y1: -4, x2: 16, y2: 4, nx: -1, ny: 0,
      owner: 'p1', until: state.time + 60 });
    castSpell(state, 'p0', 'nova', 20, 0);
    run(state, 0.6); // orb has crossed body (10), pillar (14) and wall (16)
    expect(state.novas.length).toBe(1);
    expect(state.novas[0].x).toBeGreaterThan(14);
    expect(b.hp).toBe(b.maxHp); // brushed past, no en-route hit
    run(state, 1);  // blast at (20,0): b at 10 is outside radius + his body
    expect(state.novas.length).toBe(0);
    expect(b.hp).toBe(b.maxHp);
  });

  it('explodes after the fuse, not before', () => {
    const state = novaBattle();
    const a = state.players.p0, b = state.players.p1;
    a.spells.nova = 1;
    b.x = 12; // inside the lv1 blast around (10, 0)
    castSpell(state, 'p0', 'nova', 10, 0);
    const travel = 10 / spec.speed;
    run(state, travel + spec.fuse * 0.5); // parked, fuse only half burnt
    expect(state.novas.length).toBe(1);
    expect(b.hp).toBe(b.maxHp);
    run(state, spec.fuse); // fuse done somewhere in here
    expect(state.novas.length).toBe(0);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('flat spec damage in radius (caster included), NO knockback, none outside', () => {
    const state = novaBattle();
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    a.spells.nova = 1;
    b.x = 12; b.y = 0;                              // 2 u from the blast center
    c.x = 10 + spec.radius[0] + c.radius + 0.5;     // a hair outside the reach
    c.y = 0;
    castSpell(state, 'p0', 'nova', 10, 0);
    run(state, 10 / spec.speed + spec.fuse + 0.2);
    // meteor's convention is FLAT damage across the blast (no edge falloff) —
    // nova matches it, so b eats the full spec number 2 u off center
    expect(b.maxHp - b.hp).toBeCloseTo(spec.damage[0], 3);
    expect(Math.abs(b.vx) + Math.abs(b.vy)).toBeLessThan(1); // damage only, no push
    expect(c.hp).toBe(c.maxHp);                              // outside: untouched
    expect(a.hp).toBe(a.maxHp);                              // caster far away here
    // caster inside their own blast eats it too (meteor's rule)
    a.cooldowns = {};
    castSpell(state, 'p0', 'nova', 2, 0);
    run(state, 2 / spec.speed + spec.fuse + 0.2);
    expect(a.maxHp - a.hp).toBeCloseTo(spec.damage[0], 3);
  });

  it('is not a fireball: no element riders — a midas owner plants no mark, full damage', () => {
    const state = createGame({ seed: 42, mode: 'elemental' });
    for (let i = 0; i < 3; i++) addPlayer(state, `p${i}`, `Player${i}`);
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    expect(state.phase).toBe('battle');
    const a = state.players.p0, b = state.players.p1;
    state.pillars = [];
    a.x = 0; a.y = 0; a.moveTarget = null;
    b.x = 10; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null;
    state.players.p2.x = 0; state.players.p2.y = -40;
    state.players.p2.moveTarget = null;
    a.spells.nova = 1;
    a.elements.midas = 1; // lv1 midas halves FIREBALL damage and plants marks
    castSpell(state, 'p0', 'nova', 10, 0);
    const seen = [];
    const ticks = Math.round((10 / spec.speed + spec.fuse + 0.2) / DT);
    for (let i = 0; i < ticks; i++) {
      state.events = [];
      step(state, DT);
      seen.push(...state.events);
    }
    expect(seen.some(e => e.t === 'midasMark')).toBe(false);
    expect(b.stacks && b.stacks.midas ? b.stacks.midas.p0 || 0 : 0).toBe(0);
    // and midas' fireball damage penalty does not touch the blast either
    expect(b.maxHp - b.hp).toBeCloseTo(spec.damage[0], 3);
  });

  it('a nova kill credits the caster (lastHitBy path, like meteor)', () => {
    const state = novaBattle();
    const a = state.players.p0, b = state.players.p1;
    a.spells.nova = 1;
    b.hp = 5;
    castSpell(state, 'p0', 'nova', 10, 0);
    const seen = [];
    const ticks = Math.round((10 / spec.speed + spec.fuse + 0.2) / DT);
    for (let i = 0; i < ticks; i++) {
      state.events = [];
      step(state, DT);
      seen.push(...state.events);
    }
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(1);
    const death = seen.find(e => e.t === 'death' && e.id === 'p1');
    expect(death && death.killer).toBe('p0');
  });

  it('casting nova reveals a vanished caster (the generic reveal)', () => {
    const state = novaBattle();
    const a = state.players.p0;
    a.spells.nova = 1;
    a.spells.vanish = 1;
    castSpell(state, 'p0', 'vanish', 5, 5);
    expect(a.vanishT).toBeGreaterThan(0);
    a.cooldowns = {};
    castSpell(state, 'p0', 'nova', 10, 0);
    expect(a.vanishT).toBe(0);
  });

  it('serializes for the client: orb in flight, then the burning fuse', () => {
    const state = novaBattle();
    state.players.p0.spells.nova = 2;
    castSpell(state, 'p0', 'nova', 20, 0);
    const s1 = snapshot(state);
    expect(s1.novas.length).toBe(1);
    expect(Number.isFinite(s1.novas[0].x)).toBe(true);
    expect(Number.isFinite(s1.novas[0].y)).toBe(true);
    expect(s1.novas[0].level).toBe(2);
    expect(s1.novas[0].t).toBeUndefined(); // in flight: no fuse yet
    run(state, 20 / spec.speed + 0.1);
    const s2 = snapshot(state);
    expect(s2.novas[0].t).toBeGreaterThan(0);
    expect(s2.novas[0].t).toBeLessThanOrEqual(spec.fuse);
  });
});

// ---------------------------------------------------------------------------
// Versus TEAMS (round 21.3, Remi's design). One ruling drives all of it: "we
// just ignore each other's spells from the same team — no damage, no pushback,
// no on-hit effects — except pillars, which are part of the map". The default
// (everyone on their own number) must be today's free-for-all exactly, which
// the other 300-odd tests in this file are the real proof of.
describe('versus teams', () => {
  // seat n players in `mode`, then put them on the given team numbers
  const teamBattle = (teams, mode = 'classic') => {
    const state = createGame({ seed: 42, mode });
    teams.forEach((t, i) => addPlayer(state, `p${i}`, `P${i}`));
    teams.forEach((t, i) => setTeam(state, `p${i}`, t));
    startGame(state);
    run(state, ROUND.COUNTDOWN + DT);
    state.pillars = [];   // pillars are terrain and would eat the test balls
    return state;
  };
  // face `shooter` at `target` point-blank and fire one fireball
  const shootAt = (state, shooter, target) => {
    const a = state.players[shooter], b = state.players[target];
    a.x = 0; a.y = 0; a.moveTarget = null; a.cooldowns = {};
    b.x = 8; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null;
    const hp0 = b.hp;
    castSpell(state, shooter, 'fireball', 40, 0);
    run(state, 0.5);
    return { hp0, b };
  };

  it('every seat defaults to its own team number: free-for-all, spelled out', () => {
    const state = createGame({ seed: 1, mode: 'classic' });
    for (let i = 0; i < 5; i++) addPlayer(state, `p${i}`, `P${i}`);
    const nums = Object.values(state.players).map(p => p.team);
    expect(nums).toEqual([1, 2, 3, 4, 5]);          // small and readable
    expect(teamTally(state).every(t => t.size === 1 && t.target === ROUND.KILLS_TO_WIN))
      .toBe(true);
    // a leaver's number is free for the next joiner
    removePlayer(state, 'p2');
    addPlayer(state, 'p9', 'P9');
    expect(state.players.p9.team).toBe(3);
  });

  it('a teammate ball passes clean through — no damage, no push', () => {
    const state = teamBattle([7, 7]);
    const { hp0, b } = shootAt(state, 'p0', 'p1');
    expect(b.hp).toBe(hp0);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });

  it('…and an enemy ball still hits exactly as before', () => {
    const state = teamBattle([7, 8]);
    const { hp0, b } = shootAt(state, 'p0', 'p1');
    expect(b.hp).toBeLessThan(hp0);
    expect(Math.abs(b.vx)).toBeGreaterThan(0);
  });

  it('you cannot kill a teammate: no damage path exists, so no credit rule is needed', () => {
    const state = teamBattle([7, 7]);
    const a = state.players.p0, b = state.players.p1;
    b.hp = 1;
    for (let i = 0; i < 8; i++) { a.cooldowns = {}; shootAt(state, 'p0', 'p1'); }
    expect(b.alive).toBe(true);
    expect(b.hp).toBe(1);
    expect(a.kills).toBe(0);
    expect(b.deaths).toBe(0);
    expect(state.events.some(e => e.t === 'teamkill')).toBe(false);
  });

  it('a repulse blast skips teammates and still shoves enemies', () => {
    const state = teamBattle([7, 7, 8]);
    const [a, mate, foe] = ['p0', 'p1', 'p2'].map(id => state.players[id]);
    a.spells.repulse = 1;
    a.x = 0; a.y = 0;
    mate.x = 3; mate.y = 0; mate.vx = 0; mate.vy = 0;
    foe.x = -3; foe.y = 0; foe.vx = 0; foe.vy = 0;
    const mateHp = mate.hp, foeHp = foe.hp;
    castSpell(state, 'p0', 'repulse', 0, 0);
    run(state, SPELLS.repulse.charge + 0.3);
    expect(mate.hp).toBe(mateHp);
    expect(mate.vx).toBe(0);
    expect(foe.hp).toBeLessThan(foeHp);
    expect(Math.abs(foe.vx)).toBeGreaterThan(0);
  });

  it('meteor, nova and lightning all spare teammates', () => {
    for (const spell of ['meteor', 'nova', 'lightning']) {
      const state = teamBattle([7, 7, 8]);
      const [a, mate, foe] = ['p0', 'p1', 'p2'].map(id => state.players[id]);
      a.spells[spell] = 1;
      a.x = 20; a.y = 20;             // out of its own blast, inside nova's range
      mate.x = 0; mate.y = 0; foe.x = 1; foe.y = 0;
      const mateHp = mate.hp, foeHp = foe.hp;
      castSpell(state, 'p0', spell, 0, 0);
      run(state, 4);
      expect([spell, mate.hp]).toEqual([spell, mateHp]);
      expect(foe.hp).toBeLessThan(foeHp);
    }
  });

  it('Switcheroo cannot hook a teammate (the bolt flies through), but takes an enemy', () => {
    const mate = teamBattle([7, 7]);
    mate.players.p0.spells.swap = 1;
    shootAtSwap(mate, 'p0', 'p1');
    expect(mate.players.p1.x).toBe(8);      // never moved: no swap, no stun
    expect(mate.players.p0.x).toBe(0);
    expect(mate.players.p1.stunT || 0).toBe(0);
    const foe = teamBattle([7, 8]);
    foe.players.p0.spells.swap = 1;
    shootAtSwap(foe, 'p0', 'p1');
    expect(foe.players.p0.x).toBe(8);       // traded places
    expect(foe.players.p1.stunT).toBeGreaterThan(0);
  });

  it("a teammate's mirror wall lets your shots through", () => {
    const state = teamBattle([7, 7]);
    const a = state.players.p0, mate = state.players.p1;
    mate.spells.wall = 1;
    mate.x = 30; mate.y = 30;               // out of the line of fire
    castSpell(state, 'p1', 'wall', 8, 0);
    expect(state.walls.length).toBe(1);
    a.x = 0; a.y = 0; a.moveTarget = null;
    castSpell(state, 'p0', 'fireball', 40, 0);
    run(state, 0.4);
    // reflected balls turn around and change owner; passing through does not
    expect(state.events.some(e => e.t === 'reflect')).toBe(false);
  });

  it('anger never marks a teammate', () => {
    const state = teamBattle([7, 7, 7, 8], 'elemental');
    const a = state.players.p0;
    a.elements = { anger: 3 };
    a._angerNext = 0;
    run(state, 1);
    expect(a._angerTarget).toBe('p3');      // the only enemy in the lobby
  });

  it('malady never spreads onto the creator’s teammates', () => {
    const state = teamBattle([7, 8, 7], 'elemental');
    const [a, foe, mate] = ['p0', 'p1', 'p2'].map(id => state.players[id]);
    a.elements = { malady: 3 };
    a.x = 0; a.y = 0; a.moveTarget = null;
    foe.x = 8; foe.y = 0; foe.moveTarget = null;
    for (let i = 0; i < 2; i++) {           // two hits = infection
      a.cooldowns = {}; foe.x = 8; foe.y = 0; foe.vx = 0; foe.vy = 0;
      castSpell(state, 'p0', 'fireball', 40, 0);
      run(state, 0.5);
    }
    expect(foe.poisonT).toBeGreaterThan(0);
    mate.x = foe.x; mate.y = foe.y; mate.moveTarget = null;  // standing in the aura
    run(state, 0.5);
    expect(mate.poisonT).toBe(0);
  });

  it('the round ends when one TEAM is all that is left, and pays every survivor', () => {
    const state = teamBattle([1, 1, 2, 2]);
    const gold0 = state.players.p0.gold;
    for (const id of ['p2', 'p3']) { state.players[id].hp = 0; state.players[id].alive = false; }
    run(state, 2 * DT);
    expect(state.phase).toBe('roundEnd');
    expect(state.roundSummary.winTeam).toBe(1);
    expect(state.roundSummary.winners.sort()).toEqual(['p0', 'p1']);
    // both survivors banked the round-win gold, not just one of them
    expect(state.players.p0.gold - gold0).toBe(GOLD.ROUND_BASE + GOLD.ROUND_WIN);
    expect(state.players.p1.gold - gold0).toBe(GOLD.ROUND_BASE + GOLD.ROUND_WIN);
  });

  it('a 2v2 round does NOT end while one of each team stands', () => {
    const state = teamBattle([1, 1, 2, 2]);
    for (const id of ['p1', 'p3']) { state.players[id].hp = 0; state.players[id].alive = false; }
    run(state, 2 * DT);
    expect(state.phase).toBe('battle');
  });

  it('a team wins the game at KILLS_TO_WIN x its size (the average stays 15)', () => {
    const state = teamBattle([1, 1, 2, 2]);
    const t = ROUND.KILLS_TO_WIN;
    state.players.p0.kills = t + 1;        // a solo-sized tally is NOT enough
    state.players.p1.kills = t - 2;
    for (const id of ['p2', 'p3']) { state.players[id].hp = 0; state.players[id].alive = false; }
    run(state, 2 * DT);
    expect(state.roundSummary.final).toBe(false);
    expect(state.players.p0.kills + state.players.p1.kills).toBeLessThan(2 * t);
    // …but the pair's SUM crossing 2x15 ends it
    const state2 = teamBattle([1, 1, 2, 2]);
    state2.players.p0.kills = t + 3;
    state2.players.p1.kills = t - 3;
    for (const id of ['p2', 'p3']) { state2.players[id].hp = 0; state2.players[id].alive = false; }
    run(state2, 2 * DT);
    expect(state2.roundSummary.final).toBe(true);
    run(state2, ROUND.SUMMARY_TIME + DT);
    expect(state2.phase).toBe('gameover');
    expect(state2.winTeam).toBe(1);
    expect(['p0', 'p1']).toContain(state2.winner);
  });

  it('solo teams reproduce first-to-15 exactly', () => {
    const state = teamBattle([1, 2]);
    state.players.p0.kills = ROUND.KILLS_TO_WIN;
    state.players.p1.hp = 0; state.players.p1.alive = false;
    run(state, 2 * DT);
    expect(state.roundSummary.final).toBe(true);
    expect(state.roundSummary.winner).toBe('p0');
  });

  it('teams travel on the wire and the selector is lobby-only, 1..MAX', () => {
    const state = createGame({ seed: 3, mode: 'elemental' });
    addPlayer(state, 'a', 'A'); addPlayer(state, 'b', 'B');
    expect(setTeam(state, 'a', 2)).toBe(true);
    expect(state.players.a.team).toBe(2);
    expect(setTeam(state, 'a', 0)).toBe(false);
    expect(setTeam(state, 'a', TEAMS.MAX + 1)).toBe(false);
    expect(setTeam(state, 'a', 'x')).toBe(false);
    expect(state.players.a.team).toBe(2);
    expect(snapshot(state).players.a.team).toBe(2);
    startGame(state);
    expect(setTeam(state, 'a', 5)).toBe(false);   // never mid-game
  });

  it('bots never hunt a teammate', () => {
    const state = teamBattle([1, 1, 2], 'elemental');
    for (let i = 0; i < 30; i++) {
      const prey = pickPrey(state, state.players.p0);
      expect(prey && prey.id).toBe('p2');
    }
  });

  it('the leader bias survives numeric teams (co-op is still exempt)', () => {
    const state = teamBattle([1, 2]);
    state.players.p1.kills = 6;
    expect(killLead(state.players.p0, state.players.p1)).toBe(6);
  });
});

// fire a Switcheroo bolt point-blank; shares the shootAt geometry
function shootAtSwap(state, shooter, target) {
  const a = state.players[shooter], b = state.players[target];
  a.x = 0; a.y = 0; a.moveTarget = null; a.cooldowns = {};
  b.x = 8; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null;
  castSpell(state, shooter, 'swap', 40, 0);
  run(state, 0.5);
}

// ---- Statue 🗿 (round 21.4) -------------------------------------------------
// Cast on yourself: for SPELLS.statue.duration seconds you are a golden pillar
// — invincible, rooted, unpushable, and a solid body that eats projectiles.
// Every number here is read from the spec (AGENTS.md: balance tests never pin
// constants), so a retune moves the tests with it.
describe('statue 🗿 (the golden pillar)', () => {
  const spec = SPELLS.statue;

  // clean floor, two parked players 8 units apart, p0 already a statue-owner
  function statueBattle(n = 2, mode = 'classic') {
    const state = mode === 'elemental'
      ? (() => {
        const s = createGame({ seed: 42, mode: 'elemental' });
        for (let i = 0; i < n; i++) addPlayer(s, `p${i}`, `Player${i}`);
        startGame(s);
        run(s, ROUND.COUNTDOWN + DT);
        return s;
      })()
      : freshBattle(n);
    state.pillars = [];
    const a = state.players.p0, b = state.players.p1;
    a.x = 0; a.y = 0; a.vx = 0; a.vy = 0; a.moveTarget = null; a.cooldowns = {};
    b.x = 8; b.y = 0; b.vx = 0; b.vy = 0; b.moveTarget = null; b.cooldowns = {};
    a.spells.statue = 1;
    return state;
  }

  it('prices, levels and cooldown come from the spec; lv2 buys cooldown only', () => {
    expect(spec.maxLevel).toBe(2);
    // ⚠ Remi's ruling: the duration NEVER levels — lv2 is a cooldown purchase
    expect(Array.isArray(spec.duration)).toBe(false);
    expect(spec.cooldown[1]).toBeLessThan(spec.cooldown[0]);
    const state = freshBattle(2);
    state.phase = 'shop';
    const a = state.players.p0;
    a.gold = 999;
    for (let level = 1; level <= spec.maxLevel; level++) {
      const g0 = a.gold;
      expect(buy(state, 'p0', 'statue').ok).toBe(true);
      expect(a.spells.statue).toBe(level);
      expect(g0 - a.gold).toBe(spec.costs[level - 1]);
    }
    expect(buy(state, 'p0', 'statue').ok).toBeFalsy(); // max level wall
  });

  it('cast is instant, starts the level cooldown and lasts exactly `duration`', () => {
    const state = statueBattle();
    const a = state.players.p0;
    for (let level = 1; level <= spec.maxLevel; level++) {
      a.spells.statue = level;
      a.cooldowns = {}; a.statueT = 0;
      expect(castSpell(state, 'p0', 'statue', a.x, a.y)).toBe(true);
      expect(a.statueT).toBeCloseTo(spec.duration, 5);
      expect(a.cooldowns.statue).toBeCloseTo(spec.cooldown[level - 1], 5);
      run(state, spec.duration - 0.1);
      expect(a.statueT).toBeGreaterThan(0);
      run(state, 0.2);
      expect(a.statueT).toBe(0);
    }
  });

  it('takes ZERO damage: fireball, sky-bolt and lava all do nothing', () => {
    const state = statueBattle();
    const a = state.players.p0, b = state.players.p1;
    castSpell(state, 'p0', 'statue', a.x, a.y);
    const hp0 = a.hp;
    // a point-blank fireball
    b.spells.fireball = 1;
    castSpell(state, 'p1', 'fireball', a.x, a.y);
    run(state, 0.4);
    expect(a.hp).toBe(hp0);
    // a bolt dropped on the statue's head (it ignores pillars and walls)
    b.spells.lightning = 1;
    castSpell(state, 'p1', 'lightning', a.x, a.y);
    run(state, SPELLS.lightning.delay + 2 * DT);
    expect(a.hp).toBe(hp0);
    // and the lava: shrink the ring to nothing under it
    state.arenaRadius = 0;
    run(state, 0.5);
    expect(a.hp).toBe(hp0);
    expect(a.alive).toBe(true);
  });

  it('the body BLOCKS a ball: it explodes on the statue, it does not pass', () => {
    const state = statueBattle(3);
    const a = state.players.p0, b = state.players.p1, c = state.players.p2;
    // c stands directly behind the statue, on the same line
    c.x = -8; c.y = 0; c.vx = 0; c.vy = 0; c.moveTarget = null;
    castSpell(state, 'p0', 'statue', a.x, a.y);
    b.spells.fireball = 1;
    castSpell(state, 'p1', 'fireball', -20, 0); // aimed through a at c
    run(state, 0.6);
    expect(state.projectiles.length).toBe(0);   // consumed on the gold
    expect(a.hp).toBe(a.maxHp);
    expect(c.hp).toBe(c.maxHp);                 // cover, not a window
  });

  it('a PIERCING shot stops on it too (a pillar is not a window)', () => {
    const state = statueBattle();
    const a = state.players.p0, b = state.players.p1;
    castSpell(state, 'p0', 'statue', a.x, a.y);
    b.spells.boomerang = 1;                     // pierce: true
    castSpell(state, 'p1', 'boomerang', -20, 0);
    run(state, 0.6);
    expect(state.projectiles.length).toBe(0);
    expect(a.hp).toBe(a.maxHp);
  });

  it('terra lv3 does NOT smash it (it smashes stone, not players)', () => {
    const state = statueBattle(2, 'elemental');
    const a = state.players.p0, b = state.players.p1;
    b.elements.terra = 3;                       // the Demolisher ball
    castSpell(state, 'p0', 'statue', a.x, a.y);
    castSpell(state, 'p1', 'fireball', a.x, a.y);
    run(state, 0.5);
    expect(a.alive).toBe(true);
    expect(a.hp).toBe(a.maxHp);
    expect(state.projectiles.length).toBe(0);   // the ball still breaks on it
  });

  it('cannot be moved: no knockback from a ball or a repulse blast', () => {
    const state = statueBattle();
    const a = state.players.p0, b = state.players.p1;
    castSpell(state, 'p0', 'statue', a.x, a.y);
    const at = { x: a.x, y: a.y };
    b.spells.fireball = 1;
    castSpell(state, 'p1', 'fireball', a.x, a.y);
    run(state, 0.4);
    expect(a.vx).toBe(0); expect(a.vy).toBe(0);
    // …and a repulse blast, timed to go off while the gold is up (the charge
    // outlasts one statue, so the statue is re-cast into the blast)
    run(state, spec.duration);                  // let this one lapse first
    b.spells.repulse = 1;
    b.x = a.x + 2; b.y = a.y;                   // well inside the blast radius
    castSpell(state, 'p1', 'repulse', a.x, a.y);
    run(state, SPELLS.repulse.charge - 0.5);
    a.cooldowns.statue = 0; a.vx = 0; a.vy = 0;
    expect(castSpell(state, 'p0', 'statue', a.x, a.y)).toBe(true);
    run(state, 0.5 + 3 * DT);
    expect(a.x).toBeCloseTo(at.x, 5);
    expect(a.y).toBeCloseTo(at.y, 5);
  });

  it('cannot act: no cast of any kind while golden, and no walking', () => {
    const state = statueBattle();
    const a = state.players.p0;
    a.spells.fireball = 1; a.spells.teleport = 1;
    castSpell(state, 'p0', 'statue', a.x, a.y);
    expect(castSpell(state, 'p0', 'fireball', 20, 0)).toBe(false);
    expect(castSpell(state, 'p0', 'teleport', 20, 0)).toBe(false);
    expect(castSpell(state, 'p0', 'statue', a.x, a.y)).toBe(false);
    setMoveTarget(state, 'p0', 20, 0);
    run(state, 1);
    expect(a.x).toBeCloseTo(0, 5);
    expect(a.y).toBeCloseTo(0, 5);
    expect(state.projectiles.length).toBe(0);
    // …and when it ends, the queued click carries you off again
    run(state, spec.duration);
    expect(a.x).toBeGreaterThan(1);
  });

  it('a Switcheroo bolt fizzles on it: no trade, no stun', () => {
    const state = statueBattle();
    const a = state.players.p0, b = state.players.p1;
    b.spells.swap = 1;
    castSpell(state, 'p0', 'statue', a.x, a.y);
    const [ax, bx] = [a.x, b.x];
    castSpell(state, 'p1', 'swap', a.x, a.y);
    run(state, 0.5);
    expect(a.x).toBeCloseTo(ax, 5);
    expect(b.x).toBeCloseTo(bx, 5);
    expect(a.stunT || 0).toBe(0);
    expect(state.projectiles.length).toBe(0);
  });

  it('nothing APPLIES during it: no malady infection, no frost stack', () => {
    const state = statueBattle(2, 'elemental');
    const a = state.players.p0, b = state.players.p1;
    b.elements.frost = 1; b.elements.malady = 3;
    castSpell(state, 'p0', 'statue', a.x, a.y);
    castSpell(state, 'p1', 'fireball', a.x, a.y);
    run(state, 0.5);
    expect(a.poisonT).toBe(0);
    expect(a.malady).toBe(null);
    expect((a.stacks.frost && a.stacks.frost.p1) || 0).toBe(0);
    // an infected body standing on top of it cannot pass the plague either
    b.malady = { inst: { level: 3, creator: 'p1', immune: { p1: 1 } }, by: 'p1' };
    b.poisonT = 5; b.poisonTick = 1; b.poisonBy = 'p1';
    b.x = a.x; b.y = a.y;
    run(state, 0.5);
    expect(a.poisonT).toBe(0);
  });

  it('protection ends with the timer, and the end fires an event', () => {
    const state = statueBattle();
    const a = state.players.p0, b = state.players.p1;
    castSpell(state, 'p0', 'statue', a.x, a.y);
    state.events.length = 0;
    run(state, spec.duration + DT);
    expect(state.events.some(e => e.t === 'statueDown' && e.id === 'p0')).toBe(true);
    expect(a.statueT).toBe(0);
    b.spells.fireball = 1;
    castSpell(state, 'p1', 'fireball', a.x, a.y);
    run(state, 0.4);
    expect(a.hp).toBeLessThan(a.maxHp);          // mortal again
  });

  it('casting it REVEALS an invisible caster (the round-18.1 rule)', () => {
    const state = statueBattle();
    const a = state.players.p0;
    a.spells.vanish = 1;
    castSpell(state, 'p0', 'vanish', 10, 0);
    expect(a.vanishT).toBeGreaterThan(0);
    a.cooldowns.statue = 0;
    expect(castSpell(state, 'p0', 'statue', a.x, a.y)).toBe(true);
    expect(a.vanishT).toBe(0);
    expect(snapshot(state, 'p1').players.p0.x).toBeDefined(); // visible again
  });

  it('is PUBLIC on the wire, and absent when nobody is golden', () => {
    const state = statueBattle();
    expect(snapshot(state, 'p1').players.p0.statueT).toBeUndefined();
    castSpell(state, 'p0', 'statue', 0, 0);
    expect(snapshot(state, 'p1').players.p0.statueT).toBeCloseTo(spec.duration, 1);
  });

  it('does not stall the round: it still ends around a statue', () => {
    const state = statueBattle();
    const a = state.players.p0, b = state.players.p1;
    castSpell(state, 'p0', 'statue', a.x, a.y);
    b.hp = 0; b.alive = false;
    run(state, 2 * DT);
    expect(state.phase).toBe('roundEnd');
  });
});
