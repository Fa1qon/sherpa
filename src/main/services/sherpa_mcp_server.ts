// src/main/services/sherpa_mcp_server.ts
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// SSE transport is required for Claude Code CLI --mcp-config integration (type: "sse").
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import type { BrowserService } from './browser_service';

export interface StageCompleteInput {
  readonly summary: string;
  readonly artifacts: readonly string[];
}

/** Callback invoked when the agent calls sherpa_stage_complete. Returns a string fed back to the agent. */
export type StageCompleteHandler = (input: StageCompleteInput) => Promise<string>;

interface SessionEntry {
  readonly mcpServer: McpServer;
  readonly handler: StageCompleteHandler;
  transport: SSEServerTransport | null;
}

export class SherpaMcpServer {
  private srv: http.Server | null = null;
  private port = 0;
  private readonly sessions = new Map<string, SessionEntry>();
  private browserService?: BrowserService;

  setBrowserService(svc: BrowserService): void {
    this.browserService = svc;
  }

  /** Starts the HTTP server on a random loopback port. Idempotent. */
  async start(): Promise<void> {
    if (this.srv) return;
    this.srv = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    await new Promise<void>((resolve, reject) => {
      this.srv!.listen(0, '127.0.0.1', () => {
        const addr = this.srv!.address();
        this.port = typeof addr === 'object' && addr !== null ? addr.port : 0;
        resolve();
      });
      this.srv!.once('error', reject);
    });
  }

  /** Closes the HTTP server. No-op if not started. */
  async stop(): Promise<void> {
    if (!this.srv) return;
    await new Promise<void>((resolve) => {
      this.srv!.close(() => resolve());
    });
    this.srv = null;
    this.port = 0;
  }

