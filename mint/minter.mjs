#!/usr/bin/env node
// Авто-минтер: live SSE-стрим скоров → детектор → mint-moment.mjs на каждое
// значимое событие (GOAL / GOAL_REVOKED / RED_CARD). Контекст фикстур (названия
// команд) тянет из /api/fixtures/snapshot, счёт ведёт по событиям детектора.
// Запуск:  nohup node minter.mjs >> minter.log 2>&1 &
// Стоп:    pkill -f minter.mjs
// Предохранитель: не больше MAX_MINTS минтов за запуск.

import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSseMessages, parseSseData } from '../core/sse.mjs';
import { normalizeUpdate } from '../core/normalize.mjs';
import { MatchEventDetector } from '../core/events.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
for (const line of readFileSync(join(DIR, '..', 'day1', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const API = process.env.TXLINE_API_ORIGIN ?? 'https://txline-dev.txodds.com';
const HEADERS = {
  Authorization: `Bearer ${process.env.TXLINE_JWT}`,
  'X-Api-Token': process.env.TXLINE_API_TOKEN,
};
const MINTABLE = new Set(['GOAL', 'GOAL_REVOKED', 'RED_CARD']);
const MAX_MINTS = Number(process.env.MAX_MINTS ?? 60);
// legendary-тир (укиё-э): события этих фикстур (финал и т.п.) минтятся золотыми
let LEGENDARY = new Set();
try {
  LEGENDARY = new Set((JSON.parse(readFileSync(join(DIR, '..', 'day1', 'legendary-fixtures.json'), 'utf8')).fixtures ?? []).map(String));
} catch { /* конфига нет — ни одна фикстура не legendary */ }

const det = new MatchEventDetector();
const fixtures = new Map(); // FixtureId -> { p1, p2, competition }
const scores = new Map();   // fixtureId -> [goalsP1, goalsP2]
let minted = 0;
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function refreshFixtures() {
  try {
    const res = await fetch(`${API}/api/fixtures/snapshot`, { headers: HEADERS });
    if (!res.ok) return;
    for (const f of await res.json()) {
      fixtures.set(String(f.FixtureId), {
        p1: f.Participant1, p2: f.Participant2, competition: f.Competition,
        start: f.StartTime,   // нужен для минуты матча → роль гола → архетип арта
      });
    }
    log('фикстуры обновлены:', fixtures.size);
  } catch (e) { log('fixtures snapshot не взялся:', e.message); }
}

function scoreAfter(e) {
  const s = scores.get(e.fixtureId) ?? [0, 0];
  if (e.statKey === 1) s[0] = e.to;
  if (e.statKey === 2) s[1] = e.to;
  scores.set(e.fixtureId, s);
  return `${s[0]}-${s[1]}`;
}

async function mint(e, score) {
  if (minted >= MAX_MINTS) { log('лимит минтов', MAX_MINTS, '— пропускаю', e.type); return; }
  if (!fixtures.has(e.fixtureId)) await refreshFixtures();
  const fx = fixtures.get(e.fixtureId) ?? {};
  if (LEGENDARY.has(String(e.fixtureId))) e = { ...e, legendary: true };
  const args = [join(DIR, 'mint-moment.mjs'), JSON.stringify(e)];
  if (fx.p1) args.push('--p1', fx.p1);
  if (fx.p2) args.push('--p2', fx.p2);
  if (score) args.push('--score', score);
  if (fx.competition) args.push('--competition', `${fx.competition} 2026`);
  if (fx.start) args.push('--kickoff', String(fx.start));
  try {
    const { stdout } = await run('node', args, { timeout: 120000 });
    minted++;
    const r = JSON.parse(stdout);
    log(`MINTED #${minted}: ${e.type} ${fx.p1 ?? '?'}–${fx.p2 ?? '?'} ${score ?? ''} → ${r.explorer}`);
  } catch (err) {
    log('минт упал:', e.type, e.fixtureId, e.seq, '—', err.message);
  }
}

await refreshFixtures();
let beats = 0;
while (true) {
  try {
    log('подключаюсь к стриму…');
    const res = await fetch(`${API}/api/scores/stream`, {
      headers: { ...HEADERS, Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
    log('подключено, HTTP', res.status);
    for await (const msg of readSseMessages(res)) {
      if (msg.event === 'heartbeat') {
        if (++beats % 50 === 0) log('жив, heartbeats:', beats, '| минтов:', minted);
        continue;
      }
      for (const e of det.ingest(normalizeUpdate(parseSseData(msg.data)))) {
        const score = (e.statKey === 1 || e.statKey === 2) ? scoreAfter(e) : undefined;
        log('событие:', e.type, e.fixtureId, `seq ${e.seq}`, e.action ? `action=${e.action}` : '');
        if (MINTABLE.has(e.type)) await mint(e, score);
      }
    }
    log('стрим закрылся, переподключение через 5с');
  } catch (e) {
    log('ошибка стрима:', e.message, '— переподключение через 5с');
  }
  await new Promise(r => setTimeout(r, 5000));
}
