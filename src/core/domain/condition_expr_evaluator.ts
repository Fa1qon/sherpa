/**
 * ConditionExpr stub evaluator.
 *
 * Walks an `AstNode` produced by `parseConditionExpr` against a mock
 * `{meta, signals}` context. Used by the live-simulation panel in the
 * editor — NOT wired to a real running task. Production evaluator lands
 * with the engine track and may diverge (audit hooks, real signal
 * sources, lazy resolution, etc.).
 *
 * Semantics:
 *   - AND/OR short-circuit; first error short-circuits and wins.
 *   - Predicate arity + arg-type errors are runtime errors, not parse
 *     errors (the parser accepts any arglist syntactically).
 *   - Missing meta paths resolve to `undefined`, which compares unequal
 *     to anything via `==` / `!=` (no error) and fails numeric ops with
 *     a type-mismatch reason.
 */

import type { AstNode, Value, ComparisonOp, AllowedPredicate } from './condition_expr';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EvaluatorContext {
  readonly meta: Readonly<Record<string, unknown>>;
  readonly signals: Readonly<{
    artifacts: ReadonlyArray<string>;
    reviewers_passed: ReadonlyArray<string>;
    confidence: 'low' | 'medium' | 'high';
    scope_changed: boolean;
    // OPTIONAL: a set of reviewer ids treated as "recommended" by the methodology.
    // Used by all_reviewers_passed('recommended'). The evaluator does not know
    // which reviewers a methodology marks recommended — caller passes the set.
    recommended_reviewers?: ReadonlyArray<string>;
    all_reviewers?: ReadonlyArray<string>;
  }>;
  /**
   * Produced-artifact frontmatter, used by `artifact.<field>` comparisons
   * and the `artifact_section_count(name)` predicate. Optional because
   * many evaluation sites (gate auto-pass, edge branch exprs) do not
   * involve an artifact. Stub-friendly convention for section counts:
   * `artifact['__sections_count_for_' + name]` holds the count.
   */
  readonly artifact?: Readonly<Record<string, unknown>>;
}

export type EvalResult =
  | { readonly ok: true; readonly value: boolean }
  | { readonly ok: false; readonly reason: string };

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function evaluateConditionExpr(ast: AstNode, ctx: EvaluatorContext): EvalResult {
  switch (ast.kind) {
    case 'or': {
      const l = evaluateConditionExpr(ast.left, ctx);
      if (!l.ok) return l;
      if (l.value) return { ok: true, value: true };
      return evaluateConditionExpr(ast.right, ctx);
    }
    case 'and': {
      const l = evaluateConditionExpr(ast.left, ctx);
      if (!l.ok) return l;
      if (!l.value) return { ok: true, value: false };
      return evaluateConditionExpr(ast.right, ctx);
    }
    case 'not': {
      const c = evaluateConditionExpr(ast.child, ctx);
      if (!c.ok) return c;
      return { ok: true, value: !c.value };
    }
    case 'predicate':
      return evalPredicate(ast.name, ast.args, ctx);
    case 'comparison':
      return evalComparison(ast.path, ast.op, ast.value, ctx);
  }
}

// ---------------------------------------------------------------------------
// Predicate dispatch
// ---------------------------------------------------------------------------

