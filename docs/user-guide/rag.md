# RAG search

Sherpa indexes your project files into a local vector store and a
typed knowledge graph. The agent reaches the index through six
`sherpa_*` MCP tools; you can also browse it directly through the
**RAG search** screen.

> Implements UX flow F10 (`design/ux.md` — RAG MCP integration) and
> requirement FR21 / FR22 (search and graph traversal).

## What gets indexed

The default RAG indexer scans:

- All source files matching `<project>/.gitignore` exclusions
  inverted — i.e. files NOT ignored by Git.
- Markdown documents under `<project>/docs/`.
- Task `meta.md` files under `<project>/projects/`.

You can extend or restrict the scope through
**Settings → RAG → Exclusion patterns** (glob list, applied AFTER
`.gitignore`).

Each indexed chunk carries metadata: file path, language, line
range, last-modified timestamp, and a SHA-256 of the chunk text so
re-indexing skips unchanged content.

## Triggering an index

[screenshot: RAG search empty state with "Build index" button]

The first time you open RAG search, the screen offers a **Build
index** button. Click it; a toast at the bottom right shows
incremental progress:

```
RAG: 45 % (1200 / 2700 chunks)  [Cancel]
```

Subsequent indexing is incremental — the file watcher
(`core/infrastructure` shared watcher) notifies the indexer about
changes and only the affected chunks are re-embedded.

Embeddings come from the configured `EmbeddingPort` adapter:

- **Ollama HTTP** (primary) — talks to a local Ollama server at
  `http://127.0.0.1:11434`.
- **transformers.js** (fallback) — runs in-process if Ollama is not
  reachable. Slower; useful for offline environments.

Configure the embedding backend in **Settings → RAG → Embedding
provider**.

## Searching

[screenshot: RAG search with a query and ranked code chunks]

1. Open the **RAG search** screen via the ActivityBar (book icon).
2. Type a natural-language query into the search box.
3. Press Enter. Ranked chunks appear below, each showing:
   - File path (clickable — opens the file at the chunk's line).
   - A snippet with the matched lines highlighted.
   - A score (cosine similarity).

Privacy preview: hover the snippet to see the **Privacy preview**
overlay that flags any PII detected by the bundled detector
(emails, phone numbers, secret-shaped tokens). PII heuristics live
in `src/core/application/rag/pii_detector.ts`.

## Graph search

[screenshot: Graph view — nodes for tasks, files, ADRs with related_task edges]

The **Graph** screen renders the RAG knowledge graph using Cytoscape
(fcose layout). Five node kinds and six edge kinds per FR22 typed
taxonomy:

| Node kind | Source |
|---|---|
| `task` | `tasks/<id>/meta.md` |
| `file` | source files |
| `adr` | `decisions/ADR-*.md` |
| `requirement` | `requirements.md` FR / NF entries |
| `methodology_stage` | overlay stages |

| Edge kind | Meaning |
|---|---|
| `mentions` | Free-text reference between docs |
| `implements` | Task → requirement |
| `related_task` | Task → task (manual or inferred) |
| `references_adr` | Code or task → ADR |
| `belongs_to` | File → task |
| `derived_from` | Methodology stage → overlay |

Click any node to see its incoming and outgoing edges; double-click
to focus a sub-graph at depth 1.

## How the agent uses RAG

When you open a project, Sherpa starts a local **MCP server** that
exposes six tools to Claude Code. The server registers itself in
`<project>/.claude/mcp.json` (preserving your existing entries — NF25)
under the `sherpa.rag` key.

The six tools:

| Tool | What it does |
|---|---|
| `sherpa_search_code` | Top-k vector search over code chunks. |
| `sherpa_search_docs` | Same, restricted to `docs/` and Markdown. |
| `sherpa_search_cases` | Search task `meta.md` for prior similar work. |
| `sherpa_search_tasks` | Filter tasks by stage / methodology. |
| `sherpa_get_task_context` | Fetch the full meta + chat history of a task by ID. |
| `sherpa_graph_neighbours` | Traverse the knowledge graph at given depth. |

When Claude Code calls these tools, the panel shows a `tool_running`
state pill — same as for any other tool. You can deny the call from
the permission card if a query is sensitive.

> Note: in v0.1, opening a project does NOT automatically start the
> MCP server — there is no `project:open` → `mcp:start` IPC wiring
> yet. The MCP adapter starts on-demand only. Auto-start lands in
> v0.2.

## Cancelling and rebuilding

The toast that shows indexing progress has a **Cancel** button —
clicking it stops the current pass at the next chunk boundary. You
can resume by triggering a manual re-index from
**Settings → RAG → Rebuild index**.

A full rebuild deletes the on-disk vector store
(`<project>/.sherpa/rag/index.db` for sqlite-vec or
`<project>/.sherpa/rag/vectra/` for the Vectra fallback) and starts
fresh. Use sparingly — for projects with thousands of files, the
first build can take 5–15 minutes on a laptop.

## Related documentation

- [Running an agent session](agent.md) — the agent uses RAG via MCP.
- [Settings — RAG](settings.md#rag-settings) — exclusion globs,
  embedding provider, threshold tuning.
- [Plugins](plugins.md) — extend RAG with custom file types.
