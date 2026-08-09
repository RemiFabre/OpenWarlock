// Item level maths — the ONE place that knows how ITEM_FX is shaped.
//
// 2026-08-07 (round 12): items are LEVELLED like spells. `pl.items` is a plain
// object `{key: level}` (1..maxLevel, never 0), and every ITEM_FX value is an
// ABSOLUTE CUMULATIVE total indexed by level-1 — level 2 boots ARE ×1.27, not
// ×1.15×1.27. Reading the level's entry is therefore the whole rule; nothing
// compounds.
//
// This file exists because the previous freely-stackable items compounded
// (`speedMult ** n`, `maxHp * n`) and that formula was duplicated in three
// places — sim's stats(), the shop tooltip and the shop button — which is
// exactly how a UI ends up lying about the numbers the server uses.

import { ITEM_FX } from './constants.js';

// Fields that SUM across the items you own. Anything named `*Mult` multiplies
// (by convention, so a new multiplier needs no edit here). Anything else an
// item spec carries is a one-off consumed by the feature that owns it, not a
// passive stat, so it is deliberately ignored.
const ADD_FIELDS = new Set(['maxHp', 'regen', 'lifesteal', 'haste']);

// The absolute value of ITEM_FX[key][field] at `level`. Level 0 (or an unknown
// key/field) means "you own none of it" and returns null, which is
// distinguishable from a legitimate 0.
export function itemFxAt(key, field, level) {
  if (!(level > 0)) return null;
  const fx = ITEM_FX[key];
  const v = fx ? fx[field] : undefined;
  if (v == null) return null;
  return Array.isArray(v) ? v[Math.min(level, v.length) - 1] : v;
}

// Everything an inventory `{key: level}` passively grants, split by how it
// folds into a stat: `mult` values are products (default 1), `add` values are
// sums (default 0). Absent keys mean "no item touched that stat".
export function itemBonuses(items) {
  const mult = {}, add = {};
  for (const [key, level] of Object.entries(items || {})) {
    const fx = ITEM_FX[key];
    if (!fx || !(level > 0)) continue;
    for (const field of Object.keys(fx)) {
      const v = itemFxAt(key, field, level);
      if (v == null) continue;
      if (field.endsWith('Mult')) mult[field] = (mult[field] == null ? 1 : mult[field]) * v;
      else if (ADD_FIELDS.has(field)) add[field] = (add[field] || 0) + v;
    }
  }
  return { mult, add };
}

// What buying `level` costs you in max HP etc. over `level - 1`: the arrays are
// cumulative totals, so an upgrade grants the DIFFERENCE. Used by buy() to move
// pl.maxHp, which is a live field rather than a derived one.
export function itemFxDelta(key, field, level) {
  const now = itemFxAt(key, field, level) || 0;
  const before = itemFxAt(key, field, level - 1) || 0;
  return now - before;
}
