// tests/core/methodology/corpus-reads.spec.ts
import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';
import { validateMethodology } from '../../../src/core/methodology/validate';
import type { Methodology, CorpusRead } from '../../../src/core/domain/methodology';

const SRC_WITH_CORPUS = `---
id: arch_methodology
version: 2.1.0
name: Architect Methodology
description: Pattern-driven architecture methodology.
---

## Stage: synthesize
mode: auto

\`\`\`yaml
corpus_reads:
  - path: docs/patterns/index.md
    content_type: markdown
    purpose: Pattern catalog index
    inject_into: system_prompt
  - path: docs/patterns/decision_trees/by_context.yaml
    content_type: yaml
    purpose: Context to pattern routing rules
    inject_into: tool_accessible
  - path: docs/solid_rules.yaml
    content_type: yaml
    purpose: SOLID validation rules
\`\`\`

synthesize body
`;

const SRC_V1_NO_CORPUS = `---
id: simple
version: 1.0.0
name: Simple
description: A simple methodology without corpus_reads.
---

## Stage: only
mode: auto

body
`;

function baseStage(overrides: Record<string, unknown> = {}): Methodology['stages'][number] {
  return {
    id: 'only',
    name: 'Only',
    mode: 'auto',
    contract: { input: [], output: { path: 'only.md' } },
    ...overrides,
  } as Methodology['stages'][number];
}

function baseMethodology(stage: Methodology['stages'][number]): Methodology {
  return {
    id: 'm',
    version: '1.0.0',
    name: 'M',
    description: 'd',
    stages: [stage],
    edges: [
      { from: 'start', to: stage.id, condition: { kind: 'always' } },
      { from: stage.id, to: 'end', condition: { kind: 'always' } },
    ],
  };
}

