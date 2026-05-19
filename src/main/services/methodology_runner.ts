// src/main/services/methodology_runner.ts
// Plan 8 Task 14 — MethodologyRunner.
//
// Orchestrates a single task end-to-end by walking the methodology's edge
// graph. For each iteration:
//   1. resolve current stage from meta.md (resume) or from the 'start' edge
//   2. honour stage-level mode gating (active_in_modes)
//   3. delegate stage execution to StageRunner
//   4. on completion  → mark stage completed; pick next stage via outgoing edges
//   5. on rollback    → record rollback; jump to result.toStage
//   6. on failure     → bubble up as TaskRunResult.failed
//
// Edge selection rules (see pickNextStage):
//   - 'always'      → fallback (only when no other satisfiable edge matches)
//   - 'gate-pass'   → matches after a successful stage
//   - 'branch'      → evaluate ConditionExpr against EvaluatorContext built
//                     from MetaMdStore; pick first matching
//   - 'gate-fail'   → skip here (handled internally by StageRunner)
//   - 'rollback'    → skip here (StageResult.rollback short-circuits selection)
//   - 'recut'       → skip here (treated like rollback — surfaced via
//                     StageResult.rollback by the underlying stage runner)
// Among satisfiable edges, 'branch' > 'gate-pass' > 'always' (specific > fallback).
//
// Counter mutations declared on the chosen edge are applied via
// MetaMdStore.applyCounterMutations BEFORE the runner advances.
//
// Strict types; no IPC; no runtime deps.

import { EventEmitter } from 'node:events';

import type { Methodology, Edge } from '../../core/domain/methodology';
import type { Task } from '../../core/domain/task';
import type { TaskMeta } from '../../core/domain/task_meta';
import type { StageRunner, StageResult, TraceLogger, TraceEvent } from './stage_runner';
import type { MetaMdStore } from './gate_evaluator';
import type { PluginExecutor } from '../plugins/plugin_executor';
import { parseConditionExpr } from '../../core/domain/condition_expr';
import {
  evaluateConditionExpr,
  type EvaluatorContext,
} from '../../core/domain/condition_expr_evaluator';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TaskRunResult =
  | { readonly kind: 'completed' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'paused' };

/** Sentinel stage id meaning "the task is done; exit the loop". */
export const END_STAGE_ID = 'end';

/** Sentinel stage id understood as "the runner starts here". */
export const START_STAGE_ID = 'start';

// ---------------------------------------------------------------------------
// MethodologyRunner
// ---------------------------------------------------------------------------

export class MethodologyRunner extends EventEmitter {
  private pauseRequested = false;
  private cancelRequested = false;

  constructor(
    private readonly stageRunner: StageRunner,
    private readonly metaStore: MetaMdStore,
    private readonly traceLogger: TraceLogger,
    // Track C Plan 02 — optional pipeline plugin executor. Refreshed with
    // the active methodology's plugin manifest at the start of each run.
    private readonly pluginExecutor: PluginExecutor | null = null,
  ) {
    super();
  }

  /**
   * Cooperative pause request. Honoured at the next stage boundary
   * (between stages — finer-grained mid-stage pause is deferred).
   * When honoured, run() resolves with `{kind: 'paused'}` after emitting
   * `task_paused` on both the EventEmitter and the trace log.
   */
  requestPause(): void {
    this.pauseRequested = true;
  }

  /**
   * Cooperative cancel request. Honoured at the next stage boundary; the
   * run resolves with `{kind: 'failed', reason: 'cancelled'}`. Cancel
   * takes precedence over pause when both are requested.
   */
  requestCancel(): void {
    this.cancelRequested = true;
  }

  async run(
    methodology: Methodology,
    task: Task,
    projectPath: string,
  ): Promise<TaskRunResult> {
    try {
      return await this.runInner(methodology, task, projectPath);
    } finally {
      // Reset cooperative flags AFTER each run() so a runner instance is
      // reusable across pause/cancel. Resetting BEFORE would wipe requests
      // made between construction and the first run() call.
      this.pauseRequested = false;
      this.cancelRequested = false;
    }
  }

