// Client: networking, interpolation, input, DOM HUD. Rendering in render.js.

import { SPELLS, ITEMS, SNAPSHOT_RATE, ARENA } from '../shared/constants.js';
import { makeView, draw } from './render.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const view = makeView(canvas);
view.resize();
window.addEventListener('resize', () => view.resize());

const ICONS = {
  fireball: '🔥', lightning: '⚡', boomerang: '🪃',
  teleport: '🌀', shield: '🛡️', rush: '💨',
  boots: '👢', treads: '🥾', amulet: '❤️', ring: '💍', cape: '🧣', sword: '🗡️',
};
const KEY_TO_SPELL = { q: 'fireball', w: 'lightning', e: 'boomerang', r: 'teleport', d: 'shield', f: 'rush' };

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
  sock.onopen = () => { if (ws === sock) send({ t: 'join', name }); };
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
    } else if (m.t === 'denied') toast(m.reason);
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
    case 'boom': fx.push({ ...e, type: 'boom', at: now, dur: 0.4 }); break;
    case 'beam': fx.push({ ...e, type: 'beam', at: now, dur: 0.3 }); break;
    case 'hit': if (e.amount >= 1) fx.push({ ...e, type: 'hit', at: now, dur: 0.8 }); break;
    case 'death':
      fx.push({ ...e, type: 'death', at: now, dur: 1.6 });
      window.__deaths = (window.__deaths || 0) + 1; // test/debug hook
      break;
    case 'teleport': fx.push({ ...e, type: 'teleport', at: now, dur: 0.45 }); break;
    case 'reflect': fx.push({ ...e, type: 'reflect', at: now, dur: 0.4 }); break;
    case 'cast': if (e.spell === 'rush') fx.push({ x: e.x, y: e.y, type: 'teleport', at: now, dur: 0.3 }); break;
  }
  while (fx.length > 200) fx.shift();
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
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  const spell = KEY_TO_SPELL[e.key.toLowerCase()];
  if (spell) {
    const w = toWorld(mouse.x, mouse.y);
    send({ t: 'cast', key: spell, x: w.x, y: w.y });
  }
});

// ---- join / lobby / shop DOM ------------------------------------------------------

$('name').value = localStorage.getItem('warlockName') || '';
function doJoin() {
  const name = $('name').value.trim() || 'warlock';
  localStorage.setItem('warlockName', name);
  connect(name);
}
$('joinBtn').addEventListener('click', doJoin);
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

$('readyBtn').addEventListener('click', () => {
  const m = me(latest());
  send({ t: 'ready', ready: !(m && m.ready) });
});
$('addBotBtn').addEventListener('click', () => send({ t: 'addBot' }));
$('removeBotBtn').addEventListener('click', () => send({ t: 'removeBot' }));
$('againBtn').addEventListener('click', () => send({ t: 'again' }));

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.style.opacity = 1;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = 0; }, 1800);
}

