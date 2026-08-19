// Client: networking, interpolation, input, DOM HUD. Rendering in render.js,
// the shop and its tooltips in shop.js, keybindings in keys.js, and the shared
// helpers everything imports in ui.js (round 23 split; the import order
// ui -> keys -> shop -> main is load-bearing, see client/ui.js).

import {
  SPELLS, ELEMENTS, BOTS, BUILDS, AVATARS,
  SNAPSHOT_RATE, ARENA, ROUND, GOLD, PLAYER, TEAMS, teamTint,
} from '../shared/constants.js';
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
import { createGapTracker } from '../shared/snapwire.js';
import * as analytics from './analytics.js';
import { $, fin, ICONS, esc, setVisible, toast, fmtNum, statAt, avatarHtml } from './ui.js';
import {
  bindings, keyOf, keyLabel, spellForKey, isCapturing, closeKeysPanel, initKeys,
} from './keys.js';
import { initShop, buildShop, hideTip, setPreview, isPreview } from './shop.js';
const { sendEvent, trackSnapshot, modeName, fetchStats } = analytics;

const canvas = $('game');
const view = makeView(canvas);
view.resize();
window.addEventListener('resize', () => view.resize());

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
window.__keys = () => bindings();  // test/debug hook: the resolved bindings
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
    gaps.reset();                    // ...and its lag estimate
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
    gaps.track(snaps[snaps.length - 1].at);
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
    case 'meteorHit':
      fx.push({ ...e, type: 'meteorHit', at: now, dur: 0.7 });
      // 24.1: the ground breaks; a longer burst rides the same event (shards +
      // a lava geyser over the fresh crater)
      if (e.crater > 0) fx.push({ ...e, type: 'craterBurst', at: now, dur: 1.3 });
      playSfx('boom'); playSfx('death'); break;
    // midas (24.9): a coin dropped out of your victim (gold sparkle where it
    // now lies), and the pickup pays with the coin sound. The +1 g popup is
    // the generic 'gold' floater above.
    case 'coinDrop':
      fx.push({ ...e, type: 'midasMark', at: now, dur: 0.6 });
      if (e.by === myId) playSfx('catch');
      break;
    case 'coinTake':
      fx.push({ ...e, type: 'midasMark', at: now, dur: 0.4 });
      if (e.id === myId) playSfx('buy');
      break;
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
    // vampire (round 24): a feast just started; the slurp marks the EVENT.
    // The per-gulp pips ride vampGulp below, the green +N the lifesteal floater.
    case 'vampFeast':
      playSfx('drain');
      break;
    // one mark flying home; render.js lerps it from the victim to the vampire
    case 'vampGulp':
      fx.push({ ...e, type: 'vampGulp', at: now, dur: 0.35 });
      break;
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
// toward. The delay follows the arrival gaps it actually observes; the logic
// lives in shared/snapwire.js (createGapTracker) so tests and tools/rtclab.js
// run the exact code the client runs.
// ⚠ mode 'slew' (round 23.1, Remi's go): the delay WALKS toward its target,
// so a jitter spike can never rewind the drawn world in one frame. Revert to
// the old stepping behavior: drop the mode option ('step' is the default).
const gaps = createGapTracker({ intervalMs: 1000 / SNAPSHOT_RATE, mode: 'slew' });
// The friend-trace instrument (2026-08-19): every 5 s an RTC guest reports its
// playout numbers (renderDelay, gap estimate, applied Hz, JS heap MB) to the
// host, which journals them beside the per-guest wire stats; one ⬇ log after a
// laggy game shows each guest's timeline, including across a page refresh.
// history: docs/history/2026-08-19-refresh-lag-investigation.md
let lagrSnapN = 0;
setInterval(() => {
  if (!transport || transport.kind !== 'rtc' || myId == null) return;
  const s = gaps.stats();
  const n = window.__snapN || 0;
  const heap = performance.memory && Math.round(performance.memory.usedJSHeapSize / 1048576);
  send({
    t: 'lagr', d: Math.round(s.renderDelay), g: Math.round(s.gapEst),
    hz: Math.round((n - lagrSnapN) * 2) / 10, ...(heap ? { heap } : {}),
  });
  lagrSnapN = n;
}, 5000);
window.__delay = () => gaps.stats(); // test/debug hook: {renderDelay, gapEst}

const lerp = (a, b, k) => (fin(a) && fin(b)) ? a + (b - a) * k : (fin(b) ? b : a);

