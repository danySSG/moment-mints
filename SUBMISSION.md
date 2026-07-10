# Moment Mints — Superteam Earn submission (FINAL copy)

_Track: Consumer & Fan Experiences · TxODDS × Solana World Cup Hackathon · Solana_

> This file is submittable copy, not notes. Paste field-by-field into the Earn form.
> Operator: drop in the video link where marked, confirm every link is public, and
> set your payout wallet to a **mainnet** address (not the devnet test wallet).

---

## 1. Tagline / one-liner

**Primary (form title line):**
> **Moment Mints — collectible cards that mint themselves the instant a World Cup moment is proven on-chain. No moment, no card: there's no mint button, only the feed.**

**≤280-char short description (if the form caps it):**
> Collectible World Cup cards that mint themselves the moment a goal, red card or VAR reversal is cryptographically proven on TxLINE's Solana oracle. No moment, no card — the feed is the only mint button. Fans claim their team's moments with just an email.

**6-word hook (for the X post / gallery header):**
> Provable football moments. No moment, no card.

---

## 2. Project description (full)

Most sports-data-plus-crypto projects bolt a blockchain onto a dashboard. We inverted
it: **the card cannot exist without a verified event.** A goal happens → TxODDS's
TxLINE oracle anchors the match stats on Solana → our detector sees the counter move,
mints a generative-art card, and binds it to a real on-chain proof — autonomously,
**while the match is still being played.** The moment is the mint button. There isn't
another one.

### Depth of feed use — we built the event feed TxLINE doesn't ship
TxLINE soccer data has **no discrete "event" feed**: it's per-period stat counters
streamed over SSE (`/api/scores/stream`). So we built the event layer ourselves by
diffing whole-match counter totals between updates to derive **GOAL / RED_CARD /
VAR-reversal (GOAL_REVOKED) / phase-change** events. This isn't a convenience wrapper —
it's a deliberate design choice, because **counters are exactly what the oracle anchors
on-chain**, so every event we derive is provable by construction. The detector is a
zero-dependency Node core (12/12 tests passing) hardened against the feed's real edges:
baseline suppression, delta>1 fan-out (a `0→2` jump = two goals in one update), stale
sequence numbers, mid-match reconnect, partial payloads, and VAR rollbacks (a counter
going *down* emits `GOAL_REVOKED`). Activation is the full on-chain path, not a REST key:
guest JWT → on-chain `subscribe(SL1)` in the TxLINE program → signed activation → API
token.

### Real on-chain verification — not verification theater
Every card carries its proof coordinates — `fixtureId / seq / statKey` — the exact
address of a Merkle leaf in TxLINE's **daily on-chain roots**. Each card is bound to a
**real `validate_stat` transaction** in the TxLINE Solana program: the gallery's "proof
tx" link opens that transaction in the Solana Explorer, where the chain itself confirms
the anchored stat behind the card. We deliberately say *"the chain confirms the anchored
stat behind this card,"* not *"the chain confirms the goal happened"* — the counter is
what's cryptographically anchored; the specific event is our detector's honest inference
from it. That precision is the point: we're claiming exactly what's provable and nothing
more. The proof does real work — we can show the program **rejecting** a bad request
(error `6010 TimestampMismatch`) live, which is our best evidence this is verification,
not a rubber stamp.

The **master** card for each moment is a **Metaplex Core** 1/1 — a scarce, premium,
independently-verifiable asset that carries the proof. Fan **claim editions** are
**compressed** NFTs (Solana state compression), cheap enough to give every fan a numbered
copy while the master stays 1/1. We retain update authority on the masters, so a card's
lifecycle — mint → proof-bind → art-resolve — is itself a visible on-chain story.

### The fan product — a moment you can own, not just look at
The collectible only matters if a fan can hold it. The fan loop:
- **Claim your team's moment with just an email.** A Cloudflare Worker verifies a
  Cloudflare Turnstile challenge **server-side**, then mints a real **compressed** NFT and
  delivers it to a **custodial Solana wallet auto-created for the fan's email** (Crossmint).
  No seed phrase, no extension, no gas — and the fan can export the key to Phantom later.
  Zero crypto friction is a feature, not a compromise.
