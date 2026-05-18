// src/main/services/user_browser.ts
// Singleton WebContentsView for user-facing (non-AI) browsing.
// The renderer measures its viewport div and calls show() with pixel coords;
// the native view is positioned over that div so the React URL bar stays
// visible above it. Calling hide() makes the view invisible without destroying
// it so navigation state is preserved across tab switches.

import { WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';
import { proxyManager } from './proxy_manager';

type UrlChangedHandler = (url: string, title: string) => void;

export class UserBrowser {
  private view: InstanceType<typeof WebContentsView> | null = null;
  private mainWindow: BrowserWindow | null = null;
  private handlers: UrlChangedHandler[] = [];

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  show(x: number, y: number, width: number, height: number, url?: string): void {
    if (!this.mainWindow) return;

    if (!this.view) {
      this.view = new WebContentsView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      this.mainWindow.contentView.addChildView(this.view);
      void this.applyProxy();

      const wc = this.view.webContents;

      wc.on('did-navigate', (_e, navUrl) => {
        const title = wc.getTitle();
        for (const h of this.handlers) h(navUrl, title);
      });
      wc.on('did-navigate-in-page', (_e, navUrl) => {
        const title = wc.getTitle();
        for (const h of this.handlers) h(navUrl, title);
      });
      wc.on('page-title-updated', (_e, title) => {
        const navUrl = wc.getURL();
        for (const h of this.handlers) h(navUrl, title);
      });
    }

    this.view.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    });
    this.view.setVisible(true);

    if (url) {
      const current = this.view.webContents.getURL();
      if (current !== url) {
        void this.view.webContents.loadURL(url).catch(() => { /* best-effort */ });
      }
    }
  }

  hide(): void {
    this.view?.setVisible(false);
  }

  navigate(url: string): void {
    if (!this.view) return;
    void this.view.webContents.loadURL(url).catch(() => { /* best-effort */ });
  }

  back(): void {
    if (this.view?.webContents.canGoBack()) this.view.webContents.goBack();
  }

  forward(): void {
    if (this.view?.webContents.canGoForward()) this.view.webContents.goForward();
  }

  reload(): void {
    this.view?.webContents.reload();
  }

  async applyProxy(): Promise<void> {
    if (!this.view) return;
    const proxyUrl = proxyManager.getProxyUrl('userBrowser');
    const noProxy = proxyManager.getNoProxy('userBrowser');
    await this.view.webContents.session.setProxy({
      proxyRules: proxyUrl ?? 'direct://',
      proxyBypassRules: noProxy,
    });
  }

  onUrlChanged(handler: UrlChangedHandler): () => void {
    this.handlers.push(handler);
    return () => { this.handlers = this.handlers.filter((h) => h !== handler); };
  }

  close(): void {
    if (this.view) {
      try { this.view.webContents.close(); } catch { /* already destroyed */ }
      try { this.mainWindow?.contentView.removeChildView(this.view); } catch { /* best-effort */ }
      this.view = null;
    }
  }
}

export const userBrowser = new UserBrowser();
