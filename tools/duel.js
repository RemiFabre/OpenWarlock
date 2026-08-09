// Duel lab: what is an UPGRADE PATH worth at a given point in the game?
//
// The mixed table asks "which element wins a whole 15-kill game"; this asks
// the sharper question Remi wanted (2026-08-08): two identical Hard bots,
// 1v1, SAME gold budget spent down two different priority lists, fight to
// the first death. Repeated over seeds and both seat orders. No round
// economy, no comeback machinery — pure "is this kit worth its gold".
//
// How to read the output (report rule: defined AT the table):
//   win% = share of that pair's duels this archetype won; 50% = the two kits
//   are equally good at that budget. Draws (nobody dead in 90 s sim time)
//   are excluded from win% and reported separately. TTK = median seconds to
//   the kill. Baseline vs FIELD = mean win% across all its pairings.
//
// What this lab CANNOT see: multi-enemy dynamics (malady's contagion, gale
// ring-outs into a crowd), round-to-round economy, and human dodging — bot
// duels overprice raw dps and underprice aim/utility. Anger's claimed marks
// are an INPUT here (stated per stage), not earned in the duel.
//
//   node tools/duel.js --games=60 --seed=1        (~5 min)
//   node tools/duel.js --stage=late --only=anger,ember

import {
  createGame, addPlayer, startGame, step, stepBot, buy,
} from '../shared/sim.js';
import { ROUND } from '../shared/constants.js';

const DT = 1 / 30;
const arg = (n, d) => {
  const a = process.argv.find(x => x.startsWith(`--${n}=`));
  return a ? a.split('=')[1] : d;
};

// An archetype = a priority list, walked in repeated passes; each entry buys
// ONE level per pass when affordable. The stage budget is all it ever gets.
export const ARCHETYPES = {
  ember:     ['ember', 'ember', 'ember', 'amulet', 'sword', 'boots'],
  cadence:   ['arcane', 'arcane', 'hourglass', 'hourglass', 'hourglass', 'amulet'],
  anger:     ['anger', 'anger', 'anger', 'terra', 'amulet', 'sword'],
  malady:    ['malady', 'malady', 'malady', 'terra', 'amulet', 'sword'],
  mosquito:  ['mosquito', 'mosquito', 'mosquito', 'amulet', 'sword', 'boots'],
  vampire:   ['vampire', 'vampire', 'vampire', 'sword', 'amulet', 'boots'],
  tank:      ['amulet', 'amulet', 'amulet', 'ember', 'sword', 'treads'],
  lifesteal: ['sword', 'sword', 'sword', 'ember', 'amulet', 'boots'],
};

// Stage = total gold ever earned by that point, plus anger's claimed marks
// (untuned guesses off the mark cadence — a lv3 hunter claims a few per round;
// bonus-equivalent to the old momentum stages: +1 / +4 / +9 dmg).
export const STAGES = {
  early: { gold: 20, angerMarks: 2 },
  mid:   { gold: 60, angerMarks: 8 },
  late:  { gold: 110, angerMarks: 18 },
};

function spend(state, id, list, budget) {
  const pl = state.players[id];
  pl.gold = budget;
  for (let pass = 0; pass < 12; pass++) {
    let bought = false;
    for (const thing of list) {
      if (buy(state, id, thing).ok) bought = true;
    }
    if (!bought) break;
  }
}

function duel(nameA, nameB, stage, seed) {
  const state = createGame({ seed, mode: 'elemental' });
  addPlayer(state, 'a', nameA, { bot: true, kind: 'berserker' });
  addPlayer(state, 'b', nameB, { bot: true, kind: 'berserker' });
  startGame(state);
  for (let i = 0; i < Math.round((ROUND.COUNTDOWN + DT) / DT); i++) step(state, DT);
  state.phase = 'shop';
  spend(state, 'a', ARCHETYPES[nameA], STAGES[stage].gold);
  spend(state, 'b', ARCHETYPES[nameB], STAGES[stage].gold);
  state.players.a.angerMarks = nameA === 'anger' ? STAGES[stage].angerMarks : 0;
  state.players.b.angerMarks = nameB === 'anger' ? STAGES[stage].angerMarks : 0;
  step(state, DT); // both are bots => everyone ready => the round starts
  let t = 0;
  while (t < 90) {
    step(state, DT);
    if (state.phase === 'battle')
      for (const id of ['a', 'b']) stepBot(state, id, DT);
    t += DT;
    const a = state.players.a, b = state.players.b;
    if (!a.alive || !b.alive) return { winner: !a.alive ? nameB : nameA, t };
  }
  return { winner: null, t };
}

const games = Number(arg('games', 60));
const seed0 = Number(arg('seed', 1));
const onlyArg = arg('only', '');
const stageArg = arg('stage', '');
const names = onlyArg ? onlyArg.split(',') : Object.keys(ARCHETYPES);
const stages = stageArg ? [stageArg] : Object.keys(STAGES);

for (const stage of stages) {
  const { gold, angerMarks } = STAGES[stage];
  console.log(`\n=== ${stage.toUpperCase()} — both duelists spend the SAME ${gold} g down different lists` +
    ` (anger enters with ${angerMarks} claimed marks, stage guess) ===`);
  console.log('win% = share of decided duels won (50 = equal kits); vs FIELD = mean across pairings');
  const wins = {}, ttks = {}, draws = { n: 0, total: 0 };
  for (const n of names) { wins[n] = {}; ttks[n] = []; }
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const A = names[i], B = names[j];
      let a = 0, b = 0;
      for (let g = 0; g < games; g++) {
        // alternate seat order so seat-1's spawn/aim quirks cancel out
        const flip = g % 2 === 1;
        const r = duel(flip ? B : A, flip ? A : B, stage, seed0 + g * 7 + i * 131 + j * 17);
        draws.total++;
        if (!r.winner) { draws.n++; continue; }
        if (r.winner === A) a++; else b++;
        ttks[r.winner].push(r.t);
      }
      wins[A][B] = a / Math.max(1, a + b);
      wins[B][A] = b / Math.max(1, a + b);
    }
  }
  const med = (xs) => xs.length ? xs.sort((x, y) => x - y)[Math.floor(xs.length / 2)] : NaN;
  const rows = names.map(n => {
    const vs = names.filter(o => o !== n).map(o => wins[n][o]);
    return { n, field: vs.reduce((s, v) => s + v, 0) / vs.length, ttk: med(ttks[n]) };
  }).sort((x, y) => y.field - x.field);
  console.log(['archetype'.padEnd(11), 'vs FIELD', 'median TTK'].join('  '));
  for (const r of rows)
    console.log([r.n.padEnd(11), `${(r.field * 100).toFixed(1).padStart(7)}%`,
      `${r.ttk.toFixed(1).padStart(9)} s`].join('  '));
  console.log('pairwise win% (row beats column):');
  console.log(''.padEnd(11) + names.map(n => n.slice(0, 6).padStart(7)).join(''));
  for (const n of names)
    console.log(n.padEnd(11) + names.map(o =>
      o === n ? '      —' : `${(wins[n][o] * 100).toFixed(0).padStart(6)}%`).join(''));
  if (draws.n) console.log(`draws (no kill in 90 s): ${draws.n}/${draws.total}`);
}