- **Rarity by event, not by artificial cap.** Ordinary goals mint in larger editions;
  red cards and VAR reversals are scarce; finals, hat-tricks and last-minute winners are
  1/1 legendaries. Scarcity tracks **what actually happened on the pitch**, so it can
  never be faked or inflated.
- **Your collection + leaderboard.** A personal *"your Argentina moments"* page and a
  holders leaderboard, so following your team across the tournament builds a season-long set.
- **Sybil resistance by design:** one claim per email + a **server-verified** Turnstile
  bot check (the secret never touches the browser), with optional presence-gating as a
  retention flex.

**Honest status of the claim — it's live.** The claim Worker (server-side Turnstile
siteverify → Crossmint mint-and-deliver to the fan's email wallet → server-allocated edition
numbers) is **deployed and running** at `https://moment-claim.danyfomin003.workers.dev`, and
the live gallery is wired to it: a fan who claims gets a **real compressed NFT** minted to a
custodial Solana wallet auto-created for their email — on devnet (staging Crossmint), matching
the devnet 25-card strand. We've already minted two to our own inbox, finalized on the devnet
Solana explorer and owned by the email's custodial wallet (not ours). The same Worker flips to
a tradeable mainnet asset by swapping the Crossmint key. Real cards, real on-chain proof links,
real custodial delivery — nothing a fan sees is faked.

### See it in three art tiers, across the room
Three deterministic "print-era" art tiers, generated per team (WAI-illustrious-SDXL,
human-curated) and composited at mint time (no live-latency risk): **base** — '90s cel
anime (goals); **drama** — spot-color manga ink (reds, VAR reversals); **legendary** —
ukiyo-e gold leaf (finals, hat-tricks). No real player likenesses; teams are expressed
through kit colors only.

### Demonstrability — it already ran, unattended, on real matches
Fully autonomous on the real Round-of-16: **25 moments minted across 6 matches, 25/25
proven on-chain** *(counts as of filming the demo — the stack keeps running on live
matches, so the gallery may show more by the time you read this; every new card goes
through the same detect → mint → validate_stat path).* **12 of them were minted genuinely live, during the match** — across
three matches (USA–Belgium, Argentina–Egypt, Portugal–Spain) — including the trophy:
**Argentina 3–2 Egypt, a comeback thriller with a VAR-disallowed goal minted in real
time** as a `drama`-tier card while the match was still playing, the gallery
auto-publishing each new card to GitHub Pages with no human in the loop. The remaining
13 cards were reconstructed from the recorded feed and proven through the *same*
`validate_stat` path — we tag the live cards distinctly from the replayed ones, because
the live moments are strong enough that we don't need to blur the line.

---

## 3. Monetization

Three revenue lines, in order of how soon they turn on:

1. **Primary claim / mint fee (consumer, day one).** Free-to-claim as the growth
   default, then a small paid mint on scarce tiers — e.g. **$1–3** per claim on
   red-card / VAR / legendary editions. On Solana this is economically real: a Metaplex
   Core asset costs ~**0.0029 SOL** of rent and ~**$0.001** of gas to create, so
   per-moment minting carries a genuine margin instead of being subsidised away by fees.
   **Sub-cent minting is *why Solana* — it's the only chain where minting a fresh 1/1 +
   a permanent proof per moment, per match, across 104 games, is economically possible.**
2. **Protocol-enforced secondary royalty (roadmap).** Metaplex Core ships a **Royalties
   plugin** that enforces a creator royalty (e.g. **5–7%**) at the asset level — not a
   marketplace honor-system. We'll enable it on production mints; because rarity is pinned
   to real events, a live VAR-reversal 1/1 has durable, non-fakeable secondary demand, so
   every resale would pay the creator on-chain.
3. **B2B licensing of the verified-moment feed — the line this sponsor should care about
   most.** The detector + proof layer *is* a product: a clean, **provable event stream**
   (GOAL / RED_CARD / VAR-reversal, each with a `validate_stat` proof) that fantasy apps,
   second-screen experiences, alert bots and other fan products can license — priced
   per-call or rev-share. This positions **Moment Mints as TxLINE's reference consumer
   channel**: TxODDS sells verifiable data to enterprises; we're the proof that the same
   data becomes a **new, direct-to-fan channel their enterprise sales motion can't reach.**
   We don't compete with TxODDS — we're the shop window for what their oracle makes
   possible downstream.

