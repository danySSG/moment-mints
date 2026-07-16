// Считает архетип карточки для события: роль гола → архетип, с гарантией
// «архетип тратится один раз за матч».
//
// Состояние между голами держать негде — каждый гол минтится ОТДЕЛЬНЫМ процессом
// mint-moment (minter спавнит его через execFile). Поэтому набор уже потраченных
// архетипов восстанавливаем из mint-log.ndjson по fixtureId. Побочный плюс:
// перезапуск смены/бэкфилл не сбрасывают набор.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { goalRole, pickArchetype } from '../art/archetypes.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const LOG = join(DIR, 'mint-log.ndjson');

// Архетипы, уже потраченные в этом матче (по порядку минта).
export function usedInFixture(fixtureId, { excludeSeq } = {}) {
  const used = new Set();
  if (!existsSync(LOG)) return used;
  for (const line of readFileSync(LOG, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (String(r.event?.fixtureId) !== String(fixtureId)) continue;
      if (excludeSeq !== undefined && r.event?.seq === excludeSeq) continue;
      if (r.archetype) used.add(r.archetype);
    } catch { /* битая строка лога — пропускаем */ }
  }
  return used;
}

// score — счёт ПОСЛЕ гола ("1-2"); kickoff — StartTime матча (ms) для минуты.
// Возвращает null, если данных не хватает (тогда card-svg падает на старый путь).
export function archetypeFor(event, { score, kickoff, used } = {}) {
  if (event.type !== 'GOAL' || event.legendary) return null;
  if (!score || !Number.isFinite(Number(kickoff))) return null;

  const after = String(score).split('-').map(Number);
  if (after.length !== 2 || after.some(n => !Number.isFinite(n))) return null;
  const before = [...after];
  const i = event.participant === 1 ? 0 : 1;
  before[i] = Math.max(0, before[i] - 1); // этот гол откатываем — получаем счёт ДО

  const minute = Math.max(0, Math.round((Number(event.ts) - Number(kickoff)) / 60000));
  const role = goalRole({ scoredBy: event.participant, before, after, minute });
  return {
    role,
    minute,
    archetype: pickArchetype(role, used ?? usedInFixture(event.fixtureId, { excludeSeq: event.seq })),
  };
}
