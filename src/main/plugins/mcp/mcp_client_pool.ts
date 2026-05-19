// src/main/plugins/mcp/mcp_client_pool.ts
// Track C Plan 03 Task 2 — pool of live MCP `Client` connections.
//
// `ensure(cfg)` lazily opens a connection per server id; subsequent calls
// reuse the cached `Client`. `disconnect`/`disconnectAll` are used at
// `app.before-quit` (see composition_root) and from the Settings UI.
//
// The MCP SDK transports (`StdioClientTransport`, `SSEClientTransport`) are
// constructed via injectable factories so unit tests can supply a fake
// `Client` / transport that never spawns a real process.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { McpServerConfig } from './mcp_settings';

/**
 * The narrow subset of the MCP `Client` surface that `McpClientPool` uses.
 * Lets tests inject a fake client (which we cannot directly construct from
 * outside the SDK) without `any`/`unknown` casts at the call site.
 */
export interface McpClientLike {
  connect(transport: unknown): Promise<void>;
  close(): Promise<void>;
  callTool(params: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
  listTools(): Promise<{ tools: ReadonlyArray<{ name: string }> }>;
}

export interface McpTransportFactories {
  /** Build a stdio transport.  Default: `new StdioClientTransport(...)`. */
  createStdioTransport(cfg: {
    command: string;
    args: string[];
    env: Record<string, string>;
    cwd?: string;
  }): unknown;
  /** Build an SSE transport.  Default: `new SSEClientTransport(url, opts)`. */
  createSseTransport(url: URL, headers: Record<string, string>): unknown;
  /** Build an MCP client.  Default: `new Client(...)`. */
  createClient(): McpClientLike;
}

const DEFAULT_FACTORIES: McpTransportFactories = {
  createStdioTransport: (cfg) =>
    new StdioClientTransport({
      command: cfg.command,
      args: cfg.args,
      env: cfg.env,
      cwd: cfg.cwd,
    }),
  createSseTransport: (url, headers) =>
    new SSEClientTransport(url, {
      requestInit: { headers },
    }),
  createClient: () =>
    new Client(
      { name: 'sherpa-ui', version: '1.0.0' },
      { capabilities: {} },
    ) as unknown as McpClientLike,
};

interface PoolEntry {
  readonly config: McpServerConfig;
  readonly client: McpClientLike;
  connected: boolean;
}

export class McpClientPool {
  private readonly entries = new Map<string, PoolEntry>();
  private readonly factories: McpTransportFactories;

  constructor(factories: Partial<McpTransportFactories> = {}) {
    this.factories = { ...DEFAULT_FACTORIES, ...factories };
  }

  /**
   * Lazily open a connection for `config.id`. Returns the cached client if
   * already connected. Re-opens if a previous entry was disconnected.
   */
  async ensure(config: McpServerConfig): Promise<McpClientLike> {
    const existing = this.entries.get(config.id);
    if (existing && existing.connected) return existing.client;

    const client = this.factories.createClient();
    let transport: unknown;
    if (config.transport === 'stdio') {
      // Merge process.env with explicit overrides; cast to keep the SDK
      // signature happy (it expects Record<string,string>, but process.env
      // has `string | undefined` values — we filter undefined first).
      const baseEnv: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (typeof v === 'string') baseEnv[k] = v;
      }
      transport = this.factories.createStdioTransport({
        command: config.command,
        args: [...(config.args ?? [])],
        env: { ...baseEnv, ...(config.env ?? {}) },
        cwd: config.cwd,
      });
    } else {
      transport = this.factories.createSseTransport(
        new URL(config.url),
        { ...(config.headers ?? {}) },
      );
    }

    await client.connect(transport);
    this.entries.set(config.id, { config, client, connected: true });
    return client;
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const entry = this.entries.get(serverId);
    if (!entry || !entry.connected) {
      throw new Error(`MCP server "${serverId}" not connected`);
    }
    return entry.client.callTool({ name: toolName, arguments: args });
  }

  async listTools(serverId: string): Promise<ReadonlyArray<{ name: string }>> {
    const entry = this.entries.get(serverId);
    if (!entry || !entry.connected) {
      throw new Error(`MCP server "${serverId}" not connected`);
    }
    const { tools } = await entry.client.listTools();
    return tools;
  }

  async disconnect(serverId: string): Promise<void> {
    const entry = this.entries.get(serverId);
    if (!entry) return;
    try {
      await entry.client.close();
    } catch {
      // Best-effort: close errors must not crash the host.
    }
    this.entries.delete(serverId);
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.entries.keys());
    for (const id of ids) await this.disconnect(id);
  }

  /** Currently-connected server ids. Read-only snapshot. */
  list(): readonly string[] {
    return Array.from(this.entries.keys());
  }
}
