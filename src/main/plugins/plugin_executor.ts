// src/main/plugins/plugin_executor.ts
// Track C Plan 02 Task 2 — PluginExecutor.
//
// Holds the active methodology's plugin manifest and, on each engine
// hook-point dispatch, runs all enabled+matching plugins in declared order
// with `when` filter, template substitution of params, retry/abort policy,
// and a per-plugin result envelope.
//
// Strict TS; no IPC.

import type { PipelinePlugin, PluginHookPoint } from '../../core/domain/pipeline_plugin';
import type { PluginExecutionContext } from '../../core/domain/plugin_context';
import { evaluateCondition, substituteValue } from '../../core/domain/plugin_template';
import type { PluginHandlerRegistry, PluginResult } from './handler_registry';

export interface DispatchResultItem {
  readonly plugin: string;
  readonly result: PluginResult;
  readonly aborted?: boolean;
}

export interface DispatchResult {
  readonly hook: PluginHookPoint;
  readonly pluginsRan: number;
  readonly results: readonly DispatchResultItem[];
  readonly aborted: boolean;
}

export class PluginExecutor {
  private plugins: readonly PipelinePlugin[] = [];

  constructor(private readonly registry: PluginHandlerRegistry) {}

  setPlugins(plugins: readonly PipelinePlugin[]): void {
    this.plugins = plugins;
  }

  async dispatch(hook: PluginHookPoint, ctx: PluginExecutionContext): Promise<DispatchResult> {
    const candidates = this.plugins.filter(
      (p) => p.hook === hook && p.enabled !== false && evaluateCondition(p.when, ctx),
    );

    const results: DispatchResultItem[] = [];
    let aborted = false;

    for (const plugin of candidates) {
      if (aborted) break;

      const handler = this.registry.resolve(plugin.type);
      if (!handler) {
        const missing: PluginResult = {
          ok: false,
          durationMs: 0,
          error: `No handler for type "${plugin.type}"`,
        };
        const item: DispatchResultItem =
          plugin.onError === 'abort'
            ? { plugin: plugin.id, result: missing, aborted: true }
            : { plugin: plugin.id, result: missing };
        results.push(item);
        if (plugin.onError === 'abort') aborted = true;
        continue;
      }

      // Substitute templates inside params using the dispatch context.
      const resolvedParams =
        plugin.params !== undefined
          ? (substituteValue(plugin.params, ctx) as Record<string, unknown>)
          : undefined;
      const resolvedPlugin: PipelinePlugin = { ...plugin, params: resolvedParams };

      const attempts =
        plugin.onError === 'retry' && plugin.retry ? plugin.retry.maxAttempts : 1;
      let lastResult: PluginResult = { ok: false, durationMs: 0, error: 'not executed' };

      for (let attempt = 1; attempt <= attempts; attempt++) {
        const t0 = Date.now();
        try {
          lastResult = await handler.execute(resolvedPlugin, ctx);
        } catch (err) {
          lastResult = {
            ok: false,
            durationMs: Date.now() - t0,
            error: err instanceof Error ? err.message : String(err),
          };
        }
        if (lastResult.ok) break;
        if (attempt < attempts && plugin.retry) {
          await delay(plugin.retry.backoffMs * attempt);
        }
      }

      if (!lastResult.ok && plugin.onError === 'abort') {
        results.push({ plugin: plugin.id, result: lastResult, aborted: true });
        aborted = true;
      } else {
        results.push({ plugin: plugin.id, result: lastResult });
      }
    }

    return { hook, pluginsRan: results.length, results, aborted };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
