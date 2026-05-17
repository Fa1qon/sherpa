import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREEN_NAMES } from './screenshot-comparator.js';
import { readThresholds } from './calibrate-thresholds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const thresholdsPath = resolve(__dirname, 'thresholds.json');
const baselinesDir = resolve(__dirname, 'baselines');

/**
 * AC-T-L0-05-3 / AC-T-L0-05-4:
 *   The calibration step must produce a `thresholds.json` with one
 *   threshold per screen, each in [0.85, 0.99].
 *
 * The calibrate-thresholds.ts script is invoked at install/setup time
 * (npm run calibrate) and writes both thresholds.json and the seven
 * baseline PNGs. This spec validates the artifacts of that run.
 */
test.describe('calibrate-thresholds', () => {
  test('thresholds.json exists and is valid JSON', () => {
    expect(existsSync(thresholdsPath)).toBe(true);
    const raw = readFileSync(thresholdsPath, 'utf8');
    const parsed = JSON.parse(raw);
    expect(typeof parsed).toBe('object');
    expect(parsed).not.toBeNull();
  });

  test('thresholds.json contains all 7 screens', () => {
    const t = readThresholds();
    for (const screen of SCREEN_NAMES) {
      expect(t).toHaveProperty(screen);
    }
  });

  test('every threshold is a finite number in [0.85, 0.99]', () => {
    const t = readThresholds();
    for (const screen of SCREEN_NAMES) {
      const value = t[screen];
      expect(typeof value).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0.85);
      expect(value).toBeLessThanOrEqual(0.99);
    }
  });

  test('all 7 baseline PNGs exist alongside thresholds.json', () => {
    for (const screen of SCREEN_NAMES) {
      const path = resolve(baselinesDir, `${screen}.png`);
      expect(existsSync(path)).toBe(true);
    }
  });
});
