// Canvas rendering: lava sea, obsidian platform, warlocks, projectiles, FX.

import { ARENA, PLAYER, ROUND, SPELLS, ELEMENTS } from '../shared/constants.js';
import { currentLevel } from './music.js';

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
    resize() {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      this.w = window.innerWidth; this.h = window.innerHeight;
      canvas.width = this.w * dpr; canvas.height = this.h * dpr;
      canvas.style.width = this.w + 'px'; canvas.style.height = this.h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.cx = this.w / 2; this.cy = this.h / 2;
      this.scale = Math.min(this.w, this.h) / (2 * (ARENA.START_RADIUS + 9));
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

// Elemental fireball core colors (elemental mode; ember/none keep the classic orange).
const ELEM_CORE = {
  frost: '#8fd8ff', venom: '#8fe08f', gale: '#e6f2ff', midas: '#ffd76a', terra: '#c8935a',
};

export function draw(view, vs, fx, myId, moveMark, now) {
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
      // elemental fireballs (elemental mode) tint the core; terra flies bigger
      const r = SPELLS.fireball.radius *
        (pr.element === 'terra' ? ELEMENTS.terra.fx.projRadiusMult : 1) * scale;
      const core = ELEM_CORE[pr.element] || '#ffab40';
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
      glow.addColorStop(0.35, core);
      glow.addColorStop(1, 'rgba(255, 90, 20, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
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

    if (pl.inLava) {
      const fl = 0.5 + 0.5 * Math.sin(t * 20 + x);
      ctx.strokeStyle = `rgba(255, 100, 20, ${0.5 + 0.4 * fl})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * 1.25, 0, Math.PI * 2); ctx.stroke();
    }
    if (pl.slow) {
      // frost chill: icy blue ring (elemental mode)
      ctx.strokeStyle = 'rgba(140, 200, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, Math.PI * 2); ctx.stroke();
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
    // the game is decided on kills, not on who took the last round
    const champ = players.filter(p => p && !p.spectator).sort((a, b) =>
      (b.kills || 0) - (a.kills || 0) || (a.deaths || 0) - (b.deaths || 0) || (b.gold || 0) - (a.gold || 0))[0];
    title = champ ? `${champ.name} wins the game` : 'The game is over';
  } else {
    title = winner ? `${winner.name} takes round ${rs.n}` : `Nobody survives round ${rs.n}`;
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

function drawFx(view, fx, now, baseAlpha = 1) {
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
        // venom DoT ticks are green; normal hits stay ember-red
        ctx.fillStyle = f.poison ? `rgba(130, 220, 110, ${a})` : `rgba(255, 120, 80, ${a})`;
        ctx.fillText(String(Math.round(+f.amount || 0)), x, y);
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
        // terra: brief brown pulse around the growing target
        const x = view.sx(f.x), y = view.sy(f.y);
        ctx.strokeStyle = `rgba(170, 120, 70, ${a})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, (1.4 + 1.6 * k) * scale, 0, Math.PI * 2); ctx.stroke();
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
