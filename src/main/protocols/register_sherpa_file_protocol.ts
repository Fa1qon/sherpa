// Visual Formats Plan 01 — Task 6.
//
// Electron-side registration for the `sherpa-file://` scheme. Kept separate
// from `./sherpa_file_protocol.ts` so the pure resolver can be unit-tested
// under the vitest `node` environment without importing the electron module
// (which only exports a binary path under raw Node).
//
// Scheme privileges (registered in `src/main/index.ts` before app-ready):
//   - standard         — URL is parsed against the WHATWG URL standard
//   - secure           — treated as a secure context (fetch / mixed-content)
//   - supportFetchAPI  — usable from `fetch()` and `<img>` in the renderer
//   - stream           — supports streaming responses
//
// Resolution and security rules live in `./sherpa_file_protocol.ts`; this
// module is the thin I/O shell that turns a resolved path into a Response.

import path from 'node:path';
import { protocol } from 'electron';
import { promises as fs } from 'node:fs';
import { resolveSherpaFileUrl } from './sherpa_file_protocol';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

/**
 * Registers the `sherpa-file://` protocol handler with Electron. Must be
 * called AFTER `app.whenReady()` resolves; the scheme itself must be marked
 * privileged via `protocol.registerSchemesAsPrivileged(...)` BEFORE ready.
 */
export function registerSherpaFileProtocol(): void {
  protocol.handle('sherpa-file', async (request) => {
    const abs = resolveSherpaFileUrl(request.url);
    if (abs === null) {
      return new Response('Not Found', { status: 404 });
    }
    try {
      const data = await fs.readFile(abs);
      const ext = path.extname(abs).toLowerCase();
      const mime = MIME[ext] ?? 'application/octet-stream';
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: { 'content-type': mime, 'cache-control': 'no-cache' },
      });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });
}
