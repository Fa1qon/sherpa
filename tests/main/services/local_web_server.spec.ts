import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LocalWebServer } from '../../../src/main/services/local_web_server.js';

vi.setConfig({ testTimeout: 10_000 });

const INDEX_HTML = '<!doctype html><html><head><title>x</title></head><body>index</body></html>';
const STYLE_CSS = 'body { color: red; }';

async function makeStaticDir(withFixtures: boolean = true): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lws-static-'));
  if (withFixtures) {
    await fs.writeFile(path.join(dir, 'index.html'), INDEX_HTML, 'utf8');
    await fs.writeFile(path.join(dir, 'style.css'), STYLE_CSS, 'utf8');
  }
  return dir;
}

async function rm(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

describe('LocalWebServer', () => {
  let server: LocalWebServer;
  let staticDir: string;

  beforeEach(async () => {
    server = new LocalWebServer();
    staticDir = await makeStaticDir(true);
  });

  afterEach(async () => {
    try { await server.stop(); } catch { /* ignore */ }
    await rm(staticDir);
  });

  it('start() resolves with ephemeral port > 0', async () => {
    const { port } = await server.start({
      port: 0,
      host: '127.0.0.1',
      staticDir,
      apiHandler: async (_req, reply) => { reply.send({ ok: true }); },
    });
    expect(port).toBeGreaterThan(0);
  });

  it('GET /api/anything invokes apiHandler with original URL', async () => {
    const { port } = await server.start({
      port: 0,
      host: '127.0.0.1',
      staticDir,
      apiHandler: async (req, reply) => { reply.send({ ok: true, path: req.url }); },
    });
    const res = await fetch(`http://127.0.0.1:${port}/api/anything`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, path: '/api/anything' });
  });

  it('GET / returns index.html with text/html', async () => {
    const { port } = await server.start({
      port: 0,
      host: '127.0.0.1',
      staticDir,
      apiHandler: async (_req, reply) => { reply.send({ ok: true }); },
    });
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toBe(INDEX_HTML);
  });

  it('GET /missing.html falls back to index.html (SPA)', async () => {
    const { port } = await server.start({
      port: 0,
      host: '127.0.0.1',
      staticDir,
      apiHandler: async (_req, reply) => { reply.send({ ok: true }); },
    });
    const res = await fetch(`http://127.0.0.1:${port}/missing.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toBe(INDEX_HTML);
  });

  it('GET /style.css returns css with text/css', async () => {
    const { port } = await server.start({
      port: 0,
      host: '127.0.0.1',
      staticDir,
      apiHandler: async (_req, reply) => { reply.send({ ok: true }); },
    });
    const res = await fetch(`http://127.0.0.1:${port}/style.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/css/);
    const body = await res.text();
    expect(body).toBe(STYLE_CSS);
  });

  it('returns 404 when staticDir has no index.html and path missing', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lws-empty-'));
    try {
      const { port } = await server.start({
        port: 0,
        host: '127.0.0.1',
        staticDir: emptyDir,
        apiHandler: async (_req, reply) => { reply.send({ ok: true }); },
      });
      const res = await fetch(`http://127.0.0.1:${port}/anything`);
      expect(res.status).toBe(404);
    } finally {
      await rm(emptyDir);
    }
  });

  it('stop() closes the server', async () => {
    const { port } = await server.start({
      port: 0,
      host: '127.0.0.1',
      staticDir,
      apiHandler: async (_req, reply) => { reply.send({ ok: true }); },
    });
    // Sanity: server is up
    const up = await fetch(`http://127.0.0.1:${port}/`);
    expect(up.status).toBe(200);
    await up.text();

    await server.stop();

    // Subsequent fetch must reject (connection refused)
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
  });

  it('path traversal with sibling secret file does not leak content', async () => {
    // Create a sibling file OUTSIDE staticDir (in staticDir's parent)
    const parentDir = path.dirname(staticDir);
    const secretPath = path.join(parentDir, 'secret.txt');
    const SECRET_CONTENT = 'SUPER_SECRET_TOKEN_4287';
    await fs.writeFile(secretPath, SECRET_CONTENT, 'utf8');
    try {
      const { port } = await server.start({
        port: 0,
        host: '127.0.0.1',
        staticDir,
        apiHandler: async (_req, reply) => { reply.send({ ok: true }); },
      });
      // Try various traversal payloads
      const urls = [
        `http://127.0.0.1:${port}/../secret.txt`,
        `http://127.0.0.1:${port}/subfolder/../../secret.txt`,
      ];
      for (const u of urls) {
        const res = await fetch(u);
        // Must be SPA fallback (200 + index.html) or 404 — never the secret.
        expect([200, 404]).toContain(res.status);
        const body = await res.text();
        expect(body).not.toContain(SECRET_CONTENT);
        if (res.status === 200) {
          expect(res.headers.get('content-type')).toMatch(/text\/html/);
          expect(body).toBe(INDEX_HTML);
        }
      }
    } finally {
      await fs.rm(secretPath, { force: true });
    }
  });

  it('double start() closes prior listener and serves on new port', async () => {
    const first = await server.start({
      port: 0,
      host: '127.0.0.1',
      staticDir,
      apiHandler: async (_req, reply) => { reply.send({ ok: true }); },
    });
    // Sanity: first is up
    const up1 = await fetch(`http://127.0.0.1:${first.port}/`);
    expect(up1.status).toBe(200);
    await up1.text();

    // Second start() on a different ephemeral port should resolve cleanly
    const second = await server.start({
      port: 0,
      host: '127.0.0.1',
      staticDir,
      apiHandler: async (_req, reply) => { reply.send({ ok: true }); },
    });
    expect(second.port).toBeGreaterThan(0);
    expect(second.port).not.toBe(first.port);

    // New listener serves
    const up2 = await fetch(`http://127.0.0.1:${second.port}/`);
    expect(up2.status).toBe(200);
    await up2.text();

    // Old listener is closed
    await expect(fetch(`http://127.0.0.1:${first.port}/`)).rejects.toThrow();
  });

  it('path traversal attempt does not escape staticDir', async () => {
    const { port } = await server.start({
      port: 0,
      host: '127.0.0.1',
      staticDir,
      apiHandler: async (_req, reply) => { reply.send({ ok: true }); },
    });
    const res = await fetch(`http://127.0.0.1:${port}/../../etc/passwd`);
    // Either SPA fallback to index.html (200) or 404 — never a host file.
    if (res.status === 200) {
      expect(res.headers.get('content-type')).toMatch(/text\/html/);
      const body = await res.text();
      expect(body).toBe(INDEX_HTML);
    } else {
      expect(res.status).toBe(404);
      await res.text();
    }
  });
});
