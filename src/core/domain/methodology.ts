// Methodology IR — strongly-typed in-memory representation of a user's
// process definition. Runtime never consumes raw markdown; parser/serializer
// in src/core/methodology/* translate to/from .md.

import type { TaskComplexity } from './task';
import type { PipelinePlugin } from './pipeline_plugin';
import type { InboundTriggerConfig } from './inbound_trigger';

export type StageMode = 'auto' | 'interactive' | 'gate';

export type EdgeConditionKind =
  | 'always'
  | 'gate-pass'
  | 'gate-fail'
  | 'branch'
  | 'rollback'    // controlled return to an earlier stage (W5→W3)
  | 'recut';      // any stage → W0 (scope/AC reformulation)

export type EdgeCondition =
  | { readonly kind: 'always' }
  | { readonly kind: 'gate-pass' }
  | { readonly kind: 'gate-fail'; readonly maxCycles?: number }
  | { readonly kind: 'branch'; readonly expr: string }
  | { readonly kind: 'rollback'; readonly maxCycles?: number }
  | { readonly kind: 'recut'; readonly maxCycles?: number };

export interface ArtifactRef {
  readonly stage: string;
  readonly artifact: string;
}

export type ArtifactFormat = 'markdown' | 'plaintext';

/**
 * One alternative output location, gated by a ConditionExpr evaluated
 * against the produced artifact's own frontmatter. The first matching
 * entry wins; the engine falls back to `ArtifactSpec.path` when none
 * matches.
 */
export interface ConditionalPath {
  readonly when: ConditionExpr;
  readonly path: string;
}

/**
 * Rule applied to an artifact's frontmatter at engine-side write time:
 * when `when` evaluates true (against the artifact itself), `op` is
 * applied to `enforce_field` (dotted path inside frontmatter) with the
 * given `value`. Used to encode policy like "cap confidence at 0.6 when
 * falsification is unavailable".
 *
 * Semantics by op:
 *   cap   — numeric clamp from above
 *   floor — numeric clamp from below
 *   set   — unconditional assignment
 */
export interface ArtifactInvariant {
  readonly when: ConditionExpr;
  readonly enforce_field: string;
  readonly op: ArtifactInvariantOp;
  readonly value: number | string | boolean;
}

export const ARTIFACT_INVARIANT_OPS = ['cap', 'floor', 'set'] as const;
export type ArtifactInvariantOp = (typeof ARTIFACT_INVARIANT_OPS)[number];

export interface ArtifactSpec {
  readonly path: string;
  readonly format?: ArtifactFormat;
  readonly schema?: Record<string, unknown>;
  /**
   * Alternate output paths gated by ConditionExpr against the produced
   * artifact's own frontmatter. Engine picks the first matching entry;
   * unmatched falls back to `path`.
   */
  readonly conditional_paths?: readonly ConditionalPath[];
  /**
   * Frontmatter-shaping rules applied at engine write time. Pure declarative;
   * engine enforces.
   */
  readonly invariants?: readonly ArtifactInvariant[];
}

/**
 * Per-complexity override applied to a stage at assembly time. All fields
 * optional; an empty object is a valid declaration meaning "no override".
 */
export interface ScopeOverride {
  /** When true, the stage is skipped entirely at this complexity. */
  readonly skip?: boolean;
  /** Refs an alternate artifact template variant name. */
  readonly artifact_template_variant?: string;
  /** Appended to the assembled system prompt for this stage. */
  readonly system_prompt_addendum?: string;
}

export const PREFLIGHT_ON_FAIL_VALUES = ['rollback', 'ask', 'fail'] as const;
export type PreflightOnFail = (typeof PREFLIGHT_ON_FAIL_VALUES)[number];

/**
 * A pre-stage validation step. The engine reads `input_artifact` and
 * checks the listed conditions (any combination of section presence,
 * regex on body, or a free-form ConditionExpr); on failure, `on_fail`
 * tells the engine whether to roll back, ask the user, or hard-fail.
 *
 * Type-level the optional check fields are independent; the validator
 * enforces "at least one of must_have_sections / must_match_pattern /
 * custom" (Rule 25).
 */
export interface PreflightCheck {
  readonly id: string;
  readonly input_artifact: ArtifactRef;
  readonly must_have_sections?: readonly string[];
  readonly must_match_pattern?: string;
  readonly custom?: ConditionExpr;
  readonly on_fail: PreflightOnFail;
}

export interface Dep {
  readonly methodology?: string;
  readonly 'cases-pack'?: string;
  readonly knowledge?: readonly string[];
  readonly templates?: readonly string[];
}

