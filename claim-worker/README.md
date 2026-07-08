# Moment Mints — claim Worker

Real fan claim: **email → custodial Solana wallet → real NFT**, delivered via Crossmint.
The secret key never touches the browser — it lives only in this Cloudflare Worker.

```
browser (gallery)  ──POST /api/claim──►  Worker  ──► Turnstile siteverify (server-side)
                                                 └──► Crossmint mint+deliver  email:<fan>:solana
                                                        (compressed:true = real numbered edition)
```

## What's real here

- Turnstile is verified **server-side** (real `siteverify`, not the client-only test key).
- Crossmint mints a **real NFT** and delivers it to a **custodial wallet auto-created for the
  fan's email**. The fan owns it, it's visible in Solana explorer, and it's exportable to
  Phantom (Crossmint → account → export private key → import base58 into Phantom).
- `compressed: true` makes each claim a real, cheap **numbered edition** (Solana state
  compression) — this is what makes "editions" true, not invented client-side.
- Edition numbers are allocated by a server-side KV counter, not `Math.random()`.

## Staging vs production (important, honest)

- **Staging key (`sk_staging_…` / legacy `sk_test_…`) → Solana _devnet_.** Real NFT, real
  custodial wallet, real explorer, real Phantom export — but on devnet (free, not a mainnet
  marketplace asset). This is what the two-strand plan uses for the fan loop.
- **Production key (`sk_production_…`) + `CROSSMINT_BASE=https://www.crossmint.com` +
  `SOLANA_CLUSTER=mainnet` → a tradeable mainnet NFT** (Crossmint bills per mint).
- Flip between them by editing the two `[vars]` in `wrangler.toml` and swapping the secret.

## Deploy (≈5 min)

From this `claim-worker/` directory:

```bash
# 0. regenerate the moment pool from the current gallery (after any gallery rebuild)
node gen-pool.mjs

# 1. log in (opens a browser once)
npx wrangler login

# 2. create the KV namespace for edition counters, paste the printed id into wrangler.toml
npx wrangler kv namespace create EDITIONS
#   -> id = "xxxx…"   ->  put it in [[kv_namespaces]].id

# 3. set the two secrets (paste when prompted; nothing is echoed)
npx wrangler secret put CROSSMINT_KEY        # your Crossmint server key (sk_staging_ / sk_test_)
npx wrangler secret put TURNSTILE_SECRET     # your Turnstile widget SECRET key

# 4. deploy
npx wrangler deploy
#   -> prints https://moment-claim.<your-subdomain>.workers.dev
```

Sanity check (no secrets touched):

```bash
curl https://moment-claim.<your-subdomain>.workers.dev/api/health
# {"ok":true,"moments":25,"cluster":"devnet"}
```

## Wire the gallery to it

Rebuild the gallery with the Worker URL + your **real** Turnstile site key baked in:

```bash
cd ../gallery
CLAIM_API="https://moment-claim.<your-subdomain>.workers.dev" \
TS_SITEKEY="0x4AAAAAAA…your-site-key" \
node build.mjs
```

With `CLAIM_API` set the modal does the **real** claim (server-verified Turnstile → real mint).
With it unset the page falls back to a clearly-labelled local prototype.

## Local dev

```bash
cp .dev.vars.example .dev.vars   # fill in real keys (git-ignored)
npx wrangler dev                 # http://localhost:8787/api/health
```

## Free tier

Cloudflare Workers Free: 100k req/day, 2 subrequests per claim (siteverify + Crossmint), no
card required. Turnstile is free. Crossmint bills mints (staging is free).
