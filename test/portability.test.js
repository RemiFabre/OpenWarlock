// Keeps the tools/test scripts runnable on both of Remi's machines (Ubuntu and
// macOS) and on a fresh clone. Every check derives its truth from the source,
// so this file cannot rot into a stale copy of the config. Scars locked in:
// absolute /Users paths, pinned ms-playwright, a port drifted from the server
// default, the 'gameOver'/'final' phase typos, dead client selectors.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { BOTS } from '../shared/constants.js';

const ROOT = new URL('..', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const lines = (f) => read(f).split('\n');
// This file quotes every forbidden literal, so it always excludes itself.
const SELF = 'test/portability.test.js';
const glob = (dir, ext = '.js') => readdirSync(new URL(dir, ROOT))
  .filter((f) => f.endsWith(ext)).map((f) => `${dir}/${f}`).filter((f) => f !== SELF);
// Failures print file:line token for EVERY hit: a bare count costs a search.
const at = (f, i, tok) => `${f}:${i + 1} ${tok}`;
const say = (what, fix, bad) => `${bad.length} ${what}\n${bad.join('\n')}\n-> ${fix}`;

const CODE = [...glob('tools'), ...glob('test'), ...glob('test/harness'),
  ...glob('client'), ...glob('shared'), ...glob('server')];

describe('portability: no machine or OS specifics in the scripts', () => {
  // A path inside a COMMENT counts: a comment path is what a future agent copies.
  // Each pattern eats the rest of the path so the message prints the literal.
  const MACHINE = [/\/Users\/[\w./-]*/, /\/home\/[\w./-]*/, /\/private\/[\w./-]*/,
    /\/var\/folders\/[\w./-]*/, /C:\\[\w\\.-]*/, /[\w./-]*ms-playwright[\w./-]*/];

  it('hardcodes no machine-specific absolute path', () => {
    const bad = [];
    for (const f of [...CODE, ...glob('scripts', '.sh')])
      lines(f).forEach((ln, i) => MACHINE.forEach((re) => {
        const m = ln.match(re);
        if (m) bad.push(at(f, i, m[0]));
      }));
    expect(bad, say('machine-specific path literals (comments count)',
      'use os.tmpdir(), process.env, or a library that resolves per OS '
      + '(e.g. playwright.chromium.executablePath())', bad)).toEqual([]);
  });

  // Parsed OUT of the server, never pinned here (house rule: read config numbers from the source).
  const DEFAULT_PORT = read('server/index.js')
    .match(/PORT = Number\(process\.env\.PORT \|\| arg\('port'\) \|\| (\d{4})\)/)[1];
  // Scripts that spawn a PRIVATE server get their own port. An allowlist beats
  // sniffing spawn() calls: one reason each, and no regex a refactor can fool.
  const OWN_PORT = new Set([
    'tools/reconnect-test.js:3987',   // restarts its own server mid-run
    'tools/tabtest-run.js:4530',      // private static server, 4 browser tabs
    'test/client-robustness.js:3217', // spawns a server it then SIGKILLs
    'test/solo-static.js:4520',       // static Pages-like server, no ws
    'test/version-platform.js:4523',  // serves the version menu alone
    'test/rtc-host.js:4530',          // its own static server
    'test/rtc-host.js:4531',          // its signalling relay child
  ]);

  it('points every localhost URL at the server default or a documented private port', () => {
    const bad = [];
    for (const f of [...glob('tools'), ...glob('test')]) {
      const src = lines(f);
      src.forEach((ln, i) => {
        for (const m of ln.matchAll(/localhost:(\$\{([\w.]+)\}|\d{4})/g)) {
          // `${PORT}` resolves through the const in the same file, so a
          // drifted fallback is caught too, not just an inline literal.
          const decl = m[2] ? src.find((l) => new RegExp(`(const|let)\\s+${m[2]}\\s*=`).test(l)) : ln;
          const port = m[2] ? (decl || '').match(/\b\d{4}\b/)?.[0] : m[1];
          if (!port || port === DEFAULT_PORT || OWN_PORT.has(`${f}:${port}`)) continue;
          bad.push(at(f, i, m[2] ? `${port} (via const ${m[2]})` : port));
        }
      });
    }
    expect(bad, say(`ports that are neither the server default ${DEFAULT_PORT} nor allowlisted`,
      'read it from process.env with the default as fallback, or add a '
      + 'file:port line to OWN_PORT with its reason', bad)).toEqual([]);
  });

  // The phase set comes from sim.js's own assignments, so adding a phase needs
  // no edit here. Catches the 'gameOver' casing typo and the invented 'final'.
  const PHASES = new Set([...read('shared/sim.js').matchAll(/phase\s*[:=]\s*'(\w+)'/g)].map((m) => m[1]));

  it('compares phase only against phases sim.js assigns', () => {
    expect(PHASES.size).toBeGreaterThan(3); // the derivation still finds them
    const bad = [];
    for (const f of CODE) lines(f).forEach((ln, i) => {
      for (const m of ln.matchAll(/phase\s*[!=]==?\s*'(\w+)'/g))
        if (!PHASES.has(m[1])) bad.push(at(f, i, `'${m[1]}'`));
    });
    expect(bad, say('phase literals that no phase transition ever sets',
      `the real set is ${[...PHASES].sort().join(' ')}`, bad)).toEqual([]);
  });

  const DRIVERS = ['tools/shot.js', 'test/client-robustness.js', 'test/solo-static.js',
    'test/visual.js', 'test/version-platform.js', 'test/rtc-host.js'];
  const ACTS = /(?:waitForSelector|querySelectorAll|querySelector|locator|click|fill|textContent|hover|screenshot)\(\s*(['"`])(.*?)\1/g;
  const DEFS = /id="([\w-]+)"|getElementById\('([\w-]+)'\)|\.id = '([\w-]+)'|className = '([^']+)'|classList\.(?:add|remove|toggle)\('([\w-]+)'|class="([^"]+)"/g;
  // Toggled by name, never declared anywhere. Keep this list short.
  const STATE = new Set(['hidden', 'open', 'folded', 'capturing']);

  it('uses only selectors that exist in the client', () => {
    // GLOB the client: it was just split into ui.js/keys.js/shop.js, and a
    // hardcoded list would rot exactly the way this guard exists to prevent.
    // Ids and classes share one pool; a name defined NOWHERE is the real bug.
    const defs = new Set();
    for (const f of [...glob('client'), ...glob('client', '.html'), 'version-menu.js', '404.html'])
      for (const m of read(f).matchAll(DEFS))
        for (const tok of (m.slice(1).find(Boolean)).split(/\s+/)) defs.add(tok);
    const bad = [];
    for (const f of DRIVERS) lines(f).forEach((ln, i) => {
      for (const m of ln.matchAll(ACTS)) {
        if (m[2].includes('${')) continue; // built from a template at runtime
        for (const tok of m[2].match(/[#.][\w-]+/g) || []) {
          const name = tok.slice(1);
          // '#addBot-berserker' is `addBot-${kind}` in main.js: check the suffix.
          const key = name.slice(name.lastIndexOf('-') + 1);
          if (defs.has(name) || STATE.has(name) || (name.includes('-') && key in BOTS)) continue;
          bad.push(at(f, i, tok));
        }
      }
    });
    expect(bad, say('selectors with no definition in client/*.{js,html}',
      'fix the name, or define it in the client', bad)).toEqual([]);
  });
});
