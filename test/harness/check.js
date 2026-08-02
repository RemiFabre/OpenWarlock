// Invariant checker: reads a server journal (JSONL) and verifies game-law
// invariants hold over the whole session. Usable standalone:
//   node test/harness/check.js path/to/journal.jsonl
// or programmatically via checkJournal(lines).

import fs from 'node:fs';
import { SPELLS, PLAYER, ROUND } from '../../shared/constants.js';

export function checkJournal(lines) {
  const violations = [];
  const v = (msg, entry) => violations.push(`${msg}${entry ? ` @tick ${entry.tick}` : ''}`);

  const entries = [];
  for (const [i, line] of lines.entries()) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); }
    catch { violations.push(`journal line ${i + 1} unparseable`); }
  }

  let phase = 'lobby';
  let alive = new Set();
  let playersSeen = new Set();
  let totalAtRoundStart = 0;
  const lastCast = {}; // "playerId/spell" -> ms
  let lastDigest = null;
  let lastDigestEntry = null;

  const LEGAL = {
    lobby: ['countdown', 'lobby'],
    countdown: ['battle', 'lobby'],
    battle: ['roundEnd', 'lobby'],
    roundEnd: ['shop', 'gameover', 'lobby'],
    shop: ['countdown', 'lobby'],
    gameover: ['lobby'],
  };

  for (const e of entries) {
    switch (e.k) {
      case 'crash':
        v(`SERVER CRASH (${e.kind}): ${String(e.error).split('\n')[0]}`, e);
        break;

      case 'phase': {
        if (!(LEGAL[e.from] || []).includes(e.to)) v(`illegal phase transition ${e.from} -> ${e.to}`, e);
        if (e.to === 'battle') {
          // everyone present is alive at round start
          alive = new Set([...playersSeen]);
          totalAtRoundStart = alive.size;
          // startRound() resets all cooldowns by design, so casts in the
          // previous battle must not count against casts in this one
          for (const k of Object.keys(lastCast)) delete lastCast[k];
        }
        if (e.from === 'battle' && e.to === 'roundEnd') {
          if (totalAtRoundStart >= 2 && alive.size > 1)
            v(`round ended with ${alive.size} players still alive`, e);
        }
        phase = e.to;
        break;
      }

      case 'reset':
        phase = 'lobby';
        playersSeen = new Set();
        alive = new Set();
        break;

      case 'msg':
        if (e.m && e.m.t === 'join') playersSeen.add(e.id);
        break;
      case 'disconnect':
        playersSeen.delete(e.id);
        alive.delete(e.id);
        break;

      case 'event': {
        const ev = e.e;
        if (!ev) break;
        if (ev.t === 'death') {
          if (!alive.has(ev.id) && phase === 'battle' && playersSeen.has(ev.id))
            v(`player ${ev.id} died twice in one round`, e);
          alive.delete(ev.id);
        }
        if (ev.t === 'round') {
          // round event fires at countdown start; digest will re-sync alive set
        }
        if (ev.t === 'cast') {
          const key = `${ev.id}/${ev.spell}`;
          const spec = SPELLS[ev.spell];
          if (spec) {
            const cd = Array.isArray(spec.cooldown) ? spec.cooldown[spec.cooldown.length - 1] : spec.cooldown;
            if (lastCast[key] != null && e.ms - lastCast[key] < cd * 1000 * 0.5)
              v(`cooldown violation: ${key} cast twice within ${e.ms - lastCast[key]} ms`, e);
            lastCast[key] = e.ms;
          }
        }
        break;
      }

      case 'digest': {
        // liveness: server digests every second; a big gap = stalled tick loop
        if (lastDigestEntry && e.ms - lastDigestEntry.ms > 3000)
          v(`tick stall: ${e.ms - lastDigestEntry.ms} ms between digests`, e);
        // player sanity
        for (const [id, p] of Object.entries(e.players || {})) {
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) v(`non-finite position for ${id}`, e);
          if (Math.abs(p.x) > 500 || Math.abs(p.y) > 500) v(`position blowup for ${id}: (${p.x}, ${p.y})`, e);
          if (!Number.isFinite(p.hp) || p.hp < 0 || p.hp > PLAYER.MAX_HP + 100) v(`hp out of bounds for ${id}: ${p.hp}`, e);
          if (!Number.isFinite(p.gold) || p.gold < 0) v(`negative/invalid gold for ${id}: ${p.gold}`, e);
          // gold can only grow during battle (kills) — buying is shop/lobby only
          if (lastDigest && lastDigest.phase === 'battle' && e.phase === 'battle' && lastDigest.players[id]) {
            if (p.gold < lastDigest.players[id].gold)
              v(`gold decreased during battle for ${id}: ${lastDigest.players[id].gold} -> ${p.gold}`, e);
          }
          if (p.alive) alive.add(id); else alive.delete(id);
        }
        if (e.round > ROUND.TOTAL_ROUNDS) v(`round ${e.round} exceeds TOTAL_ROUNDS`, e);
        lastDigest = e;
        lastDigestEntry = e;
        break;
      }
    }
  }

  return violations;
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('check.js')) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node check.js <journal.jsonl>'); process.exit(2); }
  const violations = checkJournal(fs.readFileSync(file, 'utf8').split('\n'));
  if (violations.length) {
    console.error(`FAIL — ${violations.length} violation(s):`);
    for (const x of violations) console.error('  -', x);
    process.exit(1);
  }
  console.log('journal OK');
}
