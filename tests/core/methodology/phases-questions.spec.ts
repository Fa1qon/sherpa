import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';
import type { Methodology } from '../../../src/core/domain/methodology';

describe('phases + typed questions', () => {
  test('parses phases with conditional_activation', () => {
    const md = `---
id: t
version: 1.0.0
name: T
description: t
---

## Stage: w0
mode: interactive

\`\`\`yaml
phases:
  - id: w0_1
    name: Brainstorm
  - id: w0_2
    name: Acceptance criteria
    conditional_activation:
      expr: "complexity >= C2"
    mode: gate
\`\`\`
`;
    const r = parseMethodology(md, '/p.md');
    if (!r.ok) throw new Error(`parse fail: ${JSON.stringify(r.error)}`);
    const w0 = r.methodology.stages[0]!;
    expect(w0.phases).toHaveLength(2);
    expect(w0.phases![0]!.id).toBe('w0_1');
    expect(w0.phases![1]!.conditional_activation?.expr).toBe('complexity >= C2');
    expect(w0.phases![1]!.mode).toBe('gate');
  });

  test('parses typed questions with next_rules and options', () => {
    const md = `---
id: t
version: 1.0.0
name: T
description: t
---

## Stage: w0
mode: interactive

\`\`\`yaml
questions:
  - id: q1
    text: "Primary goal?"
    kind: text
    required: true
    next_rules:
      - when_answer: "*"
        next_question_id: q2
  - id: q2
    text: "How complex?"
    kind: choice
    options:
      - id: low
        label: Low
      - id: high
        label: High
    next_rules:
      - when_answer: high
        next_question_id: q3
      - when_answer: low
        next_question_id: end
  - id: q3
    text: "Need plan?"
    kind: yes_no
    next_rules:
      - when_answer: "*"
        next_question_id: end
\`\`\`
`;
    const r = parseMethodology(md, '/p.md');
    if (!r.ok) throw new Error(`parse fail: ${JSON.stringify(r.error)}`);
    const w0 = r.methodology.stages[0]!;
    expect(w0.questions).toHaveLength(3);
    expect(w0.questions![1]!.kind).toBe('choice');
    expect(w0.questions![1]!.options).toEqual([
      { id: 'low', label: 'Low' },
      { id: 'high', label: 'High' },
    ]);
    expect(w0.questions![1]!.next_rules).toEqual([
      { when_answer: 'high', next_question_id: 'q3' },
      { when_answer: 'low', next_question_id: 'end' },
    ]);
  });

  test('round-trip phases + questions preserves structure', () => {
    const ir: Methodology = {
      id: 't',
      version: '1.0.0',
      name: 'T',
      description: '',
      stages: [{
        id: 'w0',
        name: 'W0',
        mode: 'interactive',
        contract: { input: [], output: { path: 'w0.md' } },
        questions: [
          {
            id: 'q1', text: 'Goal?', kind: 'text', required: true,
            next_rules: [{ when_answer: '*', next_question_id: 'end' }],
          },
        ],
        phases: [
          { id: 'sa', name: 'Sub A' },
          {
            id: 'sb', name: 'Sub B',
            conditional_activation: { expr: 'complexity >= C2' },
            mode: 'gate',
            questions: [
              { id: 'sq1', text: 'Inside?', kind: 'yes_no' },
            ],
          },
        ],
      }],
      edges: [
        { from: 'start', to: 'w0', condition: { kind: 'always' } },
        { from: 'w0', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const out = serializeMethodology(ir);
    const parsed = parseMethodology(out, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    expect(parsed.methodology.stages[0]).toEqual(ir.stages[0]);
  });

  test('question with kind=choice but no options is skipped with warning', () => {
    const md = `---
id: t
version: 1.0.0
name: T
description: t
---

## Stage: w0
mode: auto

\`\`\`yaml
questions:
  - id: q1
    text: "Bad?"
    kind: choice
\`\`\`
`;
    const r = parseMethodology(md, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    expect(r.methodology.stages[0]!.questions).toBeUndefined();
    expect(r.warnings.some((w) => /requires options/.test(w))).toBe(true);
  });

  test("legacy 'substages:' key parses with deprecation warning into phases", () => {
    const md = `---
id: t
version: 1.0.0
name: T
description: t
---

## Stage: w0
mode: interactive

\`\`\`yaml
substages:
  - id: w0_1
    name: Brainstorm
  - id: w0_2
    name: Acceptance criteria
\`\`\`
`;
    const r = parseMethodology(md, '/p.md');
    if (!r.ok) throw new Error(`parse fail: ${JSON.stringify(r.error)}`);
    const w0 = r.methodology.stages[0]!;
    expect(w0.phases).toHaveLength(2);
    expect(w0.phases![0]!.id).toBe('w0_1');
    expect(w0.phases![1]!.id).toBe('w0_2');
    expect(r.warnings.some((w) => /substages/i.test(w) && /deprecated/i.test(w))).toBe(true);
  });
});
