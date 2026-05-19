// src/main/ipc/mcp_handlers.ts
// Track C Plan 03 Task 5 — IPC handler for the MCP test-ping channel.
//
// Settings UI invokes `MCP_PING` with a single `McpServerConfig`. We:
//   1. Validate the config shape via `validateMcpServer`.
//   2. Open a live connection via the shared `McpClientPool`.
//   3. List the server's tools.
//   4. Disconnect (so a transient test does not leak a stdio process).
// Any error is returned as `{ ok: false, error }` rather than thrown.

import type { IpcMain } from 'electron';
import { CH } from './channels';
import type { McpClientPool } from '../plugins/mcp/mcp_client_pool';
import type { McpServerConfig } from '../../core/domain/mcp_server';
import { validateMcpServer, isMcpServerConfig } from '../../core/domain/mcp_server';

export interface McpPingResult {
  readonly ok: boolean;
  readonly tools?: readonly string[];
  readonly error?: string;
}

export function registerMcpHandlers(pool: McpClientPool): void {
  // Lazy electron import keeps composition_root usable from vitest, where
  // electron is unavailable and `ipcMain` is undefined.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electron = require('electron') as { ipcMain: IpcMain | undefined };
  const ipcMain = electron.ipcMain;
  if (!ipcMain) return;
  ipcMain.handle(CH.MCP_PING, async (_evt, cfg: unknown): Promise<McpPingResult> => {
    if (!isMcpServerConfig(cfg)) {
      return { ok: false, error: 'mcp.ping: invalid McpServerConfig shape' };
    }
    const typed: McpServerConfig = cfg;
    const validation = validateMcpServer(typed);
    if (!validation.ok) {
      return { ok: false, error: validation.errors.join('; ') };
    }
    try {
      await pool.ensure(typed);
      const tools = await pool.listTools(typed.id);
      const names = tools.map((t) => t.name);
      // Disconnect after a test ping so we don't leak processes from ad-hoc tests.
      await pool.disconnect(typed.id);
      return { ok: true, tools: names };
    } catch (err) {
      try { await pool.disconnect(typed.id); } catch { /* ignore */ }
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}
