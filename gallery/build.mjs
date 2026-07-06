#!/usr/bin/env node
// Рендер галереи v2 (EN, тиры, группировка по матчам) → ../docs/index.html (GitHub Pages)
// и локально gallery/index.html. Ребилд: node build-data.mjs && node build.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
// devnet-загрузки Irys живут на devnet-гейтвее, не на arweave.net (там HTML-заглушка)
const gw = (u) => (u ?? '').replace('https://arweave.net/', 'https://devnet.irys.xyz/');
const moments = JSON.parse(readFileSync(join(DIR, 'moments.json'), 'utf8'));

const EVENTS = {
  GOAL: { label: 'GOAL', tier: 'base' },
  GOAL_REVOKED: { label: 'VAR: GOAL DISALLOWED', tier: 'drama' },
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
  const tier = TIERS[ev.tier];
  return `
  <article class="card t-${ev.tier}">
    <a class="imgwrap" href="${esc(m.assetExplorer)}" target="_blank" rel="noopener">
      <img src="${esc(gw(m.image))}" alt="${esc(ev.label)} — ${esc(m.match)}" loading="lazy">
    </a>
    <div class="meta">
      <div class="row1">
        <span class="type" style="color:${tier.color};border-color:${tier.color}44">${esc(ev.label)}</span>
        ${m.verified ? '<span class="ok" title="Stat proven on-chain via validate_stat">✓ verified on-chain</span>' : '<span class="pending">pending proof</span>'}
      </div>
      <div class="match">${esc(m.match)} <b>${esc(m.score)}</b></div>
      <div class="sub">${esc(fmtTs(m.ts))} · tier: ${tier.name}</div>
      <div class="links">
        <a href="${esc(m.assetExplorer)}" target="_blank" rel="noopener">NFT ↗</a>
        ${m.proofExplorer ? `<a href="${esc(m.proofExplorer)}" target="_blank" rel="noopener">proof tx ↗</a>` : ''}
        <a href="${esc(gw(m.metadata))}" target="_blank" rel="noopener">json ↗</a>
      </div>
      <details class="prf"><summary>how is this verified?</summary>
        <p>The stat behind this card (fixture ${esc(m.fixtureId)} · seq ${esc(m.seq)} · key ${esc(m.statKey)})
        is a leaf in a Merkle tree whose daily root the TxODDS oracle publishes on Solana.
        The proof transaction replays that Merkle path inside the TxLINE program
        (<code>validate_stat</code>) — the chain itself confirms the moment happened.</p>
        ${m.proofExplorer ? `<p><a href="${esc(m.proofExplorer)}" target="_blank" rel="noopener">watch the proof run on-chain ↗</a></p>` : ''}
      </details>
    </div>
  </article>`;
};

// группировка по матчам, свежие сверху
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
    return `<section>
      <h2><span class="score">${esc(last.score)}</span> ${esc(match)} <span class="comp">${esc(comp)}</span></h2>
      <div class="grid">${ms.map(card).join('\n')}</div>
    </section>`;
  }).join('\n');

