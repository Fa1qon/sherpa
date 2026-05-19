// src/main/services/inbound_http_server.ts
// Track C Plan 04 — Fastify-based ingress for inbound triggers.
//
// Listens on a configurable local port (default 19222, or 0 for random).
// Exposes POST /triggers/:taskId/:gateId/:token. The handler delegates to
// the supplied TriggerHandler which performs token validation + resolves
// the pending external gate.
//
// Bundle: Fastify lives in main process only (~120 KB). No renderer
// dependency — this file MUST NOT be imported from src/presentation.

import Fastify, { type FastifyInstance } from 'fastify';
import type { TriggerPayload } from '../../core/domain/inbound_trigger';

export type TriggerHandler = (
  taskId: string,
  gateId: string,
  token: string,
  payload: TriggerPayload,
) => Promise<{ ok: boolean; error?: string }>;

interface TriggerRouteParams {
  readonly taskId: string;
  readonly gateId: string;
  readonly token: string;
}

export class InboundHttpServer {
  private app: FastifyInstance | null = null;
  private port = 0;

  constructor(private readonly handler: TriggerHandler) {}

  async start(port: number, host = '127.0.0.1'): Promise<{ port: number }> {
    if (this.app) {
      return { port: this.port };
    }
    const app = Fastify({ logger: false });
    app.post<{ Params: TriggerRouteParams; Body: Partial<TriggerPayload> }>(
      '/triggers/:taskId/:gateId/:token',
      async (req, reply) => {
        const { taskId, gateId, token } = req.params;
        const body = (req.body ?? {}) as Partial<TriggerPayload>;
        const payload: TriggerPayload = {
          outcome: body.outcome ?? 'pass',
          ...(body.reason !== undefined && { reason: body.reason }),
          ...(body.data !== undefined && { data: body.data }),
        };
        const result = await this.handler(taskId, gateId, token, payload);
        if (!result.ok) {
          return reply.status(400).send({ ok: false, error: result.error ?? 'Bad request' });
        }
        return reply.send({ ok: true });
      },
    );

    const url = await app.listen({ port, host });
    const m = /:(\d+)(?:\/|$)/.exec(url);
    this.port = m ? Number.parseInt(m[1]!, 10) : port;
    this.app = app;
    return { port: this.port };
  }

  async stop(): Promise<void> {
    if (this.app) {
      const app = this.app;
      this.app = null;
      this.port = 0;
      await app.close();
    }
  }

  getPort(): number {
    return this.port;
  }
}
