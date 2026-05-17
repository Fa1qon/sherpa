// tests/core/methodology/serialize.spec.ts
import { describe, test, expect } from 'vitest';
import { serializeMethodology } from '../../../src/core/methodology/serialize';
import { parseMethodology } from '../../../src/core/methodology/parse';

const SAMPLE_MD = `---
id: lite
version: 1.0.0
name: Lite
description: A short cycle.
author: sherpa
---

## Stage: req
mode: interactive

Collect requirements from user.

## Stage: impl
mode: auto

Implement the changes.

## GATES

| from | to  | condition | maxCycles |
|------|-----|-----------|-----------|
| impl | req | gate-fail | 1         |
`;

describe('serializeMethodology', () => {
  test('serializes back into parsable markdown', () => {
    const parsed = parseMethodology(SAMPLE_MD, '/p.md');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const serialized = serializeMethodology(parsed.methodology);

    const reparsed = parseMethodology(serialized, '/p.md');
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;

    expect(reparsed.methodology.id).toBe('lite');
    expect(reparsed.methodology.version).toBe('1.0.0');
    expect(reparsed.methodology.stages).toHaveLength(2);
    expect(reparsed.methodology.stages.map((s) => s.id)).toEqual(['req', 'impl']);
    expect(reparsed.methodology.edges.some((e) => e.from === 'impl' && e.to === 'req' && e.condition.kind === 'gate-fail')).toBe(true);
  });

  test('preserves unrecognized meta in frontmatter', () => {
    const md = `---
id: x
version: 1
name: X
description: x
custom_thing: keep
---

## Stage: a
mode: auto
`;
    const parsed = parseMethodology(md, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    const out = serializeMethodology(parsed.methodology);
    expect(out).toContain('custom_thing: keep');
    const reparsed = parseMethodology(out, '/p.md');
    if (!reparsed.ok) throw new Error('reparse fail');
    expect(reparsed.methodology.meta?.custom_thing).toBe('keep');
  });
});

describe('serializeMethodology — v1 byte-identity', () => {
  const v1Fixtures: ReadonlyArray<{ name: string; md: string }> = [
    {
      name: 'lite linear with author',
      md: `---
id: lite
version: 1.0.0
name: Lite
description: A short cycle.
author: sherpa
---

## Stage: req
mode: interactive

Collect requirements from user.

## Stage: impl
mode: auto

Implement the changes.

## GATES

| from | to  | condition | maxCycles |
|------|-----|-----------|-----------|
| impl | req | gate-fail | 1         |
`,
    },
    {
      name: 'EDGES authoritative 5-column',
      md: `---
id: edges5
version: 1.0.0
name: Edges5
description: ""
---

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
`,
    },
    {
      name: 'minimal v1 with empty description',
      md: `---
id: legacy
version: 1.0.0
name: Legacy
description: ""
---

## Stage: s1
mode: auto
`,
    },
  ];

  const YAML_FENCE = '```' + 'yaml';
  const V2_EDGES_HEADER = '| from | to | condition | expr | maxCycles | increment | preserve |';

  for (const fix of v1Fixtures) {
    test(`v1 fixture "${fix.name}" — no v2 schema leaks into serialized output`, () => {
      const parsed = parseMethodology(fix.md, '/p.md');
      if (!parsed.ok) throw new Error(`parse fail: ${JSON.stringify(parsed.error)}`);
      const out = serializeMethodology(parsed.methodology);

      // No v2 stage directives fence
      expect(out).not.toContain(YAML_FENCE);

      // No v2 root keys
      expect(out).not.toMatch(/^language:\s*/m);
      expect(out).not.toMatch(/^gate_strictness:\s*/m);
      expect(out).not.toMatch(/^applicability:\s*/m);
      expect(out).not.toMatch(/^anti_patterns:\s*/m);
      expect(out).not.toMatch(/^context_budget:\s*/m);
      expect(out).not.toMatch(/^state_schema:\s*/m);
      expect(out).not.toMatch(/^skills_hint:\s*/m);

      // 7-column EDGES header must NOT appear
      expect(out).not.toContain(V2_EDGES_HEADER);
    });

    test(`v1 fixture "${fix.name}" — idempotent round-trip`, () => {
      const parsed1 = parseMethodology(fix.md, '/p.md');
      if (!parsed1.ok) throw new Error(`parse 1 fail: ${JSON.stringify(parsed1.error)}`);
      const out1 = serializeMethodology(parsed1.methodology);
      const parsed2 = parseMethodology(out1, '/p.md');
      if (!parsed2.ok) throw new Error(`parse 2 fail: ${JSON.stringify(parsed2.error)}`);
      const out2 = serializeMethodology(parsed2.methodology);
      // Second serialize must equal first (idempotent).
      expect(out2).toBe(out1);
      // IR must be structurally identical.
      expect(parsed2.methodology).toEqual(parsed1.methodology);
    });
  }
});
