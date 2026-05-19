// tests/main/ipc/extension_handlers.spec.ts
// Extension Framework Plan 03 Task 7 — extension_handlers IPC tests.
//
// Drives the handlers through a fake ipcMain so we can exercise both
// the allow-list validation and the storage round-trip without electron.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

import { registerExtensionHandlers } from '../../../src/main/ipc/extension_handlers';
import { ExtensionStorage } from '../../../src/extensions/sdk/extension_storage';
import { CH } from '../../../src/main/ipc/channels';

type Listener = (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown;

class FakeIpcMain {
  readonly handlers = new Map<string, Listener>();
  handle(channel: string, listener: Listener): void {
    this.handlers.set(channel, listener);
  }
  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const h = this.handlers.get(channel);
    if (!h) throw new Error(`No handler for ${channel}`);
    return h({}, ...args);
  }
}

describe('registerExtensionHandlers', () => {
  let db: Database.Database;
  let storage: ExtensionStorage;
  let ipc: FakeIpcMain;

  beforeEach(() => {
    db = new Database(':memory:');
    storage = new ExtensionStorage(db);
    ipc = new FakeIpcMain();
  });

  it('rejects calls for unknown extension ids (default empty allow-list)', async () => {
    registerExtensionHandlers(storage, () => new Set(), undefined, ipc as unknown as Parameters<typeof registerExtensionHandlers>[3]);
    await expect(ipc.invoke(CH.EXTENSION_STORAGE_GET, 'ext.unknown', 'k')).rejects.toThrow(
      /Permission denied/,
    );
    await expect(ipc.invoke(CH.EXTENSION_STORAGE_SET, 'ext.unknown', 'k', 1)).rejects.toThrow(
      /Permission denied/,
    );
    await expect(ipc.invoke(CH.EXTENSION_STORAGE_DELETE, 'ext.unknown', 'k')).rejects.toThrow(
      /Permission denied/,
    );
  });

  it('round-trips a value when the extension is in the allow-list', async () => {
    const allow = new Set(['ext.alpha']);
    registerExtensionHandlers(storage, () => allow, undefined, ipc as unknown as Parameters<typeof registerExtensionHandlers>[3]);
    await ipc.invoke(CH.EXTENSION_STORAGE_SET, 'ext.alpha', 'k', { x: 1 });
    await expect(ipc.invoke(CH.EXTENSION_STORAGE_GET, 'ext.alpha', 'k')).resolves.toEqual({ x: 1 });
    await ipc.invoke(CH.EXTENSION_STORAGE_DELETE, 'ext.alpha', 'k');
    await expect(ipc.invoke(CH.EXTENSION_STORAGE_GET, 'ext.alpha', 'k')).resolves.toBeNull();
  });

  it('honours allow-list changes through the lambda', async () => {
    const allow = new Set<string>();
    registerExtensionHandlers(storage, () => allow, undefined, ipc as unknown as Parameters<typeof registerExtensionHandlers>[3]);
    await expect(ipc.invoke(CH.EXTENSION_STORAGE_SET, 'ext.beta', 'k', 1)).rejects.toThrow();
    allow.add('ext.beta');
    await expect(ipc.invoke(CH.EXTENSION_STORAGE_SET, 'ext.beta', 'k', 1)).resolves.toBeUndefined();
  });

  it('keeps storage isolated by extension id even via IPC', async () => {
    const allow = new Set(['ext.a', 'ext.b']);
    registerExtensionHandlers(storage, () => allow, undefined, ipc as unknown as Parameters<typeof registerExtensionHandlers>[3]);
    await ipc.invoke(CH.EXTENSION_STORAGE_SET, 'ext.a', 'shared', 'A');
    await ipc.invoke(CH.EXTENSION_STORAGE_SET, 'ext.b', 'shared', 'B');
    await expect(ipc.invoke(CH.EXTENSION_STORAGE_GET, 'ext.a', 'shared')).resolves.toBe('A');
    await expect(ipc.invoke(CH.EXTENSION_STORAGE_GET, 'ext.b', 'shared')).resolves.toBe('B');
  });
});
