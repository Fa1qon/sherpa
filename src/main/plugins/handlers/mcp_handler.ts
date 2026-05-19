// src/main/plugins/handlers/mcp_handler.ts
// Track C Plan 03 Task 3 — MCP plugin handler.
//
// Resolves the configured server by id, ensures a live connection via
// `McpClientPool`, then dispatches `callTool({ name, arguments })` and
// returns the result. Errors are surfaced as `ok=false` so retry/abort
// policy is owned by `PluginExecutor` — same convention as the webhook
// and notify handlers.
//
// Strict TS; no IPC.

import type { PluginHandler, PluginResult } from '../handler_registry';
import type { PipelinePlugin } from '../../../core/domain/pipeline_plugin';
import type { PluginExecutionContext } from '../../../core/domain/plugin_context';
import type { McpClientPool } from '../mcp/mcp_client_pool';
import type { McpServerConfig } from '../mcp/mcp_settings';

interface McpParams {
  /** Configured server id (see UserSettings.mcpServers[].id). */
  server: string;
  /** Tool name exposed by the MCP server. */
  tool: string;
  /** JSON-shaped arguments object passed to the tool. */
  args?: Record<string, unknown>;
}

function isMcpParams(v: unknown): v is McpParams {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return typeof p.server === 'string' && typeof p.tool === 'string';
}

export class McpHandler implements PluginHandler {
  constructor(
    private readonly pool: McpClientPool,
    private readonly serversProvider: () => readonly McpServerConfig[],
  ) {}

  async execute(plugin: PipelinePlugin, _ctx: PluginExecutionContext): Promise<PluginResult> {
    const params = plugin.params;
    if (!isMcpParams(params) || !params.server || !params.tool) {
      return {
        ok: false,
        durationMs: 0,
        error: 'mcp: params.server + params.tool required',
      };
    }
    const t0 = Date.now();
    try {
      const cfg = this.serversProvider().find((s) => s.id === params.server);
      if (!cfg) {
        return {
          ok: false,
          durationMs: Date.now() - t0,
          error: `Unknown MCP server "${params.server}"`,
        };
      }
      await this.pool.ensure(cfg);
      const result = await this.pool.callTool(
        params.server,
        params.tool,
        params.args ?? {},
      );
      return { ok: true, durationMs: Date.now() - t0, output: result };
    } catch (err) {
      return {
        ok: false,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
