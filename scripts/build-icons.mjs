// scripts/build-icons.mjs
// Generates the full icon set from the source PNG at repo root.
// Source: free-icon-mountain-9140335.png (outlined two-peak mountain).
// The black outline + blue fill reads cleanly on both light and dark
// chrome backgrounds, so the dark/light theme variants share the same
// rendered PNG (no negate hack — that worked for a silhouette but would
// invert the snow caps + outline of this multi-color glyph).
// Outputs: build/icons/icon-{16,32,48,64,128,256,512}.png + icon.ico
// + icon-{dark,light}.png for the chrome brand.

import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const SOURCE = path.join(root, 'free-icon-mountain-9140335.png');
const OUT_DIR = path.join(root, 'build', 'icons');
const PUBLIC_DIR = path.join(root, 'public', 'icons');
const SIZES = [16, 32, 48, 64, 128, 256, 512];
const ICO_SIZES = [16, 32, 48, 256];

async function ensureDirs() {
  await fsp.mkdir(OUT_DIR, { recursive: true });
  await fsp.mkdir(PUBLIC_DIR, { recursive: true });
}

async function generatePngSizes() {
  for (const size of SIZES) {
    const outFile = path.join(OUT_DIR, `icon-${size}.png`);
    await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outFile);
    console.log(`[icons] ${path.relative(root, outFile)}`);
  }
}

async function generateIco() {
  const buffers = await Promise.all(
    ICO_SIZES.map((size) =>
      sharp(SOURCE)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer(),
    ),
  );
  const ico = await pngToIco(buffers);
  const outFile = path.join(OUT_DIR, 'icon.ico');
  await fsp.writeFile(outFile, ico);
  console.log(`[icons] ${path.relative(root, outFile)} (${ICO_SIZES.length} sizes)`);
}

async function generateThemeVariants() {
  // Same outlined icon for both themes — the black outline carries it
  // across light and dark chrome backgrounds.
  const targets = ['icon-dark.png', 'icon-light.png'];
  for (const name of targets) {
    const outBuild = path.join(OUT_DIR, name);
    const outPublic = path.join(PUBLIC_DIR, name);
    await sharp(SOURCE).resize(32, 32).png().toFile(outBuild);
    await fsp.copyFile(outBuild, outPublic);
    console.log(`[icons] ${path.relative(root, outBuild)} + ${path.relative(root, outPublic)}`);
  }
}

async function main() {
  console.log('[icons] reading from', SOURCE);
  await fsp.access(SOURCE);
  await ensureDirs();
  await generatePngSizes();
  await generateIco();
  await generateThemeVariants();
  console.log('[icons] done');
}

main().catch((err) => {
  console.error('[icons] FAIL:', err);
  process.exit(1);
});
