import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { TaskWorkspace } from '../../../src/presentation/screens/TaskWorkspace';
import { useTask } from '../../../src/renderer/store/task';
import { useProject } from '../../../src/renderer/store/project';
import type { Task } from '../../../src/core/domain/task';
import type { AgentMessage } from '../../../src/core/domain/agent';
import en from '../../../src/renderer/locales/en.json';

if (!i18n.isInitialized) {
  void i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
}

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
  });
  useProject.setState({
    current: { id: 'p1', name: 'proj', path: '/proj', lastOpenedAt: '2026-05-12T00:00:00Z' } as never,
    recent: [],
    busy: false,
    error: null,
  });
  (window as { sherpa?: unknown }).sherpa = {
    task: {
      startTurn: vi.fn().mockResolvedValue({ ok: true }),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
  };
});

function renderWorkspace() {
  return render(
    <I18nextProvider i18n={i18n}>
      <TaskWorkspace />
    </I18nextProvider>,
  );
}

describe('TaskWorkspace', () => {
  test('shows empty hint when no current task', () => {
    renderWorkspace();
    expect(screen.getByText('No task selected.')).toBeInTheDocument();
  });

  test('renders header and empty-thread hint when task has no messages', () => {
    useTask.setState({ current: makeTask() });
    renderWorkspace();
    expect(screen.getByText('demo-meth — stage plan')).toBeInTheDocument();
    expect(screen.getByText('created')).toBeInTheDocument();
    expect(screen.getByText('Type a message below to start.')).toBeInTheDocument();
  });

  test('renders user / agent / tool / system messages with correct attributes', () => {
    const messages: AgentMessage[] = [
      { id: 'm-user', role: 'user', text: 'hello', timestamp: '2026-05-12T00:00:00Z' },
      { id: 'm-agent', role: 'agent', text: 'hi back', timestamp: '2026-05-12T00:00:01Z' },
      {
        id: 'm-tool',
        role: 'tool',
        text: '',
        timestamp: '2026-05-12T00:00:02Z',
        toolCall: {
          name: 'Read',
          args: { path: '/x/y.txt' },
          result: 'file content',
          status: 'success',
        },
      },
      { id: 'm-sys', role: 'system', text: 'привет', timestamp: '2026-05-12T00:00:03Z' },
    ];
    useTask.setState({ current: makeTask({ thread: messages }) });
    const { container } = renderWorkspace();

    expect(container.querySelector('[data-role="user"]')).not.toBeNull();
    expect(container.querySelector('[data-role="agent"]')).not.toBeNull();
    expect(container.querySelector('[data-role="system"]')).not.toBeNull();
    expect(container.querySelector('[data-status="success"]')).not.toBeNull();

    expect(screen.getByText('hello')).toBeInTheDocument();
    // v0.21.2 — translation collapse removed; agent messages shown directly.
    expect(screen.getByText('hi back')).toBeInTheDocument();
    expect(screen.queryByText('Show English')).not.toBeInTheDocument();
    expect(screen.getByText('привет')).toBeInTheDocument();
    expect(screen.getByText(/Read.*\/x\/y\.txt/)).toBeInTheDocument();
    // result is collapsed by default — not visible without expanding
  });

  test('typing + clicking Send invokes startTurn with project path and trimmed text', async () => {
    const startTurn = vi.fn().mockResolvedValue({ ok: true });
    (window.sherpa.task as unknown as { startTurn: typeof startTurn }).startTurn = startTurn;
    useTask.setState({ current: makeTask() });

    renderWorkspace();
    const textarea = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(textarea, { target: { value: '  hello world  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(startTurn).toHaveBeenCalledWith({
        taskId: 'task-1',
        projectPath: '/proj',
        userMessage: 'hello world',
      });
    });
  });

  test('ChatInput is disabled while sending=true', () => {
    useTask.setState({ current: makeTask(), sending: true });
    renderWorkspace();
    const textarea = screen.getByPlaceholderText(/Type a message/) as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    const sendButton = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);
  });
});
