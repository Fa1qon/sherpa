import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';

const FM = `---
id: m
version: 1.0.0
name: M
description: ""
---
`;

describe('Stage.ai_directives — extraction from <!-- AI: ... --> blocks', () => {
  test('extracts inline single-line AI block; prompt stays narrative', () => {
    const md = `${FM}
## Stage: s1
mode: auto

<!-- AI: Max 4 questions; "don't know" → default -->

Ask the user about goals.
`;
    const r = parseMethodology(md, '/p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const stage = r.methodology.stages[0]!;
    expect(stage.ai_directives).toEqual([`Max 4 questions; "don't know" → default`]);
    expect(stage.prompt).toBe('Ask the user about goals.');
    expect(stage.prompt).not.toContain('Max 4 questions');
  });

  test('multi-line AI block preserves internal newlines', () => {
    const md = `${FM}
## Stage: s1
mode: auto

<!-- AI:
Be terse.
Output JSON only.
No markdown.
-->

Read the codebase and report.
`;
    const r = parseMethodology(md, '/p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const stage = r.methodology.stages[0]!;
    expect(stage.ai_directives).toHaveLength(1);
    expect(stage.ai_directives![0]).toBe('Be terse.\nOutput JSON only.\nNo markdown.');
    expect(stage.prompt).toBe('Read the codebase and report.');
  });

  test('multiple AI blocks accumulate in order', () => {
    const md = `${FM}
## Stage: s1
mode: auto

<!-- AI: first directive -->

<!-- AI:
second directive
line two
-->

<!-- AI: third directive -->

Body text here.
`;
    const r = parseMethodology(md, '/p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const stage = r.methodology.stages[0]!;
    expect(stage.ai_directives).toEqual([
      'first directive',
      'second directive\nline two',
      'third directive',
    ]);
    expect(stage.prompt).toBe('Body text here.');
  });

  test('v1 fixture with NO AI blocks has no ai_directives field', () => {
    const md = `${FM}
## Stage: s1
mode: auto

Plain narrative prompt.
`;
    const r = parseMethodology(md, '/p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const stage = r.methodology.stages[0]!;
    expect(stage.ai_directives).toBeUndefined();
    expect(stage.prompt).toBe('Plain narrative prompt.');
  });

  test('stage with only AI block and no narrative has no prompt field', () => {
    const md = `${FM}
## Stage: s1
mode: auto

<!-- AI: directive-only stage -->
`;
    const r = parseMethodology(md, '/p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const stage = r.methodology.stages[0]!;
    expect(stage.ai_directives).toEqual(['directive-only stage']);
    expect(stage.prompt).toBeUndefined();
  });

  test('serializer emits <!-- AI: ... --> before prompt body (single-line)', () => {
    const md = `${FM}
## Stage: s1
mode: auto

<!-- AI: be terse -->

Do the work.
`;
    const parsed = parseMethodology(md, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    const out = serializeMethodology(parsed.methodology);
    const aiIdx = out.indexOf('<!-- AI: be terse -->');
    const promptIdx = out.indexOf('Do the work.');
    expect(aiIdx).toBeGreaterThan(-1);
    expect(promptIdx).toBeGreaterThan(-1);
    expect(aiIdx).toBeLessThan(promptIdx);
  });

  test('serializer emits multi-line directive in canonical <!-- AI:\\n...\\n--> shape', () => {
    const md = `${FM}
## Stage: s1
mode: auto

<!-- AI:
line a
line b
-->

Body.
`;
    const parsed = parseMethodology(md, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    const out = serializeMethodology(parsed.methodology);
    expect(out).toContain('<!-- AI:\nline a\nline b\n-->');
  });

  test('round-trip preserves ai_directives + prompt separately', () => {
    const md = `${FM}
## Stage: s1
mode: auto

<!-- AI: first -->

<!-- AI:
multi
line
-->

Narrative body.
`;
    const p1 = parseMethodology(md, '/p.md');
    if (!p1.ok) throw new Error('parse 1 fail');
    const out1 = serializeMethodology(p1.methodology);
    const p2 = parseMethodology(out1, '/p.md');
    if (!p2.ok) throw new Error('parse 2 fail');
    const out2 = serializeMethodology(p2.methodology);

    // Idempotent (serialize → parse → serialize converges)
    expect(out2).toBe(out1);
    // IR stable
    expect(p2.methodology).toEqual(p1.methodology);
    // Both directives + prompt round-tripped
    const s = p2.methodology.stages[0]!;
    expect(s.ai_directives).toEqual(['first', 'multi\nline']);
    expect(s.prompt).toBe('Narrative body.');
  });

  test('AI: text inside the directives YAML fence is NOT extracted as ai_directives', () => {
    // Directives YAML fence is consumed before the AI-block detector runs,
    // so `<!-- AI: ... -->` text appearing INSIDE the fence is part of the
    // YAML payload (e.g. a string field) and must not surface as a directive.
    const md = `${FM}
## Stage: s1
mode: auto

\`\`\`yaml
system_prompt_template: "<!-- AI: this is YAML content, not a directive -->"
\`\`\`

Real body.
`;
    const r = parseMethodology(md, '/p.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const stage = r.methodology.stages[0]!;
    expect(stage.ai_directives).toBeUndefined();
    expect(stage.system_prompt_template).toBe('<!-- AI: this is YAML content, not a directive -->');
    expect(stage.prompt).toBe('Real body.');
  });
});
