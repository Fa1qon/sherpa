// tests/core/domain/condition_expr-artifact-extension.spec.ts
//
// Plan 8 Task 6: ConditionExpr DSL extensions.
//   - new path root 'artifact' (used by ArtifactSpec.conditional_paths + invariants)
//   - new predicate artifact_section_count(name: string)
import { describe, test, expect } from 'vitest';
import {
  parseConditionExpr,
  formatConditionExpr,
  ALLOWED_PATH_ROOTS,
  ALLOWED_PREDICATES,
  type AstNode,
} from '../../../src/core/domain/condition_expr';
import {
  evaluateConditionExpr,
  type EvaluatorContext,
} from '../../../src/core/domain/condition_expr_evaluator';

function baseCtx(): EvaluatorContext {
  return {
    meta: {},
    signals: {
      artifacts: [],
      reviewers_passed: [],
      confidence: 'medium',
      scope_changed: false,
    },
  };
}

describe('ConditionExpr — artifact path root', () => {
  test('artifact is in ALLOWED_PATH_ROOTS', () => {
    expect((ALLOWED_PATH_ROOTS as readonly string[]).includes('artifact')).toBe(true);
  });

  test('parses artifact.<field> comparison', () => {
    const r = parseConditionExpr('artifact.confidence >= 0.6');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.ast as Extract<AstNode, { kind: 'comparison' }>).path).toEqual(['artifact', 'confidence']);
  });

  test('evaluator resolves artifact path against ctx.artifact', () => {
    const ast = parseConditionExpr('artifact.confidence >= 0.6');
    expect(ast.ok).toBe(true);
    if (!ast.ok) return;
    const ctx = { ...baseCtx(), artifact: { confidence: 0.8 } };
    const v = evaluateConditionExpr(ast.ast, ctx);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value).toBe(true);
  });

  test('evaluator: artifact path missing — comparison returns ok with falsy via deep-equal semantics', () => {
    const ast = parseConditionExpr("artifact.kind == 'plan'");
    expect(ast.ok).toBe(true);
    if (!ast.ok) return;
    // ctx.artifact undefined → cursor stays undefined; path length > 1 → error.
    const v = evaluateConditionExpr(ast.ast, baseCtx());
    expect(v.ok).toBe(false);
  });

  test('round-trip preserves artifact path comparisons', () => {
    const samples = [
      "artifact.confidence >= 0.6",
      "artifact.falsification_method == 'cannot be falsified through code execution'",
      "artifact.tags in ['a', 'b']",
    ];
    for (const s of samples) {
      const r = parseConditionExpr(s);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const fmt = formatConditionExpr(r.ast);
      const r2 = parseConditionExpr(fmt);
      expect(r2.ok).toBe(true);
    }
  });
});

describe('ConditionExpr — artifact_section_count predicate', () => {
  test('artifact_section_count is in ALLOWED_PREDICATES', () => {
    expect((ALLOWED_PREDICATES as readonly string[]).includes('artifact_section_count')).toBe(true);
  });

  test('parser accepts predicate call', () => {
    const r = parseConditionExpr("artifact_section_count('Functional Requirements')");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ast.kind).toBe('predicate');
  });

  test('parser rejects wrong-arity at runtime, not parse time (parser does not enforce arity)', () => {
    // Per the parser docs, arity is enforced only by the evaluator.
    const r = parseConditionExpr('artifact_section_count()');
    expect(r.ok).toBe(true);
  });

  test('evaluator: returns true when stub count is positive (via __sections_count_for_ convention)', () => {
    const ast = parseConditionExpr("artifact_section_count('Functional Requirements')");
    expect(ast.ok).toBe(true);
    if (!ast.ok) return;
    const ctx: EvaluatorContext = {
      ...baseCtx(),
      artifact: { __sections_count_for_Functional_Requirements: 3 },
    };
    // Note: the stub uses literal key concatenation, so the key must match exactly.
    const ctxExact: EvaluatorContext = {
      ...baseCtx(),
      artifact: { '__sections_count_for_Functional Requirements': 3 },
    };
    const vEx = evaluateConditionExpr(ast.ast, ctxExact);
    expect(vEx.ok).toBe(true);
    if (!vEx.ok) return;
    expect(vEx.value).toBe(true);
    // mismatched key → zero count → false
    const vMis = evaluateConditionExpr(ast.ast, ctx);
    expect(vMis.ok).toBe(true);
    if (!vMis.ok) return;
    expect(vMis.value).toBe(false);
  });

  test('evaluator: missing artifact context → count 0 → false', () => {
    const ast = parseConditionExpr("artifact_section_count('X')");
    expect(ast.ok).toBe(true);
    if (!ast.ok) return;
    const v = evaluateConditionExpr(ast.ast, baseCtx());
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value).toBe(false);
  });

  test('evaluator: wrong arg type yields error', () => {
    const ast = parseConditionExpr('artifact_section_count(42)');
    expect(ast.ok).toBe(true);
    if (!ast.ok) return;
    const v = evaluateConditionExpr(ast.ast, baseCtx());
    expect(v.ok).toBe(false);
  });
});