function evalPredicate(
  name: AllowedPredicate,
  args: ReadonlyArray<Value>,
  ctx: EvaluatorContext,
): EvalResult {
  switch (name) {
    case 'artifact_exists': {
      if (args.length !== 1 || args[0]?.vkind !== 'string') {
        return { ok: false, reason: `artifact_exists expects 1 string arg` };
      }
      return { ok: true, value: ctx.signals.artifacts.includes(args[0].v) };
    }
    case 'reviewer_passed': {
      if (args.length !== 1 || args[0]?.vkind !== 'string') {
        return { ok: false, reason: `reviewer_passed expects 1 string arg` };
      }
      return { ok: true, value: ctx.signals.reviewers_passed.includes(args[0].v) };
    }
    case 'all_reviewers_passed': {
      if (args.length !== 1 || args[0]?.vkind !== 'string') {
        return { ok: false, reason: `all_reviewers_passed expects 1 string arg` };
      }
      const scope = args[0].v;
      if (scope !== 'recommended' && scope !== 'all') {
        return { ok: false, reason: `all_reviewers_passed scope must be 'recommended' or 'all'` };
      }
      const set =
        scope === 'recommended'
          ? (ctx.signals.recommended_reviewers ?? [])
          : (ctx.signals.all_reviewers ?? []);
      if (set.length === 0) return { ok: true, value: true };
      return { ok: true, value: set.every((id) => ctx.signals.reviewers_passed.includes(id)) };
    }
    case 'confidence_at_least': {
      if (args.length !== 1 || args[0]?.vkind !== 'string') {
        return { ok: false, reason: `confidence_at_least expects 1 string arg` };
      }
      const level = args[0].v;
      const order: Record<string, number> = { low: 0, medium: 1, high: 2 };
      const have = order[ctx.signals.confidence];
      const need = order[level];
      if (have === undefined || need === undefined) {
        return { ok: false, reason: `confidence_at_least invalid level '${level}'` };
      }
      return { ok: true, value: have >= need };
    }
    case 'scope_unchanged': {
      if (args.length !== 0) {
        return { ok: false, reason: `scope_unchanged expects no args` };
      }
      return { ok: true, value: !ctx.signals.scope_changed };
    }
    case 'artifact_section_count': {
      // Stub semantics: returns a boolean (it's the leaf of a comparison
      // wrapper in real use, but the stub evaluator only knows true/false
      // — so we treat zero count as false, any positive count as true).
      // The accompanying numeric comparison is handled at parse time by
      // wrapping inside a comparison; for the stub we expose the count
      // via the `artifact['__sections_count_for_' + name]` convention.
      if (args.length !== 1 || args[0]?.vkind !== 'string') {
        return { ok: false, reason: `artifact_section_count expects 1 string arg` };
      }
      const key = `__sections_count_for_${args[0].v}`;
      const v = (ctx.artifact ?? {})[key];
      const n = typeof v === 'number' ? v : 0;
      return { ok: true, value: n > 0 };
    }
  }
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function evalComparison(
  path: ReadonlyArray<string>,
  op: ComparisonOp,
  value: Value,
  ctx: EvaluatorContext,
): EvalResult {
  // Resolve path against ctx.meta, ctx.signals, or ctx.artifact (Plan 8).
  let cursor: unknown;
  switch (path[0]) {
    case 'meta':
      cursor = ctx.meta;
      break;
    case 'signals':
      cursor = ctx.signals;
      break;
    case 'artifact':
      cursor = ctx.artifact;
      break;
    default:
      cursor = undefined;
  }
  for (let i = 1; i < path.length; i++) {
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') {
      return { ok: false, reason: `path ${path.join('.')} not resolvable (segment ${i})` };
    }
    cursor = (cursor as Record<string, unknown>)[path[i]!];
  }
  const left = cursor;
  const right = unwrapValue(value);

  if (op === 'in') {
    if (value.vkind !== 'list') return { ok: false, reason: `'in' requires a list on the right side` };
    const ok = value.v.some((item) => deepEqual(left, unwrapValue(item)));
    return { ok: true, value: ok };
  }

  if (op === '==' || op === '!=') {
    const eq = deepEqual(left, right);
    return { ok: true, value: op === '==' ? eq : !eq };
  }

  // <, >, <=, >= — numeric comparisons only.
  if (typeof left !== 'number' || typeof right !== 'number') {
    return { ok: false, reason: `comparison ${op} requires numbers on both sides` };
  }
  switch (op) {
    case '<':
      return { ok: true, value: left < right };
    case '>':
      return { ok: true, value: left > right };
    case '<=':
      return { ok: true, value: left <= right };
    case '>=':
      return { ok: true, value: left >= right };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unwrapValue(v: Value): unknown {
  switch (v.vkind) {
    case 'string':
      return v.v;
    case 'number':
      return v.v;
    case 'boolean':
      return v.v;
    case 'list':
      return v.v.map(unwrapValue);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  return false;
}
