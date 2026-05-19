// tests/main/observability/event_aggregator.spec.ts
// Track E Plan 01 Task 2 — EventAggregator end-to-end tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AggregatorDb } from '../../../src/main/observability/aggregator_db';
import { EventAggregator } from '../../../src/main/observability/event_aggregator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAggregator(): { aggregator: EventAggregator; db: Database.Database } {
  const db = new Database(':memory:');
  const adb = new AggregatorDb(db);
  const aggregator = new EventAggregator(adb);
  return { aggregator, db };
}

// ---------------------------------------------------------------------------
// Tests: real DB
// ---------------------------------------------------------------------------

describe('EventAggregator (with in-memory db)', () => {
  let aggregator: EventAggregator;
  let db: Database.Database;

  beforeEach(() => {
    ({ aggregator, db } = makeAggregator());
  });

  afterEach(() => {
    db.close();
  });

  // --- Stages ---

  it('records stage start + complete and exposes via stageDurations()', () => {
    aggregator.recordStageStart('task1', 'analyze', 1000);
    aggregator.recordStageComplete('task1', 'analyze', 'success', 1800);
    const durations = aggregator.stageDurations();
    expect(durations.length).toBe(1);
    expect(durations[0]?.stageId).toBe('analyze');
    expect(durations[0]?.avgMs).toBe(800);
  });

  it('stageDurations returns empty when no completed stages', () => {
    aggregator.recordStageStart('task1', 'analyze', 1000);
    expect(aggregator.stageDurations()).toEqual([]);
  });

  // --- Tools ---

  it('records tool call + result and exposes via toolUsage()', () => {
    const key = aggregator.recordToolCall('task1', 'bash', 100, 1000);
    aggregator.recordToolResult(key, true, 200, 1500);
    const usage = aggregator.toolUsage();
    expect(usage.length).toBe(1);
    expect(usage[0]?.toolName).toBe('bash');
    expect(usage[0]?.calls).toBe(1);
    expect(usage[0]?.okRate).toBe(100);
    expect(usage[0]?.avgMs).toBe(500);
  });

  it('recordToolResult is a no-op for unknown key', () => {
    aggregator.recordToolResult('unknown-key', true, 0);
    expect(aggregator.toolUsage()).toEqual([]);
  });

  it('tool key is consumed after recordToolResult (no double-completion)', () => {
    const key = aggregator.recordToolCall('task1', 'bash', 10, 1000);
    aggregator.recordToolResult(key, true, 20, 1100);
    // Second call with same key: no-op
    aggregator.recordToolResult(key, false, 0, 1200);
    const usage = aggregator.toolUsage();
    expect(usage[0]?.calls).toBe(1);
    expect(usage[0]?.okRate).toBe(100);
  });

  it('handles multiple tool calls of same name with distinct keys', () => {
    const k1 = aggregator.recordToolCall('task1', 'bash', 10, 1000);
    const k2 = aggregator.recordToolCall('task1', 'bash', 10, 1001);
    aggregator.recordToolResult(k1, true, 20, 1200);  // 200 ms, ok
    aggregator.recordToolResult(k2, false, 5, 1402);  // ~401 ms, error
    const usage = aggregator.toolUsage();
    expect(usage[0]?.calls).toBe(2);
    expect(usage[0]?.okRate).toBe(50);
  });

  it('same-ms collision: two recordToolCall with identical (taskId, toolName, ts) produce unique keys and both rows complete', () => {
    // Reproduce the parallel tool-use collision scenario: same timestamp for both calls.
    const sameTs = 5000;
    const k1 = aggregator.recordToolCall('task1', 'read', 50, sameTs);
    const k2 = aggregator.recordToolCall('task1', 'read', 60, sameTs);

    // Keys must be distinct even though ts is identical.
    expect(k1).not.toBe(k2);

    // Complete both calls independently.
    aggregator.recordToolResult(k1, true, 100, sameTs + 200);
    aggregator.recordToolResult(k2, true, 110, sameTs + 300);

    // Both tool_metrics rows must be present and completed (no orphan rows).
    const rawRows = db
      .prepare('SELECT completed_ts FROM tool_metrics WHERE tool_name = ?')
      .all('read') as { completed_ts: number | null }[];
    expect(rawRows.length).toBe(2);
    expect(rawRows.every((r) => r.completed_ts !== null)).toBe(true);

    // Aggregate also reflects both completed calls.
    const usage = aggregator.toolUsage();
    expect(usage.find((u) => u.toolName === 'read')?.calls).toBe(2);
  });

  // --- Gates ---

  it('records gate and exposes via gateOutcomes()', () => {
    aggregator.recordGate('task1', 'gate-1', 'pass', 5000);
    aggregator.recordGate('task1', 'gate-1', 'fail', 6000);
    aggregator.recordGate('task2', 'gate-2', 'pending', 7000);
    const outcomes = aggregator.gateOutcomes();
    const g1 = outcomes.find((o) => o.gateId === 'gate-1');
    const g2 = outcomes.find((o) => o.gateId === 'gate-2');
    expect(g1).toMatchObject({ pass: 1, fail: 1, pending: 0 });
    expect(g2).toMatchObject({ pass: 0, fail: 0, pending: 1 });
  });
});

// ---------------------------------------------------------------------------
// Tests: null db (vitest / no-Electron fallback)
// ---------------------------------------------------------------------------

describe('EventAggregator (null db — no-op mode)', () => {
  let aggregator: EventAggregator;

  beforeEach(() => {
    aggregator = new EventAggregator(null);
  });

  it('stageDurations returns empty array', () => {
    aggregator.recordStageStart('t1', 's1');
    aggregator.recordStageComplete('t1', 's1', 'success');
    expect(aggregator.stageDurations()).toEqual([]);
  });

  it('toolUsage returns empty array', () => {
    const key = aggregator.recordToolCall('t1', 'bash', 10);
    aggregator.recordToolResult(key, true, 20);
    expect(aggregator.toolUsage()).toEqual([]);
  });

  it('gateOutcomes returns empty array', () => {
    aggregator.recordGate('t1', 'g1', 'pass');
    expect(aggregator.gateOutcomes()).toEqual([]);
  });

  it('recordToolResult with unknown key is a no-op (no throw)', () => {
    expect(() => aggregator.recordToolResult('nope', true, 0)).not.toThrow();
  });
});
