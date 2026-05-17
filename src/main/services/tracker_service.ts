// src/main/services/tracker_service.ts
import type Database from 'better-sqlite3';
import type { BoardConfig, TrackerTask, FieldValue } from '../../core/domain/tracker';
import { DEFAULT_STAGES } from '../../core/domain/tracker';
import type { ProjectDatabase } from '../../core/adapters/project_database';

interface RawTaskRow {
  id: string;
  title: string;
  status: string;
  tracker_stage_id: string | null;
  tracker_fields: string;
  tracker_session_summary: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTrackerTask(row: RawTaskRow): TrackerTask {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    stageId: row.tracker_stage_id ?? '',
    fields: (() => {
      try { return JSON.parse(row.tracker_fields) as Record<string, FieldValue>; }
      catch { return {}; }
    })(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TrackerService {
  private db: InstanceType<typeof Database> | null = null;

  setDatabase(projectDb: ProjectDatabase): void {
    this.db = projectDb.raw();
  }

  /** For tests only — inject a raw better-sqlite3 db directly. */
  setRawDb(db: InstanceType<typeof Database>): void {
    this.db = db;
  }

  getBoardConfig(subProjectId = ''): BoardConfig {
    if (!this.db) return { stages: [...DEFAULT_STAGES], fieldDefs: [] };
    const row = this.db
      .prepare(
        'SELECT stages_json, field_defs_json FROM tracker_board_config WHERE sub_project_id = ?',
      )
      .get(subProjectId) as { stages_json: string; field_defs_json: string } | undefined;
    if (!row) return { stages: [...DEFAULT_STAGES], fieldDefs: [] };
    return {
      stages: JSON.parse(row.stages_json) as BoardConfig['stages'],
      fieldDefs: JSON.parse(row.field_defs_json) as BoardConfig['fieldDefs'],
    };
  }

  setBoardConfig(subProjectId: string, config: BoardConfig): void {
    if (!this.db) return;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO tracker_board_config
           (sub_project_id, stages_json, field_defs_json, updated_at)
         VALUES (?, ?, ?, datetime('now'))`,
      )
      .run(subProjectId, JSON.stringify(config.stages), JSON.stringify(config.fieldDefs));
  }

  moveToStage(taskId: string, stageId: string): void {
    if (!this.db) return;
    this.db
      .prepare(
        `UPDATE tasks SET tracker_stage_id = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(stageId, taskId);
  }

  addTaskToBoard(taskId: string, stageId: string): TrackerTask {
    this.moveToStage(taskId, stageId);
    if (!this.db) throw new Error('no db');
    const row = this.db
      .prepare('SELECT id, title, status, tracker_stage_id, tracker_fields, tracker_session_summary, created_at, updated_at FROM tasks WHERE id = ?')
      .get(taskId) as RawTaskRow | undefined;
    if (!row) throw new Error(`task ${taskId} not found`);
    return rowToTrackerTask(row);
  }

  listTrackerTasks(projectPath: string): TrackerTask[] {
    if (!this.db) return [];
    const rows = this.db
      .prepare(
        `SELECT id, title, status, tracker_stage_id, tracker_fields, tracker_session_summary, created_at, updated_at
         FROM tasks
         WHERE project_path = ? AND tracker_stage_id IS NOT NULL
         ORDER BY created_at DESC`,
      )
      .all(projectPath) as RawTaskRow[];
    return rows.map(rowToTrackerTask);
  }

  setField(taskId: string, fieldId: string, value: FieldValue): void {
    if (!this.db) return;
    const row = this.db
      .prepare('SELECT tracker_fields FROM tasks WHERE id = ?')
      .get(taskId) as { tracker_fields: string } | undefined;
    const current: Record<string, FieldValue> = row
      ? (JSON.parse(row.tracker_fields) as Record<string, FieldValue>)
      : {};
    current[fieldId] = value;
    this.db
      .prepare(
        `UPDATE tasks SET tracker_fields = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(JSON.stringify(current), taskId);
  }

  getTrackerTask(taskId: string): TrackerTask | null {
    if (!this.db) return null;
    const row = this.db
      .prepare('SELECT id, title, status, tracker_stage_id, tracker_fields, tracker_session_summary, created_at, updated_at FROM tasks WHERE id = ? AND tracker_stage_id IS NOT NULL')
      .get(taskId) as RawTaskRow | undefined;
    return row ? rowToTrackerTask(row) : null;
  }
}
