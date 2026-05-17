import { describe, it, expect } from 'vitest';
import { serializeMethodologyYaml } from '../../../src/core/methodology/serialize_yaml';
import type { Methodology } from '../../../src/core/domain/methodology';

const MINIMAL: Methodology = {
  id: 'test-m',
  version: '1.0',
  name: 'Test',
  description: '',
  stages: [
    {
      id: 'stage1',
      name: 'Stage 1',
      mode: 'auto',
      contract: { input: [], output: { path: 'artifacts/stage1.md' } },
    },
  ],
  edges: [
    { from: 'start', to: 'stage1', condition: { kind: 'always' } },
    { from: 'stage1', to: 'end', condition: { kind: 'always' } },
  ],
};

describe('serializeMethodologyYaml', () => {
  it('emits valid YAML with required fields', () => {
    const out = serializeMethodologyYaml(MINIMAL);
    expect(out).toContain('id: test-m');
    expect(out).toContain('name: Test');
    expect(out).toContain('version:');
    expect(out).toContain('stage1');
  });

  it('omits edges for linear flow', () => {
    const out = serializeMethodologyYaml(MINIMAL);
    expect(out).not.toContain('edges:');
  });

  it('emits edges for non-linear flow', () => {
    const m: Methodology = {
      ...MINIMAL,
      stages: [
        { ...MINIMAL.stages[0]!, id: 'planning' },
        { ...MINIMAL.stages[0]!, id: 'review' },
      ],
      edges: [
        { from: 'start', to: 'planning', condition: { kind: 'always' } },
        { from: 'planning', to: 'review', condition: { kind: 'gate-pass' } },
        { from: 'planning', to: 'planning', condition: { kind: 'gate-fail', maxCycles: 3 } },
        { from: 'review', to: 'end', condition: { kind: 'gate-pass' } },
      ],
    };
    const out = serializeMethodologyYaml(m);
    expect(out).toContain('edges:');
    expect(out).toContain('gate-pass');
    expect(out).toContain('gate-fail');
  });

  it('preserves system_prompt_template', () => {
    const m: Methodology = {
      ...MINIMAL,
      stages: [
        {
          ...MINIMAL.stages[0]!,
          system_prompt_template: 'You are an agent.\n\nDo the thing.',
        },
      ],
    };
    const out = serializeMethodologyYaml(m);
    expect(out).toContain('system_prompt_template:');
    expect(out).toContain('You are an agent.');
  });

  it('omits optional fields when not set', () => {
    const out = serializeMethodologyYaml(MINIMAL);
    expect(out).not.toContain('anti_patterns:');
    expect(out).not.toContain('deps:');
    expect(out).not.toContain('gate:');
  });
});
