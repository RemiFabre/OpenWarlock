// v15 (issue #13, Ju): the warlock body is a SORCERER now — a procedural
// vector character in the player's colour, WC3-Warlock silhouette but drawn in
// this game's art style (his ask: "des sorciers", "qualité actuelle").
// Everything here is paint: the collision circle stays the base disc, and the
// revert path is one flag in render.js (wizardBodies).
//
// Per-player animation state lives here (walk phase, facing, cast flare) and
// is derived every frame from the snapshot the game already sends; nothing in
// this file can change the game.

const ANIM = new Map();   // pl.id -> {px, py, phase, face, flare, at}

export function forgetWizards(liveIds) {
  for (const id of ANIM.keys()) if (!liveIds.has(id)) ANIM.delete(id);
}

function shade(hex, f) {
  // player colours are '#rrggbb'; f<1 darkens, f>1 brightens (clamped)
  const n = /^#([0-9a-f]{6})$/i.exec(String(hex || '#888888'));
  if (!n) return hex;
  const v = parseInt(n[1], 16);
  const c = (b) => Math.max(0, Math.min(255, Math.round(((v >> b) & 255) * f)));
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

// dt is real seconds since the last frame (capped upstream); cast=true the
// frame one of their projectiles appeared, so the staff flares.
export function drawWizard(ctx, pl, x, y, r, T, dt, { cast = false, now = 0 } = {}) {
  let a = ANIM.get(pl.id);
  if (!a) { a = { px: x, py: y, phase: 0, face: 1, flare: 0, bob: 0 }; ANIM.set(pl.id, a); }
  const mvx = x - a.px, mvy = y - a.py;
  const speed = Math.hypot(mvx, mvy) / Math.max(dt, 1 / 120);
  const moving = speed > r * 0.35;
  if (Math.abs(mvx) > 0.3) a.face = Math.sign(mvx);
  a.px = x; a.py = y;
  a.phase += dt * (moving ? Math.min(14, 6 + speed / (r * 2)) : 2.2);
  if (cast) a.flare = 1;
  a.flare = Math.max(0, a.flare - dt * 3);

  const F = a.face;                       // -1 left, 1 right
  const bob = Math.sin(a.phase) * (moving ? r * 0.10 : r * 0.035);
  const sway = Math.sin(a.phase) * (moving ? 0.09 : 0.02);   // robe lean, rad
  const H = r * 2.7;                      // full body height above the feet
  const col = pl.color || '#888888';
  const dark = shade(col, 0.55), mid = shade(col, 0.8), lite = shade(col, 1.35);

  ctx.save();
  ctx.translate(x, y + bob * 0.2);
  ctx.rotate(sway * 0.4);

  // ---- robe: a swaying cone from the shoulders to a wavy hem at the feet
  const hem = r * 1.05, shoulder = r * 0.52, sh = -H * 0.62 + bob;
  ctx.beginPath();
  ctx.moveTo(-shoulder, sh);
  ctx.bezierCurveTo(-hem * 0.9, sh * 0.35, -hem, -r * 0.1, -hem * 0.92, 0);
  // the hem: three soft scallops that swing with the walk
  const k = Math.sin(a.phase * 2) * (moving ? r * 0.10 : r * 0.02);
  ctx.quadraticCurveTo(-hem * 0.45, r * 0.16 + k, 0, r * 0.10 - k);
  ctx.quadraticCurveTo(hem * 0.45, r * 0.16 + k, hem * 0.92, 0);
  ctx.bezierCurveTo(hem, -r * 0.1, hem * 0.9, sh * 0.35, shoulder, sh);
  ctx.closePath();
  const g = ctx.createLinearGradient(-hem, 0, hem, 0);
  g.addColorStop(0, dark); g.addColorStop(0.45, mid); g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.stroke();
  // a warm hem light: the lava glows up onto every robe
  ctx.strokeStyle = 'rgba(255, 140, 60, 0.35)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-hem * 0.8, r * 0.02 + k * 0.5);
  ctx.quadraticCurveTo(0, r * 0.22 + k, hem * 0.8, r * 0.02 - k * 0.5);
  ctx.stroke();
  // belt / sash
  ctx.strokeStyle = shade(col, 0.4);
  ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.beginPath(); ctx.moveTo(-r * 0.55, sh * 0.55); ctx.lineTo(r * 0.55, sh * 0.55); ctx.stroke();

  // ---- head: a hooded face under the hat
  const hy = sh - r * 0.42;
  ctx.fillStyle = '#e8c9a0';                       // face
  ctx.beginPath(); ctx.arc(F * r * 0.06, hy, r * 0.34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';              // hood shadow over the eyes
  ctx.beginPath(); ctx.arc(F * r * 0.06, hy - r * 0.12, r * 0.34, Math.PI, 0); ctx.fill();

  // ---- the pointed hat, tipping slightly against the walk
  ctx.save();
  ctx.translate(0, hy - r * 0.16);
  ctx.rotate(-sway * 1.4 - F * 0.08);
  ctx.beginPath();
  ctx.moveTo(-r * 0.58, r * 0.10);
  ctx.quadraticCurveTo(0, r * 0.24, r * 0.58, r * 0.10);   // brim
  ctx.lineTo(r * 0.16, -r * 0.16);
  ctx.quadraticCurveTo(r * 0.28, -r * 0.9, F * r * 0.5, -r * 1.05);  // bent tip
  ctx.quadraticCurveTo(-r * 0.12, -r * 0.75, -r * 0.16, -r * 0.16);
  ctx.closePath();
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.strokeStyle = lite;                          // hat band
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.beginPath(); ctx.moveTo(-r * 0.34, -r * 0.06); ctx.lineTo(r * 0.34, -r * 0.06); ctx.stroke();
  ctx.restore();

  // ---- the staff, held on the facing side; its orb flares on a cast
  const sx2 = F * r * 0.95, swing = Math.sin(a.phase + Math.PI / 2) * (moving ? r * 0.12 : 0);
  ctx.strokeStyle = '#6b4a2a';
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.beginPath();
  ctx.moveTo(sx2 * 0.6 + swing * 0.3, sh * 0.4);
  ctx.lineTo(sx2 + swing, sh - r * 0.75);
  ctx.stroke();
  const ox = sx2 + swing, oy = sh - r * 0.85;
  const flare = 0.45 + a.flare * 0.55;
  const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * (0.28 + a.flare * 0.5));
  og.addColorStop(0, `rgba(255, 240, 200, ${0.9 * flare})`);
  og.addColorStop(0.5, `rgba(255, 160, 70, ${0.7 * flare})`);
  og.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.fillStyle = og;
  ctx.beginPath(); ctx.arc(ox, oy, r * (0.28 + a.flare * 0.5), 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}
