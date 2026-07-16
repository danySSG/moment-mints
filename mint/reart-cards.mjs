#!/usr/bin/env node
// Переделка арта УЖЕ СМИНЧЕННЫХ карточек под систему архетипов (art/archetypes.mjs).
//
// Зачем: 45 карточек сминчены со старым артом — «стена оранжевого». Пруф (подпись
// validate_stat в Core Attributes) НЕ ТРОГАЕМ, меняется только картинка: арт — слой
// представления, оператор его автор. Путь тот же, что у миграции на Arweave:
// Turbo-загрузка (платит mainnet-кошелёк) + update() на devnet (подпись update
// authority = wallet-devnet.json).
//
// Для каждой GOAL-записи mint-log.ndjson (VAR/RED/укиё-э не трогаем — у них свой тир):
//   1. считаем роль гола → архетип (по счёту + минуте; kickoff берём из
//      /api/scores/snapshot/{fixtureId} — работает и для законченных матчей)
//   2. пересобираем SVG с новым артом
//   3. заливаем image + metadata на Arweave
//   4. update() ассета: uri → новая metadata (name сохраняем)
//   5. переписываем строку лога: imageUri/metadataUri/archetype/role + artv:2
// Идемпотентно: artv===2 → пропуск.
//
//   node reart-cards.mjs --dry [--limit N]   — только показать план
//   node reart-cards.mjs [--limit N]         — выполнить

import { readFileSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import bs58 from 'bs58';
import { TurboFactory } from '@ardrive/turbo-sdk';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import { update, fetchAsset } from '@metaplex-foundation/mpl-core';
import { momentCardArt } from './card-svg.mjs';
import { goalRole, pickArchetype } from '../art/archetypes.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const LIMIT = argv.includes('--limit') ? Number(argv[argv.indexOf('--limit') + 1]) : Infinity;
const LOG = join(DIR, 'mint-log.ndjson');

for (const line of readFileSync(join(DIR, '..', 'day1', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const API = process.env.TXLINE_API_ORIGIN ?? 'https://txline-dev.txodds.com';
const HEADERS = {
  Authorization: `Bearer ${process.env.TXLINE_JWT}`,
  'X-Api-Token': process.env.TXLINE_API_TOKEN,
};

// НАСТОЯЩАЯ минута матча берётся из Clock.Seconds фида, а НЕ из ts - StartTime:
// последнее даёт мусор (перерыв, добавленное, поздний старт) — на Argentina-Switzerland
// выходило 163' вместо реальных 120.7', и золото сыпалось на каждый гол 2-го тайма.
// У сминченных событий clockSeconds нет (минтили до правки normalize), поэтому тянем
// историю фикстуры и строим карту seq → Clock.Seconds.
const clockCache = new Map();
async function clockMap(fixtureId) {
  const k = String(fixtureId);
  if (clockCache.has(k)) return clockCache.get(k);
  const map = new Map();
  try {
    const r = await fetch(`${API}/api/scores/updates/${k}`, { headers: HEADERS });
    if (r.ok) {
      for (const ln of (await r.text()).split('\n')) {
        const t = ln.trim();
        if (!t.startsWith('data:')) continue;
        try {
          const o = JSON.parse(t.slice(5).trim());
          const s = o?.Clock?.Seconds, seq = o?.Seq;
          if (Number.isFinite(Number(s)) && Number.isFinite(Number(seq))) map.set(Number(seq), Number(s));
        } catch { /* битая строка */ }
      }
    }
  } catch { /* нет сети — роль не посчитаем, запись пропустим */ }
  clockCache.set(k, map);
  return map;
}

const rows = readFileSync(LOG, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));

// группируем по фикстуре и идём в порядке seq — только так лестница добора
// детерминирована и совпадёт с тем, что посчитал бы живой минт
const byFixture = new Map();
for (const [i, r] of rows.entries()) {
  const f = String(r.event?.fixtureId ?? '');
  if (!byFixture.has(f)) byFixture.set(f, []);
  byFixture.get(f).push(i);
}
for (const idxs of byFixture.values()) idxs.sort((a, b) => (rows[a].event?.seq ?? 0) - (rows[b].event?.seq ?? 0));

// план: какой карточке какой архетип
const plan = [];
for (const [fixtureId, idxs] of byFixture) {
  const used = new Set();
  const clocks = await clockMap(fixtureId);
  for (const i of idxs) {
    const r = rows[i];
    const e = r.event ?? {};
    if (e.type !== 'GOAL' || r.legendary) continue;          // VAR/RED/укиё-э — свой тир
    const clockSec = e.clockSeconds ?? clocks.get(Number(e.seq));
    if (!r.ctx?.score || !Number.isFinite(Number(clockSec))) continue; // нечем посчитать роль
    const after = String(r.ctx.score).split('-').map(Number);
    if (after.length !== 2 || after.some(n => !Number.isFinite(n))) continue;
    const before = [...after];
    before[e.participant === 1 ? 0 : 1] -= 1;
    if (before.some(n => n < 0)) continue;
    const minute = Math.round(Number(clockSec) / 60);
    const role = goalRole({ scoredBy: e.participant, before, after, minute });
    const archetype = pickArchetype(role, used);
    if (r.artv === Number(process.env.ART_V ?? 2)) continue;  // уже на целевой версии
    plan.push({ i, r, archetype, role, minute });
  }
}

const team = (r) => (r?.event?.participant === 1 ? r.ctx?.participant1 : r?.ctx?.participant2);
console.log(`к переделке: ${plan.length} карточек (GOAL, ещё не artv:2)\n`);
for (const p of plan.slice(0, LIMIT)) {
  console.log(`  ${String(p.r.ctx?.participant1 ?? '?').padEnd(12)} vs ${String(p.r.ctx?.participant2 ?? '?').padEnd(12)} ` +
    `${String(p.r.ctx?.score ?? '').padEnd(4)} ${String(team(p.r) ?? '?').padEnd(12)} ${String(p.minute).padStart(2)}' ` +
    `${p.role.padEnd(12)} → ${p.archetype}`);
}
if (DRY) { console.log('\n--dry: ничего не меняю'); process.exit(0); }

// ── выполнение ────────────────────────────────────────────────────────────────
const mainnetKey = Uint8Array.from(JSON.parse(readFileSync(join(DIR, '..', 'day1', 'wallet-mainnet.json'), 'utf8')));
const turbo = TurboFactory.authenticated({ privateKey: bs58.encode(mainnetKey), token: 'solana' });
const umi = createUmi(process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com');
const devKey = Uint8Array.from(JSON.parse(readFileSync(join(DIR, '..', 'day1', 'wallet-devnet.json'), 'utf8')));
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(devKey)));

const upload = async (bytes, contentType) => {
  const res = await turbo.uploadFile({
    fileStreamFactory: () => Readable.from(Buffer.from(bytes)),
    fileSizeFactory: () => Buffer.from(bytes).length,
    dataItemOpts: { tags: [{ name: 'Content-Type', value: contentType }] },
  });
  return `https://arweave.net/${res.id}`;
};

let done = 0;
for (const p of plan.slice(0, LIMIT)) {
  const { i, r, archetype } = p;
  try {
    const svg = momentCardArt(r.event, { ...r.ctx, archetype });
    if (!svg) { console.log(`  ПРОПУСК (нет арта): ${team(r)} / ${archetype}`); continue; }

    const imageUri = await upload(new TextEncoder().encode(svg), 'image/svg+xml');
    const meta = await (await fetch(r.metadataUri)).json();   // сохраняем attributes (там ПРУФ!)
    meta.image = imageUri;
    const metadataUri = await upload(new TextEncoder().encode(JSON.stringify(meta)), 'application/json');

    const asset = await fetchAsset(umi, publicKey(r.asset));
    await update(umi, { asset, name: asset.name, uri: metadataUri }).sendAndConfirm(umi);

    rows[i] = { ...r, imageUri, metadataUri, archetype, role: p.role, minute: p.minute, artv: Number(process.env.ART_V ?? 2) };
    writeFileSync(LOG, rows.map(x => JSON.stringify(x)).join('\n') + '\n');
    done++;
    console.log(`  ✓ ${done}/${Math.min(plan.length, LIMIT)} ${team(r)} ${archetype} → ${r.asset.slice(0, 8)}…`);
  } catch (err) {
    console.log(`  ✗ ${team(r)} ${archetype}: ${err.message}`);
  }
}
console.log(`\nпеределано: ${done}`);
