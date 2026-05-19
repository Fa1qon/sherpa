// src/extensions/sdk/renderer_sdk.ts
// Extension Framework Plan 03 Task 6 — createRendererSdk factory.
//
// Mirrors `createMainSdk` but for the renderer process. Storage is async
// (each call round-trips to main via the `sherpa.extension.storage`
// preload bridge). Events flow over `sherpa.events.on` (already set up
// by Plan 02 preload). `slots.register` delegates to a caller-supplied
// callback — the slot registration target is wired up by Plan 04's UI
// slot system (typically a global `__sherpaSlots` shim).

import { checkPermission } from '../../core/domain/extension_permissions';
import type { AppEvent } from '../../core/domain/app_events';
import type { RendererSdk, SdkContext } from './types';

/**
 * Subset of `window.sherpa` we depend on. Kept narrow so renderer tests
 * can hand-roll a fake without simulating the full preload surface.
 *
 * `[channel: string]` permits `ipc.call` to forward through whatever
 * preload-exposed function happens to be named after the channel — the
 * production preload mirrors namespaced channels onto `sherpa.<ns>.<op>`.
 */
export interface SherpaRendererBridge {
  events: {
    on<T extends AppEvent['type']>(
      type: T,
      handler: (ev: Extract<AppEvent, { type: T }>) => void,
    ): () => void;
  };
  extension: {
    storage: {
      get(extId: string, key: string): Promise<unknown>;
      set(extId: string, key: string, value: unknown): Promise<void>;
      delete(extId: string, key: string): Promise<void>;
    };
  };
}

export interface CreateRendererSdkArgs {
  ctx: SdkContext;
  /**
   * Renderer bridge. In production this is `window.sherpa`; tests pass a
   * stub. Indexed-access keys allow `ipc.call` to look up arbitrary
   * preload-exposed channels.
   */
  bridge: SherpaRendererBridge & Record<string, unknown>;
  /**
   * Callback invoked by `slots.register`. Plan 04 wires this to the
   * renderer slot system; tests pass a recording spy.
   */
  slotRegistration: (extId: string, slotId: string, component: unknown) => void;
}

export function createRendererSdk(args: CreateRendererSdkArgs): RendererSdk {
  const { ctx, bridge, slotRegistration } = args;

  const requirePerm = (perm: string): void => {
    if (!checkPermission(ctx.permissions, perm)) {
      throw new Error(
        `Permission denied: extension "${ctx.manifest.id}" lacks "${perm}"`,
      );
    }
  };

  return {
    events: {
      on(type, handler) {
        requirePerm('events.subscribe');
        return bridge.events.on(type, handler);
      },
    },
    storage: {
      async get<T = unknown>(key: string): Promise<T | null> {
        requirePerm('storage.local');
        const v = await bridge.extension.storage.get(ctx.manifest.id, key);
        return (v as T | null) ?? null;
      },
      async set<T = unknown>(key: string, value: T): Promise<void> {
        requirePerm('storage.local');
        await bridge.extension.storage.set(ctx.manifest.id, key, value);
      },
      async delete(key: string): Promise<void> {
        requirePerm('storage.local');
        await bridge.extension.storage.delete(ctx.manifest.id, key);
      },
    },
    slots: {
      register(slotId: string, component: unknown): void {
        slotRegistration(ctx.manifest.id, slotId, component);
      },
    },
    ipc: {
      async call(channel: string, ...callArgs: unknown[]): Promise<unknown> {
        requirePerm(`ipc.call:${channel}`);
        // The preload bridge is structured as nested namespaces
        // (e.g. `sherpa.task.create`, not `sherpa['task.create']`), so
        // walk the dotted channel path through the bridge object.
        const parts = channel.split('.');
        let cursor: unknown = bridge;
        for (const p of parts) {
          if (
            cursor === null ||
            typeof cursor !== 'object' ||
            !(p in (cursor as Record<string, unknown>))
          ) {
            throw new Error(`Channel "${channel}" not exposed`);
          }
          cursor = (cursor as Record<string, unknown>)[p];
        }
        if (typeof cursor !== 'function') {
          throw new Error(`Channel "${channel}" is not callable`);
        }
        return (cursor as (...a: unknown[]) => Promise<unknown>)(...callArgs);
      },
    },
  };
}
