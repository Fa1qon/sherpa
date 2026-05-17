import { describe, test, expect } from 'vitest';
import {
  parseConditionExpr,
  formatConditionExpr,
} from '../../../src/core/domain/condition_expr';
import type { AstNode } from '../../../src/core/domain/condition_expr';

describe('ConditionExpr parser — positive cases', () => {
  test('parses a single zero-arg predicate', () => {
    const r = parseConditionExpr('scope_unchanged()');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ast).toMatchObject({
      kind: 'predicate',
      name: 'scope_unchanged',
      args: [],
    });
  });

  test('parses predicate with string argument', () => {
    const r = parseConditionExpr("artifact_exists('plan.md')");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ast).toMatchObject({
      kind: 'predicate',
      name: 'artifact_exists',
      args: [{ vkind: 'string', v: 'plan.md' }],
    });
  });

  test('parses double-quoted string', () => {
    const r = parseConditionExpr('artifact_exists("plan.md")');
    expect(r.ok).toBe(true);
  });

  test('parses comparison with number', () => {
    const r = parseConditionExpr('meta.fix_cycles >= 3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ast).toMatchObject({
      kind: 'comparison',
      path: ['meta', 'fix_cycles'],
      op: '>=',
      value: { vkind: 'number', v: 3 },
    });
  });

  test('parses AND', () => {
    const r = parseConditionExpr(
      "scope_unchanged() AND confidence_at_least('medium')",
    );
    expect(r.ok).toBe(true);
  });

  test('parses OR', () => {
    const r = parseConditionExpr(
      "artifact_exists('a') OR artifact_exists('b')",
    );
    expect(r.ok).toBe(true);
  });

  test('parses NOT', () => {
    const r = parseConditionExpr('NOT scope_unchanged()');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ast.kind).toBe('not');
  });

  test('parses parenthesised group', () => {
    const r = parseConditionExpr(
      "(artifact_exists('a') OR artifact_exists('b')) AND scope_unchanged()",
    );
    expect(r.ok).toBe(true);
  });

  test('AND has tighter precedence than OR', () => {
    const r = parseConditionExpr(
      "artifact_exists('a') OR artifact_exists('b') AND artifact_exists('c')",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ast.kind).toBe('or');
    expect((r.ast as Extract<AstNode, { kind: 'or' }>).right.kind).toBe('and');
  });

  test('NOT binds tighter than AND', () => {
    const r = parseConditionExpr(
      "NOT scope_unchanged() AND artifact_exists('a')",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ast.kind).toBe('and');
    expect((r.ast as Extract<AstNode, { kind: 'and' }>).left.kind).toBe('not');
  });

  test('parses signals.confidence path', () => {
    const r = parseConditionExpr("signals.confidence == 'high'");
    expect(r.ok).toBe(true);
  });

  test('parses in operator with list', () => {
    const r = parseConditionExpr("meta.status in ['ok', 'warn']");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.ast as Extract<AstNode, { kind: 'comparison' }>).op).toBe('in');
  });

  test('parses boolean literals', () => {
    const r = parseConditionExpr('meta.locked == true');
    expect(r.ok).toBe(true);
  });

  test('parses multi-arg predicate (parser does not enforce arity)', () => {
    const r = parseConditionExpr("confidence_at_least('low', 'medium')");
    expect(r.ok).toBe(true);
  });

  test('parses deep path', () => {
    const r = parseConditionExpr('meta.a.b.c == 1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.ast as Extract<AstNode, { kind: 'comparison' }>).path).toEqual([
      'meta',
      'a',
      'b',
      'c',
    ]);
  });
});

describe('ConditionExpr parser — error cases', () => {
  test('empty input', () => {
    const r = parseConditionExpr('');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/empty/i);
    expect(r.position).toBe(0);
  });

  test('whitespace-only input', () => {
    const r = parseConditionExpr('   ');
    expect(r.ok).toBe(false);
  });

  test('rejects unknown predicate', () => {
    const r = parseConditionExpr("magic_predicate('x')");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/predicate|magic/i);
  });

  test('rejects path root not in allowed list', () => {
    const r = parseConditionExpr('other.x == 1');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/path|root|other/i);
  });

  test('reports position for unbalanced paren', () => {
    const r = parseConditionExpr('scope_unchanged(');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.position).toBeGreaterThanOrEqual(0);
  });

  test('reports position for unclosed string', () => {
    const r = parseConditionExpr("artifact_exists('plan.md");
    expect(r.ok).toBe(false);
  });

  test('reports position for trailing garbage', () => {
    const r = parseConditionExpr('scope_unchanged() xyz');
    expect(r.ok).toBe(false);
  });

  test('rejects bare identifier', () => {
    const r = parseConditionExpr('foo');
    expect(r.ok).toBe(false);
  });
});

describe('ConditionExpr round-trip', () => {
  const samples = [
    "artifact_exists('plan.md')",
    "confidence_at_least('medium') AND scope_unchanged()",
    'NOT (meta.fix_cycles >= 3 OR signals.confidence < 0.7)',
    "all_reviewers_passed('recommended') AND artifact_exists('design.md')",
    "meta.status in ['ok', 'warn']",
    "(artifact_exists('a') OR artifact_exists('b')) AND scope_unchanged()",
    "meta.x.y.z == 'value'",
  ];

  test.each(samples)('format(parse(%s)) is idempotent', (s) => {
    const r1 = parseConditionExpr(s);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const f1 = formatConditionExpr(r1.ast);
    const r2 = parseConditionExpr(f1);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const f2 = formatConditionExpr(r2.ast);
    expect(f2).toBe(f1);
  });
});

describe('ConditionExpr formatter — precedence parentheses', () => {
  test('OR inside AND gets parenthesised on output', () => {
    const r = parseConditionExpr(
      "(artifact_exists('a') OR artifact_exists('b')) AND scope_unchanged()",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f = formatConditionExpr(r.ast);
    expect(f).toMatch(/^\(.*OR.*\) AND/);
  });

  test('AND inside OR does not get parenthesised', () => {
    const r = parseConditionExpr(
      "scope_unchanged() AND artifact_exists('a') OR scope_unchanged()",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f = formatConditionExpr(r.ast);
    // No grouping parentheses — only the predicate-call parens are present.
    // Stripping those should leave a paren-free string.
    const stripped = f.replace(/[a-z_]+\([^()]*\)/g, '_PRED_');
    expect(stripped).not.toMatch(/[()]/);
    // And the AND/OR ordering should be flat.
    expect(f).toMatch(/AND.*OR/);
  });
});
