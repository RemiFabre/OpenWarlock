// Client: networking, interpolation, input, DOM HUD. Rendering in render.js.

import {
  SPELLS, ITEMS, ITEM_FX, ELEMENTS, BOTS, BUILDS,
  SNAPSHOT_RATE, ARENA, ROUND, GOLD, PLAYER, LAVA, itemCost,
} from '../shared/constants.js';
import { itemFxAt } from '../shared/items.js';
import { makeView, draw } from './render.js';
import { initSfx, playSfx, isMuted, setMuted } from './sfx.js';
import { initMusic, setLevel, setMusicMuted, isMusicMuted } from './music.js';
import {
  nextMode, modeLabel, modeTitle, applyLevelMusic, updateCoopHud,
} from './coop.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const view = makeView(canvas);
view.resize();
window.addEventListener('resize', () => view.resize());

const ICONS = {
  fireball: '🔥', lightning: '⚡', boomerang: '🪃',
  teleport: '🌀', shield: '🛡️', rush: '💨', pillar: '🗿', vanish: '👁️',
  meteor: '☄️', hook: '🪝', repulse: '💥', wall: '🪞',
  boots: '👢', treads: '🥾', amulet: '❤️', ring: '💍', cape: '🧣', sword: '🗡️',
  echo: '🔁', crown: '👑',
};
// Elements that are NOT fireball riders (mirrors GLOBAL_ELEMENTS in shared/sim.js):
// they badge every owned spell slot instead of the fireball, because that is
// where you actually see them working. Arcane = flat CDR, chronos = CDR on hit.
const GLOBAL_ELEM = new Set(['arcane', 'chronos']);
// ---- key bindings (rebindable, persisted) ----------------------------------

// Defaults per Remi 2026-08-03: blink (teleport) on F, dash (rush) on E,
// boomerang moves to R. Saved custom bindings in localStorage still win.
// ⚠ THIS is the source of truth for hotkeys, not SPELLS[key].hotkey (which is
// vestigial — its only other use is being excluded from tooltips). Every spell in
// SPELLS needs an entry in BOTH presets: refreshKeyUi() walks Object.keys(SPELLS)
// and calls keyLabel() on the binding, so a missing one throws on load and the
// client comes up blank. Add the spell here in the same commit you add it there.
const KEY_PRESETS = {
  qwerty: { fireball: 'q', lightning: 'w', boomerang: 'r', teleport: 'f', shield: 'd', rush: 'e',
            pillar: 's', vanish: 'v', meteor: 't', hook: 'g', repulse: 'x', wall: 'c' },
  azerty: { fireball: 'a', lightning: 'z', boomerang: 'r', teleport: 'f', shield: 'd', rush: 'e',
            pillar: 's', vanish: 'v', meteor: 't', hook: 'g', repulse: 'x', wall: 'c' },
};

function loadKeys() {
  const b = { ...KEY_PRESETS.qwerty };
  try {
    const saved = JSON.parse(localStorage.getItem('owKeys') || '{}');
    for (const spell of Object.keys(b))
      if (typeof saved[spell] === 'string' && saved[spell]) b[spell] = saved[spell].toLowerCase();
  } catch { /* corrupt storage — fall back to defaults */ }
  return b;
}
let keyBindings = loadKeys();
function saveKeys() { try { localStorage.setItem('owKeys', JSON.stringify(keyBindings)); } catch { } }
function spellForKey(k) {
  for (const [spell, key] of Object.entries(keyBindings)) if (key === k) return spell;
  return null;
}
function keyLabel(k) { return k.length === 1 ? k.toUpperCase() : k; }

// ---- avatar -----------------------------------------------------------------

const AVATARS = ['🧙', '🧙‍♀️', '🧝', '🧛', '🧞‍♂️', '🦊', '🐸', '👻', '🎃', '🤖', '🦉', '🐢'];
let myAvatar = localStorage.getItem('owAvatar') || AVATARS[0];
if (!AVATARS.includes(myAvatar)) myAvatar = AVATARS[0];

// ---- state ----------------------------------------------------------------

let ws = null, myId = null;
const snaps = [];          // {at, s} ring buffer
const fx = [];             // visual effects
window.__fx = fx;          // test/debug hook: lets a test inject one to look at
let moveMark = null;
const mouse = { x: 0, y: 0 };
let lastUiUpdate = 0;
let goPinned = false;      // final standings stay up until you dismiss them

function me(s) { return (s && myId && s.players && s.players[myId]) || null; }
function latest() { return snaps.length ? snaps[snaps.length - 1].s : null; }

// ---- error surfacing --------------------------------------------------------
// Any uncaught error shows a visible banner instead of silently freezing the
// game; the rAF loop below also survives per-frame exceptions.

let lastErrMsg = '', lastErrAt = 0;
function reportError(where, err) {
  const msg = `[${where}] ${(err && (err.stack || err.message)) || err}`;
  console.error('warlock error', where, err);
  const now = Date.now();
  if (msg === lastErrMsg && now - lastErrAt < 5000) return; // don't respam the banner
  lastErrMsg = msg; lastErrAt = now;
  const el = $('errbanner');
  el.textContent = msg;
  el.classList.remove('hidden');
}
$('errbanner').addEventListener('click', () => $('errbanner').classList.add('hidden'));
window.addEventListener('error', (e) => reportError('script', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => reportError('promise', e.reason));

function setConnBanner(msg) {
  const el = $('connbanner');
  if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

// ---- networking -------------------------------------------------------------

let joinedName = null;     // name we joined with; non-null enables auto-reconnect
let reconnectTimer = null;

function connect(name) {
  joinedName = name;
  clearTimeout(reconnectTimer); reconnectTimer = null;
  let sock;
  try {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    sock = new WebSocket(`${proto}://${location.host}`);
  } catch (err) { reportError('socket', err); scheduleReconnect(); return; }
  ws = sock;
  sock.onopen = () => { if (ws === sock) send({ t: 'join', name, avatar: myAvatar }); };
  sock.onmessage = (ev) => {
    if (ws !== sock) return;
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'welcome') {
      myId = m.id;
      snaps.length = 0; fx.length = 0; // drop state from any previous connection
      setConnBanner(null);
      $('join').classList.add('hidden');
    } else if (m.t === 'snap' && m.s && typeof m.s === 'object' && m.s.players) {
      snaps.push({ at: performance.now(), s: m.s });
      if (snaps.length > 40) snaps.shift();
      if (Array.isArray(m.e)) for (const e of m.e) if (e && typeof e === 'object') onEvent(e);
      window.__phase = m.s.phase; // test/debug hook
    } else if (m.t === 'denied') {
      toast(m.reason);
      // kicked or banned: stop the auto-reconnect loop and show the join
      // screen again — otherwise this tab would hammer the server forever
      if (/kicked|banned/.test(String(m.reason || ''))) {
        joinedName = null;
        clearTimeout(reconnectTimer); reconnectTimer = null;
        myId = null;
        $('join').classList.remove('hidden');
      }
    }
  };
  sock.onerror = () => {}; // close always follows; handled there
  sock.onclose = () => {
    if (ws !== sock) return;
    setConnBanner('Connection lost — reconnecting…');
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (joinedName != null) connect(joinedName);
  }, 2000);
}

function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

// Floating popups (damage, +1 g, lifesteal, frost pips…) that arrive at the SAME
// spot in the SAME frame must read as N events, not one. Exactly overlapping
// numbers are indistinguishable from a single hit, and since 2026-08-07 that is
// not a corner case: the mosquito proc lands `procBalls` fireballs together on
// purpose, and Remi's requirement for it is literally *"clearly see all the
// on-hit indicators pop twice (for example seeing +1 gold twice)"*. So each extra
// copy is fanned sideways (alternating, growing) and delayed a couple of frames,
// which is what makes the second one legible as a second thing.
const FLOAT_STAGGER_MS = 70;   // ~2 frames at 30 Hz
const FLOAT_FAN = 1.15;        // world units sideways per extra copy
function pushFloater(e, type, dur, now) {
  let n = 0;
  for (const f of fx) {
    if (!f || f.type !== type || now - f.at > FLOAT_STAGGER_MS * 4) continue;
    if (Math.hypot((f.ax ?? f.x) - e.x, (f.ay ?? f.y) - e.y) < 1.5) n++;
  }
  const side = n % 2 ? -1 : 1, step = Math.ceil(n / 2);
  fx.push({
    ...e, type, dur,
    at: now + n * FLOAT_STAGGER_MS,
    ax: e.x, ay: e.y,                     // anchor: where the event really was
    x: e.x + side * step * FLOAT_FAN, y: e.y,
  });
}

