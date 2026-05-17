import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';

/**
 * Plan 6 Task 5: GateItemKind dropped 'db_backup' and 'mockup_approved'.
 * Parser must warn + coerce unknown kinds to 'custom' (forward-compat),
 * NOT skip the item.
 */

const BASE = `---
id: gate_kind_demo
version: 2.0.0
name: Gate kind demo
description: gate item kind coercion fixture
---

## Stage: s1
mode: gate

prompt
`;

function withGateItem(kind: string): string {
  return BASE + `
\`\`\`yaml
gate:
  kind: standard
  items:
    - id: x
      label: "Backup"
      kind: ${kind}
\`\`\`
`;
}

describe('GateItem.kind coercion', () => {
  test('legacy kind=db_backup coerces to custom with warning', () => {
    const r = parseMethodology(withGateItem('db_backup'), '/p.md');
    if (!r.ok) throw new Error(`parse fail: ${JSON.stringify(r.error)}`);
    const stage = r.methodology.stages[0]!;
    expect(stage.gate).toBeDefined();
    expect(stage.gate!.items).toHaveLength(1);
    expect(stage.gate!.items[0]!.kind).toBe('custom');
    expect(stage.gate!.items[0]!.id).toBe('x');
    expect(stage.gate!.items[0]!.label).toBe('Backup');
    expect(r.warnings.some((w) => /db_backup/.test(w) && /custom/.test(w))).toBe(true);
  });

  test('unknown kind=foobar coerces to custom with warning', () => {
    const r = parseMethodology(withGateItem('foobar'), '/p.md');
    if (!r.ok) throw new Error(`parse fail: ${JSON.stringify(r.error)}`);
    const stage = r.methodology.stages[0]!;
    expect(stage.gate!.items).toHaveLength(1);
    expect(stage.gate!.items[0]!.kind).toBe('custom');
    expect(r.warnings.some((w) => /foobar/.test(w) && /custom/.test(w))).toBe(true);
  });

  test('legacy kind=mockup_approved coerces to custom with warning', () => {
    const r = parseMethodology(withGateItem('mockup_approved'), '/p.md');
    if (!r.ok) throw new Error(`parse fail: ${JSON.stringify(r.error)}`);
    const stage = r.methodology.stages[0]!;
    expect(stage.gate!.items).toHaveLength(1);
    expect(stage.gate!.items[0]!.kind).toBe('custom');
    expect(r.warnings.some((w) => /mockup_approved/.test(w) && /custom/.test(w))).toBe(true);
  });

  test.each([
    'artifact_written',
    'reviewer_pass',
    'user_confirmed',
    'completeness_check',
    'custom',
  ])('standard kind=%s parses without coercion', (kind) => {
    const r = parseMethodology(withGateItem(kind), '/p.md');
    if (!r.ok) throw new Error(`parse fail: ${JSON.stringify(r.error)}`);
    const stage = r.methodology.stages[0]!;
    expect(stage.gate!.items).toHaveLength(1);
    expect(stage.gate!.items[0]!.kind).toBe(kind);
    expect(r.warnings.some((w) => /coerced/.test(w))).toBe(false);
  });
});
