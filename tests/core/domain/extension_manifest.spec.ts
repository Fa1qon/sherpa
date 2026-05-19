import { describe, it, expect } from 'vitest';
import { parseManifest, validateManifest, type ExtensionManifest } from '../../../src/core/domain/extension_manifest';

const MIN_VALID = {
  id: 'com.example.test',
  name: 'Test',
  version: '0.1.0',
  entry: { main: 'index.js' },
  engines: { sherpa: '>=0.23.0' },
};

describe('extension_manifest', () => {
  it('parses minimal valid manifest', () => {
    const parsed = parseManifest(JSON.stringify(MIN_VALID));
    expect(parsed.id).toBe('com.example.test');
    expect(parsed.version).toBe('0.1.0');
  });

  it('rejects invalid JSON', () => {
    expect(() => parseManifest('{not json')).toThrow(/JSON/);
  });

  it('validateManifest returns ok for minimal valid', () => {
    const result = validateManifest(MIN_VALID as ExtensionManifest);
    expect(result.ok).toBe(true);
  });

  it('rejects missing id', () => {
    const result = validateManifest({ ...MIN_VALID, id: '' } as ExtensionManifest);
    expect(result.ok).toBe(false);
    expect(result.errors.join(';')).toMatch(/id/);
  });

  it('rejects bad id format', () => {
    const result = validateManifest({ ...MIN_VALID, id: 'Bad ID!' } as ExtensionManifest);
    expect(result.ok).toBe(false);
  });

  it('rejects bad version', () => {
    const result = validateManifest({ ...MIN_VALID, version: 'v1' } as ExtensionManifest);
    expect(result.ok).toBe(false);
  });

  it('requires entry.main OR entry.renderer', () => {
    const result = validateManifest({ ...MIN_VALID, entry: {} } as ExtensionManifest);
    expect(result.ok).toBe(false);
  });

  it('accepts entry.renderer only', () => {
    const result = validateManifest({
      ...MIN_VALID,
      entry: { renderer: 'r.js' },
    } as ExtensionManifest);
    expect(result.ok).toBe(true);
  });
});
