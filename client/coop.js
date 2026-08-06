// Co-op campaign — client side.
//
// Deliberately self-contained: this module owns its own DOM node and its own
// inline styling, so adding the campaign costs main.js four small hooks and
// index.html / render.js nothing at all. The simulation already gives every
// campaign enemy the blood-red colour and a monster emoji, so the renderer
// needs no changes to tell friend from foe.
//
// What it draws:
//   · lobby   — what the co-op ruleset is, in one line
//   · countdown — the LEVEL CARD: number, name, and the brief ("here is what
//     is about to happen", which is exactly what Remi asked for)
//   · battle  — a thin status strip: level, monsters left, party standing,
//     reinforcements still to come, rounds left in the run
//   · roundEnd — CLEARED / WIPED, and what that means for the campaign

import { setLevel } from './music.js';

// ---- ruleset cycle ----------------------------------------------------------
// One button, three rulesets. Kept here so main.js only needs the two calls.

export const MODES = ['classic', 'elemental', 'coop'];

export function nextMode(mode) {
  const i = MODES.indexOf(mode);
  return MODES[(i < 0 ? 0 : i + 1) % MODES.length];
}

export function modeLabel(mode) {
  if (mode === 'elemental') return 'Rules: ⚗️ Elemental (experimental)';
  if (mode === 'coop') return 'Rules: 🛡️ Co-op campaign';
  return 'Rules: Classic';
}

export function modeTitle(mode) {
  if (mode === 'elemental')
    return 'Elemental (experimental): after Fireball lv1 the shop offers element upgrades that transform your fireball, plus two experimental combo items. Applies to everyone.';
  if (mode === 'coop')
    return 'Co-op campaign: the whole lobby is ONE team against 10 levels of AI waves. Friendly fire is off. Clear a level to advance, wipe and you retry it — the run has a limited number of rounds. Scales with party size; playable solo.';
  return 'Classic: free-for-all, first to 15 kills.';
}

// ---- level art + music ------------------------------------------------------
// Round n normally means level n. In co-op the LEVEL is what matters (a wipe
// costs you a round but not a level), and the finale plays the intro theme
// over its own artwork — the one special case Remi asked for.

export function applyLevelMusic(s) {
  const fin = Number.isFinite;
  if (s.phase === 'lobby' || s.phase === 'gameover') { setLevel('intro'); return; }
  if (s.coop && fin(+s.coop.level)) {
    const n = +s.coop.level;
    setLevel(n, n >= (s.coop.maxLevel || 10) ? 'intro' : null);
    return;
  }
  setLevel(fin(+s.round) ? +s.round : 1);
}

// ---- HUD --------------------------------------------------------------------

let el = null;
function node() {
  if (el && el.isConnected) return el;
  el = document.getElementById('coopHud');
  if (!el) {
    el = document.createElement('div');
    el.id = 'coopHud';
    el.style.cssText = [
      'position:fixed', 'left:50%', 'transform:translateX(-50%)',
      'top:64px', 'z-index:55', 'pointer-events:none',
      'max-width:min(680px, 92vw)', 'text-align:center',
      'font: 13px/1.45 system-ui, sans-serif', 'color:#e8dcc8',
      'text-shadow:0 1px 3px #000', 'display:none',
    ].join(';');
    document.body.appendChild(el);
  }
  return el;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const box = (inner, accent = '#8b1a1a') =>
  `<div style="display:inline-block;padding:8px 16px;border-radius:10px;
     background:rgba(12,10,10,.72);border:1px solid ${accent};">${inner}</div>`;

// Called on every snapshot. Cheap: it only rewrites the node when the text
// actually changes.
let lastHtml = '';
export function updateCoopHud(s) {
  const n = node();
  const c = s && s.coop;
  if (!c || s.phase === 'lobby' || s.phase === 'gameover') {
    if (n.style.display !== 'none') { n.style.display = 'none'; n.innerHTML = ''; lastHtml = ''; }
    return;
  }
  const title = `Level ${c.level}/${c.maxLevel} — ${esc(c.name)}`;
  let html;
  if (s.phase === 'countdown') {
    html = box(
      `<div style="font-size:19px;color:#f0c674;letter-spacing:.4px">${title}</div>` +
      `<div style="margin-top:6px;max-width:600px">${esc(c.brief)}</div>` +
      `<div style="margin-top:6px;opacity:.72;font-size:12px">${esc(c.roster)}</div>` +
      (c.attempt > 1 ? `<div style="margin-top:4px;color:#e08a5a">Attempt ${c.attempt}</div>` : ''),
      '#f0c674');
  } else if (s.phase === 'roundEnd') {
    const done = c.cleared
      ? (c.level >= c.maxLevel
        ? '<span style="color:#8fe08f">THE CAMPAIGN IS OVER — you are free.</span>'
        : `<span style="color:#8fe08f">LEVEL CLEARED</span> — on to level ${c.level + 1}`)
      : `<span style="color:#e05a5a">PARTY WIPED</span> — level ${c.level} again, ${Math.max(0, c.roundsLeft)} round(s) left`;
    html = box(`<div style="font-size:17px">${done}</div>`, c.cleared ? '#8fe08f' : '#e05a5a');
  } else {
    const pend = c.pending ? ` · <span style="opacity:.75">+${c.pending} incoming</span>` : '';
    html = box(
      `<span style="color:#f0c674">${title}</span> &nbsp; ` +
      `👹 ${c.waveAlive} left${pend} &nbsp;·&nbsp; 🛡️ ${c.partyAlive}/${c.partySize} standing` +
      ` &nbsp;·&nbsp; <span style="opacity:.7">${Math.max(0, c.roundsLeft)} rounds left in the run</span>`);
  }
  if (html !== lastHtml) { lastHtml = html; n.innerHTML = html; }
  n.style.display = '';
}
