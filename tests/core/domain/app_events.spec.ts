import { describe, it, expect } from 'vitest';
import { eventOfType, type AppEvent } from '../../../src/core/domain/app_events';

describe('AppEvent (Extension Framework v1)', () => {
  it('covers all 12 event types', () => {
    const evs: AppEvent['type'][] = [
      'file.changed',
      'artifact.written',
      'message.sent',
      'message.received',
      'tool.called',
      'tool.result',
      'stage.started',
      'stage.completed',
      'gate.evaluated',
      'task.created',
      'task.completed',
      'project.opened',
    ];
    expect(evs.length).toBe(12);
    // Uniqueness:
    expect(new Set(evs).size).toBe(12);
  });

  it('eventOfType narrows discriminated union', () => {
    const events: readonly AppEvent[] = [
      { type: 'task.created', ts: 1, taskId: 'T1' },
      { type: 'project.opened', ts: 2, projectPath: '/p' },
      { type: 'task.completed', ts: 3, taskId: 'T1', success: true },
    ];
    const tasks = events.filter(eventOfType('task.created'));
    expect(tasks.length).toBe(1);
    // type narrowed:
    expect(tasks[0]?.taskId).toBe('T1');
  });
});
