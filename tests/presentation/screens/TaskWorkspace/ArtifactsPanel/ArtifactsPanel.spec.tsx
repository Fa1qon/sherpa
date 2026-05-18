// tests/presentation/screens/TaskWorkspace/ArtifactsPanel/ArtifactsPanel.spec.tsx
// Plan 8 Task 19 — Artifacts panel.
// Plan 8-fix Task 3 — additional test: refresh fires on artifact_written
// engine event (driven by useTask().runtime.artifacts.length).
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { ArtifactsPanel } from '../../../../../src/presentation/screens/TaskWorkspace/ArtifactsPanel';
import { useTask } from '../../../../../src/renderer/store/task';
import { useNavigation } from '../../../../../src/renderer/store/navigation';
import en from '../../../../../src/renderer/locales/en.json';

if (!i18n.isInitialized) {
  void i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
}

type ListMock = ReturnType<typeof vi.fn>;
type ReadMock = ReturnType<typeof vi.fn>;

function installMocks(opts: { list?: ListMock; read?: ReadMock } = {}): {
  list: ListMock;
  read: ReadMock;
} {
  const list = opts.list ?? vi.fn().mockResolvedValue([]);
  const read = opts.read ?? vi.fn().mockResolvedValue({ ok: true, content: '' });
  (window as { sherpa?: unknown }).sherpa = {
    task: {
      artifactsList: list,
      artifactRead: read,
    },
  };
  return { list, read };
}

function renderPanel(pollMs: number = 0) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ArtifactsPanel projectPath="/proj" taskId="task-1" pollMs={pollMs} />
    </I18nextProvider>,
  );
}

let openTabMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  (window as { sherpa?: unknown }).sherpa = undefined;
  openTabMock = vi.fn().mockReturnValue('tab-id');
  useNavigation.setState({ openTab: openTabMock } as never);
  // Reset runtime so the runtime-driven refresh effect doesn't carry
  // state between tests.
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

describe('ArtifactsPanel', () => {
  test('renders empty placeholder when no files', async () => {
    installMocks();
    renderPanel();
    expect(await screen.findByTestId('artifacts-empty')).toBeInTheDocument();
  });

  test('renders one row per file returned by artifactsList', async () => {
    installMocks({
      list: vi.fn().mockResolvedValue(['requirements.md', 'research.md', 'chat_01/plan.md']),
    });
    renderPanel();
    expect(await screen.findByTestId('artifact-row-requirements.md')).toBeInTheDocument();
    expect(screen.getByTestId('artifact-row-research.md')).toBeInTheDocument();
    expect(screen.getByTestId('artifact-row-chat_01/plan.md')).toBeInTheDocument();
  });

  test('clicking a row opens the file in a new tab', async () => {
    const user = userEvent.setup();
    installMocks({ list: vi.fn().mockResolvedValue(['requirements.md']) });
    renderPanel();
    const row = await screen.findByTestId('artifact-row-requirements.md');
    await user.click(row);
    expect(openTabMock).toHaveBeenCalledWith({
      kind: 'file',
      params: { relPath: '.sherpa/tasks/task-1/requirements.md' },
      title: 'requirements.md',
    });
  });

  test('refresh button calls artifactsList again', async () => {
    const user = userEvent.setup();
    const { list } = installMocks({
      list: vi.fn().mockResolvedValue(['requirements.md']),
    });
    renderPanel();
    await screen.findByTestId('artifact-row-requirements.md');
    const initialCalls = list.mock.calls.length;
    await user.click(screen.getByTestId('artifacts-refresh-btn'));
    await waitFor(() => {
      expect(list.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });

  test('clicking a nested artifact builds the correct tab relPath', async () => {
    const user = userEvent.setup();
    installMocks({ list: vi.fn().mockResolvedValue(['chat_01/plan.md']) });
    renderPanel();
    await user.click(await screen.findByTestId('artifact-row-chat_01/plan.md'));
    expect(openTabMock).toHaveBeenCalledWith({
      kind: 'file',
      params: { relPath: '.sherpa/tasks/task-1/chat_01/plan.md' },
      title: 'plan.md',
    });
  });

  // ── Plan 8-fix Task 3 — runtime-driven refresh ────────────────────────────

  test('refreshes artifacts list when an artifact_written engine event arrives', async () => {
    const { list } = installMocks({
      list: vi.fn().mockResolvedValue(['a.md']),
    });
    renderPanel();
    await screen.findByTestId('artifact-row-a.md');
    const initialCalls = list.mock.calls.length;

    // Simulate an `artifact_written` engine event landing in the runtime.
    act(() => {
      useTask.getState().applyEngineEvent({
        kind: 'artifact_written', path: 'b.md', bytes: 10, ts: '2026-05-12T00:00:00Z',
      });
    });

    await waitFor(() => {
      expect(list.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });

  test('each click opens a new tab (openTab called once per click)', async () => {
    const user = userEvent.setup();
    installMocks({ list: vi.fn().mockResolvedValue(['a.md', 'b.md']) });
    renderPanel();
    await user.click(await screen.findByTestId('artifact-row-a.md'));
    await user.click(screen.getByTestId('artifact-row-b.md'));
    expect(openTabMock).toHaveBeenCalledTimes(2);
  });
});