function onEvent(e) {
  const now = performance.now();
  switch (e.t) {
    case 'boom': fx.push({ ...e, type: 'boom', at: now, dur: 0.4 }); playSfx('boom'); break;
    case 'beam': fx.push({ ...e, type: 'beam', at: now, dur: 0.3 }); playSfx('zap'); break;
    case 'hit': if (e.amount >= 1) pushFloater(e, 'hit', 0.8, now); break;
    case 'death':
      fx.push({ ...e, type: 'death', at: now, dur: 1.6 });
      playSfx('death');
      if (e.killer && myId && e.killer === myId) {
        // that was YOUR kill — celebrate it
        fx.push({ ...e, type: 'kill', at: now, dur: 1.4 });
        playSfx('kill');
      }
      window.__deaths = (window.__deaths || 0) + 1; // test/debug hook
      break;
    case 'teleport': fx.push({ ...e, type: 'teleport', at: now, dur: 0.45 }); playSfx('teleport'); break;
    case 'reflect': fx.push({ ...e, type: 'reflect', at: now, dur: 0.4 }); playSfx('reflect'); break;
    case 'catch':
      fx.push({ ...e, type: 'catch', at: now, dur: 0.35 });
      if (e.id === myId) playSfx('catch'); // your snag, your snap
      break;
    case 'cast':
      if (e.spell === 'rush') fx.push({ x: e.x, y: e.y, type: 'teleport', at: now, dur: 0.3 });
      if (e.spell === 'fireball') playSfx('whoosh');
      break;
    // midas / bounty payout. Fanned: "+1 g twice" is Remi's named acceptance
    // criterion for the mosquito proc, and two identical popups on one pixel is
    // exactly the thing that reads as "+1 g once".
    case 'gold': pushFloater(e, 'gold', 0.9, now); break;
    case 'grow': fx.push({ ...e, type: 'grow', at: now, dur: 0.5 }); break;       // terra pulse
    case 'meteorHit': fx.push({ ...e, type: 'meteorHit', at: now, dur: 0.7 }); playSfx('boom'); playSfx('death'); break;
    case 'hooked': fx.push({ ...e, type: 'teleport', at: now, dur: 0.45 }); playSfx('zap'); break;
    case 'repulse': fx.push({ ...e, type: 'repulse', at: now, dur: 0.5 }); playSfx('boom'); break;
    case 'pillarUp': fx.push({ ...e, type: 'grow', at: now, dur: 0.5 }); playSfx('buy'); break;
    case 'wallUp': fx.push({ ...e, type: 'reflect', at: now, dur: 0.5 }); playSfx('reflect'); break;
    case 'multikill': {
      // yours takes over the middle of the screen; someone else's is a smaller
      // shout above their body, so you still read who is on a tear
      const mine = !!(myId && e.id === myId);
      fx.push({ ...e, type: 'multikill', mine, at: now, dur: mine ? 1.9 : 1.2 });
      if (mine) playSfx('multikill', e.n);
      break;
    }
    case 'frost': pushFloater(e, 'frost', 0.7, now); break;
    // gale: a gust stacked. Silent on purpose — it fires on every gale hit, and
    // a sound on each one would drown the burst it is counting down to.
    case 'gale': pushFloater(e, 'gale', 0.7, now); break;
    // mosquito: the trap just sprang. One cue for the CAUSE, then the doubled
    // on-hit indicators (two damage numbers, two +1 g…) show the effect — without
    // this you see the payoff and never learn what triggered it.
    case 'biteHit': fx.push({ ...e, type: 'biteHit', at: now, dur: 0.6 }); break;
    // vampire: the engorged ball just paid out. Loud on purpose — this element's
    // whole design goal is "an EVENT, not a passive trickle"
    case 'lifesteal':
      pushFloater(e, 'lifesteal', 1.1, now);
      if (e.id === myId) playSfx('drain');
      break;
    // chronos: your cooldowns just jumped back
    case 'chronos':
      pushFloater(e, 'chronos', 0.55, now);
      if (e.id === myId) playSfx('rewind');
      break;
    // Vanish: the server only ever sends this to the player who cast it
    // (viewEvents strips events anchored on a hidden player), so this fx and its
    // sound are self-only by construction — do NOT add a fallback that draws it
    // for everyone, that is the leak the whole feature is about.
    case 'vanish':
      fx.push({ ...e, type: 'teleport', at: now, dur: 0.45 });
      if (e.id === myId) playSfx('teleport');
      break;
    case 'frostBreak':
      fx.push({ ...e, type: 'frostBreak', at: now, dur: 0.8 });
      playSfx('freeze');
      break;
    // gale: the 3rd stack detonated. The one loud cue this element gets, and the
    // reason the huge shove that follows is readable instead of random.
    case 'galeBurst':
      fx.push({ ...e, type: 'galeBurst', at: now, dur: 0.8 });
      playSfx('gust');
      break;
  }
  while (fx.length > 200) fx.shift();
}

// ---- phase-driven sounds ------------------------------------------------------
// Countdown ticks, round-start go, roundEnd victory/defeat sting, gameover
// fanfare. Driven from snapshots (updateUi) so it works from any join point.

let sfxPhase = null, sfxTickN = null;
function phaseSounds(s) {
  if (s.phase === 'countdown') {
    const n = Math.ceil(Number.isFinite(+s.phaseT) ? +s.phaseT : 0);
    if (n !== sfxTickN && n >= 1 && n <= 3) { sfxTickN = n; playSfx('tick'); }
  } else sfxTickN = null;
  if (s.phase !== sfxPhase) {
    if (s.phase === 'battle' && sfxPhase === 'countdown') playSfx('go');
    if (s.phase === 'roundEnd' && s.roundSummary && myId) {
      const m = me(s);
      if (!(m && m.spectator)) playSfx(s.roundSummary.winner === myId ? 'victory' : 'defeat');
    }
    if (s.phase === 'gameover' && sfxPhase !== null) playSfx('fanfare');
    sfxPhase = s.phase;
  }
}

// ---- phase-driven music -------------------------------------------------------
// Each round plays its level's track (render.js shows the matching art):
// countdown of round n -> level n (random past the last level), lobby ->
// level 1 ("What lies ahead?"). Gameover keeps the last round's track going.
let musicPhase = null;
function phaseMusic(s) {
  if (s.phase === musicPhase) return;
  musicPhase = s.phase;
  // co-op keys the level off the CAMPAIGN level, not the round (a wipe costs
  // a round but not a level) — see client/coop.js
  if (s.phase === 'countdown' || s.phase === 'lobby' || s.phase === 'gameover')
    applyLevelMusic(s);
}

// ---- interpolation -----------------------------------------------------------

const RENDER_DELAY = 1000 / SNAPSHOT_RATE * 1.6 + 25;

const fin = Number.isFinite;
const lerp = (a, b, k) => (fin(a) && fin(b)) ? a + (b - a) * k : (fin(b) ? b : a);

function interpolated(now) {
  if (!snaps.length) return null;
  const rt = now - RENDER_DELAY;
  let i = snaps.length - 1;
  while (i > 0 && snaps[i - 1].at > rt) i--;
  const b = snaps[i];
  const a = i > 0 ? snaps[i - 1] : b;
  const span = b.at - a.at;
  const k = span > 1 ? Math.min(1, Math.max(0, (rt - a.at) / span)) : 1;

  const s = b.s;
  const aPlayers = (a.s && a.s.players) || {};
  const players = [];
  for (const [id, pb] of Object.entries(s.players || {})) {
    if (!pb || typeof pb !== 'object') continue;
    const pa = aPlayers[id];
    // `fin(pb.x)` is load-bearing for Vanish: an invisible player's snapshot
    // carries NO position, and lerp falls back to the older value when the newer
    // one is missing — which would leave their last known body frozen on screen
    // for the whole duration. No position in, nothing interpolated, nothing drawn.
    players.push(pa && pa.alive && pb.alive && fin(pb.x) && fin(pb.y)
      ? { ...pb, x: lerp(pa.x, pb.x, k), y: lerp(pa.y, pb.y, k) }
      : pb);
  }
  const projectiles = [];
  const aProj = Array.isArray(a.s && a.s.projectiles) ? a.s.projectiles : [];
  const bProj = Array.isArray(s.projectiles) ? s.projectiles : [];
  const prevPr = new Map(aProj.map(p => [p && p.id, p]));
  for (const pb of bProj) {
    if (!pb || typeof pb !== 'object') continue;
    const pa = prevPr.get(pb.id);
    projectiles.push(pa
      ? { ...pb, x: lerp(pa.x, pb.x, k), y: lerp(pa.y, pb.y, k) }
      : pb);
  }
  const arenaRadius = lerp(a.s && a.s.arenaRadius, s.arenaRadius, k);
  const phaseT = fin(+s.phaseT) ? Math.max(0, +s.phaseT - (now - b.at) / 1000) : 0;
  return {
    phase: s.phase,
    phaseT,
    round: s.round,
    arenaRadius: fin(arenaRadius) ? arenaRadius : ARENA.START_RADIUS,
    pillars: Array.isArray(s.pillars) ? s.pillars : [],
    hazards: Array.isArray(s.hazards) ? s.hazards : [],
    meteors: Array.isArray(s.meteors) ? s.meteors : [],
    walls: Array.isArray(s.walls) ? s.walls : [],
    roundSummary: (s.roundSummary && typeof s.roundSummary === 'object') ? s.roundSummary : null,
    players, projectiles, me: me(s),
  };
}

// ---- input ---------------------------------------------------------------------

function toWorld(px, py) {
  return { x: (px - view.cx) / view.scale, y: (py - view.cy) / view.scale };
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    const w = toWorld(e.clientX, e.clientY);
    send({ t: 'move', x: w.x, y: w.y });
    moveMark = { ...w, at: performance.now() };
  }
});
let lastDrag = 0;
canvas.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if ((e.buttons & 2) && performance.now() - lastDrag > 90) {
    lastDrag = performance.now();
    const w = toWorld(e.clientX, e.clientY);
    send({ t: 'move', x: w.x, y: w.y });
    moveMark = { ...w, at: performance.now() };
  }
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (!$('keysPanel').classList.contains('hidden')) {
    // panel open: don't cast; Esc closes it (capture mode handles its own Esc)
    if (e.key === 'Escape' && !capturing) closeKeysPanel();
    return;
  }
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  const spell = spellForKey(e.key.toLowerCase());
  if (spell) {
    const w = toWorld(mouse.x, mouse.y);
    send({ t: 'cast', key: spell, x: w.x, y: w.y });
  }
});

