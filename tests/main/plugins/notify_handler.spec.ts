import { describe, test, expect, vi, beforeEach } from 'vitest';

const { showMock, NotificationCtor } = vi.hoisted(() => {
  const show = vi.fn();
  const ctor = vi.fn(function (this: { show: () => void }) {
    this.show = show;
  });
  return { showMock: show, NotificationCtor: ctor };
});

vi.mock('electron', () => ({
  Notification: NotificationCtor,
}));

// Import handler AFTER mock so the constructor reference is captured.
import { NotifyHandler } from '../../../src/main/plugins/handlers/notify_handler';
import type { PipelinePlugin } from '../../../src/core/domain/pipeline_plugin';
import type { PluginExecutionContext } from '../../../src/core/domain/plugin_context';

function ctx(): PluginExecutionContext {
  return {
    hook: 'on_task_complete',
    task: { id: 't1', workdir: '/tmp' },
    event: {},
    timestamp: 0,
  };
}

function plugin(params: Record<string, unknown>): PipelinePlugin {
  return { id: 'p1', type: 'notify', hook: 'on_task_complete', params };
}

describe('NotifyHandler', () => {
  beforeEach(() => {
    NotificationCtor.mockReset().mockImplementation(function (this: { show: () => void }) {
      this.show = showMock;
    });
    showMock.mockClear();
  });

  test('missing title or body → error', async () => {
    const h = new NotifyHandler();
    const r = await h.execute(plugin({ title: 'x' }), ctx());
    expect(r.ok).toBe(false);
    expect(r.error).toContain('title + body required');
    expect(NotificationCtor).not.toHaveBeenCalled();
  });

  test('happy path: constructs Notification + show()', async () => {
    const h = new NotifyHandler();
    const r = await h.execute(plugin({ title: 'Done', body: 'task t1 done' }), ctx());
    expect(r.ok).toBe(true);
    expect(NotificationCtor).toHaveBeenCalledOnce();
    expect(NotificationCtor).toHaveBeenCalledWith({
      title: 'Done',
      body: 'task t1 done',
      urgency: 'normal',
    });
    expect(showMock).toHaveBeenCalledOnce();
  });

  test('explicit urgency passed through', async () => {
    const h = new NotifyHandler();
    await h.execute(
      plugin({ title: 't', body: 'b', urgency: 'critical' }),
      ctx(),
    );
    expect(NotificationCtor).toHaveBeenCalledWith({
      title: 't',
      body: 'b',
      urgency: 'critical',
    });
  });

  test('catches Notification ctor failure', async () => {
    NotificationCtor.mockImplementationOnce(function () {
      throw new Error('no notifier');
    });
    const h = new NotifyHandler();
    const r = await h.execute(plugin({ title: 't', body: 'b' }), ctx());
    expect(r.ok).toBe(false);
    expect(r.error).toContain('no notifier');
  });
});
