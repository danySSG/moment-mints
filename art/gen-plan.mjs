#!/usr/bin/env node
// Собирает план генерации по системе архетипов: node gen-plan.mjs Spain Argentina [--n 2]
// → art/plan-arch-<team>.json (7 архетипов × n картинок), дальше: node generate.mjs <plan>

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHETYPES, promptFor, JERSEY, HOUSE_PREFIX } from './archetypes.mjs';

// у общих (net) человека в кадре нет — 1boy/solo из house-префикса убираем
const HOUSE_PREFIX_NOSOLO = HOUSE_PREFIX
  .replace(', 1boy, solo, human male soccer player', '');

const DIR = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const nI = argv.indexOf('--n');
const n = nI === -1 ? 2 : Number(argv[nI + 1]);
const teams = argv.filter((a, i) => !a.startsWith('--') && (nI === -1 || (i !== nI && i !== nI + 1)));
if (!teams.length) { console.error('usage: node gen-plan.mjs <Team> [Team…] [--n 2]'); process.exit(2); }

// teamAgnostic-архетипы (net: формы в кадре нет) генерим ОДИН раз общим пулом
if (teams[0] === 'shared') {
  const plan = ARCHETYPES.filter(a => a.teamAgnostic).map(a => ({
    slug: `arch-shared-${a.key}`,
    quantity: n,
    negative: a.negative || undefined,
    prompt: `${HOUSE_PREFIX_NOSOLO}, ${a.body}`,
  }));
  const file = join(DIR, 'plan-arch-shared.json');
  writeFileSync(file, JSON.stringify(plan, null, 2) + '\n');
  console.log(`${file}: ${plan.length} общих × ${n} = ${plan.length * n} картинок`);
  process.exit(0);
}

for (const team of teams) {
  if (!JERSEY[team]) { console.error(`нет цвета формы для "${team}" — добавь в archetypes.mjs`); process.exit(2); }
  const plan = ARCHETYPES.filter(a => !a.teamAgnostic).map(a => ({
    slug: `arch-${team.toLowerCase().replace(/\s+/g, '')}-${a.key}`,
    quantity: n,
    negative: a.negative || undefined,
    prompt: promptFor(a.key, team),
  }));
  const file = join(DIR, `plan-arch-${team.toLowerCase().replace(/\s+/g, '')}.json`);
  writeFileSync(file, JSON.stringify(plan, null, 2) + '\n');
  console.log(`${file}: ${plan.length} архетипов × ${n} = ${plan.length * n} картинок (~${plan.length * n * 3} buzz)`);
}
