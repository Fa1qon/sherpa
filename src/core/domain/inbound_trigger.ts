// src/core/domain/inbound_trigger.ts
// Track C Plan 04 — InboundTriggerConfig types for the `external` gate kind.
// Domain layer: pure types, no main/presentation imports.

export type InboundSource = 'webhook' | 'cron' | 'file' | 'telegram';

export interface WebhookTriggerConfig {
  readonly source: 'webhook';
  /** Optional path prefix; default '/triggers'. Reserved for future use. */
  readonly pathPrefix?: string;
}

export interface CronTriggerConfig {
  readonly source: 'cron';
  /** Standard cron expression (5- or 6-field). */
  readonly expression: string;
}

export interface FileTriggerConfig {
  readonly source: 'file';
  /** Glob or path pattern, resolved relative to project root. */
  readonly pattern: string;
  readonly event?: 'create' | 'modify' | 'delete' | 'any';
}

export interface TelegramTriggerConfig {
  readonly source: 'telegram';
  readonly botToken: string;
  /** e.g., '/approve'. */
  readonly command: string;
  /** Optional username filter. */
  readonly fromUser?: string;
}

export type InboundTriggerConfig =
  | WebhookTriggerConfig
  | CronTriggerConfig
  | FileTriggerConfig
  | TelegramTriggerConfig;

export type TriggerOutcome = 'pass' | 'fail';

export interface TriggerPayload {
  readonly outcome: TriggerOutcome;
  readonly reason?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}
