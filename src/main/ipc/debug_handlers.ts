// src/main/ipc/debug_handlers.ts
//
// Backend error capture for E2E tests. Active only when SHERPA_DEBUG_E2E=1.
// Collects unhandledRejection, uncaughtException, and explicit logError() calls.
// Tests read errors via window.sherpa.debug.getErrors().

import { ipcMain } from 'electron';
import { CH } from './channels';

interface BackendError {
  kind: 'unhandledRejection' | 'uncaughtException' | 'explicit';
  message: string;
  stack?: string;
  timestamp: string;
}

const errors: BackendError[] = [];
let initialized = false;

export function initDebugErrorCapture(): void {
  if (process.env.SHERPA_DEBUG_E2E !== '1') return;
  if (initialized) return;
  initialized = true;

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    errors.push({
      kind: 'unhandledRejection',
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    });
  });

  process.on('uncaughtException', (err) => {
    errors.push({
      kind: 'uncaughtException',
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    });
  });
}

/** Call from service code to record a non-fatal backend error for test visibility. */
export function logDebugError(kind: 'explicit', message: string, stack?: string): void {
  if (process.env.SHERPA_DEBUG_E2E !== '1') return;
  errors.push({ kind, message, stack, timestamp: new Date().toISOString() });
}

export function registerDebugHandlers(): void {
  if (process.env.SHERPA_DEBUG_E2E !== '1') return;

  ipcMain.handle(CH.DEBUG_GET_ERRORS, () => {
    const copy = [...errors];
    errors.length = 0; // drain after each read
    return copy;
  });
}
