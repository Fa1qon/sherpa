import matter from 'gray-matter';
import yaml from 'js-yaml';
import type {
  Methodology,
  MethodologyMode,
  Stage,
  Edge,
  StageMode,
  ApplicabilityRule,
  StateFlag,
  StateFlagKind,
  Gate,
  GateItem,
  GateItemKind,
  GateKind,
  ConditionExpr,
  RoleSplit,
  StageTools,
  StuckPolicy,
  StuckEscalationStep,
  ExecutionIsolation,
  ReviewerBinding,
  Question,
  QuestionKind,
  QuestionOption,
  QuestionNextRule,
  Phase,
  PhaseSource,
  PhasesFromArtifact,
  PhaseEdge,
  ArtifactRef,
  ArtifactSpec,
  ArtifactFormat,
  CorpusRead,
  CorpusContentType,
  CorpusInjectTarget,
  ComposedFrom,
  DispatchDag,
  SubagentDispatchSpec,
  DispatchBudget,
  PreflightCheck,
  PreflightOnFail,
  ScopeOverride,
  ConditionalPath,
  ArtifactInvariant,
  ArtifactInvariantOp,
} from '../domain/methodology';
import {
  CORPUS_CONTENT_TYPES,
  CORPUS_INJECT_TARGETS,
  PREFLIGHT_ON_FAIL_VALUES,
  ARTIFACT_INVARIANT_OPS,
} from '../domain/methodology';
import { TASK_COMPLEXITIES, type TaskComplexity } from '../domain/task';
import type { LoadMethodologyResult } from '../ports/methodology_port';

const KNOWN_FRONT_KEYS = new Set([
  'id', 'version', 'name', 'description', 'author', 'extends', 'deps', 'layout',
  // v2:
  'language', 'gate_strictness', 'applicability', 'anti_patterns',
  'context_budget', 'state_schema', 'skills_hint',
  // v2.1:
  'modes',
]);

const STATE_FLAG_KINDS: readonly StateFlagKind[] = ['counter', 'flag'];

const GATE_KINDS: readonly GateKind[] = ['standard', 'comprehension'];

const GATE_ITEM_KINDS: readonly GateItemKind[] = [
  'artifact_written',
  'reviewer_pass',
  'user_confirmed',
  'completeness_check',
  'custom',
];

const VALID_MODES: readonly StageMode[] = ['auto', 'interactive', 'gate'];

const STUCK_ESCALATION_STEPS: readonly StuckEscalationStep[] = [
  'change_tactics',
  'request_logging',
  'additional_research',
  'debugging_playbook',
  'user_override',
];

const EXECUTION_ISOLATION_VALUES: readonly ExecutionIsolation[] = [
  'inline', 'subagent', 'parallel_subagents',
];

const QUESTION_KINDS: readonly QuestionKind[] = ['choice', 'multi_choice', 'text', 'yes_no', 'file', 'confirm'];

export function parseMethodology(source: string, _sourcePath: string): LoadMethodologyResult {
  const warnings: string[] = [];

  if (!source.startsWith('---')) {
    return {
      ok: false,
      error: { kind: 'parse-error', message: 'missing YAML frontmatter (file must start with ---)' },
    };
  }

  let parsedFront;
  try {
    parsedFront = matter(source);
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'parse-error', message: (err as Error).message },
    };
  }

  const front = parsedFront.data as Record<string, unknown>;
  const body = parsedFront.content;

  // Required fields
  const id = typeof front.id === 'string' ? front.id : null;
  if (!id) {
    return { ok: false, error: { kind: 'parse-error', message: 'missing or invalid `id` in frontmatter' } };
  }
  const name = typeof front.name === 'string' ? front.name : id;
  const description = typeof front.description === 'string' ? front.description : '';

  let version: string;
  if (typeof front.version === 'string') {
    version = front.version;
  } else if (typeof front.version === 'number') {
    version = String(front.version);
  } else {
    version = '0.0.0';
    warnings.push(`missing version, defaulted to 0.0.0`);
  }

  // Collect unrecognized frontmatter into meta
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(front)) {
    if (!KNOWN_FRONT_KEYS.has(k)) meta[k] = v;
  }

  // Parse stages from `## Stage: <id>` (also accept `## Phase: <id>`)
  const stages = parseStages(body, warnings);
  if (stages.length === 0) {
    return { ok: false, error: { kind: 'parse-error', message: 'no stages found' } };
  }

  // Plan 3 Task 3: ## EDGES table is authoritative when present.
  // Otherwise fall back to Plan 2 behavior: linear inference + ## GATES overrides.
  const stageIds = new Set(stages.map((s) => s.id));
  const explicit = parseEdgesSection(body, warnings, stageIds);
  let edges: Edge[];
  if (explicit !== null) {
    edges = explicit;
  } else {
    const linear = deriveLinearEdges(stages);
    const gates = parseGatesSection(body);
    const gateEdges: Edge[] = [];
    for (const row of gates.rows) {
      if (!stageIds.has(row.from) && row.from !== 'start') {
        warnings.push(`GATES table refers to unknown stage "${row.from}"`);
        continue;
      }
      if (!stageIds.has(row.to) && row.to !== 'end') {
        warnings.push(`GATES table refers to unknown stage "${row.to}"`);
        continue;
      }
      if (row.condition === 'gate-fail') {
        gateEdges.push({
          from: row.from,
          to: row.to,
          condition: { kind: 'gate-fail', ...(row.maxCycles !== undefined && { maxCycles: row.maxCycles }) },
        });
      } else if (row.condition === 'gate-pass') {
        gateEdges.push({
          from: row.from,
          to: row.to,
          condition: { kind: 'gate-pass' },
        });
      } else {
        warnings.push(`GATES table: unknown condition "${row.condition}" between ${row.from}→${row.to}`);
      }
    }
    edges = [...linear, ...gateEdges];
  }

  let layout: Methodology['layout'] | undefined;
  if (front.layout && typeof front.layout === 'object') {
    const l = front.layout as Record<string, unknown>;
    if (l.positions && typeof l.positions === 'object') {
      const positions: Record<string, { x: number; y: number }> = {};
      for (const [k, v] of Object.entries(l.positions as Record<string, unknown>)) {
        if (v && typeof v === 'object') {
          const p = v as Record<string, unknown>;
          if (typeof p.x === 'number' && typeof p.y === 'number') {
            positions[k] = { x: p.x, y: p.y };
          }
        }
      }
      if (Object.keys(positions).length > 0) layout = { positions };
    }
  }

  // v2 root fields
  const applicability = parseApplicability(front.applicability, warnings);
  const anti_patterns = parseStringArray(front.anti_patterns, 'anti_patterns', warnings);
  const state_schema = parseStateSchema(front.state_schema, warnings);
  const modes = parseModes(front.modes, warnings);

  const methodology: Methodology = {
    id,
    version,
    name,
    description,
    ...(typeof front.author === 'string' && { author: front.author }),
    ...(Array.isArray(front.deps) && { deps: front.deps as Methodology['deps'] }),
    ...(applicability !== undefined && applicability.length > 0 && { applicability }),
    ...(anti_patterns !== undefined && anti_patterns.length > 0 && { anti_patterns }),
    ...(state_schema !== undefined && state_schema.length > 0 && { state_schema }),
    ...(modes !== undefined && modes.length > 0 && { modes }),
    stages,
    edges,
    ...(layout && { layout }),
    ...(Object.keys(meta).length > 0 && { meta }),
  };

  return { ok: true, methodology, warnings };
}

// --- v2 frontmatter helpers --------------------------------------------

