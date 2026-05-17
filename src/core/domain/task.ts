import type { AgentMessage } from './agent';

/**
 * Permissive trace-event shape mirrored from
 * `src/main/services/trace_logger.ts` (LooseTraceEvent). Re-declared in
 * core to avoid a core → main import for the TaskEventPayload union.
 * Engine events flow renderer-ward through the TASK_EVENT IPC channel
 * wrapped as `{kind:'engine_event', event}` envelopes.
 */
export type EngineTraceEventLike = {
  readonly kind: string;
  readonly [field: string]: unknown;
};

/**
 * Renderer-facing mirror of `GateItemVerdict` from
 * `src/main/services/gate_evaluator.ts`. Declared in core so the renderer
 * doesn't import the main-process module (which transitively pulls
 * node:fs). Verdict literal kept as the same string union.
 */
export interface GateItemVerdictLike {
  readonly id: string;
  readonly verdict: 'pass' | 'ask' | 'fail';
  readonly reason: string;
}

/**
 * Renderer-facing mirror of `GateEvaluation` from
 * `src/main/services/gate_evaluator.ts`. Discriminated by `kind`.
 */
export type GateEvaluationLike =
  | { readonly kind: 'no_gate' }
  | { readonly kind: 'pass'; readonly items: readonly GateItemVerdictLike[] }
  | { readonly kind: 'block'; readonly items: readonly GateItemVerdictLike[]; readonly blocking_count: number };

export type TaskStatus = 'created' | 'running' | 'waiting-user' | 'paused' | 'closed';

export type StrictnessMode = 'autonomous' | 'standard' | 'careful' | 'verify_only';

// Plan 8b Task 7 — new task flow.
// effort selects the underlying model (fast=Haiku / normal=Sonnet /
// thorough=Opus) when the adapter maps it to a `--model` flag.
export type EffortLevel = 'fast' | 'normal' | 'thorough';
// response_mode is a soft hint to the worker prompt (concise vs detailed).
export type ResponseMode = 'concise' | 'detailed';
// economy_mode toggles the adapter's `--max-budget-usd` ceiling.
export type EconomyMode = 'unlimited' | 'budget';
// methodology_selection_mode encodes the "free chat / router / manual"
// switch surfaced by TaskSettingsPanel. 'none' = free chat (no engine
// bootstrap). 'router' is a placeholder until Plan 12. 'manual' = the
// engine bootstraps against task.methodologyId.
export type MethodologySelectionMode = 'none' | 'router' | 'manual';

/**
 * Task complexity buckets used by methodologies to scope per-stage
 * artifact templates / system-prompt addenda (`Stage.scope_by_complexity`).
 * Values are deliberately opaque labels (C1..C4); semantics are owned by
 * the methodology author.
 */
export const TASK_COMPLEXITIES = ['C1', 'C2', 'C3', 'C4'] as const;
export type TaskComplexity = (typeof TASK_COMPLEXITIES)[number];

/** Discriminated union of events emitted on the task.event IPC channel. */
export type TaskEventPayload =
  | { taskId: string; kind: 'started'; message: AgentMessage }
  | { taskId: string; kind: 'message'; message: AgentMessage }
  | { taskId: string; kind: 'done'; task: Task }
  | { taskId: string; kind: 'error'; message: string }
  // Plan 8-fix Task 1 — engine trace events forwarded from MethodologyRunner
  // via the TaskSupervisor. The renderer subscribes to a single TASK_EVENT
  // stream; engine_event envelopes wrap any trace-event shape.
  | { taskId: string; kind: 'engine_event'; event: EngineTraceEventLike };

export interface TaskExecutionConfig {
  readonly autonomy: 'interactive' | 'auto';      // spike: just interactive
  readonly urgency: 'low' | 'normal' | 'high';
  readonly importance: 'low' | 'normal' | 'high';
}

export interface Task {
  readonly id: string;
  /**
   * Plan 8b Task 7 — methodologyId is now OPTIONAL. When undefined OR when
   * `methodology_selection_mode === 'none'`, the task runs in "free chat"
   * mode: the supervisor opens an adapter session without engine bootstrap
   * and TASK_START_TURN bypasses the methodology runner entirely.
   */
  readonly methodologyId?: string;
  /**
   * Active stage. Only meaningful when `methodologyId` is set. Optional
   * for free-chat tasks created via Plan 8b's TaskSettingsPanel flow.
   */
  readonly stageId?: string;
  readonly status: TaskStatus;
  readonly thread: readonly AgentMessage[];       // append-only
  readonly config: TaskExecutionConfig;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly totalTokens: { input: number; output: number };
  readonly strictness_mode?: StrictnessMode;
  readonly ask_before_edit?: boolean;
  /**
   * Selected at task creation; falls back to methodology's default mode.
   * Only valid if methodology declares `modes`.
   */
  readonly agent_mode?: string;
  /**
   * Task complexity label, one of C1..C4. Used by the engine to pick
   * `Stage.scope_by_complexity` overrides at stage assembly time.
   */
  readonly complexity?: TaskComplexity;
  /**
   * When true, the methodology-compliance reviewer is automatically spawned
   * when this task reaches its terminal `closed` status. Output target is
   * controlled by `UserSettings.complianceOutputMode`. Default: false.
   */
  readonly compliance_review_enabled?: boolean;
  // --- Plan 8b Task 7 — TaskSettingsPanel extensions -----------------------
  /** Human-readable title (NewTaskDialog mandatory field). */
  readonly title?: string;
  /** Project folder this task lives in. Stored for reference by panels/IPC. */
  readonly projectPath?: string;
  /**
   * Free chat / router / manual selection. Drives whether
   * TaskSupervisor.start bootstraps the engine. Default 'none'.
   */
  readonly methodology_selection_mode?: MethodologySelectionMode;
  /** Effort level → model mapping (fast=Haiku / normal=Sonnet / thorough=Opus). */
  readonly effort?: EffortLevel;
  /** Worker prompt hint (concise vs detailed). */
  readonly response_mode?: ResponseMode;
  /** Adapter --max-budget-usd toggle. */
  readonly economy_mode?: EconomyMode;
  /**
   * True once the first user message has been sent. Settings panel
   * collapses to a chip strip when this is true.
   */
  readonly settings_locked?: boolean;
  // Tracker extension — undefined means the task is not on the board yet
  readonly tracker_stage_id?: string;
  readonly tracker_fields?: Record<string, unknown>;
  readonly tracker_session_summary?: string;
}

export function defaultTaskConfig(): TaskExecutionConfig {
  return { autonomy: 'interactive', urgency: 'normal', importance: 'normal' };
}

/**
 * Plan 8b Task 7 — effort → Claude model identifier. Mirrors the user
 * presentation in TaskSettingsPanel (Fast = Haiku, Normal = Sonnet,
 * Thorough = Opus). Adapter passes the value as `--model`.
 */
export const EFFORT_TO_MODEL: Readonly<Record<EffortLevel, string>> = {
  fast: 'claude-haiku-4-5-20251001',
  normal: 'claude-sonnet-4-6',
  thorough: 'claude-opus-4-7',
};

/** Plan 8b Task 7 — budget ceiling in USD when economy_mode === 'budget'. */
export const BUDGET_MODE_USD_CAP = 5.0;