export interface Stage {
  readonly id: string;
  readonly name: string;
  readonly mode: StageMode;
  readonly contract: {
    readonly input: readonly ArtifactRef[];
    readonly output: ArtifactSpec;
  };
  readonly reviewers?: readonly ReviewerBinding[];
  readonly tools_required?: readonly string[];    // legacy; deprecated by tools — keep for now
  readonly prompt?: string;
  /**
   * Meta-instructions extracted from `<!-- AI: ... -->` HTML comments in the
   * stage body. One entry per comment block; multi-line blocks preserve their
   * internal newlines. Engine concatenates with `prompt` / `system_prompt_template`
   * when assembling the final LLM message; editors present them as a distinct
   * field so authoring intent is not lost.
   */
  readonly ai_directives?: readonly string[];
  readonly gate?: Gate;
  readonly questions?: readonly Question[];
  readonly phases?: readonly Phase[];
  readonly phases_source?: PhaseSource;
  readonly phases_from_artifact?: PhasesFromArtifact;
  readonly phase_edges?: readonly PhaseEdge[];
  // v2 stage additions
  readonly system_prompt_template?: string;
  readonly user_view_template?: string;
  readonly role_split?: RoleSplit;
  readonly tools?: StageTools;
  readonly skills_hint?: readonly string[];
  readonly execution_isolation?: ExecutionIsolation;
  readonly confidence_threshold?: number;          // 0..1
  readonly stuck_policy?: StuckPolicy;
  readonly tracker_template?: string;
  readonly context_essentials?: readonly ArtifactRef[];
  /** If undefined/empty, stage is active in all modes. */
  readonly active_in_modes?: readonly string[];
  /** Knowledge corpus files the engine loads at stage entry. */
  readonly corpus_reads?: readonly CorpusRead[];
  /**
   * Metainformation only: when present, this stage's body (phases, prompt, gate, ...)
   * was inlined from another methodology via the importer ("copy mode").
   * Used for UI lineage badges, re-import dialogs, and reviewer awareness.
   * Stage content lives in the host methodology as if hand-authored.
   */
  readonly composed_from?: ComposedFrom;
  /** Stage-level subagent dispatch DAG (when stage has no phases). */
  readonly dispatch_dag?: DispatchDag;
  /**
   * Pre-stage validation checks. Run at stage entry against upstream
   * artifacts; failures route per each check's `on_fail`.
   */
  readonly preflight?: readonly PreflightCheck[];
  /**
   * Per-complexity scope overrides (C1..C4). Keys are optional; absent
   * keys mean "no override at that complexity".
   */
  readonly scope_by_complexity?: Readonly<Partial<Record<TaskComplexity, ScopeOverride>>>;
}

/**
 * Records that a stage was inlined from another methodology (copy/import mode).
 * Pure metadata — engine does not consume; renderer/importer/UI uses it.
 */
export interface ComposedFrom {
  /** Source methodology id. */
  readonly methodology_id: string;
  /** Pinned source version at import time, for traceability. */
  readonly methodology_version?: string;
  /** If source had `modes`, the mode chosen at import time. */
  readonly mode?: string;
  /** Source artifact path → target artifact path remapping (if importer rewrote paths). */
  readonly mapped_outputs?: Readonly<Record<string, string>>;
  /** ISO 8601 timestamp — when the importer inlined this content. */
  readonly imported_at: string;
}

export const CORPUS_CONTENT_TYPES = ['markdown', 'yaml', 'json', 'template', 'plaintext'] as const;
export type CorpusContentType = typeof CORPUS_CONTENT_TYPES[number];

export const CORPUS_INJECT_TARGETS = ['system_prompt', 'context_window', 'tool_accessible'] as const;
export type CorpusInjectTarget = typeof CORPUS_INJECT_TARGETS[number];

export interface CorpusRead {
  /** Relative to project root OR stack root (resolved by engine). */
  readonly path: string;
  readonly content_type: CorpusContentType;
  /** Free-form explanation for the model. */
  readonly purpose: string;
  /** Default `'system_prompt'` is applied at consumption time, not parse time. */
  readonly inject_into?: CorpusInjectTarget;
}

export interface Edge {
  readonly from: string;
  readonly to: string;
  readonly condition: EdgeCondition;
  readonly label?: string;
  readonly increment_counters_on_traverse?: readonly string[];
  readonly preserve_counters_on_traverse?: readonly string[];
}

export interface Hook {
  readonly on: 'stage_complete' | 'gate_pass' | 'task_close';
  readonly stage?: string;
  readonly tool: string;
  readonly args?: Record<string, unknown>;
}

