import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';

const FRONT = `---
id: t
version: 1.0.0
name: T
description: t
---

`;

describe('parseMethodology — ## EDGES authoritative table', () => {
  test('uses EDGES when present, ignores linear inference', () => {
    const md = FRONT + `
## Stage: a
mode: auto

## Stage: b
mode: auto

## Stage: c
mode: auto

## EDGES

| from  | to    | condition | expr  | maxCycles |
|-------|-------|-----------|-------|-----------|
| start | a     | always    |       |           |
| a     | c     | always    |       |           |
| c     | b     | always    |       |           |
| b     | end   | always    |       |           |
`;
    const r = parseMethodology(md, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    expect(r.methodology.edges).toHaveLength(4);
    const a_to_c = r.methodology.edges.find((e) => e.from === 'a' && e.to === 'c');
    expect(a_to_c).toBeDefined();
    expect(a_to_c!.condition.kind).toBe('always');
    expect(r.methodology.edges.find((e) => e.from === 'a' && e.to === 'b')).toBeUndefined();
  });

  test('parses gate-fail with maxCycles', () => {
    const md = FRONT + `
## Stage: a
mode: auto

## Stage: b
mode: gate

## EDGES

| from | to  | condition | expr | maxCycles |
|------|-----|-----------|------|-----------|
| start | a  | always    |      |           |
| a    | b   | always    |      |           |
| b    | a   | gate-fail |      | 2         |
| b    | end | gate-pass |      |           |
`;
    const r = parseMethodology(md, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    const backloop = r.methodology.edges.find((e) => e.from === 'b' && e.to === 'a');
    expect(backloop).toBeDefined();
    expect(backloop!.condition).toEqual({ kind: 'gate-fail', maxCycles: 2 });
  });

  test('parses branch with expr', () => {
    const md = FRONT + `
## Stage: a
mode: auto

## Stage: b
mode: auto

## Stage: c
mode: auto

## EDGES

| from  | to | condition | expr        | maxCycles |
|-------|----|-----------|-------------|-----------|
| start | a  | always    |             |           |
| a     | b  | branch    | x == 'foo'  |           |
| a     | c  | branch    | x == 'bar'  |           |
| b     | end | always   |             |           |
| c     | end | always   |             |           |
`;
    const r = parseMethodology(md, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    const a_to_b = r.methodology.edges.find((e) => e.from === 'a' && e.to === 'b');
    expect(a_to_b).toBeDefined();
    expect(a_to_b!.condition).toEqual({ kind: 'branch', expr: "x == 'foo'" });
  });

  test('ignores unknown condition kinds with warning', () => {
    const md = FRONT + `
## Stage: a
mode: auto

## EDGES

| from  | to | condition | expr | maxCycles |
|-------|----|-----------|------|-----------|
| start | a  | always    |      |           |
| a     | end | gibberish |     |           |
`;
    const r = parseMethodology(md, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    expect(r.warnings.some((w) => w.includes('gibberish'))).toBe(true);
    expect(r.methodology.edges.find((e) => e.to === 'end' && e.from === 'a')).toBeUndefined();
  });

  test('falls back to Plan 2 (linear + GATES) when no EDGES section', () => {
    const md = FRONT + `
## Stage: a
mode: auto

## Stage: b
mode: auto
`;
    const r = parseMethodology(md, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    expect(r.methodology.edges).toHaveLength(3);
    expect(r.methodology.edges[0]).toEqual({
      from: 'start', to: 'a', condition: { kind: 'always' },
    });
  });
});

describe('serializeMethodology — ## EDGES emission', () => {
  test('omits EDGES for trivial linear flow', () => {
    const md = FRONT + '## Stage: a\nmode: auto\n\n## Stage: b\nmode: auto\n';
    const parsed = parseMethodology(md, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    const out = serializeMethodology(parsed.methodology);
    expect(out).not.toContain('## EDGES');
  });

  test('emits EDGES with all rows for rerouted graph', () => {
    const md = FRONT + `
## Stage: a
mode: auto

## Stage: b
mode: auto

## Stage: c
mode: auto

## EDGES

| from  | to | condition | expr | maxCycles |
|-------|----|-----------|------|-----------|
| start | a  | always    |      |           |
| a     | c  | always    |      |           |
| c     | b  | always    |      |           |
| b     | end | always   |      |           |
`;
    const parsed = parseMethodology(md, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    const out = serializeMethodology(parsed.methodology);
    expect(out).toContain('## EDGES');
    expect(out).toContain('| a | c | always');
    expect(out).toContain('| c | b | always');
    const reparsed = parseMethodology(out, '/p.md');
    if (!reparsed.ok) throw new Error('reparse fail');
    expect(reparsed.methodology.edges).toEqual(parsed.methodology.edges);
  });

  test('emits gate-fail with maxCycles cell', () => {
    const md = FRONT + `
## Stage: a
mode: auto

## Stage: b
mode: gate

## EDGES

| from  | to  | condition | expr | maxCycles |
|-------|-----|-----------|------|-----------|
| start | a   | always    |      |           |
| a     | b   | always    |      |           |
| b     | a   | gate-fail |      | 2         |
| b     | end | gate-pass |      |           |
`;
    const parsed = parseMethodology(md, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    const out = serializeMethodology(parsed.methodology);
    expect(out).toContain('gate-fail');
    expect(out).toMatch(/\|\s*b\s*\|\s*a\s*\|\s*gate-fail\s*\|\s*\|\s*2\s*\|/);
  });

  test('preserves 5-column EDGES table when no v2 counter columns used', () => {
    const md = `---
id: t
version: 1.0.0
name: T
description: t
---

## Stage: a
mode: auto

## Stage: b
mode: auto

## Stage: c
mode: auto

## EDGES

| from  | to | condition | expr | maxCycles |
|-------|----|-----------|------|-----------|
| start | a  | always    |      |           |
| a     | c  | always    |      |           |
| c     | b  | always    |      |           |
| b     | end | always   |      |           |
`;
    const parsed = parseMethodology(md, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    const out = serializeMethodology(parsed.methodology);
    // Header MUST remain 5-column
    expect(out).toContain('| from | to | condition | expr | maxCycles |');
    expect(out).not.toContain('| increment |');
    expect(out).not.toContain('| preserve |');
  });

  test('emits branch with expr cell', () => {
    const m = {
      id: 'x', version: '1', name: 'X', description: 'x',
      stages: [
        { id: 'a', name: 'a', mode: 'auto' as const, contract: { input: [], output: { path: 'a.md' } } },
        { id: 'b', name: 'b', mode: 'auto' as const, contract: { input: [], output: { path: 'b.md' } } },
      ],
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' as const } },
        { from: 'a', to: 'b', condition: { kind: 'branch' as const, expr: "x == 'foo'" } },
        { from: 'b', to: 'end', condition: { kind: 'always' as const } },
      ],
    };
    const out = serializeMethodology(m);
    expect(out).toContain('branch');
    expect(out).toContain("x == 'foo'");
    const reparsed = parseMethodology(out, '/p.md');
    if (!reparsed.ok) throw new Error('reparse fail');
    const edge = reparsed.methodology.edges.find((e) => e.from === 'a' && e.to === 'b');
    expect(edge?.condition).toEqual({ kind: 'branch', expr: "x == 'foo'" });
  });
});
