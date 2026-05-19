// src/main/services/extension_loader.ts
// Extension Framework Plan 05 Task 2 — scan, parse, and activate extensions.
//
// On startup the loader walks `<userData>/extensions/<id>/`, parses each
// `sherpa.extension.json`, validates the manifest, and — if the state
// store says the extension is enabled — dynamically `import()`s the
// main-process entry point and invokes its `activate(sdk)` hook with a
// fresh MainSdk bound to that extension's id + permissions.
//
// Dynamic import compat note: on Windows, `import('C:\\path\\to\\mod.js')`
// throws ERR_INVALID_URL — we must rewrite to a `file:///` URL with
// forward slashes. CommonJS modules expose themselves on `module.default`
// when imported from ESM, so the activate hook is resolved as
// `mod.activate ?? mod.default?.activate`.

import path from 'node:path';
import { promises as fs } from 'node:fs';

import {
  parseManifest,
  validateManifest,
  type ExtensionManifest,
} from '../../core/domain/extension_manifest';
import { createMainSdk } from '../../extensions/sdk/main_sdk';
import type { EventBus } from './event_bus';
import type { ExtensionStorage } from '../../extensions/sdk/extension_storage';
import type { ExtensionToolRegistry } from './extension_tool_registry';
import type { ExtensionStateStore } from './extension_state_store';
import type { ExtensionSlotRegistry } from './extension_slot_registry';

interface ExtensionMainModule {
  activate?(sdk: unknown): Promise<void> | void;
  deactivate?(): Promise<void> | void;
  default?: {
    activate?(sdk: unknown): Promise<void> | void;
    deactivate?(): Promise<void> | void;
  };
}

export interface LoadedExtension {
  manifest: ExtensionManifest;
  dir: string;
  mainModule?: ExtensionMainModule;
  hasRendererEntry: boolean;
  enabled: boolean;
}

export interface LoaderDeps {
  rootDir: string;
  eventBus: EventBus;
  storage: ExtensionStorage;
  toolRegistry: ExtensionToolRegistry;
  slotRegistry: ExtensionSlotRegistry;
  stateStore: ExtensionStateStore;
}

/**
 * Resolve the `activate` / `deactivate` hooks from an imported module.
 * CJS modules expose themselves on `module.default` when imported via the
 * ESM `import()` interop layer; ESM modules expose them on the top level.
 * Try both.
 */
function pickHook<K extends 'activate' | 'deactivate'>(
  mod: ExtensionMainModule,
  key: K,
): ExtensionMainModule[K] {
  return mod[key] ?? mod.default?.[key];
}

export class ExtensionLoader {
  private readonly loaded = new Map<string, LoadedExtension>();

  constructor(private readonly deps: LoaderDeps) {}

  async loadAll(): Promise<LoadedExtension[]> {
    try {
      await fs.mkdir(this.deps.rootDir, { recursive: true });
    } catch {
      // Best effort — `readdir` below will surface real failures.
    }

    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
      entries = await fs.readdir(this.deps.rootDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const results: LoadedExtension[] = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const name = String(ent.name);
      // Skip transient install staging directories.
      if (name.startsWith('.tmp-install-')) continue;
      const dir = path.join(this.deps.rootDir, name);
      try {
        const ext = await this.loadOne(dir);
        if (ext) results.push(ext);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[ExtensionLoader] failed to load ${dir}:`, err);
      }
    }
    return results;
  }

  async loadOne(dir: string): Promise<LoadedExtension | null> {
    const manifestPath = path.join(dir, 'sherpa.extension.json');
    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, 'utf8');
    } catch {
      return null;
    }
    const manifest = parseManifest(raw);
    const validation = validateManifest(manifest);
    if (!validation.ok) {
      throw new Error(`Manifest invalid: ${validation.errors.join('; ')}`);
    }

    const state = this.deps.stateStore.get(manifest.id);
    if (!state) {
      // First time we see this extension — disabled by default for safety.
      this.deps.stateStore.upsert(manifest.id, false);
    }
    const enabled = state?.enabled ?? false;

    const ext: LoadedExtension = {
      manifest,
      dir,
      hasRendererEntry: typeof manifest.entry.renderer === 'string',
      enabled: false,
    };

    this.loaded.set(manifest.id, ext);

    if (enabled) {
      await this.activate(ext);
    }

    return ext;
  }

  async activate(ext: LoadedExtension): Promise<void> {
    if (ext.enabled) return;

    if (ext.manifest.entry.main) {
      const mainPath = path.resolve(ext.dir, ext.manifest.entry.main);
      // file:/// URL for cross-platform dynamic import; Windows requires
      // forward slashes and the file:/// prefix.
      const fileUrl = `file:///${mainPath.replace(/\\/g, '/')}`;
      const mod = (await import(fileUrl)) as ExtensionMainModule;
      ext.mainModule = mod;

      const sdk = createMainSdk({
        ctx: {
          manifest: ext.manifest,
          permissions: ext.manifest.permissions ?? [],
        },
        eventBus: this.deps.eventBus,
        storage: this.deps.storage,
        toolRegistry: this.deps.toolRegistry,
      });

      const activateHook = pickHook(mod, 'activate');
      if (typeof activateHook === 'function') {
        await activateHook(sdk);
      }
    }

    // Slot registrations declared in the manifest are populated up-front so
    // the renderer's SlotOutlet can find them as soon as the extension is
    // enabled — the renderer entry (if any) provides the actual components.
    if (Array.isArray(ext.manifest.slots)) {
      for (const slot of ext.manifest.slots) {
        this.deps.slotRegistry.register(
          ext.manifest.id,
          slot,
          ext.manifest.entry.renderer,
        );
      }
    }

    ext.enabled = true;
  }

  async deactivate(extensionId: string): Promise<void> {
    const ext = this.loaded.get(extensionId);
    if (!ext) return;
    if (!ext.enabled) return;

    if (ext.mainModule) {
      const deactivateHook = pickHook(ext.mainModule, 'deactivate');
      if (typeof deactivateHook === 'function') {
        try {
          await deactivateHook();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(
            `[ExtensionLoader] deactivate hook for ${extensionId} threw:`,
            err,
          );
        }
      }
    }

    this.deps.toolRegistry.unregister(extensionId);
    this.deps.slotRegistry.unregister(extensionId);
    ext.enabled = false;
  }

  async enable(extensionId: string): Promise<void> {
    const ext = this.loaded.get(extensionId);
    if (!ext) throw new Error(`Extension "${extensionId}" not loaded`);
    if (ext.enabled) return;
    this.deps.stateStore.setEnabled(extensionId, true);
    await this.activate(ext);
  }

  async disable(extensionId: string): Promise<void> {
    const ext = this.loaded.get(extensionId);
    if (!ext) return;
    this.deps.stateStore.setEnabled(extensionId, false);
    await this.deactivate(extensionId);
  }

  /** Forget an extension from the in-memory map (used after uninstall). */
  forget(extensionId: string): void {
    this.loaded.delete(extensionId);
  }

  list(): LoadedExtension[] {
    return Array.from(this.loaded.values());
  }

  get(extensionId: string): LoadedExtension | undefined {
    return this.loaded.get(extensionId);
  }
}
