#!/usr/bin/env node
// Презентационная панель для записи демо: читает mint/minter.log и показывает
// события чистым английским, без имени юзера и русского текста. Не трогает минтер.
//   node demo-feed.mjs        (Ctrl+C — выход)

import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG = join(dirname(fileURLToPath(import.meta.url)), 'mint', 'minter.log');
const C = { g: '\x1b[32m', y: '\x1b[33m', c: '\x1b[36m', d: '\x1b[90m', b: '\x1b[1m', r: '\x1b[31m', x: '\x1b[0m' };
const clear = () => process.stdout.write('\x1b[2J\x1b[3J\x1b[H');

let mints = 0;
function header() {
  clear();
  console.log(`${C.b}${C.g}  MOMENT MINTS${C.x}${C.d}  ·  live feed → detector → on-chain proof → mint${C.x}`);
  console.log(`${C.d}  TxLINE × Solana · World Cup 2026 · listening to the live match…${C.x}\n`);
}

// event: "…Z событие: GOAL 18202701 seq 264 action=goal"
// mint:  "…Z MINTED #7: GOAL Argentina–Egypt 1-0 → https://explorer…"
function render(line) {
  const time = (line.match(/T(\d{2}:\d{2}:\d{2})/) ?? [,''])[1];
  let m;
  if ((m = line.match(/событие: (\w+) (\d+) seq (\d+)(?: action=(\w+))?/))) {
    const [, type, fx, seq, action] = m;
    console.log(`${C.d}${time}${C.x}  ${C.c}● EVENT${C.x}   ${C.b}${type}${C.x} detected  ${C.d}fixture ${fx} · seq ${seq}${action ? ` · feed:${action}` : ''}${C.x}`);
  } else if ((m = line.match(/MINTED #(\d+): (\w+) (.+?) (\S+) → (\S+)/))) {
    const [, n, type, teams, score, url] = m;
    mints = +n;
    const col = type.includes('RED') || type.includes('REVOKED') ? C.r : C.g;
    console.log(`${C.d}${time}${C.x}  ${col}✓ MINTED${C.x}  ${C.b}${type}${C.x}  ${teams.replace('–', ' vs ')} ${C.b}${score}${C.x}`);
    console.log(`${C.d}          card born on-chain → ${url}${C.x}`);
  } else if ((m = line.match(/минт упал: (.+)/))) {
    console.log(`${C.d}${time}${C.x}  ${C.r}✗ mint retry${C.x} ${C.d}${m[1].slice(0, 60)}${C.x}`);
  }
  // heartbeat'ы и прочий шум не печатаем — только события и минты
}

header();
if (!existsSync(LOG)) { console.log(`${C.d}  waiting for minter.log…${C.x}`); }
let pos = existsSync(LOG) ? statSync(LOG).size : 0;
console.log(`${C.d}  ready — ${mints} cards minted so far this session. A goal will appear here within ~60s (devnet oracle delay).${C.x}\n`);

setInterval(() => {
  if (!existsSync(LOG)) return;
  const size = statSync(LOG).size;
  if (size < pos) pos = 0;              // лог обнулили
  if (size === pos) return;
  const chunk = readFileSync(LOG, 'utf8').slice(pos);
  pos = size;
  for (const line of chunk.split('\n')) if (line.trim()) render(line);
}, 1000);
