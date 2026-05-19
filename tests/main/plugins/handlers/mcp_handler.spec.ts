import { describe, test, expect, vi } from 'vitest';
import { McpHandler } from '../../../../src/main/plugins/handlers/mcp_handler';
import type { McpClientPool } from '../../../../src/main/plugins/mcp/mcp_client_pool';
import type { McpServerConfig } from '../../../../src/core/domain/mcp_server';
import type { PipelinePlugin } from '../../../../src/core/domain/pipeline_plugin';
import type { PluginExecutionContext } from '../../../../src/core/domain/plugin_context';

function ctx(): PluginExecutionContext {
  return {
    hook: 'on_task_complete',
    task: { id: 't1', workdir: '/tmp' },
    event: {},
    timestamp: 0,
  };
}

function plugin(params: Record<string, unknown>): PipelinePlugin {
  return { id: 'p1', type: 'mcp', hook: 'on_task_complete', params };
}

function makePool(overrides: Partial<McpClientPool> = {}): McpClientPool {
  return {
    ensure: vi.fn().mockResolvedValue({}),
    callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
    listTools: vi.fn().mockResolvedValue([]),
    disconnect: vi.fn().mockResolvedValue(undefined),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as McpClientPool;
}

const cfg: McpServerConfig = { id: 'fs', transport: 'stdio', command: 'echo' };

describe('McpHandler', () => {
  test('success: ensures pool then dispatches callTool', async () => {
    const pool = makePool();
    const h = new McpHandler(pool, () => [cfg]);

    const r = await h.execute(
      plugin({ server: 'fs', tool: 'list', args: { dir: '/' } }),
      ctx(),
    );

    expect(r.ok).toBe(true);
    expect(r.output).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    expect(pool.ensure).toHaveBeenCalledWith(cfg);
    expect(pool.callTool).toHaveBeenCalledWith('fs', 'list', { dir: '/' });
  });

  test('missing server param → ok=false', async () => {
    const pool = makePool();
    const h = new McpHandler(pool, () => [cfg]);
    const r = await h.execute(plugin({ tool: 'list' }), ctx());
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/server \+ params\.tool required/);
    expect(pool.ensure).not.toHaveBeenCalled();
  });

  test('missing tool param → ok=false', async () => {
    const pool = makePool();
    const h = new McpHandler(pool, () => [cfg]);
    const r = await h.execute(plugin({ server: 'fs' }), ctx());
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/server \+ params\.tool required/);
  });

  test('unknown server id → ok=false', async () => {
    const pool = makePool();
    const h = new McpHandler(pool, () => [cfg]);
    const r = await h.execute(plugin({ server: 'absent', tool: 'list' }), ctx());
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Unknown MCP server');
    expect(pool.ensure).not.toHaveBeenCalled();
  });

  test('callTool throws → ok=false with error message', async () => {
    const pool = makePool({
      callTool: vi.fn().mockRejectedValue(new Error('handshake failed')) as never,
    });
    const h = new McpHandler(pool, () => [cfg]);
    const r = await h.execute(plugin({ server: 'fs', tool: 'list' }), ctx());
    expect(r.ok).toBe(false);
    expect(r.error).toBe('handshake failed');
  });

  test('args default to {} when omitted', async () => {
    const pool = makePool();
    const h = new McpHandler(pool, () => [cfg]);
    await h.execute(plugin({ server: 'fs', tool: 'list' }), ctx());
    expect(pool.callTool).toHaveBeenCalledWith('fs', 'list', {});
  });
});
