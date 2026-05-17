import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';

const MIN_FRONT = `---
id: t
version: 1.0.0
name: T
description: t
---

`;

describe('parseMethodology — stage display name', () => {
  test('Plan 2 syntax: name defaults to id when no separator', () => {
    const md = MIN_FRONT + '## Stage: req\nmode: auto\n';
    const r = parseMethodology(md, '/p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.methodology.stages[0]!.id).toBe('req');
    expect(r.methodology.stages[0]!.name).toBe('req');
  });

  test('em-dash separator: `## Stage: req — Requirements`', () => {
    const md = MIN_FRONT + '## Stage: req — Requirements\nmode: auto\n';
    const r = parseMethodology(md, '/p.md');
    if (!r.ok) throw new Error('parse failed');
    expect(r.methodology.stages[0]!.id).toBe('req');
    expect(r.methodology.stages[0]!.name).toBe('Requirements');
  });

  test('ASCII hyphen separator: `## Stage: req - Requirements`', () => {
    const md = MIN_FRONT + '## Stage: req - Requirements\nmode: auto\n';
    const r = parseMethodology(md, '/p.md');
    if (!r.ok) throw new Error('parse failed');
    expect(r.methodology.stages[0]!.id).toBe('req');
    expect(r.methodology.stages[0]!.name).toBe('Requirements');
  });

  test('multi-word display name preserved verbatim', () => {
    const md = MIN_FRONT + '## Stage: req — Collect & refine requirements\nmode: auto\n';
    const r = parseMethodology(md, '/p.md');
    if (!r.ok) throw new Error('parse failed');
    expect(r.methodology.stages[0]!.name).toBe('Collect & refine requirements');
  });
});

describe('serializeMethodology — stage display name', () => {
  test('emits `## Stage: id — Name` when name differs from id', () => {
    const md = MIN_FRONT + '## Stage: req — Requirements\nmode: auto\n';
    const parsed = parseMethodology(md, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    const out = serializeMethodology(parsed.methodology);
    expect(out).toContain('## Stage: req — Requirements');
  });

  test('emits bare `## Stage: id` when name equals id', () => {
    const md = MIN_FRONT + '## Stage: req\nmode: auto\n';
    const parsed = parseMethodology(md, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    const out = serializeMethodology(parsed.methodology);
    expect(out).toContain('## Stage: req');
    expect(out).not.toContain('## Stage: req —');
  });

  test('round-trip preserves name change', () => {
    const md = MIN_FRONT + '## Stage: req\nmode: auto\n';
    const parsed = parseMethodology(md, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    const mutated = {
      ...parsed.methodology,
      stages: [{ ...parsed.methodology.stages[0]!, name: 'Requirements (revised)' }],
    };
    const out = serializeMethodology(mutated);
    const reparsed = parseMethodology(out, '/p.md');
    if (!reparsed.ok) throw new Error('reparse fail');
    expect(reparsed.methodology.stages[0]!.name).toBe('Requirements (revised)');
  });
});
