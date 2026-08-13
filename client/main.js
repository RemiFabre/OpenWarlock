// Client: networking, interpolation, input, DOM HUD. Rendering in render.js.

import {
  SPELLS, ITEMS, ITEM_FX, ELEMENTS, BOTS, BUILDS, AVATARS,
  SNAPSHOT_RATE, ARENA, ROUND, GOLD, PLAYER, LAVA, TEAMS, teamTint, itemCost,
} from '../shared/constants.js';
import { itemFxAt } from '../shared/items.js';
import { rankTeams } from '../shared/sim.js';
import { VERSION } from '../shared/version.js';
import { makeView, draw } from './render.js';
import { createChatter } from './chatter.js';
import { initSfx, playSfx, isMuted, setMuted } from './sfx.js';
import { initMusic, setLevel, setMusicMuted, isMusicMuted } from './music.js';
import {
  applyLevelMusic, updateCoopHud,
} from './coop.js';
import { selectTransport, createRtcHostTransport } from './transport.js';
import * as analytics from './analytics.js';
const { sendEvent, trackSnapshot, modeName, fetchStats } = analytics;

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const view = makeView(canvas);
view.resize();
window.addEventListener('resize', () => view.resize());

// ⚠ Every value here is injected as HTML (shop cards, spell bar, tooltips,
// draft banner, kit strip), never as textContent, which is what lets an icon
// carry a wrapper span. Keep it that way if you add a call site.
const ICONS = {
  fireball: '🔥', lightning: '⚡', boomerang: '🪃',
  // Round 21.7 (Remi): the Stone Pillar has its 🗿 back, and NOPE (SPELLS.statue)
  // wears the SAME moai tinted gold (.goldicon in index.html); "a normal pillar
  // icon and a gold one". Revert = drop the span / restore 🏛️.
  teleport: '🌀', shield: '🛡️', debt: '🩶', rush: '💨', pillar: '🗿', vanish: '👁️',
  statue: '<span class="goldicon">🗿</span>',
  // Decoy (round 21.6): the two silhouettes; "there are more of me than there
  // should be". 👤/👥 were both free.
  decoy: '👥',
  meteor: '☄️', nova: '💣', swap: '🎭', repulse: '💥', wall: '🪞',
  // Fire Walk (round 22): footprints, NOT 🥾; that boot is already Lava Treads
  firewalk: '👣',
  boots: '👢', treads: '🥾', amulet: '❤️', ring: '💍', cape: '🧣', sword: '🗡️',
  // Hat of Aura (round 21.7 rename): a hat, since 🔥 belongs to ember.
  // Slow Spoon (21.8): Remi's joke, the slowest murder in history.
  hourglass: '⏳', brazier: '🎩', spoon: '🥄',
  genki: '💠',   // issue #12: the omega ball
};
// ---- key bindings (rebindable, persisted) ----------------------------------

// Defaults per Remi 2026-08-03: blink (teleport) on F, dash (rush) on E,
// boomerang moves to R. Saved custom bindings in localStorage still win.
// ⚠ THIS is the source of truth for hotkeys, not SPELLS[key].hotkey (which is
// vestigial; its only other use is being excluded from tooltips). Every spell in
// SPELLS needs an entry in BOTH presets: refreshKeyUi() walks Object.keys(SPELLS)
// and calls keyLabel() on the binding, so a missing one throws on load and the
// client comes up blank. Add the spell here in the same commit you add it there.
const KEY_PRESETS = {
  // statue sits on the PHYSICAL key left of pillar's S in both layouts
  // (qwerty A = azerty Q), so "stone next to stone" holds either way.
  // decoy sits on the PHYSICAL key left of repulse's X in both layouts
  // (qwerty Z = azerty W), the last free key on the bottom row.
  qwerty: { fireball: 'q', lightning: 'w', boomerang: 'r', teleport: 'f', shield: 'd', rush: 'e',
            pillar: 's', vanish: 'v', meteor: 't', swap: 'g', repulse: 'x', wall: 'c', nova: 'b',
            statue: 'a', decoy: 'z', firewalk: 'h', debt: 'y', genki: 'k' },
  azerty: { fireball: 'a', lightning: 'z', boomerang: 'r', teleport: 'f', shield: 'd', rush: 'e',
            pillar: 's', vanish: 'v', meteor: 't', swap: 'g', repulse: 'x', wall: 'c', nova: 'b',
            statue: 'q', decoy: 'w', firewalk: 'h', debt: 'y', genki: 'k' },
};

// ⚠ Round 21.7 SCAR (Remi, live): two spells on one key is a SILENT dead
// spell. He plays AZERTY, so his saved bindings had fireball on `a` and
// lightning on `z`; Statue and Decoy shipped later with the QWERTY defaults
// `a`/`z`, and spellForKey() returns the FIRST match, so Statue never fired
// (fireball ate the key) and Decoy did literally nothing. Load now resolves
// every collision: your SAVED keys win, then a defaulted spell takes the first
// free key from [its qwerty default, its azerty default, a-z, 0-9].
const FALLBACK_KEYS = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
function loadKeys() {
  const b = { ...KEY_PRESETS.qwerty };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('owKeys') || '{}') || {}; }
  catch { /* corrupt storage; fall back to defaults */ }
  const spells = Object.keys(b);
  const savedKey = (s) => (typeof saved[s] === 'string' && saved[s]) ? saved[s].toLowerCase() : null;
  const out = {};
  const taken = new Set();
  for (const spell of spells) {           // your own bindings first, in order
    const k = savedKey(spell);
    if (k && !taken.has(k)) { out[spell] = k; taken.add(k); }
  }
  for (const spell of spells) {           // the rest: default, else first free
    if (out[spell]) continue;
    for (const k of [KEY_PRESETS.qwerty[spell], KEY_PRESETS.azerty[spell], ...FALLBACK_KEYS])
      if (k && !taken.has(k)) { out[spell] = k; taken.add(k); break; }
  }
  return out;
}
let keyBindings = loadKeys();
function saveKeys() { try { localStorage.setItem('owKeys', JSON.stringify(keyBindings)); } catch { } }
function spellForKey(k) {
  for (const [spell, key] of Object.entries(keyBindings)) if (key === k) return spell;
  return null;
}
// Any key can be bound (round 21.7), so the label has to survive the odd ones.
const KEY_LABELS = { ' ': 'Space', arrowup: '↑', arrowdown: '↓', arrowleft: '←',
  arrowright: '→', enter: '⏎', tab: '⇥', backspace: '⌫' };
function keyLabel(k) {
  if (!k) return '·';
  return KEY_LABELS[k] || (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));
}

// ---- avatar -----------------------------------------------------------------

// null = no saved pick: the engine rolls a random FREE avatar at join (22.1)
let myAvatar = localStorage.getItem('owAvatar') || null;
if (myAvatar && !AVATARS.includes(myAvatar)) myAvatar = null;

// ---- state ----------------------------------------------------------------

let myId = null;
const snaps = [];          // {at, s} ring buffer
const fx = [];             // visual effects
window.__fx = fx;          // test/debug hook: lets a test inject one to look at
window.__sfx = playSfx;    // console hook: audition a sound, e.g. __sfx('angerBell')
window.__keys = () => keyBindings;   // test/debug hook: the resolved bindings
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
let shopPausedBy = null;   // name of whoever froze the shop clock, else null
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
// The transport (client/transport.js) hides WHERE the room lives: the Node
// server over WebSocket, or an engine right here in the tab (solo, no server).
// Selection is async (a ~1 s /health probe when the URL doesn't force a mode),
// so joining awaits transportP; everything else uses `transport` directly.

let joinedName = null;     // name we joined with; non-null enables auto-reconnect
let reconnectTimer = null;
let transport = null;

function wireTransport(t) {
  transport = t;
  t.onMessage(onMessage);
  t.onClose((err) => {
    if (err) reportError('socket', err);
    setConnBanner('Connection lost. Reconnecting…');
    scheduleReconnect();
  });
}

const transportP = selectTransport().then((t) => {
  wireTransport(t);
  // anonymous visit counter, once per page load, tagged with the picked
  // transport (client/analytics.js; counts only, never affects play)
  sendEvent('visit', { mode: modeName(t.kind) });
  // the Play button's label is HONEST about what the probed transport will do
  // (Remi, round 19.4: one big "Enter" hid the choice that was being made)
  if (t.kind === 'ws') $('joinBtn').textContent = '⚔ Join game';
  if (t.kind === 'solo') {
    // no server behind this page: Play starts a private solo room where bots
    // are added from the lobby, all inside this tab. The static three-line
    // "No server here, by design!" hint in index.html covers this case.
    $('joinBtn').textContent = 'Play solo vs bots';
  }
  if (t.kind === 'rtc') {
    // this tab was invited (#r=CODE): Play joins the host's lobby over WebRTC,
    // no extra step vs before
    $('joinBtn').textContent = '⚔ Join game';
    const el = $('netMode');
    el.textContent = `🔗 Invited to room ${t.code}. You'll join the host's game, peer-to-peer.`;
    el.classList.remove('hidden');
    $('hostBtn').classList.add('hidden'); // you can't host while joining someone
  }
  return t;
});

function connect(name) {
  joinedName = name;
  clearTimeout(reconnectTimer); reconnectTimer = null;
  transport.connect({ name, avatar: myAvatar });
}

function onMessage(m) {
  if (m.t === 'welcome') {
    myId = m.id;
    snaps.length = 0; fx.length = 0; // drop state from any previous connection
    gapEst = 1000 / SNAPSHOT_RATE; renderDelay = BASE_DELAY; // ...and its lag estimate
    setConnBanner(null);
    $('join').classList.add('hidden');
    // Version handshake (round 19.3, Remi): a mixed client/server pair must
    // announce itself instead of being a mystery lag/ghost-feature session.
    if (m.v && m.v !== VERSION) {
      $('ver').textContent = `you ${VERSION} / server ${m.v}`;
      $('ver').classList.add('bad');
      toast(`Version mismatch: server is ${m.v}, your page is ${VERSION}. Hard-refresh (Cmd+Shift+R).`);
    }
  } else if (m.t === 'snap' && m.s && typeof m.s === 'object' && m.s.players) {
    if (m.bans != null) m.s.bans = m.bans; // server-level: lobby ban count
    if (m.pings && typeof m.pings === 'object') m.s.pings = m.pings; // per-player RTT (ms)
    if (m.host != null) m.s.host = m.host; // who owns the rule controls (round 23)
    if (m.chat != null) m.s.chat = m.chat; // avatar reactions off when false
    snaps.push({ at: performance.now(), s: m.s });
    if (snaps.length > 40) snaps.shift();
    trackSnapGap(snaps[snaps.length - 1].at);
    if (Array.isArray(m.e)) for (const e of m.e) if (e && typeof e === 'object') onEvent(e);
    window.__phase = m.s.phase; // test/debug hook
    window.__snapN = (window.__snapN || 0) + 1; // test hook: snapshots received
    trackSnapshot(m.s, myId, transport && transport.kind); // anonymous game_start/_end beacons
  } else if (m.t === 'denied') {
    toast(m.reason);
    // kicked, banned, or the RTC room is gone ("no such room"; the host
    // closed their tab): stop the auto-reconnect loop and show the join
    // screen again; otherwise this tab would hammer the server forever
    if (/kicked|banned|room/.test(String(m.reason || ''))) {
      joinedName = null;
      clearTimeout(reconnectTimer); reconnectTimer = null;
      myId = null;
      $('join').classList.remove('hidden');
    }
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (joinedName != null) connect(joinedName);
  }, 2000);
}

function send(obj) { if (transport) transport.send(obj); }

// Floating popups (damage, +1 g, lifesteal, frost pips…) that arrive at the SAME
// spot in the SAME frame must read as N events, not one. Exactly overlapping
// numbers are indistinguishable from a single hit, and that is not a corner
// case: mosquito's pair lands two fireballs a heartbeat apart on the same body,
// and Remi's requirement is literally *"clearly see all the on-hit indicators
// pop twice (for example seeing +1 gold twice)"*. So each extra copy is fanned
// sideways (alternating, growing) and delayed a couple of frames, which is what
// makes the second one legible as a second thing.
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

// Trash Talk (issue #4): the same event stream the FX run on, turned into
// speech bubbles. Cosmetic, client-only, and it never reads or writes game state.
const chatter = createChatter();
let chatterPlayers = [];
let lastFrameAt = 0;

