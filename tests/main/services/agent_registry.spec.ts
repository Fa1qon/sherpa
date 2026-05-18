import { describe, test, expect, vi } from 'vitest';
import { AgentRegistry } from '../../../src/main/services/agent_registry';
import type { AgentPort, AgentSession } from '../../../src/core/ports/agent_port';

const makeAdapter = (id: string): AgentPort => ({
  providerId: id,
  startSession: vi.fn().mockResolvedValue(undefined) as any,
  health: vi.fn().mockResolvedValue({ ok: true }),
});

describe('AgentRegistry', () => {
  test('resolve returns the registered adapter', () => {
    const registry = new AgentRegistry();
    const adapter = makeAdapter('claude-code');
    registry.register('claude-code', adapter);
    expect(registry.resolve('claude-code')).toBe(adapter);
  });

  test('resolve throws for unregistered agentCli', () => {
    const registry = new AgentRegistry();
    expect(() => registry.resolve('codex')).toThrow(/not registered/i);
  });

  test('health delegates to the adapter', async () => {
    const registry = new AgentRegistry();
    const adapter = makeAdapter('goose');
    registry.register('goose', adapter);
    const result = await registry.health('goose');
    expect(result.ok).toBe(true);
  });

  test('health returns ok:false for unregistered agent', async () => {
    const registry = new AgentRegistry();
    const result = await registry.health('kimi');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not registered/i);
  });

  test('listRegistered returns all registered agentCli keys', () => {
    const registry = new AgentRegistry();
    registry.register('claude-code', makeAdapter('claude-code'));
    registry.register('codex', makeAdapter('codex'));
    const list = registry.listRegistered();
    expect(list).toContain('claude-code');
    expect(list).toContain('codex');
    expect(list).toHaveLength(2);
  });
});
