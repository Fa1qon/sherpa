// tests/main/services/extension_state_store.spec.ts
// Extension Framework Plan 05 Task 1 — ExtensionStateStore tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { ExtensionStateStore } from '../../../src/main/services/extension_state_store';

describe('ExtensionStateStore', () => {
  let db: Database.Database;
  let store: ExtensionStateStore;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new ExtensionStateStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns null for an unknown id', () => {
    expect(store.get('com.unknown')).toBeNull();
  });

  it('upserts a new record disabled by default', () => {
    store.upsert('com.example.a', false, 1234);
    const rec = store.get('com.example.a');
    expect(rec).not.toBeNull();
    expect(rec?.enabled).toBe(false);
    expect(rec?.installedAt).toBe(1234);
    expect(rec?.settings).toEqual({});
  });

  it('upsert updates enabled but preserves installedAt and settings', () => {
    store.upsert('com.example.a', false, 1000);
    store.setSettings('com.example.a', { theme: 'dark' });
    store.upsert('com.example.a', true, 2000);
    const rec = store.get('com.example.a');
    expect(rec?.enabled).toBe(true);
    expect(rec?.installedAt).toBe(1000); // original install time preserved
    expect(rec?.settings).toEqual({ theme: 'dark' });
  });

  it('setEnabled flips the flag', () => {
    store.upsert('com.example.a', false);
    store.setEnabled('com.example.a', true);
    expect(store.get('com.example.a')?.enabled).toBe(true);
    store.setEnabled('com.example.a', false);
    expect(store.get('com.example.a')?.enabled).toBe(false);
  });

  it('setSettings serializes JSON and round-trips', () => {
    store.upsert('com.example.a', false);
    store.setSettings('com.example.a', { count: 7, nested: { ok: true } });
    expect(store.get('com.example.a')?.settings).toEqual({
      count: 7,
      nested: { ok: true },
    });
  });

  it('list returns every record', () => {
    store.upsert('a', true, 1);
    store.upsert('b', false, 2);
    const all = store.list().sort((x, y) => x.id.localeCompare(y.id));
    expect(all.map((r) => r.id)).toEqual(['a', 'b']);
    expect(all[0]?.enabled).toBe(true);
    expect(all[1]?.enabled).toBe(false);
  });

  it('remove drops the row', () => {
    store.upsert('a', true);
    store.remove('a');
    expect(store.get('a')).toBeNull();
  });

  it('falls back to {} when stored settings JSON is corrupt', () => {
    store.upsert('a', false);
    // Force an invalid JSON column by hand — production code never does this.
    db.prepare('UPDATE extensions SET settings = ? WHERE id = ?').run(
      '{not json',
      'a',
    );
    expect(store.get('a')?.settings).toEqual({});
  });
});
