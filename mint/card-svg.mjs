// Генератор карточки-заглушки (SVG) для момента матча.
// Это ВРЕМЕННЫЙ вид карточки: в дни 3–4 сюда встанет композиция из пре-рендеренных
// SD-стилей оператора; событие меняет только текстовый слой и палитру.

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
  <text x="400" y="140" text-anchor="middle" font-family="Menlo,monospace" font-size="30" fill="#ffffff88">${esc(ctx.competition ?? 'TxLINE Verified Moment')}</text>
  <text x="400" y="480" text-anchor="middle" font-family="Helvetica,Arial" font-weight="900" font-size="88" fill="${p.accent}">${esc(p.label)}</text>
  ${team ? `<text x="400" y="580" text-anchor="middle" font-family="Helvetica,Arial" font-weight="700" font-size="52" fill="#ffffff">${esc(team)}</text>` : ''}
  ${ctx.score ? `<text x="400" y="680" text-anchor="middle" font-family="Menlo,monospace" font-size="64" fill="#ffffff">${esc(ctx.score)}</text>` : ''}
  <text x="400" y="800" text-anchor="middle" font-family="Helvetica,Arial" font-size="34" fill="#ffffffcc">${esc(title)}</text>
  <text x="400" y="850" text-anchor="middle" font-family="Menlo,monospace" font-size="24" fill="#ffffff88">${esc(when)}</text>
  <text x="400" y="1010" text-anchor="middle" font-family="Menlo,monospace" font-size="20" fill="${p.accent}">fixture ${esc(event.fixtureId)} · seq ${esc(event.seq)} · stat ${esc(event.statKey ?? '-')} ${esc(event.from ?? '')}→${esc(event.to ?? '')}</text>
  <text x="400" y="1050" text-anchor="middle" font-family="Menlo,monospace" font-size="20" fill="#ffffff66">born on-chain · verified by TxLINE feed</text>
</svg>`;
}
