import type { ProjectDatabase } from '../../core/adapters/project_database';
import type { KnowledgeItem, CreateKnowledgeInput } from '../../core/domain/knowledge';
import { makeKnowledgeId } from '../../core/domain/knowledge';

interface KnowledgeRow {
  id: string;
  title: string;
  category: string | null;
  content: string;
  tags_json: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

function rowToItem(row: KnowledgeRow): KnowledgeItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category ?? undefined,
    content: row.content,
    tags: JSON.parse(row.tags_json) as string[],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class KnowledgeService {
  private readonly db: ReturnType<ProjectDatabase['raw']>;

  constructor(projectDb: ProjectDatabase) {
    this.db = projectDb.raw();
  }

  create(input: CreateKnowledgeInput): KnowledgeItem {
    const now = new Date().toISOString();
    const item: KnowledgeItem = {
      id: makeKnowledgeId(),
      title: input.title,
      category: input.category,
      content: input.content,
      tags: input.tags ?? [],
      created_at: now,
      updated_at: now,
    };
    const tagsFlat = [...item.tags].join(' ');
    this.db
      .prepare(
        `INSERT INTO knowledge (id, title, category, content, tags_json, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        item.id,
        item.title,
        item.category ?? null,
        item.content,
        JSON.stringify(item.tags),
        tagsFlat,
        item.created_at,
        item.updated_at,
      );
    this.db
      .prepare(
        `INSERT INTO knowledge_fts(rowid, id, title, category, content, tags)
         VALUES ((SELECT rowid FROM knowledge WHERE id=?), ?, ?, ?, ?, ?)`,
      )
      .run(item.id, item.id, item.title, item.category ?? '', item.content, tagsFlat);
    return item;
  }

  get(id: string): KnowledgeItem | null {
    const row = this.db
      .prepare('SELECT * FROM knowledge WHERE id=?')
      .get(id) as KnowledgeRow | undefined;
    return row ? rowToItem(row) : null;
  }

  list(): KnowledgeItem[] {
    const rows = this.db
      .prepare('SELECT * FROM knowledge ORDER BY updated_at DESC')
      .all() as KnowledgeRow[];
    return rows.map(rowToItem);
  }

  update(id: string, patch: Partial<CreateKnowledgeInput>): KnowledgeItem | null {
    const existing = this.get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const tags = patch.tags ?? existing.tags;
    const tagsFlat = [...tags].join(' ');
    this.db
      .prepare(
        `UPDATE knowledge SET title=?, category=?, content=?, tags_json=?, tags=?, updated_at=? WHERE id=?`,
      )
      .run(
        patch.title ?? existing.title,
        patch.category ?? existing.category ?? null,
        patch.content ?? existing.content,
        JSON.stringify(tags),
        tagsFlat,
        now,
        id,
      );
    this.db.prepare('DELETE FROM knowledge_fts WHERE id=?').run(id);
    this.db
      .prepare(
        `INSERT INTO knowledge_fts(rowid, id, title, category, content, tags)
         VALUES ((SELECT rowid FROM knowledge WHERE id=?), ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        id,
        patch.title ?? existing.title,
        patch.category ?? existing.category ?? '',
        patch.content ?? existing.content,
        tagsFlat,
      );
    return this.get(id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM knowledge_fts WHERE id=?').run(id);
    this.db.prepare('DELETE FROM knowledge_vec WHERE knowledge_id=?').run(id);
    this.db.prepare('DELETE FROM knowledge WHERE id=?').run(id);
  }

  ftsSearch(query: string): KnowledgeItem[] {
    if (!query.trim()) return [];
    const rows = this.db
      .prepare(
        `SELECT k.* FROM knowledge k
         JOIN knowledge_fts f ON k.id = f.id
         WHERE knowledge_fts MATCH ?
         ORDER BY rank LIMIT 30`,
      )
      .all(query) as KnowledgeRow[];
    return rows.map(rowToItem);
  }

  upsertEmbedding(id: string, embedding: Float32Array): void {
    this.db
      .prepare(
        `INSERT INTO knowledge_vec(knowledge_id, embedding) VALUES (?, ?)
         ON CONFLICT(knowledge_id) DO UPDATE SET embedding=excluded.embedding`,
      )
      .run(id, embedding);
  }

  vectorSearch(queryEmb: Float32Array, k = 10): Array<{ knowledgeId: string; distance: number }> {
    const rows = this.db
      .prepare(
        `SELECT knowledge_id, distance FROM knowledge_vec
         WHERE embedding MATCH ? AND k=?
         ORDER BY distance`,
      )
      .all(queryEmb, k) as Array<{ knowledge_id: string; distance: number }>;
    return rows.map((r) => ({ knowledgeId: r.knowledge_id, distance: r.distance }));
  }
}
