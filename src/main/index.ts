// Electron main process entry (T-L1-08; IPC wiring added by T-L1-09).
//
// Boots BrowserWindow with hardened webPreferences (contextIsolation: true,
// nodeIntegration: false, sandbox: true), enforces single-instance lock per
// design/data.md §11.2, resolves the Composition Root, and registers the
// typed IPC handlers (src/main/ipc/) before showing the renderer.
//
// Compiled to CommonJS via tsconfig.main.json so Electron can require() the
// output directly. The renderer (src/renderer/) stays ESM/Bundler under the
// project tsconfig.json — see DEVIATION note in BUILD_LOG.md.

import { app, BrowserWindow, Menu, ipcMain, protocol } from 'electron';
import path from 'node:path';
import { buildContainer, PORT } from './composition_root';
import type { Container } from './container';
import { registerIpcHandlers } from './ipc';
import { setupIpcEventBridge } from './events/ipc_event_bridge';
import { registerUserBrowserHandlers } from './ipc/user_browser_handlers';
import { userBrowser } from './services/user_browser';
import { registerSherpaFileProtocol } from './protocols/register_sherpa_file_protocol';

// Visual Formats Plan 01 / Task 6 — privileged custom scheme for project-
// relative assets. Must be registered BEFORE `app.whenReady()`. Renderer-side
// markdown viewers (Plan 05) consume URLs of the form
// `sherpa-file://current/<rel/path>`; the handler is bound after ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'sherpa-file',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

let mainWindow: BrowserWindow | null = null;
let appContainer: Container | null = null;

/**
 * Refresh the EventBus's window list so APP_EVENT broadcasts reach every
 * live BrowserWindow. Called after each window is created and after a
 * window is closed.
 */
function refreshEventBusWindows(): void {
  if (!appContainer) return;
  try {
    appContainer.resolve(PORT.eventBus).setWindows(BrowserWindow.getAllWindows());
  } catch {
    // EventBus not registered (shouldn't happen in production); skip.
  }
}

function createMainWindow(): void {
  const iconPath = path.join(__dirname, '..', '..', 'build', 'icons', 'icon-256.png');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'Sherpa',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Enables the <webview> tag — used by BrowserTab so the embedded
      // browser sits inside the React DOM (no native WebContentsView
      // overlay + coord sync). With webviewTag on, the webview gets a
      // dedicated renderer process, isolated from the host.
      webviewTag: true,
    },
  });
  refreshEventBusWindows();

  // Renderer load strategy:
  //   - SHERPA_DEV_URL env: Vite dev server (T-L1-10 wires this).
  //   - app.isPackaged (installed build): dist/index.html from inside the asar.
  //   - Otherwise (Phase 1 dev): about:blank — Welcome lands in T-L1-10.
  //
  // NOTE: process.env.NODE_ENV is NOT reliably 'production' in a packaged
  // Electron app — electron-builder does not inject it at runtime. Use
  // app.isPackaged (true when running from an installed asar, false in dev).
  const devUrl = process.env.SHERPA_DEV_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl).catch(() => {
      mainWindow?.loadURL('about:blank');
    });
  } else if (app.isPackaged || process.env.NODE_ENV === 'production') {
    const indexHtml = path.join(__dirname, '..', '..', 'dist', 'index.html');
    mainWindow.loadFile(indexHtml).catch((err) => {
      // Log the actual path so post-install diagnosis is possible.
      console.error('[main] loadFile failed:', indexHtml, err);
      mainWindow?.loadURL('about:blank');
    });
  } else {
    mainWindow.loadURL('about:blank');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    refreshEventBusWindows();
  });
}

// Single-instance lock — design/data.md §11.2.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    // Composition Root — resolve adapters once, exactly here (ADR-001 §1).
    const container = buildContainer();
    appContainer = container;

    // Register typed IPC handlers (T-L1-09) before any BrowserWindow is
    // shown so the renderer can invoke channels from its very first tick.
    registerIpcHandlers(container);
    setupIpcEventBridge();
    registerUserBrowserHandlers();
    registerSherpaFileProtocol();

    // Dev-tools shortcut — available in all builds for diagnostics.
    ipcMain.on('app:open-devtools', (event) => {
      BrowserWindow.fromWebContents(event.sender)?.webContents.openDevTools({ mode: 'detach' });
    });

    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      else refreshEventBusWindows();
    });

    // Test-mode auto-exit: if SHERPA_TEST_LAUNCH is set to a number of ms,
    // schedule app.quit() so the launch smoke test does not leak a GUI
    // process. Production launches ignore this.
    if (process.env.SHERPA_TEST_LAUNCH) {
      const ms = Number.parseInt(process.env.SHERPA_TEST_LAUNCH, 10) || 1500;
      setTimeout(() => app.quit(), ms);
    }
  });

  app.on('before-quit', () => { userBrowser.close(); });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
