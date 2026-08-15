// shared/engine.js: the transport-agnostic room, driven with NO sockets.
// This is the brief's phase-A gate (docs/BRIEF-browser-hosting.md §A
// verification 4): if a bare engine can seat a human, autostart with bots,
// play rounds through shop and reach gameover purely via join/message/tick,
// then the solo (in-tab) and future WebRTC transports have a room to run.

import { describe, it, expect } from 'vitest';
import { createEngine, BOT_NAMES } from '../shared/engine.js';
import { TICK_RATE } from '../shared/constants.js';

const DT = 1 / TICK_RATE;

// drive the engine until pred() or a simulated-time budget runs out
function tickUntil(engine, pred, maxSimSeconds = 3600) {
  for (let i = 0; i < maxSimSeconds * TICK_RATE; i++) {
    engine.tick(DT);
    if (pred()) return true;
  }
  return false;
}

function makeRoom(seed = 42) {
  const sent = []; // every onSend, for wire-shape assertions
  // demoBot off: these tests exercise the BASE room; the pre-seated Faker
  // (issue #7, the version demonstrating itself) has its own tests
  const engine = createEngine({ seed, demoBot: false, onSend: (connId, msg) => sent.push({ connId, msg }) });
  return { engine, sent };
}

describe('engine: headless room (no sockets)', () => {
  it('seats a human, autostarts with bots, and reaches battle', () => {
    const { engine, sent } = makeRoom();
    const r = engine.join('h1', { name: 'Remi', avatar: '🦊' });
    expect(r.ok).toBe(true);
    expect(engine.game.players.h1.name).toBe('Remi');

    for (let i = 0; i < 3; i++) engine.message('h1', { t: 'addBot', kind: 'grunt', build: 'random' });
    expect(Object.values(engine.game.players).filter(p => p.bot).length).toBe(3);

    engine.message('h1', { t: 'ready', ready: true });
    expect(['countdown', 'battle']).toContain(engine.game.phase);
    expect(tickUntil(engine, () => engine.game.phase === 'battle', 30)).toBe(true);

    // snapshots flow through onSend, per viewer, with the wire shape
    engine.pushSnapshots();
    const snap = sent.find(x => x.connId === 'h1' && x.msg.t === 'snap');
    expect(snap).toBeTruthy();
    expect(snap.msg.s.players.h1).toBeTruthy();
    expect(Array.isArray(snap.msg.e)).toBe(true);
  });

  it('plays a full round to shop, buys, and reaches gameover', () => {
    const { engine, sent } = makeRoom(7);
    engine.join('h1', { name: 'Idler' });
    for (let i = 0; i < 3; i++) engine.message('h1', { t: 'addBot', kind: 'berserker', build: 'random' });
    engine.message('h1', { t: 'ready', ready: true });

    // the idle human dies, the round ends, the shop opens
    expect(tickUntil(engine, () => engine.game.phase === 'shop', 300)).toBe(true);

    // buying works through the same message path the wire uses
    const before = engine.game.players.h1.gold;
    engine.message('h1', { t: 'buy', id: 'boots' });
    expect(sent.some(x => x.connId === 'h1' && x.msg.t === 'denied')).toBe(false);
    expect(engine.game.players.h1.items.boots).toBe(1);
    expect(engine.game.players.h1.gold).toBeLessThan(before);

    // bots fight to 15 kills (or the round cap): the game must END
    expect(tickUntil(engine, () => engine.game.phase === 'gameover', 3600)).toBe(true);
    expect(engine.game.winner).toBeTruthy();
  });

  it('undo refunds the last buy of THIS shop only, and Continue is instant (round 22.2)', () => {
    const { engine, sent } = makeRoom(7);
    engine.join('h1', { name: 'Idler' });
    for (let i = 0; i < 3; i++) engine.message('h1', { t: 'addBot', kind: 'berserker', build: 'random' });
    engine.message('h1', { t: 'ready', ready: true });
    expect(tickUntil(engine, () => engine.game.phase === 'shop', 300)).toBe(true);

    // two buys, two undos: full round-trip back to the pre-shop state
    const h1 = () => engine.game.players.h1;
    const gold0 = h1().gold, hp0 = h1().hp, maxHp0 = h1().maxHp;
    engine.message('h1', { t: 'buy', id: 'boots' });
    engine.message('h1', { t: 'buy', id: 'amulet' });   // maxHp side effect
    expect(h1().maxHp).toBeGreaterThan(maxHp0);
    engine.message('h1', { t: 'undo' });                // amulet refunded
    expect(h1().maxHp).toBe(maxHp0);
    expect(h1().hp).toBe(hp0);
    expect(h1().items.amulet || 0).toBe(0);
    expect(h1().items.boots).toBe(1);
    engine.message('h1', { t: 'undo' });                // boots refunded
    expect(h1().items.boots || 0).toBe(0);
    expect(h1().gold).toBe(gold0);
    // an empty stack denies politely instead of inventing gold
    engine.message('h1', { t: 'undo' });
    expect(h1().gold).toBe(gold0);
    expect(sent.some(x => x.connId === 'h1' && x.msg.t === 'denied'
      && /nothing to undo/.test(x.msg.reason))).toBe(true);

    // a buy that survives into the round is FINAL: no refunds next shop
    engine.message('h1', { t: 'buy', id: 'boots' });
    engine.message('h1', { t: 'ready', ready: true });
    expect(tickUntil(engine, () => engine.game.phase !== 'shop', 60)).toBe(true);
    expect(tickUntil(engine, () => ['shop', 'gameover'].includes(engine.game.phase), 3600)).toBe(true);
    if (engine.game.phase === 'shop') {
      const g = h1().gold;
      engine.message('h1', { t: 'undo' });
      expect(h1().items.boots).toBe(1);   // last round's purchase stands
      expect(h1().gold).toBe(g);
    }

    // gameover: ONE click brings the lobby immediately, nobody waits
    expect(tickUntil(engine, () => engine.game.phase === 'gameover', 3600)).toBe(true);
    engine.message('h1', { t: 'again' });
    expect(engine.game.phase).toBe('lobby');
    engine.destroy();
  });

  it('serialize() round-trips: a restored engine resumes the same game', () => {
    const { engine } = makeRoom(11);
    engine.join('h1', { name: 'Saver' });
    engine.message('h1', { t: 'addBot', kind: 'grunt' });
    engine.message('h1', { t: 'ready', ready: true });
    tickUntil(engine, () => engine.game.phase === 'battle', 30);
    for (let i = 0; i < 5 * TICK_RATE; i++) engine.tick(DT); // mid-battle

    const blob = engine.serialize();
    expect(() => JSON.stringify(blob)).not.toThrow(); // JSON-safe, no closures

    const sent2 = [];
    const engine2 = createEngine({ state: blob, onSend: (id, m) => sent2.push({ id, m }) });
    expect(engine2.game.phase).toBe(engine.game.phase);
    expect(engine2.game.round).toBe(engine.game.round);
    expect(engine2.game.players.h1.hp).toBe(engine.game.players.h1.hp);
    // the restored room must still PLAY:
    expect(tickUntil(engine2, () => engine2.game.phase !== 'battle', 300)).toBe(true);
    engine.destroy();
    engine2.destroy();
  });

  it('serialize() restore is DETERMINISTIC: original and restored engines replay identically', () => {
    // B4 (host migration) requirement: a peer resuming from a serialized blob
    // must step exactly like the host would have. This needs the rng cursor to
    // be a serializable field on the game, not a closure.
    const { engine } = makeRoom(23);
    engine.join('h1', { name: 'Fork' });
    for (let i = 0; i < 3; i++) engine.message('h1', { t: 'addBot', kind: 'berserker', build: 'glass' });
    engine.message('h1', { t: 'ready', ready: true });
    tickUntil(engine, () => engine.game.phase === 'battle', 30);
    for (let i = 0; i < 3 * TICK_RATE; i++) engine.tick(DT); // burn some rng mid-battle

    const engine2 = createEngine({ state: engine.serialize() });
    // step BOTH through ~20 s of bot combat (heavy rng traffic), comparing often
    for (let chunk = 0; chunk < 10; chunk++) {
      for (let i = 0; i < 2 * TICK_RATE; i++) { engine.tick(DT); engine2.tick(DT); }
      expect(JSON.stringify(engine2.serialize())).toBe(JSON.stringify(engine.serialize()));
    }
    engine.destroy();
    engine2.destroy();
  });

  it('kick bans by name through the engine; the adapter hook fires', () => {
    const kicked = [];
    const engine = createEngine({ seed: 3, demoBot: false, onKick: (id, o) => kicked.push({ id, ...o }) });
    engine.join('h1', { name: 'Host' });
    engine.join('h2', { name: 'Pest' });
    engine.message('h1', { t: 'kick', id: 'h2', ban: true });
    expect(kicked).toEqual([{ id: 'h2', ban: true }]);
    expect(engine.game.players.h2).toBeUndefined();
    expect(engine.join('h3', { name: 'Pest' })).toEqual({ ok: false, reason: 'banned from this lobby' });
    engine.message('h1', { t: 'unbanAll' });
    expect(engine.join('h3', { name: 'Pest' }).ok).toBe(true);
    engine.destroy();
  });

  // Per-kind name pools (round 22): a tier meets you with its own names, a
  // lobby never repeats one while any is unused, and exhaustion borrows.
  it('bot names: the kind pool first, distinct, then borrowed from the others', () => {
    const engine = createEngine({ seed: 5, demoBot: false });
    engine.join('h1', { name: 'Host' });
    const pool = BOT_NAMES.grunt;
    for (let i = 0; i < pool.length + 1; i++) engine.message('h1', { t: 'addBot', kind: 'grunt' });
    const names = Object.values(engine.game.players).filter(p => p.bot).map(p => p.name);
    expect(names.length).toBe(pool.length + 1);
    expect(new Set(names).size).toBe(names.length);           // no repeats
    expect(names.filter(n => pool.includes(n)).length).toBe(pool.length);
    const borrowed = names.find(n => !pool.includes(n));      // the overflow bot
    expect(Object.values(BOT_NAMES).flat()).toContain(borrowed);

    // Hard still answers to the classic six (Remi: the CURRENT names are Hard's)
    engine.message('h1', { t: 'addBot', kind: 'berserker' });
    const hard = Object.values(engine.game.players).find(p => p.kind === 'berserker');
    expect(BOT_NAMES.berserker).toContain(hard.name);
    expect(BOT_NAMES.berserker).toContain('Gul\'dan');
    engine.destroy();
  });

  // round 22: removeBot takes an optional id (per-row remove buttons). A bot
  // id removes THAT bot; a human id is ignored; no id keeps last-bot behavior.
  it('removeBot: by id for bots only, last-added without an id', () => {
    const engine = createEngine({ seed: 8, demoBot: false });
    engine.join('h1', { name: 'Host' });
    engine.join('h2', { name: 'Friend' });
    for (let i = 0; i < 3; i++) engine.message('h1', { t: 'addBot', kind: 'grunt' });
    const [b1, b2, b3] = Object.values(engine.game.players).filter(p => p.bot).map(p => p.id);

    engine.message('h1', { t: 'removeBot', id: b2 });        // a named bot goes
    expect(engine.game.players[b2]).toBeUndefined();
    engine.message('h1', { t: 'removeBot', id: 'h2' });      // a human never does
    expect(engine.game.players.h2).toBeTruthy();
    expect(Object.values(engine.game.players).filter(p => p.bot).length).toBe(2);
    engine.message('h1', { t: 'removeBot' });                // no id = last added
    expect(engine.game.players[b3]).toBeUndefined();
    expect(engine.game.players[b1]).toBeTruthy();
    engine.destroy();
  });

  // Versus teams (round 21.3): the lobby wire; you move yourself, the host may
  // move a BOT, nobody may move another human, and a drop keeps your side.
  it('team numbers: own row + bots, never another human, and they survive a reconnect', () => {
    const engine = createEngine({ seed: 4, demoBot: false });
    engine.join('h1', { name: 'Host' });
    engine.join('h2', { name: 'Friend' });
    engine.message('h1', { t: 'addBot', kind: 'grunt' });
    const bot = Object.values(engine.game.players).find(p => p.bot);

    engine.message('h1', { t: 'team', n: 2 });
    engine.message('h2', { t: 'team', n: 2 });
    engine.message('h1', { t: 'team', id: bot.id, n: 3 });
    expect(engine.game.players.h1.team).toBe(2);
    expect(engine.game.players.h2.team).toBe(2);
    expect(bot.team).toBe(3);
    // h1 cannot drag another human onto a team (the id is honoured for bots only)
    engine.message('h1', { t: 'team', id: 'h2', n: 9 });
    expect(engine.game.players.h2.team).toBe(2);
    expect(engine.game.players.h1.team).toBe(9);   // it moved the SENDER instead

    engine.message('h1', { t: 'team', n: 2 });
    engine.message('h1', { t: 'ready', ready: true });
    engine.message('h2', { t: 'ready', ready: true });
    expect(engine.game.phase).not.toBe('lobby');
    engine.leave('h2');
    expect(engine.join('h2', { name: 'Friend' }).ok).toBe(true);
    expect(engine.game.players.h2.team).toBe(2);   // back on the same side
    engine.destroy();
  });

  // Round 23 (Remi): rules, bots and kicks belong to the HOST (the oldest
  // seated connection); guests keep their own seat choices and a visible
  // denied for anything else. A leaving host promotes the next-oldest.
  it('host only: rules, bots, kicks; a guest is denied and a new host is promoted', () => {
    const { engine, sent } = makeRoom(6);
    engine.join('h1', { name: 'Host' });
    engine.join('h2', { name: 'Guest' });

    engine.message('h2', { t: 'draft', on: true });
    expect(engine.game.draft).toBeFalsy();
    expect(sent.some(x => x.connId === 'h2' && x.msg.t === 'denied')).toBe(true);
    engine.message('h2', { t: 'mode', mode: 'classic' });
    expect(engine.game.mode).toBe('elemental');
    engine.message('h2', { t: 'addBot', kind: 'grunt' });
    expect(Object.values(engine.game.players).some(p => p.bot)).toBe(false);
    engine.message('h2', { t: 'kick', id: 'h1' });
    expect(engine.game.players.h1).toBeTruthy();

    // the guest still owns their OWN seat: spectate and team keep working
    engine.message('h2', { t: 'spectate', on: true });
    expect(engine.game.players.h2.spectator).toBe(true);
    engine.message('h2', { t: 'spectate', on: false });
    engine.message('h2', { t: 'team', n: 3 });
    expect(engine.game.players.h2.team).toBe(3);

    // the host can do all of it, including the chatter flag on the snap
    engine.message('h1', { t: 'draft', on: true });
    expect(engine.game.draft).toBe(true);
    engine.message('h1', { t: 'addBot', kind: 'grunt' });
    const bot = Object.values(engine.game.players).find(p => p.bot);
    expect(bot).toBeTruthy();
    const botTeam = bot.team;
    engine.message('h2', { t: 'team', id: bot.id, n: botTeam === 9 ? 8 : 9 });
    expect(bot.team).toBe(botTeam);            // arranging bots is host work
    engine.message('h1', { t: 'chatter', on: false });
    sent.length = 0;
    engine.pushSnapshots();
    const snap = sent.find(x => x.connId === 'h2' && x.msg.t === 'snap');
    expect(snap.msg.chat).toBe(false);
    expect(snap.msg.host).toBe('h1');

    // host leaves: the oldest remaining human inherits the controls
    engine.leave('h1');
    engine.message('h2', { t: 'draft', on: false });
    expect(engine.game.draft).toBeFalsy();
    engine.destroy();
  });
});
