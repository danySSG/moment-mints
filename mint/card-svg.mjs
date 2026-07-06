// Композитор карточки момента (SVG).
// Два режима: momentCardArt() — арт-подложка из art/picks + типографика поверх
// (тихие зоны из ART-SPEC: верх ~12%, низ ~18%); momentCardSvg() — заглушка
// без арта (fallback для событий, на которые арт не отобран).

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TIER_BY_EVENT = {
  GOAL: { tier: "'90s CEL · BASE", accent: '#f5a623', label: 'GOAL' },
  GOAL_REVOKED: { tier: 'INK DRAMA', accent: '#4aa8ff', label: 'VAR · GOAL DISALLOWED' },
  RED_CARD: { tier: 'INK DRAMA', accent: '#e5484d', label: 'RED CARD' },
  YELLOW_CARD: { tier: "'90s CEL · BASE", accent: '#dcc93d', label: 'YELLOW CARD' },
};

let PICKS = null;
function resolveArt(event, team) {
  if (PICKS === null) {
    const p = join(ROOT, 'art', 'picks.json');
    PICKS = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  }
  const paths = PICKS[`${event.type}:${team}`] ?? PICKS[`${event.type}:*`];
  if (!paths?.length) return null;
  const file = join(ROOT, paths[event.seq % paths.length]);
  return existsSync(file) ? file : null;
}

// Карточка с арт-подложкой; возвращает null, если арта на событие нет.
export function momentCardArt(event, ctx = {}) {
  const team = event.participant === 1 ? ctx.participant1 : ctx.participant2;
  const artPath = resolveArt(event, team);
  if (!artPath) return null;
  const t = TIER_BY_EVENT[event.type] ?? TIER_BY_EVENT.GOAL;
  const b64 = readFileSync(artPath).toString('base64');
  const title = ctx.participant1 && ctx.participant2
    ? `${ctx.participant1} vs ${ctx.participant2}` : `Fixture ${event.fixtureId}`;
  const when = event.ts ? new Date(Number(event.ts)).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="832" height="1216" viewBox="0 0 832 1216">
  <image href="data:image/jpeg;base64,${b64}" x="0" y="0" width="832" height="1216" preserveAspectRatio="xMidYMid slice"/>
  <linearGradient id="top" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity="0.82"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="bot" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#000" stop-opacity="0.88"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
  </linearGradient>
  <rect x="0" y="0" width="832" height="170" fill="url(#top)"/>
  <rect x="0" y="986" width="832" height="230" fill="url(#bot)"/>
  <rect x="0" y="0" width="832" height="1216" fill="none" stroke="${t.accent}" stroke-width="10"/>
  <text x="40" y="76" font-family="Helvetica,Arial" font-weight="900" font-size="44" fill="${t.accent}">${esc(t.label)}</text>
  <text x="40" y="118" font-family="Menlo,monospace" font-size="21" fill="#ffffff" fill-opacity="0.72">${esc(t.tier)}</text>
  <text x="40" y="1074" font-family="Helvetica,Arial" font-weight="700" font-size="40" fill="#ffffff">${esc(title)}</text>
  <text x="40" y="1124" font-family="Helvetica,Arial" font-weight="900" font-size="46" fill="${t.accent}">${esc(ctx.score ?? '')}</text>
  <text x="332" y="1124" font-family="Menlo,monospace" font-size="21" fill="#ffffff" fill-opacity="0.62">${esc(when)}</text>
  <text x="40" y="1172" font-family="Menlo,monospace" font-size="19" fill="#ffffff" fill-opacity="0.55">verified on-chain · fixture ${esc(event.fixtureId)} · seq ${esc(event.seq)} · stat ${esc(event.statKey ?? '-')}</text>
</svg>`;
}

const PALETTE = {
  GOAL:          { bg: '#0b3d2e', accent: '#3ddc84', label: 'GOAL' },
  GOAL_REVOKED:  { bg: '#3d0b0b', accent: '#dc3d3d', label: 'GOAL DISALLOWED' },
  YELLOW_CARD:   { bg: '#3d360b', accent: '#dcc93d', label: 'YELLOW CARD' },
  RED_CARD:      { bg: '#3d0b0b', accent: '#dc3d3d', label: 'RED CARD' },
  CORNER:        { bg: '#0b2a3d', accent: '#3da9dc', label: 'CORNER' },
  PHASE_CHANGE:  { bg: '#1b1b2f', accent: '#8888dc', label: 'MATCH PHASE' },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// event: событие детектора; ctx: { participant1, participant2, score, competition }
export function momentCardSvg(event, ctx = {}) {
  const p = PALETTE[event.type] ?? PALETTE.PHASE_CHANGE;
  const team = event.participant === 1 ? ctx.participant1 : ctx.participant2;
  const title = ctx.participant1 && ctx.participant2
    ? `${ctx.participant1} vs ${ctx.participant2}` : `Fixture ${event.fixtureId}`;
  const when = event.ts ? new Date(Number(event.ts)).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1120" viewBox="0 0 800 1120">
  <rect width="800" height="1120" fill="${p.bg}"/>
  <rect x="24" y="24" width="752" height="1072" fill="none" stroke="${p.accent}" stroke-width="3" rx="24"/>
  <text x="400" y="140" text-anchor="middle" font-family="Menlo,monospace" font-size="30" fill="#ffffff" fill-opacity="0.55">${esc(ctx.competition ?? 'TxLINE Verified Moment')}</text>
  <text x="400" y="480" text-anchor="middle" font-family="Helvetica,Arial" font-weight="900" font-size="88" fill="${p.accent}">${esc(p.label)}</text>
  ${team ? `<text x="400" y="580" text-anchor="middle" font-family="Helvetica,Arial" font-weight="700" font-size="52" fill="#ffffff">${esc(team)}</text>` : ''}
  ${ctx.score ? `<text x="400" y="680" text-anchor="middle" font-family="Menlo,monospace" font-size="64" fill="#ffffff">${esc(ctx.score)}</text>` : ''}
  <text x="400" y="800" text-anchor="middle" font-family="Helvetica,Arial" font-size="34" fill="#ffffff" fill-opacity="0.8">${esc(title)}</text>
  <text x="400" y="850" text-anchor="middle" font-family="Menlo,monospace" font-size="24" fill="#ffffff" fill-opacity="0.55">${esc(when)}</text>
  <text x="400" y="1010" text-anchor="middle" font-family="Menlo,monospace" font-size="20" fill="${p.accent}">fixture ${esc(event.fixtureId)} · seq ${esc(event.seq)} · stat ${esc(event.statKey ?? '-')} ${esc(event.from ?? '')}→${esc(event.to ?? '')}</text>
  <text x="400" y="1050" text-anchor="middle" font-family="Menlo,monospace" font-size="20" fill="#ffffff" fill-opacity="0.4">born on-chain · verified by TxLINE feed</text>
</svg>`;
}
