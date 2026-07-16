#!/usr/bin/env node
// Генерит статические карточки-образцы для веера на первом экране и витрины «The cards».
//
// Раньше они лежали в docs/assets/ как сделанные руками файлы, и переделка арта их не
// касалась — из-за чего первое, что видел judge, оставалось стеной оранжевого, хотя
// галерея матчей уже была в четырёх мирах. Теперь образцы собираются из тех же picks
// и того же композитора, что и настоящие карточки: система одна, расхождению взяться
// неоткуда.
//
//   node gen-tier-assets.mjs

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { momentCardArt } from '../mint/card-svg.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, '..', 'docs', 'assets');

const ts = Date.parse('2026-07-15T20:54:00Z');
// seq подобраны так, чтобы внутри архетипа взялись разные варианты пула
const samples = [
  { file: 'tier-goal-night.svg', archetype: 'night-strike', team: 'Argentina', vs: 'Egypt', score: '1-0', seq: 264 },
  { file: 'tier-goal-noon.svg', archetype: 'noon-roar', team: 'England', vs: 'Norway', score: '2-1', seq: 418 },
  { file: 'tier-goal-rain.svg', archetype: 'rain-slide', team: 'Spain', vs: 'Belgium', score: '1-1', seq: 660 },
  { file: 'tier-goal-gold.svg', archetype: 'gold-collapse', team: 'Argentina', vs: 'Egypt', score: '3-2', seq: 965 },
];

for (const s of samples) {
  const event = { type: 'GOAL', fixtureId: '18202701', seq: s.seq, ts, participant: 1, statKey: 1, from: 0, to: 1 };
  const svg = momentCardArt(event, {
    participant1: s.team, participant2: s.vs, score: s.score,
    competition: 'World Cup 2026', archetype: s.archetype,
  });
  if (!svg) { console.error(`нет арта: ${s.team}/${s.archetype}`); process.exit(1); }
  writeFileSync(join(OUT, s.file), svg);
  console.log(`  ${s.file.padEnd(24)} ${s.archetype.padEnd(14)} ${s.team}`);
}
console.log('\nVAR/RED/legendary не трогаю — у них свой тир и они и так выделялись.');
