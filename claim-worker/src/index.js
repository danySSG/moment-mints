// Moment Mints — claim Worker (Cloudflare, ES module syntax).
// POST /api/claim  { email, team, momentId?, turnstileToken }
//   1. verify Turnstile server-side (secret never leaves the Worker)
//   2. pick a verified moment for the fan's team, allocate an edition number (KV counter)
//   3. mint a REAL compressed NFT and deliver it to email:<addr>:solana via Crossmint
//      -> Crossmint auto-creates a custodial wallet for that email and drops the NFT in it
//   4. poll Crossmint for the on-chain mint address, return it
// GET /api/status?id=<crossmintId>  -> poll mint status (for the client if step 4 was still pending)
// GET /api/health                    -> quick sanity check (no secrets touched)
//
// Secrets (wrangler secret put):   CROSSMINT_KEY, TURNSTILE_SECRET
// Vars (wrangler.toml [vars]):     CROSSMINT_BASE, CROSSMINT_COLLECTION_ID, SOLANA_CLUSTER, ALLOWED_ORIGIN
// KV binding:                      EDITIONS  (atomic-ish per-moment edition counters)

import POOL from './pool.js';

const DEFAULTS = {
  CROSSMINT_BASE: 'https://staging.crossmint.com',     // staging = Solana devnet; www.crossmint.com = mainnet
  CROSSMINT_COLLECTION_ID: 'default-solana',
  SOLANA_CLUSTER: 'devnet',                             // 'devnet' | 'mainnet'
  ALLOWED_ORIGIN: 'https://danyssg.github.io',
};
const cfg = (env, k) => (env[k] && String(env[k])) || DEFAULTS[k];

// ---------- CORS ----------
function corsHeaders(env, origin) {
  const allowed = cfg(env, 'ALLOWED_ORIGIN');
  return {
    'Access-Control-Allow-Origin': origin === allowed ? allowed : allowed,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function json(env, origin, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env, origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }
    if (url.pathname === '/api/health') {
      return json(env, origin, { ok: true, moments: POOL.length, cluster: cfg(env, 'SOLANA_CLUSTER') });
    }
    if (url.pathname === '/api/status' && request.method === 'GET') {
      return handleStatus(env, origin, url.searchParams.get('id'));
    }
    if (url.pathname === '/api/claim' && request.method === 'POST') {
      return handleClaim(env, origin, request);
    }
    return json(env, origin, { error: 'not_found' }, 404);
  },
};

// ---------- claim ----------
async function handleClaim(env, origin, request) {
  let body;
  try { body = await request.json(); } catch { return json(env, origin, { error: 'invalid_json' }, 400); }
  const email = String(body?.email || '').trim().toLowerCase();
  const team = String(body?.team || '').trim();
  const turnstileToken = body?.turnstileToken;
  if (!email || !/.+@.+\..+/.test(email)) return json(env, origin, { error: 'invalid_email' }, 400);
  if (!turnstileToken) return json(env, origin, { error: 'missing_turnstile' }, 400);

  // 1. Turnstile siteverify (fail closed)
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ver = await verifyTurnstile(env.TURNSTILE_SECRET, turnstileToken, ip);
  if (!ver.success) return json(env, origin, { error: 'turnstile_failed', codes: ver['error-codes'] }, 403);

  // 2. pick a verified moment for this team + allocate an edition number
  const pick = await pickMoment(env, team, body?.momentId);
  if (!pick) return json(env, origin, { error: 'no_moment_for_team', team }, 404);
  const edition = await nextEdition(env, pick.id);
  if (edition > pick.supply) return json(env, origin, { error: 'sold_out' }, 409);

  // 3. mint a real compressed NFT, delivered to the fan's email-linked Solana custodial wallet
  // Crossmint caps name at 32 UTF-8 BYTES / description at 64 — clip by bytes, not JS chars,
  // and avoid multi-byte separators (· is 2 bytes).
  const name = byteClip(`${team} ${String(pick.label).replace(/·/g, '-')}`, 32);
  const description = byteClip(`Edition #${edition} - verified WC moment`, 64);
  const mintBody = {
    recipient: `email:${email}:solana`,
    metadata: {
      name,
      image: pick.image,
      description,
      symbol: 'MOMENT',
      attributes: [
        { trait_type: 'Moment', value: String(pick.label || '') },
        { trait_type: 'Match', value: String(pick.match || '') },
        { trait_type: 'Score', value: String(pick.score || '') },
        { trait_type: 'Edition', value: `#${edition} of ${pick.supply}` },
        { trait_type: 'Tier', value: String(pick.tier || 'base') },
        { trait_type: 'Verified moment', value: String(pick.proofExplorer || pick.assetExplorer || '') },
      ],
    },
    compressed: true,              // real compressed NFT = cheap numbered edition (Solana state compression)
    reuploadLinkedFiles: false,
    sendNotification: true,        // email the fan a sign-in link to their new NFT
  };

  const base = cfg(env, 'CROSSMINT_BASE');
  const collection = cfg(env, 'CROSSMINT_COLLECTION_ID');
  // idempotent PUT: deterministic id so a client retry never double-mints the same edition
  const idemId = `mm-${pick.id}-${edition}`;
  let mintRes, mint;
  try {
    mintRes = await fetch(`${base}/api/2022-06-09/collections/${collection}/nfts/${idemId}`, {
      method: 'PUT',
      headers: { 'X-API-KEY': env.CROSSMINT_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(mintBody),
    });
    mint = await mintRes.json().catch(() => ({}));
  } catch (e) {
    return json(env, origin, { error: 'mint_request_failed', detail: String(e) }, 502);
  }
  if (!mintRes.ok) return json(env, origin, { error: 'mint_failed', status: mintRes.status, detail: mint }, 502);

  // 4. poll for the on-chain mint address (Solana address is NOT in the initial response)
  const cmId = mint.id || idemId;
  const settled = await pollMint(env, collection, cmId, 16000);

  return json(env, origin, {
    ok: true,
    crossmintId: cmId,
    edition,
    supply: pick.supply,
    label: pick.label,
    match: pick.match,
    score: pick.score,
    image: pick.image,
    proofExplorer: pick.proofExplorer,
    mintHash: settled.mintHash,
    owner: settled.owner,
    explorer: settled.mintHash ? explorerAddr(env, settled.mintHash) : null,
    pending: !settled.mintHash,
    email,
  });
}

// ---------- status polling endpoint ----------
async function handleStatus(env, origin, id) {
  if (!id) return json(env, origin, { error: 'missing_id' }, 400);
  const collection = cfg(env, 'CROSSMINT_COLLECTION_ID');
  const s = await pollMint(env, collection, id, 1);   // single check
  return json(env, origin, {
    ok: true, mintHash: s.mintHash, owner: s.owner,
    explorer: s.mintHash ? explorerAddr(env, s.mintHash) : null, pending: !s.mintHash,
  });
}

// ---------- helpers ----------
async function verifyTurnstile(secret, token, ip) {
  const form = new URLSearchParams();
  form.append('secret', secret || '');
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    return await r.json();
  } catch { return { success: false, 'error-codes': ['siteverify-unreachable'] }; }
}