// ---- join / lobby / shop DOM ------------------------------------------------------

$('name').value = localStorage.getItem('warlockName') || '';
function doJoin() {
  initSfx(); // user gesture: the earliest moment browsers allow audio
  initMusic(); // same gesture unlocks the soundtrack
  const name = $('name').value.trim() || 'warlock';
  localStorage.setItem('warlockName', name);
  connect(name);
}
$('joinBtn').addEventListener('click', doJoin);
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

// avatar picker grid
{
  const grid = $('avatarGrid');
  for (const av of AVATARS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = av;
    b.addEventListener('click', () => {
      myAvatar = av;
      try { localStorage.setItem('owAvatar', av); } catch { }
      syncAvatarGrid();
    });
    grid.appendChild(b);
  }
}
function syncAvatarGrid() {
  for (const b of $('avatarGrid').children) b.classList.toggle('sel', b.textContent === myAvatar);
}
syncAvatarGrid();

// The gold rules, spelled out — no hidden income.
const goldRules =
  `Gold: +${GOLD.ROUND_BASE} g every round · +${GOLD.PER_KILL} g per kill · ` +
  `+${GOLD.ROUND_WIN} g for winning the round · +${GOLD.FIRST_DEATH} g if you die first · ` +
  `bounty up to +${GOLD.BOUNTY_MAX} g for slaying someone ahead of you.`;
$('lobbyFormat').textContent =
  `First to ${ROUND.KILLS_TO_WIN} kills wins. ${goldRules}`;
$('shopIncome').textContent = goldRules;
$('lobbyHint').textContent =
  `You start with ${GOLD.START} gold — the shop opens after round 1. ` +
  'Hover anything in the shop for its full per-level numbers.';

// ---- key bindings panel -------------------------------------------------------

