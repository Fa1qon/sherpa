// src/presentation/screens/Library/EditCanvas.tsx
import { useMemo, useCallback, type ReactElement } from 'react';
import {
  ReactFlow, Background, Controls,
  type Node, type Edge as RFEdge, type Connection, type NodeChange,
  applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Methodology, Edge } from '../../../core/domain/methodology';
import { layoutMethodology } from './layout';
import { StageNode } from './StageNode';

const nodeTypes = { stage: StageNode };

interface Props {
  draft: Methodology;
  onChange: (next: Methodology) => void;
  selectedStageId: string | null;
  selectedEdgeIndex: number | null;
  onSelectStage: (id: string | null) => void;
  onSelectEdge: (idx: number | null) => void;
}

export function EditCanvas({
  draft, onChange, selectedStageId, selectedEdgeIndex,
  onSelectStage, onSelectEdge,
}: Props): ReactElement {
  const { nodes: autoNodes, edges: rfEdges } = useMemo(
    () => layoutMethodology(draft),
    [draft],
  );

  const nodes: Node[] = useMemo(() => {
    const positions = draft.layout?.positions ?? {};
    return autoNodes.map((n) => {
      const saved = positions[n.id];
      const sel = n.id === selectedStageId;
      return saved
        ? { ...n, position: saved, selected: sel }
        : { ...n, selected: sel };
    });
  }, [autoNodes, draft.layout?.positions, selectedStageId]);

  const edges: RFEdge[] = useMemo(
    () => rfEdges.map((e, i) => ({ ...e, selected: i === selectedEdgeIndex })),
    [rfEdges, selectedEdgeIndex],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updated = applyNodeChanges(changes, nodes);
      const positions: Record<string, { x: number; y: number }> = { ...(draft.layout?.positions ?? {}) };
      let touched = false;
      for (const n of updated) {
        if (n.id === 'start' || n.id === 'end') continue;
        const prev = positions[n.id];
        if (!prev || prev.x !== n.position.x || prev.y !== n.position.y) {
          positions[n.id] = { x: n.position.x, y: n.position.y };
          touched = true;
        }
      }
      if (touched) {
        onChange({ ...draft, layout: { positions } });
      }
    },
    [draft, nodes, onChange],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      const exists = draft.edges.some((e) => e.from === c.source && e.to === c.target);
      if (exists) return;
      const newEdge: Edge = { from: c.source, to: c.target, condition: { kind: 'always' } };
      onChange({ ...draft, edges: [...draft.edges, newEdge] });
    },
    [draft, onChange],
  );

  const onNodeClick = useCallback(
    (_: unknown, n: Node) => {
      if (n.id === 'start' || n.id === 'end') {
        onSelectStage(null);
        return;
      }
      onSelectStage(n.id);
      onSelectEdge(null);
    },
    [onSelectStage, onSelectEdge],
  );

  const onEdgeClick = useCallback(
    (_: unknown, e: RFEdge) => {
      const m = /^e-(\d+)$/.exec(e.id);
      if (!m) return;
      onSelectEdge(Number.parseInt(m[1]!, 10));
      onSelectStage(null);
    },
    [onSelectEdge, onSelectStage],
  );

  const onPaneClick = useCallback(() => {
    onSelectStage(null);
    onSelectEdge(null);
  }, [onSelectStage, onSelectEdge]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onPaneClick={onPaneClick}
      nodesDraggable
      nodesConnectable
      elementsSelectable
      fitView
      attributionPosition="bottom-left"
    >
      <Background gap={20} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
