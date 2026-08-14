// Issue #14 (Sam, v9): the animated 8-direction character in the arena.
//
// ⚠ PURELY VISUAL. Nothing here feeds the simulation: position, radius,
// collisions, knockback, speed, targeting, health and networking are exactly
// what the snapshot says. This module only decides which 128x128 cell of which
// spritesheet to paint over a warlock that already exists.
//
// The sheets are 1920x1024: 15 frame slots across, 8 directional rows down,
// 128x128 cells. The row order is read off the artwork ONCE, here, instead of
// magic numbers scattered through the renderer:
//
//   row 0 W · 1 SW · 2 S · 3 SE · 4 E · 5 NE · 6 N · 7 NW
//
// (row 2 shows the knight's face, row 6 its back, 0 and 4 the two profiles.)

const CELL = 128;
const COLS = 15;
const ROWS = 8;

// screen angle (atan2(dy, dx), y DOWN) -> row. E is angle 0, S is +90°.
const ROW_BY_OCTANT = [4, 3, 2, 1, 0, 7, 6, 5]; // E, SE, S, SW, W, NW, N, NE

const SHEETS = {
  idle: { file: 'Idle.png', fps: 9, loop: true },
  run: { file: 'Run.png', fps: 15, loop: true },
  walk: { file: 'Walk.png', fps: 13, loop: true },
  cast: { file: 'CastSpell.png', fps: 18, loop: false },
  hit: { file: 'TakeDamage.png', fps: 18, loop: false },
  die: { file: 'Die.png', fps: 12, loop: false },
};

// One Image per sheet for the whole game: every warlock shares them.
for (const s of Object.values(SHEETS)) {
  s.img = new Image();
  s.img.src = new URL(`../assets/ui/knight/${s.file}`, import.meta.url).href;
  s.frames = COLS;      // refined once the pixels are readable (see below)
  s.measured = false;
}

// These packs pad unused frame slots with empty cells, and playing them looks
// like a stutter. Count the real frames ONCE per sheet by scanning row 2 (S)
// for any non-transparent pixel. Cheap, and it beats hardcoding per-file counts.
function measure(s) {
  if (s.measured || !s.img.complete || !s.img.naturalWidth) return;
  s.measured = true;
  try {
    const c = document.createElement('canvas');
    c.width = COLS * CELL; c.height = CELL;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(s.img, 0, 2 * CELL, COLS * CELL, CELL, 0, 0, COLS * CELL, CELL);
    let last = 0;
    for (let i = 0; i < COLS; i++) {
      const d = g.getImageData(i * CELL, 0, CELL, CELL).data;
      for (let p = 3; p < d.length; p += 4 * 8) if (d[p] > 8) { last = i + 1; break; }
    }
    if (last > 1) s.frames = last;
  } catch { /* a tainted or not-yet-decoded canvas just keeps the default */ }
}

// per-warlock animation state, keyed by player id
const state = new Map();
function stateFor(id) {
  let st = state.get(id);
  if (!st) {
    st = { row: 2, t: 0, one: null, oneT: 0, x: null, y: null, vx: null, vy: null };
    state.set(id, st);
  }
  return st;
}
// true once the idle sheet is decoded: the renderer needs to know BEFORE it
// paints the body whether it is drawing a disc or a character.
export function knightLoaded() {
  const i = SHEETS.idle.img;
  return !!(i.complete && i.naturalWidth);
}
// test/debug hook, in the same family as window.__phase and window.__keys: the
// row a warlock is currently facing, so a browser test can assert all eight
// directions instead of eyeballing them.
if (typeof window !== 'undefined') {
  window.__knightRow = (id) => (state.get(id) || {}).row;
  window.__knightDirs = ['W', 'SW', 'S', 'SE', 'E', 'NE', 'N', 'NW'];
  window.__knightPos = (id) => { const st = state.get(id); return st ? { x: st.x, y: st.y } : null; };
}
export function forgetKnights(keep) {
  for (const id of [...state.keys()]) if (!keep.has(id)) state.delete(id);
}

