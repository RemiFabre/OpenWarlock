// Combo lab (round 20). Remi's frost-threshold question: at which frost LEVEL
// does a telegraphed spell actually CONNECT on a bot that tries to dodge it?
//
// The scripted scenario, per trial: one victim bot at arena center, full hp,
// wearing exactly the CC that frost level L triggers on its 3rd stack (read
// from ELEMENTS.frost.fx: lv1 slow ×0.7, lv2 slow ×0.5, lv3 stun 2 s; lv0 =
// no CC as the control). The caster drops the spell dead ON the body the same
// instant: the best-case combo, which is exactly what the CC-gated bot cast
// does. We then step the sim through the telegraph and read whether the victim
// took blast damage. No shopping, no economy, no second fight: pure escape
// physics + the bot's dodge policy.
//
// Two rates per cell:
//   hit%        over all trials; what a game would see, including the trials
//               where the bot COMMITTED to eating the bolt (BOTS.boltDodge);
//   hit%|dodge  only the trials where the bot rolled a dodge attempt; the
//               clean physics answer to "does the CC hold them in the circle".
//
// What this instrument CANNOT see: humans lead targets, pre-cast before the
// 3rd stack, and own boots (bots here walk at base speed 11 unless --boots);
// and no bot ever baits a dodge or reacts to the CAST sound before the zone
// appears. Treat hit%|dodge as a floor-vs-ceiling bracket, not a win-rate
// prediction. Known artifact in every sub-100% cell: a bot that finishes its
// escape hop early re-decides, sees no threat, and strolls back toward its
// prey INTO the still-live zone (traced 2026-08-09), so non-CC "hit" rates
// mix real dodge failures with drift-back. The 100% rows are the clean
// signal: the CC physically cannot be outrun.
//
//   node tools/combo-lab.js                         # 500 trials/cell, seed 1
//   node tools/combo-lab.js --trials=1000 --seed=2 --kinds=brawler,stalker

import {
  createGame, addPlayer, startGame, step, stepBot, castSpell,
} from '../shared/sim.js';
import { SPELLS, ELEMENTS, PLAYER, BOTS } from '../shared/constants.js';

const DT = 1 / 30;

function trial({ spell, frostLv, kind, seed }) {
  const state = createGame({ seed, mode: 'classic' });
  addPlayer(state, 'a', 'Caster');
  addPlayer(state, 'v', 'Victim', { bot: true, kind });
  startGame(state);
  let guard = 0;
  while (state.phase !== 'battle' && guard++ < 1000) step(state, DT);
  const a = state.players.a, v = state.players.v;
  a.x = -20; a.y = 0; v.x = 0; v.y = 0; v.vx = 0; v.vy = 0;
  v.hp = v.maxHp; v.moveTarget = null;
  // the CC that frost level L's 3rd stack triggers, read from the spec
  const f = ELEMENTS.frost.fx;
  if (frostLv >= 1) {
    const stun = f.stunT[frostLv - 1];
    if (stun > 0) v.stunT = stun;
    else { v.slowT = f.slowT[frostLv - 1]; v.slowMultHit = f.slowMult[frostLv - 1]; }
  }
  if (boots > 0) v.items.boots = boots;     // --boots: a faster victim
  a.spells[spell] = 1;
  castSpell(state, 'a', spell, v.x, v.y);   // dead on the body, like ccHeld aim
  const zone = (spell === 'lightning' ? state.bolts : state.meteors)[0];
  const hp0 = v.hp;
  const ticks = Math.ceil((SPELLS[spell].delay + 0.15) / DT);
  for (let i = 0; i < ticks; i++) { stepBot(state, 'v', DT); step(state, DT); }
  return {
    hit: v.hp < hp0 - 0.5,
    tried: !!(zone._dodge && zone._dodge.v === true),  // committed dodge roll
  };
}

// ---- CLI --------------------------------------------------------------------
const argNum = (name, dflt) => Number((process.argv.find(x => x.startsWith(`--${name}=`)) || '').split('=')[1] || dflt);
const argStr = (name, dflt) => (process.argv.find(x => x.startsWith(`--${name}=`)) || '').split('=')[1] || dflt;
const trials = argNum('trials', 500);
const seed = argNum('seed', 1);
const boots = argNum('boots', 0);   // victim's boots level: real opponents own some
const kinds = argStr('kinds', 'berserker,stalker').split(',');

console.log(`combo lab: spell dropped ON the body the instant frost's CC triggers;`);
console.log(`${trials} trials/cell, seed ${seed}. hit%|dodge = trials where the bot`);
console.log(`rolled a dodge attempt (boltDodge: ${kinds.map(k => `${k} ${BOTS[k].boltDodge}`).join(', ')});`);
console.log(`escape math: base speed ${PLAYER.SPEED} (victim boots lv${boots}), bolt r ${SPELLS.lightning.radius} in ${SPELLS.lightning.delay} s, meteor r ${SPELLS.meteor.radius} in ${SPELLS.meteor.delay} s.\n`);
console.log('spell      kind       frost  CC applied      hit%   hit%|dodge  dodges');
for (const spell of ['lightning', 'meteor']) {
  for (const kind of kinds) {
    for (let lv = 0; lv <= 3; lv++) {
      let hits = 0, tried = 0, triedHits = 0;
      for (let t = 0; t < trials; t++) {
        const r = trial({ spell, frostLv: lv, kind, seed: seed * 1e6 + t * 7 + lv });
        if (r.hit) hits++;
        if (r.tried) { tried++; if (r.hit) triedHits++; }
      }
      const f = ELEMENTS.frost.fx;
      const cc = lv === 0 ? 'none (control)'
        : f.stunT[lv - 1] > 0 ? `stun ${f.stunT[lv - 1]} s`
        : `slow x${f.slowMult[lv - 1]} ${f.slowT[lv - 1]} s`;
      console.log(`${spell.padEnd(10)} ${kind.padEnd(10)} lv${lv}    ${cc.padEnd(15)}`
        + ` ${(100 * hits / trials).toFixed(1).padStart(5)}`
        + `  ${(tried ? 100 * triedHits / tried : 0).toFixed(1).padStart(9)}`
        + `  ${tried}/${trials}`);
    }
  }
}
