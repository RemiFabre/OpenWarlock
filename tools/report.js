// The balance report PAGE (round 24.7, Remi's ask): every elo run should end
// as a small self-contained web page that opens on his machine, with the
// ranking readable at a glance and the FULL build (order included) one hover
// away. No agent context is spent: elo.js calls this automatically.
//
//   node tools/report.js --roster [--out=x.html] [--notes=file] [--open]
//   node tools/report.js --json=run.json [--out=x.html] [--notes=file] [--open]
//
// --roster = the review page (no numbers yet): builds grouped by family.
// --json   = a finished elo run (elo.js --json payload, incl. placeSum).
// Default --out lands in docs/history/ (dated, suffixed on collision) so a
// run's page is a repo file with an absolute path, per Remi's standing rule.
// A broken input must exit non-zero (scar: a lab that prints something on a
// broken run reads as data).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { SPELLS, ELEMENTS, ITEMS, itemCost } from '../shared/constants.js';
import { ICONS } from '../client/ui.js';
import {
  ROSTER, paddedCore, expandCore, coreCost, shelfExhausted,
  COST_TARGET, AVG_EARNED, FAMILY_TITLES,
} from './roster.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const esc = s => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const iconOf = key => (ELEMENTS[key] && ELEMENTS[key].icon) || ICONS[key] || '❔';
const nameOf = key =>
  (SPELLS[key] || ELEMENTS[key] || ITEMS[key] || { name: key }).name;
function levelCost(key, lv) { // cost of the single buy that reaches level lv
  if (SPELLS[key]) return SPELLS[key].costs[lv - 1];
  if (ELEMENTS[key]) return ELEMENTS[key].costs[lv - 1];
  if (ITEMS[key]) return itemCost(key, lv - 1);
  throw new Error(`unknown key ${key}`);
}

// [key, toLevel] pairs -> one {key, lv} per buy, in order
function expandSteps(core) {
  const lv = {}, out = [];
  for (const [key, to] of core) {
    for (let l = lv[key] || 0; l < to; l++) out.push({ key, lv: l + 1 });
    lv[key] = to;
  }
  return out;
}

// ---- page pieces ------------------------------------------------------------

const FAMILY_HUES = { A: 200, B: 265, C: 48, D: 25, E: 160, F: 330, G: 40, M: 95, K: 0 };

function chipHtml(step, cls) {
  const t = `${nameOf(step.key)} lv${step.lv} (${step.cost} g, total ${step.cum} g)`;
  return `<span class="chip ${cls}" title="${esc(t)}">${iconOf(step.key)}<sub>${step.lv}</sub></span>`;
}

function orderHtml(steps) {
  const parts = [];
  let filled = false, earned = false;
  for (const s of steps) {
    if (s.fill && !filled) { filled = true; parts.push('<span class="divider" title="end of the hand-written core; auto-fill items from here">auto-fill →</span>'); }
    if (s.cum > AVG_EARNED && !earned) { earned = true; parts.push(`<span class="divider warn" title="an average seat earns ~${AVG_EARNED} g in a full game (measured); buys past this line rarely happen">~${AVG_EARNED} g →</span>`); }
    parts.push(chipHtml(s, `${s.fill ? 'fill' : ''} ${earned ? 'late' : ''}`));
  }
  return parts.join('');
}

function familyChip(f) {
  return `<span class="fam" style="--h:${FAMILY_HUES[f] ?? 0}">${esc(f)}</span>`;
}

function buildModel(id, run) {
  const entry = ROSTER[id];
  const padded = paddedCore(entry);
  const coreLen = expandSteps(entry.core).length;
  const steps = expandSteps(padded).map((s, i) => ({ ...s, fill: i >= coreLen }));
  let cum = 0;
  for (const s of steps) { s.cost = levelCost(s.key, s.lv); cum += s.cost; s.cum = cum; }
  return {
    id, entry, steps, cost: cum,
    exhausted: entry.noPad ? false : shelfExhausted(entry),
    elo: run ? run.elo[id] : null,
    games: run ? run.games[id] : null,
    place: run && run.placeSum ? run.placeSum[id] / Math.max(1, run.games[id]) : null,
  };
}

