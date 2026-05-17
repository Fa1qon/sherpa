import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';

describe('parseMethodology — frontmatter + stages', () => {
  test('parses minimal frontmatter into meta fields', () => {
    const md = `---
id: lite_cycle
version: 1.0.0
name: Lite Cycle
description: Tight, low-overhead dev loop.
---

## Stage: req
mode: interactive

Collect requirements.
`;
    const r = parseMethodology(md, '/path/lite_cycle.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.methodology.id).toBe('lite_cycle');
    expect(r.methodology.version).toBe('1.0.0');
    expect(r.methodology.name).toBe('Lite Cycle');
    expect(r.methodology.description).toBe('Tight, low-overhead dev loop.');
    expect(r.methodology.stages).toHaveLength(1);
    expect(r.methodology.stages[0]!.id).toBe('req');
    expect(r.methodology.stages[0]!.mode).toBe('interactive');
    expect(r.methodology.stages[0]!.prompt).toContain('Collect requirements');
  });

  test('defaults version to 0.0.0 if missing, with warning', () => {
    const md = `---
id: noversion
name: No Version
description: missing version
---

## Stage: req
mode: auto
`;
    const r = parseMethodology(md, '/p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.methodology.version).toBe('0.0.0');
    expect(r.warnings.some((w) => w.includes('version'))).toBe(true);
  });

  test('separates HTML-comment AI block into ai_directives (NOT merged into prompt)', () => {
    const md = `---
id: x
version: 1
name: X
description: x
---

## Stage: s1
mode: auto

<!-- AI:
Be terse. Output JSON.
-->

Read the codebase.
`;
    const r = parseMethodology(md, '/p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const stage = r.methodology.stages[0]!;
    // Prompt is just the narrative — no AI: text leaks in
    expect(stage.prompt).toBe('Read the codebase.');
    expect(stage.prompt).not.toContain('Be terse');
    // AI: comment surfaces as a separate field
    expect(stage.ai_directives).toEqual(['Be terse. Output JSON.']);
  });

  test('rejects file with no frontmatter', () => {
    const md = `## Stage: a\nmode: auto\n`;
    const r = parseMethodology(md, '/p.md');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('parse-error');
  });

  test('rejects file with no stages', () => {
    const md = `---\nid: x\nversion: 1\nname: X\ndescription: x\n---\n\nNo stages here.\n`;
    const r = parseMethodology(md, '/p.md');
    expect(r.ok).toBe(false);
  });

  test('preserves unrecognized frontmatter fields under meta', () => {
    const md = `---
id: x
version: 1
name: X
description: x
custom_field: keep me
nested:
  thing: 42
---

## Stage: a
mode: auto
`;
    const r = parseMethodology(md, '/p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.methodology.meta?.custom_field).toBe('keep me');
    expect((r.methodology.meta?.nested as { thing: number }).thing).toBe(42);
  });
});

describe('parseMethodology — GATES table edge derivation', () => {
  test('parses GATES table into gate-fail edges', () => {
    const md = `---
id: x
version: 1
name: X
description: x
---

## Stage: req
mode: interactive

## Stage: design
mode: gate

## Stage: impl
mode: auto

## GATES

| from   | to       | condition  | maxCycles |
|--------|----------|------------|-----------|
| impl   | design   | gate-fail  | 2         |
`;
    const r = parseMethodology(md, '/p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const backLoop = r.methodology.edges.find((e) => e.from === 'impl' && e.to === 'design');
    expect(backLoop).toBeDefined();
    expect(backLoop!.condition.kind).toBe('gate-fail');
    if (backLoop!.condition.kind === 'gate-fail') {
      expect(backLoop!.condition.maxCycles).toBe(2);
    }
  });

  test('linear edges still derived alongside gate edges', () => {
    const md = `---
id: x
version: 1
name: X
description: x
---

## Stage: a
mode: auto

## Stage: b
mode: gate

## GATES

| from | to | condition | maxCycles |
|------|----|-----------|-----------|
| b    | a  | gate-fail | 2         |
`;
    const r = parseMethodology(md, '/p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Should have: start→a, a→b, b→end (linear) PLUS b→a (gate-fail)
    expect(r.methodology.edges).toHaveLength(4);
    expect(r.methodology.edges.filter((e) => e.condition.kind === 'always')).toHaveLength(3);
    expect(r.methodology.edges.filter((e) => e.condition.kind === 'gate-fail')).toHaveLength(1);
  });

  test('warns on GATES rows referring to unknown stages', () => {
    const md = `---
id: x
version: 1
name: X
description: x
---

## Stage: a
mode: auto

## GATES

| from    | to   | condition | maxCycles |
|---------|------|-----------|-----------|
| missing | a    | gate-fail | 2         |
`;
    const r = parseMethodology(md, '/p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.some((w) => w.includes('missing'))).toBe(true);
  });
});
