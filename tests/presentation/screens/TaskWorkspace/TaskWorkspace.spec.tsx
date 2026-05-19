// tests/presentation/screens/TaskWorkspace/TaskWorkspace.spec.tsx
// Plan 4.5 / Task 5 — typing indicator + per-turn cost/tokens footer.
// Plan 4.6 / Task 4 — cost moved to UI (settings-driven).
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { TaskWorkspace } from '../../../../src/presentation/screens/TaskWorkspace';
import { useTask } from '../../../../src/renderer/store/task';
import { useSettings } from '../../../../src/renderer/store/settings';
import { useProject } from '../../../../src/renderer/store/project';
import en from '../../../../src/renderer/locales/en.json';
import type { Task } from '../../../../src/core/domain/task';

if (!i18n.isInitialized) {
  void i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
}

type Mock = ReturnType<typeof vi.fn>;

const defaultCostTracking = {
  showCost: false,
  pricePerMillionInputTokens: 0,
  pricePerMillionOutputTokens: 0,
};

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    methodologyId: 'demo-meth',
    stageId: 'plan',
    status: 'created',
    thread: [],
    config: { autonomy: 'interactive', urgency: 'normal', importance: 'normal' },
    createdAt: '2026-05-12T00:00:00Z',
    updatedAt: '2026-05-12T00:00:00Z',
    totalTokens: { input: 0, output: 0 },
    ...overrides,
  };
}

beforeEach(() => {
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
  useProject.setState({
    current: { id: 'p1', name: 'proj', path: '/proj', lastOpenedAt: '2026-05-12T00:00:00Z' } as never,
    recent: [],
    busy: false,
    error: null,
  });
  useSettings.setState({
    user: {
      theme: 'auto',
      language: 'en',
      defaultAgentCli: 'claude-code',
      costTracking: defaultCostTracking,
      complianceOutputMode: 'file',
      showEventLog: false,
    },
    loaded: true,
  });
  (window as { sherpa?: unknown }).sherpa = {
    task: { startTurn: vi.fn(), onEvent: vi.fn().mockReturnValue(vi.fn()) },
    settings: {
      getUser: vi.fn(),
      setUser: vi.fn().mockResolvedValue(undefined),
      getProject: vi.fn(),
      setProject: vi.fn(),
    },
    trace: { read: vi.fn().mockResolvedValue([]) },
  };
});

function renderWorkspace() {
  return render(
    <I18nextProvider i18n={i18n}>
      <TaskWorkspace />
    </I18nextProvider>,
  );
}

describe('TaskWorkspace — typing indicator + usage footer', () => {
  test('shows WorkingIndicator (role=status) when sending=true', () => {
    // Plan 4.7 T3 — replaces the old "Agent is working…" text with a
    // spinner + live counter row. Component exposes role="status".
    useTask.setState({
      current: makeTask(),
      sending: true,
      running: { toolUses: 2, elapsedSec: 4, estTokens: 120, linesWritten: 0, lastToolName: null },
    });
    renderWorkspace();
    const indicator = screen.getByRole('status');
    expect(indicator).toBeInTheDocument();
    const text = (indicator.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toMatch(/2 tools/);
    expect(text).toMatch(/4s/);
    expect(text).toMatch(/≈\s*120 tokens/);
  });

  test('shows token counts but no cost when showCost=false (default)', () => {
    useTask.setState({
      current: makeTask({ totalTokens: { input: 10, output: 20 } }),
      sending: false,
    });
    renderWorkspace();

    // WorkingIndicator must NOT be present (sending=false)
    expect(screen.queryByRole('status')).toBeNull();

    // Footer must contain token counts
    const footer = screen.getByText(/Used/);
    expect(footer).toBeInTheDocument();
    expect(footer.textContent).toContain('10');
    expect(footer.textContent).toContain('20');
    // No cost shown (showCost=false)
    expect(footer.textContent).not.toContain('$');
  });

  test('shows cost in footer when showCost=true and prices > 0', () => {
    useSettings.setState({
      user: {
        theme: 'auto',
        language: 'en',
        defaultAgentCli: 'claude-code',
        costTracking: {
          showCost: true,
          pricePerMillionInputTokens: 3.0,
          pricePerMillionOutputTokens: 15.0,
        },
        complianceOutputMode: 'file',
        showEventLog: false,
      },
      loaded: true,
    });
    // input: 1000 * 3 / 1_000_000 = 0.003, output: 1000 * 15 / 1_000_000 = 0.015 => total 0.0180
    useTask.setState({
      current: makeTask({ totalTokens: { input: 1000, output: 1000 } }),
      sending: false,
    });
    renderWorkspace();

    const footer = screen.getByText(/Used/);
    expect(footer.textContent).toContain('$0.0180');
  });

  test('no cost shown when showCost=true but both prices are 0', () => {
    useSettings.setState({
      user: {
        theme: 'auto',
        language: 'en',
        defaultAgentCli: 'claude-code',
        costTracking: {
          showCost: true,
          pricePerMillionInputTokens: 0,
          pricePerMillionOutputTokens: 0,
        },
        complianceOutputMode: 'file',
        showEventLog: false,
      },
      loaded: true,
    });
    useTask.setState({
      current: makeTask({ totalTokens: { input: 10, output: 20 } }),
      sending: false,
    });
    renderWorkspace();

    const footer = screen.getByText(/Used/);
    expect(footer.textContent).not.toContain('$');
  });

  test('shows neither indicator nor footer when sending=false and totals are zero', () => {
    useTask.setState({
      current: makeTask({ totalTokens: { input: 0, output: 0 } }),
      sending: false,
    });
    renderWorkspace();

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/Used/)).toBeNull();
  });
});

