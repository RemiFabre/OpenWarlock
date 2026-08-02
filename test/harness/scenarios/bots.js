// One scripted player on autopilot against three server-spawned bots
// (the harness bot-client sends {t:'addBot'} without a kind, so they spawn
// as grunts). Exercises stepBot/botShop through a real server round.
export default {
  name: 'bots',
  seed: 21,
  timeoutMs: 180_000,
  bots: 3,
  players: [
    { name: 'Watcher', script: ['ready', 'auto 120'] },
  ],
  expect: { minDeaths: 3, phaseReached: 'shop' },
};
