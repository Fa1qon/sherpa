// tests/extensions/sdk/renderer_sdk.spec.ts
// Extension Framework Plan 03 Task 6 — createRendererSdk tests.

import { describe, it, expect, vi } from 'vitest';

import { createRendererSdk } from '../../../src/extensions/sdk/renderer_sdk';
import type { SherpaRendererBridge } from '../../../src/extensions/sdk/renderer_sdk';
import type { ExtensionManifest } from '../../../src/core/domain/extension_manifest';
import type { SdkContext } from '../../../src/extensions/sdk/types';

const manifest: ExtensionManifest = {
  id: 'ext.test',
  name: 'Test',
  version: '1.0.0',
  engines: { sherpa: '>=0.0.0' },
  entry: { renderer: 'renderer.js' },
};

function makeBridge(overrides: Partial<SherpaRendererBridge> = {}): SherpaRendererBridge & Record<string, unknown> {
  const store = new Map<string, unknown>();
  return {
    events: {
      on: vi.fn(() => () => undefined),
    },
    extension: {
      storage: {
        get: vi.fn(async (_extId: string, key: string) => store.get(key) ?? null),
        set: vi.fn(async (_extId: string, key: string, val: unknown) => {
          store.set(key, val);
        }),
        delete: vi.fn(async (_extId: string, key: string) => {
          store.delete(key);
        }),
      },
    },
    ...overrides,
  } as SherpaRendererBridge & Record<string, unknown>;
}

function ctx(permissions: string[]): SdkContext {
  return { manifest, permissions };
}

describe('createRendererSdk — permission gating', () => {
  it('events.on throws without events.subscribe', () => {
    const sdk = createRendererSdk({
      ctx: ctx([]),
      bridge: makeBridge(),
      slotRegistration: () => undefined,
    });
    expect(() => sdk.events.on('task.created', () => undefined)).toThrow(
      'Permission denied: extension "ext.test" lacks "events.subscribe"',
    );
  });

  it('storage.* throws without storage.local', async () => {
    const sdk = createRendererSdk({
      ctx: ctx([]),
      bridge: makeBridge(),
      slotRegistration: () => undefined,
    });
    await expect(sdk.storage.get('k')).rejects.toThrow(/lacks "storage.local"/);
    await expect(sdk.storage.set('k', 1)).rejects.toThrow(/lacks "storage.local"/);
    await expect(sdk.storage.delete('k')).rejects.toThrow(/lacks "storage.local"/);
  });

  it('ipc.call throws without ipc.call:<channel>', async () => {
    const sdk = createRendererSdk({
      ctx: ctx([]),
      bridge: makeBridge(),
      slotRegistration: () => undefined,
    });
    await expect(sdk.ipc.call('some.channel')).rejects.toThrow(
      'Permission denied: extension "ext.test" lacks "ipc.call:some.channel"',
    );
  });
});

describe('createRendererSdk — happy paths', () => {
  it('events.on delegates to bridge with the manifest id', () => {
    const bridge = makeBridge();
    const sdk = createRendererSdk({
      ctx: ctx(['events.subscribe']),
      bridge,
      slotRegistration: () => undefined,
    });
    const handler = (): void => undefined;
    sdk.events.on('task.created', handler);
    expect(bridge.events.on).toHaveBeenCalledWith('task.created', handler);
  });

  it('storage.get/set/delete bind the manifest id and round-trip data', async () => {
    const bridge = makeBridge();
    const sdk = createRendererSdk({
      ctx: ctx(['storage.local']),
      bridge,
      slotRegistration: () => undefined,
    });
    await sdk.storage.set('k', { v: 1 });
    expect(bridge.extension.storage.set).toHaveBeenCalledWith('ext.test', 'k', { v: 1 });
    await expect(sdk.storage.get<{ v: number }>('k')).resolves.toEqual({ v: 1 });
    await sdk.storage.delete('k');
    expect(bridge.extension.storage.delete).toHaveBeenCalledWith('ext.test', 'k');
    await expect(sdk.storage.get('k')).resolves.toBeNull();
  });

  it('slots.register forwards (extId, slotId, component) to the callback', () => {
    const spy = vi.fn();
    const sdk = createRendererSdk({
      ctx: ctx([]),
      bridge: makeBridge(),
      slotRegistration: spy,
    });
    const Comp = (): null => null;
    sdk.slots.register('sidebar.panel', Comp);
    expect(spy).toHaveBeenCalledWith('ext.test', 'sidebar.panel', Comp);
  });

  it('ipc.call invokes the bridge-exposed function by channel name', async () => {
    const bridge = makeBridge() as SherpaRendererBridge & Record<string, unknown>;
    bridge['mychannel'] = async (a: number, b: number) => a + b;
    const sdk = createRendererSdk({
      ctx: ctx(['ipc.call:mychannel']),
      bridge,
      slotRegistration: () => undefined,
    });
    await expect(sdk.ipc.call('mychannel', 2, 3)).resolves.toBe(5);
  });

  it('ipc.call throws when bridge has no such channel', async () => {
    const bridge = makeBridge();
    const sdk = createRendererSdk({
      ctx: ctx(['ipc.call:nope']),
      bridge,
      slotRegistration: () => undefined,
    });
    await expect(sdk.ipc.call('nope')).rejects.toThrow(/not exposed/);
  });

  it('ipc.call walks dotted paths through nested namespaces', async () => {
    const bridge = makeBridge() as SherpaRendererBridge & Record<string, unknown>;
    bridge.foo = {
      bar: async (a: number, b: number) => a * b,
    };
    const sdk = createRendererSdk({
      ctx: ctx(['ipc.call:foo.bar']),
      bridge,
      slotRegistration: () => undefined,
    });
    await expect(sdk.ipc.call('foo.bar', 3, 4)).resolves.toBe(12);
  });

  it('ipc.call throws "not exposed" for missing dotted segment', async () => {
    const bridge = makeBridge() as SherpaRendererBridge & Record<string, unknown>;
    bridge.foo = { bar: async () => 'ok' };
    const sdk = createRendererSdk({
      ctx: ctx(['ipc.call:foo.missing']),
      bridge,
      slotRegistration: () => undefined,
    });
    await expect(sdk.ipc.call('foo.missing')).rejects.toThrow(/not exposed/);
  });

  it('ipc.call throws "not callable" when path resolves to a namespace object', async () => {
    const bridge = makeBridge() as SherpaRendererBridge & Record<string, unknown>;
    bridge.foo = { bar: async () => 'ok' };
    const sdk = createRendererSdk({
      ctx: ctx(['ipc.call:foo']),
      bridge,
      slotRegistration: () => undefined,
    });
    await expect(sdk.ipc.call('foo')).rejects.toThrow(/not callable/);
  });
});