function parseApplicability(value: unknown, warnings: string[]): ApplicabilityRule[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    warnings.push(`applicability must be an array — dropped`);
    return undefined;
  }
  const out: ApplicabilityRule[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry !== 'object' || entry === null) {
      warnings.push(`applicability[${i}]: not an object — skipped`);
      continue;
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.match !== 'string') {
      warnings.push(`applicability[${i}]: missing/invalid "match" string — skipped`);
      continue;
    }
    const rule: ApplicabilityRule = e.weight !== undefined && typeof e.weight === 'number' && Number.isFinite(e.weight)
      ? { match: e.match, weight: e.weight }
      : { match: e.match };
    if (e.weight !== undefined && (typeof e.weight !== 'number' || !Number.isFinite(e.weight))) {
      warnings.push(`applicability[${i}]: invalid "weight" — dropped`);
    }
    out.push(rule);
  }
  return out;
}

function parseStringArray(value: unknown, fieldName: string, warnings: string[]): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    warnings.push(`${fieldName} must be an array of strings — dropped`);
    return undefined;
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== 'string') {
      warnings.push(`${fieldName}[${i}]: not a string — skipped`);
      continue;
    }
    out.push(item);
  }
  return out;
}

function parseModes(value: unknown, warnings: string[]): MethodologyMode[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    warnings.push(`modes must be an array — dropped`);
    return undefined;
  }
  const out: MethodologyMode[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry !== 'object' || entry === null) {
      warnings.push(`modes[${i}]: not an object — skipped`);
      continue;
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string') {
      warnings.push(`modes[${i}]: missing/invalid "id" string — skipped`);
      continue;
    }
    if (seenIds.has(e.id)) {
      warnings.push(`modes[${i}]: duplicate mode id "${e.id}" — skipped`);
      continue;
    }
    const name = typeof e.name === 'string' ? e.name : e.id;
    const mode: MethodologyMode = {
      id: e.id,
      name,
      ...(typeof e.description === 'string' && { description: e.description }),
      ...(typeof e.default === 'boolean' && { default: e.default }),
    };
    seenIds.add(e.id);
    out.push(mode);
  }
  return out;
}

function parseStateSchema(value: unknown, warnings: string[]): StateFlag[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    warnings.push(`state_schema must be an array — dropped`);
    return undefined;
  }
  const out: StateFlag[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry !== 'object' || entry === null) {
      warnings.push(`state_schema[${i}]: not an object — skipped`);
      continue;
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string') {
      warnings.push(`state_schema[${i}]: missing/invalid "id" string — skipped`);
      continue;
    }
    if (typeof e.kind !== 'string' || !(STATE_FLAG_KINDS as readonly string[]).includes(e.kind)) {
      warnings.push(`state_schema[${i}]: "kind" must be 'counter' or 'flag' — skipped`);
      continue;
    }
    if (typeof e.initial !== 'number' && typeof e.initial !== 'boolean') {
      warnings.push(`state_schema[${i}]: "initial" must be number or boolean — skipped`);
      continue;
    }
    const flag: StateFlag = {
      id: e.id,
      kind: e.kind as StateFlagKind,
      initial: e.initial,
      ...(typeof e.description === 'string' && { description: e.description }),
      ...(typeof e.preserve_on_rollback === 'boolean' && { preserve_on_rollback: e.preserve_on_rollback }),
    };
    out.push(flag);
  }
  return out;
}

interface RawStage {
  id: string;
  name: string;
  bodyStart: number;
  bodyEnd: number;
}

function parseStages(body: string, warnings: string[]): Stage[] {
  const lines = body.split(/\r?\n/);
  const stageHeader = /^##\s+(?:Stage|Phase)\s*:\s*(\S+)(?:\s*[-—]\s*(.+))?\s*$/i;
  // Any other top-level `## …` heading (e.g. `## EDGES`, `## GATES`) closes
  // the current stage body. Without this guard, post-stage sections leak into
  // the last stage's prompt and re-serialize duplicates them.
  const otherSectionHeader = /^##\s+\S/;

  const raw: RawStage[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = stageHeader.exec(line);
    if (m) {
      if (raw.length > 0) raw[raw.length - 1]!.bodyEnd = i;
      raw.push({
        id: m[1]!,
        name: (m[2]?.trim() ?? m[1]!),
        bodyStart: i + 1,
        bodyEnd: lines.length,
      });
      continue;
    }
    if (raw.length > 0 && otherSectionHeader.test(line) && raw[raw.length - 1]!.bodyEnd === lines.length) {
      // First non-stage `## …` header after a stage marks the end of stages section.
      raw[raw.length - 1]!.bodyEnd = i;
    }
  }

  return raw.map((r) => parseStageBody(r, lines, warnings));
}

function parseStageBody(raw: RawStage, lines: string[], warnings: string[]): Stage {
  const bodyLines = lines.slice(raw.bodyStart, raw.bodyEnd);
  let mode: StageMode = 'auto';
  let modeFound = false;
  const promptLines: string[] = [];
  // ai_directives: array of strings, one entry per `<!-- AI: ... -->` block.
  // Multi-line block content is preserved with internal '\n' separators.
  const aiDirectives: string[] = [];
  let inAiComment = false;
  let currentAiBlock: string[] = [];
  let inDirectivesFence = false;
  const directivesLines: string[] = [];
  let directivesYaml: string | null = null;

  for (const line of bodyLines) {
    const trim = line.trim();
    // Directives YAML fence: ```yaml ... ``` — AI: comments inside the fence
    // are part of the YAML payload, not stage body, so we handle the fence
    // BEFORE the AI block check.
    if (inDirectivesFence) {
      if (trim === '```') {
        inDirectivesFence = false;
        directivesYaml = directivesLines.join('\n');
        continue;
      }
      directivesLines.push(line);
      continue;
    }
    if (trim === '```yaml' && directivesYaml === null) {
      inDirectivesFence = true;
      continue;
    }
    // mode: <value>
    const modeMatch = /^mode:\s*(\w[\w-]*)/.exec(trim);
    if (modeMatch && !modeFound) {
      const cand = modeMatch[1]!;
      if ((VALID_MODES as readonly string[]).includes(cand)) {
        mode = cand as StageMode;
      } else {
        warnings.push(`stage ${raw.id}: unknown mode "${cand}" (defaulted to auto)`);
      }
      modeFound = true;
      continue;
    }
    // HTML-comment AI block — extracted into Stage.ai_directives (NOT merged
    // into prompt; semantic separation between author-facing narrative and
    // meta-instructions to the engine).
    if (trim.startsWith('<!-- AI:')) {
      inAiComment = true;
      const inline = trim.slice('<!-- AI:'.length).trim();
      if (inline.endsWith('-->')) {
        const content = inline.slice(0, -3).trim();
        aiDirectives.push(content);
        currentAiBlock = [];
        inAiComment = false;
      } else if (inline.length > 0) {
        currentAiBlock.push(inline);
      }
      continue;
    }
    if (inAiComment) {
      if (trim.endsWith('-->')) {
        const content = trim.slice(0, -3).trim();
        if (content.length > 0) currentAiBlock.push(content);
        aiDirectives.push(currentAiBlock.join('\n').trim());
        currentAiBlock = [];
        inAiComment = false;
      } else {
        currentAiBlock.push(line);
      }
      continue;
    }
    promptLines.push(line);
  }

  // If file ended mid-AI-block, salvage whatever we collected (defensive).
  if (inAiComment && currentAiBlock.length > 0) {
    aiDirectives.push(currentAiBlock.join('\n').trim());
    warnings.push(`stage ${raw.id}: unterminated <!-- AI: ... --> block`);
  }

  const prompt = promptLines.join('\n').trim();

  const directives: StageDirectives = directivesYaml
    ? parseStageDirectivesBlock(directivesYaml, raw.id, warnings)
    : {};

  // Strip carrier-only fields so they don't spread onto Stage as if they were
  // stage-level keys; they're consumed into Stage.contract below.
  const { inputs, output, ...stageDirectives } = directives;

  return {
    id: raw.id,
    name: raw.name,
    mode,
    contract: {
      input: inputs ?? [],
      output: output ?? { path: `${raw.id}.md` },
    },
    ...(prompt.length > 0 && { prompt }),
    ...(aiDirectives.length > 0 && { ai_directives: aiDirectives }),
    ...stageDirectives,
  };
}

