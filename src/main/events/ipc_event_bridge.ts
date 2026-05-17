import { eventBus } from './event_bus';
import { CH } from '../ipc/channels';
import type { AppEventName } from '../../core/domain/app_events';

const ALL_EVENTS: readonly AppEventName[] = [
  'task.stage.completed',
  'task.methodology.completed',
  'case.changed',
  'knowledge.changed',
  'artifact_template.changed',
];

export function setupIpcEventBridge(): void {
  for (const eventName of ALL_EVENTS) {
    eventBus.on(eventName, (payload) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { BrowserWindow } = require('electron') as {
          BrowserWindow: {
            getAllWindows(): {
              webContents: { send: (ch: string, ...args: unknown[]) => void };
            }[];
          };
        };
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(CH.APP_EVENT, eventName, payload);
        }
      } catch {
        // Electron not available in tests; ignore.
      }
    });
  }
}
