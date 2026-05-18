import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { useProject } from '../../../src/renderer/store/project';
import { useTask } from '../../../src/renderer/store/task';
import { useNavigation } from '../../../src/renderer/store/navigation';
import type { Task } from '../../../src/core/domain/task';
import en from '../../../src/renderer/locales/en.json';

i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    status: 'created',
    thread: [],
    config: { autonomy: 'interactive', urgency: 'normal', importance: 'normal' },
    createdAt: '2026-05-12T00:00:00Z',
    updatedAt: '2026-05-12T00:00:00Z',
    totalTokens: { input: 0, output: 0 },
    ...overrides,
  };
}

const MOCK_PROJECT = { id: 'p1', name: 'Test Project', path: '/test/proj', addedAt: 'now' };

// Stable mock list — tests mutate this array before rendering.
let taskList: Task[] = [];

vi.mock('../../../src/renderer/ipc/client', () => ({
  ipcClient: {
    task: () => ({
      list: vi.fn().mockImplementation(() => Promise.resolve(taskList)),
      delete: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

beforeEach(() => {
  taskList = [];
  useProject.setState({ current: MOCK_PROJECT, recent: [], busy: false, error: null });
  useTask.setState({ current: null } as never);
  useNavigation.setState({ tabs: [], activeTabId: null } as never);

  (window as { sherpa?: unknown }).sherpa = {
    project: {} as never,
    settings: {} as never,
    methodology: {} as never,
    shell: {} as never,
    files: {} as never,
    task: {
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
  };
});

// Import after mocks are established
const { TasksPanel } = await import('../../../src/presentation/sidebar/TasksPanel');

describe('TasksPanel — stage label', () => {
  it('shows methodology stage label when task has methodologyId and stageId', async () => {
    taskList = [makeTask({ title: 'My Task', methodologyId: 'feature-dev', stageId: 'implement' })];

    renderWithI18n(<TasksPanel />);

    await screen.findByText('My Task');

    expect(screen.getByTestId('stage-label')).toBeInTheDocument();
    expect(screen.getByText('implement')).toBeInTheDocument();
  });

  it('shows no stage label when task has no methodologyId', async () => {
    taskList = [makeTask({ title: 'Plain Task' })];

    renderWithI18n(<TasksPanel />);

    await screen.findByText('Plain Task');

    expect(screen.queryByTestId('stage-label')).toBeNull();
  });
});