interface StageDirectives {
  gate?: Gate;
  system_prompt_template?: string;
  user_view_template?: string;
  role_split?: RoleSplit;
  tools?: StageTools;
  skills_hint?: readonly string[];
  execution_isolation?: ExecutionIsolation;
  confidence_threshold?: number;
  stuck_policy?: StuckPolicy;
  reviewers?: ReviewerBinding[];
  tracker_template?: string;
  questions?: Question[];
  phases?: Phase[];
  phases_source?: PhaseSource;
  phases_from_artifact?: PhasesFromArtifact;
  phase_edges?: PhaseEdge[];
  context_essentials?: ArtifactRef[];
  active_in_modes?: readonly string[];
  corpus_reads?: CorpusRead[];
  composed_from?: ComposedFrom;
  dispatch_dag?: DispatchDag;
  preflight?: PreflightCheck[];
  scope_by_complexity?: Partial<Record<TaskComplexity, ScopeOverride>>;
  /** Private carrier: consumed into Stage.contract.input by parseStageBody. */
  inputs?: ArtifactRef[];
  /** Private carrier: consumed into Stage.contract.output by parseStageBody. */
  output?: ArtifactSpec;
}

function parseStageDirectivesBlock(
  yamlText: string,
  stageId: string,
  warnings: string[],
): StageDirectives {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlText);
  } catch (e) {
    warnings.push(`stage ${stageId}: malformed directives YAML — ${(e as Error).message}`);
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};
  const p = parsed as Record<string, unknown>;
  const out: StageDirectives = {};
  if (p.active_in_modes !== undefined) {
    const arr = parseStringArray(p.active_in_modes, `stage ${stageId}.active_in_modes`, warnings);
    if (arr !== undefined) out.active_in_modes = arr;
  }
  if (p.gate !== undefined) {
    const gate = parseGate(p.gate, stageId, warnings);
    if (gate) out.gate = gate;
  }
  if (typeof p.system_prompt_template === 'string') out.system_prompt_template = p.system_prompt_template;
  if (typeof p.user_view_template === 'string') out.user_view_template = p.user_view_template;
  if (p.role_split !== undefined) {
    const rs = parseRoleSplit(p.role_split, stageId, warnings);
    if (rs) out.role_split = rs;
  }
  if (p.tools !== undefined) {
    const t = parseStageTools(p.tools, stageId, warnings);
    if (t) out.tools = t;
  }
  if (p.skills_hint !== undefined) {
    const sh = parseStringArray(p.skills_hint, `stage ${stageId}.skills_hint`, warnings);
    if (sh !== undefined && sh.length > 0) out.skills_hint = sh;
  }
  if (p.execution_isolation !== undefined) {
    if (typeof p.execution_isolation === 'string' &&
        (EXECUTION_ISOLATION_VALUES as readonly string[]).includes(p.execution_isolation)) {
      out.execution_isolation = p.execution_isolation as ExecutionIsolation;
    } else {
      warnings.push(`stage ${stageId}: unknown execution_isolation "${String(p.execution_isolation)}"`);
    }
  }
  if (p.confidence_threshold !== undefined) {
    if (typeof p.confidence_threshold === 'number' && Number.isFinite(p.confidence_threshold)
        && p.confidence_threshold >= 0 && p.confidence_threshold <= 1) {
      out.confidence_threshold = p.confidence_threshold;
    } else {
      warnings.push(`stage ${stageId}: confidence_threshold must be a number in [0,1] — dropped`);
    }
  }
  if (p.stuck_policy !== undefined) {
    const sp = parseStuckPolicy(p.stuck_policy, stageId, warnings);
    if (sp) out.stuck_policy = sp;
  }
  if (Array.isArray(p.reviewers)) {
    const arr = parseReviewers(p.reviewers, stageId, warnings);
    if (arr.length > 0) out.reviewers = arr;
  }
  if (typeof p.tracker_template === 'string') out.tracker_template = p.tracker_template;
  if (Array.isArray(p.questions)) {
    const qs = parseQuestions(p.questions, stageId, warnings);
    if (qs.length > 0) out.questions = qs;
  }
  if (Array.isArray(p.substages)) {
    warnings.push(`stage ${stageId}: 'substages' is deprecated; rename to 'phases'`);
    const subs = parsePhases(p.substages, stageId, warnings);
    if (subs.length > 0) out.phases = subs;
  } else if (Array.isArray(p.phases)) {
    const subs = parsePhases(p.phases, stageId, warnings);
    if (subs.length > 0) out.phases = subs;
  }
  if (typeof p.phases_source === 'string') {
    if (p.phases_source === 'inline' || p.phases_source === 'from_artifact') {
      out.phases_source = p.phases_source;
    } else {
      warnings.push(`stage ${stageId}: unknown phases_source "${p.phases_source}"`);
    }
  }
  if (p.phases_from_artifact !== undefined) {
    const pfa = parsePhasesFromArtifact(p.phases_from_artifact, stageId, warnings);
    if (pfa) out.phases_from_artifact = pfa;
  }
  if (Array.isArray(p.phase_edges)) {
    const pe = parsePhaseEdges(p.phase_edges, stageId, warnings);
    if (pe.length > 0) out.phase_edges = pe;
  }
  if (p.composed_from !== undefined) {
    const cf = parseComposedFrom(p.composed_from, stageId, warnings);
    if (cf) out.composed_from = cf;
  }
  if (Array.isArray(p.context_essentials)) {
    const refs = parseArtifactRefArray(p.context_essentials, `stage ${stageId}.context_essentials`, warnings);
    if (refs.length > 0) out.context_essentials = refs;
  }
  if (p.corpus_reads !== undefined) {
    const reads = parseCorpusReads(p.corpus_reads, stageId, warnings);
    if (reads.length > 0) out.corpus_reads = reads;
  }
  if (p.dispatch_dag !== undefined) {
    const dag = parseDispatchDag(p.dispatch_dag, `stage ${stageId}`, warnings);
    if (dag) out.dispatch_dag = dag;
  }
  if (p.preflight !== undefined) {
    const pre = parsePreflight(p.preflight, stageId, warnings);
    if (pre.length > 0) out.preflight = pre;
  }
  if (p.scope_by_complexity !== undefined) {
    const sbc = parseScopeByComplexity(p.scope_by_complexity, stageId, warnings);
    if (sbc) out.scope_by_complexity = sbc;
  }
  if (Array.isArray(p.inputs)) {
    const refs = parseArtifactRefArray(p.inputs, `stage ${stageId}.inputs`, warnings);
    if (refs.length > 0) out.inputs = refs;
  }
  if (p.output !== undefined) {
    const spec = parseArtifactSpec(p.output, `stage ${stageId}.output`, warnings);
    if (spec) out.output = spec;
  }
  return out;
}

function parseArtifactRefArray(
  value: readonly unknown[],
  fieldName: string,
  warnings: string[],
): ArtifactRef[] {
  const out: ArtifactRef[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry !== 'object' || entry === null) {
      warnings.push(`${fieldName}[${i}]: not an object — skipped`);
      continue;
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.stage !== 'string') {
      warnings.push(`${fieldName}[${i}]: missing/invalid "stage" string — skipped`);
      continue;
    }
    if (typeof e.artifact !== 'string') {
      warnings.push(`${fieldName}[${i}]: missing/invalid "artifact" string — skipped`);
      continue;
    }
    out.push({ stage: e.stage, artifact: e.artifact });
  }
  return out;
}

