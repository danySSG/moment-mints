# Moment Mints ⚽️⛓️

**Collectible cards born on-chain from cryptographically verified World Cup moments.**

A goal happens. The TxODDS oracle anchors the match stats on Solana. A card mints
itself — with a proof link anyone can verify. **No moment, no card:** there is no
mint button, only the feed.

Built for the [TxODDS × Solana World Cup Hackathon](https://superteam.fun/earn/hackathon/world-cup/)
— Consumer & Fan Experiences track.

🖼 **Live gallery:** https://danyssg.github.io/moment-mints/

## Why it's interesting

- **Every card is a proof.** Card attributes carry `fixture / seq / statKey` — the
  exact address of a Merkle leaf in TxLINE's daily on-chain roots. The gallery's
  "proof tx" link is a real `validate_stat` call in the TxLINE Solana program.
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
                    mint/       Metaplex Core mint + Irys storage (devnet)
                    │           minter.mjs — live auto-mint daemon
                    │           proof.mjs  — Merkle proof → validate_stat on-chain
                    ▼
                    gallery/    static build → docs/ (GitHub Pages)
                    art/        Civitai batch generation + three-tier style system
```

- `core/` — SSE reader, payload normalizer, match-event detector. Node ≥18, zero
  dependencies. Handles stale seqs, stream gaps (0→2 = two GOALs), VAR rollbacks,
  mid-match connects, partial updates.
- `mint/mint-moment.mjs` — event JSON → card SVG → Irys upload → Metaplex Core
  asset with proof coordinates in attributes.
- `mint/proof.mjs` — pulls the Merkle path from `/api/scores/stat-validation`,
  verifies via `validate_stat` (`.view()`), then writes a permanent proof tx
  (`.rpc()`). Gotcha we found: the program wants the *batch* `minTimestamp`, not
  the event timestamp (error 6010 otherwise).
- `day1/activate.mjs` — full TxLINE World Cup Free Tier activation: devnet wallet
  → guest JWT → on-chain `subscribe` → signed activation → API token.

## Status

- [x] Feed activated (devnet, SL1), detector battle-tested on 3 real matches
      (incl. a real VAR goal reversal in Brazil–Norway)
- [x] 12 moments minted, 12/12 proven on-chain
- [x] Art system designed (three tiers, casting + A/B done)
- [ ] Generative card fronts (land with the quarter-finals)
- [ ] Live-mint demo video (next live match)

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

*Hackathon build, July 2026. Devnet. Not affiliated with FIFA; team identities
are expressed through kit colors only; no real player likenesses.*
