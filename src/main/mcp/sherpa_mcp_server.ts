// sherpa_mcp_server — Node worker entry process spawned by McpServerAdapter.
//
// Runs out-of-band from the main Electron process. Communicates with the
// parent over stdio via JSON-RPC (MCP protocol) using
// `@modelcontextprotocol/sdk`'s low-level Server + StdioServerTransport.
//
// The 6 Sherpa tools (sherpa_search_code / sherpa_search_docs /
// sherpa_search_cases / sherpa_graph_neighbours / sherpa_search_tasks /
// sherpa_get_task_context) live in `./tools/*` and expose `definition` +
// `handler` so this entry remains a thin glue layer.
//
// MVP-1 scope: code search wires through StoragePort + EmbeddingPort
// equivalents; the rest are typed stubs (returns shape-correct empty results)
// per task spec — full implementation lands in Phase 3 once `RagPort` lands.
//
// Stdout discipline (CRITICAL): only JSON-RPC frames may be written to stdout.
// Diagnostics go to stderr so the parent's `onData` parser is not fed garbage.

/* eslint-disable no-console */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { searchCode } from './tools/search_code';
import { searchDocs } from './tools/search_docs';
import { searchCases } from './tools/search_cases';
import { graphNeighbours } from './tools/graph_neighbours';
import { searchTasks } from './tools/search_tasks';
import { getTaskContext } from './tools/get_task_context';

interface ToolModule {
  readonly definition: {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: Record<string, unknown>;
    readonly outputSchema: Record<string, unknown>;
  };
  readonly handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/** Registered tools — order is preserved in `tools/list` responses. */
export const TOOL_MODULES: ReadonlyArray<ToolModule> = [
  searchCode,
  searchDocs,
  searchCases,
  graphNeighbours,
  searchTasks,
  getTaskContext,
];

/**
 * Build the configured Server instance.
 *
 * Exported so tests can drive request handlers without spawning an actual
 * stdio worker; production entry calls `runStdio()` below.
 */
export function buildServer(): Server {
  const server = new Server(
    { name: 'sherpa-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_MODULES.map((m) => ({
      name: m.definition.name,
      description: m.definition.description,
      inputSchema: m.definition.inputSchema,
      // Optional outputSchema — clients use it for narrowing.
      outputSchema: m.definition.outputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: rawArgs } = req.params;
    const tool = TOOL_MODULES.find((m) => m.definition.name === name);
    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: `unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
    }
    try {
      const result = await tool.handler(
        (rawArgs ?? {}) as Record<string, unknown>,
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `tool error: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/** Production entry — connect the configured server to stdio. */
export async function runStdio(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Auto-run only when invoked directly (e.g. `node sherpa_mcp_server.js`).
// `require.main === module` on CJS; for ESM bundles the adapter calls runStdio
// explicitly on import, but Node's CJS build path used by tsconfig.main.json
// covers the production path.
if (typeof require !== 'undefined' && require.main === module) {
  runStdio().catch((err: unknown) => {
    console.error('[sherpa_mcp_server] fatal:', err);
    process.exit(1);
  });
}