function parseCorpusReads(
  value: unknown,
  stageId: string,
  warnings: string[],
): CorpusRead[] {
  if (!Array.isArray(value)) {
    warnings.push(`stage ${stageId}: corpus_reads must be an array — dropped`);
    return [];
  }
  const out: CorpusRead[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry !== 'object' || entry === null) {
      warnings.push(`stage ${stageId}: corpus_reads[${i}] not an object — skipped`);
      continue;
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.path !== 'string' || e.path.length === 0) {
      warnings.push(`stage ${stageId}: corpus_reads[${i}] missing/empty "path" — skipped`);
      continue;
    }
    if (typeof e.content_type !== 'string'
        || !(CORPUS_CONTENT_TYPES as readonly string[]).includes(e.content_type)) {
      warnings.push(
        `stage ${stageId}: corpus_reads[${i}] content_type must be one of ${CORPUS_CONTENT_TYPES.join(', ')} — skipped`,
      );
      continue;
    }
    if (typeof e.purpose !== 'string') {
      warnings.push(`stage ${stageId}: corpus_reads[${i}] missing/invalid "purpose" string — skipped`);
      continue;
    }
    let inject_into: CorpusInjectTarget | undefined;
    if (e.inject_into !== undefined) {
      if (typeof e.inject_into === 'string'
          && (CORPUS_INJECT_TARGETS as readonly string[]).includes(e.inject_into)) {
        inject_into = e.inject_into as CorpusInjectTarget;
      } else {
        warnings.push(
          `stage ${stageId}: corpus_reads[${i}] inject_into must be one of ${CORPUS_INJECT_TARGETS.join(', ')} — dropped`,
        );
      }
    }
    out.push({
      path: e.path,
      content_type: e.content_type as CorpusContentType,
      purpose: e.purpose,
      ...(inject_into !== undefined && { inject_into }),
    });
  }
  return out;
}

function parseDispatchBudget(
  value: unknown,
  ownerLabel: string,
  nodeLabel: string,
  warnings: string[],
): DispatchBudget | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    warnings.push(`${ownerLabel}: ${nodeLabel} budget must be an object — dropped`);
    return undefined;
  }
  const v = value as Record<string, unknown>;
  const out: { search_units?: number; tokens?: number; wall_clock_sec?: number } = {};
  const FIELDS: readonly ('search_units' | 'tokens' | 'wall_clock_sec')[] =
    ['search_units', 'tokens', 'wall_clock_sec'];
  for (const f of FIELDS) {
    if (v[f] === undefined) continue;
    const n = v[f];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
      warnings.push(`${ownerLabel}: ${nodeLabel} budget.${f} must be a non-negative finite number — dropped`);
      continue;
    }
    out[f] = n;
  }
  if (Object.keys(out).length === 0) return undefined;
  return out;
}

export function parseDispatchDag(
  value: unknown,
  ownerLabel: string,
  warnings: string[],
): DispatchDag | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    warnings.push(`${ownerLabel}: dispatch_dag must be an object — dropped`);
    return undefined;
  }
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.nodes)) {
    warnings.push(`${ownerLabel}: dispatch_dag.nodes must be an array — dropped`);
    return undefined;
  }
  const nodes: SubagentDispatchSpec[] = [];
  for (let i = 0; i < v.nodes.length; i++) {
    const raw = v.nodes[i];
    const label = `dispatch_dag.nodes[${i}]`;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      warnings.push(`${ownerLabel}: ${label} must be an object — skipped`);
      continue;
    }
    const n = raw as Record<string, unknown>;
    if (typeof n.id !== 'string' || n.id.length === 0) {
      warnings.push(`${ownerLabel}: ${label} missing/invalid "id" string — skipped`);
      continue;
    }
    if (typeof n.subagent_type_id !== 'string' || n.subagent_type_id.length === 0) {
      warnings.push(`${ownerLabel}: ${label} missing/invalid "subagent_type_id" string — skipped`);
      continue;
    }
    if (typeof n.prompt_template !== 'string') {
      warnings.push(`${ownerLabel}: ${label} missing/invalid "prompt_template" string — skipped`);
      continue;
    }
    if (typeof n.output_file !== 'string' || n.output_file.length === 0) {
      warnings.push(`${ownerLabel}: ${label} missing/invalid "output_file" string — skipped`);
      continue;
    }
    let depends_on: string[] | undefined;
    if (n.depends_on !== undefined) {
      if (!Array.isArray(n.depends_on)) {
        warnings.push(`${ownerLabel}: ${label} depends_on must be an array of strings — dropped`);
      } else {
        const arr: string[] = [];
        for (let j = 0; j < n.depends_on.length; j++) {
          const dep = n.depends_on[j];
          if (typeof dep !== 'string' || dep.length === 0) {
            warnings.push(`${ownerLabel}: ${label} depends_on[${j}] must be a non-empty string — skipped`);
            continue;
          }
          arr.push(dep);
        }
        if (arr.length > 0) depends_on = arr;
      }
    }
    let budget: DispatchBudget | undefined;
    if (n.budget !== undefined) {
      budget = parseDispatchBudget(n.budget, ownerLabel, label, warnings);
    }
    nodes.push({
      id: n.id,
      subagent_type_id: n.subagent_type_id,
      prompt_template: n.prompt_template,
      output_file: n.output_file,
      ...(depends_on !== undefined && { depends_on }),
      ...(budget !== undefined && { budget }),
    });
  }
  if (nodes.length === 0) return undefined;
  let aggregate_to: string | undefined;
  if (v.aggregate_to !== undefined) {
    if (typeof v.aggregate_to === 'string' && v.aggregate_to.length > 0) {
      aggregate_to = v.aggregate_to;
    } else {
      warnings.push(`${ownerLabel}: dispatch_dag.aggregate_to must be a non-empty string — dropped`);
    }
  }
  return {
    nodes,
    ...(aggregate_to !== undefined && { aggregate_to }),
  };
}

const ARTIFACT_FORMATS: readonly ArtifactFormat[] = ['markdown', 'plaintext'];

function parseArtifactSpec(
  value: unknown,
  fieldName: string,
  warnings: string[],
): ArtifactSpec | undefined {
  if (typeof value !== 'object' || value === null) {
    warnings.push(`${fieldName}: must be an object — dropped`);
    return undefined;
  }
  const v = value as Record<string, unknown>;
  if (typeof v.path !== 'string') {
    warnings.push(`${fieldName}: missing/invalid "path" string — dropped`);
    return undefined;
  }
  let format: ArtifactFormat | undefined;
  if (v.format !== undefined) {
    if (typeof v.format === 'string' && (ARTIFACT_FORMATS as readonly string[]).includes(v.format)) {
      format = v.format as ArtifactFormat;
    } else {
      warnings.push(`${fieldName}: unknown format "${String(v.format)}" — defaulted to 'markdown'`);
      format = 'markdown';
    }
  }
  let schema: Record<string, unknown> | undefined;
  if (v.schema !== undefined) {
    if (typeof v.schema === 'object' && v.schema !== null && !Array.isArray(v.schema)) {
      schema = v.schema as Record<string, unknown>;
    } else {
      warnings.push(`${fieldName}: schema must be an object — dropped`);
    }
  }
  let conditional_paths: ConditionalPath[] | undefined;
  if (v.conditional_paths !== undefined) {
    conditional_paths = parseConditionalPaths(v.conditional_paths, fieldName, warnings);
    if (conditional_paths.length === 0) conditional_paths = undefined;
  }
  let invariants: ArtifactInvariant[] | undefined;
  if (v.invariants !== undefined) {
    invariants = parseArtifactInvariants(v.invariants, fieldName, warnings);
    if (invariants.length === 0) invariants = undefined;
  }
  return {
    path: v.path,
    ...(format !== undefined && { format }),
    ...(schema !== undefined && { schema }),
    ...(conditional_paths !== undefined && { conditional_paths }),
    ...(invariants !== undefined && { invariants }),
  };
}

