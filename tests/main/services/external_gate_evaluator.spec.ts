// tests/main/services/external_gate_evaluator.spec.ts
// Track C Plan 04 — ExternalGateEvaluator dispatches to the right inbound
// runner and maps outcomes to GateEvaluation. Collaborators are stubbed
// so the test stays deterministic.

import { describe, test, expect, vi } from 'vitest';
import { ExternalGateEvaluator } from '../../../src/main/services/external_gate_evaluator';
import type { Gate } from '../../../src/core/domain/methodology';
import type { InboundTriggerService, AwaitWebhookResult } from '../../../src/main/services/inbound_trigger_service';
import type { InboundCronRunner, CronRegistration } from '../../../src/main/services/inbound_cron_runner';
import type { InboundFileWatcher, FileWatchRegistration, FileEvent } from '../../../src/main/services/inbound_file_watcher';

function makeStubs() {
  const inbound: Pick<InboundTriggerService, 'awaitWebhook'> = {
    awaitWebhook: vi.fn(),
  };
  const cron: Pick<InboundCronRunner, 'register'> = {
    register: vi.fn(),
  };
  const watcher: Pick<InboundFileWatcher, 'watch'> = {
    watch: vi.fn(),
  };
  return { inbound, cron, watcher };
}

describe('ExternalGateEvaluator', () => {
  test('webhook: passes when wait resolves with outcome=pass', async () => {
    const { inbound, cron, watcher } = makeStubs();
    const result: AwaitWebhookResult = {
      url: 'http://127.0.0.1:9999/triggers/t/g/tok',
      wait: Promise.resolve({ outcome: 'pass' }),
    };
    (inbound.awaitWebhook as ReturnType<typeof vi.fn>).mockReturnValue(result);

    const logs: Array<{ taskId: string; entry: Record<string, unknown> }> = [];
    const evaluator = new ExternalGateEvaluator(
      inbound as InboundTriggerService,
      cron as InboundCronRunner,
      watcher as InboundFileWatcher,
      { log: (taskId, entry) => logs.push({ taskId, entry }) },
    );

    const gate: Gate = {
      kind: 'external',
      items: [],
      trigger: { source: 'webhook' },
      timeoutMs: 5000,
    };
    const verdict = await evaluator.waitForTrigger(gate, { taskId: 't', gateId: 'g', workdir: '/tmp' });
    expect(verdict).toEqual({ kind: 'pass', items: [] });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.entry.url).toBe(result.url);
  });

  test('webhook: blocks when wait resolves with outcome=fail', async () => {
    const { inbound, cron, watcher } = makeStubs();
    (inbound.awaitWebhook as ReturnType<typeof vi.fn>).mockReturnValue({
      url: 'http://x',
      wait: Promise.resolve({ outcome: 'fail' }),
    } satisfies AwaitWebhookResult);

    const evaluator = new ExternalGateEvaluator(
      inbound as InboundTriggerService,
      cron as InboundCronRunner,
      watcher as InboundFileWatcher,
    );
    const gate: Gate = {
      kind: 'external',
      items: [],
      trigger: { source: 'webhook' },
    };
    const v = await evaluator.waitForTrigger(gate, { taskId: 't', gateId: 'g', workdir: '/' });
    expect(v).toEqual({ kind: 'block', items: [], blocking_count: 1 });
  });

  test('webhook: blocks when wait rejects (timeout)', async () => {
    const { inbound, cron, watcher } = makeStubs();
    (inbound.awaitWebhook as ReturnType<typeof vi.fn>).mockReturnValue({
      url: 'http://x',
      wait: Promise.reject(new Error('Trigger timeout')),
    } satisfies AwaitWebhookResult);

    const evaluator = new ExternalGateEvaluator(
      inbound as InboundTriggerService,
      cron as InboundCronRunner,
      watcher as InboundFileWatcher,
    );
    const gate: Gate = {
      kind: 'external',
      items: [],
      trigger: { source: 'webhook' },
    };
    const v = await evaluator.waitForTrigger(gate, { taskId: 't', gateId: 'g', workdir: '/' });
    expect(v.kind).toBe('block');
  });

  test('cron: resolves pass on first tick', async () => {
    const { inbound, cron, watcher } = makeStubs();
    let captured: (() => void) | null = null;
    const reg: CronRegistration = { cancel: vi.fn() };
    (cron.register as ReturnType<typeof vi.fn>).mockImplementation((_expr: string, cb: () => void) => {
      captured = cb;
      return reg;
    });

    const evaluator = new ExternalGateEvaluator(
      inbound as InboundTriggerService,
      cron as InboundCronRunner,
      watcher as InboundFileWatcher,
    );
    const gate: Gate = {
      kind: 'external',
      items: [],
      trigger: { source: 'cron', expression: '*/5 * * * *' },
    };
    const verdictP = evaluator.waitForTrigger(gate, { taskId: 't', gateId: 'g', workdir: '/' });
    // Fire the cron callback.
    expect(captured).toBeTruthy();
    captured!();
    const verdict = await verdictP;
    expect(verdict).toEqual({ kind: 'pass', items: [] });
    expect(reg.cancel).toHaveBeenCalled();
  });

  test('file: resolves pass on first event', async () => {
    const { inbound, cron, watcher } = makeStubs();
    let captured: ((event: FileEvent, p: string) => void) | null = null;
    const reg: FileWatchRegistration = { cancel: vi.fn() };
    (watcher.watch as ReturnType<typeof vi.fn>).mockImplementation(
      (
        _pattern: string,
        _events: readonly FileEvent[],
        cb: (event: FileEvent, p: string) => void,
      ) => {
        captured = cb;
        return reg;
      },
    );

    const evaluator = new ExternalGateEvaluator(
      inbound as InboundTriggerService,
      cron as InboundCronRunner,
      watcher as InboundFileWatcher,
    );
    const gate: Gate = {
      kind: 'external',
      items: [],
      trigger: { source: 'file', pattern: 'out/**/*.json', event: 'create' },
      timeoutMs: 5000,
    };
    const verdictP = evaluator.waitForTrigger(gate, { taskId: 't', gateId: 'g', workdir: '/tmp' });
    expect(captured).toBeTruthy();
    captured!('add', '/tmp/out/x.json');
    const verdict = await verdictP;
    expect(verdict).toEqual({ kind: 'pass', items: [] });
    expect(reg.cancel).toHaveBeenCalled();
  });

  test('file: blocks on timeout (no event fires)', async () => {
    const { inbound, cron, watcher } = makeStubs();
    const reg: FileWatchRegistration = { cancel: vi.fn() };
    (watcher.watch as ReturnType<typeof vi.fn>).mockReturnValue(reg);

    const evaluator = new ExternalGateEvaluator(
      inbound as InboundTriggerService,
      cron as InboundCronRunner,
      watcher as InboundFileWatcher,
    );
    const gate: Gate = {
      kind: 'external',
      items: [],
      trigger: { source: 'file', pattern: '*' },
      timeoutMs: 20,
    };
    const v = await evaluator.waitForTrigger(gate, { taskId: 't', gateId: 'g', workdir: '/' });
    expect(v.kind).toBe('block');
  });

  test('telegram: blocks (reserved for future plan)', async () => {
    const { inbound, cron, watcher } = makeStubs();
    const evaluator = new ExternalGateEvaluator(
      inbound as InboundTriggerService,
      cron as InboundCronRunner,
      watcher as InboundFileWatcher,
    );
    const gate: Gate = {
      kind: 'external',
      items: [],
      trigger: { source: 'telegram', botToken: 'x', command: '/y' },
    };
    const v = await evaluator.waitForTrigger(gate, { taskId: 't', gateId: 'g', workdir: '/' });
    expect(v.kind).toBe('block');
  });

  test('missing trigger blocks with a safe default', async () => {
    const { inbound, cron, watcher } = makeStubs();
    const evaluator = new ExternalGateEvaluator(
      inbound as InboundTriggerService,
      cron as InboundCronRunner,
      watcher as InboundFileWatcher,
    );
    const gate: Gate = { kind: 'external', items: [] };
    const v = await evaluator.waitForTrigger(gate, { taskId: 't', gateId: 'g', workdir: '/' });
    expect(v).toEqual({ kind: 'block', items: [], blocking_count: 1 });
  });
});
