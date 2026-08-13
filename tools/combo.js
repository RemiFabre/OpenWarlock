// Combo lab (issue #7): does the Faker actually combo, or just hit hard?
//
// A combo is only a combo if the victim could not leave. So the sparring
// partner is the RUNNER (BOTS.runner), Remi's spec exactly: a dummy that does
// not move and does not cast until the first hit of the round lands on it,
// then runs from its attacker and still never casts. Anything that lands on it
// afterwards landed because the victim was held or airborne, not because it
// stood still by choice.
//
//   node tools/combo.js                       # every Faker build vs the dummy
//   node tools/combo.js --build=minefield     # one build
//   node tools/combo.js --attacker=stalker    # the Extreme control (no build loop)
//   node tools/combo.js --victim=stalker      # vs a LIVE Extreme (it fights back)
//   node tools/combo.js --no-combo            # ablation: Faker reflexes, combo layer OFF
//   node tools/combo.js --games=400 --seed=7
//
// What the numbers mean is printed with them; read that, not this header.

import { createGame, addPlayer, startGame, step, stepBot, botShop, setShopReady, setTesting }
  from '../shared/sim.js';
import { BOTS, BUILDS, ROUND, PLAYER } from '../shared/constants.js';

const argOf = (n, d) =>
  (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1] || d;
const games = Number(argOf('games', 200));
const seed0 = Number(argOf('seed', 90210));
const attacker = argOf('attacker', 'faker');
const victim = argOf('victim', 'runner');
const oneBuild = argOf('build', null);
// Funded start (testing sandbox): both seats shop this gold BEFORE round 1, so
// the lab measures the DEVELOPED build's combos instead of the poverty phase;
// a 120 s lab game only ever reaches round ~3, where nobody owns their kit yet.
// --gold=0 restores the earn-as-you-go economy.
const gold = Number(argOf('gold', 60));
// Ablation (Remi: "how does he win if not by combos?"): strip the combo layer
// and the Faker is its reflexes alone (same react/aim/dodge tuning, stalker
// brain every tick. The delta to the full Faker is what the combos are worth.
const noCombo = process.argv.includes('--no-combo');
if (noCombo) delete BOTS.faker.combo;
// Aggression knobs (sweep without editing constants): --fly= overrides
// combo.flySpeed (lower = follow up on smaller shoves), --trust= overrides
// combo.aimTrust (lower = accept nearer predictions).
if (BOTS.faker.combo) {
  const fly = Number(argOf('fly', 0)), trust = Number(argOf('trust', 0));
  if (fly) BOTS.faker.combo.flySpeed = fly;
  if (trust) BOTS.faker.combo.aimTrust = trust;
}
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
// A chain's OPENER window: pieces cast this long before its first hit count as
// part of it (the hook and the trap precede the damage they cause).
const OPENER_WINDOW = 1.2;
// PRACTICAL combo (Remi, 2026-08-12): the victim never got control back for
// longer than a human reaction between hits. A 2-tick window of control is not
// an escape; you still have to SEE it and move. True combos (zero free ticks)
// are reported beside it as the strict tier.
const REACTION_TICKS = 8;   // 8 ticks at 30 Hz ≈ 0.27 s

// event type -> combo piece name, with the field naming whose it is (a live
// victim casts back; its bolts must not tag the attacker's chains)
const PIECE = {
  swapped: ['a', 'hook'], mineHit: ['id', 'mine'], boltHit: ['by', 'bolt'],
  meteorHit: ['by', 'meteor'], galeBurst: ['by', 'gust'],
  // frostBreak carries the VICTIM's id (the break happens on the body)
  frostBreak: ['id', 'freeze', 'B'],
};

for (const k of [attacker, victim]) {
  if (!Object.hasOwn(BOTS, k)) {
    console.error(`unknown bot: ${k} (have: ${Object.keys(BOTS).join(', ')})`);
    process.exit(1);
  }
}
if (oneBuild && !Object.hasOwn(BUILDS, oneBuild)) {
  console.error(`unknown build: ${oneBuild}`);
  process.exit(1);
}

