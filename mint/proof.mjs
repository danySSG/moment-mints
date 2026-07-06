#!/usr/bin/env node
// Proof-цикл: событие → Merkle-пруф из /api/scores/stat-validation →
// on-chain validate_stat в программе TxLINE (devnet).
//   node proof.mjs <fixtureId> <seq> <statKey> [--anchor]
// Без флага: .view() — мгновенная проверка (true/false), газа не тратит.
// С --anchor: плюс .rpc() — постоянная транзакция, её сигнатура = proof-линк
// для карточки/галереи. Результат пишется в proof-log.ndjson.

import { readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import anchorPkg from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, ComputeBudgetProgram } from '@solana/web3.js';

const { AnchorProvider, Program, Wallet, BN } = anchorPkg;
const DIR = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(DIR, '..', 'day1', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const API = process.env.TXLINE_API_ORIGIN ?? 'https://txline-dev.txodds.com';
const RPC = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';

const [fixtureId, seq, statKey] = process.argv.slice(2);
const doAnchor = process.argv.includes('--anchor');
if (!fixtureId || !seq || !statKey) {
  console.error('usage: node proof.mjs <fixtureId> <seq> <statKey> [--anchor]');
  process.exit(2);
}

// 1. Merkle-пруф от фида
const res = await fetch(
  `${API}/api/scores/stat-validation?fixtureId=${fixtureId}&seq=${seq}&statKey=${statKey}`,
  { headers: { Authorization: `Bearer ${process.env.TXLINE_JWT}`, 'X-Api-Token': process.env.TXLINE_API_TOKEN } });
if (!res.ok) throw new Error(`stat-validation HTTP ${res.status}: ${await res.text()}`);
const p = await res.json();
console.error(`[proof] пруф получен: stat key=${p.statToProve.key} value=${p.statToProve.value} period=${p.statToProve.period}`);

// 2. Программа
const keypair = Keypair.fromSecretKey(Uint8Array.from(
  JSON.parse(readFileSync(join(DIR, '..', 'day1', 'wallet-devnet.json'), 'utf8'))));
const idl = JSON.parse(readFileSync(join(DIR, '..', 'day1', 'idl-devnet.json'), 'utf8'));
const provider = new AnchorProvider(new Connection(RPC, 'confirmed'), new Wallet(keypair), {});
const program = new Program(idl, provider);

// 3. PDA дневных корней: ["daily_scores_roots", epochDay LE u16] (док onchain-validation)
// ts-аргумент = minTimestamp БАТЧА (не события!) — иначе программа даёт 6010
// TimestampMismatch (проверено 06.07: событие в середине 5-минутки не проходит).
const tsArg = p.summary.updateStats.minTimestamp ?? p.ts;
const epochDay = Math.floor(tsArg / 1000 / 86400);
const [dailyRootsPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('daily_scores_roots'), new BN(epochDay).toArrayLike(Buffer, 'le', 2)],
  program.programId);

// 4. Маппинг ответа API → аргументы инструкции (имена IDL в camelCase)
const node = (n) => ({ hash: n.hash, isRightSibling: n.isRightSibling });
const args = [
  new BN(tsArg),
  { // ScoresBatchSummary
    fixtureId: new BN(p.summary.fixtureId),
    updateStats: {
      updateCount: p.summary.updateStats.updateCount,
      minTimestamp: new BN(p.summary.updateStats.minTimestamp),
      maxTimestamp: new BN(p.summary.updateStats.maxTimestamp),
    },
    eventsSubTreeRoot: p.summary.eventStatsSubTreeRoot,
  },
  p.subTreeProof.map(node),   // fixture_proof
  p.mainTreeProof.map(node),  // main_tree_proof
  { threshold: p.statToProve.value, comparison: { equalTo: {} } }, // predicate
  { // stat_a
    statToProve: { key: p.statToProve.key, value: p.statToProve.value, period: p.statToProve.period },
    eventStatRoot: p.eventStatRoot,
    statProof: p.statProof.map(node),
  },
  null, // stat_b
  null, // op
];

const budget = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
const call = () => program.methods.validateStat(...args)
  .accounts({ dailyScoresMerkleRoots: dailyRootsPda })
  .preInstructions([budget]);

// 5. Проверка
const ok = await call().view();
console.error(`[proof] validate_stat.view() → ${ok}`);
if (!ok) { console.log(JSON.stringify({ ok: false })); process.exit(1); }

let txSig = null;
if (doAnchor) {
  txSig = await call().rpc();
  console.error(`[proof] on-chain tx: ${txSig}`);
}
const out = {
  ok: true, fixtureId, seq: Number(seq), statKey: Number(statKey),
  value: p.statToProve.value, epochDay, txSig,
  explorer: txSig ? `https://explorer.solana.com/tx/${txSig}?cluster=devnet` : null,
};
appendFileSync(join(DIR, 'proof-log.ndjson'), JSON.stringify({ ...out, at: new Date().toISOString() }) + '\n');
console.log(JSON.stringify(out, null, 2));
