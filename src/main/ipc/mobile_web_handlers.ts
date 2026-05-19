// Mobile Web IPC handlers — main-side counterpart for the
// `sherpa.mobileWeb.{status,setPin,restart}` preload bridge.

import type { IpcMain } from 'electron';
import { CH } from './channels';
import type { MobileWebController } from '../services/mobile_web_controller';

export function registerMobileWebHandlers(controller: MobileWebController): void {
  // Lazy require so the module loads in vitest where electron is unavailable.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electron = require('electron') as { ipcMain: IpcMain | undefined };
  const ipcMain = electron.ipcMain;
  if (!ipcMain) return;

  ipcMain.handle(CH.MOBILE_WEB_STATUS, async () => controller.getStatus());

  ipcMain.handle(CH.MOBILE_WEB_SET_PIN, async (_evt, pin: string) => {
    try {
      controller.setPin(pin);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(CH.MOBILE_WEB_RESTART, async () => {
    try {
      await controller.restart();
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
