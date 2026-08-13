// The client's LEAF module: the handful of helpers and presentation constants
// every other client file shares.
//
// ⚠ This file imports nothing from client/. That is the whole point: keys.js,
// shop.js and main.js all import it, so the dependency graph runs one way
// (ui -> keys -> shop -> main) and can never form a cycle. A cycle here would
// not be a lint warning, it would be a blank page: an arrow-function `const`
// read during module init throws when its module is still evaluating.

export const $ = (id) => document.getElementById(id);

export const fin = Number.isFinite;

// ⚠ Every value in ICONS is injected as HTML (shop cards, spell bar, tooltips,
// draft banner, kit strip), never as textContent, which is what lets an icon
// carry a wrapper span. Keep it that way if you add a call site.
export const ICONS = {
  fireball: '🔥', lightning: '⚡', boomerang: '🪃',
  // Round 21.7 (Remi): the Stone Pillar has its 🗿 back, and NOPE (SPELLS.statue)
  // wears the SAME moai tinted gold (.goldicon in index.html); "a normal pillar
  // icon and a gold one". Revert = drop the span / restore 🏛️.
  teleport: '🌀', shield: '🛡️', debt: '🩶', rush: '💨', pillar: '🗿', vanish: '👁️',
  statue: '<span class="goldicon">🗿</span>',
  // Decoy (round 21.6): the two silhouettes; "there are more of me than there
  // should be". 👤/👥 were both free.
  decoy: '👥',
  meteor: '☄️', nova: '💣', swap: '🎭', repulse: '💥', wall: '🪞',
  // Fire Walk (round 22): footprints, NOT 🥾; that boot is already Lava Treads
  firewalk: '👣',
  boots: '👢', treads: '🥾', amulet: '❤️', ring: '💍', cape: '🧣', sword: '🗡️',
  // Hat of Aura (round 21.7 rename): a hat, since 🔥 belongs to ember.
  // Slow Spoon (21.8): Remi's joke, the slowest murder in history.
  hourglass: '⏳', brazier: '🎩', spoon: '🥄',
  genki: '💠',   // issue #12: the omega ball
};

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function setVisible(id, on) { $(id).classList.toggle('hidden', !on); }

export function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.style.opacity = 1;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = 0; }, 1800);
}

export function fmtNum(v) {
  if (v === Infinity) return '∞';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (!fin(+v)) return String(v);
  return String(Math.round(+v * 100) / 100);
}

// Spec fields are scalars or per-level arrays; statAt reads the value at a
// 1-based level either way.
export const statAt = (v, level) => Array.isArray(v) ? v[Math.min(level, v.length) - 1] : v;
