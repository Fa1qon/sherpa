// src/extensions/sdk/types.ts
// Extension Framework Plan 03 Task 1 — common SDK types.
//
// Shared between `createMainSdk` (main-process entry) and
// `createRendererSdk` (renderer-process entry). Both factories receive an
// `SdkContext` (manifest + granted permissions) and produce a `*Sdk` shape
// that gates every operation through `checkPermission`.

import type {
  ExtensionManifest,
  ExtensionToolDef,
} from '../../core/domain/extension_manifest';
import type { AppEvent } from '../../core/domain/app_events';

/**
 * Per-extension context handed to every SDK factory. The `permissions`
 * array is the *granted* set parsed from the loaded manifest — it must
 * already have been validated (`isValidPermission`) by the loader.
 */
export interface SdkContext {
  manifest: ExtensionManifest;
  permissions: readonly string[];
}

/**
 * Tool handler signature for `MainSdk.ai.registerTool`. Input is the raw
 * JSON value matching the tool's `inputSchema`; the registry stores
 * handlers untyped to keep the registry surface narrow. Adapters that
 * dispatch tools downstream are responsible for runtime validation.
 */
export type ToolHandler = (input: unknown) => Promise<unknown> | unknown;

/**
 * Surface exposed to a main-process extension entry point.
 *
 * All getters are *synchronous* — storage lives in the same process as
 * the caller, the event bus is in-memory, and `ai.registerTool` is a
 * pure map insert. Only `ipc.call` is async (it dispatches through the
 * electron IPC handler registry).
 */
export interface MainSdk {
  events: {
    on<T extends AppEvent['type']>(
      type: T,
      handler: (ev: Extract<AppEvent, { type: T }>) => void,
    ): () => void;
    emit(ev: AppEvent): void;
  };
  storage: {
    get<T = unknown>(key: string): T | null;
    set<T = unknown>(key: string, value: T): void;
    delete(key: string): void;
    keys(): string[];
  };
  ai: {
    registerTool(def: ExtensionToolDef, handler: ToolHandler): void;
  };
  ipc: {
    call(channel: string, ...args: unknown[]): Promise<unknown>;
  };
}

/**
 * Surface exposed to a renderer-process extension entry point. Storage
 * is async (IPC round-trip to main); events arrive over the existing
 * `sherpa.events` preload bridge.
 */
export interface RendererSdk {
  events: {
    on<T extends AppEvent['type']>(
      type: T,
      handler: (ev: Extract<AppEvent, { type: T }>) => void,
    ): () => void;
  };
  storage: {
    get<T = unknown>(key: string): Promise<T | null>;
    set<T = unknown>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
  };
  slots: {
    /** Register a React component into a named UI slot. */
    register(slotId: string, component: unknown): void;
  };
  ipc: {
    call(channel: string, ...args: unknown[]): Promise<unknown>;
  };
}
