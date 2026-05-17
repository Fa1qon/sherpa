// sherpa_graph_neighbours — typed graph neighbours query (FR22).
//
// CRITICAL (T-L2-G AC-7): this tool formalises the FR22 graph taxonomy at the
// MCP boundary. The schema below is the contract Sherpa exposes to Claude
// Code; it must match the storage-layer schema in design/rag.md §5.1.
//
// Node kinds (rag.md §5.1):
//   • file       — source file (TypeScript, Markdown, …)
//   • symbol     — code symbol (function / class / interface)
//   • task       — METH-035 task (`<project>/projects/<p>/tasks/<id>/`)
//   • doc_section — markdown heading anchor under `<install>/core/docs/`
//   • methodology — methodology id (e.g. METH-070)
//
// Edge kinds (rag.md §5.1):
//   • imports        — file → file (TS / JS imports)
//   • wiki_link      — doc → doc ([[name]] markdown links)
//   • related_task   — task → task (continues / amends / depends_on / spawned_from)
//   • sibling        — generic structural sibling
//   • parent_child   — directory parent → file/dir, or task subtree
//   • uses_methodology — task → methodology
//
// MVP-1 stub returns an empty subgraph (zero nodes + zero edges). The
// outputSchema is fully typed so Claude Code can rely on the shape regardless
// of the data being available in Phase 2 (full graph implementation Phase 3).

export type NodeKind =
  | 'file'
  | 'symbol'
  | 'task'
  | 'doc_section'
  | 'methodology';

export type EdgeKind =
  | 'imports'
  | 'wiki_link'
  | 'related_task'
  | 'sibling'
  | 'parent_child'
  | 'uses_methodology';

export interface GraphNode {
  readonly node_id: string;
  readonly kind: NodeKind;
  readonly name: string;
  readonly metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: EdgeKind;
  readonly weight: number;
  readonly metadata?: Record<string, unknown>;
}

export interface GraphNeighboursArgs {
  readonly node_id: string;
  readonly depth?: number;
  readonly edge_kinds?: ReadonlyArray<EdgeKind>;
}

export interface GraphNeighboursResult {
  readonly nodes: ReadonlyArray<GraphNode>;
  readonly edges: ReadonlyArray<GraphEdge>;
}

const NODE_KIND_VALUES: ReadonlyArray<NodeKind> = [
  'file',
  'symbol',
  'task',
  'doc_section',
  'methodology',
];

const EDGE_KIND_VALUES: ReadonlyArray<EdgeKind> = [
  'imports',
  'wiki_link',
  'related_task',
  'sibling',
  'parent_child',
  'uses_methodology',
];

const definition = {
  name: 'sherpa_graph_neighbours',
  description:
    'Return typed neighbours of a graph node (FR22). Output is a strict {nodes, edges} subgraph following the formal taxonomy.',
  inputSchema: {
    type: 'object',
    properties: {
      node_id: { type: 'string' },
      depth: { type: 'number', default: 1, minimum: 1, maximum: 5 },
      edge_kinds: {
        type: 'array',
        items: { type: 'string', enum: EDGE_KIND_VALUES as string[] },
        description: 'restrict expansion to these edge kinds',
      },
    },
    required: ['node_id'],
  } as const,
  outputSchema: {
    type: 'object',
    properties: {
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            node_id: { type: 'string' },
            kind: { type: 'string', enum: NODE_KIND_VALUES as string[] },
            name: { type: 'string' },
            metadata: { type: 'object' },
          },
          required: ['node_id', 'kind', 'name'],
        },
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            kind: { type: 'string', enum: EDGE_KIND_VALUES as string[] },
            weight: { type: 'number' },
            metadata: { type: 'object' },
          },
          required: ['from', 'to', 'kind', 'weight'],
        },
      },
    },
    required: ['nodes', 'edges'],
  } as const,
};

async function handler(
  rawArgs: Record<string, unknown>,
): Promise<GraphNeighboursResult> {
  const args = rawArgs as Partial<GraphNeighboursArgs>;
  if (typeof args.node_id !== 'string' || args.node_id.trim() === '') {
    throw new Error('node_id is required');
  }
  // MVP-1: return an empty subgraph. The shape is locked for FR22 contract
  // formalisation — clients can rely on `nodes`/`edges` being present arrays
  // even when the underlying graph store is offline.
  return { nodes: [], edges: [] };
}

export const graphNeighbours = { definition, handler };

// Public re-exports for tests that need to assert taxonomy enforcement.
export { NODE_KIND_VALUES, EDGE_KIND_VALUES };
