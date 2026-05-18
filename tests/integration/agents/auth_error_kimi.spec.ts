import { describe, test, expect } from 'vitest';
import { KimiAdapter } from '../../../src/core/adapters/agents/kimi';

describe('KimiAdapter — no credential / no binary', () => {
  test('health() does not throw', async () => {
    const result = await new KimiAdapter().health();
    expect(typeof result.ok).toBe('boolean');
  });
  test('providerId is "kimi"', () => { expect(new KimiAdapter().providerId).toBe('kimi'); });
});
