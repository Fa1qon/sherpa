// src/main/ipc/browser_handlers.ts
import type { IpcMain, IpcMainInvokeEvent, BrowserWindow as BrowserWindowType } from 'electron';
import type { BrowserService } from '../services/browser_service';
import type { BrowserMode } from '../../core/domain/browser';

export const CH_BROWSER = {
  OPEN: 'browser:open',
  CLOSE: 'browser:close',
  NAVIGATE: 'browser:navigate',
  SCREENSHOT: 'browser:screenshot',
  CLICK: 'browser:click',
  TYPE: 'browser:type',
  EVALUATE: 'browser:evaluate',
  GET_DOM: 'browser:get-dom',
  WAIT_FOR: 'browser:wait-for',
  HIGHLIGHT: 'browser:highlight',
  EVENT: 'browser:event', // push channel (main → renderer)
} as const;

export function registerBrowserHandlers(browserService: BrowserService): void {
  // Lazy require so this module loads in vitest (where electron is unavailable).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electron = require('electron') as {
    ipcMain: IpcMain | undefined;
    BrowserWindow: { fromWebContents(wc: unknown): BrowserWindowType | null } | undefined;
  };
  const ipcMain = electron.ipcMain;
  const BrowserWindow = electron.BrowserWindow;
  // Guard: no-op when electron is not available (e.g. in vitest).
  if (!ipcMain) return;

  ipcMain.handle(CH_BROWSER.OPEN, async (event: IpcMainInvokeEvent, taskId: string, mode: BrowserMode) => {
    const win = BrowserWindow?.fromWebContents(event.sender) ?? null;
    await browserService.createSession(taskId, mode, mode === 'embedded' ? win : null);

    // Forward events to renderer
    const session = browserService.getSession(taskId)!;
    session.onEvent((ev) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(CH_BROWSER.EVENT, taskId, ev);
      }
    });

    return { ok: true, mode };
  });

  ipcMain.handle(CH_BROWSER.CLOSE, async (_e, taskId: string) => {
    await browserService.closeSession(taskId);
    return { ok: true };
  });

  ipcMain.handle(CH_BROWSER.NAVIGATE, async (_e, taskId: string, url: string) => {
    const session = browserService.getSession(taskId);
    if (!session) throw new Error(`No session for task ${taskId}`);
    await session.port.navigate(url);
    return { ok: true };
  });

  ipcMain.handle(CH_BROWSER.SCREENSHOT, async (_e, taskId: string) => {
    const session = browserService.getSession(taskId);
    if (!session) throw new Error(`No session for task ${taskId}`);
    return session.port.screenshot();
  });

  ipcMain.handle(CH_BROWSER.CLICK, async (_e, taskId: string, selector: string) => {
    const session = browserService.getSession(taskId);
    if (!session) throw new Error(`No session for task ${taskId}`);
    await session.port.click(selector);
    return { ok: true };
  });

  ipcMain.handle(CH_BROWSER.TYPE, async (_e, taskId: string, selector: string, text: string) => {
    const session = browserService.getSession(taskId);
    if (!session) throw new Error(`No session for task ${taskId}`);
    await session.port.type(selector, text);
    return { ok: true };
  });

  ipcMain.handle(CH_BROWSER.EVALUATE, async (_e, taskId: string, script: string) => {
    const session = browserService.getSession(taskId);
    if (!session) throw new Error(`No session for task ${taskId}`);
    return session.port.evaluate(script);
  });

  ipcMain.handle(CH_BROWSER.GET_DOM, async (_e, taskId: string) => {
    const session = browserService.getSession(taskId);
    if (!session) throw new Error(`No session for task ${taskId}`);
    return session.port.getDOM();
  });

  ipcMain.handle(CH_BROWSER.WAIT_FOR, async (_e, taskId: string, selector: string, timeoutMs?: number) => {
    const session = browserService.getSession(taskId);
    if (!session) throw new Error(`No session for task ${taskId}`);
    await session.port.waitFor(selector, timeoutMs);
    return { ok: true };
  });

  ipcMain.handle(CH_BROWSER.HIGHLIGHT, async (_e, taskId: string, selector: string) => {
    const session = browserService.getSession(taskId);
    if (!session) throw new Error(`No session for task ${taskId}`);
    await session.port.highlight(selector);
    return { ok: true };
  });
}
