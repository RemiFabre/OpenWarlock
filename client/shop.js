// The shop: every number it shows, the hover tooltip that explains them, the
// card grid itself and the draft banner. Extracted from main.js in round 23.
//
// Imports ui.js and keys.js only (plus the spec and sfx), never main.js, so the
// client's dependency graph stays one-way: ui -> keys -> shop -> main.
// `send` is INJECTED by initShop() rather than imported, which is what keeps
// this module below main.js in that order instead of beside it.
//
// EVERY number here is read out of shared/constants.js at runtime. The balance
// pass that changes SPELLS/ELEMENTS/ITEMS/ITEM_FX changes the UI in the same
// commit; a hardcoded tooltip would be a lie within a week.

import {
  SPELLS, ITEMS, ITEM_FX, ELEMENTS, PLAYER, LAVA, itemCost,
} from '../shared/constants.js';
import { itemFxAt } from '../shared/items.js';
import { $, fin, ICONS, esc, toast, fmtNum } from './ui.js';
import { keyLabel, keyOf, openRebind } from './keys.js';
import { playSfx } from './sfx.js';

let send = () => {};

// Browse-only shop (round 22): the same grid straight from the lobby. Buying
// stays phase-gated, so the buy handlers check this flag. main.js drives it
// (setPreview) and does the surrounding DOM work; the flag lives HERE because
// this is the only place that reads it per click.
let shopPreview = false;
export const isPreview = () => shopPreview;
export function setPreview(on) { shopPreview = on; }

// ---- number formatting ------------------------------------------------------

const fmtSec = (v) => (+v ? `${fmtNum(v)} s` : '·');
// Multipliers read as the change they make: 0.85 is "−15%", 1 is "no effect".
function fmtMult(v) {
  const n = +v;
  if (!fin(n)) return String(v);
  if (Math.abs(n - 1) < 1e-9) return '·';
  const d = Math.round((n - 1) * 1000) / 10;
  return `${d > 0 ? '+' : '−'}${fmtNum(Math.abs(d))}%`;
}
const fmtGold = (v) => (+v > 0 ? `${fmtNum(v)} g` : 'free');

// label + formatter per known field; anything unknown still prints (raw key,
// raw value) so a newly added constant shows up instead of vanishing.
const SPELL_FIELDS = {
  // genki (issue #12, reworked: levels buy the damage cap, the rate is flat)
  dmgPerSec: ['damage grows', (v) => `+${fmtNum(v)}/s`],
  dmgCap: ['damage cap', fmtNum],
  unstoppableAfter: ['unstoppable, after the smash stage +', fmtSec],
  damage: ['damage', fmtNum],
  knockback: ['knockback', fmtNum],
  cooldown: ['cooldown', fmtSec],
  range: ['range', fmtNum],
  speed: ['projectile speed', (v) => `${fmtNum(v)} u/s`],
  radius: ['hit radius', fmtNum],
  width: ['beam width', fmtNum],
  duration: ['duration', fmtSec],
  distance: ['dash distance', fmtNum],
  hitRadius: ['dash hit radius', fmtNum],
  outDistance: ['throw distance', fmtNum],
  charge: ['charge time', fmtSec],
  delay: ['impact delay', fmtSec],
  length: ['wall length', fmtNum],
  clones: ['copies of you', fmtNum],
  stores: ['fireballs it stores', fmtNum],
  ballDelay: ['stored balls fire', (v) => `${fmtSec(v)} apart`],
  repay: ['repay after', fmtSec],
};
// `stun` is skipped here because it is not a per-level array but the RECIPE the
// sim evaluates at resolution ({pad, min}); spellTip prints the two readings a
// player can act on instead (round 20.5).
const SPELL_SKIP = new Set(['name', 'hotkey', 'maxLevel', 'costs', 'desc', 'long', 'tier', 'minRound', 'stun',
  // genki (issue #12): the growth formula's internals; `long` tells the story
  'smashR', 'calibT', 'kbBase']);
// element fx whose array is NOT per-level (tierHits columns are tiers);
// their reading lives in another row's label instead. markDelay and
// rampPermanent are display-only trims (Remi, round 19.4: those anger rows
// "don't add information"); the sim still reads them from the spec.
const ELEM_FX_SKIP = new Set(['tierHits', 'markDelay', 'rampPermanent']);

