// src/core/domain/task_meta.ts
// Plan 8 Task 14 — shared TaskMeta projection consumed by MethodologyRunner
// and GateEvaluator. Plan 8 Task 15 widens it with persistence-only fields
// (methodology_version, strictness_mode, started_at, …) and lands the
// concrete MetaMdStore that reads/writes meta.md frontmatter.
//
// All fields remain OPTIONAL on the interface itself: a fresh task has no
// meta.md on disk, in which case the store returns `{}` and the runner
// falls back to "start from first stage", "no counters", etc. The
// concrete `MetaMdStore` (Task 15) fills sensible defaults on every load.

import type { StrictnessMode, TaskComplexity } from './task';

/** Stage history entry — one row per stage entry/exit. */
export interface TaskMetaStageHistoryEntry {
  readonly stage_id: string;
  /** ISO 8601 timestamp the stage was entered. */
  readonly entered_at: string;
  /** ISO 8601 timestamp the stage completed (absent if still running). */
  readonly completed_at?: string;
  /**
   * If this entry was created by a rollback, the id of the stage we rolled
   * back FROM. Absent for normal forward traversal.
   */
  readonly rollback_from?: string;
}

/** Task lifecycle status. */
export type TaskMetaStatus = 'active' | 'paused' | 'completed' | 'failed';

/**
 * Full TaskMeta shape — persisted as YAML frontmatter inside
 * `<project>/.sherpa/tasks/<id>/meta.md` (see Plan 8 Task 15 — MetaMdStore).
 *
 * All fields are optional because the runner-facing API (`MetaMdStore.load`)
 * must tolerate a missing file: it returns `{}` for fresh tasks. The
 * concrete store fills defaults (`status='active'`, `counters={}`,
 * `started_at=now`) on first persist.
 */
export interface TaskMeta {
  readonly task_id?: string;
  readonly methodology_id?: string;
  readonly methodology_version?: string;
  readonly agent_mode?: string;
  readonly strictness_mode?: StrictnessMode;
  readonly complexity?: TaskComplexity;
  /** Stage id OR sentinel 'end' / 'pause_requested'. Absent for fresh tasks. */
  readonly current_stage?: string;
  readonly status?: TaskMetaStatus;
  /** ISO 8601 timestamp the task was first persisted. */
  readonly started_at?: string;
  /** ISO 8601 timestamp the task reached `completed` status. */
  readonly completed_at?: string;
  /** Numeric counters AND boolean flags share the same bag. */
  readonly counters?: Readonly<Record<string, number | boolean>>;
  readonly stage_history?: readonly TaskMetaStageHistoryEntry[];

  // ---- Optional fields used by GateEvaluator -------------------------------
  /** Free-form key/value bag — flows directly into ctx.meta for comparisons. */
  readonly fields?: Readonly<Record<string, unknown>>;
  /** Engine confidence after stage execution. */
  readonly confidence?: 'low' | 'medium' | 'high';
  /**
   * Re-cut counter (W0 returns). Convenience accessor — also derivable
   * from counters['recut_count'].
   */
  readonly recut_count?: number;
}

/**
 * Convenience constructor used by the concrete `MetaMdStore` (Task 15) to
 * synthesize a fresh meta when no file exists yet. Kept in the domain
 * layer so future stores share the same defaults.
 */
export function createDefaultTaskMeta(
  overrides: Partial<TaskMeta> = {},
): TaskMeta {
  return {
    status: 'active',
    counters: {},
    stage_history: [],
    started_at: new Date().toISOString(),
    ...overrides,
  };
}

/** Counter-mutation payload passed to `MetaMdStore.applyCounterMutations`. */
export interface CounterMutations {
  /** Names of counters to increment by 1. Unknown counters initialise to 0+1=1. */
  readonly incremented: readonly string[];
  /**
   * Names of counters to PRESERVE during this traversal. Semantic only for
   * rollback edges; non-rollback callers may pass an empty array.
   */
  readonly preserved: readonly string[];
}
