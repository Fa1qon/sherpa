// tests/core/methodology/composition.spec.ts
//
// Plan 8 / Task 3 — Stage.composed_from is pure metainformation recording
// that this stage's body (phases, prompt, gate, ...) was inlined from
// another methodology by the importer in "copy mode". The engine does NOT
// consume composed_from; the renderer/importer/reviewer do.

import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';

const SRC_MINIMAL_COMPOSED = `---
id: arch
version: 2.1.0
name: Architect
description: Architecture methodology with one inlined sub-methodology stage.
---

## Stage: phase3_research
mode: auto

\`\`\`yaml
composed_from:
  methodology_id: deep_research
  imported_at: '2026-05-12T15:00:00Z'
\`\`\`

phase3_research body
`;

const SRC_FULL_COMPOSED = `---
id: arch
version: 2.1.0
name: Architect
description: Architecture with full composed_from metadata.
---

## Stage: phase3_research
mode: auto

\`\`\`yaml
composed_from:
  methodology_id: deep_research
  methodology_version: "1.0.0"
  mode: standard
  mapped_outputs:
    research_report.md: phase3_research_findings.md
    sources.yaml: phase3_sources.yaml
  imported_at: '2026-05-12T15:00:00Z'
\`\`\`

phase3_research body
`;

const SRC_V1_NO_COMPOSED = `---
id: simple
version: 1.0.0
name: Simple
description: Methodology with no inlined sub-methodology metadata.
---

## Stage: only
mode: auto

body
`;

describe('Stage.composed_from — parse', () => {
  test('parses minimal composed_from (methodology_id + imported_at only)', () => {
    const r = parseMethodology(SRC_MINIMAL_COMPOSED, 'arch.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cf = r.methodology.stages[0]!.composed_from;
    expect(cf).toBeDefined();
    expect(cf!.methodology_id).toBe('deep_research');
    expect(cf!.imported_at).toBe('2026-05-12T15:00:00Z');
    expect(cf!.methodology_version).toBeUndefined();
    expect(cf!.mode).toBeUndefined();
    expect(cf!.mapped_outputs).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });

  test('parses full composed_from with all fields including mapped_outputs', () => {
    const r = parseMethodology(SRC_FULL_COMPOSED, 'arch.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cf = r.methodology.stages[0]!.composed_from;
    expect(cf).toBeDefined();
    expect(cf!.methodology_id).toBe('deep_research');
    expect(cf!.methodology_version).toBe('1.0.0');
    expect(cf!.mode).toBe('standard');
    expect(cf!.imported_at).toBe('2026-05-12T15:00:00Z');
    expect(cf!.mapped_outputs).toEqual({
      'research_report.md': 'phase3_research_findings.md',
      'sources.yaml': 'phase3_sources.yaml',
    });
  });

  test('v1 fixture without composed_from still parses cleanly', () => {
    const r = parseMethodology(SRC_V1_NO_COMPOSED, 'simple.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.methodology.stages[0]!.composed_from).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });

  test('missing methodology_id → warning + entire composed_from dropped', () => {
    const src = `---
id: m
version: 1.0.0
name: M
description: d
---

## Stage: s
mode: auto

\`\`\`yaml
composed_from:
  imported_at: '2026-05-12T15:00:00Z'
\`\`\`
`;
    const r = parseMethodology(src, 'm.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.methodology.stages[0]!.composed_from).toBeUndefined();
    expect(r.warnings.some((w) => w.includes('composed_from') && w.includes('methodology_id'))).toBe(true);
  });

  test('missing imported_at → warning + entire composed_from dropped', () => {
    const src = `---
id: m
version: 1.0.0
name: M
description: d
---

## Stage: s
mode: auto

\`\`\`yaml
composed_from:
  methodology_id: deep_research
\`\`\`
`;
    const r = parseMethodology(src, 'm.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.methodology.stages[0]!.composed_from).toBeUndefined();
    expect(r.warnings.some((w) => w.includes('composed_from') && w.includes('imported_at'))).toBe(true);
  });

  test('non-string mapped_outputs value → warning + that entry skipped (rest kept)', () => {
    const src = `---
id: m
version: 1.0.0
name: M
description: d
---

## Stage: s
mode: auto

\`\`\`yaml
composed_from:
  methodology_id: deep_research
  imported_at: '2026-05-12T15:00:00Z'
  mapped_outputs:
    good.md: target.md
    bad.md: 42
\`\`\`
`;
    const r = parseMethodology(src, 'm.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cf = r.methodology.stages[0]!.composed_from!;
    expect(cf).toBeDefined();
    expect(cf.mapped_outputs).toEqual({ 'good.md': 'target.md' });
    expect(r.warnings.some((w) => w.includes('mapped_outputs') && w.includes('bad.md'))).toBe(true);
  });

  test('non-object composed_from → warning + dropped', () => {
    const src = `---
id: m
version: 1.0.0
name: M
description: d
---

## Stage: s
mode: auto

\`\`\`yaml
composed_from: deep_research
\`\`\`
`;
    const r = parseMethodology(src, 'm.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.methodology.stages[0]!.composed_from).toBeUndefined();
    expect(r.warnings.some((w) => w.includes('composed_from') && w.includes('object'))).toBe(true);
  });

  test('non-object mapped_outputs → warning + field dropped (composed_from still kept)', () => {
    const src = `---
id: m
version: 1.0.0
name: M
description: d
---

## Stage: s
mode: auto

\`\`\`yaml
composed_from:
  methodology_id: deep_research
  imported_at: '2026-05-12T15:00:00Z'
  mapped_outputs:
    - research_report.md
    - sources.yaml
\`\`\`
`;
    const r = parseMethodology(src, 'm.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cf = r.methodology.stages[0]!.composed_from!;
    expect(cf).toBeDefined();
    expect(cf.methodology_id).toBe('deep_research');
    expect(cf.mapped_outputs).toBeUndefined();
    expect(r.warnings.some((w) => w.includes('mapped_outputs') && w.includes('object'))).toBe(true);
  });
});

describe('Stage.composed_from — round-trip', () => {
  test('serialize → parse preserves minimal composed_from', () => {
    const r1 = parseMethodology(SRC_MINIMAL_COMPOSED, 'arch.md');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const dumped = serializeMethodology(r1.methodology);
    expect(dumped.includes('composed_from')).toBe(true);
    const r2 = parseMethodology(dumped, 'arch.md');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.methodology.stages[0]!.composed_from).toEqual(
      r1.methodology.stages[0]!.composed_from,
    );
  });

  test('serialize → parse preserves full composed_from including mapped_outputs', () => {
    const r1 = parseMethodology(SRC_FULL_COMPOSED, 'arch.md');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const dumped = serializeMethodology(r1.methodology);
    const r2 = parseMethodology(dumped, 'arch.md');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const before = r1.methodology.stages[0]!.composed_from!;
    const after = r2.methodology.stages[0]!.composed_from!;
    expect(after.methodology_id).toBe(before.methodology_id);
    expect(after.methodology_version).toBe(before.methodology_version);
    expect(after.mode).toBe(before.mode);
    expect(after.imported_at).toBe(before.imported_at);
    expect(after.mapped_outputs).toEqual(before.mapped_outputs);
  });

  test('round-trip on methodology without composed_from emits no composed_from key', () => {
    const r1 = parseMethodology(SRC_V1_NO_COMPOSED, 'simple.md');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const dumped = serializeMethodology(r1.methodology);
    expect(dumped.includes('composed_from')).toBe(false);
  });
});
