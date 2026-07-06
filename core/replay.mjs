#!/usr/bin/env node
// Реплей фида из NDJSON-файла (по строке сырого payload'а) → события в stdout.
// Тест парсера БЕЗ живого матча: день-1 сливаем вчерашний матч через
//   GET /api/scores/snapshot/{fixtureId}?asOf=  и /api/scores/updates/... → в файл,
// затем:  node replay.mjs match.ndjson
// Живой стрим (после активации токена оператором):
//   node replay.mjs --live https://txline-dev.txodds.com/api/scores/stream
//   (JWT и apiToken — в env: TXLINE_JWT, TXLINE_API_TOKEN)

import { readFileSync } from 'node:fs';
import { normalizeUpdate } from './normalize.mjs';
import { MatchEventDetector } from './events.mjs';
import { readSseMessages, parseSseData } from './sse.mjs';

const detector = new MatchEventDetector({ trackCorners: process.env.TRACK_CORNERS === '1' });

function emit(events) {
  for (const e of events) console.log(JSON.stringify(e));
}

const args = process.argv.slice(2);
if (args[0] === '--live') {
  const url = args[1];
  if (!url || !process.env.TXLINE_JWT || !process.env.TXLINE_API_TOKEN) {
    console.error('usage: TXLINE_JWT=... TXLINE_API_TOKEN=... node replay.mjs --live <stream-url>');
    process.exit(2);
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.TXLINE_JWT}`,
      'X-Api-Token': process.env.TXLINE_API_TOKEN,
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
  for await (const msg of readSseMessages(res)) {
    const payload = parseSseData(msg.data);
    emit(detector.ingest(normalizeUpdate(payload)));
  }
} else {
  const file = args[0];
  if (!file) { console.error('usage: node replay.mjs <updates.ndjson> | --live <url>'); process.exit(2); }
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    emit(detector.ingest(normalizeUpdate(JSON.parse(line))));
  }
}
