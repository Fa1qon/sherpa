// src/main/ipc/extension_handlers.ts
// Extension Framework — IPC handlers for extension storage (Plan 03 Task 7)
// AND for extension lifecycle (Plan 05 Task 4).
//
// Storage handlers (Plan 03) are anti-spoofing: every call validates the
// caller-supplied `extId` against the loader's enabled-extensions set
// (passed in via the `allowedExtIds` lambda). Plan 03 wired the lambda
// to an empty set; Plan 05 replaces it with one that reads the loader's
// enabled list — see `composition_root.ts`.
//
// Lifecycle handlers (Plan 05) drive the Extension Manager UI: list /
// enable / disable / install (zip or dir) / uninstall / get & set
// settings / pick a zip via the OS file dialog. After a successful
// install we call `loader.loadOne(targetDir)` so the new extension is
// immediately visible to the renderer without an app restart.

import type { IpcMain } from 'electron';
import { CH } from './channels';
import type { ExtensionStorage } from '../../extensions/sdk/extension_storage';
import type { ExtensionLoader } from '../services/extension_loader';
import type { ExtensionInstaller } from '../services/extension_installer';
import type { ExtensionStateStore } from '../services/extension_state_store';

/**
 * Function that returns the current set of enabled extension ids. The
 * loader (Plan 05) replaces the initial empty-set lambda with one that
 * queries the manager.
 */
export type AllowedExtIdsLambda = () => Set<string>;

/**
 * Optional dependencies for the Plan 05 lifecycle handlers. When omitted
 * (Plan 03-only wiring path) only the storage handlers are registered.
 */
export interface LifecycleDeps {
  loader: ExtensionLoader;
  installer: ExtensionInstaller;
  stateStore: ExtensionStateStore;
}

/** Shape returned to the renderer by EXTENSION_LIST. */
export interface ExtensionListItem {
  id: string;
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
  hasMain: boolean;
  hasRenderer: boolean;
}

export function registerExtensionHandlers(
  storage: ExtensionStorage,
  allowedExtIds: AllowedExtIdsLambda,
  lifecycle?: LifecycleDeps,
  ipcMainOverride?: Pick<IpcMain, 'handle'>,
): void {
  // Lazy require so this module loads in vitest (where electron is unavailable).
  let ipcMain: Pick<IpcMain, 'handle'> | undefined = ipcMainOverride;
  if (!ipcMain) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const electron = require('electron') as { ipcMain?: IpcMain };
      ipcMain = electron.ipcMain;
    } catch {
      // electron unavailable (vitest container build); skip registration.
      return;
    }
  }
  if (!ipcMain) return;

  const assertAllowed = (extId: string): void => {
    if (!allowedExtIds().has(extId)) {
      // Log the internal detail for debugging, but throw a generic
      // message so the renderer cannot probe which extension ids are
      // valid by reading the error string.
      console.warn(
        `[extension_handlers] Rejected IPC call: extension "${extId}" is not loaded or not enabled`,
      );
      throw new Error('Permission denied');
    }
  };

  // -------------------------------------------------------------------
  // Plan 03 — per-extension storage
  // -------------------------------------------------------------------

  ipcMain.handle(CH.EXTENSION_STORAGE_GET, async (_event, extId: string, key: string) => {
    assertAllowed(extId);
    return storage.forExtension(extId).get(key);
  });

  ipcMain.handle(
    CH.EXTENSION_STORAGE_SET,
    async (_event, extId: string, key: string, value: unknown) => {
      assertAllowed(extId);
      storage.forExtension(extId).set(key, value);
    },
  );

  ipcMain.handle(CH.EXTENSION_STORAGE_DELETE, async (_event, extId: string, key: string) => {
    assertAllowed(extId);
    storage.forExtension(extId).delete(key);
  });

  if (!lifecycle) return;
  const { loader, installer, stateStore } = lifecycle;

  // -------------------------------------------------------------------
  // Plan 05 — lifecycle (Manager UI)
  // -------------------------------------------------------------------

  ipcMain.handle(CH.EXTENSION_LIST, async (): Promise<ExtensionListItem[]> => {
    return loader.list().map((e) => ({
      id: e.manifest.id,
      name: e.manifest.name,
      version: e.manifest.version,
      description: e.manifest.description,
      enabled: e.enabled,
      hasMain: typeof e.manifest.entry.main === 'string',
      hasRenderer: e.hasRendererEntry,
    }));
  });

  ipcMain.handle(CH.EXTENSION_ENABLE, async (_event, id: string) => {
    await loader.enable(id);
    return { ok: true };
  });

  ipcMain.handle(CH.EXTENSION_DISABLE, async (_event, id: string) => {
    await loader.disable(id);
    return { ok: true };
  });

  ipcMain.handle(CH.EXTENSION_INSTALL_ZIP, async (_event, zipPath: string) => {
    const result = await installer.installFromZip(zipPath);
    if (result.ok && result.extensionId) {
      const targetDir = installer.installPath(result.extensionId);
      try {
        await loader.loadOne(targetDir);
      } catch (err) {
        // Manifest validation should have already passed in the installer;
        // anything thrown here is a loader-side surprise we still report.
        return {
          ok: false,
          errors: [
            `Loaded but loader rejected: ${err instanceof Error ? err.message : String(err)}`,
          ],
        };
      }
    }
    return result;
  });

  ipcMain.handle(CH.EXTENSION_INSTALL_DIR, async (_event, sourceDir: string) => {
    const result = await installer.installFromDir(sourceDir);
    if (result.ok && result.extensionId) {
      const targetDir = installer.installPath(result.extensionId);
      try {
        await loader.loadOne(targetDir);
      } catch (err) {
        return {
          ok: false,
          errors: [
            `Loaded but loader rejected: ${err instanceof Error ? err.message : String(err)}`,
          ],
        };
      }
    }
    return result;
  });

  ipcMain.handle(CH.EXTENSION_UNINSTALL, async (_event, id: string) => {
    // Disable first so the deactivate hook gets a chance to clean up.
    try {
      await loader.disable(id);
    } catch {
      // If disable throws (already-disabled etc) it's fine — proceed to remove.
    }
    await installer.uninstall(id);
    stateStore.remove(id);
    loader.forget(id);
    return { ok: true };
  });

  ipcMain.handle(CH.EXTENSION_GET_SETTINGS, async (_event, id: string) => {
    return stateStore.get(id)?.settings ?? {};
  });

  ipcMain.handle(
    CH.EXTENSION_SET_SETTINGS,
    async (_event, id: string, settings: Record<string, unknown>) => {
      stateStore.setSettings(id, settings);
      return { ok: true };
    },
  );

  ipcMain.handle(CH.EXTENSION_PICK_ZIP, async () => {
    // Lazy require so this stays test-clean. The lifecycle path is only
    // hit when electron is available (composition_root wiring), so the
    // require should always succeed here.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const electron = require('electron') as {
        dialog?: { showOpenDialog: (opts: unknown) => Promise<{ canceled: boolean; filePaths: string[] }> };
      };
      const dialog = electron.dialog;
      if (!dialog) return null;
      const result = await dialog.showOpenDialog({
        title: 'Select extension package',
        filters: [
          { name: 'Extension Package', extensions: ['zip', 'sherpa-ext'] },
        ],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    } catch {
      return null;
    }
  });
}