export interface Methodology {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly author?: string;
  readonly deps?: readonly Dep[];
  readonly stages: readonly Stage[];
  readonly edges: readonly Edge[];
  readonly hooks?: readonly Hook[];
  readonly layout?: {
    readonly positions?: Record<string, { x: number; y: number }>;
  };
  readonly meta?: Record<string, unknown>;
  // v2 additions (all optional; v1 files parse with these undefined)
  readonly applicability?: readonly ApplicabilityRule[];
  readonly anti_patterns?: readonly string[];
  readonly state_schema?: readonly StateFlag[];
  readonly modes?: readonly MethodologyMode[];
  readonly plugins?: readonly PipelinePlugin[];
}

/**
 * Methodology-internal mode parameter (e.g. deep_research: light/standard/deep).
 * Distinct from Task.strictness_mode (which is global, runtime, cross-methodology).
 */
export interface MethodologyMode {
  readonly id: string;                           // 'light' | 'standard' | 'deep' or custom
  readonly name: string;                         // i18n key OR plain label
  readonly description?: string;
  readonly default?: boolean;                    // exactly one mode may be default
}

// --- v2 additions ------------------------------------------------------

/**
 * A condition expression — opaque string for now. Engine in a future plan will
 * provide an evaluator. Keep as `{ expr }` to allow future hardening
 * (precompiled AST, allowed-symbol lists) without breaking persistence.
 */
export interface ConditionExpr {
  readonly expr: string;
}

export type StateFlagKind = 'counter' | 'flag';

export interface StateFlag {
  readonly id: string;
  readonly kind: StateFlagKind;
  readonly initial: number | boolean;
  readonly description?: string;
  /** If true, rollback edges do NOT reset this counter (anti-circumvention). */
  readonly preserve_on_rollback?: boolean;
}

export interface ApplicabilityRule {
  /** Free-form match hint string for router (e.g. "task_type=T4-S"). */
  readonly match: string;
  /** Optional weight 0..1 — higher = stronger match signal. */
  readonly weight?: number;
}

export type GateKind = 'standard' | 'comprehension' | 'external';

export type GateItemKind =
  | 'artifact_written'
  | 'reviewer_pass'
  | 'user_confirmed'
  | 'completeness_check'
  | 'custom';

export interface GateItem {
  readonly id: string;
  /** i18n key OR fallback text. Resolver lives in renderer. */
  readonly label: string;
  readonly kind: GateItemKind;
  /** When this expr evaluates true, the item auto-passes (no user prompt). */
  readonly auto_pass_when?: ConditionExpr;
  /** If true, gate cannot proceed without this item; default true. */
  readonly hard_stop?: boolean;
}

export interface Gate {
  readonly kind: GateKind;
  readonly items: readonly GateItem[];
  // Track C Plan 04 — external gate fields. Present only when kind === 'external';
  // ignored for 'standard' / 'comprehension'. Kept optional on the same shape
  // (rather than a discriminated union) to minimise churn for existing call sites.
  readonly trigger?: InboundTriggerConfig;
  readonly timeoutMs?: number;
  readonly onTimeout?: 'fail' | 'continue' | 'retry';
}

export type ExecutionIsolation = 'inline' | 'subagent' | 'parallel_subagents';

export interface RoleSplit {
  readonly ai_does: string;
  readonly human_does: string;
}

export interface StageTools {
  readonly allowed?: readonly string[];
  readonly required?: readonly string[];
  readonly forbidden?: readonly string[];
}

export type StuckEscalationStep =
  | 'change_tactics'
  | 'request_logging'
  | 'additional_research'
  | 'debugging_playbook'
  | 'user_override';

export interface StuckPolicy {
  readonly max_attempts: number;
  readonly escalation_steps: readonly StuckEscalationStep[];
  /** Compress error to 1-2 sentences between cycles (BR-2-style). */
  readonly error_compaction?: boolean;
}

export interface ReviewerBinding {
  readonly reviewer_id: string;
  readonly recommended?: boolean;   // default false; star in UI
}

export type QuestionKind = 'choice' | 'multi_choice' | 'text' | 'yes_no' | 'file' | 'confirm';

export interface QuestionOption {
  readonly id: string;
  readonly label: string;
}

export interface QuestionNextRule {
  readonly when_answer: string;          // option.id or literal string
  readonly next_question_id: string;     // sibling Question.id OR 'end'
}

