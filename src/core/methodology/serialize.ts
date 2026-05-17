// src/core/methodology/serialize.ts
import yaml from 'js-yaml';
import type { Methodology, StageTools } from '../domain/methodology';

function isTrivialLinearFlow(m: Methodology): boolean {
  if (m.stages.length === 0) return m.edges.length === 0;
  const expected: Array<{ from: string; to: string }> = [];
  expected.push({ from: 'start', to: m.stages[0]!.id });
  for (let i = 0; i < m.stages.length - 1; i++) {
    expected.push({ from: m.stages[i]!.id, to: m.stages[i + 1]!.id });
  }
  expected.push({ from: m.stages[m.stages.length - 1]!.id, to: 'end' });
  if (m.edges.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    const e = m.edges[i]!;
    if (e.from !== expected[i]!.from) return false;
    if (e.to !== expected[i]!.to) return false;
    if (e.condition.kind !== 'always') return false;
  }
  return true;
}

export function serializeMethodology(m: Methodology): string {
  const front: Record<string, unknown> = {
    id: m.id,
    version: m.version,
    name: m.name,
    description: m.description,
  };
  if (m.author) front.author = m.author;
  if (m.deps) front.deps = m.deps;
  // v2 root fields:
  if (m.applicability && m.applicability.length > 0) front.applicability = m.applicability;
  if (m.anti_patterns && m.anti_patterns.length > 0) front.anti_patterns = m.anti_patterns;
  if (m.state_schema && m.state_schema.length > 0) front.state_schema = m.state_schema;
  if (m.modes && m.modes.length > 0) front.modes = m.modes;
  if (m.layout?.positions && Object.keys(m.layout.positions).length > 0) {
    front.layout = { positions: m.layout.positions };
  }
  if (m.meta) Object.assign(front, m.meta);

  const out: string[] = [];
  out.push('---');
  out.push(yaml.dump(front).trimEnd());
  out.push('---');
  out.push('');

  for (const s of m.stages) {
    const header = s.name && s.name !== s.id
      ? `## Stage: ${s.id} — ${s.name}`
      : `## Stage: ${s.id}`;
    out.push(header);
    out.push(`mode: ${s.mode}`);
    out.push('');

    const directives: Record<string, unknown> = {};
    if (s.active_in_modes && s.active_in_modes.length > 0) directives.active_in_modes = s.active_in_modes;
    if (s.system_prompt_template) directives.system_prompt_template = s.system_prompt_template;
    if (s.user_view_template) directives.user_view_template = s.user_view_template;
    if (s.role_split) directives.role_split = s.role_split;
    if (s.tools && (
      (s.tools.allowed && s.tools.allowed.length > 0) ||
      (s.tools.required && s.tools.required.length > 0) ||
      (s.tools.forbidden && s.tools.forbidden.length > 0)
    )) {
      const t: StageTools = {
        ...(s.tools.allowed && s.tools.allowed.length > 0 && { allowed: s.tools.allowed }),
        ...(s.tools.required && s.tools.required.length > 0 && { required: s.tools.required }),
        ...(s.tools.forbidden && s.tools.forbidden.length > 0 && { forbidden: s.tools.forbidden }),
      };
      directives.tools = t;
    }
    if (s.corpus_reads && s.corpus_reads.length > 0) {
      directives.corpus_reads = s.corpus_reads.map((r) => ({
        path: r.path,
        content_type: r.content_type,
        purpose: r.purpose,
        ...(r.inject_into !== undefined && { inject_into: r.inject_into }),
      }));
    }
    if (s.skills_hint && s.skills_hint.length > 0) directives.skills_hint = s.skills_hint;
    if (s.execution_isolation) directives.execution_isolation = s.execution_isolation;
    if (s.confidence_threshold !== undefined) directives.confidence_threshold = s.confidence_threshold;
    if (s.stuck_policy) directives.stuck_policy = s.stuck_policy;
    if (s.reviewers && s.reviewers.length > 0) {
      // Emit shorthand string-array iff every binding is plain {recommended: true}
      const allPlain = s.reviewers.every((r) => r.recommended === true);
      directives.reviewers = allPlain
        ? s.reviewers.map((r) => r.reviewer_id)
        : s.reviewers.map((r) => ({
            reviewer_id: r.reviewer_id,
            ...(typeof r.recommended === 'boolean' && { recommended: r.recommended }),
          }));
    }
    if (s.tracker_template) directives.tracker_template = s.tracker_template;
    if (s.questions && s.questions.length > 0) directives.questions = s.questions;
    if (s.phases && s.phases.length > 0) directives.phases = s.phases;
    if (s.phases_source) directives.phases_source = s.phases_source;
    if (s.phases_from_artifact) directives.phases_from_artifact = s.phases_from_artifact;
    if (s.preflight && s.preflight.length > 0) {
      directives.preflight = s.preflight.map((p) => ({
        id: p.id,
        input_artifact: p.input_artifact,
        ...(p.must_have_sections && p.must_have_sections.length > 0 && { must_have_sections: p.must_have_sections }),
        ...(p.must_match_pattern !== undefined && { must_match_pattern: p.must_match_pattern }),
        ...(p.custom !== undefined && { custom: { expr: p.custom.expr } }),
        on_fail: p.on_fail,
      }));
    }
    if (s.scope_by_complexity) {
      const obj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(s.scope_by_complexity)) {
        if (!val) continue;
        const entry: Record<string, unknown> = {};
        if (val.skip !== undefined) entry.skip = val.skip;
        if (val.artifact_template_variant !== undefined) entry.artifact_template_variant = val.artifact_template_variant;
        if (val.system_prompt_addendum !== undefined) entry.system_prompt_addendum = val.system_prompt_addendum;
        obj[key] = entry;
      }
      if (Object.keys(obj).length > 0) directives.scope_by_complexity = obj;
    }
    if (s.composed_from) {
      const cf = s.composed_from;
      directives.composed_from = {
        methodology_id: cf.methodology_id,
        ...(cf.methodology_version !== undefined && { methodology_version: cf.methodology_version }),
        ...(cf.mode !== undefined && { mode: cf.mode }),
        ...(cf.mapped_outputs !== undefined && { mapped_outputs: cf.mapped_outputs }),
        imported_at: cf.imported_at,
      };
    }
    if (s.phase_edges && s.phase_edges.length > 0) directives.phase_edges = s.phase_edges;
    if (s.dispatch_dag && s.dispatch_dag.nodes.length > 0) {
      directives.dispatch_dag = s.dispatch_dag;
    }
    if (s.context_essentials && s.context_essentials.length > 0) {
      directives.context_essentials = s.context_essentials;
    }
    // Explicit contract I/O — emitted only when non-default to preserve v1 byte-shape.
    if (s.contract.input.length > 0) {
      directives.inputs = s.contract.input;
    }
    const defaultOutputPath = `${s.id}.md`;
    const hasConditionalPaths = s.contract.output.conditional_paths
      && s.contract.output.conditional_paths.length > 0;
    const hasInvariants = s.contract.output.invariants
      && s.contract.output.invariants.length > 0;
    if (
      s.contract.output.path !== defaultOutputPath ||
      s.contract.output.format !== undefined ||
      s.contract.output.schema !== undefined ||
      hasConditionalPaths ||
      hasInvariants
    ) {
      const outputObj: Record<string, unknown> = { path: s.contract.output.path };
      if (s.contract.output.format) outputObj.format = s.contract.output.format;
      if (s.contract.output.schema) outputObj.schema = s.contract.output.schema;
      if (hasConditionalPaths) {
        outputObj.conditional_paths = s.contract.output.conditional_paths!.map((cp) => ({
          when: { expr: cp.when.expr },
          path: cp.path,
        }));
      }
      if (hasInvariants) {
        outputObj.invariants = s.contract.output.invariants!.map((iv) => ({
          when: { expr: iv.when.expr },
          enforce_field: iv.enforce_field,
          op: iv.op,
          value: iv.value,
        }));
      }
      directives.output = outputObj;
    }
    if (s.gate) directives.gate = s.gate;

    if (Object.keys(directives).length > 0) {
      out.push('```yaml');
      out.push(yaml.dump(directives).trimEnd());
      out.push('```');
      out.push('');
    }

    // Emit `<!-- AI: ... -->` blocks before the prompt body. Single-line
    // directives inline; multi-line directives use the canonical
    // `<!-- AI:\n...\n-->` shape so round-trip preserves internal newlines.
    if (s.ai_directives && s.ai_directives.length > 0) {
      for (const directive of s.ai_directives) {
        if (directive.includes('\n')) {
          out.push('<!-- AI:');
          out.push(directive);
          out.push('-->');
        } else {
          out.push(`<!-- AI: ${directive} -->`);
        }
        out.push('');
      }
    }

    if (s.prompt) {
      out.push(s.prompt.trimEnd());
      out.push('');
    }
  }

  const isLinear = isTrivialLinearFlow(m);
  if (!isLinear) {
    out.push('## EDGES');
    out.push('');
    const anyV2Cols = m.edges.some(
      (e) =>
        (e.increment_counters_on_traverse && e.increment_counters_on_traverse.length > 0) ||
        (e.preserve_counters_on_traverse && e.preserve_counters_on_traverse.length > 0),
    );
    if (anyV2Cols) {
      out.push('| from | to | condition | expr | maxCycles | increment | preserve |');
      out.push('|------|----|-----------|------|-----------|-----------|----------|');
    } else {
      out.push('| from | to | condition | expr | maxCycles |');
      out.push('|------|----|-----------|------|-----------|');
    }
    for (const e of m.edges) {
      const expr = e.condition.kind === 'branch' ? e.condition.expr : '';
      const mc = ('maxCycles' in e.condition && e.condition.maxCycles !== undefined)
        ? String(e.condition.maxCycles)
        : '';
      if (anyV2Cols) {
        const inc = e.increment_counters_on_traverse?.join(',') ?? '';
        const pre = e.preserve_counters_on_traverse?.join(',') ?? '';
        out.push(`| ${e.from} | ${e.to} | ${e.condition.kind} | ${expr} | ${mc} | ${inc} | ${pre} |`);
      } else {
        out.push(`| ${e.from} | ${e.to} | ${e.condition.kind} | ${expr} | ${mc} |`);
      }
    }
    out.push('');
  }

  return out.join('\n');
}
