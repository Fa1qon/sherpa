// src/core/methodology/validate.ts
import type { Methodology, Edge, DispatchDag } from '../domain/methodology';
import { CORPUS_CONTENT_TYPES, CORPUS_INJECT_TARGETS } from '../domain/methodology';
import { parseConditionExpr } from '../domain/condition_expr';
import { TASK_COMPLEXITIES } from '../domain/task';

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly string[] };

export function validateMethodology(m: Methodology): ValidationResult {
  const errors: string[] = [];
  const stageIds = new Set(m.stages.map((s) => s.id));

  // 1. Every edge references known stages (or 'start' / 'end' sentinels)
  for (const e of m.edges) {
    if (e.from !== 'start' && !stageIds.has(e.from)) {
      errors.push(`edge references unknown stage "${e.from}"`);
    }
    if (e.to !== 'end' && !stageIds.has(e.to)) {
      errors.push(`edge references unknown stage "${e.to}"`);
    }
  }

  // 2. Reachability from 'start'
  const reachable = traverseFrom('start', m.edges);
  for (const stage of m.stages) {
    if (!reachable.has(stage.id)) {
      errors.push(`stage "${stage.id}" is unreachable from start`);
    }
  }

  // 3. Cycles without gate-fail+maxCycles
  const cycleErrors = detectCycles(m.edges);
  for (const e of cycleErrors) errors.push(e);

  // 4. Counter references — edges, gates, state_schema cross-check
  const declaredFlags = new Set((m.state_schema ?? []).map((f) => f.id));
  for (const e of m.edges) {
    for (const c of e.increment_counters_on_traverse ?? []) {
      if (!declaredFlags.has(c)) {
        errors.push(`edge ${e.from}→${e.to}: increment refers to undeclared state_flag "${c}"`);
      }
    }
    for (const c of e.preserve_counters_on_traverse ?? []) {
      if (!declaredFlags.has(c)) {
        errors.push(`edge ${e.from}→${e.to}: preserve refers to undeclared state_flag "${c}"`);
      }
    }
  }

  // 5. Gate items — unique ids per gate
  for (const s of m.stages) {
    if (!s.gate) continue;
    const seen = new Set<string>();
    for (const item of s.gate.items) {
      if (seen.has(item.id)) {
        errors.push(`stage ${s.id} gate: duplicate item id "${item.id}"`);
      }
      seen.add(item.id);
    }
  }

  // 6. Confidence threshold sanity per stage
  for (const s of m.stages) {
    if (s.confidence_threshold !== undefined &&
        (s.confidence_threshold < 0 || s.confidence_threshold > 1)) {
      errors.push(`stage ${s.id}: confidence_threshold must be in 0..1`);
    }
  }

  // 7. Phases: ids unique within parent
  for (const s of m.stages) {
    if (!s.phases) continue;
    const seen = new Set<string>();
    for (const ss of s.phases) {
      if (seen.has(ss.id)) errors.push(`stage ${s.id}: duplicate phase id "${ss.id}"`);
      seen.add(ss.id);
    }
  }

  // 8. Question next_rules — refer to a sibling question id or 'end'
  for (const s of m.stages) {
    const qList = s.questions ?? [];
    const qIds = new Set(qList.map((q) => q.id));
    qIds.add('end');
    for (const q of qList) {
      for (const r of q.next_rules ?? []) {
        if (!qIds.has(r.next_question_id)) {
          errors.push(`stage ${s.id} question ${q.id}: next_rules points to unknown question "${r.next_question_id}"`);
        }
      }
    }
  }

  // 9. phases_source consistency
  for (const s of m.stages) {
    if (s.phases_source === 'from_artifact') {
      if (!s.phases_from_artifact) {
        errors.push(`stage ${s.id}: phases_source='from_artifact' requires phases_from_artifact`);
      }
      if (s.phases && s.phases.length > 0) {
        errors.push(`stage ${s.id}: phases_source='from_artifact' disallows inline phases`);
      }
      if (s.phases_from_artifact && !m.stages.some((ss) => ss.id === s.phases_from_artifact!.stage_id)) {
        errors.push(`stage ${s.id}: phases_from_artifact.stage_id "${s.phases_from_artifact.stage_id}" not found`);
      }
    }
  }

  // 10. phase_edges reference valid phase ids
  for (const s of m.stages) {
    if (!s.phase_edges || !s.phases) continue;
    const phaseIds = new Set(s.phases.map((p) => p.id));
    phaseIds.add('end');
    for (const e of s.phase_edges) {
      if (!phaseIds.has(e.from)) errors.push(`stage ${s.id}: phase_edge from unknown phase "${e.from}"`);
      if (!phaseIds.has(e.to)) errors.push(`stage ${s.id}: phase_edge to unknown phase "${e.to}"`);
    }
  }

  // 11. context_essentials refs valid
  for (const s of m.stages) {
    for (const ref of s.context_essentials ?? []) {
      if (!m.stages.some((ss) => ss.id === ref.stage)) {
        errors.push(`stage ${s.id}: context_essentials refers to unknown stage "${ref.stage}"`);
      }
    }
  }

  // 12. contract.input refs valid
  for (const s of m.stages) {
    for (const ref of s.contract.input) {
      const src = m.stages.find((ss) => ss.id === ref.stage);
      if (!src) {
        errors.push(`stage ${s.id}: input refers to unknown stage "${ref.stage}"`);
        continue;
      }
      if (src.contract.output.path !== ref.artifact) {
        errors.push(`stage ${s.id}: input artifact "${ref.artifact}" doesn't match stage ${ref.stage} output path "${src.contract.output.path}"`);
      }
    }
  }

  // 15. Every active_in_modes entry must reference a declared methodology mode.
  const declaredModeIds = new Set((m.modes ?? []).map((mode) => mode.id));
  for (const s of m.stages) {
    if (!s.active_in_modes) continue;
    for (const modeId of s.active_in_modes) {
      if (!declaredModeIds.has(modeId)) {
        errors.push(`stage ${s.id}: active_in_modes refers to unknown mode "${modeId}"`);
      }
    }
  }

  // 16. At most one mode may be marked default.
  if (m.modes) {
    const defaults = m.modes.filter((mode) => mode.default === true);
    if (defaults.length > 1) {
      errors.push(
        `modes: multiple defaults declared (${defaults.map((d) => d.id).join(', ')}); at most one mode may be default`,
      );
    }
  }

  // 17. If modes declared, at least one stage must be unconditionally active
  // (active_in_modes undefined or empty) — else some mode might end up with
  // an empty pipeline.
  if (m.modes && m.modes.length > 0) {
    const hasUnconditional = m.stages.some(
      (s) => s.active_in_modes === undefined || s.active_in_modes.length === 0,
    );
    if (!hasUnconditional) {
      errors.push(
        `modes declared but every stage is mode-gated; at least one stage must be active in all modes`,
      );
    }
  }

  // 18-20. corpus_reads per-entry validation
  for (const s of m.stages) {
    if (!s.corpus_reads) continue;
    for (let i = 0; i < s.corpus_reads.length; i++) {
      const r = s.corpus_reads[i]!;
      // Rule 18: path non-empty.
      if (typeof r.path !== 'string' || r.path.length === 0) {
        errors.push(`stage ${s.id}: corpus_reads[${i}] path must be non-empty`);
      }
      // Rule 19: content_type ∈ enum.
      if (!(CORPUS_CONTENT_TYPES as readonly string[]).includes(r.content_type)) {
        errors.push(
          `stage ${s.id}: corpus_reads[${i}] content_type "${String(r.content_type)}" not in {${CORPUS_CONTENT_TYPES.join(', ')}}`,
        );
      }
      // Rule 20: inject_into ∈ enum when present (engine defaults to 'system_prompt' at consumption).
      if (r.inject_into !== undefined
          && !(CORPUS_INJECT_TARGETS as readonly string[]).includes(r.inject_into)) {
        errors.push(
          `stage ${s.id}: corpus_reads[${i}] inject_into "${String(r.inject_into)}" not in {${CORPUS_INJECT_TARGETS.join(', ')}}`,
        );
      }
    }
  }

  // 21-24. dispatch_dag validation per stage/phase
  for (const s of m.stages) {
    if (s.dispatch_dag) {
      validateDispatchDag(s.dispatch_dag, `stage ${s.id}`, errors);
    }
    if (s.phases) {
      for (const p of s.phases) {
        if (p.dispatch_dag) {
          validateDispatchDag(p.dispatch_dag, `stage ${s.id}/${p.id}`, errors);
        }
      }
    }
  }

  // 25. Preflight checks: input_artifact.stage exists; at least one check
  //     field; on_fail='rollback' requires a rollback edge from this stage.
  for (const s of m.stages) {
    if (!s.preflight) continue;
    for (let i = 0; i < s.preflight.length; i++) {
      const pf = s.preflight[i]!;
      if (!stageIds.has(pf.input_artifact.stage)) {
        errors.push(
          `stage ${s.id}: preflight[${i}] "${pf.id}" input_artifact references unknown stage "${pf.input_artifact.stage}"`,
        );
      }
      // 25b. Must declare at least one check.
      if (
        (!pf.must_have_sections || pf.must_have_sections.length === 0) &&
        pf.must_match_pattern === undefined &&
        pf.custom === undefined
      ) {
        errors.push(
          `stage ${s.id}: preflight[${i}] "${pf.id}" must declare at least one of must_have_sections / must_match_pattern / custom`,
        );
      }
      // 26. on_fail='rollback' requires an outbound rollback edge from this stage.
      if (pf.on_fail === 'rollback') {
        const hasRollbackEdge = m.edges.some(
          (e) => e.from === s.id && e.condition.kind === 'rollback',
        );
        if (!hasRollbackEdge) {
          errors.push(
            `stage ${s.id}: preflight[${i}] "${pf.id}" on_fail='rollback' but stage has no outbound rollback edge`,
          );
        }
      }
      // 28a. custom ConditionExpr must parse.
      if (pf.custom !== undefined) {
        const r = parseConditionExpr(pf.custom.expr);
        if (!r.ok) {
          errors.push(
            `stage ${s.id}: preflight[${i}] "${pf.id}" custom.expr does not parse: ${r.message}`,
          );
        }
      }
    }
  }

  // 27. scope_by_complexity keys ⊆ {C1, C2, C3, C4}.
  for (const s of m.stages) {
    if (!s.scope_by_complexity) continue;
    for (const key of Object.keys(s.scope_by_complexity)) {
      if (!(TASK_COMPLEXITIES as readonly string[]).includes(key)) {
        errors.push(
          `stage ${s.id}: scope_by_complexity has unknown key "${key}" (expected one of ${TASK_COMPLEXITIES.join(', ')})`,
        );
      }
    }
  }

  // 28b. ConditionalPath.when and ArtifactInvariant.when must parse.
  for (const s of m.stages) {
    const cps = s.contract.output.conditional_paths;
    if (cps) {
      for (let i = 0; i < cps.length; i++) {
        const r = parseConditionExpr(cps[i]!.when.expr);
        if (!r.ok) {
          errors.push(
            `stage ${s.id}: output.conditional_paths[${i}].when does not parse: ${r.message}`,
          );
        }
      }
    }
    const invs = s.contract.output.invariants;
    if (invs) {
      for (let i = 0; i < invs.length; i++) {
        const r = parseConditionExpr(invs[i]!.when.expr);
        if (!r.ok) {
          errors.push(
            `stage ${s.id}: output.invariants[${i}].when does not parse: ${r.message}`,
          );
        }
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function validateDispatchDag(dag: DispatchDag, ownerLabel: string, errors: string[]): void {
  // Rule 24: unique id within DAG
  const ids = new Set<string>();
  const dupIds = new Set<string>();
  for (const n of dag.nodes) {
    if (ids.has(n.id)) dupIds.add(n.id);
    ids.add(n.id);
  }
  for (const dup of dupIds) {
    errors.push(`${ownerLabel} dispatch_dag: duplicate node id "${dup}"`);
  }

  // Rule 21: depends_on refs must exist among sibling node ids
  for (const n of dag.nodes) {
    for (const dep of n.depends_on ?? []) {
      if (!ids.has(dep)) {
        errors.push(`${ownerLabel} dispatch_dag: node "${n.id}" depends_on unknown node "${dep}"`);
      }
    }
  }

  // Rule 23: at least one node has empty depends_on (Wave 1 root)
  if (dag.nodes.length > 0) {
    const hasRoot = dag.nodes.some((n) => !n.depends_on || n.depends_on.length === 0);
    if (!hasRoot) {
      errors.push(`${ownerLabel} dispatch_dag: no Wave 1 root node (every node has depends_on)`);
    }
  }

  // Rule 22: DAG must be acyclic (3-color DFS over known ids only)
  const adj = new Map<string, string[]>();
  for (const n of dag.nodes) {
    const deps = (n.depends_on ?? []).filter((d) => ids.has(d));
    // Edge dep → n means "n depends on dep"; we walk from dep to dependents.
    for (const dep of deps) {
      if (!adj.has(dep)) adj.set(dep, []);
      adj.get(dep)!.push(n.id);
    }
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const reported = new Set<string>();
  function dfs(node: string, path: string[]): void {
    color.set(node, GRAY);
    for (const child of adj.get(node) ?? []) {
      const cc = color.get(child) ?? WHITE;
      if (cc === GRAY) {
        const start = path.indexOf(child);
        const loop = (start >= 0 ? path.slice(start) : path).concat(child);
        const key = loop.join('→');
        if (!reported.has(key)) {
          reported.add(key);
          errors.push(`${ownerLabel} dispatch_dag: cycle detected: ${loop.join(' → ')}`);
        }
      } else if (cc === WHITE) {
        dfs(child, [...path, child]);
      }
    }
    color.set(node, BLACK);
  }
  for (const id of ids) {
    if ((color.get(id) ?? WHITE) === WHITE) dfs(id, [id]);
  }
}

function traverseFrom(from: string, edges: readonly Edge[]): Set<string> {
  const visited = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const e of edges) {
      if (e.from === cur && !visited.has(e.to)) stack.push(e.to);
    }
  }
  return visited;
}

function detectCycles(edges: readonly Edge[]): string[] {
  // Build adjacency only over edges that allow unconditional traversal — gate-fail
  // edges are bounded by maxCycles so they don't count.
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (e.condition.kind === 'gate-fail') continue;
    if (e.condition.kind === 'rollback') continue;
    if (e.condition.kind === 'recut') continue;
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }

  const errors: string[] = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();

  function dfs(node: string, path: string[]): void {
    color.set(node, GRAY);
    const next = adj.get(node) ?? [];
    for (const child of next) {
      if (color.get(child) === GRAY) {
        const start = path.indexOf(child);
        const loop = (start >= 0 ? path.slice(start) : path).concat(child);
        errors.push(`cycle detected without gate-fail bound: ${loop.join(' → ')}`);
      } else if ((color.get(child) ?? WHITE) === WHITE) {
        dfs(child, [...path, child]);
      }
    }
    color.set(node, BLACK);
  }

  const starts = new Set(['start', ...edges.map((e) => e.from)]);
  for (const s of starts) {
    if ((color.get(s) ?? WHITE) === WHITE) dfs(s, [s]);
  }
  return errors;
}
