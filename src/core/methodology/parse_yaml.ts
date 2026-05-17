import yaml from 'js-yaml';
import type {
  Methodology,
  Stage,
  Edge,
  StageMode,
  Gate,
  GateItem,
  GateItemKind,
  GateKind,
  Phase,
  CorpusRead,
  CorpusInjectTarget,
  CorpusContentType,
  RoleSplit,
  ExecutionIsolation,
  ArtifactSpec,
  ArtifactRef,
  Dep,
  ConditionExpr,
  EdgeCondition,
  CORPUS_CONTENT_TYPES,
} from '../domain/methodology';
import type { LoadMethodologyResult } from '../ports/methodology_port';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CorpusContentTypesRef = typeof CORPUS_CONTENT_TYPES;

const VALID_MODES: readonly StageMode[] = ['auto', 'interactive', 'gate'];
const VALID_ISOLATIONS: readonly ExecutionIsolation[] = ['inline', 'subagent', 'parallel_subagents'];
const VALID_GATE_KINDS: readonly GateKind[] = ['standard', 'comprehension'];
const VALID_GATE_ITEM_KINDS: readonly GateItemKind[] = [
  'artifact_written', 'reviewer_pass', 'user_confirmed', 'completeness_check', 'custom',
];
const VALID_EDGE_KINDS = ['always', 'gate-pass', 'gate-fail', 'branch', 'rollback', 'recut'] as const;
const VALID_CORPUS_CONTENT_TYPES: readonly CorpusContentType[] = ['markdown', 'yaml', 'json', 'template', 'plaintext'];
const VALID_CORPUS_INJECT_TARGETS: readonly CorpusInjectTarget[] = ['system_prompt', 'context_window', 'tool_accessible'];

function isString(v: unknown): v is string {
  return typeof v === 'string';
}
function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}
function asString(v: unknown, fallback = ''): string {
  return isString(v) ? v : fallback;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}
