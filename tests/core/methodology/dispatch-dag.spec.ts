// tests/core/methodology/dispatch-dag.spec.ts
import { describe, test, expect } from 'vitest';
import { parseMethodology } from '../../../src/core/methodology/parse';
import { serializeMethodology } from '../../../src/core/methodology/serialize';
import { validateMethodology } from '../../../src/core/methodology/validate';
import type { Methodology, DispatchDag, Phase } from '../../../src/core/domain/methodology';

const STAGE_DAG_SRC = `---
id: research
version: 1.0.0
name: Research
description: Deep research methodology.
---

## Stage: gather
mode: auto

\`\`\`yaml
dispatch_dag:
  nodes:
    - id: researcher_1
      subagent_type_id: researcher
      prompt_template: |
        <user_query>{sub_query_1}</user_query>
        Search EN, return findings to {output_file}.
      output_file: research_agent_1_findings.md
      budget: { search_units: 10, wall_clock_sec: 600 }
    - id: researcher_2
      subagent_type_id: researcher
      prompt_template: another
      output_file: research_agent_2_findings.md
      budget: { search_units: 10 }
    - id: researcher_synth
      subagent_type_id: researcher
      prompt_template: |
        Read findings from {prerequisites_outputs}. Synthesize crossing.
      depends_on: [researcher_1, researcher_2]
      output_file: research_agent_synth_findings.md
      budget: { search_units: 5 }
  aggregate_to: research_phase_aggregated.md
\`\`\`

gather body
`;

const PHASE_DAG_SRC = `---
id: research_phased
version: 1.0.0
name: Research Phased
description: Research with phase-level DAG.
---

## Stage: collect
mode: auto

\`\`\`yaml
phases:
  - id: p1
    name: Phase One
    dispatch_dag:
      nodes:
        - id: r1
          subagent_type_id: researcher
          prompt_template: t1
          output_file: r1.md
        - id: r2
          subagent_type_id: researcher
          prompt_template: t2
          output_file: r2.md
          depends_on: [r1]
\`\`\`

body
`;

const V1_NO_DAG_SRC = `---
id: simple
version: 1.0.0
name: Simple
description: A simple methodology without dispatch_dag.
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

describe('Phase/Stage.dispatch_dag — parse', () => {
  test('parses stage-level dispatch_dag with budgets and aggregate_to', () => {
    const res = parseMethodology(STAGE_DAG_SRC, 'm.md');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const stage = res.methodology.stages[0]!;
    expect(stage.dispatch_dag).toBeDefined();
    const dag = stage.dispatch_dag!;
    expect(dag.nodes).toHaveLength(3);
    expect(dag.aggregate_to).toBe('research_phase_aggregated.md');

    const synth = dag.nodes.find((n) => n.id === 'researcher_synth')!;
    expect(synth.depends_on).toEqual(['researcher_1', 'researcher_2']);
    expect(synth.budget).toEqual({ search_units: 5 });

    const r1 = dag.nodes.find((n) => n.id === 'researcher_1')!;
    expect(r1.budget).toEqual({ search_units: 10, wall_clock_sec: 600 });
    expect(r1.prompt_template).toContain('Search EN');
  });

  test('parses phase-level dispatch_dag', () => {
    const res = parseMethodology(PHASE_DAG_SRC, 'm.md');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const stage = res.methodology.stages[0]!;
    expect(stage.phases).toBeDefined();
    const phase = stage.phases![0]!;
    expect(phase.dispatch_dag).toBeDefined();
    expect(phase.dispatch_dag!.nodes).toHaveLength(2);
    expect(phase.dispatch_dag!.nodes[1]!.depends_on).toEqual(['r1']);
  });

  test('round-trips stage + phase dispatch_dag preserving structure', () => {
    const phase: Phase = {
      id: 'p1',
      name: 'Phase 1',
      dispatch_dag: {
        nodes: [
          {
            id: 'a',
            subagent_type_id: 'researcher',
            prompt_template: 'tA',
            output_file: 'a.md',
          },
          {
            id: 'b',
            subagent_type_id: 'researcher',
            prompt_template: 'tB',
            output_file: 'b.md',
            depends_on: ['a'],
            budget: { tokens: 1000 },
          },
        ],
        aggregate_to: 'agg.md',
      },
    };
    const dag: DispatchDag = {
      nodes: [
        {
          id: 'root',
          subagent_type_id: 'researcher',
          prompt_template: 'stage-root',
          output_file: 'root.md',
        },
      ],
    };
    const stage = baseStage({ phases: [phase], dispatch_dag: dag });
    const m = baseMethodology(stage);

    const serialized = serializeMethodology(m);
    const parsed = parseMethodology(serialized, 'm.md');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const s2 = parsed.methodology.stages[0]!;
    expect(s2.dispatch_dag).toBeDefined();
    expect(s2.dispatch_dag!.nodes).toHaveLength(1);
    expect(s2.dispatch_dag!.nodes[0]!.id).toBe('root');

    expect(s2.phases).toBeDefined();
    const p2 = s2.phases![0]!;
    expect(p2.dispatch_dag).toBeDefined();
    expect(p2.dispatch_dag!.aggregate_to).toBe('agg.md');
    expect(p2.dispatch_dag!.nodes).toHaveLength(2);
    expect(p2.dispatch_dag!.nodes[1]!.depends_on).toEqual(['a']);
    expect(p2.dispatch_dag!.nodes[1]!.budget).toEqual({ tokens: 1000 });
  });

  test('missing required field per node → warning + node skipped', () => {
    const src = `---
