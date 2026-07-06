#!/usr/bin/env node
// День-1: активация TxLINE World Cup Free Tier на devnet, от кошелька до apiToken.
//   1) кошелёк day1/wallet-devnet.json (создаётся при отсутствии) + airdrop при нужде
//   2) POST /auth/guest/start → JWT
//   3) on-chain subscribe(service_level_id=1, weeks=4) → txSig
//   4) подпись "<txSig>::<jwt>" (ed25519) → POST /api/token/activate → apiToken
//   5) сохраняет day1/.env и проверяет токен запросом снапшота фикстур
//
// Запуск:  node activate.mjs            (повторный запуск безопасен: шаги идемпотентны,
//          --weeks N                     подписка продлевается, токен перевыпускается)
//
// Источники всех констант: txline.txodds.com/documentation/{quickstart,programs/*}
// и IDL devnet-программы (сохранён рядом: idl-devnet.json). Проверено 2026-07-05.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import nacl from 'tweetnacl';
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
  LAMPORTS_PER_SOL, sendAndConfirmTransaction,
} from '@solana/web3.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const API = process.env.TXLINE_API_ORIGIN ?? 'https://txline-dev.txodds.com';
const RPC = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';

// Devnet-адреса (documentation/programs/addresses, 2026-07-05)
const PROGRAM_ID = new PublicKey('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J');
const TXL_MINT = new PublicKey('4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG');
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');
// sha256("global:subscribe")[0..8] — из IDL (idl-devnet.json)
const SUBSCRIBE_DISC = Buffer.from([254, 28, 191, 138, 156, 179, 183, 53]);

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i === -1 ? dflt : Number(argv[i + 1]);
};
const SERVICE_LEVEL = flag('--service-level', 1); // 1 = WC free tier, 60s delay (devnet ок)
const WEEKS = flag('--weeks', 4);                 // кратно 4; фри-тир продлевается бесплатно

const log = (...a) => console.log('[day1]', ...a);

// ── 1. Кошелёк ────────────────────────────────────────────────────────────────
const walletPath = join(DIR, 'wallet-devnet.json');
let keypair;
if (existsSync(walletPath)) {
  keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, 'utf8'))));
  log('кошелёк загружен:', keypair.publicKey.toBase58());
} else {
  keypair = Keypair.generate();
  writeFileSync(walletPath, JSON.stringify([...keypair.secretKey]), { mode: 0o600 });
  log('кошелёк создан:', keypair.publicKey.toBase58(), `(${walletPath})`);
  log('⚠️  кошелёк ТОЛЬКО для devnet — не заводить на него реальные средства');
}

const conn = new Connection(RPC, 'confirmed');
let balance = await conn.getBalance(keypair.publicKey);
log('баланс:', balance / LAMPORTS_PER_SOL, 'SOL');
if (balance < 0.05 * LAMPORTS_PER_SOL) {
  log('запрашиваю airdrop 2 SOL…');
  try {
    const sig = await conn.requestAirdrop(keypair.publicKey, 2 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, 'confirmed');
    balance = await conn.getBalance(keypair.publicKey);
    log('airdrop ок, баланс:', balance / LAMPORTS_PER_SOL, 'SOL');
  } catch (e) {
    console.error('[day1] airdrop не прошёл (лимиты фосета?):', e.message);
    console.error('[day1] запроси вручную на https://faucet.solana.com для',
      keypair.publicKey.toBase58(), 'и перезапусти скрипт');
    process.exit(1);
  }
}

// ── 2. Guest JWT ─────────────────────────────────────────────────────────────
const startRes = await fetch(`${API}/auth/guest/start`, { method: 'POST' });
if (!startRes.ok) throw new Error(`guest/start HTTP ${startRes.status}: ${await startRes.text()}`);
const startJson = await startRes.json();
const jwt = startJson.token ?? startJson.jwt;
if (!jwt) throw new Error('guest/start: нет token в ответе: ' + JSON.stringify(startJson));
log('guest JWT получен');

// ── 3. On-chain subscribe ────────────────────────────────────────────────────
const [pricingMatrix] = PublicKey.findProgramAddressSync(
  [Buffer.from('pricing_matrix')], PROGRAM_ID);
const [treasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('token_treasury_v2')], PROGRAM_ID);
const ata = (owner) => PublicKey.findProgramAddressSync(
  [owner.toBuffer(), TOKEN_2022.toBuffer(), TXL_MINT.toBuffer()], ATA_PROGRAM)[0];
