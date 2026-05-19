import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';
import type { Methodology } from '../../../src/core/domain/methodology';

const V2_ROOT = `---
id: full_v2
version: 2.0.0
name: Full v2 demo
description: Exercise every v2 root field.
applicability:
  - match: "task_type=T4-S"
    weight: 0.8
  - match: "complexity<=C2"
anti_patterns:
  - "critical_zone task"
  - "unknown pattern after 3 searches"
state_schema:
  - id: fix_cycles
    kind: counter
    initial: 0
    description: BR-2 fix-cycle guard
  - id: mockup_approved
    kind: flag
    initial: false
    preserve_on_rollback: true
---

## Stage: s1
mode: auto

prompt body
`;

describe('parse v2 root frontmatter', () => {
  test('lifts all v2 fields into typed shape', () => {
    const r = parseMethodology(V2_ROOT, '/p.md');
    if (!r.ok) throw new Error(`parse fail: ${JSON.stringify(r.error)}`);
    const m = r.methodology;

    expect(m.applicability).toEqual([
      { match: 'task_type=T4-S', weight: 0.8 },
      { match: 'complexity<=C2' },
    ]);
    expect(m.anti_patterns).toEqual([
      'critical_zone task',
      'unknown pattern after 3 searches',
    ]);
    expect(m.state_schema).toHaveLength(2);
    expect(m.state_schema![0]).toMatchObject({ id: 'fix_cycles', kind: 'counter', initial: 0 });
    expect(m.state_schema![1]).toMatchObject({ id: 'mockup_approved', preserve_on_rollback: true });
  });

  test('v1 file still parses with v2 fields undefined', () => {
    const v1 = `---
id: legacy
version: 1.0.0
name: Legacy
description: ""
---

## Stage: s1
mode: auto
`;
    const r = parseMethodology(v1, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    expect(r.methodology.applicability).toBeUndefined();
    expect(r.methodology.anti_patterns).toBeUndefined();
    expect(r.methodology.state_schema).toBeUndefined();
  });

  test('legacy frontmatter with deprecated fields parses cleanly and discards them', () => {
    const legacy = `---
id: legacy_deprecated
version: 2.0.0
name: Legacy with deprecated fields
description: ""
language: ru
gate_strictness: skip_obvious
context_budget:
  warn_at: 0.6
  hard_stop_at: 0.8
skills_hint:
  - debugging
extends: parent_id
---

## Stage: s1
mode: auto
`;
    const r = parseMethodology(legacy, '/p.md');
    if (!r.ok) throw new Error(`parse fail: ${JSON.stringify(r.error)}`);
    const m = r.methodology as unknown as Record<string, unknown>;
    // None of the deprecated fields appear on the parsed Methodology.
    expect(m.language).toBeUndefined();
    expect(m.gate_strictness).toBeUndefined();
    expect(m.context_budget).toBeUndefined();
    expect(m.skills_hint).toBeUndefined();
    expect(m.extends).toBeUndefined();
    // And they don't leak into `meta` either — KNOWN_FRONT_KEYS still lists them.
    const meta = r.methodology.meta;
    if (meta) {
      expect(meta.language).toBeUndefined();
      expect(meta.gate_strictness).toBeUndefined();
      expect(meta.context_budget).toBeUndefined();
      expect(meta.skills_hint).toBeUndefined();
      expect(meta.extends).toBeUndefined();
    }
  });

  test('stage gate parses items with auto_pass_when', () => {
    const src = V2_ROOT + `
\`\`\`yaml
gate:
  kind: standard
  items:
    - id: artifact_written
      label: "Plan artifact written"
      kind: artifact_written
      auto_pass_when:
        expr: "artifact_exists('plan.md')"
    - id: user_confirm
      label: "User confirmed"
      kind: user_confirmed
      hard_stop: true
\`\`\`
`;
    const r = parseMethodology(src, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    const stage = r.methodology.stages[0]!;
    expect(stage.gate).toBeDefined();
    expect(stage.gate!.kind).toBe('standard');
    expect(stage.gate!.items).toHaveLength(2);
    expect(stage.gate!.items[0]!.auto_pass_when?.expr).toContain('artifact_exists');
  });

  test('stage v2 directives round-trip (prompts, role_split, tools, isolation, stuck_policy, tracker, skills_hint, confidence_threshold)', () => {
    const ir: Methodology = {
      id: 'demo',
      version: '2.0.0',
      name: 'Demo',
      description: 'stage v2 round-trip',
      stages: [{
        id: 's1',
        name: 'S1',
        mode: 'interactive',
        contract: { input: [], output: { path: 's1.md' } },
        system_prompt_template: 'You are an analyst.',
        user_view_template: 'Сейчас анализируем.',
        role_split: { ai_does: 'plans', human_does: 'reviews' },
        tools: { required: ['Read', 'Grep'], forbidden: ['Bash'] },
        skills_hint: ['debugging'],
        execution_isolation: 'subagent',
        confidence_threshold: 0.7,
        stuck_policy: {
          max_attempts: 3,
          escalation_steps: ['change_tactics', 'user_override'],
          error_compaction: true,
        },
        tracker_template: '{summary}',
      }],
      edges: [
        { from: 'start', to: 's1', condition: { kind: 'always' } },
        { from: 's1', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const out = serializeMethodology(ir);
    const parsed = parseMethodology(out, '/p.md');
    if (!parsed.ok) throw new Error(`parse fail: ${JSON.stringify(parsed.error)}`);
    const s = parsed.methodology.stages[0]!;
    expect(s.system_prompt_template).toBe('You are an analyst.');
    expect(s.user_view_template).toBe('Сейчас анализируем.');
    expect(s.role_split).toEqual({ ai_does: 'plans', human_does: 'reviews' });
    expect(s.tools).toEqual({ required: ['Read', 'Grep'], forbidden: ['Bash'] });
    expect(s.skills_hint).toEqual(['debugging']);
    expect(s.execution_isolation).toBe('subagent');
    expect(s.confidence_threshold).toBe(0.7);
    expect(s.stuck_policy).toEqual({
      max_attempts: 3,
      escalation_steps: ['change_tactics', 'user_override'],
      error_compaction: true,
    });
    expect(s.tracker_template).toBe('{summary}');
  });

  test('confidence_threshold out of range warns and drops', () => {
    const src = `---
id: x
version: 1.0.0
name: X
description: ""
---

## Stage: s1
mode: auto

\`\`\`yaml
confidence_threshold: 1.5
\`\`\`
`;
    const r = parseMethodology(src, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    expect(r.methodology.stages[0]!.confidence_threshold).toBeUndefined();
    expect(r.warnings.some((w) => /confidence_threshold/.test(w))).toBe(true);
  });

  test('reviewers shorthand: string array round-trips as plain bindings', () => {
    const ir: Methodology = {
      id: 'r1', version: '1.0.0', name: 'R1', description: '',
      stages: [{
        id: 's1', name: 'S1', mode: 'auto',
        contract: { input: [], output: { path: 's1.md' } },
        reviewers: [
          { reviewer_id: 'req_traceability', recommended: true },
          { reviewer_id: 'req_quality', recommended: true },
        ],
      }],
      edges: [
        { from: 'start', to: 's1', condition: { kind: 'always' } },
        { from: 's1', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const out = serializeMethodology(ir);
    // Shorthand: should serialize as ["req_traceability", "req_quality"]
    expect(out).toMatch(/reviewers:\s*\n\s*-\s+req_traceability\s*\n\s*-\s+req_quality/);
    const parsed = parseMethodology(out, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    expect(parsed.methodology.stages[0]!.reviewers).toEqual([
      { reviewer_id: 'req_traceability', recommended: true },
      { reviewer_id: 'req_quality', recommended: true },
    ]);
  });

  test('reviewers full form: persists object array when recommended is not true', () => {
    const ir: Methodology = {
      id: 'r2', version: '1.0.0', name: 'R2', description: '',
      stages: [{
        id: 's1', name: 'S1', mode: 'auto',
        contract: { input: [], output: { path: 's1.md' } },
        reviewers: [
          { reviewer_id: 'req_traceability', recommended: true },
          { reviewer_id: 'req_smoke', recommended: false },
        ],
      }],
      edges: [
        { from: 'start', to: 's1', condition: { kind: 'always' } },
        { from: 's1', to: 'end', condition: { kind: 'always' } },
      ],
    };
    const out = serializeMethodology(ir);
    // Full form: should NOT be a plain string list
    expect(out).not.toMatch(/reviewers:\s*\n\s*-\s+req_traceability\s*\n\s*-\s+req_smoke/);
    expect(out).toMatch(/reviewer_id:\s*req_traceability/);
    const parsed = parseMethodology(out, '/p.md');
    if (!parsed.ok) throw new Error('parse fail');
    expect(parsed.methodology.stages[0]!.reviewers).toEqual([
      { reviewer_id: 'req_traceability', recommended: true },
      { reviewer_id: 'req_smoke', recommended: false },
    ]);
  });

  test('reviewers legacy: blocking/auto_run silently dropped on parse', () => {
    const src = `---
id: r3
version: 1.0.0
name: R3
description: ""
---

## Stage: s1 — S1
mode: auto

\`\`\`yaml
reviewers:
  - reviewer_id: rv1
    recommended: true
    blocking: true
    auto_run: true
\`\`\`
`;
    const r = parseMethodology(src, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    expect(r.methodology.stages[0]!.reviewers).toEqual([
      { reviewer_id: 'rv1', recommended: true },
    ]);
    // Plan says "silently drops" — no warning about blocking/auto_run required.
    expect(r.warnings.some((w) => /blocking|auto_run/.test(w))).toBe(false);
  });

  test('stage without gate keeps v1 byte shape on serialize', () => {
    const v1 = `---
id: legacy
version: 1.0.0
name: Legacy
description: ""
---

## Stage: s1
mode: auto
`;
    const r = parseMethodology(v1, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    const out = serializeMethodology(r.methodology);
    expect(out).not.toMatch(/```yaml/);
    expect(out).toMatch(/^## Stage: s1\nmode: auto/m);
  });
});

describe('parse v2 external gate (Plan 04)', () => {
  test('external gate parses with webhook trigger', () => {
    const src = V2_ROOT + `
\`\`\`yaml
gate:
  kind: external
  items: []
  trigger:
    source: webhook
    pathPrefix: /triggers
  timeoutMs: 60000
  onTimeout: continue
\`\`\`
`;
    const r = parseMethodology(src, '/p.md');
    if (!r.ok) throw new Error(`parse fail: ${JSON.stringify(r.error)}`);
    const stage = r.methodology.stages[0]!;
    expect(stage.gate).toBeDefined();
    expect(stage.gate!.kind).toBe('external');
    expect(stage.gate!.trigger).toEqual({ source: 'webhook', pathPrefix: '/triggers' });
    expect(stage.gate!.timeoutMs).toBe(60000);
    expect(stage.gate!.onTimeout).toBe('continue');
  });

  test('external gate parses with cron trigger', () => {
    const src = V2_ROOT + `
\`\`\`yaml
gate:
  kind: external
  items: []
  trigger:
    source: cron
    expression: "*/5 * * * *"
\`\`\`
`;
    const r = parseMethodology(src, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    const gate = r.methodology.stages[0]!.gate!;
    expect(gate.kind).toBe('external');
    expect(gate.trigger).toEqual({ source: 'cron', expression: '*/5 * * * *' });
  });

  test('external gate parses with file trigger + event', () => {
    const src = V2_ROOT + `
\`\`\`yaml
gate:
  kind: external
  items: []
  trigger:
    source: file
    pattern: "outputs/**/*.json"
    event: create
\`\`\`
`;
    const r = parseMethodology(src, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    const gate = r.methodology.stages[0]!.gate!;
    expect(gate.trigger).toEqual({ source: 'file', pattern: 'outputs/**/*.json', event: 'create' });
  });

  test('external gate without trigger emits a warning', () => {
    const src = V2_ROOT + `
\`\`\`yaml
gate:
  kind: external
  items: []
\`\`\`
`;
    const r = parseMethodology(src, '/p.md');
    if (!r.ok) throw new Error('parse fail');
    expect(r.warnings.some((w) => w.includes("kind='external' requires a 'trigger' object"))).toBe(true);
  });
});

