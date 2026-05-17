import { describe, test, expect } from 'vitest';
import { parseConditionExpr } from '../../../src/core/domain/condition_expr';
import {
  evaluateConditionExpr,
  type EvaluatorContext,
} from '../../../src/core/domain/condition_expr_evaluator';

function evalExpr(expr: string, ctx: EvaluatorContext) {
  const p = parseConditionExpr(expr);
  if (!p.ok) throw new Error(`Parse failed: ${p.message}`);
  return evaluateConditionExpr(p.ast, ctx);
}

const baseCtx: EvaluatorContext = {
  meta: {},
  signals: {
    artifacts: [],
    reviewers_passed: [],
    confidence: 'low',
    scope_changed: false,
  },
};

describe('ConditionExpr evaluator — predicates', () => {
  test('artifact_exists true when path present', () => {
    const r = evalExpr("artifact_exists('plan.md')", {
      ...baseCtx,
      signals: { ...baseCtx.signals, artifacts: ['plan.md'] },
    });
    expect(r).toEqual({ ok: true, value: true });
  });

  test('artifact_exists false when path missing', () => {
    const r = evalExpr("artifact_exists('plan.md')", baseCtx);
    expect(r).toEqual({ ok: true, value: false });
  });

  test('reviewer_passed true when in list', () => {
    const r = evalExpr("reviewer_passed('fact_checker')", {
      ...baseCtx,
      signals: { ...baseCtx.signals, reviewers_passed: ['fact_checker'] },
    });
    expect(r).toEqual({ ok: true, value: true });
  });

  test('confidence_at_least chains low<medium<high', () => {
    const lowCtx = { ...baseCtx, signals: { ...baseCtx.signals, confidence: 'low' as const } };
    const medCtx = { ...baseCtx, signals: { ...baseCtx.signals, confidence: 'medium' as const } };
    const highCtx = { ...baseCtx, signals: { ...baseCtx.signals, confidence: 'high' as const } };
    expect(evalExpr("confidence_at_least('low')", lowCtx)).toEqual({ ok: true, value: true });
    expect(evalExpr("confidence_at_least('medium')", lowCtx)).toEqual({ ok: true, value: false });
    expect(evalExpr("confidence_at_least('medium')", medCtx)).toEqual({ ok: true, value: true });
    expect(evalExpr("confidence_at_least('high')", medCtx)).toEqual({ ok: true, value: false });
    expect(evalExpr("confidence_at_least('high')", highCtx)).toEqual({ ok: true, value: true });
  });

  test('scope_unchanged inverts scope_changed', () => {
    const r1 = evalExpr('scope_unchanged()', baseCtx);
    expect(r1).toEqual({ ok: true, value: true });
    const r2 = evalExpr('scope_unchanged()', {
      ...baseCtx,
      signals: { ...baseCtx.signals, scope_changed: true },
    });
    expect(r2).toEqual({ ok: true, value: false });
  });

  test('all_reviewers_passed recommended: empty set is vacuously true', () => {
    const r = evalExpr("all_reviewers_passed('recommended')", baseCtx);
    expect(r).toEqual({ ok: true, value: true });
  });

  test('all_reviewers_passed recommended: missing reviewer fails', () => {
    const ctx: EvaluatorContext = {
      ...baseCtx,
      signals: {
        ...baseCtx.signals,
        reviewers_passed: ['a'],
        recommended_reviewers: ['a', 'b'],
      },
    };
    const r = evalExpr("all_reviewers_passed('recommended')", ctx);
    expect(r).toEqual({ ok: true, value: false });
  });

  test('all_reviewers_passed recommended: all present passes', () => {
    const ctx: EvaluatorContext = {
      ...baseCtx,
      signals: {
        ...baseCtx.signals,
        reviewers_passed: ['a', 'b'],
        recommended_reviewers: ['a', 'b'],
      },
    };
    const r = evalExpr("all_reviewers_passed('recommended')", ctx);
    expect(r).toEqual({ ok: true, value: true });
  });

  test('confidence_at_least rejects invalid level', () => {
    const ctx = { ...baseCtx, signals: { ...baseCtx.signals, confidence: 'low' as const } };
    const r = evalExpr("confidence_at_least('extreme')", ctx);
    expect(r.ok).toBe(false);
  });
});

describe('ConditionExpr evaluator — boolean composition', () => {
  test('AND short-circuits to false on first false', () => {
    // Use scope_unchanged() AND artifact_exists(...) — first false short-circuits.
    const r = evalExpr("scope_unchanged() AND artifact_exists('x.md')", {
      ...baseCtx,
      signals: { ...baseCtx.signals, scope_changed: true },
    });
    expect(r).toEqual({ ok: true, value: false });
  });

  test('AND both true → true', () => {
    const r = evalExpr("scope_unchanged() AND artifact_exists('x.md')", {
      ...baseCtx,
      signals: { ...baseCtx.signals, artifacts: ['x.md'] },
    });
    expect(r).toEqual({ ok: true, value: true });
  });

  test('OR short-circuits to true on first true', () => {
    const r = evalExpr("scope_unchanged() OR artifact_exists('x.md')", baseCtx);
    expect(r).toEqual({ ok: true, value: true });
  });

  test('NOT inverts', () => {
    const r = evalExpr('NOT scope_unchanged()', baseCtx);
    expect(r).toEqual({ ok: true, value: false });
  });
});

describe('ConditionExpr evaluator — comparisons', () => {
  test('meta.fix_cycles >= number', () => {
    const r = evalExpr('meta.fix_cycles >= 3', { ...baseCtx, meta: { fix_cycles: 5 } });
    expect(r).toEqual({ ok: true, value: true });
  });

  test('meta.fix_cycles < number false case', () => {
    const r = evalExpr('meta.fix_cycles < 3', { ...baseCtx, meta: { fix_cycles: 5 } });
    expect(r).toEqual({ ok: true, value: false });
  });

  test('signals.confidence == high', () => {
    const r = evalExpr("signals.confidence == 'high'", {
      ...baseCtx,
      signals: { ...baseCtx.signals, confidence: 'high' },
    });
    expect(r).toEqual({ ok: true, value: true });
  });

  test('meta.status in list — match', () => {
    const r = evalExpr("meta.status in ['ok', 'warn']", { ...baseCtx, meta: { status: 'warn' } });
    expect(r).toEqual({ ok: true, value: true });
  });

  test('meta.status in list — no match', () => {
    const r = evalExpr("meta.status in ['ok', 'warn']", { ...baseCtx, meta: { status: 'fail' } });
    expect(r).toEqual({ ok: true, value: false });
  });

  test('type mismatch: number op on string', () => {
    const r = evalExpr('meta.label > 3', { ...baseCtx, meta: { label: 'hello' } });
    expect(r.ok).toBe(false);
  });

  test('missing meta path resolves to undefined → compare false-ish', () => {
    // path meta.missing → undefined ; undefined == 'x' → false (not error)
    const r = evalExpr("meta.missing == 'x'", baseCtx);
    expect(r).toEqual({ ok: true, value: false });
  });
});