async function pickMoment(env, team, momentId) {
  if (momentId) {
    const m = POOL.find(p => p.id === momentId);
    if (m) return m;
  }
  const t = team.toLowerCase();
  const ms = POOL.filter(p => (p.teams || []).some(x => String(x).toLowerCase() === t));
  if (!ms.length) return null;
  // rotate across the team's moments so repeat claims spread over different cards
  let idx = 0;
  try { idx = (await bumpCounter(env, `teamidx:${t}`)) - 1; } catch {}
  return ms[idx % ms.length];
}

async function nextEdition(env, momentId) {
  return bumpCounter(env, `ed:${momentId}`);
}

// KV read-modify-write counter. Eventually-consistent (fine at demo scale); a Durable
// Object would make this strictly atomic under high concurrency.
async function bumpCounter(env, key) {
  if (!env.EDITIONS) return 1 + Math.floor(Math.random() * 3); // no KV bound (local dev) -> best effort
  const cur = parseInt((await env.EDITIONS.get(key)) || '0', 10) || 0;
  const next = cur + 1;
  await env.EDITIONS.put(key, String(next));
  return next;
}

async function pollMint(env, collection, id, budgetMs) {
  const base = cfg(env, 'CROSSMINT_BASE');
  const deadline = Date.now() + budgetMs;
  do {
    try {
      const r = await fetch(`${base}/api/2022-06-09/collections/${collection}/nfts/${id}`, {
        headers: { 'X-API-KEY': env.CROSSMINT_KEY },
      });
      const d = await r.json().catch(() => ({}));
      const oc = d.onChain || {};
      if (oc.status === 'success' && oc.mintHash) return { mintHash: oc.mintHash, owner: oc.owner || null };
      if (oc.status === 'failed') return { mintHash: null, owner: null };
    } catch { /* transient — keep polling */ }
    if (Date.now() >= deadline) break;
    await new Promise(res => setTimeout(res, 2000));
  } while (Date.now() < deadline);
  return { mintHash: null, owner: null };
}

function explorerAddr(env, addr) {
  const cluster = cfg(env, 'SOLANA_CLUSTER');
  // Compressed NFTs live in a merkle tree — Solana Explorer can't resolve them as an account,
  // so link the fan's edition to a DAS-aware explorer (Solscan). The master card + proof tx
  // (which ARE regular accounts) still use explorer.solana.com elsewhere.
  return cluster === 'mainnet'
    ? `https://solscan.io/token/${addr}`
    : `https://solscan.io/token/${addr}?cluster=${cluster}`;
}

const ENC = new TextEncoder();
function byteClip(s, max) {
  let out = '', n = 0;
  for (const ch of s) { const b = ENC.encode(ch).length; if (n + b > max) break; out += ch; n += b; }
  return out;
}
