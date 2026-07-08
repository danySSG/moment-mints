#!/usr/bin/env node
// Прямой тест Crossmint mint+deliver (без воркера/Turnstile): доказываем, что ключ
// реально чеканит compressed-NFT и доставляет его на почту в кастодиальный кошелёк.
//   node test-mint.mjs [email] [team]
// Читает CROSSMINT_KEY из .dev.vars. Staging = Solana devnet (бесплатно).

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import POOL from './src/pool.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(DIR, '.dev.vars'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (m) env[m[1]] = m[2];
}
const KEY = env.CROSSMINT_KEY;
const BASE = 'https://staging.crossmint.com';
const COLLECTION = env.CROSSMINT_COLLECTION_ID || 'default-solana';

const email = process.argv[2] || 'danyfomin003@gmail.com';
const team = process.argv[3] || 'Argentina';

// выбрать иконичный момент для команды: VAR-драма > drama > первый гол
const forTeam = POOL.filter(p => p.teams.some(t => t.toLowerCase() === team.toLowerCase()));
const pick = forTeam.find(p => p.label.includes('VAR')) || forTeam.find(p => p.tier === 'drama') || forTeam[0] || POOL[0];
if (!pick) { console.error('нет момента'); process.exit(1); }

const enc = new TextEncoder();
const byteClip = (s, max) => { let out = '', n = 0; for (const ch of s) { const b = enc.encode(ch).length; if (n + b > max) break; out += ch; n += b; } return out; };
const edition = 1;
const cleanLabel = pick.label.replace(/·/g, '-');
const name = byteClip(`${team} ${cleanLabel}`, 32);          // Crossmint caps name at 32 UTF-8 BYTES
const description = byteClip(`Edition #${edition} - verified WC moment`, 64);
const body = {
  recipient: `email:${email}:solana`,
  metadata: {
    name, image: pick.image, description, symbol: 'MOMENT',
    attributes: [
      { trait_type: 'Moment', value: pick.label },
      { trait_type: 'Match', value: pick.match },
      { trait_type: 'Score', value: String(pick.score || '') },
      { trait_type: 'Edition', value: `#${edition} of ${pick.supply}` },
      { trait_type: 'Verified moment', value: pick.proofExplorer || pick.assetExplorer || '' },
    ],
  },
  compressed: true,
  reuploadLinkedFiles: false,
};

console.log(`→ mint "${name}" (${pick.match} ${pick.score})`);
console.log(`  image: ${pick.image}`);
console.log(`  recipient: email:${email}:solana  (compressed, staging/devnet)`);

const res = await fetch(`${BASE}/api/2022-06-09/collections/${COLLECTION}/nfts`, {
  method: 'POST',
  headers: { 'X-API-KEY': KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const mint = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`✗ mint HTTP ${res.status}:`, JSON.stringify(mint)); process.exit(1); }
console.log(`✓ accepted: id=${mint.id} actionId=${mint.actionId || '-'} status=${mint.onChain?.status || '-'}`);

// поллинг on-chain mint-адреса
const id = mint.id;
let mintHash = null, owner = null, status = mint.onChain?.status;
const deadline = Date.now() + 60000;
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 3000));
  const r = await fetch(`${BASE}/api/2022-06-09/collections/${COLLECTION}/nfts/${id}`, { headers: { 'X-API-KEY': KEY } });
  const d = await r.json().catch(() => ({}));
  status = d.onChain?.status || status;
  process.stdout.write(`  … status=${status}\n`);
  if (d.onChain?.mintHash) { mintHash = d.onChain.mintHash; owner = d.onChain.owner || d.owner || null; break; }
  if (status === 'failed') { console.error('✗ mint failed:', JSON.stringify(d)); process.exit(1); }
}

console.log('\n=== RESULT ===');
console.log('crossmint id :', id);
console.log('status       :', status);
console.log('mint address :', mintHash || '(still pending — check email / poll later)');
if (mintHash) {
  console.log('owner wallet :', owner || '(custodial, tied to ' + email + ')');
  console.log('explorer     :', `https://explorer.solana.com/address/${mintHash}?cluster=devnet`);
}
console.log('delivered to :', email, '(check inbox for Crossmint sign-in)');
