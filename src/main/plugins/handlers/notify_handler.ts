// src/main/plugins/handlers/notify_handler.ts
// Track C Plan 02 Task 5 — notify plugin handler.
//
// Surfaces a desktop notification via Electron's `Notification` API.
// Errors are reported as `ok=false` so retry/abort policy can react.
//
// Strict TS; no IPC.

import { Notification } from 'electron';

import type { PluginHandler, PluginResult } from '../handler_registry';
import type { PipelinePlugin } from '../../../core/domain/pipeline_plugin';
import type { PluginExecutionContext } from '../../../core/domain/plugin_context';

interface NotifyParams {
  title: string;
  body: string;
  urgency?: 'low' | 'normal' | 'critical';
}

export class NotifyHandler implements PluginHandler {
  async execute(plugin: PipelinePlugin, _ctx: PluginExecutionContext): Promise<PluginResult> {
    const p = plugin.params as NotifyParams | undefined;
    if (!p || typeof p.title !== 'string' || typeof p.body !== 'string') {
      return { ok: false, durationMs: 0, error: 'notify: title + body required' };
    }
    const t0 = Date.now();
    try {
      const n = new Notification({
        title: p.title,
        body: p.body,
        urgency: p.urgency ?? 'normal',
      });
      n.show();
      return { ok: true, durationMs: Date.now() - t0 };
    } catch (err) {
      return {
        ok: false,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
