// Combo lab (issue #7): does the Faker actually combo, or just hit hard?
//
// A combo is only a combo if the victim could not leave. So the sparring
// partner is the RUNNER (BOTS.runner): it fights until the first hit of the
// round lands on it, then sprints away from whoever hit it, and it never casts
// a mobility or a defensive spell. Anything that lands on it afterwards landed
// because the victim was held or airborne, not because it stood still.
//
//   node tools/combo.js                      # faker vs runner, 200 games
//   node tools/combo.js --games=400 --seed=7
//   node tools/combo.js --attacker=stalker   # the control
//
// What the numbers mean is printed with them; read that, not this header.

import { createGame, addPlayer, startGame, step, stepBot, botShop, setShopReady }
  from '../shared/sim.js';
import { BOTS, ROUND, PLAYER } from '../shared/constants.js';

const argOf = (n, d) =>
  (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1] || d;
const games = Number(argOf('games', 200));
const seed0 = Number(argOf('seed', 90210));
const attacker = argOf('attacker', 'faker');
const victim = argOf('victim', 'runner');
const DT = 1 / 30;
// A chain is still running while the victim keeps taking hits inside this gap.
const LINK = 1.6;
// ⚠ Only a real ABILITY hit is a link. Without this the instrument measures the
// lava: a swim ticks ~0.47 hp every frame and turned every drowning into a
// "141-hit combo". A spell hit is at least this big, a burn or a sickness tick
// is not, and a body in the lava is not being combo'd, it is dying.
const MIN_HIT = 2;
// "Not in control": stunned, or moving fast enough to be under a knockback.
const AIRBORNE = 14;

for (const k of [attacker, victim]) {
  if (!Object.hasOwn(BOTS, k)) {
    console.error(`unknown bot: ${k} (have: ${Object.keys(BOTS).join(', ')})`);
    process.exit(1);
  }
}

const chains = [];        // one entry per completed chain
let games0 = 0;
// ⚠ Sanity totals, printed with the rest: a seat that never connects would
// otherwise report "0 chains" and read as "this tier cannot combo" when what
// actually happened is that it never fought (the empty-build scar).
let totalHits = 0, totalDmg = 0, totalKills = 0;

for (let g = 0; g < games; g++) {
  const state = createGame({ seed: seed0 + g, mode: 'elemental' });
  addPlayer(state, 'A', 'Attacker', { bot: true, kind: attacker });
  addPlayer(state, 'B', 'Victim', { bot: true, kind: victim });
  startGame(state);
  const a = state.players.A, b = state.players.B;

  let chain = null;      // {dmg, hits, at, x, y, free} while one is running
  let hp = b.hp;
  let t = 0;
  const closeChain = () => {
    if (chain && chain.hits >= 2) chains.push(chain);
    chain = null;
  };

  while (state.phase !== 'gameOver' && t < 120) {
    for (const id of ['A', 'B']) {
      if (state.phase === 'battle') stepBot(state, id, DT);
      if (state.phase === 'shop') { botShop(state, id); setShopReady(state, id, true); }
    }
    step(state, DT);
    t += DT;
    if (state.phase !== 'battle') { closeChain(); hp = b.hp; continue; }

    // a hit landed on the victim
    if (b.hp < hp - MIN_HIT && !b.inLava) {
      const dmg = hp - b.hp;
      totalHits++; totalDmg += dmg;
      if (chain && t - chain.at <= LINK) {
        chain.dmg += dmg; chain.hits++; chain.at = t;
        chain.freeLocked = chain.free;   // free ticks BETWEEN hits only
      } else {
        closeChain();
        chain = { dmg, hits: 1, at: t, x: b.x, y: b.y, free: 0, freeLocked: 0, push: 0 };
      }
    }
    hp = b.hp;
    if (chain) {
      // was the victim able to act on this tick? A chain with zero free ticks
      // is a TRUE combo: they never got a step in.
      const speed = Math.hypot(b.vx, b.vy);
      if (!((b.stunT || 0) > 0) && speed < AIRBORNE) chain.free++;
      if (t - chain.at > LINK) closeChain();
      else chain.push = Math.hypot(b.x - chain.x, b.y - chain.y);
    }
    if (!b.alive) { closeChain(); hp = b.hp; }
  }
  closeChain();
  totalKills += a.kills;
  games0++;
}

const n = chains.length || 1;
const avg = (f) => chains.reduce((s, c) => s + f(c), 0) / n;
// `freeLocked` is the free-tick count as of the LAST hit, so the quiet tail
// after a chain ends (up to LINK seconds of the victim walking around) is not
// held against it. A true combo is one where nothing was free BETWEEN hits.
const trueCombos = chains.filter(c => c.freeLocked === 0);
const best = chains.slice().sort((x, y) => y.dmg - x.dmg)[0] || { dmg: 0, hits: 0 };

console.log(`
${attacker} (${BOTS[attacker].label}) vs ${victim} (${BOTS[victim].label}) · ${games0} games, seed ${seed0}, elemental

A CHAIN is every hit the victim took with no more than ${LINK}s of quiet between
them; only chains of 2+ hits are counted. A chain is a TRUE COMBO when the
victim was stunned or airborne (>${AIRBORNE} u/s) on every single tick of it —
they never got one step of control back. PUSH is how far the body was moved
between the first hit of the chain and the last, in arena units (the arena
starts at radius ${Math.round(56)}). All figures are per chain, not per game.
`);
console.log(`ability hits landed    ${totalHits}  (${(totalHits / games0).toFixed(2)} per game, ${(totalDmg / games0).toFixed(1)} hp)`);
console.log(`kills                  ${totalKills}  (${(totalKills / games0).toFixed(2)} per game)`);
console.log(`chains                 ${chains.length}  (${(chains.length / games0).toFixed(2)} per game)`);
console.log(`  damage per chain     ${avg(c => c.dmg).toFixed(1)}  of ${PLAYER.MAX_HP} max HP`);
console.log(`  hits per chain       ${avg(c => c.hits).toFixed(2)}`);
console.log(`  push per chain       ${avg(c => c.push || 0).toFixed(1)} units`);
console.log(`TRUE combos            ${trueCombos.length}  (${(100 * trueCombos.length / n).toFixed(1)}% of chains)`);
if (trueCombos.length) {
  const tn = trueCombos.length;
  const tavg = (f) => trueCombos.reduce((s, c) => s + f(c), 0) / tn;
  console.log(`  damage per true combo ${tavg(c => c.dmg).toFixed(1)}`);
  console.log(`  hits per true combo   ${tavg(c => c.hits).toFixed(2)}`);
}
console.log(`biggest single chain   ${best.dmg.toFixed(1)} damage over ${best.hits} hits`);
console.log(`\n⚠ What it cannot see: intent. A chain is whatever landed together,`);
console.log(`  so two independent shots inside ${LINK}s read as one chain. Lava, burns`);
console.log(`  and sickness ticks are excluded (a link must be ${MIN_HIT}+ damage out of`);
console.log(`  the lava), so a drowning victim no longer reads as a 141-hit combo.`);
