// Plan 6 Task 14 — StageNode visuals tests.
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { StageNodeRaw, type StageNodeData } from '../../../../src/presentation/screens/Library/StageNode';

function renderNode(data: StageNodeData) {
  const props = { id: 's1', data, selected: false, type: 'stage' } as unknown as NodeProps;
  return render(
    <ReactFlowProvider>
      <StageNodeRaw {...props} />
    </ReactFlowProvider>,
  );
}

describe('StageNode', () => {
  test('renders mode icon and label for auto stage', () => {
    const { container, getByText } = renderNode({
      label: 'Plan', mode: 'auto', kind: 'stage',
    });
    expect(getByText('Plan')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('role_split renders AI and Human chips', () => {
    const { container } = renderNode({
      label: 'Review', mode: 'interactive', kind: 'stage',
      role_split: true,
    });
    expect(container.querySelector('[data-role="ai"]')).toBeInTheDocument();
    expect(container.querySelector('[data-role="ai"]')!.textContent).toBe('AI');
    expect(container.querySelector('[data-role="human"]')).toBeInTheDocument();
    expect(container.querySelector('[data-role="human"]')!.textContent).toBe('Human');
  });

  test('no role chips when role_split is false', () => {
    const { container } = renderNode({
      label: 'Plan', mode: 'auto', kind: 'stage', role_split: false,
    });
    expect(container.querySelector('[data-role="ai"]')).toBeNull();
    expect(container.querySelector('[data-role="human"]')).toBeNull();
  });

  test('reviewer count badge', () => {
    const { container } = renderNode({
      label: 'Plan', mode: 'auto', kind: 'stage', reviewerCount: 3,
    });
    const badge = container.querySelector('[title="Reviewers"]');
    expect(badge).toBeInTheDocument();
    expect(badge!.textContent).toBe('R3');
  });

  test('no reviewer badge when count is 0', () => {
    const { container } = renderNode({
      label: 'Plan', mode: 'auto', kind: 'stage', reviewerCount: 0,
    });
    expect(container.querySelector('[title="Reviewers"]')).toBeNull();
  });

  test('phase count badge for inline phases', () => {
    const { container } = renderNode({
      label: 'Impl', mode: 'auto', kind: 'stage',
      phaseCount: 4, phasesFromArtifact: false,
    });
    const badge = container.querySelector('[title="Phases"]');
    expect(badge).toBeInTheDocument();
    expect(badge!.textContent).toBe('P4');
    expect(badge!.getAttribute('data-from-artifact')).toBe('false');
  });

  test('phase badge with P* and data-from-artifact when phases_from_artifact', () => {
    const { container } = renderNode({
      label: 'Impl', mode: 'auto', kind: 'stage',
      phaseCount: 0, phasesFromArtifact: true,
    });
    const badge = container.querySelector('[title="Phases"]');
    expect(badge).toBeInTheDocument();
    expect(badge!.textContent).toBe('P*');
    expect(badge!.getAttribute('data-from-artifact')).toBe('true');
  });

  test('no phase badge when phaseCount=0 and not from artifact', () => {
    const { container } = renderNode({
      label: 'Plan', mode: 'auto', kind: 'stage',
      phaseCount: 0, phasesFromArtifact: false,
    });
    expect(container.querySelector('[title="Phases"]')).toBeNull();
  });

  test('sentinel renders simple — no chips, no badges', () => {
    const { container, getByText } = renderNode({
      label: 'start', kind: 'sentinel',
    });
    expect(getByText('start')).toBeInTheDocument();
    expect(container.querySelector('[data-role="ai"]')).toBeNull();
    expect(container.querySelector('[title="Reviewers"]')).toBeNull();
    expect(container.querySelector('[title="Phases"]')).toBeNull();
  });

  test('node has data-mode attribute reflecting stage mode', () => {
    const { container } = renderNode({
      label: 'Gate', mode: 'gate', kind: 'stage',
    });
    const node = container.querySelector('[data-mode="gate"]');
    expect(node).toBeInTheDocument();
  });
});