function parseConditionalPaths(
  value: unknown,
  fieldName: string,
  warnings: string[],
): ConditionalPath[] {
  if (!Array.isArray(value)) {
    warnings.push(`${fieldName}.conditional_paths must be an array — dropped`);
    return [];
  }
  const out: ConditionalPath[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry !== 'object' || entry === null) {
      warnings.push(`${fieldName}.conditional_paths[${i}]: not an object — skipped`);
      continue;
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.path !== 'string' || e.path.length === 0) {
      warnings.push(`${fieldName}.conditional_paths[${i}]: missing/empty "path" — skipped`);
      continue;
    }
    if (typeof e.when !== 'object' || e.when === null) {
      warnings.push(`${fieldName}.conditional_paths[${i}]: missing "when" — skipped`);
      continue;
    }
    const when = e.when as Record<string, unknown>;
    if (typeof when.expr !== 'string') {
      warnings.push(`${fieldName}.conditional_paths[${i}]: when.expr must be a string — skipped`);
      continue;
    }
    out.push({ when: { expr: when.expr }, path: e.path });
  }
  return out;
}

function parseArtifactInvariants(
  value: unknown,
  fieldName: string,
  warnings: string[],
): ArtifactInvariant[] {
  if (!Array.isArray(value)) {
    warnings.push(`${fieldName}.invariants must be an array — dropped`);
    return [];
  }
  const out: ArtifactInvariant[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry !== 'object' || entry === null) {
      warnings.push(`${fieldName}.invariants[${i}]: not an object — skipped`);
      continue;
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.when !== 'object' || e.when === null) {
      warnings.push(`${fieldName}.invariants[${i}]: missing "when" — skipped`);
      continue;
    }
    const when = e.when as Record<string, unknown>;
    if (typeof when.expr !== 'string') {
      warnings.push(`${fieldName}.invariants[${i}]: when.expr must be a string — skipped`);
      continue;
    }
    if (typeof e.enforce_field !== 'string' || e.enforce_field.length === 0) {
      warnings.push(`${fieldName}.invariants[${i}]: enforce_field must be a non-empty string — skipped`);
      continue;
    }
    if (typeof e.op !== 'string'
        || !(ARTIFACT_INVARIANT_OPS as readonly string[]).includes(e.op)) {
      warnings.push(
        `${fieldName}.invariants[${i}]: op must be one of ${ARTIFACT_INVARIANT_OPS.join(', ')} — skipped`,
      );
      continue;
    }
    if (
      typeof e.value !== 'number' &&
      typeof e.value !== 'string' &&
      typeof e.value !== 'boolean'
    ) {
      warnings.push(`${fieldName}.invariants[${i}]: value must be number|string|boolean — skipped`);
      continue;
    }
    out.push({
      when: { expr: when.expr },
      enforce_field: e.enforce_field,
      op: e.op as ArtifactInvariantOp,
      value: e.value,
    });
  }
  return out;
}

function parsePreflight(
  value: unknown,
  stageId: string,
  warnings: string[],
): PreflightCheck[] {
  if (!Array.isArray(value)) {
    warnings.push(`stage ${stageId}: preflight must be an array — dropped`);
    return [];
  }
  const out: PreflightCheck[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry !== 'object' || entry === null) {
      warnings.push(`stage ${stageId}: preflight[${i}] not an object — skipped`);
      continue;
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || e.id.length === 0) {
      warnings.push(`stage ${stageId}: preflight[${i}] missing/invalid "id" — skipped`);
      continue;
    }
    if (typeof e.input_artifact !== 'object' || e.input_artifact === null) {
      warnings.push(`stage ${stageId}: preflight[${i}] missing "input_artifact" — skipped`);
      continue;
    }
    const ia = e.input_artifact as Record<string, unknown>;
    if (typeof ia.stage !== 'string' || typeof ia.artifact !== 'string') {
      warnings.push(
        `stage ${stageId}: preflight[${i}].input_artifact requires "stage" + "artifact" strings — skipped`,
      );
      continue;
    }
    if (typeof e.on_fail !== 'string' || !(PREFLIGHT_ON_FAIL_VALUES as readonly string[]).includes(e.on_fail)) {
      warnings.push(
        `stage ${stageId}: preflight[${i}].on_fail must be one of ${PREFLIGHT_ON_FAIL_VALUES.join(', ')} — skipped`,
      );
      continue;
    }
    let must_have_sections: string[] | undefined;
    if (e.must_have_sections !== undefined) {
      const arr = parseStringArray(
        e.must_have_sections,
        `stage ${stageId}.preflight[${i}].must_have_sections`,
        warnings,
      );
      if (arr !== undefined && arr.length > 0) must_have_sections = arr;
    }
    let must_match_pattern: string | undefined;
    if (e.must_match_pattern !== undefined) {
      if (typeof e.must_match_pattern === 'string') {
        must_match_pattern = e.must_match_pattern;
      } else {
        warnings.push(`stage ${stageId}: preflight[${i}].must_match_pattern must be a string — dropped`);
      }
    }
    let custom: ConditionExpr | undefined;
    if (e.custom !== undefined) {
      if (typeof e.custom === 'object' && e.custom !== null) {
        const c = e.custom as Record<string, unknown>;
        if (typeof c.expr === 'string') {
          custom = { expr: c.expr };
        } else {
          warnings.push(`stage ${stageId}: preflight[${i}].custom.expr must be a string — dropped`);
        }
      } else {
        warnings.push(`stage ${stageId}: preflight[${i}].custom must be {expr} — dropped`);
      }
    }
    if (!must_have_sections && must_match_pattern === undefined && custom === undefined) {
      warnings.push(
        `stage ${stageId}: preflight[${i}] declares no check (need must_have_sections OR must_match_pattern OR custom)`,
      );
      // Still emit — validator (rule 25b) will flag.
    }
    out.push({
      id: e.id,
      input_artifact: { stage: ia.stage, artifact: ia.artifact },
      on_fail: e.on_fail as PreflightOnFail,
      ...(must_have_sections !== undefined && { must_have_sections }),
      ...(must_match_pattern !== undefined && { must_match_pattern }),
      ...(custom !== undefined && { custom }),
    });
  }
  return out;
}

function parseScopeByComplexity(
  value: unknown,
  stageId: string,
  warnings: string[],
): Partial<Record<TaskComplexity, ScopeOverride>> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    warnings.push(`stage ${stageId}: scope_by_complexity must be an object — dropped`);
    return undefined;
  }
  const v = value as Record<string, unknown>;
  const out: Partial<Record<TaskComplexity, ScopeOverride>> = {};
  for (const [key, raw] of Object.entries(v)) {
    if (!(TASK_COMPLEXITIES as readonly string[]).includes(key)) {
      warnings.push(
        `stage ${stageId}: scope_by_complexity unknown key "${key}" (expected ${TASK_COMPLEXITIES.join(', ')}) — skipped`,
      );
      continue;
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      warnings.push(`stage ${stageId}: scope_by_complexity.${key} must be an object — skipped`);
      continue;
    }
    const r = raw as Record<string, unknown>;
    const ov: { skip?: boolean; artifact_template_variant?: string; system_prompt_addendum?: string } = {};
    if (r.skip !== undefined) {
      if (typeof r.skip === 'boolean') ov.skip = r.skip;
      else warnings.push(`stage ${stageId}: scope_by_complexity.${key}.skip must be boolean — dropped`);
    }
    if (r.artifact_template_variant !== undefined) {
      if (typeof r.artifact_template_variant === 'string') {
        ov.artifact_template_variant = r.artifact_template_variant;
      } else {
        warnings.push(`stage ${stageId}: scope_by_complexity.${key}.artifact_template_variant must be a string — dropped`);
      }
    }
    if (r.system_prompt_addendum !== undefined) {
      if (typeof r.system_prompt_addendum === 'string') {
        ov.system_prompt_addendum = r.system_prompt_addendum;
      } else {
        warnings.push(`stage ${stageId}: scope_by_complexity.${key}.system_prompt_addendum must be a string — dropped`);
      }
    }
    out[key as TaskComplexity] = ov;
  }
  if (Object.keys(out).length === 0) return undefined;
  return out;
}

