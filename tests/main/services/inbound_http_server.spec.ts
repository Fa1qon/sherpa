// tests/main/services/inbound_http_server.spec.ts
// Track C Plan 04 — InboundHttpServer integration tests against a real
// Fastify listener on a random port.

import { describe, test, expect, afterEach } from 'vitest';
import { InboundHttpServer, type TriggerHandler } from '../../../src/main/services/inbound_http_server';

describe('InboundHttpServer', () => {
  let server: InboundHttpServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  test('start on random port returns a non-zero port', async () => {
    const handler: TriggerHandler = async () => ({ ok: true });
    server = new InboundHttpServer(handler);
    const { port } = await server.start(0);
    expect(port).toBeGreaterThan(0);
    expect(server.getPort()).toBe(port);
  });

  test('POST /triggers/:taskId/:gateId/:token forwards to handler and returns 200', async () => {
    const calls: Array<{ taskId: string; gateId: string; token: string; outcome: string }> = [];
    const handler: TriggerHandler = async (taskId, gateId, token, payload) => {
      calls.push({ taskId, gateId, token, outcome: payload.outcome });
      return { ok: true };
    };
    server = new InboundHttpServer(handler);
    const { port } = await server.start(0);

    const resp = await fetch(`http://127.0.0.1:${port}/triggers/t1/g1/tok-abc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outcome: 'pass', reason: 'manual approve' }),
    });
    expect(resp.status).toBe(200);
    const json = (await resp.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(calls).toEqual([{ taskId: 't1', gateId: 'g1', token: 'tok-abc', outcome: 'pass' }]);
  });

  test('handler returning ok:false maps to 400 with error', async () => {
    const handler: TriggerHandler = async () => ({ ok: false, error: 'unknown trigger' });
    server = new InboundHttpServer(handler);
    const { port } = await server.start(0);
    const resp = await fetch(`http://127.0.0.1:${port}/triggers/x/y/z`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(resp.status).toBe(400);
    const json = (await resp.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toBe('unknown trigger');
  });

  test('empty body defaults outcome to "pass"', async () => {
    let observedOutcome = '';
    const handler: TriggerHandler = async (_t, _g, _tok, payload) => {
      observedOutcome = payload.outcome;
      return { ok: true };
    };
    server = new InboundHttpServer(handler);
    const { port } = await server.start(0);
    const resp = await fetch(`http://127.0.0.1:${port}/triggers/t/g/k`, { method: 'POST' });
    expect(resp.status).toBe(200);
    expect(observedOutcome).toBe('pass');
  });

  test('stop closes the listener; second start works', async () => {
    const handler: TriggerHandler = async () => ({ ok: true });
    server = new InboundHttpServer(handler);
    const { port: p1 } = await server.start(0);
    await server.stop();
    expect(server.getPort()).toBe(0);
    const { port: p2 } = await server.start(0);
    expect(p2).toBeGreaterThan(0);
    expect(p1).not.toBe(0);
  });
});