id: m
version: 1.0.0
name: M
description: d
---

## Stage: only
mode: auto

\`\`\`yaml
dispatch_dag:
  nodes:
    - id: ok
      subagent_type_id: researcher
      prompt_template: t
      output_file: ok.md
    - id: bad
      subagent_type_id: researcher
      output_file: bad.md
\`\`\`

body
`;
    const res = parseMethodology(src, 'm.md');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings.some((w) => w.includes('prompt_template'))).toBe(true);
    const stage = res.methodology.stages[0]!;
    expect(stage.dispatch_dag!.nodes).toHaveLength(1);
    expect(stage.dispatch_dag!.nodes[0]!.id).toBe('ok');
  });

  test('bad budget value → warning + budget dropped', () => {
    const src = `---
id: m
version: 1.0.0
name: M
description: d
---

## Stage: only
mode: auto

\`\`\`yaml
dispatch_dag:
  nodes:
    - id: a
      subagent_type_id: researcher
      prompt_template: t
      output_file: a.md
      budget: { search_units: -5, tokens: "lots" }
\`\`\`

body
`;
    const res = parseMethodology(src, 'm.md');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings.some((w) => w.includes('budget.search_units'))).toBe(true);
    expect(res.warnings.some((w) => w.includes('budget.tokens'))).toBe(true);
    const node = res.methodology.stages[0]!.dispatch_dag!.nodes[0]!;
    expect(node.budget).toBeUndefined();
  });
});

