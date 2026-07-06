// TxLINE soccer feed — декодер statKey.
// Источник: txline.txodds.com/documentation/scores/soccer-feed (проверено 2026-07-05):
//   statKey = period * 1000 + baseKey
//   базовые ключи 1..8 = Goals / Yellow / Red / Corners × два участника
//   подтверждённый докой пример: 1001 = "Participant 1 H1 Goals"  → baseKey 1 = P1 Goals.
//
// ✅ ПОДТВЕРЖДЕНО 2026-07-05 по полной таблице доки (soccer-feed): ключи 1..8 =
// P1/P2 Goals, P1/P2 Yellow, P1/P2 Red, P1/P2 Corners — ровно как ниже. Допущение снято.
export const BASE_KEYS = {
  1: { stat: 'goals',   participant: 1 },
  2: { stat: 'goals',   participant: 2 },
  3: { stat: 'yellow',  participant: 1 },
  4: { stat: 'yellow',  participant: 2 },
  5: { stat: 'red',     participant: 1 },
  6: { stat: 'red',     participant: 2 },
  7: { stat: 'corners', participant: 1 },
  8: { stat: 'corners', participant: 2 },
};

export const PERIODS = {
  0: 'FT',  // голые ключи 1..8 — тоталы за весь матч (подтверждено живыми данными 05.07:
            // финальный счёт 3:2 = {"1":3,"2":2}; события детектим ТОЛЬКО по ним)
  1: 'H1',  // +1000
  2: 'H2',  // +2000
  3: 'ET1', // +3000
  4: 'ET2', // +4000
  5: 'PS',  // +5000 (пенальти)
};
// ⚠️ Реальность (Аргентина–Кабо-Верде, 1243 апдейта): в фиде есть блоки вплоть до 7xxx,
// и их суммы НЕ сходятся с тоталами по доковской схеме «period*1000+baseKey».
// Раскладка блоков не расшифрована — детектор их игнорирует (см. events.mjs), иначе
// один гол даёт два события (тотал + блок) = двойной минт.

// Фазы игры: полная таблица 1..19 из доки (подтверждено 2026-07-05).
export const PHASES = {
  1: 'NS', 2: 'H1', 3: 'HT', 4: 'H2', 5: 'F', 6: 'WET', 7: 'ET1', 8: 'HTET',
  9: 'ET2', 10: 'FET', 11: 'WPE', 12: 'PE', 13: 'FPE', 14: 'I', 15: 'A',
  16: 'C', 17: 'TXCC', 18: 'TXCS', 19: 'P',
};

// Обратная таблица: код фазы → ID. Нужна normalize.mjs: фид сериализует фазу
// не числом, а кодом/tagged-union'ом ({"H1":{}} — так в OpenAPI-схеме SoccerFixtureStatus).
export const PHASE_IDS = Object.fromEntries(
  Object.entries(PHASES).map(([id, code]) => [code, Number(id)])
);

export function phaseName(id) {
  return PHASES[id] ?? `PHASE_${id}`;
}

// 2019 → { period: 2, periodName: 'H2', baseKey: 19, stat: null } (неизвестный ключ не роняет)
export function decodeStatKey(key) {
  const period = Math.floor(key / 1000);
  const baseKey = key % 1000;
  const base = BASE_KEYS[baseKey] ?? null;
  return {
    key,
    period,
    periodName: PERIODS[period] ?? `P${period}`,
    baseKey,
    stat: base?.stat ?? null,
    participant: base?.participant ?? null,
  };
}
