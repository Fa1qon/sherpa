// src/main/services/stage_runner.ts
// Plan 8 Task 13 — StageRunner.
//
// Drives a single stage end-to-end:
//   1. trace stage_entered
//   2. run preflight checks (each routes per its on_fail)
//   3. load input artifacts from disk
//   4. assemble system prompt via SystemPromptAssembler
//   5. open adapter session, then loop:
//        send user input → awaitTurn → evaluate gate
//        - pass               → completed
//        - block (hard fail)  → failed
//        - block (askable)    → continue with summary prompt (autonomy
//                                surfaces ask-to-user later in Task 19)
//   6. on MAX_TURNS_PER_STAGE → failed
//
// Loose inline interfaces are declared for TraceLogger / ArtifactStore;
// Plan 8 Tasks 15-16 will replace them with concrete ports without
// breaking this file's surface.
//
// Strict TS; no IPC; no runtime deps.

import path from 'node:path';
import { promises as fsp } from 'node:fs';

import type {
  Methodology,
  Stage,
  PreflightCheck,
  GateItem,
} from '../../core/domain/methodology';
import type { Task, StrictnessMode } from '../../core/domain/task';
import type { AgentPort, AgentSession } from '../../core/ports/agent_port';
import {
  SystemPromptAssembler,
} from './system_prompt_assembler';
import {
  GateEvaluator,
  type GateEvaluation,
  type GateItemVerdict,
  type MetaMdStore,
} from './gate_evaluator';
import { parseConditionExpr } from '../../core/domain/condition_expr';
import { evaluateConditionExpr, type EvaluatorContext } from '../../core/domain/condition_expr_evaluator';
import type { EventBus } from './event_bus';
import type { PluginExecutor } from '../plugins/plugin_executor';

// ---------------------------------------------------------------------------
// Inline ports (filled by later tasks).
// ---------------------------------------------------------------------------

/**
 * Minimal trace event surface. Task 16 will tighten this into a proper
 * discriminated union; for now keep loose to avoid blocking other tasks.
 */
export type TraceEvent = { kind: string; [k: string]: unknown };

export interface TraceLogger {
  event(e: TraceEvent): Promise<void>;
}

/**
 * Minimal artifact-store surface. Task 15 fills concrete methods.
 * Optional `writeArtifact` is exposed so callers can plumb today
 * without an adapter once Task 15 lands.
 */
