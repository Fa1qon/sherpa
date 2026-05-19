import { describe, test, expect, vi } from 'vitest';
import { WebhookHandler } from '../../../src/main/plugins/handlers/webhook_handler';
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
  return { id: 'p1', type: 'webhook', hook: 'on_task_complete', params };
}

describe('WebhookHandler', () => {
  test('returns error when url is missing', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const h = new WebhookHandler(fetchImpl);
    const r = await h.execute(plugin({}), ctx());
    expect(r.ok).toBe(false);
    expect(r.error).toContain('params.url required');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('uses default POST method and JSON content-type', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const h = new WebhookHandler(fetchImpl);
    await h.execute(plugin({ url: 'https://x.test/hook', body: { a: 1 } }), ctx());

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://x.test/hook');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(init?.body).toBe('{"a":1}');
  });

  test('respects custom method and headers', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 200 }));
    const h = new WebhookHandler(fetchImpl);
    await h.execute(
      plugin({
        url: 'https://x.test/hook',
        method: 'PUT',
        headers: { 'x-auth': 'secret' },
      }),
      ctx(),
    );
    const init = fetchImpl.mock.calls[0]![1]!;
    expect(init.method).toBe('PUT');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-auth']).toBe('secret');
    expect(headers['content-type']).toBe('application/json');
  });

  test('passes string body verbatim', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 200 }));
    const h = new WebhookHandler(fetchImpl);
    await h.execute(
      plugin({ url: 'https://x.test', body: 'raw text' }),
      ctx(),
    );
    expect(fetchImpl.mock.calls[0]![1]?.body).toBe('raw text');
  });

  test('skips body for GET', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 200 }));
    const h = new WebhookHandler(fetchImpl);
    await h.execute(
      plugin({ url: 'https://x.test', method: 'GET', body: { a: 1 } }),
      ctx(),
    );
    expect(fetchImpl.mock.calls[0]![1]?.body).toBeUndefined();
  });

  test('4xx response → ok=false with HTTP <status>', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('err', { status: 418 }));
    const h = new WebhookHandler(fetchImpl);
    const r = await h.execute(plugin({ url: 'https://x.test' }), ctx());
    expect(r.ok).toBe(false);
    expect(r.error).toBe('HTTP 418');
  });

  test('aborts after timeoutMs', async () => {
    const fetchImpl: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    const h = new WebhookHandler(fetchImpl);
    const r = await h.execute(
      plugin({ url: 'https://x.test', timeoutMs: 10 }),
      ctx(),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/abort/i);
  });
});
