#!/usr/bin/env node
// Демонстрация «real verification, not a rubber stamp»: тот же on-chain validate_stat,
// с ПРАВИЛЬНЫМ timestamp → принимает (true); с НЕВЕРНЫМ timestamp → программа
// РЕВЕРТИТ с ошибкой 6010 TimestampMismatch. Оба вызова через .view() (без газа).
//   node demo-6010.mjs [fixtureId] [seq] [statKey]

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import anchorPkg from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, ComputeBudgetProgram } from '@solana/web3.js';

const { AnchorProvider, Program, Wallet, BN } = anchorPkg;
const DIR = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(DIR, '..', 'day1', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2];
}
const API = process.env.TXLINE_API_ORIGIN ?? 'https://txline-dev.txodds.com';
const RPC = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';
const [fixtureId = '18202701', seq = '965', statKey = '1'] = process.argv.slice(2);

const res = await fetch(`${API}/api/scores/stat-validation?fixtureId=${fixtureId}&seq=${seq}&statKey=${statKey}`,
  { headers: { Authorization: `Bearer ${process.env.TXLINE_JWT}`, 'X-Api-Token': process.env.TXLINE_API_TOKEN } });
if (!res.ok) throw new Error(`stat-validation HTTP ${res.status}: ${(await res.text()).slice(0,120)}`);
const p = await res.json();

const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(DIR, '..', 'day1', 'wallet-devnet.json'), 'utf8'))));
const idl = JSON.parse(readFileSync(join(DIR, '..', 'day1', 'idl-devnet.json'), 'utf8'));
const program = new Program(idl, new AnchorProvider(new Connection(RPC, 'confirmed'), new Wallet(keypair), {}));

const correctTs = p.summary.updateStats.minTimestamp;      // правильный: minTimestamp батча
const wrongTs = correctTs + 30000;                          // неверный: +30с (внутри окна, но ≠ minTimestamp)
const epochDay = Math.floor(correctTs / 1000 / 86400);     // PDA берём от правильного дня (изолируем ошибку ts)
const [pda] = PublicKey.findProgramAddressSync(
  [Buffer.from('daily_scores_roots'), new BN(epochDay).toArrayLike(Buffer, 'le', 2)], program.programId);

const node = (n) => ({ hash: n.hash, isRightSibling: n.isRightSibling });
const argsWith = (ts) => [
  new BN(ts),
  { fixtureId: new BN(p.summary.fixtureId), updateStats: {
      updateCount: p.summary.updateStats.updateCount,
      minTimestamp: new BN(p.summary.updateStats.minTimestamp),
      maxTimestamp: new BN(p.summary.updateStats.maxTimestamp) }, eventsSubTreeRoot: p.summary.eventStatsSubTreeRoot },
  p.subTreeProof.map(node), p.mainTreeProof.map(node),
  { threshold: p.statToProve.value, comparison: { equalTo: {} } },
  { statToProve: { key: p.statToProve.key, value: p.statToProve.value, period: p.statToProve.period },
    eventStatRoot: p.eventStatRoot, statProof: p.statProof.map(node) },
  null, null,
];
const budget = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
const call = (ts) => program.methods.validateStat(...argsWith(ts)).accounts({ dailyScoresMerkleRoots: pda }).preInstructions([budget]);

console.log(`moment: fixture ${fixtureId} · seq ${seq} · statKey ${statKey} (${p.statToProve.key}=${p.statToProve.value})`);
console.log(`correct ts (batch minTimestamp): ${correctTs}`);
console.log(`wrong ts   (minTimestamp+30s):   ${wrongTs}\n`);

try {
  const ok = await call(correctTs).view();
  console.log(`✅ CORRECT timestamp  → validate_stat returned: ${ok}   (accepted on-chain)`);
} catch (e) { console.log(`unexpected error on correct ts: ${e.message?.slice(0,140)}`); }

try {
  await call(wrongTs).simulate();
  console.log(`❓ WRONG timestamp     → simulate succeeded (did NOT reject — unexpected)`);
} catch (e) {
  const logs = e.logs || e.simulationResponse?.logs || [];
  const errLine = logs.find(l => /Error Code:|Error Number:|AnchorError/.test(l)) || '';
  const num = e.error?.errorCode?.number ?? (logs.join(' ').match(/Error Number:\s*(\d+)/)?.[1]);
  const code = e.error?.errorCode?.code ?? (logs.join(' ').match(/Error Code:\s*(\w+)/)?.[1]);
  console.log(`✕  WRONG timestamp     → REJECTED on-chain`);
  console.log(`   error: ${code || '?'} (number ${num || '?'})`);
  if (errLine) console.log(`   program log: ${errLine.trim()}`);
}
