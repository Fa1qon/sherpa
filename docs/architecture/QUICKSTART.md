# Sherpa UI Client — Architecture Quickstart

A 5-minute orientation for contributors. Read this before opening a
pull request; deeper material lives in
`<sherpa-source>/design/architecture.md` and the ADRs under
`<sherpa-source>/decisions/`.

`<sherpa-source>` resolves to
`C:\Projects\sherpa\projects\sherpa\tasks\METH-070\chat_01\` for
in-tree development.

## 1. Mental model — Hexagonal-Lite

The application is a Hexagonal-Lite (Ports & Adapters) Electron app per
ADR-001. Five concentric layers, dependencies always flow inward:

```
+------------------------------------------------------------+
|  src/main/  (process root, Composition Root, IPC handlers) |
|   +------------------------------------------------+       |
|   |  src/core/infrastructure/  (Event Bus, watcher) |       |
|   |   +-----------------------------------------+   |       |
|   |   |  src/core/adapters/  (Claude Code, ...) |   |       |
|   |   |   +---------------------------------+   |   |       |
|   |   |   |  src/core/application/ (use     |   |   |       |
|   |   |   |  cases) + src/core/ports/       |   |   |       |
|   |   |   |   +-----------------------+     |   |   |       |
|   |   |   |   |  src/core/domain/     |     |   |   |       |
|   |   |   |   |  (pure types,         |     |   |   |       |
|   |   |   |   |   no IO)              |     |   |   |       |
|   |   |   |   +-----------------------+     |   |   |       |
|   |   |   +---------------------------------+   |   |       |
|   |   +-----------------------------------------+   |       |
|   +------------------------------------------------+       |
|                                                            |
|  src/renderer/ + src/presentation/  (React, IPC client)    |
+------------------------------------------------------------+
```

Cardinal rules:

1. **Domain depends on nothing.** No imports of frameworks or IO.
2. **Application talks to ports, not adapters.** Use cases receive
   resolved ports through a `Container`.
3. **Adapters depend on domain + ports + their own external library.**
4. **Renderer reaches main only through the typed IPC bridge.** No
   direct import of `electron`, `core/adapters/*` or `main/*`.
5. **Infrastructure is the only layer with full visibility** — it is
   what enables the Composition Root in `src/main/composition_root.ts`.

`madge --circular src/` and the ESLint `no-restricted-imports` rule
enforce these boundaries on every commit.

## 2. Repository tour

| Path | What lives here |
|---|---|
| `src/core/domain/` | Five bounded contexts as plain TypeScript types — Project, Task, Agent, Knowledge (RAG), Update — plus Plugin and Hook value types. |
| `src/core/ports/` | Ten interfaces (`AgentPort`, `StoragePort`, `EmbeddingPort`, `DocsPort`, `UpdaterPort`, `SherpaCliPort`, `PluginPort`, `HookPort`, `McpServerPort`, `SubagentMonitorPort`). |
| `src/core/application/` | Use cases per context (`agent/`, `project/`, `task/`, `rag/`, `update/`, `recovery/`, `subagent/`, `plugin/`). Pure orchestration; no `fs`, no `electron`. |
| `src/core/adapters/` | Concrete adapters — one subdirectory per port family. `mock/` ships ten in-memory implementations for tests. |
| `src/core/events/` | Discriminated union of every domain event. Imported as types from anywhere; runtime via Event Bus only. |
| `src/core/infrastructure/` | Event Bus, file watcher, process manager — the cross-cutting runtime services. |
| `src/main/` | Electron main process: Composition Root, BrowserWindow, IPC handlers, preload bridge. |
| `src/main/ipc/` | Typed channel catalog (`channels.ts`), handler registration (`handlers.ts`). |
| `src/main/agent/`, `src/main/mcp/`, `src/main/onboarding/` | Main-side glue specific to those subsystems. |
| `src/renderer/` | Vite-bundled React tree: providers, navigation store, IPC client, locales, styles. |
| `src/presentation/` | Screens (`Welcome`, `Workspace`, `Kanban`, `RagSearch`, `Graph`, `Settings`, `Metrics`, `Recovery`) and reusable components. |
| `src/main/preload.ts` | Context-isolated bridge that projects `ALL_CHANNELS` onto `window.sherpa`. |
| `tests/` | Unit tests (`tests/core/**`), integration flows (`tests/integration/flows/F1..F11`), visual smoke (`tests/visual/`). |
| `docs/user-guide/` | End-user task documentation (this folder). |
| `docs/architecture/` | This document plus IPC contract notes. |
| `BUILD_LOG.md` | Append-only Sherpa runner log; one line per task transition. |
| `.sherpa-build/` | Sherpa runner state and gate verdicts. |

## 3. First-time setup

Prerequisites — Node ≥ 20, npm ≥ 10, Git, Python (Windows only,
required by `node-gyp` for native modules).

```bash
git clone https://github.com/sherpa-ui/sherpa-ui-client
cd sherpa-ui-client
npm install
npm run rebuild         # electron-rebuild for native modules
npm run build:main      # tsc -p tsconfig.main.json + esbuild preload
SHERPA_DEV_BUILD=1 npm run dev   # see signing-key note below
```

The `SHERPA_DEV_BUILD=1` flag bypasses the
`scripts/check-signing-key.mjs` build-time guard, which otherwise
exits 1 because the placeholder `TEST_PUBLIC_KEY` in
`src/core/adapters/updater/signing_key.ts` is not yet replaced with
the production key. Replacement lands in T-L7-04.

## 4. Workflow on a typical task

1. Pick a port or use case. Read its README in `src/...`.
2. If new IO is needed, add a method to the relevant port (≤7
   methods total per ADR-001 §Compliance §3) — the rule is enforced
   by a runtime test in `tests/core/ports/`.
3. Wire the new method through every existing adapter (mocks first;
   the real adapter follows once the use case is green).
4. Add or extend the use case under `src/core/application/`.
5. Expose it through IPC: extend `IpcChannels` in
   `src/main/ipc/channels.ts`, add a handler in `handlers.ts`, append
   to `ALL_CHANNELS`.
6. Consume in `src/renderer/ipc/client.ts` or a screen under
   `src/presentation/`.
7. Add an integration flow under `tests/integration/flows/` if the
   change is user-visible.

`npm run typecheck`, `npm test`, `npm run madge:circular` and
`npm run lint` are the four gates every commit must pass.

## 5. Important env seams

| Env var | Purpose |
|---|---|
| `SHERPA_DEV_BUILD=1` | Bypass the placeholder-signing-key guard. |
| `SHERPA_HOME_OVERRIDE=<dir>` | Redirect onboarding / recent-projects writes. F1, F2, F8 specs use this. |
| `SHERPA_CLI_PATH=<file>` | Production override for the `sherpa-cli` binary. |
| `SHERPA_CLI_NODE_SCRIPT=<file>` | Inject a Node script as the CLI stub (Windows-friendly). F3 spec uses this. |
| `CLAUDE_CODE_NODE_SCRIPT=<file>` | Same pattern for the Claude Code agent stub. F5 spec. |
| `SHERPA_AUTO_UPDATER_MOCK=<json>` | F7 spec — point composition root at a mock auto-updater JSON. |
| `SHERPA_QUIT_INSTALL_TRACE=<file>` | Sidecar file written instead of restarting (F7 spec assertion). |
| `SHERPA_AUDIT_LOG_PATH=<file>` | Override audit log destination (F5 / F11 specs). |
| `SHERPA_CONTEXT_SNAPSHOT_FILE=<file>` | F6 spec — seed cumulative tokens. |
| `ELECTRON_RUN_AS_NODE=1` | Electron acts as a plain Node binary — used by stubs that need to spawn under the integration harness. |

Production builds NEVER set any of these; they are test seams.

## 6. Reading list — in priority order

1. `src/core/domain/README.md` — bounded contexts.
2. `src/core/ports/README.md` — the ten interfaces.
3. `src/core/application/README.md` — use case conventions.
4. `src/core/adapters/README.md` — adapter conventions and the
   subdirectory layout.
5. `src/main/ipc/README.md` — channel catalog and handler discipline.
6. `src/renderer/README.md` and `src/presentation/README.md` — UI
   conventions.
7. `<sherpa-source>/decisions/ADR-001.md` (architecture rule), and
   any ADR relevant to your patch (ADR-007 lazy loading, ADR-008
   permissions, ADR-009 plugins, ADR-010 hooks, ADR-011 MCP,
   ADR-012 subagents, ADR-013 theme tokens).
8. `BUILD_LOG.md` tail — the most recent 100 lines describe what is
   actually shipped vs the original spec; useful when reading any
   README for the first time.

## 7. Gotchas

- The renderer cannot import `electron`. Always go through
  `window.sherpa.<channel>` (typed in `src/renderer/ipc/client.ts`).
- The Composition Root is the ONE place where adapters and ports
  are wired. Do not introduce a second one.
- IPC handlers are thin — they delegate to use cases. Business logic
  in `handlers.ts` is a code-review red flag.
- `ports/` files only contain `export type` declarations. A port
  with a runtime class is a refactor candidate.
- `core/events/` is the only place where new event variants live.
  Adding one elsewhere (e.g. inside an adapter) breaks the
  multi-reviewer report W1 invariant.

## 8. Sherpa runner protocol

This codebase is implemented under the Sherpa methodology — every
task is dispatched, validated and logged through
`.sherpa-build/state.json` and `BUILD_LOG.md`. The protocol is
described in `CLAUDE.md` at the repo root. Contributors operating
manually do NOT need to interact with the runner — Sherpa-driven
sessions do.
