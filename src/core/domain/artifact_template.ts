import { randomUUID } from 'node:crypto';

export interface ArtifactTemplate {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly content: string;
  readonly stage_hint?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateTemplateInput {
  readonly name: string;
  readonly description?: string;
  readonly content: string;
  readonly stage_hint?: string;
}

export function makeTemplateId(): string {
  return `tmpl-${randomUUID()}`;
}
