// tests/main/services/extension_loader.spec.ts
// Extension Framework Plan 05 Task 2 — ExtensionLoader unit tests.

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

interface TmpFixture {
  root: string;
  cleanup(): Promise<void>;
}

async function makeTmpRoot(): Promise<TmpFixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sherpa-loader-'));
  return {
    root,
    async cleanup() {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

async function writeFixture(
  root: string,
  id: string,
  files: Record<string, string>,
): Promise<string> {
  const dir = path.join(root, id);
  await fs.mkdir(dir, { recursive: true });
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, contents, 'utf8');
  }
  return dir;
}

function buildDeps(rootDir: string): {
  loader: ExtensionLoader;
  stateStore: ExtensionStateStore;
  bus: EventBus;
  toolRegistry: ExtensionToolRegistry;
  slotRegistry: ExtensionSlotRegistry;
  storage: ExtensionStorage;
} {
  const stateDb = new Database(':memory:');
  const storageDb = new Database(':memory:');
  const stateStore = new ExtensionStateStore(stateDb);
  const storage = new ExtensionStorage(storageDb);
  const bus = new EventBus(null);
  const toolRegistry = new ExtensionToolRegistry();
  const slotRegistry = new ExtensionSlotRegistry();
  const loader = new ExtensionLoader({
    rootDir,
    eventBus: bus,
    storage,
    toolRegistry,
    slotRegistry,
    stateStore,
  });
  return { loader, stateStore, bus, toolRegistry, slotRegistry, storage };
}

const VALID_MANIFEST = (id: string): Record<string, unknown> => ({
  id,
  name: 'Test',
  version: '0.1.0',
  engines: { sherpa: '>=0.23.0' },
  entry: { main: 'main.js' },
});

