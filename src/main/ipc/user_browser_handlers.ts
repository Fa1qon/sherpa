// src/main/ipc/user_browser_handlers.ts
// IPC surface for the user-facing embedded browser. The renderer-owned
// <webview> tag (BrowserTab) registers its webContentsId via attach so
// MCP automation tools (Track B user_browser_*) and the legacy
// navigate/back/forward/reload calls all reach the same web frame.

import { ipcMain, BrowserWindow } from 'electron';
import { userBrowser } from '../services/user_browser';

function notifyAll(url: string, title: string): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('ubrowser:url-changed', url, title);
    }
  } catch { /* best-effort */ }
}

export function registerUserBrowserHandlers(): void {
  // Forward URL changes to all renderer windows.
  userBrowser.onUrlChanged(notifyAll);

  // NEW: renderer registers the <webview>'s webContents id on dom-ready.
  ipcMain.handle('ubrowser:attach', (_e, id: number | null) => {
    const win = BrowserWindow.getAllWindows()[0] ?? null;
    if (win) userBrowser.setMainWindow(win);
    userBrowser.attachWebContents(id);
  });

  // Legacy no-ops kept for any caller still using ubrowser:show/hide
  // (e.g. early-version HtmlViewer/PdfViewer renderers). The new
  // architecture renders via <webview> in the React DOM, so positioning
  // happens via CSS and these calls are unnecessary.
  ipcMain.handle('ubrowser:show', (_e, _x: number, _y: number, _w: number, _h: number, url?: string) => {
    if (url) userBrowser.navigate(url);
  });
  ipcMain.handle('ubrowser:hide', () => { /* no-op */ });

  ipcMain.handle('ubrowser:navigate', (_e, url: string) => {
    userBrowser.navigate(url);
  });
  ipcMain.handle('ubrowser:back', () => { userBrowser.back(); });
  ipcMain.handle('ubrowser:forward', () => { userBrowser.forward(); });
  ipcMain.handle('ubrowser:reload', () => { userBrowser.reload(); });
}
