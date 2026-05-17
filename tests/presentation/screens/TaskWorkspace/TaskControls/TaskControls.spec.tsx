// tests/presentation/screens/TaskWorkspace/TaskControls/TaskControls.spec.tsx
// Plan 8 Task 19 — Task controls strip (Pause / Resume / token totals).
// Plan 8-fix Task 4 — adds Cancel button + runtime-status preference +
// resolveEffectiveStatus pure helper.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import {
  TaskControls,
  resolveEffectiveStatus,
} from '../../../../../src/presentation/screens/TaskWorkspace/TaskControls/TaskControls';
import { useTask } from '../../../../../src/renderer/store/task';
import type { TaskMeta } from '../../../../../src/core/domain/task_meta';
import en from '../../../../../src/renderer/locales/en.json';

if (!i18n.isInitialized) {
  void i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
}

type Mock = ReturnType<typeof vi.fn>;

function installMocks(opts: { pause?: Mock; resume?: Mock; cancel?: Mock } = {}) {
  (window as { sherpa?: unknown }).sherpa = {
    task: {
      pause: opts.pause ?? vi.fn(),
      resume: opts.resume ?? vi.fn(),
      cancel: opts.cancel ?? vi.fn(),
    },
  };
}

function setRuntimeStatus(
  status: 'inactive' | 'running' | 'paused' | 'completed' | 'failed',
): void {
  useTask.setState((s) => ({ runtime: { ...s.runtime, status } }));
}

