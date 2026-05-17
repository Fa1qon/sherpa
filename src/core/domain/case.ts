import { randomUUID } from 'node:crypto';

export type CaseConfidence = 'low' | 'medium' | 'high';

export interface Case {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly methodology_id?: string;
  readonly source_task_id?: string;
  readonly confidence: CaseConfidence;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateCaseInput {
  readonly title: string;
  readonly summary?: string;
  readonly content?: string;
  readonly tags?: readonly string[];
  readonly methodology_id?: string;
  readonly source_task_id?: string;
  readonly confidence?: CaseConfidence;
}

export function makeCaseId(): string {
  return randomUUID();
}
