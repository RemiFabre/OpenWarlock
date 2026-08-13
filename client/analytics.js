// Anonymous usage beacons (page visits, games started, games ended) POSTed
// to the signalling relay's /beacon (server/signal.js counts them; GET /stats
// on the relay shows the aggregate). STRICTLY anonymous: event name + counts +
// version + slug + transport mode, nothing else; no names, no player ids, nothing
// identifying ever leaves this module. Fire-and-forget by design: sendBeacon
// (fetch keepalive fallback), every failure swallowed; analytics must NEVER
// affect play. The target follows signalUrl() (so a ?signal=ws://... override
// redirects beacons too), with the ws(s) scheme flipped to http(s).

import { signalUrl } from './transport.js';
import { VERSION } from '../shared/version.js';

const MODES = { ws: 'server', solo: 'solo', 'rtc-host': 'rtc-host', rtc: 'rtc-guest' };
export const modeName = (kind) => MODES[kind] || 'unknown';

// Which version this tab is playing: community versions carry ?version=<slug>
// (version-menu.js appends it), the main version has no param. Rides on every
// beacon so the relay can aggregate per version (server sanitizes).
export const VERSION_SLUG = (() => {
  try { return new URLSearchParams(location.search).get('version') || 'default'; }
  catch { return 'default'; } // 'default' = versions.json's slug for the main game
})();

function relayHttp(pathname) {
  try {
    const u = new URL(signalUrl().replace(/^ws/, 'http')); // ws->http, wss->https
    u.pathname = pathname; u.search = ''; u.hash = '';
    return u.href;
  } catch { return null; }
}
// ⚠ Round 23: `?nobeacon=1` silences every write to the relay (visits, games,
// ratings). The test suite and CI drive the real client dozens of times a day
// from a localhost server, and each run was counting as a page visit and a
// started game in the PUBLIC totals. Reads (/stats, /versions) still work, so
// the 📊 panel is still testable. Deliberately opt-OUT and explicit rather than
// "off on localhost": Remi hosting from his own machine is real play.
const BEACONS_OFF = (() => {
  try { return new URLSearchParams(location.search).has('nobeacon'); } catch { return false; }
})();
const beaconUrl = () => (BEACONS_OFF ? null : relayHttp('/beacon'));

// The public counters, for the in-game 📊 panel (CORS is open on the relay).
export async function fetchStats() {
  const url = relayHttp('/stats');
  if (!url) return null;
  const r = await fetch(url, { cache: 'no-store' });
  return r.ok ? r.json() : null;
}

// a plain string rides as text/plain (CORS-safelisted, so sendBeacon never
// needs a preflight; the relay parses the body as JSON whatever the type
function post(url, body) {
  try { if (navigator.sendBeacon && navigator.sendBeacon(url, body)) return; } catch { }
  try { fetch(url, { method: 'POST', body, keepalive: true }).catch(() => { }); } catch { }
}

export function sendEvent(e, fields = {}) {
  const url = beaconUrl();
  if (url) post(url, JSON.stringify({ e, v: VERSION, slug: VERSION_SLUG, ...fields }));
}

// Star rating, fire-and-forget like beacons. prev = the stars this browser
// submitted for this slug before (or null); the relay replaces, not adds.
// The lobby UI (main.js) owns the stars widget and the localStorage memory.
export function rateVersion(slug, stars, prev = null) {
  const url = BEACONS_OFF ? null : relayHttp('/rate');
  if (url) post(url, JSON.stringify({ slug, stars, prev }));
}

// Per-version aggregates for the version picker: GET /versions ->
// { ok, versions: { slug: { plays, finished, player_rounds, rating_sum, rating_n } } }
export async function fetchVersionStats() {
  const url = relayHttp('/versions');
  if (!url) return null;
  const r = await fetch(url, { cache: 'no-store' });
  return r.ok ? r.json() : null;
}

// game_start / game_end, derived from the snapshots every seat already gets.
// Exactly ONE seat reports per game (the human whose id sorts first in the
// shared roster), so a 6-player lobby sends one beacon, not six. game_start =
// the first snapshot where phase has left the lobby (round 1 begins), with
// seat counts; game_end = gameover seen, with rounds played. A tab that joins
// mid-game stays silent (it never saw the lobby -> the game isn't "its" start).
let lastPhase = null, startSent = false, endSent = false, startPlayers = 0;
export function trackSnapshot(s, myId, transportKind) {
  if (!s || typeof s !== 'object') return;
  const phase = s.phase;
  if (phase === 'lobby') { startSent = false; endSent = false; } // "play again" re-arms
  if (myId) {
    const humans = Object.values(s.players || {})
      .filter((p) => p && !p.bot && !p.spectator).map((p) => String(p.id)).sort();
    const iReport = humans[0] === String(myId);
    const seats = () => Object.values(s.players || {}).filter((p) => p && !p.spectator).length;
    if (!startSent && lastPhase === 'lobby' && phase !== 'lobby' && phase !== 'gameover') {
      startSent = true;
      startPlayers = seats(); // remembered so game_end reports the SAME count
      if (iReport) sendEvent('game_start', {
        mode: modeName(transportKind),
        players: startPlayers,
        humans: humans.length,
      });
    }
    if (!endSent && phase === 'gameover' && lastPhase && lastPhase !== 'gameover') {
      endSent = true;
      if (iReport) sendEvent('game_end', {
        mode: modeName(transportKind),
        rounds: (+s.round | 0) || 0,
        players: startPlayers || seats(), // mid-game joiner never saw the start
      });
    }
  }
  lastPhase = phase;
}