function parseComposedFrom(
  value: unknown,
  stageId: string,
  warnings: string[],
): ComposedFrom | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    warnings.push(`stage ${stageId}: composed_from must be an object — dropped`);
    return undefined;
  }
  const v = value as Record<string, unknown>;
  if (typeof v.methodology_id !== 'string' || v.methodology_id.length === 0) {
    warnings.push(`stage ${stageId}: composed_from.methodology_id must be a non-empty string — dropped`);
    return undefined;
  }
  if (typeof v.imported_at !== 'string' || v.imported_at.length === 0) {
    warnings.push(`stage ${stageId}: composed_from.imported_at must be a non-empty string — dropped`);
    return undefined;
  }
  let methodology_version: string | undefined;
  if (v.methodology_version !== undefined) {
    if (typeof v.methodology_version === 'string') {
      methodology_version = v.methodology_version;
    } else if (typeof v.methodology_version === 'number') {
      methodology_version = String(v.methodology_version);
    } else {
      warnings.push(`stage ${stageId}: composed_from.methodology_version must be a string — dropped`);
    }
  }
  let mode: string | undefined;
  if (v.mode !== undefined) {
    if (typeof v.mode === 'string') {
      mode = v.mode;
    } else {
      warnings.push(`stage ${stageId}: composed_from.mode must be a string — dropped`);
    }
  }
  let mapped_outputs: Record<string, string> | undefined;
  if (v.mapped_outputs !== undefined) {
    if (typeof v.mapped_outputs !== 'object' || v.mapped_outputs === null || Array.isArray(v.mapped_outputs)) {
      warnings.push(`stage ${stageId}: composed_from.mapped_outputs must be an object — dropped`);
    } else {
      const raw = v.mapped_outputs as Record<string, unknown>;
      const collected: Record<string, string> = {};
      for (const [k, val] of Object.entries(raw)) {
        if (typeof val !== 'string') {
          warnings.push(`stage ${stageId}: composed_from.mapped_outputs["${k}"] must be a string — skipped`);
          continue;
        }
        collected[k] = val;
      }
      if (Object.keys(collected).length > 0) mapped_outputs = collected;
    }
  }
  return {
    methodology_id: v.methodology_id,
    imported_at: v.imported_at,
    ...(methodology_version !== undefined && { methodology_version }),
    ...(mode !== undefined && { mode }),
    ...(mapped_outputs !== undefined && { mapped_outputs }),
  };
}

function parsePhasesFromArtifact(
  value: unknown,
  stageId: string,
  warnings: string[],
): PhasesFromArtifact | undefined {
  if (typeof value !== 'object' || value === null) {
    warnings.push(`stage ${stageId}: phases_from_artifact must be an object — dropped`);
    return undefined;
  }
  const v = value as Record<string, unknown>;
  if (typeof v.stage_id !== 'string') {
    warnings.push(`stage ${stageId}: phases_from_artifact.stage_id must be a string — dropped`);
    return undefined;
  }
  if (typeof v.artifact !== 'string') {
    warnings.push(`stage ${stageId}: phases_from_artifact.artifact must be a string — dropped`);
    return undefined;
  }
  if (typeof v.section !== 'string') {
    warnings.push(`stage ${stageId}: phases_from_artifact.section must be a string — dropped`);
    return undefined;
  }
  return { stage_id: v.stage_id, artifact: v.artifact, section: v.section };
}

function parsePhaseEdges(
  value: readonly unknown[],
  stageId: string,
  warnings: string[],
): PhaseEdge[] {
  const out: PhaseEdge[] = [];
  for (let i = 0; i < value.length; i++) {
    const raw = value[i];
    if (typeof raw !== 'object' || raw === null) {
      warnings.push(`stage ${stageId}: phase_edges[${i}] not an object — skipped`);
      continue;
    }
    const e = raw as Record<string, unknown>;
    if (typeof e.from !== 'string') {
      warnings.push(`stage ${stageId}: phase_edges[${i}] missing/invalid "from" — skipped`);
      continue;
    }
    if (typeof e.to !== 'string') {
      warnings.push(`stage ${stageId}: phase_edges[${i}] missing/invalid "to" — skipped`);
      continue;
    }
    if (typeof e.kind !== 'string' || (e.kind !== 'always' && e.kind !== 'gate-fail')) {
      warnings.push(`stage ${stageId}: phase_edges[${i}] kind must be 'always' or 'gate-fail' — skipped`);
      continue;
    }
    const kind = e.kind as 'always' | 'gate-fail';
    let maxCycles: number | undefined;
    if (e.maxCycles !== undefined) {
      if (kind !== 'gate-fail') {
        warnings.push(`stage ${stageId}: phase_edges[${i}] maxCycles only valid for kind='gate-fail' — dropped`);
      } else if (typeof e.maxCycles !== 'number' || !Number.isFinite(e.maxCycles)) {
        warnings.push(`stage ${stageId}: phase_edges[${i}] maxCycles must be a number — dropped`);
      } else {
        maxCycles = e.maxCycles;
      }
    }
    out.push({
      from: e.from,
      to: e.to,
      kind,
      ...(maxCycles !== undefined && { maxCycles }),
    });
  }
  return out;
}

function parseQuestions(value: readonly unknown[], stageId: string, warnings: string[]): Question[] {
  const out: Question[] = [];
  for (let i = 0; i < value.length; i++) {
    const raw = value[i];
    if (typeof raw !== 'object' || raw === null) {
      warnings.push(`stage ${stageId}: questions[${i}] not an object — skipped`);
      continue;
    }
    const q = raw as Record<string, unknown>;
    if (typeof q.id !== 'string') {
      warnings.push(`stage ${stageId}: questions[${i}] missing id — skipped`);
      continue;
    }
    if (typeof q.text !== 'string') {
      warnings.push(`stage ${stageId}: questions[${i}] missing text — skipped`);
      continue;
    }
    if (typeof q.kind !== 'string' || !(QUESTION_KINDS as readonly string[]).includes(q.kind)) {
      warnings.push(`stage ${stageId}: questions[${i}] unknown kind "${String(q.kind)}" — skipped`);
      continue;
    }
    const kind = q.kind as QuestionKind;

    let options: QuestionOption[] | undefined;
    if (Array.isArray(q.options)) {
      options = [];
      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j];
        if (typeof opt !== 'object' || opt === null) {
          warnings.push(`stage ${stageId}: questions[${i}].options[${j}] not an object — skipped`);
          continue;
        }
        const o = opt as Record<string, unknown>;
        if (typeof o.id !== 'string' || typeof o.label !== 'string') {
          warnings.push(`stage ${stageId}: questions[${i}].options[${j}] missing id/label — skipped`);
          continue;
        }
        options.push({ id: o.id, label: o.label });
      }
      if (options.length === 0) options = undefined;
    }
    if ((kind === 'choice' || kind === 'multi_choice') && !options) {
      warnings.push(`stage ${stageId}: questions[${i}] kind=${kind} requires options — skipped`);
      continue;
    }

    let next_rules: QuestionNextRule[] | undefined;
    if (Array.isArray(q.next_rules)) {
      next_rules = [];
      for (let j = 0; j < q.next_rules.length; j++) {
        const rule = q.next_rules[j];
        if (typeof rule !== 'object' || rule === null) {
          warnings.push(`stage ${stageId}: questions[${i}].next_rules[${j}] not an object — skipped`);
          continue;
        }
        const r = rule as Record<string, unknown>;
        if (typeof r.when_answer !== 'string' || typeof r.next_question_id !== 'string') {
          warnings.push(`stage ${stageId}: questions[${i}].next_rules[${j}] missing when_answer/next_question_id — skipped`);
          continue;
        }
        next_rules.push({ when_answer: r.when_answer, next_question_id: r.next_question_id });
      }
      if (next_rules.length === 0) next_rules = undefined;
    }

    out.push({
      id: q.id,
      text: q.text,
      kind,
      ...(options && { options }),
      ...(typeof q.required === 'boolean' && { required: q.required }),
      ...(typeof q.context_hint === 'string' && { context_hint: q.context_hint }),
      ...(next_rules && { next_rules }),
    });
  }
  return out;
}

