// Remi's exact reported setup: one human + three bots, played actively.
// Watches for the reported "freeze when a bot dies".
export default {
  name: 'remi-freeze',
  seed: 42,
  timeoutMs: 600_000,
  bots: 3,
  players: [
    { name: 'Remi', script: ['buy fireball', 'ready', 'auto 540'] },
  ],
  expect: { minDeaths: 3, phaseReached: 'shop' },
};
