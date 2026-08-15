// ONE enumerable view over everything a player can own: spells, items and
// elements in a single list.
//
// Why this exists (docs/ROUND12.md S7): the shop was three hardcoded loops in
// client/main.js and three hardcoded branches in buy(), and there was no way to
// ask "what is the whole catalogue?", which is exactly the question draft mode
// asks twice (split it in half; find things of comparable price). It lives in
// shared/ so the server rolls the pool from the same list the client renders.
//
// It is a VIEW, not a new source of truth: every entry points at its own spec in
// constants.js and nothing is duplicated here.

import { SPELLS, ITEMS, ELEMENTS, itemCost } from './constants.js';

// Fireball is the starting kit, not content: everyone owns level 1 from the
// first shop and half the elements are riders ON it. It is therefore never
// draftable and never leaves the shop; see DRAFT in constants.js.
export const STARTING_KIT = new Set(['fireball']);

// Everything ownable in `mode`, in shop order (spells, elements, items), each
// entry carrying what both the pool split and the shop need:
//   key      = the id used by buy() and by the wire
//   kind     = 'spell' | 'element' | 'item'
//   spec     = the entry in SPELLS/ELEMENTS/ITEMS (never copied)
//   cost     = gold for level 1. THE gold-equivalence measure for draft offers.
//   maxLevel = the wall (before the Cinder Crown's fireball exception)
//   starter  = true for the starting kit, which is never in a draft pool
export function catalogue(mode = 'classic') {
  const elemental = mode === 'elemental';
  const out = [];
  for (const [key, spec] of Object.entries(SPELLS)) {
    // issue #13 (Ju v4): shopHidden spells are ball MUTATIONS — their shop
    // identity is the ELEMENTS entry of the same key, so listing both would
    // put the key in the catalogue twice
    if (spec.shopHidden) continue;
    out.push({
      key, kind: 'spell', spec, cost: spec.costs[0], maxLevel: spec.maxLevel,
      starter: STARTING_KIT.has(key),
    });
  }
  if (elemental)
    for (const [key, spec] of Object.entries(ELEMENTS))
      out.push({
        key, kind: 'element', spec, cost: spec.costs[0], maxLevel: spec.maxLevel,
        starter: false,
      });
  for (const [key, spec] of Object.entries(ITEMS)) {
    // an item spec may be elemental-only, exactly as buy() and buildShop
    // already have it (no item is today; the last one, the Echo Stone, was
    // merged into ELEMENTS.mosquito in round 20.1)
    if (spec.mode === 'elemental' && !elemental) continue;
    out.push({
      key, kind: 'item', spec, cost: itemCost(key), maxLevel: spec.maxLevel,
      starter: false,
    });
  }
  return out;
}

// The draftable half of the world: everything except the starting kit. This is
// the set DRAFT.POOL_FRAC is a fraction OF.
export function draftable(mode = 'classic') {
  return catalogue(mode).filter(e => !e.starter);
}

// What kind of thing is this key, without three `Object.hasOwn` calls at every
// call site? Returns null for anything unknown (hostile wire input included).
export function kindOf(key) {
  // issue #13 (Ju v4): a shopHidden SPELL key's ownable identity is the
  // ELEMENTS entry of the same name (the ball mutations)
  if (Object.hasOwn(SPELLS, key) && !SPELLS[key].shopHidden) return 'spell';
  if (Object.hasOwn(ELEMENTS, key)) return 'element';
  if (Object.hasOwn(ITEMS, key)) return 'item';
  return null;
}

// The level this player owns of ANY catalogue key (0 when they own none), so
// callers never have to know which of the three bags it lives in.
export function ownedLevel(pl, key) {
  switch (kindOf(key)) {
    case 'spell': return (pl.spells && pl.spells[key]) || 0;
    case 'element': return (pl.elements && pl.elements[key]) || 0;
    case 'item': return (pl.items && pl.items[key]) || 0;
    default: return 0;
  }
}
