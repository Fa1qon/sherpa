// Track C Plan 02 Task 8 — integration smoke test for the plugin executor.
//
// Spins up a one-shot `node:http` server, builds an executor with the real
// WebhookHandler + a one-plugin manifest, and dispatches `on_task_complete`
// to assert the request body honoured template substitution.
//
// No engine bootstrap — this exercises the public PluginExecutor surface
// directly so the smoke stays fast and isolated.

import { describe, test, expect } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { PluginExecutor } from '../../../src/main/plugins/plugin_executor';
import { PluginHandlerRegistry } from '../../../src/main/plugins/handler_registry';
import { WebhookHandler } from '../../../src/main/plugins/handlers/webhook_handler';
import type { Methodology } from '../../../src/core/domain/methodology';
import type { PluginExecutionContext } from '../../../src/core/domain/plugin_context';

interface CapturedRequest {
  method: string | undefined;
  url: string | undefined;
  body: string;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function listenOnRandomPort(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve(addr.port);
    });
  });
}

describe('plugin executor integration: webhook on task complete', () => {
  test('dispatches POST with substituted body to a real local http server', async () => {
    const captured: CapturedRequest = { method: undefined, url: undefined, body: '' };
    const server = createServer((req, res) => {
      captured.method = req.method;
      captured.url = req.url;
      void readBody(req).then((body) => {
        captured.body = body;
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end('{"ok":true}');
      });
    });

    const port = await listenOnRandomPort(server);

    try {
      // ----- Build executor with real WebhookHandler + 1 plugin -----------
      const registry = new PluginHandlerRegistry();
      registry.register('webhook', new WebhookHandler());
      const executor = new PluginExecutor(registry);

      // Build a fake methodology with one webhook plugin.
      const methodology: Pick<Methodology, 'plugins'> = {
        plugins: [
          {
            id: 'notify-complete',
            type: 'webhook',
            hook: 'on_task_complete',
            params: {
              url: `http://127.0.0.1:${port}/hook`,
              body: { taskId: '{{task.id}}', wd: '{{task.workdir}}', ok: true },
            },
          },
        ],
      };
      executor.setPlugins([...(methodology.plugins ?? [])]);

      // ----- Dispatch -----------------------------------------------------
      const ctx: PluginExecutionContext = {
        hook: 'on_task_complete',
        task: { id: 'task-42', workdir: '/work/dir', methodologyId: 'meth-1' },
        event: {},
        timestamp: Date.now(),
      };

      const result = await executor.dispatch('on_task_complete', ctx);

      // ----- Assertions ---------------------------------------------------
      expect(result.pluginsRan).toBe(1);
      expect(result.aborted).toBe(false);
      expect(result.results[0]?.result.ok).toBe(true);

      expect(captured.method).toBe('POST');
      expect(captured.url).toBe('/hook');
      const json = JSON.parse(captured.body) as Record<string, unknown>;
      expect(json).toEqual({ taskId: 'task-42', wd: '/work/dir', ok: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
