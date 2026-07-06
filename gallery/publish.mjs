#!/usr/bin/env node
// Live-паблишер: следит за mint/mint-log.ndjson; на каждый новый минт —
// допрувливает моменты, ребилдит галерею и пушит docs/ на GitHub Pages.
// Гол в матче → карточка на публичном сайте за ~минуту, пока идёт трансляция.
//   node publish.mjs          (остановка: Ctrl+C; интервал опроса 15с)

import { statSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const LOG = join(ROOT, 'mint', 'mint-log.ndjson');
const run = promisify(execFile);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

let lastMtime = existsSync(LOG) ? statSync(LOG).mtimeMs : 0;
let publishing = false;

async function publish() {
  publishing = true;
  try {
    log('новый минт — ребилд…');
    await run('node', [join(DIR, 'build-data.mjs')], { timeout: 300000 });
    await run('node', [join(DIR, 'build.mjs')], { timeout: 60000 });
    await run('git', ['add', 'docs', 'gallery/moments.json', 'mint/mint-log.ndjson', 'mint/proof-log.ndjson'], { cwd: ROOT });
    const { stdout: st } = await run('git', ['status', '--porcelain'], { cwd: ROOT });
    if (st.trim()) {
      await run('git', ['commit', '-q', '-m', 'live: new verified moment\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>'], { cwd: ROOT });
      await run('git', ['push', '-q'], { cwd: ROOT });
      log('✓ опубликовано на Pages');
    } else {
      log('изменений нет');
    }
  } catch (e) {
    log('✗ publish:', e.message.slice(0, 200));
  }
  publishing = false;
}

log('слежу за', LOG);
setInterval(() => {
  if (publishing || !existsSync(LOG)) return;
  const m = statSync(LOG).mtimeMs;
  if (m > lastMtime) { lastMtime = m; publish(); }
}, 15000);
