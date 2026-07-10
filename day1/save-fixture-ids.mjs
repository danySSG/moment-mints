#!/usr/bin/env node
// Страховка от потери fixture id: снапшот /api/fixtures/snapshot показывает ТОЛЬКО
// будущие матчи — после финального свистка id исчезает навсегда, а исторические
// данные без id не запросить (так потеряли France–Morocco 09.07).
// Вызывается при каждом старте night-shift.sh; дописывает лог со всеми id.
//   node day1/save-fixture-ids.mjs

import { readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
for (const l of readFileSync(join(DIR, '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2];
}
const API = process.env.TXLINE_API_ORIGIN ?? 'https://txline-dev.txodds.com';
const H = { Authorization: `Bearer ${process.env.TXLINE_JWT}`, 'X-Api-Token': process.env.TXLINE_API_TOKEN };

try {
  const r = await fetch(`${API}/api/fixtures/snapshot`, { headers: H });
  const d = await r.json();
  const arr = Array.isArray(d) ? d : (d.fixtures ?? []);
  const at = new Date().toISOString();
  for (const f of arr) {
    appendFileSync(join(DIR, 'fixture-ids-log.ndjson'), JSON.stringify({
      at, fixtureId: f.FixtureId, p1: f.Participant1, p2: f.Participant2,
      start: f.StartTime, competition: f.Competition,
    }) + '\n');
  }
  console.log(`[fixture-ids] сохранено ${arr.length} фикстур (${at})`);
  arr.forEach(f => console.log(`  ${f.FixtureId}  ${f.Participant1} vs ${f.Participant2}  ${f.StartTime}`));
} catch (e) {
  console.error('[fixture-ids] не смог сохранить снапшот:', e.message);
}
