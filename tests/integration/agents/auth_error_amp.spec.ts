import { describe, test, expect } from 'vitest';
import { AmpAdapter } from '../../../src/core/adapters/agents/amp';

describe('AmpAdapter — no credential / no binary', () => {
  test('health() does not throw', async () => {
    const result = await new AmpAdapter().health();
    expect(typeof result.ok).toBe('boolean');
  });
  test('providerId is "amp"', () => { expect(new AmpAdapter().providerId).toBe('amp'); });
});
