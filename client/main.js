// Client: networking, interpolation, input, DOM HUD. Rendering in render.js.

import {
  SPELLS, ITEMS, ITEM_FX, ITEM_COST_STEP, ELEMENTS, BOTS, BUILDS,
  SNAPSHOT_RATE, ARENA, ROUND, GOLD, PLAYER, LAVA, itemCost,
} from '../shared/constants.js';
import { makeView, draw } from './render.js';
import { initSfx, playSfx, isMuted, setMuted } from './sfx.js';
import { initMusic, setLevel, setMusicMuted, isMusicMuted } from './music.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const view = makeView(canvas);
view.resize();
window.addEventListener('resize', () => view.resize());

const ICONS = {
  fireball: '🔥', lightning: '⚡', boomerang: '🪃',
  teleport: '🌀', shield: '🛡️', rush: '💨', pillar: '🗿',
  meteor: '☄️', hook: '🪝', repulse: '💥', wall: '🪞',
  boots: '👢', treads: '🥾', amulet: '❤️', ring: '💍', cape: '🧣', sword: '🗡️',
  echo: '🔁', crown: '👑',
};
// ---- key bindings (rebindable, persisted) ----------------------------------

// Defaults per Remi 2026-08-03: blink (teleport) on F, dash (rush) on E,
// boomerang moves to R. Saved custom bindings in localStorage still win.
const KEY_PRESETS = {
  qwerty: { fireball: 'q', lightning: 'w', boomerang: 'r', teleport: 'f', shield: 'd', rush: 'e',
            pillar: 's', meteor: 't', hook: 'g', repulse: 'x', wall: 'c' },
  azerty: { fireball: 'a', lightning: 'z', boomerang: 'r', teleport: 'f', shield: 'd', rush: 'e',
            pillar: 's', meteor: 't', hook: 'g', repulse: 'x', wall: 'c' },
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

function onEvent(e) {
  const now = performance.now();
  switch (e.t) {
    case 'boom': fx.push({ ...e, type: 'boom', at: now, dur: 0.4 }); playSfx('boom'); break;
    case 'beam': fx.push({ ...e, type: 'beam', at: now, dur: 0.3 }); playSfx('zap'); break;
    case 'hit': if (e.amount >= 1) fx.push({ ...e, type: 'hit', at: now, dur: 0.8 }); break;
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
    case 'gold': fx.push({ ...e, type: 'gold', at: now, dur: 0.9 }); break;       // midas / bounty payout
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
    case 'frost': fx.push({ ...e, type: 'frost', at: now, dur: 0.7 }); break;
    case 'frostBreak':
      fx.push({ ...e, type: 'frostBreak', at: now, dur: 0.8 });
      playSfx('freeze');
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
  if (s.phase === 'countdown') setLevel(fin(+s.round) ? +s.round : 1);
  else if (s.phase === 'lobby' || s.phase === 'gameover') setLevel('intro');
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
    players.push(pa && pa.alive && pb.alive
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
  send({ t: 'mode', mode: s && s.mode === 'elemental' ? 'classic' : 'elemental' });
});
$('shopReadyBtn').addEventListener('click', () => send({ t: 'ready', ready: true }));
$('removeBotBtn').addEventListener('click', () => send({ t: 'removeBot' }));
$('unbanBtn').addEventListener('click', () => { send({ t: 'unbanAll' }); toast('bans cleared'); });
$('againBtn').addEventListener('click', () => {
  goPinned = false;
  $('gameover').classList.add('hidden'); // don't wait for the next snapshot
  send({ t: 'again' });
});

// bot picker: per difficulty, an add button + a build-strategy select
// (🎲 random = the server rolls one of the six builds when the bot is seated)
const botStars = (kind) => BOTS[kind] ? '★'.repeat(BOTS[kind].difficulty) : '';
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
    b.innerHTML = `+ ${esc(spec.name)} <span class="stars">${botStars(kind)}</span>`;
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
  const rowsKinds = Object.values(BOTS).map(b =>
    `<tr><td class="stars">${'★'.repeat(b.difficulty)}</td><td>${esc(b.name)}</td><td>${esc(b.desc)}</td></tr>`).join('');
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
  rampDmg: ['damage per stack', (v) => `+${fmtNum(v)}`],
  rampKb: ['push per stack', (v) => `+${fmtNum(v)}`],
  rampCap: ['ramp caps at', (v) => `${fmtNum(v)} hits`],
  mosquito: ['fireball becomes a mosquito', fmtNum],
  stingDmg: ['sting damage', fmtNum],
  biteArc: ['bite covers', (v) => `${fmtNum(Math.round(v * 1000) / 10)}% of the body`],
  biteMult: ['spell landed on a bite', (v) => `×${fmtNum(v)}`],
  maxBites: ['your bites at once', fmtNum],
  biteArm: ['bite arms after', fmtSec],
  selfCashFullCd: ['stinging your own bite', (v) => (v ? 'costs the fire-rate bonus' : '—')],
};

// how a second, third… copy of an item compounds: 'mult' multiplies, 'add'
// sums, 'flat' does neither (a unique item's one-off effect).
const ITEM_FIELDS = {
  speedMult: ['move speed', 'mult', fmtMult],
  lavaMult: ['lava damage taken', 'mult', fmtMult],
  kbMult: ['knockback taken', 'mult', fmtMult],
  maxHp: ['max HP', 'add', (v) => `+${fmtNum(v)}`],
  regen: ['regeneration', 'add', (v) => `+${fmtNum(v)} hp/s`],
  lifesteal: ['lifesteal', 'add', (v) => `${fmtNum(Math.round(v * 1000) / 10)}%`],
  every: ['echo cadence', 'flat', (v) => `every ${fmtNum(v)}th fireball`],
  delay: ['echo delay', 'flat', fmtSec],
  fireballMax: ['fireball level cap', 'flat', (v) => `+${fmtNum(v)}`],
};

// What the copies you own actually bought, as a plain sentence. Deliberately
// recomputed from ITEM_FX instead of read off the snapshot's effective stats:
// those also carry the transient modifiers (the shop opens while you are still
// standing in lava at double speed, with regen still locked), which would read
// as a lie on a shop button.
const ITEM_LIVE = {
  boots: (n) => `you move at ${fmtNum(PLAYER.SPEED * ITEM_FX.boots.speedMult ** n)} u/s (base ${fmtNum(PLAYER.SPEED)})`,
  treads: (n) => `lava burns you for ${fmtNum(LAVA.DPS * ITEM_FX.treads.lavaMult ** n)} hp/s (base ${fmtNum(LAVA.DPS)})`,
  amulet: (n) => `you have ${fmtNum(PLAYER.MAX_HP + ITEM_FX.amulet.maxHp * n)} max HP (base ${fmtNum(PLAYER.MAX_HP)})`,
  ring: (n) => `you regenerate ${fmtNum(PLAYER.REGEN + ITEM_FX.ring.regen * n)} hp/s (base ${fmtNum(PLAYER.REGEN)})`,
  cape: (n) => `you take ×${fmtNum(ITEM_FX.cape.kbMult ** n)} knockback`,
  sword: (n) => `you heal ${fmtNum(Math.round(ITEM_FX.sword.lifesteal * n * 1000) / 10)}% of the damage you deal`,
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

// Items stack, so the columns are COPIES, not levels: what 1/2/3 of them do and
// what each next one costs (every copy is ITEM_COST_STEP dearer than the last).
function itemTip(key, spec, owned) {
  const cols = spec.unique ? 1 : 3;
  const fxSpec = ITEM_FX[key] || {};
  let rows = '';
  for (const field of orderedFields(fxSpec, ITEM_FIELDS)) {
    const base = fxSpec[field];
    const [label, mode, fmt] = ITEM_FIELDS[field] || [field, 'flat', fmtNum];
    const vals = [];
    for (let n = 1; n <= cols; n++)
      vals.push(mode === 'mult' ? base ** n : mode === 'add' ? base * n : base);
    rows += tipRow(label, mode === 'flat' ? base : vals, cols, fmt, Math.min(owned, cols));
  }
  const prices = [];
  for (let n = 0; n < cols; n++) prices.push(itemCost(key, n));
  rows += tipRow('cost of that copy', prices, cols, fmtGold, Math.min(owned + 1, cols), 'cost');
  const live = owned > 0 && ITEM_LIVE[key] && ITEM_LIVE[key](owned);
  const foot = [
    owned > 0 ? `You own <b>×${owned}</b>.` : '',
    live ? `With those, ${live}.` : '',
    spec.unique ? 'Unique — one copy only.'
      : `Each extra copy costs <b>+${Math.round((ITEM_COST_STEP - 1) * 100)}%</b>, rounded up.`,
  ].filter(Boolean).join(' ');
  return tipShell(ICONS[key], spec.name, spec.desc,
    `<table>${tipHead(cols, Math.min(owned, cols), '×')}<tbody>${rows}</tbody></table>`, foot);
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
  const mkLabel = (txt) => {
    const el = document.createElement('div');
    el.className = 'shoplabel'; el.textContent = txt;
    container.appendChild(el);
  };
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
    wares.push(w);
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
      wares.push(w);
    }
  }
  mkLabel('Items (buy as many copies as you like — each one costs more)');
  for (const [key, spec] of Object.entries(ITEMS)) {
    if (spec.mode === 'elemental' && !elemental) continue;
    const b = document.createElement('button');
    b.className = 'ware';
    b.innerHTML = `<span class="icon">${ICONS[key]}</span>
      <span class="info"><span class="name">${spec.name} <span class="stack"></span></span>
      <span class="desc">${spec.desc}</span>
      <span class="stats"></span></span><span class="cost num"></span>`;
    b.dataset.key = key;   // stable hook for the UI tests
    b.addEventListener('click', () => { playSfx('buy'); send({ t: 'buy', id: key }); });
    container.appendChild(b);
    const w = { key, spec, el: b, kind: 'item' };
    attachTip(b, () => itemTip(key, spec, w.owned || 0));
    wares.push(w);
  }
  return function refresh(m, round = 0) {
    if (!m) return;
    const gold = fin(+m.gold) ? +m.gold : 0;
    const spells = m.spells || {};
    const items = Array.isArray(m.items) ? m.items : [];
    for (const w of wares) {
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
          (elemental && w.key === 'fireball' && items.includes('crown') ? 1 : 0);
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
        // items stack: the count you own goes next to the name, the price tag
        // is always the NEXT copy (every extra one is dearer by ITEM_COST_STEP).
        // Unique items still cap at one.
        const owned = items.filter(i => i === w.key).length;
        w.owned = owned;
        w.el.querySelector('.stack').textContent = owned > 0 ? `×${owned}` : '';
        w.el.classList.toggle('sel', owned > 0);
        w.el.querySelector('.stats').textContent =
          owned > 0 && ITEM_LIVE[w.key] ? ITEM_LIVE[w.key](owned) : '';
        if (owned > 0 && w.spec.unique) {
          cost.innerHTML = 'owned'; cost.className = 'cost owned'; w.el.disabled = true;
        } else {
          const c = itemCost(w.key, owned);
          cost.innerHTML = `${c} g${owned > 0 ? `<span class="nth">copy #${owned + 1}</span>` : ''}`;
          cost.className = 'cost';
          w.el.disabled = gold < c;
        }
      }
    }
    refreshTip(); // a purchase just changed what the open tooltip should say
  };
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