function onEvent(e) {
  const now = performance.now();
  try {
    const s = latest();
    if (!s || s.chat !== false) chatter.onEvent(e, chatterPlayers, now);
  } catch { /* never break the fx */ }
  switch (e.t) {
    case 'boom': fx.push({ ...e, type: 'boom', at: now, dur: 0.4 }); playSfx('boom'); break;
    // lightning sky-bolt landing (round 17; the hitscan 'beam' died with it)
    case 'boltHit': fx.push({ ...e, type: 'boltHit', at: now, dur: 0.45 }); playSfx('zap'); break;
    // DoT ticks are exempt from the ≥1 filter (malady ticks flat 1 today, but
    // an invisible tick reads as a broken element; the mosquito scar)
    case 'hit': if (e.amount >= 1 || e.poison) pushFloater(e, 'hit', 0.8, now); break;
    case 'death':
      fx.push({ ...e, type: 'death', at: now, dur: 1.6 });
      playSfx('death');
      if (e.killer && myId && e.killer === myId) {
        // that was YOUR kill; celebrate it
        fx.push({ ...e, type: 'kill', at: now, dur: 1.4 });
        playSfx('kill');
      }
      window.__deaths = (window.__deaths || 0) + 1; // test/debug hook
      break;
    case 'teleport': fx.push({ ...e, type: 'teleport', at: now, dur: 0.45 }); playSfx('teleport'); break;
    case 'reflect': fx.push({ ...e, type: 'reflect', at: now, dur: 0.4 }); playSfx('reflect'); break;
    case 'debtTransfer': fx.push({ ...e, type: 'grow', at: now, dur: 0.5 }); playSfx('catch'); break;
    case 'catch':
      fx.push({ ...e, type: 'catch', at: now, dur: 0.35 });
      if (e.id === myId) playSfx('catch'); // your snag, your snap
      break;
    case 'cast':
      if (e.spell === 'rush') fx.push({ x: e.x, y: e.y, type: 'teleport', at: now, dur: 0.3 });
      if (e.spell === 'fireball') playSfx('whoosh');
      break;
    // midas / bounty payout. Fanned: "+1 g twice" is Remi's named acceptance
    // criterion for mosquito's pair, and two identical popups on one pixel is
    // exactly the thing that reads as "+1 g once".
    case 'gold': pushFloater(e, 'gold', 0.9, now); break;
    // Genki (issue #12): a dropped charge deflates; a stage-up flashes
    case 'genkiFizzle':
      fx.push({ ...e, type: 'teleport', at: now, dur: 0.5 });
      if (e.id === myId) playSfx('catch');
      break;
    case 'genkiStage':
      fx.push({ ...e, type: 'grow', at: now, dur: 0.6 });
      playSfx('ding');
      break;
    case 'meteorHit': fx.push({ ...e, type: 'meteorHit', at: now, dur: 0.7 }); playSfx('boom'); playSfx('death'); break;
    // Mine (round 21.8): planting is quiet (a trap nobody should hear), the
    // charge is a soft click, the spring is a boom, and every stored ball
    // erupting is its own whoosh, so a loaded trap SOUNDS like the payoff.
    case 'mineUp': fx.push({ ...e, type: 'grow', at: now, dur: 0.35 }); if (e.id === myId) playSfx('buy'); break;
    case 'mineCharge': fx.push({ ...e, type: 'grow', at: now, dur: 0.3 }); if (e.id === myId) playSfx('catch'); break;
    case 'mineHit': fx.push({ ...e, type: 'mineHit', at: now, dur: 0.5 }); playSfx('boom'); break;
    case 'mineShot': playSfx('whoosh'); break;
    // swap: one flash at EACH end of the trade, plus its own crossing sound;
    // "we traded places" must read instantly on both screens
    case 'swapped':
      fx.push({ x: e.x, y: e.y, type: 'teleport', at: now, dur: 0.45 });
      fx.push({ x: e.x2, y: e.y2, type: 'teleport', at: now, dur: 0.45 });
      playSfx('swap');
      break;
    // lava portal (round 18): one flash where you sank, one where you surface
    case 'portal':
      fx.push({ x: e.fx, y: e.fy, type: 'teleport', at: now, dur: 0.45 });
      fx.push({ x: e.x, y: e.y, type: 'teleport', at: now, dur: 0.45 });
      playSfx('teleport');
      break;
    // the blast ring is drawn at the event's OWN radius `e.r` (round 21.0):
    // brief and punchy, 0.4 s. A vanished caster's repulse never gets here;
    // viewEvents drops it, and that stays the design.
    case 'repulse': fx.push({ ...e, type: 'repulse', at: now, dur: 0.4 }); playSfx('boom'); break;
    case 'pillarUp': fx.push({ ...e, type: 'grow', at: now, dur: 0.5 }); playSfx('buy'); break;
    // Decoy (round 21.6): one flash where the mirages step out of you, a
    // quieter one where each expires. The clones themselves are drawn as
    // ordinary players (see interpolated()), so these only punctuate.
    case 'decoyUp': fx.push({ ...e, type: 'teleport', at: now, dur: 0.45 }); playSfx('teleport'); break;
    case 'decoyGone': fx.push({ ...e, type: 'teleport', at: now, dur: 0.3 }); break;
    // Statue (round 21.4): a short transform pop at each end of the freeze;
    // the body itself is drawn as a gold column for the whole duration
    // (render.js), these two just punctuate it: a bell going up (round 21.7,
    // Remi asked for a "ding"), a softer snap coming down.
    case 'statueUp': fx.push({ ...e, type: 'grow', at: now, dur: 0.5 }); playSfx('ding'); break;
    case 'statueDown': fx.push({ ...e, type: 'grow', at: now, dur: 0.4 }); playSfx('catch'); break;
    // terra lv3 Demolisher: the pillar shatters; rubble that settles and fades
    case 'pillarBroken': fx.push({ ...e, type: 'rubble', at: now, dur: 1.6 }); playSfx('boom'); break;
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
    // midas: the mark planted (quiet; the cash's +1 g popup is the loud half)
    case 'midasMark': fx.push({ ...e, type: 'midasMark', at: now, dur: 0.5 }); break;
    // gale: a gust stacked. Silent on purpose; it fires on every gale hit, and
    // a sound on each one would drown the burst it is counting down to.
    case 'gale': pushFloater(e, 'gale', 0.7, now); break;
    // anger: a red mark just got claimed; small red burst on the victim, and
    // the claimant hears anger's OWN sound (round 21.7: it used to borrow the
    // kill jingle, which is why banking a stack never felt like an event)
    case 'angerClaim':
      fx.push({ ...e, type: 'angerClaim', at: now, dur: 0.6 });
      if (e.by === myId) playSfx('anger'); // round 21.7: its own low "ouu" (sfx.js)
      break;
    // malady: somebody just caught the plague; one-shot burst + a sound cue
    // (the drain slurp reused: sick and wet, and no new audio assets)
    case 'infected':
      fx.push({ ...e, type: 'infected', at: now, dur: 0.7 });
      playSfx('drain');
      break;
    // vampire: the engorged ball just paid out. Loud on purpose; this element's
    // whole design goal is "an EVENT, not a passive trickle"
    case 'lifesteal':
      pushFloater(e, 'lifesteal', 1.1, now);
      if (e.id === myId) playSfx('drain');
      break;
    // arcane lv3: your cooldowns just jumped back (a fireball landed)
    case 'refund':
      pushFloater(e, 'refund', 0.55, now);
      if (e.id === myId) playSfx('rewind');
      break;
    // Vanish: the server only ever sends this to the player who cast it
    // (viewEvents strips events anchored on a hidden player), so this fx and its
    // sound are self-only by construction; do NOT add a fallback that draws it
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
      // teams: every surviving member took the round, so `winners` (not the
      // single-survivor `winner`) decides whose fanfare this is
      const rs = s.roundSummary;
      const won = Array.isArray(rs.winners) ? rs.winners.includes(myId) : rs.winner === myId;
      if (!(m && m.spectator)) playSfx(won ? 'victory' : 'defeat');
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
  // a round but not a level); see client/coop.js
  if (s.phase === 'countdown' || s.phase === 'lobby' || s.phase === 'gameover')
    applyLevelMusic(s);
}

// ---- interpolation -----------------------------------------------------------

// How far in the past to render, so there is always a NEWER snapshot to lerp
// toward. One-and-a-bit snapshot intervals is enough on a healthy link.
const BASE_DELAY = 1000 / SNAPSHOT_RATE * 1.6 + 25;
const MAX_DELAY = 600;     // past this, lag is worse than the stutter it hides
// ...but the interval is not a constant any more: the server SKIPS states for a
// link that is falling behind (shared/snapwire.js), so a struggling player gets
// fewer, complete updates. The delay follows the gap it actually observes:
// peak-hold with a slow decay, so one hiccup widens it and a recovered link
// tightens it back. Without this, sparse snapshots read as freeze-then-jump;
// with it, the same motion is simply sampled more coarsely.
// Revert: `renderDelay = BASE_DELAY` in one line.
let gapEst = 1000 / SNAPSHOT_RATE;
let renderDelay = BASE_DELAY;
function trackSnapGap(at) {
  const prev = snaps.length > 1 ? snaps[snaps.length - 2].at : null;
  if (prev == null) return;
  gapEst = Math.max(at - prev, gapEst * 0.92);
  renderDelay = Math.min(MAX_DELAY, Math.max(BASE_DELAY, gapEst * 1.6 + 25));
}
window.__delay = () => ({ renderDelay, gapEst }); // test/debug hook

const fin = Number.isFinite;
const lerp = (a, b, k) => (fin(a) && fin(b)) ? a + (b - a) * k : (fin(b) ? b : a);

function interpolated(now) {
  if (!snaps.length) return null;
  const rt = now - renderDelay;
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
    // one is missing, which would leave their last known body frozen on screen
    // for the whole duration. No position in, nothing interpolated, nothing drawn.
    players.push(pa && pa.alive && pb.alive && fin(pb.x) && fin(pb.y)
      ? { ...pb, x: lerp(pa.x, pb.x, k), y: lerp(pa.y, pb.y, k) }
      : pb);
  }
  // Decoy (round 21.6): the mirages arrive in their own snapshot list and
  // become player-shaped HERE and nowhere else; every HUD (scoreboard, kill
  // feed, team banding, ranking) reads `s.players`, which never holds one.
  // The look is COPIED LIVE off the caster's own entry, so a clone is identical
  // by construction: colour, avatar, name, team ring, brazier aura, shield
  // bubble, even the frost/malady rings. Only hp is frozen (server ruling) and
  // the two OWN-body fields are dropped: `vanishT` would draw the caster's
  // dashed countdown on a clone, `statueT` a gold column.
  const aClones = Array.isArray(a.s && a.s.clones) ? a.s.clones : [];
  const prevClone = new Map(aClones.map(c => [c && c.id, c]));
  for (const cb of (Array.isArray(s.clones) ? s.clones : [])) {
    if (!cb || typeof cb !== 'object' || !fin(cb.x) || !fin(cb.y)) continue;
    const src = (s.players || {})[cb.owner];
    if (!src) continue;
    const ca = prevClone.get(cb.id);
    // eslint-disable-next-line no-unused-vars
    const { vanishT, statueT, draftOffer, ...look } = src;
    players.push({
      ...look, id: cb.id, clone: true,
      x: ca ? lerp(ca.x, cb.x, k) : cb.x, y: ca ? lerp(ca.y, cb.y, k) : cb.y,
      hp: cb.hp, maxHp: cb.maxHp, radius: cb.r,
      // `charging`/`shieldT`/the stack pips are deliberately LEFT live: a
      // mirage that shows your repulse wind-up and your shield bubble (and
      // reflects nothing) is the whole point. `inLava` is forced off because a
      // clone is clamped inside the safe ring and can never be swimming.
      alive: true, inLava: false,
    });
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
    // this game's un-shrunk arena, off the wire since round 21.2 (it scales
    // with the seat count); older hosts don't send it, hence the fallback
    startRadius: fin(+s.startRadius) ? +s.startRadius : ARENA.START_RADIUS,
    pillars: Array.isArray(s.pillars) ? s.pillars : [],
    hazards: Array.isArray(s.hazards) ? s.hazards : [],
    meteors: Array.isArray(s.meteors) ? s.meteors : [],
    // mines never move: no interpolation, straight off the snapshot
    mines: Array.isArray(s.mines) ? s.mines : [],
    bolts: Array.isArray(s.bolts) ? s.bolts : [],
    walls: Array.isArray(s.walls) ? s.walls : [],
    roundSummary: (s.roundSummary && typeof s.roundSummary === 'object') ? s.roundSummary : null,
    players, projectiles, me: me(s),
  };
}

// ---- input ---------------------------------------------------------------------

function toWorld(px, py) {
  return { x: (px - view.cx) / view.scale, y: (py - view.cy) / view.scale };
}

// Round 21.7 (Remi): right-click is a GAME button, so the browser menu is off
// on the whole page; it used to pop over every overlay and background (lobby,
// the dead-and-waiting screen), and a misclick on "Reload" ended his game.
// Text inputs keep their menu (copy/paste on the name and room-code fields).
document.addEventListener('contextmenu', (e) => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  e.preventDefault();
});
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
async function doJoin() {
  initSfx(); // user gesture: the earliest moment browsers allow audio
  initMusic(); // same gesture unlocks the soundtrack
  const name = $('name').value.trim() || 'warlock';
  localStorage.setItem('warlockName', name);
  await transportP; // selection may still be probing /health on a fast click
  connect(name);
}
$('joinBtn').addEventListener('click', doJoin);
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

