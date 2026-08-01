// Adversarial kitchen sink: malformed messages, disconnects mid-round,
// late joins, shop spam — with two bots stirring the pot.
export default {
  name: 'chaos',
  seed: 1337,
  timeoutMs: 240_000,
  bots: 2,
  players: [
    { name: 'Fighter', script: ['ready', 'auto 150'] },
    {
      name: 'Gremlin',
      script: [
        'spam 30', 'ready', 'wait 5', 'spam 50', 'hunt 10',
        'disconnect', 'wait 4', 'reconnect', 'wait 2', 'ready',
        'spam 50', 'auto 60', 'spam 30', 'disconnect',
      ],
    },
    {
      name: 'Shopper',
      script: [
        'ready', 'wait 4',
        'buy fireball', 'buy fireball', 'buy fireball', 'buy fireball',
        'buy boots', 'buy sword', 'buy nonsense', 'buy 42',
        'hunt 20', 'flee 10', 'auto 100',
      ],
    },
    {
      name: 'Latecomer',
      script: ['wait 25', 'ready', 'auto 120'],
    },
  ],
  expect: { minDeaths: 2 },
};
