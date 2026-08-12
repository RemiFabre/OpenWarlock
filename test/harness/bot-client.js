// A scriptable player for the test harness. Connects to a real server over
// WebSocket and executes a script written in a tiny command language, so an
// AI agent (or a human) can describe entire matches as data.
//
// Script = array of steps (strings). Supported commands:
//   ready                     toggle ready on
//   wait <seconds>
//   move <x> <y>              right-click at world coords
//   center                    move to (0,0)
//   cast <spell> at <x> <y>
//   cast <spell> at nearest   aim at nearest living enemy
//   hunt <seconds>            chase nearest enemy, fireballing (the workhorse)
//   flee <seconds>            run away from nearest enemy, stay on platform
//   buy <thing>               buy a spell/item (works in shop & lobby)
//   spam <n>                  send n random/malformed messages (fuzzing)
//   disconnect                close the socket
//   reconnect                 open a new socket and re-join (new identity)
//   mode <classic|elemental|coop>   flip the ruleset (lobby only)
//   addbot / removebot
//   again                     back to lobby after gameover
//   auto <seconds>            full autopilot: ready/fight/shop/again as needed
//
// The client records everything it observes (snapshots, events, denials) for
// the checker.

import WebSocket from 'ws';
import { createSnapSink } from '../../shared/snapwire.js';

const POLICY_HZ = 10;

