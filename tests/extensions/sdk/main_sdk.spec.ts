// tests/extensions/sdk/main_sdk.spec.ts
// Extension Framework Plan 03 Task 5 — createMainSdk tests.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

import { createMainSdk } from '../../../src/extensions/sdk/main_sdk';
import { ExtensionStorage } from '../../../src/extensions/sdk/extension_storage';
import { EventBus } from '../../../src/main/services/event_bus';
import { ExtensionToolRegistry } from '../../../src/main/services/extension_tool_registry';
import type { ExtensionManifest } from '../../../src/core/domain/extension_manifest';
import type { SdkContext } from '../../../src/extensions/sdk/types';

const baseManifest: ExtensionManifest = {
  id: 'ext.test',
  name: 'Test',
  version: '1.0.0',
  engines: { sherpa: '>=0.0.0' },
  entry: { main: 'main.js' },
};

function ctxWith(permissions: string[]): SdkContext {
  return { manifest: baseManifest, permissions };
}

function build(
  permissions: string[],
  ipcMain?: { _invokeHandlers?: Map<string, (...a: unknown[]) => unknown> },
): ReturnType<typeof createMainSdk> {
  const db = new Database(':memory:');
  return createMainSdk({
    ctx: ctxWith(permissions),
    eventBus: new EventBus(null),
    storage: new ExtensionStorage(db),
    toolRegistry: new ExtensionToolRegistry(),
    ipcMain,
  });
}

describe('createMainSdk — permission gating', () => {
  it('events.on throws without events.subscribe', () => {
    const sdk = build([]);
    expect(() => sdk.events.on('task.created', () => undefined)).toThrow(
      'Permission denied: extension "ext.test" lacks "events.subscribe"',
    );
  });

  it('events.emit throws without events.emit', () => {
    const sdk = build([]);
    expect(() => sdk.events.emit({ type: 'task.created', ts: 1, taskId: 'T1' })).toThrow(
      'Permission denied: extension "ext.test" lacks "events.emit"',
    );
  });

  it('storage.* throws without storage.local', () => {
    const sdk = build([]);
    expect(() => sdk.storage.get('k')).toThrow(/lacks "storage.local"/);
    expect(() => sdk.storage.set('k', 1)).toThrow(/lacks "storage.local"/);
    expect(() => sdk.storage.delete('k')).toThrow(/lacks "storage.local"/);
    expect(() => sdk.storage.keys()).toThrow(/lacks "storage.local"/);
  });

  it('ai.registerTool throws without ai.tool.register', () => {
    const sdk = build([]);
    expect(() =>
      sdk.ai.registerTool(
        { id: 'x', description: 'd', inputSchema: { type: 'object' } },
        () => null,
      ),
    ).toThrow(/lacks "ai.tool.register"/);
  });

  it('ipc.call throws without ipc.call:<channel>', async () => {
    const sdk = build([]);
    await expect(sdk.ipc.call('some.channel')).rejects.toThrow(
      'Permission denied: extension "ext.test" lacks "ipc.call:some.channel"',
    );
  });
});

describe('createMainSdk — happy paths', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
  });

  it('events.on subscribes and emit fans out', () => {
    const bus = new EventBus(null);
    const sdk = createMainSdk({
      ctx: ctxWith(['events.subscribe', 'events.emit']),
      eventBus: bus,
      storage: new ExtensionStorage(db),
      toolRegistry: new ExtensionToolRegistry(),
    });
    const received: unknown[] = [];
    const off = sdk.events.on('task.created', (e) => received.push(e));
    sdk.events.emit({ type: 'task.created', ts: 1, taskId: 'T1' });
    expect(received.length).toBe(1);
    off();
    sdk.events.emit({ type: 'task.created', ts: 2, taskId: 'T2' });
    expect(received.length).toBe(1);
  });

  it('storage operations are scoped per extension id', () => {
    const storage = new ExtensionStorage(db);
    const sdk = createMainSdk({
      ctx: ctxWith(['storage.local']),
      eventBus: new EventBus(null),
      storage,
      toolRegistry: new ExtensionToolRegistry(),
    });
    sdk.storage.set('k', { v: 1 });
    expect(sdk.storage.get('k')).toEqual({ v: 1 });
    expect(sdk.storage.keys()).toEqual(['k']);
    sdk.storage.delete('k');
    expect(sdk.storage.get('k')).toBeNull();

    // A different extension cannot see the data.
    const other = storage.forExtension('ext.other');
    expect(other.get('k')).toBeNull();
  });

  it('ai.registerTool inserts into the registry', () => {
    const reg = new ExtensionToolRegistry();
    const sdk = createMainSdk({
      ctx: ctxWith(['ai.tool.register']),
      eventBus: new EventBus(null),
      storage: new ExtensionStorage(db),
      toolRegistry: reg,
    });
    sdk.ai.registerTool(
      { id: 'echo', description: 'd', inputSchema: {} },
      (i) => i,
    );
    expect(reg.list().length).toBe(1);
    expect(reg.list()[0]?.extensionId).toBe('ext.test');
  });

  it('ipc.call dispatches via _invokeHandlers map', async () => {
    const handlers = new Map<string, (...a: unknown[]) => unknown>();
    handlers.set('echo.channel', async (_e, payload: unknown) => ({ got: payload }));
    const sdk = build(['ipc.call:echo.channel'], { _invokeHandlers: handlers });
    const result = await sdk.ipc.call('echo.channel', { x: 1 });
    expect(result).toEqual({ got: { x: 1 } });
  });

  it('ipc.call throws when no handler is registered', async () => {
    const sdk = build(['ipc.call:missing'], { _invokeHandlers: new Map() });
    await expect(sdk.ipc.call('missing')).rejects.toThrow(/No handler for channel "missing"/);
  });

  it('permission wildcard pattern grants ipc.call:* prefix', async () => {
    const handlers = new Map<string, (...a: unknown[]) => unknown>();
    handlers.set('myExt.foo', () => 'ok');
    const sdk = build(['ipc.call:myExt.*'], { _invokeHandlers: handlers });
    await expect(sdk.ipc.call('myExt.foo')).resolves.toBe('ok');
  });
});
