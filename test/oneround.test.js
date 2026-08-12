// One-round mode (issue #8): one endless round — kills absorb a victim spell,
// items drop as ground tokens, the dead shop on a respawn timer, and the game
// ends on the kill target or when the arena is gone.
import { describe, it, expect } from 'vitest';
import {
  createGame, addPlayer, castSpell, buy, startGame, step, snapshot,
  setMode, setOneRound, requestRespawn,
} from '../shared/sim.js';
import { GOLD, ROUND, ONE_ROUND, ITEMS, SPELLS } from '../shared/constants.js';
import { itemFxAt } from '../shared/items.js';

const DT = 1 / 30;
const run = (state, seconds) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) step(state, DT);
};

function freshOneRound(nPlayers = 2, mode = 'classic') {
  const state = createGame({ seed: 42, mode });
  for (let i = 0; i < nPlayers; i++) addPlayer(state, `p${i}`, `Player${i}`);
  expect(setOneRound(state, true)).toBe(true);
  startGame(state);
  run(state, ROUND.COUNTDOWN + DT);
  expect(state.phase).toBe('battle');
  return state;
}

// p0 at the center kills p1 two units away with one fireball. `standBack`
// steps the killer out of loot range once the ball is in flight, so drop
// tests count tokens before anyone hoovers them up.
function slay(state, { standBack = false } = {}) {
  const a = state.players.p0, b = state.players.p1;
  a.x = 0; a.y = 0; b.x = 2; b.y = 0; b.hp = 1;
  a.cooldowns = {};
  castSpell(state, 'p0', 'fireball', 5, 0);
  if (standBack) { a.x = 0; a.y = -30; }
  run(state, 0.3);
  expect(b.alive).toBe(false);
  return { a, b };
}

describe('one-round: the flag', () => {
  it('is lobby-only and refused in co-op', () => {
    const state = createGame({ seed: 1, mode: 'coop' });
    expect(setOneRound(state, true)).toBe(false);
    const s2 = createGame({ seed: 1, mode: 'classic' });
    addPlayer(s2, 'a', 'A'); addPlayer(s2, 'b', 'B');
    expect(setOneRound(s2, true)).toBe(true);
    startGame(s2);
    expect(setOneRound(s2, false)).toBe(false); // locked once the game starts
    expect(s2.oneRound).toBe(true);
  });

  it('switching the lobby to co-op clears it', () => {
    const state = createGame({ seed: 1, mode: 'classic' });
    setOneRound(state, true);
    setMode(state, 'coop');
    expect(state.oneRound).toBe(false);
  });

  it('stays off the wire when off — other games are unchanged', () => {
    const state = createGame({ seed: 1, mode: 'classic' });
    addPlayer(state, 'a', 'A');
    const s = snapshot(state, 'a');
    expect('oneRound' in s).toBe(false);
    expect('groundItems' in s).toBe(false);
  });
});

describe('one-round: death and respawn', () => {
  it('a kill no longer ends the round; the victim gets a respawn timer', () => {
    const state = freshOneRound(2);
    const { b } = slay(state);
    expect(state.phase).toBe('battle'); // classic would have called the round here
    expect(b.respawnT).toBeGreaterThan(0);
  });

  it('death pays 8 gold x total deaths (catch-up), on top of nothing else', () => {
    const state = freshOneRound(2);
    const { b } = slay(state);
    expect(b.deaths).toBe(1);
    expect(b.gold).toBe(GOLD.START + GOLD.ROUND_BASE);
    // second death pays double
    run(state, ONE_ROUND.RESPAWN_TIME + DT);
    expect(b.alive).toBe(true);
    const g1 = b.gold;
    slay(state);
    expect(b.gold).toBe(g1 + 2 * GOLD.ROUND_BASE);
  });

  it('respawns at full hp inside the arena after RESPAWN_TIME', () => {
    const state = freshOneRound(2);
    const { b } = slay(state);
    b.maxHp = 120; // any hp lost to the fireball must not survive the respawn
    run(state, ONE_ROUND.RESPAWN_TIME + DT);
    expect(b.alive).toBe(true);
    expect(b.hp).toBe(b.maxHp);
    expect(Math.hypot(b.x, b.y)).toBeLessThanOrEqual(state.arenaRadius + 0.01);
    expect(b.respawnT).toBe(null);
  });

  it('requestRespawn shortens the wait but never below the minimum', () => {
    const state = freshOneRound(2);
    const { b } = slay(state);
    requestRespawn(state, 'p1');
    expect(b.respawnT).toBeLessThanOrEqual(ONE_ROUND.RESPAWN_MIN);
    run(state, ONE_ROUND.RESPAWN_MIN + DT);
    expect(b.alive).toBe(true);
  });

  it('the dead can buy (their personal shop); the living cannot', () => {
    const state = freshOneRound(2);
    const { a, b } = slay(state);
    b.gold = 20;
    expect(buy(state, 'p1', 'boots').ok).toBe(true);
    a.gold = 20;
    expect(buy(state, 'p0', 'boots').ok).toBe(false);
  });
});

