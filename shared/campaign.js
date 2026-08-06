// The CO-OP CAMPAIGN — 10 levels of pure data.
//
// Design rule (deliberate, enforce it when you edit this file): a campaign
// enemy is an EXISTING bot kind (grunt ★ / berserker ★★ / stalker ★★★) running
// an EXISTING build, differing from a normal lobby bot only in
//   maxHp · spells · items · sizeMult · COUNT · arrival time.
// No new AI behaviour lives here or anywhere else for co-op. If a level needs
// something the roster can't express, change the numbers, not the code.
//
// Campaign level N *is* round N, which is why the client gets each level's
// background art, music track and title card for free (assets/manifest.json).
// Level 10 is the finale and plays the intro track (see client/coop.js).
//
// ---- party scaling ---------------------------------------------------------
// P = number of party members (humans and/or their bot stand-ins), 1..N.
// Every wave declares how it grows with the party:
//   scale: 'count' (default) — swarms bring MORE bodies:
//        count' = max(1, round(count * (1 + COUNT_PER_PLAYER * (P-1))))
//   scale: 'hp'             — elites/bosses get TOUGHER, never more numerous:
//        maxHp' = round(maxHp * (1 + HP_PER_PLAYER * (P-1)))
//   scale: 'both'           — half of each (a small pack of elites)
//   scale: 'none'           — fixed, whatever the party size
// Nothing else scales: their spells, items and AI tier are the level's
// signature and stay identical at 1, 2 or 3 players.

export const TEAM = { PARTY: 'party', AI: 'ai' };

// The colour every campaign enemy wears (party members keep the normal
// per-seat palette, so "red-black = monster" reads at a glance).
export const ENEMY_COLOR = '#8b1a1a';

export const SCALE = {
  COUNT_PER_PLAYER: 0.7,  // +70% bodies per extra party member
  HP_PER_PLAYER: 0.8,     // +80% hp per extra party member
};

// ---- unit templates --------------------------------------------------------
// Each is a normal bot with tuned stats. `spells` bypasses the shop's minRound
// gate on purpose (that is how the finale gets "every upgrade").

const IMP = {           // dies to a single fireball — the chaff
  name: 'Imp', avatar: '👺', kind: 'grunt', maxHp: 6, sizeMult: 0.7,
  spells: { fireball: 1 },
};
const HOUND = {         // fast, aggressive, still fragile
  name: 'Hound', avatar: '🐺', kind: 'berserker', maxHp: 45, sizeMult: 0.8,
  spells: { fireball: 1, rush: 1 },
};
const CULTIST = {       // ranged chip damage from the back line
  name: 'Cultist', avatar: '🧟', kind: 'grunt', maxHp: 70, sizeMult: 0.95,
  spells: { fireball: 2, lightning: 1 },
};
const SHADE = {         // ★★★ skirmisher: dodges, blinks, shields
  name: 'Shade', avatar: '👻', kind: 'stalker', maxHp: 90, sizeMult: 0.9,
  spells: { fireball: 2, teleport: 1, shield: 1 },
};
const BRUTE = {         // a wall you shove into the lava, not one you burn down
  name: 'Brute', avatar: '👹', kind: 'berserker', maxHp: 210, sizeMult: 1.5,
  spells: { fireball: 2, rush: 1 }, items: ['cape'],
};
const WARDEN = {        // tanky ★★★: kites, finishes, outlasts
  name: 'Warden', avatar: '🛡️', kind: 'stalker', maxHp: 170, sizeMult: 1.25,
  spells: { fireball: 2, lightning: 2, teleport: 1, shield: 1 }, items: ['ring'],
};
const CHAMPION = {      // the finale: one enemy with the whole shop
  name: 'Sargeras', avatar: '😈', kind: 'stalker', maxHp: 320, sizeMult: 1.8,
  spells: { fireball: 3, lightning: 3, boomerang: 3, teleport: 2, shield: 2, rush: 2 },
  items: ['boots', 'boots', 'cape', 'cape', 'ring', 'ring', 'sword', 'sword', 'treads'],
};

const u = (tpl, over) => ({ ...tpl, ...over });

// ---- the 10 levels ---------------------------------------------------------
// `brief` is the "here is what is about to happen" the client shows on the
// countdown, before the party has to deal with it.