function interpolated(now) {
  if (!snaps.length) return null;
  const rt = now - gaps.delay(now);
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
    // broken ground (24.1): craters never move either, straight off the snap
    craters: Array.isArray(s.craters) ? s.craters : [],
    hazards: Array.isArray(s.hazards) ? s.hazards : [],
    meteors: Array.isArray(s.meteors) ? s.meteors : [],
    // mines never move: no interpolation, straight off the snapshot
    mines: Array.isArray(s.mines) ? s.mines : [],
    // midas coins (24.9): ground loot never moves either
    coins: Array.isArray(s.coins) ? s.coins : [],
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

// 24.12: which spell keys are physically down, so a stray key-up (alt-tab,
// a rebind mid-press) can never release a charge nobody started.
const heldKeys = new Set();

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (!$('keysPanel').classList.contains('hidden')) {
    // panel open: don't cast; Esc closes it (capture mode handles its own Esc)
    if (e.key === 'Escape' && !isCapturing()) closeKeysPanel();
    return;
  }
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  const spell = spellForKey(e.key.toLowerCase());
  if (spell) {
    const w = toWorld(mouse.x, mouse.y);
    heldKeys.add(e.key.toLowerCase());
    send({ t: 'cast', key: spell, x: w.x, y: w.y });
  }
});

