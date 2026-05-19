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
import type { PluginExecutor } from '../plugins/plugin_executor';
import type { ExternalGateEvaluator } from './external_gate_evaluator';

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

// ---------------------------------------------------------------------------
// Pending-gate state (in-memory, v1)
// ---------------------------------------------------------------------------
// Used by Mobile Web (Track D) and External Gate (Track C). The engine
// publishes a pending gate when a manual gate blocks; the resolver records
// the human's decision (pass / fail with reason). Persistence is deferred.
//
// This is intentionally minimal — a Map keyed by taskId holding an array of
// pending gates. Real engine integration lives in a later plan.

export interface PendingGate {
  readonly id: string;
  readonly stageId?: string;
  readonly description?: string;
  readonly createdAt: number;
}

export interface PendingGateResolution {
  readonly status: 'pass' | 'fail';
  readonly reason?: string;
}

export class GateEvaluator {
  constructor(
    private readonly fs: FileSystemPort,
    private readonly metaStore: MetaMdStore,
    private readonly reviewerOutcomes: ReviewerOutcomeStore,
    // Track C Plan 02 — optional pipeline plugin executor; dispatches
    // `on_gate_pass` / `on_gate_fail` after each evaluation.
    private readonly pluginExecutor: PluginExecutor | null = null,
    // Track C Plan 04 — optional evaluator for `gate.kind === 'external'`.
    // When unset, external gates fall back to a safe `block` verdict.
    private readonly externalEvaluator: ExternalGateEvaluator | null = null,
  ) {}

  async evaluate(stage: Stage, task: Task, projectPath: string): Promise<GateEvaluation> {
    if (!stage.gate) return { kind: 'no_gate' };

    // Track C Plan 04 — external gates short-circuit BEFORE building the
    // signal context: the evaluator awaits an inbound trigger and maps the
    // outcome directly to a GateEvaluation.
    if (stage.gate.kind === 'external') {
      if (!this.externalEvaluator) {
        return { kind: 'block', items: [], blocking_count: 1 };
      }
      const result = await this.externalEvaluator.waitForTrigger(stage.gate, {
        taskId: task.id,
        gateId: stage.id,
        workdir: projectPath,
      });
      // Still dispatch plugin hooks for parity with standard gates.
      if (this.pluginExecutor) {
        if (result.kind === 'pass') {
          await this.pluginExecutor.dispatch('on_gate_pass', {
            hook: 'on_gate_pass',
            task: { id: task.id, workdir: projectPath },
            gate: { id: stage.id, result: 'pass' },
            event: { source: 'external' },
            timestamp: Date.now(),
          });
        } else if (result.kind === 'block') {
          await this.pluginExecutor.dispatch('on_gate_fail', {
            hook: 'on_gate_fail',
            task: { id: task.id, workdir: projectPath },
            gate: { id: stage.id, result: 'fail', reason: 'external trigger blocked' },
            event: { source: 'external', blocking_count: result.blocking_count },
            timestamp: Date.now(),
          });
        }
      }
      return result;
    }

    const ctx = await this.buildContext(task, projectPath, stage);
    const strictness: StrictnessMode = task.strictness_mode ?? 'standard';
    const items: GateItemVerdict[] = [];
    let blocking = 0;

    for (const item of stage.gate.items) {
      const trace = computeGateItemVerdictWithReason(item, ctx, strictness);
      items.push({ id: item.id, verdict: trace.verdict, reason: trace.reason });
      if (isBlocking(item, trace.verdict)) blocking += 1;
    }

    const result: GateEvaluation =
      blocking === 0
        ? { kind: 'pass', items }
        : { kind: 'block', items, blocking_count: blocking };

    // Track C Plan 02 — plugin dispatch. kind === 'no_gate' was short-
    // circuited above, so we only need pass / block dispatches here.
    if (this.pluginExecutor) {
      if (result.kind === 'pass') {
        await this.pluginExecutor.dispatch('on_gate_pass', {
          hook: 'on_gate_pass',
          task: { id: task.id, workdir: projectPath },
          gate: { id: stage.id, result: 'pass' },
          event: {},
          timestamp: Date.now(),
        });
      } else if (result.kind === 'block') {
        await this.pluginExecutor.dispatch('on_gate_fail', {
          hook: 'on_gate_fail',
          task: { id: task.id, workdir: projectPath },
          gate: { id: stage.id, result: 'fail', reason: 'gate items blocking' },
          event: { blocking_count: result.blocking_count },
          timestamp: Date.now(),
        });
      }
    }

    return result;
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

  // -------------------------------------------------------------------------
  // Pending-gate state (in-memory, v1) — see header comment above the class.
  // -------------------------------------------------------------------------

  private readonly pendingByTask = new Map<string, PendingGate[]>();
  private readonly resolutions: Array<{ taskId: string; gateId: string; resolution: PendingGateResolution; at: number }> = [];

  /** Engine entrypoint — record that a gate is awaiting human approval. */
  setPending(taskId: string, gate: PendingGate): void {
    const list = this.pendingByTask.get(taskId) ?? [];
    if (!list.some(g => g.id === gate.id)) list.push(gate);
    this.pendingByTask.set(taskId, list);
  }

  /** Returns pending gates for a task (empty array if none). */
  async listPending(taskId: string): Promise<readonly PendingGate[]> {
    return this.pendingByTask.get(taskId) ?? [];
  }

  /**
   * Record a human resolution and remove the gate from the pending set.
   * Returns `true` if a matching pending gate was found and resolved,
   * `false` if no pending gate matched (taskId unknown or gateId not in list).
   * Callers should map `false` to a 404-style response.
   */
  async resolvePending(taskId: string, gateId: string, resolution: PendingGateResolution): Promise<boolean> {
    const list = this.pendingByTask.get(taskId);
    if (!list || !list.some(g => g.id === gateId)) return false;
    const next = list.filter(g => g.id !== gateId);
    if (next.length === 0) this.pendingByTask.delete(taskId);
    else this.pendingByTask.set(taskId, next);
    this.resolutions.push({ taskId, gateId, resolution, at: Date.now() });
    return true;
  }

  /** Test/debug — read recorded resolutions. */
  getResolutions(): ReadonlyArray<{ taskId: string; gateId: string; resolution: PendingGateResolution; at: number }> {
    return this.resolutions;
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
