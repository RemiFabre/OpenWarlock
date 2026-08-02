// Canvas rendering: lava sea, obsidian platform, warlocks, projectiles, FX.

import { ARENA, PLAYER, ROUND } from '../shared/constants.js';

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
  return {
    canvas, ctx: canvas.getContext('2d'),
    w: 0, h: 0, scale: 1, cx: 0, cy: 0,
    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = window.innerWidth; this.h = window.innerHeight;
      canvas.width = this.w * dpr; canvas.height = this.h * dpr;
      canvas.style.width = this.w + 'px'; canvas.style.height = this.h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.cx = this.w / 2; this.cy = this.h / 2;
      this.scale = Math.min(this.w, this.h) / (2 * (ARENA.START_RADIUS + 9));
    },
    sx(x) { return this.cx + x * this.scale; },
    sy(y) { return this.cy + y * this.scale; },
  };
}

const fin = Number.isFinite;

export function draw(view, vs, fx, myId, moveMark, now) {
  const { ctx, w, h, scale } = view;
  const t = now / 1000;

  // --- lava sea ---
  ctx.fillStyle = '#2b0800';
  ctx.fillRect(0, 0, w, h);
  const maxR = Math.hypot(w, h) / 2;
  for (const b of BLOBS) {
    const ang = b.a + t * b.speed + Math.sin(t * 0.3 + b.phase) * 0.4;
    const rr = b.r * maxR;
    const bx = view.cx + Math.cos(ang) * rr;
    const by = view.cy + Math.sin(ang) * rr;
    const size = b.size * maxR * (1 + 0.15 * Math.sin(t * 0.8 + b.phase));
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, size);
    g.addColorStop(0, 'rgba(255, 106, 30, 0.34)');
    g.addColorStop(0.5, 'rgba(200, 50, 8, 0.16)');
    g.addColorStop(1, 'rgba(120, 20, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, by, size, 0, Math.PI * 2); ctx.fill();
  }

  if (!vs) return;
  const R = (fin(vs.arenaRadius) ? vs.arenaRadius : ARENA.START_RADIUS) * scale;
  const players = Array.isArray(vs.players) ? vs.players : [];
  const projectiles = Array.isArray(vs.projectiles) ? vs.projectiles : [];

  // --- platform ---
  // ghost of the original arena size
  ctx.strokeStyle = 'rgba(255, 140, 60, 0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(view.cx, view.cy, ARENA.START_RADIUS * scale, 0, Math.PI * 2); ctx.stroke();

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
      const r = 1.0 * scale;
      const ang = Math.atan2(fin(pr.vy) ? pr.vy : 0, fin(pr.vx) ? pr.vx : 0);
      // trail
      const g = ctx.createLinearGradient(x - Math.cos(ang) * r * 4, y - Math.sin(ang) * r * 4, x, y);
      g.addColorStop(0, 'rgba(255, 120, 30, 0)');
      g.addColorStop(1, 'rgba(255, 150, 60, 0.6)');
      ctx.strokeStyle = g; ctx.lineWidth = r * 1.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(ang) * r * 4, y - Math.sin(ang) * r * 4);
      ctx.lineTo(x, y); ctx.stroke();
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
      glow.addColorStop(0, '#fff3c8');
      glow.addColorStop(0.35, '#ffab40');
      glow.addColorStop(1, 'rgba(255, 90, 20, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
    } else if (pr.type === 'boomerang') {
      const r = 0.9 * scale;
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
    const r = PLAYER.RADIUS * scale * 1.2; // drawn slightly larger than the hitbox for readability

    // lava tint / shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.6, r * 1.05, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();

    // body
    ctx.fillStyle = pl.color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = pl.id === myId ? '#fff' : 'rgba(0,0,0,0.45)';
    ctx.stroke();
    // hood highlight
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.45, 0, Math.PI * 2); ctx.fill();

    // avatar emoji centered on the body
    ctx.font = `${Math.round(r * 1.6)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(String(pl.avatar || '🧙'), x, y);
    ctx.textBaseline = 'alphabetic';

    if (pl.burn || pl.inLava) {
      const fl = 0.5 + 0.5 * Math.sin(t * 20 + x);
      ctx.strokeStyle = `rgba(255, 100, 20, ${0.5 + 0.4 * fl})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * 1.25, 0, Math.PI * 2); ctx.stroke();
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
  }

  // --- fx ---
  drawFx(view, fx, now);

  // --- canvas banners ---
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
  }
  if (vs.phase === 'roundEnd' && vs.roundSummary && typeof vs.roundSummary === 'object') {
    drawRoundEndBanner(view, vs, players, myId);
  }
  if (vs.phase === 'battle' && vs.me && !vs.me.alive) {
    ctx.font = 'small-caps 500 22px Georgia, serif';
    ctx.fillStyle = 'rgba(232, 217, 176, 0.85)';
    // A player who has never died is a mid-game joiner waiting to be seated.
    const text = vs.me.deaths > 0 ? 'You are ash — spectating' : 'You join next round';
    ctx.fillText(text, view.cx, 64);
  }
}