function parsePhases(value: readonly unknown[], stageId: string, warnings: string[]): Phase[] {
  const out: Phase[] = [];
  for (let i = 0; i < value.length; i++) {
    const raw = value[i];
    if (typeof raw !== 'object' || raw === null) {
      warnings.push(`stage ${stageId}: phases[${i}] not an object — skipped`);
      continue;
    }
    const s = raw as Record<string, unknown>;
    if (typeof s.id !== 'string') {
      warnings.push(`stage ${stageId}: phases[${i}] missing id — skipped`);
      continue;
    }
    if (typeof s.name !== 'string') {
      warnings.push(`stage ${stageId}: phases[${i}] missing name — skipped`);
      continue;
    }
    const phaseId = s.id;

    let conditional_activation: ConditionExpr | undefined;
    if (s.conditional_activation !== undefined) {
      if (typeof s.conditional_activation === 'object' && s.conditional_activation !== null) {
        const ca = s.conditional_activation as Record<string, unknown>;
        if (typeof ca.expr === 'string') {
          conditional_activation = { expr: ca.expr };
        } else {
          warnings.push(`stage ${stageId}: phases[${i}].conditional_activation missing expr — dropped`);
        }
      } else {
        warnings.push(`stage ${stageId}: phases[${i}].conditional_activation must be {expr: string} — dropped`);
      }
    }

    let mode: StageMode | undefined;
    if (s.mode !== undefined) {
      if (typeof s.mode === 'string' && (VALID_MODES as readonly string[]).includes(s.mode)) {
        mode = s.mode as StageMode;
      } else {
        warnings.push(`stage ${stageId}: phases[${i}].mode unknown "${String(s.mode)}" — dropped`);
      }
    }

    let gate: Gate | undefined;
    if (s.gate !== undefined) {
      gate = parseGate(s.gate, `${stageId}/${phaseId}`, warnings);
    }

    let questions: Question[] | undefined;
    if (Array.isArray(s.questions)) {
      questions = parseQuestions(s.questions, `${stageId}/${phaseId}`, warnings);
      if (questions.length === 0) questions = undefined;
    }

    let dispatch_dag: DispatchDag | undefined;
    if (s.dispatch_dag !== undefined) {
      dispatch_dag = parseDispatchDag(s.dispatch_dag, `stage ${stageId}/${phaseId}`, warnings);
    }

    out.push({
      id: phaseId,
      name: s.name,
      ...(conditional_activation && { conditional_activation }),
      ...(mode && { mode }),
      ...(typeof s.prompt === 'string' && { prompt: s.prompt }),
      ...(gate && { gate }),
      ...(questions && { questions }),
      ...(dispatch_dag && { dispatch_dag }),
    });
  }
  return out;
}

function parseReviewers(value: readonly unknown[], stageId: string, warnings: string[]): ReviewerBinding[] {
  const arr: ReviewerBinding[] = [];
  for (let i = 0; i < value.length; i++) {
    const raw = value[i];
    if (typeof raw === 'string') {
      // shorthand: "req_traceability" → {reviewer_id, recommended: true}
      arr.push({ reviewer_id: raw, recommended: true });
    } else if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      if (typeof r.reviewer_id !== 'string') {
        warnings.push(`stage ${stageId}: reviewers[${i}] missing reviewer_id — skipped`);
        continue;
      }
      arr.push({
        reviewer_id: r.reviewer_id,
        ...(typeof r.recommended === 'boolean' && { recommended: r.recommended }),
      });
    } else {
      warnings.push(`stage ${stageId}: reviewers[${i}] not a string or object — skipped`);
    }
  }
  return arr;
}

function parseGate(value: unknown, stageId: string, warnings: string[]): Gate | undefined {
  if (typeof value !== 'object' || value === null) {
    warnings.push(`stage ${stageId}: gate must be an object — dropped`);
    return undefined;
  }
  const g = value as Record<string, unknown>;

  let kind: GateKind = 'standard';
  if (g.kind !== undefined) {
    if (typeof g.kind !== 'string' || !(GATE_KINDS as readonly string[]).includes(g.kind)) {
      warnings.push(`stage ${stageId}: gate.kind must be one of ${GATE_KINDS.join(', ')} — dropped`);
      return undefined;
    }
    kind = g.kind as GateKind;
  }

  if (!Array.isArray(g.items)) {
    warnings.push(`stage ${stageId}: gate.items must be an array — dropped`);
    return undefined;
  }

  const items: GateItem[] = [];
  for (let i = 0; i < g.items.length; i++) {
    const entry = g.items[i];
    if (typeof entry !== 'object' || entry === null) {
      warnings.push(`stage ${stageId}: gate.items[${i}] is not an object — skipped`);
      continue;
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string') {
      warnings.push(`stage ${stageId}: gate.items[${i}] missing/invalid "id" string — skipped`);
      continue;
    }
    if (typeof e.label !== 'string') {
      warnings.push(`stage ${stageId}: gate.items[${i}] missing/invalid "label" string — skipped`);
      continue;
    }
    let itemKind: GateItemKind;
    if (typeof e.kind !== 'string') {
      warnings.push(`stage ${stageId}: gate.items[${i}] "kind" must be a string — coerced to 'custom'`);
      itemKind = 'custom';
    } else if (!(GATE_ITEM_KINDS as readonly string[]).includes(e.kind)) {
      warnings.push(`stage ${stageId}: gate.items[${i}] unknown "kind" "${e.kind}" — coerced to 'custom' (allowed: ${GATE_ITEM_KINDS.join(', ')})`);
      itemKind = 'custom';
    } else {
      itemKind = e.kind as GateItemKind;
    }

    let auto_pass_when: ConditionExpr | undefined;
    if (e.auto_pass_when !== undefined) {
      if (typeof e.auto_pass_when !== 'object' || e.auto_pass_when === null) {
        warnings.push(`stage ${stageId}: gate.items[${i}].auto_pass_when must be an object — dropped`);
      } else {
        const apw = e.auto_pass_when as Record<string, unknown>;
        if (typeof apw.expr !== 'string') {
          warnings.push(`stage ${stageId}: gate.items[${i}].auto_pass_when.expr must be a string — dropped`);
        } else {
          auto_pass_when = { expr: apw.expr };
        }
      }
    }

    let hard_stop: boolean | undefined;
    if (e.hard_stop !== undefined) {
      if (typeof e.hard_stop !== 'boolean') {
        warnings.push(`stage ${stageId}: gate.items[${i}].hard_stop must be boolean — dropped`);
      } else {
        hard_stop = e.hard_stop;
      }
    }

    const item: GateItem = {
      id: e.id,
      label: e.label,
      kind: itemKind,
      ...(auto_pass_when !== undefined && { auto_pass_when }),
      ...(hard_stop !== undefined && { hard_stop }),
    };
    items.push(item);
  }

  return {
    kind,
    items,
  };
}

function parseRoleSplit(value: unknown, stageId: string, warnings: string[]): RoleSplit | undefined {
  if (typeof value !== 'object' || value === null) {
    warnings.push(`stage ${stageId}: role_split must be an object — dropped`);
    return undefined;
  }
  const v = value as Record<string, unknown>;
  if (typeof v.ai_does !== 'string' || typeof v.human_does !== 'string') {
    warnings.push(`stage ${stageId}: role_split requires "ai_does" and "human_does" string fields — dropped`);
    return undefined;
  }
  return { ai_does: v.ai_does, human_does: v.human_does };
}

