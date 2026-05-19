import { describe, test, expect, vi } from 'vitest';
import {
  McpClientPool,
  type McpClientLike,
  type McpTransportFactories,
} from '../../../../src/main/plugins/mcp/mcp_client_pool';
import type { McpServerConfig } from '../../../../src/core/domain/mcp_server';

interface FakeClient extends McpClientLike {
  connectCalls: number;
  closeCalls: number;
  callToolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
  tools: ReadonlyArray<{ name: string }>;
  callToolResult: unknown;
  callToolError?: Error;
}

function makeFakeClient(tools: ReadonlyArray<{ name: string }> = []): FakeClient {
  const c: FakeClient = {
    connectCalls: 0,
    closeCalls: 0,
    callToolCalls: [],
    tools,
    callToolResult: { content: [{ type: 'text', text: 'ok' }] },
    async connect() {
      c.connectCalls += 1;
    },
    async close() {
      c.closeCalls += 1;
    },
    async callTool(params) {
      c.callToolCalls.push(params);
      if (c.callToolError) throw c.callToolError;
      return c.callToolResult;
    },
    async listTools() {
      return { tools: c.tools };
    },
  };
  return c;
}

function makeFactories(client: FakeClient): McpTransportFactories {
  return {
    createStdioTransport: vi.fn().mockReturnValue({ kind: 'stdio' }),
    createSseTransport: vi.fn().mockReturnValue({ kind: 'sse' }),
    createClient: () => client,
  };
}

const stdioCfg: McpServerConfig = {
  id: 'fs',
  transport: 'stdio',
  command: 'echo',
  args: ['hello'],
};

const sseCfg: McpServerConfig = {
  id: 'remote',
  transport: 'sse',
  url: 'https://mcp.example.com/sse',
  headers: { authorization: 'Bearer x' },
};

describe('McpClientPool', () => {
  test('ensure() opens a connection and caches it', async () => {
    const client = makeFakeClient();
    const factories = makeFactories(client);
    const pool = new McpClientPool(factories);

    const a = await pool.ensure(stdioCfg);
    const b = await pool.ensure(stdioCfg);

    expect(a).toBe(client);
    expect(b).toBe(client);
    expect(client.connectCalls).toBe(1);
    expect(factories.createStdioTransport).toHaveBeenCalledOnce();
  });

  test('ensure() uses SSE transport for sse configs', async () => {
    const client = makeFakeClient();
    const factories = makeFactories(client);
    const pool = new McpClientPool(factories);

    await pool.ensure(sseCfg);

    expect(factories.createSseTransport).toHaveBeenCalledOnce();
    const args = (factories.createSseTransport as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(args[0]).toBeInstanceOf(URL);
    expect((args[0] as URL).href).toBe('https://mcp.example.com/sse');
    expect(args[1]).toEqual({ authorization: 'Bearer x' });
  });

  test('callTool() proxies to the connected client', async () => {
    const client = makeFakeClient();
    client.callToolResult = { content: [{ type: 'text', text: 'pong' }] };
    const pool = new McpClientPool(makeFactories(client));
    await pool.ensure(stdioCfg);

    const result = await pool.callTool('fs', 'ping', { x: 1 });

    expect(result).toEqual({ content: [{ type: 'text', text: 'pong' }] });
    expect(client.callToolCalls).toEqual([
      { name: 'ping', arguments: { x: 1 } },
    ]);
  });

  test('callTool() throws when server is not connected', async () => {
    const pool = new McpClientPool(makeFactories(makeFakeClient()));
    await expect(pool.callTool('absent', 'x', {})).rejects.toThrow(/not connected/);
  });

  test('listTools() returns tools list', async () => {
    const tools = [{ name: 'a' }, { name: 'b' }];
    const client = makeFakeClient(tools);
    const pool = new McpClientPool(makeFactories(client));
    await pool.ensure(stdioCfg);

    expect(await pool.listTools('fs')).toEqual(tools);
  });

  test('disconnect() closes client and removes entry', async () => {
    const client = makeFakeClient();
    const pool = new McpClientPool(makeFactories(client));
    await pool.ensure(stdioCfg);
    expect(pool.list()).toEqual(['fs']);

    await pool.disconnect('fs');

    expect(client.closeCalls).toBe(1);
    expect(pool.list()).toEqual([]);
  });

  test('disconnect() of unknown id is a no-op', async () => {
    const pool = new McpClientPool(makeFactories(makeFakeClient()));
    await expect(pool.disconnect('nope')).resolves.toBeUndefined();
  });

  test('disconnectAll() drops every entry', async () => {
    // Two distinct fake clients keyed by id.
    let n = 0;
    const clients: FakeClient[] = [makeFakeClient(), makeFakeClient()];
    const factories: McpTransportFactories = {
      createStdioTransport: vi.fn().mockReturnValue({}),
      createSseTransport: vi.fn().mockReturnValue({}),
      createClient: () => clients[n++]!,
    };
    const pool = new McpClientPool(factories);

    await pool.ensure(stdioCfg);
    await pool.ensure(sseCfg);
    expect(pool.list().length).toBe(2);

    await pool.disconnectAll();

    expect(pool.list()).toEqual([]);
    expect(clients[0]!.closeCalls).toBe(1);
    expect(clients[1]!.closeCalls).toBe(1);
  });

  test('disconnect swallows client.close() errors', async () => {
    const client = makeFakeClient();
    client.close = async () => {
      throw new Error('boom');
    };
    const pool = new McpClientPool(makeFactories(client));
    await pool.ensure(stdioCfg);
    await expect(pool.disconnect('fs')).resolves.toBeUndefined();
    expect(pool.list()).toEqual([]);
  });
});
