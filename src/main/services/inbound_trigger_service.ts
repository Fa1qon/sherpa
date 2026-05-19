// src/main/services/inbound_trigger_service.ts
// Track C Plan 04 — InboundTriggerService: orchestrates pending external
// gates over the InboundHttpServer. Webhook gates register a pending
// entry with a random HMAC-style token; arriving POSTs validate the
// token and resolve the awaiting promise.
//
// Deviation from the plan's verbatim code: `awaitWebhook` returns
// `{ url, wait }` synchronously so callers can log the URL BEFORE the
// trigger fires. (The plan's draft returned a single Promise resolving
// to `{ url, result }` only after the POST, which made the URL
// invisible during the wait.)

import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { InboundHttpServer } from './inbound_http_server';
import type { TriggerPayload } from '../../core/domain/inbound_trigger';

interface PendingTrigger {
  readonly taskId: string;
  readonly gateId: string;
  readonly token: string;
  readonly resolve: (payload: TriggerPayload) => void;
  readonly reject: (err: Error) => void;
  timeoutHandle?: NodeJS.Timeout;
}

export interface TriggerReceivedEvent {
  readonly taskId: string;
  readonly gateId: string;
  readonly payload: TriggerPayload;
}

export interface AwaitWebhookResult {
  readonly url: string;
  readonly wait: Promise<TriggerPayload>;
}

export class InboundTriggerService {
  private readonly pending = new Map<string, PendingTrigger>();
  private readonly emitter = new EventEmitter();
  private readonly httpServer: InboundHttpServer;

  constructor() {
    this.httpServer = new InboundHttpServer(async (taskId, gateId, token, payload) => {
      const key = pendingKey(taskId, gateId);
      const trigger = this.pending.get(key);
      if (!trigger || !timingSafeEqual(trigger.token, token)) {
        return { ok: false, error: 'Unknown or invalid trigger' };
      }
      if (trigger.timeoutHandle) clearTimeout(trigger.timeoutHandle);
      this.pending.delete(key);
      trigger.resolve(payload);
      this.emitter.emit('trigger.received', { taskId, gateId, payload } satisfies TriggerReceivedEvent);
      return { ok: true };
    });
  }

  async start(port: number): Promise<{ port: number }> {
    return this.httpServer.start(port);
  }

  async stop(): Promise<void> {
    // Reject any outstanding waits so callers don't hang on shutdown.
    for (const [key, trigger] of this.pending) {
      if (trigger.timeoutHandle) clearTimeout(trigger.timeoutHandle);
      trigger.reject(new Error('InboundTriggerService stopped'));
      this.pending.delete(key);
    }
    return this.httpServer.stop();
  }

  /** Returns the actually-bound port (0 if not started). */
  getPort(): number {
    return this.httpServer.getPort();
  }

  /**
   * Register a webhook trigger. Returns the URL immediately AND a promise
   * that resolves with the payload when the POST arrives (or rejects /
   * resolves-as-pass on timeout per `onTimeout`).
   */
  awaitWebhook(
    taskId: string,
    gateId: string,
    timeoutMs: number,
    onTimeout: 'fail' | 'continue' | 'retry' = 'fail',
  ): AwaitWebhookResult {
    const key = pendingKey(taskId, gateId);
    if (this.pending.has(key)) {
      throw new Error(`Trigger already registered for ${key}`);
    }

    const port = this.httpServer.getPort();
    if (port === 0) {
      throw new Error('InboundTriggerService not started');
    }
    const token = crypto.randomBytes(16).toString('hex');
    const url = `http://127.0.0.1:${port}/triggers/${encodeURIComponent(taskId)}/${encodeURIComponent(gateId)}/${token}`;

    const wait = new Promise<TriggerPayload>((resolve, reject) => {
      const trigger: PendingTrigger = { taskId, gateId, token, resolve, reject };
      if (timeoutMs > 0) {
        trigger.timeoutHandle = setTimeout(() => {
          this.pending.delete(key);
          if (onTimeout === 'continue') {
            resolve({ outcome: 'pass', reason: 'timeout-continue' });
          } else {
            // 'fail' and 'retry' both surface as a rejected promise here;
            // the caller (ExternalGateEvaluator) decides retry semantics.
            reject(new Error('Trigger timeout'));
          }
        }, timeoutMs);
      }
      this.pending.set(key, trigger);
    });

    return { url, wait };
  }

  /** Cancel a pending trigger (e.g. task cancelled by user). */
  cancel(taskId: string, gateId: string): void {
    const key = pendingKey(taskId, gateId);
    const trigger = this.pending.get(key);
    if (!trigger) return;
    if (trigger.timeoutHandle) clearTimeout(trigger.timeoutHandle);
    this.pending.delete(key);
    trigger.reject(new Error('Cancelled'));
  }

  /** Subscribe to all received triggers; returns unsubscribe. */
  onTriggerReceived(handler: (ev: TriggerReceivedEvent) => void): () => void {
    this.emitter.on('trigger.received', handler);
    return () => this.emitter.off('trigger.received', handler);
  }
}

function pendingKey(taskId: string, gateId: string): string {
  return `${taskId}:${gateId}`;
}

/** Constant-time string compare to thwart token-timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  return crypto.timingSafeEqual(aBuf, bBuf);
}