function renderControls(
  meta: TaskMeta | null,
  totalTokens?: { input: number; output: number },
  onChanged?: () => void,
) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TaskControls
        projectPath="/proj"
        taskId="task-1"
        meta={meta}
        totalTokens={totalTokens}
        onChanged={onChanged}
      />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  (window as { sherpa?: unknown }).sherpa = undefined;
  // Reset runtime to inactive so visibility falls back to meta.status.
  useTask.setState({
    current: null,
    sending: false,
    error: null,
    running: { toolUses: 0, elapsedSec: 0, estTokens: 0, linesWritten: 0, lastToolName: null },
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

describe('TaskControls', () => {
  test('shows Pause + Cancel when status is active (meta fallback)', () => {
    installMocks();
    renderControls({ task_id: 't1', status: 'active' });
    expect(screen.getByTestId('task-controls-pause')).toBeInTheDocument();
    expect(screen.getByTestId('task-controls-cancel')).toBeInTheDocument();
    expect(screen.queryByTestId('task-controls-resume')).toBeNull();
  });

  test('shows Resume + Cancel when status is paused (meta fallback)', () => {
    installMocks();
    renderControls({ task_id: 't1', status: 'paused' });
    expect(screen.getByTestId('task-controls-resume')).toBeInTheDocument();
    expect(screen.getByTestId('task-controls-cancel')).toBeInTheDocument();
    expect(screen.queryByTestId('task-controls-pause')).toBeNull();
  });

  test('shows neither pause/resume nor cancel when status is completed', () => {
    installMocks();
    renderControls({ task_id: 't1', status: 'completed' });
    expect(screen.queryByTestId('task-controls-pause')).toBeNull();
    expect(screen.queryByTestId('task-controls-resume')).toBeNull();
    expect(screen.queryByTestId('task-controls-cancel')).toBeNull();
  });

  test('shows nothing when status is failed', () => {
    installMocks();
    renderControls({ task_id: 't1', status: 'failed' });
    expect(screen.queryByTestId('task-controls-pause')).toBeNull();
    expect(screen.queryByTestId('task-controls-resume')).toBeNull();
    expect(screen.queryByTestId('task-controls-cancel')).toBeNull();
  });

  test('runtime.status=running takes precedence over meta.status=paused', () => {
    installMocks();
    setRuntimeStatus('running');
    renderControls({ task_id: 't1', status: 'paused' });
    expect(screen.getByTestId('task-controls-pause')).toBeInTheDocument();
    expect(screen.queryByTestId('task-controls-resume')).toBeNull();
    expect(screen.getByTestId('task-controls-cancel')).toBeInTheDocument();
  });

  test('runtime.status=paused takes precedence over meta.status=active', () => {
    installMocks();
    setRuntimeStatus('paused');
    renderControls({ task_id: 't1', status: 'active' });
    expect(screen.getByTestId('task-controls-resume')).toBeInTheDocument();
    expect(screen.queryByTestId('task-controls-pause')).toBeNull();
    expect(screen.getByTestId('task-controls-cancel')).toBeInTheDocument();
  });

  test('runtime.status=inactive falls back to meta.status', () => {
    installMocks();
    setRuntimeStatus('inactive');
    renderControls({ task_id: 't1', status: 'paused' });
    expect(screen.getByTestId('task-controls-resume')).toBeInTheDocument();
  });

  test('Cancel hidden when runtime.status=completed (overrides meta)', () => {
    installMocks();
    setRuntimeStatus('completed');
    renderControls({ task_id: 't1', status: 'active' });
    expect(screen.queryByTestId('task-controls-cancel')).toBeNull();
    expect(screen.queryByTestId('task-controls-pause')).toBeNull();
  });

  test('clicking Pause calls task.pause IPC with projectPath+taskId', async () => {
    const user = userEvent.setup();
    const pause = vi.fn().mockResolvedValue({ ok: true });
    installMocks({ pause });
    renderControls({ task_id: 't1', status: 'active' });
    await user.click(screen.getByTestId('task-controls-pause'));
    await waitFor(() => {
      expect(pause).toHaveBeenCalledWith({ projectPath: '/proj', taskId: 'task-1' });
    });
  });

  test('clicking Resume calls task.resume IPC with projectPath+taskId', async () => {
    const user = userEvent.setup();
    const resume = vi.fn().mockResolvedValue({ ok: true });
    installMocks({ resume });
    renderControls({ task_id: 't1', status: 'paused' });
    await user.click(screen.getByTestId('task-controls-resume'));
    await waitFor(() => {
      expect(resume).toHaveBeenCalledWith({ projectPath: '/proj', taskId: 'task-1' });
    });
  });

  test('clicking Cancel calls task.cancel IPC with taskId only', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn().mockResolvedValue({ ok: true });
    installMocks({ cancel });
    renderControls({ task_id: 't1', status: 'active' });
    await user.click(screen.getByTestId('task-controls-cancel'));
    await waitFor(() => {
      expect(cancel).toHaveBeenCalledWith({ taskId: 'task-1' });
    });
  });

  test('Cancel onChanged fires after success', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    installMocks({ cancel: vi.fn().mockResolvedValue({ ok: true }) });
    renderControls({ task_id: 't1', status: 'active' }, undefined, onChanged);
    await user.click(screen.getByTestId('task-controls-cancel'));
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
  });

  test('Cancel surfaces error message inline', async () => {
    const user = userEvent.setup();
    installMocks({ cancel: vi.fn().mockResolvedValue({ ok: false, error: 'no-session' }) });
    renderControls({ task_id: 't1', status: 'active' });
    await user.click(screen.getByTestId('task-controls-cancel'));
    const err = await screen.findByTestId('task-controls-error');
    expect(err.textContent).toContain('no-session');
  });

  test('onChanged is invoked after a successful pause', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    installMocks({ pause: vi.fn().mockResolvedValue({ ok: true }) });
    renderControls({ task_id: 't1', status: 'active' }, undefined, onChanged);
    await user.click(screen.getByTestId('task-controls-pause'));
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
  });

  test('surfaces pause error message inline', async () => {
    const user = userEvent.setup();
    installMocks({ pause: vi.fn().mockResolvedValue({ ok: false, error: 'disk-full' }) });
    renderControls({ task_id: 't1', status: 'active' });
    await user.click(screen.getByTestId('task-controls-pause'));
    const err = await screen.findByTestId('task-controls-error');
    expect(err.textContent).toContain('disk-full');
  });

  test('displays cumulative tokens when provided', () => {
    installMocks();
    renderControls({ task_id: 't1', status: 'active' }, { input: 123, output: 456 });
    expect(screen.getByTestId('task-controls-tokens').textContent).toMatch(/579/);
  });

  test('renders placeholder dash when totals are zero or absent', () => {
    installMocks();
    renderControls({ task_id: 't1', status: 'active' });
    expect(screen.getByTestId('task-controls-tokens').textContent).toBe('—');
  });
});

describe('resolveEffectiveStatus', () => {
  test('runtime non-inactive wins over meta', () => {
    expect(resolveEffectiveStatus('running', 'paused')).toBe('running');
    expect(resolveEffectiveStatus('paused', 'active')).toBe('paused');
    expect(resolveEffectiveStatus('completed', 'active')).toBe('completed');
    expect(resolveEffectiveStatus('failed', 'active')).toBe('failed');
  });

  test('runtime inactive maps meta status to runtime vocabulary', () => {
    expect(resolveEffectiveStatus('inactive', 'active')).toBe('running');
    expect(resolveEffectiveStatus('inactive', 'paused')).toBe('paused');
    expect(resolveEffectiveStatus('inactive', 'completed')).toBe('completed');
    expect(resolveEffectiveStatus('inactive', 'failed')).toBe('failed');
  });

  test('runtime inactive + missing meta status → inactive', () => {
    expect(resolveEffectiveStatus('inactive', undefined)).toBe('inactive');
  });
});