// Round-end banner: "{winner} takes round n / 10" (or the final round), plus a
// personal VICTORY/DEFEAT verdict and the gold earned this round. Fades in
// fast, then holds for the rest of the summary.
function drawRoundEndBanner(view, vs, players, myId) {
  const { ctx, w } = view;
  const rs = vs.roundSummary;
  const elapsed = ROUND.SUMMARY_TIME - (fin(vs.phaseT) ? vs.phaseT : 0);
  const alpha = Math.max(0, Math.min(1, elapsed / 0.3));
  const winner = rs.winner != null ? players.find(p => p && p.id === rs.winner) : null;
  const where = rs.final ? 'the final round' : `round ${rs.n} / ${ROUND.TOTAL_ROUNDS}`;
  const title = winner ? `${winner.name} takes ${where}`
    : rs.final ? 'Nobody survives the final round' : `Nobody survives round ${rs.n}`;

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

  // my verdict + income (only if I'm actually in this game)
  const income = rs.income && typeof rs.income === 'object' ? rs.income : null;
  if (myId && income && fin(+income[myId])) {
    const won = rs.winner === myId;
    ctx.font = 'small-caps 700 30px Georgia, serif';
    ctx.fillStyle = won ? '#f0b64a' : '#9a8d80';
    if (won) { ctx.shadowColor = 'rgba(240, 182, 74, 0.5)'; ctx.shadowBlur = 18; }
    ctx.fillText(won ? 'victory' : 'defeat', view.cx, view.cy + 24);
    ctx.shadowBlur = 0;
    ctx.font = '15px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = '#f0b64a';
    ctx.fillText(`+${+income[myId]} gold`, view.cx, view.cy + 56);
  }
  ctx.restore();
}

function drawFx(view, fx, now) {
  const { ctx, scale } = view;
  for (const f of fx) {
    if (!f) continue;
    const age = (now - f.at) / 1000;
    const k = age / f.dur;
    if (!fin(k) || k >= 1 || k < 0) continue;
    // beams anchor on x1..y2, everything else on x,y — skip malformed events
    if (f.type === 'beam' ? !(fin(f.x1) && fin(f.y1) && fin(f.x2) && fin(f.y2))
                          : !(fin(f.x) && fin(f.y))) continue;
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
      case 'beam': {
        ctx.strokeStyle = `rgba(160, 220, 255, ${a})`;
        ctx.lineWidth = 3 * a + 1;
        ctx.beginPath();
        const x1 = view.sx(f.x1), y1 = view.sy(f.y1);
        const x2 = view.sx(f.x2), y2 = view.sy(f.y2);
        const segs = 7;
        ctx.moveTo(x1, y1);
        for (let i = 1; i < segs; i++) {
          const tt = i / segs;
          const jx = (Math.sin(i * 12.9898 + f.at) * 0.5) * 10 * a;
          const jy = (Math.sin(i * 78.233 + f.at) * 0.5) * 10 * a;
          ctx.lineTo(x1 + (x2 - x1) * tt + jx, y1 + (y2 - y1) * tt + jy);
        }
        ctx.lineTo(x2, y2);
        ctx.stroke();
        break;
      }
      case 'hit': {
        const x = view.sx(f.x), y = view.sy(f.y) - 18 - 26 * k;
        ctx.font = '700 15px ui-monospace, Menlo, monospace';
        ctx.fillStyle = `rgba(255, 120, 80, ${a})`;
        ctx.fillText(String(Math.round(+f.amount || 0)), x, y);
        break;
      }
      case 'death': {
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.font = `${Math.round(18 * scale / 8 + 14)}px serif`;
        ctx.globalAlpha = a;
        ctx.fillText('💀', x, y - 20 * k);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(200, 60, 30, ${a})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 40 * k, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'teleport': {
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.strokeStyle = `rgba(190, 140, 255, ${a})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, (1.6 - 1.2 * k) * scale, 0, Math.PI * 2); ctx.stroke();
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
