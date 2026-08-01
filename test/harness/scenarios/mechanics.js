// Targeted probe of suspicious mechanics, over a real server + WebSockets:
//   - shield reflect chains (two shielded players trading fireballs)
//   - boomerang owner disconnecting mid-flight
//   - teleport spam at the arena edge (into and out of lava)
//   - rush into a dying player
//   - both last players walking into lava together (near-simultaneous deaths)
//   - buying continuously across the shop -> countdown transition
// Exact same-tick timing (simultaneous deaths, boundary-tick buys) is pinned
// down deterministically in test/sim.test.js; this scenario exercises the
// same paths end-to-end with real sockets and checks global invariants.

const repeat = (cmd, n) => Array.from({ length: n }, () => cmd);

export default {
  name: 'mechanics',
  seed: 99,
  timeoutMs: 300_000,
  bots: 1,
  players: [
    {
      // reflect chains: both shield users stay center and trade fireballs
      name: 'ShieldA',
      script: [
        'buy shield', 'ready', 'wait 4',
        'cast shield at nearest', 'cast fireball at nearest',
        'center', 'cast fireball at nearest', 'wait 1',
        'cast fireball at nearest', 'cast shield at nearest',
        'hunt 8', 'auto 60',
      ],
    },
    {
      name: 'ShieldB',
      script: [
        'buy shield', 'ready', 'wait 4.2',
        'cast shield at nearest', 'cast fireball at nearest',
        'center', 'cast fireball at nearest', 'wait 1',
        'cast fireball at nearest', 'cast shield at nearest',
        'hunt 8', 'auto 60',
      ],
    },
    {
      // boomerang mid-flight disconnect: cast, then drop the socket 100 ms
      // later while the projectile is still on its outbound leg
      name: 'Boomer',
      script: [
        'buy boomerang', 'ready', 'wait 4.5',
        'cast boomerang at nearest',
        'disconnect', 'wait 2.5', 'reconnect', 'wait 1', 'ready',
        'auto 60',
      ],
    },
    {
      // rush into players that are already low (bots/duelists soften targets)
      name: 'Rusher',
      script: [
        'buy rush', 'ready', 'wait 4',
        'hunt 4', 'cast rush at nearest',
        'hunt 4', 'cast rush at nearest',
        'hunt 4', 'cast rush at nearest',
        'auto 60',
      ],
    },
    {
      // teleport spam at the arena edge: walk to the rim, blink outward into
      // lava, blink back, repeat; ends up testing lava death + round flow
      name: 'Blinker',
      script: [
        'buy teleport', 'ready', 'wait 4',
        'move 54 0', 'wait 3',
        'cast teleport at 90 0',
        'cast teleport at 90 0',
        'cast teleport at 90 0',
        'wait 1', 'cast teleport at 0 0', 'center', 'wait 2',
        'move -54 0', 'cast teleport at -90 0', 'center',
        'auto 60',
      ],
    },
    {
      // walks into lava alongside Blinker's shenanigans, and hammers `buy`
      // continuously for ~40 s so purchases land on the exact shop->countdown
      // boundary (and are denied cleanly during battle/countdown)
      name: 'Shopper',
      script: [
        'ready', 'wait 4', 'move 70 70',
        ...repeat('buy fireball', 200),
        ...repeat('buy boots', 100),
        ...repeat('buy amulet', 100),
        'auto 60',
      ],
    },
  ],
  expect: { minDeaths: 2, phaseReached: 'shop' },
};
