import type { ProjectDatabase } from '../../core/adapters/project_database';
import type { Case, CreateCaseInput } from '../../core/domain/case';
import { makeCaseId } from '../../core/domain/case';

interface CaseRow {
  id: string;
  title: string;
  summary: string;
  content: string;
  tags_json: string;
  tags: string;
  methodology_id: string | null;
  source_task_id: string | null;
  confidence: string;
  created_at: string;
  updated_at: string;
}

function rowToCase(row: CaseRow): Case {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    tags: JSON.parse(row.tags_json) as string[],
    methodology_id: row.methodology_id ?? undefined,
    source_task_id: row.source_task_id ?? undefined,
    confidence: row.confidence as Case['confidence'],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class CaseService {
  private readonly db: ReturnType<ProjectDatabase['raw']>;

  constructor(projectDb: ProjectDatabase) {
    this.db = projectDb.raw();
  }

  create(input: CreateCaseInput): Case {
    const now = new Date().toISOString();
    const c: Case = {
      id: makeCaseId(),
      title: input.title,
      summary: input.summary ?? '',
      content: input.content ?? '',
      tags: input.tags ?? [],
      methodology_id: input.methodology_id,
      source_task_id: input.source_task_id,
      confidence: input.confidence ?? 'medium',
      created_at: now,
      updated_at: now,
    };

    const tagsFlat = c.tags.join(' ');

    this.db
      .prepare(
        `INSERT INTO cases
           (id, title, summary, content, tags_json, tags, methodology_id, source_task_id,
            confidence, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        c.id, c.title, c.summary, c.content,
        JSON.stringify(c.tags), tagsFlat,
        c.methodology_id ?? null, c.source_task_id ?? null,
        c.confidence, c.created_at, c.updated_at,
      );

    // Sync FTS5 index (using rowid from the just-inserted row)
    this.db
      .prepare(
        `INSERT INTO cases_fts(rowid, id, title, summary, content, tags)
         VALUES ((SELECT rowid FROM cases WHERE id=?), ?, ?, ?, ?, ?)`,
      )
      .run(c.id, c.id, c.title, c.summary, c.content, tagsFlat);

    return c;
  }

  get(id: string): Case | null {
    const row = this.db
      .prepare(`SELECT * FROM cases WHERE id = ?`)
      .get(id) as CaseRow | undefined;
    return row ? rowToCase(row) : null;
  }

  list(): Case[] {
    return (this.db.prepare(`SELECT * FROM cases ORDER BY created_at DESC`).all() as CaseRow[]).map(
      rowToCase,
    );
  }

  delete(id: string): void {
    // For FTS5 content tables we must use the 'delete' command to keep the index consistent.
    const row = this.db
      .prepare(`SELECT rowid, title, summary, content, tags FROM cases WHERE id = ?`)
      .get(id) as (Pick<CaseRow, 'title' | 'summary' | 'content' | 'tags'> & { rowid: number }) | undefined;
    if (row) {
      this.db
        .prepare(
          `INSERT INTO cases_fts(cases_fts, rowid, id, title, summary, content, tags)
           VALUES ('delete', ?, ?, ?, ?, ?, ?)`,
        )
        .run(row.rowid, id, row.title, row.summary, row.content, row.tags);
    }
    this.db.prepare(`DELETE FROM cases WHERE id = ?`).run(id);
  }

  ftsSearch(query: string, limit = 20): Case[] {
    const rows = this.db
      .prepare(
        `SELECT c.* FROM cases_fts f
         JOIN cases c ON c.id = f.id
         WHERE cases_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(query, limit) as CaseRow[];
    return rows.map(rowToCase);
  }

  /** Store a pre-computed embedding for a case. */
  upsertEmbedding(caseId: string, embedding: Float32Array): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO cases_vec(case_id, embedding)
         VALUES (?, ?)`,
      )
      .run(caseId, Buffer.from(embedding.buffer));
  }

  /** Vector similarity search. Returns case IDs ordered by distance (nearest first). */
  vectorSearch(queryEmbedding: Float32Array, k = 10): Array<{ caseId: string; distance: number }> {
    const rows = this.db
      .prepare(
        `SELECT case_id, distance
         FROM cases_vec
         WHERE embedding MATCH ? AND k = ?
         ORDER BY distance`,
      )
      .all(Buffer.from(queryEmbedding.buffer), k) as Array<{
        case_id: string;
        distance: number;
      }>;
    return rows.map((r) => ({ caseId: r.case_id, distance: r.distance }));
  }

  /**
   * Merged FTS + optional vector search. FTS results come first (by rank);
   * vector hits that aren't already in the FTS set are appended. Deduped by id.
   */
  unifiedSearch(query: string, queryEmbedding: Float32Array | null, limit = 10): Case[] {
    const seen = new Set<string>();
    const results: Case[] = [];

    if (query.trim()) {
      for (const c of this.ftsSearch(query, limit)) {
        if (!seen.has(c.id)) { seen.add(c.id); results.push(c); }
      }
    }

    if (queryEmbedding && results.length < limit) {
      const vectorHits = this.vectorSearch(queryEmbedding, limit);
      for (const hit of vectorHits) {
        if (seen.has(hit.caseId)) continue;
        const c = this.get(hit.caseId);
        if (c) { seen.add(c.id); results.push(c); }
        if (results.length >= limit) break;
      }
    }

    return results.slice(0, limit);
  }
}
