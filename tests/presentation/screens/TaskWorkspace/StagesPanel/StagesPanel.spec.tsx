// tests/presentation/screens/TaskWorkspace/StagesPanel/StagesPanel.spec.tsx
// Plan 8 Task 19 — Stage indicator panel.
// Plan 8-fix Task 3 — additional tests for runtime-driven highlight.
import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { StagesPanel } from '../../../../../src/presentation/screens/TaskWorkspace/StagesPanel';
import { useTask } from '../../../../../src/renderer/store/task';
import type { Methodology } from '../../../../../src/core/domain/methodology';
import type { TaskMeta } from '../../../../../src/core/domain/task_meta';
import en from '../../../../../src/renderer/locales/en.json';

if (!i18n.isInitialized) {
  void i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
}

function makeMethodology(): Methodology {
  return {
    id: 'm',
    version: '1.0.0',
    name: 'Demo',
    description: 'fixture',
    stages: [
      { id: 'req', name: 'Requirements', mode: 'interactive', contract: { input: [], output: { path: 'req.md' } } },
      { id: 'plan', name: 'Plan', mode: 'interactive', contract: { input: [], output: { path: 'plan.md' } } },
      { id: 'impl', name: 'Implement', mode: 'interactive', contract: { input: [], output: { path: 'impl.md' } } },
      { id: 'verify', name: 'Verify', mode: 'gate', contract: { input: [], output: { path: 'verify.md' } } },
    ],
    edges: [],
  };
}

function renderPanel(methodology: Methodology | null, meta: TaskMeta | null) {
  return render(
    <I18nextProvider i18n={i18n}>
      <StagesPanel methodology={methodology} meta={meta} />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  // Reset runtime to defaults so existing meta-driven tests are unaffected.
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

describe('StagesPanel', () => {
  test('renders empty state when no methodology', () => {
    renderPanel(null, null);
    expect(screen.getByTestId('stages-empty')).toBeInTheDocument();
  });

  test('renders all stages in declaration order', () => {
    renderPanel(makeMethodology(), { task_id: 't1', current_stage: 'plan', stage_history: [] });
    expect(screen.getByTestId('stage-row-req')).toBeInTheDocument();
    expect(screen.getByTestId('stage-row-plan')).toBeInTheDocument();
    expect(screen.getByTestId('stage-row-impl')).toBeInTheDocument();
    expect(screen.getByTestId('stage-row-verify')).toBeInTheDocument();
    // Display labels (stage.name) appear.
    expect(screen.getByText('Requirements')).toBeInTheDocument();
    expect(screen.getByText('Implement')).toBeInTheDocument();
  });

  test('marks current stage with data-status=current', () => {
    renderPanel(makeMethodology(), {
      task_id: 't1',
      current_stage: 'impl',
      stage_history: [
        { stage_id: 'req', entered_at: 'x', completed_at: 'y' },
        { stage_id: 'plan', entered_at: 'x', completed_at: 'y' },
        { stage_id: 'impl', entered_at: 'z' },
      ],
    });
    expect(screen.getByTestId('stage-row-impl')).toHaveAttribute('data-status', 'current');
    expect(screen.getByTestId('stage-row-req')).toHaveAttribute('data-status', 'completed');
    expect(screen.getByTestId('stage-row-plan')).toHaveAttribute('data-status', 'completed');
    expect(screen.getByTestId('stage-row-verify')).toHaveAttribute('data-status', 'pending');
  });

  test('treats a stage with completed_at history entry as completed', () => {
    renderPanel(makeMethodology(), {
      task_id: 't1',
      current_stage: undefined,
      stage_history: [
        { stage_id: 'req', entered_at: '2026-05-12T00:00:00Z', completed_at: '2026-05-12T01:00:00Z' },
      ],
    });
    expect(screen.getByTestId('stage-row-req')).toHaveAttribute('data-status', 'completed');
  });

  test('treats all stages as pending when meta is null', () => {
    renderPanel(makeMethodology(), null);
    expect(screen.getByTestId('stage-row-req')).toHaveAttribute('data-status', 'pending');
    expect(screen.getByTestId('stage-row-impl')).toHaveAttribute('data-status', 'pending');
  });

  // ── Plan 8-fix Task 3 — runtime-driven status ─────────────────────────────

  test('runtime.currentStageId highlights stage as current even when meta is silent', () => {
    useTask.setState({
      runtime: {
        currentStageId: 'plan',
        completedStages: [],
        rolledBackFrom: {},
        gateVerdicts: {},
        artifacts: [],
        status: 'running',
      },
    });
    renderPanel(makeMethodology(), { task_id: 't1', stage_history: [] });
    expect(screen.getByTestId('stage-row-plan')).toHaveAttribute('data-status', 'current');
  });

  test('runtime.completedStages marks stages completed in addition to meta history', () => {
    useTask.setState({
      runtime: {
        currentStageId: 'impl',
        completedStages: ['req', 'plan'],
        rolledBackFrom: {},
        gateVerdicts: {},
        artifacts: [],
        status: 'running',
      },
    });
    // Meta has NO stage_history entries — runtime alone drives completion.
    renderPanel(makeMethodology(), { task_id: 't1', stage_history: [] });
    expect(screen.getByTestId('stage-row-req')).toHaveAttribute('data-status', 'completed');
    expect(screen.getByTestId('stage-row-plan')).toHaveAttribute('data-status', 'completed');
    expect(screen.getByTestId('stage-row-impl')).toHaveAttribute('data-status', 'current');
    expect(screen.getByTestId('stage-row-verify')).toHaveAttribute('data-status', 'pending');
  });

  test('runtime completion is additive to meta-history completion (union semantics)', () => {
    useTask.setState({
      runtime: {
        currentStageId: null,
        completedStages: ['plan'], // only plan in runtime
        rolledBackFrom: {},
        gateVerdicts: {},
        artifacts: [],
        status: 'running',
      },
    });
    // Meta marks only `req` completed → union should include both.
    renderPanel(makeMethodology(), {
      task_id: 't1',
      stage_history: [{ stage_id: 'req', entered_at: 'x', completed_at: 'y' }],
    });
    expect(screen.getByTestId('stage-row-req')).toHaveAttribute('data-status', 'completed');
    expect(screen.getByTestId('stage-row-plan')).toHaveAttribute('data-status', 'completed');
  });

  test('renders icons by status (✓ / ● / ○)', () => {
    renderPanel(makeMethodology(), {
      task_id: 't1',
      current_stage: 'plan',
      stage_history: [
        { stage_id: 'req', entered_at: 'x', completed_at: 'y' },
        { stage_id: 'plan', entered_at: 'z' },
      ],
    });
    expect(screen.getByTestId('stage-icon-req').textContent).toBe('✓');
    expect(screen.getByTestId('stage-icon-plan').textContent).toBe('●');
    expect(screen.getByTestId('stage-icon-impl').textContent).toBe('○');
  });
});
