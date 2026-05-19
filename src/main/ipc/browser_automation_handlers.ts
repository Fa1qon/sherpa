// src/main/ipc/browser_automation_handlers.ts
//
// Registers ipcMain handlers for the 12 BrowserAutomationService methods.
// Wired into the composition root by Task 7 alongside service instantiation;
// this module is intentionally inert at import time.

import { ipcMain } from 'electron';
import { CH } from './channels';
import type { BrowserAutomationService } from '../services/browser_automation';

export function registerBrowserAutomationHandlers(svc: BrowserAutomationService): void {
  ipcMain.handle(CH.BROWSER_TOOL_NAVIGATE, (_e, url: string) => svc.navigate(url));
  ipcMain.handle(CH.BROWSER_TOOL_SCREENSHOT, (_e, opts?: { fullPage?: boolean }) =>
    svc.screenshot(opts),
  );
  ipcMain.handle(CH.BROWSER_TOOL_GET_HTML, (_e, selector?: string) => svc.getHtml(selector));
  ipcMain.handle(CH.BROWSER_TOOL_QUERY_SELECTOR, (_e, selector: string, all?: boolean) =>
    svc.querySelector(selector, all),
  );
  ipcMain.handle(CH.BROWSER_TOOL_EVALUATE_JS, (_e, code: string) => svc.evaluateJs(code));
  ipcMain.handle(
    CH.BROWSER_TOOL_CLICK,
    (_e, selector: string, button?: 'left' | 'right' | 'middle') => svc.click(selector, button),
  );
  ipcMain.handle(
    CH.BROWSER_TOOL_TYPE,
    (_e, selector: string, text: string, delay?: number) => svc.type(selector, text, delay),
  );
  ipcMain.handle(CH.BROWSER_TOOL_KEY, (_e, key: string, modifiers?: string[]) =>
    svc.key(key, modifiers),
  );
  ipcMain.handle(
    CH.BROWSER_TOOL_DRAG,
    (_e, from: { x: number; y: number }, to: { x: number; y: number }) => svc.drag(from, to),
  );
  ipcMain.handle(CH.BROWSER_TOOL_RESIZE, (_e, width: number, height: number) =>
    svc.resize(width, height),
  );
  ipcMain.handle(CH.BROWSER_TOOL_CONSOLE_ERRORS, (_e, sinceMs?: number) =>
    svc.getConsoleErrors(sinceMs),
  );
  ipcMain.handle(CH.BROWSER_TOOL_NETWORK_LOG, (_e, sinceMs?: number, filterMime?: string) =>
    svc.getNetworkLog(sinceMs, filterMime),
  );
}
