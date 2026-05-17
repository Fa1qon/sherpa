// scripts/download-model.mjs
// Downloads Xenova/all-MiniLM-L6-v2 ONNX files from HuggingFace into
// resources/models/ for bundling in the installer. Safe to re-run: skips
// existing files. Run once before `npm run dist:win`.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const OUT_DIR = join('resources', 'models', 'Xenova', 'all-MiniLM-L6-v2');

const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/model_quantized.onnx',
];

async function download(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  const kb = (buf.length / 1024).toFixed(0);
  console.log(`  ✓ ${dest.replace(/\\/g, '/')} (${kb} KB)`);
}

console.log(`Downloading ${MODEL_ID} → ${OUT_DIR}\n`);
for (const file of FILES) {
  const dest = join(OUT_DIR, file);
  if (existsSync(dest)) { console.log(`  skip ${file} (cached)`); continue; }
  await download(`${BASE_URL}/${file}`, dest);
}
console.log('\nDone. Re-run `npm run dist:win` to bundle the model.');