export interface ArtifactStore {
  writeArtifact?(path: string, content: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export const MAX_TURNS_PER_STAGE = 5;

export type StageResult =
  | { readonly kind: 'completed'; readonly stageId: string; readonly turns: number }
  | { readonly kind: 'rollback'; readonly toStage: string }
  | { readonly kind: 'failed'; readonly reason: string };

type BlockHandling =
  | { readonly kind: 'continue'; readonly continuePrompt: string }
  | { readonly kind: 'done' }
  | { readonly kind: 'rollback'; readonly toStage: string }
  | { readonly kind: 'fail'; readonly reason: string };

type PreflightOutcome =
  | { readonly kind: 'ok' }
  | { readonly kind: 'rollback'; readonly toStage: string }
  | { readonly kind: 'fail'; readonly reason: string };

// ---------------------------------------------------------------------------
// StageRunner
// ---------------------------------------------------------------------------

export class StageRunner {
  constructor(
    private readonly assembler: SystemPromptAssembler,
    private readonly adapter: AgentPort,
    private readonly evaluator: GateEvaluator,
    private readonly traceLogger: TraceLogger,
    // metaStore / artifactStore are wired here so future stages
    // (Task 15/16) can call them without changing the runner's surface.
    private readonly _metaStore: MetaMdStore,
    private readonly _artifactStore: ArtifactStore,
    // Plan 02 — optional EventBus for SDK subscribers (stage.* + gate.*).
    private readonly bus: EventBus | null = null,
    // Track C Plan 02 — optional pipeline plugin executor; dispatches
    // `on_stage_start` / `on_stage_complete` alongside EventBus emits.
    private readonly pluginExecutor: PluginExecutor | null = null,
  ) {}

  async runStage(
    stage: Stage,
    methodology: Methodology,
    task: Task,
    projectPath: string,
    onEvent?: (e: TraceEvent) => void,
  ): Promise<StageResult> {
    // NOTE (Plan 8-fix Task 2): tool_call / artifact_written forwarding via
    // onEvent will land once StageRunner is wired to ArtifactStore + adapter
    // tool stream (Plan 8a). Today the runner only emits trace events for
    // stage / preflight / gate transitions — those are the events we forward.
    await this.emitEvent(onEvent, { kind: 'stage_entered', stageId: stage.id, ts: now() });
    this.bus?.emit({
      type: 'stage.started',
      ts: Date.now(),
      taskId: task.id,
      stageId: stage.id,
    });
    await this.pluginExecutor?.dispatch('on_stage_start', {
      hook: 'on_stage_start',
      task: { id: task.id, workdir: projectPath, methodologyId: methodology.id },
      stage: { id: stage.id },
      event: {},
      timestamp: Date.now(),
    });

    // --- Preflight -------------------------------------------------------
    for (const pf of stage.preflight ?? []) {
      const outcome = await this.checkPreflight(pf, projectPath, onEvent);
      if (outcome.kind !== 'ok') {
        await this.emitEvent(onEvent, {
          kind: 'preflight_failed',
          stageId: stage.id,
          checkId: pf.id,
          onFail: pf.on_fail,
        });
        if (outcome.kind === 'rollback') {
          return { kind: 'rollback', toStage: outcome.toStage };
        }
        return { kind: 'failed', reason: outcome.reason };
      }
    }

    // --- Assemble prompt -------------------------------------------------
    const inputArtifacts = await this.loadInputArtifacts(stage, projectPath);
    const assembled = await this.assembler.assemble({
      methodology,
      stage,
      task,
      projectPath,
      inputArtifacts,
    });

    // --- Open session ----------------------------------------------------
    const session: AgentSession = await this.adapter.startSession({
      cwd: projectPath,
      systemPrompt: assembled.systemPrompt,
      mode: 'worker',
    });

    const strictness: StrictnessMode = task.strictness_mode ?? 'standard';
    let userInput = this.initialPromptForStage(stage);
    let turns = 0;

    try {
      while (turns < MAX_TURNS_PER_STAGE) {
        await session.send(userInput);
        await session.awaitTurn();
        turns += 1;

        const evaluation = await this.evaluator.evaluate(stage, task, projectPath);
        await this.emitEvent(onEvent, {
          kind: 'gate_evaluated',
          stageId: stage.id,
          turn: turns,
          evaluation,
        });
        // Plan 02 — typed gate.evaluated event.
        if (stage.gate) {
          this.bus?.emit({
            type: 'gate.evaluated',
            ts: Date.now(),
            taskId: task.id,
            gateId: stage.id,
            result:
              evaluation.kind === 'pass' || evaluation.kind === 'no_gate'
                ? 'pass'
                : 'fail',
          });
        }

        if (evaluation.kind === 'pass' || evaluation.kind === 'no_gate') {
          await this.emitEvent(onEvent, {
            kind: 'stage_completed',
            stageId: stage.id,
            turns,
          });
          this.bus?.emit({
            type: 'stage.completed',
            ts: Date.now(),
            taskId: task.id,
            stageId: stage.id,
            status: 'success',
          });
          await this.pluginExecutor?.dispatch('on_stage_complete', {
            hook: 'on_stage_complete',
            task: { id: task.id, workdir: projectPath, methodologyId: methodology.id },
            stage: { id: stage.id, status: 'success' },
            event: {},
            timestamp: Date.now(),
          });
          return { kind: 'completed', stageId: stage.id, turns };
        }

        // Block — decide what to do next.
        const next = this.handleBlock(evaluation, stage, strictness);
        if (next.kind === 'done') {
          await this.emitEvent(onEvent, { kind: 'stage_completed', stageId: stage.id, turns });
          this.bus?.emit({
            type: 'stage.completed',
            ts: Date.now(),
            taskId: task.id,
            stageId: stage.id,
            status: 'success',
          });
          await this.pluginExecutor?.dispatch('on_stage_complete', {
            hook: 'on_stage_complete',
            task: { id: task.id, workdir: projectPath, methodologyId: methodology.id },
            stage: { id: stage.id, status: 'success' },
            event: {},
            timestamp: Date.now(),
          });
          return { kind: 'completed', stageId: stage.id, turns };
        }
        if (next.kind === 'rollback') {
          await this.emitEvent(onEvent, {
            kind: 'stage_rolled_back',
            stageId: stage.id,
            toStage: next.toStage,
            turns,
          });
          return { kind: 'rollback', toStage: next.toStage };
        }
        if (next.kind === 'fail') {
          await this.emitEvent(onEvent, {
            kind: 'stage_failed',
            stageId: stage.id,
            reason: next.reason,
            turns,
          });
          this.bus?.emit({
            type: 'stage.completed',
            ts: Date.now(),
            taskId: task.id,
            stageId: stage.id,
            status: 'failed',
          });
          await this.pluginExecutor?.dispatch('on_stage_complete', {
            hook: 'on_stage_complete',
            task: { id: task.id, workdir: projectPath, methodologyId: methodology.id },
            stage: { id: stage.id, status: 'failed' },
            event: { reason: next.reason },
            timestamp: Date.now(),
          });
          return { kind: 'failed', reason: next.reason };
        }
        // continue
        userInput = next.continuePrompt;
      }
    } finally {
      // Always close session — even on early returns / throw.
      await safeClose(session);
    }

    await this.emitEvent(onEvent, {
      kind: 'stage_failed',
      stageId: stage.id,
      reason: 'max turns exceeded',
      turns,
    });
    this.bus?.emit({
      type: 'stage.completed',
      ts: Date.now(),
      taskId: task.id,
      stageId: stage.id,
      status: 'failed',
    });
    await this.pluginExecutor?.dispatch('on_stage_complete', {
      hook: 'on_stage_complete',
      task: { id: task.id, workdir: projectPath, methodologyId: methodology.id },
      stage: { id: stage.id, status: 'failed' },
      event: { reason: 'max turns exceeded' },
      timestamp: Date.now(),
    });
    return { kind: 'failed', reason: 'max turns exceeded' };
  }

  /**
   * Forward a trace event to BOTH the persistent trace log and (if provided)
   * an in-process callback subscriber. The callback is invoked AFTER the
   * trace write so subscribers never observe an event that hasn't been
   * persisted.
   */
  private async emitEvent(
    onEvent: ((e: TraceEvent) => void) | undefined,
    e: TraceEvent,
  ): Promise<void> {
    await this.traceLogger.event(e);
    onEvent?.(e);
  }

  // -------------------------------------------------------------------------
  // Preflight
  // -------------------------------------------------------------------------

  private async checkPreflight(
    pf: PreflightCheck,
    projectPath: string,
    onEvent?: (e: TraceEvent) => void,
  ): Promise<PreflightOutcome> {
    const artifactPath = pf.input_artifact.artifact;
    const absPath = path.isAbsolute(artifactPath)
      ? artifactPath
      : path.join(projectPath, artifactPath);

    let content: string | undefined;
    try {
      content = await fsp.readFile(absPath, 'utf8');
    } catch {
      content = undefined;
    }

    const passed = content === undefined
      ? false
      : runPreflightContentChecks(pf, content);

    if (passed) return { kind: 'ok' };

    // Failed — route per pf.on_fail.
    if (pf.on_fail === 'fail') {
      return { kind: 'fail', reason: `preflight ${pf.id} failed` };
    }
    if (pf.on_fail === 'rollback' || pf.on_fail === 'ask') {
      // 'ask' is treated as rollback until Task 19 wires a user-surface.
      if (pf.on_fail === 'ask') {
        await this.emitEvent(onEvent, {
          kind: 'preflight_ask_deferred_as_rollback',
          checkId: pf.id,
        });
      }
      return { kind: 'rollback', toStage: pf.input_artifact.stage };
    }
    // Exhaustive fallback (should be unreachable given PREFLIGHT_ON_FAIL_VALUES).
    return { kind: 'fail', reason: `preflight ${pf.id} failed (unknown on_fail)` };
  }

  // -------------------------------------------------------------------------
  // Input artifact loading
  // -------------------------------------------------------------------------

  private async loadInputArtifacts(
    stage: Stage,
    projectPath: string,
  ): Promise<ReadonlyMap<string, string>> {
    const result = new Map<string, string>();
    for (const ref of stage.contract.input ?? []) {
      const abs = path.isAbsolute(ref.artifact)
        ? ref.artifact
        : path.join(projectPath, ref.artifact);
      try {
        const content = await fsp.readFile(abs, 'utf8');
        result.set(ref.artifact, content);
      } catch {
        // missing input artifact is tolerated; assembler simply won't
        // see it in the inputArtifacts map.
      }
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Prompts
  // -------------------------------------------------------------------------

  private initialPromptForStage(stage: Stage): string {
    if (stage.user_view_template && stage.user_view_template.trim().length > 0) {
      return stage.user_view_template;
    }
    return `Begin stage ${stage.id}.`;
  }

  // -------------------------------------------------------------------------
  // Block handling
  // -------------------------------------------------------------------------

  private handleBlock(
    evaluation: GateEvaluation,
    stage: Stage,
    strictness: StrictnessMode,
  ): BlockHandling {
    if (evaluation.kind !== 'block') {
      // Defensive — caller should have short-circuited on pass.
      return { kind: 'done' };
    }

    const gateItems = stage.gate?.items ?? ([] as readonly GateItem[]);
    const itemById = new Map(gateItems.map((it) => [it.id, it]));

    const hardFails = evaluation.items.filter((v) =>
      v.verdict === 'fail' && (itemById.get(v.id)?.hard_stop !== false),
    );
    if (hardFails.length > 0) {
      const reason = `hard_stop fail: ${hardFails.map((f) => f.id).join(', ')}`;
      return { kind: 'fail', reason };
    }

    if (strictness === 'autonomous') {
      // No hard fails — keep going.
      return { kind: 'continue', continuePrompt: continuePromptFor(evaluation.items) };
    }

    // Non-autonomous: 'ask' verdicts would normally surface to the user.
    // Without a UI surface yet (Task 19), continue with summary prompt
    // so the engine still drives the agent. Trace event makes this
    // visible for later wiring.
    return { kind: 'continue', continuePrompt: continuePromptFor(evaluation.items) };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

async function safeClose(session: AgentSession): Promise<void> {
  try {
    await session.close();
  } catch {
    // swallow — close is best-effort.
  }
}

function continuePromptFor(items: readonly GateItemVerdict[]): string {
  const blocking = items.filter((i) => i.verdict !== 'pass');
  if (blocking.length === 0) {
    return 'Continue with the stage. The gate is not yet fully satisfied.';
  }
  const lines = blocking.map((i) => `- ${i.id}: ${i.reason}`);
  return [
    'The gate is not yet satisfied. Address the following:',
    ...lines,
  ].join('\n');
}

/**
 * Run the content-level checks of a preflight (sections, regex, custom).
 * Returns true iff every declared check passes.
 *
 * If no content-level checks are declared, the mere existence of the
 * artifact (already verified by the caller) constitutes a pass.
 */
function runPreflightContentChecks(pf: PreflightCheck, content: string): boolean {
  // Section presence: every required `## Section` header must appear.
  if (pf.must_have_sections && pf.must_have_sections.length > 0) {
    for (const sec of pf.must_have_sections) {
      if (!hasMarkdownSection(content, sec)) return false;
    }
  }

  // Regex match.
  if (pf.must_match_pattern) {
    try {
      const re = new RegExp(pf.must_match_pattern);
      if (!re.test(content)) return false;
    } catch {
      // Malformed regex → preflight cannot prove success → fail safe.
      return false;
    }
  }

  // Custom ConditionExpr over a minimal artifact-context.
  if (pf.custom) {
    const ok = evalCustomExpr(pf.custom.expr, content);
    if (!ok) return false;
  }

  return true;
}

function hasMarkdownSection(content: string, name: string): boolean {
  // Match `## <name>` (any heading level) at line start, ignoring trailing
  // whitespace; case-sensitive (markdown convention).
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (m && m[1] === name) return true;
  }
  return false;
}

function evalCustomExpr(expr: string, content: string): boolean {
  const parsed = parseConditionExpr(expr);
  if (!parsed.ok) return false;
  const ctx: EvaluatorContext = {
    meta: {},
    signals: {
      artifacts: [],
      reviewers_passed: [],
      confidence: 'medium',
      scope_changed: false,
    },
    artifact: { __content: content },
  };
  const ev = evaluateConditionExpr(parsed.ast, ctx);
  return ev.ok && ev.value === true;
}

// ---------------------------------------------------------------------------
// (Internal) re-exports for tests/integration sites that want the union
// names without reaching into gate_evaluator.
// ---------------------------------------------------------------------------
export type { GateEvaluation } from './gate_evaluator';
