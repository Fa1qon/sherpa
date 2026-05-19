import { describe, it, expect } from 'vitest';
import { satisfiesRange } from '../../../src/core/domain/semver_range';

describe('semver_range', () => {
  it('matches exact version', () => {
    expect(satisfiesRange('1.0.0', '1.0.0')).toBe(true);
    expect(satisfiesRange('1.0.0', '1.0.1')).toBe(false);
  });

  it('matches >= range', () => {
    expect(satisfiesRange('1.0.0', '>=1.0.0')).toBe(true);
    expect(satisfiesRange('2.5.3', '>=1.0.0')).toBe(true);
    expect(satisfiesRange('0.9.0', '>=1.0.0')).toBe(false);
  });

  it('matches ^ caret range (compatible)', () => {
    expect(satisfiesRange('1.2.3', '^1.0.0')).toBe(true);
    expect(satisfiesRange('1.9.9', '^1.0.0')).toBe(true);
    expect(satisfiesRange('2.0.0', '^1.0.0')).toBe(false);
  });

  it('caret with major=0 locks minor', () => {
    expect(satisfiesRange('0.1.5', '^0.1.0')).toBe(true);
    expect(satisfiesRange('0.2.0', '^0.1.0')).toBe(false);
    expect(satisfiesRange('0.1.0', '^0.1.0')).toBe(true);
  });

  it('rejects invalid version', () => {
    expect(satisfiesRange('not-version', '>=1.0.0')).toBe(false);
  });
});
