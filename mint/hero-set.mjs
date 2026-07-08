#!/usr/bin/env node
// Hero-set (Strand 2): ~5 сильнейших моментов, перечеканенных на Solana MAINNET
// с НАСТОЯЩИМ Arweave-хранилищем (ArDrive Turbo, оплата SOL) и mainnet-пруфами
// validate_stat против боевого оракула. Отдельный журнал mint-log-mainnet.ndjson —
// НИКОГДА не ссылается на devnet-ветку (фан-луп). Снимает: devnet-скидку,
// «Arweave»-обман (Irys≠Arweave с 2025), риск 404 при судействе.
//   node hero-set.mjs [--limit N]
// Требует: day1/.env.mainnet (активация SL1/SL12), day1/wallet-mainnet.json (пополнен).

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import bs58 from 'bs58';
import { TurboFactory } from '@ardrive/turbo-sdk';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, generateSigner, publicKey } from '@metaplex-foundation/umi';
import { create, addPlugin, fetchAsset } from '@metaplex-foundation/mpl-core';
import anchorPkg from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, ComputeBudgetProgram } from '@solana/web3.js';
import { momentCardArt } from './card-svg.mjs';

const { AnchorProvider, Program, Wallet, BN } = anchorPkg;
const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const RPC = 'https://api.mainnet-beta.solana.com';
const API = 'https://txline.txodds.com';
const PROGRAM = '9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA';
const log = (...a) => console.error('[hero]', ...a);

// креды mainnet-фида
for (const line of readFileSync(join(ROOT, 'day1', '.env.mainnet'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2];
}
const H = { Authorization: `Bearer ${process.env.TXLINE_JWT}`, 'X-Api-Token': process.env.TXLINE_API_TOKEN };

// герои (fixtureId:seq:type)
const HERO = [
  { fixtureId: '18202701', seq: 653, type: 'GOAL_REVOKED' },              // Argentina VAR-отмена (трофей)
  { fixtureId: '18202701', seq: 965, type: 'GOAL', legendary: true },     // Argentina 3-2 победный (легендарный)
  { fixtureId: '18192996', seq: 567, type: 'RED_CARD' },                  // Mexico-England красная
  { fixtureId: '18187298', seq: 86,  type: 'GOAL_REVOKED' },              // Brazil-Norway VAR
  { fixtureId: '18193785', seq: 127, type: 'GOAL' },                      // USA-Belgium live-гол
];
const limIdx = process.argv.indexOf('--limit');
const heroes = limIdx !== -1 ? HERO.slice(0, Number(process.argv[limIdx + 1])) : HERO;

// mint-log (devnet) как источник event+ctx — читаем, но НЕ пишем в него
const devLog = readFileSync(join(DIR, 'mint-log.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
const findMoment = (h) => devLog.find(r => String(r.event.fixtureId) === h.fixtureId && r.event.seq === h.seq && r.event.type === h.type);

// кошелёк / клиенты
const secret = Uint8Array.from(JSON.parse(readFileSync(join(ROOT, 'day1', 'wallet-mainnet.json'), 'utf8')));
const kp = Keypair.fromSecretKey(secret);
const turbo = TurboFactory.authenticated({ privateKey: bs58.encode(secret), token: 'solana' });
const umi = createUmi(RPC);
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));
const idl = JSON.parse(readFileSync(join(ROOT, 'day1', 'idl-devnet.json'), 'utf8'));
idl.address = PROGRAM; // тот же код программы, mainnet-адрес
const program = new Program(idl, new AnchorProvider(new Connection(RPC, 'confirmed'), new Wallet(kp), {}));

// залить буфер на настоящий Arweave через Turbo → https://arweave.net/<id>
async function toArweave(buf, contentType) {
  const res = await turbo.uploadFile({
    fileStreamFactory: () => Readable.from(buf),
    fileSizeFactory: () => buf.length,
    dataItemOpts: { tags: [{ name: 'Content-Type', value: contentType }] },
  });
  return `https://arweave.net/${res.id}`;
}

// mainnet validate_stat → постоянная proof-транзакция (.rpc)
async function anchorProof(fixtureId, seq, statKey) {
  const r = await fetch(`${API}/api/scores/stat-validation?fixtureId=${fixtureId}&seq=${seq}&statKey=${statKey}`, { headers: H });
  if (!r.ok) throw new Error(`stat-validation HTTP ${r.status}`);
  const p = await r.json();
  const tsArg = p.summary.updateStats.minTimestamp ?? p.ts;
  const epochDay = Math.floor(tsArg / 1000 / 86400);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('daily_scores_roots'), new BN(epochDay).toArrayLike(Buffer, 'le', 2)], program.programId);
  const node = (n) => ({ hash: n.hash, isRightSibling: n.isRightSibling });
  const args = [ new BN(tsArg),
    { fixtureId: new BN(p.summary.fixtureId), updateStats: { updateCount: p.summary.updateStats.updateCount, minTimestamp: new BN(p.summary.updateStats.minTimestamp), maxTimestamp: new BN(p.summary.updateStats.maxTimestamp) }, eventsSubTreeRoot: p.summary.eventStatsSubTreeRoot },
    p.subTreeProof.map(node), p.mainTreeProof.map(node),
    { threshold: p.statToProve.value, comparison: { equalTo: {} } },
    { statToProve: { key: p.statToProve.key, value: p.statToProve.value, period: p.statToProve.period }, eventStatRoot: p.eventStatRoot, statProof: p.statProof.map(node) },
    null, null ];
  const budget = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
  const call = () => program.methods.validateStat(...args).accounts({ dailyScoresMerkleRoots: pda }).preInstructions([budget]);
  const ok = await call().view();
  if (!ok) throw new Error('validate_stat.view()=false');
  const txSig = await call().rpc();
  return { txSig, value: p.statToProve.value, epochDay };
}

