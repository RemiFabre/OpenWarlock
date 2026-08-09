// Strategy study (round 16): rank full SHOPPING STRATEGIES in elemental mode.
//
// A *strategy* here is what a player actually plays: a named, ordered,
// EXHAUSTIVE buy list. Two parts:
//   · a CORE — the identity: which elements/items/spells it rushes, in order;
//   · the EXHAUST — one canonical breadth pass over the whole pilotable
//     catalogue, repeated, appended to every core. Remi's spec: "make the list
//     in a way that there is always something to buy", so no seat ever sits on
//     dead gold late (the midas/gold-saturation artifact, BALANCE 12E/15).
// Because the exhaust is IDENTICAL for every strategy, late-game convergence is
// shared and the measured differences come from the core and its order.
//
// The lab: 4-seat MIRROR lobbies (same bot kind everywhere — default Hard
// berserker, the piloted tier), each game sampling 4 DISTINCT strategies, mode
// elemental. Baseline win rate is 25% by construction; the table is zero-sum
// (a RANKING, not a strength meter — see BALANCE.md on the do-nothing floor).
//
//   node tools/strategy-study.js --games=4000 --seed=1
//   node tools/strategy-study.js --kind=stalker --games=1500   # Extreme tier
//   node tools/strategy-study.js --only=glass-cannon,tank-sustain --games=800
//   node tools/strategy-study.js --list
//
// Only spells the bot brains actually PILOT are allowed in lists (lightning,
// boomerang, rush, shield, teleport — see pilotOwnedSpells in shared/sim.js);
// a spell a bot never casts is a gold sink of unknown size and would make its
// strategy read weak for reasons that have nothing to do with the strategy.

import fs from 'node:fs';
import { playGame } from './arena.js';
import { makeRng } from '../shared/sim.js';

// progress ticks only for humans at a terminal (Remi's context policy)
const progress = process.stderr.isTTY ? console.error : () => {};

// One canonical breadth pass: everything a berserker/stalker can use, sustain
// and damage first. Repeated 3x so every level of everything is eventually
// reachable (a list entry buys at most one level per shop pass).
const EXHAUST_PASS = [
  'amulet', 'sword', 'boots', 'lightning', 'cape', 'treads',
  'hourglass', 'ember', 'terra', 'arcane', 'gale', 'ghost', 'malady',
  'vampire', 'anger', 'boomerang', 'rush', 'shield', 'teleport', 'echo',
  'frost', 'mosquito', 'midas',
];

