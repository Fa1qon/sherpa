// src/renderer/ipc/browser_ipc.ts
import type { BrowserEvent, BrowserMode } from '../../core/domain/browser';
import type { ScreenshotResult } from '../../core/ports/browser_port';

// Lazy getter — evaluated on first call, not at module load time.
// This avoids any timing issues during renderer startup.
function getBridge(): Record<string, (...args: unknown[]) => unknown> {
  const b = (window as { sherpa?: { browser?: Record<string, unknown> } }).sherpa?.browser as Record<string, (...args: unknown[]) => unknown> | undefined;
  if (!b) throw new Error('browser bridge not available (window.sherpa.browser is undefined)');
  return b;
}

export const browserIpc = {
  open: (taskId: string, mode: BrowserMode): Promise<{ ok: boolean; mode: BrowserMode }> =>
    getBridge()['open'](taskId, mode) as Promise<{ ok: boolean; mode: BrowserMode }>,

  close: (taskId: string): Promise<{ ok: boolean }> =>
    getBridge()['close'](taskId) as Promise<{ ok: boolean }>,

  navigate: (taskId: string, url: string): Promise<{ ok: boolean }> =>
    getBridge()['navigate'](taskId, url) as Promise<{ ok: boolean }>,

  screenshot: (taskId: string): Promise<ScreenshotResult> =>
    getBridge()['screenshot'](taskId) as Promise<ScreenshotResult>,

  click: (taskId: string, selector: string): Promise<{ ok: boolean }> =>
    getBridge()['click'](taskId, selector) as Promise<{ ok: boolean }>,

  type: (taskId: string, selector: string, text: string): Promise<{ ok: boolean }> =>
    getBridge()['type'](taskId, selector, text) as Promise<{ ok: boolean }>,

  evaluate: <T>(taskId: string, script: string): Promise<T> =>
    getBridge()['evaluate'](taskId, script) as Promise<T>,

  getDOM: (taskId: string): Promise<string> =>
    getBridge()['getDOM'](taskId) as Promise<string>,

  waitFor: (taskId: string, selector: string, timeoutMs?: number): Promise<{ ok: boolean }> =>
    getBridge()['waitFor'](taskId, selector, timeoutMs) as Promise<{ ok: boolean }>,

  highlight: (taskId: string, selector: string): Promise<{ ok: boolean }> =>
    getBridge()['highlight'](taskId, selector) as Promise<{ ok: boolean }>,

  onEvent: (handler: (taskId: string, event: BrowserEvent) => void): () => void =>
    getBridge()['onEvent'](handler) as () => void,
};
