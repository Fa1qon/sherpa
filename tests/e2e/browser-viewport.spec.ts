// tests/e2e/browser-viewport.spec.ts
//
// Regression: v0.24.0–0.24.4 had the embedded user-facing browser
// rendered at smaller dimensions than the React viewport div (native
// WebContentsView setBounds didn't match getBoundingClientRect on
// Windows). v0.24.5 rewrote it as a <webview> tag living in the React
// DOM — CSS handles position and size, no coordinate sync.
//
// This test boots Electron, opens the Browser tab via the ActivityBar
// globe button, and asserts that the <webview> element fills the
// available main content area (no gaps on right/bottom; top-aligned to
// the toolbar). Also re-checks after a window resize.

import { test, expect } from '@playwright/test';
import { launchWithProject } from './helpers';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const SHOTS = path.resolve(process.cwd(), 'tests/e2e/screenshots');
try { mkdirSync(SHOTS, { recursive: true }); } catch { /* ok */ }

async function openBrowserTab(page: import('@playwright/test').Page): Promise<void> {
  // ActivityBar uses title=Browser (i18n) on the globe button.
  // Try multiple selectors for robustness across locales.
  const selectors = [
    'button[title="Browser"]',
    'button[title="Браузер"]',
    'button[title*="Browser"]',
    'button[title*="Браузер"]',
  ];
  for (const sel of selectors) {
    const btn = page.locator(sel);
    if (await btn.first().isVisible().catch(() => false)) {
      await btn.first().click();
      return;
    }
  }
  throw new Error('Could not find Browser button in ActivityBar');
}

const RUN = process.env['SHERPA_E2E_BROWSER_VIEWPORT'] === '1';

test.describe('Browser tab viewport sizing (v0.24.5 webview rewrite)', () => {
  test.skip(!RUN, 'Set SHERPA_E2E_BROWSER_VIEWPORT=1 to run (requires working Playwright Electron launch)');

  test('webview fills its container — no gaps right/bottom, top-aligned to toolbar', async () => {
    const { page, cleanup } = await launchWithProject();
    try {
      await openBrowserTab(page);

      // Wait for the <webview> tag to appear and lay out.
      await page.waitForSelector('[data-testid="browser-webview"]', { timeout: 15_000 });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      await page.evaluate(() => new Promise(requestAnimationFrame));

      const m = await page.evaluate(() => {
        const webview = document.querySelector('[data-testid="browser-webview"]');
        const root = webview?.parentElement;
        if (!webview || !root) return null;
        const w = webview.getBoundingClientRect();
        const r = root.getBoundingClientRect();
        const toolbar = webview.previousElementSibling;
        const t = toolbar?.getBoundingClientRect();
        return {
          webview: { x: w.x, y: w.y, w: w.width, h: w.height, right: w.right, bottom: w.bottom },
          root:    { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom },
          toolbar: t ? { h: t.height } : null,
        };
      });

      expect(m, 'webview + parent should exist').not.toBeNull();
      if (!m) return;

      const { webview, root, toolbar } = m;

      // Screenshot first (helps debugging if any assertion fails).
      await page.screenshot({ path: path.join(SHOTS, 'browser-viewport.png') });

      // Left-aligned to root.
      expect(Math.abs(webview.x - root.x), 'left edge aligned').toBeLessThanOrEqual(1);

      // No gap on the right.
      expect(Math.abs(webview.right - root.right), 'no right gap').toBeLessThanOrEqual(1);

      // No gap on the bottom.
      expect(Math.abs(webview.bottom - root.bottom), 'no bottom gap').toBeLessThanOrEqual(1);

      // Sits directly below the toolbar (tolerate a 1-2px border).
      if (toolbar) {
        expect(
          Math.abs(webview.y - (root.y + toolbar.h)),
          'top aligned to toolbar bottom',
        ).toBeLessThanOrEqual(2);
      }

      // Non-zero size.
      expect(webview.w, 'width > 100').toBeGreaterThan(100);
      expect(webview.h, 'height > 100').toBeGreaterThan(100);
    } finally {
      await cleanup();
    }
  });

  test('webview re-fills its container after window resize', async () => {
    const { app, page, cleanup } = await launchWithProject();
    try {
      await openBrowserTab(page);
      await page.waitForSelector('[data-testid="browser-webview"]', { timeout: 15_000 });

      const browserWindow = await app.browserWindow(page);

      // Resize to a smaller size.
      await browserWindow.evaluate(
        (win, args: { w: number; h: number }) => { win.setSize(args.w, args.h); },
        { w: 1200, h: 800 },
      );
      await page.waitForTimeout(300);
      await page.evaluate(() => new Promise(requestAnimationFrame));

      const m1 = await page.evaluate(() => {
        const wv = document.querySelector('[data-testid="browser-webview"]')!;
        const root = wv.parentElement!;
        const w = wv.getBoundingClientRect();
        const r = root.getBoundingClientRect();
        return { wRight: w.right, rRight: r.right, wBottom: w.bottom, rBottom: r.bottom };
      });
      expect(Math.abs(m1.wRight - m1.rRight)).toBeLessThanOrEqual(1);
      expect(Math.abs(m1.wBottom - m1.rBottom)).toBeLessThanOrEqual(1);

      // Resize to a larger size.
      await browserWindow.evaluate(
        (win, args: { w: number; h: number }) => { win.setSize(args.w, args.h); },
        { w: 1600, h: 1000 },
      );
      await page.waitForTimeout(300);
      await page.evaluate(() => new Promise(requestAnimationFrame));

      const m2 = await page.evaluate(() => {
        const wv = document.querySelector('[data-testid="browser-webview"]')!;
        const root = wv.parentElement!;
        const w = wv.getBoundingClientRect();
        const r = root.getBoundingClientRect();
        return { wRight: w.right, rRight: r.right, wBottom: w.bottom, rBottom: r.bottom };
      });
      expect(Math.abs(m2.wRight - m2.rRight)).toBeLessThanOrEqual(1);
      expect(Math.abs(m2.wBottom - m2.rBottom)).toBeLessThanOrEqual(1);

      await page.screenshot({ path: path.join(SHOTS, 'browser-viewport-resized.png') });
    } finally {
      await cleanup();
    }
  });
});