const keyRows = {};
{
  const list = $('keyList');
  for (const [spell, spec] of Object.entries(SPELLS)) {
    const row = document.createElement('div');
    row.className = 'krow';
    row.innerHTML = `<span class="icon">${ICONS[spell]}</span><span class="kname">${spec.name}</span>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'keybtn';
    btn.addEventListener('click', () => startCapture(spell));
    row.appendChild(btn);
    list.appendChild(row);
    keyRows[spell] = btn;
  }
}

let capturing = null; // spell whose binding is being captured
function startCapture(spell) {
  cancelCapture();
  capturing = spell;
  keyRows[spell].classList.add('capturing');
  keyRows[spell].textContent = 'press any key…';
  window.addEventListener('keydown', onCaptureKey, true);
}
function cancelCapture() {
  if (!capturing) return;
  capturing = null;
  window.removeEventListener('keydown', onCaptureKey, true);
  refreshKeyUi();
}
function onCaptureKey(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.key === 'Escape') { cancelCapture(); return; }
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return; // wait for a real key
  const k = e.key.toLowerCase();
  const other = spellForKey(k);
  if (other && other !== capturing) keyBindings[other] = keyBindings[capturing]; // swap
  keyBindings[capturing] = k;
  saveKeys();
  cancelCapture(); // refreshes all labels
}
function applyPreset(preset) {
  cancelCapture();
  keyBindings = { ...KEY_PRESETS[preset] };
  saveKeys();
  refreshKeyUi();
}
$('presetQwerty').addEventListener('click', () => applyPreset('qwerty'));
$('presetAzerty').addEventListener('click', () => applyPreset('azerty'));
function closeKeysPanel() { cancelCapture(); $('keysPanel').classList.add('hidden'); }
$('keysCloseBtn').addEventListener('click', closeKeysPanel);
$('joinKeysBtn').addEventListener('click', () => $('keysPanel').classList.remove('hidden'));
$('lobbyKeysBtn').addEventListener('click', () => $('keysPanel').classList.remove('hidden'));

// Every key label in the UI (panel, spell bar, join hint) reflects current bindings.
function refreshKeyUi() {
  for (const [spell, btn] of Object.entries(keyRows)) {
    btn.classList.remove('capturing');
    btn.textContent = keyLabel(keyBindings[spell]);
  }
  for (const [spell, el] of Object.entries(spellEls))
    el.querySelector('.key').textContent = keyLabel(keyBindings[spell]);
  $('joinKeyHint').innerHTML = Object.keys(SPELLS)
    .map((spell) => `<kbd>${esc(keyLabel(keyBindings[spell]))}</kbd>`).join('');
}

$('readyBtn').addEventListener('click', () => {
  const m = me(latest());
  send({ t: 'ready', ready: !(m && m.ready) });
});
$('spectateBtn').addEventListener('click', () => {
  const m = me(latest());
  send({ t: 'spectate', on: !(m && m.spectator) });
});
$('modeBtn').addEventListener('click', () => {
  const s = latest();
  send({ t: 'mode', mode: nextMode(s ? s.mode : 'classic') }); // classic → elemental → co-op
});
// draft is an INDEPENDENT flag, not a fourth ruleset: it rides on top of
// whichever of the three is selected (docs/ROUND12.md S7)
$('draftBtn').addEventListener('click', () => {
  const s = latest();
  send({ t: 'draft', on: !(s && s.draft) });
});
$('shopReadyBtn').addEventListener('click', () => send({ t: 'ready', ready: true }));
$('removeBotBtn').addEventListener('click', () => send({ t: 'removeBot' }));
$('unbanBtn').addEventListener('click', () => { send({ t: 'unbanAll' }); toast('bans cleared'); });
$('againBtn').addEventListener('click', () => {
  goPinned = false;
  $('gameover').classList.add('hidden'); // don't wait for the next snapshot
  send({ t: 'again' });
});

// bot picker: one add button per difficulty tier + a build-strategy select
// (🎲 random = the server rolls one of the six builds when the bot is seated).
// The tiers are NAMED now (Easy / Normal / Hard / Extreme, round 12) instead of
// wearing a star count: ★★ told you nothing about what the bot does, and there
// are four of them. The list is BOTS in spec order, so a new tier appears here
// (and in the 🎲 chart below) with no client change at all.
const botLabel = (kind) => (BOTS[kind] && BOTS[kind].label) || kind;
{
  const wrap = $('botBtns');
  for (const [kind, spec] of Object.entries(BOTS)) {
    const group = document.createElement('span');
    group.className = 'botgroup';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'botadd';
    b.id = `addBot-${kind}`;
    b.title = spec.desc;
    b.innerHTML = `+ ${esc(spec.name)} <span class="stars">${esc(botLabel(kind))}</span>`;
    const sel = document.createElement('select');
    sel.className = 'botsel';
    sel.id = `botBuild-${kind}`;
    sel.title = 'Build strategy for the next added bot (see “strategies explained” below)';
    sel.innerHTML = `<option value="random">🎲 random</option>` +
      Object.entries(BUILDS).map(([k, bs]) =>
        `<option value="${k}" title="${esc(bs.desc)}">${esc(bs.name.toLowerCase())}</option>`).join('');
    b.addEventListener('click', () => send({ t: 'addBot', kind, build: sel.value }));
    group.append(b, sel);
    wrap.appendChild(group);
  }
}

// strategy chart: what each difficulty does and what each build buys
{
  const rowsKinds = Object.values(BOTS)
    .slice().sort((a, b) => a.difficulty - b.difficulty).map(b =>
      `<tr><td class="stars">${esc(b.label || '')}</td><td>${esc(b.name)}</td><td>${esc(b.desc)}</td></tr>`).join('');
  const rowsBuilds = Object.values(BUILDS).map(b =>
    `<tr><td>${esc(b.name)}</td><td>${b.order.map(k => ICONS[k] || k).join(' ')}</td><td>${esc(b.desc)}</td></tr>`).join('');
  $('botHelpBody').innerHTML = `
    <p><b>Difficulty</b> is how the bot fights:</p>
    <table class="helptable">${rowsKinds}</table>
    <p><b>Strategy</b> is what it buys — each shop it grabs the first thing on its list it can afford:</p>
    <table class="helptable">${rowsBuilds}</table>
    <p>🎲 random rolls one of the six strategies when the bot is added.</p>`;
}

// mute toggle (persisted in localStorage 'owMuted')
{
  const btn = $('muteBtn');
  const paint = () => { btn.textContent = isMuted() ? '🔇' : '🔊'; };
  btn.addEventListener('click', () => {
    initSfx(); // a gesture too — lets sound start here if join predates audio
    setMuted(!isMuted());
    paint();
  });
  paint();
}

// music mute toggle (persisted in localStorage 'owMusicMuted'), separate from SFX
{
  const btn = $('musicBtn');
  const paint = () => {
    btn.classList.toggle('off', isMusicMuted());
    btn.title = isMusicMuted() ? 'Music off' : 'Music on';
  };
  btn.addEventListener('click', () => {
    initMusic(); // a gesture too — lets the soundtrack start here
    setMusicMuted(!isMusicMuted());
    paint();
  });
  paint();
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.style.opacity = 1;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = 0; }, 1800);
}

// ---- shop numbers -------------------------------------------------------------
// EVERY number the shop shows is read out of shared/constants.js at runtime.
// The balance pass that changes SPELLS/ELEMENTS/ITEMS/ITEM_FX changes the UI in
// the same commit — a hardcoded tooltip would be a lie within a week.

function fmtNum(v) {
  if (v === Infinity) return '∞';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (!fin(+v)) return String(v);
  return String(Math.round(+v * 100) / 100);
}
const fmtSec = (v) => (+v ? `${fmtNum(v)} s` : '—');
// Multipliers read as the change they make: 0.85 is "−15%", 1 is "no effect".
function fmtMult(v) {
  const n = +v;
  if (!fin(n)) return String(v);
  if (Math.abs(n - 1) < 1e-9) return '—';
  const d = Math.round((n - 1) * 1000) / 10;
  return `${d > 0 ? '+' : '−'}${fmtNum(Math.abs(d))}%`;
}
const fmtGold = (v) => (+v > 0 ? `${fmtNum(v)} g` : 'free');

// label + formatter per known field; anything unknown still prints (raw key,
// raw value) so a newly added constant shows up instead of vanishing.
const SPELL_FIELDS = {
  damage: ['damage', fmtNum],
  knockback: ['knockback', fmtNum],
  cooldown: ['cooldown', fmtSec],
  range: ['range', fmtNum],
  speed: ['projectile speed', (v) => `${fmtNum(v)} u/s`],
  radius: ['hit radius', fmtNum],
  width: ['beam width', fmtNum],
  duration: ['duration', fmtSec],
  distance: ['dash distance', fmtNum],
  hitRadius: ['dash hit radius', fmtNum],
  outDistance: ['throw distance', fmtNum],
  charge: ['charge time', fmtSec],
  delay: ['impact delay', fmtSec],
  length: ['wall length', fmtNum],
};
const SPELL_SKIP = new Set(['name', 'hotkey', 'maxLevel', 'costs', 'desc', 'tier', 'minRound']);

const FX_FIELDS = {
  dmgAdd: ['fireball damage', (v) => `+${fmtNum(v)}`],
  kbAdd: ['fireball push', (v) => `+${fmtNum(v)}`],
  dmgMult: ['fireball damage', fmtMult],
  kbMult: ['fireball push', fmtMult],
  cdrMult: ['every cooldown', fmtMult],
  cdMult: ['fireball cooldown', fmtMult],
  projRadiusMult: ['fireball size', fmtMult],
  stacksToTrigger: ['stacks to detonate', fmtNum],
  slowMult: ['victim speed', fmtMult],
  slowT: ['slow lasts', fmtSec],
  stunT: ['stun lasts', fmtSec],
  tickDmg: ['poison per tick', fmtNum],
  stackAdd: ['re-hit adds', (v) => `+${fmtNum(v)}/tick`],
  stackCap: ['tick damage cap', fmtNum],
  dotTime: ['poison lasts', fmtSec],
  tickEvery: ['ticks every', fmtSec],
  trailT: ['trail lasts', fmtSec],
  trailDps: ['trail damage', (v) => `${fmtNum(v)}/s`],
  trailStep: ['trail spacing', fmtNum],
  trailR: ['trail radius', fmtNum],
  goldOnHit: ['gold per hit', (v) => `+${fmtNum(v)} g`],
  growMult: ['target grows', fmtMult],
  growT: ['growth lasts', fmtSec],
  growCap: ['growth cap', (v) => `×${fmtNum(v)}`],
  rampDmg: ['damage per landed hit', (v) => `+${fmtNum(v)}`],
  rampPermanent: ['the ramp', (v) => (v ? 'never resets — it is yours for the game' : 'resets each round')],
  chargeEvery: ['engorged ball', (v) => `every ${fmtNum(v)}th cast`],
  chargeLifesteal: ['engorged ball heals', (v) => `${fmtNum(Math.round(v * 1000) / 10)}% of damage dealt`],
  cdRefund: ['refund per enemy hit', (v) => `−${fmtSec(v)} off every cooldown`],
  cdFloor: ['a refund never goes below', fmtSec],
  pierce: ['your fireball', (v) => (v ? 'passes THROUGH bodies' : 'pops on the first body')],
  pierceDmgMult: ['damage to everyone behind the first', fmtMult],
  pierceKbMult: ['push on everyone behind the first', fmtMult],
  mosquito: ['fireball becomes a mosquito', fmtNum],
  stingDmg: ['sting damage', fmtNum],
  procBalls: ['spending a stack fires', (v) => `${fmtNum(v)} of your fireballs, together`],
  // only present when the optional nerf lever is set (ELEMENTS.mosquito)
  procDmgMult: ['each of those balls hits for', fmtMult],
};

// Item fx fields — same shape as SPELL_FIELDS/FX_FIELDS. There is no
// "how do copies compound" column any more: ITEM_FX holds ABSOLUTE CUMULATIVE
// totals per level, so the array IS the row (see shared/items.js).
const ITEM_FIELDS = {
  speedMult: ['move speed', fmtMult],
  lavaMult: ['lava damage taken', fmtMult],
  kbMult: ['knockback taken', fmtMult],
  maxHp: ['max HP', (v) => `+${fmtNum(v)}`],
  regen: ['regeneration', (v) => `+${fmtNum(v)} hp/s`],
  lifesteal: ['lifesteal', (v) => `${fmtNum(Math.round(v * 1000) / 10)}%`],
  every: ['echo cadence', (v) => `every ${fmtNum(v)}th fireball`],
  delay: ['echo delay', fmtSec],
  fireballMax: ['fireball level cap', (v) => `+${fmtNum(v)}`],
};

// What the level you own actually bought, as a plain sentence. The maths lives
// in itemFxAt(); only the wording is here. Deliberately recomputed from ITEM_FX
// instead of read off the snapshot's effective stats: those also carry the
// transient modifiers (the shop opens while you are still standing in lava at
// double speed, with regen still locked), which would read as a lie on a shop
// button.
const ITEM_LIVE = {
  boots: (lv) => `you move at ${fmtNum(PLAYER.SPEED * itemFxAt('boots', 'speedMult', lv))} u/s (base ${fmtNum(PLAYER.SPEED)})`,
  treads: (lv) => `lava burns you for ${fmtNum(LAVA.DPS * itemFxAt('treads', 'lavaMult', lv))} hp/s (base ${fmtNum(LAVA.DPS)})`,
  amulet: (lv) => `you have ${fmtNum(PLAYER.MAX_HP + itemFxAt('amulet', 'maxHp', lv))} max HP (base ${fmtNum(PLAYER.MAX_HP)})`,
  ring: (lv) => `you regenerate ${fmtNum(PLAYER.REGEN + itemFxAt('ring', 'regen', lv))} hp/s (base ${fmtNum(PLAYER.REGEN)})`,
  cape: (lv) => `you take ×${fmtNum(itemFxAt('cape', 'kbMult', lv))} knockback`,
  sword: (lv) => `you heal ${fmtNum(Math.round(itemFxAt('sword', 'lifesteal', lv) * 1000) / 10)}% of the damage you deal`,
};

// One row of the per-level table. A scalar spans every column — that IS what
// "same at every level" looks like; an array gets one cell per level.
function tipRow(label, value, cols, fmt, cur, cls = '') {
  if (!Array.isArray(value))
    return `<tr class="${cls}"><th>${esc(label)}</th><td colspan="${cols}">${esc(fmt(value))}</td></tr>`;
  let cells = '';
  for (let i = 0; i < cols; i++) {
    const v = value[Math.min(i, value.length - 1)];
    cells += `<td class="${i + 1 === cur ? 'cur' : ''}">${esc(fmt(v))}</td>`;
  }
  return `<tr class="${cls}"><th>${esc(label)}</th>${cells}</tr>`;
}

// Known fields first, in the order the dictionary declares them (damage before
// hit radius); anything the dictionary hasn't heard of trails behind, unlabelled
// but visible — a new constant must never silently vanish from the tooltip.
function orderedFields(obj, dict, skip) {
  const keys = Object.keys(obj).filter(k => !(skip && skip.has(k)));
  const known = Object.keys(dict).filter(k => keys.includes(k));
  return known.concat(keys.filter(k => !dict[k]));
}

function tipHead(cols, cur, label = 'lv') {
  let th = '<th></th>';
  for (let i = 1; i <= cols; i++) th += `<th class="${i === cur ? 'cur' : ''}">${label} ${i}</th>`;
  return `<thead><tr>${th}</tr></thead>`;
}

function tipShell(icon, name, desc, body, foot) {
  return `<div class="tname"><span class="ic">${icon}</span>${esc(name)}</div>
    <div class="tdesc">${esc(desc)}</div>${body}
    ${foot ? `<div class="tfoot">${foot}</div>` : ''}`;
}

function spellTip(key, spec, level, maxLevel) {
  let rows = '';
  for (const field of orderedFields(spec, SPELL_FIELDS, SPELL_SKIP)) {
    const [label, fmt] = SPELL_FIELDS[field] || [field, fmtNum];
    rows += tipRow(label, spec[field], maxLevel, fmt, level);
  }
  rows += tipRow('cost', spec.costs.slice(0, maxLevel), maxLevel, fmtGold, level + 1, 'cost');
  const total = spec.costs.slice(0, maxLevel).reduce((a, b) => a + b, 0);
  const foot = [
    level > 0 ? `You own it at <b>lv ${level}</b>${level >= maxLevel ? ' (max)' : ''}.` : '',
    `Full path costs <b>${total} g</b>.`,
    spec.minRound ? `Locked until round <b>${spec.minRound + 1}</b>.` : '',
  ].filter(Boolean).join(' ');
  return tipShell(ICONS[key], spec.name, spec.desc,
    `<table>${tipHead(maxLevel, level)}<tbody>${rows}</tbody></table>`, foot);
}

function elementTip(key, spec, level) {
  const cols = spec.maxLevel;
  let rows = '';
  const fxSpec = spec.fx || {};
  for (const field of orderedFields(fxSpec, FX_FIELDS)) {
    const [label, fmt] = FX_FIELDS[field] || [field, fmtNum];
    rows += tipRow(label, fxSpec[field], cols, fmt, level);
  }
  rows += tipRow('cost', spec.costs.slice(0, cols), cols, fmtGold, level + 1, 'cost');
  const total = spec.costs.slice(0, cols).reduce((a, b) => a + b, 0);
  const foot = [
    level > 0 ? `You own it at <b>lv ${level}</b>${level >= cols ? ' (max)' : ''}.` : '',
    `Full path costs <b>${total} g</b>.`,
    key === 'arcane' ? 'No fireball needed.' : 'Needs <b>Fireball lv 1</b>. Elements stack with each other.',
  ].filter(Boolean).join(' ');
  return tipShell(spec.icon, spec.name, spec.desc,
    `<table>${tipHead(cols, level)}<tbody>${rows}</tbody></table>`, foot);
}

// Items are LEVELLED like spells (round 12): the columns are levels 1..maxLevel
// and the ITEM_FX arrays are absolute totals, so each cell is read straight out
// of the spec — no per-copy arithmetic, and nothing here can drift from what
// stats() computes on the server. Cost is flat at every level.
function itemTip(key, spec, level) {
  const cols = spec.maxLevel;
  const cur = Math.min(level, cols);
  const fxSpec = ITEM_FX[key] || {};
  let rows = '';
  for (const field of orderedFields(fxSpec, ITEM_FIELDS)) {
    const [label, fmt] = ITEM_FIELDS[field] || [field, fmtNum];
    rows += tipRow(label, fxSpec[field], cols, fmt, cur);
  }
  const each = itemCost(key);
  rows += tipRow('cost', Array.from({ length: cols }, () => each), cols, fmtGold,
    Math.min(level + 1, cols), 'cost');
  const live = level > 0 && ITEM_LIVE[key] && ITEM_LIVE[key](cur);
  const foot = [
    level > 0 ? `You own it at <b>lv ${level}</b>${level >= cols ? ' (max)' : ''}.` : '',
    live ? `With that, ${live}.` : '',
    cols > 1
      ? `Every level costs the same <b>${each} g</b> — full path <b>${each * cols} g</b>. Each level gives less than the last.`
      : 'Single level — one purchase and it is maxed.',
  ].filter(Boolean).join(' ');
  return tipShell(ICONS[key], spec.name, spec.desc,
    `<table>${tipHead(cols, cur)}<tbody>${rows}</tbody></table>`, foot);
}

// ---- hover tooltip -------------------------------------------------------------
// A short line on the button, the whole truth on hover. tipOwner is kept so the
// panel refreshes in place after a purchase (the mouse never left the button).

const tipEl = $('tip');
let tipOwner = null;

function placeTip(anchor) {
  const r = anchor.getBoundingClientRect();
  const t = tipEl.getBoundingClientRect();
  const pad = 10;
  let left = r.right + pad;
  if (left + t.width > window.innerWidth - pad) left = r.left - t.width - pad;
  if (left < pad) left = Math.max(pad, (window.innerWidth - t.width) / 2);
  let top = r.top + r.height / 2 - t.height / 2;
  top = Math.min(Math.max(pad, top), Math.max(pad, window.innerHeight - t.height - pad));
  tipEl.style.left = `${Math.round(left)}px`;
  tipEl.style.top = `${Math.round(top)}px`;
}

function showTip(el, build) {
  const html = build();
  if (!html) return;
  tipOwner = { el, build };
  tipEl.innerHTML = html;
  tipEl.classList.remove('hidden');
  placeTip(el);
}

function hideTip() {
  tipOwner = null;
  tipEl.classList.add('hidden');
}

// Repaint the open tooltip from fresh state (a purchase just changed a level).
function refreshTip() {
  if (!tipOwner || !tipOwner.el.isConnected) { hideTip(); return; }
  try {
    const html = tipOwner.build();
    if (html) { tipEl.innerHTML = html; placeTip(tipOwner.el); }
  } catch { hideTip(); }
}

function attachTip(el, build) {
  const show = () => showTip(el, build);
  el.addEventListener('mouseenter', show);
  el.addEventListener('focus', show);
  el.addEventListener('mouseleave', hideTip);
  el.addEventListener('blur', hideTip);
}

// The panel is anchored to a button, so it has to follow when the wares scroll
// under it; a resize is rare enough to just dismiss.
$('shop').addEventListener('scroll', () => { if (tipOwner) placeTip(tipOwner.el); }, true);
window.addEventListener('resize', hideTip);

// ---- shop stat lines ----------------------------------------------------------
// SPELLS fields are scalars or per-level arrays; statAt reads the value at a
// 1-based level either way.
const statAt = (v, level) => Array.isArray(v) ? v[Math.min(level, v.length) - 1] : v;
const SPELL_STAT_FIELDS = [
  ['damage', 'dmg', ''],
  ['knockback', 'push', ''],
  ['cooldown', 'cd', 's'],
  ['range', 'rng', ''],
  ['duration', 'dur', 's'],
  ['distance', 'dash', ''],
  ['charge', 'charge', 's'],
  ['delay', 'delay', 's'],
];

function spellStatLine(spec, level) {
  const parts = [];
  for (const [field, label, unit] of SPELL_STAT_FIELDS) {
    if (spec[field] == null) continue;
    parts.push(`${label} ${fmtNum(statAt(spec[field], level))}${unit}`);
  }
  return parts.join(' · ');
}

// Upgrade preview: only the fields that actually change, as "10→13" deltas.
function spellUpgradeLine(spec, level) {
  const parts = [`lv ${level}→${level + 1}`];
  for (const [field, label, unit] of SPELL_STAT_FIELDS) {
    if (spec[field] == null) continue;
    const cur = statAt(spec[field], level), next = statAt(spec[field], level + 1);
    if (cur !== next) parts.push(`${label} ${fmtNum(cur)}${unit}→${fmtNum(next)}${unit}`);
  }
  return parts.join(' · ');
}

// The one-line version of a per-level array, for the button itself:
// "damage 2 / 4 / 6". Scalars stay in the tooltip — they don't evolve.
function perLevelLine(fxSpec, dict) {
  const parts = [];
  for (const field of orderedFields(fxSpec || {}, dict)) {
    const v = fxSpec[field];
    if (!Array.isArray(v)) continue;
    const [label, fmt] = dict[field] || [field, fmtNum];
    parts.push(`${label} ${v.map(fmt).join(' / ')}`);
  }
  return parts.join(' · ');
}

// Build shop buttons once per container; refresh() updates them from state.
// mode-aware: 'elemental' adds the Elements section and the experimental
// combo items; 'classic' shows exactly the pre-elemental shop.
function buildShop(container, mode = 'classic') {
  const elemental = mode === 'elemental';
  container.innerHTML = '';
  const wares = [];
  // Draft mode: the offer banner sits at the very TOP of the grid and has to be
  // unmissable (docs/ROUND12.md S7). Built empty and hidden; classic never shows
  // it. It is created FIRST so it is above the Spells label.
  const draftBox = document.createElement('div');
  draftBox.className = 'draftpick hidden';
  draftBox.id = 'draftBanner';
  container.appendChild(draftBox);
  let draftShown = '';   // signature of what the banner currently renders
  // section headings, each remembering its own wares so a section emptied by the
  // draft pool can hide its heading too
  const labels = [];
  const mkLabel = (txt) => {
    const el = document.createElement('div');
    el.className = 'shoplabel'; el.textContent = txt;
    container.appendChild(el);
    labels.push({ el, wares: [] });
  };
  const inSection = (w) => { if (labels.length) labels[labels.length - 1].wares.push(w); };
  const mkSpell = (key, spec) => {
    const b = document.createElement('button');
    b.className = 'ware';
    b.innerHTML = `<span class="icon">${ICONS[key]}</span>
      <span class="info"><span class="name">${spec.name} <span class="lv"></span></span>
      <span class="desc">${spec.desc}</span>
      <span class="stats">${spellStatLine(spec, 1)}</span></span><span class="cost num"></span>`;
    b.dataset.key = key;   // stable hook for the UI tests
    b.addEventListener('click', () => { playSfx('buy'); send({ t: 'buy', id: key }); });
    container.appendChild(b);
    const w = { key, spec, el: b, kind: 'spell' };
    attachTip(b, () => spellTip(key, spec, w.level || 0, w.maxLevel || spec.maxLevel));
    wares.push(w); inSection(w);
  };
  mkLabel('Spells');
  for (const [key, spec] of Object.entries(SPELLS))
    if (spec.tier !== 'power') mkSpell(key, spec);
  mkLabel('Powerful ⚡ (unlock after round 5 — pricey, decisive)');
  for (const [key, spec] of Object.entries(SPELLS))
    if (spec.tier === 'power') mkSpell(key, spec);
  if (elemental) {
    mkLabel('Elements ⚗️ (3 levels each — and they stack)');
    for (const [key, spec] of Object.entries(ELEMENTS)) {
      const b = document.createElement('button');
      b.className = 'ware';
      b.innerHTML = `<span class="icon">${spec.icon}</span>
        <span class="info"><span class="name">${spec.name} <span class="lv"></span></span>
        <span class="desc">${spec.desc}</span>
        <span class="stats">${esc(perLevelLine(spec.fx, FX_FIELDS))}</span></span>
        <span class="cost num"></span>`;
      b.dataset.key = key;   // stable hook for the UI tests
      b.addEventListener('click', () => { playSfx('buy'); send({ t: 'buy', id: key }); });
      container.appendChild(b);
      const w = { key, spec, el: b, kind: 'element' };
      attachTip(b, () => elementTip(key, spec, w.level || 0));
      wares.push(w); inSection(w);
    }
  }
  mkLabel('Items (3 levels each — same price every level, each level gives less)');
  for (const [key, spec] of Object.entries(ITEMS)) {
    if (spec.mode === 'elemental' && !elemental) continue;
    const b = document.createElement('button');
    b.className = 'ware';
    b.innerHTML = `<span class="icon">${ICONS[key]}</span>
      <span class="info"><span class="name">${spec.name} <span class="lv"></span></span>
      <span class="desc">${spec.desc}</span>
      <span class="stats"></span></span><span class="cost num"></span>`;
    b.dataset.key = key;   // stable hook for the UI tests
    b.addEventListener('click', () => { playSfx('buy'); send({ t: 'buy', id: key }); });
    container.appendChild(b);
    const w = { key, spec, el: b, kind: 'item' };
    attachTip(b, () => itemTip(key, spec, w.level || 0));
    wares.push(w); inSection(w);
  }
  return function refresh(m, round = 0, s = null) {
    if (!m) return;
    const gold = fin(+m.gold) ? +m.gold : 0;
    const spells = m.spells || {};
    // draft mode: this game's pool is not for sale. A pool thing you have
    // DRAFTED goes back on the shelf (that is how levels 2-3 are bought), which
    // is exactly "do I own any level of it" — the same rule the server uses.
    const pool = new Set((s && s.draftPool) || []);
    drawDraftBanner(m, s);
    // {key: level} since round 12; a stale snapshot (or an old array) reads as
    // "nothing owned" rather than throwing.
    const items = (m.items && !Array.isArray(m.items)) ? m.items : {};
    const ownedOf = (w) => w.kind === 'spell' ? (spells[w.key] || 0)
      : w.kind === 'element' ? ((m.elements && m.elements[w.key]) || 0)
      : (items[w.key] || 0);
    for (const w of wares) {
      // pooled and not yet drafted → this shelf is empty in this game
      const locked = pool.has(w.key) && ownedOf(w) < 1;
      w.el.classList.toggle('hidden', locked);
      if (locked) { w.el.disabled = true; continue; }
      const cost = w.el.querySelector('.cost');
      if (w.kind === 'spell') {
        // power tier stays locked until enough rounds have been fought
        if (w.spec.minRound && round < w.spec.minRound) {
          cost.textContent = `🔒 r${w.spec.minRound + 1}`; cost.className = 'cost';
          w.el.disabled = true;
          continue;
        }
        const level = spells[w.key] || 0;
        // the Cinder Crown raises the fireball cap by one (elemental only)
        const maxLevel = w.spec.maxLevel +
          (elemental && w.key === 'fireball' && (items.crown || 0) > 0 ? 1 : 0);
        w.level = level; w.maxLevel = maxLevel; // what the tooltip reads
        const lv = w.el.querySelector('.lv');
        lv.textContent = level ? `lv ${level}` : '';
        const stats = w.el.querySelector('.stats');
        stats.textContent = level <= 0 ? spellStatLine(w.spec, 1)
          : level >= maxLevel ? `${spellStatLine(w.spec, level)} · max`
          : spellUpgradeLine(w.spec, level);
        if (level >= maxLevel) {
          cost.textContent = 'max'; cost.className = 'cost owned'; w.el.disabled = true;
        } else {
          const c = w.spec.costs[level];
          cost.textContent = `${c} g`; cost.className = 'cost';
          w.el.disabled = gold < c;
        }
      } else if (w.kind === 'element') {
        const elevel = (m.elements && m.elements[w.key]) || 0;
        w.level = elevel;
        w.el.classList.toggle('sel', elevel > 0);
        const lv = w.el.querySelector('.lv');
        lv.textContent = elevel ? `lv ${elevel}` : '';
        if (elevel >= w.spec.maxLevel) {
          cost.textContent = 'max'; cost.className = 'cost owned'; w.el.disabled = true;
        } else {
          const c = w.spec.costs[elevel];
          cost.textContent = `${c} g`; cost.className = 'cost';
          w.el.disabled = gold < c ||
            (w.key !== 'arcane' && (spells.fireball || 0) < 1);
        }
      } else {
        // items are levelled like spells: the level you own sits next to the
        // name, the price is flat, and maxLevel is the wall (1 for echo/crown).
        const level = Math.min(items[w.key] || 0, w.spec.maxLevel);
        w.level = level;
        w.el.querySelector('.lv').textContent = level ? `lv ${level}` : '';
        w.el.classList.toggle('sel', level > 0);
        w.el.querySelector('.stats').textContent =
          level > 0 && ITEM_LIVE[w.key] ? ITEM_LIVE[w.key](level) : '';
        if (level >= w.spec.maxLevel) {
          cost.innerHTML = 'max'; cost.className = 'cost owned'; w.el.disabled = true;
        } else {
          const c = itemCost(w.key);
          cost.innerHTML = `${c} g${level > 0 ? `<span class="nth">→ lv ${level + 1}</span>` : ''}`;
          cost.className = 'cost';
          w.el.disabled = gold < c;
        }
      }
    }
    // a section whose whole stock is in the draft pool would leave a dangling
    // heading, so a label lives or dies with its wares
    for (const lab of labels)
      lab.el.classList.toggle('hidden', lab.wares.length > 0 &&
        lab.wares.every(w => w.el.classList.contains('hidden')));
    refreshTip(); // a purchase just changed what the open tooltip should say
  };

  // The free-pick banner. Re-rendered only when the offer actually changes, so
  // clicking never fights the 20 Hz shop refresh for the selection highlight.
  function drawDraftBanner(m, s) {
    const off = (s && s.draft && m && m.draftOffer) || null;
    const sig = off ? `${off.round}|${off.options.join(',')}|${off.picked || ''}` : '';
    if (sig === draftShown) return;
    draftShown = sig;
    draftBox.classList.toggle('hidden', !off);
    if (!off) { draftBox.innerHTML = ''; return; }
    draftBox.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'drafthead';
    head.innerHTML = off.picked
      ? `🎴 <b>Drafted for free:</b> ${esc(thingName(off.picked))} — it is yours at level 1, and its next levels are on sale below.`
      : `🎴 <b>Free draft pick</b> — pick one of these ${off.options.length}. ` +
        `<span class="draftnote">The first is already chosen for you: click nothing and you still get it.</span>`;
    draftBox.appendChild(head);
    const row = document.createElement('div');
    row.className = 'draftopts';
    off.options.forEach((key, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ware draftopt';
      b.dataset.key = key;      // stable hook for the UI tests
      const chosen = off.picked ? off.picked === key : i === 0;
      b.classList.toggle('sel', chosen);
      b.innerHTML = `<span class="icon">${thingIcon(key)}</span>
        <span class="info"><span class="name">${esc(thingName(key))}
          <span class="lv">${chosen ? (off.picked ? '✓ drafted' : '✓ pre-selected') : ''}</span></span>
        <span class="desc">${esc(thingDesc(key))}</span></span>
        <span class="cost num free">FREE<span class="nth">was ${thingCost(key)} g</span></span>`;
      if (off.picked) b.disabled = true;
      else b.addEventListener('click', () => {
        playSfx('buy');
        send({ t: 'draftPick', id: key });
      });
      row.appendChild(b);
    });
    draftBox.appendChild(row);
  }
}
// name/icon/cost/desc for ANY catalogue key (spell, item or element), so the
// draft banner does not need three branches of its own
function thingSpec(key) {
  return SPELLS[key] || ELEMENTS[key] || ITEMS[key] || null;
}
function thingName(key) { const s = thingSpec(key); return s ? s.name : key; }
function thingDesc(key) { const s = thingSpec(key); return s ? s.desc : ''; }
function thingIcon(key) {
  return ICONS[key] || (ELEMENTS[key] && ELEMENTS[key].icon) || '❓';
}
function thingCost(key) {
  if (SPELLS[key]) return SPELLS[key].costs[0];
  if (ELEMENTS[key]) return ELEMENTS[key].costs[0];
  if (ITEMS[key]) return itemCost(key);
  return 0;
}
let shopModeBuilt = 'classic';
let refreshShop = buildShop($('shopGrid'), shopModeBuilt);

// Spell bar
const spellEls = {};
{
  const bar = $('spellbar');
  for (const key of Object.keys(SPELLS)) {
    const el = document.createElement('div');
    el.className = 'spell';
    el.innerHTML = `<span class="key"></span>${ICONS[key]}
      <span class="lv"></span><span class="elem"></span><span class="cd hidden"></span>`;
    bar.appendChild(el);
    spellEls[key] = el;
  }
}
refreshKeyUi(); // paint current bindings on panel, spell bar, and join hint

// ---- DOM update per phase -------------------------------------------------------

function setVisible(id, on) { $(id).classList.toggle('hidden', !on); }

// Standings order: most kills first, fewer deaths breaks ties, then gold.
const byRank = (a, b) =>
  (b.kills || 0) - (a.kills || 0) || (a.deaths || 0) - (b.deaths || 0) || (b.gold || 0) - (a.gold || 0);

// A player's full kit as icons: spells then items then elements, each ONE icon
// carrying its level. Shown in the shop roster and standings.
function kitIcons(p) {
  const parts = [];
  for (const [k, lv] of Object.entries(p.spells || {}))
    if (lv > 0 && ICONS[k]) parts.push(`${ICONS[k]}${lv > 1 ? `<span class="klv">${lv}</span>` : ''}`);
  // ONE icon per item with its level on it — never N identical icons in a row
  // (that is what freely-stackable items used to render, and five pairs of boots
  // made the inventory unreadable). Same treatment as spells and elements.
  for (const [k, lv] of Object.entries(p.items || {}))
    if (lv > 0 && ICONS[k]) parts.push(`${ICONS[k]}${lv > 1 ? `<span class="klv">${lv}</span>` : ''}`);
  for (const [k, v] of Object.entries(p.elements || {}))
    if (v > 0 && ELEMENTS[k]) parts.push(`${ELEMENTS[k].icon}${v > 1 ? `<span class="klv">${v}</span>` : ''}`);
  return parts.join(' ');
}

// One scoreboard for both the shop and the end-of-game screen: same columns in
// the same order, so it only has to be learned once. A field the snapshot
// doesn't carry (classic mode, an older snapshot still in the ring buffer)
// prints as a dash rather than a zero — zero would be a claim.
function statsTable(fighters, specs, opts = {}) {
  const { winnerId = null, showRound = false } = opts;
  const cell = (v, cls = '') =>
    `<td class="n ${cls}">${fin(+v) ? Math.round(+v) : '<span class="dim">–</span>'}</td>`;
  const goldCols = showRound ? 3 : 2;
  const th = (label, tip) => `<th class="n" title="${esc(tip)}">${label}</th>`;
  const head = `<thead>
    <tr class="grp"><th colspan="5"></th>
      <th class="g" colspan="3">Damage dealt</th>
      <th class="g" colspan="2">HP healed</th>
      <th class="g" colspan="${goldCols}">Gold</th>
      <th class="c-kit"></th></tr>
    <tr><th></th><th>Warlock</th>
      ${th('⚔️ Kills', 'enemies you killed')}
      ${th('💀 Deaths', 'times you died')}
      ${th('Streak', 'best multi-kill this game (×2 = double kill)')}
      ${th('Direct', 'damage you landed yourself: spells, poison ticks, trails')}
      ${th('Lava', 'lava burn credited to you for shoving someone in')}
      ${th('Total', 'direct + lava')}
      ${th('Lifesteal', 'HP the Blood Sword clawed back')}
      ${th('Regen', 'HP regenerated (baseline + rings)')}
      ${showRound ? th('This round', 'gold earned since the last shop') : ''}
      ${th('Wallet', 'gold you can spend right now')}
      ${th('Earned', 'gold earned all game, spent or not')}
      <th class="c-kit">Kit</th></tr></thead>`;
  const who = (p) =>
    `<td class="who"><span class="dot" style="display:inline-block;background:${p.color}"></span>
      ${esc(p.avatar || '🧙')} ${esc(p.name)}${p.id === myId ? ' (you)' : ''}</td>`;
  const rows = fighters.map((p, i) => {
    const direct = fin(+p.dmgDealt) ? +p.dmgDealt : null;
    const lava = fin(+p.dmgLava) ? +p.dmgLava : null;
    const mk = +p.multiKillBest || 0;
    const cls = [p.id === myId ? 'me' : '', winnerId && p.id === winnerId ? 'winner' : '']
      .filter(Boolean).join(' ');
    return `<tr class="${cls}"><td class="rank">${i + 1}</td>${who(p)}
      ${cell(p.kills)}${cell(p.deaths)}
      <td class="n">${mk >= 2 ? `<span class="mk">×${mk}</span>` : '<span class="dim">–</span>'}</td>
      ${cell(direct)}${cell(lava, 'g-lava')}${cell(direct != null && lava != null ? direct + lava : null)}
      ${cell(p.healLifesteal, 'g-heal')}${cell(p.healRegen, 'g-heal')}
      ${showRound ? cell(p.roundGold, 'g-gold') : ''}
      ${cell(p.gold, 'g-gold')}${cell(p.goldEarned ?? p.gold, 'g-gold')}
      <td class="kit c-kit">${kitIcons(p)}</td></tr>`;
  }).concat(specs.map((p) =>
    `<tr class="spec"><td class="rank">👁</td>${who(p)}
      <td colspan="${8 + goldCols}"></td><td class="c-kit"></td></tr>`)).join('');
  return `${head}<tbody>${rows}</tbody>`;
}

function updateUi(s) {
  if (!s || typeof s !== 'object') return;
  const m = me(s);
  const playerList = Object.values(s.players || {}).filter(p => p && typeof p === 'object');
  const phaseT = fin(+s.phaseT) ? +s.phaseT : 0;
  const inGame = s.phase === 'countdown' || s.phase === 'battle';
  // The final standings never vanish on their own. Anyone clicking Continue
  // resets the server back to the lobby, so the phase alone can yank the screen
  // away mid-read; the pin keeps it up until YOU click, and only a round
  // actually starting overrides you.
  if (s.phase === 'gameover') goPinned = true;
  else if (s.phase !== 'lobby') goPinned = false;
  setVisible('lobby', !!myId && s.phase === 'lobby' && !goPinned);
  setVisible('shop', !!myId && s.phase === 'shop');
  setVisible('gameover', !!myId && (s.phase === 'gameover' || goPinned));
  if (s.phase !== 'shop') hideTip();
  setVisible('spellbar', !!myId && inGame && !(m && m.spectator));
  // the shop and the final standings carry the same numbers in full, so the
  // corner scoreboard would only peek out from behind them
  setVisible('topbar', !!myId && s.phase !== 'lobby' && s.phase !== 'shop' &&
    s.phase !== 'gameover' && !goPinned);
  setVisible('phasebar', !!myId && (s.phase === 'shop' || s.phase === 'battle' || s.phase === 'roundEnd'));
  phaseSounds(s);
  phaseMusic(s);
  updateCoopHud(s); // co-op campaign level card + status strip (no-op elsewhere)

  if (s.phase === 'lobby') {
    const list = $('playerList');
    list.innerHTML = '';
    for (const p of playerList) {
      const div = document.createElement('div');
      div.className = 'pl';
      div.innerHTML = `<span class="dot" style="background:${p.color}"></span>
        <span class="who">${esc(p.avatar || '🧙')} ${esc(p.name)}${p.spectator ? ' 👁' : ''}${p.bot ? ` 🤖 <span class="stars">${esc(botLabel(p.kind))}${p.build && BUILDS[p.build] ? ' · ' + esc(BUILDS[p.build].name.toLowerCase()) : ''}</span>` : ''}${p.id === myId ? ' (you)' : ''}</span>
        <span class="state ${p.ready ? 'ready' : ''}">${p.ready ? 'ready' : 'waiting'}</span>`;
      // ban button on other humans: clears ghost seats AND keeps them out
      // (name+ip blocked until the server restarts or someone unbans)
      if (!p.bot && p.id !== myId) {
        const kb = document.createElement('button');
        kb.type = 'button';
        kb.className = 'mini kick';
        kb.title = `Ban ${p.name} from this lobby (until server restart / unban)`;
        kb.textContent = '✕';
        kb.addEventListener('click', () => send({ t: 'kick', id: p.id, ban: true }));
        div.appendChild(kb);
      }
      list.appendChild(div);
    }
    $('readyBtn').textContent = m && m.ready ? 'Not ready' : 'I am ready';
    $('readyBtn').classList.toggle('primary', !(m && m.ready));
    const specBtn = $('spectateBtn');
    const watching = !!(m && m.spectator);
    specBtn.textContent = watching ? 'Watching 👁' : 'Playing ⚔';
    specBtn.classList.toggle('watching', watching);
    specBtn.setAttribute('aria-pressed', watching ? 'true' : 'false');
    // ruleset toggle — server-authoritative, everyone sees the same value
    const modeBtn = $('modeBtn');
    const elemental = s.mode === 'elemental';
    modeBtn.textContent = modeLabel(s.mode);
    modeBtn.title = modeTitle(s.mode);
    modeBtn.classList.toggle('elemental', elemental);
    modeBtn.setAttribute('aria-pressed', s.mode !== 'classic' ? 'true' : 'false');
    // draft toggle — also server-authoritative, and orthogonal to the ruleset
    const draftBtn = $('draftBtn');
    const draftOn = !!s.draft;
    draftBtn.textContent = draftOn ? 'Draft: 🎴 on' : 'Draft: off';
    draftBtn.classList.toggle('elemental', draftOn);
    draftBtn.setAttribute('aria-pressed', draftOn ? 'true' : 'false');
  }

  if (s.phase === 'shop') {
    // rebuild the shop grid when the ruleset differs from what's on screen
    const shopMode = s.mode === 'elemental' ? 'elemental' : 'classic';
    if (shopMode !== shopModeBuilt) {
      shopModeBuilt = shopMode;
      refreshShop = buildShop($('shopGrid'), shopMode);
    }
    const watching = !!(m && m.spectator);
    $('shopGold').textContent = !watching && m ? `${m.gold} g` : '';
    $('shopStats').innerHTML = statsTable(
      playerList.filter(p => !p.spectator).sort(byRank),
      playerList.filter(p => p.spectator),
      { showRound: true });
    const timer = $('shopTimer');
    timer.textContent = `${Math.ceil(phaseT)} s`;
    timer.classList.toggle('low', phaseT <= 5);
    $('shopSub').textContent = watching
      ? "You're spectating — no shopping" : "Spend it while you're alive to.";
    setVisible('shopGrid', !watching);
    setVisible('shopReadyBtn', !watching); // spectator readiness isn't needed here
    if (!watching) {
      refreshShop(m, fin(+s.round) ? +s.round : 0, s);
      // ready button: bots are always ready and spectators don't gate the shop;
      // only fighting humans are counted/shown
      const humans = playerList.filter(p => !p.bot && !p.spectator);
      const readyN = humans.filter(p => p.shopReady).length;
      const btn = $('shopReadyBtn');
      if (m && m.shopReady) {
        btn.disabled = true;
        btn.classList.remove('primary');
        btn.textContent = `Waiting for others… (${readyN}/${humans.length} ready)`;
      } else {
        btn.disabled = false;
        btn.classList.add('primary');
        btn.textContent = humans.length > 1
          ? `Ready — next round (${readyN}/${humans.length} ready)` : 'Ready — next round';
      }
    }
  }

  if (s.phase === 'battle') {
    $('phasebar').textContent = s.coop
      ? `round ${s.round} · co-op campaign` // the kill race does not apply
      : `round ${s.round} · first to ${ROUND.KILLS_TO_WIN} kills`;
  } else if (s.phase === 'roundEnd') {
    $('phasebar').textContent = `round ${s.round} over`;
  } else if (s.phase === 'shop') {
    $('phasebar').textContent = `next round in ${Math.ceil(phaseT)} s`;
  }

  if (s.phase === 'gameover') {
    const fightersL = playerList.filter(p => !p.spectator).sort(byRank);
    const w = fightersL.find(p => p.id === s.winner) || fightersL[0];
    $('goWinner').textContent = w ? `${w.name} rules the ashes with ${w.kills || 0} kills.` : '';
    $('standings').innerHTML = statsTable(fightersL, playerList.filter(p => p.spectator),
      { winnerId: w ? w.id : null });
  }

  // topbar scoreboard — fighters ranked by kills, spectators last and dimmed
  if (s.phase !== 'lobby') {
    const fightersL = playerList.filter(p => !p.spectator).sort(byRank);
    const specs = playerList.filter(p => p.spectator);
    // the current kill leader wears the crown (only once someone has a kill)
    const leadId = fightersL.length && (fightersL[0].kills || 0) > 0 ? fightersL[0].id : null;
    const hdr = `<div class="hdr"><span class="dot" style="visibility:hidden"></span>
      <span class="who">warlock</span><span class="score">kills</span>
      <span class="gold">purse</span><span class="rgold">round</span></div>`;
    $('topbar').innerHTML = hdr + fightersL.map(p => {
      // "purse" is what's left to spend, "round" is what this round has paid
      // so far — the second is the one that tells you who is pulling ahead
      const rg = fin(+p.roundGold) ? +p.roundGold : null;
      return `<div class="r ${p.id === myId ? 'me' : ''} ${p.alive || s.phase !== 'battle' ? '' : 'dead'}">
        <span class="dot" style="background:${p.color}"></span>
        <span class="who">${p.id === leadId ? '👑 ' : ''}${esc(p.avatar || '🧙')} ${esc(p.name)}</span>
        <span class="score num">${p.kills || 0}</span>
        <span class="gold num">${p.gold || 0}g</span>
        <span class="rgold num ${rg ? '' : 'zero'}">${rg == null ? '' : `+${rg}`}</span>
      </div>`;
    }).concat(specs.map(p =>
      `<div class="r spec ${p.id === myId ? 'me' : ''}">
        <span class="dot" style="background:${p.color}"></span>
        <span class="who">${esc(p.avatar || '🧙')} ${esc(p.name)}</span>
        <span class="score num">👁</span>
        <span class="gold num"></span><span class="rgold num"></span>
      </div>`)).join('');
  }

  // spell bar
  if (inGame && m) {
    const spells = m.spells || {}, cooldowns = m.cooldowns || {};
    for (const [key, el] of Object.entries(spellEls)) {
      const level = spells[key] || 0;
      el.classList.toggle('owned', level > 0);
      el.querySelector('.lv').textContent = level > 1 ? 'lv' + level : '';
      // your owned elements ride on the fireball slot (elemental mode);
      // arcane is global CDR, so it badges EVERY owned spell slot — that's
      // how you see it working
      // chronos joins arcane as a GLOBAL element (it refunds every cooldown you
      // have running, off any spell that lands), so it badges every owned slot
      // instead of riding on the fireball
      const riders = key === 'fireball' && m.elements
        ? Object.keys(m.elements)
            .filter(k => !GLOBAL_ELEM.has(k) && m.elements[k] > 0 && ELEMENTS[k])
            .map(k => ELEMENTS[k].icon).join('')
        : '';
      const global = m.elements && level > 0
        ? [...GLOBAL_ELEM].filter(k => m.elements[k] > 0 && ELEMENTS[k])
            .map(k => ELEMENTS[k].icon).join('')
        : '';
      el.querySelector('.elem').textContent = riders + global;
      const cd = fin(+cooldowns[key]) ? +cooldowns[key] : 0;
      const cdEl = el.querySelector('.cd');
      cdEl.classList.toggle('hidden', cd <= 0);
      if (cd > 0) cdEl.textContent = cd.toFixed(1);
    }
  }

  // live element readouts. A ramp you can't see is a mechanic you don't play
  // around, and the frost stacks riding on you are a countdown to a stun.
  const buffs = [];
  if (inGame && m && !m.spectator) {
    const momLv = (m.elements && m.elements.momentum) || 0;
    if (momLv > 0) {
      // no cap to show any more (the ramp is uncapped AND permanent): the
      // number that matters is the damage it has actually bought you
      const hits = Math.max(0, +m.momentumHits || 0);
      buffs.push(`<span class="buff crit">${ELEMENTS.momentum.icon} ${hits} hits` +
        ` · +${fmtNum(statAt(ELEMENTS.momentum.fx.rampDmg, momLv) * hits)} dmg</span>`);
    }
    // stacks riding on YOU: the worst single attacker's pile, i.e. how close
    // somebody is to detonating on you (counters are private now)
    const onMe = m.stacksOnMe || null;
    if (onMe && onMe.frost > 0)
      buffs.push(`<span class="buff frost">${ELEMENTS.frost.icon} ` +
        `${onMe.frost}/${ELEMENTS.frost.fx.stacksToTrigger}</span>`);
    // gale rides the same countdown as frost, and the thing it is counting down
    // to is being launched off the platform — so it gets the same chip
    if (onMe && onMe.gale > 0)
      buffs.push(`<span class="buff frost">${ELEMENTS.gale.icon} ` +
        `${onMe.gale}/${ELEMENTS.gale.fx.stacksToTrigger}</span>`);
    if (onMe && onMe.mosquito > 0)
      buffs.push(`<span class="buff venom">${ELEMENTS.mosquito.icon} marked</span>`);
    // vampire: count the casts down, so "the next one is the big one" is a thing
    // you KNOW rather than something you notice afterwards
    const vampLv = (m.elements && m.elements.vampire) || 0;
    if (vampLv > 0) {
      const every = ELEMENTS.vampire.fx.chargeEvery;
      const n = Math.max(0, +m.vampN || 0) % every;
      const pct = Math.round(statAt(ELEMENTS.vampire.fx.chargeLifesteal, vampLv) * 100);
      buffs.push(`<span class="buff vamp">${ELEMENTS.vampire.icon} ` +
        (n === every - 1 ? `NEXT BALL · ${pct}% drain` : `${n}/${every}`) + '</span>');
    }
    // Vanish: your own invisibility, counted down. `vanishT` is only ever on YOUR
    // player entry (snapshot() strips the whole position for everyone else), so
    // this chip is by construction self-only.
    if (fin(+m.vanishT) && +m.vanishT > 0)
      buffs.push(`<span class="buff vanish">${ICONS.vanish} invisible · ${(+m.vanishT).toFixed(1)}s</span>`);
    if (m.stun) buffs.push('<span class="buff frost">🥶 frozen</span>');
    else if (m.slow) buffs.push('<span class="buff frost">🐌 slowed</span>');
    if (m.poison) buffs.push(`<span class="buff venom">${ELEMENTS.venom.icon} poisoned</span>`);
  }
  setVisible('buffbar', buffs.length > 0);
  if (buffs.length) $('buffbar').innerHTML = buffs.join('');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- main loop ----------------------------------------------------------------

// The loop must never die: an exception in draw/updateUi is reported on the
// error banner but requestAnimationFrame is rescheduled unconditionally.
function frame(now) {
  window.__hb = (window.__hb || 0) + 1; // heartbeat, used by tests
  try {
    const vs = interpolated(now);
    draw(view, vs, fx, myId, moveMark, now);
    // prune stale fx
    for (let i = fx.length - 1; i >= 0; i--)
      if ((now - fx[i].at) / 1000 > fx[i].dur) fx.splice(i, 1);
    const s = latest();
    if (s && now - lastUiUpdate > 100) { lastUiUpdate = now; updateUi(s); }
  } catch (err) {
    reportError('frame', err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
