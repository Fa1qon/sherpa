import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';
import type { Methodology, Stage, Edge } from '../../../src/core/domain/methodology';

const ORIGINAL = `---
id: lite
version: 1.0.0
name: Lite Cycle
description: A short development cycle.
---

## Stage: req
mode: interactive

Collect requirements.

## Stage: impl
mode: auto

Implement the changes.
`;

describe('S6 round-trip — mutation sequence', () => {
  test('rename + add stage + reroute + back-loop with maxCycles=2', () => {
    const parsed = parseMethodology(ORIGINAL, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');

    // Op A: rename `req` → display name "Requirements (revised)"
    const renamed: Stage = { ...parsed.methodology.stages[0]!, name: 'Requirements (revised)' };

    // Op B: add new stage `verify` with mode 'gate'
    const verify: Stage = {
      id: 'verify',
      name: 'Verification',
      mode: 'gate',
      contract: { input: [], output: { path: 'verify.md' } },
    };

    // Op C: reroute `impl → end` to `impl → verify`, add `verify → end`
    // Op D: add gate-fail back-loop `verify → impl` with maxCycles=2
    const newEdges: Edge[] = [
      { from: 'start', to: 'req', condition: { kind: 'always' } },
      { from: 'req', to: 'impl', condition: { kind: 'always' } },
      { from: 'impl', to: 'verify', condition: { kind: 'always' } },
      { from: 'verify', to: 'end', condition: { kind: 'gate-pass' } },
      { from: 'verify', to: 'impl', condition: { kind: 'gate-fail', maxCycles: 2 } },
    ];

    const mutated: Methodology = {
      ...parsed.methodology,
      stages: [renamed, parsed.methodology.stages[1]!, verify],
      edges: newEdges,
    };

    const out = serializeMethodology(mutated);
    const reparsed = parseMethodology(out, '/p.md');
    if (!reparsed.ok) throw new Error(`reparse fail: ${JSON.stringify(reparsed.error)}`);

    expect(reparsed.methodology.stages.find((s) => s.id === 'req')!.name).toBe('Requirements (revised)');

    expect(reparsed.methodology.stages.find((s) => s.id === 'verify')).toBeDefined();
    expect(reparsed.methodology.stages.find((s) => s.id === 'verify')!.mode).toBe('gate');

    expect(reparsed.methodology.edges.find((e) => e.from === 'impl' && e.to === 'verify')).toBeDefined();
    expect(reparsed.methodology.edges.find((e) => e.from === 'impl' && e.to === 'end')).toBeUndefined();

    const backloop = reparsed.methodology.edges.find((e) => e.from === 'verify' && e.to === 'impl');
    expect(backloop).toBeDefined();
    expect(backloop!.condition).toEqual({ kind: 'gate-fail', maxCycles: 2 });

    const verifyEnd = reparsed.methodology.edges.find((e) => e.from === 'verify' && e.to === 'end');
    expect(verifyEnd?.condition).toEqual({ kind: 'gate-pass' });
  });

  test('drag positions preserved through round-trip', () => {
    const parsed = parseMethodology(ORIGINAL, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    const mutated: Methodology = {
      ...parsed.methodology,
      layout: { positions: { req: { x: 100, y: 50 }, impl: { x: 280, y: 50 } } },
    };
    const out = serializeMethodology(mutated);
    const reparsed = parseMethodology(out, '/p.md');
    if (!reparsed.ok) throw new Error('reparse fail');
    expect(reparsed.methodology.layout?.positions).toEqual({
      req: { x: 100, y: 50 },
      impl: { x: 280, y: 50 },
    });
  });
});
