(() => {
  if (document.getElementById('owv-button')) return;

  const scriptUrl = new URL(document.currentScript.src);
  const rootUrl = new URL('./', scriptUrl);
  const rawManifest = 'https://raw.githubusercontent.com/RemiFabre/OpenWarlock/main/versions.json';
  const virtual = location.pathname.match(/\/v\/([0-9a-f]{40})\//i);
  sessionStorage.removeItem(`ow-version-reload:${location.pathname}`);

  const style = document.createElement('style');
  style.textContent = `
    #owv-button{position:fixed;right:48px;bottom:72px;z-index:205;width:34px;height:30px;padding:0;border-radius:50%;background:rgba(31,57,31,.92);border:1px solid #699b54;color:#dfffd1;font:16px serif;cursor:pointer}
    #owv-button:hover{background:#294b29;color:#fff}
    #owv-join{display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px 12px;background:rgba(105,155,84,.13);border:1px solid #699b54;color:#c9c0ad;font:13px Georgia,serif}
    #owv-join button{margin-left:auto;padding:7px 12px;color:#e8dcc8;font-size:14px;white-space:nowrap;cursor:pointer}
    .owv-stats{grid-column:1;color:#c9b98a;font-size:12px;letter-spacing:1px}
    .owv-stats .owv-dim{color:#9d9285;letter-spacing:0}
    #owv-overlay{position:fixed;inset:0;z-index:230;display:none;place-items:center;padding:18px;background:rgba(5,3,3,.88);font:14px/1.45 Georgia,serif;color:#e8dcc8}
    #owv-overlay.open{display:grid}
    #owv-panel{box-sizing:border-box;width:min(620px,100%);max-height:90vh;overflow:auto;padding:22px;background:#171210;border:1px solid #4a3a2c;border-top:3px solid #699b54;box-shadow:0 24px 80px #000}
    #owv-panel h2{margin:0;font-size:24px;font-weight:500;color:#f1e4cf}
    #owv-panel>p{margin:5px 0 16px;color:#9d9285}
    #owv-search{box-sizing:border-box;width:100%;margin:0 0 8px;padding:9px 11px;background:#0f0c0b;border:1px solid #4a3a2c;color:#e8dcc8;font:14px Georgia,serif}
    #owv-search:focus{outline:1px solid #699b54;border-color:#699b54}
    #owv-list{max-height:60vh;overflow:auto}
    .owv-item{display:grid;grid-template-columns:1fr auto;gap:6px 14px;padding:12px 0;border-top:1px solid #2e241c}
    .owv-name{font-size:16px;color:#f1e4cf}.owv-current{color:#9bcf83;font-size:11px;margin-left:7px;text-transform:uppercase;letter-spacing:.08em}
    .owv-meta,.owv-summary{color:#9d9285;font-size:12px}.owv-summary{grid-column:1;margin:0}.owv-item a{color:#b7e59f}
    .owv-play{grid-column:2;grid-row:1/4;align-self:center;padding:8px 13px;background:#24351f;border:1px solid #699b54;color:#e0ffd1;font:inherit;cursor:pointer;text-decoration:none}
    .owv-play:hover{background:#365132;color:#fff}
    #owv-close{float:right;padding:5px 10px;background:#211a16;border:1px solid #4a3a2c;color:#e8dcc8;font:inherit;cursor:pointer}
    @media(max-width:560px){.owv-item{grid-template-columns:1fr}.owv-play{grid-column:1;grid-row:auto;justify-self:start}#owv-button{right:48px}}
  `;
  document.head.append(style);

  const button = document.createElement('button');
  button.id = 'owv-button';
  button.type = 'button';
  button.title = 'Choose a game version';
  button.setAttribute('aria-label', 'Choose a game version');
  button.textContent = '🧬';

  const overlay = document.createElement('div');
  overlay.id = 'owv-overlay';
  overlay.innerHTML = `<div id="owv-panel" role="dialog" aria-modal="true" aria-labelledby="owv-title">
    <button id="owv-close" type="button">Close</button>
    <h2 id="owv-title">Game versions</h2>
    <p>Play the default game or a player’s experimental idea. Each link is permanent and shareable.</p>
    <input id="owv-search" type="search" aria-label="Search versions" placeholder="Search name, author or idea…">
    <div id="owv-list">Loading…</div>
  </div>`;
  document.body.append(button, overlay);

  // Per-version plays/ratings from the relay (the host the beacons already
  // hit — client/transport.js SIGNAL_URL). Best-effort: the list never waits.
  const relayHttp = 'https://remifabre-openwarlock-signal.hf.space';
  let vstats = null, manifest = null;
  async function loadVstats() {
    if (vstats) return;
    try {
      const r = await fetch(`${relayHttp}/versions`, { cache: 'no-store' });
      const j = await r.json();
      if (j && j.ok) vstats = j.versions || {};
    } catch { /* relay asleep — the numbers just don't show */ }
  }
  function openOverlay() {
    overlay.classList.add('open');
    loadVstats().then(() => {
      if (vstats && manifest) render(manifest, overlay.querySelector('#owv-search').value);
    });
  }

  button.addEventListener('click', openOverlay);
  overlay.querySelector('#owv-close').addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });

  loadManifest()
    .then((data) => {
      manifest = data;
      render(data);
      overlay.querySelector('#owv-search').addEventListener('input', (event) => render(data, event.target.value));
      addJoinPicker(data);
    })
    .catch(() => { overlay.querySelector('#owv-list').textContent = 'The version list is unavailable right now.'; });

  function close() { overlay.classList.remove('open'); }

  function render(data, query = '') {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const entries = [data.default, ...data.versions].filter((entry) => {
      const text = [entry.name, entry.author, entry.summary, entry.slug, entry.issue].join(' ').toLowerCase();
      return terms.every((term) => text.includes(term));
    });
    const list = overlay.querySelector('#owv-list');
    list.innerHTML = entries.length ? entries.map((entry) => {
      const current = isCurrent(entry);
      const issue = entry.issueUrl ? ` · <a href="${escapeAttr(entry.issueUrl)}" target="_blank" rel="noopener">idea #${entry.issue}</a>` : '';
      // ★ average + player-rounds from the relay; hollow ？ = never rated.
      // player-rounds counting starts 2026-08-12 (older plays predate the metric).
      const st = vstats && vstats[entry.slug];
      const n = st && Number(st.rating_n) > 0 ? Number(st.rating_n) : 0;
      const avg = n ? Number(st.rating_sum) / n : 0;
      const stars = n
        ? `${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))} ${avg.toFixed(1)} <span class="owv-dim">(${n})</span>`
        : `☆☆☆☆☆ <span class="owv-dim" title="no ratings yet — rate it from the game lobby (top right)">?</span>`;
      const pr = st && Number(st.player_rounds) > 0
        ? `${Number(st.player_rounds)} player-rounds`
        : 'no play data yet';
      const statsLine = vstats ? `<div class="owv-stats">${stars} · <span title="player-rounds: every round fought counts once per player in it — 3 rounds × 5 players = 15. Counted since 2026-08-12.">${pr} ⓘ</span></div>` : '';
      return `<div class="owv-item">
        <div><span class="owv-name">${escapeHtml(entry.name)}</span>${current ? '<span class="owv-current">playing</span>' : ''}</div>
        <div class="owv-meta">by ${escapeHtml(entry.author)}${issue}</div>
        <p class="owv-summary">${escapeHtml(entry.summary)}</p>
        ${statsLine}
        ${current ? '' : `<a class="owv-play" href="${escapeAttr(versionUrl(entry))}">Play</a>`}
      </div>`;
    }).join('') : '<p class="owv-summary">No versions match your search.</p>';

    list.querySelectorAll('.owv-play').forEach((link) => link.addEventListener('click', switchVersion));
  }

  // Same rule as the service worker's allowlist (see version-sw.js): both
  // copies of the manifest, and the higher `serial` wins — so the list a player
  // sees and the list the loader enforces can never disagree about which one of
  // them is stale.
  async function loadManifest() {
    const bust = Date.now();
    const urls = [`${rawManifest}?bust=${bust}`, new URL(`versions.json?bust=${bust}`, rootUrl)];
    const fetched = await Promise.all(urls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) return null;
        const data = await response.json();
        return (data.default && Array.isArray(data.versions)) ? data : null;
      } catch { return null; }
    }));
    const best = fetched.filter(Boolean)
      .sort((a, b) => (Number(b.serial) || 0) - (Number(a.serial) || 0))[0];
    if (!best) throw new Error('version list unavailable');
    return best;
  }

  function addJoinPicker(data) {
    const join = document.querySelector('#join .ideaPitch');
    if (!join) return;
    const current = [data.default, ...data.versions].find(isCurrent) || data.default;
    const row = document.createElement('div');
    row.id = 'owv-join';
    row.innerHTML = `<span>Choose the game version</span><button type="button">🧬 ${escapeHtml(current.name)} ▾</button>`;
    row.querySelector('button').addEventListener('click', openOverlay);
    join.before(row);
  }

  function isCurrent(entry) {
    return entry.commit ? virtual?.[1].toLowerCase() === entry.commit.toLowerCase() : !virtual;
  }

  function versionUrl(entry) {
    if (!entry.commit) return new URL('client/', rootUrl).href;
    const url = new URL(`v/${entry.commit}/client/`, rootUrl);
    url.searchParams.set('version', entry.slug);
    return url.href;
  }

  async function switchVersion(event) {
    event.preventDefault();
    const target = event.currentTarget.href;
    try {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register(new URL('version-sw.js', rootUrl), { scope: rootUrl.pathname });
        await navigator.serviceWorker.ready;
      }
    } finally {
      location.href = target;
    }
  }

  function escapeHtml(value = '') {
    const node = document.createElement('span');
    node.textContent = value;
    return node.innerHTML;
  }

  function escapeAttr(value = '') {
    return escapeHtml(String(value)).replaceAll('`', '&#96;');
  }
})();
