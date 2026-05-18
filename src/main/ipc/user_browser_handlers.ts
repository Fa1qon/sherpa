// src/main/ipc/user_browser_handlers.ts
// IPC surface for the user-facing embedded browser (ubrowser:* channels).
// Registered once at app startup; coordinates are renderer pixel values.

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

  ipcMain.handle(
    'ubrowser:show',
    (_e, x: number, y: number, w: number, h: number, url?: string) => {
      const win = BrowserWindow.getAllWindows()[0] ?? null;
      if (win) userBrowser.setMainWindow(win);
      userBrowser.show(x, y, w, h, url);
    },
  );

  ipcMain.handle('ubrowser:hide', () => { userBrowser.hide(); });

  ipcMain.handle('ubrowser:navigate', (_e, url: string) => {
    userBrowser.navigate(url);
  });

  ipcMain.handle('ubrowser:back', () => { userBrowser.back(); });
  ipcMain.handle('ubrowser:forward', () => { userBrowser.forward(); });
  ipcMain.handle('ubrowser:reload', () => { userBrowser.reload(); });
}