const FX_FIELDS = {
  dmgAdd: ['fireball damage', (v) => `+${fmtNum(v)}`],
  kbAdd: ['fireball push', (v) => `+${fmtNum(v)}`],
  dmgMult: ['fireball damage', fmtMult],
  kbMult: ['fireball push', fmtMult],
  haste: ['fireball haste', (v) => `+${fmtNum(v)}`],
  cdMult: ['fireball haste', (v) => `+${fmtNum(Math.round((1 / v - 1) * 100))}%`],
  projRadiusMult: ['fireball size', fmtMult],
  projSpeedMult: ['fireball speed', fmtMult],
  stacksToTrigger: ['stacks to detonate', fmtNum],
  burstKbMult: ['the gust pushes', fmtMult],   // dormant: pre-round-19 revert path
  burstKbAdd: ['the gust adds', (v) => `+${fmtNum(v)} push`],
  hitRefund: ['fireball hit refunds', (v) => (+v > 0 ? `−${fmtSec(v)} off every cooldown` : '·')],
  pierceAtLevel: ['passthrough unlocks at', (v) => `lv ${fmtNum(v)}`],
  slowMult: ['victim speed', fmtMult],
  slowT: ['slow lasts', fmtSec],
  stunT: ['stun lasts', fmtSec],
  tickDmg: ['damage per tick', fmtNum],
  dotTime: ['sickness lasts', fmtSec],
  tickEvery: ['ticks every', fmtSec],
  auraR: ['contagion radius', fmtNum],
  goldOnHit: ['gold per cashed mark', (v) => `+${fmtNum(v)} g`],
  markEvery: ['a mark appears every', fmtSec],
  markDmg: ['each claimed mark', (v) => `+${fmtNum(v)} dmg, forever`],
  chargeEvery: ['engorged ball', (v) => `every ${fmtNum(v)}th cast`],
  chargeHeal: ['engorged ball heals', (v) => `${fmtNum(v)} hp on landing`],
  cdFloor: ['a refund never goes below', fmtSec],
  pierce: ['your fireball (at lv 3)', (v) => (v ? 'passes THROUGH bodies' : 'pops on the first body')],
  doubleEvery: ['your fireball fires as a pair', (v) => `every ${fmtNum(v)}th cast`],
  trailDelay: ['the second ball leaves', (v) => `${fmtSec(v)} later`],
};

// Item fx fields, same shape as SPELL_FIELDS/FX_FIELDS. There is no
// "how do copies compound" column any more: ITEM_FX holds ABSOLUTE CUMULATIVE
// totals per level, so the array IS the row (see shared/items.js).
const ITEM_FIELDS = {
  speedMult: ['move speed', fmtMult],
  lavaMult: ['lava damage taken', fmtMult],
  kbMult: ['knockback taken', fmtMult],
  maxHp: ['max HP', (v) => `+${fmtNum(v)}`],
  lifesteal: ['lifesteal', (v) => `${fmtNum(Math.round(v * 1000) / 10)}%`],
  haste: ['ability haste', (v) => `+${fmtNum(v)}`],
  auraDps: ['burn damage', (v) => `${fmtNum(v)}/s`],
  auraR: ['burn radius', fmtNum],
  linger: ['keeps burning for', fmtSec],
  healOnHit: ['heal per enemy hit', (v) => `+${fmtNum(v)} hp`],
  tickFrac: ['burns & sickness heal', (v) => `${fmtNum(Math.round(v * 100))}% of that, max 1/s`],
};

// What the level you own actually bought, as a plain sentence. The maths lives
// in itemFxAt(); only the wording is here. Deliberately recomputed from ITEM_FX
// instead of read off the snapshot's effective stats: those also carry the
// transient modifiers (the shop opens while you are still standing in lava at
// double speed, with regen still locked), which would read as a lie on a shop
// button.
const ITEM_LIVE = {
  boots: (lv) => `you move at ${fmtNum(PLAYER.SPEED * itemFxAt('boots', 'speedMult', lv))} u/s (base ${fmtNum(PLAYER.SPEED)})`,
  treads: (lv) => `lava burns you for ${fmtNum(LAVA.DPS * itemFxAt('treads', 'lavaMult', lv))} hp/s (base ${fmtNum(LAVA.DPS)})`,
  amulet: (lv) => `you have ${fmtNum(PLAYER.MAX_HP + itemFxAt('amulet', 'maxHp', lv))} max HP (base ${fmtNum(PLAYER.MAX_HP)})`,
  cape: (lv) => `you take ×${fmtNum(itemFxAt('cape', 'kbMult', lv))} knockback`,
  sword: (lv) => `you heal ${fmtNum(Math.round(itemFxAt('sword', 'lifesteal', lv) * 1000) / 10)}% of the damage you deal`,
  hourglass: (lv) => `all your cooldowns run at ×${fmtNum(Math.round(100 / (1 + itemFxAt('hourglass', 'haste', lv) / 100)) / 100)}`,
  brazier: (lv) => `enemies within ${fmtNum(itemFxAt('brazier', 'auraR', lv))} units of you burn for ${fmtNum(itemFxAt('brazier', 'auraDps', lv))} hp/s, and keep burning ${fmtNum(itemFxAt('brazier', 'linger', lv))} s after they leave`,
  spoon: (lv) => `every enemy you damage heals you ${fmtNum(itemFxAt('spoon', 'healOnHit', lv))} hp, and ${fmtNum(itemFxAt('spoon', 'healOnHit', lv) * ITEM_FX.spoon.tickFrac)} per burn or sickness tick`,
};