describe('one-round: spell absorb', () => {
  it('the killer absorbs a victim spell they have not maxed', () => {
    const state = freshOneRound(2);
    const a = state.players.p0, b = state.players.p1;
    // exactly one absorbable candidate, so the pick is forced: a is maxed on
    // fireball, b owns teleport
    a.spells.fireball = SPELLS.fireball.maxLevel;
    b.spells = { fireball: SPELLS.fireball.maxLevel, teleport: 1 };
    slay(state);
    expect(a.spells.teleport).toBe(1);
    expect(b.spells.teleport).toBe(1); // a copy, not a theft
    expect(state.events.some(e => e.t === 'soul' && e.to === 'p0' && e.key === 'teleport')).toBe(true);
  });

  it('elements are absorbable in elemental mode', () => {
    const state = freshOneRound(2, 'elemental');
    const a = state.players.p0, b = state.players.p1;
    b.elements.ember = 2;
    // in elemental the fireball is capped at lv1 and both start with it, so
    // ember is the only candidate
    slay(state);
    expect(a.elements.ember).toBe(1);
  });

  it('nothing transfers on a lava death with no last hitter', () => {
    const state = freshOneRound(3);
    const b = state.players.p1;
    b.spells.teleport = 1;
    b.x = state.arenaRadius + 20; b.y = 0; b.hp = 1; b.lastHitBy = null;
    run(state, 1);
    expect(b.alive).toBe(false);
    expect(state.events.some(e => e.t === 'soul')).toBe(false);
  });
});

describe('one-round: item drops and pickups', () => {
  it('the body sheds one token per item level, at distinct spots', () => {
    const state = freshOneRound(2);
    const b = state.players.p1;
    b.items = { sword: 2, boots: 1 };
    slay(state, { standBack: true });
    expect(b.items).toEqual({});
    expect(state.groundItems.length).toBe(3);
    const spots = new Set(state.groundItems.map(g => `${g.x.toFixed(2)},${g.y.toFixed(2)}`));
    expect(spots.size).toBe(3);
    expect(state.groundItems.filter(g => g.key === 'sword').length).toBe(2);
  });

  it('walking over a token grants a level and consumes it', () => {
    const state = freshOneRound(2);
    const a = state.players.p0;
    state.groundItems.push({ id: 1, key: 'sword', x: a.x, y: a.y });
    run(state, DT * 2);
    expect(a.items.sword).toBe(1);
    expect(state.groundItems.length).toBe(0);
    expect(state.events.some(e => e.t === 'pickup' && e.id === 'p0' && e.key === 'sword')).toBe(true);
  });

  it('a maxed collector leaves the token for someone else', () => {
    const state = freshOneRound(2);
    const a = state.players.p0;
    a.items.sword = ITEMS.sword.maxLevel;
    state.groundItems.push({ id: 1, key: 'sword', x: a.x, y: a.y });
    run(state, DT * 2);
    expect(state.groundItems.length).toBe(1);
  });

  it('amulet hp moves with the token: shed on death, granted on pickup', () => {
    const state = freshOneRound(2);
    const a = state.players.p0, b = state.players.p1;
    b.gold = 99;
    const hp0 = b.maxHp;
    // buy through the real path so maxHp bookkeeping is the shipped one
    b.alive = false; expect(buy(state, 'p1', 'amulet').ok).toBe(true); b.alive = true;
    expect(b.maxHp).toBe(hp0 + itemFxAt('amulet', 'maxHp', 1));
    slay(state);
    expect(b.maxHp).toBe(hp0);
    const tok = state.groundItems.find(g => g.key === 'amulet');
    const aHp0 = a.maxHp;
    tok.x = a.x; tok.y = a.y;
    run(state, DT * 2);
    expect(a.maxHp).toBe(aHp0 + itemFxAt('amulet', 'maxHp', 1));
  });

  it('ground tokens ride the snapshot in one-round games only', () => {
    const state = freshOneRound(2);
    state.groundItems.push({ id: 1, key: 'sword', x: 3, y: 4 });
    const s = snapshot(state, 'p0');
    expect(s.oneRound).toBe(true);
    expect(s.groundItems).toEqual([{ id: 1, key: 'sword', x: 3, y: 4 }]);
  });
});

