import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';

const FRONT_PRE = `---
id: t
version: 1.0.0
name: T
description: t`;

describe('layout.positions round-trip', () => {
  test('parses layout positions from frontmatter', () => {
    const md = `${FRONT_PRE}
layout:
  positions:
    a: { x: 100, y: 50 }
    b: { x: 280, y: 50 }
---

## Stage: a
mode: auto

## Stage: b
mode: auto
`;
    const r = parseMethodology(md, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    expect(r.methodology.layout?.positions).toEqual({
      a: { x: 100, y: 50 },
      b: { x: 280, y: 50 },
    });
  });

  test('serializes layout positions into frontmatter', () => {
    const m = {
      id: 't', version: '1', name: 'T', description: 't',
      stages: [
        { id: 'a', name: 'a', mode: 'auto' as const, contract: { input: [], output: { path: 'a.md' } } },
      ],
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' as const } },
        { from: 'a', to: 'end', condition: { kind: 'always' as const } },
      ],
      layout: { positions: { a: { x: 100, y: 50 } } },
    };
    const out = serializeMethodology(m);
    expect(out).toContain('layout:');
    expect(out).toMatch(/positions:[\s\S]*a:/);
    const r = parseMethodology(out, '/p.md');
    if (!r.ok) throw new Error('reparse fail');
    expect(r.methodology.layout?.positions?.a).toEqual({ x: 100, y: 50 });
  });

  test('absent layout omits the block', () => {
    const m = {
      id: 't', version: '1', name: 'T', description: 't',
      stages: [
        { id: 'a', name: 'a', mode: 'auto' as const, contract: { input: [], output: { path: 'a.md' } } },
      ],
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' as const } },
        { from: 'a', to: 'end', condition: { kind: 'always' as const } },
      ],
    };
    const out = serializeMethodology(m);
    expect(out).not.toContain('layout:');
  });
});
