// tests/core/methodology/round-trip-v2.spec.ts
import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';
import type { Methodology } from '../../../src/core/domain/methodology';

const FULL_V2: Methodology = {
  id: 'rdpi_v2',
  version: '2.0.0',
  name: 'RDPI v2 demo',
  description: 'Comprehensive v2 fixture',
  applicability: [{ match: 'task_type=T4-M', weight: 0.9 }],
  anti_patterns: ['critical_zone task'],
  state_schema: [
    { id: 'fix_cycles', kind: 'counter', initial: 0 },
    { id: 'mockup_approved', kind: 'flag', initial: false, preserve_on_rollback: true },
  ],
  stages: [
    {
      id: 'requirements',
      name: 'Requirements',
      mode: 'interactive',
      contract: { input: [], output: { path: 'requirements.md' } },
      system_prompt_template: 'You are a requirements analyst...',
      user_view_template: 'Сейчас собираем требования к задаче.',
      role_split: { ai_does: 'asks clarifying questions', human_does: 'answers, confirms scope' },
      tools: { required: ['Read', 'Grep'], forbidden: ['Bash'] },
      skills_hint: ['brainstorming'],
      execution_isolation: 'inline',
      confidence_threshold: 0.7,
      stuck_policy: {
        max_attempts: 3,
        escalation_steps: ['change_tactics', 'user_override'],
        error_compaction: true,
      },
      tracker_template: 'Requirements gathered: {summary}',
      gate: {
        kind: 'standard',
        items: [
          {
            id: 'artifact',
            label: 'requirements.md written',
            kind: 'artifact_written',
            auto_pass_when: { expr: "artifact_exists('requirements.md')" },
          },
          { id: 'user_confirm', label: 'User confirmed scope', kind: 'user_confirmed', hard_stop: true },
        ],
      },
      questions: [
        {
          id: 'q1',
          text: 'What is the primary goal?',
          kind: 'text',
          required: true,
          next_rules: [{ when_answer: '*', next_question_id: 'q2' }],
        },
        {
          id: 'q2',
          text: 'Acceptance criteria?',
          kind: 'text',
          next_rules: [{ when_answer: '*', next_question_id: 'end' }],
        },
      ],
      reviewers: [
        { reviewer_id: 'requirements_quality', recommended: true },
        { reviewer_id: 'requirements_traceability', recommended: true },
      ],
    },
    {
      id: 'research',
      name: 'Research',
      mode: 'auto',
      contract: { input: [], output: { path: 'research.md' } },
      phases: [
        { id: 'r1', name: 'Reuse search' },
        {
          id: 'r2',
          name: 'API mapping',
          conditional_activation: { expr: 'complexity >= C2' },
          mode: 'gate',
          questions: [{ id: 'sq1', text: 'Done?', kind: 'yes_no' }],
        },
      ],
    },
  ],
  edges: [
    { from: 'start', to: 'requirements', condition: { kind: 'always' } },
    { from: 'requirements', to: 'research', condition: { kind: 'gate-pass' } },
    {
      from: 'research',
      to: 'requirements',
      condition: { kind: 'rollback', maxCycles: 2 },
      increment_counters_on_traverse: ['fix_cycles'],
      preserve_counters_on_traverse: ['mockup_approved'],
    },
    { from: 'research', to: 'end', condition: { kind: 'always' } },
    { from: 'requirements', to: 'requirements', condition: { kind: 'recut' } },
  ],
};

describe('full v2 round-trip', () => {
  test('parse → serialize → parse is idempotent (textual + structural)', () => {
    const out1 = serializeMethodology(FULL_V2);
    const parsed1 = parseMethodology(out1, '/p.md');
    if (!parsed1.ok) throw new Error(`parse 1 fail: ${JSON.stringify(parsed1.error)}`);

    const out2 = serializeMethodology(parsed1.methodology);
    const parsed2 = parseMethodology(out2, '/p.md');
    if (!parsed2.ok) throw new Error(`parse 2 fail: ${JSON.stringify(parsed2.error)}`);

    // Second serialize must match first byte-for-byte (idempotent).
    expect(out2).toBe(out1);

    // Parsed IRs must be structurally identical.
    expect(parsed2.methodology).toEqual(parsed1.methodology);
  });

  test('round-trip preserves remaining v2 root fields', () => {
    const out = serializeMethodology(FULL_V2);
    const r = parseMethodology(out, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    const m = r.methodology;
    expect(m.applicability).toEqual([{ match: 'task_type=T4-M', weight: 0.9 }]);
    expect(m.anti_patterns).toEqual(['critical_zone task']);
    expect(m.state_schema).toEqual([
      { id: 'fix_cycles', kind: 'counter', initial: 0 },
      { id: 'mockup_approved', kind: 'flag', initial: false, preserve_on_rollback: true },
    ]);
  });

  test('round-trip preserves stage v2 directives', () => {
    const out = serializeMethodology(FULL_V2);
    const r = parseMethodology(out, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    const req = r.methodology.stages.find((s) => s.id === 'requirements')!;
    expect(req.system_prompt_template).toBe('You are a requirements analyst...');
    expect(req.role_split).toEqual({
      ai_does: 'asks clarifying questions',
      human_does: 'answers, confirms scope',
    });
    expect(req.tools).toEqual({ required: ['Read', 'Grep'], forbidden: ['Bash'] });
    expect(req.confidence_threshold).toBe(0.7);
    expect(req.stuck_policy).toEqual({
      max_attempts: 3,
      escalation_steps: ['change_tactics', 'user_override'],
      error_compaction: true,
    });
    expect(req.gate?.items).toHaveLength(2);
    expect(req.gate?.items[0]?.auto_pass_when?.expr).toContain('artifact_exists');
    expect(req.questions).toHaveLength(2);
    expect(req.reviewers).toEqual([
      { reviewer_id: 'requirements_quality', recommended: true },
      { reviewer_id: 'requirements_traceability', recommended: true },
    ]);
  });

  test('round-trip preserves phases with conditional_activation', () => {
    const out = serializeMethodology(FULL_V2);
    const r = parseMethodology(out, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    const res = r.methodology.stages.find((s) => s.id === 'research')!;
    expect(res.phases).toHaveLength(2);
    expect(res.phases![0]).toEqual({ id: 'r1', name: 'Reuse search' });
    expect(res.phases![1]?.conditional_activation?.expr).toBe('complexity >= C2');
    expect(res.phases![1]?.mode).toBe('gate');
    expect(res.phases![1]?.questions).toEqual([{ id: 'sq1', text: 'Done?', kind: 'yes_no' }]);
  });

  test('round-trip preserves edge v2 (rollback + recut + counter mutations)', () => {
    const out = serializeMethodology(FULL_V2);
    const r = parseMethodology(out, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    const rollback = r.methodology.edges.find((e) => e.from === 'research' && e.to === 'requirements');
    expect(rollback?.condition).toEqual({ kind: 'rollback', maxCycles: 2 });
    expect(rollback?.increment_counters_on_traverse).toEqual(['fix_cycles']);
    expect(rollback?.preserve_counters_on_traverse).toEqual(['mockup_approved']);
    const recut = r.methodology.edges.find((e) => e.condition.kind === 'recut');
    expect(recut?.from).toBe('requirements');
    expect(recut?.to).toBe('requirements');
  });
});
