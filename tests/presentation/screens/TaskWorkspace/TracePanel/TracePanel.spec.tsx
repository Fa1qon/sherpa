// tests/presentation/screens/TaskWorkspace/TracePanel/TracePanel.spec.tsx
// Plan 8 Task 17 — Trace viewer panel.
// Plan 8b Task 4 — explainer header added.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import {
  TracePanel,
  computeStageTimings,
  type TraceEventLike,
} from '../../../../../src/presentation/screens/TaskWorkspace/TracePanel';
import en from '../../../../../src/renderer/locales/en.json';

if (!i18n.isInitialized) {
  void i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
}

const mockEvents: readonly TraceEventLike[] = [
  { kind: 'task_started', methodologyId: 'demo', taskId: 't1', ts: '2026-05-12T10:00:00.000Z' },
  { kind: 'stage_entered', stageId: 'plan', ts: '2026-05-12T10:00:01.000Z', prompt_excerpt: 'plan stage prompt' },
  { kind: 'tool_call', stageId: 'plan', name: 'Read', args_excerpt: '{"path":"foo.ts"}', ts: '2026-05-12T10:00:02.000Z' },
  { kind: 'tool_result', stageId: 'plan', name: 'Read', status: 'success', result_excerpt: 'file contents', ts: '2026-05-12T10:00:03.000Z' },
  { kind: 'stage_completed', stageId: 'plan', ts: '2026-05-12T10:00:05.000Z' },
  { kind: 'stage_entered', stageId: 'build', ts: '2026-05-12T10:00:06.000Z', prompt_excerpt: 'build prompt' },
  { kind: 'tool_call', stageId: 'build', name: 'Bash', args_excerpt: 'npm test', ts: '2026-05-12T10:00:07.000Z' },
  { kind: 'stage_completed', stageId: 'build', ts: '2026-05-12T10:00:10.000Z' },
  { kind: 'task_completed', ts: '2026-05-12T10:00:11.000Z' },
];

function renderPanel(events: readonly TraceEventLike[] = mockEvents) {
  (window as { sherpa?: unknown }).sherpa = {
    trace: {
      read: vi.fn().mockResolvedValue(events),
    },
  };
  return render(
    <I18nextProvider i18n={i18n}>
      <TracePanel projectPath="/proj" taskId="task-1" />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  // reset window.sherpa each test via renderPanel.
});

