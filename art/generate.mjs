#!/usr/bin/env node
// Батч-генерация базовых артов через Civitai Orchestration API.
//   node generate.mjs [plan.json]
// План: [{ slug, prompt, negative?, quantity?, width?, height?, steps?, model? }]
// Результат: art/raw/<slug>-NN.jpeg + generate-log.ndjson (id воркфлоу, стоимость).
// Списываются СИНИЕ buzz (SFW-генерация; проверено 06.07: transactions.accountType="blue",
// ~3 buzz/картинку SDXL 832x1216@28). Зелёные через API не трогаются — они только
// для сайта civitai.green.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(DIR, '..', 'day1', 'civitai.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const TOKEN = process.env.CIVITAI_TOKEN;
const API = 'https://orchestration.civitai.com/v2/consumer';
// дефолт: WAI-illustrious-SDXL v17.0 (любимая модель оператора, SFW-промптами — ок)
const DEFAULT_MODEL = 'urn:air:sdxl:checkpoint:civitai:827184@2883731';
// автор WAI: длинные негативы и груды quality-тегов = мыло; держим коротко
const BASE_NEGATIVE = 'nsfw, nude, worst quality, bad hands, watermark, text, logo, emblem, brand';

const planPath = process.argv[2] ?? join(DIR, 'plan.json');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
mkdirSync(join(DIR, 'raw'), { recursive: true });

const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function submit(spec) {
  // FLUX и другие diffuser-движки идут шагом imageGen (см. рецепт flux1 в доках),
  // классические чекпоинты (SDXL/Illustrious/Pony) — шагом textToImage.
  const step = spec.engine === 'flux1'
    ? {
        $type: 'imageGen',
        input: {
          engine: 'sdcpp', ecosystem: 'flux1', operation: 'createImage',
          diffuserModel: spec.model,
          prompt: spec.prompt,
          width: spec.width ?? 832, height: spec.height ?? 1216,
          steps: spec.steps ?? 28, cfgScale: spec.cfgScale ?? 3.5,
          quantity: Math.min(spec.quantity ?? 4, 8),
        },
      }
    : {
        $type: 'textToImage',
        input: {
          model: spec.model ?? DEFAULT_MODEL,
          prompt: spec.prompt,
          negativePrompt: spec.negative ? `${BASE_NEGATIVE}, ${spec.negative}` : BASE_NEGATIVE,
          width: spec.width ?? 832,
          height: spec.height ?? 1216,
          steps: spec.steps ?? 28,
          cfgScale: spec.cfgScale ?? 5,
          sampler: spec.sampler ?? 'Euler a',
          quantity: Math.min(spec.quantity ?? 4, 8),
        },
      };
  const body = { steps: [step] };
  const res = await fetch(`${API}/workflows?wait=0`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`submit ${spec.slug}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()).id;
}

async function waitDone(id) {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${API}/workflows/${id}`, { headers: H });
    const j = await res.json();
    if (j.status === 'succeeded') return j;
    if (['failed', 'canceled', 'expired'].includes(j.status)) throw new Error(`workflow ${id}: ${j.status}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`workflow ${id}: таймаут ожидания`);
}

let totalBuzz = 0, totalImages = 0;
for (const spec of plan) {
  log(`→ ${spec.slug} (${spec.quantity ?? 4} шт)…`);
  try {
    const id = await submit(spec);
    const wf = await waitDone(id);
    const cost = wf.transactions?.list?.reduce((s, t) => s + (t.type === 'debit' ? t.amount : 0), 0) ?? 0;
    totalBuzz += cost;
    const images = wf.steps?.[0]?.output?.images ?? [];
    let n = 0;
    for (const im of images) {
      const file = join(DIR, 'raw', `${spec.slug}-${String(++n).padStart(2, '0')}.jpeg`);
      const blob = await fetch(im.url, { headers: { Authorization: H.Authorization } });
      writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
      totalImages++;
    }
    appendFileSync(join(DIR, 'generate-log.ndjson'),
      JSON.stringify({ slug: spec.slug, workflowId: id, images: n, buzz: cost, at: new Date().toISOString() }) + '\n');
    log(`  ✓ ${n} картинок, ${cost} buzz`);
  } catch (e) {
    log(`  ✗ ${e.message.slice(0, 200)}`);
  }
}
log(`итого: ${totalImages} картинок, ${totalBuzz} buzz`);
