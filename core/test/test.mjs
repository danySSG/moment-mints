// node --test test/  — синтетический матч + краевые случаи детектора.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchEventDetector } from '../events.mjs';
import { normalizeUpdate, normalizeStats, normalizePhase } from '../normalize.mjs';
import { decodeStatKey } from '../statkeys.mjs';

const F = 'fx-test-1';
const u = (seq, phaseId, stats) =>
  normalizeUpdate({ fixtureId: F, seq, ts: seq * 10, gameState: phaseId, stats });

test('decodeStatKey: подтверждённый докой пример 1001 = P1 H1 Goals', () => {
  const d = decodeStatKey(1001);
  assert.equal(d.stat, 'goals');
  assert.equal(d.participant, 1);
  assert.equal(d.periodName, 'H1');
});

test('normalizeStats: map и array дают одно и то же', () => {
  const asMap = normalizeStats({ '1001': 2, '2003': 1 });
  const asArr = normalizeStats([{ key: 1001, value: 2 }, { statKey: 2003, val: 1 }]);
  assert.deepEqual([...asMap.entries()].sort(), [...asArr.entries()].sort());
});

test('сценарий матча: kickoff → гол → жёлтая → HT → гол → VAR-отмена → красная', () => {
  const det = new MatchEventDetector();
  // базлайн (NS): событий нет
  assert.deepEqual(det.ingest(u(1, 1, {})), []);
  // NS → H1
  let ev = det.ingest(u(2, 2, {}));
  assert.deepEqual(ev.map(e => e.type), ['PHASE_CHANGE']);
  assert.equal(ev[0].toName, 'H1');
  // гол P1 (тотал, голый ключ 1)
  ev = det.ingest(u(3, 2, { '1': 1 }));
  assert.deepEqual(ev.map(e => e.type), ['GOAL']);
  assert.equal(ev[0].participant, 1);
  assert.equal(ev[0].periodName, 'FT');
  // жёлтая P2 (голый ключ 4)
  ev = det.ingest(u(4, 2, { '4': 1 }));
  assert.deepEqual(ev.map(e => e.type), ['YELLOW_CARD']);
  assert.equal(ev[0].participant, 2);
  // HT
  ev = det.ingest(u(5, 3, {}));
  assert.equal(ev[0].toName, 'HT');
  // H2 + гол P2 (ключ 2)
  ev = det.ingest(u(6, 4, { '2': 1 }));
  assert.deepEqual(ev.map(e => e.type).sort(), ['GOAL', 'PHASE_CHANGE']);
  // VAR: гол P2 отменён (2: 1 → 0)
  ev = det.ingest(u(7, 4, { '2': 0 }));
  assert.deepEqual(ev.map(e => e.type), ['GOAL_REVOKED']);
  assert.equal(ev[0].from, 1);
  assert.equal(ev[0].to, 0);
  // красная P1 (ключ 5)
  ev = det.ingest(u(8, 4, { '5': 1 }));
  assert.deepEqual(ev.map(e => e.type), ['RED_CARD']);
});

test('разрыв стрима: дельта голов 0→2 = ДВА события GOAL', () => {
  const det = new MatchEventDetector();
  det.ingest(u(1, 2, { '1': 0 }));
  const ev = det.ingest(u(9, 2, { '1': 2 }));
  assert.deepEqual(ev.map(e => e.type), ['GOAL', 'GOAL']);
  assert.deepEqual(ev.map(e => e.to), [1, 2]);
});

test('stale seq игнорируется, состояние не портится', () => {
  const det = new MatchEventDetector();
  det.ingest(u(1, 2, { '1': 0 }));
  det.ingest(u(5, 2, { '1': 1 }));
  assert.deepEqual(det.ingest(u(3, 2, { '1': 0 })), []); // опоздавший апдейт
  // следующий свежий апдейт без изменений — событий нет (состояние не откатилось)
  assert.deepEqual(det.ingest(u(6, 2, { '1': 1 })), []);
});

test('подключение в середине матча: счёт из базлайна не эмитится', () => {
  const det = new MatchEventDetector();
  const ev = det.ingest(u(100, 4, { '1': 2, '2': 1 }));
  assert.deepEqual(ev, []);
});

test('частичный апдейт не теряет ранее виденные статы (мерж)', () => {
  const det = new MatchEventDetector();
  det.ingest(u(1, 2, { '1': 1, '4': 1 }));
  det.ingest(u(2, 2, { '4': 2 })); // апдейт только по жёлтым
  // гол «вернулся» в следующем полном апдейте с тем же значением — события нет
  assert.deepEqual(det.ingest(u(3, 2, { '1': 1 })), []);
});

test('неизвестный baseKey и corners (по умолчанию выкл) пропускаются молча', () => {
  const det = new MatchEventDetector();
  det.ingest(u(1, 2, {}));
  const ev = det.ingest(u(2, 2, { '19': 5, '7': 3 }));
  assert.deepEqual(ev, []);
});

test('period-блоки (1xxx..7xxx) игнорируются по умолчанию — нет двойного минта', () => {
  const det = new MatchEventDetector();
  det.ingest(u(1, 2, { '1': 0, '1001': 0, '2001': 0 }));
  // гол: тотал и блоки инкрементятся одним апдейтом — событие должно быть ОДНО
  const ev = det.ingest(u(2, 2, { '1': 1, '1001': 1, '2001': 1 }));
  assert.deepEqual(ev.map(e => e.type), ['GOAL']);
  assert.equal(ev[0].statKey, 1);
  // с trackPeriodStats: true блоки снова видны (для отладки раскладки)
  const det2 = new MatchEventDetector({ trackPeriodStats: true });
  det2.ingest(u(1, 2, { '1001': 0 }));
  assert.equal(det2.ingest(u(2, 2, { '1001': 1 })).length, 1);
});

test('PascalCase-фид (реальный формат 05.07): поля и Action цепляются', () => {
  const det = new MatchEventDetector();
  const p = (Seq, Stats, Action) => normalizeUpdate(
    { FixtureId: 18175918, Seq, Ts: Seq, GameState: 'scheduled', Action, Stats, Id: Seq });
  assert.equal(p(0, {}).fixtureId, '18175918'); // FixtureId, а не Id
  det.ingest(p(0, { '1': 0 }, 'kickoff'));
  const ev = det.ingest(p(1, { '1': 1 }, 'goal'));
  assert.deepEqual(ev.map(e => e.type), ['GOAL']);
  assert.equal(ev[0].action, 'goal');
});

test('формы из OpenAPI: id/statusSoccerId/tagged-union фаза нормализуются', () => {
  assert.equal(normalizePhase('H2'), 4);
  assert.equal(normalizePhase({ H1: {} }), 2);
  const up = normalizeUpdate({ id: 42, seq: 7, ts: 1, statusSoccerId: { HT: {} }, stats: { '1001': 1 } });
  assert.equal(up.fixtureId, '42');
  assert.equal(up.phaseId, 3);
  assert.equal(up.stats.get(1001), 1);
});

test('normalizeUpdate: без fixtureId/seq → null, детектор переживает', () => {
  const det = new MatchEventDetector();
  assert.equal(normalizeUpdate({ foo: 1 }), null);
  assert.deepEqual(det.ingest(null), []);
});