describe('TracePanel', () => {
  test('renders explainer header with title and description', async () => {
    renderPanel();
    // Header renders immediately (no await needed — it's static).
    expect(screen.getByText('Event log')).toBeInTheDocument();
    expect(screen.getByText(/Engine event log/i)).toBeInTheDocument();
  });

  test('loads events on mount and renders all rows', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getAllByText(/stage_entered|tool_call|task_started/).length).toBeGreaterThan(0);
    });
    // All 9 events should be present in the list.
    const rows = screen.getAllByRole('button', { expanded: false }).filter((b) =>
      b.getAttribute('aria-label')?.includes('Expand'),
    );
    // 9 collapsed event rows (refresh + filter buttons excluded).
    expect(rows.length).toBe(9);
  });

  test('renders newest event first (reverse chrono)', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getAllByRole('button', { expanded: false }).length).toBeGreaterThan(0);
    });
    const rows = screen.getAllByRole('button', { expanded: false }).filter((b) =>
      b.getAttribute('aria-label')?.includes('Expand'),
    );
    expect(rows[0].textContent).toContain('task_completed');
  });

  test('kind filter narrows list to selected kind', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('kind-filter-tool_call')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('kind-filter-tool_call'));
    const rows = screen.getAllByRole('button', { expanded: false }).filter((b) =>
      b.getAttribute('aria-label')?.includes('Expand'),
    );
    expect(rows.length).toBe(2); // two tool_call events
    for (const row of rows) {
      expect(row.textContent).toContain('tool_call');
    }
  });

  test('multiple kind filters are additive (OR)', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('kind-filter-tool_call')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('kind-filter-tool_call'));
    await user.click(screen.getByTestId('kind-filter-stage_entered'));
    const rows = screen.getAllByRole('button', { expanded: false }).filter((b) =>
      b.getAttribute('aria-label')?.includes('Expand'),
    );
    expect(rows.length).toBe(4); // 2 tool_call + 2 stage_entered
  });

  test('search box narrows further by JSON substring', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('kind-filter-tool_call')).toBeInTheDocument();
    });
    const searchBox = screen.getByPlaceholderText(/Search stage or tool/i);
    await user.type(searchBox, 'Bash');
    const rows = screen.getAllByRole('button', { expanded: false }).filter((b) =>
      b.getAttribute('aria-label')?.includes('Expand'),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Bash');
  });

  test('clicking an event row expands its JSON detail', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => {
      expect(screen.getAllByRole('button', { expanded: false }).length).toBeGreaterThan(0);
    });
    const rows = screen.getAllByRole('button', { expanded: false }).filter((b) =>
      b.getAttribute('aria-label')?.includes('Expand'),
    );
    await user.click(rows[0]); // newest = task_completed
    // Detail <pre> should now be present.
    const pre = await screen.findByText(/"kind": "task_completed"/);
    expect(pre).toBeInTheDocument();
  });

  test('timing summary table shows per-stage durations', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('timing-row-plan')).toBeInTheDocument();
    });
    const planRow = screen.getByTestId('timing-row-plan');
    // plan: 10:00:01 -> 10:00:05 = 4000 ms
    expect(within(planRow).getByText(/4000\s*ms/)).toBeInTheDocument();
    const buildRow = screen.getByTestId('timing-row-build');
    // build: 10:00:06 -> 10:00:10 = 4000 ms
    expect(within(buildRow).getByText(/4000\s*ms/)).toBeInTheDocument();
  });

  test('shows empty state when there are no events', async () => {
    renderPanel([]);
    expect(await screen.findByText(/No trace events yet/i)).toBeInTheDocument();
  });

  test('refresh button re-invokes the IPC bridge', async () => {
    const user = userEvent.setup();
    const readMock = vi.fn().mockResolvedValue(mockEvents);
    (window as { sherpa?: unknown }).sherpa = { trace: { read: readMock } };
    render(
      <I18nextProvider i18n={i18n}>
        <TracePanel projectPath="/proj" taskId="task-1" />
      </I18nextProvider>,
    );
    await waitFor(() => expect(readMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: /Refresh/i }));
    await waitFor(() => expect(readMock).toHaveBeenCalledTimes(2));
  });
});

describe('computeStageTimings', () => {
  test('computes duration_ms from stage_entered to stage_completed', () => {
    const r = computeStageTimings(mockEvents);
    const plan = r.find((s) => s.stageId === 'plan');
    expect(plan?.durationMs).toBe(4000);
    const build = r.find((s) => s.stageId === 'build');
    expect(build?.durationMs).toBe(4000);
  });

  test('skips stages without an end event', () => {
    const events: TraceEventLike[] = [
      { kind: 'stage_entered', stageId: 'orphan', ts: '2026-05-12T10:00:00.000Z' },
    ];
    expect(computeStageTimings(events)).toEqual([]);
  });

  test('uses latest end event (e.g. gate_evaluated after stage_completed)', () => {
    const events: TraceEventLike[] = [
      { kind: 'stage_entered', stageId: 's', ts: '2026-05-12T10:00:00.000Z' },
      { kind: 'stage_completed', stageId: 's', ts: '2026-05-12T10:00:05.000Z' },
      { kind: 'gate_evaluated', stageId: 's', ts: '2026-05-12T10:00:08.000Z', evaluation: {} as never },
    ];
    const r = computeStageTimings(events);
    expect(r[0].durationMs).toBe(8000);
  });
});