// 22.5° of hysteresis: a direction only flips once the movement is clearly
// past the next octant, so a warlock jittering on a threshold does not
// flicker between two rows.
function rowFor(dx, dy, current) {
  const ang = Math.atan2(dy, dx);
  const oct = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
  const want = ROW_BY_OCTANT[oct];
  if (want === current) return current;
  const exact = ang / (Math.PI / 4);
  const drift = Math.abs(exact - Math.round(exact));
  return drift < 0.34 ? want : current;   // near the middle of an octant: commit
}

/**
 * Paint the knight for one warlock. Returns false when the sheets are not
 * decoded yet, so the caller can fall back to its own drawing.
 *
 * @param opts.moving  true when the sim says this warlock is moving
 * @param opts.cast    true on the frame a cast was observed
 * @param opts.hurt    true on the frame damage was observed
 * @param opts.dead    true while the warlock is down
 */
export function drawKnight(ctx, pl, x, y, r, dt, opts = {}) {
  const st = stateFor(pl.id);
  for (const s of Object.values(SHEETS)) measure(s);
  const idle = SHEETS.idle;
  if (!idle.img.complete || !idle.img.naturalWidth) return false;

  // ⚠ the snapshot carries NO velocity for players, so facing comes from the
  // position delta. That delta is PER FRAME: it has to be divided by dt before
  // it can be compared to a speed in units per second (the first cut compared
  // ~0.18 u/frame against 0.6 u/s, so nobody ever turned). A low pass on top
  // keeps one jittery frame from flipping the direction.
  const dts = Math.max(dt, 1 / 240);
  const rawX = st.x == null ? 0 : (pl.x - st.x) / dts;
  const rawY = st.y == null ? 0 : (pl.y - st.y) / dts;
  st.x = pl.x; st.y = pl.y;
  st.vx = st.vx == null ? rawX : st.vx * 0.7 + rawX * 0.3;
  st.vy = st.vy == null ? rawY : st.vy * 0.7 + rawY * 0.3;
  const speed = Math.hypot(st.vx, st.vy);          // world units per second
  const MOVING = 1.2;                              // walking speed is ~11 u/s
  if (speed > MOVING) st.row = rowFor(st.vx, st.vy, st.row);

  // one-shot states (death > hit > cast) ride over the looping ones
  if (opts.dead && st.one !== 'die') { st.one = 'die'; st.oneT = 0; }
  else if (!opts.dead) {
    if (st.one === 'die') { st.one = null; st.oneT = 0; }
    if (opts.hurt && st.one !== 'die') { st.one = 'hit'; st.oneT = 0; }
    else if (opts.cast && st.one !== 'hit') { st.one = 'cast'; st.oneT = 0; }
  }

  let key = st.one || (speed > MOVING ? 'run' : 'idle');
  let sheet = SHEETS[key];
  if (!sheet.img.complete || !sheet.img.naturalWidth) { key = 'idle'; sheet = idle; }

  let frame;
  if (st.one) {
    st.oneT += dt;
    frame = Math.floor(st.oneT * sheet.fps);
    if (frame >= sheet.frames) {
      if (key === 'die') frame = sheet.frames - 1;         // hold the last pose
      else { st.one = null; st.oneT = 0; key = speed > MOVING ? 'run' : 'idle'; sheet = SHEETS[key]; frame = 0; }
    }
  } else {
    st.t += dt;
    frame = Math.floor(st.t * sheet.fps) % sheet.frames;
  }

  // Size and anchor, measured off the artwork rather than guessed: the knight
  // fills ~47% of its 128px cell and its feet sit ~0.82 down it. Drawing the
  // CELL at 5.6 radii therefore paints a character about 2.6 radii tall, which
  // is clearly bigger than the old disc while several stay trackable. The art
  // may overhang the collision circle; the circle is untouched and is still the
  // only thing that collides.
  const h = r * 5.6, w = h;
  ctx.drawImage(sheet.img, frame * CELL, st.row * CELL, CELL, CELL,
    x - w / 2, y - h * 0.82, w, h);
  return true;
}

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
