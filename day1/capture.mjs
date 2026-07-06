#!/usr/bin/env node
// Ночной захват live SSE-стрима скоров: сырые апдейты → capture-raw.ndjson,
// события детектора → capture-events.ndjson (+ в лог). Сам переподключается.
// Запуск:  nohup node capture.mjs >> capture.log 2>&1 &
// Остановка: pkill -f capture.mjs

import { appendFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSseMessages, parseSseData } from '../core/sse.mjs';
import { normalizeUpdate } from '../core/normalize.mjs';
import { MatchEventDetector } from '../core/events.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(DIR, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const API = process.env.TXLINE_API_ORIGIN ?? 'https://txline-dev.txodds.com';
const RAW = join(DIR, 'capture-raw.ndjson');
const EVENTS = join(DIR, 'capture-events.ndjson');
const det = new MatchEventDetector();
const log = (...a) => console.log(new Date().toISOString(), ...a);

let beats = 0;
while (true) {
  try {
    log('подключаюсь к /api/scores/stream…');
    const res = await fetch(`${API}/api/scores/stream`, {
      headers: {
        Authorization: `Bearer ${process.env.TXLINE_JWT}`,
        'X-Api-Token': process.env.TXLINE_API_TOKEN,
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
    log('подключено, HTTP', res.status);
    for await (const msg of readSseMessages(res)) {
      if (msg.event === 'heartbeat') { // живость раз в ~50 биений (~10 мин)
        if (++beats % 50 === 0) log('жив, heartbeats:', beats);
        continue;
      }
      const payload = parseSseData(msg.data);
      if (payload && typeof payload === 'object') {
        appendFileSync(RAW, JSON.stringify(payload) + '\n');
      }
      for (const e of det.ingest(normalizeUpdate(payload))) {
        appendFileSync(EVENTS, JSON.stringify(e) + '\n');
        log('СОБЫТИЕ:', e.type, 'fixture', e.fixtureId,
          e.participant != null ? `P${e.participant} ${e.from}→${e.to}` : `${e.fromName}→${e.toName}`,
          e.action ? `(action=${e.action})` : '');
      }
    }
    log('стрим закрылся, переподключение через 5с');
  } catch (e) {
    log('ошибка стрима:', e.message, '— переподключение через 5с');
  }
  await new Promise(r => setTimeout(r, 5000));
}
