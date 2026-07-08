#!/usr/bin/env node
// Ретрофит старых карточек: для каждого момента из mint-log компонует карточку
// с текущим артом (если он есть для команды/события), заливает image+metadata
// на Irys и обновляет URI ассета транзакцией update (Metaplex Core) — мы держим
// update authority. Заодно чинит старые arweave.net-ссылки.
//   node update-assets.mjs            (пропускает моменты без арта и уже артовые)
// Обновляет строки mint-log.ndjson (imageUri/metadataUri) — галерея подтянет.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { keypairIdentity, createGenericFile, publicKey } from '@metaplex-foundation/umi';
import { update, fetchAsset, addPlugin, updatePlugin } from '@metaplex-foundation/mpl-core';
import { momentCardArt } from './card-svg.mjs';
import { normalizeUpdate } from '../core/normalize.mjs';
import { MatchEventDetector } from '../core/events.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const RPC = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';
const toGateway = (u) => u.replace('https://arweave.net/', 'https://devnet.irys.xyz/');

const FIXTURES = {
  '18175918': { p1: 'Argentina', p2: 'Cape Verde', comp: 'World Cup 2026 · Group stage', file: 'day1/argentina-capeverde.ndjson' },
  '18187298': { p1: 'Brazil', p2: 'Norway', comp: 'World Cup 2026 · Round of 16', file: 'day1/brazil-norway.ndjson' },
  '18192996': { p1: 'Mexico', p2: 'England', comp: 'World Cup 2026 · Round of 16', file: 'day1/mexico-england.ndjson' },
};

// восстановить полные события + счёт на момент (старые записи лога — краткие)
const detail = new Map();
for (const [fid, fx] of Object.entries(FIXTURES)) {
  const det = new MatchEventDetector();
  const score = [0, 0];
  for (const line of readFileSync(join(ROOT, fx.file), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    for (const e of det.ingest(normalizeUpdate(JSON.parse(line)))) {
      if (e.statKey === 1) score[0] = e.to;
      if (e.statKey === 2) score[1] = e.to;
      detail.set(`${e.fixtureId}:${e.seq}:${e.type}`, { ...e, score: `${score[0]}-${score[1]}` });
    }
  }
}

const umi = createUmi(RPC).use(irysUploader({ address: 'https://devnet.irys.xyz' }));
const secret = Uint8Array.from(JSON.parse(readFileSync(join(ROOT, 'day1', 'wallet-devnet.json'), 'utf8')));
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));

// proof-log: fixtureId:seq:statKey -> { txSig, value, epochDay } (реальные validate_stat-транзы)
const proofByKey = new Map();
try {
  for (const l of readFileSync(join(DIR, 'proof-log.ndjson'), 'utf8').split('\n').filter(x => x.trim())) {
    const p = JSON.parse(l);
    if (p.ok && p.txSig) proofByKey.set(`${p.fixtureId}:${p.seq}:${p.statKey}`, p);
  }
} catch { /* нет пруф-лога — плагин просто не пишем */ }
const CLUSTER = RPC.includes('devnet') ? 'devnet' : 'mainnet';
const PROGRAM = '6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J';
const txUrl = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;
const pfFor = (e) => proofByKey.get(`${e.fixtureId}:${e.seq}:${e.statKey}`);

// L1 «on-chain правда»: вписать реальную validate_stat-подпись + координаты Merkle-листа
// в on-chain Attributes plugin ассета — чтобы explorer/программа читали пруф БЕЗ доверия
// нашим файлам. addPlugin в первый раз, updatePlugin если плагин уже есть.
async function bindProof(assetPk, e) {
  const pf = pfFor(e);
  if (!pf) { console.error(`  · нет пруфа: ${e.fixtureId}:${e.seq}:${e.statKey}`); return false; }
  const attributeList = [
    { key: 'proof_tx', value: pf.txSig },
    { key: 'proof_explorer', value: txUrl(pf.txSig) },
    { key: 'txline_program', value: PROGRAM },
    { key: 'validate_ix', value: 'validate_stat' },
    { key: 'fixture_id', value: String(e.fixtureId) },
    { key: 'seq', value: String(e.seq) },
    { key: 'stat_key', value: String(e.statKey ?? '') },
    { key: 'stat_value', value: String(pf.value ?? '') },
    { key: 'epoch_day', value: String(pf.epochDay ?? '') },
  ];
  const fetched = await fetchAsset(umi, publicKey(assetPk));
  const plugin = { type: 'Attributes', attributeList };
  if (fetched.attributes) await updatePlugin(umi, { asset: fetched.publicKey, plugin }).sendAndConfirm(umi);
  else await addPlugin(umi, { asset: fetched.publicKey, plugin }).sendAndConfirm(umi);
  return true;
}

