// sherpa_search_tasks — search past task `meta.md` + timeline. MVP-1 stub.

export interface SearchTasksArgs {
  readonly project_id?: string;
  readonly query: string;
  readonly top_k?: number;
  readonly methodology_filter?: string;
}

export interface TaskHit {
  readonly task_id: string;
  readonly title: string;
  readonly methodology: string;
  readonly current_stage: string;
  readonly last_active: string;
}

export interface SearchTasksResult {
  readonly tasks: ReadonlyArray<TaskHit>;
}

const definition = {
  name: 'sherpa_search_tasks',
  description:
    'Search past project tasks by query (matches title, summary, methodology).',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      query: { type: 'string' },
      top_k: { type: 'number', default: 5, minimum: 1, maximum: 50 },
      methodology_filter: { type: 'string' },
    },
    required: ['query'],
  } as const,
  outputSchema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            task_id: { type: 'string' },
            title: { type: 'string' },
            methodology: { type: 'string' },
            current_stage: { type: 'string' },
            last_active: { type: 'string' },
          },
          required: [
            'task_id',
            'title',
            'methodology',
            'current_stage',
            'last_active',
          ],
        },
      },
    },
    required: ['tasks'],
  } as const,
};

async function handler(rawArgs: Record<string, unknown>): Promise<SearchTasksResult> {
  const args = rawArgs as Partial<SearchTasksArgs>;
  if (typeof args.query !== 'string' || args.query.trim() === '') {
    throw new Error('query is required');
  }
  return { tasks: [] };
}

export const searchTasks = { definition, handler };
