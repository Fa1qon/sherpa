import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareScreenshots } from './screenshot-comparator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baselineDir = resolve(__dirname, 'baselines');

/**
 * AC-T-L0-05-2: SSIM-based comparator with configurable thresholds.
 *
 * Identical images must score > 0.99; visually distinct screens must
 * score < 0.95. This spec validates both bounds against the baselines
 * captured by the calibration step.
 */
test.describe('screenshot-comparator', () => {
  test('SSIM > 0.99 for identical images (welcome vs welcome)', async () => {
    const baseline = resolve(baselineDir, 'welcome.png');
    const result = await compareScreenshots(baseline, baseline, 0.85);
    expect(result.ssim).toBeGreaterThan(0.99);
    expect(result.pass).toBe(true);
  });

  test('SSIM < 0.95 for different images (welcome vs workspace)', async () => {
    const a = resolve(baselineDir, 'welcome.png');
    const b = resolve(baselineDir, 'workspace.png');
    const result = await compareScreenshots(a, b, 0.85);
    expect(result.ssim).toBeLessThan(0.95);
  });

  test('SSIM < 0.95 for different images (kanban vs metrics)', async () => {
    const a = resolve(baselineDir, 'kanban.png');
    const b = resolve(baselineDir, 'metrics.png');
    const result = await compareScreenshots(a, b, 0.85);
    expect(result.ssim).toBeLessThan(0.95);
  });

  test('explicit threshold drives pass/fail boolean', async () => {
    const baseline = resolve(baselineDir, 'welcome.png');
    // Force a higher-than-1 threshold to verify pass=false path.
    const fail = await compareScreenshots(baseline, baseline, 1.01);
    expect(fail.pass).toBe(false);
    expect(fail.threshold).toBe(1.01);
    // And a sane threshold succeeds.
    const ok = await compareScreenshots(baseline, baseline, 0.5);
    expect(ok.pass).toBe(true);
  });

  test('per-screen threshold lookup via thresholds.json', async () => {
    const baseline = resolve(baselineDir, 'welcome.png');
    const result = await compareScreenshots(baseline, baseline, 'welcome');
    // thresholds.json contains a value in [0.85, 0.99] for welcome.
    expect(result.threshold).toBeGreaterThanOrEqual(0.85);
    expect(result.threshold).toBeLessThanOrEqual(0.99);
    expect(result.pass).toBe(true);
  });
});
