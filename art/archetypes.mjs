// Система архетипов карточки GOAL: семь «миров» (поза + палитра залочены вместе).
//
// ПОЧЕМУ: раньше был один промпт на все команды — «close-up, roaring, fists clenched,
// golden confetti, sunset gold sky» — менялся только цвет формы. Карточки совпадали по
// значению, тону и силуэту (первые три вещи, которые считывает глаз), а форма стояла на
// четвёртом месте, ниже разрешения, которым реально смотрят. Итог — стена оранжевого.
//
// ПРАВИЛА (нарушишь — вернётся стена):
//   1. ЗОЛОТО — ЭТО РАНГ, А НЕ ЛУК. Только gold-collapse. В остальных шести стоит явный
//      "no confetti" + негатив на warm drift: SDXL уползает в тёплый закат, стоит оставить
//      небо неуказанным — именно этот дрейф и построил стену.
//   2. ФОРМА — ЕДИНСТВЕННЫЙ НАСЫЩЕННЫЙ ЦВЕТ В КАДРЕ. Небу цвет команды не отдаём никогда.
//      Фоны обесцвечены или почти чёрные, поэтому команда читается СИЛЬНЕЕ, а не слабее.
//   3. СЕМЬ, НЕ ВОСЕМЬ. Каждый архетип ≈14% галереи; каждый лишний размывает узнаваемость.
//
// СЕМЬЮ МИРАМИ ДЕРЖИТ НЕ ПАЛИТРА, А ОБРАБОТКА: house-префикс (ink outlines, cel-shading,
// film grain, 90s OVA) остаётся дословно. Одна плёнка, снятая через весь турнир: та же
// зернистость, разные часы.
//
// ТЕСТ ПРИЁМКИ: контактный лист 4-в-ряд по 300px, затем обесцветить. Если два тайла
// совпали по значению И силуэту — один лишний.

export const HOUSE_PREFIX =
  'masterpiece, retro artstyle, 1990s anime style, cel shading, bold ink outlines, film grain, vintage sports anime, 1boy, solo, human male soccer player';

// ── УРОКИ, ОПЛАЧЕННЫЕ BUZZ (16.07, ~90 картинок за три итерации) ──────────────
// Задумывалось семь «миров». Выжили ЧЕТЫРЕ. Что убило остальные — не повторять:
//
//   1. ДЛИННЫЙ ПРОМПТ = ПОТЕРЯННАЯ КОМПОЗИЦИЯ. Тела на 60-80 слов illustrious
//      проглатывает и сваливается в дефолт. Держим 25-30 слов, композиция — ПЕРВЫМ
//      токеном.
//   2. СЛОВА-КОЛЛИЗИИ. "collar" → надел ошейник с шипами. "violet" в описании неба →
//      написал VIOLET текстом НА ФУТБОЛКЕ. Цветовые/предметные слова модель охотно
//      печатает на одежде — экзотику из промпта убираем.
//   3. ВИД СО СПИНЫ = МАГНИТ ДЛЯ НОМЕРА. flash-back дал номер и выдуманную фамилию
//      на 3 из 3 («PILON 4», «ROLE 13»). Негатив бессилен. Архетип выкинут: спина в
//      кадре — значит номер в кадре. НЕ ПРОБОВАТЬ СНОВА.
//   4. АБСТРАКТНЫЙ ОБЪЕКТ НЕ ВЫВОЗИТ. net («мяч в воротах») → волейбольная сетка
//      4 из 4. Модель знает игрока, а не предмет.
//   5. ЭКЗОТИЧЕСКИЙ РЕКВИЗИТ. dusk-walk («мяч под мышкой») → мяч на поводке.
//   6. ЖЁСТКИЙ СВЕТ ЛЕПИТ МАСКУ. "hard overhead sun, sharp cel shadows" → чёрная
//      клякса вместо лица. Свет описываем мягче.
//   7. furry/animal живут в BASE_NEGATIVE (generate.mjs), не здесь: потеряв их при
//      переписывании планов, я получил волка-оборотня в футболке.
//
// ЧТО ИЗ ЭТОГО СЛЕДУЕТ: модель надёжно умеет 3-4 позы футболиста. Гнаться за
// экзотикой = бесконечная перегенерация. Разницу тащит ПАЛИТРА — она сработала на
// 100% попыток (ни одной оранжевой из ~90). Поэтому: НАДЁЖНАЯ ПОЗА × РАЗНЫЙ СВЕТ.
//
// Порядок = лестница значений, от самого светлого к самому тёмному.
export const ARCHETYPES = [
  {
    key: 'noon-roar',
    lighting: 'выбеленный полдень, бледный циан — самый светлый и холодный тайл',
    // "hard overhead sun, sharp cel shadows" давало чёрную кляксу вместо лица У ВСЕХ
    // команд (урок 6). Свет описываем мягко и ровно — палитру это не теряет.
    body: 'close-up, roaring in triumph, both fists clenched at his chest, <JERSEY>, low angle, bright midday, pale washed-out blue sky, clear even daylight, face fully lit, no confetti',
    negative: 'confetti, gold, orange sky, sunset, warm light, harsh shadow on face, black shadow face, backlit silhouette',
  },
  {
    key: 'gold-collapse',
    lighting: 'ЗОЛОТО — единственный тёплый тайл из семи, максимальная насыщенность',
    body: 'high angle looking straight down, on both knees in deep grass, head tipped back, arms hanging loose at his sides, <JERSEY>, golden hour, warm amber light, gold confetti drifting',
    negative: '',
  },
  {
    key: 'rain-slide',
    lighting: 'серый дождь, обесцвеченный — форма единственное насыщенное пятно',
    body: 'sliding on his knees, body low and horizontal, fists at his sides, soaked, head back shouting, <JERSEY>, low angle from grass level, grey overcast rain, heavy rain streaks, water spraying, desaturated grey green',
    negative: 'confetti, gold, orange sky, sunset, warm light, arms spread wide, open palms',
  },
  {
    key: 'night-strike',
    lighting: 'чёрное + серебро — самый тёмный тайл, хроматы нет',
    body: 'side-on mid-kick, boot striking the ball, body arced, teeth bared, <JERSEY>, full figure, night match, hard white cross-light, silver rim light, black sky, wet turf reflections, ink speed lines',
    negative: 'confetti, gold, orange sky, sunset, warm light, smiling, grin, celebrating',
  },
];