function cardHtml(m) {
  const e = m.entry;
  const kind = e.kind ? `<span class="badge">${esc(e.kind)} brain</span>` : '';
  const band = e.noPad ? '<span class="badge dim">noPad: shelf exhausts by design</span>'
    : m.exhausted ? '<span class="badge dim">item shelf exhausted below the band</span>' : '';
  const caps = e.caps
    ? `<p class="caps">never buys: ${Object.keys(e.caps).map(k => `${iconOf(k)} ${esc(nameOf(k))}`).join(', ')}</p>` : '';
  const note = e.note ? `<p class="note">${esc(e.note)}</p>` : '';
  const run = m.elo == null ? '' : !m.games
    ? '<p class="runline">no seats this run</p>'
    : `<p class="runline">Elo <b>${m.elo}</b> · ${m.games} seats${m.place == null ? '' : ` · mean place ${m.place.toFixed(2)} of 4`}</p>`;
  return `<div class="card" id="card-${esc(m.id)}" hidden>
    <h2>${familyChip(e.family)} ${esc(m.id)} ${kind}</h2>
    <p class="cost">${m.cost} g core+fill (band ${COST_TARGET[0]}-${COST_TARGET[1]}) ${band}</p>
    ${run}
    <p class="fantasy">${esc(e.fantasy)}</p>
    <p class="tests"><b>isolates:</b> ${esc(e.tests)}</p>
    ${note}${caps}
    <h3>buy order</h3>
    <div class="order">${orderHtml(m.steps)}</div>
  </div>`;
}

function rowHtml(m, rank, eloSpan) {
  // a seat that never played has NO elo; showing the fitter's leftover number
  // would be the "0.00 looks like data" scar (only happens on tiny smoke runs)
  const noData = m.elo != null && !m.games;
  const eloCell = m.elo == null ? '' : noData
    ? '<td class="num dim">·</td><td class="gauge"></td><td class="num dim">no data</td>'
    : `<td class="num">${rank}</td>
     <td class="gauge"><i style="width:${eloSpan(m.elo)}%"></i></td>
     <td class="num elo">${m.elo}</td>`;
  const tail = m.elo == null
    ? `<td class="dim one">${esc(m.entry.fantasy)}</td>`
    : `<td class="num dim">${m.place == null ? '·' : m.place.toFixed(2)}</td><td class="num dim">${m.games}</td>`;
  return `<tr class="row" data-id="${esc(m.id)}" tabindex="0">
    ${eloCell}
    <td>${familyChip(m.entry.family)}</td>
    <td class="name">${esc(m.id)}${m.entry.kind ? ' <span class="k">★</span>' : ''}</td>
    <td class="num dim">${m.cost}g</td>
    ${tail}
  </tr>`;
}

function renderNotes(text) {
  if (!text) return '';
  const blocks = String(text).trim().split(/\n\s*\n/);
  const html = blocks.map(b => {
    if (b.trim().startsWith('## ')) return `<h3>${esc(b.trim().slice(3))}</h3>`;
    if (b.split('\n').every(l => l.trim().startsWith('- '))) {
      return `<ul>${b.split('\n').map(l => `<li>${esc(l.trim().slice(2))}</li>`).join('')}</ul>`;
    }
    return `<p>${esc(b)}</p>`;
  }).join('\n');
  return `<section class="notes"><h2>Notes</h2>${html}</section>`;
}

// ---- the page ----------------------------------------------------------------