export interface Question {
  readonly id: string;
  readonly text: string;                 // i18n key resolved by renderer; fallback plain
  readonly kind: QuestionKind;
  readonly options?: readonly QuestionOption[];
  readonly required?: boolean;
  readonly context_hint?: string;        // AI guidance on when/how to ask
  readonly next_rules?: readonly QuestionNextRule[];
}

export interface Phase {
  readonly id: string;
  readonly name: string;
  readonly conditional_activation?: ConditionExpr;
  /** Phase inherits the parent stage's mode by default; can override. */
  readonly mode?: StageMode;
  readonly prompt?: string;
  readonly gate?: Gate;
  readonly questions?: readonly Question[];
  /** Subagent dispatch DAG executed when the phase runs. */
  readonly dispatch_dag?: DispatchDag;
}

/**
 * Budget envelope per subagent dispatch node. All fields optional;
 * absent fields mean "no engine-imposed cap" (subject to platform defaults).
 */
export interface DispatchBudget {
  /** Search units (e.g. WebSearch calls) — custom unit for research methodologies. */
  readonly search_units?: number;
  /** Token cap (input + output) for this subagent invocation. */
  readonly tokens?: number;
  /** Wall-clock timeout in seconds. */
  readonly wall_clock_sec?: number;
}

/**
 * A single subagent dispatch node in a DAG. Engine materialises this at
 * runtime per Plan 13 SubagentDispatcher integration; IR layer only encodes
 * the declarative shape.
 */
export interface SubagentDispatchSpec {
  /** Unique within this Phase/Stage's DispatchDag. */
  readonly id: string;
  /** Refs SubagentType registry (Plan 13). */
  readonly subagent_type_id: string;
  /** Prompt with placeholders, e.g. {sub_query}, {prerequisites_outputs}. */
  readonly prompt_template: string;
  /** IDs of prior dispatches in this DAG that must finish before this one. */
  readonly depends_on?: readonly string[];
  /** Path template, e.g. "research_agent_{id}_findings.md". */
  readonly output_file: string;
  readonly budget?: DispatchBudget;
}

/**
 * Declarative DAG of subagent dispatches. Nodes with empty depends_on form
 * Wave 1 (engine runs in parallel); dependent nodes form later waves.
 */
export interface DispatchDag {
  readonly nodes: readonly SubagentDispatchSpec[];
  /** Optional artifact aggregating all node outputs. */
  readonly aggregate_to?: string;
}

export type PhaseSource = 'inline' | 'from_artifact';

export interface PhasesFromArtifact {
  /** Upstream stage that produced the artifact. */
  readonly stage_id: string;
  /** Artifact path (must match upstream's contract.output.path). */
  readonly artifact: string;
  /** Markdown section name to parse phases from (e.g. "## Phases"). */
  readonly section: string;
}

export interface PhaseEdge {
  /** Phase.id */
  readonly from: string;
  /** Phase.id OR sentinel 'end' (end of stage). */
  readonly to: string;
  readonly kind: 'always' | 'gate-fail';
  /** Valid only for kind='gate-fail'. */
  readonly maxCycles?: number;
}

const STAGE_MODES: readonly StageMode[] = ['auto', 'interactive', 'gate'];
const EDGE_KINDS: readonly EdgeConditionKind[] = ['always', 'gate-pass', 'gate-fail', 'branch', 'rollback', 'recut'];

export function isStage(value: unknown): value is Stage {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return false;
  if (typeof v.mode !== 'string' || !(STAGE_MODES as readonly string[]).includes(v.mode)) return false;
  if (typeof v.contract !== 'object' || v.contract === null) return false;
  const c = v.contract as Record<string, unknown>;
  if (!Array.isArray(c.input)) return false;
  if (typeof c.output !== 'object' || c.output === null) return false;
  return true;
}

export function isEdge(value: unknown): value is Edge {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.from !== 'string' || typeof v.to !== 'string') return false;
  if (typeof v.condition !== 'object' || v.condition === null) return false;
  const cond = v.condition as Record<string, unknown>;
  if (typeof cond.kind !== 'string' || !(EDGE_KINDS as readonly string[]).includes(cond.kind)) return false;
  return true;
}

export function isMethodology(value: unknown): value is Methodology {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string') return false;
  if (typeof v.version !== 'string') return false;
  if (typeof v.name !== 'string') return false;
  if (typeof v.description !== 'string') return false;
  if (!Array.isArray(v.stages)) return false;
  if (!Array.isArray(v.edges)) return false;
  if (!(v.plugins === undefined || Array.isArray(v.plugins))) return false;
  return v.stages.every(isStage) && v.edges.every(isEdge);
}
