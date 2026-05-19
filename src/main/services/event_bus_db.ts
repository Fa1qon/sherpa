// src/main/services/event_bus_db.ts
// Extension Framework Plan 02 Task 2 — SQLite event_log persistence.
//
// Persists `AppEvent` instances for replay (extensions opening late should
// still see recent history) and audit. Backed by better-sqlite3 — same
// dependency the rest of the main process uses.
//
// Schema is migration-free (CREATE IF NOT EXISTS); the DB is global (one
// `events.db` under `app.getPath('userData')`, not per-project) and held
// open for the entire main-process lifetime.

import type Database from 'better-sqlite3';
import type { AppEvent } from '../../core/domain/app_events';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  ts INTEGER NOT NULL,
  task_id TEXT,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_log_type_ts ON event_log(type, ts);
CREATE INDEX IF NOT EXISTS idx_event_log_task ON event_log(task_id);
`;

export interface EventLogFilter {
  readonly type?: AppEvent['type'];
  readonly taskId?: string;
  readonly sinceTs?: number;
  readonly limit?: number;
}

export class EventBusDb {
  constructor(private readonly db: Database.Database) {
    db.exec(SCHEMA);
  }

  insert(ev: AppEvent): void {
    const taskId = 'taskId' in ev ? ev.taskId : null;
    this.db
      .prepare('INSERT INTO event_log (type, ts, task_id, payload) VALUES (?,?,?,?)')
      .run(ev.type, ev.ts, taskId, JSON.stringify(ev));
  }

  list(filter: EventLogFilter = {}): AppEvent[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.type) {
      where.push('type = ?');
      params.push(filter.type);
    }
    if (filter.taskId) {
      where.push('task_id = ?');
      params.push(filter.taskId);
    }
    if (typeof filter.sinceTs === 'number') {
      where.push('ts >= ?');
      params.push(filter.sinceTs);
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT payload FROM event_log ${whereClause} ORDER BY ts ASC LIMIT ?`;
    params.push(filter.limit ?? 1000);
    const rows = this.db.prepare(sql).all(...params) as { payload: string }[];
    return rows.map((r) => JSON.parse(r.payload) as AppEvent);
  }

  /**
   * Delete every row with `ts < cutoffTs`. Returns the number of rows
   * deleted (useful for surfacing prune metrics).
   */
  pruneOlderThan(cutoffTs: number): number {
    const info = this.db.prepare('DELETE FROM event_log WHERE ts < ?').run(cutoffTs);
    return info.changes;
  }
}
