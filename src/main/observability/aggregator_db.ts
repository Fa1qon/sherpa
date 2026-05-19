// src/main/observability/aggregator_db.ts
// Track E Plan 01 — SQLite schema + queries for the event aggregator.
//
// Three metric tables:
//   stage_metrics  — per-stage start/complete durations
//   tool_metrics   — per-tool-call durations + ok/error counts
//   gate_metrics   — gate evaluation outcomes
//
// Backed by better-sqlite3.  Schema is migration-free (CREATE IF NOT EXISTS).
// Open under `app.getPath('userData')/analytics.db` in production; pass
// `new Database(':memory:')` in tests.

import type Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stage_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  stage_id TEXT NOT NULL,
  started_ts INTEGER NOT NULL,
  completed_ts INTEGER,
  duration_ms INTEGER,
  status TEXT
);
CREATE INDEX IF NOT EXISTS idx_stage_metrics_task ON stage_metrics(task_id);
CREATE INDEX IF NOT EXISTS idx_stage_metrics_stage ON stage_metrics(stage_id);

CREATE TABLE IF NOT EXISTS tool_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  called_ts INTEGER NOT NULL,
  completed_ts INTEGER,
  duration_ms INTEGER,
  ok INTEGER,
  input_size INTEGER,
  output_size INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tool_metrics_task ON tool_metrics(task_id);
CREATE INDEX IF NOT EXISTS idx_tool_metrics_tool ON tool_metrics(tool_name);

CREATE TABLE IF NOT EXISTS gate_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  gate_id TEXT NOT NULL,
  evaluated_ts INTEGER NOT NULL,
  result TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gate_metrics_task ON gate_metrics(task_id);
CREATE INDEX IF NOT EXISTS idx_gate_metrics_gate ON gate_metrics(gate_id);
`;

export class AggregatorDb {
  constructor(private readonly db: Database.Database) {
    db.exec(SCHEMA);
  }

  // ---------------------------------------------------------------------------
  // Stage writes
  // ---------------------------------------------------------------------------

  startStage(taskId: string, stageId: string, ts: number): number {
    const r = this.db
      .prepare('INSERT INTO stage_metrics (task_id, stage_id, started_ts) VALUES (?,?,?)')
      .run(taskId, stageId, ts);
    return Number(r.lastInsertRowid);
  }

  completeStage(taskId: string, stageId: string, ts: number, status: string): void {
    this.db
      .prepare(
        `UPDATE stage_metrics
         SET completed_ts = ?, duration_ms = ? - started_ts, status = ?
         WHERE id = (
           SELECT id FROM stage_metrics
           WHERE task_id = ? AND stage_id = ? AND completed_ts IS NULL
           ORDER BY started_ts DESC LIMIT 1
         )`,
      )
      .run(ts, ts, status, taskId, stageId);
  }

  // ---------------------------------------------------------------------------
  // Tool writes
  // ---------------------------------------------------------------------------

  callTool(taskId: string, toolName: string, ts: number, inputSize: number): number {
    const r = this.db
      .prepare(
        'INSERT INTO tool_metrics (task_id, tool_name, called_ts, input_size) VALUES (?,?,?,?)',
      )
      .run(taskId, toolName, ts, inputSize);
    return Number(r.lastInsertRowid);
  }

  completeTool(rowId: number, ts: number, ok: boolean, outputSize: number): void {
    this.db
      .prepare(
        'UPDATE tool_metrics SET completed_ts = ?, duration_ms = ? - called_ts, ok = ?, output_size = ? WHERE id = ?',
      )
      .run(ts, ts, ok ? 1 : 0, outputSize, rowId);
  }

  // ---------------------------------------------------------------------------
  // Gate writes
  // ---------------------------------------------------------------------------

  evaluateGate(taskId: string, gateId: string, ts: number, result: string): void {
    this.db
      .prepare(
        'INSERT INTO gate_metrics (task_id, gate_id, evaluated_ts, result) VALUES (?,?,?,?)',
      )
      .run(taskId, gateId, ts, result);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  stageDurationsForMethodology(
    _methodologyId: string | null = null,
  ): { stageId: string; count: number; avgMs: number; p50: number; p95: number }[] {
    // v1: ignore methodologyId filter (not stored per-row; can join via tasks table in a future plan)
    const rows = this.db
      .prepare(
        `SELECT stage_id, COUNT(*) as count, AVG(duration_ms) as avgMs
         FROM stage_metrics WHERE completed_ts IS NOT NULL GROUP BY stage_id`,
      )
      .all() as { stage_id: string; count: number; avgMs: number }[];

    return rows.map((r) => {
      const durations = (
        this.db
          .prepare(
            `SELECT duration_ms FROM stage_metrics
             WHERE stage_id = ? AND completed_ts IS NOT NULL
             ORDER BY duration_ms ASC`,
          )
          .all(r.stage_id) as { duration_ms: number }[]
      ).map((x) => x.duration_ms);
      return {
        stageId: r.stage_id,
        count: r.count,
        avgMs: Math.round(r.avgMs ?? 0),
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
      };
    });
  }

  gateOutcomes(): { gateId: string; pass: number; fail: number; pending: number }[] {
    const rows = this.db
      .prepare(
        `SELECT gate_id,
                SUM(CASE WHEN result = 'pass'    THEN 1 ELSE 0 END) as pass,
                SUM(CASE WHEN result = 'fail'    THEN 1 ELSE 0 END) as fail,
                SUM(CASE WHEN result = 'pending' THEN 1 ELSE 0 END) as pending
         FROM gate_metrics GROUP BY gate_id`,
      )
      .all() as { gate_id: string; pass: number; fail: number; pending: number }[];
    return rows.map((r) => ({
      gateId: r.gate_id,
      pass: r.pass,
      fail: r.fail,
      pending: r.pending,
    }));
  }

  toolUsage(): { toolName: string; calls: number; okRate: number; avgMs: number }[] {
    const rows = this.db
      .prepare(
        `SELECT tool_name, COUNT(*) as calls,
                AVG(ok) * 1.0 as okRate,
                AVG(duration_ms) as avgMs
         FROM tool_metrics WHERE completed_ts IS NOT NULL GROUP BY tool_name`,
      )
      .all() as { tool_name: string; calls: number; okRate: number; avgMs: number }[];
    return rows.map((r) => ({
      toolName: r.tool_name,
      calls: r.calls,
      okRate: Math.round((r.okRate ?? 0) * 100),
      avgMs: Math.round(r.avgMs ?? 0),
    }));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the value at percentile `p` (0–1) from a pre-sorted ascending array.
 * Returns 0 for empty arrays.
 */
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.floor(sortedArr.length * p));
  return sortedArr[idx] ?? 0;
}
