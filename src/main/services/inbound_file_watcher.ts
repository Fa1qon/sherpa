// src/main/services/inbound_file_watcher.ts
// Track C Plan 04 — chokidar wrapper for file-source external gates.
// Returns a thin registration object with a `cancel()` that closes the
// underlying watcher.

import chokidar from 'chokidar';

export type FileEvent = 'add' | 'change' | 'unlink';

export interface FileWatchRegistration {
  cancel(): void;
}

export class InboundFileWatcher {
  /**
   * Watch `pattern` for the given events. The callback fires once per
   * matching FS event. `cancel()` closes the watcher (does not await).
   */
  watch(
    pattern: string,
    events: readonly FileEvent[],
    callback: (event: FileEvent, path: string) => void | Promise<void>,
  ): FileWatchRegistration {
    const watcher = chokidar.watch(pattern, { ignoreInitial: true });
    for (const ev of events) {
      watcher.on(ev, (filePath: string) => {
        void callback(ev, filePath);
      });
    }
    return {
      cancel: () => {
        void watcher.close();
      },
    };
  }
}
