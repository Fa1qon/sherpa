import type { ProjectDatabase } from '../../core/adapters/project_database';
import type { ArtifactTemplate, CreateTemplateInput } from '../../core/domain/artifact_template';
import { makeTemplateId } from '../../core/domain/artifact_template';

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  content: string;
  stage_hint: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTemplate(row: TemplateRow): ArtifactTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    content: row.content,
    stage_hint: row.stage_hint ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class TemplateService {
  private readonly db: ReturnType<ProjectDatabase['raw']>;

  constructor(projectDb: ProjectDatabase) {
    this.db = projectDb.raw();
  }

  create(input: CreateTemplateInput): ArtifactTemplate {
    const now = new Date().toISOString();
    const tmpl: ArtifactTemplate = {
      id: makeTemplateId(),
      name: input.name,
      description: input.description,
      content: input.content,
      stage_hint: input.stage_hint,
      created_at: now,
      updated_at: now,
    };
    this.db
      .prepare(
        `INSERT INTO artifact_templates (id, name, description, content, stage_hint, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tmpl.id,
        tmpl.name,
        tmpl.description ?? null,
        tmpl.content,
        tmpl.stage_hint ?? null,
        tmpl.created_at,
        tmpl.updated_at,
      );
    return tmpl;
  }

  get(id: string): ArtifactTemplate | null {
    const row = this.db
      .prepare('SELECT * FROM artifact_templates WHERE id=?')
      .get(id) as TemplateRow | undefined;
    return row ? rowToTemplate(row) : null;
  }

  list(): ArtifactTemplate[] {
    const rows = this.db
      .prepare('SELECT * FROM artifact_templates ORDER BY updated_at DESC')
      .all() as TemplateRow[];
    return rows.map(rowToTemplate);
  }

  update(id: string, patch: Partial<CreateTemplateInput>): ArtifactTemplate | null {
    const existing = this.get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE artifact_templates SET name=?, description=?, content=?, stage_hint=?, updated_at=? WHERE id=?`,
      )
      .run(
        patch.name ?? existing.name,
        patch.description ?? existing.description ?? null,
        patch.content ?? existing.content,
        patch.stage_hint ?? existing.stage_hint ?? null,
        now,
        id,
      );
    return this.get(id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM artifact_templates WHERE id=?').run(id);
  }
}
