# ART-SPEC — критерии арта для карточек Moment Mints

Черновик 06.07, правит оператор (арт-директор). Использую при генерации промптов.

## Жёсткие критерии (проверяются на каждой картинке)

1. **Читаемость в мелком** — карточка работает в превью ~300px: одна крупная
   фигура/объект-герой, 50–70% кадра, высокий контраст силуэта. Никаких
   панорам стадиона, где герой — 5% кадра.
2. **Эмоция события без слов** — тип момента угадывается за секунду до чтения
   текста: ГОЛ = взрыв вверх, тёплое золото, конфетти; VAR-ОТМЕНА = стоп-кадр,
   холод, дождь, пауза; КРАСНАЯ = жёсткий контраст, красная подсветка, агрессия.
3. **Аниме-иллюстрация, взрослая динамика** — стиль WAI/Nova: резкие ракурсы,
   спортивная злость, без чиби/слащавости. Реализм — исключён (решение 06.07).
4. **Команда через цвет, не через лицензию** — только цвета формы и обобщённые
   мотивы страны. Запрещены: реальные лица игроков, имена, точные эмблемы
   сборных/клубов, спонсорские лого (негатив-промпт).
5. **Тихие зоны под текст** — верхние ~12% и нижние ~18% кадра без ключевых
   деталей: туда ляжет типографика (событие, счёт, proof). Небо/трибуны-боке —
   ок, лицо/мяч — нет.
6. **Без текста в арте** — надписи, номера, вывески — в негатив (модель всё
   равно рисует кракозябры).
7. **Формат** — вертикаль 832×1216 (5:7).

## Мягкие пожелания

- Свет — ночной матч, прожектора, рим-лайт: даёт драму и прячет слабые детали.
- Руки по возможности скрыты позой (перчатки/динамика/ракурс).
- Палитра карточки = палитра команды (из карты `team → цвета`).
- Одна модель на всю коллекцию (консистентность); вторая модель допустима как
  «редкий» стиль для легендарных моментов — решение оператора.

## Промпт-шаблон (рабочий)

```
masterpiece, best quality, anime illustration, {SUBJECT_BY_EVENT},
{TEAM_COLORS} jersey, close-up upper body, dynamic angle,
night stadium floodlights bokeh background, {MOOD_BY_EVENT},
cinematic rim lighting, sfw
```

- GOAL: SUBJECT = "male soccer player mid-celebration roaring, fists clenched" /
  MOOD = "golden confetti, warm triumphant glow"
- GOAL_REVOKED (VAR): SUBJECT = "soccer player frozen in disbelief, hands on head" /
  MOOD = "cold blue light, rain mist, giant screen glow"
- RED_CARD: SUBJECT = "soccer player walking off looking down, dramatic silhouette" /
  MOOD = "harsh red rim light, high contrast shadows"

Негатив (базовый, в generate.mjs): nsfw, nude, suggestive, lowres, bad anatomy,
bad hands, extra fingers, watermark, signature, text, logo, brand.

## Решения (06.07, вечер)

- **Модель: WAI-illustrious v17** (выбор оператора, A/B подтвердил паритет с Nova).
- **Герой: анонимный игрок** (реальные люди запрещены политикой Civitai и рискованны
  юридически; свой маскот — отложен, оператор думает про «мемного персонажа» — ждём,
  кого он имел в виду, но дефолт безопасный).
- **Стиль-как-редкость: ДА, трёхтировая система «эпох печати»** (кастинг 06.07,
  раунды st-*/st2-* в art/raw):

### Тир 1 — BASE «Ретро-90е» (GOAL и обычные моменты)
Cel-шейдинг 90-х, закатное золото, зерно плёнки. Вайб Captain Tsubasa.
```
masterpiece, retro artstyle, 1990s anime style, cel shading, bold ink outlines,
film grain, vintage sports anime, {SUBJECT}, {TEAM_COLORS} jersey, close-up
upper body, dynamic angle, {MOOD}, sunset gold sky, stadium silhouette
```

### Тир 2 — DRAMA «Спот-колор манга» (RED_CARD, GOAL_REVOKED/VAR)
Монохромная манга: скринтоны, лучи-вспышки, ЕДИНСТВЕННЫЙ цветной объект = цвет
события (красная карточка / холодный синий экран VAR). Проверено: работает.
```
masterpiece, 1boy, solo, human male soccer player, monochrome manga style,
dramatic screentone, ink drawing, impact frame, radiating speed lines,
spot color, {EVENT_OBJECT} as the only colored object, {POSE}, close-up
upper body, white burst background
```

### Тир 3 — LEGENDARY «Укиё-э» (финал, хет-трики, исторические моменты)
Гравюра: толстые контуры, плоские цвета, сэйгайха-волны, сусальное золото,
красная ханко-печать. «Момент, запечатлённый навеки».
```
masterpiece, ukiyo-e style, woodblock print, thick outlines, flat traditional
colors, {SUBJECT}, close-up upper body, {TEAM_COLORS} jersey, stylized great
wave and lightning motifs, gold leaf background, red hanko stamp, dramatic
diagonal composition
```

Нарратив системы: три эпохи печати (cel 90-х → тушь манги → гравюра) — единая
«бумажная» ДНК коллекции при явной редкости тиров.

### Известные болячки → правки перед продакшн-гридом
- Призрак «adidas» лезет на форму → добавить `adidas, nike, puma` в негатив.
- Ретро-VAR: убрать «giant screen glow behind» (ломает композицию двойниками),
  оставить «looking up in disbelief, hands on head, cold blue floodlight, rain».
- Кракозябры-иероглифы на ханко — приемлемо (нечитаемо и аутентично выглядит).
