// sherpa_search_cases — search the case corpus (METH-035) attached to the
// project. MVP-1 stub returns empty result set; full impl Phase 3.

export interface SearchCasesArgs {
  readonly project_id?: string;
  readonly query: string;
  readonly top_k?: number;
}

export interface CaseHit {
  readonly case_id: string;
  readonly title: string;
  readonly excerpt: string;
  readonly similarity_score: number;
}

export interface SearchCasesResult {
  readonly cases: ReadonlyArray<CaseHit>;
}

const definition = {
  name: 'sherpa_search_cases',
  description:
    'Search the project case corpus (e.g. METH-035 cases) for similar past situations.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      query: { type: 'string' },
      top_k: { type: 'number', default: 5, minimum: 1, maximum: 50 },
    },
    required: ['query'],
  } as const,
  outputSchema: {
    type: 'object',
    properties: {
      cases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            case_id: { type: 'string' },
            title: { type: 'string' },
            excerpt: { type: 'string' },
            similarity_score: { type: 'number' },
          },
          required: ['case_id', 'title', 'excerpt', 'similarity_score'],
        },
      },
    },
    required: ['cases'],
  } as const,
};

async function handler(rawArgs: Record<string, unknown>): Promise<SearchCasesResult> {
  const args = rawArgs as Partial<SearchCasesArgs>;
  if (typeof args.query !== 'string' || args.query.trim() === '') {
    throw new Error('query is required');
  }
  return { cases: [] };
}

export const searchCases = { definition, handler };
