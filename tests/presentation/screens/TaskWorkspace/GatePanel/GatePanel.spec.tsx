// tests/presentation/screens/TaskWorkspace/GatePanel/GatePanel.spec.tsx
// Plan 8 Task 19 — Gate panel.
// Plan 8-fix Task 3 — additional tests for runtime-driven verdicts.
import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { GatePanel } from '../../../../../src/presentation/screens/TaskWorkspace/GatePanel';
import { useTask } from '../../../../../src/renderer/store/task';
import type { Methodology } from '../../../../../src/core/domain/methodology';
import type { TaskMeta } from '../../../../../src/core/domain/task_meta';
import type { GateEvaluationLike } from '../../../../../src/core/domain/task';
import en from '../../../../../src/renderer/locales/en.json';

if (!i18n.isInitialized) {
  void i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
}

function methodologyWithGate(): Methodology {
  return {
    id: 'm',
    version: '1.0.0',
    name: 'Demo',
    description: 'fixture',
    stages: [
      {
        id: 'verify',
        name: 'Verify',
        mode: 'gate',
        contract: { input: [], output: { path: 'verify.md' } },
        gate: {
          kind: 'standard',
          items: [
            { id: 'artifact', label: 'Artifact written', kind: 'artifact_written' },
            { id: 'reviewer', label: 'Reviewer pass', kind: 'reviewer_pass' },
            { id: 'user', label: 'User confirm', kind: 'user_confirmed' },
          ],
        },
      },
      {
        id: 'plain',
        name: 'No gate',
        mode: 'interactive',
        contract: { input: [], output: { path: 'plain.md' } },
      },
    ],
    edges: [],
  };
}

function renderPanel(
  methodology: Methodology | null,
  meta: TaskMeta | null,
  verdicts?: Record<string, 'pass' | 'ask' | 'fail'>,
) {
  return render(
    <I18nextProvider i18n={i18n}>
      <GatePanel methodology={methodology} meta={meta} verdicts={verdicts} />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  useTask.setState({
    runtime: {
      currentStageId: null,
      completedStages: [],
      rolledBackFrom: {},
      gateVerdicts: {},
      artifacts: [],
      status: 'inactive',
    },
  });
});

describe('GatePanel', () => {
  test('renders placeholder when no current stage', () => {
    renderPanel(methodologyWithGate(), null);
    expect(screen.getByTestId('gate-no-stage')).toBeInTheDocument();
  });

  test('renders empty placeholder when current stage has no gate', () => {
    renderPanel(methodologyWithGate(), { task_id: 't1', current_stage: 'plain' });
    expect(screen.getByTestId('gate-empty')).toBeInTheDocument();
  });

  test('renders one row per gate item for the current stage', () => {
    renderPanel(methodologyWithGate(), { task_id: 't1', current_stage: 'verify' });
    expect(screen.getByTestId('gate-item-artifact')).toBeInTheDocument();
    expect(screen.getByTestId('gate-item-reviewer')).toBeInTheDocument();
    expect(screen.getByTestId('gate-item-user')).toBeInTheDocument();
    expect(screen.getByText('Artifact written')).toBeInTheDocument();
  });

  test('defaults missing verdicts to ask and renders glyph "?"', () => {
    renderPanel(methodologyWithGate(), { task_id: 't1', current_stage: 'verify' });
    expect(screen.getByTestId('gate-item-artifact')).toHaveAttribute('data-verdict', 'ask');
    expect(screen.getByTestId('gate-verdict-artifact').textContent).toBe('?');
  });

  test('uses supplied verdicts for each item', () => {
    renderPanel(methodologyWithGate(), { task_id: 't1', current_stage: 'verify' }, {
      artifact: 'pass',
      reviewer: 'pass',
      user: 'ask',
    });
    expect(screen.getByTestId('gate-item-artifact')).toHaveAttribute('data-verdict', 'pass');
    expect(screen.getByTestId('gate-verdict-artifact').textContent).toBe('✓');
    expect(screen.getByTestId('gate-item-user')).toHaveAttribute('data-verdict', 'ask');
    expect(screen.getByTestId('gate-verdict-user').textContent).toBe('?');
  });

  test('renders fail glyph and data attribute for failed item', () => {
    renderPanel(methodologyWithGate(), { task_id: 't1', current_stage: 'verify' }, {
      artifact: 'fail',
    });
    expect(screen.getByTestId('gate-item-artifact')).toHaveAttribute('data-verdict', 'fail');
    expect(screen.getByTestId('gate-verdict-artifact').textContent).toBe('✗');
  });

  // ── Plan 8-fix Task 3 — runtime-driven per-item verdicts ──────────────────

  test('runtime.gateVerdicts overrides the verdicts prop for the current stage', () => {
    const evaluation: GateEvaluationLike = {
      kind: 'block',
      blocking_count: 1,
      items: [
        { id: 'artifact', verdict: 'pass', reason: 'present' },
        { id: 'reviewer', verdict: 'fail', reason: 'no pass yet' },
        { id: 'user', verdict: 'ask', reason: 'pending' },
      ],
    };
    useTask.setState({
      runtime: {
        currentStageId: 'verify',
        completedStages: [],
        rolledBackFrom: {},
        gateVerdicts: { verify: evaluation },
        artifacts: [],
        status: 'running',
      },
    });
    // Pass the OPPOSITE verdicts via prop — runtime must win.
    renderPanel(methodologyWithGate(), { task_id: 't1', current_stage: 'verify' }, {
      artifact: 'fail', reviewer: 'pass', user: 'pass',
    });
    expect(screen.getByTestId('gate-item-artifact')).toHaveAttribute('data-verdict', 'pass');
    expect(screen.getByTestId('gate-item-reviewer')).toHaveAttribute('data-verdict', 'fail');
    expect(screen.getByTestId('gate-item-user')).toHaveAttribute('data-verdict', 'ask');
  });

  test('runtime "no_gate" evaluation does not override prop fallback', () => {
    useTask.setState({
      runtime: {
        currentStageId: 'verify',
        completedStages: [],
        rolledBackFrom: {},
        gateVerdicts: { verify: { kind: 'no_gate' } },
        artifacts: [],
        status: 'running',
      },
    });
    renderPanel(methodologyWithGate(), { task_id: 't1', current_stage: 'verify' }, {
      artifact: 'pass',
    });
    expect(screen.getByTestId('gate-item-artifact')).toHaveAttribute('data-verdict', 'pass');
  });

  test('runtime.currentStageId is used when meta.current_stage is missing', () => {
    const evaluation: GateEvaluationLike = {
      kind: 'pass',
      items: [{ id: 'artifact', verdict: 'pass', reason: 'ok' }],
    };
    useTask.setState({
      runtime: {
        currentStageId: 'verify',
        completedStages: [],
        rolledBackFrom: {},
        gateVerdicts: { verify: evaluation },
        artifacts: [],
        status: 'running',
      },
    });
    renderPanel(methodologyWithGate(), { task_id: 't1' });
    expect(screen.getByTestId('gate-item-artifact')).toHaveAttribute('data-verdict', 'pass');
  });
});