const userTokenAccount = ata(keypair.publicKey);
const treasuryVault = ata(treasuryPda);

// ATA юзера может не существовать — создаём идемпотентно (instruction=1 у ATA-программы)
const createAtaIx = new TransactionInstruction({
  programId: ATA_PROGRAM,
  data: Buffer.from([1]),
  keys: [
    { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: keypair.publicKey, isSigner: false, isWritable: false },
    { pubkey: TXL_MINT, isSigner: false, isWritable: false },
    { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022, isSigner: false, isWritable: false },
  ],
});

const argsBuf = Buffer.alloc(3);
argsBuf.writeUInt16LE(SERVICE_LEVEL, 0);
argsBuf.writeUInt8(WEEKS, 2);
const subscribeIx = new TransactionInstruction({
  programId: PROGRAM_ID,
  data: Buffer.concat([SUBSCRIBE_DISC, argsBuf]),
  keys: [ // порядок строго по IDL
    { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
    { pubkey: pricingMatrix, isSigner: false, isWritable: false },
    { pubkey: TXL_MINT, isSigner: false, isWritable: false },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: treasuryVault, isSigner: false, isWritable: true },
    { pubkey: treasuryPda, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022, isSigner: false, isWritable: false },
    { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: ATA_PROGRAM, isSigner: false, isWritable: false },
  ],
});

log(`subscribe(service_level=${SERVICE_LEVEL}, weeks=${WEEKS})…`);
let txSig;
try {
  txSig = await sendAndConfirmTransaction(
    conn, new Transaction().add(createAtaIx, subscribeIx), [keypair], { commitment: 'confirmed' });
} catch (e) {
  console.error('[day1] subscribe-транзакция упала:', e.message);
  if (e.logs) console.error(e.logs.join('\n'));
  console.error('[day1] если в логах "insufficient funds" по TxL — вероятно, нужен их');
  console.error('[day1] devnet-фосет (инструкция request_devnet_faucet в IDL) — сообщи агенту');
  process.exit(1);
}
log('subscribe ок, txSig:', txSig);

// ── 4. Активация API-токена ──────────────────────────────────────────────────
// Формат сообщения: "<txSig>:<leagues.join(',')>:<jwt>"; фри-тир → leagues пуст → "::"
const message = `${txSig}::${jwt}`;
const sigBytes = nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey);
const walletSignature = Buffer.from(sigBytes).toString('base64');

const actRes = await fetch(`${API}/api/token/activate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
  body: JSON.stringify({ txSig, walletSignature, leagues: [] }),
});
if (!actRes.ok) throw new Error(`token/activate HTTP ${actRes.status}: ${await actRes.text()}`);
// ответ приходит как text/plain с голым токеном (проверено на devnet 2026-07-05);
// на случай смены формата принимаем и JSON {token}/{apiToken}
const actBody = (await actRes.text()).trim();
let apiToken = actBody;
if (actBody.startsWith('{') || actBody.startsWith('"')) {
  try {
    const j = JSON.parse(actBody);
    apiToken = typeof j === 'string' ? j : j.token ?? j.apiToken ?? null;
  } catch { /* оставляем как есть */ }
}
if (!apiToken) throw new Error('token/activate: нет token в ответе: ' + actBody.slice(0, 200));
log('apiToken получен');

writeFileSync(join(DIR, '.env'),
  `TXLINE_JWT=${jwt}\nTXLINE_API_TOKEN=${apiToken}\n`, { mode: 0o600 });
log('.env сохранён (TXLINE_JWT, TXLINE_API_TOKEN)');

// ── 5. Проверка токена ───────────────────────────────────────────────────────
const headers = { Authorization: `Bearer ${jwt}`, 'X-Api-Token': apiToken };
const fxRes = await fetch(`${API}/api/fixtures/snapshot`, { headers });
log('GET /api/fixtures/snapshot →', fxRes.status);
if (fxRes.ok) {
  const fixtures = await fxRes.json();
  const list = Array.isArray(fixtures) ? fixtures : fixtures.fixtures ?? fixtures.data ?? [];
  log(`фикстур в снапшоте: ${Array.isArray(list) ? list.length : '(не массив, см. сырой ответ)'}`);
  if (Array.isArray(list) && list.length) {
    console.log(JSON.stringify(list[0]).slice(0, 400));
  }
}

console.log(`
[day1] ✅ ГОТОВО. Дальше:
  set -a; source ${join(DIR, '.env')}; set +a
  node ${join(DIR, '..', 'core', 'replay.mjs')} --live ${API}/api/scores/stream
`);
