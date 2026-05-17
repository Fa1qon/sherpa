// tests/core/methodology/conditional-paths-invariants.spec.ts
import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';
import { validateMethodology } from '../../../src/core/methodology/validate';

const SRC = `---
id: cases
version: 1.0.0
name: Cases
description: Case-routing methodology.
---

## Stage: capture
mode: auto

\`\`\`yaml
output:
  path: cases/<case_id>.md
  format: markdown
  conditional_paths:
    - when: { expr: "artifact.confidence >= 0.6" }
      path: cases/<case_id>.md
    - when: { expr: "artifact.confidence >= 0.3" }
      path: cases/_quarantine/<case_id>.md
  invariants:
    - when: { expr: "artifact.falsification_method == 'cannot be falsified through code execution'" }
      enforce_field: confidence
      op: cap
      value: 0.6
\`\`\`

capture body
`;

describe('Plan 8 Task 6 — ArtifactSpec.conditional_paths + invariants', () => {
  test('parses conditional_paths', () => {
    const r = parseMethodology(SRC, 'c.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = r.methodology.stages[0]!.contract.output;
    expect(out.conditional_paths).toHaveLength(2);
    expect(out.conditional_paths![0]!.when.expr).toBe('artifact.confidence >= 0.6');
    expect(out.conditional_paths![0]!.path).toBe('cases/<case_id>.md');
    expect(out.conditional_paths![1]!.path).toBe('cases/_quarantine/<case_id>.md');
  });

  test('parses invariants with cap op', () => {
    const r = parseMethodology(SRC, 'c.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = r.methodology.stages[0]!.contract.output;
    expect(out.invariants).toHaveLength(1);
    const inv = out.invariants![0]!;
    expect(inv.enforce_field).toBe('confidence');
    expect(inv.op).toBe('cap');
    expect(inv.value).toBe(0.6);
    expect(inv.when.expr).toContain("falsification_method ==");
  });

  test('round-trip preserves conditional_paths + invariants', () => {
    const r1 = parseMethodology(SRC, 'c.md');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const text = serializeMethodology(r1.methodology);
    const r2 = parseMethodology(text, 'c.md');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.methodology.stages[0]!.contract.output.conditional_paths)
      .toEqual(r1.methodology.stages[0]!.contract.output.conditional_paths);
    expect(r2.methodology.stages[0]!.contract.output.invariants)
      .toEqual(r1.methodology.stages[0]!.contract.output.invariants);
  });

  test('validator accepts well-formed conditional_paths + invariants', () => {
    const r = parseMethodology(SRC, 'c.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(validateMethodology(r.methodology).ok).toBe(true);
  });

  test('Rule 28b: conditional_paths.when must parse', () => {
    const bad = SRC.replace(
      '"artifact.confidence >= 0.6"',
      '"this is not parseable!!"',
    );
    const r = parseMethodology(bad, 'c.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = validateMethodology(r.methodology);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.some((e) => e.includes('conditional_paths') && e.includes('does not parse'))).toBe(true);
  });

  test('Rule 28b: invariants.when must parse', () => {
    const bad = SRC.replace(
      '"artifact.falsification_method == \'cannot be falsified through code execution\'"',
      '"!! bad expression"',
    );
    const r = parseMethodology(bad, 'c.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = validateMethodology(r.methodology);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.some((e) => e.includes('invariants') && e.includes('does not parse'))).toBe(true);
  });

  test('unknown op is rejected (parser drops invariant)', () => {
    const bad = SRC.replace('op: cap', 'op: bogus');
    const r = parseMethodology(bad, 'c.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.some((w) => w.includes('op') || w.includes('bogus'))).toBe(true);
    expect(r.methodology.stages[0]!.contract.output.invariants ?? []).toHaveLength(0);
  });

  test('v1 fixture without conditional_paths/invariants still parses', () => {
    const src = `---
id: simple
version: 1.0.0
name: simple
description: x
---

## Stage: only
mode: auto

body
`;
    const r = parseMethodology(src, 's.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.methodology.stages[0]!.contract.output.conditional_paths).toBeUndefined();
    expect(r.methodology.stages[0]!.contract.output.invariants).toBeUndefined();
  });
});
