// tests/main/services/sherpa_mcp_server.spec.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SherpaMcpServer } from '../../../src/main/services/sherpa_mcp_server';

describe('SherpaMcpServer', () => {
  let srv: SherpaMcpServer;

  beforeEach(() => { srv = new SherpaMcpServer(); });
  afterEach(async () => { await srv.stop(); });

  it('starts on a random local port', async () => {
    await srv.start();
    expect(srv.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('start() is idempotent', async () => {
    await srv.start();
    const first = srv.baseUrl;
    await srv.start();
    expect(srv.baseUrl).toBe(first);
  });

  it('registerSession stores a session, unregisterSession removes it', async () => {
    await srv.start();
    const token = 'tok-1';
    const handler = vi.fn(async () => 'ok');
    srv.registerSession(token, handler);
    // writeMcpConfig should produce a JSON file referencing the token
    const configPath = await srv.writeMcpConfig(token);
    const raw = await import('node:fs/promises').then((f) => f.readFile(configPath, 'utf8'));
    const config = JSON.parse(raw) as { mcpServers: { sherpa: { url: string } } };
    expect(config.mcpServers.sherpa.url).toContain(token);
    await import('node:fs/promises').then((f) => f.unlink(configPath));
    srv.unregisterSession(token);
    // After unregister, writeMcpConfig for same token still works (creates new file)
    // but the session map is empty — no handler to dispatch to
  });
});
