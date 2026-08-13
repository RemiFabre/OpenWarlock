// Trash Talk (issue #4): the warlocks comment on the fight.
//
// Purely cosmetic and purely client-side; this file reads the same event
// stream the FX already run on and turns it into speech bubbles. Nothing here
// touches the simulation, the wire or a bot brain.
//
// Two rules from the request:
//  - the CASE is the intensity: lower for the ordinary, CAPS for the loud;
//  - common things speak stochastically (`p`), rare things ALWAYS speak
//    (`p: 1` + `rare: true`, which also exempts them from the per-speaker
//    cooldown, so a mine going off is never eaten by an "ouch" from a moment
//    earlier).

const BUBBLE_MS = 2100;      // how long one bubble hangs over a head
const SPEAKER_GAP_MS = 2600; // an ordinary line needs this much silence first
const MAX_BUBBLES = 12;      // hard cap, so a massacre cannot flood the canvas

// A "big push" is measured from how far a body actually travelled between two
// snapshots, not from whatever hit it; any shove this fast earns the line.
const FLY_SPEED = 34;        // units/second
const FLY_GAP_MS = 3500;

const pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];

// Global damper on every line, rare ones included (Remi round 23: "a bit too
// common"). 1 restores the issue-4 frequencies.
const FREQ = 0.5;

// The lines. Each entry: what is said, how likely, and whether it shouts.
// ⚠ Remi (second pass): keep them SHORT (a long line eats the arena). Nothing
// here goes past ~14 characters.
// `rare: true` means "must not be missed": always said, never rate-limited.
const LINES = {
  hitSmall:   { p: 0.10, lines: ['ouch', 'hey', 'tsk', 'rude', 'ow', 'stop it'] },
  hitMedium:  { p: 0.35, lines: ['OUCH', 'ow ow', "I'll remember", 'seriously?', 'not cool'] },
  hitBig:     { p: 1, rare: true, lines: ['OUCH', 'AAAH', 'WHY', 'MY BONES'] },
  dealtBig:   { p: 1, rare: true, lines: ['sorry hehe', 'hehe', 'my bad', 'oops', 'that one hurt'] },
  dealtNice:  { p: 0.30, lines: ['hehe', 'nice', 'gotcha', 'tap tap'] },
  watchBig:   { p: 0.55, lines: ['wtf?', 'is he dead?', 'brutal', 'oooohhh', 'monster'] },
  fly:        { p: 1, rare: true, lines: ['I CAN FLYYY', 'WHEEEEE', 'BYE', 'SO LONG'] },
  lava:       { p: 0.25, lines: ['hot hot hot', 'ow ow ow', 'bad idea', 'just a swim'] },
  died:       { p: 1, rare: true, lines: ['welp', 'rip me', 'unlucky', 'my fault'] },
  killed:     { p: 1, rare: true, lines: ['hehe', 'gg', 'get gud', 'one down'] },
  watchDeath: { p: 0.45, lines: ['oooohhh', 'rip', 'poor guy', 'better him'] },
  multikill:  { p: 1, rare: true, lines: ['HAHAHA', 'UNSTOPPABLE', 'WHO ELSE'] },
  watchMulti: { p: 1, rare: true, lines: ['WHAT', 'OOOOH', 'STOP HIM'] },
  // one per shop thing, so every purchase eventually says something
  reflect:    { p: 1, rare: true, lines: ['nope', 'no thanks', 'send it back'] },
  gale:       { p: 1, rare: true, lines: ['WOOOOSH', 'THE WIND', 'NOT AGAIN'] },
  frost:      { p: 0.55, lines: ['brrr', 'cold cold cold', "can't move"] },
  infected:   { p: 0.40, lines: ['eww', 'I feel sick', 'contagious?'] },
  anger:      { p: 0.50, lines: ["you're mine", 'found you', 'run'] },
  midas:      { p: 0.40, lines: ['cha-ching', 'money money', 'payday'] },
  drain:      { p: 0.35, lines: ['yum', 'tasty', 'delicious'] },
  refund:     { p: 0.30, lines: ['again!', 'and again', 'no cooldown'] },
  meteor:     { p: 0.7, rare: true, lines: ['NOT THE ROCK', 'FROM THE SKY?', 'LOOK OUT'] },
  bolt:       { p: 0.7, rare: true, lines: ['NOT AGAIN', 'ZAP', 'SAW IT COMING'] },
  mined:      { p: 1, rare: true, lines: ['hehe', 'right on cue', 'told you'] },
  swapped:    { p: 1, rare: true, lines: ['wait what?', 'hey!', 'wrong side', 'wrong place'] },
  statue:     { p: 0.60, lines: ['nope', 'not today', 'stone mode'] },
  decoy:      { p: 0.50, lines: ['which one?', 'good luck', 'hello hello'] },
  vanish:     { p: 0.50, lines: ['poof', 'bye', 'invisible'] },
  blink:      { p: 0.30, lines: ['zoom', 'over here', 'nice try'] },
  catch:      { p: 0.60, lines: ['nice catch', 'mine again', 'still got it'] },
  pillarGone: { p: 1, rare: true, lines: ['MY PILLAR', 'MY COVER', 'RUDE'] },
  repulse:    { p: 1, rare: true, lines: ['GET OUT', 'EVERYBODY OUT', 'PERSONAL SPACE'] },
  roundStart: { p: 0.35, lines: ["let's go", 'here we go', 'my round', 'good luck'] },
};

// Damage bands. Below SMALL nothing is worth a word; above BIG everyone
// reacts (victim, sender, bystanders); Remi's three-sided example.
const DMG_MEDIUM = 9;
const DMG_BIG = 20;