// The card's stat tag (round 20.1, Remi): ONE short value, not a sentence;
// the totals at the level you'd buy (ITEM_FX arrays are cumulative), repainted
// by refresh(); at max level it reads as the totals you own.
const ITEM_TAG = {
  boots: (lv) => `+${fmtNum(Math.round((itemFxAt('boots', 'speedMult', lv) - 1) * 100))}% speed`,
  treads: (lv) => `−${fmtNum(Math.round((1 - itemFxAt('treads', 'lavaMult', lv)) * 100))}% lava dmg`,
  amulet: (lv) => `+${fmtNum(itemFxAt('amulet', 'maxHp', lv))} max HP`,
  cape: (lv) => `−${fmtNum(Math.round((1 - itemFxAt('cape', 'kbMult', lv)) * 100))}% knockback`,
  sword: (lv) => `${fmtNum(Math.round(itemFxAt('sword', 'lifesteal', lv) * 100))}% lifesteal`,
  hourglass: (lv) => `+${fmtNum(itemFxAt('hourglass', 'haste', lv))} haste`,
  brazier: (lv) => `${fmtNum(itemFxAt('brazier', 'auraDps', lv))} dmg/s, r ${fmtNum(itemFxAt('brazier', 'auraR', lv))}, +${fmtNum(itemFxAt('brazier', 'linger', lv))} s`,
  spoon: (lv) => `+${fmtNum(itemFxAt('spoon', 'healOnHit', lv))} hp per hit`,
};

// One row of the per-level table. A scalar REPEATS in every level column
// (round 20, Remi: half-empty columns read as "level 1 has no stats"); 0 is
// a value too (the bomb's knockback: 0 must print), never a blank cell.
function tipRow(label, value, cols, fmt, cur, cls = '') {
  let cells = '';
  for (let i = 0; i < cols; i++) {
    const v = Array.isArray(value) ? value[Math.min(i, value.length - 1)] : value;
    cells += `<td class="${i + 1 === cur ? 'cur' : ''}">${esc(fmt(v))}</td>`;
  }
  return `<tr class="${cls}"><th>${esc(label)}</th>${cells}</tr>`;
}

// Known fields first, in the order the dictionary declares them (damage before
// hit radius); anything the dictionary hasn't heard of trails behind, unlabelled
// but visible; a new constant must never silently vanish from the tooltip.
function orderedFields(obj, dict, skip) {
  const keys = Object.keys(obj).filter(k => !(skip && skip.has(k)));
  const known = Object.keys(dict).filter(k => keys.includes(k));
  return known.concat(keys.filter(k => !dict[k]));
}

function tipHead(cols, cur, label = 'lv') {
  let th = '<th></th>';
  for (let i = 1; i <= cols; i++) th += `<th class="${i === cur ? 'cur' : ''}">${label} ${i}</th>`;
  return `<thead><tr>${th}</tr></thead>`;
}

// The card only shows icon + name + cost (round 20, Remi); the tooltip is
// where EVERYTHING lives: the one-line desc, the long mechanism sentence and
// the per-level table (no "Next:" foot since round 19.4; the table already
// says it, Remi).
function tipShell(icon, name, desc, long, body, foot) {
  const both = long && long !== desc;
  return `<div class="tname"><span class="ic">${icon}</span>${esc(name)}</div>
    <div class="tdesc">${esc(desc)}</div>
    ${both ? `<div class="tlong">${esc(long)}</div>` : ''}${body}
    ${foot ? `<div class="tfoot">${foot}</div>` : ''}`;
}

