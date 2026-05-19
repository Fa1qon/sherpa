// tests/main/services/extension_tool_registry.spec.ts
// Extension Framework Plan 03 Task 3 — ExtensionToolRegistry tests.

import { describe, it, expect, beforeEach } from 'vitest';

import { ExtensionToolRegistry } from '../../../src/main/services/extension_tool_registry';
import type { ExtensionToolDef } from '../../../src/core/domain/extension_manifest';

const toolDef = (id: string): ExtensionToolDef => ({
  id,
  description: `tool ${id}`,
  inputSchema: { type: 'object' },
});

describe('ExtensionToolRegistry', () => {
  let reg: ExtensionToolRegistry;

  beforeEach(() => {
    reg = new ExtensionToolRegistry();
  });

  it('registers a tool and lists it', () => {
    reg.register('ext.a', toolDef('greet'), () => 'hi');
    const list = reg.list();
    expect(list.length).toBe(1);
    expect(list[0]?.extensionId).toBe('ext.a');
    expect(list[0]?.def.id).toBe('greet');
  });

  it('throws on duplicate registration of the same qualified id', () => {
    reg.register('ext.a', toolDef('greet'), () => 1);
    expect(() => reg.register('ext.a', toolDef('greet'), () => 2)).toThrow(
      /Tool "ext.a:greet" already registered/,
    );
  });

  it('allows same tool id across different extensions', () => {
    reg.register('ext.a', toolDef('greet'), () => 'a');
    reg.register('ext.b', toolDef('greet'), () => 'b');
    expect(reg.list().length).toBe(2);
  });

  it('dispatches a tool call and returns the handler result (sync)', async () => {
    reg.register('ext.a', toolDef('echo'), (input) => input);
    await expect(reg.call('ext.a:echo', { x: 1 })).resolves.toEqual({ x: 1 });
  });

  it('dispatches a tool call and returns the handler result (async)', async () => {
    reg.register('ext.a', toolDef('sum'), async (input) => {
      const { a, b } = input as { a: number; b: number };
      return a + b;
    });
    await expect(reg.call('ext.a:sum', { a: 2, b: 3 })).resolves.toBe(5);
  });

  it('throws when calling an unknown tool', async () => {
    await expect(reg.call('ext.x:nope', null)).rejects.toThrow(/not found/);
  });

  it('unregister removes every tool for an extension and returns count', () => {
    reg.register('ext.a', toolDef('t1'), () => null);
    reg.register('ext.a', toolDef('t2'), () => null);
    reg.register('ext.b', toolDef('t3'), () => null);
    expect(reg.unregister('ext.a')).toBe(2);
    expect(reg.list().length).toBe(1);
    expect(reg.list()[0]?.extensionId).toBe('ext.b');
  });

  it('unregister returns 0 when the extension has no tools', () => {
    expect(reg.unregister('ext.zzz')).toBe(0);
  });
});
