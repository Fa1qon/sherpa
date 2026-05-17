import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';
import { validateMethodology } from '../../../src/core/methodology/validate';
import type { Methodology } from '../../../src/core/domain/methodology';

describe('phases_source — inline | from_artifact + phase_edges', () => {
  test('phases_source=from_artifact with valid reference parses', () => {
    const md = `---
id: t
version: 1.0.0
name: T
description: t
---

## Stage: plan
mode: interactive

\`\`\`yaml
phases:
  - id: p1
    name: Outline
\`\`\`

## Stage: impl
mode: auto

\`\`\`yaml
phases_source: from_artifact
phases_from_artifact:
  stage_id: plan
  artifact: plan.md
  section: "## Phases"
\`\`\`
`;
    const r = parseMethodology(md, '/p.md');
    if (!r.ok) throw new Error(`parse fail: ${JSON.stringify(r.error)}`);
    const impl = r.methodology.stages.find((s) => s.id === 'impl')!;
    expect(impl.phases_source).toBe('from_artifact');
    expect(impl.phases_from_artifact).toEqual({
      stage_id: 'plan',
      artifact: 'plan.md',
      section: '## Phases',
    });
    expect(impl.phases).toBeUndefined();
    const v = validateMethodology(r.methodology);
    expect(v.ok).toBe(true);
  });

  test('phases_source=from_artifact missing phases_from_artifact fails validate', () => {
    const ir: Methodology = {
      id: 't',
      version: '1.0.0',
      name: 'T',
      description: '',
      stages: [
        {
          id: 'plan',
          name: 'Plan',
          mode: 'interactive',
          contract: { input: [], output: { path: 'plan.md' } },
        },
        {
          id: 'impl',
          name: 'Impl',
          mode: 'auto',
          contract: { input: [], output: { path: 'impl.md' } },
          phases_source: 'from_artifact',
        },
      ],
      edges: [
        { from: 'start', to: 'plan', condition: { kind: 'always' } },
        { from: 'plan', to: 'impl', condition: { kind: 'always' } },
        { from: 'impl', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const v = validateMethodology(ir);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.some((e) => /requires phases_from_artifact/.test(e))).toBe(true);
  });

  test('phases_source=from_artifact with inline phases fails validate', () => {
    const ir: Methodology = {
      id: 't',
      version: '1.0.0',
      name: 'T',
      description: '',
      stages: [
        {
          id: 'plan',
          name: 'Plan',
          mode: 'interactive',
          contract: { input: [], output: { path: 'plan.md' } },
        },
        {
          id: 'impl',
          name: 'Impl',
          mode: 'auto',
          contract: { input: [], output: { path: 'impl.md' } },
          phases_source: 'from_artifact',
          phases_from_artifact: { stage_id: 'plan', artifact: 'plan.md', section: '## Phases' },
          phases: [{ id: 'sneaky', name: 'Sneaky' }],
        },
      ],
      edges: [
        { from: 'start', to: 'plan', condition: { kind: 'always' } },
        { from: 'plan', to: 'impl', condition: { kind: 'always' } },
        { from: 'impl', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const v = validateMethodology(ir);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.some((e) => /disallows inline phases/.test(e))).toBe(true);
  });

  test('phases_source=from_artifact pointing at unknown stage fails validate', () => {
    const ir: Methodology = {
      id: 't',
      version: '1.0.0',
      name: 'T',
      description: '',
      stages: [
        {
          id: 'impl',
          name: 'Impl',
          mode: 'auto',
          contract: { input: [], output: { path: 'impl.md' } },
          phases_source: 'from_artifact',
          phases_from_artifact: { stage_id: 'ghost', artifact: 'ghost.md', section: '## Phases' },
        },
      ],
      edges: [
        { from: 'start', to: 'impl', condition: { kind: 'always' } },
        { from: 'impl', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const v = validateMethodology(ir);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.some((e) => /"ghost" not found/.test(e))).toBe(true);
  });

  test('phase_edges referencing missing phase fails validate', () => {
    const ir: Methodology = {
      id: 't',
      version: '1.0.0',
      name: 'T',
      description: '',
      stages: [
        {
          id: 'w0',
          name: 'W0',
          mode: 'interactive',
          contract: { input: [], output: { path: 'w0.md' } },
          phases: [
            { id: 'p1', name: 'P1' },
            { id: 'p2', name: 'P2' },
          ],
          phase_edges: [
            { from: 'p1', to: 'p2', kind: 'always' },
            { from: 'p2', to: 'ghost', kind: 'always' },
          ],
        },
      ],
      edges: [
        { from: 'start', to: 'w0', condition: { kind: 'always' } },
        { from: 'w0', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const v = validateMethodology(ir);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.some((e) => /unknown phase "ghost"/.test(e))).toBe(true);
  });

  test('inline phases with phase_edges round-trip', () => {
    const ir: Methodology = {
      id: 't',
      version: '1.0.0',
      name: 'T',
      description: '',
      stages: [
        {
          id: 'w0',
          name: 'W0',
          mode: 'interactive',
          contract: { input: [], output: { path: 'w0.md' } },
          phases: [
            { id: 'p1', name: 'Brainstorm' },
            { id: 'p2', name: 'Decide' },
          ],
          phase_edges: [
            { from: 'p1', to: 'p2', kind: 'always' },
            { from: 'p2', to: 'p1', kind: 'gate-fail', maxCycles: 3 },
            { from: 'p2', to: 'end', kind: 'always' },
          ],
        },
      ],
      edges: [
        { from: 'start', to: 'w0', condition: { kind: 'always' } },
        { from: 'w0', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const out = serializeMethodology(ir);
    const parsed = parseMethodology(out, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    expect(parsed.methodology.stages[0]).toEqual(ir.stages[0]);
    const v = validateMethodology(parsed.methodology);
    expect(v.ok).toBe(true);
  });

  test('phases_from_artifact round-trip via serialize→parse', () => {
    const ir: Methodology = {
      id: 't',
      version: '1.0.0',
      name: 'T',
      description: '',
      stages: [
        {
          id: 'plan',
          name: 'Plan',
          mode: 'interactive',
          contract: { input: [], output: { path: 'plan.md' } },
        },
        {
          id: 'impl',
          name: 'Impl',
          mode: 'auto',
          contract: { input: [], output: { path: 'impl.md' } },
          phases_source: 'from_artifact',
          phases_from_artifact: { stage_id: 'plan', artifact: 'plan.md', section: '## Phases' },
        },
      ],
      edges: [
        { from: 'start', to: 'plan', condition: { kind: 'always' } },
        { from: 'plan', to: 'impl', condition: { kind: 'always' } },
        { from: 'impl', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const out = serializeMethodology(ir);
    const parsed = parseMethodology(out, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    const impl = parsed.methodology.stages.find((s) => s.id === 'impl')!;
    expect(impl.phases_source).toBe('from_artifact');
    expect(impl.phases_from_artifact).toEqual({
      stage_id: 'plan',
      artifact: 'plan.md',
      section: '## Phases',
    });
  });
});
