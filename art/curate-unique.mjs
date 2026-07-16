#!/usr/bin/env node
// Лист отбора пер-гол кандидатов: группирует u-<fixture>-<seq>-NN.jpeg по матчам,
// подписывает мир/позу из plan-unique.json.
//   node curate-unique.mjs <outDir>          → contact-sheets в outDir (по матчам)
// Отбор фиксируется в art/unique-picks.json: { "<fixture>:<seq>": "u-...-02.jpeg" }
// (руками или через wire-unique.mjs --pick).

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) { console.error('usage: node curate-unique.mjs <outDir>'); process.exit(2); }

const plan = JSON.parse(readFileSync(join(DIR, 'plan-unique.json'), 'utf8'));
const raw = readdirSync(join(DIR, 'raw'));
const picksPath = join(DIR, 'unique-picks.json');
const picked = existsSync(picksPath) ? JSON.parse(readFileSync(picksPath, 'utf8')) : {};

const b64 = (f) => 'data:image/jpeg;base64,' + readFileSync(join(DIR, 'raw', f)).toString('base64');

// группируем по матчу
const byMatch = new Map();
for (const p of plan) {
  if (!byMatch.has(p._match)) byMatch.set(p._match, []);
  byMatch.get(p._match).push(p);
}

let sheet = 0;
for (const [match, goals] of byMatch) {
  let html = `<meta charset="utf-8"><style>
  body{background:#0d0d0f;color:#eee;font:13px -apple-system,sans-serif;margin:0;padding:14px}
  h2{font:700 15px Menlo,monospace;color:#8dc;margin:4px 0 10px}
  h3{font:700 11px Menlo,monospace;color:#7ac;margin:14px 0 4px}
  .row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:1100px}
  img{width:100%;display:block;border-radius:6px}figure{margin:0;position:relative}
  figcaption{font:10px Menlo,monospace;color:#888;padding-top:3px}
  .picked img{outline:3px solid #4ade80}
  </style><h2>${match}</h2>`;
  for (const g of goals) {
    const key = g.slug.replace(/^u-/, '').replace(/-(\d+)$/, ':$1');
    const files = raw.filter(f => f.startsWith(g.slug + '-')).sort();
    html += `<h3>${g.slug} · ${g._team} · ${g._world}/${g._pose}</h3><div class="row">`;
    for (const f of files) {
      const isPicked = picked[key] === f;
      html += `<figure class="${isPicked ? 'picked' : ''}"><img src="${b64(f)}"><figcaption>${basename(f)}${isPicked ? ' ← ВЫБРАНО' : ''}</figcaption></figure>`;
    }
    html += '</div>';
  }
  const file = join(out, `sheet-${String(++sheet).padStart(2, '0')}.html`);
  writeFileSync(file, html);
  console.log(`${basename(file)}  ${match}  (${goals.length} голов)`);
}
