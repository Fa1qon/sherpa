import { describe, it, expect } from 'vitest';
import { parseMethodologyYaml } from '../../../src/core/methodology/parse_yaml';
import { serializeMethodologyYaml } from '../../../src/core/methodology/serialize_yaml';

const MINIMAL_YAML = `
id: test-minimal
version: "1.0"
name: Test Minimal
stages:
  - id: stage1
    name: Stage 1
    mode: auto
    contract:
      input: []
      output:
        path: artifacts/stage1.md
`.trim();

describe('parseMethodologyYaml', () => {
  it('parses a minimal methodology', () => {
    const r = parseMethodologyYaml(MINIMAL_YAML, 'test.yaml');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.methodology.id).toBe('test-minimal');
    expect(r.methodology.name).toBe('Test Minimal');
    expect(r.methodology.stages).toHaveLength(1);
    expect(r.methodology.stages[0]!.id).toBe('stage1');
  });

  it('derives linear edges when edges omitted', () => {
    const r = parseMethodologyYaml(MINIMAL_YAML, 'test.yaml');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const edges = r.methodology.edges;
    expect(edges[0]).toMatchObject({ from: 'start', to: 'stage1' });
    expect(edges[edges.length - 1]).toMatchObject({ to: 'end' });
  });

  it('parses gate with auto_pass_when', () => {
    const src = `
id: gated
version: "1.0"
name: Gated
stages:
  - id: s1
    name: S1
    mode: auto
    contract:
      input: []
      output:
        path: artifacts/s1.md
    gate:
      kind: standard
      items:
        - id: written
          kind: artifact_written
          label: Written
          auto_pass_when:
            expr: "artifact_exists('artifacts/s1.md')"
`.trim();
    const r = parseMethodologyYaml(src, 'test.yaml');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const gate = r.methodology.stages[0]!.gate;
    expect(gate).toBeDefined();
    expect(gate!.items[0]!.auto_pass_when?.expr).toBe("artifact_exists('artifacts/s1.md')");
  });

  it('parses explicit non-linear edges', () => {
    const src = `
id: nonlinear
version: "1.0"
name: Non-linear
stages:
  - id: planning
    name: Planning
    mode: auto
    contract:
      input: []
      output:
        path: artifacts/plan.md
  - id: review
    name: Review
    mode: gate
    contract:
      input: []
      output:
        path: artifacts/review.md
edges:
  - from: start
    to: planning
    condition:
      kind: always
  - from: planning
    to: review
    condition:
      kind: gate-pass
  - from: planning
    to: planning
    condition:
      kind: gate-fail
      maxCycles: 3
  - from: review
    to: end
    condition:
      kind: gate-pass
`.trim();
    const r = parseMethodologyYaml(src, 'test.yaml');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const gf = r.methodology.edges.find((e) => e.condition.kind === 'gate-fail');
    expect(gf).toBeDefined();
    if (gf?.condition.kind === 'gate-fail') {
      expect(gf.condition.maxCycles).toBe(3);
    }
  });

  it('returns parse-error for missing id', () => {
    const src = `name: No Id\nstages:\n  - id: s\n    name: S\n    mode: auto\n    contract:\n      input: []\n      output:\n        path: x.md\n`;
    const r = parseMethodologyYaml(src, 'test.yaml');
    expect(r.ok).toBe(false);
  });

  it('round-trips through serialize_yaml → parse_yaml', () => {
    const r1 = parseMethodologyYaml(MINIMAL_YAML, 'test.yaml');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const serialized = serializeMethodologyYaml(r1.methodology);
    const r2 = parseMethodologyYaml(serialized, 'test.yaml');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.methodology.id).toBe(r1.methodology.id);
    expect(r2.methodology.stages[0]!.id).toBe(r1.methodology.stages[0]!.id);
  });
});