function spellTip(key, spec, level, maxLevel) {
  let rows = '';
  for (const field of orderedFields(spec, SPELL_FIELDS, SPELL_SKIP)) {
    const [label, fmt] = SPELL_FIELDS[field] || [field, fmtNum];
    rows += tipRow(label, spec[field], maxLevel, fmt, level);
    // the return leg (boomerang) flies back through the launch point and
    // onward until caught; no spec field carries that, but the table must
    // not imply the flight ends where the throw does (Remi, round 19.4)
    if (field === 'outDistance') rows += tipRow('return distance', Infinity, maxLevel, fmt, level);
  }
  // Switcheroo's stun scales with how far you actually swapped (round 20.5), so
  // there is no single number: show the floor and what a full-range swap buys,
  // both recomputed from the spec exactly like the sim does it; min floor,
  // pad + d/fireball speed, and the round-21.0 `max` ceiling.
  if (spec.stun) {
    const rng = Array.isArray(spec.range) ? spec.range : [spec.range];
    const swapStun = d => Math.min(spec.stun.max || Infinity,
      Math.max(spec.stun.min, spec.stun.pad + d / SPELLS.fireball.speed));
    rows += tipRow('stun, short swap', spec.stun.min, maxLevel, fmtSec, level);
    rows += tipRow('stun, full-range swap', rng.map(swapStun), maxLevel, fmtSec, level);
  }
  rows += tipRow('cost', spec.costs.slice(0, maxLevel), maxLevel, fmtGold, level + 1, 'cost');
  const foot = [
    level > 0 ? `You own it at <b>lv ${level}</b>${level >= maxLevel ? ' (max)' : ''}.` : '',
    spec.minRound ? `Locked until round <b>${spec.minRound + 1}</b>.` : '',
  ].filter(Boolean).join(' ');
  // one message per hover (Remi, round 19.6): spells carry everything in desc;
  // unless one needs a longer mechanism sentence, and then `long` wins (the
  // element shape; round 21.0, shield's "not physical" caveat)
  return tipShell(ICONS[key], spec.name, spec.long || spec.desc, null,
    `<table>${tipHead(maxLevel, level)}<tbody>${rows}</tbody></table>`, foot);
}

function elementTip(key, spec, level) {
  const cols = spec.maxLevel;
  let rows = '';
  const fxSpec = spec.fx || {};
  for (const field of orderedFields(fxSpec, FX_FIELDS, ELEM_FX_SKIP)) {
    const [label, fmt] = FX_FIELDS[field] || [field, fmtNum];
    rows += tipRow(label, fxSpec[field], cols, fmt, level);
  }
  rows += tipRow('cost', spec.costs.slice(0, cols), cols, fmtGold, level + 1, 'cost');
  const foot = [
    level > 0 ? `You own it at <b>lv ${level}</b>${level >= cols ? ' (max)' : ''}.` : '',
    // the one boilerplate line that earns its place: what haste MEANS
    spec.fx && spec.fx.haste ? 'Ability Haste: +18 means 18% more casts in the same time. It sums across everything you own.' : '',
  ].filter(Boolean).join(' ');
  // the card already wears the short tag; the hover shows ONLY the long
  // explanation (Remi, round 19.6: say it once)
  return tipShell(spec.icon, spec.name, spec.long || spec.desc, null,
    `<table>${tipHead(cols, level)}<tbody>${rows}</tbody></table>`, foot);
}

// Items are LEVELLED like spells (round 12): the columns are levels 1..maxLevel
// and the ITEM_FX arrays are absolute totals, so each cell is read straight out
// of the spec: no per-copy arithmetic, and nothing here can drift from what
// stats() computes on the server. Cost is flat at every level for most items;
// the hourglass carries a per-level costs array (itemCost reads both).
function itemTip(key, spec, level) {
  const cols = spec.maxLevel;
  const cur = Math.min(level, cols);
  const fxSpec = ITEM_FX[key] || {};
  let rows = '';
  for (const field of orderedFields(fxSpec, ITEM_FIELDS)) {
    const [label, fmt] = ITEM_FIELDS[field] || [field, fmtNum];
    rows += tipRow(label, fxSpec[field], cols, fmt, cur);
  }
  const costs = Array.from({ length: cols }, (_, i) => itemCost(key, i));
  rows += tipRow('cost', costs, cols, fmtGold, Math.min(level + 1, cols), 'cost');
  const live = level > 0 && ITEM_LIVE[key] && ITEM_LIVE[key](cur);
  const foot = [
    level > 0 ? `You own it at <b>lv ${level}</b>${level >= cols ? ' (max)' : ''}.` : '',
    live ? `With that, ${live}.` : '',
    key === 'hourglass' ? 'Ability Haste: +10 means 10% more casts in the same time. It sums across everything you own.' : '',
  ].filter(Boolean).join(' ');
  // items follow the shop's tag shape now (round 21.5): `long` is the mechanism
  // sentence when the spec carries one, exactly like spells and elements
  return tipShell(ICONS[key], spec.name, spec.long || spec.desc, null,
    `<table>${tipHead(cols, cur)}<tbody>${rows}</tbody></table>`, foot);
}

// ---- hover tooltip -------------------------------------------------------------
// A short line on the button, the whole truth on hover. tipOwner is kept so the
// panel refreshes in place after a purchase (the mouse never left the button).

let tipEl = null;
let tipOwner = null;

// main.js calls this once, after the DOM exists: it captures `send` and wires
// the two listeners that keep the panel glued to its button.
export function initShop({ send: sendFn } = {}) {
  if (sendFn) send = sendFn;
  tipEl = $('tip');
  // The panel is anchored to a button, so it has to follow when the wares scroll
  // under it; a resize is rare enough to just dismiss.
  $('shop').addEventListener('scroll', () => { if (tipOwner) placeTip(tipOwner.el); }, true);
  window.addEventListener('resize', hideTip);
}

