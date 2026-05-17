// sherpa_search_code — semantic + BM25 hybrid search over project code.
//
// MVP-1 scope (T-L2-G AC-3): the worker process does not yet have direct
// access to the host StoragePort + EmbeddingPort instances (they live in the
// main Electron process). Real wiring lands when Phase 3 introduces a
// dedicated RagPort and the worker either re-binds those adapters in-process
// or speaks IPC to the main process.
//
// Until then, this tool returns a shape-correct empty result set so the MCP
// `tools/call` round-trip succeeds and Claude Code can discover the tool
// surface. The schema is the formal contract from rag.md §10.1.

export interface SearchCodeArgs {
  readonly project_id?: string;
  readonly query: string;
  readonly top_k?: number;
  readonly filter_languages?: ReadonlyArray<string>;
  readonly min_similarity?: number;
}

export interface SearchHit {
  readonly chunk_id: string;
  readonly file_path: string;
  readonly start_line: number;
  readonly end_line: number;
  readonly content: string;
  readonly similarity_score: number;
  readonly language: string;
}

export interface SearchCodeResult {
  readonly results: ReadonlyArray<SearchHit>;
}

const definition = {
  name: 'sherpa_search_code',
  description:
    'Semantic + BM25 hybrid search across the active project code. Returns ranked chunks with file path + line range.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'natural-language search query' },
      project_id: { type: 'string' },
      top_k: { type: 'number', default: 5, minimum: 1, maximum: 50 },
      filter_languages: {
        type: 'array',
        items: { type: 'string' },
        description: 'restrict to language tags (e.g. ["typescript", "go"])',
      },
      min_similarity: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['query'],
  } as const,
  outputSchema: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            chunk_id: { type: 'string' },
            file_path: { type: 'string' },
            start_line: { type: 'number' },
            end_line: { type: 'number' },
            content: { type: 'string' },
            similarity_score: { type: 'number' },
            language: { type: 'string' },
          },
          required: [
            'chunk_id',
            'file_path',
            'start_line',
            'end_line',
            'content',
            'similarity_score',
            'language',
          ],
        },
      },
    },
    required: ['results'],
  } as const,
};

async function handler(rawArgs: Record<string, unknown>): Promise<SearchCodeResult> {
  const args = rawArgs as Partial<SearchCodeArgs>;
  if (typeof args.query !== 'string' || args.query.trim() === '') {
    throw new Error('query is required');
  }
  // MVP-1 stub — returns empty results. The contract holds: caller receives
  // a `{ results: [] }` object that conforms to outputSchema.
  return { results: [] };
}

export const searchCode = { definition, handler };
