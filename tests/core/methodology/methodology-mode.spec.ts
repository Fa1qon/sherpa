// tests/core/methodology/methodology-mode.spec.ts
import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';
import { validateMethodology } from '../../../src/core/methodology/validate';
import type { Methodology } from '../../../src/core/domain/methodology';

const SRC_WITH_MODES = `---
id: deep_research
version: 2.1.0
name: Deep Research
description: Multi-mode research methodology.
modes:
  - id: light
    name: Light (single agent, fast)
    default: true
  - id: standard
    name: Standard (parallel + fact-check)
  - id: deep
    name: Deep (multi-iteration + adversarial)
    description: Three-pass adversarial review.
---

## Stage: intake
mode: auto

intake prompt body

## Stage: research
mode: auto

\`\`\`yaml
active_in_modes: [standard, deep]
\`\`\`

research prompt body

## Stage: factcheck
mode: gate

\`\`\`yaml
active_in_modes:
  - deep
\`\`\`

factcheck prompt body
`;

function baseMethodology(overrides: Partial<Methodology> = {}): Methodology {
  return {
    id: 'm', version: '1', name: 'M', description: '',
    stages: [
      { id: 's1', name: 'S1', mode: 'auto', contract: { input: [], output: { path: 's1.md' } } },
      { id: 's2', name: 'S2', mode: 'auto', contract: { input: [], output: { path: 's2.md' } } },
    ],
    edges: [
      { from: 'start', to: 's1', condition: { kind: 'always' } },
      { from: 's1', to: 's2', condition: { kind: 'always' } },
      { from: 's2', to: 'end', condition: { kind: 'always' } },
    ],
    ...overrides,
  };
}

describe('methodology modes IR', () => {
  test('parses modes frontmatter into Methodology.modes', () => {
    const r = parseMethodology(SRC_WITH_MODES, '/p.md');
    if (!r.ok) throw new Error(`parse fail: ${JSON.stringify(r.error)}`);
    const m = r.methodology;
    expect(m.modes).toBeDefined();
    expect(m.modes).toHaveLength(3);
    expect(m.modes![0]).toMatchObject({ id: 'light', name: 'Light (single agent, fast)', default: true });
    expect(m.modes![1]).toMatchObject({ id: 'standard' });
    expect(m.modes![1].default).toBeUndefined();
    expect(m.modes![2]).toMatchObject({ id: 'deep', description: 'Three-pass adversarial review.' });
  });

  test('parses stage active_in_modes from stage directives YAML', () => {
    const r = parseMethodology(SRC_WITH_MODES, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    const intake = r.methodology.stages.find((s) => s.id === 'intake')!;
    const research = r.methodology.stages.find((s) => s.id === 'research')!;
    const factcheck = r.methodology.stages.find((s) => s.id === 'factcheck')!;
    expect(intake.active_in_modes).toBeUndefined();
    expect(research.active_in_modes).toEqual(['standard', 'deep']);
    expect(factcheck.active_in_modes).toEqual(['deep']);
  });

  test('validate rule 15: active_in_modes references unknown mode', () => {
    const m = baseMethodology({
      modes: [{ id: 'a', name: 'A', default: true }],
      stages: [
        { id: 's1', name: 'S1', mode: 'auto', contract: { input: [], output: { path: 's1.md' } } },
        {
          id: 's2', name: 'S2', mode: 'auto',
          contract: { input: [], output: { path: 's2.md' } },
          active_in_modes: ['ghost'],
        },
      ],
    });
    const r = validateMethodology(m);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('ghost') && e.includes('s2'))).toBe(true);
  });

  test('validate rule 16: multiple default modes', () => {
    const m = baseMethodology({
      modes: [
        { id: 'a', name: 'A', default: true },
        { id: 'b', name: 'B', default: true },
      ],
    });
    const r = validateMethodology(m);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('multiple defaults'))).toBe(true);
  });

  test('validate rule 17: if modes declared, at least one stage must be unconditionally active', () => {
    const bad = baseMethodology({
      modes: [
        { id: 'a', name: 'A', default: true },
        { id: 'b', name: 'B' },
      ],
      stages: [
        {
          id: 's1', name: 'S1', mode: 'auto',
          contract: { input: [], output: { path: 's1.md' } },
          active_in_modes: ['a'],
        },
        {
          id: 's2', name: 'S2', mode: 'auto',
          contract: { input: [], output: { path: 's2.md' } },
          active_in_modes: ['b'],
        },
      ],
    });
    const rBad = validateMethodology(bad);
    expect(rBad.ok).toBe(false);
    if (rBad.ok) return;
    expect(rBad.errors.some((e) => e.includes('every stage is mode-gated'))).toBe(true);

    // Sibling: one stage with no active_in_modes (unconditional) — passes rule 17.
    const good = baseMethodology({
      modes: [
        { id: 'a', name: 'A', default: true },
        { id: 'b', name: 'B' },
      ],
      stages: [
        { id: 's1', name: 'S1', mode: 'auto', contract: { input: [], output: { path: 's1.md' } } },
        {
          id: 's2', name: 'S2', mode: 'auto',
          contract: { input: [], output: { path: 's2.md' } },
          active_in_modes: ['b'],
        },
      ],
    });
    expect(validateMethodology(good).ok).toBe(true);
  });

  test('round-trip preserves modes structure and stage active_in_modes', () => {
    const r1 = parseMethodology(SRC_WITH_MODES, '/p.md');
    if (!r1.ok) throw new Error('parse fail');
    const serialized = serializeMethodology(r1.methodology);
    const r2 = parseMethodology(serialized, '/p.md');
    if (!r2.ok) throw new Error(`re-parse fail: ${JSON.stringify(r2.error)}`);
    const m2 = r2.methodology;
    expect(m2.modes).toEqual(r1.methodology.modes);
    expect(m2.stages.find((s) => s.id === 'research')!.active_in_modes).toEqual(['standard', 'deep']);
    expect(m2.stages.find((s) => s.id === 'factcheck')!.active_in_modes).toEqual(['deep']);
    expect(m2.stages.find((s) => s.id === 'intake')!.active_in_modes).toBeUndefined();
  });

  test('v1/v2 fixture without modes still parses (modes undefined, no errors)', () => {
    const v1 = `---
id: legacy
version: 1.0.0
name: Legacy
description: ""
---

## Stage: s1
mode: auto

prompt
`;
    const r = parseMethodology(v1, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    expect(r.methodology.modes).toBeUndefined();
    expect(r.methodology.stages[0]!.active_in_modes).toBeUndefined();
    expect(validateMethodology(r.methodology).ok).toBe(true);
  });
});