function placeTip(anchor) {
  const r = anchor.getBoundingClientRect();
  const t = tipEl.getBoundingClientRect();
  const pad = 10;
  let left = r.right + pad;
  if (left + t.width > window.innerWidth - pad) left = r.left - t.width - pad;
  if (left < pad) left = Math.max(pad, (window.innerWidth - t.width) / 2);
  let top = r.top + r.height / 2 - t.height / 2;
  top = Math.min(Math.max(pad, top), Math.max(pad, window.innerHeight - t.height - pad));
  tipEl.style.left = `${Math.round(left)}px`;
  tipEl.style.top = `${Math.round(top)}px`;
}

function showTip(el, build) {
  const html = build();
  if (!html) return;
  tipOwner = { el, build };
  tipEl.innerHTML = html;
  tipEl.classList.remove('hidden');
  placeTip(el);
}

export function hideTip() {
  tipOwner = null;
  if (tipEl) tipEl.classList.add('hidden');
}

// Repaint the open tooltip from fresh state (a purchase just changed a level).
function refreshTip() {
  if (!tipOwner || !tipOwner.el.isConnected) { hideTip(); return; }
  try {
    const html = tipOwner.build();
    if (html) { tipEl.innerHTML = html; placeTip(tipOwner.el); }
  } catch { hideTip(); }
}

function attachTip(el, build) {
  const show = () => showTip(el, build);
  el.addEventListener('mouseenter', show);
  el.addEventListener('focus', show);
  el.addEventListener('mouseleave', hideTip);
  el.addEventListener('blur', hideTip);
}

// ---- the card grid ----------------------------------------------------------

// Round 17 §10: the elements sit in two labeled shop rows. PRESENTATIONAL
// only, every one of them is still 3 levels and buys exactly what it did.
// Elements = the ball's stat axes; Mutations = the ones that change what the
// ball does.
const ELEMENT_ROWS = [
  ['Elements ⚗️ (your fireball\'s stat axes)',
    ['ember', 'terra', 'gale', 'arcane', 'ghost']],
  ['Mutations 🧬 (they change what your fireball does)',
    ['malady', 'frost', 'anger', 'mosquito', 'vampire', 'midas']],
];
const ROW_KEYS = new Set(ELEMENT_ROWS.flatMap(([, keys]) => keys));

// Round 20 (Remi): the spells sit in three quiet groups, labelled on the edge
// of each row. PRESENTATIONAL only, nothing about a spell changes.
// Round 21.7/21.8 (Remi): the Stone Pillar and the Mine both sit in Special;
// they are things you LEAVE somewhere, not things you throw at a face.
const SPELL_ROWS = [
  ['Offense', ['fireball', 'lightning', 'boomerang', 'meteor', 'genki', 'repulse', 'nova']], // Mine is a weapon (Remi, round 22)
  ['Defense', ['teleport', 'shield', 'debt', 'statue', 'rush', 'wall', 'firewalk']],
  ['Special', ['swap', 'vanish', 'decoy', 'pillar']],
];
const SPELL_ROW_KEYS = new Set(SPELL_ROWS.flatMap(([, keys]) => keys));

