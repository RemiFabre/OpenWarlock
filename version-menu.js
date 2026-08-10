(() => {
  if (document.getElementById('owv-button')) return;

  const scriptUrl = new URL(document.currentScript.src);
  const rootUrl = new URL('./', scriptUrl);
  const virtual = location.pathname.match(/\/v\/([0-9a-f]{40})\//i);
  sessionStorage.removeItem(`ow-version-reload:${location.pathname}`);

  const style = document.createElement('style');
  style.textContent = `
    #owv-button{position:fixed;right:48px;bottom:72px;z-index:205;width:34px;height:30px;padding:0;border-radius:50%;background:rgba(31,57,31,.92);border:1px solid #699b54;color:#dfffd1;font:16px serif;cursor:pointer}
    #owv-button:hover{background:#294b29;color:#fff}
    #owv-join{display:flex;align-items:center;gap:8px;margin-top:10px;padding:8px 11px;background:rgba(105,155,84,.08);border:1px solid #365132;color:#9d9285;font:12px Georgia,serif}
    #owv-join button{margin-left:auto;padding:4px 9px;color:#e8dcc8;white-space:nowrap}
    #owv-overlay{position:fixed;inset:0;z-index:230;display:none;place-items:center;padding:18px;background:rgba(5,3,3,.88);font:14px/1.45 Georgia,serif;color:#e8dcc8}
    #owv-overlay.open{display:grid}
    #owv-panel{box-sizing:border-box;width:min(620px,100%);max-height:90vh;overflow:auto;padding:22px;background:#171210;border:1px solid #4a3a2c;border-top:3px solid #699b54;box-shadow:0 24px 80px #000}
    #owv-panel h2{margin:0;font-size:24px;font-weight:500;color:#f1e4cf}
    #owv-panel>p{margin:5px 0 16px;color:#9d9285}
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
    <div id="owv-list">Loading…</div>
  </div>`;
  document.body.append(button, overlay);

  button.addEventListener('click', () => overlay.classList.add('open'));
  overlay.querySelector('#owv-close').addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });

  fetch(new URL('versions.json', rootUrl), { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      render(data);
      addJoinPicker(data);
    })
    .catch(() => { overlay.querySelector('#owv-list').textContent = 'The version list is unavailable right now.'; });

  function close() { overlay.classList.remove('open'); }

  function render(data) {
    const entries = [data.default, ...data.versions];
    overlay.querySelector('#owv-list').innerHTML = entries.map((entry) => {
      const current = isCurrent(entry);
      const issue = entry.issueUrl ? ` · <a href="${escapeAttr(entry.issueUrl)}" target="_blank" rel="noopener">idea #${entry.issue}</a>` : '';
      return `<div class="owv-item">
        <div><span class="owv-name">${escapeHtml(entry.name)}</span>${current ? '<span class="owv-current">playing</span>' : ''}</div>
        <div class="owv-meta">by ${escapeHtml(entry.author)}${issue}</div>
        <p class="owv-summary">${escapeHtml(entry.summary)}</p>
        ${current ? '' : `<a class="owv-play" href="${escapeAttr(versionUrl(entry))}">Play</a>`}
      </div>`;
    }).join('');

    overlay.querySelectorAll('.owv-play').forEach((link) => link.addEventListener('click', switchVersion));
  }

  function addJoinPicker(data) {
    const join = document.querySelector('#join .ideaPitch');
    if (!join) return;
    const current = [data.default, ...data.versions].find(isCurrent) || data.default;
    const row = document.createElement('div');
    row.id = 'owv-join';
    row.innerHTML = `<span>Game version</span><button type="button">🧬 ${escapeHtml(current.name)} ▾</button>`;
    row.querySelector('button').addEventListener('click', () => overlay.classList.add('open'));
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
