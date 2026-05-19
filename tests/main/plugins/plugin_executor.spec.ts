import { describe, test, expect, vi } from 'vitest';
import { PluginHandlerRegistry, type PluginHandler, type PluginResult } from '../../../src/main/plugins/handler_registry';
import { PluginExecutor } from '../../../src/main/plugins/plugin_executor';
import type { PipelinePlugin } from '../../../src/core/domain/pipeline_plugin';
import type { PluginExecutionContext } from '../../../src/core/domain/plugin_context';

function makeCtx(overrides: Partial<PluginExecutionContext> = {}): PluginExecutionContext {
  return {
    hook: 'on_task_complete',
    task: { id: 't1', workdir: '/tmp/w', methodologyId: 'm1' },
    event: {},
    timestamp: 1,
    ...overrides,
  };
}

class OkHandler implements PluginHandler {
  constructor(private capture?: (plugin: PipelinePlugin) => void) {}
  async execute(plugin: PipelinePlugin): Promise<PluginResult> {
    this.capture?.(plugin);
    return { ok: true, durationMs: 1 };
  }
}

class FailHandler implements PluginHandler {
  public calls = 0;
  constructor(private successOnAttempt: number = Infinity) {}
  async execute(): Promise<PluginResult> {
    this.calls += 1;
    if (this.calls >= this.successOnAttempt) return { ok: true, durationMs: 1 };
    return { ok: false, durationMs: 1, error: 'boom' };
  }
}

