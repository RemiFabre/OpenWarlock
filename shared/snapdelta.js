// Delta snapshots for the WebRTC host path (docs/BRIEF-browser-hosting.md §B3).
// Data channels have no permessage-deflate, so the host sends full snapshots
// only on join / phase change / every ~2 s, and "what changed" otherwise —
// measured 15× smaller on a live 6-player game. The snap channel is
// UNRELIABLE + UNORDERED on purpose (a stale snapshot is worthless), so the
// framing must survive loss and reordering: every message carries a sequence
// number, deltas name their base, and a gap makes the decoder demand a full.
// Pure data, no I/O — unit-tested in test/snapdelta.test.js.

const DEL = 'del';   // "this key was removed" marker inside an {o:...} patch
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The delta grammar (values are always wrapped, so real payloads can never be
// mistaken for tags):  undefined = unchanged · {v} = replace wholesale (arrays
// and primitives are atomic) · {o:{key: delta|DEL}} = per-key object patch.
export function diff(a, b) {
  if (isObj(a) && isObj(b)) {
    const o = {};
    let changed = false;
    for (const k of Object.keys(b)) {
      const d = diff(a[k], b[k]);
      if (d !== undefined) { o[k] = d; changed = true; }
    }
    for (const k of Object.keys(a))
      if (!(k in b)) { o[k] = DEL; changed = true; }
    return changed ? { o } : undefined;
  }
  return JSON.stringify(a) === JSON.stringify(b) ? undefined : { v: b };
}

// Applies a delta WITHOUT mutating `a` (unchanged subtrees are shared).
export function patch(a, d) {
  if (d === undefined) return a;
  if ('v' in d) return d.v;
  const out = { ...(isObj(a) ? a : {}) };
  for (const [k, e] of Object.entries(d.o)) {
    if (e === DEL) delete out[k];
    else out[k] = patch(out[k], e);
  }
  return out;
}

// One encoder per peer (deltas are per-viewer, like the snapshots themselves).
// encode(payload, {full}) -> wire msg: {t:'snap', q, f: payload} keyframe, or
// {t:'snap', q, b, d} delta against the previous message q=b. The caller asks
// for a keyframe on join, on phase change, and when the peer reports a gap;
// fullEvery is the belt-and-braces cadence on top (~2 s at 15 Hz).
export function createSnapEncoder({ fullEvery = 30 } = {}) {
  let q = 0, last = null, sinceFull = 0;
  return {
    encode(payload, { full = false } = {}) {
      q++;
      if (full || last === null || sinceFull >= fullEvery) {
        last = payload; sinceFull = 1;
        return { t: 'snap', q, f: payload };
      }
      const d = diff(last, payload);
      const msg = { t: 'snap', q, b: q - 1, ...(d !== undefined ? { d } : {}) };
      last = payload; sinceFull++;
      return msg;
    },
  };
}

// decode(msg) -> { payload, needFull }. payload is null when the message was
// dropped: stale (older than what we already applied — unordered channel) or a
// delta whose base we never saw (the base packet was lost) — the latter sets
// needFull, and the transport asks the host for a keyframe over ctrl.
export function createSnapDecoder() {
  let q = -1, last = null;
  return {
    decode(msg) {
      if (!msg || msg.t !== 'snap' || !Number.isFinite(msg.q)) return { payload: null, needFull: false };
      if (msg.q <= q) return { payload: null, needFull: false };          // stale
      if (msg.f !== undefined) { q = msg.q; last = msg.f; return { payload: last, needFull: false }; }
      if (msg.b !== q || last === null) return { payload: null, needFull: true }; // gap
      q = msg.q;
      last = patch(last, msg.d);
      return { payload: last, needFull: false };
    },
  };
}
