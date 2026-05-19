// src/main/observability/event_aggregator.ts
// Track E Plan 01 Task 2 — EventAggregator: thin service layer over AggregatorDb.
//
// Accepts `AggregatorDb | null`.  When null (vitest / no Electron), every
// write method is a no-op and every read method returns an empty array — the
// same pattern used by EventBus with its nullable EventBusDb.
//
// Tool-call correlation:
//   recordToolCall  → returns an opaque key
//   recordToolResult(key, ...) → closes the matching row
//
// Keys are stored in a per-instance Map; no singleton state.

import type { AggregatorDb } from './aggregator_db';
import type { StageDurationEntry, GateOutcomeEntry, ToolUsageEntry } from './aggregator_types';

export class EventAggregator {
  /** Maps opaque key → SQLite row id for open tool calls. */
  private readonly toolRows = new Map<string, number>();

  /** Monotonic sequence counter — guarantees key uniqueness within same ms. */
  private _seq = 0;

  constructor(private readonly db: AggregatorDb | null) {}

  // ---------------------------------------------------------------------------
  // Stage recording
  // ---------------------------------------------------------------------------

  recordStageStart(taskId: string, stageId: string, ts = Date.now()): void {
    this.db?.startStage(taskId, stageId, ts);
  }

  recordStageComplete(
    taskId: string,
    stageId: string,
    status: 'success' | 'failed' | 'skipped',
    ts = Date.now(),
  ): void {
    this.db?.completeStage(taskId, stageId, ts, status);
  }

  // ---------------------------------------------------------------------------
  // Tool recording
  // ---------------------------------------------------------------------------

  /**
   * Record the start of a tool call.
   * Returns an opaque correlation key to pass to `recordToolResult`.
   */
  recordToolCall(
    taskId: string,
    toolName: string,
    inputSize: number,
    ts = Date.now(),
  ): string {
    const key = `${taskId}:${toolName}:${ts}:${++this._seq}`;
    if (this.db) {
      const rowId = this.db.callTool(taskId, toolName, ts, inputSize);
      this.toolRows.set(key, rowId);
    }
    return key;
  }

  /**
   * Record the completion of a previously started tool call.
   * If the key is unknown (null db or key was never registered), this is a no-op.
   */
  recordToolResult(key: string, ok: boolean, outputSize: number, ts = Date.now()): void {
    const rowId = this.toolRows.get(key);
    if (rowId === undefined) return;
    this.db?.completeTool(rowId, ts, ok, outputSize);
    this.toolRows.delete(key);
  }

  // ---------------------------------------------------------------------------
  // Gate recording
  // ---------------------------------------------------------------------------

  recordGate(
    taskId: string,
    gateId: string,
    result: 'pass' | 'fail' | 'pending',
    ts = Date.now(),
  ): void {
    this.db?.evaluateGate(taskId, gateId, ts, result);
  }

  // ---------------------------------------------------------------------------
  // Read-throughs
  // ---------------------------------------------------------------------------

  stageDurations(): StageDurationEntry[] {
    return this.db?.stageDurationsForMethodology() ?? [];
  }

  gateOutcomes(): GateOutcomeEntry[] {
    return this.db?.gateOutcomes() ?? [];
  }

  toolUsage(): ToolUsageEntry[] {
    return this.db?.toolUsage() ?? [];
  }
}