export const CAMPAIGN = [
  {
    n: 1, name: 'What lies ahead?',
    brief: 'A scouting party of imps. One hit each — warm up and read the arena.',
    waves: [{ count: 3, unit: IMP }],
  },
  {
    n: 2, name: 'Forward.',
    brief: 'More imps, and a cultist lobbing fire from the back. Kill the caster or eat the chip damage.',
    waves: [
      { count: 4, unit: IMP },
      { count: 1, unit: CULTIST, scale: 'hp' },
    ],
  },
  {
    n: 3, name: 'Locked in.',
    brief: 'Hounds. They rush you, they shove, and they do not stop. Keep your back to the middle.',
    waves: [
      { count: 2, unit: HOUND },
      { count: 2, unit: IMP, at: 8 },
    ],
  },
  {
    n: 4, name: 'Too much?',
    brief: 'A tide in three chains: imps now, imps at 12 s, imps at 24 s. Do not chase — hold the centre.',
    waves: [
      { count: 4, unit: IMP },
      { count: 4, unit: IMP, at: 12 },
      { count: 4, unit: IMP, at: 24 },
      { count: 1, unit: CULTIST, scale: 'hp' },
    ],
  },
  {
    n: 5, name: 'Too late.',
    brief: 'A Brute. 210 HP of muscle you will not out-damage — knock it into the lava.',
    waves: [
      { count: 1, unit: BRUTE, scale: 'hp' },
      { count: 3, unit: IMP, at: 10 },
    ],
  },
  {
    n: 6, name: 'The price.',
    brief: 'Two Shades: they dodge, they blink, they shield the shot you aimed. Bait a dodge for your partner.',
    waves: [
      { count: 2, unit: SHADE, scale: 'both' },
      { count: 3, unit: IMP, at: 14 },
    ],
  },
  {
    n: 7, name: 'Still standing.',
    brief: 'A Warden with a hound escort. It kites and finishes the wounded — focus it down together.',
    waves: [
      { count: 1, unit: WARDEN, scale: 'hp' },
      { count: 2, unit: HOUND },
      { count: 3, unit: IMP, at: 18 },
    ],
  },
  {
    n: 8, name: 'Of course.',
    brief: 'A Brute AND a pack of hounds, with imps rolling in on a timer. The arena will be small by then.',
    waves: [
      { count: 1, unit: BRUTE, scale: 'hp' },
      { count: 3, unit: HOUND },
      { count: 4, unit: IMP, at: 16 },
    ],
  },
  {
    n: 9, name: 'Endure.',
    brief: 'Two Wardens and a Brute. Nothing here dies quickly. Combo, or be surrounded.',
    waves: [
      { count: 2, unit: WARDEN, scale: 'both' },
      { count: 1, unit: BRUTE, scale: 'hp' },
      { count: 4, unit: IMP, at: 20 },
    ],
  },
  {
    n: 10, name: 'Liberation.',
    brief: 'Sargeras: one enemy carrying every upgrade in the game, twice your size, with a bodyguard. Everything you have learned, at once.',
    waves: [
      { count: 1, unit: CHAMPION, scale: 'hp' },
      { count: 2, unit: SHADE, scale: 'count' },
      { count: 4, unit: IMP, at: 15 },
      { count: 4, unit: IMP, at: 30 },
    ],
  },
];

export const MAX_LEVEL = CAMPAIGN.length;

// Level descriptor for round n (clamped: past the last level the finale repeats).
export function levelFor(n) {
  const i = Math.min(Math.max(1, n | 0), CAMPAIGN.length) - 1;
  return CAMPAIGN[i];
}

// Expand a level into the flat list of units to spawn, applying the party
// scaling rule above. Returns [{at, name, avatar, kind, build, maxHp, spells,
// items, sizeMult}] — `at` is battle time in seconds (0 = at round start).
export function waveUnits(level, partySize) {
  const p = Math.max(1, partySize | 0);
  const out = [];
  for (const w of level.waves) {
    const mode = w.scale || 'count';
    const cShare = mode === 'count' ? 1 : mode === 'both' ? 0.5 : 0;
    const hShare = mode === 'hp' ? 1 : mode === 'both' ? 0.5 : 0;
    const count = Math.max(1, Math.round(
      (w.count || 1) * (1 + SCALE.COUNT_PER_PLAYER * cShare * (p - 1))));
    const maxHp = Math.round(
      w.unit.maxHp * (1 + SCALE.HP_PER_PLAYER * hShare * (p - 1)));
    for (let i = 0; i < count; i++) {
      out.push({
        at: w.at || 0,
        name: w.unit.name, avatar: w.unit.avatar, kind: w.unit.kind,
        build: w.unit.build || null,
        maxHp, sizeMult: w.unit.sizeMult || 1,
        spells: { ...w.unit.spells },
        items: [...(w.unit.items || [])],
      });
    }
  }
  return out;
}

// One-line summary of what a level throws at a party of `partySize`, e.g.
// "4× Imp · 1× Cultist (120 hp) · +4× Imp @12s". Used by the client brief and
// by tools/coop.js.
export function levelRoster(level, partySize) {
  const units = waveUnits(level, partySize);
  const groups = [];
  for (const un of units) {
    const key = `${un.name}|${un.maxHp}|${un.at}`;
    const g = groups.find(x => x.key === key);
    if (g) g.n++;
    else groups.push({ key, n: 1, ...un });
  }
  return groups.map(g =>
    `${g.at ? '+' : ''}${g.n}× ${g.name} (${g.maxHp} hp)${g.at ? ` @${g.at}s` : ''}`
  ).join(' · ');
}

export { IMP, HOUND, CULTIST, SHADE, BRUTE, WARDEN, CHAMPION };