// name -> { desc, core }. `desc` is build + playstyle, per the report rules.
export const STRATEGIES = {
  'glass-cannon': {
    desc: 'The fireball-upgrade replacement: max the three cheap offense axes (ember damage, arcane cadence, gale push) before anything else, then lifesteal to survive the trades it forces.',
    core: ['ember', 'ember', 'arcane', 'ember', 'arcane', 'gale', 'gale',
      'sword', 'sword', 'amulet', 'sword'],
  },
  cadence: {
    desc: 'Cooldown machine-gun: arcane to its lv3 refund special, hourglass, echo stone and lightning — cast as often as possible and let volume win.',
    core: ['arcane', 'arcane', 'arcane', 'hourglass', 'hourglass', 'echo',
      'lightning', 'hourglass', 'lightning', 'lightning'],
  },
  'double-cdr': {
    desc: 'Stacked cooldown reduction: arcane (fireball CDR + lv3 kit refund) multiplied by the hourglass — the fireball lands at ~1.1 s and every hit hastens the lightning.',
    core: ['arcane', 'arcane', 'arcane', 'hourglass', 'hourglass',
      'lightning', 'hourglass', 'lightning', 'lightning'],
  },
  balanced: {
    desc: 'One-for-one hybrid: alternate an offense purchase (ember damage, arcane cadence) with a defense purchase (max HP, lifesteal) every shop.',
    core: ['ember', 'amulet', 'arcane', 'sword', 'ember', 'amulet', 'arcane',
      'sword', 'ember', 'amulet', 'sword'],
  },
  'malady-dot': {
    desc: 'Plague attrition: max malady fast, then terra so the two-hit infections are easy to land, then HP to outlast the sickness clock.',
    core: ['malady', 'malady', 'malady', 'terra', 'terra', 'terra',
      'amulet', 'amulet', 'amulet'],
  },
  'vampire-brawler': {
    desc: 'Sustain brawler: max vampire (every 5th ball heals >100% of its damage), stack max HP and the Blood Sword, and win long point-blank trades.',
    core: ['vampire', 'vampire', 'vampire', 'amulet', 'sword', 'amulet',
      'sword', 'amulet', 'sword'],
  },
  'anger-scaling': {
    desc: 'Late-game scaling: max anger immediately for the fastest mark cadence, terra so the claiming hits are easy to land, banking permanent damage into a cannon by round 10.',
    core: ['anger', 'anger', 'anger', 'terra', 'terra', 'terra',
      'amulet', 'amulet'],
  },
  'mosquito-combo': {
    desc: 'Trap setup: max mosquito (lv3 clears the damage penalty), then malady so a cashed trap lands the whole two-hit infection at once, then arcane cadence for more casts per fight.',
    core: ['mosquito', 'mosquito', 'mosquito', 'malady', 'malady', 'arcane',
      'malady', 'arcane', 'amulet'],
  },
  'frost-control': {
    desc: 'Control: max frost (3rd stack freezes solid at lv3), lightning to punish the frozen, HP to survive the stack-building phase.',
    core: ['frost', 'frost', 'frost', 'lightning', 'amulet', 'lightning',
      'amulet', 'lightning', 'amulet'],
  },
  'ghost-sniper': {
    desc: 'Projectile quality: ghost speed (harder to dodge) into the lv3 passthrough, plus ember damage — every ball threatens the whole line.',
    core: ['ghost', 'ghost', 'ember', 'ember', 'ghost', 'ember',
      'sword', 'amulet', 'sword'],
  },
  'gale-launcher': {
    desc: 'Lava launcher: cheap gale push early into the lv3 burst, terra so the shoves land, boots to control distance — wins by ring-outs, not damage.',
    core: ['gale', 'gale', 'terra', 'terra', 'gale', 'terra',
      'boots', 'boots', 'amulet'],
  },
  'tank-sustain': {
    desc: 'Classic turtle: amulet and sword before any element, treads to swim safely; buys its (ember) offense only once unkillable.',
    core: ['amulet', 'amulet', 'sword', 'amulet', 'treads', 'sword', 'sword', 'ember', 'ember'],
  },
  'midas-economy': {
    desc: 'Economy: max midas first (every hit pays +1g, fireball halved until the levels buy it back) and convert the income lead into the deepest full build.',
    core: ['midas', 'midas', 'midas', 'amulet', 'sword', 'boots', 'amulet'],
  },
  'item-breadth': {
    desc: 'Breadth-first shopper: one level of every item before any second level or element — the round-15 finding that breadth beats depth, taken literally.',
    core: ['amulet', 'sword', 'boots', 'cape', 'treads', 'hourglass',
      'ember', 'terra'],
  },
  'spell-kit': {
    desc: 'Kit width: lightning, boomerang, rush and shield at level 1 before going deep — more buttons every fight, ember on top.',
    core: ['lightning', 'boomerang', 'rush', 'shield', 'ember', 'ember',
      'lightning', 'boomerang', 'amulet'],
  },
  'all-cheap': {
    desc: 'The bargain bin: level 1-2 of EVERY cheap element axis (damage, size, cadence, push, speed) before anything expensive — maximum stat lines per gold.',
    core: ['ember', 'terra', 'arcane', 'gale', 'ghost', 'ember', 'terra',
      'arcane', 'gale', 'ghost', 'amulet', 'sword'],
  },
  'no-elements': {
    desc: 'Control strategy: refuses elements entirely — items and pilotable spells only. Prices "the element shelf" as a class: every point below baseline is what skipping it costs.',
    core: ['amulet', 'sword', 'boots', 'lightning', 'amulet', 'sword',
      'boomerang', 'cape', 'treads', 'hourglass', 'amulet', 'sword', 'lightning',
      'boots', 'boots', 'cape', 'treads', 'hourglass', 'rush',
      'shield', 'teleport', 'lightning', 'boomerang', 'boomerang', 'rush',
      'shield', 'teleport', 'cape', 'treads', 'hourglass', 'echo'],
    noExhaust: true, // the core IS the exhaust, minus the element shelf
  },
  // ---- wave 2 (round 16): hybrids and order-variants informed by wave 1 ----
  'malady-ember': {
    desc: 'Contagion on a hot ball: malady infections stacked with ember damage, sustain after.',
    core: ['malady', 'ember', 'malady', 'ember', 'malady', 'ember',
      'amulet', 'sword', 'amulet'],
  },
  'malady-balanced': {
    desc: 'Wave-1 lesson applied to malady: alternate the plague with defense every purchase.',
    core: ['malady', 'amulet', 'malady', 'sword', 'malady', 'amulet',
      'ember', 'sword', 'ember'],
  },
  'cdr-balanced': {
    desc: 'The wave-1 king reordered: arcane and hourglass with an amulet/sword level between each — does the balanced ordering improve even double-cdr?',
    core: ['arcane', 'amulet', 'arcane', 'sword', 'hourglass', 'amulet',
      'arcane', 'sword', 'hourglass', 'amulet', 'hourglass'],
  },
  'midas-cdr': {
    desc: 'Economy into cadence: midas income buys the CDR stack faster than anyone else can.',
    core: ['midas', 'midas', 'midas', 'arcane', 'hourglass', 'arcane',
      'hourglass', 'arcane', 'hourglass'],
  },
  'mosquito-midas': {
    desc: 'Gold machine: a cashed trap lands 3 hits at once, so midas marks cash twice per armed+cashed pair (+2 g).',
    core: ['mosquito', 'midas', 'mosquito', 'midas', 'mosquito', 'midas',
      'amulet', 'sword', 'amulet'],
  },
  'frost-gale': {
    desc: 'Stack synergy bet: gale lv3 gust to throw them at the rim, frost lv3 freeze to keep them there.',
    core: ['gale', 'gale', 'gale', 'frost', 'frost', 'frost',
      'amulet', 'sword', 'amulet'],
  },
  'ember-tank': {
    desc: 'Minimal offense first, then the full turtle: one cheap damage dip before amulet/sword depth.',
    core: ['ember', 'ember', 'amulet', 'amulet', 'sword', 'amulet', 'sword', 'treads', 'ember'],
  },
  'vampire-cadence': {
    desc: 'Sustain through volume: vampire every-5th heals arrive faster under the CDR stack.',
    core: ['vampire', 'vampire', 'vampire', 'arcane', 'hourglass', 'arcane',
      'hourglass', 'arcane', 'amulet'],
  },
};

