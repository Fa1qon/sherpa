// src/presentation/screens/Library/DagView.tsx
import { useMemo, type ReactElement } from 'react';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Methodology } from '../../../core/domain/methodology';
import { layoutMethodology } from './layout';
import { StageNode } from './StageNode';

const nodeTypes = { stage: StageNode };

export function DagView({ methodology }: { methodology: Methodology }): ReactElement {
  const { nodes, edges } = useMemo(() => layoutMethodology(methodology), [methodology]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      fitView
      attributionPosition="bottom-left"
    >
      <Background gap={20} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