  private async runInner(
    methodology: Methodology,
    task: Task,
    projectPath: string,
  ): Promise<TaskRunResult> {
    // Track C Plan 02 — load this methodology's plugin manifest into the
    // executor so hook dispatches from StageRunner / GateEvaluator /
    // ArtifactStore / TaskSupervisor see the right plugins.
    this.pluginExecutor?.setPlugins([...(methodology.plugins ?? [])]);

    const meta = await this.metaStore.load(projectPath, task.id);
    let currentStageId: string = meta.current_stage ?? this.firstStageId(methodology);

    await this.event({
      kind: 'task_started',
      methodologyId: methodology.id,
      taskId: task.id,
      stageId: currentStageId,
    });

    // Hard cap on outer iterations so a malformed methodology can never spin.
    // The cap is generous (10x stage count) to allow legitimate rollback loops.
    const maxIterations = Math.max(64, methodology.stages.length * 10);
    let iter = 0;

    while (currentStageId !== END_STAGE_ID) {
      // --- Cooperative cancel / pause checkpoints (between stages) -----
      if (this.cancelRequested) {
        const reason = 'cancelled';
        await this.event({ kind: 'task_failed', reason, stageId: currentStageId });
        return { kind: 'failed', reason };
      }
      if (this.pauseRequested) {
        await this.metaStore.markPaused?.(projectPath, task.id);
        await this.event({ kind: 'task_paused', ts: nowIso() });
        return { kind: 'paused' };
      }

      iter += 1;
      if (iter > maxIterations) {
        const reason = `max iterations exceeded (${maxIterations}) — likely infinite edge loop`;
        await this.event({ kind: 'task_failed', reason });
        return { kind: 'failed', reason };
      }

      const stage = methodology.stages.find((s) => s.id === currentStageId);
      if (!stage) {
        const reason = `unknown stage ${currentStageId}`;
        await this.event({ kind: 'task_failed', reason });
        return { kind: 'failed', reason };
      }

      // --- Mode gating --------------------------------------------------
      if (
        stage.active_in_modes &&
        stage.active_in_modes.length > 0 &&
        task.agent_mode &&
        !stage.active_in_modes.includes(task.agent_mode)
      ) {
        await this.event({
          kind: 'stage_skipped_by_mode',
          stageId: stage.id,
          mode: task.agent_mode,
        });
        currentStageId = await this.pickNextStage(
          currentStageId,
          methodology,
          task,
          projectPath,
        );
        continue;
      }

      // --- Run stage ----------------------------------------------------
      const result: StageResult = await this.stageRunner.runStage(
        stage,
        methodology,
        task,
        projectPath,
        (e: TraceEvent) => this.emit('event', e),
      );

      if (result.kind === 'completed') {
        await this.metaStore.markStageCompleted?.(projectPath, task.id, stage.id);
        const next = await this.pickNextStage(
          currentStageId,
          methodology,
          task,
          projectPath,
        );
        await this.metaStore.setCurrentStage?.(projectPath, task.id, next);
        currentStageId = next;
        continue;
      }

      if (result.kind === 'rollback') {
        await this.metaStore.recordRollback?.(
          projectPath,
          task.id,
          stage.id,
          result.toStage,
        );
        // The rollback edge itself (if declared) carries any counter
        // mutations; apply them now so the rolled-back stage sees them.
        const rollbackEdge = this.findRollbackEdge(currentStageId, result.toStage, methodology);
        if (rollbackEdge) {
          await this.applyEdgeCounters(rollbackEdge, projectPath, task.id);
          await this.event({
            kind: 'edge_traversed',
            from: rollbackEdge.from,
            to: rollbackEdge.to,
            condition: rollbackEdge.condition.kind,
          });
        }
        await this.metaStore.setCurrentStage?.(projectPath, task.id, result.toStage);
        currentStageId = result.toStage;
        continue;
      }

      // result.kind === 'failed'
      await this.event({
        kind: 'task_failed',
        reason: result.reason,
        stageId: stage.id,
      });
      return { kind: 'failed', reason: result.reason };
    }

    await this.event({ kind: 'task_completed' });
    return { kind: 'completed' };
  }

  /**
   * Mirror a trace event onto BOTH the persistent log AND the in-process
   * EventEmitter. Subscribers (UI supervisor) get the same event the trace
   * file gets, in the same order.
   */
  private async event(e: TraceEvent): Promise<void> {
    await this.traceLogger.event(e);
    this.emit('event', e);
  }

  // -------------------------------------------------------------------------
  // Edge graph helpers
  // -------------------------------------------------------------------------

  /**
   * The "entry point" stage: follow the special `from === 'start'` edge,
   * or fall back to the first declared stage. Empty methodology → END.
   */
  private firstStageId(methodology: Methodology): string {
    const startEdge = methodology.edges.find((e) => e.from === START_STAGE_ID);
    if (startEdge) return startEdge.to;
    if (methodology.stages.length > 0) return methodology.stages[0]!.id;
    return END_STAGE_ID;
  }

