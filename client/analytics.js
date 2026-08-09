// Anonymous usage beacons — page visits, games started, games ended — POSTed
// to the signalling relay's /beacon (server/signal.js counts them; GET /stats
// on the relay shows the aggregate). STRICTLY anonymous: event name + counts +
// version + transport mode, nothing else — no names, no player ids, nothing
// identifying ever leaves this module. Fire-and-forget by design: sendBeacon
// (fetch keepalive fallback), every failure swallowed — analytics must NEVER
// affect play. The target follows signalUrl() (so a ?signal=ws://... override
// redirects beacons too), with the ws(s) scheme flipped to http(s).

import { signalUrl } from './transport.js';
import { VERSION } from '../shared/version.js';

const MODES = { ws: 'server', solo: 'solo', 'rtc-host': 'rtc-host', rtc: 'rtc-guest' };
export const modeName = (kind) => MODES[kind] || 'unknown';

function beaconUrl() {
  try {
    const u = new URL(signalUrl().replace(/^ws/, 'http')); // ws->http, wss->https
    u.pathname = '/beacon'; u.search = ''; u.hash = '';
    return u.href;
  } catch { return null; }
}

export function sendEvent(e, fields = {}) {
  const url = beaconUrl();
  if (!url) return;
  // a plain string rides as text/plain — CORS-safelisted, so sendBeacon never
  // needs a preflight; the relay parses the body as JSON whatever the type
  const body = JSON.stringify({ e, v: VERSION, ...fields });
  try { if (navigator.sendBeacon && navigator.sendBeacon(url, body)) return; } catch { }
  try { fetch(url, { method: 'POST', body, keepalive: true }).catch(() => { }); } catch { }
}

// game_start / game_end, derived from the snapshots every seat already gets.
// Exactly ONE seat reports per game — the human whose id sorts first in the
// shared roster — so a 6-player lobby sends one beacon, not six. game_start =
// the first snapshot where phase has left the lobby (round 1 begins), with
// seat counts; game_end = gameover seen, with rounds played. A tab that joins
// mid-game stays silent (it never saw the lobby -> the game isn't "its" start).
let lastPhase = null, startSent = false, endSent = false;
export function trackSnapshot(s, myId, transportKind) {
  if (!s || typeof s !== 'object') return;
  const phase = s.phase;
  if (phase === 'lobby') { startSent = false; endSent = false; } // "play again" re-arms
  if (myId) {
    const humans = Object.values(s.players || {})
      .filter((p) => p && !p.bot && !p.spectator).map((p) => String(p.id)).sort();
    const iReport = humans[0] === String(myId);
    if (!startSent && lastPhase === 'lobby' && phase !== 'lobby' && phase !== 'gameover') {
      startSent = true;
      if (iReport) sendEvent('game_start', {
        mode: modeName(transportKind),
        players: Object.values(s.players || {}).filter((p) => p && !p.spectator).length,
        humans: humans.length,
      });
    }
    if (!endSent && phase === 'gameover' && lastPhase && lastPhase !== 'gameover') {
      endSent = true;
      if (iReport) sendEvent('game_end', { mode: modeName(transportKind), rounds: (+s.round | 0) || 0 });
    }
  }
  lastPhase = phase;
}
