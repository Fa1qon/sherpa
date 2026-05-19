// src/main/plugins/mcp/mcp_settings.ts
// Track C Plan 03 Task 1 — re-export of MCP domain types.
//
// The authoritative type definitions live in `src/core/domain/mcp_server.ts`
// (domain layer; cannot import from `src/main/`). This file re-exports them
// for main-process modules (`McpClientPool`, `McpHandler`) so they don't
// need to know the domain path.

export type {
  McpServerConfig,
  McpServerStdioConfig,
  McpServerSseConfig,
  McpValidationResult,
} from '../../../core/domain/mcp_server';
export { validateMcpServer, isMcpServerConfig } from '../../../core/domain/mcp_server';