describe('dispatch_dag — validation rules 21-24', () => {
  test('rule 21: depends_on unknown id → error', () => {
    const stage = baseStage({
      dispatch_dag: {
        nodes: [
          { id: 'a', subagent_type_id: 'r', prompt_template: 't', output_file: 'a.md' },
          {
            id: 'b',
            subagent_type_id: 'r',
            prompt_template: 't',
            output_file: 'b.md',
            depends_on: ['ghost'],
          },
        ],
      },
    });
    const m = baseMethodology(stage);
    const res = validateMethodology(m);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.includes('unknown node "ghost"'))).toBe(true);
  });

  test('rule 22: cycle (A→B→A) → error', () => {
    const stage = baseStage({
      dispatch_dag: {
        nodes: [
          // Use a degenerate cycle: each depends on the other → no root, also a cycle.
          {
            id: 'a',
            subagent_type_id: 'r',
            prompt_template: 't',
            output_file: 'a.md',
            depends_on: ['b'],
          },
          {
            id: 'b',
            subagent_type_id: 'r',
            prompt_template: 't',
            output_file: 'b.md',
            depends_on: ['a'],
          },
        ],
      },
    });
    const m = baseMethodology(stage);
    const res = validateMethodology(m);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.includes('cycle detected'))).toBe(true);
  });

  test('rule 23: every node has depends_on (no root) → error', () => {
    // Three-node cycle so every node has a depends_on; both rule 22 and rule 23 fire.
    const stage = baseStage({
      dispatch_dag: {
        nodes: [
          {
            id: 'a',
            subagent_type_id: 'r',
            prompt_template: 't',
            output_file: 'a.md',
            depends_on: ['c'],
          },
          {
            id: 'b',
            subagent_type_id: 'r',
            prompt_template: 't',
            output_file: 'b.md',
            depends_on: ['a'],
          },
          {
            id: 'c',
            subagent_type_id: 'r',
            prompt_template: 't',
            output_file: 'c.md',
            depends_on: ['b'],
          },
        ],
      },
    });
    const m = baseMethodology(stage);
    const res = validateMethodology(m);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.includes('no Wave 1 root'))).toBe(true);
  });

  test('rule 24: duplicate node id → error', () => {
    const stage = baseStage({
      dispatch_dag: {
        nodes: [
          { id: 'a', subagent_type_id: 'r', prompt_template: 't', output_file: 'a.md' },
          { id: 'a', subagent_type_id: 'r', prompt_template: 't', output_file: 'a2.md' },
        ],
      },
    });
    const m = baseMethodology(stage);
    const res = validateMethodology(m);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.includes('duplicate node id "a"'))).toBe(true);
  });

  test('rules also applied to phase-level dispatch_dag', () => {
    const phase: Phase = {
      id: 'p1',
      name: 'P1',
      dispatch_dag: {
        nodes: [
          { id: 'x', subagent_type_id: 'r', prompt_template: 't', output_file: 'x.md' },
          {
            id: 'y',
            subagent_type_id: 'r',
            prompt_template: 't',
            output_file: 'y.md',
            depends_on: ['nowhere'],
          },
        ],
      },
    };
    const stage = baseStage({ phases: [phase] });
    const m = baseMethodology(stage);
    const res = validateMethodology(m);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.includes('stage only/p1 dispatch_dag'))).toBe(true);
  });

  test('valid DAG with multiple roots and waves → no errors', () => {
    const stage = baseStage({
      dispatch_dag: {
        nodes: [
          { id: 'r1', subagent_type_id: 'r', prompt_template: 't', output_file: 'r1.md' },
          { id: 'r2', subagent_type_id: 'r', prompt_template: 't', output_file: 'r2.md' },
          {
            id: 'synth',
            subagent_type_id: 'r',
            prompt_template: 't',
            output_file: 's.md',
            depends_on: ['r1', 'r2'],
          },
        ],
        aggregate_to: 'agg.md',
      },
    });
    const m = baseMethodology(stage);
    const res = validateMethodology(m);
    expect(res.ok).toBe(true);
  });
});

describe('dispatch_dag — back-compat', () => {
  test('v1 fixture without dispatch_dag still parses', () => {
    const res = parseMethodology(V1_NO_DAG_SRC, 'm.md');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.methodology.stages[0]!.dispatch_dag).toBeUndefined();
    const val = validateMethodology(res.methodology);
    expect(val.ok).toBe(true);
  });

  test('serialize skips dispatch_dag block when absent', () => {
    const stage = baseStage();
    const m = baseMethodology(stage);
    const out = serializeMethodology(m);
    expect(out.includes('dispatch_dag')).toBe(false);
  });
});