export function reportHtml({ run = null, notes = '', title = null } = {}) {
  const ids = Object.keys(ROSTER);
  if (run) {
    for (const id of Object.keys(run.elo)) {
      if (!ROSTER[id]) throw new Error(`run has unknown strategy ${id}; report the run with the roster.js it was played on`);
    }
  }
  const models = ids.filter(id => !run || run.elo[id] != null).map(id => buildModel(id, run));
  if (!models.length) throw new Error('nothing to report: no roster ids matched the run');

  let list;
  const eloVals = run ? models.filter(m => m.games > 0).map(m => m.elo) : [];
  const lo = Math.min(...eloVals), hi = Math.max(...eloVals);
  const eloSpan = v => Math.round(8 + 92 * (hi === lo ? 1 : (v - lo) / (hi - lo)));
  if (run) {
    const played = models.filter(m => m.games > 0).sort((a, b) => b.elo - a.elo);
    const idle = models.filter(m => !m.games);
    list = `<table><thead><tr><th>#</th><th></th><th>elo</th><th></th><th>strategy</th><th>cost</th><th>place</th><th>seats</th></tr></thead>
      <tbody>${[...played, ...idle].map((m, i) => rowHtml(m, i + 1, eloSpan)).join('\n')}</tbody></table>`;
  } else {
    let fam = '';
    const parts = [];
    for (const m of models) {
      if (m.entry.family !== fam) {
        fam = m.entry.family;
        if (parts.length) parts.push('</tbody></table>');
        parts.push(`<h2 class="famhead">${esc(FAMILY_TITLES[fam] || `Family ${fam}`)}</h2><table><tbody>`);
      }
      parts.push(rowHtml(m, 0, eloSpan));
    }
    parts.push('</tbody></table>');
    list = parts.join('\n');
  }

  const heading = title || (run
    ? `Strategy Elo · ${run.GAMES} games · seed ${run.SEED} · ${run.KIND} seats`
    : 'The strategy roster');
  const explain = run
    ? `Elo fitted by Bradley-Terry over every pairwise placement in ${run.GAMES} random 4-of-roster ${esc(run.KIND)} lobbies (seed ${run.SEED}, elemental). 1500 = the roster average; +173 ≈ a 73% favourite in a pair; neighbours within ~40 are noise. "place" = mean finishing place of 4; "seats" = games played. ${run.unfinished ? `${run.unfinished} games hit the round cap unfinished.` : ''}<br>⚠ Bot read only: bots do not lead targets, bait, or chain CC windows; reactive tools (shield, debt, blink) and contagion read at a floor; anger saturates bot instruments. This ranks what BOTS extract, not what you would.`
    : `Every build in tools/roster.js, grouped by family, no results attached. Hover (or click to pin) any row for the full build: what it isolates, and the exact buy order, one chip per purchased level. Cost = the whole scripted list; the band is ${COST_TARGET[0]}-${COST_TARGET[1]} g vs the ~${AVG_EARNED} g an average seat earns, so the tail past the ~${AVG_EARNED} g mark rarely happens in a real game. ★ = rides its own bot brain (Faker), not the tournament seat.`;

  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(heading)}</title>
<style>
:root{
  --bg:#171310; --panel:#201a15; --edge:#37291d; --ink:#e9decd; --dim:#a5927a;
  --ember:#ff9d45; --ember2:#c85a1e; --pin:#ffd76a;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.45 ui-sans-serif,system-ui,sans-serif}
header{padding:26px 28px 10px;border-bottom:1px solid var(--edge)}
h1{font-family:'Iowan Old Style',Palatino,Georgia,serif;font-weight:600;
  font-size:30px;margin:0 0 8px;letter-spacing:.01em}
h1 .flame{filter:drop-shadow(0 0 6px rgba(255,157,69,.55))}
.explain{max-width:72ch;color:var(--dim);font-size:13.5px;margin:0 0 8px}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:0;align-items:start}
main{padding:10px 8px 60px 16px;min-width:0}
table{border-collapse:collapse;width:100%}
th{font:600 11px ui-monospace,monospace;color:var(--dim);text-align:left;
  padding:6px 8px;text-transform:uppercase;letter-spacing:.08em}
