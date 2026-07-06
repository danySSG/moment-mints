// Детектор матч-событий поверх нормализованных апдейтов TxLINE.
// Событий-фида у TxLINE нет: «гол» = дельта счётчика голов между апдейтами
// (см. projects/wc2026-hackathon.md, ранбук день-1, п.3). Этот модуль и есть дифф.
//
// Ядро ОБОИХ концептов: A (Moment Mints) минтит по событию, B (Steam Radar)
// использует ту же механику поверх odds-стрима.
//
// Эмитит события вида:
//   { type: 'GOAL'|'GOAL_REVOKED'|'YELLOW_CARD'|'RED_CARD'|'CORNER'|'PHASE_CHANGE',
//     fixtureId, seq, ts,
//     — для статов: participant, period, periodName, statKey, from, to,
//     — для фаз:   fromPhase, toPhase, fromName, toName }
//
// Гарантии:
// - устаревшие/дублирующие seq игнорируются (seq <= последнего виденного);
// - пропуск апдейтов не теряет события: дельта >1 даёт СТОЛЬКО же событий (гол 0→2
//   после разрыва стрима = два GOAL) — важно для минта «каждого момента»;
// - откат счётчика (VAR отменил гол) даёт *_REVOKED — минт-пайплайн обязан уметь
//   пометить карточку отменённой, иначе заминтим несуществующий момент;
// - первый апдейт фикстуры = базлайн, события из него не эмитятся (иначе подключение
//   в середине матча выплюнет весь счёт как «моменты сейчас»).

import { decodeStatKey, phaseName } from './statkeys.mjs';

const STAT_EVENTS = {
  goals:   { up: 'GOAL',        down: 'GOAL_REVOKED' },
  yellow:  { up: 'YELLOW_CARD', down: 'YELLOW_REVOKED' },
  red:     { up: 'RED_CARD',    down: 'RED_REVOKED' },
  corners: { up: 'CORNER',      down: 'CORNER_REVOKED' },
};

export class MatchEventDetector {
  constructor({ trackCorners = false, trackPeriodStats = false } = {}) {
    this.trackCorners = trackCorners;
    // Живые данные (05.07): тоталы матча лежат в голых ключах 1..8 (period 0), а
    // period-блоки 1xxx..7xxx устроены не по доке и дублируют инкременты. По умолчанию
    // диффим ТОЛЬКО period 0 — иначе один гол = два события (двойной минт).
    this.trackPeriodStats = trackPeriodStats;
    this.fixtures = new Map(); // fixtureId -> { seq, phaseId, stats: Map }
  }

  // update: результат normalizeUpdate(); возвращает массив событий (возможно пустой)
  ingest(update) {
    if (!update) return [];
    const { fixtureId, seq, ts, phaseId, stats, action = null } = update;
    const prev = this.fixtures.get(fixtureId);

    if (!prev) { // базлайн: запомнить, ничего не эмитить
      this.fixtures.set(fixtureId, { seq, phaseId, stats: new Map(stats) });
      return [];
    }
    if (seq <= prev.seq) return []; // stale/дубль

    const events = [];

    if (phaseId !== null && phaseId !== prev.phaseId) {
      events.push({
        type: 'PHASE_CHANGE', fixtureId, seq, ts,
        fromPhase: prev.phaseId, toPhase: phaseId,
        fromName: prev.phaseId === null ? null : phaseName(prev.phaseId),
        toName: phaseName(phaseId),
      });
    }

    for (const [key, value] of stats) {
      const before = prev.stats.get(key) ?? 0;
      if (value === before) continue;
      const d = decodeStatKey(key);
      if (!d.stat) continue; // неизвестный baseKey — молча пропускаем, не роняем
      if (d.period !== 0 && !this.trackPeriodStats) continue; // см. конструктор
      if (d.stat === 'corners' && !this.trackCorners) continue;
      const dir = value > before ? 'up' : 'down';
      const type = STAT_EVENTS[d.stat][dir];
      // дельта >1 → отдельное событие на каждый инкремент (пропущенные апдейты)
      const step = dir === 'up' ? 1 : -1;
      for (let v = before + step; dir === 'up' ? v <= value : v >= value; v += step) {
        events.push({
          type, fixtureId, seq, ts, action,
          participant: d.participant, period: d.period, periodName: d.periodName,
          statKey: key, from: v - step, to: v,
        });
      }
    }

    // фиксируем новое состояние (статы мержим: апдейт может нести не все ключи)
    const merged = new Map(prev.stats);
    for (const [k, v] of stats) merged.set(k, v);
    this.fixtures.set(fixtureId, { seq, phaseId: phaseId ?? prev.phaseId, stats: merged });
    return events;
  }
}
