// tests/main/services/extension_slot_registry.spec.ts
// Extension Framework Plan 03 Task 4 — ExtensionSlotRegistry tests.

import { describe, it, expect, beforeEach } from 'vitest';

import { ExtensionSlotRegistry } from '../../../src/main/services/extension_slot_registry';
import type { ExtensionSlotRegistration } from '../../../src/core/domain/extension_manifest';

const sidebar = (id: string, title?: string): ExtensionSlotRegistration => ({
  id,
  slot: 'sidebar.panel',
  title,
});

const taskToolbar = (id: string): ExtensionSlotRegistration => ({
  id,
  slot: 'task.toolbar',
});

describe('ExtensionSlotRegistry', () => {
  let reg: ExtensionSlotRegistry;

  beforeEach(() => {
    reg = new ExtensionSlotRegistry();
  });

  it('registers and lists for the named slot', () => {
    reg.register('ext.a', sidebar('panel-1', 'Panel A'), 'ui/panel.js');
    const out = reg.listFor('sidebar.panel');
    expect(out.length).toBe(1);
    expect(out[0]?.extensionId).toBe('ext.a');
    expect(out[0]?.id).toBe('panel-1');
    expect(out[0]?.title).toBe('Panel A');
    expect(out[0]?.componentPath).toBe('ui/panel.js');
  });

  it('returns an empty array for unknown slot', () => {
    expect(reg.listFor('chat.decorator')).toEqual([]);
  });

  it('keeps multiple registrations per slot in insertion order', () => {
    reg.register('ext.a', sidebar('a1'));
    reg.register('ext.b', sidebar('b1'));
    reg.register('ext.a', sidebar('a2'));
    const ids = reg.listFor('sidebar.panel').map((r) => r.id);
    expect(ids).toEqual(['a1', 'b1', 'a2']);
  });

  it('all() returns every slot map entry', () => {
    reg.register('ext.a', sidebar('panel-1'));
    reg.register('ext.b', taskToolbar('tool-1'));
    const snapshot = reg.all();
    expect(Object.keys(snapshot).sort()).toEqual(['sidebar.panel', 'task.toolbar']);
    expect(snapshot['sidebar.panel']?.[0]?.id).toBe('panel-1');
    expect(snapshot['task.toolbar']?.[0]?.id).toBe('tool-1');
  });

  it('unregister removes every slot for an extension and reports count', () => {
    reg.register('ext.a', sidebar('a1'));
    reg.register('ext.a', taskToolbar('a2'));
    reg.register('ext.b', sidebar('b1'));
    expect(reg.unregister('ext.a')).toBe(2);
    expect(reg.listFor('sidebar.panel').map((r) => r.id)).toEqual(['b1']);
    expect(reg.listFor('task.toolbar')).toEqual([]);
  });

  it('unregister returns 0 when nothing to remove', () => {
    expect(reg.unregister('ext.never')).toBe(0);
  });
});
