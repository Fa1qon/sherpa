import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Methodology } from '../../../src/core/domain/methodology';

vi.mock('@xyflow/react', () => {
  return {
    ReactFlow: (props: {
      onConnect?: (c: { source: string; target: string }) => void;
      onNodeClick?: (e: unknown, n: { id: string }) => void;
      onEdgeClick?: (e: unknown, n: { id: string }) => void;
      onPaneClick?: () => void;
    }) => (
      <div data-testid="rf-mock">
        <button onClick={() => props.onNodeClick?.(null, { id: 'a' })}>click-node-a</button>
        <button onClick={() => props.onEdgeClick?.(null, { id: 'e-0' })}>click-edge-0</button>
        <button onClick={() => props.onConnect?.({ source: 'a', target: 'b' })}>connect-a-b</button>
        <button onClick={() => props.onPaneClick?.()}>click-pane</button>
      </div>
    ),
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    Position: { Left: 'left', Right: 'right' },
    applyNodeChanges: <T,>(changes: unknown, nodes: T[]) => nodes,
  };
});

vi.mock('../../../src/presentation/screens/Library/layout', () => ({
  layoutMethodology: () => ({
    nodes: [
      { id: 'start', position: { x: 0, y: 0 }, data: { kind: 'sentinel' }, type: 'stage' },
      { id: 'a', position: { x: 100, y: 50 }, data: { kind: 'stage', label: 'a', mode: 'auto' }, type: 'stage' },
      { id: 'b', position: { x: 280, y: 50 }, data: { kind: 'stage', label: 'b', mode: 'auto' }, type: 'stage' },
      { id: 'end', position: { x: 400, y: 50 }, data: { kind: 'sentinel' }, type: 'stage' },
    ],
    edges: [
      { id: 'e-0', source: 'a', target: 'b', label: undefined },
    ],
  }),
}));

import { EditCanvas } from '../../../src/presentation/screens/Library/EditCanvas';

const DRAFT: Methodology = {
  id: 'm', version: '1', name: 'M', description: 'd',
  stages: [
    { id: 'a', name: 'A', mode: 'auto', contract: { input: [], output: { path: 'a.md' } } },
    { id: 'b', name: 'B', mode: 'auto', contract: { input: [], output: { path: 'b.md' } } },
  ],
  edges: [
    { from: 'a', to: 'b', condition: { kind: 'always' } },
  ],
};

describe('EditCanvas', () => {
  test('connect adds an `always` edge', () => {
    const onChange = vi.fn();
    render(
      <EditCanvas
        draft={DRAFT}
        onChange={onChange}
        selectedStageId={null}
        selectedEdgeIndex={null}
        onSelectStage={vi.fn()}
        onSelectEdge={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('connect-a-b'));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('node click → onSelectStage(id), onSelectEdge(null)', () => {
    const onSelectStage = vi.fn();
    const onSelectEdge = vi.fn();
    render(
      <EditCanvas
        draft={DRAFT}
        onChange={vi.fn()}
        selectedStageId={null}
        selectedEdgeIndex={null}
        onSelectStage={onSelectStage}
        onSelectEdge={onSelectEdge}
      />,
    );
    fireEvent.click(screen.getByText('click-node-a'));
    expect(onSelectStage).toHaveBeenCalledWith('a');
    expect(onSelectEdge).toHaveBeenCalledWith(null);
  });

  test('edge click → onSelectEdge(0), onSelectStage(null)', () => {
    const onSelectStage = vi.fn();
    const onSelectEdge = vi.fn();
    render(
      <EditCanvas
        draft={DRAFT}
        onChange={vi.fn()}
        selectedStageId={null}
        selectedEdgeIndex={null}
        onSelectStage={onSelectStage}
        onSelectEdge={onSelectEdge}
      />,
    );
    fireEvent.click(screen.getByText('click-edge-0'));
    expect(onSelectEdge).toHaveBeenCalledWith(0);
    expect(onSelectStage).toHaveBeenCalledWith(null);
  });
});
