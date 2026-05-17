// tests/main/services/browser/headless_backend.spec.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock playwright-core before importing backend
vi.mock('playwright-core', () => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('PNG')),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue('result'),
    content: vi.fn().mockResolvedValue('<html/>'),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    exposeFunction: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue('https://example.com'),
    on: vi.fn(),
    viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
    mainFrame: vi.fn().mockReturnValue({ url: () => 'https://example.com' }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const chromium = { launch: vi.fn().mockResolvedValue(mockBrowser) };
  return { chromium };
});

import { HeadlessBackend } from '../../../../src/main/services/browser/headless_backend';

describe('HeadlessBackend', () => {
  let backend: HeadlessBackend;

  beforeEach(() => {
    backend = new HeadlessBackend('session-1');
  });

  test('navigate calls page.goto', async () => {
    await backend.init();
    await backend.navigate('https://example.com');
    const { chromium } = await import('playwright-core');
    const browser = await (chromium.launch as ReturnType<typeof vi.fn>).mock.results[0].value;
    const ctx = await browser.newContext.mock.results[0].value;
    const page = await ctx.newPage.mock.results[0].value;
    expect(page.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
  });

  test('screenshot returns dataUrl', async () => {
    await backend.init();
    const result = await backend.screenshot();
    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  test('evaluate returns script result', async () => {
    await backend.init();
    const result = await backend.evaluate<string>('return "hello"');
    expect(result).toBe('result');
  });

  test('close releases browser', async () => {
    await backend.init();
    await backend.close();
    const { chromium } = await import('playwright-core');
    const browser = await (chromium.launch as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(browser.close).toHaveBeenCalled();
  });
});