function asBoolean(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

// Helper to assign optional fields on readonly interfaces without TS errors.
function set<T>(obj: T, key: string, value: unknown): void {
  (obj as unknown as Record<string, unknown>)[key] = value;
}

function parseConditionExpr(raw: unknown): ConditionExpr | undefined {
  if (!isObject(raw)) return undefined;
  const expr = raw['expr'];
  if (!isString(expr)) return undefined;
  return { expr };
}

function parseGateItem(raw: unknown, warnings: string[]): GateItem | null {
  if (!isObject(raw)) return null;
  const id = asString(raw['id']);
  const label = asString(raw['label']);
  const kind = asString(raw['kind']);
  if (!id) { warnings.push('gate item missing id'); return null; }
  if (!VALID_GATE_ITEM_KINDS.includes(kind as GateItemKind)) {
    warnings.push(`unknown gate item kind: ${kind}`);
    return null;
  }
  const item: GateItem = {
    id,
    label: label || id,
    kind: kind as GateItemKind,
  };
  const awp = parseConditionExpr(raw['auto_pass_when']);
  if (awp) set(item, 'auto_pass_when', awp);
  const hs = asBoolean(raw['hard_stop']);
  if (hs !== undefined) set(item, 'hard_stop', hs);
  return item;
}

function parseGate(raw: unknown, warnings: string[]): Gate | undefined {
  if (!isObject(raw)) return undefined;
  const kind = asString(raw['kind'], 'standard');
  if (!VALID_GATE_KINDS.includes(kind as GateKind)) {
    warnings.push(`unknown gate kind: ${kind}`);
  }
  const rawItems = raw['items'];
  const items: GateItem[] = isArray(rawItems)
    ? rawItems.map((i) => parseGateItem(i, warnings)).filter((x): x is GateItem => x !== null)
    : [];
  return { kind: (VALID_GATE_KINDS.includes(kind as GateKind) ? kind : 'standard') as GateKind, items };
}

function parseCorpusRead(raw: unknown, warnings: string[]): CorpusRead | null {
  if (!isObject(raw)) return null;
  const p = raw['path'];
  if (!isString(p)) { warnings.push('corpus_read missing path'); return null; }
  const rawContentType = asString(raw['content_type'], 'markdown');
  const content_type: CorpusContentType = VALID_CORPUS_CONTENT_TYPES.includes(rawContentType as CorpusContentType)
    ? (rawContentType as CorpusContentType)
    : 'markdown';
  const rawInjectInto = asString(raw['inject_into'], 'system_prompt');
  const inject_into: CorpusInjectTarget = VALID_CORPUS_INJECT_TARGETS.includes(rawInjectInto as CorpusInjectTarget)
    ? (rawInjectInto as CorpusInjectTarget)
    : 'system_prompt';
  return {
    path: p,
    content_type,
    purpose: asString(raw['purpose'], p),
    inject_into,
  };
}

function parsePhase(raw: unknown, warnings: string[]): Phase | null {
  if (!isObject(raw)) return null;
  const id = asString(raw['id']);
  const name = asString(raw['name']);
  if (!id) { warnings.push('phase missing id'); return null; }
  const mode = asString(raw['mode']);
  const ph: Phase = { id, name: name || id };
  if (VALID_MODES.includes(mode as StageMode)) set(ph, 'mode', mode);
  const prompt = raw['prompt'];
  if (isString(prompt)) set(ph, 'prompt', prompt);
  const gate = parseGate(raw['gate'], warnings);
  if (gate) set(ph, 'gate', gate);
  return ph;
}

function parseArtifactRef(raw: unknown, warnings: string[]): ArtifactRef | null {
  if (!isObject(raw)) return null;
  const artifact = asString(raw['artifact']);
  const stage = asString(raw['stage']);
  if (!artifact) { warnings.push('artifact ref missing artifact'); return null; }
  return { artifact, stage };
}

function parseArtifactSpec(raw: unknown, warnings: string[]): ArtifactSpec {
  if (!isObject(raw)) { warnings.push('contract.output must be an object'); return { path: '' }; }
  const path = asString(raw['path']);
  if (!path) warnings.push('contract.output.path is required');
  const spec: ArtifactSpec = { path };
  const fmt = asString(raw['format']);
  if (fmt === 'markdown' || fmt === 'plaintext') set(spec, 'format', fmt);
  return spec;
}

function parseEdgeCondition(raw: unknown, warnings: string[]): EdgeCondition {
  if (!isObject(raw)) return { kind: 'always' };
  const kind = asString(raw['kind']);
  if (!VALID_EDGE_KINDS.includes(kind as typeof VALID_EDGE_KINDS[number])) {
    warnings.push(`unknown edge condition kind: ${kind}`);
    return { kind: 'always' };
  }
  switch (kind) {
    case 'always': return { kind: 'always' };
    case 'gate-pass': return { kind: 'gate-pass' };
    case 'gate-fail': {
      const mc = asNumber(raw['maxCycles']);
      return mc !== undefined ? { kind: 'gate-fail', maxCycles: mc } : { kind: 'gate-fail' };
    }
    case 'rollback': {
      const mc = asNumber(raw['maxCycles']);
      return mc !== undefined ? { kind: 'rollback', maxCycles: mc } : { kind: 'rollback' };
    }
    case 'recut': {
      const mc = asNumber(raw['maxCycles']);
      return mc !== undefined ? { kind: 'recut', maxCycles: mc } : { kind: 'recut' };
    }
    case 'branch': {
      const expr = asString(raw['expr']);
      return { kind: 'branch', expr };
    }
    default: return { kind: 'always' };
  }
}

function parseStage(raw: unknown, warnings: string[]): Stage | null {
  if (!isObject(raw)) return null;
  const id = asString(raw['id']);
  const name = asString(raw['name']);
  const mode = asString(raw['mode']);
  if (!id) { warnings.push('stage missing id'); return null; }
  if (!VALID_MODES.includes(mode as StageMode)) {
    warnings.push(`stage ${id}: invalid mode "${mode}", defaulting to auto`);
  }

  const rawContract = raw['contract'];
  let contract: Stage['contract'] = { input: [], output: { path: '' } };
  if (isObject(rawContract)) {
    const rawInput = rawContract['input'];
    const input: ArtifactRef[] = isArray(rawInput)
      ? rawInput.map((r) => parseArtifactRef(r, warnings)).filter((x): x is ArtifactRef => x !== null)
      : [];
    const output = parseArtifactSpec(rawContract['output'], warnings);
    contract = { input, output };
  }

  const stage: Stage = {
    id,
    name: name || id,
    mode: (VALID_MODES.includes(mode as StageMode) ? mode : 'auto') as StageMode,
    contract,
  };

  const spt = raw['system_prompt_template'];
  if (isString(spt)) set(stage, 'system_prompt_template', spt);

  const directives = raw['ai_directives'];
  if (isArray(directives)) {
    set(stage, 'ai_directives', directives.filter(isString));
  }

  const gate = parseGate(raw['gate'], warnings);
  if (gate) set(stage, 'gate', gate);

  const rawPhases = raw['phases'];
  if (isArray(rawPhases)) {
    const phases = rawPhases
      .map((p) => parsePhase(p, warnings))
      .filter((x): x is Phase => x !== null);
    if (phases.length > 0) set(stage, 'phases', phases);
  }

  const rawCorpus = raw['corpus_reads'];
  if (isArray(rawCorpus)) {
    const corpus = rawCorpus
      .map((c) => parseCorpusRead(c, warnings))
      .filter((x): x is CorpusRead => x !== null);
    if (corpus.length > 0) set(stage, 'corpus_reads', corpus);
  }

  const rawRoleSplit = raw['role_split'];
  if (isObject(rawRoleSplit)) {
    set(stage, 'role_split', {
      ai_does: asString(rawRoleSplit['ai_does']),
      human_does: asString(rawRoleSplit['human_does']),
    } satisfies RoleSplit);
  }

  const isolation = asString(raw['execution_isolation']);
  if (VALID_ISOLATIONS.includes(isolation as ExecutionIsolation)) {
    set(stage, 'execution_isolation', isolation);
  }

  const ct = asNumber(raw['confidence_threshold']);
  if (ct !== undefined) set(stage, 'confidence_threshold', ct);

  // Pass-through complex optional fields validated by domain logic.
  for (const key of ['scope_by_complexity', 'preflight', 'context_essentials',
    'active_in_modes', 'user_view_template', 'composed_from', 'dispatch_dag',
    'stuck_policy', 'tools', 'skills_hint', 'tracker_template'] as const) {
    if (raw[key] !== undefined) set(stage, key, raw[key]);
  }

  return stage;
}

function parseDeps(raw: unknown): Dep[] {
  if (!isArray(raw)) return [];
  return raw.filter(isObject) as Dep[];
}

function parseEdges(raw: unknown, stages: readonly Stage[], warnings: string[]): Edge[] {
  if (!isArray(raw)) return deriveLinearEdges(stages);
  const edges: Edge[] = raw.filter(isObject).map((e) => ({
    from: asString(e['from']),
    to: asString(e['to']),
    condition: parseEdgeCondition(e['condition'], warnings),
  }));
  return edges.length > 0 ? edges : deriveLinearEdges(stages);
}

function deriveLinearEdges(stages: readonly Stage[]): Edge[] {
  if (stages.length === 0) return [];
  const edges: Edge[] = [
    { from: 'start', to: stages[0]!.id, condition: { kind: 'always' } },
  ];
  for (let i = 0; i < stages.length - 1; i++) {
    edges.push({ from: stages[i]!.id, to: stages[i + 1]!.id, condition: { kind: 'always' } });
  }
  edges.push({ from: stages[stages.length - 1]!.id, to: 'end', condition: { kind: 'always' } });
  return edges;
}

export function parseMethodologyYaml(source: string, _sourcePath: string): LoadMethodologyResult {
  const warnings: string[] = [];
  let raw: unknown;
  try {
    raw = yaml.load(source);
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'parse-error', message: `YAML parse error: ${(err as Error).message}` },
    };
  }

  if (!isObject(raw)) {
    return { ok: false, error: { kind: 'parse-error', message: 'YAML root must be a mapping object' } };
  }

  const id = asString(raw['id']);
  const name = asString(raw['name']);
  if (!id) return { ok: false, error: { kind: 'parse-error', message: 'missing required field: id' } };
  if (!name) return { ok: false, error: { kind: 'parse-error', message: 'missing required field: name' } };

  const rawStages = raw['stages'];
  if (!isArray(rawStages) || rawStages.length === 0) {
    return { ok: false, error: { kind: 'parse-error', message: 'stages must be a non-empty array' } };
  }

  const stages = rawStages
    .map((s) => parseStage(s, warnings))
    .filter((x): x is Stage => x !== null);

  if (stages.length === 0) {
    return { ok: false, error: { kind: 'parse-error', message: 'no valid stages parsed' } };
  }

  const edges = parseEdges(raw['edges'], stages, warnings);

  const methodology: Methodology = {
    id,
    version: asString(raw['version'], '1.0'),
    name,
    description: asString(raw['description']),
    stages,
    edges,
  };

  const author = asString(raw['author']);
  if (author) set(methodology, 'author', author);

  const anti = raw['anti_patterns'];
  if (isArray(anti)) set(methodology, 'anti_patterns', anti.filter(isString));

  const appl = raw['applicability'];
  if (isArray(appl)) set(methodology, 'applicability', appl.filter(isObject));

  const deps = parseDeps(raw['deps']);
  if (deps.length > 0) set(methodology, 'deps', deps);

  const layout = raw['layout'];
  if (isObject(layout)) set(methodology, 'layout', layout);

  const meta = raw['meta'];
  if (isObject(meta)) set(methodology, 'meta', meta);

  return { ok: true, methodology, warnings };
}
