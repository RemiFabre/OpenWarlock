// Canvas rendering: lava sea, obsidian platform, warlocks, projectiles, FX.

import { ARENA, PLAYER, ROUND, SPELLS, ELEMENTS, teamTint } from '../shared/constants.js';
import { rankTeams } from '../shared/sim.js';
import { itemFxAt } from '../shared/items.js';
import { currentLevel } from './music.js';

// Sky-bolt tint per spell level (round 17 §2: the color shift IS the level
// read) — pale electric blue, deeper blue, storm violet. "r, g, b" strings.
const BOLT_TINTS = ['165, 220, 255', '110, 190, 255', '195, 160, 255'];

// Precomputed drifting lava blobs (deterministic, just for looks).
const BLOBS = [];
for (let i = 0; i < 14; i++) {
  BLOBS.push({
    a: (i / 14) * Math.PI * 2,
    r: 0.55 + 0.45 * ((i * 7919) % 100) / 100,
    speed: 0.05 + 0.12 * ((i * 104729) % 100) / 100,
    size: 0.18 + 0.3 * ((i * 1299709) % 100) / 100,
    phase: i * 2.39996,
  });
}

export function makeView(canvas) {
  const back = document.createElement('canvas'); // low-res backdrop layer
  return {
    canvas, ctx: canvas.getContext('2d'),
    back, bctx: back.getContext('2d'),
    w: 0, h: 0, scale: 1, cx: 0, cy: 0,
    arenaR: ARENA.START_RADIUS,   // this game's un-shrunk arena (round 21.2)
    // the camera frames the WHOLE arena, whatever size this game rolled
    fitArena(R) {
      const r = Number.isFinite(+R) && +R > 0 ? +R : ARENA.START_RADIUS;
      if (r === this.arenaR) return;
      this.arenaR = r;
      this.scale = Math.min(this.w, this.h) / (2 * (r + 9));
    },
    resize() {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      this.w = window.innerWidth; this.h = window.innerHeight;
      canvas.width = this.w * dpr; canvas.height = this.h * dpr;
      canvas.style.width = this.w + 'px'; canvas.style.height = this.h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.cx = this.w / 2; this.cy = this.h / 2;
      this.scale = Math.min(this.w, this.h) / (2 * (this.arenaR + 9));
      // backdrop renders at ~1/3 resolution and is stretched up — the image,
      // wash and lava-blob gradients are by far the most expensive paints
      // the back layer only carries the lava-blob gradients now (the level
      // art is drawn full-res on the main canvas — one cheap drawImage)
      back.width = Math.max(160, Math.round(this.w / 3));
      back.height = Math.max(100, Math.round(this.h / 3));
    },
    sx(x) { return this.cx + x * this.scale; },
    sy(y) { return this.cy + y * this.scale; },
  };
}

const fin = Number.isFinite;
const TAU = Math.PI * 2;

// Elemental fireball core colors (elemental mode; ember/none keep the classic orange).
const ELEM_CORE = {
  frost: '#8fd8ff', malady: '#8fe08f', gale: '#e6f2ff', midas: '#ffd76a', terra: '#c8935a',
  // anger: the red ball IS the brand — the core shifts hard toward red
  anger: '#ff5040',
  // round 12: a piercing ghost ball reads as pale and cold, a vampire ball as
  // arterial red (and it also gets the engorged halo below)
  ghost: '#dcd6ff', vampire: '#e0405a',
};

// Round 17 §12 — the fireball is ONE additive stack of layers, in draw order:
//   base ball (terra sizes it, the strongest rider tints it)
//   → element accents (one per element the ball carries, they compose)
//   → event overlay (engorged, which also owns the BASE color).
// (The old momentum tier wings are GONE — Remi: the giant tier balls LOOKED
// like they hit but didn't. Every accent stays near the true hitbox radius.)
// Both readings matter: the owner sees the build they bought fly, a defender
// reads what is coming at them. Accents are cheap strokes on purpose — this
// runs per projectile per frame, so no gradients and no allocations here.
const ACCENTS = {
  // damage axis: hot sparks shedding off the back
  ember: (ctx, x, y, r, lv, ang, t) => {
    ctx.fillStyle = 'rgba(255, 214, 120, 0.9)';
    for (let i = 0; i < lv + 1; i++) {
      const d = r * (2.1 + i * 1.2) + r * 0.5 * Math.sin(t * 17 + i * 2);
      const off = r * 0.7 * Math.sin(t * 11 + i * 3);
      ctx.beginPath();
      ctx.arc(x - Math.cos(ang) * d - Math.sin(ang) * off,
        y - Math.sin(ang) * d + Math.cos(ang) * off, r * 0.22, 0, TAU);
      ctx.fill();
    }
  },
  // size axis: a gritty rock shell, tumbling
  terra: (ctx, x, y, r, lv, ang, t) => {
    ctx.strokeStyle = 'rgba(150, 96, 48, 0.95)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i <= 7; i++) {
      const a = (i / 7) * TAU + t * 1.4;
      const rr = r * (1.5 + 0.2 * Math.sin(i * 2.4));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
  },
  // push axis: wind curls peeling off the sides
  gale: (ctx, x, y, r, lv, ang, t) => {
    ctx.strokeStyle = 'rgba(230, 242, 255, 0.6)';
    ctx.lineWidth = 1.4;
    const wob = 0.25 * Math.sin(t * 7);
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.arc(x - Math.cos(ang) * r * 1.5, y - Math.sin(ang) * r * 1.5,
        r * (1.3 + 0.3 * lv), ang + s * (0.5 + wob), ang + s * 2.3, s < 0);
      ctx.stroke();
    }
  },
  // cadence axis: rune arcs spinning fast around the ball
  arcane: (ctx, x, y, r, lv, ang, t) => {
    ctx.strokeStyle = 'rgba(196, 150, 255, 0.8)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + i * (TAU / 3);
      ctx.beginPath(); ctx.arc(x, y, r * 1.75, a, a + 0.75); ctx.stroke();
    }
  },
  // speed axis: afterimages; the pierce level gets a second one (it goes THROUGH
  // people, and that has to read before it does)
  ghost: (ctx, x, y, r, lv, ang) => {
    const n = lv >= (ELEMENTS.ghost.fx.pierceAtLevel || 3) ? 2 : 1;
    ctx.strokeStyle = n > 1 ? 'rgba(220, 214, 255, 0.5)' : 'rgba(220, 214, 255, 0.25)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i <= n; i++) {
      ctx.beginPath();
      ctx.arc(x - Math.cos(ang) * r * 1.8 * i, y - Math.sin(ang) * r * 1.8 * i,
        r * 1.5, 0, TAU);
      ctx.stroke();
    }
  },
  // slow/stun: ice shards standing off the surface
  frost: (ctx, x, y, r, lv, ang, t) => {
    ctx.strokeStyle = 'rgba(143, 216, 255, 0.9)';
    ctx.lineWidth = 1.6;
    const n = 4 + lv;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + t * 1.8;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05);
      ctx.lineTo(x + Math.cos(a) * r * 1.85, y + Math.sin(a) * r * 1.85);
      ctx.stroke();
    }
  },
  // the contagion: sickly droplets shedding off the back of the ball
  malady: (ctx, x, y, r, lv, ang, t) => {
    ctx.fillStyle = 'rgba(120, 224, 120, 0.85)';
    for (let i = 0; i < 2 + lv; i++) {
      const ph = (t * 1.5 + i * 0.37) % 1;
      const d = r * (1.4 + 2.6 * ph);
      ctx.beginPath();
      ctx.arc(x - Math.cos(ang) * d, y - Math.sin(ang) * d + r * 2.2 * ph,
        r * 0.27 * (1 - 0.5 * ph), 0, TAU);
      ctx.fill();
    }
  },
  // the gold mark: sparkles orbiting the ball
  midas: (ctx, x, y, r, lv, ang, t) => {
    ctx.strokeStyle = 'rgba(255, 215, 106, 0.95)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 2 + lv; i++) {
      const a = t * 3 + i * 2.1;
      const px = x + Math.cos(a) * r * 2.1, py = y + Math.sin(a) * r * 2.1;
      const s = r * 0.45 * (0.6 + 0.4 * Math.sin(t * 9 + i));
      ctx.beginPath();
      ctx.moveTo(px - s, py); ctx.lineTo(px + s, py);
      ctx.moveTo(px, py - s); ctx.lineTo(px, py + s);
      ctx.stroke();
    }
  },
  // lifesteal: an arterial crescent. Every chargeEvery'th cast the ball also
  // goes engorged, and that overlay is the loud one — this is the "I own
  // vampire" tell on the ordinary balls between charges.
  vampire: (ctx, x, y, r, lv, ang) => {
    ctx.strokeStyle = 'rgba(224, 64, 90, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r * 1.45, ang + 2.2, ang + 4.1); ctx.stroke();
  },
  // the mark hunt: hot red embers orbiting TIGHT to the ball. Honest by design
  // (the drawEngorged bar): the red core + these accents never claim more than
  // ~the true hitbox radius, unlike the old momentum wings.
  anger: (ctx, x, y, r, lv, ang, t) => {
    ctx.fillStyle = 'rgba(255, 90, 70, 0.9)';
    for (let i = 0; i < 2 + lv; i++) {
      const a = t * 6 + i * (TAU / (2 + lv));
      const d = r * (0.85 + 0.25 * Math.sin(t * 9 + i * 2));
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.18, 0, TAU);
      ctx.fill();
    }
  },
};

