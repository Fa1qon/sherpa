// tests/presentation/extensions/slot_host.spec.ts
// Extension Framework Plan 04 Task 1 — useSlotHost store tests.

import { describe, it, expect, beforeEach } from 'vitest';
import type { ComponentType } from 'react';

import {
  useSlotHost,
  registerSlotFromSdk,
  unregisterAllForExtension,
} from '../../../src/presentation/extensions/slot_host';

const Stub: ComponentType<Record<string, unknown>> = () => null;

beforeEach(() => {
  useSlotHost.setState({ entries: [] });
});

describe('slot_host', () => {
  it('registers and lists by slot', () => {
    registerSlotFromSdk('ext1', 'panel1', 'sidebar.panel', Stub);
    const list = useSlotHost.getState().listBySlot('sidebar.panel');
    expect(list).toHaveLength(1);
    expect(list[0].extensionId).toBe('ext1');
    expect(list[0].slotId).toBe('panel1');
    expect(list[0].slot).toBe('sidebar.panel');
  });

  it('unregister by extension removes only that extension entries', () => {
    registerSlotFromSdk('ext1', 'p1', 'sidebar.panel', Stub);
    registerSlotFromSdk('ext1', 'p2', 'task.toolbar', Stub);
    registerSlotFromSdk('ext2', 'p3', 'sidebar.panel', Stub);

    unregisterAllForExtension('ext1');

    const left = useSlotHost.getState().entries;
    expect(left).toHaveLength(1);
    expect(left[0].extensionId).toBe('ext2');
  });

  it('listBySlot filters by slot name', () => {
    registerSlotFromSdk('ext1', 's1', 'sidebar.panel', Stub);
    registerSlotFromSdk('ext1', 's2', 'task.toolbar', Stub);
    expect(useSlotHost.getState().listBySlot('sidebar.panel')).toHaveLength(1);
    expect(useSlotHost.getState().listBySlot('task.toolbar')).toHaveLength(1);
    expect(useSlotHost.getState().listBySlot('chat.decorator')).toHaveLength(0);
  });

  it('exposes register/unregister on window.__sherpaSlots', () => {
    const shim = (window as unknown as {
      __sherpaSlots?: {
        register: typeof registerSlotFromSdk;
        unregister: typeof unregisterAllForExtension;
      };
    }).__sherpaSlots;
    expect(shim).toBeDefined();
    expect(typeof shim?.register).toBe('function');
    expect(typeof shim?.unregister).toBe('function');
  });
});
