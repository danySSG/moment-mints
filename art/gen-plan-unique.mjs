#!/usr/bin/env node
// План ПЕР-ГОЛ уникальной генерации: каждому сминченному GOAL — свой промпт
// (мир из mint-log + поза по seq) и 3 кандидата на отбор глазами.
//   node gen-plan-unique.mjs        → art/plan-unique.json
// Дальше: node generate.mjs plan-unique.json (слаги u-<fixture>-<seq>-NN.jpeg)

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promptForPose } from './poses.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const rows = readFileSync(join(DIR, '..', 'mint', 'mint-log.ndjson'), 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));

const plan = [];
for (const r of rows) {
  const e = r.event ?? {};
  if (e.type !== 'GOAL' || !r.archetype) continue;  // мир проставлен переделкой v2
  const team = e.participant === 1 ? r.ctx?.participant1 : r.ctx?.participant2;
  if (!team) continue;
  const { pose, prompt, negative } = promptForPose(r.archetype, Number(e.seq), team);
  plan.push({
    slug: `u-${e.fixtureId}-${e.seq}`,
    quantity: 3,
    negative: negative || undefined,
    prompt,
    // мета для навигации при курировании (generate.mjs лишние поля игнорирует)
    _match: `${r.ctx?.participant1} vs ${r.ctx?.participant2} ${r.ctx?.score ?? ''}`,
    _team: team, _world: r.archetype, _pose: pose,
  });
}
writeFileSync(join(DIR, 'plan-unique.json'), JSON.stringify(plan, null, 2) + '\n');
console.log(`plan-unique.json: ${plan.length} голов × 3 = ${plan.length * 3} картинок (~${plan.length * 9} buzz)`);
const byPose = {};
for (const p of plan) byPose[`${p._world}/${p._pose}`] = (byPose[`${p._world}/${p._pose}`] ?? 0) + 1;
for (const k of Object.keys(byPose).sort()) console.log(`  ${k.padEnd(24)} ${byPose[k]}`);
