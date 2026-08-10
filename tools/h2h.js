// Head-to-head: does difficulty tier A actually beat tier B?
//
// The mixed Elo table in tools/arena.js compares strategies across many
// different lineups, which dilutes the tier question. This puts TWO seats of
// A directly against TWO seats of B in the same game, so "is ★★ really a step
// above ★" has a straight answer: each side's expected win share is 50%.
//
//   node tools/h2h.js berserker grunt
//   node tools/h2h.js --games=800 --build=warlord stalker berserker
//
// Used to calibrate the round-10 bot reaction-time pass: before it the ★★ beat
// the ★ 99.6% of the time (an execution machine), which is what made close-up
// duels feel unwinnable.

import { playGame } from './arena.js';
import { BOTS, BUILDS } from '../shared/constants.js';

const argOf = (name, dflt) =>
  (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || dflt;
const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
const [kindA, kindB] = [positional[0] || 'berserker', positional[1] || 'grunt'];
const games = Number(argOf('games', 800));
// round 21.8: `bruiser` was retired in 20.2 and this default made h2h throw
const build = argOf('build', 'warlord');
const seed = Number(argOf('seed', 500000));

for (const k of [kindA, kindB]) {
  if (!Object.hasOwn(BOTS, k)) {
    console.error(`unknown tier: ${k} (have: ${Object.entries(BOTS)
      .map(([key, b]) => `${key}=${b.label}`).join(', ')})`);
    process.exit(1);
  }
}
if (!Object.hasOwn(BUILDS, build)) {
  console.error(`unknown build: ${build} (have: ${Object.keys(BUILDS).join(', ')})`);
  process.exit(1);
}

const seat = (kind) => ({ id: `${kind}/${build}`, kind, build });
const stat = { [kindA]: { wins: 0, place: 0 }, [kindB]: { wins: 0, place: 0 } };
let finished = 0;

for (let g = 0; g < games; g++) {
  // alternate seat order so spawn position can't favour one side
  const lineup = g % 2 === 0
    ? [seat(kindA), seat(kindB), seat(kindA), seat(kindB)]
    : [seat(kindB), seat(kindA), seat(kindB), seat(kindA)];
  const res = playGame(lineup, seed + g);
  if (!res.finished) continue;
  finished++;
  res.ranking.forEach((r, place) => {
    const s = stat[lineup[r.idx].kind];
    s.place += place + 1;
    if (place === 0) s.wins++;
  });
}

console.log(`${finished}/${games} games finished · ${build} build · 2 seats each`);
console.log('win%   avg-place  tier                (each side is 2 of 4 seats: 50% is parity)');
for (const k of [kindA, kindB]) {
  const s = stat[k];
  const tier = `${BOTS[k].label} (${k})`;
  console.log(`${(100 * s.wins / finished).toFixed(1).padStart(5)}  ${(s.place / finished / 2).toFixed(2).padStart(9)}  ${tier}`);
}
