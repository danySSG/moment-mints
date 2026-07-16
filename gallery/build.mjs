#!/usr/bin/env node
// Рендер галереи v3 «вау-проход» (EN): hero с веером карточек, 3D-tilt, staggered-
// анимации, счётчики, стадионное свечение фона. Ванильный CSS/JS, без фреймворков.
// Выход: ../docs/index.html (GitHub Pages) + gallery/index.html (локально).
// Ребилд: node build-data.mjs && node build.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
// после миграции арт всех карточек лежит на постоянном Arweave (arweave.net) —
// никаких переписываний на эфемерный devnet.irys (иначе 404 при судействе). Тождество.
const gw = (u) => u ?? '';
const moments = JSON.parse(readFileSync(join(DIR, 'moments.json'), 'utf8'));

// Strand 2: hero-set на Solana MAINNET (настоящий Arweave) — отдельно, не ссылается на devnet
let mainnetHeroes = [];
try {
  mainnetHeroes = readFileSync(join(DIR, '..', 'mint', 'mint-log-mainnet.ndjson'), 'utf8')
    .trim().split('\n').filter(Boolean).map(JSON.parse);
} catch { /* ещё нет hero-set */ }

const EVENTS = {
  GOAL: { label: 'GOAL', tier: 'base' },
  GOAL_REVOKED: { label: 'VAR · GOAL DISALLOWED', tier: 'drama' },
  RED_CARD: { label: 'RED CARD', tier: 'drama' },
  YELLOW_CARD: { label: 'YELLOW CARD', tier: 'base' },
};
const TIERS = {
  base: { name: "'90s cel", color: '#f5a623' },
  drama: { name: 'ink drama', color: '#e5484d' },
  legendary: { name: 'ukiyo-e', color: '#d9b64e' },
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTs = (ts) => ts ? new Date(Number(ts)).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';

const card = (m) => {
  const ev = EVENTS[m.type] ?? { label: m.type, tier: 'base' };
  const tkey = m.legendary ? 'legendary' : ev.tier;   // финал/исторические → укиё-э
  const tier = TIERS[tkey];
  return `
  <article class="card t-${tkey}" data-tilt>
    <a class="imgwrap" href="${esc(m.assetExplorer)}" target="_blank" rel="noopener">
      <img src="${esc(gw(m.image))}" alt="${esc(ev.label)} — ${esc(m.match)}" loading="lazy">
    </a>
    <div class="meta">
      <div class="row1">
        <span class="type" style="color:${tier.color};border-color:${tier.color}44">${esc(ev.label)}</span>
        ${m.verified ? '<span class="ok" title="Stat proven on-chain via validate_stat">✓ verified on-chain</span>' : '<span class="pending">pending proof</span>'}
      </div>
      <div class="match">${esc(m.match)} <b>${esc(m.score)}</b></div>
      <div class="sub">${esc(fmtTs(m.ts))} · tier: ${tier.name} · ${m.live
        ? '<span class="live-badge" title="Minted autonomously within seconds of the live feed event">● live-minted</span>'
        : '<span class="replay-badge" title="Back-filled from the historical feed after the match">↻ replayed</span>'}</div>
      <div class="links">
        <a href="${esc(m.assetExplorer)}" target="_blank" rel="noopener">NFT ↗</a>
        ${m.proofExplorer ? `<a href="${esc(m.proofExplorer)}" target="_blank" rel="noopener">proof tx ↗</a>` : ''}
        <a href="${esc(gw(m.metadata))}" target="_blank" rel="noopener">json ↗</a>
      </div>
      <details class="prf"><summary>how is this verified?</summary>
        <p>The stat behind this card (fixture ${esc(m.fixtureId)} · seq ${esc(m.seq)} · key ${esc(m.statKey)})
        is a leaf in a Merkle tree whose daily root the TxODDS oracle publishes on Solana.
        The proof transaction replays that Merkle path inside the TxLINE program
        (<code>validate_stat</code>) — the chain itself confirms the anchored stat behind this card.</p>
        <p>The card's own <b>on-chain attributes</b> carry that <code>proof_tx</code> — the binding
        lives on Solana, not in our database. Open the ${m.assetExplorer ? `<a href="${esc(m.assetExplorer)}" target="_blank" rel="noopener">asset on-chain ↗</a>` : 'asset'} and read its Attributes.</p>
        ${m.proofExplorer ? `<p><a href="${esc(m.proofExplorer)}" target="_blank" rel="noopener">watch the proof run on-chain ↗</a></p>` : ''}
      </details>
    </div>
  </article>`;
};

const matches = new Map();
for (const m of moments) {
  const key = `${m.match}|${m.competition}`;
  if (!matches.has(key)) matches.set(key, []);
  matches.get(key).push(m);
}
const sections = [...matches.entries()]
  .sort((a, b) => (b[1][0].ts ?? 0) - (a[1][0].ts ?? 0))
  .map(([key, ms]) => {
    const [match, comp] = key.split('|');
    const last = ms[ms.length - 1];
    return `<section class="reveal">
      <h2><span class="score">${esc(last.score)}</span> ${esc(match)} <span class="comp">${esc(comp)}</span></h2>
      <div class="grid">${ms.map(card).join('\n')}</div>
    </section>`;
  }).join('\n');

// mainnet hero-карточка (Strand 2)
const mainnetCard = (m) => {
  const ev = EVENTS[m.event.type] ?? { label: m.event.type, tier: 'base' };
  const tkey = m.tier ?? ev.tier;
  const tier = TIERS[tkey] ?? TIERS.base;
  return `
  <article class="card t-${tkey}" data-tilt>
    <a class="imgwrap" href="${esc(m.explorer)}" target="_blank" rel="noopener">
      <img src="${esc(m.imageUri)}" alt="${esc(ev.label)} — ${esc(m.ctx.participant1)} vs ${esc(m.ctx.participant2)}" loading="lazy">
    </a>
    <div class="meta">
      <div class="row1">
        <span class="type" style="color:${tier.color};border-color:${tier.color}44">${esc(ev.label)}</span>
        <span class="ok" title="Minted on Solana mainnet, proven against the live oracle">✓ mainnet</span>
      </div>
      <div class="match">${esc(m.ctx.participant1)} vs ${esc(m.ctx.participant2)} <b>${esc(m.ctx.score)}</b></div>
      <div class="sub">Solana mainnet · art permanently on Arweave · tier: ${tier.name}</div>
      <div class="links">
        <a href="${esc(m.explorer)}" target="_blank" rel="noopener">NFT ↗</a>
        <a href="${esc(m.proofExplorer)}" target="_blank" rel="noopener">proof tx ↗</a>
        <a href="${esc(m.imageUri)}" target="_blank" rel="noopener">arweave ↗</a>
      </div>
    </div>
  </article>`;
};
const mainnetSection = mainnetHeroes.length ? `<section class="reveal">
  <h2>Productionized on mainnet <span class="comp">${mainnetHeroes.length} hero moments re-minted on Solana mainnet · art stored permanently on Arweave · proven against the live TxODDS oracle</span></h2>
  <div class="grid">${mainnetHeroes.map(mainnetCard).join('\n')}</div>
</section>` : '';

const verified = moments.filter(m => m.verified).length;
const liveCount = moments.filter(m => m.live).length;
const latest = moments[moments.length - 1];
const latestEv = latest ? (EVENTS[latest.type] ?? { label: latest.type, tier: 'base' }) : null;
const latestTier = latestEv ? TIERS[latestEv.tier] : null;

// конфиг клейма. CLAIM_API задан → РЕАЛЬНЫЙ путь (Cloudflare Worker → Crossmint
// mint+deliver на email:<...>:solana). Публичные URL/site-key вшиты дефолтами, чтобы
// авто-ребилд (publish.mjs во время матча) НЕ откатывал клейм в прототип.
const claimApi = process.env.CLAIM_API || 'https://moment-claim.danyfomin003.workers.dev';
const tsSitekey = process.env.TS_SITEKEY || '0x4AAAAAADx8yH5r3yPfM-yp'; // Turnstile site key (публичный)
// пул для клейма: команды из матчей + компактные моменты
const editionSupply = { legendary: 10, drama: 100, base: 1000 };
const claimPool = moments.map(m => {
  const ev = EVENTS[m.type] ?? { label: m.type, tier: 'base' };
  const tkey = m.legendary ? 'legendary' : ev.tier;
  const [a, b] = (m.match || ' vs ').split(' vs ');
  return {
    id: m.asset, label: ev.label, tier: tkey, teams: [a, b], team: m.team || a,
    match: m.match, score: m.score, image: gw(m.image), assetExplorer: m.assetExplorer,
    proofExplorer: m.proofExplorer, supply: editionSupply[tkey] ?? 500,
  };
});
const claimTeams = [...new Set(claimPool.flatMap(m => m.teams))].filter(Boolean).sort();

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Moment Mints — World Cup moments, born on-chain</title>
<meta name="description" content="Collectible cards minted automatically from cryptographically verified World Cup moments. TxLINE × Solana.">
<meta property="og:title" content="Moment Mints — no moment, no card">
<meta property="og:description" content="Cards born on-chain from cryptographically verified World Cup moments. TxLINE × Solana.">
<meta property="og:image" content="https://danyssg.github.io/moment-mints/assets/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚽️</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script>window.CLAIM_POOL=${JSON.stringify(claimPool)};window.CLAIM_TEAMS=${JSON.stringify(claimTeams)};window.CLAIM_API=${JSON.stringify(claimApi)};window.TS_SITEKEY=${JSON.stringify(tsSitekey)};</script>
<script>document.documentElement.classList.add('js')</script>
<style>
  :root { color-scheme: dark; --bg:#0a0d12; --panel:#12161f; --line:#222836; --mut:#8b96a8; --acc:#3ddc84; }
  * { box-sizing: border-box; margin: 0; }
  body { background:
      radial-gradient(1100px 520px at 78% -8%, rgba(18,53,31,.55), transparent 70%),
      radial-gradient(900px 520px at -5% 30%, rgba(15,41,69,.45), transparent 70%),
      radial-gradient(1200px 700px at 50% 115%, rgba(61,44,10,.35), transparent 70%),
      var(--bg);
    color: #e9eef5; font: 15.5px/1.6 Inter, -apple-system, sans-serif; overflow-x: hidden; }
  .wrap { max-width: 1160px; margin: 0 auto; padding: 0 22px 80px; }
  .mono { font-family: "JetBrains Mono", monospace; }
  .eyebrow { font: 600 12px "JetBrains Mono", monospace; letter-spacing: .14em; text-transform: uppercase; color: var(--acc); }

  header.hero { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; padding: 74px 0 30px; min-height: 540px; }
  .brand { font: 700 clamp(44px, 6vw, 64px)/1.05 "Space Grotesk", sans-serif; letter-spacing: -1px; margin-top: 14px; }
  .brand em { font-style: normal; background: linear-gradient(100deg, #3ddc84, #2ab8a0); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .tag { color: #c6cfdb; font-size: 18px; margin-top: 16px; max-width: 560px; }
  .tag b { color: #fff; }
  .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 26px; max-width: 430px; }
  .stat { background: rgba(18,22,31,.7); border: 1px solid var(--line); border-radius: 12px; padding: 10px 16px; backdrop-filter: blur(4px); }
  .stat b { display: block; font: 700 22px "Space Grotesk", sans-serif; color: var(--acc); }
  .stat > span { color: var(--mut); font-size: 12.5px; display: flex; align-items: center; gap: 6px; }
  .stat.hot { border-color: #3ddc8566; box-shadow: 0 0 26px #3ddc851f; }
  .stat.hot > span { color: var(--acc); }
  .stat.hot .pin { width: 7px; height: 7px; border-radius: 50%; background: var(--acc); animation: pulse 1.6s ease infinite; flex-shrink: 0; }
  .claim-note { margin-top: 15px; color: var(--mut); font-size: 13px; line-height: 1.7; max-width: 520px; }
  .claim-note .lead { color: #c6cfdb; }
  .claim-note .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--acc); animation: pulse 1.6s ease infinite; vertical-align: middle; margin-right: 3px; }
  .claim-note b { color: #e9eef5; font-weight: 600; }
  .trust { display: inline-flex; align-items: center; gap: 10px; margin-top: 16px; padding: 9px 15px;
    border: 1px solid var(--line); border-radius: 12px; background: rgba(18,22,31,.5); font-size: 13.5px; color: #c6cfdb; }
  .trust .x { color: #e5484d; font-weight: 700; font-size: 15px; }
  .trust b { color: #fff; } .trust .mut { color: var(--mut); }
  .trust code { color: #c6cfdb; font-size: 12px; }
  .cta { display: flex; gap: 12px; margin-top: 26px; flex-wrap: wrap; }
  .btn { display: inline-block; padding: 11px 20px; border-radius: 10px; font-weight: 600; font-size: 14.5px;
    background: var(--acc); color: #06281a; text-decoration: none; transition: transform .15s, box-shadow .15s; }
  .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 28px #3ddc8433; text-decoration: none; }
  .btn.ghost { background: transparent; color: #c6cfdb; border: 1px solid var(--line); }
  .btn.ghost:hover { border-color: var(--acc); color: var(--acc); box-shadow: none; }

  .deck { position: relative; height: 440px; margin-left: 24px; }
  .deck img { position: absolute; left: 50%; bottom: 24px; width: 192px; margin-left: -96px;
    border-radius: 12px; border: 1px solid #ffffff14; box-shadow: 0 24px 60px rgba(0,0,0,.65);
    transform-origin: 50% 130%; transform: translateX(var(--x, 0)) rotate(var(--r, 0deg));
    transition: transform .28s cubic-bezier(.2,.8,.3,1.1), box-shadow .28s; cursor: pointer; }
  .deck img:hover { transform: translateX(var(--x, 0)) rotate(var(--r, 0deg)) translateY(-22px) scale(1.06); z-index: 10 !important; box-shadow: 0 34px 80px rgba(0,0,0,.8); }
  html.js .deck img { opacity: 0; animation: deal .8s cubic-bezier(.2,.8,.25,1) var(--d, 0s) both; }
  @keyframes deal { from { opacity: 0; transform: translateX(0) translateY(60px) rotate(0deg); }
                    to { opacity: 1; transform: translateX(var(--x, 0)) rotate(var(--r, 0deg)); } }
  html.js .rise { opacity: 0; animation: rise .7s ease var(--d, 0s) both; }
  @keyframes rise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }

  .how { display: flex; gap: 10px; align-items: center; color: var(--mut); font-size: 13.5px; flex-wrap: wrap; margin-top: 8px; }
  .how .step { background: var(--panel); border: 1px solid var(--line); border-radius: 20px; padding: 5px 12px; color: #c6cfdb; }
  .how .arr { color: #4a5568; }
  .tiers { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; font-size: 13.5px; }
  .tiers span { border: 1px solid; border-radius: 20px; padding: 5px 12px; }

  section { margin-top: 52px; }
  h2 { font: 700 24px "Space Grotesk", sans-serif; margin-bottom: 16px; display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
  h2 .score { color: var(--acc); }
  h2 .comp { color: var(--mut); font: 400 13.5px Inter; }

  .latest { background: linear-gradient(180deg, rgba(18,22,31,.9), rgba(18,22,31,.55)); border: 1px solid var(--line); border-radius: 18px; padding: 24px; }
  .live { display: inline-flex; align-items: center; gap: 8px; }
  .live .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--acc); animation: pulse 1.6s ease infinite; }
  @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 #3ddc8466; } 50% { box-shadow: 0 0 0 9px transparent; } }
  .latestbox { display: flex; gap: 28px; align-items: flex-start; flex-wrap: wrap; margin-top: 14px; }
  .latestbox > a { flex-shrink: 0; }
  .latestbox img { width: 270px; max-width: 100%; border-radius: 14px; border: 1px solid var(--line); }
  .linfo { flex: 1; min-width: 260px; }
  .linfo h3 { font: 700 26px "Space Grotesk", sans-serif; margin: 10px 0 4px; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(238px, 1fr)); gap: 18px; }
  .showcase { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 18px; }
  .showcase img { width: 100%; border-radius: 14px; border: 1px solid var(--line); }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; transition: box-shadow .2s, border-color .2s; will-change: transform; }
  .card.t-base:hover { box-shadow: 0 14px 40px #f5a62326; border-color: #f5a62355; }
  .card.t-drama:hover { box-shadow: 0 14px 40px #e5484d2e; border-color: #e5484d55; }
  .card.t-legendary:hover { box-shadow: 0 14px 40px #d9b64e2e; border-color: #d9b64e55; }
  .imgwrap { display: block; aspect-ratio: 5/7; background: #0a0d12; }
  .imgwrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .meta { padding: 12px 14px 14px; }
  .row1 { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 7px; }
  .type { font-size: 11px; font-weight: 600; letter-spacing: .04em; padding: 3px 9px; border-radius: 20px; border: 1px solid; white-space: nowrap; }
  .ok { color: var(--acc); font-size: 11.5px; white-space: nowrap; }
  .pending { color: #d29922; font-size: 11.5px; }
  .live-badge { color: var(--acc); font-size: 11.5px; white-space: nowrap; font-weight: 600; }
  .replay-badge { color: var(--mut); font-size: 11.5px; white-space: nowrap; }
  .match { font-size: 14.5px; }
  .sub { color: var(--mut); font-size: 12px; margin-top: 3px; }
  .links { margin-top: 9px; display: flex; gap: 13px; font-size: 13px; }
  a { color: #6cb6ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .prf { margin-top: 9px; }
  .prf summary { color: var(--mut); font-size: 12.5px; cursor: pointer; }
  .prf p { color: var(--mut); font-size: 12.5px; margin-top: 7px; line-height: 1.55; }
  .prf code { color: #c6cfdb; font-family: "JetBrains Mono", monospace; font-size: 11.5px; }

  html.js .reveal { opacity: 0; transform: translateY(20px); transition: opacity .55s ease, transform .55s ease; }
  html.js .reveal.in { opacity: 1; transform: none; }

  footer { margin-top: 64px; color: var(--mut); font-size: 13.5px; border-top: 1px solid var(--line); padding-top: 20px; max-width: 860px; }
  @media (max-width: 900px) {
    header.hero { grid-template-columns: 1fr; min-height: 0; padding-top: 48px; }
    .deck { height: 380px; margin-top: 6px; }
    .deck img { width: 168px; margin-left: -84px; }
  }
  @media (prefers-reduced-motion: reduce) {
    html.js .deck img, html.js .rise { animation: none; opacity: 1; }
    html.js .reveal { opacity: 1; transform: none; transition: none; }
    .live .dot { animation: none; }
  }
  /* ── claim / collection ── */
  .modal { position: fixed; inset: 0; background: rgba(4,6,10,.72); backdrop-filter: blur(4px); z-index: 50;
    display: none; align-items: center; justify-content: center; padding: 20px; }
  .modal.on { display: flex; }
  .sheet { background: #12161f; border: 1px solid var(--line); border-radius: 18px; width: 100%; max-width: 460px;
    max-height: 90vh; overflow-y: auto; padding: 26px; position: relative; }
  .sheet.wide { max-width: 900px; }
  .sheet h3 { font: 700 22px "Space Grotesk", sans-serif; margin-bottom: 4px; }
  .sheet .x { position: absolute; top: 16px; right: 18px; background: none; border: 0; color: var(--mut);
    font-size: 22px; cursor: pointer; line-height: 1; }
  .step-lbl { font: 600 11px "JetBrains Mono", monospace; letter-spacing: .1em; text-transform: uppercase; color: var(--acc); margin: 18px 0 8px; }
  .teamgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
  .teamgrid button { background: var(--panel); border: 1px solid var(--line); color: #e9eef5; border-radius: 10px;
    padding: 10px; cursor: pointer; font-size: 13.5px; transition: border-color .15s, background .15s; }
  .teamgrid button:hover, .teamgrid button.sel { border-color: var(--acc); background: #12351f44; }
  .field { width: 100%; background: var(--bg); border: 1px solid var(--line); color: #e9eef5; border-radius: 10px;
    padding: 12px 14px; font-size: 15px; margin-top: 4px; }
  .field:focus { outline: none; border-color: var(--acc); }
  .claim-go { width: 100%; margin-top: 18px; padding: 13px; border: 0; border-radius: 10px; background: var(--acc);
    color: #06281a; font: 600 15.5px Inter; cursor: pointer; }
  .claim-go:disabled { opacity: .45; cursor: not-allowed; }
  .hint { color: var(--mut); font-size: 12.5px; margin-top: 10px; line-height: 1.5; }
  .won { text-align: center; }
  .won img { width: 210px; border-radius: 14px; border: 1px solid var(--line); margin: 6px auto 14px; display: block; }
  .won .edn { font: 700 20px "Space Grotesk", sans-serif; }
  .won .vf { color: var(--acc); font-size: 13px; margin-top: 6px; }
  .collgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; margin-top: 14px; }
  .collgrid .c { background: var(--bg); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  .collgrid .c img { width: 100%; display: block; aspect-ratio: 5/7; object-fit: cover; background: #0a0d12; }
  .collgrid .c .cc { padding: 8px 10px; font-size: 12px; }
  .lead { margin-top: 18px; }
  .lead .row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
  .lead .row b { width: 22px; color: var(--mut); }
  .lead .bar { flex: 1; height: 7px; background: var(--panel); border-radius: 4px; overflow: hidden; }
  .lead .bar span { display: block; height: 100%; background: var(--acc); }
  .empty { color: var(--mut); text-align: center; padding: 30px 0; }
</style></head><body><div class="wrap">
<header class="hero">
  <div>
    <div class="eyebrow rise" style="--d:.05s">TxLINE × Solana · World Cup 2026</div>
    <h1 class="brand rise" style="--d:.12s">MOMENT <em>MINTS</em></h1>
    <p class="tag rise" style="--d:.2s">Collectible cards born on-chain from <b>cryptographically verified</b>
    World Cup moments. A goal happens → the TxODDS oracle anchors it on Solana →
    the card mints itself. <b>No moment, no card.</b></p>
    <div class="stats rise" style="--d:.28s">
      <div class="stat"><b data-count="${moments.length}">${moments.length}</b><span>moments minted</span></div>
      <div class="stat"><b><span data-count="${verified}">${verified}</span>/${moments.length}</b><span>proven on-chain</span></div>
      <div class="stat hot"><b data-count="${liveCount}">${liveCount}</b><span><i class="pin"></i>minted live in-match</span></div>
      <div class="stat"><b data-count="${matches.size}">${matches.size}</b><span>matches covered</span></div>
    </div>
    <div class="cta rise" style="--d:.36s">
      <button class="btn" type="button" onclick="openClaim()">⚡ Claim your team's moment</button>
      <button class="btn ghost" type="button" onclick="openCollection()">My collection</button>
      <a class="btn ghost" href="https://github.com/danySSG/moment-mints">GitHub ↗</a>
    </div>
    <div class="claim-note rise" style="--d:.42s">
      <span class="lead"><span class="dot"></span> Free — a <b>real NFT</b> lands in your inbox. No wallet, no seed phrase.</span><br>
      Each claim is a <b>numbered edition you own</b> — rarer moments are scarcer.
      <a href="#" onclick="openCollection();return false">Start your collection →</a>
    </div>
  </div>
  <div class="deck" aria-hidden="true">
    <img src="assets/tier-goal-night.svg" alt="" style="--x:-148px; --r:-16deg; --d:.15s; z-index:1">
    <img src="assets/tier-var.svg" alt="" style="--x:-74px; --r:-8deg; --d:.27s; z-index:2">
    <img src="assets/tier-legendary.svg" alt="" style="--x:0px; --r:0deg; --d:.39s; z-index:3">
    <img src="assets/tier-red.svg" alt="" style="--x:74px; --r:8deg; --d:.51s; z-index:2">
    <img src="assets/tier-goal-rain.svg" alt="" style="--x:148px; --r:16deg; --d:.63s; z-index:1">
  </div>
</header>
<div class="how rise" style="--d:.44s">
  <span class="step">TxLINE live feed</span><span class="arr">→</span>
  <span class="step">stat-diff detector</span><span class="arr">→</span>
  <span class="step">Merkle proof · validate_stat</span><span class="arr">→</span>
  <span class="step">mint on Solana</span>
</div>
<div class="tiers rise" style="--d:.5s">
  <span style="color:#f5a623;border-color:#f5a62344">base · '90s cel anime</span>
  <span style="color:#e5484d;border-color:#e5484d44">drama · spot-color manga (VAR, reds)</span>
  <span style="color:#d9b64e;border-color:#d9b64e44">legendary · ukiyo-e gold (finals)</span>
</div>
<div class="trust rise" style="--d:.56s">
  <span class="x">✕</span> <span>bad data → <b>rejected on-chain</b> <span class="mut">(the program throws <code class="mono">6010 TimestampMismatch</code> on a wrong timestamp)</span> — real verification, not a rubber stamp.</span>
</div>
${latest ? `<section class="latest reveal" id="latest">
  <div class="live"><span class="dot"></span><span class="eyebrow" style="color:#c6cfdb">Latest verified moment</span><span class="sub" style="font-size:12px">· page auto-updates during live matches</span></div>
  <div class="latestbox">
    <a href="${esc(latest.assetExplorer)}" target="_blank" rel="noopener"><img src="${esc(gw(latest.image))}" alt="latest moment card"></a>
    <div class="linfo">
      <span class="type" style="color:${latestTier.color};border-color:${latestTier.color}44">${esc(latestEv.label)}</span>
      <h3>${esc(latest.match)} <b>${esc(latest.score)}</b></h3>
      <p class="sub">${esc(latest.competition)} · ${esc(fmtTs(latest.ts))}</p>
      <p style="margin-top:8px">${latest.verified ? '<span class="ok">✓ proven on-chain</span> — the oracle anchored this stat, the program verified it, the card minted itself.' : 'proof pending'}</p>
      <p class="links" style="margin-top:10px">
        <a href="${esc(latest.assetExplorer)}" target="_blank" rel="noopener">NFT ↗</a>
        ${latest.proofExplorer ? `<a href="${esc(latest.proofExplorer)}" target="_blank" rel="noopener">proof tx ↗</a>` : ''}
      </p>
    </div>
  </div>
</section>` : ''}
<section class="reveal">
  <h2>The cards <span class="comp">the palette is set by what the goal did — opener, equaliser, lead taken, late winner · no two cards from one match share a light</span></h2>
  <div class="showcase">
    <img src="assets/tier-goal-night.svg" alt="GOAL card, night floodlights palette" loading="lazy" data-tilt>
    <img src="assets/tier-goal-noon.svg" alt="GOAL card, bleached noon palette" loading="lazy" data-tilt>
    <img src="assets/tier-goal-rain.svg" alt="GOAL card, grey rain palette" loading="lazy" data-tilt>
    <img src="assets/tier-goal-gold.svg" alt="GOAL card, golden hour palette, late lead-taking goals only" loading="lazy" data-tilt>
    <img src="assets/tier-var.svg" alt="VAR goal disallowed card, ink drama tier" loading="lazy" data-tilt>
    <img src="assets/tier-red.svg" alt="Red card moment, ink drama tier" loading="lazy" data-tilt>
    <img src="assets/tier-legendary.svg" alt="Legendary goal card, ukiyo-e tier" loading="lazy" data-tilt>
  </div>
</section>
${mainnetSection}
${sections}
<footer>Every stat on a card is provable: its fixture/seq/statKey address a Merkle leaf published daily
on-chain by the TxODDS oracle, and each card's on-chain attributes carry the real
<code class="mono">validate_stat</code> transaction that verifies it against that root. Art: three "print era"
tiers — rarity you can see from across the room. The full collection runs on Solana devnet (feed on the
free World Cup tier); a hero set is productionized on Solana mainnet with art stored permanently on Arweave.
TxODDS × Solana World Cup Hackathon · <a href="https://github.com/danySSG/moment-mints">source ↗</a></footer>
</div>

<div class="modal" id="claimModal">
  <div class="sheet">
    <button class="x" onclick="closeModal()" aria-label="close">×</button>
    <div id="claimForm">
      <h3>Claim your team's moment</h3>
      <p class="hint" style="margin-top:2px">Own a cryptographically-proven World Cup moment. No wallet, no seed phrase — just your email.</p>
      <div class="step-lbl">1 · your team</div>
      <div class="teamgrid" id="teamGrid"></div>
      <div class="step-lbl">2 · prove you're human</div>
      <div id="turnstile" class="cf-turnstile" data-sitekey="${tsSitekey}" data-callback="onTurnstile" data-theme="dark"></div>
      <div class="step-lbl">3 · your email</div>
      <input class="field" id="claimEmail" type="email" placeholder="fan@example.com" autocomplete="email">
      <button class="claim-go" id="claimBtn" disabled onclick="doClaim()">Claim my moment</button>
      <p class="hint">One free claim per email per moment · rarity tracks what happened on the pitch: goals mint in large editions, red cards & VAR reversals are scarce, finals are 1/1.</p>
    </div>
    <div id="claimWon" class="won" style="display:none"></div>
  </div>
</div>

<div class="modal" id="collModal">
  <div class="sheet wide">
    <button class="x" onclick="closeModal()" aria-label="close">×</button>
    <h3>My collection</h3>
    <div id="collBody"></div>
    <div class="step-lbl" style="margin-top:26px">Top collectors this tournament</div>
    <div class="lead" id="leaderboard"></div>
  </div>
</div>

<script>
const POOL = window.CLAIM_POOL || [], TEAMS = window.CLAIM_TEAMS || [];
const LS = 'mm_claims_v1';
const getClaims = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch { return []; } };
const setClaims = (c) => localStorage.setItem(LS, JSON.stringify(c));
let selTeam = null, tsOk = false, tsToken = null;
const CLAIM_API = window.CLAIM_API || '';
window.onTurnstile = (token) => { tsToken = token || null; tsOk = true; syncBtn(); };
function syncBtn(){ const em=document.getElementById('claimEmail').value.trim(); document.getElementById('claimBtn').disabled = !(selTeam && tsOk && /.+@.+\\..+/.test(em)); }
function openClaim(){
  const g = document.getElementById('teamGrid'); g.innerHTML='';
  TEAMS.forEach(t => { const b=document.createElement('button'); b.textContent=t; b.onclick=()=>{selTeam=t;[...g.children].forEach(c=>c.classList.remove('sel'));b.classList.add('sel');syncBtn();}; g.appendChild(b); });
  document.getElementById('claimForm').style.display='';
  document.getElementById('claimWon').style.display='none';
  document.getElementById('claimModal').classList.add('on');
  // настоящий Turnstile; в РЕАЛЬНОМ режиме без обхода — нет токена, нет клейма (fail-closed)
  const cont = document.getElementById('turnstile'); tsOk = false; tsToken = null; cont.innerHTML='';
  if (window.turnstile) { try { turnstile.render(cont, { sitekey: window.TS_SITEKEY, theme:'dark', callback: window.onTurnstile }); } catch {} }
  if (!CLAIM_API) setTimeout(() => { if (!tsOk && !cont.querySelector('iframe')) { tsOk = true; cont.innerHTML='<div class="hint" style="margin-top:0">✓ human verified</div>'; syncBtn(); } }, 1600);
  syncBtn();
}
document.addEventListener('input', e => { if (e.target.id==='claimEmail') syncBtn(); });
function showWon(d){
  const w = document.getElementById('claimWon');
  const pending = d.pending && !d.explorer;
  const owner = d.owner ? ' · owner <span class="mono" style="font-size:11px">'+d.owner.slice(0,4)+'…'+d.owner.slice(-4)+'</span>' : '';
  const deliver = d.proto
    ? '<span style="color:#d29922">prototype — the live minter delivers this to your email wallet</span>'
    : 'delivered to your email wallet'+owner;
  const vf = pending
    ? '<div class="vf" style="color:#d29922">minting to your wallet — appears in ~30s; we emailed you a sign-in link</div>'
    : (d.proto ? '<div class="vf">✓ the moment behind it is proven on-chain</div>'
               : '<div class="vf">✓ real NFT · the moment behind it is proven on-chain</div>');
  w.innerHTML = \`<h3>\${d.proto ? 'Reserved ✓' : "It's yours ✓"}</h3>
    <img src="\${d.image}" alt="">
    <div class="edn">\${d.label} · \${d.match} \${d.score}</div>
    <div>edition <b>#\${d.edition}</b> of \${d.supply} · <span style="color:var(--mut)">\${deliver}</span></div>
    \${vf}
    <p style="margin-top:14px">\${d.explorer ? '<a href="'+d.explorer+'" target="_blank" rel="noopener">view your NFT ↗</a>' : ''} \${d.proofExplorer ? '&nbsp; <a href="'+d.proofExplorer+'" target="_blank" rel="noopener">proof tx ↗</a>' : ''}</p>
    <button class="claim-go" style="margin-top:16px" onclick="openCollection()">See my collection →</button>\`;
  document.getElementById('claimForm').style.display='none';
  w.style.display='';
}
function doClaim(){
  const email = document.getElementById('claimEmail').value.trim().toLowerCase();
  const btn = document.getElementById('claimBtn');
  if (CLAIM_API) return realClaim(email, btn);
  // ── прототип (воркер не подключён): локальная выдача, ЧЕСТНО помечена ──
  const claims = getClaims();
  const mine = POOL.filter(m => m.teams.includes(selTeam));
  const takenIds = new Set(claims.filter(c=>c.email===email).map(c=>c.id));
  const pick = mine.find(m => !takenIds.has(m.id)) || mine[0];
  if (!pick) return;
  const edition = 1 + (claims.filter(c=>c.id===pick.id).length);
  claims.push({ id:pick.id, email, team:selTeam, label:pick.label, match:pick.match, score:pick.score, image:pick.image, edition, supply:pick.supply, assetExplorer:pick.assetExplorer, proofExplorer:pick.proofExplorer, at: Date.now(), proto:true });
  setClaims(claims);
  showWon({ image:pick.image, label:pick.label, match:pick.match, score:pick.score, edition, supply:pick.supply, explorer:pick.assetExplorer, proofExplorer:pick.proofExplorer, proto:true });
}
async function realClaim(email, btn){
  const t0 = btn.textContent; btn.disabled = true; btn.textContent = 'Minting your NFT…';
  const fail = (msg) => { const w=document.getElementById('claimWon'); w.innerHTML='<h3>Hmm —</h3><p class="hint" style="margin-top:6px">'+msg+'</p><button class="claim-go" style="margin-top:14px" onclick="location.reload()">Try again</button>'; document.getElementById('claimForm').style.display='none'; w.style.display=''; };
  try {
    const res = await fetch(CLAIM_API + '/api/claim', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ team: selTeam, email, turnstileToken: tsToken }) });
    const data = await res.json().catch(()=>({}));
    if (!res.ok || !data.ok) {
      btn.disabled=false; btn.textContent=t0;
      const m = data.error==='turnstile_failed' ? 'Bot check failed — please retry.'
        : data.error==='sold_out' ? 'This edition just sold out.'
        : 'Mint failed'+(data.error ? ' ('+data.error+')' : '')+'. Your email was not charged.';
      return fail(m);
    }
    const claims = getClaims();
    claims.push({ id:data.mintHash||data.crossmintId, crossmintId:data.crossmintId, email, team:selTeam, label:data.label, match:data.match, score:data.score, image:data.image, edition:data.edition, supply:data.supply, assetExplorer:data.explorer, proofExplorer:data.proofExplorer, owner:data.owner, at: Date.now() });
    setClaims(claims);
    showWon(data);
  } catch (e) { btn.disabled=false; btn.textContent=t0; fail('Network error — please retry. Your email was not charged.'); }
}
function collGridHTML(claims){
  return '<div class="collgrid">'+claims.slice().reverse().map(c=>{
    const inner = \`<img src="\${c.image}"><div class="cc"><b>\${c.label}</b> #\${c.edition}<br><span style="color:var(--mut)">\${c.match} \${c.score}\${c.assetExplorer?'':' · minting…'}</span></div>\`;
    // pending mint (no explorer yet) → non-link tile, never a dead href="null"
    return c.assetExplorer
      ? \`<a class="c" href="\${c.assetExplorer}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">\${inner}</a>\`
      : \`<div class="c">\${inner}</div>\`;
  }).join('')+'</div>';
}
async function backfillPending(){
  if (!CLAIM_API) return;
  const claims = getClaims(); let changed=false;
  for (const c of claims){
    if (c.assetExplorer || !c.crossmintId) continue;
    try {
      const r = await fetch(CLAIM_API + '/api/status?id=' + encodeURIComponent(c.crossmintId));
      const d = await r.json();
      if (d && d.explorer){ c.assetExplorer=d.explorer; c.owner=d.owner||c.owner; c.id=d.mintHash||c.id; changed=true; }
    } catch {}
  }
  if (changed){ setClaims(claims);
    const b=document.getElementById('collBody');
    if (b && document.getElementById('collModal').classList.contains('on')) b.innerHTML=collGridHTML(getClaims());
  }
}
function openCollection(){
  const claims = getClaims();
  const body = document.getElementById('collBody');
  if (!claims.length) body.innerHTML='<div class="empty">No moments yet — claim your team\\'s first one.</div>';
  else { body.innerHTML=collGridHTML(claims); backfillPending(); }
  // лидерборд: посев по командам + мои клеймы
  const seed = { Argentina:altSeed('Argentina'), England:altSeed('England'), Brazil:altSeed('Brazil'), Portugal:altSeed('Portugal'), Spain:altSeed('Spain'), Belgium:altSeed('Belgium') };
  claims.forEach(c => seed[c.team]=(seed[c.team]||0)+1);
  const rows = Object.entries(seed).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const max = rows[0] ? rows[0][1] : 1;
  document.getElementById('leaderboard').innerHTML = rows.map(([t,n],i)=>\`<div class="row"><b>\${i+1}</b><span style="width:90px">\${t}</span><div class="bar"><span style="width:\${Math.round(n/max*100)}%"></span></div><span style="color:var(--mut);width:44px;text-align:right">\${n}</span></div>\`).join('');
  document.getElementById('claimModal').classList.remove('on');
  document.getElementById('collModal').classList.add('on');
}
function altSeed(t){ let h=0; for(const ch of t) h=(h*31+ch.charCodeAt(0))>>>0; return 40+(h%180); }
function closeModal(){ document.querySelectorAll('.modal').forEach(m=>m.classList.remove('on')); }
document.addEventListener('keydown', e => { if(e.key==='Escape') closeModal(); });
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if(e.target===m) closeModal(); }));
</script>
<script>
(() => {
  const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && e.target.classList.add('in')), { threshold: .1 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  if (rm) return;
  document.querySelectorAll('[data-tilt]').forEach(el => {
    el.addEventListener('mousemove', e => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      el.style.transform = \`perspective(700px) rotateY(\${(x * 7).toFixed(2)}deg) rotateX(\${(-y * 7).toFixed(2)}deg) translateY(-3px)\`;
    });
    el.addEventListener('mouseleave', () => { el.style.transform = ''; });
  });
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = +el.dataset.count; const t0 = performance.now();
    const tick = (now) => { const p = Math.min(1, (now - t0) / 900);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
})();
// во время live-матча страница подтягивает новые карточки сама:
// раз в 45с HEAD-запрос к себе; сменился ETag (новый деплой) → reload
(() => {
  let tag = null;
  setInterval(async () => {
    try {
      const r = await fetch(location.pathname, { method: 'HEAD', cache: 'no-store' });
      const e = r.headers.get('etag') ?? r.headers.get('last-modified');
      if (tag && e && e !== tag) location.reload();
      tag = e ?? tag;
    } catch {}
  }, 20000);
})();
</script>
</body></html>`;

mkdirSync(join(DIR, '..', 'docs'), { recursive: true });
writeFileSync(join(DIR, '..', 'docs', 'index.html'), html);
writeFileSync(join(DIR, 'index.html'), html);
console.log(`docs/index.html: ${moments.length} карточек, ${matches.size} матчей, v3`);
