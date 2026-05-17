// src/main/services/gate_evaluator.ts
// Plan 8 Task 12 — engine-grade GateEvaluator.
//
// Promotes the Plan 7 stub gate verdict logic (live-simulation panel) to
// run against REAL signal sources: filesystem (artifacts on disk),
// meta.md (counters, recut count, confidence), reviewer outcomes (which
// reviewers returned PASS). The per-item verdict rule itself is shared
// with the simulation panel via `core/domain/gate_item_verdict.ts` —
// only the EvaluatorContext construction differs.
//
// Ports declared inline (minimal interfaces). Concrete implementations
// land in later tasks:
//   - MetaMdStore       → Plan 8 Task 15
//   - ReviewerOutcomeStore → future plan
//   - FileSystemPort    → trivial adapter over node:fs (engine wiring)
//
// Strict types; no runtime deps; no IPC; pure-ish (deterministic given
// port outputs).

import type { Stage, GateItem } from '../../core/domain/methodology';
import type { Task, StrictnessMode } from '../../core/domain/task';
import type { EvaluatorContext } from '../../core/domain/condition_expr_evaluator';
import {
  computeGateItemVerdictWithReason,
  type Verdict,
} from '../../core/domain/gate_item_verdict';
import type { TaskMeta, CounterMutations } from '../../core/domain/task_meta';

// Re-export so existing import sites (`from './gate_evaluator'`) keep working
// after the shape moved into `core/domain/task_meta.ts` (Plan 8 Task 14).
export type { TaskMeta, CounterMutations } from '../../core/domain/task_meta';

// ---------------------------------------------------------------------------
// Ports (minimal inline interfaces; concrete adapters wired by engine setup)
// ---------------------------------------------------------------------------

/**
 * Minimal filesystem abstraction used by GateEvaluator to discover which
 * artifacts a task has produced on disk.
 *
 * Decoupled from `core/ports/files_port.ts` (which is project-scoped and
 * directory-listing oriented) because the engine version needs flat
 * recursive enumeration under a task root.
 */
export interface FileSystemPort {
  /**
   * Returns paths (posix-style, relative to `rootAbs`) of all regular files
   * under `rootAbs`, recursively. Returns `[]` if root does not exist.
   */
  listFilesRecursive(rootAbs: string): Promise<readonly string[]>;
}

/**
 * Per-task meta.md store. `load` is required (Plan 8 Task 12 — gate eval);
 * the mutator methods are optional here so existing call sites compile, but
 * are REQUIRED in practice for the MethodologyRunner (Plan 8 Task 14).
 * Plan 8 Task 15 will land the concrete adapter that implements all five.
 */
export interface MetaMdStore {
  /** Returns an empty `TaskMeta` if no meta file exists yet. */
  load(projectPath: string, taskId: string): Promise<TaskMeta>;
  /** Record that a stage just completed (appends to stage_history). */
  markStageCompleted?(projectPath: string, taskId: string, stageId: string): Promise<void>;
  /** Record a rollback edge traversal (appends a stage_history entry with rollback_from). */
  recordRollback?(projectPath: string, taskId: string, fromStage: string, toStage: string): Promise<void>;
  /**
   * Apply counter mutations from an edge traversal. Implementations should
   * increment listed counters by 1 (initialising missing keys to 1), and
   * MAY use `preserved` to skip reset semantics on rollback edges.
   */
  applyCounterMutations?(projectPath: string, taskId: string, mutations: CounterMutations): Promise<void>;
  /** Persist the runner's current stage cursor. */
  setCurrentStage?(projectPath: string, taskId: string, stageId: string): Promise<void>;
  /** Persist that the task was cooperatively paused (Plan 8-fix Task 2). */
  markPaused?(projectPath: string, taskId: string): Promise<void>;
}

export interface ReviewerOutcomeStore {
  /** Reviewer ids that returned PASS for this task (across the current stage's reviewers). */
  getPassedReviewers(projectPath: string, taskId: string): Promise<readonly string[]>;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface GateItemVerdict {
  readonly id: string;
  readonly verdict: Verdict;
  readonly reason: string;
}

export type GateEvaluation =
  | { readonly kind: 'no_gate' }
  | { readonly kind: 'pass'; readonly items: readonly GateItemVerdict[] }
  | { readonly kind: 'block'; readonly items: readonly GateItemVerdict[]; readonly blocking_count: number };

// ---------------------------------------------------------------------------
// GateEvaluator
// ---------------------------------------------------------------------------

export class GateEvaluator {
  constructor(
    private readonly fs: FileSystemPort,
    private readonly metaStore: MetaMdStore,
    private readonly reviewerOutcomes: ReviewerOutcomeStore,
  ) {}

  async evaluate(stage: Stage, task: Task, projectPath: string): Promise<GateEvaluation> {
    if (!stage.gate) return { kind: 'no_gate' };

    const ctx = await this.buildContext(task, projectPath, stage);
    const strictness: StrictnessMode = task.strictness_mode ?? 'standard';
    const items: GateItemVerdict[] = [];
    let blocking = 0;

    for (const item of stage.gate.items) {
      const trace = computeGateItemVerdictWithReason(item, ctx, strictness);
      items.push({ id: item.id, verdict: trace.verdict, reason: trace.reason });
      if (isBlocking(item, trace.verdict)) blocking += 1;
    }

    if (blocking === 0) {
      return { kind: 'pass', items };
    }
    return { kind: 'block', items, blocking_count: blocking };
  }

  /**
   * Build a real EvaluatorContext from filesystem + meta + reviewer outcomes.
   * Pure projection layer — no business rules. Same shape as the stub
   * context used by the simulation panel; only the construction differs.
   */
  private async buildContext(
    task: Task,
    projectPath: string,
    _stage: Stage,
  ): Promise<EvaluatorContext> {
    const taskRoot = `${projectPath}/.sherpa/tasks/${task.id}`;
    const [files, meta, passed] = await Promise.all([
      this.fs.listFilesRecursive(taskRoot).catch(() => [] as readonly string[]),
      this.metaStore.load(projectPath, task.id),
      this.reviewerOutcomes.getPassedReviewers(projectPath, task.id),
    ]);

    const recutCount =
      meta.recut_count ??
      (typeof meta.counters?.['recut_count'] === 'number' ? meta.counters['recut_count']! : 0);

    return {
      meta: meta.fields ?? {},
      signals: {
        artifacts: files,
        reviewers_passed: passed,
        confidence: meta.confidence ?? 'medium',
        scope_changed: recutCount > 0,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBlocking(item: GateItem, verdict: Verdict): boolean {
  if (verdict === 'fail') return true;
  if (verdict === 'ask' && item.hard_stop === true) return true;
  return false;
}