  /** Base URL of the HTTP server, e.g. `http://127.0.0.1:54321`. */
  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`);
    const token = url.searchParams.get('token') ?? '';

    if (req.method === 'GET' && url.pathname === '/sse') {
      const session = this.sessions.get(token);
      if (!session) { res.writeHead(404).end('Unknown session'); return; }
      const transport = new SSEServerTransport(`/messages?token=${token}`, res);
      session.transport = transport;
      await session.mcpServer.connect(transport);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/messages') {
      const session = this.sessions.get(token);
      if (!session?.transport) { res.writeHead(404).end('No active transport'); return; }
      await session.transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404).end('Not found');
  }

  /**
   * Creates a per-turn McpServer with the sherpa_stage_complete tool wired to
   * the provided handler. Must be called before the Claude Code process spawns
   * so Claude can connect via SSE on its first tool call.
   *
   * `taskId` is optional but required to enable the 8 browser tools — they
   * use it to look up the BrowserSession via BrowserService.getSession(taskId).
   */
  registerSession(token: string, handler: StageCompleteHandler, taskId?: string): void {
    // Close any existing session for this token to prevent McpServer leaks.
    const existing = this.sessions.get(token);
    if (existing) {
      void existing.mcpServer.close().catch(() => { /* best-effort */ });
      this.sessions.delete(token);
    }

    const mcpServer = new McpServer({ name: 'sherpa', version: '1.0.0' });

    mcpServer.tool(
      'sherpa_stage_complete',
      'Signal that all deliverables for the current methodology stage are complete and advance to the next stage. Call exactly once per stage when all required output artifacts exist on disk.',
      {
        summary: z.string().describe(
          'Brief summary of what was accomplished during this stage',
        ),
        artifacts: z.array(z.string()).optional().describe(
          'Relative paths from the project root of output artifacts produced during this stage',
        ),
      },
      async ({ summary, artifacts = [] }) => {
        try {
          const text = await handler({ summary, artifacts });
          return { content: [{ type: 'text' as const, text }] };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: 'text' as const, text: `Stage completion failed: ${msg}` }],
            isError: true,
          };
        }
      },
    );

    // ---- Browser tools (registered only when taskId is provided) ----------
    if (taskId !== undefined) {
      const tid = taskId;

      mcpServer.tool(
        'browser_navigate',
        'Navigate the browser to a URL',
        { url: z.string().url() },
        async ({ url }) => {
          const session = this.browserService?.getSession(tid);
          if (!session) return { content: [{ type: 'text' as const, text: 'Error: no browser session open. Call browser_open first.' }] };
          await session.port.navigate(url);
          return { content: [{ type: 'text' as const, text: `Navigated to ${url}` }] };
        },
      );

      mcpServer.tool(
        'browser_screenshot',
        'Capture a screenshot of the current browser page',
        {},
        async () => {
          const session = this.browserService?.getSession(tid);
          if (!session) return { content: [{ type: 'text' as const, text: 'Error: no browser session open.' }] };
          const result = await session.port.screenshot();
          const base64 = result.dataUrl.split(',')[1];
          if (!base64) return { content: [{ type: 'text' as const, text: 'Error: screenshot produced empty image' }] };
          return { content: [{ type: 'image' as const, data: base64, mimeType: 'image/png' as const }] };
        },
      );

      mcpServer.tool(
        'browser_click',
        'Click an element on the page by CSS selector',
        { selector: z.string() },
        async ({ selector }) => {
          const session = this.browserService?.getSession(tid);
          if (!session) return { content: [{ type: 'text' as const, text: 'Error: no browser session open.' }] };
          await session.port.click(selector);
          return { content: [{ type: 'text' as const, text: `Clicked ${selector}` }] };
        },
      );

      mcpServer.tool(
        'browser_type',
        'Type text into an input field by CSS selector',
        { selector: z.string(), text: z.string() },
        async ({ selector, text }) => {
          const session = this.browserService?.getSession(tid);
          if (!session) return { content: [{ type: 'text' as const, text: 'Error: no browser session open.' }] };
          await session.port.type(selector, text);
          return { content: [{ type: 'text' as const, text: `Typed into ${selector}` }] };
        },
      );

      mcpServer.tool(
        'browser_evaluate',
        'Run a JavaScript expression in the browser and return the result',
        { script: z.string() },
        async ({ script }) => {
          const session = this.browserService?.getSession(tid);
          if (!session) return { content: [{ type: 'text' as const, text: 'Error: no browser session open.' }] };
          const result = await session.port.evaluate<unknown>(script);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
        },
      );

      mcpServer.tool(
        'browser_get_dom',
        'Get the full HTML DOM of the current page',
        {},
        async () => {
          const session = this.browserService?.getSession(tid);
          if (!session) return { content: [{ type: 'text' as const, text: 'Error: no browser session open.' }] };
          const dom = await session.port.getDOM();
          return { content: [{ type: 'text' as const, text: dom }] };
        },
      );

      mcpServer.tool(
        'browser_wait_for',
        'Wait for a CSS selector to appear on the page',
        {
          selector: z.string(),
          timeout_ms: z.number().int().min(100).max(30000).optional(),
        },
        async ({ selector, timeout_ms }) => {
          const session = this.browserService?.getSession(tid);
          if (!session) return { content: [{ type: 'text' as const, text: 'Error: no browser session open.' }] };
          await session.port.waitFor(selector, timeout_ms);
          return { content: [{ type: 'text' as const, text: `Element ${selector} found` }] };
        },
      );

      mcpServer.tool(
        'browser_highlight',
        'Highlight an element with an orange outline for 2 seconds',
        { selector: z.string() },
        async ({ selector }) => {
          const session = this.browserService?.getSession(tid);
          if (!session) return { content: [{ type: 'text' as const, text: 'Error: no browser session open.' }] };
          await session.port.highlight(selector);
          return { content: [{ type: 'text' as const, text: `Highlighted ${selector}` }] };
        },
      );
    }
    // ---- End browser tools -------------------------------------------------

    this.sessions.set(token, { mcpServer, handler, transport: null });
  }

  /** Closes the McpServer for this session and removes it from the registry. */
  unregisterSession(token: string): void {
    const session = this.sessions.get(token);
    if (!session) return;
    void session.mcpServer.close().catch(() => { /* best-effort */ });
    this.sessions.delete(token);
  }

  /**
   * Writes a Claude Code MCP config JSON file for the given session token and
   * returns its absolute path. Caller is responsible for deleting the file
   * after the turn completes.
   */
  async writeMcpConfig(token: string): Promise<string> {
    const config = {
      mcpServers: {
        sherpa: {
          type: 'sse',
          url: `${this.baseUrl}/sse?token=${encodeURIComponent(token)}`,
        },
      },
    };
    const file = path.join(tmpdir(), `sherpa-mcp-config-${randomUUID()}.json`);
    await fsp.writeFile(file, JSON.stringify(config), 'utf8');
    return file;
  }
}
