#!/usr/bin/env node
// Минт «момента» на Solana devnet (Metaplex Core): событие детектора → SVG-карточка →
// метадата на Irys (devnet) → NFT-ассет. Ядро дня-2 концепта A.
//
// Запуск:
//   node mint-moment.mjs '<JSON события>' [--p1 "Argentina"] [--p2 "Cape Verde"]
//                        [--score "1-0"] [--competition "World Cup"]
//   echo '<JSON события>' | node mint-moment.mjs --stdin ...
//
// Кошелёк: ../day1/wallet-devnet.json (тот же, что для подписки TxLINE).
// Результат: JSON-строка в stdout { asset, tx, imageUri, metadataUri, explorer }
// и запись в mint-log.ndjson (журнал заминченного — зачаток галереи).

import { readFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { keypairIdentity, generateSigner, createGenericFile } from '@metaplex-foundation/umi';
import { create } from '@metaplex-foundation/mpl-core';
import { momentCardSvg, momentCardArt } from './card-svg.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const eventJson = argv.includes('--stdin')
  ? readFileSync(0, 'utf8')
  : argv.find(a => a.startsWith('{'));
if (!eventJson) {
  console.error('usage: node mint-moment.mjs \'<event JSON>\' [--p1 X --p2 Y --score 1-0 --competition "World Cup"]');
  process.exit(2);
}
const event = JSON.parse(eventJson);
const ctx = {
  participant1: opt('--p1'), participant2: opt('--p2'),
  score: opt('--score'), competition: opt('--competition'),
};

const umi = createUmi(RPC).use(irysUploader({ address: 'https://devnet.irys.xyz' }));
const secret = Uint8Array.from(JSON.parse(readFileSync(join(DIR, '..', 'day1', 'wallet-devnet.json'), 'utf8')));
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));

const team = event.participant === 1 ? ctx.participant1 : ctx.participant2;
const name = `${event.type}${team ? ` · ${team}` : ''} · seq ${event.seq}`.slice(0, 32);

console.error('[mint] карточка…');
// арт-композиция, если на (событие, команда) отобран арт; иначе заглушка
const svg = momentCardArt(event, ctx) ?? momentCardSvg(event, ctx);
if (process.argv.includes('--preview')) {
  const { writeFileSync: wf } = await import('node:fs');
  wf(join(DIR, 'card-preview.svg'), svg);
  console.error('[mint] --preview: карточка в mint/card-preview.svg, минта не будет');
  process.exit(0);
}
const file = createGenericFile(new TextEncoder().encode(svg), `moment-${event.fixtureId}-${event.seq}.svg`,
  { contentType: 'image/svg+xml' });

console.error('[mint] загрузка image + metadata на Irys devnet…');
// Irys devnet возвращает arweave.net-ссылки, но на настоящий Arweave devnet-данные
// НЕ попадают (там HTML-заглушка) — реально файлы отдаёт только devnet-гейтвей.
const toGateway = (u) => u.replace('https://arweave.net/', 'https://devnet.irys.xyz/');
const [rawImageUri] = await umi.uploader.upload([file]);
const imageUri = toGateway(rawImageUri);
const metadataUri = toGateway(await umi.uploader.uploadJson({
  name,
  symbol: 'MOMENT',
  description: `Verified ${event.type} moment. ` +
    `${ctx.participant1 ?? 'P1'} vs ${ctx.participant2 ?? 'P2'}` +
    `${ctx.score ? ` (${ctx.score})` : ''}. ` +
    'This card exists only because the TxLINE on-chain-anchored feed recorded the event.',
  image: imageUri,
  attributes: [
    { trait_type: 'event', value: event.type },
    { trait_type: 'fixture', value: String(event.fixtureId) },
    { trait_type: 'seq', value: String(event.seq) },
    { trait_type: 'statKey', value: String(event.statKey ?? '') },
    { trait_type: 'transition', value: `${event.from}->${event.to}` },
    { trait_type: 'feed_action', value: String(event.action ?? '') },
    { trait_type: 'feed_ts', value: String(event.ts ?? '') },
    // слот под proof (день 5): fixtureId+seq+statKey адресуют Merkle-лист в
    // /api/scores/stat-validation; сюда ляжет линк на validate_stat-транзакцию
    { trait_type: 'proof', value: `txline:stat-validation:${event.fixtureId}:${event.seq}:${event.statKey ?? ''}` },
  ],
}));

console.error('[mint] create asset (Metaplex Core)…');
const asset = generateSigner(umi);
const { signature } = await create(umi, { asset, name, uri: metadataUri }).sendAndConfirm(umi);
const txSig = Buffer.from(signature).toString('base64'); // web3js-совместимую строку даёт bs58, но для лога хватит

const result = {
  asset: asset.publicKey.toString(),
  imageUri, metadataUri,
  explorer: `https://explorer.solana.com/address/${asset.publicKey}?cluster=devnet`,
  event, // целиком: type/fixtureId/seq/statKey/participant/from/to/action/ts
  ctx,
};
appendFileSync(join(DIR, 'mint-log.ndjson'), JSON.stringify({ ...result, txSig, at: new Date().toISOString() }) + '\n');
console.log(JSON.stringify(result, null, 2));
