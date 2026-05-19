// src/main/plugins/handler_registry.ts
// Track C Plan 02 Task 1 — plugin handler interface + registry.
//
// `PluginHandler` is the per-type runtime contract used by `PluginExecutor`.
// Each `PluginType` (webhook / transform / notify / …) registers an
// implementation, and the executor resolves by type at dispatch time.
//
// Strict TS; no runtime deps.

import type { PipelinePlugin, PluginType } from '../../core/domain/pipeline_plugin';
import type { PluginExecutionContext } from '../../core/domain/plugin_context';

export interface PluginResult {
  readonly ok: boolean;
  readonly durationMs: number;
  readonly output?: unknown;
  readonly error?: string;
}

export interface PluginHandler {
  execute(plugin: PipelinePlugin, ctx: PluginExecutionContext): Promise<PluginResult>;
}

export class PluginHandlerRegistry {
  private readonly handlers = new Map<PluginType, PluginHandler>();

  register(type: PluginType, handler: PluginHandler): void {
    this.handlers.set(type, handler);
  }

  resolve(type: PluginType): PluginHandler | null {
    return this.handlers.get(type) ?? null;
  }
}
