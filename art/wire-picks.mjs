#!/usr/bin/env node
// Собирает ключи `GOAL:<Team>:<archetype>` в picks.json из отобранных файлов.
//   node wire-picks.mjs                 — авто: берёт ВСЕ варианты архетипа как пул
//   node wire-picks.mjs --only Spain    — только одна команда
// Отбраковку (номера/гербы/маски) правим руками в art/rejects.json — перечисленные
// там файлы в пул не попадают.
//
// Старые ключи (`GOAL:Team`, `GOAL_REVOKED:*`, `RED_CARD:*`, `GOAL_LEGENDARY:*`)
// не трогаем: на них живут VAR/RED/укиё-э и фолбэк для команд без архетипов.

import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHETYPES, JERSEY } from './archetypes.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;

const rejectsPath = join(DIR, 'rejects.json');
const rejects = new Set(existsSync(rejectsPath) ? JSON.parse(readFileSync(rejectsPath, 'utf8')) : []);

const picks = JSON.parse(readFileSync(join(DIR, 'picks.json'), 'utf8'));
const raw = readdirSync(join(DIR, 'raw'));
const slugOf = (t) => t.toLowerCase().replace(/\s+/g, '');

let wired = 0, skipped = 0;
for (const team of Object.keys(JERSEY)) {
  if (only && team !== only) continue;
  for (const a of ARCHETYPES) {
    const prefix = `arch-${slugOf(team)}-${a.key}-`;
    const files = raw.filter(f => f.startsWith(prefix) && f.endsWith('.jpeg') && !rejects.has(f)).sort();
    if (!files.length) { skipped++; continue; }
    // копируем отобранное в picks/ (raw гитом не трекается, picks — трекается)
    const rel = [];
    for (const f of files) {
      copyFileSync(join(DIR, 'raw', f), join(DIR, 'picks', f));
      rel.push(`art/picks/${f}`);
    }
    picks[`GOAL:${team}:${a.key}`] = rel;
    wired++;
  }
}
writeFileSync(join(DIR, 'picks.json'), JSON.stringify(picks, null, 2) + '\n');
console.log(`picks.json: подключено ключей ${wired}, пропущено (нет файлов) ${skipped}, отбраковано ${rejects.size}`);
