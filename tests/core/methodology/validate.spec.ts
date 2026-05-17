// tests/core/methodology/validate.spec.ts
import { describe, test, expect } from 'vitest';
import { validateMethodology } from '../../../src/core/methodology/validate';
import type { Methodology } from '../../../src/core/domain/methodology';

const base: Methodology = {
  id: 'x', version: '1', name: 'X', description: 'x',
  stages: [
    { id: 'a', name: 'A', mode: 'auto', contract: { input: [], output: { path: 'a.md' } } },
    { id: 'b', name: 'B', mode: 'auto', contract: { input: [], output: { path: 'b.md' } } },
  ],
  edges: [
    { from: 'start', to: 'a', condition: { kind: 'always' } },
    { from: 'a', to: 'b', condition: { kind: 'always' } },
    { from: 'b', to: 'end', condition: { kind: 'always' } },
  ],
};

describe('validateMethodology', () => {
  test('valid linear methodology — no errors', () => {
    const r = validateMethodology(base);
    expect(r.ok).toBe(true);
  });

  test('unreachable stage', () => {
    const m: Methodology = {
      ...base,
      stages: [...base.stages, { id: 'c', name: 'C', mode: 'auto', contract: { input: [], output: { path: 'c.md' } } }],
    };
    const r = validateMethodology(m);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('unreachable') && e.includes('c'))).toBe(true);
  });

  test('edge referring to unknown stage', () => {
    const m: Methodology = {
      ...base,
      edges: [...base.edges, { from: 'a', to: 'phantom', condition: { kind: 'always' } }],
    };
    const r = validateMethodology(m);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('phantom'))).toBe(true);
  });

  test('cycle without maxCycles', () => {
    const m: Methodology = {
      ...base,
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' } },
        { from: 'a', to: 'b', condition: { kind: 'always' } },
        { from: 'b', to: 'a', condition: { kind: 'always' } },   // cycle, no maxCycles
        { from: 'b', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const r = validateMethodology(m);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.toLowerCase().includes('cycle'))).toBe(true);
  });

  test('cycle with gate-fail+maxCycles is allowed', () => {
    const m: Methodology = {
      ...base,
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' } },
        { from: 'a', to: 'b', condition: { kind: 'always' } },
        { from: 'b', to: 'a', condition: { kind: 'gate-fail', maxCycles: 2 } },
        { from: 'b', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const r = validateMethodology(m);
    expect(r.ok).toBe(true);
  });

  test('rule 4: edge increment refers to undeclared state_flag — error', () => {
    const m: Methodology = {
      ...base,
      state_schema: [{ id: 'fix_cycles', kind: 'counter', initial: 0 }],
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' } },
        { from: 'a', to: 'b', condition: { kind: 'always' } },
        {
          from: 'b', to: 'a', condition: { kind: 'rollback', maxCycles: 2 },
          increment_counters_on_traverse: ['phantom_counter'],
        },
        { from: 'b', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const r = validateMethodology(m);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /phantom_counter/.test(e) && /increment/.test(e))).toBe(true);
  });

  test('rule 4: edge preserve refers to undeclared state_flag — error', () => {
    const m: Methodology = {
      ...base,
      state_schema: [{ id: 'fix_cycles', kind: 'counter', initial: 0 }],
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' } },
        { from: 'a', to: 'b', condition: { kind: 'always' } },
        {
          from: 'b', to: 'a', condition: { kind: 'rollback', maxCycles: 2 },
          preserve_counters_on_traverse: ['unknown_flag'],
        },
        { from: 'b', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const r = validateMethodology(m);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /unknown_flag/.test(e) && /preserve/.test(e))).toBe(true);
  });

  test('rule 4: declared state_flag counter reference passes', () => {
    const m: Methodology = {
      ...base,
      state_schema: [{ id: 'fix_cycles', kind: 'counter', initial: 0 }],
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' } },
        { from: 'a', to: 'b', condition: { kind: 'always' } },
        {
          from: 'b', to: 'a', condition: { kind: 'rollback', maxCycles: 2 },
          increment_counters_on_traverse: ['fix_cycles'],
        },
        { from: 'b', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const r = validateMethodology(m);
    expect(r.ok).toBe(true);
  });

  test('rule 5: duplicate gate item id — error', () => {
    const m: Methodology = {
      ...base,
      stages: [
        {
          id: 'a', name: 'A', mode: 'gate',
          contract: { input: [], output: { path: 'a.md' } },
          gate: {
            kind: 'standard',
            items: [
              { id: 'i1', label: 'one', kind: 'artifact_written' },
              { id: 'i1', label: 'dup', kind: 'user_confirmed' },
            ],
          },
        },
        ...base.stages.slice(1),
      ],
    };
    const r = validateMethodology(m);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /duplicate item id "i1"/.test(e))).toBe(true);
  });

  test('rule 6: confidence_threshold out of range — error', () => {
    const m: Methodology = {
      ...base,
      stages: [
        { ...base.stages[0]!, confidence_threshold: 1.5 },
        ...base.stages.slice(1),
      ],
    };
    const r = validateMethodology(m);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /confidence_threshold must be in 0..1/.test(e))).toBe(true);
  });

  test('rule 7: duplicate phase id — error', () => {
    const m: Methodology = {
      ...base,
      stages: [
        {
          ...base.stages[0]!,
          phases: [
            { id: 's1', name: 'one' },
            { id: 's1', name: 'dup' },
          ],
        },
        ...base.stages.slice(1),
      ],
    };
    const r = validateMethodology(m);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /duplicate phase id "s1"/.test(e))).toBe(true);
  });

  test('rule 8: question next_rules points to unknown question — error', () => {
    const m: Methodology = {
      ...base,
      stages: [
        {
          ...base.stages[0]!,
          questions: [
            {
              id: 'q1', text: 'Goal?', kind: 'text',
              next_rules: [{ when_answer: '*', next_question_id: 'phantom' }],
            },
          ],
        },
        ...base.stages.slice(1),
      ],
    };
    const r = validateMethodology(m);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /points to unknown question "phantom"/.test(e))).toBe(true);
  });

  test('rule 8: question next_rules pointing to "end" sentinel passes', () => {
    const m: Methodology = {
      ...base,
      stages: [
        {
          ...base.stages[0]!,
          questions: [
            {
              id: 'q1', text: 'Goal?', kind: 'text',
              next_rules: [{ when_answer: '*', next_question_id: 'end' }],
            },
          ],
        },
        ...base.stages.slice(1),
      ],
    };
    const r = validateMethodology(m);
    expect(r.ok).toBe(true);
  });

  test('comprehensive v2 fixture validates clean', () => {
    const m: Methodology = {
      ...base,
      state_schema: [
        { id: 'fix_cycles', kind: 'counter', initial: 0 },
        { id: 'mockup_approved', kind: 'flag', initial: false },
      ],
      stages: [
        {
          id: 'a', name: 'A', mode: 'gate',
          contract: { input: [], output: { path: 'a.md' } },
          confidence_threshold: 0.7,
          gate: {
            kind: 'standard',
            items: [
              { id: 'i1', label: 'one', kind: 'artifact_written' },
              { id: 'i2', label: 'two', kind: 'user_confirmed' },
            ],
          },
          phases: [
            { id: 's1', name: 'sub one' },
            { id: 's2', name: 'sub two' },
          ],
          questions: [
            {
              id: 'q1', text: 'goal?', kind: 'text',
              next_rules: [{ when_answer: '*', next_question_id: 'q2' }],
            },
            {
              id: 'q2', text: 'next?', kind: 'yes_no',
              next_rules: [{ when_answer: '*', next_question_id: 'end' }],
            },
          ],
        },
        ...base.stages.slice(1),
      ],
      edges: [
        { from: 'start', to: 'a', condition: { kind: 'always' } },
        { from: 'a', to: 'b', condition: { kind: 'always' } },
        {
          from: 'b', to: 'a', condition: { kind: 'rollback', maxCycles: 2 },
          increment_counters_on_traverse: ['fix_cycles'],
          preserve_counters_on_traverse: ['mockup_approved'],
        },
        { from: 'b', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const r = validateMethodology(m);
    expect(r.ok).toBe(true);
  });
});
