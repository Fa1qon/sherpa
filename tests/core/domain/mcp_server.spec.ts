import { describe, test, expect } from 'vitest';
import {
  validateMcpServer,
  isMcpServerConfig,
  type McpServerConfig,
} from '../../../src/core/domain/mcp_server';

describe('validateMcpServer', () => {
  test('accepts a valid stdio config', () => {
    const cfg: McpServerConfig = {
      id: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      env: { TOKEN: 'abc' },
    };
    const r = validateMcpServer(cfg);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  test('accepts a valid sse config', () => {
    const cfg: McpServerConfig = {
      id: 'remote_api',
      transport: 'sse',
      url: 'https://mcp.example.com/sse',
      headers: { authorization: 'Bearer x' },
    };
    const r = validateMcpServer(cfg);
    expect(r.ok).toBe(true);
  });

  test('rejects an id with bad characters', () => {
    const cfg: McpServerConfig = { id: 'Bad ID!', transport: 'stdio', command: 'x' };
    const r = validateMcpServer(cfg);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/id must be kebab/);
  });

  test('rejects stdio config missing command', () => {
    const cfg = { id: 'srv', transport: 'stdio', command: '' } as McpServerConfig;
    const r = validateMcpServer(cfg);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('command required'))).toBe(true);
  });

  test('rejects sse config with invalid url', () => {
    const cfg: McpServerConfig = {
      id: 'srv',
      transport: 'sse',
      url: 'not-a-url',
    };
    const r = validateMcpServer(cfg);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('invalid url'))).toBe(true);
  });

  test('rejects unknown transport', () => {
    const cfg = { id: 'srv', transport: 'tcp', url: 'x' } as unknown as McpServerConfig;
    const r = validateMcpServer(cfg);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('unknown transport');
  });
});

describe('isMcpServerConfig', () => {
  test('accepts a well-formed stdio config', () => {
    expect(
      isMcpServerConfig({ id: 'a', transport: 'stdio', command: 'x' }),
    ).toBe(true);
  });

  test('accepts a well-formed sse config', () => {
    expect(
      isMcpServerConfig({ id: 'a', transport: 'sse', url: 'http://x' }),
    ).toBe(true);
  });

  test('rejects non-object', () => {
    expect(isMcpServerConfig(null)).toBe(false);
    expect(isMcpServerConfig('x')).toBe(false);
  });

  test('rejects stdio with non-string args item', () => {
    expect(
      isMcpServerConfig({
        id: 'a',
        transport: 'stdio',
        command: 'x',
        args: ['ok', 2 as unknown as string],
      }),
    ).toBe(false);
  });

  test('rejects stdio with non-string env value', () => {
    expect(
      isMcpServerConfig({
        id: 'a',
        transport: 'stdio',
        command: 'x',
        env: { K: 2 as unknown as string },
      }),
    ).toBe(false);
  });

  test('rejects sse missing url', () => {
    expect(isMcpServerConfig({ id: 'a', transport: 'sse' })).toBe(false);
  });

  test('rejects unknown transport', () => {
    expect(
      isMcpServerConfig({ id: 'a', transport: 'tcp', url: 'x' }),
    ).toBe(false);
  });
});
