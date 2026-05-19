// src/main/services/console_capture.ts
//
// Passive ring-buffer collector for `console-message` events from an Electron
// WebContents. Used by BrowserAutomationService to expose recent console output
// of the embedded UserBrowser tab to AI agents.
//
// Electron's WebContents `console-message` event in current versions delivers a
// single `details` object (`WebContentsConsoleMessageEventParams`) with:
//   { message: string,
//     level: 'info' | 'warning' | 'error' | 'debug',
//     lineNumber: number,
//     sourceId: string,
//     frame: WebFrameMain }
// The legacy positional signature `(event, level: number, message, line, source)`
// is still present as a deprecated overload. We attach using the new shape but
// also defensively handle the legacy form so unit tests with minimal mocks work.

import type { WebContents } from 'electron';

export interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  text: string;
  source?: string;
  line?: number;
  ts: number;
}

type ConsoleLevel = ConsoleEntry['level'];

// Legacy numeric level (Electron < 35): 0=verbose, 1=info, 2=warning, 3=error.
const LEGACY_LEVEL_MAP: readonly ConsoleLevel[] = ['debug', 'info', 'warn', 'error'];

function mapStringLevel(raw: string): ConsoleLevel {
  switch (raw) {
    case 'info':
      return 'info';
    case 'warning':
    case 'warn':
      return 'warn';
    case 'error':
      return 'error';
    case 'debug':
      return 'debug';
    case 'log':
      return 'log';
    default:
      return 'log';
  }
}

interface NewStyleDetails {
  message?: string;
  level?: string;
  lineNumber?: number;
  sourceId?: string;
}

export class ConsoleCapture {
  private buf: ConsoleEntry[] = [];
  private readonly MAX: number;

  constructor(max = 1000) {
    this.MAX = max;
  }

  attach(wc: WebContents): () => void {
    // Signature is intentionally `(...args: unknown[])` so we can accept both
    // the new single-`details` shape and the legacy positional shape.
    const listener = (...args: unknown[]): void => {
      const entry = this.parseArgs(args);
      if (!entry) return;
      this.push(entry);
    };
    (wc as unknown as {
      on: (event: string, listener: (...args: unknown[]) => void) => void;
    }).on('console-message', listener);
    return () => {
      (wc as unknown as {
        removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
      }).removeListener('console-message', listener);
    };
  }

  get(sinceMs?: number): ConsoleEntry[] {
    if (sinceMs === undefined) return [...this.buf];
    return this.buf.filter((e) => e.ts >= sinceMs);
  }

  clear(): void {
    this.buf = [];
  }

  private push(entry: ConsoleEntry): void {
    this.buf.push(entry);
    if (this.buf.length > this.MAX) this.buf.shift();
  }

  private parseArgs(args: unknown[]): ConsoleEntry | null {
    if (args.length === 0) return null;

    // New API: first arg is the details object (or an Event whose params we
    // can read via `event.message`/`event.level`/...). We probe for the data
    // on `args[0]`, and if missing, also on `args[1]` (some shapes wrap the
    // details under `details.message`, etc.).
    const first = args[0] as NewStyleDetails | undefined;
    if (first && typeof first === 'object' && typeof first.message === 'string') {
      return {
        level: mapStringLevel(first.level ?? 'log'),
        text: first.message,
        source: first.sourceId,
        line: first.lineNumber,
        ts: Date.now(),
      };
    }

    // Legacy positional: (event, level: number, message: string, line: number, sourceId: string)
    if (args.length >= 3 && typeof args[1] === 'number' && typeof args[2] === 'string') {
      const lvlNum = args[1];
      const lvl = LEGACY_LEVEL_MAP[lvlNum] ?? 'log';
      return {
        level: lvl,
        text: args[2],
        source: typeof args[4] === 'string' ? args[4] : undefined,
        line: typeof args[3] === 'number' ? args[3] : undefined,
        ts: Date.now(),
      };
    }

    return null;
  }
}
