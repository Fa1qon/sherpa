import { describe, test, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectDatabase } from '../../../src/core/adapters/project_database';

let tmpDir: string;
let db: ProjectDatabase;

afterEach(() => {
  db?.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('ProjectDatabase', () => {
  test('creates sherpa.db with all required tables', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sherpa-test-'));
    db = new ProjectDatabase(tmpDir);

    const tables = db
      .raw()
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' OR type='shadow'`)
      .all()
      .map((r) => (r as { name: string }).name);

    expect(tables).toContain('tasks');
    expect(tables).toContain('cases');
    // FTS5 creates shadow tables; the virtual table itself shows as 'cases_fts'
    expect(tables).toContain('cases_fts');
    // sqlite-vec virtual table
    expect(tables).toContain('cases_vec');
  });

  test('opens existing DB without error', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sherpa-test-'));
    db = new ProjectDatabase(tmpDir);
    db.close();
    // Re-open same path — must not throw
    db = new ProjectDatabase(tmpDir);
    expect(db.raw().open).toBe(true);
  });
});
