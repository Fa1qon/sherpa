import { describe, test, expect } from 'vitest';
import { CursorAdapter } from '../../../src/core/adapters/agents/cursor';

describe('CursorAdapter — no credential / no binary', () => {
  test('health() does not throw', async () => {
    const result = await new CursorAdapter().health();
    expect(typeof result.ok).toBe('boolean');
  });
  test('providerId is "cursor"', () => { expect(new CursorAdapter().providerId).toBe('cursor'); });
});