export const BY_KEY = Object.fromEntries(ARCHETYPES.map(a => [a.key, a]));

export const JERSEY = {
  Argentina: 'sky blue and white striped jersey',
  Belgium: 'red jersey with black and yellow trim',
  Brazil: 'bright yellow jersey with green trim',
  Colombia: 'yellow jersey with blue and red trim',
  Egypt: 'red jersey with white trim',
  England: 'clean white jersey with navy blue trim',
  France: 'deep blue jersey with white and red trim',
  Mexico: 'deep green jersey with white and red trim',
  Norway: 'crimson red jersey with navy blue and white trim',
  Portugal: 'dark red jersey with green trim',
  Spain: 'red jersey with golden yellow trim',
  Switzerland: 'bright red jersey with white trim',
  USA: 'white jersey with navy blue and red trim',
  'Cape Verde': 'blue jersey with white and red trim',
};

// Полный промпт архетипа для команды.
export function promptFor(archetypeKey, team) {
  const a = BY_KEY[archetypeKey];
  if (!a) throw new Error(`нет архетипа ${archetypeKey}`);
  const jersey = JERSEY[team];
  if (!jersey) throw new Error(`нет цвета формы для ${team}`);
  return `${HOUSE_PREFIX}, ${a.body.replace('<JERSEY>', jersey)}`;
}

// ── Роль гола → архетип ────────────────────────────────────────────────────────
// Роль — чистая функция от (счёт ДО, счёт ПОСЛЕ, минута, кто забил). Никогда от
// финального счёта: «победный гол» на 70-й минуте станет ложью к 80-й, а карточка
// уже сминчена. Ничего из будущего.

export function goalRole({ scoredBy, before, after, minute }) {
  const my = scoredBy === 1 ? 0 : 1, opp = scoredBy === 1 ? 1 : 0;
  const wasAhead = before[my] > before[opp];
  const nowAhead = after[my] > after[opp];
  const nowLevel = after[my] === after[opp];
  const first = before[0] + before[1] === 0;
  // поздний гол, забирающий/возвращающий лидерство — честная, вычислимая версия
  // «победного»: утверждает «поздно вышли вперёд», а не «выиграли матч»
  if (minute >= 80 && nowAhead && !wasAhead) return 'late-lead';
  if (first) return minute < 25 ? 'opener-early' : 'opener-late';
  if (nowLevel) return 'equalizer';
  if (nowAhead && !wasAhead) return 'go-ahead';
  if (nowAhead && wasAhead) return 'extending';
  return 'consolation'; // забил, но всё ещё позади
}

const ROLE_TO_ARCHETYPE = {
  'late-lead': 'gold-collapse',   // золото тратится редко — только поздний выход вперёд
  'opener-early': 'night-strike',
  'opener-late': 'night-strike',
  equalizer: 'rain-slide',
  'go-ahead': 'noon-roar',
  extending: 'night-strike',
  consolation: 'rain-slide',
};

// Лестница добора при коллизии. Роли распределены неравномерно: разгром 5-0 даёт
// extending ×3 — три одинаковые карточки внутри матча, там сходство виднее всего.
// Поэтому архетип ПОТРЕБЛЯЕТСЯ один раз за матч, дальше падаем по лестнице.
//
// gold-collapse В ЛЕСТНИЦУ НЕ ВХОДИТ намеренно. Иначе (проверено тестом на реальном
// Argentina-Egypt) сравнявший гол на 67' добирает золото по лестнице, а настоящему
// позднему победному на 84' его уже не достаётся — золото выпадает дважды за матч и
// перестаёт быть рангом. Золото достижимо ТОЛЬКО через роль late-lead.
const LADDER = ['night-strike', 'noon-roar', 'rain-slide'];

// used — Set уже потраченных архетипов ЭТОГО матча (мутируется).
// Гарантия: пока в лестнице есть свободные, две карточки матча не делят архетип.
export function pickArchetype(role, used) {
  const first = ROLE_TO_ARCHETYPE[role] ?? 'night-strike';
  if (!used.has(first)) { used.add(first); return first; }
  for (const k of LADDER) if (!used.has(k)) { used.add(k); return k; }
  // лестница исчерпана (4+ гола за матч) — отдаём природный архетип роли повторно.
  // НЕ чистим used: иначе освободится gold-collapse, и золото уйдёт рядовому голу.
  return first;
}
