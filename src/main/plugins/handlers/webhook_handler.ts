// src/main/plugins/handlers/webhook_handler.ts
// Track C Plan 02 Task 3 — webhook plugin handler.
//
// Performs a single fetch() call per dispatch. Retry/abort policy is owned
// by `PluginExecutor`; this handler reports `ok=false` for non-2xx responses
// and for transport / abort failures.
//
// Strict TS; no IPC.

import type { PluginHandler, PluginResult } from '../handler_registry';
import type { PipelinePlugin } from '../../../core/domain/pipeline_plugin';
import type { PluginExecutionContext } from '../../../core/domain/plugin_context';

interface WebhookParams {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class WebhookHandler implements PluginHandler {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async execute(plugin: PipelinePlugin, _ctx: PluginExecutionContext): Promise<PluginResult> {
    const p = plugin.params as WebhookParams | undefined;
    if (!p || typeof p.url !== 'string' || p.url.length === 0) {
      return { ok: false, durationMs: 0, error: 'webhook: params.url required' };
    }

    const t0 = Date.now();
    const controller = new AbortController();
    const timeoutMs = p.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const method = p.method ?? 'POST';
      const init: RequestInit = {
        method,
        headers: { 'content-type': 'application/json', ...(p.headers ?? {}) },
        signal: controller.signal,
      };
      if (p.body !== undefined && method !== 'GET') {
        init.body = typeof p.body === 'string' ? p.body : JSON.stringify(p.body);
      }
      const resp = await this.fetchImpl(p.url, init);
      const text = await resp.text();
      return {
        ok: resp.ok,
        durationMs: Date.now() - t0,
        output: { status: resp.status, body: text.slice(0, 2000) },
        error: resp.ok ? undefined : `HTTP ${resp.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