export function priorityList(name) {
  const s = STRATEGIES[name];
  if (!s) throw new Error(`unknown strategy: ${name}`);
  if (s.noExhaust) return [...s.core, ...s.core];
  return [...s.core, ...EXHAUST_PASS, ...EXHAUST_PASS, ...EXHAUST_PASS];
}

export function runStrategyStudy({
  games = 4000, seed = 1, kind = 'berserker', names = Object.keys(STRATEGIES),
  log = progress,
} = {}) {
  const wins = Object.fromEntries(names.map(n => [n, 0]));
  const played = Object.fromEntries(names.map(n => [n, 0]));
  const placeSum = Object.fromEntries(names.map(n => [n, 0]));
  const killSum = Object.fromEntries(names.map(n => [n, 0]));
  const goldSum = Object.fromEntries(names.map(n => [n, 0]));
  const rand = makeRng(seed);
  let unfinished = 0, finished = 0, lavaDeaths = 0, directDeaths = 0;
  const t0 = Date.now();
  for (let g = 0; g < games; g++) {
    const pool = [...names];
    const lineup = [];
    for (let i = 0; i < 4 && pool.length; i++) {
      const n = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      lineup.push({ id: n, kind, name: n, priorities: priorityList(n) });
    }
    const res = playGame(lineup, seed * 100000 + g, { mode: 'elemental' });
    if (!res.finished) { unfinished++; continue; }
    finished++;
    lavaDeaths += res.lavaDeaths; directDeaths += res.directDeaths;
    res.ranking.forEach((r, place) => {
      const n = lineup[r.idx].name;
      played[n]++; placeSum[n] += place + 1;
      killSum[n] += r.kills; goldSum[n] += r.gold;
      if (place === 0) wins[n]++;
    });
    if ((g + 1) % 500 === 0) log(`  ${g + 1}/${games} games (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  const table = names.map(n => ({
    strategy: n, games: played[n],
    winRate: played[n] ? wins[n] / played[n] : 0,
    avgPlace: played[n] ? placeSum[n] / played[n] : 0,
    avgKills: played[n] ? killSum[n] / played[n] : 0,
    avgGoldLeft: played[n] ? goldSum[n] / played[n] : 0,
  })).sort((a, b) => b.winRate - a.winRate);
  return {
    kind, games, finished, unfinished, seed,
    lavaShare: lavaDeaths / Math.max(1, lavaDeaths + directDeaths),
    seconds: (Date.now() - t0) / 1000, table,
  };
}

// ---- CLI --------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('strategy-study.js')) {
  const argNum = (name, dflt) => Number((process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || dflt);
  const argStr = (name, dflt) => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || dflt;
  if (process.argv.includes('--list')) {
    for (const [n, s] of Object.entries(STRATEGIES)) console.log(`${n.padEnd(18)} ${s.desc}`);
    process.exit(0);
  }
  const only = argStr('only', '');
  const names = only ? only.split(',') : Object.keys(STRATEGIES);
  const games = argNum('games', 4000);
  const seed = argNum('seed', 1);
  const kind = argStr('kind', 'berserker');
  console.error(`strategy study: ${names.length} strategies, ${games} games of 4 × ${kind}, elemental, seed ${seed}`);
  const res = runStrategyStudy({ games, seed, kind, names });
  console.log(`\n=== strategies: 4 identical ${kind} seats, full buy lists differ (baseline 25%) ===`);
  console.log('win%   avg-place  kills  gold-left  games  strategy');
  for (const r of res.table)
    console.log(`${(r.winRate * 100).toFixed(1).padStart(5)}  ${r.avgPlace.toFixed(2).padStart(9)}  ${r.avgKills.toFixed(1).padStart(5)}  ${r.avgGoldLeft.toFixed(1).padStart(9)}  ${String(r.games).padEnd(6)} ${r.strategy}`);
  console.log(`\nlava kill share: ${(res.lavaShare * 100).toFixed(1)}%   unfinished: ${res.unfinished}   ${res.seconds.toFixed(1)}s`);
  const jsonPath = argStr('json', '');
  if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify(res, null, 2));
}
