// tests/e2e/helpers/errors.ts
//
// Usage in tests:
//   const errors = collectErrors(page);
//   // ... test actions ...
//   assertNoErrors(errors);  // or check errors.list manually

import type { Page } from '@playwright/test';

export interface ErrorRecord {
  kind: 'pageerror' | 'console-error' | 'backend-error';
  message: string;
  stack?: string;
}

export interface ErrorCollector {
  list: ErrorRecord[];
}

/**
 * Attaches listeners to page that record all JS errors and console errors.
 * Call at the start of a test; call assertNoErrors() at the end.
 */
export function collectErrors(page: Page): ErrorCollector {
  const collector: ErrorCollector = { list: [] };

  page.on('pageerror', (err) => {
    collector.list.push({
      kind: 'pageerror',
      message: err.message,
      stack: err.stack,
    });
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      // Filter known noise from Electron/Chromium internals
      const text = msg.text();
      if (text.includes('Electron Security Warning')) return;
      if (text.includes('Failed to load resource: net::ERR_FILE_NOT_FOUND') && text.includes('favicon')) return;
      collector.list.push({
        kind: 'console-error',
        message: text,
      });
    }
  });

  return collector;
}

/**
 * Throws if any errors were collected. Call in afterEach or at end of test.
 * Pass `ignore` patterns to whitelist expected errors.
 */
export function assertNoErrors(
  collector: ErrorCollector,
  ignore: RegExp[] = [],
): void {
  const real = collector.list.filter(
    (e) => !ignore.some((rx) => rx.test(e.message)),
  );
  if (real.length > 0) {
    const lines = real.map((e) =>
      `[${e.kind}] ${e.message}${e.stack ? '\n' + e.stack : ''}`,
    );
    throw new Error(`E2E test captured ${real.length} browser error(s):\n\n${lines.join('\n\n')}`);
  }
}

/**
 * Read backend errors from the main process via debug IPC channel.
 * Only works when SHERPA_DEBUG_E2E=1 is set in env.
 */
export async function getBackendErrors(page: Page): Promise<ErrorRecord[]> {
  try {
    const raw = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(window.sherpa as any)?.debug?.getErrors) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window.sherpa as any).debug.getErrors();
    });
    return (raw as Array<{ kind: string; message: string; stack?: string }>).map((e) => ({
      kind: 'backend-error' as const,
      message: `[backend:${e.kind}] ${e.message}`,
      stack: e.stack,
    }));
  } catch {
    return [];
  }
}