describe('Stage.corpus_reads — parse', () => {
  test('parses a single corpus read', () => {
    const src = `---
id: m
version: 1.0.0
name: M
description: d
---

## Stage: s
mode: auto

\`\`\`yaml
corpus_reads:
  - path: a.md
    content_type: markdown
    purpose: just a
\`\`\`
`;
    const r = parseMethodology(src, 'm.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const reads = r.methodology.stages[0]!.corpus_reads;
    expect(reads).toBeDefined();
    expect(reads!.length).toBe(1);
    expect(reads![0]).toEqual({
      path: 'a.md',
      content_type: 'markdown',
      purpose: 'just a',
    });
    // inject_into not auto-defaulted in IR
    expect(reads![0]!.inject_into).toBeUndefined();
  });

  test('parses multiple corpus reads with all fields', () => {
    const r = parseMethodology(SRC_WITH_CORPUS, 'm.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const reads = r.methodology.stages[0]!.corpus_reads;
    expect(reads).toBeDefined();
    expect(reads!.length).toBe(3);
    expect(reads![0]!.inject_into).toBe('system_prompt');
    expect(reads![1]!.inject_into).toBe('tool_accessible');
    expect(reads![2]!.inject_into).toBeUndefined();
    expect(reads![1]!.path).toBe('docs/patterns/decision_trees/by_context.yaml');
    expect(reads![1]!.content_type).toBe('yaml');
  });

  test('v1 fixture without corpus_reads still parses cleanly', () => {
    const r = parseMethodology(SRC_V1_NO_CORPUS, 'm.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.methodology.stages[0]!.corpus_reads).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });

  test('missing path is warned and entry skipped', () => {
    const src = `---
id: m
version: 1.0.0
name: M
description: d
---

## Stage: s
mode: auto

\`\`\`yaml
corpus_reads:
  - content_type: markdown
    purpose: no path here
  - path: kept.md
    content_type: markdown
    purpose: this one survives
\`\`\`
`;
    const r = parseMethodology(src, 'm.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.some((w) => w.includes('corpus_reads[0]') && w.includes('path'))).toBe(true);
    const reads = r.methodology.stages[0]!.corpus_reads!;
    expect(reads.length).toBe(1);
    expect(reads[0]!.path).toBe('kept.md');
  });

  test('empty path string is warned and entry skipped', () => {
    const src = `---
id: m
version: 1.0.0
name: M
description: d
---

## Stage: s
mode: auto

\`\`\`yaml
corpus_reads:
  - path: ""
    content_type: markdown
    purpose: empty
\`\`\`
`;
    const r = parseMethodology(src, 'm.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.some((w) => w.includes('corpus_reads[0]') && w.includes('path'))).toBe(true);
    expect(r.methodology.stages[0]!.corpus_reads).toBeUndefined();
  });

  test('bad content_type is warned and entry skipped', () => {
    const src = `---
id: m
version: 1.0.0
name: M
description: d
---

## Stage: s
mode: auto

\`\`\`yaml
corpus_reads:
  - path: bad.bin
    content_type: binary
    purpose: nope
  - path: good.md
    content_type: markdown
    purpose: keep
\`\`\`
`;
    const r = parseMethodology(src, 'm.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.some((w) => w.includes('content_type'))).toBe(true);
    const reads = r.methodology.stages[0]!.corpus_reads!;
    expect(reads.length).toBe(1);
    expect(reads[0]!.path).toBe('good.md');
  });

  test('bad inject_into is warned and field dropped (entry kept)', () => {
    const src = `---
id: m
version: 1.0.0
name: M
description: d
---

## Stage: s
mode: auto

\`\`\`yaml
corpus_reads:
  - path: x.md
    content_type: markdown
    purpose: x
    inject_into: brain_stem
\`\`\`
`;
    const r = parseMethodology(src, 'm.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.some((w) => w.includes('inject_into'))).toBe(true);
    const reads = r.methodology.stages[0]!.corpus_reads!;
    expect(reads.length).toBe(1);
    expect(reads[0]!.inject_into).toBeUndefined();
  });

  test('missing purpose is warned and entry skipped', () => {
    const src = `---
id: m
version: 1.0.0
name: M
description: d
---

## Stage: s
mode: auto

\`\`\`yaml
corpus_reads:
  - path: nopurpose.md
    content_type: markdown
\`\`\`
`;
    const r = parseMethodology(src, 'm.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.some((w) => w.includes('purpose'))).toBe(true);
    expect(r.methodology.stages[0]!.corpus_reads).toBeUndefined();
  });

  test('non-array corpus_reads is warned and dropped', () => {
    const src = `---
id: m
version: 1.0.0
name: M
description: d
---

## Stage: s
mode: auto

\`\`\`yaml
corpus_reads:
  path: oops.md
\`\`\`
`;
    const r = parseMethodology(src, 'm.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.some((w) => w.includes('corpus_reads') && w.includes('array'))).toBe(true);
    expect(r.methodology.stages[0]!.corpus_reads).toBeUndefined();
  });
});

describe('Stage.corpus_reads — round-trip', () => {
  test('serialize → parse preserves all fields', () => {
    const r1 = parseMethodology(SRC_WITH_CORPUS, 'm.md');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const dumped = serializeMethodology(r1.methodology);
    const r2 = parseMethodology(dumped, 'm.md');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const before = r1.methodology.stages[0]!.corpus_reads!;
    const after = r2.methodology.stages[0]!.corpus_reads!;
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) {
      expect(after[i]).toEqual(before[i]);
    }
  });

  test('round-trip drops empty corpus_reads (none emitted, none parsed)', () => {
    const m = baseMethodology(baseStage());
    const dumped = serializeMethodology(m);
    expect(dumped.includes('corpus_reads')).toBe(false);
    const r = parseMethodology(dumped, 'm.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.methodology.stages[0]!.corpus_reads).toBeUndefined();
  });
});

describe('Stage.corpus_reads — validate (rules 18-20)', () => {
  test('passes when all entries are well-formed', () => {
    const corpus_reads: CorpusRead[] = [
      { path: 'a.md', content_type: 'markdown', purpose: 'p1', inject_into: 'system_prompt' },
      { path: 'b.yaml', content_type: 'yaml', purpose: 'p2' },
    ];
    const m = baseMethodology(baseStage({ corpus_reads }));
    const v = validateMethodology(m);
    expect(v.ok).toBe(true);
  });

  test('rule 18: empty path fails', () => {
    const corpus_reads: CorpusRead[] = [
      { path: '', content_type: 'markdown', purpose: 'p' },
    ];
    const m = baseMethodology(baseStage({ corpus_reads }));
    const v = validateMethodology(m);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.some((e) => e.includes('corpus_reads') && e.includes('path'))).toBe(true);
  });

  test('rule 19: bad content_type fails', () => {
    const corpus_reads = [
      // bypass parser; construct directly with a bogus value
      { path: 'x', content_type: 'binary', purpose: 'p' } as unknown as CorpusRead,
    ];
    const m = baseMethodology(baseStage({ corpus_reads }));
    const v = validateMethodology(m);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.some((e) => e.includes('content_type'))).toBe(true);
  });

  test('rule 20: bad inject_into fails', () => {
    const corpus_reads = [
      { path: 'x', content_type: 'markdown', purpose: 'p', inject_into: 'nowhere' } as unknown as CorpusRead,
    ];
    const m = baseMethodology(baseStage({ corpus_reads }));
    const v = validateMethodology(m);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.some((e) => e.includes('inject_into'))).toBe(true);
  });

  test('inject_into omitted is valid (default applied at consumption)', () => {
    const corpus_reads: CorpusRead[] = [
      { path: 'x.md', content_type: 'markdown', purpose: 'p' },
    ];
    const m = baseMethodology(baseStage({ corpus_reads }));
    const v = validateMethodology(m);
    expect(v.ok).toBe(true);
  });
});