// Vampire's engorged ball (every chargeEvery'th cast — 5 since round 16): an
// halo with a 🧛 rider. It keeps every other layer — only the base color is
// taken over, because "this one heals them for a lot" outranks any tint.
function drawEngorged(ctx, x, y, r, t) {
  ctx.save();   // this block sets textAlign/baseline; the fx pass draws damage
                // numbers without setting them itself
  const pulse = 0.7 + 0.3 * Math.sin(t * 22);
  ctx.strokeStyle = `rgba(255, 40, 70, ${0.65 + 0.35 * pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, r * 2.9 * pulse, 0, TAU); ctx.stroke();
  const bg = ctx.createRadialGradient(x, y, 0, x, y, r * 3.6);
  bg.addColorStop(0, `rgba(255, 40, 70, ${0.42 * pulse})`);
  bg.addColorStop(1, 'rgba(180, 0, 40, 0)');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(x, y, r * 3.6, 0, TAU); ctx.fill();
  ctx.font = `${Math.round(Math.max(11, r * 1.6))}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🧛', x, y - r * 3.2);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

export function draw(view, vs, fx, myId, moveMark, now, bubbles = []) {
  if (vs) view.fitArena(vs.startRadius);   // arena size is per-game (round 21.2)
  const { ctx, w, h, scale } = view;
  const t = now / 1000;

  // Round-end art reveal: while the roundEnd banner shows, the whole world
  // (lava, platform, players) fades away over 0.6 s and the level art is
  // shown fully for the remaining ~3 s.
  const reveal = vs && vs.phase === 'roundEnd' && Number.isFinite(vs.phaseT)
    ? Math.min(1, Math.max(0, (ROUND.SUMMARY_TIME - vs.phaseT) / 0.6))
    : 0;
  const worldAlpha = 1 - reveal;

  // --- backdrop: base + level art at FULL resolution on the main canvas
  // (the art used to live on the 1/3-res layer and came out visibly blurry;
  // a single full-res drawImage is cheap — the gradients were the expensive
  // part, and those stay on the low-res layer below) ---
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#2b0800';
  ctx.fillRect(0, 0, w, h);
  try {
    const lv = currentLevel();
    if (lv && lv.image) {
      const img = lv.image;
      // "dezoomed" between cover and contain; expands to the full picture
      // (contain) during the round-end reveal
      const coverS = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const containS = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const base = Math.max(containS, Math.sqrt(coverS * containS));
      const sc = base + (containS - base) * reveal;
      const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
      ctx.globalAlpha = 0.22 + 0.72 * reveal;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(16, 6, 2, ${0.35 * worldAlpha})`;
      ctx.fillRect(0, 0, w, h);
    }
  } catch { /* a broken image must never break the frame */ }

  // --- drifting lava blobs: painted small offscreen, stretched up ---
  drawBackdrop(view, worldAlpha, t);
  ctx.drawImage(view.back, 0, 0, w, h);

  if (worldAlpha <= 0.01) { drawWorldDone(view, vs, fx, myId, now); return; }
  ctx.globalAlpha = worldAlpha;

  if (!vs) return;
  const R = (fin(vs.arenaRadius) ? vs.arenaRadius : ARENA.START_RADIUS) * scale;
  const R0 = fin(vs.startRadius) ? vs.startRadius : ARENA.START_RADIUS; // un-shrunk
  const players = Array.isArray(vs.players) ? vs.players : [];
  const projectiles = Array.isArray(vs.projectiles) ? vs.projectiles : [];
  // my team number, for the ally ring on the bodies below (round 21.3)
  const myTeam = vs.me && vs.me.team != null ? vs.me.team : null;

  // --- platform ---
  // ghost of the original arena size
  ctx.strokeStyle = 'rgba(255, 140, 60, 0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(view.cx, view.cy, R0 * scale, 0, Math.PI * 2); ctx.stroke();

  // molten rim
  const rim = ctx.createRadialGradient(view.cx, view.cy, R * 0.92, view.cx, view.cy, R * 1.10);
  rim.addColorStop(0, 'rgba(255, 93, 31, 0)');
  rim.addColorStop(0.55, 'rgba(255, 120, 40, 0.55)');
  rim.addColorStop(1, 'rgba(255, 93, 31, 0)');
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.arc(view.cx, view.cy, R * 1.12, 0, Math.PI * 2); ctx.fill();

  const rock = ctx.createRadialGradient(view.cx, view.cy, 0, view.cx, view.cy, R);
  rock.addColorStop(0, '#3a322c');
  rock.addColorStop(0.75, '#2c2521');
  rock.addColorStop(1, '#1c1512');
  ctx.fillStyle = rock;
  ctx.beginPath(); ctx.arc(view.cx, view.cy, R, 0, Math.PI * 2); ctx.fill();

  // faint concentric cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath(); ctx.arc(view.cx, view.cy, R * i / 3.4, 0, Math.PI * 2); ctx.stroke();
  }

  // --- lava portals (round 18, versus only): touch one, surface at the center.
  // Cool-toned vortex so it can never be mistaken for lava FX; the swirl spins
  // so a static frame still reads as "this is a mechanism", not decoration.
  if (vs.mode !== 'coop' && ARENA.PORTALS) {
    const P = ARENA.PORTALS;
    const pd = R0 * P.DIST_FRAC;
    for (let i = 0; i < P.COUNT; i++) {
      const pa = P.ANGLE + (i / P.COUNT) * Math.PI * 2;
      const x = view.sx(Math.cos(pa) * pd), y = view.sy(Math.sin(pa) * pd);
      const pr = P.RADIUS * scale;
      const g = ctx.createRadialGradient(x, y, 0, x, y, pr * 1.7);
      g.addColorStop(0, 'rgba(8, 12, 28, 0.95)');   // dark well
      g.addColorStop(0.6, 'rgba(45, 95, 170, 0.45)');
      g.addColorStop(1, 'rgba(45, 95, 170, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, pr * 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(140, 220, 255, 0.85)';
      ctx.lineWidth = Math.max(1.5, pr * 0.22);
      const spin = t * 1.6 + i * Math.PI / 2;
      for (let k = 0; k < 3; k++) {
        const o = spin + k * (Math.PI * 2 / 3);
        ctx.beginPath(); ctx.arc(x, y, pr, o, o + Math.PI / 2); ctx.stroke();
      }
    }
  }

  // --- pillars: obsidian columns; sunken ones melt dimly under the lava ---
  const pillars = Array.isArray(vs.pillars) ? vs.pillars : [];
  for (const pil of pillars) {
    if (!pil || !fin(pil.x) || !fin(pil.y) || !fin(pil.r)) continue;
    const x = view.sx(pil.x), y = view.sy(pil.y);
    const pr = pil.r * scale;
    if (pil.sunk) {
      // mostly swallowed: a dark stub in a dim ember glow, pulsing slightly
      const pulse = 0.75 + 0.25 * Math.sin(t * 3 + pil.x + pil.y);
      const g = ctx.createRadialGradient(x, y, 0, x, y, pr * 1.15);
      g.addColorStop(0, `rgba(255, 130, 45, ${0.30 * pulse})`);
      g.addColorStop(0.6, `rgba(190, 55, 10, ${0.18 * pulse})`);
      g.addColorStop(1, 'rgba(120, 20, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, pr * 1.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(28, 18, 14, 0.6)';
      ctx.beginPath(); ctx.arc(x, y, pr * 0.5, 0, Math.PI * 2); ctx.fill();
    } else {
      // drop shadow toward the lava glow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(x + pr * 0.2, y + pr * 0.45, pr * 1.05, pr * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      // obsidian body (rock palette, darker than the platform)
      const g = ctx.createRadialGradient(x - pr * 0.35, y - pr * 0.4, pr * 0.15, x, y, pr);
      g.addColorStop(0, '#4a4038');
      g.addColorStop(0.55, '#2a221d');
      g.addColorStop(1, '#14100c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.stroke();
      // rim highlight catching the lava light
      ctx.strokeStyle = 'rgba(255, 150, 70, 0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, pr * 0.9, Math.PI * 0.55, Math.PI * 1.35); ctx.stroke();
    }
  }

  // --- ground hazards (elemental; no live spawner since round 19): green puddles ---
  const hazards = Array.isArray(vs.hazards) ? vs.hazards : [];
  for (const h of hazards) {
    if (!h || !fin(h.x) || !fin(h.y) || !fin(h.r)) continue;
    const alpha = fin(+h.a) ? Math.max(0, Math.min(1, +h.a)) : 1;
    const x = view.sx(h.x), y = view.sy(h.y);
    ctx.fillStyle = `rgba(110, 200, 90, ${0.10 + 0.16 * alpha})`;
    ctx.beginPath(); ctx.arc(x, y, h.r * scale, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(130, 220, 110, ${0.25 * alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // --- meteor telegraphs: a red mark that blinks faster as the rock nears ---
  const meteors = Array.isArray(vs.meteors) ? vs.meteors : [];
  for (const m of meteors) {
    if (!m || !fin(m.x) || !fin(m.y)) continue;
    const tt = fin(+m.t) ? Math.max(0, +m.t) : 0;
    const blink = 0.45 + 0.45 * Math.abs(Math.sin(now / (60 + tt * 220)));
    const x = view.sx(m.x), y = view.sy(m.y);
    const R2 = 6 * scale; // SPELLS.meteor.radius
    ctx.strokeStyle = `rgba(255, 80, 40, ${blink})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(x, y, R2, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255, 80, 40, ${0.10 + 0.12 * blink})`;
    ctx.beginPath(); ctx.arc(x, y, R2, 0, Math.PI * 2); ctx.fill();
    // the rock itself, streaking down at the zone (round 20, Remi: "it would
    // be cool if we could see something falling"): position/size lerped from
    // a high offset to the impact point over the telegraph's delay, with a
    // short fiery trail behind it — the impact reads instead of popping.
    const p = Math.min(Math.max(1 - tt / (SPELLS.meteor.delay || 1), 0), 1);
    const fall = 1 - p;                       // 1 = just cast, 0 = impact
    const rx = x + 9 * scale * fall;          // comes in from the upper right
    const ry = y - 26 * scale * fall;
    const rr = (0.55 + 1.05 * p) * scale;     // grows as it nears the ground
    // trail: fading embers strung back along the fall line
    for (let i = 1; i <= 3; i++) {
      const q = Math.min(fall + i * 0.07, 1);
      ctx.fillStyle = `rgba(255, ${150 - i * 30}, 40, ${0.38 - i * 0.1})`;
      ctx.beginPath();
      ctx.arc(x + 9 * scale * q, y - 26 * scale * q, rr * (1 - i * 0.22), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#4a2f22';                // the rock: dark core, hot rim
    ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255, 120, 50, ${0.6 + 0.4 * p})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // --- Mines (round 21.8, SPELLS.nova): a trap on the ground, deliberately
  // READABLE BUT QUIET (Remi: "a bit of a circle — not a red glowing thing").
  // A thin dashed ring at the TRUE trigger radius, a dark stud in the middle,
  // and one ember pip per stored fireball, so "that one is loaded" is visible
  // from across the arena. Tinted with the planter's colour: whose trap it is
  // is public information, exactly like the ring itself.
  const mines = Array.isArray(vs.mines) ? vs.mines : [];
  for (const m of mines) {
    if (!m || !fin(m.x) || !fin(m.y)) continue;
    const x = view.sx(m.x), y = view.sy(m.y);
    const Rm = (fin(+m.r) ? +m.r : 1.32) * scale;
    const n = Math.max(0, Math.round(+m.n) || 0);
    const owner = (Array.isArray(vs.players) ? vs.players : []).find(q => q && q.id === m.owner);
    const tint = (owner && owner.color) || '#c9782f';
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / (n ? 320 : 700)));
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.3 * pulse;
    ctx.strokeStyle = tint;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(x, y, Rm, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1a1114';
    ctx.beginPath(); ctx.arc(x, y, Rm * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = tint;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // loaded: one ember pip per stored ball, orbiting the stud
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2 + now / 900;
      const px = x + Math.cos(ang) * Rm * 0.62, py = y + Math.sin(ang) * Rm * 0.62;
      ctx.fillStyle = `rgba(255, 170, 60, ${0.55 + 0.45 * pulse})`;
      ctx.beginPath(); ctx.arc(px, py, Math.max(1.5, Rm * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- lightning telegraphs: the sky-bolt's impact zone, electric and urgent.
  // Same blink language as the meteor's, but in the bolt's per-level tint —
  // the zone appears the INSTANT of the cast; the dodge window IS the spell.
  const bolts = Array.isArray(vs.bolts) ? vs.bolts : [];
  for (const m of bolts) {
    if (!m || !fin(m.x) || !fin(m.y)) continue;
    const tt = fin(+m.t) ? Math.max(0, +m.t) : 0;
    const blink = 0.5 + 0.5 * Math.abs(Math.sin(now / (40 + tt * 160)));
    const x = view.sx(m.x), y = view.sy(m.y);
    const R2 = SPELLS.lightning.radius * scale;
    const tint = BOLT_TINTS[Math.min(Math.max((+m.level || 1) - 1, 0), 2)];
    ctx.strokeStyle = `rgba(${tint}, ${blink})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(x, y, R2, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(${tint}, ${0.10 + 0.14 * blink})`;
    ctx.beginPath(); ctx.arc(x, y, R2, 0, Math.PI * 2); ctx.fill();
  }

  // --- mirror walls: shimmering reflective lines ---
  const walls = Array.isArray(vs.walls) ? vs.walls : [];
  for (const wl of walls) {
    if (!wl || !fin(wl.x1) || !fin(wl.y1) || !fin(wl.x2) || !fin(wl.y2)) continue;
    const shimmer = 0.65 + 0.3 * Math.sin(t * 6 + wl.x1);
    ctx.strokeStyle = `rgba(160, 225, 255, ${shimmer})`;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(view.sx(wl.x1), view.sy(wl.y1));
    ctx.lineTo(view.sx(wl.x2), view.sy(wl.y2));
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 * shimmer})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // --- move marker ---
  if (moveMark && fin(moveMark.x) && fin(moveMark.y) && now - moveMark.at < 700) {
    const a = 1 - (now - moveMark.at) / 700;
    ctx.strokeStyle = `rgba(127, 176, 105, ${a})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(view.sx(moveMark.x), view.sy(moveMark.y), 6 + 10 * (1 - a), 0, Math.PI * 2);
    ctx.stroke();
  }

  // --- projectiles ---
  for (const pr of projectiles) {
    if (!pr || !fin(pr.x) || !fin(pr.y)) continue;
    const x = view.sx(pr.x), y = view.sy(pr.y);
    if (pr.type === 'fireball') {
      // §12: the layered stack — base → element accents → evolution → event.
      // A mosquito owner's ball is a NORMAL fireball; the element's feedback is
      // the PAIR itself — two balls on the same line, a heartbeat apart.
      const el = pr.elements || null;
      const terraMult = el && el.terra
        ? ELEMENTS.terra.fx.projRadiusMult[Math.min(el.terra, 3) - 1] : 1;
      const r = SPELLS.fireball.radius * terraMult * scale;
      const ang = Math.atan2(fin(pr.vy) ? pr.vy : 0, fin(pr.vx) ? pr.vx : 0);
      // base tint: the strongest rider element, unless an event takes it over
      let core = '#ffab40', coreLv = 0;
      if (el) for (const k in el) if (ELEM_CORE[k] && el[k] > coreLv) { coreLv = el[k]; core = ELEM_CORE[k]; }
      if (pr.engorged) core = '#ff2340';
      // base ball: trail + core glow, both tinted (anger's red core comes from
      // ELEM_CORE — the earned bank never inflates the ball's apparent size)
      const tail = 4;
      const g = ctx.createLinearGradient(x - Math.cos(ang) * r * tail, y - Math.sin(ang) * r * tail, x, y);
      g.addColorStop(0, 'rgba(255, 120, 30, 0)');
      g.addColorStop(1, 'rgba(255, 150, 60, 0.6)');
      ctx.strokeStyle = g; ctx.lineWidth = r * 1.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(ang) * r * tail, y - Math.sin(ang) * r * tail);
      ctx.lineTo(x, y); ctx.stroke();
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
      glow.addColorStop(0, pr.engorged ? '#ffd0d8' : '#fff3c8');
      glow.addColorStop(0.35, core);
      glow.addColorStop(1, pr.engorged ? 'rgba(200, 0, 30, 0)' : 'rgba(255, 90, 20, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill();
      // accents stack: every element the ball carries paints its own tell
      if (el) for (const k in el) {
        const accent = ACCENTS[k];
        if (accent && el[k] > 0) accent(ctx, x, y, r, el[k], ang, t);
      }
      if (pr.engorged) drawEngorged(ctx, x, y, r, t);
    } else if (pr.type === 'swap') {
      // dashed tether from the caster to the swap bolt — the link the trade
      // will travel is VISIBLE (the hook's chain, recolored arcane violet)
      const owner = players.find(p => p && p.id === pr.owner);
      if (owner && fin(owner.x) && fin(owner.y)) {
        ctx.strokeStyle = 'rgba(200, 160, 255, 0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(view.sx(owner.x), view.sy(owner.y));
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const hr = Math.max(9, SPELLS.swap.radius * 2.2 * scale);
      ctx.font = `${Math.round(hr * 2)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🎭', x, y);
      ctx.textBaseline = 'alphabetic';
    } else if (pr.type === 'boomerang') {
      const r = SPELLS.boomerang.radius * 0.9 * scale; // drawn a hair inside the hitbox
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 14);
      ctx.strokeStyle = '#cfe8ff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
      ctx.moveTo(0, -r); ctx.lineTo(0, r);
      ctx.stroke();
      ctx.restore();
    }
  }

  // --- players ---
  for (const pl of players) {
    if (!pl || !pl.alive || !fin(pl.x) || !fin(pl.y)) continue;
    const x = view.sx(pl.x), y = view.sy(pl.y);
    // radius comes from the server (grows with kill lead, shrinks when trailing);
    // drawn slightly larger than the hitbox for readability
    const r = (fin(pl.radius) ? pl.radius : PLAYER.RADIUS) * scale * 1.2;

    // Vanish (SPELLS.vanish): this can only ever be YOUR OWN body — an invisible
    // player has no x/y in anybody else's snapshot, so no other client reaches
    // this line for them. You still need to see yourself to play, so the body
    // goes ghostly and wears a dashed ring plus a countdown; both flash once it
    // is nearly over, which is the "when is it ending" half of the feedback.
    const hidden = fin(pl.vanishT) && pl.vanishT > 0;
    // Statue (SPELLS.statue, round 21.4): for these 2 s the player IS a golden
    // pillar — same column shape as the obsidian ones above, gold palette and a
    // shine, so "that one cannot be hurt and blocks balls" reads at a glance.
    // Name and HP bar stay above it: the pillar is still a player.
    const statue = fin(pl.statueT) && pl.statueT > 0;
    ctx.save();
    if (hidden) {
      const ending = pl.vanishT < 0.5;
      const blink = ending ? 0.35 + 0.35 * (Math.sin(now / 60) > 0 ? 1 : 0) : 0.4;
      ctx.globalAlpha *= blink;   // keep the round-end world fade (line 98)
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = ending ? 'rgba(255, 210, 120, 0.95)' : 'rgba(210, 200, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.55, now / 900, now / 900 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'center';
      ctx.font = '700 11px ui-monospace, Menlo, monospace';
      ctx.fillStyle = ending ? 'rgba(255, 210, 120, 1)' : 'rgba(220, 210, 255, 1)';
      ctx.fillText(`👁️ ${(+pl.vanishT).toFixed(1)}s`, x, y - r - 26);
    }

    // Coal Brazier aura (ITEMS.brazier, round 21.5): a radius-TRUE ring at the
    // exact distance that burns — read straight off the owner's item level, so
    // the client needs no extra wire field. Deliberately faint (a warm fill +
    // a slow breath on the edge): it is on screen for the whole round, so it
    // must never clutter the fight. Drawn UNDER the body, and skipped while
    // vanished — for other clients there is no position to draw at anyway
    // (snapshot strips it), this is the "not even on your own screen" half of
    // Remi's ruling that passive damage must not give stealth away.
    const brazLv = pl.items && pl.items.brazier;
    if (brazLv > 0 && !hidden) {
      const br = itemFxAt('brazier', 'auraR', brazLv) * scale;
      const breath = 0.85 + 0.15 * Math.sin(now / 600);
      ctx.fillStyle = 'rgba(255, 130, 40, 0.055)';
      ctx.beginPath(); ctx.arc(x, y, br, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255, 160, 60, ${0.30 * breath})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, br, 0, Math.PI * 2); ctx.stroke();
    }

    // lava tint / shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.6, r * 1.05, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();

    // body — or, mid-Statue, a gold column in its place
    if (statue) {
      const sr = r * 1.15;
      // warm halo: gold catching the lava light, and the one cue that this
      // column is a player and not scenery
      const halo = ctx.createRadialGradient(x, y, sr * 0.6, x, y, sr * 1.8);
      halo.addColorStop(0, 'rgba(255, 205, 80, 0.30)');
      halo.addColorStop(1, 'rgba(255, 180, 40, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(x, y, sr * 1.8, 0, Math.PI * 2); ctx.fill();
      // the column itself (the obsidian pillar's gradient, gold)
      const g = ctx.createRadialGradient(x - sr * 0.35, y - sr * 0.4, sr * 0.15, x, y, sr);
      g.addColorStop(0, '#fff0b8');
      g.addColorStop(0.5, '#e0a92c');
      g.addColorStop(1, '#7a4e0c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, sr, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(60, 35, 0, 0.75)';
      ctx.stroke();
      // shine: a bright sweep on the upper-left, plus a small glint
      ctx.strokeStyle = 'rgba(255, 248, 210, 0.85)';
      ctx.lineWidth = Math.max(2, sr * 0.16);
      ctx.beginPath(); ctx.arc(x, y, sr * 0.78, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 235, 0.9)';
      ctx.beginPath(); ctx.arc(x - sr * 0.34, y - sr * 0.42, sr * 0.14, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = pl.color;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = pl.id === myId ? '#fff' : 'rgba(0,0,0,0.45)';
      ctx.stroke();
    }
    // liseré rouge: a constant red ring so you can ALWAYS spot yourself
    if (pl.id === myId) {
      ctx.strokeStyle = 'rgba(255, 59, 48, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, r * 1.18, 0, Math.PI * 2); ctx.stroke();
    } else if (myTeam != null && pl.team === myTeam) {
      // …and an ALLY wears the same ring in the team's colour (round 21.3).
      // Your spells pass straight through them, so "don't shoot that one" has
      // to be readable in the arena, not only on the scoreboard. Never drawn in
      // a solo lobby: your own number is unique, so nothing else matches it.
      ctx.strokeStyle = teamTint(myTeam);
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, r * 1.18, 0, Math.PI * 2); ctx.stroke();
    }
    // hood highlight + avatar emoji — a statue has neither: it is stone now,
    // and the status rings below are all things it is immune to anyway
    if (!statue) {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.45, 0, Math.PI * 2); ctx.fill();

      ctx.font = `${Math.round(r * 1.6)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(String(pl.avatar || '🧙'), x, y);
      ctx.textBaseline = 'alphabetic';
    }

    if (pl.inLava && !statue) {
      const fl = 0.5 + 0.5 * Math.sin(t * 20 + x);
      ctx.strokeStyle = `rgba(255, 100, 20, ${0.5 + 0.4 * fl})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * 1.25, 0, Math.PI * 2); ctx.stroke();
    }
    // Hat of Aura burn (round 21.8): the victim smoulders — a thin ember ring
    // that survives leaving the owner's circle, which is the whole point of the
    // linger. Never drawn on the owner: `burning` only ever marks a victim.
    if (pl.burning && !statue) {
      const fl = 0.5 + 0.5 * Math.sin(t * 9 + x);
      ctx.strokeStyle = `rgba(255, 140, 40, ${0.35 + 0.35 * fl})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r * 1.18, 0, Math.PI * 2); ctx.stroke();
    }
    if (pl.slow && !statue) {
      // frost chill: icy blue ring (elemental mode)
      ctx.strokeStyle = 'rgba(140, 200, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, Math.PI * 2); ctx.stroke();
    }
    if (pl.stun && !statue) {
      // frozen solid: a thick ice shell, unmistakable — you cannot act
      ctx.strokeStyle = 'rgba(200, 240, 255, 0.95)';
      ctx.fillStyle = 'rgba(150, 215, 255, 0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * 1.45, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // Malady contagion aura (elemental): the plague's catch radius drawn on
    // the PATIENT — step inside this circle and it is yours. maladyR arrives
    // in world units from the snapshot (the instance's level sizes it).
    if (fin(pl.maladyR) && pl.maladyR > 0) {
      const ar = pl.maladyR * scale;
      const pulse = 0.75 + 0.25 * Math.sin(now / 250);
      ctx.fillStyle = 'rgba(110, 200, 90, 0.10)';
      ctx.beginPath(); ctx.arc(x, y, ar, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(130, 220, 110, ${0.4 * pulse})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, ar, 0, Math.PI * 2); ctx.stroke();
    }
    // Stack pips. Stacks are PRIVATE (round 12), so the snapshot only ever
    // carries YOUR count on an enemy (`myStacks`) and the worst incoming pile on
    // your own body (`stacksOnMe`) — exactly one of the two is ever present,
    // which is why one expression covers both. Frost pips arc over the head,
    // gale's dashes under it, midas right, malady left, anger upper-right.
    const mine = pl.myStacks || pl.stacksOnMe || null;
    if (mine && mine.frost > 0) {
      const of = ELEMENTS.frost.fx.stacksToTrigger;
      for (let i = 0; i < Math.min(mine.frost, of); i++) {
        const ang = -Math.PI / 2 + (i - (of - 1) / 2) * 0.42;
        ctx.fillStyle = 'rgba(168, 216, 255, 0.95)';
        ctx.beginPath();
        ctx.arc(x + Math.cos(ang) * r * 1.6, y + Math.sin(ang) * r * 1.6, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Gale pips: the same "N of 3 and then it pops" reading as frost, drawn as
    // short radial DASHES so a body carrying both is still legible (frost+gale
    // is a legal build — every element stacks with every other).
    //
    // ⚠ They arc BELOW the body, not above with frost's. The band from
    // ~1.65r to ~2.15r above the centre is where the HP bar is (`y - r - 12`,
    // 5 px tall — an ABSOLUTE offset, so it covers that band at every zoom), and
    // the first version of these pips was drawn at 1.9-2.2r and was completely
    // hidden behind it. That is the mosquito scar exactly: computed, on the
    // wire, never visible. Verified by screenshot, not by reading the code.
    if (mine && mine.gale > 0) {
      const ofG = ELEMENTS.gale.fx.stacksToTrigger;
      ctx.strokeStyle = 'rgba(230, 242, 255, 0.95)';
      ctx.lineWidth = 2;
      for (let i = 0; i < Math.min(mine.gale, ofG); i++) {
        const ang = Math.PI / 2 + (i - (ofG - 1) / 2) * 0.5;
        const r0 = r * 1.45, r1 = r * 1.85;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0);
        ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
        ctx.stroke();
      }
    }
    // Midas mark (round 17 §5): this body owes you gold — your next hit
    // cashes it. One gold pip on the RIGHT side: frost owns the top arc and
    // gale the bottom dashes.
    if (mine && mine.midas > 0) {
      ctx.fillStyle = 'rgba(255, 208, 70, 0.95)';
      ctx.strokeStyle = 'rgba(120, 85, 0, 0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x + r * 1.75, y, 3.2, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    // Malady mark (round 19): your first hit planted the 🦠 — your next one
    // infects. One sickly-green pip on the LEFT: midas owns the right, frost
    // the top arc, gale the bottom dashes.
    if (mine && mine.malady > 0) {
      ctx.fillStyle = 'rgba(140, 220, 110, 0.95)';
      ctx.strokeStyle = 'rgba(40, 90, 30, 0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x - r * 1.75, y, 3.2, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    // Anger mark: the hunt is on — this body wears the red orb. Upper-right
    // diagonal (a free slot: frost owns the top arc, gale the bottom dashes,
    // midas the right, malady the left). Shown to the owner (myStacks) and the
    // marked victim (stacksOnMe) alike.
    if (mine && mine.anger > 0) {
      const px = x + r * 1.24, py = y - r * 1.24;
      ctx.fillStyle = 'rgba(255, 70, 55, 0.95)';
      ctx.strokeStyle = 'rgba(110, 10, 10, 0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, 3.4, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // a tiny glint so it reads as an orb, not a dot
      ctx.fillStyle = 'rgba(255, 220, 210, 0.9)';
      ctx.beginPath();
      ctx.arc(px - 1, py - 1, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    if (pl.charging) {
      // repulse wind-up: hard-blinking double ring — VERY visible on purpose
      const on = Math.sin(now / 70) > 0;
      ctx.strokeStyle = on ? 'rgba(255, 230, 120, 0.95)' : 'rgba(255, 120, 40, 0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2); ctx.stroke();
    }
    if (fin(pl.shieldT) && pl.shieldT > 0) {
      ctx.strokeStyle = 'rgba(140, 210, 255, 0.9)';
      ctx.fillStyle = 'rgba(140, 210, 255, 0.14)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // name + hp
    const bw = 46;
    ctx.font = '11px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = pl.id === myId ? '#ffffff' : '#d8cbb2';
    ctx.fillText(String(pl.name ?? ''), x, y - r - 16);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - bw / 2, y - r - 12, bw, 5);
    const rawFrac = (+pl.hp || 0) / (+pl.maxHp || PLAYER.MAX_HP);
    const frac = fin(rawFrac) ? Math.max(0, Math.min(1, rawFrac)) : 0;
    ctx.fillStyle = frac > 0.5 ? '#7fb069' : frac > 0.25 ? '#f0b64a' : '#c0392b';
    ctx.fillRect(x - bw / 2, y - r - 12, bw * frac, 5);
    ctx.restore();   // pairs with the Vanish ghosting save() above
  }

  // --- Trash Talk bubbles (issue #4) ---
  // A separate pass on top of every body, so a line is never half-covered by
  // the player standing in front. Anchored to the live position, and skipped
  // entirely for anyone the snapshot gives no place to draw (an invisible
  // player has no x/y here, so a bubble can never give one away).
  for (const b of bubbles) {
    const pl = players.find(p => p && p.id === b.id);
    if (!pl || !pl.alive || !fin(pl.x) || !fin(pl.y)) continue;
    const age = (now - b.at) / (b.until - b.at);
    if (!(age >= 0 && age <= 1)) continue;
    const alpha = (age > 0.75 ? (1 - age) / 0.25 : 1) * worldAlpha;
    if (alpha <= 0.01) continue;
    const r = (fin(pl.radius) ? pl.radius : PLAYER.RADIUS) * scale * 1.2;
    const x = view.sx(pl.x);
    const y = view.sy(pl.y) - r - 30 - age * 8;   // drifts up as it fades
    const shout = b.text === b.text.toUpperCase();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${shout ? 'bold ' : ''}${shout ? 14 : 12}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const wpx = ctx.measureText(b.text).width + 14;
    const hpx = shout ? 20 : 18;
    ctx.fillStyle = 'rgba(18, 14, 12, 0.82)';
    ctx.strokeStyle = shout ? 'rgba(255, 190, 90, 0.9)' : 'rgba(210, 195, 170, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // roundRect is recent; a browser without it still gets a readable box
    if (ctx.roundRect) ctx.roundRect(x - wpx / 2, y - hpx / 2, wpx, hpx, 7);
    else ctx.rect(x - wpx / 2, y - hpx / 2, wpx, hpx);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();                         // the little tail toward the head
    ctx.moveTo(x - 4, y + hpx / 2);
    ctx.lineTo(x, y + hpx / 2 + 5);
    ctx.lineTo(x + 4, y + hpx / 2);
    ctx.fillStyle = 'rgba(18, 14, 12, 0.82)';
    ctx.fill();
    ctx.fillStyle = shout ? '#ffd28a' : '#e8dcc6';
    ctx.fillText(b.text, x, y);
    ctx.restore();
  }

  // --- fx ---
  drawFx(view, fx, now, worldAlpha);

  ctx.globalAlpha = 1;
  drawBanners(view, vs, players, myId);
}

// The low-res layer: only the drifting lava-blob gradients (by far the most
// expensive paints), at ~1/3 resolution. Base color and level art are drawn
// full-res on the main canvas by draw().
function drawBackdrop(view, worldAlpha, t) {
  const ctx = view.bctx;
  const w = view.back.width, h = view.back.height;
  ctx.clearRect(0, 0, w, h);
  if (worldAlpha <= 0.01) return;
  ctx.globalAlpha = worldAlpha;
  const cx = w / 2, cy = h / 2;
  const maxR = Math.hypot(w, h) / 2;
  for (const b of BLOBS) {
    const ang = b.a + t * b.speed + Math.sin(t * 0.3 + b.phase) * 0.4;
    const rr = b.r * maxR;
    const bx = cx + Math.cos(ang) * rr;
    const by = cy + Math.sin(ang) * rr;
    const size = b.size * maxR * (1 + 0.15 * Math.sin(t * 0.8 + b.phase));
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, size);
    g.addColorStop(0, 'rgba(255, 106, 30, 0.34)');
    g.addColorStop(0.5, 'rgba(200, 50, 8, 0.16)');
    g.addColorStop(1, 'rgba(120, 20, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, by, size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Banner-only path used when the round-end reveal has fully hidden the world.
function drawWorldDone(view, vs, fx, myId, now) {
  if (!vs) return;
  view.ctx.globalAlpha = 1;
  drawBanners(view, vs, Array.isArray(vs.players) ? vs.players : [], myId);
}

function drawBanners(view, vs, players, myId) {
  const { ctx } = view;
  ctx.textAlign = 'center';
  if (vs.phase === 'countdown') {
    const n = Math.ceil(fin(vs.phaseT) ? vs.phaseT : 0);
    ctx.font = 'small-caps 500 26px Georgia, serif';
    ctx.fillStyle = '#e8d9b0';
    ctx.fillText(`Round ${vs.round}`, view.cx, view.cy - 60);
    ctx.font = '700 92px Georgia, serif';
    ctx.fillStyle = '#ff5d1f';
    ctx.shadowColor = '#ff5d1f'; ctx.shadowBlur = 30;
    ctx.fillText(String(n), view.cx, view.cy + 20);
    ctx.shadowBlur = 0;
    // the level's title, small under the count — quotes included
    const lv = currentLevel();
    if (lv && lv.title) {
      ctx.font = 'italic 16px Georgia, serif';
      ctx.fillStyle = '#9a8d80';
      ctx.fillText(`“${lv.title}”`, view.cx, view.cy + 64);
    }
  }
  if (vs.phase === 'roundEnd' && vs.roundSummary && typeof vs.roundSummary === 'object') {
    drawRoundEndBanner(view, vs, players, myId);
  }
  if (vs.phase === 'battle' && vs.me && !vs.me.alive) {
    ctx.font = 'small-caps 500 22px Georgia, serif';
    ctx.fillStyle = 'rgba(232, 217, 176, 0.85)';
    // A player who has never died is a mid-game joiner waiting to be seated.
    const text = vs.me.spectator ? 'Spectating'
      : vs.me.deaths > 0 ? 'You are ash — spectating' : 'You join next round';
    ctx.fillText(text, view.cx, 64);
  }
}

// Round-end banner: "{winner} takes round n" — or, on the final summary, the
// game champion's "{name} wins the game" — plus a personal VICTORY/DEFEAT
// verdict and the gold earned this round (fighters only; spectators get a
// neutral note). Fades in fast, then holds for the rest of the summary.
function drawRoundEndBanner(view, vs, players, myId) {
  const { ctx, w } = view;
  const rs = vs.roundSummary;
  const elapsed = ROUND.SUMMARY_TIME - (fin(vs.phaseT) ? vs.phaseT : 0);
  const alpha = Math.max(0, Math.min(1, elapsed / 0.3));
  const winner = rs.winner != null ? players.find(p => p && p.id === rs.winner) : null;
  let title;
  if (rs.final) {
    // The game is decided on kills, not on who took the last round — and since
    // round 21.3 on TEAM kills against 15 x size, which is rankTeams()' order
    // (a lobby of solo teams ranks identically to the old per-player sort).
    // `!p.clone`: Decoy mirages are drawn from this same list (client/main.js
    // builds them out of their caster's entry), and a mirage must never count
    // as a body in the standings. The sim already clears them at round end —
    // this is the belt-and-braces half.
    const fs = players.filter(p => p && !p.spectator && !p.clone);
    const top = rankTeams(fs)[0];
    const champ = fs.slice().sort((a, b) =>
      (b.kills || 0) - (a.kills || 0) || (a.deaths || 0) - (b.deaths || 0) || (b.gold || 0) - (a.gold || 0))
      .find(p => !top || p.team === top.team);
    title = !top ? 'The game is over'
      : top.size > 1 ? `Team ${top.team} wins the game`
      : champ ? `${champ.name} wins the game` : 'The game is over';
  } else {
    // teams (round 21.3): several survivors mean a TEAM took the round, so the
    // banner names the team rather than reading "nobody survives"
    const team = Array.isArray(rs.winners) ? rs.winners : [];
    title = winner ? `${winner.name} takes round ${rs.n}`
      : team.length > 1 ? `Team ${rs.winTeam} takes round ${rs.n}`
      : `Nobody survives round ${rs.n}`;
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  // dark band so the text stays readable over the arena
  const bandH = 130;
  const band = ctx.createLinearGradient(0, view.cy - bandH, 0, view.cy + bandH);
  band.addColorStop(0, 'rgba(10, 6, 4, 0)');
  band.addColorStop(0.28, 'rgba(10, 6, 4, 0.78)');
  band.addColorStop(0.72, 'rgba(10, 6, 4, 0.78)');
  band.addColorStop(1, 'rgba(10, 6, 4, 0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, view.cy - bandH, w, bandH * 2);

  ctx.textAlign = 'center';
  let size = 42; // shrink to fit long names on narrow screens
  do { ctx.font = `small-caps 500 ${size}px Georgia, serif`; size -= 4; }
  while (size > 18 && ctx.measureText(title).width > w * 0.92);
  ctx.fillStyle = '#e8d9b0';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)'; ctx.shadowBlur = 14;
  ctx.fillText(title, view.cx, view.cy - 34);
  ctx.shadowBlur = 0;

  // my verdict + income — fighters only; a spectator gets a neutral note
  const income = rs.income && typeof rs.income === 'object' ? rs.income : null;
  if (vs.me && vs.me.spectator) {
    if (rs.final) {
      ctx.font = 'small-caps 700 30px Georgia, serif';
      ctx.fillStyle = '#9a8d80';
      ctx.fillText('Game over', view.cx, view.cy + 24);
    }
  } else if (myId && income && fin(+income[myId])) {
    // a surviving TEAMMATE won it too — `winners` is every survivor paid the
    // round-win gold, so the verdict never says "defeat" to a winner
    const won = Array.isArray(rs.winners) ? rs.winners.includes(myId) : rs.winner === myId;
    ctx.font = 'small-caps 700 30px Georgia, serif';
    ctx.fillStyle = won ? '#f0b64a' : '#9a8d80';
    if (won) { ctx.shadowColor = 'rgba(240, 182, 74, 0.5)'; ctx.shadowBlur = 18; }
    ctx.fillText(won ? 'victory' : 'defeat', view.cx, view.cy + 24);
    ctx.shadowBlur = 0;
    ctx.font = '15px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = '#f0b64a';
    ctx.fillText(`+${+income[myId]} gold`, view.cx, view.cy + 56);
    // itemized: exactly where this round's gold came from
    const d = rs.detail && typeof rs.detail === 'object' ? rs.detail[myId] : null;
    if (d && typeof d === 'object') {
      const parts = [];
      if (fin(+d.base) && d.base > 0) parts.push(`${d.base} round`);
      if (fin(+d.kills) && d.kills > 0) parts.push(`${d.kills} kills`);
      if (fin(+d.bounty) && d.bounty > 0) parts.push(`${d.bounty} bounty`);
      if (fin(+d.win) && d.win > 0) parts.push(`${d.win} round win`);
      if (fin(+d.first) && d.first > 0) parts.push(`${d.first} first death`);
      if (parts.length > 1) {
        ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = '#9a8d80';
        ctx.fillText(parts.join(' · '), view.cx, view.cy + 76);
      }
    }
  }
  ctx.restore();
}

function drawFx(view, fx, now, baseAlpha = 1) {
  const { ctx, scale } = view;
  for (const f of fx) {
    if (!f) continue;
    const age = (now - f.at) / 1000;
    const k = age / f.dur;
    if (!fin(k) || k >= 1 || k < 0) continue;
    if (!(fin(f.x) && fin(f.y))) continue; // skip malformed events
    const a = 1 - k;
    switch (f.type) {
      case 'boom': {
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.strokeStyle = `rgba(255, 150, 60, ${a})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, (2 + 26 * k) * scale * 0.28, 0, Math.PI * 2); ctx.stroke();
        const g = ctx.createRadialGradient(x, y, 0, x, y, 2.4 * scale * (0.4 + k));
        g.addColorStop(0, `rgba(255, 220, 140, ${a * 0.8})`);
        g.addColorStop(1, 'rgba(255, 90, 20, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 2.4 * scale * (0.4 + k), 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'boltHit': {
        // the sky-bolt lands: a jagged vertical strike from above, then the
        // blast ring expanding to the zone's true radius (the falloff edge)
        const x = view.sx(f.x), y = view.sy(f.y);
        const tint = BOLT_TINTS[Math.min(Math.max((+f.level || 1) - 1, 0), 2)];
        const top = Math.max(0, y - 190);
        ctx.strokeStyle = `rgba(${tint}, ${a})`;
        ctx.lineWidth = 3 * a + 1;
        ctx.beginPath();
        ctx.moveTo(x, top);
        const segs = 6;
        for (let i = 1; i < segs; i++) {
          const tt = i / segs;
          const jx = (Math.sin(i * 12.9898 + f.at) * 0.5) * 12 * a;
          ctx.lineTo(x + jx, top + (y - top) * tt);
        }
        ctx.lineTo(x, y);
        ctx.stroke();
        const R = (fin(+f.r) ? +f.r : 2.2) * scale;
        ctx.lineWidth = 2.5 * a + 0.5;
        ctx.beginPath(); ctx.arc(x, y, R * (0.3 + 0.7 * k), 0, Math.PI * 2); ctx.stroke();
        const g = ctx.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0, `rgba(255, 255, 255, ${a * 0.7})`);
        g.addColorStop(1, `rgba(${tint}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'hit': {
        const x = view.sx(f.x), y = view.sy(f.y) - 18 - 26 * k;
        // Momentum: the earned ramp is split off the total and printed ABOVE the
        // damage in white. AGENTS.md scar — this element ramped correctly for
        // weeks and still read as broken, because a bigger red number is not a
        // number you can see growing. The white one is the feedback.
        const bonus = +f.bonus || 0;
        const base = (+f.amount || 0) - bonus;
        ctx.font = '700 15px ui-monospace, Menlo, monospace';
        // malady DoT ticks are green; normal hits stay ember-red
        ctx.fillStyle = f.poison ? `rgba(130, 220, 110, ${a})` : `rgba(255, 120, 80, ${a})`;
        ctx.fillText(String(Math.round(base)), x, y);
        if (bonus >= 0.5) {
          ctx.font = '700 13px ui-monospace, Menlo, monospace';
          ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
          ctx.fillText(`+${Math.round(bonus)}`, x, y - 15);
        }
        break;
      }
      case 'lifesteal': {
        // lifesteal payout, on the HEALER's body: a big green "+N hp" and a
        // rising blood ring. Round 16 (Remi): EVERY lifesteal heal >= 1 hp gets
        // this — Blood Sword included — not just vampire's engorged ball. The
        // sword was deliberately silent before and read as broken because of it.
        const x = view.sx(f.x), y = view.sy(f.y) - 22 - 34 * k;
        const amt = Math.round(+f.amount || 0);
        // round 18.1 (Remi): the SIZE carries the magnitude. Round 21.8 (Remi:
        // "everyone has some lifesteal, so 1s and 2s are all over the screen"):
        // the FLOOR dropped 10px → 6px and the curve is now concave, so the
        // crumbs whisper while everything that matters keeps its old presence —
        // +1 6px, +2 9px, +5 12px, +10 15px (was 13), +20 18px, +50 and up 26px,
        // the ceiling unchanged. Revert = the old linear `10 + 16 * amt/50`.
        const px = Math.round(6 + 20 * Math.sqrt(
          Math.min(Math.max(amt - 1, 0), 49) / 49));
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = `700 ${px}px ui-monospace, Menlo, monospace`;
        ctx.fillStyle = `rgba(120, 235, 140, ${a})`;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'; ctx.shadowBlur = 8;
        ctx.fillText(`+${amt} hp`, x, y);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(224, 64, 90, ${a * 0.9})`;
        ctx.lineWidth = 3 * a + 1;
        ctx.beginPath();
        ctx.arc(view.sx(f.x), view.sy(f.y), (1.2 + 2.6 * k) * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'refund': {
        // arcane lv3: a landed fireball just refunded every cooldown — an
        // hourglass over the caster and a ring winding INWARD (time coming back)
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.save();
        ctx.strokeStyle = `rgba(200, 180, 255, ${a})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, (3.2 - 2.0 * k) * scale, 0, Math.PI * 2); ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = '14px serif';
        ctx.fillText('⏳', x, y - 26 - 14 * k);
        ctx.restore();
        break;
      }
      case 'gold': {
        // midas payout: a small "+1g" drifting up in gold
        const x = view.sx(f.x), y = view.sy(f.y) - 10 - 20 * k;
        ctx.font = '700 13px ui-monospace, Menlo, monospace';
        ctx.fillStyle = `rgba(240, 182, 74, ${a})`;
        ctx.fillText(`+${Math.round(+f.amount || 1)}g`, x, y);
        break;
      }
      case 'grow': {
        // brief brown pulse (a stone pillar rising)
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.strokeStyle = `rgba(170, 120, 70, ${a})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, (1.4 + 1.6 * k) * scale, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'rubble': {
        // terra lv3 Demolisher: the pillar shatters. Obsidian shards fly out,
        // decelerate and fade, over a settling dust ring. Fragment angles are
        // derived from `f.at` so the same break looks the same every frame.
        const x = view.sx(f.x), y = view.sy(f.y);
        const R = (fin(+f.r) ? +f.r : 1.6) * scale;
        const ease = 1 - (1 - k) * (1 - k);      // fast out, then settles
        // dust ring, only in the first half
        if (k < 0.5) {
          const da = (1 - k * 2) * 0.45;
          ctx.strokeStyle = `rgba(150, 128, 105, ${da})`;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(x, y, R * (0.7 + 1.5 * k), 0, Math.PI * 2); ctx.stroke();
        }
        for (let i = 0; i < 9; i++) {
          const seed = Math.sin(i * 37.1 + f.at * 0.013) * 43758.5453;
          const rnd = seed - Math.floor(seed);
          const ang = (i / 9) * Math.PI * 2 + rnd * 0.7;
          const reach = R * (0.9 + rnd * 1.3);
          const fx0 = x + Math.cos(ang) * reach * ease;
          const fy0 = y + Math.sin(ang) * reach * ease + R * 0.5 * ease * ease;
          const s = R * (0.16 + rnd * 0.22) * (1 - 0.35 * k);
          ctx.save();
          ctx.translate(fx0, fy0);
          ctx.rotate(ang + k * (1.5 + rnd * 3));
          ctx.fillStyle = `rgba(${52 + rnd * 30 | 0}, ${42 + rnd * 24 | 0}, ${34 + rnd * 20 | 0}, ${a})`;
          ctx.beginPath();
          ctx.moveTo(-s, -s * 0.7); ctx.lineTo(s * 0.9, -s * 0.4);
          ctx.lineTo(s * 0.6, s * 0.8); ctx.lineTo(-s * 0.8, s * 0.5);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = `rgba(255, 150, 70, ${a * 0.35})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
        break;
      }
      case 'death': {
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.font = `${Math.round(18 * scale / 8 + 14)}px serif`;
        ctx.globalAlpha = a * baseAlpha;
        ctx.fillText('💀', x, y - 20 * k);
        ctx.globalAlpha = baseAlpha;
        ctx.strokeStyle = `rgba(200, 60, 30, ${a})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 40 * k, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'kill': {
        // you scored a kill: golden banner rising above the arena center, with
        // a shockwave off the corpse so the hit reads as an event, not a number
        const pop = Math.min(1, k * 7); // snaps to full size in ~0.2 s, then drifts
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = `small-caps 700 ${Math.round(26 + 14 * pop)}px Georgia, serif`;
        ctx.fillStyle = `rgba(240, 182, 74, ${a})`;
        ctx.shadowColor = 'rgba(255, 140, 40, 0.75)'; ctx.shadowBlur = 22;
        ctx.fillText('⚔ kill', view.cx, view.cy - 110 - 30 * k);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(240, 182, 74, ${a * 0.8})`;
        ctx.lineWidth = 4 * a + 1;
        ctx.beginPath();
        ctx.arc(view.sx(f.x), view.sy(f.y), (1 + 5 * k) * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'multikill': {
        // MASSACRE has to feel like one: yours owns the middle of the screen
        // with a red flash behind it, someone else's is a shout over their body
        const pop = Math.min(1, k * 8);
        ctx.save();
        ctx.textAlign = 'center';
        const label = String(f.name || 'Multi Kill');
        if (f.mine) {
          const flash = Math.max(0, 1 - k * 3);
          if (flash > 0) {
            const g = ctx.createRadialGradient(view.cx, view.cy, 0, view.cx, view.cy,
              Math.hypot(view.w, view.h) / 2);
            g.addColorStop(0, 'rgba(192, 57, 43, 0)');
            g.addColorStop(1, `rgba(192, 57, 43, ${0.42 * flash})`);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, view.w, view.h);
          }
          const size = Math.round((34 + 5 * Math.min(+f.n || 2, 6)) * (0.5 + 0.5 * pop));
          ctx.font = `small-caps 700 ${size}px Georgia, serif`;
          ctx.fillStyle = `rgba(255, 236, 200, ${a})`;
          ctx.shadowColor = 'rgba(220, 60, 30, 0.9)'; ctx.shadowBlur = 26;
          ctx.fillText(label, view.cx, view.cy - 150 - 24 * k);
          ctx.shadowBlur = 0;
          ctx.font = '13px ui-monospace, Menlo, monospace';
          ctx.fillStyle = `rgba(240, 182, 74, ${a})`;
          ctx.fillText(`${+f.n || 2} kills in a row`, view.cx, view.cy - 118 - 24 * k);
        } else {
          ctx.font = 'small-caps 700 20px Georgia, serif';
          ctx.fillStyle = `rgba(255, 150, 110, ${a})`;
          ctx.shadowColor = 'rgba(0, 0, 0, 0.85)'; ctx.shadowBlur = 10;
          ctx.fillText(label, view.sx(f.x), view.sy(f.y) - 46 - 22 * k);
          ctx.shadowBlur = 0;
        }
        ctx.restore();
        break;
      }
      case 'frost': {
        // one more stack landed: a thin icy ring plus the count toward the pop
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.save();
        ctx.strokeStyle = `rgba(160, 216, 255, ${a})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, (2.4 - 1.2 * k) * scale, 0, Math.PI * 2); ctx.stroke();
        if (fin(+f.stacks) && fin(+f.of)) {
          ctx.textAlign = 'center';
          ctx.font = '700 12px ui-monospace, Menlo, monospace';
          ctx.fillStyle = `rgba(168, 216, 255, ${a})`;
          ctx.fillText(`❄ ${+f.stacks}/${+f.of}`, x, y - 30 - 14 * k);
        }
        ctx.restore();
        break;
      }
      case 'gale': {
        // one more gust stacked: a thin pale ring and the count toward the burst.
        // Deliberately quieter than frost's — this one fires on EVERY gale hit
        // and the loud cue belongs to the detonation.
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.save();
        ctx.strokeStyle = `rgba(230, 242, 255, ${a * 0.85})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, (2.6 - 1.3 * k) * scale, 0, Math.PI * 2); ctx.stroke();
        if (fin(+f.stacks) && fin(+f.of)) {
          ctx.textAlign = 'center';
          ctx.font = '700 12px ui-monospace, Menlo, monospace';
          ctx.fillStyle = `rgba(230, 242, 255, ${a})`;
          ctx.fillText(`🌪 ${+f.stacks}/${+f.of}`, x, y - 30 - 14 * k);
        }
        ctx.restore();
        break;
      }
      case 'galeBurst': {
        // the 3rd stack spent: a hard expanding shockwave with swept streaks
        // curling off it, plus the word. This is the whole point of the rework —
        // an enormous shove must never arrive without an explanation on screen.
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.save();
        ctx.strokeStyle = `rgba(235, 246, 255, ${a})`;
        ctx.lineWidth = 4 * a + 1;
        ctx.beginPath(); ctx.arc(x, y, (1 + 7 * k) * scale, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 2 * a + 0.5;
        for (let i = 0; i < 7; i++) {
          const ang = (i / 7) * Math.PI * 2 + f.at * 3;
          const r0 = (1.5 + 4.5 * k) * scale, r1 = r0 + 2.2 * scale;
          ctx.beginPath();
          ctx.arc(x, y, (r0 + r1) / 2, ang, ang + 0.7 + 0.6 * k);
          ctx.stroke();
        }
        ctx.textAlign = 'center';
        ctx.font = 'small-caps 700 20px Georgia, serif';
        ctx.fillStyle = `rgba(235, 246, 255, ${a})`;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'; ctx.shadowBlur = 10;
        ctx.fillText('gust!', x, y - 40 - 16 * k);
        ctx.restore();
        break;
      }
      case 'midasMark': {
        // a mark just landed: one quiet gold ring — the LOUD cue is the +1 g
        // popup when it cashes (the existing 'gold' floater)
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.strokeStyle = `rgba(255, 208, 70, ${a * 0.9})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, (2.4 - 1.2 * k) * scale, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'infected': {
        // malady just took a body: one sick green burst + the germ itself —
        // the ongoing state is the aura circle and green tint, this is the
        // one-shot "you caught it" moment
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.save();
        ctx.strokeStyle = `rgba(140, 220, 110, ${a})`;
        ctx.lineWidth = 3 * a + 1;
        ctx.beginPath(); ctx.arc(x, y, (1 + 4 * k) * scale, 0, Math.PI * 2); ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `${Math.round(13 + 6 * k)}px serif`;
        ctx.fillText('🦠', x, y - 18 - 20 * k);
        ctx.restore();
        break;
      }
      case 'angerClaim': {
        // a red mark just got claimed: one hard little red burst + the brand.
        // Small on purpose — the permanent reward lives on the scoreboard tag.
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.save();
        ctx.strokeStyle = `rgba(255, 80, 60, ${a})`;
        ctx.lineWidth = 3 * a + 1;
        ctx.beginPath(); ctx.arc(x, y, (1 + 4 * k) * scale, 0, Math.PI * 2); ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `${Math.round(11 + 5 * k)}px serif`;
        ctx.fillText('🔴', x, y - 18 - 18 * k);
        ctx.restore();
        break;
      }
      case 'frostBreak': {
        // the 3rd stack detonating — shards, and the verdict in words
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.save();
        ctx.strokeStyle = `rgba(200, 240, 255, ${a})`;
        ctx.lineWidth = 3 * a + 1;
        ctx.beginPath(); ctx.arc(x, y, (1 + 5 * k) * scale, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2 + f.at;
          const r0 = (1 + 3.4 * k) * scale, r1 = r0 + 0.9 * scale;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0);
          ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
          ctx.stroke();
        }
        ctx.textAlign = 'center';
        ctx.font = 'small-caps 700 20px Georgia, serif';
        ctx.fillStyle = `rgba(200, 240, 255, ${a})`;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'; ctx.shadowBlur = 10;
        ctx.fillText(f.stun ? 'frozen solid' : 'chilled', x, y - 40 - 16 * k);
        ctx.restore();
        break;
      }
      case 'teleport': {
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.strokeStyle = `rgba(190, 140, 255, ${a})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, (1.6 - 1.2 * k) * scale, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'meteorHit': {
        // impact: heavy expanding shockwave + hot flash
        const x = view.sx(f.x), y = view.sy(f.y);
        const R3 = (fin(+f.r) ? +f.r : 6) * scale;
        ctx.strokeStyle = `rgba(255, 120, 40, ${a})`;
        ctx.lineWidth = 5 * a + 1;
        ctx.beginPath(); ctx.arc(x, y, R3 * (0.4 + 0.8 * k), 0, Math.PI * 2); ctx.stroke();
        const g3 = ctx.createRadialGradient(x, y, 0, x, y, R3);
        g3.addColorStop(0, `rgba(255, 230, 160, ${a * 0.9})`);
        g3.addColorStop(1, 'rgba(255, 90, 20, 0)');
        ctx.fillStyle = g3;
        ctx.beginPath(); ctx.arc(x, y, R3, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'mineHit': {
        // the trap springs: amber shockwave at the true trigger ring
        const x = view.sx(f.x), y = view.sy(f.y);
        const Rn = (fin(+f.r) ? +f.r : 1.32) * scale;
        ctx.strokeStyle = `rgba(255, 190, 60, ${a})`;
        ctx.lineWidth = 4 * a + 1;
        ctx.beginPath(); ctx.arc(x, y, Rn * (0.3 + 0.9 * k), 0, Math.PI * 2); ctx.stroke();
        const gn = ctx.createRadialGradient(x, y, 0, x, y, Rn);
        gn.addColorStop(0, `rgba(255, 235, 170, ${a * 0.8})`);
        gn.addColorStop(1, 'rgba(255, 150, 30, 0)');
        ctx.fillStyle = gn;
        ctx.beginPath(); ctx.arc(x, y, Rn, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'repulse': {
        // RADIUS-TRUE blast ring (round 21.0). `f.r` is the spell's own radius
        // straight off the event: the ring eases out to it in the first third
        // of its life and then HOLDS there, so the circle you see is exactly
        // the circle that got shoved. Short and loud on purpose (0.4 s, set in
        // main.js) — the old ring only reached full size as it faded to zero,
        // so nobody could read the real reach.
        const x = view.sx(f.x), y = view.sy(f.y);
        const R4 = (fin(+f.r) ? +f.r : 9) * scale;
        const e = Math.min(1, k / 0.35);
        const rr = R4 * (1 - (1 - e) * (1 - e));
        if (rr > 0.5) {
          const g4 = ctx.createRadialGradient(x, y, rr * 0.5, x, y, rr);
          g4.addColorStop(0, 'rgba(255, 190, 60, 0)');
          g4.addColorStop(1, `rgba(255, 205, 85, ${a * 0.38})`);
          ctx.fillStyle = g4;
          ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = `rgba(255, 248, 210, ${a})`;
        ctx.lineWidth = 7 * a + 2;
        ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(255, 130, 30, ${a * 0.95})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'catch': {
        // boomerang caught: small contracting ring in the boomerang's color
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.strokeStyle = `rgba(207, 232, 255, ${a})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, (2.2 - 1.6 * k) * scale, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'reflect': {
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.strokeStyle = `rgba(140, 210, 255, ${a})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, (1.8 + 2.5 * k) * scale, 0, Math.PI * 2); ctx.stroke();
        break;
      }
    }
  }
}
