import { describe, test, expect } from 'vitest';
import {
  type Methodology,
  isMethodology,
  isStage,
  isEdge,
} from '../../../src/core/domain/methodology';

const linearMethodology: Methodology = {
  id: 'delta_design',
  version: '1.0.0',
  name: 'Delta Design',
  description: 'Incremental changes to existing code',
  stages: [
    {
      id: 'req',
      name: 'Requirements',
      mode: 'interactive',
      contract: { input: [], output: { path: 'requirements.md' } },
    },
    {
      id: 'impl',
      name: 'Implementation',
      mode: 'auto',
      contract: {
        input: [{ stage: 'req', artifact: 'requirements.md' }],
        output: { path: 'impl.diff' },
      },
    },
  ],
  edges: [
    { from: 'start', to: 'req', condition: { kind: 'always' } },
    { from: 'req', to: 'impl', condition: { kind: 'always' } },
    { from: 'impl', to: 'end', condition: { kind: 'always' } },
  ],
};

describe('Methodology domain', () => {
  test('isMethodology narrows valid object', () => {
    expect(isMethodology(linearMethodology)).toBe(true);
  });

  test('isMethodology rejects missing fields', () => {
    expect(isMethodology({ id: 'x' })).toBe(false);
    expect(isMethodology(null)).toBe(false);
    expect(isMethodology({ ...linearMethodology, stages: 'not an array' })).toBe(false);
  });

  test('isStage rejects unknown mode', () => {
    expect(isStage({
      id: 's',
      name: 'S',
      mode: 'magic',
      contract: { input: [], output: { path: 'x.md' } },
    })).toBe(false);
  });

  test('isEdge rejects unknown condition kind', () => {
    expect(isEdge({
      from: 'a',
      to: 'b',
      condition: { kind: 'bogus' },
    })).toBe(false);
  });

  test('isEdge accepts all four condition kinds', () => {
    expect(isEdge({ from: 'a', to: 'b', condition: { kind: 'always' } })).toBe(true);
    expect(isEdge({ from: 'a', to: 'b', condition: { kind: 'gate-pass' } })).toBe(true);
    expect(isEdge({ from: 'a', to: 'b', condition: { kind: 'gate-fail', maxCycles: 2 } })).toBe(true);
    expect(isEdge({ from: 'a', to: 'b', condition: { kind: 'branch', expr: 'cond' } })).toBe(true);
  });
});