// Build shop buttons once per container; refresh() updates them from state.
function buildShop(container) {
  container.innerHTML = '';
  const wares = [];
  const mkLabel = (txt) => {
    const el = document.createElement('div');
    el.className = 'shoplabel'; el.textContent = txt;
    container.appendChild(el);
  };
  mkLabel('Spells');
  for (const [key, spec] of Object.entries(SPELLS)) {
    const b = document.createElement('button');
    b.className = 'ware';
    b.innerHTML = `<span class="icon">${ICONS[key]}</span>
      <span class="info"><span class="name">${spec.name} <span class="lv"></span></span>
      <span class="desc">${spec.desc}</span></span><span class="cost num"></span>`;
    b.addEventListener('click', () => send({ t: 'buy', id: key }));
    container.appendChild(b);
    wares.push({ key, spec, el: b, spell: true });
  }
  mkLabel('Items');
  for (const [key, spec] of Object.entries(ITEMS)) {
    const b = document.createElement('button');
    b.className = 'ware';
    b.innerHTML = `<span class="icon">${ICONS[key]}</span>
      <span class="info"><span class="name">${spec.name}</span>
      <span class="desc">${spec.desc}</span></span><span class="cost num"></span>`;
    b.addEventListener('click', () => send({ t: 'buy', id: key }));
    container.appendChild(b);
    wares.push({ key, spec, el: b, spell: false });
  }
  return function refresh(m) {
    if (!m) return;
    const gold = fin(+m.gold) ? +m.gold : 0;
    const spells = m.spells || {};
    const items = Array.isArray(m.items) ? m.items : [];
    for (const w of wares) {
      const cost = w.el.querySelector('.cost');
      if (w.spell) {
        const level = spells[w.key] || 0;
        const lv = w.el.querySelector('.lv');
        lv.textContent = level ? `lv ${level}` : '';
        if (level >= w.spec.maxLevel) {
          cost.textContent = 'max'; cost.className = 'cost owned'; w.el.disabled = true;
        } else {
          const c = w.spec.costs[level];
          cost.textContent = `${c} g`; cost.className = 'cost';
          w.el.disabled = gold < c;
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
const refreshLobbyShop = buildShop($('lobbyShop'));
const refreshShop = buildShop($('shopGrid'));

// Spell bar
const spellEls = {};
{
  const bar = $('spellbar');
  for (const [key, spec] of Object.entries(SPELLS)) {
    const el = document.createElement('div');
    el.className = 'spell';
    el.innerHTML = `<span class="key">${spec.hotkey}</span>${ICONS[key]}
      <span class="lv"></span><span class="cd hidden"></span>`;
    bar.appendChild(el);
    spellEls[key] = el;
  }
}

// ---- DOM update per phase -------------------------------------------------------

function setVisible(id, on) { $(id).classList.toggle('hidden', !on); }

function updateUi(s) {
  if (!s || typeof s !== 'object') return;
  const m = me(s);
  const playerList = Object.values(s.players || {}).filter(p => p && typeof p === 'object');
  const phaseT = fin(+s.phaseT) ? +s.phaseT : 0;
  const inGame = s.phase === 'countdown' || s.phase === 'battle';
  setVisible('lobby', !!myId && s.phase === 'lobby');
  setVisible('shop', !!myId && s.phase === 'shop');
  setVisible('gameover', !!myId && s.phase === 'gameover');
  setVisible('spellbar', !!myId && inGame);
  setVisible('topbar', !!myId && s.phase !== 'lobby');
  setVisible('phasebar', !!myId && (s.phase === 'shop' || s.phase === 'battle'));

  if (s.phase === 'lobby') {
    const list = $('playerList');
    list.innerHTML = '';
    for (const p of playerList) {
      const div = document.createElement('div');
      div.className = 'pl';
      div.innerHTML = `<span class="dot" style="background:${p.color}"></span>
        <span class="who">${esc(p.name)}${p.bot ? ' 🤖' : ''}${p.id === myId ? ' (you)' : ''}</span>
        <span class="state ${p.ready ? 'ready' : ''}">${p.ready ? 'ready' : 'waiting'}</span>`;
      list.appendChild(div);
    }
    $('readyBtn').textContent = m && m.ready ? 'Not ready' : 'I am ready';
    $('readyBtn').classList.toggle('primary', !(m && m.ready));
    refreshLobbyShop(m);
  }

  if (s.phase === 'shop') {
    $('shopGold').textContent = m ? `${m.gold} g` : '';
    $('shopTimer').textContent = `${Math.ceil(phaseT)} s`;
    refreshShop(m);
  }

  if (s.phase === 'battle') {
    $('phasebar').textContent = `round ${s.round} · arena shrinking`;
  } else if (s.phase === 'shop') {
    $('phasebar').textContent = `next round in ${Math.ceil(phaseT)} s`;
  }

  if (s.phase === 'gameover') {
    const ranked = playerList.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    const w = ranked[0];
    $('goWinner').textContent = w ? `${w.name} rules the ashes.` : '';
    const rows = ranked.map((p, i) =>
      `<tr class="${i === 0 ? 'winner' : ''}"><td>${i + 1}</td>
       <td><span class="dot" style="display:inline-block;background:${p.color}"></span> ${esc(p.name)}</td>
       <td class="num">${p.score || 0}</td><td class="num">${p.kills || 0}</td><td class="num">${p.deaths || 0}</td></tr>`).join('');
    $('standings').innerHTML =
      `<tr><th></th><th>Warlock</th><th class="num">Score</th><th class="num">Kills</th><th class="num">Deaths</th></tr>${rows}`;
  }

  // topbar scoreboard
  if (s.phase !== 'lobby') {
    const ranked = playerList.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    $('topbar').innerHTML = ranked.map(p =>
      `<div class="r ${p.id === myId ? 'me' : ''} ${p.alive || s.phase !== 'battle' ? '' : 'dead'}">
        <span class="dot" style="background:${p.color}"></span>
        <span class="who">${esc(p.name)}</span>
        <span class="score num">${p.score || 0}</span>
        <span class="gold num">${p.gold || 0}g</span>
      </div>`).join('');
  }

  // spell bar
  if (inGame && m) {
    const spells = m.spells || {}, cooldowns = m.cooldowns || {};
    for (const [key, el] of Object.entries(spellEls)) {
      const level = spells[key] || 0;
      el.classList.toggle('owned', level > 0);
      el.querySelector('.lv').textContent = level > 1 ? 'lv' + level : '';
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
