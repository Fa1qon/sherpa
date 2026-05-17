// tests/core/methodology/contract-v2.spec.ts
import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';
import { validateMethodology } from '../../../src/core/methodology/validate';
import type { Methodology } from '../../../src/core/domain/methodology';

function parseOrThrow(src: string): Methodology {
  const r = parseMethodology(src, '/p.md');
  if (!r.ok) throw new Error(`parse fail: ${JSON.stringify(r.error)}`);
  return r.methodology;
}

describe('contract I/O + context_essentials + ArtifactSpec.format', () => {
  test('inputs round-trip', () => {
    const src = `---
id: m
version: 1.0.0
name: m
description: ""
---

## Stage: a
mode: auto

\`\`\`yaml
output:
  path: a.md
\`\`\`

## Stage: b
mode: auto

\`\`\`yaml
inputs:
  - stage: a
    artifact: a.md
\`\`\`
`;
    const m = parseOrThrow(src);
    const b = m.stages.find((s) => s.id === 'b')!;
    expect(b.contract.input).toEqual([{ stage: 'a', artifact: 'a.md' }]);

    const out = serializeMethodology(m);
    const m2 = parseOrThrow(out);
    const b2 = m2.stages.find((s) => s.id === 'b')!;
    expect(b2.contract.input).toEqual([{ stage: 'a', artifact: 'a.md' }]);
    // Idempotent
    expect(serializeMethodology(m2)).toBe(out);
  });

  test('output with explicit path/format/schema round-trip', () => {
    const m: Methodology = {
      id: 'm',
      version: '1.0.0',
      name: 'm',
      description: '',
      stages: [
        {
          id: 'a',
          name: 'a',
          mode: 'auto',
          contract: {
            input: [],
            output: {
              path: 'custom_output.txt',
              format: 'plaintext',
              schema: { type: 'object', required: ['x'] },
            },
          },
        },
      ],
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' } },
        { from: 'a', to: 'end', condition: { kind: 'always' } },
      ],
    };

    const out = serializeMethodology(m);
    const m2 = parseOrThrow(out);
    const a = m2.stages.find((s) => s.id === 'a')!;
    expect(a.contract.output).toEqual({
      path: 'custom_output.txt',
      format: 'plaintext',
      schema: { type: 'object', required: ['x'] },
    });
  });

  test('context_essentials round-trip', () => {
    const src = `---
id: m
version: 1.0.0
name: m
description: ""
---

## Stage: requirements
mode: auto

## Stage: research
mode: auto

\`\`\`yaml
context_essentials:
  - stage: requirements
    artifact: requirements.md
\`\`\`
`;
    const m = parseOrThrow(src);
    const research = m.stages.find((s) => s.id === 'research')!;
    expect(research.context_essentials).toEqual([
      { stage: 'requirements', artifact: 'requirements.md' },
    ]);

    const out = serializeMethodology(m);
    const m2 = parseOrThrow(out);
    const r2 = m2.stages.find((s) => s.id === 'research')!;
    expect(r2.context_essentials).toEqual([
      { stage: 'requirements', artifact: 'requirements.md' },
    ]);
    expect(serializeMethodology(m2)).toBe(out);
  });

  test('validator: context_essentials referring to unknown stage → error', () => {
    const m: Methodology = {
      id: 'm',
      version: '1.0.0',
      name: 'm',
      description: '',
      stages: [
        {
          id: 'a',
          name: 'a',
          mode: 'auto',
          contract: { input: [], output: { path: 'a.md' } },
          context_essentials: [{ stage: 'ghost', artifact: 'ghost.md' }],
        },
      ],
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' } },
        { from: 'a', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const r = validateMethodology(m);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /context_essentials refers to unknown stage "ghost"/.test(e))).toBe(true);
    }
  });

  test("validator: input.artifact mismatching upstream stage's output.path → error", () => {
    const m: Methodology = {
      id: 'm',
      version: '1.0.0',
      name: 'm',
      description: '',
      stages: [
        {
          id: 'a',
          name: 'a',
          mode: 'auto',
          contract: { input: [], output: { path: 'a.md' } },
        },
        {
          id: 'b',
          name: 'b',
          mode: 'auto',
          contract: {
            input: [{ stage: 'a', artifact: 'wrong.md' }],
            output: { path: 'b.md' },
          },
        },
      ],
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' } },
        { from: 'a', to: 'b', condition: { kind: 'always' } },
        { from: 'b', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const r = validateMethodology(m);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /input artifact "wrong.md" doesn't match/.test(e))).toBe(true);
    }
  });

  test("default-shaped stages don't emit inputs:/output: in serialized YAML", () => {
    const m: Methodology = {
      id: 'm',
      version: '1.0.0',
      name: 'm',
      description: '',
      stages: [
        {
          id: 'a',
          name: 'a',
          mode: 'auto',
          contract: { input: [], output: { path: 'a.md' } },
        },
      ],
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' } },
        { from: 'a', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const out = serializeMethodology(m);
    expect(out).not.toMatch(/^inputs:/m);
    expect(out).not.toMatch(/^output:/m);
  });

  test('ArtifactSpec.format=plaintext round-trip', () => {
    const m: Methodology = {
      id: 'm',
      version: '1.0.0',
      name: 'm',
      description: '',
      stages: [
        {
          id: 'a',
          name: 'a',
          mode: 'auto',
          contract: {
            input: [],
            output: { path: 'a.txt', format: 'plaintext' },
          },
        },
      ],
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' } },
        { from: 'a', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const out = serializeMethodology(m);
    const m2 = parseOrThrow(out);
    const a = m2.stages.find((s) => s.id === 'a')!;
    expect(a.contract.output.format).toBe('plaintext');
    expect(a.contract.output.path).toBe('a.txt');
    expect(serializeMethodology(m2)).toBe(out);
  });
});
