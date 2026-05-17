import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TrackerService } from '../../../src/main/services/tracker_service';
import type { BoardConfig } from '../../../src/core/domain/tracker';
import { DEFAULT_STAGES } from '../../../src/core/domain/tracker';

function makeInMemoryDb(): ReturnType<typeof Database> {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      project_path TEXT,
      status TEXT NOT NULL DEFAULT 'created',
      tracker_stage_id TEXT,
      tracker_fields TEXT NOT NULL DEFAULT '{}',
      tracker_session_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE tracker_board_config (
      sub_project_id TEXT PRIMARY KEY,
      stages_json TEXT NOT NULL DEFAULT '[]',
      field_defs_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

describe('TrackerService', () => {
  let svc: TrackerService;
  let db: ReturnType<typeof Database>;

  beforeEach(() => {
    db = makeInMemoryDb();
    svc = new TrackerService();
    svc.setRawDb(db);
  });

  afterEach(() => { db.close(); });

  it('getBoardConfig returns DEFAULT_STAGES when no config row', () => {
    const cfg = svc.getBoardConfig('');
    expect(cfg.stages).toEqual(DEFAULT_STAGES);
    expect(cfg.fieldDefs).toEqual([]);
  });

  it('setBoardConfig persists and getBoardConfig reads it back', () => {
    const config: BoardConfig = {
      stages: [
        { id: 'todo', name: 'Todo', category: 'backlog', order: 0 },
        { id: 'review', name: 'Review', category: 'active', order: 1 },
      ],
      fieldDefs: [],
    };
    svc.setBoardConfig('', config);
    const result = svc.getBoardConfig('');
    expect(result.stages).toEqual(config.stages);
  });

  it('moveToStage updates tracker_stage_id in tasks table', () => {
    db.prepare(
      `INSERT INTO tasks (id, title, status, created_at, updated_at)
       VALUES ('T-1', 'Test', 'created', '2024-01-01', '2024-01-01')`
    ).run();
    svc.moveToStage('T-1', 'in-progress');
    const row = db.prepare('SELECT tracker_stage_id FROM tasks WHERE id = ?').get('T-1') as { tracker_stage_id: string };
    expect(row.tracker_stage_id).toBe('in-progress');
  });

  it('listTrackerTasks returns only tasks with tracker_stage_id', () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, title, status, project_path, tracker_stage_id, created_at, updated_at)
       VALUES ('T-1', 'On board', 'created', '/proj', 'backlog', ?, ?)`
    ).run(now, now);
    db.prepare(
      `INSERT INTO tasks (id, title, status, project_path, created_at, updated_at)
       VALUES ('T-2', 'Not on board', 'created', '/proj', ?, ?)`
    ).run(now, now);
    const tasks = svc.listTrackerTasks('/proj');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('T-1');
    expect(tasks[0].stageId).toBe('backlog');
  });

  it('addTaskToBoard sets tracker_stage_id and returns TrackerTask', () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, title, status, created_at, updated_at)
       VALUES ('T-3', 'New', 'created', ?, ?)`
    ).run(now, now);
    const task = svc.addTaskToBoard('T-3', 'backlog');
    expect(task.stageId).toBe('backlog');
    const row = db.prepare('SELECT tracker_stage_id FROM tasks WHERE id = ?').get('T-3') as { tracker_stage_id: string };
    expect(row.tracker_stage_id).toBe('backlog');
  });

  it('setField updates tracker_fields JSON', () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, title, status, tracker_stage_id, created_at, updated_at)
       VALUES ('T-4', 'Fld', 'created', 'backlog', ?, ?)`
    ).run(now, now);
    svc.setField('T-4', 'priority', 'high');
    const row = db.prepare('SELECT tracker_fields FROM tasks WHERE id = ?').get('T-4') as { tracker_fields: string };
    const fields = JSON.parse(row.tracker_fields) as Record<string, unknown>;
    expect(fields['priority']).toBe('high');
  });
});