describe('one-round: how the game ends', () => {
  it('ends (final) when a player reaches the kill target', () => {
    const state = freshOneRound(2);
    state.players.p0.kills = ROUND.KILLS_TO_WIN - 1;
    slay(state);
    expect(state.phase).toBe('roundEnd');
    expect(state.roundSummary.final).toBe(true);
    expect(state.roundSummary.winner).toBe('p0');
    run(state, ROUND.SUMMARY_TIME + DT);
    expect(state.phase).toBe('gameover');
    expect(state.winner).toBe('p0');
  });

  it('ends on "no more map" with most kills winning', () => {
    const state = freshOneRound(2);
    state.players.p1.kills = 4;
    state.arenaRadius = 0.001;
    run(state, 1);
    expect(['roundEnd', 'gameover']).toContain(state.phase);
    expect(state.roundSummary.final).toBe(true);
    expect(state.roundSummary.winner).toBe('p1');
  });

  it('the lava closes SHRINK_MULT slower than a normal round', () => {
    const state = freshOneRound(2);
    const r0 = state.arenaRadius;
    run(state, 5);
    const slow = r0 - state.arenaRadius;
    const norm = createGame({ seed: 42, mode: 'classic' });
    addPlayer(norm, 'p0', 'A'); addPlayer(norm, 'p1', 'B');
    startGame(norm);
    run(norm, ROUND.COUNTDOWN + DT);
    // park the fighters apart so nobody dies while we measure
    norm.players.p0.x = 0; norm.players.p0.y = 0;
    norm.players.p1.x = 20; norm.players.p1.y = 0;
    const n0 = norm.arenaRadius;
    run(norm, 5);
    expect(norm.phase).toBe('battle');
    const fast = n0 - norm.arenaRadius;
    expect(fast / slow).toBeGreaterThan(ONE_ROUND.SHRINK_MULT * 0.8);
    expect(fast / slow).toBeLessThan(ONE_ROUND.SHRINK_MULT * 1.2);
  });

  it('power-tier spells unlock by game time, one virtual round per minute', () => {
    const state = freshOneRound(2);
    const powers = Object.entries(SPELLS).filter(([, s]) => s.minRound && s.minRound > 1);
    if (!powers.length) return;
    const [key, spec] = powers[0];
    const a = state.players.p0;
    a.alive = false; a.gold = 999; // the dead shop is the only in-battle shop
    expect(buy(state, 'p0', key).ok).toBe(false);
    state.time = (spec.minRound - 1) * ONE_ROUND.MINROUND_SECONDS + 1;
    expect(buy(state, 'p0', key).ok).toBe(true);
  });
});
