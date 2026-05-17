import { describe, it, expect } from 'vitest';
import { findFirstStageId, findNextStageId } from '../../../src/core/methodology/next_stage';
import type { Methodology } from '../../../src/core/domain/methodology';

function makeMethodology(overrides: Partial<Methodology> = {}): Methodology {
  return {
    id: 'test', version: '1.0', name: 'Test', description: 'test',
    stages: [
      { id: 's1', name: 'Stage 1', mode: 'auto', contract: { input: [], output: { path: 'out.md' } } },
      { id: 's2', name: 'Stage 2', mode: 'auto', contract: { input: [], output: { path: 'out2.md' } } },
    ],
    edges: [
      { from: 'start', to: 's1', condition: { kind: 'always' } },
      { from: 's1',    to: 's2', condition: { kind: 'gate-pass' } },
      { from: 's2',    to: 'end', condition: { kind: 'always' } },
    ],
    ...overrides,
  } as Methodology;
}

describe('findFirstStageId', () => {
  it('returns the stage pointed to by the start edge', () => {
    expect(findFirstStageId(makeMethodology())).toBe('s1');
  });

  it('falls back to first declared stage when no start edge', () => {
    const m = makeMethodology({ edges: [] });
    expect(findFirstStageId(m)).toBe('s1');
  });

  it('returns "end" for an empty methodology', () => {
    const m = makeMethodology({ stages: [], edges: [] });
    expect(findFirstStageId(m)).toBe('end');
  });
});

describe('findNextStageId', () => {
  it('follows gate-pass edge on gate pass', () => {
    expect(findNextStageId('s1', makeMethodology(), 'pass')).toBe('s2');
  });

  it('follows always edge when no gate-pass edge matches', () => {
    const m = makeMethodology({
      edges: [
        { from: 'start', to: 's1', condition: { kind: 'always' } },
        { from: 's1',    to: 's2', condition: { kind: 'always' } },
      ],
    });
    expect(findNextStageId('s1', m, 'no_gate')).toBe('s2');
  });

  it('returns "end" when no matching outgoing edge', () => {
    expect(findNextStageId('s2', makeMethodology(), 'pass')).toBe('end');
  });

  it('skips gate-pass edge when gateKind is no_gate', () => {
    const m = makeMethodology({
      edges: [
        { from: 'start', to: 's1', condition: { kind: 'always' } },
        { from: 's1',    to: 's2', condition: { kind: 'gate-pass' } },
      ],
    });
    // no_gate → gate-pass skipped → always not found → 'end'
    expect(findNextStageId('s1', m, 'no_gate')).toBe('end');
  });
});
