import { describe, test, expect } from 'vitest';
import { AgentRegistry } from '../../../src/main/services/agent_registry';
import type { AgentPort } from '../../../src/core/ports/agent_port';

function makePort(ok: boolean): AgentPort {
  return {
    providerId: 'mock',
    startSession: async () => { throw new Error('not impl'); },
    health: async () => ok ? { ok: true } : { ok: false, reason: 'not installed' },
  };
}

describe('AgentRegistry.health()', () => {
  test('returns ok:true when registered adapter reports healthy', async () => {
    const registry = new AgentRegistry();
    registry.register('claude-code', makePort(true));
    expect((await registry.health('claude-code')).ok).toBe(true);
  });

  test('returns ok:false when registered adapter is unhealthy', async () => {
    const registry = new AgentRegistry();
    registry.register('codex', makePort(false));
    expect((await registry.health('codex')).ok).toBe(false);
  });

  test('returns ok:false for unregistered agent', async () => {
    const registry = new AgentRegistry();
    expect((await registry.health('amp')).ok).toBe(false);
  });

  test('resolve() throws for unregistered agent', () => {
    const registry = new AgentRegistry();
    expect(() => registry.resolve('gemini')).toThrow('not registered');
  });

  test('listRegistered returns all registered agent IDs', () => {
    const registry = new AgentRegistry();
    registry.register('claude-code', makePort(true));
    registry.register('codex', makePort(false));
    const list = registry.listRegistered();
    expect(list).toContain('claude-code');
    expect(list).toContain('codex');
  });
});
