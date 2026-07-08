# Moment Mints — submission draft

_Track: Consumer & Fan Experiences · TxODDS × Solana World Cup Hackathon_

Черновик для вставки в форму Superteam Earn. Оператору: вычитать, при желании
сократить. Ссылки проверены рабочими на 08.07.

---

## One-liner

**Collectible cards that mint themselves the instant a World Cup moment is
cryptographically proven on-chain. No moment, no card — there is no mint button,
only the feed.**

## Links

- **Live gallery:** https://danyssg.github.io/moment-mints/
- **Code:** https://github.com/danySSG/moment-mints
- **Demo video:** _(вставить ссылку после монтажа со звуком)_
- **Network:** Solana devnet · data from TxLINE World Cup Free Tier (SL1)

## The idea

Most sports-data + crypto projects bolt a blockchain onto a dashboard. We inverted
it: the card *cannot exist* without a verified event. A goal happens → the TxODDS
oracle anchors the match stats on Solana → our listener detects the change, mints a
generative art card, and proves it on-chain — automatically, while the match is
still being played. The card's rarity is set by the moment: an ordinary goal, a red
card, a VAR reversal, a final-minute winner.

This makes TxODDS's flagship promise — *cryptographically verifiable sports data* —
into something a fan can hold and collect, not just read on a chart.

## How it uses TxLINE (depth of feed usage)

- **Primary input is the live TxLINE SSE feed** (`/api/scores/stream`). Activation is
  the full on-chain path: guest JWT → on-chain `subscribe(SL1, 4w)` in the TxLINE
  program → signed activation → API token.
- **There is no discrete "event" feed** — so we built one. TxLINE soccer data is
  per-period stat counters; we diff whole-match totals between SSE updates to derive
  GOAL / RED_CARD / VAR-reversal / phase-change events. Because counters are exactly
  what the oracle anchors, every derived event is *provable*.
- **We stress-tested the feed's edges:** stream gaps (0→2 = two goals), stale
  sequences, partial updates, mid-match reconnect, and VAR rollbacks
  (counter goes down → `GOAL_REVOKED`). Honest finding: the feed's `Action` label
  occasionally lies (a VAR goal-reversal arrived tagged `corner`) — so we treat the
  **stat-diff as the source of truth** and `Action` as flavor only.

## On-chain verification (the flagship narrative)

Every card carries `fixture / seq / statKey` — the exact address of a Merkle leaf in
TxLINE's daily on-chain roots. The gallery's **"proof tx"** link on each card runs
`validate_stat` in the TxLINE Solana program against that day's root: the chain
itself confirms the stat behind the card. Cards are Metaplex Core NFTs; image +
metadata live on Arweave. We keep update authority, so a card's lifecycle
(mint → proof → art) is itself a visible on-chain story.

_(Gotcha we hit and documented: `validate_stat` wants the batch `minTimestamp`, not
the event timestamp — otherwise error 6010 TimestampMismatch.)_

## What actually ran (demonstrability)

Fully autonomous, unattended, on real World Cup Round-of-16 matches:

- **24 moments minted, all proven on-chain**, across 6 matches.
- Captured **live, during the match**: Argentina 3–2 Egypt — a comeback thriller
  **including a VAR-disallowed goal minted in real time** as a "drama"-tier card.
  While the match played, the site auto-published each new card to GitHub Pages and
  the page refreshed itself — no human in the loop.
- The overnight stack independently caught USA 1–4 Belgium and Portugal 0–1 Spain.

## Art: rarity you can see across the room

Three "print-era" tiers, generated per team (WAI-illustrious-SDXL, human-curated),
composited deterministically at mint time (no latency risk):

- **base** — '90s cel anime (goals)
- **drama** — spot-color manga ink (red cards, VAR reversals)
- **legendary** — ukiyo-e gold leaf (finals, hat-tricks)

No real player likenesses; teams are expressed through kit colors only.

## Sustainability / what's next

Runs on devnet for the hackathon; production is a small always-on VPS + mainnet
real-time tier (SL12). Natural extensions: fan wallets claim moments of their team,
a season-long collection, secondary market — all resting on the same
"every card is a proof" guarantee.

---

### Заметки оператору (удалить перед отправкой)

- Вставить ссылку на видео после монтажа.
- Кошелёк для выплаты в профиле Earn — свой mainnet, НЕ devnet-тестовый.
- Если форма просит короткое описание (≤280 симв): взять one-liner.
