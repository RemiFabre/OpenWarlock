// v15/v16 (issue #13, Ju): the warlock body is a SORCERER — a procedural
// vector character in the player's colour, WC3-Warlock silhouette drawn in
// this game's art style. v16: the ELABORATE pass (his ask): cape, layered
// robe with trim, glowing eyes, a real arm on the staff, lava rim light,
// sparks at the orb. Everything here is paint: the collision circle stays the
// base disc, and the revert path is one flag in render.js (wizardBodies).
//
// Per-player animation state lives here (walk phase, facing, cast flare) and
// is derived every frame from the snapshot the game already sends; nothing in
// this file can change the game.

const ANIM = new Map();   // pl.id -> {px, py, phase, face, flare}

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
  if (!a) { a = { px: x, py: y, phase: Math.random() * 6, face: 1, flare: 0 }; ANIM.set(pl.id, a); }
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
  const breathe = 1 + (moving ? 0 : 0.015 * Math.sin(a.phase * 0.8));
  const H = r * 2.7;                      // full body height above the feet
  const col = pl.color || '#888888';
  const dark = shade(col, 0.5), mid = shade(col, 0.82), lite = shade(col, 1.4);
  const trim = shade(col, 1.8);

  ctx.save();
  ctx.translate(x, y + bob * 0.2);
  ctx.rotate(sway * 0.4 + (moving ? F * 0.05 : 0));   // lean into the walk
  ctx.scale(1, breathe);

  const hem = r * 1.05, shoulder = r * 0.55, sh = -H * 0.62 + bob;
  const k = Math.sin(a.phase * 2) * (moving ? r * 0.10 : r * 0.02);

  // ---- the cape: a darker sheet trailing BEHIND the walk direction
  const drift = (moving ? -F * r * 0.5 : -F * r * 0.15) + Math.sin(a.phase * 1.3) * r * 0.08;
  ctx.beginPath();
  ctx.moveTo(-F * shoulder * 0.7, sh * 1.02);
  ctx.quadraticCurveTo(-F * hem * 0.7 + drift * 0.4, sh * 0.4, drift - F * hem * 0.55, r * 0.05 + k * 0.6);
  ctx.quadraticCurveTo(-F * hem * 0.35, -r * 0.15, -F * shoulder * 0.4, sh * 0.8);
  ctx.closePath();
  ctx.fillStyle = shade(col, 0.32);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // ---- robe: a swaying cone from the shoulders to a wavy hem at the feet
  ctx.beginPath();
  ctx.moveTo(-shoulder, sh);
  ctx.bezierCurveTo(-hem * 0.9, sh * 0.35, -hem, -r * 0.1, -hem * 0.92, 0);
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
  // cloth folds: three soft vertical creases that follow the sway
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1;
  for (const fx0 of [-0.45, 0, 0.42]) {
    ctx.beginPath();
    ctx.moveTo(fx0 * shoulder * 1.4, sh * 0.9);
    ctx.quadraticCurveTo(fx0 * hem * 0.7 + k * 0.8, sh * 0.3, fx0 * hem * 0.85, r * 0.06);
    ctx.stroke();
  }
  // the front slit: a lighter inner tunic showing at the hem's middle
  ctx.beginPath();
  ctx.moveTo(-r * 0.22, sh * 0.5);
  ctx.quadraticCurveTo(-r * 0.18 + k * 0.4, -r * 0.1, -r * 0.3, r * 0.08 - k * 0.4);
  ctx.lineTo(r * 0.3, r * 0.08 - k * 0.4);
  ctx.quadraticCurveTo(r * 0.18 + k * 0.4, -r * 0.1, r * 0.22, sh * 0.5);
  ctx.closePath();
  ctx.fillStyle = shade(col, 1.05);
  ctx.fill();
  // hem trim: the bright galon along the bottom edge
  ctx.strokeStyle = trim;
  ctx.lineWidth = Math.max(1.2, r * 0.09);
  ctx.beginPath();
  ctx.moveTo(-hem * 0.88, -r * 0.02);
  ctx.quadraticCurveTo(-hem * 0.45, r * 0.14 + k, 0, r * 0.08 - k);
  ctx.quadraticCurveTo(hem * 0.45, r * 0.14 + k, hem * 0.88, -r * 0.02);
  ctx.stroke();
  // rim light: the lava warms the robe's lower-left edge
  ctx.strokeStyle = 'rgba(255, 140, 60, 0.4)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-hem * 0.85, -r * 0.06);
  ctx.quadraticCurveTo(-hem * 0.5, r * 0.1 + k * 0.6, -r * 0.1, r * 0.14);
  ctx.stroke();
  // belt / sash with a small clasp
  ctx.strokeStyle = shade(col, 0.4);
  ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.beginPath(); ctx.moveTo(-r * 0.55, sh * 0.55); ctx.lineTo(r * 0.55, sh * 0.55); ctx.stroke();
  ctx.fillStyle = trim;
  ctx.beginPath(); ctx.arc(0, sh * 0.55, r * 0.09, 0, Math.PI * 2); ctx.fill();

  // ---- shoulder pads
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * shoulder * 0.95, sh * 1.0, r * 0.30, r * 0.20, s * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ---- head: a hooded face, glowing eyes under the shadow
  const hy = sh - r * 0.42;
  ctx.fillStyle = '#e8c9a0';                       // face
  ctx.beginPath(); ctx.arc(F * r * 0.06, hy, r * 0.34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(10, 6, 4, 0.55)';          // deep hood shadow
  ctx.beginPath(); ctx.arc(F * r * 0.06, hy - r * 0.10, r * 0.35, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
  // the eyes: two embers in the dark, on the facing side
  ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';
  ctx.beginPath(); ctx.arc(F * r * 0.16, hy - r * 0.03, r * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(F * r * 0.00, hy - r * 0.03, r * 0.05, 0, Math.PI * 2); ctx.fill();

  // ---- the pointed hat, tipping slightly against the walk
  ctx.save();
  ctx.translate(0, hy - r * 0.16);
  ctx.rotate(-sway * 1.4 - F * 0.08);
  ctx.beginPath();
  ctx.moveTo(-r * 0.62, r * 0.10);
  ctx.quadraticCurveTo(0, r * 0.26, r * 0.62, r * 0.10);   // brim
  ctx.lineTo(r * 0.16, -r * 0.16);
  ctx.quadraticCurveTo(r * 0.28, -r * 0.9, F * r * 0.52, -r * 1.05);  // bent tip
  ctx.quadraticCurveTo(-r * 0.12, -r * 0.75, -r * 0.16, -r * 0.16);
  ctx.closePath();
  const hg = ctx.createLinearGradient(-r * 0.6, 0, r * 0.6, 0);
  hg.addColorStop(0, shade(col, 0.4)); hg.addColorStop(0.5, dark); hg.addColorStop(1, shade(col, 0.35));
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.strokeStyle = trim;                          // hat band + buckle
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.beginPath(); ctx.moveTo(-r * 0.36, -r * 0.06); ctx.lineTo(r * 0.36, -r * 0.06); ctx.stroke();
  ctx.fillStyle = lite;
  ctx.beginPath(); ctx.arc(F * r * 0.12, -r * 0.06, r * 0.06, 0, Math.PI * 2); ctx.fill();
  // a warm rim on the hat's lava side
  ctx.strokeStyle = 'rgba(255, 140, 60, 0.3)';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.06); ctx.quadraticCurveTo(-r * 0.3, -r * 0.4, -r * 0.14, -r * 0.6); ctx.stroke();
  ctx.restore();

  // ---- the staff, held on the facing side by a visible hand
  const sx2 = F * r * 0.95, swing = Math.sin(a.phase + Math.PI / 2) * (moving ? r * 0.12 : 0);
  const topX = sx2 + swing, topY = sh - r * 0.75;
  ctx.strokeStyle = '#6b4a2a';
  ctx.lineWidth = Math.max(1.6, r * 0.13);
  ctx.beginPath();
  ctx.moveTo(sx2 * 0.55 + swing * 0.3, r * 0.02);        // butt near the ground
  ctx.lineTo(topX, topY);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 200, 120, 0.25)';         // wood catching light
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(sx2 * 0.55 + swing * 0.3 - 1, r * 0.0); ctx.lineTo(topX - 1, topY); ctx.stroke();
  // the arm: sleeve from the shoulder to a small hand gripping the shaft
  const gx = sx2 * 0.82 + swing * 0.6, gy = sh * 0.72;
  ctx.strokeStyle = mid;
  ctx.lineWidth = Math.max(2.2, r * 0.22);
  ctx.beginPath();
  ctx.moveTo(F * shoulder * 0.8, sh * 0.95);
  ctx.quadraticCurveTo(F * r * 0.75, sh * 0.85, gx, gy);
  ctx.stroke();
  ctx.fillStyle = '#e8c9a0';
  ctx.beginPath(); ctx.arc(gx, gy, r * 0.13, 0, Math.PI * 2); ctx.fill();
  // the claw at the staff's top, cradling the orb
  ctx.strokeStyle = '#4c3520';
  ctx.lineWidth = Math.max(1.2, r * 0.09);
  ctx.beginPath(); ctx.arc(topX, topY - r * 0.1, r * 0.2, Math.PI * 0.15, Math.PI * 0.85, true); ctx.stroke();
  // the orb, flaring on a cast, with two sparks orbiting while hot
  const ox = topX, oy = topY - r * 0.12;
  const flare = 0.45 + a.flare * 0.55;
  const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * (0.28 + a.flare * 0.5));
  og.addColorStop(0, `rgba(255, 240, 200, ${0.9 * flare})`);
  og.addColorStop(0.5, `rgba(255, 160, 70, ${0.7 * flare})`);
  og.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.fillStyle = og;
  ctx.beginPath(); ctx.arc(ox, oy, r * (0.28 + a.flare * 0.5), 0, Math.PI * 2); ctx.fill();
  if (a.flare > 0.05) {
    for (let i = 0; i < 3; i++) {
      const sa = now / 90 + i * (Math.PI * 2 / 3);
      const sr = r * (0.32 + 0.3 * (1 - a.flare));
      ctx.fillStyle = `rgba(255, 220, 140, ${0.8 * a.flare})`;
      ctx.beginPath(); ctx.arc(ox + Math.cos(sa) * sr, oy + Math.sin(sa) * sr * 0.7, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
