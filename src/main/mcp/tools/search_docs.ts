// sherpa_search_docs — search across `<project>/.sherpa/core/docs/` + project
// markdown. MVP-1 stub returns empty result set (full impl in Phase 3 RagPort).

export interface SearchDocsArgs {
  readonly query: string;
  readonly top_k?: number;
}

export interface DocHit {
  readonly doc_path: string;
  readonly title: string;
  readonly excerpt: string;
  readonly similarity_score: number;
}

export interface SearchDocsResult {
  readonly docs: ReadonlyArray<DocHit>;
}

const definition = {
  name: 'sherpa_search_docs',
  description:
    'Semantic search across project documentation (Sherpa core docs + project-local markdown).',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      top_k: { type: 'number', default: 5, minimum: 1, maximum: 50 },
    },
    required: ['query'],
  } as const,
  outputSchema: {
    type: 'object',
    properties: {
      docs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            doc_path: { type: 'string' },
            title: { type: 'string' },
            excerpt: { type: 'string' },
            similarity_score: { type: 'number' },
          },
          required: ['doc_path', 'title', 'excerpt', 'similarity_score'],
        },
      },
    },
    required: ['docs'],
  } as const,
};

async function handler(rawArgs: Record<string, unknown>): Promise<SearchDocsResult> {
  const args = rawArgs as Partial<SearchDocsArgs>;
  if (typeof args.query !== 'string' || args.query.trim() === '') {
    throw new Error('query is required');
  }
  return { docs: [] };
}

export const searchDocs = { definition, handler };
