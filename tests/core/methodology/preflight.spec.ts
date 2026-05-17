// tests/core/methodology/preflight.spec.ts
import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';
import { validateMethodology } from '../../../src/core/methodology/validate';
import type { Methodology, PreflightCheck } from '../../../src/core/domain/methodology';

const SRC_WITH_PREFLIGHT = `---
id: with_preflight
version: 1.0.0
name: Preflight Demo
description: Stage with preflight checks.
---

## Stage: requirements
mode: auto

requirements body

## Stage: design
mode: auto

\`\`\`yaml
inputs:
  - { stage: requirements, artifact: requirements.md }
preflight:
  - id: requirements_min_3_fr
    input_artifact: { stage: requirements, artifact: requirements.md }
    must_have_sections: [Functional Requirements, Quality Priorities]
    custom: { expr: "artifact_section_count('Functional Requirements')" }
    on_fail: rollback
\`\`\`

design body

## EDGES

| from | to | condition | expr | maxCycles |
|------|----|-----------|------|-----------|
| start | requirements | always |  |  |
| requirements | design | always |  |  |
| design | requirements | rollback |  | 3 |
| design | end | always |  |  |
`;

function findStage(m: Methodology, id: string) {
  const s = m.stages.find((x) => x.id === id);
  if (!s) throw new Error(`stage ${id} not found`);
  return s;
}

describe('Plan 8 Task 6 — Stage.preflight', () => {
  test('parses preflight block with all fields', () => {
    const r = parseMethodology(SRC_WITH_PREFLIGHT, 'preflight.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const design = findStage(r.methodology, 'design');
    expect(design.preflight).toHaveLength(1);
    const pf = design.preflight![0]!;
    expect(pf.id).toBe('requirements_min_3_fr');
    expect(pf.input_artifact).toEqual({ stage: 'requirements', artifact: 'requirements.md' });
    expect(pf.must_have_sections).toEqual(['Functional Requirements', 'Quality Priorities']);
    expect(pf.custom?.expr).toBe("artifact_section_count('Functional Requirements')");
    expect(pf.on_fail).toBe('rollback');
  });

  test('round-trip preserves preflight', () => {
    const r = parseMethodology(SRC_WITH_PREFLIGHT, 'preflight.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = serializeMethodology(r.methodology);
    const r2 = parseMethodology(text, 'preflight.md');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const d1 = findStage(r.methodology, 'design');
    const d2 = findStage(r2.methodology, 'design');
    expect(d2.preflight).toEqual(d1.preflight);
  });

  test('validator accepts well-formed preflight on stage with rollback edge', () => {
    const r = parseMethodology(SRC_WITH_PREFLIGHT, 'preflight.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = validateMethodology(r.methodology);
    expect(v.ok).toBe(true);
  });

  test('Rule 25: input_artifact.stage must exist', () => {
    const src = SRC_WITH_PREFLIGHT.replace(
      'input_artifact: { stage: requirements, artifact: requirements.md }\n    must_have_sections',
      'input_artifact: { stage: nonexistent, artifact: req.md }\n    must_have_sections',
    );
    const r = parseMethodology(src, 'p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = validateMethodology(r.methodology);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.some((e) => e.includes('input_artifact') && e.includes('nonexistent'))).toBe(true);
  });

  test('Rule 26: on_fail=rollback requires outbound rollback edge', () => {
    const noRollbackSrc = SRC_WITH_PREFLIGHT.replace(
      '| design | requirements | rollback |  | 3 |\n',
      '',
    );
    const r = parseMethodology(noRollbackSrc, 'p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = validateMethodology(r.methodology);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.some((e) => e.includes('rollback') && e.includes('outbound'))).toBe(true);
  });

  test('Rule 25b: at least one of must_have_sections / must_match_pattern / custom', () => {
    const src = `---
id: bad_preflight
version: 1.0.0
name: bad
description: x
---

## Stage: a
mode: auto

a body

## Stage: b
mode: auto

\`\`\`yaml
preflight:
  - id: empty
    input_artifact: { stage: a, artifact: a.md }
    on_fail: fail
\`\`\`

b body
`;
    const r = parseMethodology(src, 'p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = validateMethodology(r.methodology);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.some((e) => e.includes('must declare at least one'))).toBe(true);
  });

  test('Rule 28a: custom.expr must parse', () => {
    const src = SRC_WITH_PREFLIGHT.replace(
      "custom: { expr: \"artifact_section_count('Functional Requirements')\" }",
      "custom: { expr: \"this is not a valid expression !!!\" }",
    );
    const r = parseMethodology(src, 'p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = validateMethodology(r.methodology);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.some((e) => e.includes('custom.expr') || e.includes('does not parse'))).toBe(true);
  });

  test('v1 fixture without preflight still parses', () => {
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
    expect(r.methodology.stages[0]!.preflight).toBeUndefined();
  });

  test('preflight check shape compiles with required + all optional fields', () => {
    const pf: PreflightCheck = {
      id: 'x',
      input_artifact: { stage: 'a', artifact: 'a.md' },
      must_have_sections: ['Sec'],
      must_match_pattern: '^TODO:',
      custom: { expr: "artifact_section_count('Sec')" },
      on_fail: 'ask',
    };
    expect(pf.on_fail).toBe('ask');
  });
});
