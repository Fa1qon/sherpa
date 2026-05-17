import yaml from 'js-yaml';
import type { Methodology, Stage, Edge } from '../domain/methodology';

export function serializeMethodologyYaml(m: Methodology): string {
  const root: Record<string, unknown> = {
    id: m.id,
    version: m.version,
    name: m.name,
  };

  if (m.description) root.description = m.description;
  if (m.author) root.author = m.author;
  if (m.anti_patterns && m.anti_patterns.length > 0) root.anti_patterns = m.anti_patterns;
  if (m.applicability && m.applicability.length > 0) root.applicability = m.applicability;
  if (m.deps && m.deps.length > 0) root.deps = m.deps;
  if (m.meta && Object.keys(m.meta).length > 0) root.meta = m.meta;

  root.stages = m.stages.map(serializeStage);

  // Only emit edges for non-linear flows. A linear flow is exactly:
  // start→stages[0], stages[0]→stages[1], ..., stages[n]→end with kind:'always'.
  if (!isLinearFlow(m)) {
    root.edges = m.edges.map((e) => ({
      from: e.from,
      to: e.to,
      condition: e.condition,
    }));
  }

  if (m.layout && Object.keys(m.layout).length > 0) root.layout = m.layout;

  return yaml.dump(root, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
}

function isLinearFlow(m: Methodology): boolean {
  if (!m.edges || m.edges.length === 0) return true;
  const expected: Edge[] = [
    { from: 'start', to: m.stages[0]?.id ?? 'end', condition: { kind: 'always' } },
    ...m.stages.slice(0, -1).map((s, i) => ({
      from: s.id,
      to: m.stages[i + 1]!.id,
      condition: { kind: 'always' as const },
    })),
    { from: m.stages[m.stages.length - 1]?.id ?? 'start', to: 'end', condition: { kind: 'always' } },
  ];
  if (m.edges.length !== expected.length) return false;
  return expected.every((exp, i) => {
    const e = m.edges[i];
    return e && e.from === exp.from && e.to === exp.to && e.condition.kind === 'always';
  });
}

function serializeStage(s: Stage): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: s.id,
    name: s.name,
    mode: s.mode,
    contract: {
      input: s.contract.input ?? [],
      output: s.contract.output,
    },
  };

  if (s.system_prompt_template) out.system_prompt_template = s.system_prompt_template;
  if (s.ai_directives && s.ai_directives.length > 0) out.ai_directives = s.ai_directives;
  if (s.gate) out.gate = s.gate;
  if (s.phases && s.phases.length > 0) out.phases = s.phases;
  if (s.corpus_reads && s.corpus_reads.length > 0) out.corpus_reads = s.corpus_reads;
  if (s.role_split) out.role_split = s.role_split;
  if (s.execution_isolation) out.execution_isolation = s.execution_isolation;
  if (s.confidence_threshold !== undefined) out.confidence_threshold = s.confidence_threshold;
  if (s.scope_by_complexity) out.scope_by_complexity = s.scope_by_complexity;
  if (s.preflight && s.preflight.length > 0) out.preflight = s.preflight;
  if (s.context_essentials && s.context_essentials.length > 0) out.context_essentials = s.context_essentials;
  if (s.active_in_modes && s.active_in_modes.length > 0) out.active_in_modes = s.active_in_modes;
  if (s.user_view_template) out.user_view_template = s.user_view_template;
  if (s.composed_from) out.composed_from = s.composed_from;
  if (s.dispatch_dag) out.dispatch_dag = s.dispatch_dag;
  if (s.stuck_policy) out.stuck_policy = s.stuck_policy;
  if (s.tools) out.tools = s.tools;
  if (s.skills_hint && s.skills_hint.length > 0) out.skills_hint = s.skills_hint;

  return out;
}
