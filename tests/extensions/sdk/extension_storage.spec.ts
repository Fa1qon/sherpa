// tests/extensions/sdk/extension_storage.spec.ts
// Extension Framework Plan 03 Task 2 — ExtensionStorage tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { ExtensionStorage } from '../../../src/extensions/sdk/extension_storage';

describe('ExtensionStorage', () => {
  let db: Database.Database;
  let storage: ExtensionStorage;

  beforeEach(() => {
    db = new Database(':memory:');
    storage = new ExtensionStorage(db);
  });

  afterEach(() => {
    db.close();
  });

  it('round-trips primitive values', () => {
    const ks = storage.forExtension('ext.alpha');
    ks.set('count', 42);
    ks.set('name', 'alice');
    expect(ks.get<number>('count')).toBe(42);
    expect(ks.get<string>('name')).toBe('alice');
  });

  it('round-trips structured values via JSON', () => {
    const ks = storage.forExtension('ext.alpha');
    const v = { a: 1, b: [true, false], c: { d: 'x' } };
    ks.set('obj', v);
    expect(ks.get('obj')).toEqual(v);
  });

  it('returns null for missing keys', () => {
    const ks = storage.forExtension('ext.alpha');
    expect(ks.get('missing')).toBeNull();
  });

  it('isolates keyspaces by extension_id', () => {
    const a = storage.forExtension('ext.alpha');
    const b = storage.forExtension('ext.beta');
    a.set('shared', 'A-value');
    b.set('shared', 'B-value');
    expect(a.get('shared')).toBe('A-value');
    expect(b.get('shared')).toBe('B-value');
    expect(a.keys()).toEqual(['shared']);
    expect(b.keys()).toEqual(['shared']);
  });

  it('upserts on repeated set with the same key', () => {
    const ks = storage.forExtension('ext.alpha');
    ks.set('k', 1);
    ks.set('k', 2);
    ks.set('k', 3);
    expect(ks.get<number>('k')).toBe(3);
    expect(ks.keys()).toEqual(['k']);
  });

  it('deletes a key', () => {
    const ks = storage.forExtension('ext.alpha');
    ks.set('k', 'v');
    ks.delete('k');
    expect(ks.get('k')).toBeNull();
    expect(ks.keys()).toEqual([]);
  });

  it('delete is idempotent', () => {
    const ks = storage.forExtension('ext.alpha');
    expect(() => ks.delete('nope')).not.toThrow();
  });

  it('lists keys for the bound extension only', () => {
    storage.forExtension('ext.alpha').set('k1', 1);
    storage.forExtension('ext.alpha').set('k2', 2);
    storage.forExtension('ext.beta').set('k3', 3);
    expect(storage.forExtension('ext.alpha').keys().sort()).toEqual(['k1', 'k2']);
    expect(storage.forExtension('ext.beta').keys()).toEqual(['k3']);
  });

  it('preserves data across forExtension calls (same backing table)', () => {
    storage.forExtension('ext.alpha').set('k', 'v1');
    expect(storage.forExtension('ext.alpha').get('k')).toBe('v1');
  });
});