const verified = moments.filter(m => m.verified).length;
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
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: dark; --bg:#0b0e13; --panel:#12161f; --line:#222836; --mut:#8b96a8; --acc:#3ddc84; }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: #e9eef5; font: 15.5px/1.6 Inter, -apple-system, sans-serif; }
  .wrap { max-width: 1160px; margin: 0 auto; padding: 0 22px 80px; }
  header.hero { padding: 64px 0 34px; }
  .brand { font: 700 42px/1.1 "Space Grotesk", sans-serif; letter-spacing: -0.5px; }
  .brand em { font-style: normal; color: var(--acc); }
  .tag { color: #c6cfdb; font-size: 18px; margin-top: 12px; max-width: 640px; }
  .tag b { color: #fff; }
  .stats { display: flex; gap: 28px; margin-top: 22px; flex-wrap: wrap; }
  .stat { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px 18px; }
  .stat b { display: block; font: 700 22px "Space Grotesk", sans-serif; color: var(--acc); }
  .stat span { color: var(--mut); font-size: 13px; }
  .how { display: flex; gap: 10px; align-items: center; margin-top: 26px; color: var(--mut); font-size: 13.5px; flex-wrap: wrap; }
  .how .step { background: var(--panel); border: 1px solid var(--line); border-radius: 20px; padding: 5px 12px; color: #c6cfdb; }
  .how .arr { color: #4a5568; }
  .tiers { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; font-size: 13.5px; }
  .tiers span { border: 1px solid; border-radius: 20px; padding: 5px 12px; }
  section { margin-top: 44px; }
  h2 { font: 700 22px "Space Grotesk", sans-serif; margin-bottom: 16px; display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
  h2 .score { color: var(--acc); }
  h2 .comp { color: var(--mut); font: 400 13.5px Inter; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(236px, 1fr)); gap: 18px; }
  .showcase { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 18px; }
  .showcase img { width: 100%; border-radius: 14px; border: 1px solid var(--line); transition: transform .18s ease; }
  .showcase img:hover { transform: translateY(-4px) scale(1.015); }
  .latest { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 22px; }
  .latestbox { display: flex; gap: 26px; align-items: flex-start; flex-wrap: wrap; }
  .latestbox img { width: 280px; max-width: 100%; border-radius: 14px; border: 1px solid var(--line); }
  .linfo { flex: 1; min-width: 260px; }
  .linfo h3 { font: 700 24px "Space Grotesk", sans-serif; margin: 12px 0 4px; }
  .prf { margin-top: 9px; }
  .prf summary { color: var(--mut); font-size: 12.5px; cursor: pointer; }
  .prf p { color: var(--mut); font-size: 12.5px; margin-top: 7px; line-height: 1.55; }
  .prf code { color: #c6cfdb; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; transition: transform .18s ease, box-shadow .18s ease; }
  .card:hover { transform: translateY(-4px); }
  .card.t-base:hover { box-shadow: 0 10px 34px #f5a62322; }
  .card.t-drama:hover { box-shadow: 0 10px 34px #e5484d2b; }
  .card.t-legendary:hover { box-shadow: 0 10px 34px #d9b64e2b; }
  .imgwrap { display: block; aspect-ratio: 5/7; background: #0a0d12; }
  .imgwrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .meta { padding: 12px 14px 14px; }
  .row1 { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 7px; }
  .type { font-size: 11.5px; font-weight: 600; letter-spacing: .04em; padding: 3px 9px; border-radius: 20px; border: 1px solid; white-space: nowrap; }
  .ok { color: var(--acc); font-size: 11.5px; white-space: nowrap; }
  .pending { color: #d29922; font-size: 11.5px; }
  .match { font-size: 14.5px; }
  .sub { color: var(--mut); font-size: 12px; margin-top: 3px; }
  .links { margin-top: 9px; display: flex; gap: 13px; font-size: 13px; }
  a { color: #6cb6ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  footer { margin-top: 60px; color: var(--mut); font-size: 13.5px; border-top: 1px solid var(--line); padding-top: 18px; max-width: 820px; }
</style></head><body><div class="wrap">
<header class="hero">
  <div class="brand">MOMENT <em>MINTS</em></div>
  <p class="tag">Collectible cards born on-chain from <b>cryptographically verified</b> World Cup moments.
  A goal happens → the TxODDS oracle anchors it on Solana → the card mints itself. <b>No moment, no card.</b></p>
  <div class="stats">
    <div class="stat"><b>${moments.length}</b><span>moments minted</span></div>
    <div class="stat"><b>${verified}/${moments.length}</b><span>proven on-chain</span></div>
    <div class="stat"><b>${matches.size}</b><span>matches covered</span></div>
  </div>
  <div class="how">
    <span class="step">TxLINE live feed</span><span class="arr">→</span>
    <span class="step">stat-diff detector</span><span class="arr">→</span>
    <span class="step">Merkle proof · validate_stat</span><span class="arr">→</span>
    <span class="step">mint on Solana</span>
  </div>
  <div class="tiers">
    <span style="color:#f5a623;border-color:#f5a62344">base · '90s cel anime</span>
    <span style="color:#e5484d;border-color:#e5484d44">drama · spot-color manga (VAR, reds)</span>
    <span style="color:#d9b64e;border-color:#d9b64e44">legendary · ukiyo-e gold (finals)</span>
  </div>
  <p style="margin-top:20px"><a href="https://github.com/danySSG/moment-mints">github.com/danySSG/moment-mints ↗</a></p>
</header>
${(() => {
  const l = moments[moments.length - 1];
  if (!l) return '';
  const ev = EVENTS[l.type] ?? { label: l.type, tier: 'base' };
  const tier = TIERS[ev.tier];
  return `<section class="latest">
  <h2>Latest verified moment</h2>
  <div class="latestbox">
    <a href="${esc(l.assetExplorer)}" target="_blank" rel="noopener"><img src="${esc(gw(l.image))}" alt="latest moment card"></a>
    <div class="linfo">
      <span class="type" style="color:${tier.color};border-color:${tier.color}44">${esc(ev.label)}</span>
      <h3>${esc(l.match)} <b>${esc(l.score)}</b></h3>
      <p class="sub">${esc(l.competition)} · ${esc(fmtTs(l.ts))}</p>
      <p>${l.verified ? '<span class="ok">✓ proven on-chain</span> — the oracle anchored this stat, the program verified it, the card minted itself.' : 'proof pending'}</p>
      <p class="links">
        <a href="${esc(l.assetExplorer)}" target="_blank" rel="noopener">NFT ↗</a>
        ${l.proofExplorer ? `<a href="${esc(l.proofExplorer)}" target="_blank" rel="noopener">proof tx ↗</a>` : ''}
      </p>
    </div>
  </div>
</section>`;
})()}
<section>
  <h2>The cards <span class="comp">art tiers · live-minted cards join below as matches happen</span></h2>
  <div class="showcase">
    <img src="assets/tier-goal-argentina.svg" alt="GOAL card, Argentina, '90s cel tier" loading="lazy">
    <img src="assets/tier-goal-egypt.svg" alt="GOAL card, Egypt, '90s cel tier" loading="lazy">
    <img src="assets/tier-var.svg" alt="VAR goal disallowed card, ink drama tier" loading="lazy">
    <img src="assets/tier-red.svg" alt="Red card moment, ink drama tier" loading="lazy">
  </div>
</section>
${sections}
<footer>Every stat on a card is provable: its fixture/seq/statKey address a Merkle leaf published daily
on-chain by the TxODDS oracle; the "proof tx" link runs <code>validate_stat</code> in the TxLINE Solana
program against that root. Art: three "print era" tiers — rarity you can see from across the room.
Currently on devnet with placeholder card fronts; generative art tiers land with the quarter-finals.</footer>
</div></body></html>`;

mkdirSync(join(DIR, '..', 'docs'), { recursive: true });
writeFileSync(join(DIR, '..', 'docs', 'index.html'), html);
writeFileSync(join(DIR, 'index.html'), html);
console.log(`docs/index.html: ${moments.length} карточек, ${matches.size} матчей`);
