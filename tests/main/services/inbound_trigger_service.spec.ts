// tests/main/services/inbound_trigger_service.spec.ts
// Track C Plan 04 — InboundTriggerService unit tests.
// Uses a real HTTP listener on a random port; fetch is global in Node 22.

import { describe, test, expect, afterEach } from 'vitest';
import { InboundTriggerService } from '../../../src/main/services/inbound_trigger_service';

describe('InboundTriggerService', () => {
  let svc: InboundTriggerService | null = null;

  afterEach(async () => {
    if (svc) {
      await svc.stop();
      svc = null;
    }
  });

  test('awaitWebhook resolves when a matching POST arrives', async () => {
    svc = new InboundTriggerService();
    await svc.start(0);
    const { url, wait } = svc.awaitWebhook('task-1', 'gate-1', 5000);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/triggers\/task-1\/gate-1\/[0-9a-f]{32}$/);

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outcome: 'pass', reason: 'manual' }),
    });
    expect(resp.status).toBe(200);
    const payload = await wait;
    expect(payload.outcome).toBe('pass');
    expect(payload.reason).toBe('manual');
  });

  test('POST with wrong token returns 400 and does not resolve the wait', async () => {
    svc = new InboundTriggerService();
    await svc.start(0);
    const { url, wait } = svc.awaitWebhook('t', 'g', 5000);
    // Tamper with token.
    const tamperedUrl = url.replace(/\/[0-9a-f]{32}$/, '/00000000000000000000000000000000');
    const resp = await fetch(tamperedUrl, { method: 'POST', body: '{}' });
    expect(resp.status).toBe(400);

    // Now fire the correct one to make sure wait still resolves.
    const ok = await fetch(url, { method: 'POST', body: '{}' });
    expect(ok.status).toBe(200);
    const payload = await wait;
    expect(payload.outcome).toBe('pass'); // default when body is empty
  });

  test('cancel() rejects the pending wait', async () => {
    svc = new InboundTriggerService();
    await svc.start(0);
    const { wait } = svc.awaitWebhook('t', 'g', 5000);
    svc.cancel('t', 'g');
    await expect(wait).rejects.toThrow(/cancelled/i);
  });

  test('registering the same gate twice throws', async () => {
    svc = new InboundTriggerService();
    await svc.start(0);
    // First registration should still resolve eventually; cancel after to clean up.
    const first = svc.awaitWebhook('t', 'g', 60_000);
    expect(() => svc!.awaitWebhook('t', 'g', 60_000)).toThrow(/already registered/i);
    svc.cancel('t', 'g');
    await expect(first.wait).rejects.toThrow();
  });

  test('timeout with onTimeout=fail rejects', async () => {
    svc = new InboundTriggerService();
    await svc.start(0);
    const { wait } = svc.awaitWebhook('t', 'g', 30, 'fail');
    await expect(wait).rejects.toThrow(/timeout/i);
  });

  test('timeout with onTimeout=continue resolves as pass', async () => {
    svc = new InboundTriggerService();
    await svc.start(0);
    const { wait } = svc.awaitWebhook('t', 'g', 30, 'continue');
    const payload = await wait;
    expect(payload.outcome).toBe('pass');
    expect(payload.reason).toBe('timeout-continue');
  });

  test('onTriggerReceived fires for resolved triggers', async () => {
    svc = new InboundTriggerService();
    await svc.start(0);
    const events: Array<{ taskId: string; gateId: string }> = [];
    const unsub = svc.onTriggerReceived((ev) => {
      events.push({ taskId: ev.taskId, gateId: ev.gateId });
    });
    const { url, wait } = svc.awaitWebhook('t-evt', 'g-evt', 5000);
    await fetch(url, { method: 'POST', body: '{}' });
    await wait;
    expect(events).toEqual([{ taskId: 't-evt', gateId: 'g-evt' }]);
    unsub();
  });

  test('awaitWebhook before start throws', () => {
    svc = new InboundTriggerService();
    expect(() => svc!.awaitWebhook('t', 'g', 1000)).toThrow(/not started/i);
  });
});
