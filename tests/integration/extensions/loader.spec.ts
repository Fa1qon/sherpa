// tests/integration/extensions/loader.spec.ts
// Extension Framework Plan 05 Task 7 — end-to-end loader smoke test.
//
// Copies the `extension-hello` fixture into a real temp directory,
// wires up an ExtensionLoader against in-memory SQLite, enables the
// extension, emits a `task.created` event, and asserts the extension's
// handler ran by reading the marker file the fixture writes.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';

import { ExtensionLoader } from '../../../src/main/services/extension_loader';
import { ExtensionStateStore } from '../../../src/main/services/extension_state_store';
import { ExtensionToolRegistry } from '../../../src/main/services/extension_tool_registry';
import { ExtensionSlotRegistry } from '../../../src/main/services/extension_slot_registry';
import { ExtensionStorage } from '../../../src/extensions/sdk/extension_storage';
import { EventBus } from '../../../src/main/services/event_bus';

const FIXTURE_DIR = path.resolve(__dirname, '..', '..', 'fixtures', 'extension-hello');

interface TmpFixture {
  root: string;
  cleanup(): Promise<void>;
}

async function makeTmp(): Promise<TmpFixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sherpa-ext-int-'));
  return {
    root,
    async cleanup() {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

describe('Extension framework integration — hello world fixture', () => {
  let tmp: TmpFixture;
  let extDir: string;

  beforeEach(async () => {
    tmp = await makeTmp();
    extDir = path.join(tmp.root, 'com.sherpa.test.hello');
    await copyDir(FIXTURE_DIR, extDir);
  });

  afterEach(async () => {
    await tmp.cleanup();
  });

  it('loads, enables, and runs the event handler from the fixture', async () => {
    const bus = new EventBus(null);
    const stateStore = new ExtensionStateStore(new Database(':memory:'));
    const storage = new ExtensionStorage(new Database(':memory:'));
    const toolRegistry = new ExtensionToolRegistry();
    const slotRegistry = new ExtensionSlotRegistry();
    const loader = new ExtensionLoader({
      rootDir: tmp.root,
      eventBus: bus,
      storage,
      toolRegistry,
      slotRegistry,
      stateStore,
    });

    // 1. Initial scan — extension is detected but disabled by default.
    const loaded = await loader.loadAll();
    expect(loaded.length).toBe(1);
    expect(loaded[0]?.manifest.id).toBe('com.sherpa.test.hello');
    expect(loaded[0]?.enabled).toBe(false);

    // 2. Enable the extension — runs activate(sdk) which subscribes to task.created.
    await loader.enable('com.sherpa.test.hello');
    expect(stateStore.get('com.sherpa.test.hello')?.enabled).toBe(true);

    // 3. Emit a task.created event through the same bus the extension
    //    subscribed to. The fixture's handler writes the taskId to a
    //    marker file in its own dir.
    bus.emit({ type: 'task.created', ts: Date.now(), taskId: 'T-int-1' });

    const markerPath = path.join(extDir, '.last-task-created');
    const marker = await fs.readFile(markerPath, 'utf8');
    expect(marker).toBe('T-int-1');

    // 4. Disable — deactivate hook removes the marker.
    await loader.disable('com.sherpa.test.hello');
    expect(stateStore.get('com.sherpa.test.hello')?.enabled).toBe(false);
    await expect(fs.access(markerPath)).rejects.toBeDefined();
  });

  it('loadAll re-activates when state store says enabled', async () => {
    const bus = new EventBus(null);
    const stateStore = new ExtensionStateStore(new Database(':memory:'));
    const storage = new ExtensionStorage(new Database(':memory:'));
    const toolRegistry = new ExtensionToolRegistry();
    const slotRegistry = new ExtensionSlotRegistry();

    // Pre-seed the state store so the next loadAll fires activate.
    stateStore.upsert('com.sherpa.test.hello', true);

    const loader = new ExtensionLoader({
      rootDir: tmp.root,
      eventBus: bus,
      storage,
      toolRegistry,
      slotRegistry,
      stateStore,
    });
    const loaded = await loader.loadAll();
    expect(loaded[0]?.enabled).toBe(true);

    bus.emit({ type: 'task.created', ts: Date.now(), taskId: 'T-int-2' });
    const marker = await fs.readFile(
      path.join(extDir, '.last-task-created'),
      'utf8',
    );
    expect(marker).toBe('T-int-2');
  });
});