function parseStageTools(value: unknown, stageId: string, warnings: string[]): StageTools | undefined {
  if (typeof value !== 'object' || value === null) {
    warnings.push(`stage ${stageId}: tools must be an object — dropped`);
    return undefined;
  }
  const v = value as Record<string, unknown>;
  const allowed = v.allowed !== undefined
    ? parseStringArray(v.allowed, `stage ${stageId}.tools.allowed`, warnings)
    : undefined;
  const required = v.required !== undefined
    ? parseStringArray(v.required, `stage ${stageId}.tools.required`, warnings)
    : undefined;
  const forbidden = v.forbidden !== undefined
    ? parseStringArray(v.forbidden, `stage ${stageId}.tools.forbidden`, warnings)
    : undefined;
  const hasAllowed = allowed && allowed.length > 0;
  const hasRequired = required && required.length > 0;
  const hasForbidden = forbidden && forbidden.length > 0;
  if (!hasAllowed && !hasRequired && !hasForbidden) return undefined;
  return {
    ...(hasAllowed && { allowed }),
    ...(hasRequired && { required }),
    ...(hasForbidden && { forbidden }),
  };
}

function parseStuckPolicy(value: unknown, stageId: string, warnings: string[]): StuckPolicy | undefined {
  if (typeof value !== 'object' || value === null) {
    warnings.push(`stage ${stageId}: stuck_policy must be an object — dropped`);
    return undefined;
  }
  const v = value as Record<string, unknown>;
  if (typeof v.max_attempts !== 'number' || !Number.isFinite(v.max_attempts) || v.max_attempts < 1) {
    warnings.push(`stage ${stageId}: stuck_policy.max_attempts must be a number >= 1 — dropped`);
    return undefined;
  }
  if (!Array.isArray(v.escalation_steps)) {
    warnings.push(`stage ${stageId}: stuck_policy.escalation_steps must be an array — dropped`);
    return undefined;
  }
  const steps: StuckEscalationStep[] = [];
  for (let i = 0; i < v.escalation_steps.length; i++) {
    const step = v.escalation_steps[i];
    if (typeof step !== 'string' || !(STUCK_ESCALATION_STEPS as readonly string[]).includes(step)) {
      warnings.push(`stage ${stageId}: stuck_policy.escalation_steps[${i}] invalid value "${String(step)}" — skipped`);
      continue;
    }
    steps.push(step as StuckEscalationStep);
  }
  if (steps.length === 0) {
    warnings.push(`stage ${stageId}: stuck_policy.escalation_steps has no valid values — dropped`);
    return undefined;
  }
  let error_compaction: boolean | undefined;
  if (v.error_compaction !== undefined) {
    if (typeof v.error_compaction !== 'boolean') {
      warnings.push(`stage ${stageId}: stuck_policy.error_compaction must be a boolean — dropped`);
    } else {
      error_compaction = v.error_compaction;
    }
  }
  return {
    max_attempts: v.max_attempts,
    escalation_steps: steps,
    ...(error_compaction !== undefined && { error_compaction }),
  };
}

function parseGatesSection(body: string): { rows: Array<{ from: string; to: string; condition: string; maxCycles?: number }>; found: boolean } {
  const lines = body.split(/\r?\n/);
  const gatesIdx = lines.findIndex((l) => /^##\s+GATES\b/i.test(l.trim()));
  if (gatesIdx < 0) return { rows: [], found: false };

  const rows: Array<{ from: string; to: string; condition: string; maxCycles?: number }> = [];
  for (let i = gatesIdx + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith('##')) break;          // next section
    if (line.length === 0) continue;
    if (line.startsWith('|') && line.includes('|')) {
      const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
      if (cells.length < 3) continue;
      // Skip separator rows: `---|---|---`
      if (cells.every((c) => /^[-:]+$/.test(c))) continue;
      // Header row — skip
      if (cells[0]!.toLowerCase() === 'from' && cells[1]!.toLowerCase() === 'to') continue;
      const [from, to, condition, maxCyclesStr] = cells;
      const row: { from: string; to: string; condition: string; maxCycles?: number } = {
        from: from!,
        to: to!,
        condition: condition ?? 'always',
      };
      if (maxCyclesStr !== undefined) {
        const n = Number.parseInt(maxCyclesStr, 10);
        if (!Number.isNaN(n)) row.maxCycles = n;
      }
      rows.push(row);
    }
  }
  return { rows, found: true };
}

function parseEdgesSection(
  body: string,
  warnings: string[],
  stageIds: ReadonlySet<string>,
): Edge[] | null {
  const lines = body.split(/\r?\n/);
  const edgesIdx = lines.findIndex((l) => /^##\s+EDGES\b/i.test(l.trim()));
  if (edgesIdx < 0) return null;

  const edges: Edge[] = [];
  let headers: string[] | null = null;

  for (let i = edgesIdx + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith('##')) break;
    if (line.length === 0) continue;
    if (!line.startsWith('|')) continue;

    const cells = line.split('|').map((c) => c.trim()).filter((c, idx, arr) => {
      if (idx === 0 && c.length === 0) return false;
      if (idx === arr.length - 1 && c.length === 0) return false;
      return true;
    });
    if (cells.length === 0) continue;
    if (cells.every((c) => /^[-:]+$/.test(c))) continue;

    if (headers === null) {
      headers = cells.map((c) => c.toLowerCase());
      continue;
    }

    const get = (key: string): string | undefined => {
      const idx = headers!.indexOf(key);
      return idx >= 0 && idx < cells.length ? cells[idx] : undefined;
    };

    const from = get('from');
    const to = get('to');
    const condition = (get('condition') ?? 'always').toLowerCase();
    const expr = get('expr');
    const maxCyclesStr = get('maxcycles');
    const increment = get('increment');
    const preserve = get('preserve');
    const incArr = increment ? increment.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const preArr = preserve ? preserve.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

    if (!from || !to) {
      warnings.push(`EDGES table: row missing from/to — skipped`);
      continue;
    }
    if (from !== 'start' && !stageIds.has(from)) {
      warnings.push(`EDGES table refers to unknown stage "${from}"`);
      continue;
    }
    if (to !== 'end' && !stageIds.has(to)) {
      warnings.push(`EDGES table refers to unknown stage "${to}"`);
      continue;
    }

    let cond: Edge['condition'];
    switch (condition) {
      case 'always':
        cond = { kind: 'always' };
        break;
      case 'gate-pass':
        cond = { kind: 'gate-pass' };
        break;
      case 'gate-fail': {
        const n = maxCyclesStr ? Number.parseInt(maxCyclesStr, 10) : Number.NaN;
        cond = Number.isNaN(n)
          ? { kind: 'gate-fail' }
          : { kind: 'gate-fail', maxCycles: n };
        break;
      }
      case 'branch':
        if (!expr) {
          warnings.push(`EDGES table: branch ${from}→${to} missing expr — skipped`);
          continue;
        }
        cond = { kind: 'branch', expr };
        break;
      case 'rollback': {
        const n = maxCyclesStr ? Number.parseInt(maxCyclesStr, 10) : Number.NaN;
        cond = Number.isNaN(n) ? { kind: 'rollback' } : { kind: 'rollback', maxCycles: n };
        break;
      }
      case 'recut': {
        const n = maxCyclesStr ? Number.parseInt(maxCyclesStr, 10) : Number.NaN;
        cond = Number.isNaN(n) ? { kind: 'recut' } : { kind: 'recut', maxCycles: n };
        break;
      }
      default:
        warnings.push(`EDGES table: unknown condition "${condition}" between ${from}→${to}`);
        continue;
    }
    edges.push({
      from,
      to,
      condition: cond,
      ...(incArr && incArr.length > 0 && { increment_counters_on_traverse: incArr }),
      ...(preArr && preArr.length > 0 && { preserve_counters_on_traverse: preArr }),
    });
  }
  return edges;
}

function deriveLinearEdges(stages: readonly Stage[]): Edge[] {
  if (stages.length === 0) return [];
  const edges: Edge[] = [
    { from: 'start', to: stages[0]!.id, condition: { kind: 'always' } },
  ];
  for (let i = 0; i < stages.length - 1; i++) {
    edges.push({
      from: stages[i]!.id,
      to: stages[i + 1]!.id,
      condition: { kind: 'always' },
    });
  }
  edges.push({
    from: stages[stages.length - 1]!.id,
    to: 'end',
    condition: { kind: 'always' },
  });
  return edges;
}
