#!/usr/bin/env node
// Миграция 25 devnet-карточек с ЭФЕМЕРНОГО devnet.irys.xyz на НАСТОЯЩИЙ вечный
// Arweave (ArDrive Turbo, оплата SOL) — снимает риск 404 во время судейства.
// Гибрид hero-set.mjs (Turbo-загрузка, mainnet-кошелёк) + update-assets.mjs
// (Core update на DEVNET, подпись update authority = wallet-devnet.json).
//
// Для каждой записи mint-log.ndjson:
//   1. дотягиваем текущие байты image (SVG) и metadata (JSON) с devnet.irys (пока 200)
//   2. заливаем image на Arweave → arweave.net/<id>
//   3. вписываем новый image-URL в metadata.image, заливаем metadata на Arweave
//   4. update() ассета на devnet: uri → новый arweave metadata (name сохраняем)
//   5. переписываем строку mint-log (imageUri/metadataUri), остальные поля не трогаем
// Идемпотентно: если imageUri уже arweave.net — пропуск (безопасный повторный запуск).
//   node migrate-devnet-arweave.mjs [--limit N] [--dry]
//
// ВНИМАНИЕ: Turbo-загрузка платится SOL с day1/wallet-mainnet.json (mainnet),
// а update() — DEVNET-транза, подписанная day1/wallet-devnet.json (update authority).

import { readFileSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import bs58 from 'bs58';
import { TurboFactory } from '@ardrive/turbo-sdk';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import { update, fetchAsset } from '@metaplex-foundation/mpl-core';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const RPC = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';
const log = (...a) => console.error('[migrate]', ...a);

const DRY = process.argv.includes('--dry');
const limIdx = process.argv.indexOf('--limit');
const LIMIT = limIdx !== -1 ? Number(process.argv[limIdx + 1]) : Infinity;

// --- клиенты ---
// Turbo (Arweave) — платит mainnet-кошелёк
const mainnetSecret = Uint8Array.from(JSON.parse(readFileSync(join(ROOT, 'day1', 'wallet-mainnet.json'), 'utf8')));
const turbo = TurboFactory.authenticated({ privateKey: bs58.encode(mainnetSecret), token: 'solana' });
// DEVNET UMI — update authority (кошелёк, что минтил 25 ассетов)
const devnetSecret = Uint8Array.from(JSON.parse(readFileSync(join(ROOT, 'day1', 'wallet-devnet.json'), 'utf8')));
const umi = createUmi(RPC);
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(devnetSecret)));

// залить буфер на настоящий Arweave через Turbo → https://arweave.net/<id>
async function toArweave(buf, contentType) {
  const res = await turbo.uploadFile({
    fileStreamFactory: () => Readable.from(buf),
    fileSizeFactory: () => buf.length,
    dataItemOpts: { tags: [{ name: 'Content-Type', value: contentType }] },
  });
  return `https://arweave.net/${res.id}`;
}

async function fetchBytes(url) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`GET ${url} → HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// --- проверка/пополнение Turbo-баланса ---
const logPath = join(DIR, 'mint-log.ndjson');
const lines = readFileSync(logPath, 'utf8').split('\n').filter(l => l.trim());
const pending = lines.map(l => JSON.parse(l)).filter(m => !String(m.imageUri).startsWith('https://arweave.net/'));
log(`всего записей: ${lines.length}, к миграции: ${pending.length} (уже на arweave: ${lines.length - pending.length})`);

try {
  const bal = await turbo.getBalance();
  const winc = Number(bal.winc ?? bal.effectiveBalance ?? 0);
  log(`Turbo-баланс: ${winc.toLocaleString()} winc`);
  // ~5.8e10 winc на все 25 карт; порог с запасом
  if (!DRY && winc < 8e10 && pending.length) {
    log('баланса мало — пополняю 0.02 SOL…');
    await turbo.topUpWithTokens({ tokenAmount: 20_000_000 }); // 0.02 SOL в lamports
    const bal2 = await turbo.getBalance();
    log(`новый Turbo-баланс: ${Number(bal2.winc).toLocaleString()} winc`);
  }
} catch (e) { log('не смог проверить/пополнить Turbo-баланс:', e.message, '(продолжаю — загрузка сама выявит нехватку)'); }

// --- миграция ---
const out = [];
let migrated = 0, skipped = 0, failed = 0;
for (const m of lines.map(l => JSON.parse(l))) {
  if (String(m.imageUri).startsWith('https://arweave.net/')) {
    out.push(JSON.stringify(m)); skipped++; continue;
  }
  if (migrated >= LIMIT) { out.push(JSON.stringify(m)); continue; }
  const tag = `${m.event?.fixtureId}:${m.event?.seq}:${m.event?.type}`;
  try {
    log(`↻ ${tag} · ${m.asset}`);
    // 1. байты image + metadata (пока devnet.irys отдаёт 200)
    const imgBuf = await fetchBytes(m.imageUri);
    const metaRaw = await fetchBytes(m.metadataUri);
    const meta = JSON.parse(metaRaw.toString('utf8'));

    if (DRY) { log(`  [dry] image ${imgBuf.length}B, metadata ${metaRaw.length}B — пропускаю загрузку`); out.push(JSON.stringify(m)); continue; }

    // 2. image → Arweave
    const newImage = await toArweave(imgBuf, 'image/svg+xml');
    log(`  image → ${newImage}`);
    // 3. metadata.image = новый URL, metadata → Arweave
    meta.image = newImage;
    const newMeta = await toArweave(Buffer.from(JSON.stringify(meta)), 'application/json');
    log(`  metadata → ${newMeta}`);
    // 4. on-chain update (devnet): uri → новый arweave metadata, name сохраняем
    const asset = await fetchAsset(umi, publicKey(m.asset));
    await update(umi, { asset, name: asset.name, uri: newMeta }).sendAndConfirm(umi);
    log(`  ⛓ asset uri обновлён on-chain`);
    // 5. переписать строку лога
    out.push(JSON.stringify({ ...m, imageUri: newImage, metadataUri: newMeta }));
    migrated++;
    log(`  ✓ готово (${migrated})`);
  } catch (e) {
    log(`  ✗ ошибка ${tag}: ${e.message}`);
    out.push(JSON.stringify(m)); // не портим лог — оставляем старую строку, повтор безопасен
    failed++;
  }
}

if (!DRY) writeFileSync(logPath, out.join('\n') + '\n');
console.log(`migrate: перенесено ${migrated}, пропущено ${skipped}, ошибок ${failed}${DRY ? ' (dry-run)' : ''}`);
