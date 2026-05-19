// src/core/domain/mcp_server.ts
// Track C Plan 03 Task 1 — MCP server configuration domain types.
//
// `McpServerConfig` is persisted under `UserSettings.mcpServers` and consumed
// by `McpClientPool` / `McpHandler`. The discriminated union by `transport`
// keeps stdio (spawned binary) and SSE (HTTP+SSE) topologies type-safe.
//
// Strict TS; pure data + a structural validator. No runtime deps.

export interface McpServerStdioConfig {
  readonly id: string;
  readonly transport: 'stdio';
  /** Binary path (absolute, or resolvable on PATH). */
  readonly command: string;
  readonly args?: readonly string[];
  /** Extra environment variables. Merged with `process.env` at spawn. */
  readonly env?: Readonly<Record<string, string>>;
  /** Working directory override. */
  readonly cwd?: string;
}

export interface McpServerSseConfig {
  readonly id: string;
  readonly transport: 'sse';
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export type McpServerConfig = McpServerStdioConfig | McpServerSseConfig;

export interface McpValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

/**
 * Structural validator for an `McpServerConfig`.
 * Verifies field presence + shape only — does NOT probe the network or
 * filesystem.  Callers needing semantic validation (binary exists, URL is
 * reachable, etc.) should layer checks on top.
 */
export function validateMcpServer(s: McpServerConfig): McpValidationResult {
  const errors: string[] = [];
  if (!s.id || !/^[a-z0-9][a-z0-9_-]*$/.test(s.id)) {
    errors.push('id must be kebab/snake_case (start with alnum)');
  }
  if (s.transport === 'stdio') {
    if (!s.command || typeof s.command !== 'string') {
      errors.push('stdio: command required');
    }
  } else if (s.transport === 'sse') {
    if (!s.url || typeof s.url !== 'string') {
      errors.push('sse: url required');
    } else {
      try {
        new URL(s.url);
      } catch {
        errors.push(`sse: invalid url "${s.url}"`);
      }
    }
  } else {
    errors.push('unknown transport');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Shape guard — verifies that an unknown value matches the `McpServerConfig`
 * union. Used by `isUserSettings` when reading `global.config.json`.
 */
export function isMcpServerConfig(value: unknown): value is McpServerConfig {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string') return false;
  if (v.transport === 'stdio') {
    if (typeof v.command !== 'string') return false;
    if (v.args !== undefined) {
      if (!Array.isArray(v.args) || !v.args.every((a) => typeof a === 'string')) return false;
    }
    if (v.env !== undefined) {
      if (typeof v.env !== 'object' || v.env === null) return false;
      for (const val of Object.values(v.env as Record<string, unknown>)) {
        if (typeof val !== 'string') return false;
      }
    }
    if (v.cwd !== undefined && typeof v.cwd !== 'string') return false;
    return true;
  }
  if (v.transport === 'sse') {
    if (typeof v.url !== 'string') return false;
    if (v.headers !== undefined) {
      if (typeof v.headers !== 'object' || v.headers === null) return false;
      for (const val of Object.values(v.headers as Record<string, unknown>)) {
        if (typeof val !== 'string') return false;
      }
    }
    return true;
  }
  return false;
}