**Why this beats NBA Top Shot (preempting the obvious comparison).** Top Shot has two
fatal flaws: **fake scarcity** (drop sizes are set by a marketing team, not by the game)
and **no truth guarantee** (the moment is a video file with no cryptographic link to the
event). Moment Mints answers both directly. **Scarcity is set by the match** — a VAR
reversal is rare because VAR reversals are rare — so it can't be inflated for a drop
calendar. And **every card is bound to an on-chain proof** — *no moment, no card* — so
authenticity is verifiable by anyone, not asserted by a company. Top Shot sells you a
clip; we sell you a fact you can check.

---

## 4. Why us / why now / traction & go-to-market

**Why now.** The 2026 World Cup is the single largest sports-attention event on Earth,
and for its duration TxODDS is giving free, direct access to a cryptographically anchored
feed of all 104 matches. That combination — peak fan intent + a verifiable real-time
oracle — exists in a **28-day window** and won't repeat. A provable-collectible product
has to be built *now*, on live moments, or not at all.

**Why us.** We are the only entry that combines **autonomous + verifiable + collectible**
in one loop, and we've already proven the hard part runs unattended on real matches —
including a real live VAR-reversal mint, which no comparable product (Top Shot, Sorare)
can claim because none of them are wired to a truth oracle. The insight that unlocks it —
*"there's no event feed, so diff the anchored counters and every event becomes provable"* —
is non-obvious and defensible, and it maps almost perfectly onto TxODDS's own flagship
narrative of cryptographically verifiable sports data.

**Go-to-market.** (1) **Team-fandom wedge:** launch club-by-club and nation-by-nation —
"claim your Argentina moments" is a shareable, tribal hook that grows one fanbase at a
time. (2) **The match *is* the acquisition event:** every goal is a reason to open the
app, and presence-gated claims turn live matches into retention. (3) **Creator royalty +
scarce legendaries** seed a secondary market that markets itself. (4) **B2B licensing**
turns the same infrastructure into enterprise revenue and makes us TxLINE's reference
consumer channel. Traction plan for the judging window: an X build-in-public thread, a
lightweight waitlist on the live gallery, and a handful of documented real fan reactions
to the live-minted cards.

---

## 5. TxLINE API feedback (genuine, specific)

We used the feed hard enough to hit its real edges, and we mean this as constructive —
the data quality is excellent; the friction is all at the integration seams.

- **No discrete event feed.** Soccer data is per-period stat counters, not events, so any
  consumer building "a goal just happened" has to reconstruct events by diffing counters
  across SSE updates and handle every edge themselves (baseline suppression, `0→2`
  multi-goal jumps, stale sequences, mid-match reconnect, partial payloads). This is the
  single biggest lift for a fan-facing integrator — **a first-class derived-event stream
  (with the anchoring stat attached) would unlock a whole class of consumer apps.**
- **The `Action` label can't be trusted as ground truth.** We caught a VAR goal-reversal
  arrive tagged `corner`. We now treat the **stat-diff as the source of truth** and
  `Action` as flavor only — which is fine for us, but a naive integrator following the
  label would ship wrong events. Worth either documenting `Action` as best-effort or
  tightening it.
- **`validate_stat` timestamp gotcha (error `6010 TimestampMismatch`).** The call wants
  the **batch `minTimestamp`**, not the event's own timestamp — passing the intuitive
  value fails with `6010`. Costly to discover; a one-line note in the docs (or accepting
  the event timestamp) would save every verifier the same afternoon we lost.
- **Finished fixtures vanish without a trace.** `/api/fixtures/snapshot` only lists
  *upcoming* fixtures — the moment a match ends it disappears, and there is no endpoint to
  enumerate finished fixtures or look up their ids. `/api/scores/historical/{fixtureId}` is
  great, but only if you already know the id: we lost the France–Morocco quarterfinal because
  we weren't capturing when it kicked off, and its id became unrecoverable. Integrators must
  persist fixture ids ahead of time; a simple "recent/finished fixtures" endpoint would fix this.
