// src/presentation/screens/Library/layout.ts
import dagre from '@dagrejs/dagre';
import type { Node, Edge as RFEdge } from '@xyflow/react';
import type { Methodology } from '../../../core/domain/methodology';

const NODE_W = 180;
const NODE_H = 56;

export interface LayoutResult {
  readonly nodes: Node[];
  readonly edges: RFEdge[];
}

export function layoutMethodology(m: Methodology): LayoutResult {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 70 });
  g.setDefaultEdgeLabel(() => ({}));

  // start + end sentinels
  g.setNode('start', { width: NODE_W, height: NODE_H });
  g.setNode('end', { width: NODE_W, height: NODE_H });
  for (const s of m.stages) g.setNode(s.id, { width: NODE_W, height: NODE_H });
  for (const e of m.edges) g.setEdge(e.from, e.to);

  dagre.layout(g);

  const nodes: Node[] = [];
  // start
  const startPos = g.node('start');
  nodes.push({
    id: 'start',
    position: { x: startPos.x - NODE_W / 2, y: startPos.y - NODE_H / 2 },
    data: { label: 'start', kind: 'sentinel' },
    type: 'stage',
  });
  // stages
  for (const s of m.stages) {
    const p = g.node(s.id);
    const phasesFromArtifact = s.phases_source === 'from_artifact';
    nodes.push({
      id: s.id,
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
      data: {
        label: s.name,
        mode: s.mode,
        kind: 'stage',
        role_split: s.role_split !== undefined,
        reviewerCount: (s.reviewers ?? []).length,
        phaseCount: phasesFromArtifact ? 0 : (s.phases ?? []).length,
        phasesFromArtifact,
      },
      type: 'stage',
    });
  }
  // end
  const endPos = g.node('end');
  nodes.push({
    id: 'end',
    position: { x: endPos.x - NODE_W / 2, y: endPos.y - NODE_H / 2 },
    data: { label: 'end', kind: 'sentinel' },
    type: 'stage',
  });

  const edges: RFEdge[] = m.edges.map((e, i) => ({
    id: `e-${i}`,
    source: e.from,
    target: e.to,
    label: e.condition.kind === 'always' ? undefined :
      e.condition.kind === 'gate-fail'
        ? `gate-fail (max ${e.condition.maxCycles !== undefined ? e.condition.maxCycles : '∞'})`
        : e.condition.kind,
    type: e.condition.kind === 'gate-fail' ? 'step' : 'default',
    style: e.condition.kind === 'gate-fail' ? { stroke: '#ff453a', strokeDasharray: '4 4' } : undefined,
  }));

  return { nodes, edges };
}