const logPath = join(DIR, 'mint-log.ndjson');
const lines = readFileSync(logPath, 'utf8').split('\n').filter(l => l.trim());
const out = [];
let updated = 0, skipped = 0, bound = 0;
// --bind-only: НЕ трогать арт/URI, только вписать пруф в on-chain Attributes (быстро, дёшево)
const bindOnly = process.argv.includes('--bind-only');

for (const line of lines) {
  const m = JSON.parse(line);
  const key = `${m.event.fixtureId}:${m.event.seq}:${m.event.type}`;
  const e = { ...detail.get(key), ...m.event };
  const fx = FIXTURES[String(e.fixtureId)] ?? {};

  if (bindOnly) {
    if (await bindProof(m.asset, e)) { bound++; console.error(`  ⛓ пруф вписан: ${m.asset}`); }
    out.push(line);
    continue;
  }
  const ctx = {
    participant1: fx.p1 ?? m.ctx?.participant1, participant2: fx.p2 ?? m.ctx?.participant2,
    score: detail.get(key)?.score ?? m.ctx?.score, competition: fx.comp ?? m.ctx?.competition,
  };
  // --fixture <id>: обновить только карточки одного матча (точечный ретрофит)
  const fxArg = process.argv.indexOf('--fixture');
  if (fxArg !== -1 && String(m.event.fixtureId) !== process.argv[fxArg + 1]) { out.push(line); skipped++; continue; }
  if (m.artApplied && !process.argv.includes('--force') && fxArg === -1) { out.push(line); skipped++; continue; }
  const svg = momentCardArt(e, ctx);
  if (!svg) { out.push(line); skipped++; console.error(`- нет арта: ${key}`); continue; }

  console.error(`↻ ${key} (${ctx.participant1} vs ${ctx.participant2}, ${ctx.score})…`);
  const file = createGenericFile(new TextEncoder().encode(svg), `moment-${e.fixtureId}-${e.seq}-v2.svg`,
    { contentType: 'image/svg+xml' });
  const [rawImage] = await umi.uploader.upload([file]);
  const imageUri = toGateway(rawImage);
  const team = e.participant === 1 ? ctx.participant1 : ctx.participant2;
  const name = `${e.type}${team ? ` · ${team}` : ''} · seq ${e.seq}`.slice(0, 32);
  const metadataUri = toGateway(await umi.uploader.uploadJson({
    name, symbol: 'MOMENT',
    description: `Verified ${e.type} moment. ${ctx.participant1} vs ${ctx.participant2}` +
      `${ctx.score ? ` (${ctx.score})` : ''}. ` +
      'This card exists only because the TxLINE on-chain-anchored feed recorded the event.',
    image: imageUri,
    attributes: [
      { trait_type: 'event', value: e.type },
      { trait_type: 'fixture', value: String(e.fixtureId) },
      { trait_type: 'seq', value: String(e.seq) },
      { trait_type: 'statKey', value: String(e.statKey ?? '') },
      { trait_type: 'transition', value: `${e.from}->${e.to}` },
      { trait_type: 'feed_action', value: String(e.action ?? '') },
      { trait_type: 'feed_ts', value: String(e.ts ?? '') },
      { trait_type: 'proof_tx', value: pfFor(e)?.txSig ?? 'pending' },
      { trait_type: 'verify', value: pfFor(e) ? txUrl(pfFor(e).txSig) : '' },
    ],
  }));

  const asset = await fetchAsset(umi, publicKey(m.asset));
  await update(umi, { asset, name, uri: metadataUri }).sendAndConfirm(umi);
  await bindProof(m.asset, e); // вписать пруф в on-chain Attributes plugin
  updated++;
  console.error(`  ✓ ${m.asset}`);
  out.push(JSON.stringify({ ...m, imageUri, metadataUri, event: e, ctx, artApplied: true }));
}

writeFileSync(logPath, out.join('\n') + '\n');
if (bindOnly) console.log(`пруфов вписано on-chain: ${bound}`);
else console.log(`обновлено ассетов: ${updated} (+пруфы), пропущено: ${skipped}`);