// ---- hosting online (docs/BRIEF-browser-hosting.md §B3) ---------------------
// "Host online" swaps the transport for an rtc-host BEFORE joining: the same
// in-tab engine as solo, plus a signalling room whose code becomes the invite
// link. The host is a player; friends open the link and land in this lobby.

function inviteLink(code) {
  const u = new URL(location.href);
  u.hash = `r=${code}`;
  u.searchParams.delete('mode'); // a pinned mode would fight the guest's transport pick
  return u.toString();
}

let hostCode = null;
function showHostbar(code) {
  hostCode = code;
  $('hostCode').textContent = code;
  $('lobbyInviteUrl').textContent = inviteLink(code);
  $('hostbar').classList.remove('hidden');
  $('lobbyHost').classList.remove('hidden');
  toast('your online room is open. Send friends the invite link');
}
async function copyInviteLink() {
  if (!hostCode) return;
  const link = inviteLink(hostCode);
  try { await navigator.clipboard.writeText(link); toast('invite link copied. Send it to your friends'); }
  catch { prompt('Copy this invite link:', link); } // clipboard needs https/localhost
}
$('copyLinkBtn').addEventListener('click', copyInviteLink);
$('copyLobbyLinkBtn').addEventListener('click', copyInviteLink);
// the host tab has no filesystem, so the journal lives in memory (capped) and
// leaves through this button; do not lose the debugging story silently (§B5)
$('hostLogBtn').addEventListener('click', () => {
  if (!transport || !transport.journal) return;
  const lines = transport.journal().map((x) => JSON.stringify(x)).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines], { type: 'application/x-ndjson' }));
  a.download = `warlock-host-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
  a.click();
  URL.revokeObjectURL(a.href);
});

async function doHost() {
  initSfx(); initMusic(); // the same user gesture rules as doJoin
  const name = $('name').value.trim() || 'warlock';
  localStorage.setItem('warlockName', name);
  await transportP; // don't race the initial selection
  if (!transport || transport.kind !== 'rtc-host') {
    wireTransport(createRtcHostTransport({ onRoom: showHostbar, onError: toast }));
  }
  connect(name);
}
$('hostBtn').addEventListener('click', doHost);

// Avatar panel (round 22.1): you join with a random free face; the panel shows
// the full roster with this lobby's taken ones greyed. Picking sends the change
// live; the server refuses duplicates and the snapshot is the truth on screen.
{
  const grid = $('avatarGrid');
  for (const av of AVATARS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = av;
    b.addEventListener('click', () => {
      myAvatar = av;
      try { localStorage.setItem('owAvatar', av); } catch { }
      send({ t: 'avatar', avatar: av });
      $('avatarPanel').classList.add('hidden');
    });
    grid.appendChild(b);
  }
}
$('avatarBtn').addEventListener('click', () => {
  const s = latest();
  const m = me(s);
  const taken = new Set(Object.values((s && s.players) || {})
    .filter((p) => p && p.id !== myId).map((p) => p.avatar));
  for (const b of $('avatarGrid').children) {
    b.disabled = taken.has(b.textContent);
    b.classList.toggle('sel', !!m && b.textContent === m.avatar);
  }
  $('avatarPanel').classList.remove('hidden');
});
$('avatarCloseBtn').addEventListener('click', () => $('avatarPanel').classList.add('hidden'));

// The gold rules, spelled out (no hidden income).
const goldRules =
  `Gold: +${GOLD.ROUND_BASE} g every round · +${GOLD.PER_KILL} g per kill · ` +
  `+${GOLD.ROUND_WIN} g for winning the round · +${GOLD.FIRST_DEATH} g if you die first · ` +
  `bounty up to +${GOLD.BOUNTY_MAX} g for slaying someone ahead of you.`;
$('ver').textContent = VERSION; // bottom-left build stamp; red on mismatch
// 📊 public usage counters (Remi: "visible from the game directly"), fetched
// live from the relay's /stats on click, shown to everyone.
$('statsBtn').addEventListener('click', async () => {
  $('statsOverlay').classList.remove('hidden');
  const el = $('statsBody');
  el.textContent = 'loading…';
  try {
    const s = await fetchStats();
    const t = s && s.total;
    if (!t) { el.textContent = 'stats unreachable (relay asleep or offline)'; return; }
    const today = (s.days || {})[new Date().toISOString().slice(0, 10)] || {};
    const row = (label, all, day) =>
      `<div>${label}: <b>${all || 0}</b>${day ? ` <span class="dim">(+${day} today)</span>` : ''}</div>`;
    el.innerHTML =
      row('page visits', t.visits, today.visits) +
      row('games started', t.games, today.games) +
      row('players seated', t.players_total, today.players_total) +
      row('rounds fought', t.rounds_total, today.rounds_total);
    // game_ends is still counted by the relay, just not displayed (Remi, round 23)
  } catch { el.textContent = 'stats unreachable (relay asleep or offline)'; }
});
$('statsOverlay').addEventListener('click', () => $('statsOverlay').classList.add('hidden'));
$('ideaBtn').addEventListener('click', () => $('ideaOverlay').classList.remove('hidden'));
$('ideaCloseBtn').addEventListener('click', () => $('ideaOverlay').classList.add('hidden'));
$('ideaOverlay').addEventListener('click', (e) => {
  if (e.target === $('ideaOverlay')) $('ideaOverlay').classList.add('hidden');
});
// Update watcher (Remi: "do I have to wait 12 minutes?"): GitHub Pages caches
// for 10 min, but a unique query string bypasses the CDN, so we can KNOW a
// newer build exists even while we're still serving the old one. Check every
// minute; on mismatch the corner stamp becomes a visible refresh prompt.
setInterval(async () => {
  try {
    const r = await fetch(`../shared/version.js?bust=${Date.now()}`, { cache: 'no-store' });
    const m = /VERSION = '([^']+)'/.exec(await r.text());
    if (m && m[1] !== VERSION) {
      $('ver').textContent = `${VERSION} → ${m[1]} available: refresh`;
      $('ver').classList.add('bad');
    }
  } catch { /* offline or file://; the stamp just stays quiet */ }
}, 60_000);
// teams (round 21.3): one sentence, because the selector on your row is the
// only place the feature is discoverable and "same number = allies" is the rule
$('lobbyFormat').textContent = `First to ${ROUND.KILLS_TO_WIN} kills wins.`;
$('shopIncome').textContent = goldRules;
// the long-form rules live behind the 📜 Rules fold (round 22 declutter)
$('lobbyRulesBody').innerHTML = [
  `Pick the same team number as a friend and you fight as one: your spells ` +
  `pass through each other, and a team of N races to ${ROUND.KILLS_TO_WIN} × N kills.`,
  goldRules,
  `You start with ${GOLD.START} gold. The shop opens after round 1. ` +
  'Hover anything in the shop for its full per-level numbers.',
].map((t) => `<p>${esc(t)}</p>`).join('');

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
  window.addEventListener('mousedown', onCaptureClick, true);
}
function cancelCapture() {
  if (!capturing) return;
  capturing = null;
  window.removeEventListener('keydown', onCaptureKey, true);
  window.removeEventListener('mousedown', onCaptureClick, true);
  refreshKeyUi();
}
// click anywhere but another key button = cancel (same rule as the popup)
function onCaptureClick(e) {
  if (!(e.target instanceof Element) || !e.target.classList.contains('keybtn')) cancelCapture();
}
function onCaptureKey(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.key === 'Escape') { cancelCapture(); return; }
  if (MODIFIER_KEYS.includes(e.key)) return; // wait for a real key
  bindKey(capturing, e.key.toLowerCase());
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
$('lobbyKeysBtn').addEventListener('click', () => $('keysPanel').classList.remove('hidden'));

// ---- rebinding: ONE rule, both entry points ---------------------------------
// Round 21.7 (Remi): "any key just works". Esc or a click outside cancels;
// ANY other key takes the binding, and if that key was another spell's, the two
// SWAP and a toast says so. No key is ever defended (the round-20 owned-spell
// veto is gone; it made the popup refuse and say nothing useful).
const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'];
function bindKey(spell, k) {
  if (!spell || !k || keyBindings[spell] === k) return;
  const other = spellForKey(k);
  const old = keyBindings[spell];
  keyBindings[spell] = k;
  if (other && other !== spell) {
    keyBindings[other] = old;
    toast(`Swapped: ${SPELLS[spell].name} is now ${keyLabel(k)}, ` +
      `${SPELLS[other].name} is now ${keyLabel(old)}`);
  }
  saveKeys();
  refreshKeyUi();
}

// The in-shop popup: click a spell's key chip, press the new key. The
// capture-phase listener eats every keydown while it is open.
let rebindSpell = null;
function openRebind(spell) {
  cancelCapture();
  rebindSpell = spell;
  $('rebindMsg').innerHTML = `Press the key you want for <b>${esc(SPELLS[spell].name)}</b>`;
  $('rebind').classList.remove('hidden');
  window.addEventListener('keydown', onRebindKey, true);
}
function closeRebind() {
  rebindSpell = null;
  $('rebind').classList.add('hidden');
  window.removeEventListener('keydown', onRebindKey, true);
}
$('rebind').addEventListener('click', closeRebind); // click away = cancel
function onRebindKey(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.key === 'Escape') { closeRebind(); return; }
  if (MODIFIER_KEYS.includes(e.key)) return; // wait for a real key
  bindKey(rebindSpell, e.key.toLowerCase());
  closeRebind();
}

// Every key label in the UI (panel, spell bar, shop chips, join hint) reflects
// current bindings.
function refreshKeyUi() {
  for (const [spell, btn] of Object.entries(keyRows)) {
    btn.classList.remove('capturing');
    btn.textContent = keyLabel(keyBindings[spell]);
  }
  for (const [spell, el] of Object.entries(spellEls))
    el.querySelector('.key').textContent = keyLabel(keyBindings[spell]);
  for (const chip of document.querySelectorAll('.keychip'))
    chip.textContent = keyLabel(keyBindings[chip.dataset.spell]);
  // the one always-visible controls line in the lobby, LIVE binding, never a
  // hardcoded Q (non-QWERTY scar, round 21.7)
  $('controlsHint').innerHTML =
    `press <kbd>${esc(keyLabel(keyBindings.fireball))}</kbd> to throw your fireball · <kbd>right-click</kbd> to move · hold <kbd>Tab</kbd> in game for the scoreboard`;
}

$('readyBtn').addEventListener('click', () => {
  const m = me(latest());
  send({ t: 'ready', ready: !(m && m.ready) });
});
// Segmented config (round 22.1): each button names an ABSOLUTE value, so a
// click is a choice, never a blind flip. Server-authoritative like before.
const seg = (id, fn) => {
  for (const b of document.querySelectorAll(`#${id} button`))
    b.addEventListener('click', () => fn(b.dataset.v));
};
seg('specSeg', (v) => send({ t: 'spectate', on: v === 'watch' }));
seg('modeSeg', (v) => send({ t: 'mode', mode: v }));
// draft is an INDEPENDENT flag, not a fourth ruleset: it rides on top of
// whichever ruleset is selected (docs/ROUND12.md S7)
seg('draftSeg', (v) => send({ t: 'draft', on: v === 'on' }));
seg('testSeg', (v) => send({ t: 'testing', on: v === 'on', gold: +$('testingGold').value || 0 }));
seg('chatSeg', (v) => send({ t: 'chatter', on: v === 'on' }));
$('testingGold').addEventListener('change', () => {
  const s = latest();
  if (s && s.testing)
    send({ t: 'testing', on: true, gold: +$('testingGold').value || 0 });
});
$('shopReadyBtn').addEventListener('click', () => send({ t: 'ready', ready: true }));
// Browse-only shop (round 22): the same grid straight from the lobby, no more
// testing→ready dance just to read the shelves. Buying stays phase-gated.
let shopPreview = false;
function setShopPreview(on) {
  shopPreview = on;
  $('shopCloseBtn').classList.toggle('hidden', !on);
  setVisible('shopPauseBtn', !on);
  setVisible('shopUndoBtn', !on); // nothing to refund while just browsing
  if (!on) {
    const s = latest();
    setVisible('shop', !!(s && myId && s.phase === 'shop'));
    return;
  }
  const s = latest();
  const shopMode = s && s.mode === 'classic' ? 'classic' : 'elemental';
  if (shopMode !== shopModeBuilt) {
    shopModeBuilt = shopMode;
    refreshShop = buildShop($('shopGrid'), shopMode);
  }
  refreshShop(me(s), 0, s);
  $('shopGold').textContent = '';
  $('shopTimer').textContent = '';
  $('shopSub').textContent = 'Browsing the shelves. Buying happens between rounds.';
  setVisible('shopGrid', true);
  setVisible('shopReadyBtn', false);
  setVisible('shop', true);
}
$('shopBrowseBtn').addEventListener('click', () => setShopPreview(true));
$('shopCloseBtn').addEventListener('click', () => setShopPreview(false));
// dead-and-watching scoreboard: collapsible so you can just watch the fight
$('specFoldBtn').addEventListener('click', () => {
  const folded = $('specpanel').classList.toggle('folded');
  $('specFoldBtn').textContent = folded ? '▸' : '▾';
});
// ★ rate this version (round 22): fire-and-forget to the relay; the average
// shows in the version picker. localStorage remembers yours so a re-rate
// replaces instead of stuffing the ballot. Friends-lobby trust, like kicks.
{
  const slug = new URLSearchParams(location.search).get('version') || 'default'; // versions.json's slug for the main game
  const box = $('rateBox');
  const saved = () => { try { return JSON.parse(localStorage.owRatings || '{}'); } catch { return {}; } };
  const paint = (n) => { [...box.children].forEach((b, i) => b.classList.toggle('lit', i < n)); };
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '★';
    b.title = 'Rate this version (the average shows in the version list)';
    b.addEventListener('click', () => {
      const all = saved();
      const prev = all[slug] || null;
      all[slug] = i;
      try { localStorage.owRatings = JSON.stringify(all); } catch { }
      analytics.rateVersion?.(slug, i, prev);
      paint(i);
      toast(prev ? 'rating updated, thanks' : 'thanks for rating ★');
    });
    box.appendChild(b);
  }
  paint(saved()[slug] || 0);
}
// Shop pause: anyone may freeze or unfreeze the clock (friends-lobby trust, same
// as the kick/ban buttons). Reads the current state off the last snapshot so the
// one button toggles.
$('shopPauseBtn').addEventListener('click', () => {
  send({ t: 'shopPause', on: !shopPausedBy });
});
$('shopUndoBtn').addEventListener('click', () => send({ t: 'undo' }));
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
    b.textContent = `+ ${botLabel(kind)}`;
    const sel = document.createElement('select');
    sel.className = 'botsel';
    sel.id = `botBuild-${kind}`;
    sel.title = 'Build strategy for the next added bot (see “strategies explained” below)';
    // issue #7: a `kinds` build belongs to those tiers only (the Faker's combo
    // arsenals), and a tier that has its own builds offers nothing else
    const hasOwn = Object.values(BUILDS).some(b => b.kinds && b.kinds.includes(kind));
    const offered = Object.entries(BUILDS).filter(([, bs]) =>
      bs.kinds ? bs.kinds.includes(kind) : !hasOwn);
    sel.innerHTML = `<option value="random">🎲 random</option>` +
      offered.map(([k, bs]) =>
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
    <p><b>Strategy</b> is what it buys. Each shop it grabs the first thing on its list it can afford:</p>
    <table class="helptable">${rowsBuilds}</table>
    <p>🎲 random rolls one of the six strategies when the bot is added.</p>`;
}

// mute toggle (persisted in localStorage 'owMuted')
{
  const btn = $('muteBtn');
  const paint = () => { btn.textContent = isMuted() ? '🔇' : '🔊'; };
  btn.addEventListener('click', () => {
    initSfx(); // a gesture too; lets sound start here if join predates audio
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
    initMusic(); // a gesture too; lets the soundtrack start here
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
// the same commit; a hardcoded tooltip would be a lie within a week.

function fmtNum(v) {
  if (v === Infinity) return '∞';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (!fin(+v)) return String(v);
  return String(Math.round(+v * 100) / 100);
}
const fmtSec = (v) => (+v ? `${fmtNum(v)} s` : '·');
// Multipliers read as the change they make: 0.85 is "−15%", 1 is "no effect".
function fmtMult(v) {
  const n = +v;
  if (!fin(n)) return String(v);
  if (Math.abs(n - 1) < 1e-9) return '·';
  const d = Math.round((n - 1) * 1000) / 10;
  return `${d > 0 ? '+' : '−'}${fmtNum(Math.abs(d))}%`;
}
const fmtGold = (v) => (+v > 0 ? `${fmtNum(v)} g` : 'free');

// label + formatter per known field; anything unknown still prints (raw key,
// raw value) so a newly added constant shows up instead of vanishing.
const SPELL_FIELDS = {
  // genki (issue #12, reworked: levels buy the damage cap, the rate is flat)
  dmgPerSec: ['damage grows', (v) => `+${fmtNum(v)}/s`],
  dmgCap: ['damage cap', fmtNum],
  unstoppableAfter: ['unstoppable, after the smash stage +', fmtSec],
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
  clones: ['copies of you', fmtNum],
  stores: ['fireballs it stores', fmtNum],
  ballDelay: ['stored balls fire', (v) => `${fmtSec(v)} apart`],
  repay: ['repay after', fmtSec],
};
// `stun` is skipped here because it is not a per-level array but the RECIPE the
// sim evaluates at resolution ({pad, min}); spellTip prints the two readings a
// player can act on instead (round 20.5).
const SPELL_SKIP = new Set(['name', 'hotkey', 'maxLevel', 'costs', 'desc', 'long', 'tier', 'minRound', 'stun',
  // genki (issue #12): the growth formula's internals; `long` tells the story
  'smashR', 'calibT', 'kbBase']);
// element fx whose array is NOT per-level (tierHits columns are tiers);
// their reading lives in another row's label instead. markDelay and
// rampPermanent are display-only trims (Remi, round 19.4: those anger rows
// "don't add information"); the sim still reads them from the spec.
const ELEM_FX_SKIP = new Set(['tierHits', 'markDelay', 'rampPermanent']);

const FX_FIELDS = {
  dmgAdd: ['fireball damage', (v) => `+${fmtNum(v)}`],
  kbAdd: ['fireball push', (v) => `+${fmtNum(v)}`],
  dmgMult: ['fireball damage', fmtMult],
  kbMult: ['fireball push', fmtMult],
  haste: ['fireball haste', (v) => `+${fmtNum(v)}`],
  cdMult: ['fireball haste', (v) => `+${fmtNum(Math.round((1 / v - 1) * 100))}%`],
  projRadiusMult: ['fireball size', fmtMult],
  projSpeedMult: ['fireball speed', fmtMult],
  stacksToTrigger: ['stacks to detonate', fmtNum],
  burstKbMult: ['the gust pushes', fmtMult],   // dormant: pre-round-19 revert path
  burstKbAdd: ['the gust adds', (v) => `+${fmtNum(v)} push`],
  hitRefund: ['fireball hit refunds', (v) => (+v > 0 ? `−${fmtSec(v)} off every cooldown` : '·')],
  pierceAtLevel: ['passthrough unlocks at', (v) => `lv ${fmtNum(v)}`],
  slowMult: ['victim speed', fmtMult],
  slowT: ['slow lasts', fmtSec],
  stunT: ['stun lasts', fmtSec],
  tickDmg: ['damage per tick', fmtNum],
  dotTime: ['sickness lasts', fmtSec],
  tickEvery: ['ticks every', fmtSec],
  auraR: ['contagion radius', fmtNum],
  goldOnHit: ['gold per cashed mark', (v) => `+${fmtNum(v)} g`],
  markEvery: ['a mark appears every', fmtSec],
  markDmg: ['each claimed mark', (v) => `+${fmtNum(v)} dmg, forever`],
  chargeEvery: ['engorged ball', (v) => `every ${fmtNum(v)}th cast`],
  chargeHeal: ['engorged ball heals', (v) => `${fmtNum(v)} hp on landing`],
  cdFloor: ['a refund never goes below', fmtSec],
  pierce: ['your fireball (at lv 3)', (v) => (v ? 'passes THROUGH bodies' : 'pops on the first body')],
  doubleEvery: ['your fireball fires as a pair', (v) => `every ${fmtNum(v)}th cast`],
  trailDelay: ['the second ball leaves', (v) => `${fmtSec(v)} later`],
};

// Item fx fields, same shape as SPELL_FIELDS/FX_FIELDS. There is no
// "how do copies compound" column any more: ITEM_FX holds ABSOLUTE CUMULATIVE
// totals per level, so the array IS the row (see shared/items.js).
const ITEM_FIELDS = {
  speedMult: ['move speed', fmtMult],
  lavaMult: ['lava damage taken', fmtMult],
  kbMult: ['knockback taken', fmtMult],
  maxHp: ['max HP', (v) => `+${fmtNum(v)}`],
  lifesteal: ['lifesteal', (v) => `${fmtNum(Math.round(v * 1000) / 10)}%`],
  haste: ['ability haste', (v) => `+${fmtNum(v)}`],
  auraDps: ['burn damage', (v) => `${fmtNum(v)}/s`],
  auraR: ['burn radius', fmtNum],
  linger: ['keeps burning for', fmtSec],
  healOnHit: ['heal per enemy hit', (v) => `+${fmtNum(v)} hp`],
  tickFrac: ['burns & sickness heal', (v) => `${fmtNum(Math.round(v * 100))}% of that, max 1/s`],
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
  cape: (lv) => `you take ×${fmtNum(itemFxAt('cape', 'kbMult', lv))} knockback`,
  sword: (lv) => `you heal ${fmtNum(Math.round(itemFxAt('sword', 'lifesteal', lv) * 1000) / 10)}% of the damage you deal`,
  hourglass: (lv) => `all your cooldowns run at ×${fmtNum(Math.round(100 / (1 + itemFxAt('hourglass', 'haste', lv) / 100)) / 100)}`,
  brazier: (lv) => `enemies within ${fmtNum(itemFxAt('brazier', 'auraR', lv))} units of you burn for ${fmtNum(itemFxAt('brazier', 'auraDps', lv))} hp/s, and keep burning ${fmtNum(itemFxAt('brazier', 'linger', lv))} s after they leave`,
  spoon: (lv) => `every enemy you damage heals you ${fmtNum(itemFxAt('spoon', 'healOnHit', lv))} hp, and ${fmtNum(itemFxAt('spoon', 'healOnHit', lv) * ITEM_FX.spoon.tickFrac)} per burn or sickness tick`,
};

// The card's stat tag (round 20.1, Remi): ONE short value, not a sentence;
// the totals at the level you'd buy (ITEM_FX arrays are cumulative), repainted
// by refresh(); at max level it reads as the totals you own.
const ITEM_TAG = {
  boots: (lv) => `+${fmtNum(Math.round((itemFxAt('boots', 'speedMult', lv) - 1) * 100))}% speed`,
  treads: (lv) => `−${fmtNum(Math.round((1 - itemFxAt('treads', 'lavaMult', lv)) * 100))}% lava dmg`,
  amulet: (lv) => `+${fmtNum(itemFxAt('amulet', 'maxHp', lv))} max HP`,
  cape: (lv) => `−${fmtNum(Math.round((1 - itemFxAt('cape', 'kbMult', lv)) * 100))}% knockback`,
  sword: (lv) => `${fmtNum(Math.round(itemFxAt('sword', 'lifesteal', lv) * 100))}% lifesteal`,
  hourglass: (lv) => `+${fmtNum(itemFxAt('hourglass', 'haste', lv))} haste`,
  brazier: (lv) => `${fmtNum(itemFxAt('brazier', 'auraDps', lv))} dmg/s, r ${fmtNum(itemFxAt('brazier', 'auraR', lv))}, +${fmtNum(itemFxAt('brazier', 'linger', lv))} s`,
  spoon: (lv) => `+${fmtNum(itemFxAt('spoon', 'healOnHit', lv))} hp per hit`,
};

// One row of the per-level table. A scalar REPEATS in every level column
// (round 20, Remi: half-empty columns read as "level 1 has no stats"); 0 is
// a value too (the bomb's knockback: 0 must print), never a blank cell.
// Known fields first, in the order the dictionary declares them (damage before
// hit radius); anything the dictionary hasn't heard of trails behind, unlabelled
// but visible; a new constant must never silently vanish from the tooltip.
function orderedFields(obj, dict, skip) {
  const keys = Object.keys(obj).filter(k => !(skip && skip.has(k)));
  const known = Object.keys(dict).filter(k => keys.includes(k));
  return known.concat(keys.filter(k => !dict[k]));
}

// issue #14 iteration 3 (Sam): the tooltip stopped being a 3-column table.
// It reads top-down — name+level, identity, description, an interactive
// 3-step progression indicator (bronze/silver/gold), CURRENT effects, then
// ONE upgrade block: the next level by default, or the future level whose
// dot the mouse is on. Only values that change, `old → new`, and a NEW
// badge on an effect whose value first appears at that level.

// one line per spec field: at(lv) reads the value at a 1-based level
function tipLines(obj, dict, skip) {
  return orderedFields(obj, dict, skip).map((f) => {
    const [label, fmt] = dict[f] || [f, fmtNum];
    return { f, label, fmt, at: (lv) => statAt(obj[f], lv) };
  });
}

function tipProg(cur, max, target) {
  let h = '<div class="prog">';
  for (let lv = 1; lv <= max; lv++) {
    if (lv > 1) h += `<span class="pline${lv <= cur ? ' done' : ''}"></span>`;
    const state = lv <= cur ? 'done' : lv === cur + 1 ? 'next' : 'future';
    const tag = lv === cur ? 'current' : (lv === cur + 1 && cur < max ? 'next' : '');
    h += `<span class="pdot l${lv} ${state}${lv === target ? ' sel' : ''}" data-lv="${lv}">` +
      `<i></i><b>LV${lv}</b><u>${tag}</u></span>`;
  }
  return h + '</div>';
}

function tipStatList(lines, lv) {
  let h = '';
  for (const ln of lines) {
    const v = ln.at(lv);
    if (v == null) continue;
    h += `<div class="stat"><span>${esc(ln.label)}</span><b>${esc(ln.fmt(v))}</b></div>`;
  }
  return h;
}

// the upgrade block from level `from` to `to`: changed values only. A value
// that was none/zero before wears the NEW badge of the level unlocking it.
function tipUpgrade(lines, from, to) {
  let h = '';
  for (const ln of lines) {
    const b = ln.at(to);
    if (b == null) continue;
    if (from < 1) {
      h += `<div class="stat"><span>${esc(ln.label)}</span><b>${esc(ln.fmt(b))}</b></div>`;
      continue;
    }
    const a = ln.at(from);
    if (String(ln.fmt(a)) === String(ln.fmt(b))) continue;
    if ((a == null || a === 0 || a === false) && b) {
      h += `<div class="stat"><span><i class="newb l${to}">NEW</i>${esc(ln.label)}</span>` +
        `<b>${esc(ln.fmt(b))}</b></div>`;
    } else {
      h += `<div class="stat"><span>${esc(ln.label)}</span>` +
        `<b class="dim">${esc(ln.fmt(a))}</b><b class="arrow">→</b><b>${esc(ln.fmt(b))}</b></div>`;
    }
  }
  return h || '<div class="stat dimline">no stat changes at this level</div>';
}

function tipBody(lines, cur, max, costAt, previewLv) {
  const maxed = cur >= max;
  const target = !maxed && previewLv > cur + 1 ? Math.min(previewLv, max)
    : Math.min(cur + 1, max);
  let h = tipProg(cur, max, maxed ? 0 : target);
  if (cur >= 1) {
    h += `<div class="lvhead l${Math.min(cur, 3)}">CURRENT · LV ${cur}${maxed ? ' · MAX' : ''}</div>` +
      `<div class="stats">${tipStatList(lines, cur)}</div>`;
  }
  if (!maxed) {
    const from = target === cur + 1 ? cur : target - 1;
    h += `<div class="lvhead l${target}">LV ${target} · <span class="cost">${esc(costAt(target))}</span>` +
      `${from >= 1 && from !== cur ? ` <span class="vs">vs lv ${from}</span>` : ''}</div>` +
      `<div class="stats">${tipUpgrade(lines, from, target)}</div>`;
  }
  return h;
}

function tipShell(icon, name, sub, desc, body, foot, lv = 0, max = 3) {
  return `<div class="tname"><span class="ic">${icon}</span>${esc(name)}` +
    `${lv > 0 ? `<span class="tlv l${Math.min(lv, 3)}">LV ${lv}${lv >= max ? ' · MAX' : ''}</span>` : ''}</div>
    ${sub ? `<div class="tsub">${esc(sub)}</div>` : ''}
    <div class="tdesc">${esc(desc)}</div>
    ${body}
    ${foot ? `<div class="tfoot">${foot}</div>` : ''}`;
}

function spellTip(key, spec, level, maxLevel, previewLv) {
  const lines = tipLines(spec, SPELL_FIELDS, SPELL_SKIP);
  // the return leg (boomerang) flies back through the launch point and onward
  // until caught; no spec field carries that, but the list must not imply the
  // flight ends where the throw does (Remi, round 19.4)
  const od = lines.findIndex((ln) => ln.f === 'outDistance');
  if (od >= 0) lines.splice(od + 1, 0,
    { f: '_ret', label: 'return distance', fmt: fmtNum, at: () => Infinity });
  // Switcheroo's stun scales with how far you actually swapped (round 20.5):
  // show the floor and what a full-range swap buys, recomputed from the spec
  // exactly like the sim does it (min floor, pad + d/speed, round-21.0 max).
  if (spec.stun) {
    const rng = Array.isArray(spec.range) ? spec.range : [spec.range];
    const swapStun = d => Math.min(spec.stun.max || Infinity,
      Math.max(spec.stun.min, spec.stun.pad + d / SPELLS.fireball.speed));
    lines.push({ f: '_stun0', label: 'stun, short swap', fmt: fmtSec, at: () => spec.stun.min });
    lines.push({ f: '_stun1', label: 'stun, full-range swap', fmt: fmtSec,
      at: (lv) => swapStun(statAt(rng, lv)) });
  }
  const foot = spec.minRound ? `Locked until round <b>${spec.minRound + 1}</b>.` : '';
  const sub = spec.long && spec.long !== spec.desc ? spec.desc : null;
  return tipShell(ICONS[key], spec.name, sub, spec.long || spec.desc,
    tipBody(lines, level, maxLevel, (lv) => fmtGold(spec.costs[lv - 1]), previewLv),
    foot, level, maxLevel);
}

function elementTip(key, spec, level, previewLv) {
  const lines = tipLines(spec.fx || {}, FX_FIELDS, ELEM_FX_SKIP);
  // the one boilerplate line that earns its place: what haste MEANS
  const foot = spec.fx && spec.fx.haste
    ? 'Ability Haste: +18 means 18% more casts in the same time. It sums across everything you own.' : '';
  const sub = spec.long && spec.long !== spec.desc ? spec.desc : null;
  return tipShell(spec.icon, spec.name, sub, spec.long || spec.desc,
    tipBody(lines, level, spec.maxLevel, (lv) => fmtGold(spec.costs[lv - 1]), previewLv),
    foot, level, spec.maxLevel);
}

// Items are LEVELLED like spells (round 12): the ITEM_FX arrays are absolute
// totals, so every value is read straight out of the spec: no per-copy
// arithmetic, and nothing here can drift from what stats() computes on the
// server. Cost is flat for most items; the hourglass carries a per-level
// costs array (itemCost reads both).
function itemTip(key, spec, level, previewLv) {
  const cur = Math.min(level, spec.maxLevel);
  const lines = tipLines(ITEM_FX[key] || {}, ITEM_FIELDS);
  const live = level > 0 && ITEM_LIVE[key] && ITEM_LIVE[key](cur);
  const foot = [
    live ? `With that, ${live}.` : '',
    key === 'hourglass' ? 'Ability Haste: +10 means 10% more casts in the same time. It sums across everything you own.' : '',
  ].filter(Boolean).join(' ');
  const sub = spec.long && spec.long !== spec.desc ? spec.desc : null;
  return tipShell(ICONS[key], spec.name, sub, spec.long || spec.desc,
    tipBody(lines, cur, spec.maxLevel, (lv) => fmtGold(itemCost(key, lv - 1)), previewLv),
    foot, level, spec.maxLevel);
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

// issue #14 iteration 3 (Sam): the progression dots inside the tooltip are
// interactive, so the tooltip takes the mouse and hides on a short grace
// period — leaving the card toward the tooltip keeps it open, leaving both
// closes it. paintTip re-renders in place when a dot changes the preview.
let tipHideT = null;

function paintTip() {
  // idempotent: the shop refresh calls this ~20x/s and a re-render swaps the
  // DOM under the mouse (which re-fires mouseenter) — repaint ONLY when the
  // rendered html actually changed, or hovering a dot would loop forever
  const html = tipOwner.build(tipOwner.preview);
  if (!html || html === tipOwner.lastHtml) return;
  tipOwner.lastHtml = html;
  tipEl.innerHTML = html;
  tipEl.classList.remove('hidden');
  placeTip(tipOwner.el);
  for (const d of tipEl.querySelectorAll('.pdot')) {
    d.addEventListener('mouseenter', () => {
      if (!tipOwner || tipOwner.preview === +d.dataset.lv) return;
      tipOwner.preview = +d.dataset.lv;
      paintTip();
    });
  }
  const prog = tipEl.querySelector('.prog');
  if (prog) {
    // ONLY the indicator keeps the tooltip alive: parking the mouse on the
    // tip body must never pin it open over the shop (it blocks clicks)
    prog.addEventListener('mouseenter', () => clearTimeout(tipHideT));
    prog.addEventListener('mouseleave', () => {
      if (!tipOwner) return;
      scheduleHideTip();
      if (tipOwner.preview == null) return;
      tipOwner.preview = null;
      paintTip();
    });
  }
}

function showTip(el, build) {
  clearTimeout(tipHideT);
  tipOwner = { el, build, preview: null };
  paintTip();
}

function hideTip() {
  clearTimeout(tipHideT);
  tipOwner = null;
  tipEl.classList.add('hidden');
}

function scheduleHideTip() {
  clearTimeout(tipHideT);
  tipHideT = setTimeout(() => {
    const p = tipEl.querySelector('.prog');
    if (!(p && p.matches(':hover'))) hideTip();
  }, 350);
}
// the tooltip has no clickable content (the dots are hover-only), so a press
// on it means the player wants what is UNDER it: get out of the way at once
tipEl.addEventListener('pointerdown', hideTip);

// ⚠ Boundary events are NOT enough: paintTip replaces the tooltip's DOM under
// a stationary cursor, and the browser then never fires mouseleave (its hover
// chain points at the detached node) — the tooltip stayed open forever. This
// document-level guard re-derives keep-alive from every real mouse move: the
// anchor card and the progression dots hold the tooltip, anywhere else arms
// the grace timer.
document.addEventListener('mousemove', (e) => {
  if (!tipOwner || tipEl.classList.contains('hidden')) return;
  const t = e.target;
  const anchor = (tipOwner.el.closest && tipOwner.el.closest('.warewrap')) || tipOwner.el;
  if (anchor === t || (anchor.contains && anchor.contains(t))) { clearTimeout(tipHideT); return; }
  if (tipEl.contains(t)) {
    const prog = tipEl.querySelector('.prog');
    if (prog && prog.contains(t)) { clearTimeout(tipHideT); return; }
  }
  scheduleHideTip();
});

// Repaint the open tooltip from fresh state (a purchase just changed a level).
// Called on every shop refresh; paintTip's html memo makes that free, and the
// hover preview survives refreshes instead of being stomped 20x a second.
function refreshTip() {
  if (!tipOwner || !tipOwner.el.isConnected) { hideTip(); return; }
  try { paintTip(); } catch { hideTip(); }
}

function attachTip(el, build) {
  const show = () => showTip(el, build);
  el.addEventListener('mouseenter', show);
  el.addEventListener('focus', show);
  el.addEventListener('mouseleave', scheduleHideTip);
  el.addEventListener('blur', scheduleHideTip);
}

// The panel is anchored to a button, so it has to follow when the wares scroll
// under it; a resize is rare enough to just dismiss.
$('shop').addEventListener('scroll', () => { if (tipOwner) placeTip(tipOwner.el); }, true);
window.addEventListener('resize', hideTip);

// Spec fields are scalars or per-level arrays; statAt reads the value at a
// 1-based level either way.
const statAt = (v, level) => Array.isArray(v) ? v[Math.min(level, v.length) - 1] : v;

// Round 17 §10: the elements sit in two labeled shop rows. PRESENTATIONAL
// only, every one of them is still 3 levels and buys exactly what it did.
// Elements = the ball's stat axes; Mutations = the ones that change what the
// ball does.
const ELEMENT_ROWS = [
  ['Elements ⚗️ (your fireball\'s stat axes)',
    ['ember', 'terra', 'gale', 'arcane', 'ghost']],
  ['Mutations 🧬 (they change what your fireball does)',
    ['malady', 'frost', 'anger', 'mosquito', 'vampire', 'midas']],
];
const ROW_KEYS = new Set(ELEMENT_ROWS.flatMap(([, keys]) => keys));

// Round 20 (Remi): the spells sit in three quiet groups, labelled on the edge
// of each row. PRESENTATIONAL only, nothing about a spell changes.
// Round 21.7/21.8 (Remi): the Stone Pillar and the Mine both sit in Special;
// they are things you LEAVE somewhere, not things you throw at a face.
const SPELL_ROWS = [
  ['Offense', ['fireball', 'lightning', 'boomerang', 'meteor', 'genki', 'repulse', 'nova']], // Mine is a weapon (Remi, round 22)
  ['Defense', ['teleport', 'shield', 'debt', 'statue', 'rush', 'wall', 'firewalk']],
  ['Special', ['swap', 'vanish', 'decoy', 'pillar']],
];
const SPELL_ROW_KEYS = new Set(SPELL_ROWS.flatMap(([, keys]) => keys));

// Build shop buttons once per container; refresh() updates them from state.
// mode-aware: 'elemental' adds the Elements section and the elemental-only
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
  // draft pool can hide its heading too. Cards are MINIMAL (round 20, Remi):
  // icon + name + cost (+ the key chip on spells); everything else is the
  // hover tooltip's job. Each section is a flex ROW so a whole category fits
  // one line; rows hide with their wares like labels do.
  const labels = [];
  const rows = [];
  let curRow = null;
  const mkLabel = (txt, kind) => {
    const el = document.createElement('div');
    // iteration 2 (Sam): per-section accent hue, understated (sl-* in the CSS)
    el.className = 'shoplabel' + (kind ? ` sl-${kind}` : '');
    el.textContent = txt;
    container.appendChild(el);
    labels.push({ el, wares: [] });
  };
  const mkRow = (cat) => {
    const el = document.createElement('div');
    el.className = 'shoprow';
    if (cat) {
      const lab = document.createElement('span');
      lab.className = 'catlabel';
      lab.textContent = cat;
      el.appendChild(lab);
    }
    container.appendChild(el);
    curRow = el;
    rows.push({ el, wares: [] });
  };
  const inSection = (w) => {
    if (labels.length) labels[labels.length - 1].wares.push(w);
    if (rows.length) rows[rows.length - 1].wares.push(w);
  };
  const mkSpell = (key, spec) => {
    const b = document.createElement('button');
    b.className = 'ware';
    b.innerHTML = `<span class="icon">${ICONS[key]}</span>
      <span class="name">${spec.name}</span>
      <span class="lvbadge"></span>
      <span class="cost num"></span>`;
    b.dataset.key = key;   // stable hook for the UI tests
    b.addEventListener('click', () => {
      if (shopPreview) { toast('browsing only. Buying happens between rounds'); return; }
      playSfx('buy'); send({ t: 'buy', id: key });
    });
    // key chip (spells only): sits OUTSIDE the buy button in a relative wrapper
    // because a disabled button (max level / can't afford) eats clicks on its
    // children, and the chip must stay clickable to open the rebind popup.
    const wrap = document.createElement('div');
    wrap.className = 'warewrap';
    const chip = document.createElement('span');
    chip.className = 'keychip';
    chip.dataset.spell = key;
    chip.title = 'Click to rebind this key';
    chip.textContent = keyLabel(keyBindings[key]);
    chip.addEventListener('click', (e) => { e.stopPropagation(); openRebind(key); });
    wrap.appendChild(b);
    wrap.appendChild(chip);
    curRow.appendChild(wrap);
    const w = { key, spec, el: b, wrap, kind: 'spell' };
    attachTip(b, (pv) => spellTip(key, spec, w.level || 0, w.maxLevel || spec.maxLevel, pv));
    wares.push(w); inSection(w);
  };
  // Round 17 (Remi): no separate "Powerful" category; every spell is just a
  // spell in the shop. `tier: 'power'` lives on in the SPEC as the bot guard
  // and the draft-offer filter, never as a shelf. Round 20: three quiet
  // Offense / Defense / Special rows; a spell missing from SPELL_ROWS lands in
  // the last row so nothing can silently vanish from the shop.
  mkLabel('Spells 📜', 'spells');
  for (let i = 0; i < SPELL_ROWS.length; i++) {
    const [cat, keys] = SPELL_ROWS[i];
    mkRow(cat);
    for (const key of keys) if (SPELLS[key]) mkSpell(key, SPELLS[key]);
    if (i === SPELL_ROWS.length - 1)
      for (const [key, spec] of Object.entries(SPELLS))
        if (!SPELL_ROW_KEYS.has(key)) mkSpell(key, spec);
  }
  // elements carry their 2-4 word tag ON the card (round 20.1, Remi: the
  // no-text doctrine went one step too far here; a tag is parseable at a
  // glance; spells stay text-free because theirs are not)
  const mkElement = (key, spec) => {
    const b = document.createElement('button');
    b.className = 'ware';
    b.innerHTML = `<span class="icon">${spec.icon}</span>
      <span class="info"><span class="name">${spec.name}</span>
      <span class="tag">${esc(spec.desc)}</span></span>
      <span class="lvbadge"></span>
      <span class="cost num"></span>`;
    b.dataset.key = key;   // stable hook for the UI tests
    b.addEventListener('click', () => {
      if (shopPreview) { toast('browsing only. Buying happens between rounds'); return; }
      playSfx('buy'); send({ t: 'buy', id: key });
    });
    curRow.appendChild(b);
    const w = { key, spec, el: b, kind: 'element' };
    attachTip(b, (pv) => elementTip(key, spec, w.level || 0, pv));
    wares.push(w); inSection(w);
  };
  if (elemental) {
    for (let i = 0; i < ELEMENT_ROWS.length; i++) {
      const [label, keys] = ELEMENT_ROWS[i];
      mkLabel(label, i === 0 ? 'elements' : 'mutations');
      mkRow();
      for (const key of keys) if (ELEMENTS[key]) mkElement(key, ELEMENTS[key]);
      // the last row also catches anything added to ELEMENTS but not named
      // above, so a new element can never be silently missing from the shop
      if (i === ELEMENT_ROWS.length - 1)
        for (const [key, spec] of Object.entries(ELEMENTS))
          if (!ROW_KEYS.has(key)) mkElement(key, spec);
    }
  }
  mkLabel('Items 🎒 (passive boosts)', 'items');
  mkRow();
  for (const [key, spec] of Object.entries(ITEMS)) {
    if (spec.mode === 'elemental' && !elemental) continue;
    const b = document.createElement('button');
    b.className = 'ware';
    // items carry a one-value stat tag (round 20.1, Remi: "a very short
    // description of the stats it gives"); refresh() repaints it per level
    b.innerHTML = `<span class="icon">${ICONS[key]}</span>
      <span class="info"><span class="name">${spec.name}</span>
      <span class="tag"></span></span>
      <span class="lvbadge"></span>
      <span class="cost num"></span>`;
    b.dataset.key = key;   // stable hook for the UI tests
    b.addEventListener('click', () => {
      if (shopPreview) { toast('browsing only. Buying happens between rounds'); return; }
      playSfx('buy'); send({ t: 'buy', id: key });
    });
    curRow.appendChild(b);
    const w = { key, spec, el: b, kind: 'item' };
    attachTip(b, (pv) => itemTip(key, spec, w.level || 0, pv));
    wares.push(w); inSection(w);
  }
  return function refresh(m, round = 0, s = null) {
    if (!m) return;
    const gold = fin(+m.gold) ? +m.gold : 0;
    const spells = m.spells || {};
    // draft mode: this game's pool is not for sale. A pool thing you have
    // DRAFTED goes back on the shelf (that is how levels 2-3 are bought), which
    // is exactly "do I own any level of it", the same rule the server uses.
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
      // (spells hide their wrapper; the key chip must vanish with the ware)
      const locked = pool.has(w.key) && ownedOf(w) < 1;
      (w.wrap || w.el).classList.toggle('hidden', locked);
      if (locked) { w.el.disabled = true; continue; }
      const cost = w.el.querySelector('.cost');
      // issue #14 (Sam): every card wears its state — maxed / poor (unowned,
      // unaffordable) / sel (owned) / up (owned, next level affordable) —
      // computed per kind below, painted once at the bottom.
      let maxed = false, afford = false, locked2 = false;
      if (w.kind === 'spell') {
        // power tier stays locked until enough rounds have been fought
        if (w.spec.minRound && round < w.spec.minRound) {
          cost.textContent = `🔒 r${w.spec.minRound + 1}`; cost.className = 'cost';
          w.el.disabled = true;
          w.level = spells[w.key] || 0;
          locked2 = true;
        } else {
          const level = spells[w.key] || 0;
          // round 16: in elemental mode the fireball never levels; the elements
          // are its progression (same rule as buy() in shared/sim.js)
          const maxLevel = elemental && w.key === 'fireball' ? 1 : w.spec.maxLevel;
          w.level = level; w.maxLevel = maxLevel; // what the tooltip reads
          if (level >= maxLevel) {
            maxed = true;
          } else {
            const c = w.spec.costs[level];
            cost.textContent = `${c} g`; cost.className = 'cost';
            afford = gold >= c;
            w.el.disabled = !afford;
          }
        }
      } else if (w.kind === 'element') {
        const elevel = (m.elements && m.elements[w.key]) || 0;
        w.level = elevel;
        if (elevel >= w.spec.maxLevel) {
          maxed = true;
        } else {
          const c = w.spec.costs[elevel];
          cost.textContent = `${c} g`; cost.className = 'cost';
          afford = gold >= c && (spells.fireball || 0) >= 1;
          w.el.disabled = !afford;
        }
      } else {
        // items are levelled like spells: the level you own sits next to the
        // name, the price is flat (the hourglass carries a per-level array;
        // itemCost handles both), and maxLevel is the wall.
        const level = Math.min(items[w.key] || 0, w.spec.maxLevel);
        w.level = level;
        // the stat tag tracks the level you'd BUY (totals); at max, what you own
        w.el.querySelector('.tag').textContent = ITEM_TAG[w.key]
          ? ITEM_TAG[w.key](Math.min(level + 1, w.spec.maxLevel)) : '';
        if (level >= w.spec.maxLevel) {
          maxed = true;
        } else {
          const c = itemCost(w.key, level);
          cost.innerHTML = `${c} g${level > 0 ? `<span class="nth">→ lv ${level + 1}</span>` : ''}`;
          cost.className = 'cost';
          afford = gold >= c;
          w.el.disabled = !afford;
        }
      }
      if (maxed) {
        // iteration 2 (Sam): ONE compact badge (LV n · MAX), no separate price
        cost.textContent = ''; cost.className = 'cost owned'; w.el.disabled = true;
      }
      const owned = (w.level || 0) > 0;
      const badge = w.el.querySelector('.lvbadge');
      if (badge) badge.textContent =
        owned ? (maxed ? `LV ${w.level} · MAX` : `LV ${w.level}`) : '';
      w.el.classList.toggle('sel', owned);
      w.el.classList.toggle('maxed', maxed);
      w.el.classList.toggle('poor', !owned && !maxed && !afford);
      w.el.classList.toggle('up', owned && !maxed && afford && !locked2);
      // level pips (round 22.2, Remi): a tiny bar at the bottom of every card
      // says 0..max at a glance (one cell per level, owned cells lit)
      const pmax = w.kind === 'spell' ? (w.maxLevel || w.spec.maxLevel) : w.spec.maxLevel;
      if (!w.pips) {
        w.pips = document.createElement('span');
        w.pips.className = 'pips';
        w.el.appendChild(w.pips);
      }
      if (w.pips.children.length !== pmax) w.pips.innerHTML = '<i></i>'.repeat(pmax);
      for (let i = 0; i < pmax; i++) w.pips.children[i].classList.toggle('on', i < (w.level || 0));
    }
    // a section whose whole stock is in the draft pool would leave a dangling
    // heading, so a label lives or dies with its wares, and so does each row
    // (its edge category label with it)
    for (const lab of labels)
      lab.el.classList.toggle('hidden', lab.wares.length > 0 &&
        lab.wares.every(w => (w.wrap || w.el).classList.contains('hidden')));
    for (const row of rows)
      row.el.classList.toggle('hidden', row.wares.length > 0 &&
        row.wares.every(w => (w.wrap || w.el).classList.contains('hidden')));
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
      ? `🎴 <b>Drafted for free:</b> ${esc(thingName(off.picked))}. It is yours at level 1, and its next levels are on sale below.`
      : `🎴 <b>Free draft pick</b>: pick one of these ${off.options.length}. ` +
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
// Tab scoreboard (round 22.3, Remi): HOLD Tab anywhere inside a game (shop,
// countdown, battle) for the live standings; release hides it. Replaces the
// stats table that used to sit on top of the shop.
let tabScore = false;
function paintScoreboard() {
  const s = latest();
  if (!s) return;
  const ps = Object.values(s.players || {}).filter((p) => p && typeof p === 'object');
  $('scoreStats').innerHTML = statsTable(
    ps.filter((p) => !p.spectator).sort(byRank),
    ps.filter((p) => p.spectator),
    { showRound: true });
}
addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || capturing) return; // a rebind capture owns the keyboard
  const t = document.activeElement;
  if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
  const s = latest();
  if (!myId || !s || s.phase === 'lobby' || s.phase === 'gameover') return;
  e.preventDefault(); // never walk the browser focus mid-game
  if (!tabScore) { tabScore = true; paintScoreboard(); $('scorepanel').classList.remove('hidden'); }
});
const hideScoreboard = () => { tabScore = false; $('scorepanel').classList.add('hidden'); };
addEventListener('keyup', (e) => { if (e.key === 'Tab') hideScoreboard(); });
addEventListener('blur', hideScoreboard); // alt-tab must not leave it stuck

const byRank = (a, b) =>
  (b.kills || 0) - (a.kills || 0) || (a.deaths || 0) - (b.deaths || 0) || (b.gold || 0) - (a.gold || 0);

// ---- versus teams (round 21.3) ---------------------------------------------
// A team is just a number every player carries; the default is their own, so a
// lobby nobody touched has N teams of one and every view below falls back to
// the flat scoreboard it always was. One quiet hue per number; the number is
// the truth, the colour is only there to find your side at a glance.
const teamNum = (t) =>
  `<span class="tnum" style="color:${teamTint(t)}">T${+t || 1}</span>`;

// Fighters grouped by team, best first (the ENGINE's own ranking function
// (shared/sim.js rankTeams), so the HUD can never disagree with the win rule.
const teamStandings = (list) => rankTeams(list);
// Teams only become a UI thing once somebody actually shares a number.
const teamsInPlay = (list) => list.some((p, i) =>
  list.some((q, j) => j !== i && q.team != null && q.team === p.team));

// A player's full kit as icons: spells then items then elements, each ONE icon
// carrying its level. Shown in the shop roster and standings.
function kitIcons(p) {
  const parts = [];
  for (const [k, lv] of Object.entries(p.spells || {}))
    if (lv > 0 && ICONS[k]) parts.push(`${ICONS[k]}${lv > 1 ? `<span class="klv">${lv}</span>` : ''}`);
  // ONE icon per item with its level on it, never N identical icons in a row
  // (that is what freely-stackable items used to render, and five pairs of boots
  // made the inventory unreadable). Same treatment as spells and elements.
  for (const [k, lv] of Object.entries(p.items || {}))
    if (lv > 0 && ICONS[k]) parts.push(`${ICONS[k]}${lv > 1 ? `<span class="klv">${lv}</span>` : ''}`);
  for (const [k, v] of Object.entries(p.elements || {}))
    if (v > 0 && ELEMENTS[k]) {
      if (k === 'anger') {
        // anger wears ONLY its earned bonus (🔴+12, no level superscript)
        // (round 20.1, Remi: "3 +12" read as unparseable noise; the level is
        // visible in the shop, the bonus is the number that matters)
        const bonus = +p.angerMarks > 0
          ? `<span class="klv">+${(+p.angerMarks * ELEMENTS.anger.fx.markDmg).toFixed(1)}</span>` : '';
        parts.push(`${ELEMENTS[k].icon}${bonus}`);
      } else {
        parts.push(`${ELEMENTS[k].icon}${v > 1 ? `<span class="klv">${v}</span>` : ''}`);
      }
    }
  return parts.join(' ');
}

// One scoreboard for the shop, the LIVE spectator panel and the end-of-game
// screen: same columns in the same order, so it only has to be learned once. A
// field the snapshot doesn't carry (classic mode, an older snapshot still in the
// ring buffer) prints as a placeholder dot rather than a zero; zero would be a claim.
//
// `showRound` adds the two per-ROUND columns (kills and gold) next to their
// per-GAME twins. Everything else in this table is a game total, always: the
// end screen never shows the round columns, and the two live views (shop, dead
// spectator) always do, with the word "round" in the header and the tooltip.
// Nothing here reads a position, an HP or a cooldown, which is why it is safe
// to show live to a dead player; see the spectator block in updateUi().
// Per-player RTT badge (round 18, Remi: "a friend had a lot of lag"). The
// number is server-measured over the ws socket, so it prices the NETWORK path
// only; a janky tab can show a green ping and still stutter. Bots have no
// socket and therefore no badge.
let lastPings = {};
function pingBadge(id) {
  const ms = lastPings[id];
  if (!fin(+ms)) return '';
  const cls = ms < 80 ? 'good' : ms < 180 ? 'warn' : 'bad';
  return ` <span class="ping ${cls}" title="round-trip to the server">${Math.round(ms)}ms</span>`;
}

function statsTable(fighters, specs, opts = {}) {
  const { winnerId = null, showRound = false } = opts;
  const cell = (v, cls = '') =>
    `<td class="n ${cls}">${fin(+v) ? Math.round(+v) : '<span class="dim">–</span>'}</td>`;
  const goldCols = showRound ? 3 : 2;
  const roundCols = showRound ? 1 : 0;
  const th = (label, tip) => `<th class="n" title="${esc(tip)}">${label}</th>`;
  const head = `<thead>
    <tr class="grp"><th colspan="${6 + roundCols}"></th>
      <th class="g" colspan="3">Damage dealt</th>
      <th class="g" colspan="1">HP healed</th>
      <th class="g" colspan="${goldCols}">Gold</th>
      <th class="c-kit"></th></tr>
    <tr><th></th><th>Warlock</th>
      ${th('❤️ HP', `current / max HP. Everyone starts the game with ${PLAYER.MAX_HP} max HP; the Amulet of Health raises yours`)}
      ${th('⚔️ Kills', `enemies you killed. GAME TOTAL, the number that wins the match (first to ${ROUND.KILLS_TO_WIN})`)}
      ${showRound ? th('⚔️ Round', 'kills you have scored in the CURRENT round') : ''}
      ${th('💀 Deaths', 'times you died, all game')}
      ${th('Streak', 'best multi-kill this game (×2 = double kill)')}
      ${th('Direct', 'damage you landed yourself: spells and DoT ticks')}
      ${th('Lava', 'lava burn credited to you for shoving someone in')}
      ${th('Total', 'direct + lava')}
      ${th('Lifesteal', 'HP the Blood Sword clawed back')}
      ${showRound ? th('Round', 'gold earned since the last shop (the CURRENT round only)') : ''}
      ${th('Wallet', 'gold you can spend right now')}
      ${th('Earned', 'gold earned all game, spent or not')}
      <th class="c-kit">Kit</th></tr></thead>`;
  const who = (p) =>
    `<td class="who"><span class="dot" style="display:inline-block;background:${p.color}"></span>
      ${esc(p.avatar || '🧙')} ${esc(p.name)}${p.id === myId ? ' (you)' : ''}${pingBadge(p.id)}</td>`;
  const row = (p, i) => {
    const direct = fin(+p.dmgDealt) ? +p.dmgDealt : null;
    const lava = fin(+p.dmgLava) ? +p.dmgLava : null;
    const mk = +p.multiKillBest || 0;
    const cls = [p.id === myId ? 'me' : '', winnerId && p.id === winnerId ? 'winner' : '']
      .filter(Boolean).join(' ');
    return `<tr class="${cls}"><td class="rank">${i + 1}</td>${who(p)}
      <td class="n">${fin(+p.maxHp)
        ? `${p.alive ? Math.max(0, Math.round(+p.hp)) : 0}/${Math.round(+p.maxHp)}`
        : '<span class="dim">–</span>'}</td>
      ${cell(p.kills)}${showRound ? cell(p.roundKills, 'g-round') : ''}${cell(p.deaths)}
      <td class="n">${mk >= 2 ? `<span class="mk">×${mk}</span>` : '<span class="dim">–</span>'}</td>
      ${cell(direct)}${cell(lava, 'g-lava')}${cell(direct != null && lava != null ? direct + lava : null)}
      ${cell(p.healLifesteal, 'g-heal')}
      ${showRound ? cell(p.roundGold, 'g-round') : ''}
      ${cell(p.gold, 'g-gold')}${cell(p.goldEarned ?? p.gold, 'g-gold')}
      <td class="kit c-kit">${kitIcons(p)}</td></tr>`;
  };
  // Teams (round 21.3): once ANY team has two members the table is banded by
  // team, each band headed by its kill sum against its own target (15 x size).
  // A lobby of solo teams keeps the flat table, unchanged.
  const grouped = () => {
    const span = 11 + roundCols + goldCols;
    let i = 0;
    return teamStandings(fighters).map(t => {
      const hdr = `<tr class="teamhdr"><td colspan="${span}">${teamNum(t.team)}
        · ${t.size === 1 ? 'solo' : `${t.size} warlocks`}
        · <b>${t.kills}</b> / ${t.target} kills</td></tr>`;
      return hdr + t.members.slice().sort(byRank).map(p => row(p, i++)).join('');
    }).join('');
  };
  const rows = (teamsInPlay(fighters) ? grouped() : fighters.map(row).join('')) +
    specs.map((p) =>
      `<tr class="spec"><td class="rank">👁</td>${who(p)}
      <td colspan="${9 + goldCols + roundCols}"></td><td class="c-kit"></td></tr>`).join('');
  return `${head}<tbody>${rows}</tbody>`;
}

function updateUi(s) {
  if (!s || typeof s !== 'object') return;
  lastPings = (s.pings && typeof s.pings === 'object') ? s.pings : {};
  shopPausedBy = typeof s.shopPaused === 'string' ? s.shopPaused : null;
  if (tabScore) paintScoreboard(); // live while held
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
  if (shopPreview && s.phase !== 'lobby') setShopPreview(false); // browsing is a lobby thing
  setVisible('shop', (!!myId && s.phase === 'shop') || shopPreview);
  setVisible('gameover', !!myId && (s.phase === 'gameover' || goPinned));
  // ⚠ shopPreview guard (round 22.1): browsing happens in the LOBBY phase, and
  // this line used to kill every hover tip 15 times a second while browsing
  if (s.phase !== 'shop' && !shopPreview) hideTip();
  // Dead and watching the rest of the round: the same scoreboard the end screen
  // prints, live (Remi, 2026-08-07). Battle phase only; the shop is a different
  // phase and already carries this table, and roundEnd belongs to the art
  // reveal, so the live panel never has to share the screen with either.
  const watchingLive = !!myId && s.phase === 'battle' && !!m && !m.alive;
  // a spell bar you cannot use: castSpell() refuses while !alive, so while you
  // are dead it is decoration, and it is exactly where the live panel sits
  setVisible('spellbar', !!myId && inGame && !(m && (m.spectator || !m.alive)));
  setVisible('specpanel', watchingLive);
  // the shop and the final standings carry the same numbers in full, so the
  // corner scoreboard would only peek out from behind them
  setVisible('topbar', !!myId && s.phase !== 'lobby' && s.phase !== 'shop' &&
    s.phase !== 'gameover' && !goPinned);
  setVisible('phasebar', !!myId && (s.phase === 'shop' || s.phase === 'battle' || s.phase === 'roundEnd'));
  // round 20.4 (Remi: "the banner to invite should not be present in game as it
  // takes space away"): the host banner is a LOBBY thing; friends only join
  // there, and the copy-link button comes back with it. Revert = drop this line.
  if (hostCode) {
    setVisible('hostbar', s.phase === 'lobby');
    setVisible('lobbyHost', s.phase === 'lobby');
  }
  phaseSounds(s);
  phaseMusic(s);
  updateCoopHud(s); // co-op campaign level card + status strip (no-op elsewhere)

  if (s.phase === 'lobby') {
    // Round 23 (Remi): rules, bots and bans belong to the host (no `host` in
    // the snap = solo or an old server: everyone keeps the controls)
    const amHost = !s.host || s.host === myId;
    const list = $('playerList');
    // Replacing a focused native select closes its menu. Leave the list alone
    // until the player has picked a team, then the next snapshot refreshes it.
    if (!(document.activeElement && document.activeElement.matches('#playerList .teamsel select'))) {
      list.innerHTML = '';
      for (const p of playerList) {
        const div = document.createElement('div');
        div.className = 'pl';
        div.innerHTML = `<span class="dot" style="background:${p.color}"></span>
          <span class="who">${esc(p.avatar || '🧙')} ${esc(p.name)}${p.spectator ? ' 👁' : ''}${p.bot ? ` 🤖 <span class="stars">${esc(botLabel(p.kind))}${p.build && BUILDS[p.build] ? ' · ' + esc(BUILDS[p.build].name.toLowerCase()) : ''}</span>` : ''}${p.id === myId ? ' (you)' : ''}${pingBadge(p.id)}</span>
          <span class="state ${p.ready ? 'ready' : ''}">${p.ready ? 'ready' : 'waiting'}</span>`;
        // Team number (round 21.3). You set your OWN, plus the bots', so one
        // person can arrange a 2v2 without everybody clicking. Other humans show
        // a read-only chip: their side is theirs to pick.
        if (s.mode !== 'coop') {
          if (p.id === myId || (p.bot && amHost)) {
            const wrap = document.createElement('span');
            wrap.className = 'teamsel';
            wrap.title = 'Team. Same number = allies: your spells pass through each other and you win rounds together.';
            const sel = document.createElement('select');
            for (let n = 1; n <= TEAMS.MAX; n++) {
              const o = document.createElement('option');
              o.value = String(n); o.textContent = String(n);
              sel.appendChild(o);
            }
            sel.value = String(p.team || 1);
            sel.style.color = teamTint(p.team);
            sel.addEventListener('change', () => {
              send({ t: 'team', n: +sel.value, ...(p.bot ? { id: p.id } : {}) });
              sel.blur();
            });
            wrap.append('team', sel);
            div.appendChild(wrap);
          } else {
            const chip = document.createElement('span');
            chip.className = 'teamchip';
            chip.innerHTML = `team ${teamNum(p.team)}`;
            div.appendChild(chip);
          }
        }
        // ban button on other humans: clears ghost seats AND keeps them out
        // (name+ip blocked until the server restarts or someone unbans)
        if (!p.bot && p.id !== myId && amHost) {
          const kb = document.createElement('button');
          kb.type = 'button';
          kb.className = 'mini kick';
          kb.title = `Ban ${p.name} from this lobby (until server restart / unban)`;
          kb.textContent = '✕';
          kb.addEventListener('click', () => send({ t: 'kick', id: p.id, ban: true }));
          div.appendChild(kb);
        }
        // per-row bot remove (round 22): pick WHICH bot leaves, not just the last
        if (p.bot && amHost) {
          const rb = document.createElement('button');
          rb.type = 'button';
          rb.className = 'mini kick';
          rb.title = `Remove ${p.name}`;
          rb.textContent = '✕';
          rb.addEventListener('click', () => send({ t: 'removeBot', id: p.id }));
          div.appendChild(rb);
        }
        list.appendChild(div);
      }
    }
    $('readyBtn').textContent = m && m.ready ? 'Not ready' : 'I am ready';
    $('readyBtn').classList.toggle('primary', !(m && m.ready));
    $('myAvatar').textContent = (m && m.avatar) || '';
    // segmented config: light the segment matching the server's state
    const segOn = (id, val) => {
      for (const b of document.querySelectorAll(`#${id} button`))
        b.classList.toggle('on', b.dataset.v === val);
    };
    segOn('specSeg', m && m.spectator ? 'watch' : 'play');
    segOn('modeSeg', s.mode === 'classic' ? 'classic' : 'elemental');
    segOn('draftSeg', s.draft ? 'on' : 'off');
    segOn('testSeg', s.testing ? 'on' : 'off');
    segOn('chatSeg', s.chat === false ? 'off' : 'on');
    // guests still SEE every setting (the lit segment is the readout);
    // they just can't click it
    for (const sid of ['modeSeg', 'draftSeg', 'testSeg', 'chatSeg'])
      $(sid).classList.toggle('locked', !amHost);
    $('hostHint').classList.toggle('hidden', amHost);
    $('botPanel').classList.toggle('hidden', !amHost);
    const testGold = $('testingGold');
    testGold.disabled = !amHost;
    $('testingGoldWrap').classList.toggle('hidden', !s.testing);
    if (s.testing && document.activeElement !== testGold)
      testGold.value = s.testing.gold;
    // a button that lifts bans is noise until a ban exists (Remi: "I didn't
    // know we could ban people"; you ban from the player list, mid-game)
    $('unbanBtn').classList.toggle('hidden', !(+s.bans > 0));
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
    const timer = $('shopTimer');
    const pausedBy = shopPausedBy;
    // testing: the shop clock never runs; only readying up moves the game on
    timer.textContent = pausedBy ? '⏸ paused'
      : s.testing ? '🧪 ∞' : `${Math.ceil(phaseT)} s`;
    timer.classList.toggle('low', !pausedBy && !s.testing && phaseT <= 5);
    timer.classList.toggle('paused', !!pausedBy);
    const pauseBtn = $('shopPauseBtn');
    pauseBtn.textContent = pausedBy ? '▶ Resume' : '⏸ Pause';
    pauseBtn.classList.toggle('on', !!pausedBy);
    $('shopUndoBtn').disabled = !(m && m.undoN); // only THIS shop's buys refund
    $('shopSub').textContent = pausedBy
      ? `⏸ Clock frozen by ${pausedBy}. Take your time. Everyone hitting Ready still starts the round.`
      : watching
        ? "You're spectating (no shopping)" : '';
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
          ? `Ready: next round (${readyN}/${humans.length} ready)` : 'Ready: next round';
      }
    }
  }

  if (s.phase === 'battle') {
    // teams race the same 15 kills PER MEMBER, so the line says whose race it is
    $('phasebar').textContent = s.coop
      ? `round ${s.round} · co-op campaign` // the kill race does not apply
      : teamsInPlay(playerList.filter(p => !p.spectator))
        ? `round ${s.round} · first team to ${ROUND.KILLS_TO_WIN} kills per warlock`
        : `round ${s.round} · first to ${ROUND.KILLS_TO_WIN} kills`;
  } else if (s.phase === 'roundEnd') {
    $('phasebar').textContent = `round ${s.round} over`;
  } else if (s.phase === 'shop') {
    $('phasebar').textContent = shopPausedBy
      ? `⏸ shop paused by ${shopPausedBy}`
      : s.testing ? '🧪 testing: ready up to start the round'
      : `next round in ${Math.ceil(phaseT)} s`;
  }

  // Live standings for the dead. Deliberately the SAME statsTable() the shop and
  // the end screen build (one scoreboard, not a second implementation), with
  // the per-round columns on, since the owner asked for "the current round AND
  // the game total". Nothing here is privileged information: every field it
  // reads (kills, deaths, streak, damage, heals, gold, kit) is already in every
  // living player's snapshot and already on the shop screen each round. It
  // deliberately shows NO position, NO hp and NO cooldowns, so a Vanished player
  // is exposed by exactly as much as before: nothing.
  if (watchingLive) {
    $('specSub').textContent = `round ${s.round} · game totals; the two “round” ` +
      `columns are this round only`;
    $('specStats').innerHTML = statsTable(
      playerList.filter(p => !p.spectator).sort(byRank),
      playerList.filter(p => p.spectator),
      { showRound: true });
  }

  if (s.phase === 'gameover') {
    const fightersL = playerList.filter(p => !p.spectator).sort(byRank);
    const w = fightersL.find(p => p.id === s.winner) || fightersL[0];
    // teams: the TEAM rules the ashes, with its summed kills against its target
    const wt = s.winTeam != null && teamsInPlay(fightersL)
      ? teamStandings(fightersL).find(t => t.team === s.winTeam) : null;
    $('goWinner').textContent = wt
      ? `Team ${wt.team} rules the ashes with ${wt.kills} kills: ` +
        `${wt.members.map(p => p.name).join(', ')}.`
      : w ? `${w.name} rules the ashes with ${w.kills || 0} kills.` : '';
    $('standings').innerHTML = statsTable(fightersL, playerList.filter(p => p.spectator),
      { winnerId: w ? w.id : null });
  }

  // topbar scoreboard: fighters ranked by kills, spectators last and dimmed
  if (s.phase !== 'lobby') {
    const fightersL = playerList.filter(p => !p.spectator).sort(byRank);
    const specs = playerList.filter(p => p.spectator);
    // the current kill leader wears the crown (only once someone has a kill)
    const leadId = fightersL.length && (fightersL[0].kills || 0) > 0 ? fightersL[0].id : null;
    const hdr = `<div class="hdr"><span class="dot" style="visibility:hidden"></span>
      <span class="who">warlock</span><span class="score">kills</span>
      <span class="gold">purse</span><span class="rgold">round</span></div>`;
    // teams: band the corner board the same way the big table is banded, with
    // the team's kill sum against its own target. Solo lobbies: unchanged.
    const teamHdr = (p, prev) => {
      if (!teamsInPlay(fightersL) || p.team === prev) return '';
      const t = teamStandings(fightersL).find(x => x.team === p.team);
      return t ? `<div class="thdr">${teamNum(t.team)}
        <span class="tgoal">${t.kills}/${t.target}</span></div>` : '';
    };
    let prevTeam = null;
    const ordered = teamsInPlay(fightersL)
      ? teamStandings(fightersL).flatMap(t => t.members.slice().sort(byRank))
      : fightersL;
    $('topbar').innerHTML = hdr + ordered.map(p => {
      const band = teamHdr(p, prevTeam); prevTeam = p.team;
      // "purse" is what's left to spend, "round" is what this round has paid
      // so far; the second is the one that tells you who is pulling ahead
      const rg = fin(+p.roundGold) ? +p.roundGold : null;
      return band + `<div class="r ${p.id === myId ? 'me' : ''} ${p.alive || s.phase !== 'battle' ? '' : 'dead'}">
        <span class="dot" style="background:${p.color}"></span>
        <span class="who">${p.id === leadId ? '👑 ' : ''}${esc(p.avatar || '🧙')} ${esc(p.name)}${pingBadge(p.id)}</span>
        <span class="score num">${p.kills || 0}</span>
        <span class="gold num">${p.gold || 0}g</span>
        <span class="rgold num ${rg ? '' : 'zero'}">${rg == null ? '' : `+${rg}`}</span>
      </div>`;
    }).concat(specs.map(p =>
      `<div class="r spec ${p.id === myId ? 'me' : ''}">
        <span class="dot" style="background:${p.color}"></span>
        <span class="who">${esc(p.avatar || '🧙')} ${esc(p.name)}${pingBadge(p.id)}</span>
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
      // your owned elements ride on the fireball slot (elemental mode); since
      // round 16 EVERY element is a fireball rider, so they all badge there.
      // The Hourglass (global haste, ex-"of Haste") is an item and shows in the shop.
      const riders = key === 'fireball' && m.elements
        ? Object.keys(m.elements)
            .filter(k => m.elements[k] > 0 && ELEMENTS[k])
            .map(k => ELEMENTS[k].icon).join('')
        : '';
      el.querySelector('.elem').textContent = riders;
      const cd = fin(+cooldowns[key]) ? +cooldowns[key] : 0;
      const cdEl = el.querySelector('.cd');
      el.classList.toggle('cooling', cd > 0); // issue #14: READY vs COOLDOWN border
      cdEl.classList.toggle('hidden', cd <= 0);
      if (cd > 0) cdEl.textContent = cd.toFixed(1);
    }
  }

  // live element readouts. A ramp you can't see is a mechanic you don't play
  // around, and the frost stacks riding on you are a countdown to a stun.
  const buffs = [];
  if (inGame && m && !m.spectator) {
    const angLv = (m.elements && m.elements.anger) || 0;
    if (angLv > 0) {
      // anger: the earned damage bank, plus whether your mark is out right now
      // (the red pip on the enemy's body is the real UI; this just confirms it)
      const f = ELEMENTS.anger.fx;
      const marks = Math.max(0, +m.angerMarks || 0);
      const markUp = playerList.some(p => p.myStacks && p.myStacks.anger > 0);
      buffs.push(`<span class="buff crit">${ELEMENTS.anger.icon} +${fmtNum(marks * f.markDmg)} dmg` +
        (markUp ? ' · mark is OUT: hunt it' : '') + '</span>');
    }
    // stacks riding on YOU: the worst single attacker's pile, i.e. how close
    // somebody is to detonating on you (counters are private now)
    const onMe = m.stacksOnMe || null;
    if (onMe && onMe.frost > 0)
      buffs.push(`<span class="buff frost">${ELEMENTS.frost.icon} ` +
        `${onMe.frost}/${ELEMENTS.frost.fx.stacksToTrigger}</span>`);
    // gale rides the same countdown as frost, and the thing it is counting down
    // to is being launched off the platform, so it gets the same chip
    if (onMe && onMe.gale > 0)
      buffs.push(`<span class="buff frost">${ELEMENTS.gale.icon} ` +
        `${onMe.gale}/${ELEMENTS.gale.fx.stacksToTrigger}</span>`);
    // vampire: count the casts down, so "the next one is the big one" is a thing
    // you KNOW rather than something you notice afterwards
    const vampLv = (m.elements && m.elements.vampire) || 0;
    if (vampLv > 0) {
      const every = ELEMENTS.vampire.fx.chargeEvery;
      const n = Math.max(0, +m.vampN || 0) % every;
      const heal = statAt(ELEMENTS.vampire.fx.chargeHeal, vampLv);
      buffs.push(`<span class="buff vamp">${ELEMENTS.vampire.icon} ` +
        (n === every - 1 ? `NEXT BALL · +${heal} hp` : `${n}/${every}`) + '</span>');
    }
    // Vanish: your own invisibility, counted down. `vanishT` is only ever on YOUR
    // player entry (snapshot() strips the whole position for everyone else), so
    // this chip is by construction self-only.
    if (fin(+m.vanishT) && +m.vanishT > 0)
      buffs.push(`<span class="buff vanish">${ICONS.vanish} invisible · ${(+m.vanishT).toFixed(1)}s</span>`);
    // Genki (issue #12): your own charge, priced live; press again to fire,
    // a direct hit drops it and the hit eats the whole number
    if (fin(+m.genkiDmg) && +m.genkiDmg > 0)
      buffs.push(`<span class="buff vanish">${ICONS.genki} charging · ${Math.round(+m.genkiDmg)} dmg</span>`);
    // Statue: the freeze is short and total, so the countdown is the whole HUD
    // story: how long until you can act again.
    if (fin(+m.statueT) && +m.statueT > 0)
      buffs.push(`<span class="buff vanish">${ICONS.statue} invincible · ${(+m.statueT).toFixed(1)}s</span>`);
    if (m.stun) buffs.push('<span class="buff frost">🥶 frozen</span>');
    else if (m.slow) buffs.push('<span class="buff frost">🐌 slowed</span>');
    if (m.poison) buffs.push(`<span class="buff malady">${ELEMENTS.malady.icon} infected</span>`);
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
    const prevPlayers = chatterPlayers;
    chatterPlayers = (vs && Array.isArray(vs.players)) ? vs.players : [];
    if (vs && (vs.phase !== 'battle' || vs.chat === false)) chatter.clear();
    else chatter.onFrame(chatterPlayers, prevPlayers, (now - lastFrameAt) / 1000, now);
    lastFrameAt = now;
    draw(view, vs, fx, myId, moveMark, now, chatter.bubbles);
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
