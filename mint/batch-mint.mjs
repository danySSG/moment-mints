#!/usr/bin/env node
// Батч-минт моментов из NDJSON-файла матча (исторические данные или улов захватчика).
//   node batch-mint.mjs ../day1/brazil-norway.ndjson --p1 Brazil --p2 Norway \
//        --competition "World Cup 2026 · Round of 16"
// Реплеит файл через детектор, минтит GOAL/GOAL_REVOKED/RED_CARD со счётом на момент
// события. Уже заминченное не дублирует (сверяется с mint-log.ndjson по fixture+seq).

import { readFileSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeUpdate } from '../core/normalize.mjs';
import { MatchEventDetector } from '../core/events.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const MINTABLE = new Set(['GOAL', 'GOAL_REVOKED', 'RED_CARD']);

const argv = process.argv.slice(2);
const file = argv[0];
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? undefined : argv[i + 1]; };
if (!file) { console.error('usage: node batch-mint.mjs <match.ndjson> --p1 X --p2 Y [--competition C]'); process.exit(2); }

const already = new Set();
const logPath = join(DIR, 'mint-log.ndjson');
if (existsSync(logPath)) {
  for (const line of readFileSync(logPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); already.add(`${r.event.fixtureId}:${r.event.seq}:${r.event.type}`); } catch {}
  }
}

const det = new MatchEventDetector();
const score = [0, 0];
let minted = 0, skipped = 0;
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  for (const e of det.ingest(normalizeUpdate(JSON.parse(line)))) {
    if (e.statKey === 1) score[0] = e.to;
    if (e.statKey === 2) score[1] = e.to;
    if (!MINTABLE.has(e.type)) continue;
    const key = `${e.fixtureId}:${e.seq}:${e.type}`;
    if (already.has(key)) { skipped++; continue; }
    // legendary-тир для фикстур из day1/legendary-fixtures.json (финал и т.п.)
    let ev = e;
    try {
      const lg = new Set((JSON.parse(readFileSync(join(DIR, '..', 'day1', 'legendary-fixtures.json'), 'utf8')).fixtures ?? []).map(String));
      if (lg.has(String(e.fixtureId))) ev = { ...e, legendary: true };
    } catch { /* нет конфига — ок */ }
    const args = [join(DIR, 'mint-moment.mjs'), JSON.stringify(ev),
      '--score', `${score[0]}-${score[1]}`];
    if (opt('--p1')) args.push('--p1', opt('--p1'));
    if (opt('--p2')) args.push('--p2', opt('--p2'));
    if (opt('--competition')) args.push('--competition', opt('--competition'));
    const { stdout } = await run('node', args, { timeout: 120000 });
    const r = JSON.parse(stdout);
    minted++;
    console.log(`MINTED: ${e.type} seq ${e.seq} (${score[0]}-${score[1]}) → ${r.asset}`);
  }
}
console.log(`итого: заминчено ${minted}, пропущено (уже было) ${skipped}`);
