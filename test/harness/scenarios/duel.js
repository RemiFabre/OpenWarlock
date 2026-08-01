// Two players on autopilot fight a full game to the end.
export default {
  name: 'duel',
  seed: 7,
  timeoutMs: 480_000,
  players: [
    { name: 'Hunter', script: ['ready', 'auto 420'] },
    { name: 'Prey', script: ['ready', 'auto 420'] },
  ],
  expect: { minDeaths: 2, phaseReached: 'shop' },
};
