// src/main/services/user_browser.ts
//
// Thin wrapper around the renderer-owned <webview> tag (registered by
// BrowserTab on dom-ready). Previously created a native WebContentsView
// and synced bounds with the renderer — that approach hit unsolvable
// coord/DPI issues on Windows.
//
// Public API kept stable for: BrowserAutomationService (Track B MCP
// tools), Plan-01 HtmlViewer, PdfViewer (which used show/hide). show/
// hide become no-ops; the new attach/detachWebContents lifecycle is
// what UI calls now.

import { webContents as electronWebContents } from 'electron';
import type { BrowserWindow, WebContents } from 'electron';
import { proxyManager } from './proxy_manager';

type UrlChangedHandler = (url: string, title: string) => void;
type ViewCreatedHandler = (wc: WebContents) => void;

export class UserBrowser {
  private webContentsId: number | null = null;
  private mainWindow: BrowserWindow | null = null;
  private handlers: UrlChangedHandler[] = [];
  private viewCreatedHandlers: ViewCreatedHandler[] = [];
  private attachedListenerWc: WebContents | null = null;

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  /**
   * Called by the renderer when the <webview> tag becomes dom-ready.
   * Passes the webContents id so we can route navigation / automation
   * calls through electronWebContents.fromId.
   *
   * Pass null on unmount to clear the registration.
   */
  attachWebContents(id: number | null): void {
    if (this.attachedListenerWc) {
      try { this.attachedListenerWc.removeAllListeners('did-navigate'); } catch { /* ok */ }
      try { this.attachedListenerWc.removeAllListeners('did-navigate-in-page'); } catch { /* ok */ }
      try { this.attachedListenerWc.removeAllListeners('page-title-updated'); } catch { /* ok */ }
      this.attachedListenerWc = null;
    }
    this.webContentsId = id;
    if (id === null) return;

    const wc = electronWebContents.fromId(id);
    if (!wc) return;
    this.attachedListenerWc = wc;

    // Apply current proxy settings to the new webview's session.
    void this.applyProxy().catch(() => { /* best-effort */ });

    wc.on('did-navigate', (_e, url) => {
      const title = wc.getTitle();
      for (const h of this.handlers) h(url, title);
    });
    wc.on('did-navigate-in-page', (_e, url) => {
      const title = wc.getTitle();
      for (const h of this.handlers) h(url, title);
    });
    wc.on('page-title-updated', (_e, title) => {
      const url = wc.getURL();
      for (const h of this.handlers) h(url, title);
    });

    // Fire onViewCreated handlers now that we have a real webContents.
    const queued = this.viewCreatedHandlers;
    this.viewCreatedHandlers = [];
    for (const h of queued) {
      try { h(wc); } catch { /* best-effort */ }
    }
  }

  /**
   * Legacy no-op (kept for back-compat). The <webview> renders itself;
   * positioning is CSS, not setBounds.
   */
  show(_x?: number, _y?: number, _width?: number, _height?: number, url?: string): void {
    if (url) this.navigate(url);
  }

  /** Legacy no-op. The webview hides when its React parent unmounts. */
  hide(): void { /* no-op */ }

  navigate(url: string): void {
    const wc = this.getWebContents();
    if (!wc) return;
    void wc.loadURL(url).catch(() => { /* best-effort */ });
  }

  back(): void {
    const wc = this.getWebContents();
    if (wc?.canGoBack()) wc.goBack();
  }

  forward(): void {
    const wc = this.getWebContents();
    if (wc?.canGoForward()) wc.goForward();
  }

  reload(): void {
    this.getWebContents()?.reload();
  }

  getWebContents(): WebContents | null {
    if (this.webContentsId === null) return null;
    const wc = electronWebContents.fromId(this.webContentsId);
    if (!wc || wc.isDestroyed()) {
      this.webContentsId = null;
      return null;
    }
    return wc;
  }

  isReady(): boolean {
    return this.getWebContents() !== null;
  }

  onUrlChanged(handler: UrlChangedHandler): () => void {
    this.handlers.push(handler);
    return () => { this.handlers = this.handlers.filter((h) => h !== handler); };
  }

  /**
   * Register a handler that fires once when the webview's webContents
   * becomes available. If already attached, fires synchronously.
   */
  onViewCreated(handler: ViewCreatedHandler): () => void {
    const wc = this.getWebContents();
    if (wc) {
      try { handler(wc); } catch { /* best-effort */ }
      return () => { /* already fired */ };
    }
    this.viewCreatedHandlers.push(handler);
    return () => {
      this.viewCreatedHandlers = this.viewCreatedHandlers.filter((h) => h !== handler);
    };
  }

  /**
   * Apply current proxy settings to the active webview's session.
   * Called automatically on attach and from the Settings save handler.
   */
  async applyProxy(): Promise<void> {
    const wc = this.getWebContents();
    if (!wc) return;
    const proxyUrl = proxyManager.getProxyUrl('userBrowser');
    const noProxy = proxyManager.getNoProxy('userBrowser');
    await wc.session.setProxy({
      proxyRules: proxyUrl ?? 'direct://',
      proxyBypassRules: noProxy,
    });
  }

  close(): void {
    this.attachWebContents(null);
  }
}

export const userBrowser = new UserBrowser();
