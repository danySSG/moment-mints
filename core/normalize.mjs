// Адаптер сырого payload'а фида → нормализованный апдейт.
// Сверено с OpenAPI (docs.yaml, 2026-07-05): апдейт скоров = схема "Scores" с полями
// id (fixture id, int32), seq (int32), ts (int64), statusSoccerId (фаза, tagged union
// вида {"H1":{}}), stats (map statKey→int32). Прежние догадки оставлены как fallback'и;
// при сюрпризах в живом сообщении (день-1) правится только этот файл.
//
// Нормализованный вид:
//   { fixtureId: string, seq: number, ts: number|string, phaseId: number|null,
//     stats: Map<number /*statKey*/, number /*value*/> }

import { PHASE_IDS } from './statkeys.mjs';

// PascalCase — реальный формат фида (живые данные 05.07: FixtureId, Seq, Ts, GameState,
// Stats, Action; «Id» — счётчик апдейта, НЕ фикстура — в списки не включать!).
// Остальные имена — fallback'и по OpenAPI и ранним догадкам.
const FIXTURE_FIELDS = ['FixtureId', 'fixtureId', 'fixture_id', 'fixture', 'fid', 'id'];
const SEQ_FIELDS = ['Seq', 'seq', 'sequence'];
const TS_FIELDS = ['Ts', 'ts', 'timestamp', 'time'];
const PHASE_FIELDS = ['GameState', 'statusSoccerId', 'gameState', 'game_state', 'phase', 'phaseId', 'state'];
const STATS_FIELDS = ['Stats', 'stats', 'statistics', 'values'];
const ACTION_FIELDS = ['Action', 'action'];

function pick(obj, names) {
  for (const n of names) if (obj?.[n] !== undefined) return obj[n];
  return undefined;
}

// Статы принимаем в любой из форм:
//   map:   { "1001": 2, "2001": 1 }
//   array: [ { key: 1001, value: 2 }, ... ]  (имена key/statKey, value/val)
export function normalizeStats(raw) {
  const out = new Map();
  if (raw == null) return out;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const key = Number(item.key ?? item.statKey ?? item.k);
      const value = Number(item.value ?? item.val ?? item.v);
      if (Number.isFinite(key) && Number.isFinite(value)) out.set(key, value);
    }
    return out;
  }
  if (typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      const key = Number(k), value = Number(v);
      if (Number.isFinite(key) && Number.isFinite(value)) out.set(key, value);
    }
  }
  return out;
}

// Фаза может прийти числом (ID), строкой-кодом ("H2"), числовой строкой ("4")
// или tagged-union-объектом ({"H2":{}}) — приводим к числовому ID или null.
export function normalizePhase(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
    return PHASE_IDS[raw] ?? null;
  }
  if (typeof raw === 'object') {
    const inner = raw.id ?? raw.phaseId ?? raw.value;
    if (inner !== undefined) return normalizePhase(inner);
    const keys = Object.keys(raw);
    if (keys.length === 1 && PHASE_IDS[keys[0]] !== undefined) return PHASE_IDS[keys[0]];
    return null;
  }
  return null;
}

export function normalizeUpdate(payload) {
  if (payload == null || typeof payload !== 'object') return null;
  const fixtureId = pick(payload, FIXTURE_FIELDS);
  const seq = Number(pick(payload, SEQ_FIELDS));
  if (fixtureId === undefined || !Number.isFinite(seq)) return null;
  return {
    fixtureId: String(fixtureId),
    seq,
    ts: pick(payload, TS_FIELDS) ?? null,
    phaseId: normalizePhase(pick(payload, PHASE_FIELDS)),
    stats: normalizeStats(pick(payload, STATS_FIELDS)),
    // событийная метка фида: goal / yellow_card / var / action_discarded / kickoff /
    // game_finalised / … (живые данные 05.07). Детектор цепляет её к событиям.
    action: pick(payload, ACTION_FIELDS) ?? null,
    // НАСТОЯЩИЕ часы матча (Clock.Seconds, накопительно, включая доп. время).
    // Минуту НЕЛЬЗЯ считать как ts - StartTime: там перерыв, добавленное и поздний
    // старт — на Argentina-Switzerland это давало 163' вместо реальных 120.7'.
    clockSeconds: Number.isFinite(Number(payload?.Clock?.Seconds))
      ? Number(payload.Clock.Seconds) : null,
  };
}
