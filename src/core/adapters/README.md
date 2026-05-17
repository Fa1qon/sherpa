# Core Adapters

Concrete implementations of ports — the outer ring of the
Hexagonal-Lite architecture per ADR-001.

## Purpose

Adapters bind external concerns (Claude Code CLI, sqlite-vec, Ollama,
electron-updater, the filesystem, MCP servers, …) to the abstract
ports declared in `core/ports/`. Every adapter lives in its own
subdirectory so that adding a new backend is a pure file-add operation
— the structural backbone of NF1 and NF2 modifiability.

Subdirectories (one per port family):

- `agents/` — implementations of `AgentPort`. Claude Code in MVP-1.
- `storage/` — `StoragePort` (sqlite-vec baseline + atomic writes).
- `embedding/` — `EmbeddingPort` (Ollama HTTP, transformers.js fallback).
- `docs/` — `DocsPort` (filesystem + remark renderer).
- `updater/` — `UpdaterPort` (electron-updater wrapper).
- `sherpa_cli/` — `SherpaCliPort` (subprocess wrapper).
- `plugin/` — `PluginPort` (3-tier discovery, ADR-009).
- `hook/` — `HookPort` (audit log emission, ADR-010).
- `mcp/` — `McpServerPort` (lifecycle, ADR-011).
- `subagent/` — `SubagentMonitorPort` (observation, ADR-012).
- `mock/` — in-memory mock adapters used by tests and L1 dry-runs.

Adapters are loaded lazily by the Composition Root per ADR-007 to keep
startup time within NF7 budget; only the agents/storage/docs trio is
eagerly instantiated for first-paint readiness.

## Public API

Each adapter subdirectory exports a single class or factory implementing
its port. The Composition Root (`src/main/composition_root.ts`) imports
and registers them inside the ten marker regions (`// --- agent ---`,
`// --- storage ---`, …).

Real adapters shipped in v0.1:

- `agents/claude_code/` — PTY-driven Claude Code subprocess wrapper
  with prompt parser, allowlist persistence (NF25-preserving
  `<project>/.claude/settings.json` merge) and audit hook fan-out.
  `CLAUDE_CODE_NODE_SCRIPT` env seam injects test stubs.
- `storage/sqlite_vec_adapter.ts` — primary `StoragePort` backed by
  `better-sqlite3` + `sqlite-vec`. Recursive `list()`.
- `storage/vectra_adapter.ts` — fallback `StoragePort` using the
  Vectra file-system index.
- `embedding/` — Ollama HTTP primary + transformers.js fallback.
- `docs/` — remark-based renderer + filesystem index.
- `updater/electron_updater_adapter.ts` — wraps `autoUpdater`. Test
  seam: `SHERPA_AUTO_UPDATER_MOCK` env points the composition root
  at a JSON scenario file.
- `sherpa_cli/sherpa_cli_adapter.ts` — subprocess wrapper. Env seams:
  `SHERPA_CLI_PATH`, `SHERPA_CLI_NODE_SCRIPT` (Windows-friendly
  Node-script injection).
- `plugin/plugin_loader_adapter.ts` — three-tier discovery (bundled /
  user-global / workspace) per ADR-009. Defense-in-depth on B1-SEC
  (path traversal), B2-SEC (trust gate), B4-SEC (security-critical
  override block).
- `hook/hook_adapter.ts` — managed inline handlers
  (`sherpa.audit.log`, `sherpa.verify.language`,
  `sherpa.notify.user`) per ADR-010. `SHERPA_AUDIT_LOG_PATH` env
  seam redirects audit log destination for tests.
- `mcp/mcp_server_adapter.ts` — Sherpa RAG MCP server lifecycle
  with NF25-preserving `<project>/.claude/mcp.json` merger.
- `subagent/subagent_monitor_adapter.ts` — observation surface per
  ADR-012.

The `mock/` subdirectory (T-L1-07) ships ten in-memory mocks
(`AgentMock`, `StorageMock`, `EmbeddingMock`, `DocsMock`,
`UpdaterMock`, `SherpaCliMock`, `PluginMock`, `HookMock`,
`McpServerMock`, `SubagentMonitorMock`) re-exported from
`mock/index.ts`. The mocks are deterministic, in-memory, timer-free
and remain the canonical test seam for use cases — see
`mock/README.md`.

## Dependencies

Per ADR-001 §3 dependency rule #3:

- May import from: `core/domain`, `core/ports`.
- May import external packages relevant to the adapter (e.g. the agent
  adapter imports `@lydell/node-pty`).
- May NOT import from: `core/application` (one-way arrow).
- Imported by: `core/infrastructure` (Composition Root) only.

## Conventions

- One subdirectory per port family; one class per concrete backend.
- Class name = `<Backend><Port>Adapter` (e.g. `ClaudeCodeAgentAdapter`).
- No global state — adapters receive config via constructor.
- `mock/` adapters are deterministic, in-memory, and free of timers.

## References

- ADR-001 §3 dep rule #3, §3.4 (adapter loading)
- ADR-007 (lazy loading + startup budget)
- ADR-009/010/011/012 (plugin, hook, MCP, subagent specifics)
- design/architecture.md §2.1 (adapter rows)
