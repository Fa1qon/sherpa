import { describe, test, expect } from 'vitest';
import { GeminiAdapter } from '../../../src/core/adapters/agents/gemini';

describe('GeminiAdapter — no credential / no binary', () => {
  test('health() does not throw', async () => {
    const result = await new GeminiAdapter().health();
    expect(typeof result.ok).toBe('boolean');
  });
  test('providerId is "gemini"', () => { expect(new GeminiAdapter().providerId).toBe('gemini'); });
});
