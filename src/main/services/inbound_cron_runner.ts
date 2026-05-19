// src/main/services/inbound_cron_runner.ts
// Track C Plan 04 — wraps node-cron with a tiny registration API used by
// the ExternalGateEvaluator (and, in future, the Personal Assistant
// runner referenced in plan E15).

import cron from 'node-cron';

export interface CronRegistration {
  cancel(): void;
}

export class InboundCronRunner {
  /**
   * Schedule `callback` to fire on every cron tick.
   * Throws if the expression is invalid (delegated to `cron.validate`).
   * The returned registration stops the schedule when `cancel()` is called.
   */
  register(expression: string, callback: () => void | Promise<void>): CronRegistration {
    if (!cron.validate(expression)) {
      throw new Error(`Invalid cron expression: ${expression}`);
    }
    const task = cron.schedule(expression, () => {
      void callback();
    });
    task.start();
    return {
      cancel: () => {
        task.stop();
      },
    };
  }
}
