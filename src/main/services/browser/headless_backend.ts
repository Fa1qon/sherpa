import { EventEmitter } from 'node:events';
import type { Browser, Page, BrowserContext } from 'playwright-core';
import type { BrowserPort, ScreenshotResult } from '../../../core/ports/browser_port';
import type { BrowserEvent } from '../../../core/domain/browser';
import { proxyManager } from '../proxy_manager';

export class HeadlessBackend implements BrowserPort {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private emitter = new EventEmitter();

  constructor(private readonly sessionId: string) {}

  async init(): Promise<void> {
    const { chromium } = await import('playwright-core');
    const proxyUrl = proxyManager.getProxyUrl('aiBrowser');
    const noProxy = proxyManager.getNoProxy('aiBrowser');
    this.browser = await chromium.launch({
      headless: true,
      ...(proxyUrl
        ? {
            proxy: {
              server: proxyUrl,
              ...(noProxy !== undefined ? { bypass: noProxy } : {}),
            },
          }
        : {}),
    });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();

    await this.page.exposeFunction('__sherpaNotify', (event: BrowserEvent) => {
      this.emitter.emit('event', event);
    });

    await this.page.addInitScript(`
      window.__sherpaQueue = [];
      window.__sherpaOrigPushState = history.pushState.bind(history);
      history.pushState = function(...args) {
        __sherpaOrigPushState(...args);
        window.__sherpaNotify({ type: 'navigate', url: location.href, ts: Date.now() });
      };
      window.addEventListener('click', (e) => {
        const el = e.target;
        const selector = el.id ? '#' + el.id : el.tagName.toLowerCase();
        window.__sherpaNotify({ type: 'click', selector, ts: Date.now() });
      }, true);
      window.addEventListener('load', () => {
        window.__sherpaNotify({ type: 'load', url: location.href, ts: Date.now() });
      });
    `);

    this.page.on('framenavigated', (frame) => {
      if (frame === this.page!.mainFrame()) {
        this.emitter.emit('event', { type: 'load', url: frame.url(), ts: Date.now() } satisfies BrowserEvent);
      }
    });
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error('HeadlessBackend not initialized');
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async screenshot(): Promise<ScreenshotResult> {
    if (!this.page) throw new Error('HeadlessBackend not initialized');
    const buf = await this.page.screenshot({ type: 'png' });
    const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    const vp = this.page.viewportSize() ?? { width: 1280, height: 720 };
    return { dataUrl, width: vp.width, height: vp.height };
  }

  async click(selector: string): Promise<void> {
    if (!this.page) throw new Error('HeadlessBackend not initialized');
    await this.page.click(selector);
  }

  async type(selector: string, text: string): Promise<void> {
    if (!this.page) throw new Error('HeadlessBackend not initialized');
    await this.page.fill(selector, text);
  }

  async evaluate<T>(script: string): Promise<T> {
    if (!this.page) throw new Error('HeadlessBackend not initialized');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.page.evaluate(script as any) as Promise<T>;
  }

  async getDOM(): Promise<string> {
    if (!this.page) throw new Error('HeadlessBackend not initialized');
    return this.page.content();
  }

  async waitFor(selector: string, timeoutMs = 5000): Promise<void> {
    if (!this.page) throw new Error('HeadlessBackend not initialized');
    await this.page.waitForSelector(selector, { timeout: timeoutMs });
  }

  async highlight(selector: string): Promise<void> {
    if (!this.page) throw new Error('HeadlessBackend not initialized');
    await this.page.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      if (el instanceof HTMLElement) {
        el.style.outline = '3px solid #f59e0b';
        setTimeout(() => { el.style.outline = ''; }, 2000);
      }
    }, selector);
  }

  onEvent(handler: (event: BrowserEvent) => void): () => void {
    this.emitter.on('event', handler);
    return () => { this.emitter.off('event', handler); };
  }

  async close(): Promise<void> {
    await this.page?.close().catch(() => undefined);
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}
