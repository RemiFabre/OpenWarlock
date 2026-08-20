// v15-v19 (issue #13, Ju): the warlock body is a SORCERER — a procedural
// vector character in the player's colour, drawn in this game's art style.
// v19: restyled after Ju's reference (the gilded WC3 warlock): trimmed HOOD
// instead of the pointed hat, gold everywhere (layered shoulder pads, galons,
// buckles), a rune tabard down the front, a chain belt with a skull clasp, a
// horned skull-and-gem staff, and the glowing orb in the OFF hand (that is
// what flares on a cast). Everything here is paint: the collision circle is
// the base disc, and the revert path is one flag in render.js (wizardBodies).

const ANIM = new Map();   // pl.id -> {px, py, phase, face, flare}

export function forgetWizards(liveIds) {
  for (const id of ANIM.keys()) if (!liveIds.has(id)) ANIM.delete(id);
}

function shade(hex, f) {
  const n = /^#([0-9a-f]{6})$/i.exec(String(hex || '#888888'));
  if (!n) return hex;
  const v = parseInt(n[1], 16);
  const c = (b) => Math.max(0, Math.min(255, Math.round(((v >> b) & 255) * f)));
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

const GOLD = '#d4a843', GOLD_DIM = '#8a6c25', GOLD_HOT = '#f4d47a';

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
  const sway = Math.sin(a.phase) * (moving ? 0.09 : 0.02);
  const breathe = 1 + (moving ? 0 : 0.015 * Math.sin(a.phase * 0.8));
  const H = r * 2.8;
  const col = pl.color || '#888888';
  const dark = shade(col, 0.5), mid = shade(col, 0.82), deep = shade(col, 0.35);

  ctx.save();
  ctx.translate(x, y + bob * 0.2);
  ctx.rotate(sway * 0.4 + (moving ? F * 0.05 : 0));
  ctx.scale(1, breathe);

  const hem = r * 1.08, shoulder = r * 0.58, sh = -H * 0.62 + bob;
  const k = Math.sin(a.phase * 2) * (moving ? r * 0.10 : r * 0.02);

  // ---- the cape: deep-toned, trailing behind the walk
  const drift = (moving ? -F * r * 0.5 : -F * r * 0.15) + Math.sin(a.phase * 1.3) * r * 0.08;
  ctx.beginPath();
  ctx.moveTo(-F * shoulder * 0.7, sh * 1.02);
  ctx.quadraticCurveTo(-F * hem * 0.7 + drift * 0.4, sh * 0.4, drift - F * hem * 0.55, r * 0.05 + k * 0.6);
  ctx.quadraticCurveTo(-F * hem * 0.35, -r * 0.15, -F * shoulder * 0.4, sh * 0.8);
  ctx.closePath();
  ctx.fillStyle = deep;
  ctx.fill();
  ctx.strokeStyle = GOLD_DIM;
  ctx.lineWidth = 1;
  ctx.stroke();

  // ---- robe: colour body, gilded hem
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
  // folds
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1;
  for (const fx0 of [-0.45, 0.42]) {
    ctx.beginPath();
    ctx.moveTo(fx0 * shoulder * 1.4, sh * 0.9);
    ctx.quadraticCurveTo(fx0 * hem * 0.7 + k * 0.8, sh * 0.3, fx0 * hem * 0.85, r * 0.06);
    ctx.stroke();
  }
  // double gold galon along the hem (the reference's signature)
  for (const [off, w2] of [[0, Math.max(1.4, r * 0.10)], [r * 0.14, Math.max(1, r * 0.05)]]) {
    ctx.strokeStyle = off === 0 ? GOLD : GOLD_DIM;
    ctx.lineWidth = w2;
    ctx.beginPath();
    ctx.moveTo(-hem * 0.88, -r * 0.02 - off);
    ctx.quadraticCurveTo(-hem * 0.45, r * 0.14 + k - off, 0, r * 0.08 - k - off);
    ctx.quadraticCurveTo(hem * 0.45, r * 0.14 + k - off, hem * 0.88, -r * 0.02 - off);
    ctx.stroke();
  }
  // lava rim light low on the robe
  ctx.strokeStyle = 'rgba(255, 140, 60, 0.35)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-hem * 0.85, -r * 0.06);
  ctx.quadraticCurveTo(-hem * 0.5, r * 0.1 + k * 0.6, -r * 0.1, r * 0.14);
  ctx.stroke();

  // ---- the rune TABARD down the front, gold-edged, runes glinting
  ctx.beginPath();
  ctx.moveTo(-r * 0.24, sh * 1.0);
  ctx.lineTo(r * 0.24, sh * 1.0);
  ctx.lineTo(r * 0.3, r * 0.02 - k * 0.4);
  ctx.lineTo(-r * 0.3, r * 0.02 - k * 0.4);
  ctx.closePath();
  ctx.fillStyle = deep;
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = GOLD_HOT;
  ctx.lineWidth = Math.max(0.8, r * 0.045);
  for (let i = 0; i < 4; i++) {
    const ry = sh * (0.85 - i * 0.22);
    ctx.beginPath();
    ctx.moveTo(-r * 0.08, ry);
    ctx.lineTo(r * (i % 2 ? 0.08 : 0.03), ry + r * 0.07);
    ctx.stroke();
  }

  // ---- the chain belt, skull clasp
  ctx.strokeStyle = GOLD_DIM;
  ctx.lineWidth = Math.max(1.3, r * 0.11);
  ctx.setLineDash([r * 0.1, r * 0.07]);   // chain links
  ctx.beginPath(); ctx.moveTo(-r * 0.6, sh * 0.52); ctx.quadraticCurveTo(0, sh * 0.44, r * 0.6, sh * 0.52); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#e6ddc8';              // the skull clasp
  ctx.beginPath(); ctx.arc(0, sh * 0.48, r * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#241c14';
  ctx.beginPath(); ctx.arc(-r * 0.04, sh * 0.46, r * 0.03, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.04, sh * 0.46, r * 0.03, 0, Math.PI * 2); ctx.fill();

  // ---- layered ORNATE shoulder pads, gold-edged with a spike
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * shoulder * 1.02, sh * 1.02, r * 0.36, r * 0.24, s * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(s * shoulder * 0.92, sh * 1.08, r * 0.24, r * 0.15, s * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = mid;
    ctx.fill();
    ctx.strokeStyle = GOLD_DIM;
    ctx.lineWidth = 1;
    ctx.stroke();
    // the little spike the reference wears
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(s * shoulder * 1.25, sh * 1.05);
    ctx.lineTo(s * shoulder * 1.5, sh * 1.28);
    ctx.stroke();
  }

  // ---- head in a trimmed HOOD (no more pointed hat)
  const hy = sh - r * 0.40;
  // the hood: a colour cowl peaking softly above the head, gold-trimmed rim
  ctx.beginPath();
  ctx.moveTo(-r * 0.52, hy + r * 0.28);
  ctx.quadraticCurveTo(-r * 0.62, hy - r * 0.35, -r * 0.1, hy - r * 0.62);
  ctx.quadraticCurveTo(F * r * 0.25, hy - r * 0.75, r * 0.28, hy - r * 0.5);
  ctx.quadraticCurveTo(r * 0.58, hy - r * 0.2, r * 0.52, hy + r * 0.28);
  ctx.closePath();
  const hgr = ctx.createLinearGradient(-r * 0.5, hy, r * 0.5, hy);
  hgr.addColorStop(0, shade(col, 0.42)); hgr.addColorStop(0.55, dark); hgr.addColorStop(1, shade(col, 0.3));
  ctx.fillStyle = hgr;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // the face opening, gold-rimmed, shadowed inside, ember eyes
  ctx.beginPath();
  ctx.ellipse(F * r * 0.08, hy + r * 0.02, r * 0.30, r * 0.34, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#17100c';
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.stroke();
  ctx.fillStyle = '#c9a685';              // the lit lower face
  ctx.beginPath();
  ctx.ellipse(F * r * 0.08, hy + r * 0.12, r * 0.22, r * 0.16, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';   // ember eyes in the dark
  ctx.beginPath(); ctx.arc(F * r * 0.18, hy - r * 0.02, r * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(F * r * 0.00, hy - r * 0.02, r * 0.05, 0, Math.PI * 2); ctx.fill();

  // ---- the horned skull STAFF on the facing side
  const swing = Math.sin(a.phase + Math.PI / 2) * (moving ? r * 0.12 : 0);
  const sx2 = F * r * 0.95;
  const topX = sx2 + swing, topY = sh - r * 0.9;
  ctx.strokeStyle = '#5a4326';
  ctx.lineWidth = Math.max(1.7, r * 0.14);
  ctx.beginPath();
  ctx.moveTo(sx2 * 0.55 + swing * 0.3, r * 0.02);
  ctx.lineTo(topX, topY);
  ctx.stroke();
  ctx.strokeStyle = GOLD_DIM;             // gold banding on the shaft
  ctx.lineWidth = 1;
  for (const f2 of [0.3, 0.55, 0.8]) {
    const bx2 = sx2 * 0.55 + swing * 0.3 + (topX - sx2 * 0.55 - swing * 0.3) * f2;
    const by2 = r * 0.02 + (topY - r * 0.02) * f2;
    ctx.beginPath(); ctx.moveTo(bx2 - r * 0.09, by2); ctx.lineTo(bx2 + r * 0.09, by2); ctx.stroke();
  }
  // the arm: sleeve + hand gripping the shaft
  const gx = sx2 * 0.82 + swing * 0.6, gy = sh * 0.72;
  ctx.strokeStyle = mid;
  ctx.lineWidth = Math.max(2.2, r * 0.22);
  ctx.beginPath();
  ctx.moveTo(F * shoulder * 0.8, sh * 0.95);
  ctx.quadraticCurveTo(F * r * 0.75, sh * 0.85, gx, gy);
  ctx.stroke();
  ctx.strokeStyle = GOLD;                 // gold cuff
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(gx, gy, r * 0.16, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#c9a685';
  ctx.beginPath(); ctx.arc(gx, gy, r * 0.12, 0, Math.PI * 2); ctx.fill();
  // curved gold horns cradling a skull with a gem
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = Math.max(1.4, r * 0.11);
  ctx.beginPath(); ctx.arc(topX - r * 0.16, topY - r * 0.18, r * 0.26, Math.PI * 0.5, Math.PI * 1.65); ctx.stroke();
  ctx.beginPath(); ctx.arc(topX + r * 0.16, topY - r * 0.18, r * 0.26, Math.PI * 1.35, Math.PI * 0.5); ctx.stroke();
  ctx.fillStyle = '#e6ddc8';              // the skull
  ctx.beginPath(); ctx.arc(topX, topY - r * 0.16, r * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#241c14';
  ctx.beginPath(); ctx.arc(topX - r * 0.05, topY - r * 0.18, r * 0.035, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(topX + r * 0.05, topY - r * 0.18, r * 0.035, 0, Math.PI * 2); ctx.fill();
  const gem = 0.6 + 0.4 * Math.sin(now / 500);   // the gem between the horns
  ctx.fillStyle = `rgba(190, 120, 255, ${0.5 + 0.4 * gem})`;
  ctx.beginPath(); ctx.arc(topX, topY - r * 0.42, r * 0.07, 0, Math.PI * 2); ctx.fill();

  // ---- the glowing ORB floating over the OFF hand: the cast lives here
  const ox = -F * r * 0.85 - swing * 0.4, oy = sh * 0.62;
  ctx.strokeStyle = mid;                  // the off arm reaching out
  ctx.lineWidth = Math.max(2, r * 0.2);
  ctx.beginPath();
  ctx.moveTo(-F * shoulder * 0.8, sh * 0.95);
  ctx.quadraticCurveTo(-F * r * 0.7, sh * 0.8, ox, oy + r * 0.22);
  ctx.stroke();
  ctx.fillStyle = '#c9a685';
  ctx.beginPath(); ctx.arc(ox, oy + r * 0.22, r * 0.11, 0, Math.PI * 2); ctx.fill();
  const flare = 0.5 + a.flare * 0.5;
  const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * (0.3 + a.flare * 0.55));
  og.addColorStop(0, `rgba(255, 240, 200, ${0.95 * flare})`);
  og.addColorStop(0.5, `rgba(255, 160, 70, ${0.75 * flare})`);
  og.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.fillStyle = og;
  ctx.beginPath(); ctx.arc(ox, oy, r * (0.3 + a.flare * 0.55), 0, Math.PI * 2); ctx.fill();
  if (a.flare > 0.05) {
    for (let i = 0; i < 3; i++) {
      const sa = now / 90 + i * (Math.PI * 2 / 3);
      const sr = r * (0.34 + 0.3 * (1 - a.flare));
      ctx.fillStyle = `rgba(255, 220, 140, ${0.8 * a.flare})`;
      ctx.beginPath(); ctx.arc(ox + Math.cos(sa) * sr, oy + Math.sin(sa) * sr * 0.7, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
