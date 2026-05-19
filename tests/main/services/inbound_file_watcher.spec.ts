// tests/main/services/inbound_file_watcher.spec.ts
// Track C Plan 04 — InboundFileWatcher: write a file in a temp dir and
// verify the 'add' callback fires.

import { describe, test, expect, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { InboundFileWatcher } from '../../../src/main/services/inbound_file_watcher';

describe('InboundFileWatcher', () => {
  const cleanups: Array<() => void | Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const c = cleanups.shift()!;
      try {
        await c();
      } catch {
        /* ignore cleanup errors */
      }
    }
  });

  test('add event fires when a new file is created', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sherpa-watcher-'));
    cleanups.push(async () => fs.rm(dir, { recursive: true, force: true }));

    const watcher = new InboundFileWatcher();
    const fired = new Promise<{ event: string; path: string }>((resolve) => {
      const reg = watcher.watch(dir, ['add'], (event, p) => {
        reg.cancel();
        resolve({ event, path: p });
      });
      cleanups.push(() => reg.cancel());
    });

    // Give chokidar a beat to attach to the dir before we touch.
    await new Promise((r) => setTimeout(r, 100));
    const target = path.join(dir, 'hello.txt');
    await fs.writeFile(target, 'hi');

    const result = await fired;
    expect(result.event).toBe('add');
    expect(path.resolve(result.path)).toBe(path.resolve(target));
  }, 10_000);

  test('cancel before any event closes cleanly', () => {
    const watcher = new InboundFileWatcher();
    const reg = watcher.watch(os.tmpdir(), ['add'], () => {});
    expect(typeof reg.cancel).toBe('function');
    reg.cancel();
  });
});
