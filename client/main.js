// Client: networking, interpolation, input, DOM HUD. Rendering in render.js.

import { SPELLS, ITEMS, ELEMENTS, BOTS, BUILDS, SNAPSHOT_RATE, ARENA, ROUND, GOLD } from '../shared/constants.js';
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
let moveMark = null;
const mouse = { x: 0, y: 0 };
let lastUiUpdate = 0;

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
$('againBtn').addEventListener('click', () => send({ t: 'again' }));

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
    parts.push(`${label} ${statAt(spec[field], level)}${unit}`);
  }
  return parts.join(' · ');
}

// Upgrade preview: only the fields that actually change, as "10→13" deltas.
function spellUpgradeLine(spec, level) {
  const parts = [`lv ${level}→${level + 1}`];
  for (const [field, label, unit] of SPELL_STAT_FIELDS) {
    if (spec[field] == null) continue;
    const cur = statAt(spec[field], level), next = statAt(spec[field], level + 1);
    if (cur !== next) parts.push(`${label} ${cur}${unit}→${next}${unit}`);
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
    b.addEventListener('click', () => { playSfx('buy'); send({ t: 'buy', id: key }); });
    container.appendChild(b);
    wares.push({ key, spec, el: b, kind: 'spell' });
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
        <span class="desc">${spec.desc}</span></span><span class="cost num"></span>`;
      b.addEventListener('click', () => { playSfx('buy'); send({ t: 'buy', id: key }); });
      container.appendChild(b);
      wares.push({ key, spec, el: b, kind: 'element' });
    }
  }
  mkLabel('Items');
  for (const [key, spec] of Object.entries(ITEMS)) {
    if (spec.mode === 'elemental' && !elemental) continue;
    const b = document.createElement('button');
    b.className = 'ware';
    b.innerHTML = `<span class="icon">${ICONS[key]}</span>
      <span class="info"><span class="name">${spec.name}</span>
      <span class="desc">${spec.desc}</span></span><span class="cost num"></span>`;
    b.addEventListener('click', () => { playSfx('buy'); send({ t: 'buy', id: key }); });
    container.appendChild(b);
    wares.push({ key, spec, el: b, kind: 'item' });
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
        if (items.includes(w.key)) {
          cost.textContent = 'owned'; cost.className = 'cost owned'; w.el.disabled = true;
        } else {
          cost.textContent = `${w.spec.cost} g`; cost.className = 'cost';
          w.el.disabled = gold < w.spec.cost;
        }
      }
    }
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

function updateUi(s) {
  if (!s || typeof s !== 'object') return;
  const m = me(s);
  const playerList = Object.values(s.players || {}).filter(p => p && typeof p === 'object');
  const phaseT = fin(+s.phaseT) ? +s.phaseT : 0;
  const inGame = s.phase === 'countdown' || s.phase === 'battle';
  setVisible('lobby', !!myId && s.phase === 'lobby');
  setVisible('shop', !!myId && s.phase === 'shop');
  setVisible('gameover', !!myId && s.phase === 'gameover');
  setVisible('spellbar', !!myId && inGame && !(m && m.spectator));
  setVisible('topbar', !!myId && s.phase !== 'lobby');
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
    // roster: everyone's kills, deaths, gold (now + total earned) and full kit
    $('shopRoster').innerHTML = playerList.filter(p => !p.spectator).sort(byRank).map(p => `
      <div class="pl${p.id === myId ? ' me' : ''}">
        <span class="dot" style="background:${p.color}"></span>
        <span class="who">${esc(p.avatar || '🧙')} ${esc(p.name)}${p.id === myId ? ' (you)' : ''}</span>
        <span class="num" title="kills">⚔ ${p.kills || 0}</span>
        <span class="num" title="deaths">💀 ${p.deaths || 0}</span>
        <span class="num" title="damage dealt (incl. lava burns you caused)">🗡 ${p.dmgDealt || 0}</span>
        <span class="num gd" title="gold to spend (total earned)">${p.gold || 0}g <span class="dim">(${p.goldEarned ?? p.gold ?? 0} earned)</span></span>
        <span class="kit" title="spells & items owned">${kitIcons(p)}</span>
      </div>`).join('');
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
    const specs = playerList.filter(p => p.spectator);
    const w = fightersL.find(p => p.id === s.winner) || fightersL[0];
    $('goWinner').textContent = w ? `${w.name} rules the ashes with ${w.kills || 0} kills.` : '';
    const who = (p) =>
      `<td><span class="dot" style="display:inline-block;background:${p.color}"></span> ${esc(p.avatar || '🧙')} ${esc(p.name)}</td>`;
    const rows = fightersL.map((p, i) =>
      `<tr class="${w && p.id === w.id ? 'winner' : ''}"><td>${i + 1}</td>${who(p)}
       <td class="num">${p.kills || 0}</td><td class="num">${p.deaths || 0}</td>
       <td class="num" title="damage dealt, incl. lava burns you caused">${p.dmgDealt || 0}</td>
       <td class="num" title="total earned (unspent: ${p.gold || 0})">${p.goldEarned ?? p.gold ?? 0}</td>
       <td class="kit">${kitIcons(p)}</td></tr>`)
      .concat(specs.map((p) =>
        `<tr class="spec"><td>👁</td>${who(p)}<td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td><td></td></tr>`))
      .join('');
    $('standings').innerHTML =
      `<tr><th></th><th>Warlock</th><th class="num">Kills</th><th class="num">Deaths</th><th class="num">Damage</th><th class="num">Gold earned</th><th>Upgrades</th></tr>${rows}`;
  }

  // topbar scoreboard — fighters ranked by kills, spectators last and dimmed
  if (s.phase !== 'lobby') {
    const fightersL = playerList.filter(p => !p.spectator).sort(byRank);
    const specs = playerList.filter(p => p.spectator);
    // the current kill leader wears the crown (only once someone has a kill)
    const leadId = fightersL.length && (fightersL[0].kills || 0) > 0 ? fightersL[0].id : null;
    $('topbar').innerHTML = fightersL.map(p =>
      `<div class="r ${p.id === myId ? 'me' : ''} ${p.alive || s.phase !== 'battle' ? '' : 'dead'}">
        <span class="dot" style="background:${p.color}"></span>
        <span class="who">${p.id === leadId ? '👑 ' : ''}${esc(p.avatar || '🧙')} ${esc(p.name)}</span>
        <span class="score num">${p.kills || 0}</span>
        <span class="gold num">${p.gold || 0}g</span>
      </div>`).concat(specs.map(p =>
      `<div class="r spec ${p.id === myId ? 'me' : ''}">
        <span class="dot" style="background:${p.color}"></span>
        <span class="who">${esc(p.avatar || '🧙')} ${esc(p.name)}</span>
        <span class="score num">👁</span>
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
