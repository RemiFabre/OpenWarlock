// Where things live INSIDE the big files, generated from the source.
//
// Why this exists: AGENTS.md's map says what each FILE is, but shared/sim.js is
// 4000+ lines, and every session was starting with the same dozen greps to find
// castSpell / stepProjectiles / applyDamage / kill / snapshot / the bot brains.
// That is pure repeated cost. This regenerates docs/CODEMAP.md from the code, so
// it is a lookup instead of a search, and it can never drift out of date the way
// a hand-written index would (the roster.js --doc precedent).
//
//   node tools/codemap.js          # print
//   node tools/codemap.js --doc    # write docs/CODEMAP.md
//
// It deliberately lists ONLY declarations and section banners — never line
// numbers, which rot on every edit. Grep the name to land on it.

import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  'shared/sim.js', 'shared/engine.js', 'shared/constants.js', 'shared/items.js',
  'shared/catalogue.js', 'shared/campaign.js', 'shared/snapdelta.js',
  'shared/snapwire.js',
  'client/main.js', 'client/render.js', 'client/transport.js',
  'server/index.js', 'version-sw.js', 'version-menu.js',
];

// `// ---- Title ---` style banners are how this codebase already signposts its
// own sections; they become the headings here.
const BANNER = /^\s*\/\/\s*-{2,}\s*(.+?)\s*-{2,}\s*$/;
const DECL = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/;
const CONST = /^\s*export\s+const\s+([A-Za-z_$][\w$]*)/;

function scan(path) {
  let src;
  try { src = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'); }
  catch { return null; }
  const lines = src.split('\n');
  const sections = [{ title: null, names: [] }];
  for (const line of lines) {
    const b = line.match(BANNER);
    if (b) { sections.push({ title: b[1], names: [] }); continue; }
    const d = line.match(DECL) || line.match(CONST);
    if (d) sections[sections.length - 1].names.push(d[1]);
  }
  return { path, lines: lines.length, sections: sections.filter(s => s.names.length) };
}

const parts = ['# Code map (generated — `node tools/codemap.js --doc`)',
  '',
  'Symbols by file and by the section banner they sit under. No line numbers on',
  'purpose: grep the name. Regenerate after any change that moves code around.',
  ''];
for (const path of FILES) {
  const f = scan(path);
  if (!f) continue;
  parts.push(`## ${f.path} (${f.lines} lines)`, '');
  for (const s of f.sections) {
    const names = s.names.join(', ');
    parts.push(s.title ? `- **${s.title}** — ${names}` : `- ${names}`);
  }
  parts.push('');
}
const doc = parts.join('\n');

if (process.argv.includes('--doc')) {
  writeFileSync(new URL('../docs/CODEMAP.md', import.meta.url), doc);
  console.log(`docs/CODEMAP.md written (${doc.split('\n').length} lines)`);
} else {
  console.log(doc);
}
