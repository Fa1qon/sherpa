/**
 * Per-screen SSIM threshold calibration for the Sherpa UI visual harness.
 *
 * For each of 7 mockups (welcome, workspace, agent_panel, kanban, settings,
 * metrics, recovery), this script:
 *   1. Loads the static HTML mockup from <sherpa-source>/design/ui/<screen>.html
 *      via a `file://` URL into a headless Chromium page (1440x900 viewport).
 *   2. Renders the page TWICE, capturing PNG buffers each time.
 *   3. Computes SSIM between the two same-input renders -> "noise floor".
 *   4. Sets `threshold[screen] = clamp(noise_floor + 0.02, 0.85, 0.99)`.
 *      The +0.02 margin gives spec runs a small headroom above pure noise.
 *      The 0.85 floor matches AC-T-L0-05-3.
 *   5. Writes the FIRST render of each screen to
 *      `tests/visual/baselines/<screen>.png` (so baselines + thresholds are
 *      always in lock-step with the same Chromium revision).
 *   6. Writes the threshold map atomically to `tests/visual/thresholds.json`.
 *
 * Run via:   npm run calibrate
 * Or:        npx tsx tests/visual/calibrate-thresholds.ts
 *            npx tsx tests/visual/calibrate-thresholds.ts --source-dir <abs-path>
 */

import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Browser } from '@playwright/test';
import { decodePng, SCREEN_NAMES, type ScreenName } from './screenshot-comparator.js';
import { ssim } from 'ssim.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_SOURCE_DIR = resolve(
  'C:/Projects/sherpa/projects/sherpa/tasks/METH-070/chat_01/design/ui'
);

const BASELINES_DIR = resolve(__dirname, 'baselines');
const THRESHOLDS_JSON = resolve(__dirname, 'thresholds.json');
const VIEWPORT = { width: 1440, height: 900 } as const;

export type CalibrationResult = {
  thresholds: Record<ScreenName, number>;
  noiseFloors: Record<ScreenName, number>;
  baselinePaths: Record<ScreenName, string>;
};

function parseSourceDir(argv: readonly string[]): string {
  const idx = argv.indexOf('--source-dir');
  if (idx >= 0 && idx + 1 < argv.length) {
    return resolve(argv[idx + 1]);
  }
  return DEFAULT_SOURCE_DIR;
}

function atomicWriteJson(target: string, payload: unknown): void {
  const dir = dirname(target);
  mkdirSync(dir, { recursive: true });
  const tmp = `${target}.tmp.${Date.now()}.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  renameSync(tmp, target);
}

function atomicWriteBuffer(target: string, buf: Buffer): void {
  const dir = dirname(target);
  mkdirSync(dir, { recursive: true });
  const tmp = `${target}.tmp.${Date.now()}.${process.pid}`;
  writeFileSync(tmp, buf);
  renameSync(tmp, target);
}

async function captureScreen(browser: Browser, htmlUrl: string): Promise<Buffer> {
  const context = await browser.newContext({
    viewport: { ...VIEWPORT },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce'
  });
  try {
    const page = await context.newPage();
    await page.goto(htmlUrl, { waitUntil: 'networkidle' });
    // Belt-and-suspenders: small settle to let any layout stabilize.
    await page.waitForTimeout(150);
    const buf = await page.screenshot({ fullPage: false, type: 'png' });
    return buf;
  } finally {
    await context.close();
  }
}

export async function calibrate(options: { sourceDir?: string } = {}): Promise<CalibrationResult> {
  const sourceDir = options.sourceDir ?? DEFAULT_SOURCE_DIR;
  if (!existsSync(sourceDir)) {
    throw new Error(`Source dir does not exist: ${sourceDir}`);
  }

  mkdirSync(BASELINES_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const thresholds: Partial<Record<ScreenName, number>> = {};
  const noiseFloors: Partial<Record<ScreenName, number>> = {};
  const baselinePaths: Partial<Record<ScreenName, string>> = {};

  try {
    for (const screen of SCREEN_NAMES) {
      const htmlPath = join(sourceDir, `${screen}.html`);
      if (!existsSync(htmlPath)) {
        throw new Error(`Mockup HTML missing: ${htmlPath}`);
      }
      const url = pathToFileURL(htmlPath).toString();

      const first = await captureScreen(browser, url);
      const second = await captureScreen(browser, url);

      const a = decodePng(first);
      const b = decodePng(second);

      let noiseFloor: number;
      if (a.width !== b.width || a.height !== b.height) {
        // Should not happen with a fixed viewport, but be defensive.
        noiseFloor = 0.85;
      } else {
        const result = ssim(a, b, { ssim: 'fast' });
        noiseFloor = result.mssim;
      }

      // threshold = clamp(noise_floor + 0.02, [0.85, 0.99])
      let threshold = noiseFloor + 0.02;
      if (threshold < 0.85) threshold = 0.85;
      if (threshold > 0.99) threshold = 0.99;
      // Round to 4 decimal places for stable JSON.
      threshold = Math.round(threshold * 10000) / 10000;
      noiseFloor = Math.round(noiseFloor * 10000) / 10000;

      const baselinePath = join(BASELINES_DIR, `${screen}.png`);
      atomicWriteBuffer(baselinePath, first);

      thresholds[screen] = threshold;
      noiseFloors[screen] = noiseFloor;
      baselinePaths[screen] = baselinePath;

      // eslint-disable-next-line no-console
      console.log(
        `[calibrate] ${screen.padEnd(12)} noise=${noiseFloor.toFixed(4)} threshold=${threshold.toFixed(4)}`
      );
    }
  } finally {
    await browser.close();
  }

  atomicWriteJson(THRESHOLDS_JSON, thresholds);

  return {
    thresholds: thresholds as Record<ScreenName, number>,
    noiseFloors: noiseFloors as Record<ScreenName, number>,
    baselinePaths: baselinePaths as Record<ScreenName, string>
  };
}

export function readThresholds(): Record<string, number> {
  if (!existsSync(THRESHOLDS_JSON)) {
    return {};
  }
  return JSON.parse(readFileSync(THRESHOLDS_JSON, 'utf8')) as Record<string, number>;
}

// CLI entrypoint: run calibration when invoked directly via tsx.
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    const argvUrl = pathToFileURL(resolve(process.argv[1])).href;
    return argvUrl === import.meta.url;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const sourceDir = parseSourceDir(process.argv.slice(2));
  calibrate({ sourceDir })
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log('[calibrate] thresholds.json written:', THRESHOLDS_JSON);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result.thresholds, null, 2));
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[calibrate] FAILED:', err);
      process.exit(1);
    });
}
