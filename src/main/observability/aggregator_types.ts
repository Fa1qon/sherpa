// src/main/observability/aggregator_types.ts
// Track E Plan 01 — exported query result types for the EventAggregator.
// Canonical definitions live in src/core/domain/observability.ts; this file
// re-exports them for backward compatibility with existing main imports.
// Presentation/renderer code must import from src/core/domain/observability.

export type {
  StageDurationEntry,
  GateOutcomeEntry,
  ToolUsageEntry,
} from '../../core/domain/observability';
