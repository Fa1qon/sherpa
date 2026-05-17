import { describe, test, expect } from 'vitest';
import { TaskService } from '../../../src/main/services/task_service';

describe('TaskService', () => {
  test('createTask returns task with defaults', () => {
    const svc = new TaskService();
    const task = svc.createTask({ methodologyId: 'm', stageId: 's' });
    expect(task.methodologyId).toBe('m');
    expect(task.stageId).toBe('s');
    expect(task.status).toBe('created');
    expect(task.thread).toEqual([]);
    expect(task.config.autonomy).toBe('interactive');
    expect(task.id).toMatch(/^SHERPA-\d+$/);
    expect(task.totalTokens).toEqual({ input: 0, output: 0 });
  });

  test('createTask config override merges with defaults', () => {
    const svc = new TaskService();
    const task = svc.createTask({ methodologyId: 'm', stageId: 's', config: { urgency: 'high' } });
    expect(task.config.urgency).toBe('high');
    expect(task.config.autonomy).toBe('interactive');  // default preserved
  });

  test('getTask returns null for unknown id', () => {
    expect(new TaskService().getTask('nope')).toBeNull();
  });

  test('getTask returns the same task by id', () => {
    const svc = new TaskService();
    const a = svc.createTask({ methodologyId: 'm', stageId: 's' });
    expect(svc.getTask(a.id)?.id).toBe(a.id);
  });

  test('appendMessages adds messages and bumps updatedAt', async () => {
    const svc = new TaskService();
    const a = svc.createTask({ methodologyId: 'm', stageId: 's' });
    await new Promise((r) => setTimeout(r, 5));
    const updated = svc.appendMessages(a.id, [
      { id: '1', role: 'user', text: 'hi', timestamp: '2026-05-12T00:00:00Z' },
    ]);
    expect(updated).not.toBeNull();
    expect(updated!.thread).toHaveLength(1);
    expect(updated!.updatedAt).not.toBe(a.updatedAt);
  });

  test('appendMessages returns null for unknown id', () => {
    expect(new TaskService().appendMessages('nope', [])).toBeNull();
  });

  test('listTasks returns all tasks', () => {
    const svc = new TaskService();
    svc.createTask({ methodologyId: 'a', stageId: 's' });
    svc.createTask({ methodologyId: 'b', stageId: 's' });
    expect(svc.listTasks()).toHaveLength(2);
  });

  test('recordTurn accumulates tokens across calls', () => {
    const svc = new TaskService();
    const task = svc.createTask({ methodologyId: 'm', stageId: 's' });

    const r1 = svc.recordTurn(task.id, { input: 10, output: 5 });
    expect(r1).not.toBeNull();
    expect(r1!.totalTokens).toEqual({ input: 10, output: 5 });

    const r2 = svc.recordTurn(task.id, { input: 20, output: 15 });
    expect(r2!.totalTokens).toEqual({ input: 30, output: 20 });
  });

  test('recordTurn treats null tokens as 0', () => {
    const svc = new TaskService();
    const task = svc.createTask({ methodologyId: 'm', stageId: 's' });

    const r = svc.recordTurn(task.id, null);
    expect(r).not.toBeNull();
    expect(r!.totalTokens).toEqual({ input: 0, output: 0 });
  });

  test('recordTurn returns null for unknown id', () => {
    const svc = new TaskService();
    expect(svc.recordTurn('does-not-exist', { input: 1, output: 1 })).toBeNull();
  });

  test('recordTurn bumps updatedAt', async () => {
    const svc = new TaskService();
    const task = svc.createTask({ methodologyId: 'm', stageId: 's' });
    await new Promise((r) => setTimeout(r, 5));
    const updated = svc.recordTurn(task.id, { input: 1, output: 1 });
    expect(updated!.updatedAt).not.toBe(task.updatedAt);
  });
});
