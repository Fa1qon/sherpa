import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectDatabase } from '../../../src/core/adapters/project_database';
import { CaseService } from '../../../src/main/services/case_service';
import { EmbeddingService } from '../../../src/main/services/embedding_service';

let tmpDir: string;
let db: ProjectDatabase;
let svc: CaseService;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'sherpa-case-'));
  db = new ProjectDatabase(tmpDir);
  svc = new CaseService(db);
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('CaseService — CRUD', () => {
  test('create returns a Case with generated id', () => {
    const c = svc.create({
      title: 'Fix memory leak in useEffect',
      summary: 'Memoize heavy computation',
      content: 'Use useCallback and useMemo to prevent re-renders.',
      tags: ['react', 'performance'],
    });
    expect(c.id).toBeTruthy();
    expect(c.title).toBe('Fix memory leak in useEffect');
    expect(c.tags).toEqual(['react', 'performance']);
  });

  test('get returns the case after create', () => {
    const c = svc.create({ title: 'Test case' });
    const loaded = svc.get(c.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.title).toBe('Test case');
  });

  test('get returns null for unknown id', () => {
    expect(svc.get('nonexistent')).toBeNull();
  });

  test('list returns all cases', () => {
    svc.create({ title: 'Alpha' });
    svc.create({ title: 'Beta' });
    expect(svc.list().length).toBe(2);
  });

  test('delete removes the case', () => {
    const c = svc.create({ title: 'Remove me' });
    svc.delete(c.id);
    expect(svc.get(c.id)).toBeNull();
  });
});

describe('CaseService — FTS5 search', () => {
  test('ftsSearch finds case by title keyword', () => {
    svc.create({ title: 'SQLite connection pooling', summary: 'Use WAL mode' });
    svc.create({ title: 'React hook patterns', summary: 'Custom hooks' });

    const results = svc.ftsSearch('connection pooling');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('SQLite');
  });

  test('ftsSearch finds case by content keyword', () => {
    svc.create({
      title: 'Unrelated title',
      content: 'The real answer is to use memoization strategies.',
    });
    const results = svc.ftsSearch('memoization');
    expect(results.length).toBe(1);
  });

  test('ftsSearch returns empty for no match', () => {
    svc.create({ title: 'Something about cats' });
    expect(svc.ftsSearch('quantum computing')).toHaveLength(0);
  });
});

describe('CaseService — vector search', () => {
  test('vectorSearch returns nearest case by semantic similarity', async () => {
    const embedder = new EmbeddingService();

    // Create three topically distinct cases
    const c1 = svc.create({
      title: 'Database indexing for slow queries',
      summary: 'Add composite index on (user_id, created_at) columns',
    });
    const c2 = svc.create({
      title: 'React component re-render optimization',
      summary: 'Wrap expensive child components in React.memo',
    });
    const c3 = svc.create({
      title: 'CI pipeline caching strategies',
      summary: 'Cache node_modules between pipeline runs',
    });

    // Embed and store all three
    for (const c of [c1, c2, c3]) {
      const emb = await embedder.embed(`${c.title} ${c.summary}`);
      svc.upsertEmbedding(c.id, emb);
    }

    // Query about React — should return c2 as nearest
    const queryEmb = await embedder.embed('optimizing React rendering performance');
    const results = svc.vectorSearch(queryEmb, 3);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].caseId).toBe(c2.id);

    await embedder.dispose();
  }, 30_000); // allow up to 30s for model load on first run
});