// A player's full kit as icons: spells (with level) then items, plus the
// chosen element in elemental mode. Shown in the shop roster and standings.
function kitIcons(p) {
  const parts = [];
  for (const [k, lv] of Object.entries(p.spells || {}))
    if (lv > 0 && ICONS[k]) parts.push(`${ICONS[k]}${lv > 1 ? `<span class="klv">${lv}</span>` : ''}`);
  for (const it of (Array.isArray(p.items) ? p.items : []))
    if (ICONS[it]) parts.push(ICONS[it]);
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

  if (s.phase === 'lobby') {
    const list = $('playerList');
    list.innerHTML = '';
    for (const p of playerList) {
      const div = document.createElement('div');
      div.className = 'pl';
      div.innerHTML = `<span class="dot" style="background:${p.color}"></span>
        <span class="who">${esc(p.avatar || '🧙')} ${esc(p.name)}${p.spectator ? ' 👁' : ''}${p.bot ? ` 🤖 <span class="stars">${botStars(p.kind)}${p.build && BUILDS[p.build] ? ' · ' + esc(BUILDS[p.build].name.toLowerCase()) : ''}</span>` : ''}${p.id === myId ? ' (you)' : ''}</span>
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
    modeBtn.textContent = elemental ? 'Rules: ⚗️ Elemental (experimental)' : 'Rules: Classic';
    modeBtn.classList.toggle('elemental', elemental);
    modeBtn.setAttribute('aria-pressed', elemental ? 'true' : 'false');
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
      refreshShop(m, fin(+s.round) ? +s.round : 0);
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
    $('phasebar').textContent = `round ${s.round} · first to ${ROUND.KILLS_TO_WIN} kills`;
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
      const riders = key === 'fireball' && m.elements
        ? Object.keys(m.elements).filter(k => k !== 'arcane' && m.elements[k] > 0 && ELEMENTS[k])
            .map(k => ELEMENTS[k].icon).join('')
        : '';
      const arcane = m.elements && m.elements.arcane > 0 && level > 0
        ? ELEMENTS.arcane.icon : '';
      el.querySelector('.elem').textContent = riders + arcane;
      const cd = fin(+cooldowns[key]) ? +cooldowns[key] : 0;
      const cdEl = el.querySelector('.cd');
      cdEl.classList.toggle('hidden', cd <= 0);
      if (cd > 0) cdEl.textContent = cd.toFixed(1);
    }
  }

  // live element readouts. A crit ramp you can't see is a mechanic you don't
  // play around, and the frost stacks riding on you are a countdown to a stun.
  const buffs = [];
  if (inGame && m && !m.spectator) {
    const critLv = (m.elements && m.elements.critical) || 0;
    if (critLv > 0) {
      const f = ELEMENTS.critical.fx;
      const hits = Math.min(+m.critHits || 0, f.rampCap);
      buffs.push(`<span class="buff crit">${ELEMENTS.critical.icon} ${hits}/${f.rampCap}` +
        ` · +${fmtNum(statAt(f.rampDmg, critLv) * hits)} dmg</span>`);
    }
    if (+m.frostStacks > 0)
      buffs.push(`<span class="buff frost">${ELEMENTS.frost.icon} ` +
        `${m.frostStacks}/${ELEMENTS.frost.fx.stacksToTrigger}</span>`);
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
