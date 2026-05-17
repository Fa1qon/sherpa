// tests/core/methodology/scope-by-complexity.spec.ts
import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';
import { validateMethodology } from '../../../src/core/methodology/validate';

const SRC = `---
id: scoped
version: 1.0.0
name: Scoped
description: stage with scope_by_complexity.
---

## Stage: design
mode: auto

\`\`\`yaml
scope_by_complexity:
  C1: { artifact_template_variant: simple, system_prompt_addendum: "Keep design minimal — 2-4 sentences per section is OK." }
  C2: { artifact_template_variant: simple }
  C3: {}
  C4: { system_prompt_addendum: "Provide full C4 Level 2 + interface contracts + ADRs." }
\`\`\`

body
`;

describe('Plan 8 Task 6 — Stage.scope_by_complexity', () => {
  test('parses all four C1..C4 keys with mixed overrides', () => {
    const r = parseMethodology(SRC, 's.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sbc = r.methodology.stages[0]!.scope_by_complexity!;
    expect(sbc).toBeDefined();
    expect(sbc.C1?.artifact_template_variant).toBe('simple');
    expect(sbc.C1?.system_prompt_addendum).toContain('minimal');
    expect(sbc.C2?.artifact_template_variant).toBe('simple');
    expect(sbc.C3).toEqual({});
    expect(sbc.C4?.system_prompt_addendum).toContain('C4 Level 2');
  });

  test('round-trip preserves all scope_by_complexity entries', () => {
    const r1 = parseMethodology(SRC, 's.md');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const text = serializeMethodology(r1.methodology);
    const r2 = parseMethodology(text, 's.md');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.methodology.stages[0]!.scope_by_complexity)
      .toEqual(r1.methodology.stages[0]!.scope_by_complexity);
  });

  test('Rule 27: unknown complexity key is rejected by parser (warning) and skipped', () => {
    const bad = SRC.replace('C4: {', 'C5: { artifact_template_variant: x }\n  C4: {');
    const r = parseMethodology(bad, 's.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Parser drops C5 with a warning; validator sees only valid keys.
    expect(r.warnings.some((w) => w.includes('C5'))).toBe(true);
    expect(r.methodology.stages[0]!.scope_by_complexity?.C4).toBeDefined();
    // No C5 leaked into IR.
    expect((r.methodology.stages[0]!.scope_by_complexity as Record<string, unknown>).C5).toBeUndefined();
  });

  test('skip flag is parsed when present', () => {
    const src = `---
id: x
version: 1.0.0
name: x
description: x
---

## Stage: s
mode: auto

\`\`\`yaml
scope_by_complexity:
  C1: { skip: true }
\`\`\`

body
`;
    const r = parseMethodology(src, 's.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.methodology.stages[0]!.scope_by_complexity!.C1?.skip).toBe(true);
    const v = validateMethodology(r.methodology);
    expect(v.ok).toBe(true);
  });

  test('v1 fixture without scope_by_complexity still parses + validates', () => {
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
    expect(r.methodology.stages[0]!.scope_by_complexity).toBeUndefined();
    expect(validateMethodology(r.methodology).ok).toBe(true);
  });
});