function run(build) {
  const chains = [];
  let games0 = 0, totalHits = 0, totalDmg = 0, totalKills = 0, victimKills = 0;

  for (let g = 0; g < games; g++) {
    const state = createGame({ seed: seed0 + g, mode: 'elemental' });
    addPlayer(state, 'A', 'Attacker', { bot: true, kind: attacker, ...(build ? { build } : {}) });
    addPlayer(state, 'B', 'Victim', { bot: true, kind: victim });
    if (gold > 0) setTesting(state, true, gold);
    startGame(state);
    const a = state.players.A, b = state.players.B;

    let chain = null;      // {dmg, hits, at, x, y, free, pieces} while running
    let recent = [];       // attacker combo pieces, [t, piece], last few seconds
    let hp = b.hp;
    let t = 0;
    const closeChain = () => {
      if (chain && chain.hits >= 2) chains.push(chain);
      chain = null;
    };

    while (state.phase !== 'gameover' && t < 120) {   // ⚠ lower-case: sim.js phase
      for (const id of ['A', 'B']) {
        if (state.phase === 'battle') stepBot(state, id, DT);
        if (state.phase === 'shop') { botShop(state, id); setShopReady(state, id, true); }
      }
      const evFrom = state.events.length;
      step(state, DT);
      t += DT;
      // harvest this tick's ATTACKER combo pieces (events never drain here)
      for (let i = evFrom; i < state.events.length; i++) {
        const e = state.events[i];
        const spec = PIECE[e.t];
        if (spec && e[spec[0]] === (spec[2] || 'A')) recent.push([t, spec[1]]);
      }
      if (recent.length > 64) recent = recent.filter(([at]) => t - at <= 10);
      if (state.phase !== 'battle') { closeChain(); hp = b.hp; continue; }

      // a hit landed on the victim
      if (b.hp < hp - MIN_HIT && !b.inLava) {
        const dmg = hp - b.hp;
        totalHits++; totalDmg += dmg;
        if (chain && t - chain.at <= LINK) {
          chain.dmg += dmg; chain.hits++; chain.at = t;
          chain.freeLocked = chain.free;       // free ticks BETWEEN hits only
          chain.gapLocked = chain.maxGap;      // ...and the longest RUN of them
        } else {
          closeChain();
          chain = { dmg, hits: 1, at: t, x: b.x, y: b.y, free: 0, freeLocked: 0,
            streak: 0, maxGap: 0, gapLocked: 0, push: 0,
            pieces: new Set(recent.filter(([at]) => t - at <= OPENER_WINDOW).map(([, p]) => p)) };
        }
      }
      hp = b.hp;
      if (chain) {
        // pieces landing while the chain runs belong to it
        for (const [at, p] of recent) if (at > chain.at - OPENER_WINDOW) chain.pieces.add(p);
        // was the victim able to act on this tick? A chain with zero free ticks
        // is a TRUE combo; one whose longest run of free ticks stays under a
        // human reaction is a PRACTICAL combo.
        const speed = Math.hypot(b.vx, b.vy);
        if (!((b.stunT || 0) > 0) && speed < AIRBORNE) {
          chain.free++;
          chain.streak++;
          chain.maxGap = Math.max(chain.maxGap, chain.streak);
        } else {
          chain.streak = 0;
        }
        if (t - chain.at > LINK) closeChain();
        else chain.push = Math.hypot(b.x - chain.x, b.y - chain.y);
      }
      if (!b.alive) { closeChain(); hp = b.hp; }
    }
    closeChain();
    totalKills += a.kills;
    victimKills += b.kills;
    games0++;
  }
  return { chains, games0, totalHits, totalDmg, totalKills, victimKills };
}