describe('ExtensionLoader', () => {
  let tmp: TmpFixture;
  beforeEach(async () => {
    tmp = await makeTmpRoot();
  });
  afterEach(async () => {
    await tmp.cleanup();
  });

  it('returns [] for an empty root', async () => {
    const { loader } = buildDeps(tmp.root);
    const result = await loader.loadAll();
    expect(result).toEqual([]);
  });

  it('parses a valid manifest and records the extension as disabled by default', async () => {
    await writeFixture(tmp.root, 'com.test.a', {
      'sherpa.extension.json': JSON.stringify(VALID_MANIFEST('com.test.a')),
      'main.js': `exports.activate = () => {};`,
    });
    const { loader, stateStore } = buildDeps(tmp.root);
    const all = await loader.loadAll();
    expect(all.length).toBe(1);
    expect(all[0]?.manifest.id).toBe('com.test.a');
    expect(all[0]?.enabled).toBe(false);
    expect(stateStore.get('com.test.a')?.enabled).toBe(false);
  });

  it('skips directories without sherpa.extension.json', async () => {
    const dir = path.join(tmp.root, 'not-an-extension');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'readme.txt'), 'hi', 'utf8');
    const { loader } = buildDeps(tmp.root);
    const all = await loader.loadAll();
    expect(all).toEqual([]);
  });

  it('skips tmp-install staging directories', async () => {
    await writeFixture(tmp.root, '.tmp-install-1234', {
      'sherpa.extension.json': JSON.stringify(VALID_MANIFEST('com.test.staging')),
      'main.js': '',
    });
    const { loader } = buildDeps(tmp.root);
    const all = await loader.loadAll();
    expect(all).toEqual([]);
  });

  it('logs and continues when a manifest is invalid', async () => {
    await writeFixture(tmp.root, 'broken', {
      'sherpa.extension.json': '{"id":"BAD!", "name":"x", "version":"x"}',
    });
    await writeFixture(tmp.root, 'com.test.ok', {
      'sherpa.extension.json': JSON.stringify(VALID_MANIFEST('com.test.ok')),
      'main.js': `exports.activate = () => {};`,
    });
    const { loader } = buildDeps(tmp.root);
    const all = await loader.loadAll();
    expect(all.map((e) => e.manifest.id)).toEqual(['com.test.ok']);
  });

  it('activates the extension when state store says enabled', async () => {
    await writeFixture(tmp.root, 'com.test.act', {
      'sherpa.extension.json': JSON.stringify({
        ...VALID_MANIFEST('com.test.act'),
        permissions: ['events.subscribe'],
      }),
      'main.js': `
        let activated = false;
        exports.activate = (sdk) => {
          activated = true;
          // Capture sdk shape: expose synchronous markers via a side file.
          require('fs').writeFileSync(require('path').join(__dirname, '.activated'), 'ok');
        };
      `,
    });
    const { loader, stateStore } = buildDeps(tmp.root);
    // Pre-mark as enabled before loadAll.
    stateStore.upsert('com.test.act', true);
    const all = await loader.loadAll();
    expect(all.length).toBe(1);
    expect(all[0]?.enabled).toBe(true);
    const marker = await fs
      .readFile(path.join(tmp.root, 'com.test.act', '.activated'), 'utf8')
      .catch(() => null);
    expect(marker).toBe('ok');
  });

  it('enable -> disable cycle toggles state and runs deactivate hook', async () => {
    await writeFixture(tmp.root, 'com.test.cycle', {
      'sherpa.extension.json': JSON.stringify({
        ...VALID_MANIFEST('com.test.cycle'),
      }),
      'main.js': `
        exports.activate = () => {
          require('fs').writeFileSync(require('path').join(__dirname, '.act'), '1');
        };
        exports.deactivate = () => {
          require('fs').writeFileSync(require('path').join(__dirname, '.deact'), '1');
        };
      `,
    });
    const { loader, stateStore } = buildDeps(tmp.root);
    await loader.loadAll();
    await loader.enable('com.test.cycle');
    expect(stateStore.get('com.test.cycle')?.enabled).toBe(true);
    await loader.disable('com.test.cycle');
    expect(stateStore.get('com.test.cycle')?.enabled).toBe(false);
    const deactivated = await fs
      .readFile(path.join(tmp.root, 'com.test.cycle', '.deact'), 'utf8')
      .catch(() => null);
    expect(deactivated).toBe('1');
  });

  it('registers manifest-declared slots on activate and unregisters on deactivate', async () => {
    await writeFixture(tmp.root, 'com.test.slot', {
      'sherpa.extension.json': JSON.stringify({
        ...VALID_MANIFEST('com.test.slot'),
        entry: { main: 'main.js', renderer: 'renderer.js' },
        slots: [{ id: 'panel', slot: 'sidebar.panel', title: 'Hi' }],
      }),
      'main.js': `exports.activate = () => {};`,
      'renderer.js': '',
    });
    const { loader, slotRegistry } = buildDeps(tmp.root);
    await loader.loadAll();
    await loader.enable('com.test.slot');
    expect(slotRegistry.listFor('sidebar.panel').length).toBe(1);
    await loader.disable('com.test.slot');
    expect(slotRegistry.listFor('sidebar.panel').length).toBe(0);
  });

  it('enable throws when extension was never loaded', async () => {
    const { loader } = buildDeps(tmp.root);
    await expect(loader.enable('com.unknown')).rejects.toThrow(/not loaded/);
  });

  it('disable on unknown id is a no-op', async () => {
    const { loader } = buildDeps(tmp.root);
    await expect(loader.disable('com.unknown')).resolves.toBeUndefined();
  });

  it('list returns every loaded extension', async () => {
    await writeFixture(tmp.root, 'com.test.a', {
      'sherpa.extension.json': JSON.stringify(VALID_MANIFEST('com.test.a')),
      'main.js': 'exports.activate = () => {};',
    });
    await writeFixture(tmp.root, 'com.test.b', {
      'sherpa.extension.json': JSON.stringify(VALID_MANIFEST('com.test.b')),
      'main.js': 'exports.activate = () => {};',
    });
    const { loader } = buildDeps(tmp.root);
    await loader.loadAll();
    expect(loader.list().map((e) => e.manifest.id).sort()).toEqual([
      'com.test.a',
      'com.test.b',
    ]);
  });
});