describe('TaskWorkspace — engine event subscription (Plan 8-fix Task 3)', () => {
  test('subscribes to window.sherpa.task.onEvent on mount and unsubscribes on unmount', () => {
    const unsubscribe = vi.fn();
    const onEvent = vi.fn().mockReturnValue(unsubscribe);
    (window as { sherpa?: unknown }).sherpa = {
      task: { startTurn: vi.fn(), onEvent },
      settings: {
        getUser: vi.fn(),
        setUser: vi.fn().mockResolvedValue(undefined),
        getProject: vi.fn(),
        setProject: vi.fn(),
      },
      trace: { read: vi.fn().mockResolvedValue([]) },
    };
    useTask.setState({ current: makeTask(), sending: false });
    const { unmount } = renderWorkspace();

    // The store's sendUserMessage path doesn't run in this test, so the
    // ONLY onEvent subscriber should be the workspace effect.
    expect(onEvent).toHaveBeenCalledTimes(1);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('engine_event envelopes for the active task dispatch into the runtime store', () => {
    let handler: ((p: unknown) => void) | null = null;
    const onEvent = vi.fn().mockImplementation((h: (p: unknown) => void) => {
      handler = h;
      return vi.fn();
    });
    (window as { sherpa?: unknown }).sherpa = {
      task: { startTurn: vi.fn(), onEvent },
      settings: {
        getUser: vi.fn(),
        setUser: vi.fn().mockResolvedValue(undefined),
        getProject: vi.fn(),
        setProject: vi.fn(),
      },
      trace: { read: vi.fn().mockResolvedValue([]) },
    };
    useTask.setState({ current: makeTask({ id: 'task-1' }), sending: false });
    renderWorkspace();

    expect(handler).not.toBeNull();
    handler!({
      taskId: 'task-1',
      kind: 'engine_event',
      event: { kind: 'stage_entered', stageId: 'plan', ts: 't', prompt_excerpt: '' },
    });
    expect(useTask.getState().runtime.currentStageId).toBe('plan');
    expect(useTask.getState().runtime.status).toBe('running');
  });

  test('engine_event envelopes for OTHER tasks are ignored', () => {
    let handler: ((p: unknown) => void) | null = null;
    const onEvent = vi.fn().mockImplementation((h: (p: unknown) => void) => {
      handler = h;
      return vi.fn();
    });
    (window as { sherpa?: unknown }).sherpa = {
      task: { startTurn: vi.fn(), onEvent },
      settings: {
        getUser: vi.fn(),
        setUser: vi.fn().mockResolvedValue(undefined),
        getProject: vi.fn(),
        setProject: vi.fn(),
      },
      trace: { read: vi.fn().mockResolvedValue([]) },
    };
    useTask.setState({ current: makeTask({ id: 'task-1' }), sending: false });
    renderWorkspace();

    handler!({
      taskId: 'task-other',
      kind: 'engine_event',
      event: { kind: 'stage_entered', stageId: 'foreign', ts: 't', prompt_excerpt: '' },
    });
    expect(useTask.getState().runtime.currentStageId).toBeNull();
  });
});

describe('TaskWorkspace — Resume banner (Plan 8-fix Task 4)', () => {
  function installSherpaWithMeta(metaStatus: 'active' | 'paused', currentStage = 'plan') {
    (window as { sherpa?: unknown }).sherpa = {
      task: {
        startTurn: vi.fn(),
        onEvent: vi.fn().mockReturnValue(vi.fn()),
        metaGet: vi.fn().mockResolvedValue({
          task_id: 'task-1',
          status: metaStatus,
          current_stage: currentStage,
        }),
        pause: vi.fn(),
        resume: vi.fn().mockResolvedValue({ ok: true }),
        cancel: vi.fn(),
        artifactsList: vi.fn().mockResolvedValue([]),
        complianceReview: vi.fn(),
      },
      settings: {
        getUser: vi.fn(),
        setUser: vi.fn().mockResolvedValue(undefined),
        getProject: vi.fn(),
        setProject: vi.fn(),
      },
      methodology: { load: vi.fn().mockResolvedValue({ ok: false }) },
      trace: { read: vi.fn().mockResolvedValue([]) },
    };
  }

  test('renders resume banner when meta=paused AND runtime=inactive', async () => {
    installSherpaWithMeta('paused', 'plan');
    useTask.setState({ current: makeTask(), sending: false });
    renderWorkspace();
    const banner = await screen.findByTestId('resume-banner');
    expect(banner).toBeInTheDocument();
    expect(screen.getByTestId('resume-banner-text').textContent).toContain('plan');
  });

  test('does NOT render banner when runtime is running (live engine attached)', async () => {
    installSherpaWithMeta('paused', 'plan');
    useTask.setState({
      current: makeTask(),
      sending: false,
      runtime: {
        currentStageId: 'plan',
        completedStages: [],
        rolledBackFrom: {},
        gateVerdicts: {},
        artifacts: [],
        status: 'running',
      },
    });
    renderWorkspace();
    // Allow the meta poll to resolve.
    await waitFor(() => {
      expect((window.sherpa as unknown as { task: { metaGet: Mock } }).task.metaGet).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('resume-banner')).toBeNull();
  });

  test('does NOT render banner when meta is active', async () => {
    installSherpaWithMeta('active', 'plan');
    useTask.setState({ current: makeTask(), sending: false });
    renderWorkspace();
    await waitFor(() => {
      expect((window.sherpa as unknown as { task: { metaGet: Mock } }).task.metaGet).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('resume-banner')).toBeNull();
  });

  test('clicking the banner Resume button invokes window.sherpa.task.resume', async () => {
    const user = userEvent.setup();
    installSherpaWithMeta('paused', 'plan');
    useTask.setState({ current: makeTask(), sending: false });
    renderWorkspace();
    const button = await screen.findByTestId('resume-banner-button');
    await user.click(button);
    await waitFor(() => {
      expect(
        (window.sherpa as unknown as { task: { resume: Mock } }).task.resume,
      ).toHaveBeenCalledWith({ projectPath: '/proj', taskId: 'task-1' });
    });
  });
});

describe('TaskWorkspace — Chat/Journal tab toggle (Plan 8b Task 4)', () => {
  test('renders Chat and Transparency tabs by default (showEventLog=false)', () => {
    useTask.setState({ current: makeTask(), sending: false });
    renderWorkspace();
    // Chat and Transparency tabs are always visible; Event log is gated behind showEventLog.
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Transparency' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Event log' })).toBeNull();
  });

  test('journal tab is visible when showEventLog=true', () => {
    useSettings.setState({
      user: {
        theme: 'auto',
        language: 'en',
        defaultAgentCli: 'claude-code',
        costTracking: defaultCostTracking,
        complianceOutputMode: 'file',
        showEventLog: true,
      },
      loaded: true,
    });
    useTask.setState({ current: makeTask(), sending: false });
    renderWorkspace();
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Event log' })).toBeInTheDocument();
  });

  test('clicking Event log tab mounts TracePanel and calls trace.read when showEventLog=true', async () => {
    const user = userEvent.setup();
    const readMock = vi.fn().mockResolvedValue([]);
    (window as { sherpa?: unknown }).sherpa = {
      task: { startTurn: vi.fn(), onEvent: vi.fn().mockReturnValue(vi.fn()) },
      settings: {
        getUser: vi.fn(),
        setUser: vi.fn().mockResolvedValue(undefined),
        getProject: vi.fn(),
        setProject: vi.fn(),
      },
      trace: { read: readMock },
    };
    useSettings.setState({
      user: {
        theme: 'auto',
        language: 'en',
        defaultAgentCli: 'claude-code',
        costTracking: defaultCostTracking,
        complianceOutputMode: 'file',
        showEventLog: true,
      },
      loaded: true,
    });
    useTask.setState({ current: makeTask(), sending: false });
    renderWorkspace();
    await user.click(screen.getByRole('tab', { name: 'Event log' }));
    expect(screen.getByRole('tab', { name: 'Event log' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('trace-panel')).toBeInTheDocument();
    await waitFor(() => {
      expect(readMock).toHaveBeenCalledWith({ projectPath: '/proj', taskId: 'task-1' });
    });
  });

  test('switching back to Chat unmounts TracePanel', async () => {
    const user = userEvent.setup();
    useSettings.setState({
      user: {
        theme: 'auto',
        language: 'en',
        defaultAgentCli: 'claude-code',
        costTracking: defaultCostTracking,
        complianceOutputMode: 'file',
        showEventLog: true,
      },
      loaded: true,
    });
    useTask.setState({ current: makeTask(), sending: false });
    renderWorkspace();
    await user.click(screen.getByRole('tab', { name: 'Event log' }));
    expect(screen.getByTestId('trace-panel')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(screen.queryByTestId('trace-panel')).toBeNull();
  });
});
