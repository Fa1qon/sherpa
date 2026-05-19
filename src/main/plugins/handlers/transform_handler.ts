// src/main/plugins/handlers/transform_handler.ts
// Track C Plan 02 Task 4 — transform plugin handler.
//
// Minimal filesystem operations against a produced artifact (or an
// explicit source path resolved against `ctx.task.workdir`).
//   - copy             — copyFile(source → dest)
//   - rename           — rename(source → dest)
//   - validate-exists  — assert path exists
//   - validate-size    — assert size <= maxBytes
//
// Future ops (md→pdf, lint, sign) extend this without breaking the existing
// surface. Strict TS; no IPC.

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { PluginHandler, PluginResult } from '../handler_registry';
import type { PipelinePlugin } from '../../../core/domain/pipeline_plugin';
import type { PluginExecutionContext } from '../../../core/domain/plugin_context';

type TransformOp = 'copy' | 'rename' | 'validate-exists' | 'validate-size';

interface TransformParams {
  operation: TransformOp;
  source?: string;
  dest?: string;
  maxBytes?: number;
}

export class TransformHandler implements PluginHandler {
  async execute(plugin: PipelinePlugin, ctx: PluginExecutionContext): Promise<PluginResult> {
    const p = plugin.params as TransformParams | undefined;
    if (!p || !p.operation) {
      return { ok: false, durationMs: 0, error: 'transform: params.operation required' };
    }

    const t0 = Date.now();
    const source = p.source
      ? path.resolve(ctx.task.workdir, p.source)
      : ctx.artifact?.path ?? null;
    const dest = p.dest ? path.resolve(ctx.task.workdir, p.dest) : null;

    try {
      switch (p.operation) {
        case 'copy': {
          if (!source || !dest) throw new Error('copy requires source + dest');
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.copyFile(source, dest);
          return { ok: true, durationMs: Date.now() - t0 };
        }
        case 'rename': {
          if (!source || !dest) throw new Error('rename requires source + dest');
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.rename(source, dest);
          return { ok: true, durationMs: Date.now() - t0 };
        }
        case 'validate-exists': {
          if (!source) throw new Error('validate-exists requires source');
          await fs.access(source);
          return { ok: true, durationMs: Date.now() - t0 };
        }
        case 'validate-size': {
          if (!source) throw new Error('validate-size requires source');
          const st = await fs.stat(source);
          if (p.maxBytes !== undefined && st.size > p.maxBytes) {
            return {
              ok: false,
              durationMs: Date.now() - t0,
              error: `File ${st.size} bytes exceeds maxBytes ${p.maxBytes}`,
            };
          }
          return { ok: true, durationMs: Date.now() - t0, output: { size: st.size } };
        }
        default: {
          // Exhaustiveness — narrow `p.operation` to never.
          const _exhaustive: never = p.operation;
          return {
            ok: false,
            durationMs: Date.now() - t0,
            error: `transform: unknown operation "${String(_exhaustive)}"`,
          };
        }
      }
    } catch (err) {
      return {
        ok: false,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
