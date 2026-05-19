// src/extensions/sdk/main_sdk.ts
// Extension Framework Plan 03 Task 5 — createMainSdk factory.
//
// Builds the `MainSdk` surface for a single main-process extension entry
// point. Every operation is gated through `checkPermission`; a missing
// permission produces a thrown Error with the canonical message
// "Permission denied: extension "<id>" lacks "<perm>"".
//
// `ipc.call` reaches into electron's private `_invokeHandlers` map to
// dispatch a registered ipcMain channel synchronously without a real
// renderer. This is private API but acceptable for our internal-only
// SDK (per the Plan 03 spec). If electron is unavailable (vitest) the
// branch is exercised through a stubbed `ipcMain`-like object handed in
// via dependency injection.

import { checkPermission } from '../../core/domain/extension_permissions';
import type { ExtensionToolDef } from '../../core/domain/extension_manifest';
import type { EventBus } from '../../main/services/event_bus';
import type { ExtensionToolRegistry } from '../../main/services/extension_tool_registry';
import type { ExtensionStorage } from './extension_storage';
import type { MainSdk, SdkContext, ToolHandler } from './types';

/**
 * Minimal shape of electron's `ipcMain` we rely on. The actual electron
 * import exposes the same surface; we type it narrowly so vitest can
 * pass a hand-rolled fake without dragging in `electron` types.
 */
type InternalIpcMain = {
  _invokeHandlers?: Map<
    string,
    (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown
  >;
};

export interface CreateMainSdkArgs {
  ctx: SdkContext;
  eventBus: EventBus;
  storage: ExtensionStorage;
  toolRegistry: ExtensionToolRegistry;
  /**
   * Optional injection seam for tests. When omitted we lazy-require
   * `electron` at first `ipc.call` invocation; failures bubble up.
   */
  ipcMain?: InternalIpcMain;
}

export function createMainSdk(args: CreateMainSdkArgs): MainSdk {
  const { ctx, eventBus, storage, toolRegistry, ipcMain: injectedIpcMain } = args;

  const requirePerm = (perm: string): void => {
    if (!checkPermission(ctx.permissions, perm)) {
      throw new Error(
        `Permission denied: extension "${ctx.manifest.id}" lacks "${perm}"`,
      );
    }
  };

  const extStorage = storage.forExtension(ctx.manifest.id);

  const resolveIpcMain = (): InternalIpcMain => {
    if (injectedIpcMain) return injectedIpcMain;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { ipcMain: InternalIpcMain };
    return electron.ipcMain;
  };

  return {
    events: {
      on(type, handler) {
        requirePerm('events.subscribe');
        return eventBus.on(type, handler);
      },
      emit(ev) {
        requirePerm('events.emit');
        eventBus.emit(ev);
      },
    },
    storage: {
      get<T = unknown>(key: string): T | null {
        requirePerm('storage.local');
        return extStorage.get<T>(key);
      },
      set<T = unknown>(key: string, value: T): void {
        requirePerm('storage.local');
        extStorage.set<T>(key, value);
      },
      delete(key: string): void {
        requirePerm('storage.local');
        extStorage.delete(key);
      },
      keys(): string[] {
        requirePerm('storage.local');
        return extStorage.keys();
      },
    },
    ai: {
      registerTool(def: ExtensionToolDef, handler: ToolHandler): void {
        requirePerm('ai.tool.register');
        toolRegistry.register(ctx.manifest.id, def, handler);
      },
    },
    ipc: {
      async call(channel: string, ...callArgs: unknown[]): Promise<unknown> {
        requirePerm(`ipc.call:${channel}`);
        const ipcMain = resolveIpcMain();
        const handlers = ipcMain._invokeHandlers;
        const handler = handlers?.get(channel);
        if (!handler) {
          throw new Error(`No handler for channel "${channel}"`);
        }
        // Synthetic IpcMainInvokeEvent. Electron types `sender.id` as a
        // `number` (WebContents id); -1 is our sentinel value indicating
        // the call originated from the extension SDK rather than a real
        // renderer frame. Cast through `unknown` to satisfy strict typing.
        const fakeEvent = { sender: { id: -1 } } as unknown as Parameters<typeof handler>[0];
        return handler(fakeEvent, ...callArgs);
      },
    },
  };
}