describe('PluginExecutor', () => {
  test('filters out disabled plugins', async () => {
    const reg = new PluginHandlerRegistry();
    const ok = new OkHandler();
    reg.register('webhook', ok);
    const exec = new PluginExecutor(reg);
    exec.setPlugins([
      { id: 'p1', type: 'webhook', hook: 'on_task_complete', enabled: false },
    ]);
    const r = await exec.dispatch('on_task_complete', makeCtx());
    expect(r.pluginsRan).toBe(0);
  });

  test('filters by hook', async () => {
    const reg = new PluginHandlerRegistry();
    reg.register('webhook', new OkHandler());
    const exec = new PluginExecutor(reg);
    exec.setPlugins([
      { id: 'p1', type: 'webhook', hook: 'on_stage_start' },
    ]);
    const r = await exec.dispatch('on_task_complete', makeCtx());
    expect(r.pluginsRan).toBe(0);
  });

  test('filters by `when` condition (false → skip)', async () => {
    const reg = new PluginHandlerRegistry();
    reg.register('webhook', new OkHandler());
    const exec = new PluginExecutor(reg);
    exec.setPlugins([
      {
        id: 'p1',
        type: 'webhook',
        hook: 'on_task_complete',
        when: '{{task.id}} == "other"',
      },
    ]);
    const r = await exec.dispatch('on_task_complete', makeCtx());
    expect(r.pluginsRan).toBe(0);
  });

  test('passes when condition is true', async () => {
    const reg = new PluginHandlerRegistry();
    reg.register('webhook', new OkHandler());
    const exec = new PluginExecutor(reg);
    exec.setPlugins([
      {
        id: 'p1',
        type: 'webhook',
        hook: 'on_task_complete',
        when: '{{task.id}} == "t1"',
      },
    ]);
    const r = await exec.dispatch('on_task_complete', makeCtx());
    expect(r.pluginsRan).toBe(1);
    expect(r.results[0]?.result.ok).toBe(true);
  });

  test('retry: succeeds on attempt 2 of 3', async () => {
    const reg = new PluginHandlerRegistry();
    const handler = new FailHandler(2);
    reg.register('webhook', handler);
    const exec = new PluginExecutor(reg);
    exec.setPlugins([
      {
        id: 'p1',
        type: 'webhook',
        hook: 'on_task_complete',
        onError: 'retry',
        retry: { maxAttempts: 3, backoffMs: 0 },
      },
    ]);
    const r = await exec.dispatch('on_task_complete', makeCtx());
    expect(r.results[0]?.result.ok).toBe(true);
    expect(handler.calls).toBe(2);
  });

  test('retry exhausts after maxAttempts', async () => {
    const reg = new PluginHandlerRegistry();
    const handler = new FailHandler();
    reg.register('webhook', handler);
    const exec = new PluginExecutor(reg);
    exec.setPlugins([
      {
        id: 'p1',
        type: 'webhook',
        hook: 'on_task_complete',
        onError: 'retry',
        retry: { maxAttempts: 3, backoffMs: 0 },
      },
    ]);
    const r = await exec.dispatch('on_task_complete', makeCtx());
    expect(r.results[0]?.result.ok).toBe(false);
    expect(handler.calls).toBe(3);
  });

  test('onError abort stops subsequent plugins', async () => {
    const reg = new PluginHandlerRegistry();
    reg.register('webhook', new FailHandler());
    reg.register('notify', new OkHandler());
    const exec = new PluginExecutor(reg);
    exec.setPlugins([
      { id: 'p1', type: 'webhook', hook: 'on_task_complete', onError: 'abort' },
      { id: 'p2', type: 'notify', hook: 'on_task_complete' },
    ]);
    const r = await exec.dispatch('on_task_complete', makeCtx());
    expect(r.aborted).toBe(true);
    expect(r.pluginsRan).toBe(1);
    expect(r.results[0]?.aborted).toBe(true);
  });

  test('missing handler → error, respects onError=abort', async () => {
    const reg = new PluginHandlerRegistry();
    reg.register('notify', new OkHandler());
    const exec = new PluginExecutor(reg);
    exec.setPlugins([
      { id: 'p1', type: 'webhook', hook: 'on_task_complete', onError: 'abort' },
      { id: 'p2', type: 'notify', hook: 'on_task_complete' },
    ]);
    const r = await exec.dispatch('on_task_complete', makeCtx());
    expect(r.aborted).toBe(true);
    expect(r.pluginsRan).toBe(1);
    expect(r.results[0]?.result.error).toContain('No handler');
  });

  test('missing handler with onError=continue does not abort', async () => {
    const reg = new PluginHandlerRegistry();
    reg.register('notify', new OkHandler());
    const exec = new PluginExecutor(reg);
    exec.setPlugins([
      { id: 'p1', type: 'webhook', hook: 'on_task_complete', onError: 'continue' },
      { id: 'p2', type: 'notify', hook: 'on_task_complete' },
    ]);
    const r = await exec.dispatch('on_task_complete', makeCtx());
    expect(r.aborted).toBe(false);
    expect(r.pluginsRan).toBe(2);
  });

  test('template substitution applied to params before handler', async () => {
    const reg = new PluginHandlerRegistry();
    const captured = vi.fn<(p: PipelinePlugin) => void>();
    reg.register('webhook', new OkHandler(captured));
    const exec = new PluginExecutor(reg);
    exec.setPlugins([
      {
        id: 'p1',
        type: 'webhook',
        hook: 'on_task_complete',
        params: { taskId: '{{task.id}}', nested: { wd: '{{task.workdir}}' } },
      },
    ]);
    await exec.dispatch('on_task_complete', makeCtx());
    expect(captured).toHaveBeenCalledOnce();
    const got = captured.mock.calls[0]![0];
    expect(got.params).toEqual({ taskId: 't1', nested: { wd: '/tmp/w' } });
  });

  test('thrown error in handler is caught and reported', async () => {
    class Boom implements PluginHandler {
      async execute(): Promise<PluginResult> {
        throw new Error('handler crash');
      }
    }
    const reg = new PluginHandlerRegistry();
    reg.register('webhook', new Boom());
    const exec = new PluginExecutor(reg);
    exec.setPlugins([
      { id: 'p1', type: 'webhook', hook: 'on_task_complete' },
    ]);
    const r = await exec.dispatch('on_task_complete', makeCtx());
    expect(r.results[0]?.result.ok).toBe(false);
    expect(r.results[0]?.result.error).toContain('handler crash');
  });
});
