import { EventEmitter } from 'node:events';
import { WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';
import type { BrowserPort, ScreenshotResult } from '../../../core/ports/browser_port';
import type { BrowserEvent } from '../../../core/domain/browser';
import { proxyManager } from '../proxy_manager';

const PANEL_HEIGHT_OFFSET = 120; // leave room for Sherpa chrome at top

export class EmbeddedBackend implements BrowserPort {
  private view: InstanceType<typeof WebContentsView> | null = null;
  private emitter = new EventEmitter();
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly mainWindow: BrowserWindow,
  ) {}

  async init(): Promise<void> {
    this.view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    const bounds = this.mainWindow.getBounds();
    this.view.setBounds({
      x: 0,
      y: PANEL_HEIGHT_OFFSET,
      width: bounds.width,
      height: bounds.height - PANEL_HEIGHT_OFFSET,
    });
    this.mainWindow.contentView.addChildView(this.view);

    const wc = this.view.webContents;

    const aiProxyUrl = proxyManager.getProxyUrl('aiBrowser');
    const aiNoProxy = proxyManager.getNoProxy('aiBrowser');
    await wc.session.setProxy({
      proxyRules: aiProxyUrl ?? 'direct://',
      ...(aiNoProxy !== undefined ? { proxyBypassRules: aiNoProxy } : {}),
    });

    wc.on('did-navigate', (_e: unknown, url: string) => {
      this.emitter.emit('event', { type: 'navigate', url, ts: Date.now() } satisfies BrowserEvent);
    });

    wc.on('did-finish-load', () => {
      this.emitter.emit('event', { type: 'load', url: wc.getURL(), ts: Date.now() } satisfies BrowserEvent);
      void this.startDataBus();
    });
  }

  private async startDataBus(): Promise<void> {
    if (!this.view) return;
    const wc = this.view.webContents;
    // Install event queue in page
    await wc.executeJavaScript(`
      if (!window.__sherpaQueue) {
        window.__sherpaQueue = [];
        window.addEventListener('click', (e) => {
          const el = e.target;
          const sel = el.id ? '#' + el.id : el.tagName.toLowerCase();
          window.__sherpaQueue.push({ type: 'click', selector: sel, ts: Date.now() });
        }, true);
      }
    `).catch(() => undefined);

    // Poll queue at 250ms
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(async () => {
      if (!this.view) return;
      try {
        const events = await this.view.webContents.executeJavaScript(
          'var q = window.__sherpaQueue || []; window.__sherpaQueue = []; q'
        ) as BrowserEvent[];
        for (const ev of events) {
          this.emitter.emit('event', ev);
        }
      } catch {
        // page navigated — queue reset next load
      }
    }, 250);
  }

  async navigate(url: string): Promise<void> {
    if (!this.view) throw new Error('EmbeddedBackend not initialized');
    await this.view.webContents.loadURL(url);
  }

  async screenshot(): Promise<ScreenshotResult> {
    if (!this.view) throw new Error('EmbeddedBackend not initialized');
    const image = await this.view.webContents.capturePage();
    const { width, height } = image.getSize();
    return { dataUrl: image.toDataURL(), width, height };
  }

  async click(selector: string): Promise<void> {
    if (!this.view) throw new Error('EmbeddedBackend not initialized');
    await this.view.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(selector)})?.click()`
    );
  }

  async type(selector: string, text: string): Promise<void> {
    if (!this.view) throw new Error('EmbeddedBackend not initialized');
    await this.view.webContents.executeJavaScript(
      `Object.assign(document.querySelector(${JSON.stringify(selector)}), { value: ${JSON.stringify(text)} })`
    );
  }

  async evaluate<T>(script: string): Promise<T> {
    if (!this.view) throw new Error('EmbeddedBackend not initialized');
    return this.view.webContents.executeJavaScript(script) as Promise<T>;
  }

  async getDOM(): Promise<string> {
    if (!this.view) throw new Error('EmbeddedBackend not initialized');
    return this.view.webContents.executeJavaScript('document.documentElement.outerHTML') as Promise<string>;
  }

  async waitFor(selector: string, timeoutMs = 5000): Promise<void> {
    if (!this.view) throw new Error('EmbeddedBackend not initialized');
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = await this.view.webContents.executeJavaScript(
        `!!document.querySelector(${JSON.stringify(selector)})`
      ).catch(() => false);
      if (found) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`waitFor timeout: ${selector}`);
  }

  async highlight(selector: string): Promise<void> {
    if (!this.view) throw new Error('EmbeddedBackend not initialized');
    await this.view.webContents.executeJavaScript(`
      var el = document.querySelector(${JSON.stringify(selector)});
      if (el) { el.style.outline = '3px solid #f59e0b'; setTimeout(() => el.style.outline = '', 2000); }
    `);
  }

  onEvent(handler: (event: BrowserEvent) => void): () => void {
    this.emitter.on('event', handler);
    return () => { this.emitter.off('event', handler); };
  }

  async close(): Promise<void> {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
    if (this.view) {
      try { this.view.webContents.close(); } catch { /* already destroyed */ }
      this.mainWindow.contentView.removeChildView(this.view);
      this.view = null;
    }
  }
}
