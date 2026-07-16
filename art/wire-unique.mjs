#!/usr/bin/env node
// Подключает пер-гол отбор в picks.json ключами "GOAL@<fixture>:<seq>".
//   node wire-unique.mjs --pick 18202701:830 u-18202701-830-02.jpeg   — выбрать вариант
//   node wire-unique.mjs                                              — прошить все выбранные
// Источник истины отбора: art/unique-picks.json (пишется --pick'ом или руками).

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const picksPath = join(DIR, 'unique-picks.json');
const upicks = existsSync(picksPath) ? JSON.parse(readFileSync(picksPath, 'utf8')) : {};

const argv = process.argv.slice(2);
if (argv[0] === '--pick') {
  const [key, file] = [argv[1], argv[2]];
  if (!key || !file || !existsSync(join(DIR, 'raw', file))) {
    console.error('usage: node wire-unique.mjs --pick <fixture:seq> <файл из raw/>'); process.exit(2);
  }
  upicks[key] = file;
  writeFileSync(picksPath, JSON.stringify(upicks, null, 2) + '\n');
  console.log(`выбрано: ${key} → ${file}`);
  process.exit(0);
}

const picks = JSON.parse(readFileSync(join(DIR, 'picks.json'), 'utf8'));
let wired = 0;
for (const [key, file] of Object.entries(upicks)) {
  copyFileSync(join(DIR, 'raw', file), join(DIR, 'picks', file));
  picks[`GOAL@${key}`] = [`art/picks/${file}`];
  wired++;
}
writeFileSync(join(DIR, 'picks.json'), JSON.stringify(picks, null, 2) + '\n');
console.log(`picks.json: прошито пер-гол ключей ${wired}`);
