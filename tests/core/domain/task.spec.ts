import { describe, test, expect } from 'vitest';
import { defaultTaskConfig, type Task } from '../../../src/core/domain/task';
import { TaskService } from '../../../src/main/services/task_service';

describe('task domain', () => {
  test('defaults are sensible', () => {
    const c = defaultTaskConfig();
    expect(c.autonomy).toBe('interactive');
    expect(c.urgency).toBe('normal');
    expect(c.importance).toBe('normal');
  });

  test('Task type includes optional strictness_mode', () => {
    // Type-level check: a Task literal compiles with strictness_mode set.
    const t: Task = {
      id: 'x',
      methodologyId: 'm',
      stageId: 's',
      status: 'created',
      thread: [],
      config: defaultTaskConfig(),
      createdAt: '2026-05-12T00:00:00.000Z',
      updatedAt: '2026-05-12T00:00:00.000Z',
      totalTokens: { input: 0, output: 0 },
      strictness_mode: 'autonomous',
    };
    expect(t.strictness_mode).toBe('autonomous');
  });

  test("TaskService.createTask sets strictness_mode='standard' by default", () => {
    const svc = new TaskService();
    const t = svc.createTask({ methodologyId: 'm', stageId: 's' });
    expect(t.strictness_mode).toBe('standard');
  });
});
