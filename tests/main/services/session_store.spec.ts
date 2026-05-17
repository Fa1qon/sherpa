// tests/main/services/session_store.spec.ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore } from '../../../src/main/services/session_store';

describe('SessionStore', () => {
  let tmp: string;
  let store: SessionStore;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'session-test-'));
    mkdirSync(join(tmp, '.sherpa'), { recursive: true });
    store = new SessionStore();
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  test('returns default { activeTaskId: null } when file is absent', async () => {
    const s = await store.getSession(tmp);
    expect(s.activeTaskId).toBeNull();
  });

  test('round-trips activeTaskId', async () => {
    await store.setSession(tmp, { activeTaskId: 'task-abc-123' });
    const s = await store.getSession(tmp);
    expect(s.activeTaskId).toBe('task-abc-123');
  });

  test('round-trips null activeTaskId', async () => {
    await store.setSession(tmp, { activeTaskId: 'task-xyz' });
    await store.setSession(tmp, { activeTaskId: null });
    const s = await store.getSession(tmp);
    expect(s.activeTaskId).toBeNull();
  });

  test('tolerates corrupt JSON — returns default', async () => {
    writeFileSync(join(tmp, '.sherpa', 'session.json'), '{corrupt');
    const s = await store.getSession(tmp);
    expect(s.activeTaskId).toBeNull();
  });

  test('tolerates wrong shape — returns default', async () => {
    writeFileSync(join(tmp, '.sherpa', 'session.json'), JSON.stringify({ foo: 'bar' }));
    const s = await store.getSession(tmp);
    expect(s.activeTaskId).toBeNull();
  });

  test('creates .sherpa dir if missing', async () => {
    const tmp2 = mkdtempSync(join(tmpdir(), 'session-nodir-'));
    try {
      const store2 = new SessionStore();
      await store2.setSession(tmp2, { activeTaskId: 'xyz' });
      const s = await store2.getSession(tmp2);
      expect(s.activeTaskId).toBe('xyz');
    } finally {
      rmSync(tmp2, { recursive: true, force: true });
    }
  });
});
