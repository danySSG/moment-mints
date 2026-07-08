# Moment Mints ⚽️⛓️

**Collectible cards born on-chain from cryptographically verified World Cup moments.**

A goal happens. The TxODDS oracle anchors the match stats on Solana. A card mints
itself — with a proof link anyone can verify. **No moment, no card:** there is no
mint button, only the feed.

Built for the [TxODDS × Solana World Cup Hackathon](https://superteam.fun/earn/hackathon/world-cup/)
— Consumer & Fan Experiences track.

🖼 **Live gallery:** https://danyssg.github.io/moment-mints/

## Why it's interesting

- **Every card is backed by a real proof.** Each card records `fixture / seq /
  statKey` — the exact address of a Merkle leaf in TxLINE's daily on-chain roots —
  and links to a real `validate_stat` transaction in the TxLINE Solana program that
  verifies the anchored stat behind it. That proof-tx signature is bound directly
  into every card's **on-chain Metaplex Core attributes** (25/25), so the binding
  lives on Solana, not in our database.
- **The detector is the source of truth.** TxLINE has no discrete event feed — we
  diff whole-match stat counters between SSE updates (goals, cards), which makes
  every detected event *provable* (counters are what's anchored on-chain). The
  feed's `Action` labels are used as flavor only — we caught them lying (a VAR
  goal reversal arrived tagged as `corner`).
- **VAR-proof.** Counter rollbacks emit `GOAL_REVOKED` — the disallowed goal and
  its cancellation are both minted, both provable. The blockchain remembers what
  the referee took away.
- **Rarity you can see across the room.** Three "print era" art tiers:
  '90s cel anime (base) → spot-color manga ink (VAR/reds) → ukiyo-e gold leaf
  (legendary). Generated per-team via WAI-illustrious-SDXL, curated by a human.

## Architecture

```
TxLINE SSE feed ──► core/       stat-diff event detector (zero deps, 12 tests)
                    │           GOAL / GOAL_REVOKED / RED_CARD / phases
                    ▼
                    mint/       Metaplex Core mint + permanent Arweave storage
                    │           minter.mjs — live auto-mint daemon
                    │           proof.mjs  — Merkle proof → validate_stat on-chain
                    ▼
                    gallery/    static build → docs/ (GitHub Pages)
                    art/        Civitai batch generation + three-tier style system
```

- `core/` — SSE reader, payload normalizer, match-event detector. Node ≥18, zero
  dependencies. Handles stale seqs, stream gaps (0→2 = two GOALs), VAR rollbacks,
  mid-match connects, partial updates.
- `mint/mint-moment.mjs` — event JSON → card SVG → upload → Metaplex Core
  asset with proof coordinates in attributes. `mint/migrate-devnet-arweave.mjs`
  then moves every card's art + metadata to permanent Arweave (ArDrive Turbo).
- `mint/proof.mjs` — pulls the Merkle path from `/api/scores/stat-validation`,
  verifies via `validate_stat` (`.view()`), then writes a permanent proof tx
  (`.rpc()`). Gotcha we found: the program wants the *batch* `minTimestamp`, not
  the event timestamp (error 6010 otherwise).
- `day1/activate.mjs` — full TxLINE World Cup Free Tier activation: devnet wallet
  → guest JWT → on-chain `subscribe` → signed activation → API token.

## Status

- [x] Feed activated (devnet, SL1), detector battle-tested on 6 real Round-of-16
      matches (incl. a real VAR goal reversal minted live in Argentina–Egypt)
- [x] 25 moments minted, 25/25 proven on-chain — 12 of them minted **genuinely
      live** during the match (3 matches), the rest reconstructed from the recorded
      feed and proven through the same `validate_stat` path
- [x] Three-tier generative art shipped (WAI-illustrious-SDXL, human-curated),
      composited on the cards
- [x] Real proof-tx signature bound into each card's on-chain Core attributes (25/25)
- [x] All card art + metadata migrated to permanent Arweave (off ephemeral devnet Irys);
      5-card hero set productionized on Solana mainnet
- [x] Live vs replayed clearly tagged on every card (12 live / 13 replayed)
- [x] Fan claim loop **live** — Cloudflare Worker (server-side Turnstile → Crossmint
      mint-and-deliver to an email custodial wallet, compressed editions) deployed at
      `https://moment-claim.danyfomin003.workers.dev` (`claim-worker/`); the live gallery does
      the real claim on devnet — 2 compressed NFTs already minted to an email custodial wallet,
      finalized on the devnet Solana explorer.
- [ ] Demo video

## Run it

```bash
# day 1: activate TxLINE free tier (creates day1/.env)
cd day1 && npm i && node activate.mjs

# replay a real match through the detector
node core/replay.mjs day1/brazil-norway.ndjson

# live auto-mint daemon (during a match)
cd mint && npm i && node minter.mjs

# verify any moment on-chain
node mint/proof.mjs <fixtureId> <seq> <statKey> --anchor

# rebuild the gallery
cd gallery && node build-data.mjs && node build.mjs
```

Secrets (`day1/.env`, wallet) are git-ignored; you'll need your own TxLINE
activation and a devnet wallet.

---

*Hackathon build, July 2026. 25-card collection on Solana devnet + a 5-card hero set on
Solana mainnet; all art permanently on Arweave. Not affiliated with FIFA; team identities
are expressed through kit colors only; no real player likenesses.*
