#!/usr/bin/env node
// Сборка данных галереи: mint-log + реплей матчей (для statKey/счёта у старых записей)
// + on-chain proof каждого момента → gallery/moments.json.
// Прувы кэшируются по mint/proof-log.ndjson — повторный запуск не тратит газ.
//   node build-data.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeUpdate } from '../core/normalize.mjs';
import { MatchEventDetector } from '../core/events.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const MINT = join(DIR, '..', 'mint');
const run = promisify(execFile);

// известные фикстуры (снапшот + прошедшие матчи)
const FIXTURES = {
  '18175918': { p1: 'Argentina', p2: 'Cape Verde', comp: 'World Cup 2026 · Group stage', file: '../day1/argentina-capeverde.ndjson' },
  '18187298': { p1: 'Brazil', p2: 'Norway', comp: 'World Cup 2026 · Round of 16', file: '../day1/brazil-norway.ndjson' },
  '18192996': { p1: 'Mexico', p2: 'England', comp: 'World Cup 2026 · Round of 16', file: '../day1/mexico-england.ndjson' },
};

// 1. реплей матчей → полные события с текущим счётом
const detail = new Map(); // fixture:seq:type -> {statKey, participant, score, action, ts}
for (const [fid, fx] of Object.entries(FIXTURES)) {
  const path = join(DIR, fx.file);
  if (!existsSync(path)) continue;
  const det = new MatchEventDetector();
  const score = [0, 0];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    for (const e of det.ingest(normalizeUpdate(JSON.parse(line)))) {
      if (e.statKey === 1) score[0] = e.to;
      if (e.statKey === 2) score[1] = e.to;
      detail.set(`${e.fixtureId}:${e.seq}:${e.type}`,
        { ...e, score: `${score[0]}–${score[1]}` });
    }
  }
}

// 2. кэш прувов
const proofCache = new Map(); // fixture:seq:statKey -> proof
const proofLog = join(MINT, 'proof-log.ndjson');
if (existsSync(proofLog)) {
  for (const line of readFileSync(proofLog, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const p = JSON.parse(line);
    if (p.ok && p.txSig) proofCache.set(`${p.fixtureId}:${p.seq}:${p.statKey}`, p);
  }
}

// 3. обход mint-log: обогатить, допрувить, собрать
const moments = [];
for (const line of readFileSync(join(MINT, 'mint-log.ndjson'), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const m = JSON.parse(line);
  const key = `${m.event.fixtureId}:${m.event.seq}:${m.event.type}`;
  const e = { ...detail.get(key), ...m.event }; // в новых записях event уже полный
  const fx = FIXTURES[String(e.fixtureId)] ?? {};
  if (e.statKey == null) { console.error('нет statKey, пропуск:', key); continue; }

  const pKey = `${e.fixtureId}:${e.seq}:${e.statKey}`;
  let proof = proofCache.get(pKey);
  if (!proof) {
    console.error(`[proof] ${e.type} ${key}…`);
    try {
      const { stdout } = await run('node', [join(MINT, 'proof.mjs'),
        String(e.fixtureId), String(e.seq), String(e.statKey), '--anchor'], { timeout: 120000 });
      proof = JSON.parse(stdout);
      proofCache.set(pKey, proof);
    } catch (err) {
      console.error('  пруф не прошёл:', err.message.slice(0, 200));
      proof = null;
    }
  }
  moments.push({
    asset: m.asset, image: m.imageUri, metadata: m.metadataUri, assetExplorer: m.explorer,
    type: e.type, fixtureId: e.fixtureId, seq: e.seq, statKey: e.statKey,
    team: e.participant === 1 ? fx.p1 : fx.p2,
    match: `${fx.p1 ?? '?'} vs ${fx.p2 ?? '?'}`, competition: fx.comp ?? '',
    score: detail.get(key)?.score ?? m.ctx?.score ?? '',
    action: e.action ?? null, ts: e.ts ?? null,
    proofTx: proof?.txSig ?? null,
    proofExplorer: proof?.explorer ?? null,
    verified: Boolean(proof?.ok),
  });
}
moments.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
writeFileSync(join(DIR, 'moments.json'), JSON.stringify(moments, null, 2));
console.log(`moments.json: ${moments.length} моментов, verified: ${moments.filter(m => m.verified).length}`);
