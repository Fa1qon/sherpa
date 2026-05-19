import Fastify, { type FastifyInstance } from 'fastify';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface ServerOptions {
  port: number;
  host?: string;
  staticDir: string;                  // path to mobile UI build
  apiHandler: (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
}

export class LocalWebServer {
  private app: FastifyInstance | null = null;

  async start(opts: ServerOptions): Promise<{ port: number }> {
    if (this.app) {
      await this.stop();
    }
    this.app = Fastify({ logger: false });

    // Mount /api/* — apiHandler decides per-route
    this.app.all('/api/*', opts.apiHandler);

    // Static files for everything else (SPA fallback)
    this.app.get('/*', async (req, reply) => {
      const url = (req.url ?? '/').split('?')[0];
      const safe = url.replace(/[^\w.\-/]/g, '');
      let target = path.join(opts.staticDir, safe);
      try {
        // Containment check: ensure resolved path stays inside staticDir
        const resolved = path.resolve(target);
        const rootResolved = path.resolve(opts.staticDir);
        if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
          throw new Error('traversal');
        }
        const st = await fs.stat(target);
        if (st.isDirectory()) target = path.join(target, 'index.html');
        const body = await fs.readFile(target);
        const ext = path.extname(target);
        const mime = MIME[ext] ?? 'application/octet-stream';
        reply.header('content-type', mime).send(body);
      } catch {
        // SPA fallback
        try {
          const indexBody = await fs.readFile(path.join(opts.staticDir, 'index.html'));
          reply.header('content-type', 'text/html').send(indexBody);
        } catch {
          reply.status(404).send('Not Found');
        }
      }
    });

    const url = await this.app.listen({ port: opts.port, host: opts.host ?? '0.0.0.0' });
    const m = /:(\d+)$/.exec(url);
    return { port: m ? parseInt(m[1]) : opts.port };
  }

  async stop(): Promise<void> {
    if (this.app) {
      await this.app.close();
      this.app = null;
    }
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
};
