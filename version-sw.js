const CACHE = 'openwarlock-versions-v1';
const REPO_CDN = 'https://cdn.jsdelivr.net/gh/RemiFabre/OpenWarlock@';
const RAW_MANIFEST = 'https://raw.githubusercontent.com/RemiFabre/OpenWarlock/main/versions.json';
let validCommits;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  const scopePath = new URL(self.registration.scope).pathname;
  if (requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith(scopePath)) return;

  const virtualPath = requestUrl.pathname.slice(scopePath.length);
  const match = virtualPath.match(/^v\/([0-9a-f]{40})\/(.*)$/i);
  if (!match) return;

  event.respondWith(versionFile(event.request, match[1].toLowerCase(), match[2]));
});

async function versionFile(request, commit, filePath) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  if (!filePath || filePath.endsWith('/')) filePath += 'index.html';

  try {
    if (request.mode === 'navigate' || !validCommits) validCommits = loadValidCommits();
    if (!(await validCommits).has(commit)) return new Response('This game version is no longer listed.', { status: 403 });
  } catch {
    return new Response('The version list is unavailable right now.', { status: 503 });
  }

  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const upstream = await fetch(`${REPO_CDN}${commit}/${filePath}`);
    if (!upstream.ok) return new Response('This version file was not found.', { status: upstream.status });

    const headers = new Headers(upstream.headers);
    headers.delete('content-disposition');
    headers.delete('content-encoding');
    headers.delete('content-length');
    headers.set('content-type', mimeType(filePath));
    headers.set('cache-control', 'public, max-age=31536000, immutable');

    let body = upstream.body;
    if (filePath.endsWith('.html')) {
      const menuUrl = new URL('version-menu.js', self.registration.scope).href;
      const html = (await upstream.text()).replace(
        /<script\b[^>]*src=["'][^"']*version-menu\.js[^"']*["'][^>]*><\/script>\s*/gi,
        ''
      );
      body = html.replace(/<\/body>/i, `<script src="${menuUrl}" defer></script>\n</body>`);
    }

    const response = new Response(body, { status: 200, headers });
    cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    return new Response(`Could not load this game version.\n${error.message}`, {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }
}

// The allowlist, from whichever copy of the manifest is FRESHER.
//
// ⚠ Why both copies, and why `serial`: raw.githubusercontent and Pages update
// on their own schedules and each can serve a stale-but-well-formed manifest
// for several minutes. Taking the first one that parses meant a stale copy beat
// a fresh one, so a just-published version 403'd as "no longer listed" for ~10
// minutes. Taking the UNION would have fixed publishing and broken revocation
// (a removed commit would stay playable until BOTH copies expired). `serial`
// is bumped on every manifest edit, so "highest serial wins" is symmetric:
// a publish and a revocation both take effect as soon as EITHER copy updates.
// A manifest with no serial counts as 0, so an old cached copy can never
// outrank a numbered one.
function readManifest(data) {
  if (!data || !Array.isArray(data.versions)) return null;
  const commits = data.versions.map((version) => String(version.commit || '').toLowerCase());
  if (!commits.every((commit) => /^[0-9a-f]{40}$/.test(commit))) return null;
  return { serial: Number(data.serial) || 0, commits: new Set(commits) };
}

async function loadValidCommits() {
  const root = self.registration.scope;
  const bust = Date.now();
  const fetched = await Promise.all(
    [`${RAW_MANIFEST}?bust=${bust}`, `${root}versions.json?bust=${bust}`].map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) return null;
        return readManifest(await response.json());
      } catch { return null; }
    })
  );
  const best = fetched.filter(Boolean).sort((a, b) => b.serial - a.serial)[0];
  if (!best) throw new Error('version list unavailable');
  return best.commits;
}

function mimeType(path) {
  const ext = path.split('.').pop().toLowerCase();
  return ({
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    css: 'text/css; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    ico: 'image/x-icon',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    txt: 'text/plain; charset=utf-8'
  })[ext] || 'application/octet-stream';
}
