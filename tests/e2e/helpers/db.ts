// tests/e2e/helpers/db.ts
//
// Direct SQLite read helpers for E2E DB assertions.
// Reads the project database WITHOUT going through IPC — bypasses the app entirely.
// Only use for assertions, never for writes (that would bypass app logic).

import Database from 'better-sqlite3';
import { join } from 'node:path';

/** Open project DB read-only. Close after assertions. */
export function openProjectDb(projectPath: string): Database.Database {
  const dbPath = join(projectPath, '.sherpa', 'sherpa.db');
  return new Database(dbPath, { readonly: true });
}

/** Get all tasks from the project DB. */
export function dbGetTasks(projectPath: string): unknown[] {
  const db = openProjectDb(projectPath);
  try {
    return db.prepare('SELECT * FROM tasks').all();
  } finally {
    db.close();
  }
}

/** Get tracker board config for a project (or sub-project). */
export function dbGetBoardConfig(projectPath: string, subProjectId?: string): unknown {
  const db = openProjectDb(projectPath);
  try {
    const row = db
      .prepare('SELECT config_json FROM tracker_board_config WHERE sub_project_id = ?')
      .get(subProjectId ?? '') as { config_json: string } | undefined;
    return row ? JSON.parse(row.config_json) : null;
  } finally {
    db.close();
  }
}

/** Get a task's tracker_stage_id from the DB. */
export function dbGetTaskStage(projectPath: string, taskId: string): string | null {
  const db = openProjectDb(projectPath);
  try {
    const row = db
      .prepare('SELECT tracker_stage_id FROM tasks WHERE id = ?')
      .get(taskId) as { tracker_stage_id: string | null } | undefined;
    return row?.tracker_stage_id ?? null;
  } finally {
    db.close();
  }
}

/** Check if a task artifact file exists in the DB or filesystem. */
export function dbGetTaskArtifacts(projectPath: string, taskId: string): string[] {
  const db = openProjectDb(projectPath);
  try {
    const rows = db
      .prepare('SELECT path FROM artifacts WHERE task_id = ?')
      .all(taskId) as Array<{ path: string }>;
    return rows.map((r) => r.path);
  } catch {
    // artifacts table may not exist in all versions
    return [];
  } finally {
    db.close();
  }
}
