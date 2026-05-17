import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectDatabase } from '../../../src/core/adapters/project_database';
import { KnowledgeService } from '../../../src/main/services/knowledge_service';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeTestDb(): { db: ProjectDatabase; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'sherpa-knowledge-test-'));
  const db = new ProjectDatabase(dir);
  return { db, dir };
}

describe('KnowledgeService', () => {
  let svc: KnowledgeService;
  let dir: string;

  beforeEach(() => {
    const { db, dir: d } = makeTestDb();
    svc = new KnowledgeService(db);
    dir = d;
  });

  it('creates and retrieves a knowledge item', () => {
    const item = svc.create({ title: 'REST principles', content: 'Use HTTP verbs correctly.' });
    expect(item.id).toMatch(/^k-/);
    expect(svc.get(item.id)?.title).toBe('REST principles');
  });

  it('lists all items', () => {
    svc.create({ title: 'First', content: 'a' });
    svc.create({ title: 'Second', content: 'b' });
    const all = svc.list();
    expect(all.length).toBe(2);
    expect(all.map((i) => i.title)).toContain('First');
    expect(all.map((i) => i.title)).toContain('Second');
  });

  it('updates an item', () => {
    const item = svc.create({ title: 'Draft', content: 'v1' });
    const updated = svc.update(item.id, { content: 'v2' });
    expect(updated?.content).toBe('v2');
    expect(updated?.title).toBe('Draft');
  });

  it('deletes an item', () => {
    const item = svc.create({ title: 'Temp', content: 'x' });
    svc.delete(item.id);
    expect(svc.get(item.id)).toBeNull();
  });

  it('FTS search finds by title', () => {
    svc.create({ title: 'REST principles', content: 'Use HTTP verbs.' });
    svc.create({ title: 'GraphQL basics', content: 'Query language.' });
    const results = svc.ftsSearch('REST');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.title).toBe('REST principles');
  });
});
