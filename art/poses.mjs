// Меню поз для ПЕР-ГОЛ уникализации: мир (палитра) остаётся носителем смысла
// (роль гола), а поза внутри мира меняется от карточки к карточке.
//
// Зачем: пул «команда×мир» из 2-3 картинок одного промпта дал 4 семейства клонов
// вместо одного — оператор справедливо заметил, что позы одинаковые. Раз арт
// обновляется задним числом (update() на ассете), каждому сминченному голу можно
// выдать СВОЮ картинку: поза выбирается детерминированно от seq, генерим 3
// кандидата, отбираем глазами.
//
// В меню только позы, которые illustrious ДОКАЗАННО умеет (видели в удачных
// генерациях): удар, удар через себя, спринт, рёв, руки к небу, слайд, стойка под
// дождём, на коленях, лёжа в траве. Экзотику не добавлять — см. уроки в
// archetypes.mjs (спина=номер, реквизит=поводок, абстракция=волейбол).

import { BY_KEY, JERSEY, HOUSE_PREFIX } from './archetypes.mjs';

// Палитры миров — вынесены из тел промптов, чтобы комбинировать с любой позой.
export const PALETTES = {
  'noon-roar': 'bright midday, pale washed-out blue sky, clear even daylight, face fully lit, no confetti',
  'gold-collapse': 'golden hour, warm amber light, gold confetti drifting, deep green turf',
  'rain-slide': 'grey overcast rain, heavy rain streaks, water spraying, desaturated grey green, cold white light',
  'night-strike': 'night match, hard white cross-light, silver rim light, black sky, wet turf reflections, ink speed lines',
};

export const POSES = {
  'night-strike': [
    { key: 'kick', body: 'side-on mid-kick, boot striking the ball, body arced, teeth bared, <JERSEY>, full figure' },
    { key: 'scissor', body: 'overhead bicycle kick, body airborne upside down, kicking the ball, <JERSEY>, full figure, low angle' },
    { key: 'sprint', body: 'sprinting with the ball at his feet, leaning hard forward, <JERSEY>, full figure side view, motion blur' },
  ],
  'noon-roar': [
    { key: 'roar', body: 'close-up, roaring in triumph, both fists clenched at his chest, <JERSEY>, low angle' },
    { key: 'sky', body: 'arms raised high to the sky, head tilted back, triumphant scream, <JERSEY>, waist-up, low angle' },
    { key: 'run', body: 'running toward camera screaming with joy, arms pumping at his sides, <JERSEY>, waist-up' },
  ],
  'rain-slide': [
    { key: 'slide', body: 'sliding on his knees, body low and horizontal, fists at his sides, soaked, head back shouting, <JERSEY>, low angle from grass level' },
    { key: 'stand', body: 'standing in the downpour, head thrown back, eyes closed, fists clenched at his sides, soaked <JERSEY> clinging wet' },
    { key: 'kneel', body: 'dropped to both knees in the rain, punching the air with one fist, shouting, soaked <JERSEY>' },
  ],
  'gold-collapse': [
    { key: 'kneel', body: 'high angle looking straight down, on both knees in deep grass, head tipped back, arms hanging loose at his sides, <JERSEY>' },
    { key: 'lying', body: 'lying flat on his back in the grass, arms spread relaxed, eyes closed, faint smile, gold confetti falling on him, <JERSEY>, high angle' },
    { key: 'sit', body: 'sitting back on his heels in the grass, head bowed, hands resting on thighs, spent, <JERSEY>, high angle' },
  ],
};

// Полный промпт: дом-стиль + поза (с формой команды) + палитра мира.
export function promptForPose(archKey, poseIdx, team) {
  const poses = POSES[archKey];
  const palette = PALETTES[archKey];
  const jersey = JERSEY[team];
  if (!poses || !palette) throw new Error(`нет мира ${archKey}`);
  if (!jersey) throw new Error(`нет цвета формы для ${team}`);
  const pose = poses[poseIdx % poses.length];
  return { pose: pose.key, prompt: `${HOUSE_PREFIX}, ${pose.body.replace('<JERSEY>', jersey)}, ${palette}`, negative: BY_KEY[archKey]?.negative ?? '' };
}
