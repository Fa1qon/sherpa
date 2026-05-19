// src/core/domain/observability.ts
// Shared observability result types — canonical definitions live here.
// src/main/observability/aggregator_types re-exports from this file.
// Presentation and renderer code must import from here, not from src/main.

export interface StageDurationEntry {
  readonly stageId: string;
  readonly count: number;
  /** Average duration in milliseconds (rounded). */
  readonly avgMs: number;
  /** 50th-percentile duration in milliseconds. */
  readonly p50: number;
  /** 95th-percentile duration in milliseconds. */
  readonly p95: number;
}

export interface GateOutcomeEntry {
  readonly gateId: string;
  readonly pass: number;
  readonly fail: number;
  readonly pending: number;
}

export interface ToolUsageEntry {
  readonly toolName: string;
  /** Total completed call count. */
  readonly calls: number;
  /** Success rate 0–100 (rounded integer). */
  readonly okRate: number;
  /** Average call duration in milliseconds (rounded). */
  readonly avgMs: number;
}
