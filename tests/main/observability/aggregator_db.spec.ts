// tests/main/observability/aggregator_db.spec.ts
// Track E Plan 01 Task 1 — AggregatorDb schema + query tests (in-memory SQLite).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AggregatorDb } from '../../../src/main/observability/aggregator_db';

describe('AggregatorDb', () => {
  let db: Database.Database;
  let adb: AggregatorDb;

  beforeEach(() => {
    db = new Database(':memory:');
    adb = new AggregatorDb(db);
  });

  afterEach(() => {
    db.close();
  });

  // ---------------------------------------------------------------------------
  // Stage metrics
  // ---------------------------------------------------------------------------

  describe('stage metrics', () => {
    it('records a start row with no completed_ts', () => {
      adb.startStage('task1', 'stage-a', 1000);
      const rows = db
        .prepare('SELECT * FROM stage_metrics WHERE task_id = ?')
        .all('task1') as { stage_id: string; started_ts: number; completed_ts: null }[];
      expect(rows.length).toBe(1);
      expect(rows[0]?.stage_id).toBe('stage-a');
      expect(rows[0]?.completed_ts).toBeNull();
    });

    it('completes the most-recent open row, computes duration_ms and status', () => {
      adb.startStage('task1', 'stage-a', 1000);
      adb.completeStage('task1', 'stage-a', 1500, 'success');
      const rows = db
        .prepare('SELECT * FROM stage_metrics WHERE task_id = ?')
        .all('task1') as { duration_ms: number; status: string }[];
      expect(rows[0]?.duration_ms).toBe(500);
      expect(rows[0]?.status).toBe('success');
    });

    it('completes only the latest open row when two are open', () => {
      adb.startStage('task1', 'stage-a', 1000); // first — remains open
      adb.startStage('task1', 'stage-a', 2000); // second — gets completed
      adb.completeStage('task1', 'stage-a', 3000, 'failed');
      const rows = db
        .prepare('SELECT * FROM stage_metrics WHERE task_id = ? ORDER BY id ASC')
        .all('task1') as { started_ts: number; completed_ts: number | null; duration_ms: number | null }[];
      expect(rows.length).toBe(2);
      // First row still open
      expect(rows[0]?.completed_ts).toBeNull();
      // Second row completed
      expect(rows[1]?.completed_ts).toBe(3000);
      expect(rows[1]?.duration_ms).toBe(1000);
    });
  });

  // ---------------------------------------------------------------------------
  // Tool metrics
  // ---------------------------------------------------------------------------

  describe('tool metrics', () => {
    it('records tool call and completion', () => {
      const rowId = adb.callTool('task1', 'bash', 1000, 120);
      adb.completeTool(rowId, 1300, true, 200);
      const rows = db
        .prepare('SELECT * FROM tool_metrics WHERE task_id = ?')
        .all('task1') as {
          tool_name: string;
          duration_ms: number;
          ok: number;
          input_size: number;
          output_size: number;
        }[];
      expect(rows[0]?.tool_name).toBe('bash');
      expect(rows[0]?.duration_ms).toBe(300);
      expect(rows[0]?.ok).toBe(1);
      expect(rows[0]?.input_size).toBe(120);
      expect(rows[0]?.output_size).toBe(200);
    });

    it('stores ok=0 for failed tool calls', () => {
      const rowId = adb.callTool('task1', 'bash', 1000, 0);
      adb.completeTool(rowId, 1100, false, 50);
      const rows = db
        .prepare('SELECT ok FROM tool_metrics')
        .all() as { ok: number }[];
      expect(rows[0]?.ok).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Gate metrics
  // ---------------------------------------------------------------------------

  describe('gate metrics', () => {
    it('records gate evaluation', () => {
      adb.evaluateGate('task1', 'gate-1', 5000, 'pass');
      adb.evaluateGate('task1', 'gate-1', 6000, 'fail');
      const rows = db
        .prepare('SELECT result FROM gate_metrics ORDER BY evaluated_ts ASC')
        .all() as { result: string }[];
      expect(rows.map((r) => r.result)).toEqual(['pass', 'fail']);
    });
  });

  // ---------------------------------------------------------------------------
  // Query: stageDurationsForMethodology
  // ---------------------------------------------------------------------------

  describe('stageDurationsForMethodology', () => {
    it('returns empty array when no completed stages', () => {
      adb.startStage('task1', 'stage-a', 1000);
      expect(adb.stageDurationsForMethodology()).toEqual([]);
    });

    it('returns avg, p50, p95 for a known dataset', () => {
      // Insert 10 stages with durations 100, 200, ..., 1000 ms
      for (let i = 1; i <= 10; i++) {
        adb.startStage('task1', 'stage-a', i * 1000);
        adb.completeStage('task1', 'stage-a', i * 1000 + i * 100, 'success');
      }
      const results = adb.stageDurationsForMethodology();
      expect(results.length).toBe(1);
      const r = results[0]!;
      expect(r.stageId).toBe('stage-a');
      expect(r.count).toBe(10);
      // avg of 100..1000 = 550
      expect(r.avgMs).toBe(550);
      // p50: floor(10 * 0.5) = 5 → sortedArr[5] = 600
      expect(r.p50).toBe(600);
      // p95: floor(10 * 0.95) = 9 → sortedArr[9] = 1000
      expect(r.p95).toBe(1000);
    });

    it('handles a single completed stage (p50 = p95 = value)', () => {
      adb.startStage('task1', 'stage-x', 0);
      adb.completeStage('task1', 'stage-x', 250, 'success');
      const results = adb.stageDurationsForMethodology();
      expect(results.length).toBe(1);
      expect(results[0]?.p50).toBe(250);
      expect(results[0]?.p95).toBe(250);
    });
  });

  // ---------------------------------------------------------------------------
  // Query: gateOutcomes
  // ---------------------------------------------------------------------------

  describe('gateOutcomes', () => {
    it('counts pass/fail/pending per gate', () => {
      adb.evaluateGate('task1', 'g1', 1, 'pass');
      adb.evaluateGate('task2', 'g1', 2, 'pass');
      adb.evaluateGate('task3', 'g1', 3, 'fail');
      adb.evaluateGate('task4', 'g2', 4, 'pending');
      const outcomes = adb.gateOutcomes();
      const g1 = outcomes.find((o) => o.gateId === 'g1');
      const g2 = outcomes.find((o) => o.gateId === 'g2');
      expect(g1).toMatchObject({ pass: 2, fail: 1, pending: 0 });
      expect(g2).toMatchObject({ pass: 0, fail: 0, pending: 1 });
    });

    it('returns empty array when no gates recorded', () => {
      expect(adb.gateOutcomes()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Query: toolUsage
  // ---------------------------------------------------------------------------

  describe('toolUsage', () => {
    it('computes calls, okRate, avgMs per tool', () => {
      const id1 = adb.callTool('task1', 'bash', 1000, 10);
      adb.completeTool(id1, 1200, true, 20);  // 200 ms, ok
      const id2 = adb.callTool('task1', 'bash', 2000, 10);
      adb.completeTool(id2, 2600, false, 5);  // 600 ms, error
      const usage = adb.toolUsage();
      expect(usage.length).toBe(1);
      const bash = usage[0]!;
      expect(bash.toolName).toBe('bash');
      expect(bash.calls).toBe(2);
      expect(bash.okRate).toBe(50);  // 0.5 * 100
      expect(bash.avgMs).toBe(400);  // (200 + 600) / 2
    });

    it('excludes incomplete (no completed_ts) tool calls from aggregation', () => {
      adb.callTool('task1', 'bash', 1000, 10);  // never completed
      const usage = adb.toolUsage();
      expect(usage).toEqual([]);
    });

    it('returns empty array when no tools recorded', () => {
      expect(adb.toolUsage()).toEqual([]);
    });
  });
});