export function createChatter(rng = Math.random) {
  const bubbles = [];          // {id, text, at, until}
  const lastSpoke = new Map(); // playerId -> ms
  const lastFly = new Map();
  let lastLavaSweep = 0;

  function say(id, key, now) {
    const spec = LINES[key];
    if (!spec || id == null) return;
    if (!spec.rare) {
      if (rng() > spec.p * FREQ) return;
      if (now - (lastSpoke.get(id) || -Infinity) < SPEAKER_GAP_MS) return;
    } else if (rng() > spec.p * FREQ) return;
    lastSpoke.set(id, now);
    // one bubble per speaker: a new line replaces the old, never stacks on it
    const i = bubbles.findIndex(b => b.id === id);
    if (i >= 0) bubbles.splice(i, 1);
    bubbles.push({ id, text: pick(spec.lines, rng), at: now, until: now + BUBBLE_MS });
    if (bubbles.length > MAX_BUBBLES) bubbles.shift();
  }

  // Everyone who is not the victim and not the attacker, so a loud moment gets
  // its audience. `visible` keeps an invisible player silent.
  function crowd(players, exclude) {
    return players.filter(p => p && p.alive && !exclude.includes(p.id));
  }

  return {
    bubbles,

    // One event from the server. `players` is the current snapshot roster (an
    // array), used for bystanders and to check who is actually on screen.
    onEvent(e, players, now) {
      const visible = (id) => {
        const p = players.find(q => q && q.id === id);
        return !!(p && p.alive && Number.isFinite(p.x));
      };
      switch (e.t) {
        case 'hit': {
          const dmg = +e.amount || 0;
          if (dmg < 1) return;
          if (visible(e.id)) say(e.id, dmg >= DMG_BIG ? 'hitBig' : dmg >= DMG_MEDIUM ? 'hitMedium' : 'hitSmall', now);
          // the sender answers their own work, but never from stealth, which
          // would hand the whole table a vanished player's identity
          if (e.src != null && e.src !== e.id && visible(e.src))
            say(e.src, dmg >= DMG_BIG ? 'dealtBig' : dmg >= DMG_MEDIUM ? 'dealtNice' : null, now);
          if (dmg >= DMG_BIG)
            for (const p of crowd(players, [e.id, e.src])) say(p.id, 'watchBig', now);
          return;
        }
        case 'death':
          say(e.id, 'died', now);
          if (e.killer && e.killer !== e.id) say(e.killer, 'killed', now);
          for (const p of crowd(players, [e.id, e.killer])) say(p.id, 'watchDeath', now);
          return;
        case 'multikill':
          say(e.id, 'multikill', now);
          for (const p of crowd(players, [e.id])) say(p.id, 'watchMulti', now);
          return;
        case 'reflect': say(e.id, 'reflect', now); return;
        case 'galeBurst': say(e.id, 'gale', now); return;
        case 'frost': case 'frostBreak': say(e.id, 'frost', now); return;
        case 'infected': say(e.id, 'infected', now); return;
        // the hunter and the coin-stamper talk, not the thing they marked
        case 'angerClaim': say(e.by, 'anger', now); return;
        case 'midasMark': say(e.by, 'midas', now); return;
        case 'lifesteal': say(e.id, 'drain', now); return;
        case 'refund': say(e.id, 'refund', now); return;
        // the sky drops carry no id; whoever is standing near the crater
        // reacts, which is what makes them read as an event
        case 'meteorHit': case 'boltHit': {
          const key = e.t === 'meteorHit' ? 'meteor' : 'bolt';
          const r = (+e.r || 0) + 4;
          for (const p of players)
            if (p && p.alive && Number.isFinite(p.x) && Math.hypot(p.x - e.x, p.y - e.y) <= r)
              say(p.id, key, now);
          return;
        }
        // `id` on a mineHit is the TRAPPER: the victim's own line arrives with
        // the damage a moment later
        case 'mineHit': say(e.id, 'mined', now); return;
        case 'swapped': say(e.a, 'swapped', now); say(e.b, 'swapped', now); return;
        case 'statueUp': say(e.id, 'statue', now); return;
        case 'decoyUp': say(e.id, 'decoy', now); return;
        case 'vanish': say(e.id, 'vanish', now); return;
        case 'teleport': say(e.id, 'blink', now); return;
        case 'catch': say(e.id, 'catch', now); return;
        case 'pillarBroken': for (const p of crowd(players, [])) say(p.id, 'pillarGone', now); return;
        case 'repulse': say(e.id, 'repulse', now); return;
        case 'round': for (const p of crowd(players, [])) say(p.id, 'roundStart', now); return;
        default: return;
      }
    },

    // Called once a frame with the two most recent snapshots: the things no
    // event announces: being launched across the arena, and swimming.
    onFrame(players, prev, dtSec, now) {
      if (!players || !prev || !(dtSec > 0)) return;
      for (const p of players) {
        if (!p || !p.alive || !Number.isFinite(p.x)) continue;
        const was = prev.find(q => q && q.id === p.id);
        if (was && Number.isFinite(was.x)) {
          const speed = Math.hypot(p.x - was.x, p.y - was.y) / dtSec;
          if (speed >= FLY_SPEED && now - (lastFly.get(p.id) || -Infinity) > FLY_GAP_MS) {
            lastFly.set(p.id, now);
            say(p.id, 'fly', now);
          }
        }
        if (p.inLava && now - lastLavaSweep > SPEAKER_GAP_MS) say(p.id, 'lava', now);
      }
      if (now - lastLavaSweep > SPEAKER_GAP_MS) lastLavaSweep = now;
      for (let i = bubbles.length - 1; i >= 0; i--)
        if (bubbles[i].until <= now) bubbles.splice(i, 1);
    },

    clear() { bubbles.length = 0; lastSpoke.clear(); lastFly.clear(); },
  };
}
