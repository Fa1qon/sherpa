import type { Methodology } from '../domain/methodology';

export const START_STAGE_ID = 'start' as const;
export const END_STAGE_ID = 'end' as const;

export function findFirstStageId(methodology: Methodology): string {
  const startEdge = methodology.edges.find((e) => e.from === START_STAGE_ID);
  if (startEdge) return startEdge.to;
  return methodology.stages[0]?.id ?? END_STAGE_ID;
}

export function findNextStageId(
  fromStageId: string,
  methodology: Methodology,
  gateKind: 'pass' | 'no_gate',
): string {
  const outgoing = methodology.edges.filter((e) => e.from === fromStageId);

  if (gateKind === 'pass') {
    const gp = outgoing.find((e) => e.condition.kind === 'gate-pass');
    if (gp) return gp.to;
  }

  const always = outgoing.find((e) => e.condition.kind === 'always');
  if (always) return always.to;

  return END_STAGE_ID;
}
