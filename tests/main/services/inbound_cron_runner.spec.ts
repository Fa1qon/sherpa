// tests/main/services/inbound_cron_runner.spec.ts
// Track C Plan 04 — InboundCronRunner: only validation + cancel are
// exercised here. Real cron firing depends on wall-clock minute boundaries
// and is not deterministic in unit tests.

import { describe, test, expect } from 'vitest';
import { InboundCronRunner } from '../../../src/main/services/inbound_cron_runner';

describe('InboundCronRunner', () => {
  test('throws on invalid cron expression', () => {
    const runner = new InboundCronRunner();
    expect(() => runner.register('not-a-cron', () => {})).toThrow(/Invalid cron expression/i);
  });

  test('valid expression registers and cancel stops it', () => {
    const runner = new InboundCronRunner();
    const reg = runner.register('*/5 * * * *', () => {});
    expect(typeof reg.cancel).toBe('function');
    // cancel must not throw and must be idempotent (calling twice).
    reg.cancel();
    reg.cancel();
  });

  test('cancel after multiple registrations works independently', () => {
    const runner = new InboundCronRunner();
    const r1 = runner.register('0 * * * *', () => {});
    const r2 = runner.register('30 * * * *', () => {});
    r1.cancel();
    r2.cancel();
  });
});