const outPath = join(DIR, 'mint-log-mainnet.ndjson');
// дедуп: не переминчивать уже сделанные (fixtureId:seq:type)
const alreadyDone = new Set();
try {
  for (const l of readFileSync(outPath, 'utf8').split('\n').filter(x => x.trim())) {
    const r = JSON.parse(l); alreadyDone.add(`${r.event.fixtureId}:${r.event.seq}:${r.event.type}`);
  }
} catch { /* журнала ещё нет */ }
let done = 0;
for (const h of heroes) {
  if (alreadyDone.has(`${h.fixtureId}:${h.seq}:${h.type}`)) { log(`· уже на mainnet: ${h.fixtureId}:${h.seq}:${h.type}`); continue; }
  const m = findMoment(h);
  if (!m) { log(`✗ не найден в mint-log: ${h.fixtureId}:${h.seq}:${h.type}`); continue; }
  const e = { ...m.event, legendary: h.legendary || undefined };
  const ctx = m.ctx;
  const team = e.participant === 1 ? ctx.participant1 : ctx.participant2;
  const tierNote = h.legendary ? ' [legendary]' : '';
  log(`↻ ${h.type} ${ctx.participant1} vs ${ctx.participant2} ${ctx.score}${tierNote} → mainnet…`);

  // 1. арт → настоящий Arweave
  const svg = momentCardArt(e, ctx);
  const imageUri = await toArweave(Buffer.from(svg), 'image/svg+xml');
  log(`  art → ${imageUri}`);

  // 2. пруф на mainnet (нужен для метадаты и бинда)
  const pf = await anchorProof(e.fixtureId, e.seq, e.statKey);
  const proofExplorer = `https://explorer.solana.com/tx/${pf.txSig}`;
  log(`  proof tx → ${pf.txSig.slice(0, 24)}…`);

  // 3. метадата → настоящий Arweave
  const name = `${e.type}${team ? ` · ${team}` : ''} · seq ${e.seq}`.slice(0, 32);
  const metaJson = JSON.stringify({
    name, symbol: 'MOMENT',
    description: `Verified ${e.type} moment — ${ctx.participant1} vs ${ctx.participant2} (${ctx.score}). ` +
      'Minted on Solana mainnet, stored permanently on Arweave, its stat proven on-chain by the TxLINE oracle.',
    image: imageUri,
    attributes: [
      { trait_type: 'event', value: e.type },
      { trait_type: 'match', value: `${ctx.participant1} vs ${ctx.participant2}` },
      { trait_type: 'score', value: String(ctx.score ?? '') },
      { trait_type: 'tier', value: h.legendary ? 'legendary' : (['GOAL_REVOKED', 'RED_CARD'].includes(e.type) ? 'drama' : 'base') },
      { trait_type: 'proof_tx', value: pf.txSig },
      { trait_type: 'verify', value: proofExplorer },
      { trait_type: 'network', value: 'solana-mainnet' },
    ],
  });
  const metadataUri = await toArweave(Buffer.from(metaJson), 'application/json');

  // 4. минт Core на mainnet
  const asset = generateSigner(umi);
  await create(umi, { asset, name, uri: metadataUri }).sendAndConfirm(umi);
  const assetPk = asset.publicKey.toString();
  log(`  minted → ${assetPk}`);

  // 5. вписать mainnet-пруф в on-chain Attributes
  const attributeList = [
    { key: 'proof_tx', value: pf.txSig },
    { key: 'proof_explorer', value: proofExplorer },
    { key: 'txline_program', value: PROGRAM },
    { key: 'validate_ix', value: 'validate_stat' },
    { key: 'fixture_id', value: String(e.fixtureId) },
    { key: 'seq', value: String(e.seq) },
    { key: 'stat_key', value: String(e.statKey ?? '') },
    { key: 'network', value: 'solana-mainnet' },
  ];
  await addPlugin(umi, { asset: asset.publicKey, plugin: { type: 'Attributes', attributeList } }).sendAndConfirm(umi);
  log(`  ⛓ proof bound on-chain`);

  appendFileSync(outPath, JSON.stringify({
    asset: assetPk, imageUri, metadataUri,
    explorer: `https://explorer.solana.com/address/${assetPk}`,
    proofTx: pf.txSig, proofExplorer,
    event: e, ctx, tier: h.legendary ? 'legendary' : undefined,
    network: 'solana-mainnet', at: new Date().toISOString(),
  }) + '\n');
  done++;
  log(`  ✓ готово (${done}/${heroes.length})`);
}
console.log(`hero-set: ${done} карточек на mainnet → ${outPath}`);
