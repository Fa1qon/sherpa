import { describe, test, expect } from 'vitest';
import { CodexAdapter } from '../../../src/core/adapters/agents/codex';

describe('CodexAdapter — no credential / no binary', () => {
  test('health() does not throw and returns boolean ok', async () => {
    const adapter = new CodexAdapter();
    const result = await adapter.health();
    expect(typeof result.ok).toBe('boolean');
    if (!result.ok) expect(typeof (result as { ok: false; reason: string }).reason).toBe('string');
  });
  test('health() reason contains useful message when binary absent', async () => {
    const adapter = new CodexAdapter();
    const result = await adapter.health();
    if (!result.ok) expect((result as { ok: false; reason: string }).reason.length).toBeGreaterThan(0);
  });
});
