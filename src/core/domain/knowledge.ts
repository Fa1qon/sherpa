import { randomUUID } from 'node:crypto';

export interface KnowledgeItem {
  readonly id: string;
  readonly title: string;
  readonly category?: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateKnowledgeInput {
  readonly title: string;
  readonly category?: string;
  readonly content: string;
  readonly tags?: readonly string[];
}

export function makeKnowledgeId(): string {
  return `k-${randomUUID()}`;
}