td{padding:5px 8px;border-top:1px solid #241d16}
.row{cursor:pointer;outline:none}
.row:hover td,.row:focus td{background:#241c14}
.row.pinned td{background:#2b2013;box-shadow:inset 3px 0 0 var(--pin)}
.num{font-family:ui-monospace,'SF Mono',monospace;font-size:13px;text-align:right;
  font-variant-numeric:tabular-nums;white-space:nowrap}
.elo{color:var(--ember);font-weight:700;font-size:14px}
.name{font-family:ui-monospace,'SF Mono',monospace;font-size:13.5px;white-space:nowrap}
.k{color:#ff6a6a}
.dim{color:var(--dim)}
.one{max-width:34ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.gauge{width:120px;min-width:60px}
.gauge i{display:block;height:9px;border-radius:5px;
  background:linear-gradient(90deg,var(--ember2),var(--ember));
  box-shadow:0 0 6px rgba(255,157,69,.35)}
.fam{display:inline-block;font:700 11px ui-monospace,monospace;padding:1px 7px;
  border-radius:9px;background:hsl(var(--h) 45% 22%);color:hsl(var(--h) 70% 78%);
  border:1px solid hsl(var(--h) 45% 32%)}
.famhead{font-family:'Iowan Old Style',Palatino,Georgia,serif;font-size:17px;
  font-weight:600;color:var(--ink);margin:26px 0 4px;border-bottom:1px solid var(--edge);
  padding-bottom:4px}
aside{position:sticky;top:0;height:100vh;overflow-y:auto;padding:16px;
  border-left:1px solid var(--edge);background:var(--panel)}
.card h2{font-family:'Iowan Old Style',Palatino,Georgia,serif;font-size:20px;
  margin:2px 0 6px}
.card h3{font:600 11px ui-monospace,monospace;color:var(--dim);
  text-transform:uppercase;letter-spacing:.08em;margin:16px 0 6px}
.cost{font-family:ui-monospace,monospace;font-size:12.5px;color:var(--dim);margin:0 0 8px}
.runline{font-family:ui-monospace,monospace;font-size:13px;margin:0 0 8px}
.runline b{color:var(--ember);font-size:16px}
.fantasy{font-family:'Iowan Old Style',Palatino,Georgia,serif;font-style:italic;
  font-size:15.5px;margin:8px 0;color:#f3ead9}
.tests{font-size:13px;color:var(--dim);margin:6px 0}
.tests b{color:var(--ink)}
.note{font-size:13px;background:#2b2013;border-left:3px solid var(--pin);
  padding:7px 9px;border-radius:0 6px 6px 0;margin:8px 0}
.caps{font-size:13px;color:#ff8f8f;margin:6px 0}
.badge{font:600 10.5px ui-monospace,monospace;background:#3a2c1c;color:var(--ember);
  border-radius:8px;padding:1px 7px;vertical-align:middle}
.badge.dim{color:var(--dim);background:#2a231c}
.order{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.chip{font-size:19px;background:#2a2118;border:1px solid var(--edge);
  border-radius:8px;padding:3px 5px 1px;line-height:1;cursor:default}
.chip sub{font:700 10px ui-monospace,monospace;color:var(--ember);margin-left:1px}
.chip.fill{opacity:.62}
.chip.late{opacity:.34}
.divider{font:600 10px ui-monospace,monospace;color:var(--dim);
  border-left:2px dotted var(--dim);padding-left:6px;margin-left:2px;white-space:nowrap}
.divider.warn{color:var(--ember);border-color:var(--ember2)}
.goldicon{filter:sepia(1) saturate(2.4) hue-rotate(-12deg) brightness(1.1)}
.hint{color:var(--dim);font-size:13px}
.notes{max-width:78ch;padding:4px 28px 0;color:var(--ink)}
.notes h2{font-family:'Iowan Old Style',Palatino,Georgia,serif;font-size:19px;margin:14px 0 4px}
.notes h3{font-size:15px;margin:14px 0 4px;color:var(--ember)}
.notes p,.notes li{font-size:13.5px;color:#cfc0ab}
@media (max-width:980px){.layout{grid-template-columns:1fr}
  aside{position:static;height:auto;border-left:none;border-top:1px solid var(--edge)}}
@media (prefers-reduced-motion:no-preference){.card{animation:in .12s ease-out}
  @keyframes in{from{opacity:.4}to{opacity:1}}}
.row:focus-visible td{outline:2px solid var(--ember);outline-offset:-2px}
</style>
<header>
  <h1><span class="flame">🔥</span> ${esc(heading)}</h1>
  <p class="explain">${explain}</p>
</header>
${renderNotes(notes)}
<div class="layout">
<main>
${list}
</main>
<aside>
  <p class="hint" id="hint">Hover a row for the full build; click to pin it.</p>
  ${models.map(cardHtml).join('\n')}
</aside>
</div>
<script>
let pinned = null, shown = null;
const hint = document.getElementById('hint');
function show(id){
  if (shown) document.getElementById('card-'+shown).hidden = true;
  hint.hidden = true;
  document.getElementById('card-'+id).hidden = false;
  shown = id;
}
for (const row of document.querySelectorAll('.row')) {
  const id = row.dataset.id;
  row.addEventListener('mouseenter', () => { if (!pinned) show(id); });
  row.addEventListener('focus', () => { if (!pinned) show(id); });
  row.addEventListener('click', () => {
    if (pinned === id) { pinned = null; row.classList.remove('pinned'); return; }
    document.querySelectorAll('.row.pinned').forEach(r => r.classList.remove('pinned'));
    pinned = id; row.classList.add('pinned'); show(id);
  });
  row.addEventListener('keydown', e => { if (e.key === 'Enter') row.click(); });
}
const first = document.querySelector('.row');
if (first) show(first.dataset.id);
</script>`;
}

// ---- writing + opening --------------------------------------------------------

export function defaultOut(slug) {
  const day = new Date().toISOString().slice(0, 10);
  let p = path.join(REPO, 'docs', 'history', `${day}-${slug}.html`);
  for (let n = 2; fs.existsSync(p); n++) {
    p = path.join(REPO, 'docs', 'history', `${day}-${slug}-${n}.html`);
  }
  return p;
}

export function openInBrowser(file) {
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  try { spawn(cmd, [file], { detached: true, stdio: 'ignore' }).unref(); }
  catch { /* headless box: the path was printed, that is enough */ }
}

export function writeReport({ run = null, notes = '', title = null, out = null, open = false }) {
  const html = reportHtml({ run, notes, title });
  const file = out || defaultOut(run
    ? `elo-${run.GAMES}g-seed${run.SEED}${run.KIND && run.KIND !== 'berserker' ? `-${run.KIND}` : ''}`
    : 'roster-review');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  if (open) openInBrowser(file);
  return file;
}

// ---- CLI ----------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith('report.js')) {
  const arg = (name, def) => {
    const a = process.argv.find(x => x.startsWith(`--${name}=`));
    return a ? a.split('=')[1] : def;
  };
  const jsonPath = arg('json', null);
  const roster = process.argv.includes('--roster');
  if (!jsonPath && !roster) {
    console.error('usage: node tools/report.js --roster | --json=run.json  [--out=x.html] [--notes=file] [--open]');
    process.exit(1);
  }
  let run = null;
  if (jsonPath) {
    run = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!run.elo || !run.games) { console.error(`${jsonPath}: not an elo.js --json payload`); process.exit(1); }
    if (!run.placeSum) console.error('⚠ old payload without placeSum: place column omitted');
  }
  const notes = arg('notes', null) ? fs.readFileSync(arg('notes', null), 'utf8') : '';
  const file = writeReport({
    run, notes, out: arg('out', null), open: process.argv.includes('--open'),
  });
  console.log(file);
}
