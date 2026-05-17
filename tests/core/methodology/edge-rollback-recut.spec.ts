import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';
import type { Methodology } from '../../../src/core/domain/methodology';

describe('edge kinds — rollback + recut', () => {
  test('parses rollback with maxCycles and counter mutations from 7-column EDGES table', () => {
    const md = `---
id: t
version: 1.0.0
name: T
description: t
state_schema:
  - id: fix_cycles
    kind: counter
    initial: 0
  - id: mockup_approved
    kind: flag
    initial: false
    preserve_on_rollback: true
---

## Stage: a
mode: auto

## Stage: b
mode: auto

## EDGES

| from  | to | condition | expr | maxCycles | increment   | preserve         |
|-------|----|-----------|------|-----------|-------------|------------------|
| start | a  | always    |      |           |             |                  |
| a     | b  | always    |      |           |             |                  |
| b     | a  | rollback  |      | 2         | fix_cycles  | mockup_approved  |
| a     | a  | recut     |      |           |             |                  |
| b     | end | always   |      |           |             |                  |
`;
    const r = parseMethodology(md, '/p.md');
    if (!r.ok) throw new Error(`parse fail: ${JSON.stringify(r.error)}`);
    const rollback = r.methodology.edges.find((e) => e.from === 'b' && e.to === 'a');
    expect(rollback).toBeDefined();
    expect(rollback!.condition).toEqual({ kind: 'rollback', maxCycles: 2 });
    expect(rollback!.increment_counters_on_traverse).toEqual(['fix_cycles']);
    expect(rollback!.preserve_counters_on_traverse).toEqual(['mockup_approved']);
    const recut = r.methodology.edges.find((e) => e.condition.kind === 'recut');
    expect(recut).toBeDefined();
  });

  test('round-trips rollback + recut + counters', () => {
    const ir: Methodology = {
      id: 't2', version: '1.0.0', name: 'T2', description: '',
      state_schema: [
        { id: 'fix_cycles', kind: 'counter', initial: 0 },
        { id: 'mockup_approved', kind: 'flag', initial: false },
      ],
      stages: [
        { id: 'a', name: 'a', mode: 'auto', contract: { input: [], output: { path: 'a.md' } } },
        { id: 'b', name: 'b', mode: 'auto', contract: { input: [], output: { path: 'b.md' } } },
      ],
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' } },
        { from: 'a', to: 'b', condition: { kind: 'always' } },
        {
          from: 'b', to: 'a', condition: { kind: 'rollback', maxCycles: 2 },
          increment_counters_on_traverse: ['fix_cycles'],
          preserve_counters_on_traverse: ['mockup_approved'],
        },
        { from: 'a', to: 'a', condition: { kind: 'recut' } },
        { from: 'b', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const out = serializeMethodology(ir);
    expect(out).toContain('| from | to | condition | expr | maxCycles | increment | preserve |');
    expect(out).toContain('rollback');
    expect(out).toContain('recut');
    expect(out).toContain('fix_cycles');
    expect(out).toContain('mockup_approved');
    const reparsed = parseMethodology(out, '/p.md');
    if (!reparsed.ok) throw new Error('reparse fail');
    expect(reparsed.methodology.edges).toEqual(ir.edges);
  });

  test('v1 5-column EDGES table preserved when no counter mutations exist', () => {
    const ir: Methodology = {
      id: 't3', version: '1.0.0', name: 'T3', description: '',
      stages: [
        { id: 'a', name: 'a', mode: 'auto', contract: { input: [], output: { path: 'a.md' } } },
        { id: 'b', name: 'b', mode: 'auto', contract: { input: [], output: { path: 'b.md' } } },
      ],
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' } },
        { from: 'a', to: 'b', condition: { kind: 'rollback' } },
        { from: 'b', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const out = serializeMethodology(ir);
    // 5-column header — no `increment | preserve`
    expect(out).toContain('| from | to | condition | expr | maxCycles |');
    expect(out).not.toContain('| from | to | condition | expr | maxCycles | increment | preserve |');
  });
});
