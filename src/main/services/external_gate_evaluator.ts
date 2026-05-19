// src/main/services/external_gate_evaluator.ts
// Track C Plan 04 — Dispatches an external gate to the right inbound
// runner (webhook / cron / file). Returns a GateEvaluation shaped
// identically to the standard GateEvaluator so the engine can treat
// pass/block uniformly regardless of gate kind.

import path from 'node:path';
import type { Gate } from '../../core/domain/methodology';
import type { InboundTriggerService } from './inbound_trigger_service';
import type { InboundCronRunner } from './inbound_cron_runner';
import type { InboundFileWatcher, FileEvent } from './inbound_file_watcher';
import type { GateEvaluation } from './gate_evaluator';

export interface ExternalEvaluationContext {
  readonly taskId: string;
  readonly gateId: string;
  readonly workdir: string;
}

export interface ExternalGateLogEntry {
  readonly type: string;
  readonly gate?: string;
  readonly url?: string;
  readonly [k: string]: unknown;
}

export interface ExternalGateLogger {
  log(taskId: string, entry: ExternalGateLogEntry): void;
}

const DEFAULT_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h

export class ExternalGateEvaluator {
  constructor(
    private readonly inboundService: InboundTriggerService,
    private readonly cronRunner: InboundCronRunner,
    private readonly fileWatcher: InboundFileWatcher,
    private readonly logger: ExternalGateLogger | null = null,
  ) {}

  async waitForTrigger(gate: Gate, ctx: ExternalEvaluationContext): Promise<GateEvaluation> {
    const trigger = gate.trigger;
    if (!trigger) {
      // Misconfigured external gate — block by default so the user notices.
      return { kind: 'block', items: [], blocking_count: 1 };
    }
    const timeoutMs = gate.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const onTimeout = gate.onTimeout ?? 'fail';

    if (trigger.source === 'webhook') {
      try {
        const { url, wait } = this.inboundService.awaitWebhook(
          ctx.taskId,
          ctx.gateId,
          timeoutMs,
          onTimeout,
        );
        this.logger?.log(ctx.taskId, { type: 'external-gate-url', gate: ctx.gateId, url });
        const result = await wait;
        return result.outcome === 'pass'
          ? { kind: 'pass', items: [] }
          : { kind: 'block', items: [], blocking_count: 1 };
      } catch {
        return { kind: 'block', items: [], blocking_count: 1 };
      }
    }

    if (trigger.source === 'cron') {
      return await new Promise<GateEvaluation>((resolve) => {
        const reg = this.cronRunner.register(trigger.expression, () => {
          reg.cancel();
          resolve({ kind: 'pass', items: [] });
        });
      });
    }

    if (trigger.source === 'file') {
      return await new Promise<GateEvaluation>((resolve) => {
        const events: readonly FileEvent[] =
          trigger.event === 'any' || trigger.event === undefined
            ? ['add', 'change', 'unlink']
            : [mapFileEvent(trigger.event)];
        let cancelled = false;
        const timer = setTimeout(() => {
          if (cancelled) return;
          cancelled = true;
          reg.cancel();
          resolve({ kind: 'block', items: [], blocking_count: 1 });
        }, timeoutMs);
        const reg = this.fileWatcher.watch(
          path.resolve(ctx.workdir, trigger.pattern),
          events,
          () => {
            if (cancelled) return;
            cancelled = true;
            clearTimeout(timer);
            reg.cancel();
            resolve({ kind: 'pass', items: [] });
          },
        );
      });
    }

    // telegram — reserved for a future plan; block until implemented.
    return { kind: 'block', items: [], blocking_count: 1 };
  }
}

function mapFileEvent(e: 'create' | 'modify' | 'delete'): FileEvent {
  return e === 'create' ? 'add' : e === 'modify' ? 'change' : 'unlink';
}