- **On-chain activation flow is powerful but under-documented.** The guest-JWT →
  on-chain `subscribe` → signed-activation → token path is genuinely nice (activation is
  itself provable), but the sequencing and the SL-tier semantics (SL1 60s vs SL12
  real-time) took reverse-engineering from the IDL. A worked end-to-end activation
  example would cut first-integration time sharply.

None of these blocked us — we shipped a fully autonomous verified-mint pipeline on top of
the feed — but they're exactly the seams where a consumer-facing partner will need
smoothing.

---

## 6. Standard form fields

**Project name:** Moment Mints

**Track:** Consumer & Fan Experiences

**Team:**
- **[Operator name] — Founder / Product & Design.** Product decisions, generative-art
  direction and curation, go-to-market, operations, wallet/treasury. _(Team leader for
  KYC/payout — payout wallet is mainnet.)_
- **AI engineering agent — Full-stack build.** Detector core, mint + proof pipeline,
  on-chain activation, gallery, autonomous live-mint daemon. _(Solo build; every commit
  is in-period and visible in the repo history.)_

**Tech stack:**
- **Chain:** Solana. The full 25-moment collection runs on **devnet** (free World Cup
  feed tier); a **5-card hero set is live on Solana mainnet**, its stats proven by a real
  `validate_stat` transaction against the mainnet TxODDS oracle. The two strands never
  cross-reference. TxLINE Solana program: `subscribe`, `validate_stat`, daily Merkle roots.
- **NFT:** Metaplex Core 1/1 masters; each card's real `validate_stat` proof tx is bound
  into its **on-chain Attributes** (the proof lives on Solana, not in our database). Fan
  claim editions are compressed NFTs.
- **Storage:** all cards' art + metadata are stored **permanently on Arweave** (ArDrive
  Turbo, paid in SOL) — the mainnet hero set and, after migrating off ephemeral devnet
  Irys, all 25 devnet cards too. Nothing on a card depends on a gateway that can expire.
- **Data:** TxLINE World Cup feed over SSE (SL1 free tier; SL12 real-time as the
  production path).
- **Backend:** Node.js ≥18, zero-dependency detector core (12 tests), autonomous
  mint/proof daemons.
- **Fan loop:** Cloudflare Worker (deployed, live) → server-side Turnstile siteverify →
  Crossmint mint-and-deliver (compressed edition) to an email-linked custodial Solana wallet.
- **Art:** WAI-illustrious-SDXL three-tier generative system, deterministic mint-time
  compositing.
- **Frontend:** static gallery on GitHub Pages, auto-published live during matches
  (ETag/SSE poll).

**Links:**
- **Live gallery (public MVP):** https://danyssg.github.io/moment-mints/
- **Live claim endpoint (Cloudflare Worker):** https://moment-claim.danyfomin003.workers.dev/api/health
- **Code (public repo):** https://github.com/danySSG/moment-mints
- **Demo video:** _(paste public YouTube/Loom link — set to Public/Unlisted, verify it
  plays signed-out)_
- **X / build-in-public thread:** _(paste link if posted)_
- **Network / data:** Solana · TxLINE World Cup feed

**Presentation / video (what it shows, ≤5 min):** problem → live app walkthrough → a real
moment happening → "minting now, autonomously" → **"verified on-chain ✓" with the
Explorer proof-tx clicked live** → the `6010` bad-timestamp rejection as the trust proof →
the email-claim + personal-collection fan loop → the who-pays / B2B-channel line. All
footage captured before the free feed closes at **2026-07-19 23:59 UTC**.

**Repo access:** public. **Payout:** team-leader mainnet wallet set in the Earn profile
(not the devnet test wallet).

---

### Operator checklist (delete before submitting)
- [ ] Paste public demo-video link (§6) and confirm it plays signed-out.
- [ ] Fill real operator name in §6 team block.
- [ ] Confirm all three links are public/reachable from an incognito window.
- [ ] Set Earn payout wallet to mainnet USDC/USDT address.
- [ ] If a short-description field caps at 280 chars, use the §1 short variant.
- [ ] Post the X build-in-public thread and paste the link.
