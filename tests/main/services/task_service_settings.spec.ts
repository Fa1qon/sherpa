// tests/main/services/task_service_settings.spec.ts
// Plan 8b Task 7 — applySettings + lockSettings.

import { describe, test, expect } from 'vitest';
import { TaskService } from '../../../src/main/services/task_service';

describe('TaskService — Plan 8b Task 7 extensions', () => {
  test('createTask without methodology defaults to free-chat mode', () => {
    const svc = new TaskService();
    const task = svc.createTask({ title: 'Just chat' });
    expect(task.title).toBe('Just chat');
    expect(task.methodologyId).toBeUndefined();
    expect(task.stageId).toBeUndefined();
    expect(task.methodology_selection_mode).toBe('none');
    expect(task.effort).toBe('normal');
    expect(task.response_mode).toBe('detailed');
    expect(task.economy_mode).toBe('unlimited');
    expect(task.settings_locked).toBe(false);
  });

  test('createTask with methodologyId defaults selection_mode to manual', () => {
    const svc = new TaskService();
    const task = svc.createTask({
      title: 't',
      methodologyId: 'm1',
      stageId: 's1',
    });
    expect(task.methodology_selection_mode).toBe('manual');
    expect(task.methodologyId).toBe('m1');
  });

  test('createTask respects explicit selection_mode override', () => {
    const svc = new TaskService();
    const task = svc.createTask({
      title: 't',
      methodologyId: 'm1',
      stageId: 's1',
      methodology_selection_mode: 'router',
    });
    expect(task.methodology_selection_mode).toBe('router');
  });

  test('applySettings updates only provided fields', () => {
    const svc = new TaskService();
    const task = svc.createTask({ title: 't' });
    const next = svc.applySettings(task.id, {
      effort: 'thorough',
      response_mode: 'concise',
    });
    expect(next).not.toBeNull();
    expect(next!.effort).toBe('thorough');
    expect(next!.response_mode).toBe('concise');
    // Untouched fields remain.
    expect(next!.economy_mode).toBe('unlimited');
    expect(next!.compliance_review_enabled).toBe(false);
    expect(next!.title).toBe('t');
  });

  test('applySettings can set methodologyId and selection_mode', () => {
    const svc = new TaskService();
    const task = svc.createTask({ title: 't' });
    const next = svc.applySettings(task.id, {
      methodology_selection_mode: 'manual',
      methodologyId: 'm-x',
      stageId: 's1',
    });
    expect(next).not.toBeNull();
    expect(next!.methodology_selection_mode).toBe('manual');
    expect(next!.methodologyId).toBe('m-x');
    expect(next!.stageId).toBe('s1');
  });

  test('applySettings returns null for unknown id', () => {
    const svc = new TaskService();
    expect(svc.applySettings('nope', { effort: 'fast' })).toBeNull();
  });

  test('lockSettings flips settings_locked to true', () => {
    const svc = new TaskService();
    const task = svc.createTask({ title: 't' });
    expect(task.settings_locked).toBe(false);
    const locked = svc.lockSettings(task.id);
    expect(locked!.settings_locked).toBe(true);
  });

  test('lockSettings returns null for unknown id', () => {
    const svc = new TaskService();
    expect(svc.lockSettings('nope')).toBeNull();
  });

  test('apply → lock flow preserves applied settings', () => {
    const svc = new TaskService();
    const task = svc.createTask({ title: 't' });
    svc.applySettings(task.id, {
      methodology_selection_mode: 'manual',
      methodologyId: 'm-final',
      stageId: 's1',
      effort: 'fast',
      economy_mode: 'budget',
      compliance_review_enabled: true,
    });
    const locked = svc.lockSettings(task.id);
    expect(locked!.settings_locked).toBe(true);
    expect(locked!.methodologyId).toBe('m-final');
    expect(locked!.effort).toBe('fast');
    expect(locked!.economy_mode).toBe('budget');
    expect(locked!.compliance_review_enabled).toBe(true);
  });
});
