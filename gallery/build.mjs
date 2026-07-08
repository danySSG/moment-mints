#!/usr/bin/env node
// Рендер галереи v3 «вау-проход» (EN): hero с веером карточек, 3D-tilt, staggered-
// анимации, счётчики, стадионное свечение фона. Ванильный CSS/JS, без фреймворков.
// Выход: ../docs/index.html (GitHub Pages) + gallery/index.html (локально).
// Ребилд: node build-data.mjs && node build.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const gw = (u) => (u ?? '').replace('https://arweave.net/', 'https://devnet.irys.xyz/');
const moments = JSON.parse(readFileSync(join(DIR, 'moments.json'), 'utf8'));

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
  const tier = TIERS[ev.tier];
  return `
  <article class="card t-${ev.tier}" data-tilt>
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

const verified = moments.filter(m => m.verified).length;
const latest = moments[moments.length - 1];
const latestEv = latest ? (EVENTS[latest.type] ?? { label: latest.type, tier: 'base' }) : null;
const latestTier = latestEv ? TIERS[latestEv.tier] : null;

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
  .stats { display: flex; gap: 12px; margin-top: 26px; flex-wrap: wrap; }
  .stat { background: rgba(18,22,31,.7); border: 1px solid var(--line); border-radius: 12px; padding: 10px 16px; backdrop-filter: blur(4px); }
  .stat b { display: block; font: 700 22px "Space Grotesk", sans-serif; color: var(--acc); }
  .stat > span { color: var(--mut); font-size: 12.5px; }
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
      <div class="stat"><b data-count="${matches.size}">${matches.size}</b><span>matches covered</span></div>
    </div>
    <div class="cta rise" style="--d:.36s">
      <a class="btn" href="#latest">Latest moment ↓</a>
      <a class="btn ghost" href="https://github.com/danySSG/moment-mints">GitHub ↗</a>
    </div>
  </div>
  <div class="deck" aria-hidden="true">
    <img src="assets/tier-goal-egypt.svg" alt="" style="--x:-148px; --r:-16deg; --d:.15s; z-index:1">
    <img src="assets/tier-var.svg" alt="" style="--x:-74px; --r:-8deg; --d:.27s; z-index:2">
    <img src="assets/tier-legendary.svg" alt="" style="--x:0px; --r:0deg; --d:.39s; z-index:3">
    <img src="assets/tier-red.svg" alt="" style="--x:74px; --r:8deg; --d:.51s; z-index:2">
    <img src="assets/tier-goal-argentina.svg" alt="" style="--x:148px; --r:16deg; --d:.63s; z-index:1">
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
  <h2>The cards <span class="comp">art tiers · live-minted cards join below as matches happen</span></h2>
  <div class="showcase">
    <img src="assets/tier-goal-argentina.svg" alt="GOAL card, Argentina, '90s cel tier" loading="lazy" data-tilt>
    <img src="assets/tier-goal-egypt.svg" alt="GOAL card, Egypt, '90s cel tier" loading="lazy" data-tilt>
    <img src="assets/tier-var.svg" alt="VAR goal disallowed card, ink drama tier" loading="lazy" data-tilt>
    <img src="assets/tier-red.svg" alt="Red card moment, ink drama tier" loading="lazy" data-tilt>
    <img src="assets/tier-legendary.svg" alt="Legendary goal card, ukiyo-e tier" loading="lazy" data-tilt>
  </div>
</section>
${sections}
<footer>Every stat on a card is provable: its fixture/seq/statKey address a Merkle leaf published daily
on-chain by the TxODDS oracle; the "proof tx" link runs <code class="mono">validate_stat</code> in the TxLINE Solana
program against that root. Art: three "print era" tiers — rarity you can see from across the room.
Devnet build for the TxODDS × Solana World Cup Hackathon · <a href="https://github.com/danySSG/moment-mints">source ↗</a></footer>
</div>
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