export class ScriptedPlayer {
  constructor(url, name, script, log = () => {}) {
    this.url = url;
    this.name = name;
    this.steps = [...script];
    this.log = log;
    this.id = null;
    this.snap = null;
    this.lastSnapAt = 0;
    this.events = [];
    this.denials = [];
    this.errors = [];
    this.connected = false;
    this.finished = false;
    this._current = null; // {cmd, until} for timed steps
    // the receiving half of the real wire (shared/snapwire.js) — reassembles
    // `evt` + delta state back into the snapshots the checker reads
    this.sink = createSnapSink(
      (m) => {
        this.snap = m.s;
        this.lastSnapAt = Date.now();
        for (const e of m.e) this.events.push(e);
      },
      () => this.send({ t: 'full' }),
      { ack: (q) => this.send({ t: 'ack', q }) },
    );
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      const to = setTimeout(() => reject(new Error(`${this.name}: connect timeout`)), 8000);
      this.ws.on('open', () => {
        clearTimeout(to);
        this.connected = true;
        // Reset snapshot freshness: after a reconnect, lastSnapAt is stale
        // from before the disconnect, and the freeze watchdog would otherwise
        // count the (intentional) offline gap as server snapshot starvation.
        this.lastSnapAt = Date.now();
        // A new socket restarts the wire's sequence at 1, so a decoder still
        // holding the old session's cursor would reject everything as stale.
        this.sink.reset();
        // dv:1 — the harness rides the SAME wire real players do (round 21.10:
        // events on their own message, delta-coded state), so a full scenario
        // run with invariant checking covers the framing too.
        this.send({ t: 'join', name: this.name, dv: 1 });
        resolve();
      });
      this.ws.on('message', (raw) => {
        let m;
        try { m = JSON.parse(raw); } catch { this.errors.push('unparseable server message'); return; }
        if (m.t === 'welcome') { this.id = m.id; return; }
        if (this.sink.take(m)) return;
        if (m.t === 'denied') this.denials.push(m.reason);
      });
      this.ws.on('close', () => { this.connected = false; });
      this.ws.on('error', (e) => { if (!this.finished) this.errors.push(`${this.name} ws error: ${e.message}`); });
    });
  }

  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  me() { return this.snap && this.id ? this.snap.players[this.id] : null; }

  nearestEnemy() {
    const me = this.me();
    if (!me || !this.snap) return null;
    let best = null, bd = Infinity;
    for (const p of Object.values(this.snap.players)) {
      if (p.id === this.id || !p.alive) continue;
      // co-op: allies are not targets (the snapshot carries `team` in that
      // mode only; in classic every field is undefined and this is a no-op)
      if (me.team && p.team && me.team === p.team) continue;
      const d = Math.hypot(p.x - me.x, p.y - me.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  ownedSpells() {
    const me = this.me();
    return me ? Object.keys(me.spells).filter((k) => me.spells[k] > 0) : [];
  }

  // Run the whole script. Resolves when the script is done or abort()ed.
  async run() {
    const stepMs = 1000 / POLICY_HZ;
    while ((this.steps.length || this._current) && !this.aborted) {
      const t0 = Date.now();
      this.tickStep();
      const dtWait = stepMs - (Date.now() - t0);
      await new Promise((r) => setTimeout(r, Math.max(5, dtWait)));
    }
    this.finished = true;
  }

  abort() {
    this.aborted = true;
    this.steps = [];
    this._current = null;
    try { this.ws.close(); } catch { /* already closed */ }
  }

  tickStep() {
    const now = Date.now();
    if (this._current) {
      if (now >= this._current.until) this._current = null;
      else { this.tickPolicy(this._current.cmd); return; }
    }
    if (!this.steps.length) return;
    const step = this.steps.shift();
    const [cmd, ...args] = String(step).trim().split(/\s+/);
    this.log(`${this.name}: ${step}`);
    switch (cmd) {
      case 'ready': this.send({ t: 'ready', ready: true }); break;
      case 'mode': this.send({ t: 'mode', mode: args[0] }); break;
      case 'wait': this._current = { cmd: 'idle', until: now + Number(args[0]) * 1000 }; break;
      case 'move': this.send({ t: 'move', x: Number(args[0]), y: Number(args[1]) }); break;
      case 'center': this.send({ t: 'move', x: 0, y: 0 }); break;
      case 'cast': {
        // cast <spell> at <x> <y> | at nearest
        const spell = args[0];
        if (args[1] === 'at' && args[2] === 'nearest') {
          const e = this.nearestEnemy();
          if (e) this.send({ t: 'cast', key: spell, x: e.x, y: e.y });
        } else {
          this.send({ t: 'cast', key: spell, x: Number(args[2]), y: Number(args[3]) });
        }
        break;
      }
      case 'hunt': case 'flee': case 'auto':
        this._current = { cmd, until: now + Number(args[0] || 5) * 1000 };
        break;
      case 'buy': this.send({ t: 'buy', id: args[0] }); break;
      case 'spam': {
        const n = Number(args[0] || 10);
        for (let i = 0; i < n; i++) this.send(randomGarbage(i));
        break;
      }
      case 'disconnect': this.ws.close(); break;
      case 'reconnect':
        this.connect().catch((e) => this.errors.push(`reconnect failed: ${e.message}`));
        break;
      case 'addbot': this.send({ t: 'addBot' }); break;
      case 'removebot': this.send({ t: 'removeBot' }); break;
      case 'again': this.send({ t: 'again' }); break;
      default: this.errors.push(`unknown script command: ${step}`);
    }
  }

  tickPolicy(cmd) {
    if (cmd === 'idle') return;
    const me = this.me();
    if (!me || !this.snap) return;
    const phase = this.snap.phase;

    if (cmd === 'auto') {
      if (phase === 'lobby') { if (!me.ready) this.send({ t: 'ready', ready: true }); return; }
      if (phase === 'shop') { this.autoShop(); return; }
      if (phase === 'gameover') { this.send({ t: 'again' }); return; }
      // kite (retreat but keep casting) rather than flee when low: two
      // symmetric pure-fleeing clients otherwise stalemate a round forever
      // inside the arena's permanent safe zone (MIN_RADIUS holds at 10)
      if (phase === 'battle') return this.tickPolicy(me.hp < 30 ? 'kite' : 'hunt');
      return;
    }
    if (phase !== 'battle' || !me.alive) return;

    const enemy = this.nearestEnemy();
    if (cmd === 'hunt' && enemy) {
      this.send({ t: 'move', x: enemy.x * 0.8, y: enemy.y * 0.8 });
      this.castAll(me, enemy);
    } else if (cmd === 'flee' || cmd === 'kite') {
      const r = Math.max(2, (this.snap.arenaRadius || 20) - 8);
      if (enemy) {
        const dx = me.x - enemy.x, dy = me.y - enemy.y;
        const d = Math.hypot(dx, dy) || 1;
        let tx = me.x + (dx / d) * 12, ty = me.y + (dy / d) * 12;
        const td = Math.hypot(tx, ty);
        if (td > r) { tx *= r / td; ty *= r / td; }
        this.send({ t: 'move', x: tx, y: ty });
        if (cmd === 'kite') this.castAll(me, enemy);
      } else {
        this.send({ t: 'move', x: 0, y: 0 });
      }
    }
  }

  // fire every owned, off-cooldown spell at the target
  castAll(me, enemy) {
    for (const spell of this.ownedSpells()) {
      if ((me.cooldowns || {})[spell]) continue;
      this.send({ t: 'cast', key: spell, x: enemy.x, y: enemy.y });
    }
  }

  autoShop() {
    const me = this.me();
    if (!me) return;
    const wants = ['boots', 'fireball', 'teleport', 'amulet', 'fireball', 'lightning',
      'cape', 'ring', 'shield', 'sword', 'boomerang', 'rush', 'treads'];
    for (const w of wants) this.send({ t: 'buy', id: w });
  }
}

function randomGarbage(i) {
  const cases = [
    { t: 'move', x: 'NaN', y: {} },
    { t: 'move', x: 1e18, y: -1e18 },
    { t: 'cast', key: 'fireball', x: Infinity, y: null },
    { t: 'cast', key: '__proto__', x: 0, y: 0 },
    { t: 'buy', id: 'constructor' },
    { t: 'buy', id: { evil: true } },
    { t: 'ready', ready: 'maybe' },
    { t: 'join', name: 'x'.repeat(5000) },
    { t: 'nonsense' },
    { totally: 'unrelated' },
    { t: 'cast', key: 'fireball' },
    { t: 'move' },
  ];
  return cases[i % cases.length];
}
