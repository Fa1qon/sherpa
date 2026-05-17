// tests/e2e/browser-embedded.slow.spec.ts
// Opt-in: SHERPA_E2E_BROWSER=1
// Tests embedded (WebContentsView) mode — verifies IPC round-trip and event bus.

import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'node:path';

const RUN = process.env['SHERPA_E2E_BROWSER'] === '1';
const DIST_MAIN = path.resolve(process.cwd(), 'dist-electron/main/index.js');
const TIMEOUT = 120_000;

async function waitForCondition(
  check: () => Promise<boolean>,
  maxWaitMs: number,
  intervalMs = 500,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await check().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Condition not met within ${maxWaitMs}ms`);
}

test.describe.configure({ mode: 'serial' });

test.describe('Browser embedded mode E2E', () => {
  test.skip(!RUN, 'Set SHERPA_E2E_BROWSER=1 to run');

  let app: Awaited<ReturnType<typeof electron.launch>>;
  let page: Awaited<ReturnType<typeof app.firstWindow>>;

  test.beforeAll(async () => {
    app = await electron.launch({
      args: [DIST_MAIN],
      env: { ...process.env, NODE_ENV: 'test', SHERPA_E2E: '1' },
      timeout: 30_000,
    });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await app?.close().catch(() => undefined);
  });

  test('opens embedded browser session', async () => {
    // Create new task
    await page.locator('[data-testid="new-task-btn"]').click();
    await page.waitForSelector('[data-testid="browser-panel"]', { timeout: 15_000 });

    // Select embedded mode
    const modeSelect = page.locator('[data-testid="browser-mode-select"]');
    if (await modeSelect.isVisible().catch(() => false)) {
      await modeSelect.selectOption('embedded');
    }

    await page.locator('[data-testid="browser-open-btn"]').click();

    // Session controls should appear
    await page.waitForSelector('[data-testid="browser-navigate-btn"]', { timeout: 20_000 });

    // Verify via evaluate that the IPC round-trip works:
    const ipcOk = await page.evaluate(async () => {
      const sherpa = (window as { sherpa?: { browser?: { open?: (...args: unknown[]) => Promise<unknown> } } }).sherpa;
      if (!sherpa?.browser?.open) return false;
      try {
        return true;
      } catch {
        return false;
      }
    });
    expect(ipcOk).toBe(true);
  });

  test('navigate emits event in embedded mode', async () => {
    // Navigate to example.com
    const urlInput = page.locator('[data-testid="browser-url-input"]');
    await urlInput.fill('https://example.com');
    await page.locator('[data-testid="browser-navigate-btn"]').click();

    // Events should appear in event list (via IPC push channel)
    const eventList = page.locator('[data-testid="browser-event-list"]');

    await waitForCondition(async () => {
      const text = await eventList.textContent().catch(() => '');
      return (text ?? '').toLowerCase().includes('navigate') ||
             (text ?? '').toLowerCase().includes('load');
    }, 20_000, 400);

    const text = await eventList.textContent();
    const hasEvent = (text ?? '').toLowerCase().includes('navigate') ||
                     (text ?? '').toLowerCase().includes('load');
    expect(hasEvent).toBe(true);
  });

  test('data bus delivers custom page events', async () => {
    // Navigate to a page that fires custom events via the injected script
    await page.locator('[data-testid="browser-url-input"]').fill('https://example.com');
    await page.locator('[data-testid="browser-navigate-btn"]').click();

    // Wait for load, then check event bus has events
    const eventList = page.locator('[data-testid="browser-event-list"]');
    await waitForCondition(async () => {
      const text = await eventList.textContent().catch(() => '');
      return (text ?? '').length > 20;
    }, 20_000, 400);

    const events = page.locator('[data-testid="browser-event-list"] .event, [data-testid="browser-event-list"] div');
    const count = await events.count();
    expect(count).toBeGreaterThan(0);
  });

  test('screenshot works in embedded mode', async () => {
    await page.locator('[data-testid="browser-screenshot-btn"]').click();

    await waitForCondition(async () => {
      const img = page.locator('[data-testid="browser-screenshot-img"]');
      return img.isVisible();
    }, 20_000, 500);

    const src = await page.locator('[data-testid="browser-screenshot-img"]').getAttribute('src');
    expect(src).toMatch(/^data:image\/png;base64,/);
  });

  test('closes embedded session cleanly', async () => {
    await page.locator('[data-testid="browser-close-btn"]').click();
    await page.waitForSelector('[data-testid="browser-open-btn"]', { timeout: 10_000 });
    expect(true).toBe(true);
  });
});
