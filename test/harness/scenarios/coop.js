// Two scripted players plus a bot ally run the CO-OP CAMPAIGN against the
// simulation-spawned waves. This is the scenario that proves the mode survives
// a real server: mid-round monster spawns, rounds that end with the whole
// party alive, and the retry/advance flow.
export default {
  name: 'coop',
  seed: 31,
  timeoutMs: 180_000,
  bots: 1,
  players: [
    { name: 'Ally', script: ['mode coop', 'ready', 'auto 120'] },
    { name: 'Buddy', script: ['ready', 'auto 120'] },
  ],
  expect: { phaseReached: 'shop' },
};