function report(build, r) {
  const { chains, games0, totalHits, totalDmg, totalKills, victimKills } = r;
  const n = chains.length || 1;
  const avg = (f) => chains.reduce((s, c) => s + f(c), 0) / n;
  // `freeLocked` is the free-tick count as of the LAST hit, so the quiet tail
  // after a chain ends is not held against it. A true combo is one where
  // nothing was free BETWEEN hits.
  const trueCombos = chains.filter(c => c.freeLocked === 0);
  const practical = chains.filter(c => c.gapLocked <= REACTION_TICKS);
  const best = chains.slice().sort((x, y) => y.dmg - x.dmg)[0] || { dmg: 0, hits: 0 };

  console.log(`\n--- ${attacker}${noCombo ? ' (COMBO LAYER OFF)' : ''}${build ? ` [${build}]` : ''} vs ${victim} · ${games0} games, seed ${seed0}, elemental${gold ? `, both seats pre-funded ${gold} g` : ''} ---`);
  console.log(`ability hits landed    ${totalHits}  (${(totalHits / games0).toFixed(2)} per game, ${(totalDmg / games0).toFixed(1)} hp)`);
  console.log(`kills                  ${totalKills} vs ${victimKills}  (${(totalKills / games0).toFixed(2)} per game; kill share ${(100 * totalKills / Math.max(1, totalKills + victimKills)).toFixed(1)}%)`);
  console.log(`chains                 ${chains.length}  (${(chains.length / games0).toFixed(2)} per game)`);
  console.log(`  damage per chain     ${avg(c => c.dmg).toFixed(1)}  of ${PLAYER.MAX_HP} max HP`);
  console.log(`  hits per chain       ${avg(c => c.hits).toFixed(2)}`);
  console.log(`  push per chain       ${avg(c => c.push || 0).toFixed(1)} units`);
  console.log(`PRACTICAL combos       ${practical.length}  (${(100 * practical.length / n).toFixed(1)}% of chains; control gaps < a human reaction, ${REACTION_TICKS} ticks)`);
  console.log(`TRUE combos            ${trueCombos.length}  (${(100 * trueCombos.length / n).toFixed(1)}% of chains; zero free ticks)`);
  console.log(`biggest single chain   ${best.dmg.toFixed(1)} damage over ${best.hits} hits`);
  // the SHAPE of the chains: which pieces appeared together, most common first
  const sig = {};
  for (const c of chains) {
    const k = [...c.pieces].sort().join('+') || 'balls only';
    (sig[k] = sig[k] || { n: 0, dmg: 0 }).n++;
    sig[k].dmg += c.dmg;
  }
  console.log(`chain shapes (pieces seen in one chain, share of chains, avg dmg):`);
  for (const [k, v] of Object.entries(sig).sort((x, y) => y[1].n - x[1].n).slice(0, 6)) {
    console.log(`  ${String(Math.round(100 * v.n / n)).padStart(3)}%  ${(v.dmg / v.n).toFixed(1).padStart(5)} hp  ${k}`);
  }
}

console.log(`
A CHAIN is every hit the victim took with no more than ${LINK}s of quiet between
them; only chains of 2+ hits are counted, links must be ${MIN_HIT}+ damage outside
the lava. A chain is a TRUE COMBO when the victim was stunned or airborne
(>${AIRBORNE} u/s) on every tick between its hits. PUSH is first hit -> last hit
displacement in units. The victim is a stand-still dummy until first hit, then
it flees, castless, so chains here are the attacker's doing, not the victim's
cooperation.
⚠ Cannot see intent: independent shots inside ${LINK}s read as one chain.`);

const fakerBuilds = Object.keys(BUILDS).filter(k => (BUILDS[k].kinds || []).includes(attacker));
const list = oneBuild ? [oneBuild] : (fakerBuilds.length ? fakerBuilds : [null]);
for (const b of list) report(b, run(b));
