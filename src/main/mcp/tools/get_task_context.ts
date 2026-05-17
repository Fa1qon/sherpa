// sherpa_get_task_context — return current task's methodology / stage /
// recent decisions so the agent can self-orient. MVP-1 stub.

export interface GetTaskContextArgs {
  readonly project_id?: string;
  readonly task_id?: string;
}

export interface PromptContext {
  readonly task_id: string | null;
  readonly methodology: string | null;
  readonly stage: string | null;
  readonly recent_decisions: ReadonlyArray<{
    readonly title: string;
    readonly summary: string;
    readonly ts: string;
  }>;
}

const definition = {
  name: 'sherpa_get_task_context',
  description:
    'Return current task context: methodology, stage, recent decisions. Lets the agent self-orient without re-reading meta.md.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      task_id: { type: 'string' },
    },
  } as const,
  outputSchema: {
    type: 'object',
    properties: {
      task_id: { type: ['string', 'null'] },
      methodology: { type: ['string', 'null'] },
      stage: { type: ['string', 'null'] },
      recent_decisions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            ts: { type: 'string' },
          },
          required: ['title', 'summary', 'ts'],
        },
      },
    },
    required: ['task_id', 'methodology', 'stage', 'recent_decisions'],
  } as const,
};

async function handler(_rawArgs: Record<string, unknown>): Promise<PromptContext> {
  return {
    task_id: null,
    methodology: null,
    stage: null,
    recent_decisions: [],
  };
}

export const getTaskContext = { definition, handler };