  /**
   * Resolve the next stage id given outgoing edges from `fromStageId`.
   * Returns 'end' when no edge is satisfiable.
   */
  private async pickNextStage(
    fromStageId: string,
    methodology: Methodology,
    task: Task,
    projectPath: string,
  ): Promise<string> {
    const outgoing = methodology.edges.filter((e) => e.from === fromStageId);
    if (outgoing.length === 0) return END_STAGE_ID;

    // Build the evaluator context once — branch exprs all share it.
    const ctx = await this.buildEvaluatorContext(task, projectPath);

    // Walk outgoing edges in declaration order, classifying each.
    let branchPick: Edge | undefined;
    let gatePassPick: Edge | undefined;
    let alwaysPick: Edge | undefined;

    for (const edge of outgoing) {
      const cond = edge.condition.kind;

      // Rollback / recut / gate-fail are NOT next-stage candidates here.
      // (Rollback paths come via StageResult.rollback; gate-fail loops are
      //  handled internally by StageRunner.)
      if (cond === 'rollback' || cond === 'recut' || cond === 'gate-fail') {
        continue;
      }

      if (cond === 'branch') {
        if (branchPick !== undefined) continue; // first branch match wins
        const expr = (edge.condition as { kind: 'branch'; expr: string }).expr;
        if (this.evalBranch(expr, ctx)) {
          branchPick = edge;
        }
        continue;
      }

      if (cond === 'gate-pass') {
        if (gatePassPick === undefined) gatePassPick = edge;
        continue;
      }

      if (cond === 'always') {
        if (alwaysPick === undefined) alwaysPick = edge;
        continue;
      }
    }

    const picked: Edge | undefined = branchPick ?? gatePassPick ?? alwaysPick;
    if (!picked) return END_STAGE_ID;

    // Apply counter mutations declared on the traversed edge.
    await this.applyEdgeCounters(picked, projectPath, task.id);

    await this.event({
      kind: 'edge_traversed',
      from: picked.from,
      to: picked.to,
      condition: picked.condition.kind,
    });

    return picked.to;
  }

  /** Locate the rollback/recut edge from→to (if any), for counter mutations. */
  private findRollbackEdge(
    from: string,
    to: string,
    methodology: Methodology,
  ): Edge | undefined {
    return methodology.edges.find(
      (e) =>
        e.from === from &&
        e.to === to &&
        (e.condition.kind === 'rollback' || e.condition.kind === 'recut'),
    );
  }

  /** Apply edge counter mutations via the meta store (if declared). */
  private async applyEdgeCounters(
    edge: Edge,
    projectPath: string,
    taskId: string,
  ): Promise<void> {
    const incremented = edge.increment_counters_on_traverse ?? [];
    const preserved = edge.preserve_counters_on_traverse ?? [];
    if (incremented.length === 0 && preserved.length === 0) return;
    await this.metaStore.applyCounterMutations?.(projectPath, taskId, {
      incremented,
      preserved,
    });
  }

  /**
   * Evaluate a branch-edge ConditionExpr. Parse failures and runtime
   * evaluation errors degrade to `false` (edge does not match) — the
   * evaluator is purposely conservative for non-gate branch selection.
   */
  private evalBranch(expr: string, ctx: EvaluatorContext): boolean {
    const parsed = parseConditionExpr(expr);
    if (!parsed.ok) return false;
    const ev = evaluateConditionExpr(parsed.ast, ctx);
    return ev.ok && ev.value === true;
  }

  /**
   * Build the EvaluatorContext from the latest meta.md projection.
   * The runner does not have FS / reviewer-outcome stores wired in directly
   * (those belong to the GateEvaluator's gate-item rule path); branch edges
   * therefore see signals.artifacts = []  and signals.reviewers_passed = [].
   * Methodology authors who need full signal access on branch edges can
   * encode the same predicates inside a `gate` item instead.
   */
  private async buildEvaluatorContext(
    task: Task,
    projectPath: string,
  ): Promise<EvaluatorContext> {
    const meta: TaskMeta = await this.metaStore.load(projectPath, task.id);
    const recutCount =
      meta.recut_count ??
      (typeof meta.counters?.['recut_count'] === 'number'
        ? (meta.counters['recut_count'] as number)
        : 0);
    return {
      meta: meta.fields ?? {},
      signals: {
        artifacts: [],
        reviewers_passed: [],
        confidence: meta.confidence ?? 'medium',
        scope_changed: recutCount > 0,
      },
    };
  }
}

function nowIso(): string {
  return new Date().toISOString();
}