// Hold-to-charge (24.12, anger): every spell key sends a release on key-up.
// The server ignores it unless that key was actually holding a charge, so
// nothing changes for the spells that do not charge.
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (!heldKeys.delete(k)) return;
  const spell = spellForKey(k);
  if (!spell) return;
  const w = toWorld(mouse.x, mouse.y);
  send({ t: 'release', key: spell, x: w.x, y: w.y });
});
window.addEventListener('blur', () => {
  // the tab lost focus mid-hold: let go of everything, or the charge fizzles
  for (const k of heldKeys) {
    const spell = spellForKey(k);
    if (spell) { const w = toWorld(mouse.x, mouse.y); send({ t: 'release', key: spell, x: w.x, y: w.y }); }
  }
  heldKeys.clear();
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
    b.innerHTML = avatarHtml(av);   // the Golden Pillar needs its gold span
    b.dataset.av = av;              // the VALUE, since innerHTML may be markup
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
    b.disabled = taken.has(b.dataset.av);
    b.classList.toggle('sel', !!m && b.dataset.av === m.avatar);
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
// testing→ready dance just to read the shelves. Buying stays phase-gated, and
// shop.js owns the flag (it is what its buy handlers check); this does the
// surrounding DOM work.
function setShopPreview(on) {
  setPreview(on);
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
// are four of them. Round 24 (Remi): SORTED by spec `difficulty` so the ladder
// reads Dummy → Easy → … → Faker top to bottom, and an `unlisted` tier (the
// Runner) is a lab tool, not an offer. A new tier still appears here (and in
// the 🎲 chart below) with no client change at all.
const botLabel = (kind) => (BOTS[kind] && BOTS[kind].label) || kind;
const listedBots = () => Object.entries(BOTS)
  .filter(([, spec]) => !spec.unlisted)
  .sort(([, a], [, b]) => a.difficulty - b.difficulty);
{
  const wrap = $('botBtns');
  for (const [kind, spec] of listedBots()) {
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
  const rowsKinds = listedBots().map(([, b]) =>
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


// shop.js is handed `send` rather than importing it, which is what keeps the
// module below this one in the import order instead of beside it (ui -> keys ->
// shop -> main). Must run before the first buildShop.
initShop({ send });
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
// Builds the Keys panel, wires the rebind popup, and paints every current
// binding (panel, shop chips, join hint). The spell bar is the one surface
// keys.js cannot repaint itself, so it hands it back through onRefresh.
// ⚠ Must run AFTER the spell bar above exists.
initKeys({
  onRefresh: () => {
    for (const [spell, el] of Object.entries(spellEls))
      el.querySelector('.key').textContent = keyLabel(keyOf(spell));
  },
});

// ---- DOM update per phase -------------------------------------------------------


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
  if (e.key !== 'Tab' || isCapturing()) return; // a rebind capture owns the keyboard
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
      ${avatarHtml(p.avatar)} ${esc(p.name)}${p.id === myId ? ' (you)' : ''}${pingBadge(p.id)}</td>`;
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

// last-built lobby list signature; see the rebuild guard in updateUi()
let lobbySig = '';

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
  if (isPreview() && s.phase !== 'lobby') setShopPreview(false); // browsing is a lobby thing
  setVisible('shop', (!!myId && s.phase === 'shop') || isPreview());
  setVisible('gameover', !!myId && (s.phase === 'gameover' || goPinned));
  // ⚠ browse-mode guard (round 22.1): browsing happens in the LOBBY phase, and
  // this line used to kill every hover tip 15 times a second while browsing
  if (s.phase !== 'shop' && !isPreview()) hideTip();
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
    // Rebuild ONLY when a rendered fact changes: wiping innerHTML at snapshot
    // rate destroyed each row's ✕ between mousedown and mouseup, so single
    // clicks never landed. Pings stay OUT of the signature (they move on their
    // own 2 s stream and hold no listener); the badges refresh in place below.
    const sig = JSON.stringify([amHost, s.mode, myId, playerList.map((p) =>
      [p.id, p.name, p.color, p.avatar, p.spectator, p.bot, p.kind, p.build,
        p.ready, p.team])]);
    // Replacing a focused native select closes its menu. Leave the list alone
    // until the player has picked a team, then the next snapshot refreshes it.
    const teamMenuOpen = document.activeElement &&
      document.activeElement.matches('#playerList .teamsel select');
    if (sig !== lobbySig && !teamMenuOpen) {
      lobbySig = sig;
      list.innerHTML = '';
      for (const p of playerList) {
        const div = document.createElement('div');
        div.className = 'pl';
        div.innerHTML = `<span class="dot" style="background:${p.color}"></span>
          <span class="who">${avatarHtml(p.avatar)} ${esc(p.name)}${p.spectator ? ' 👁' : ''}${p.bot ? ` 🤖 <span class="stars">${esc(botLabel(p.kind))}${p.build && BUILDS[p.build] ? ' · ' + esc(BUILDS[p.build].name.toLowerCase()) : ''}</span>` : ''}${p.id === myId ? ' (you)' : ''}${pingBadge(p.id)}</span>
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
    } else if (sig === lobbySig) {
      // ping badges live outside the rebuild: swap/insert/remove the span in
      // place (outerHTML = '' removes it), the buttons are never touched
      playerList.forEach((p, i) => {
        const who = list.children[i] && list.children[i].querySelector('.who');
        if (!who) return;
        const badge = who.querySelector('.ping');
        if (badge) badge.outerHTML = pingBadge(p.id).trim();
        else who.insertAdjacentHTML('beforeend', pingBadge(p.id));
      });
    }
    $('readyBtn').textContent = m && m.ready ? 'Not ready' : 'I am ready';
    $('readyBtn').classList.toggle('primary', !(m && m.ready));
    $('myAvatar').innerHTML = m ? avatarHtml(m.avatar) : '';
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
        <span class="who">${p.id === leadId ? '👑 ' : ''}${avatarHtml(p.avatar)} ${esc(p.name)}${pingBadge(p.id)}</span>
        <span class="score num">${p.kills || 0}</span>
        <span class="gold num">${p.gold || 0}g</span>
        <span class="rgold num ${rg ? '' : 'zero'}">${rg == null ? '' : `+${rg}`}</span>
      </div>`;
    }).concat(specs.map(p =>
      `<div class="r spec ${p.id === myId ? 'me' : ''}">
        <span class="dot" style="background:${p.color}"></span>
        <span class="who">${avatarHtml(p.avatar)} ${esc(p.name)}${pingBadge(p.id)}</span>
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
      // anger (24.12): the bank is HOLD-gated now; the over-head charge bar
      // is the live meter, so the chip just states the bank and the move.
      const f = ELEMENTS.anger.fx;
      const marks = Math.max(0, +m.angerMarks || 0);
      const markUp = playerList.some(p => p.myStacks && p.myStacks.anger > 0);
      buffs.push(`<span class="buff crit">${ELEMENTS.anger.icon} +${fmtNum(marks * f.markDmg)} dmg banked · hold to unleash` +
        (markUp ? ' · mark is OUT: hunt it' : '') + '</span>');
    }
    // midas (24.9): coins waiting on the ground, or the odds while none are
    const midLv = (m.elements && m.elements.midas) || 0;
    if (midLv > 0) {
      const mine = (Array.isArray(s.coins) ? s.coins : []).filter(c => c.owner === m.id).length;
      buffs.push(`<span class="buff vamp">${ELEMENTS.midas.icon} ` +
        (mine > 0 ? `${mine} coin${mine > 1 ? 's' : ''} on the ground: go collect`
          : `${Math.round(statAt(ELEMENTS.midas.fx.coinChance, midLv) * 100)}% coin per hit`) + '</span>');
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
    // vampire (round 24): how many marks you have banked across everyone, and
    // what ONE mark pays right now (your missing hp scales it, live)
    const vampLv = (m.elements && m.elements.vampire) || 0;
    if (vampLv > 0) {
      const vf = ELEMENTS.vampire.fx;
      const out = playerList.reduce((n, p) => n + ((p.myStacks && p.myStacks.vampire) || 0), 0);
      const mult = 1 + (vf.lowHpMax - 1) * (1 - Math.max(0, Math.min(1, (+m.hp || 0) / (+m.maxHp || 1))));
      const gulp = statAt(vf.markHeal, vampLv) * mult;
      buffs.push(`<span class="buff vamp">${ELEMENTS.vampire.icon} ` +
        `${out} mark${out === 1 ? '' : 's'} · +${gulp.toFixed(1)}/gulp</span>`);
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