// Build shop buttons once per container; refresh() updates them from state.
// mode-aware: 'elemental' adds the Elements section and the elemental-only
// combo items; 'classic' shows exactly the pre-elemental shop.
export function buildShop(container, mode = 'classic') {
  const elemental = mode === 'elemental';
  container.innerHTML = '';
  const wares = [];
  // Draft mode: the offer banner sits at the very TOP of the grid and has to be
  // unmissable (docs/ROUND12.md S7). Built empty and hidden; classic never shows
  // it. It is created FIRST so it is above the Spells label.
  const draftBox = document.createElement('div');
  draftBox.className = 'draftpick hidden';
  draftBox.id = 'draftBanner';
  container.appendChild(draftBox);
  let draftShown = '';   // signature of what the banner currently renders
  // section headings, each remembering its own wares so a section emptied by the
  // draft pool can hide its heading too. Cards are MINIMAL (round 20, Remi):
  // icon + name + cost (+ the key chip on spells); everything else is the
  // hover tooltip's job. Each section is a flex ROW so a whole category fits
  // one line; rows hide with their wares like labels do.
  const labels = [];
  const rows = [];
  let curRow = null;
  const mkLabel = (txt) => {
    const el = document.createElement('div');
    el.className = 'shoplabel'; el.textContent = txt;
    container.appendChild(el);
    labels.push({ el, wares: [] });
  };
  // The label span is ALWAYS created, empty when the row has no category: it
  // owns grid column 1, so an unlabelled row still lines its cards up with a
  // labelled one instead of sliding 15px left (round 23).
  const mkRow = (cat) => {
    const el = document.createElement('div');
    el.className = 'shoprow';
    const lab = document.createElement('span');
    lab.className = 'catlabel';
    lab.textContent = cat || '';
    el.appendChild(lab);
    container.appendChild(el);
    curRow = el;
    rows.push({ el, wares: [] });
  };
  const inSection = (w) => {
    if (labels.length) labels[labels.length - 1].wares.push(w);
    if (rows.length) rows[rows.length - 1].wares.push(w);
  };
  const mkSpell = (key, spec) => {
    const b = document.createElement('button');
    b.className = 'ware';
    b.innerHTML = `<span class="icon">${ICONS[key]}</span>
      <span class="name">${spec.name}</span>
      <span class="cost num"></span>`;
    b.dataset.key = key;   // stable hook for the UI tests
    b.addEventListener('click', () => {
      if (shopPreview) { toast('browsing only. Buying happens between rounds'); return; }
      playSfx('buy'); send({ t: 'buy', id: key });
    });
    // key chip (spells only): sits OUTSIDE the buy button in a relative wrapper
    // because a disabled button (max level / can't afford) eats clicks on its
    // children, and the chip must stay clickable to open the rebind popup.
    const wrap = document.createElement('div');
    wrap.className = 'warewrap';
    const chip = document.createElement('span');
    chip.className = 'keychip';
    chip.dataset.spell = key;
    chip.title = 'Click to rebind this key';
    chip.textContent = keyLabel(keyOf(key));
    chip.addEventListener('click', (e) => { e.stopPropagation(); openRebind(key); });
    wrap.appendChild(b);
    wrap.appendChild(chip);
    curRow.appendChild(wrap);
    const w = { key, spec, el: b, wrap, kind: 'spell' };
    attachTip(b, () => spellTip(key, spec, w.level || 0, w.maxLevel || spec.maxLevel));
    wares.push(w); inSection(w);
  };
  // Round 17 (Remi): no separate "Powerful" category; every spell is just a
  // spell in the shop. `tier: 'power'` lives on in the SPEC as the bot guard
  // and the draft-offer filter, never as a shelf. Round 20: three quiet
  // Offense / Defense / Special rows; a spell missing from SPELL_ROWS lands in
  // the last row so nothing can silently vanish from the shop.
  mkLabel('Spells');
  for (let i = 0; i < SPELL_ROWS.length; i++) {
    const [cat, keys] = SPELL_ROWS[i];
    mkRow(cat);
    for (const key of keys) if (SPELLS[key]) mkSpell(key, SPELLS[key]);
    if (i === SPELL_ROWS.length - 1)
      for (const [key, spec] of Object.entries(SPELLS))
        if (!SPELL_ROW_KEYS.has(key)) mkSpell(key, spec);
  }
  // elements carry their 2-4 word tag ON the card (round 20.1, Remi: the
  // no-text doctrine went one step too far here; a tag is parseable at a
  // glance; spells stay text-free because theirs are not)
  const mkElement = (key, spec) => {
    const b = document.createElement('button');
    b.className = 'ware';
    b.innerHTML = `<span class="icon">${spec.icon}</span>
      <span class="info"><span class="name">${spec.name}</span>
      <span class="tag">${esc(spec.desc)}</span></span>
      <span class="cost num"></span>`;
    b.dataset.key = key;   // stable hook for the UI tests
    b.addEventListener('click', () => {
      if (shopPreview) { toast('browsing only. Buying happens between rounds'); return; }
      playSfx('buy'); send({ t: 'buy', id: key });
    });
    curRow.appendChild(b);
    const w = { key, spec, el: b, kind: 'element' };
    attachTip(b, () => elementTip(key, spec, w.level || 0));
    wares.push(w); inSection(w);
  };
  if (elemental) {
    for (let i = 0; i < ELEMENT_ROWS.length; i++) {
      const [label, keys] = ELEMENT_ROWS[i];
      mkLabel(label);
      mkRow();
      for (const key of keys) if (ELEMENTS[key]) mkElement(key, ELEMENTS[key]);
      // the last row also catches anything added to ELEMENTS but not named
      // above, so a new element can never be silently missing from the shop
      if (i === ELEMENT_ROWS.length - 1)
        for (const [key, spec] of Object.entries(ELEMENTS))
          if (!ROW_KEYS.has(key)) mkElement(key, spec);
    }
  }
  mkLabel('Items (passive boosts)');
  mkRow();
  for (const [key, spec] of Object.entries(ITEMS)) {
    if (spec.mode === 'elemental' && !elemental) continue;
    const b = document.createElement('button');
    b.className = 'ware';
    // items carry a one-value stat tag (round 20.1, Remi: "a very short
    // description of the stats it gives"); refresh() repaints it per level
    b.innerHTML = `<span class="icon">${ICONS[key]}</span>
      <span class="info"><span class="name">${spec.name}</span>
      <span class="tag"></span></span>
      <span class="cost num"></span>`;
    b.dataset.key = key;   // stable hook for the UI tests
    b.addEventListener('click', () => {
      if (shopPreview) { toast('browsing only. Buying happens between rounds'); return; }
      playSfx('buy'); send({ t: 'buy', id: key });
    });
    curRow.appendChild(b);
    const w = { key, spec, el: b, kind: 'item' };
    attachTip(b, () => itemTip(key, spec, w.level || 0));
    wares.push(w); inSection(w);
  }
  // Column count per row (round 23, Remi: "Mine and Fire Walk should not sit on
  // their own line"). As many columns as fit above MIN_TILE, never more than
  // the row actually has, and each capped at the round-20.1 tile of 200 px. So
  // a wide window shows every row on one line at full size, and a narrow one
  // shrinks to 160 before it gives up and wraps. Below 160 the name takes two
  // lines and clips its tag, which is worse than wrapping.
  // ⚠ A ResizeObserver, not a resize listener and not a call from refresh():
  // the grid is BUILT hidden (clientWidth 0) and setShopPreview shows the panel
  // AFTER its first refresh, so every "measure it once" version silently left
  // the CSS fallback in place. The observer fires the moment it has a width.
  // 180 is measured, not taste: below it "Blood Debt" and "Cape of the Magi"
  // take two lines and push their stat tag out of the 46 px card. A wrapped row
  // of readable cards beats one line of clipped ones.
  const MIN_TILE = 180, GAP = 6, PAD = 21;   // PAD = .shoprow's label gutter
  let laidOutAt = -1;
  const layoutRows = () => {
    const w = container.clientWidth;
    if (!w || w === laidOutAt) return;
    laidOutAt = w;
    const fit = Math.max(1, Math.floor((w - PAD + GAP) / (MIN_TILE + GAP)));
    for (const r of rows) r.el.style.setProperty('--cols', Math.min(r.wares.length, fit));
  };
  new ResizeObserver(layoutRows).observe(container);

  return function refresh(m, round = 0, s = null) {
    if (!m) return;
    const gold = fin(+m.gold) ? +m.gold : 0;
    const spells = m.spells || {};
    // draft mode: this game's pool is not for sale. A pool thing you have
    // DRAFTED goes back on the shelf (that is how levels 2-3 are bought), which
    // is exactly "do I own any level of it", the same rule the server uses.
    const pool = new Set((s && s.draftPool) || []);
    drawDraftBanner(m, s);
    // {key: level} since round 12; a stale snapshot (or an old array) reads as
    // "nothing owned" rather than throwing.
    const items = (m.items && !Array.isArray(m.items)) ? m.items : {};
    const ownedOf = (w) => w.kind === 'spell' ? (spells[w.key] || 0)
      : w.kind === 'element' ? ((m.elements && m.elements[w.key]) || 0)
      : (items[w.key] || 0);
    for (const w of wares) {
      // pooled and not yet drafted → this shelf is empty in this game
      // (spells hide their wrapper; the key chip must vanish with the ware)
      const locked = pool.has(w.key) && ownedOf(w) < 1;
      (w.wrap || w.el).classList.toggle('hidden', locked);
      if (locked) { w.el.disabled = true; continue; }
      const cost = w.el.querySelector('.cost');
      if (w.kind === 'spell') {
        // power tier stays locked until enough rounds have been fought
        if (w.spec.minRound && round < w.spec.minRound) {
          cost.textContent = `🔒 r${w.spec.minRound + 1}`; cost.className = 'cost';
          w.el.disabled = true;
          continue;
        }
        const level = spells[w.key] || 0;
        // round 16: in elemental mode the fireball never levels; the elements
        // are its progression (same rule as buy() in shared/sim.js)
        const maxLevel = elemental && w.key === 'fireball' ? 1 : w.spec.maxLevel;
        w.level = level; w.maxLevel = maxLevel; // what the tooltip reads
        if (level >= maxLevel) {
          cost.textContent = 'max'; cost.className = 'cost owned'; w.el.disabled = true;
        } else {
          const c = w.spec.costs[level];
          cost.textContent = `${c} g`; cost.className = 'cost';
          w.el.disabled = gold < c;
        }
      } else if (w.kind === 'element') {
        const elevel = (m.elements && m.elements[w.key]) || 0;
        w.level = elevel;
        w.el.classList.toggle('sel', elevel > 0);
        if (elevel >= w.spec.maxLevel) {
          cost.textContent = 'max'; cost.className = 'cost owned'; w.el.disabled = true;
        } else {
          const c = w.spec.costs[elevel];
          cost.textContent = `${c} g`; cost.className = 'cost';
          w.el.disabled = gold < c || (spells.fireball || 0) < 1;
        }
      } else {
        // items are levelled like spells: the level you own sits next to the
        // name, the price is flat (the hourglass carries a per-level array;
        // itemCost handles both), and maxLevel is the wall.
        const level = Math.min(items[w.key] || 0, w.spec.maxLevel);
        w.level = level;
        w.el.classList.toggle('sel', level > 0);
        // the stat tag tracks the level you'd BUY (totals); at max, what you own
        w.el.querySelector('.tag').textContent = ITEM_TAG[w.key]
          ? ITEM_TAG[w.key](Math.min(level + 1, w.spec.maxLevel)) : '';
        if (level >= w.spec.maxLevel) {
          cost.innerHTML = 'max'; cost.className = 'cost owned'; w.el.disabled = true;
        } else {
          const c = itemCost(w.key, level);
          cost.innerHTML = `${c} g${level > 0 ? `<span class="nth">→ lv ${level + 1}</span>` : ''}`;
          cost.className = 'cost';
          w.el.disabled = gold < c;
        }
      }
      // level pips (round 22.2, Remi): a tiny bar at the bottom of every card
      // says 0..max at a glance (one cell per level, owned cells lit)
      const pmax = w.kind === 'spell' ? (w.maxLevel || w.spec.maxLevel) : w.spec.maxLevel;
      if (!w.pips) {
        w.pips = document.createElement('span');
        w.pips.className = 'pips';
        w.el.appendChild(w.pips);
      }
      if (w.pips.children.length !== pmax) w.pips.innerHTML = '<i></i>'.repeat(pmax);
      for (let i = 0; i < pmax; i++) w.pips.children[i].classList.toggle('on', i < (w.level || 0));
    }
    // a section whose whole stock is in the draft pool would leave a dangling
    // heading, so a label lives or dies with its wares, and so does each row
    // (its edge category label with it)
    for (const lab of labels)
      lab.el.classList.toggle('hidden', lab.wares.length > 0 &&
        lab.wares.every(w => (w.wrap || w.el).classList.contains('hidden')));
    for (const row of rows)
      row.el.classList.toggle('hidden', row.wares.length > 0 &&
        row.wares.every(w => (w.wrap || w.el).classList.contains('hidden')));
    refreshTip(); // a purchase just changed what the open tooltip should say
  };

  // The free-pick banner. Re-rendered only when the offer actually changes, so
  // clicking never fights the 20 Hz shop refresh for the selection highlight.
  function drawDraftBanner(m, s) {
    const off = (s && s.draft && m && m.draftOffer) || null;
    const sig = off ? `${off.round}|${off.options.join(',')}|${off.picked || ''}` : '';
    if (sig === draftShown) return;
    draftShown = sig;
    draftBox.classList.toggle('hidden', !off);
    if (!off) { draftBox.innerHTML = ''; return; }
    draftBox.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'drafthead';
    head.innerHTML = off.picked
      ? `🎴 <b>Drafted for free:</b> ${esc(thingName(off.picked))}. It is yours at level 1, and its next levels are on sale below.`
      : `🎴 <b>Free draft pick</b>: pick one of these ${off.options.length}. ` +
        `<span class="draftnote">The first is already chosen for you: click nothing and you still get it.</span>`;
    draftBox.appendChild(head);
    const row = document.createElement('div');
    row.className = 'draftopts';
    off.options.forEach((key, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ware draftopt';
      b.dataset.key = key;      // stable hook for the UI tests
      const chosen = off.picked ? off.picked === key : i === 0;
      b.classList.toggle('sel', chosen);
      b.innerHTML = `<span class="icon">${thingIcon(key)}</span>
        <span class="info"><span class="name">${esc(thingName(key))}
          <span class="lv">${chosen ? (off.picked ? '✓ drafted' : '✓ pre-selected') : ''}</span></span>
        <span class="desc">${esc(thingDesc(key))}</span></span>
        <span class="cost num free">FREE<span class="nth">was ${thingCost(key)} g</span></span>`;
      if (off.picked) b.disabled = true;
      else b.addEventListener('click', () => {
        playSfx('buy');
        send({ t: 'draftPick', id: key });
      });
      row.appendChild(b);
    });
    draftBox.appendChild(row);
  }
}
// name/icon/cost/desc for ANY catalogue key (spell, item or element), so the
// draft banner does not need three branches of its own
function thingSpec(key) {
  return SPELLS[key] || ELEMENTS[key] || ITEMS[key] || null;
}
function thingName(key) { const s = thingSpec(key); return s ? s.name : key; }
function thingDesc(key) { const s = thingSpec(key); return s ? s.desc : ''; }
function thingIcon(key) {
  return ICONS[key] || (ELEMENTS[key] && ELEMENTS[key].icon) || '❓';
}
function thingCost(key) {
  if (SPELLS[key]) return SPELLS[key].costs[0];
  if (ELEMENTS[key]) return ELEMENTS[key].costs[0];
  if (ITEMS[key]) return itemCost(key);
  return 0;
}
