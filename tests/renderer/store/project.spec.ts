import { describe, test, expect, vi, beforeEach } from 'vitest';
import { useProject } from '../../../src/renderer/store/project';
import { useTask } from '../../../src/renderer/store/task';

const mockProject = {
  id: 'p1',
  name: 'p',
  path: '/p',
  addedAt: 'now',
  lastOpenedAt: 'now',
};

beforeEach(() => {
  (window as { sherpa?: unknown }).sherpa = {
    project: {
      listRecent: vi.fn().mockResolvedValue([mockProject]),
      add: vi.fn().mockResolvedValue({ ok: true, project: mockProject }),
      open: vi.fn().mockResolvedValue(mockProject),
      removeFromRecent: vi.fn().mockResolvedValue(true),
      pickFolder: vi.fn().mockResolvedValue('/picked'),
    },
    settings: {} as never,
    session: {
      get: vi.fn().mockResolvedValue({ activeTaskId: null }),
      set: vi.fn().mockResolvedValue(undefined),
    },
    task: {
      get: vi.fn().mockResolvedValue(null),
    },
  };
  useProject.setState({
    current: null,
    recent: [],
    busy: false,
    error: null,
  });
  useTask.getState().setCurrent(null);
});

describe('useProject', () => {
  test('refreshRecent populates recent list', async () => {
    await useProject.getState().refreshRecent();
    expect(useProject.getState().recent).toHaveLength(1);
  });

  test('addAndOpen sets current + recent', async () => {
    const result = await useProject.getState().addAndOpen({ path: '/p' });
    expect(result.ok).toBe(true);
    expect(useProject.getState().current).toEqual(mockProject);
    expect(useProject.getState().recent).toHaveLength(1);
  });

  test('addAndOpen sets error on failure', async () => {
    (window.sherpa.project.add as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      error: { kind: 'path-not-found' },
    });
    const result = await useProject.getState().addAndOpen({ path: '/missing' });
    expect(result.ok).toBe(false);
    expect(useProject.getState().error).toMatch(/Path does not exist/);
  });

  test('closeProject clears current', () => {
    useProject.setState({ current: mockProject });
    useProject.getState().closeProject();
    expect(useProject.getState().current).toBeNull();
  });
});

describe('useProject.openById — session restore', () => {
  test('restores active task when session has activeTaskId', async () => {
    const fakeTask = {
      id: 'task-abc',
      title: 'T',
      thread: [],
      status: 'active',
      created_at: '',
      updated_at: '',
    };
    (window.sherpa.session.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ activeTaskId: 'task-abc' });
    (window.sherpa.task.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeTask);

    await useProject.getState().openById('p1');

    expect(window.sherpa.session.get).toHaveBeenCalledWith('/p');
    expect(window.sherpa.task.get).toHaveBeenCalledWith('task-abc');
    expect(useTask.getState().current?.id).toBe('task-abc');
  });

  test('does not restore when session has null activeTaskId', async () => {
    await useProject.getState().openById('p1');

    expect(window.sherpa.task.get).not.toHaveBeenCalled();
    expect(useTask.getState().current).toBeNull();
  });

  test('does not crash when session restore task is not found', async () => {
    (window.sherpa.session.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ activeTaskId: 'task-gone' });
    (window.sherpa.task.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await useProject.getState().openById('p1');

    expect(useTask.getState().current).toBeNull();
    expect(useProject.getState().error).toBeNull();
  });
});
