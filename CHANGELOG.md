# Changelog

All notable changes to Sherpa are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [0.24.5] — 2026-05-19

### Changed
- **Embedded browser rewritten as `<webview>` tag** — after four release iterations (0.24.1–0.24.4) chasing coord-system bugs in the native `WebContentsView` overlay, abandoned the overlay approach entirely. `BrowserTab`, `HtmlViewer`, and `PdfViewer` now embed an HTML `<webview>` element inside the React DOM; CSS handles position and size; no more `setBounds`, `getBoundingClientRect` polling, ResizeObserver, chrome offset compensation, or DPI conversion
- `UserBrowser` is now a thin wrapper that routes navigation and MCP automation through the webview's `webContentsId` (registered on `dom-ready`); legacy `show`/`hide` IPC calls preserved as no-ops for back-compat

### Fixed
- Embedded browser viewport rendered consistently smaller than its container (gaps on right and bottom on Windows with display scaling != 100%) — root cause was `WebContentsView.setBounds` not honouring DIPs as documented on Windows; the `<webview>` rewrite sidesteps the entire bug class

### Removed
- 250+ lines of coordinate synchronization scaffolding (polling, ResizeObserver, RAF deferral, chrome offset, DPI conversion, diagnostic overlays)
- `webPreferences.webviewTag` is now `true` on the main window (required for `<webview>`)

---

## [0.24.4] — 2026-05-19

### Fixed
- (Attempted) Browser viewport DPI compensation via `screen.dipToScreenRect` on Windows. Did not fully resolve; superseded by 0.24.5 webview rewrite

---

## [0.24.3] — 2026-05-19

### Changed
- (Diagnostic build) Visual viewport markers (magenta + green outline) and `setBounds` logging to localize the WebContentsView sizing bug. Reverted in 0.24.5

---

## [0.24.2] — 2026-05-19

### Fixed
- (Attempted) Browser viewport chrome-offset compensation. Was wrong direction; reverted in 0.24.3

---

## [0.24.1] — 2026-05-19

### Fixed
- (Partial) Browser viewport initial-mount race — deferred `setBounds` via `requestAnimationFrame` + added `ResizeObserver` so the WebContentsView is created at the final layout size, preventing responsive pages (e.g., google.com) from picking a mobile breakpoint that survives later resize

---

## [0.24.0] — 2026-05-19

Massive parallel-track release — five major feature surfaces shipped together.

### Added — Track A: Extension Framework (E1–E5)
- `sherpa.extension.json` manifest schema (id, name, version, permissions, slots, tools, settings) + parser + validator + minimal SemVer matcher
- Permission whitelist with `ipc.call:<channel>` wildcard matching
- Typed Event Bus — 12 v1 events (`task.*`, `stage.*`, `gate.*`, `tool.*`, `message.*`, `file.changed`, `artifact.written`, `project.opened`) with SQLite persistence (30-day rotation) and renderer bridge via `APP_EVENT` IPC
- Main + renderer SDK (`@sherpa/extension-sdk` surface) with permission-gated `events`, `storage`, `ai.registerTool`, `slots.register`, `ipc.call` APIs
- Per-extension SQLite key/value storage (`extension_storage` table)
- React UI slot system — 7 host locations (`sidebar.panel`, `task.toolbar`, `chat.decorator`, `chat.input.addon`, `methodology.editor.stage.tab`, `settings.tab`, `browser.toolbar`) with per-extension Error Boundary isolation
- Extension loader — scans `<userData>/extensions/`, parses manifests, activates via dynamic ESM import on enable
- Extension installer — `.zip` extract via yauzl with zip-slip guard
- Extension Manager UI in Settings (install / enable / disable / uninstall)
- Hello-world fixture (`tests/fixtures/extension-hello/`) + integration smoke

### Added — Track B: Agent Browser Tools (B5)
- 12 MCP tools registered as `user_browser_*` for AI control of the embedded browser: navigate, screenshot, get_html, query_selector, evaluate_js, click, type, key, drag, resize, console_errors, network_log
- `ConsoleCapture` ring buffer (`console-message` listener)
- `NetworkCapture` ring buffer (`webRequest.onBeforeRequest` + `onCompleted`)
- `BrowserAutomationService` wires captures to MCP server

### Added — Track C: Pipeline Plugins + MCP + Inbound Triggers (P1 / P2 / P5 / P10)
- `PipelinePlugin` manifest in methodology YAML (`plugins:` block) — id, type, hook (`on_stage_start`/`on_stage_complete`/`on_artifact_created`/`on_gate_pass`/`on_gate_fail`/`on_task_complete`/`on_task_fail`), when condition, params, retry, onError
- Template substitution `{{task.id}}` / `{{stage.id}}` / `{{artifact.path}}` / `{{event.*}}` + condition evaluator (`==` / `!=` / truthy)
- `PluginExecutor` with retry / abort / per-hook dispatch wired at 6 engine hook points
- Built-in handlers: `webhook` (HTTP POST/PUT/etc. with timeout), `transform` (file copy/rename/validate), `notify` (Electron Notification)
- `mcp` handler — declarative call into any registered MCP server via `@modelcontextprotocol/sdk`; `McpClientPool` with stdio + SSE transports
- MCP Servers Settings tab (CRUD + Test connection)
- `external` gate type — methodology pauses, surfaces a webhook URL with HMAC token; resumes on `POST /triggers/<taskId>/<gateId>/<token>`
- `InboundTriggerService` (Fastify ingress on configurable port, default 19222) + cron triggers (`node-cron`) + file watcher triggers (chokidar)

### Added — Track D: Mobile Web + Gate Approval (W1 / W2 / W3 / W7)
- `LocalWebServer` (Fastify) on configurable LAN port (default 19223)
- `MobileAuth` — 4–8 digit PIN, 24h session token, 10-fail/IP brute-force lock
- Mobile UI bundle (separate `vite.mobile.config.ts` → `dist-mobile/`) — hash-routed React app with Login + TaskList + TaskDetail; dark-mode-aware CSS
- API: `/api/login`, `/api/tasks`, `/api/tasks/:id`, `/api/tasks/:id/gates`, `/api/tasks/:id/gates/:gateId/{approve,reject}`
- Settings tab "Mobile Web" with enable toggle, port, PIN, and live QR code
- electron-builder packages `dist-mobile/` into the installer

### Added — Track E: Observability (T6 / T7 / C2 / C3)
- SQLite `stage_metrics`, `tool_metrics`, `gate_metrics` tables with FIFO tool-call correlation
- `EventAggregator` records from `stage_runner`, `gate_evaluator`, `master_chat_controller`; percentile queries (p50, p95)
- Analytics screen with 4 lazy-loaded `recharts` widgets (StageDurations, GateOutcomes, ToolUsage, TasksOverTime) — accessible via ActivityBar `BarChart3` icon
- Transparency panel in TaskWorkspace — tails `trace.jsonl`, parses tool_use/tool_result pairs, renders collapsible cards with input/output/duration, filter + errors-only toggle
- Call Tree view (List/Tree toggle) — recursive subagent tree via time-window heuristic, with Users/Wrench icons and depth-based default-open

### Tests
- 1334 → 1742 (+408 unit tests across the five tracks)

---

## [0.23.0] — 2026-05-18

### Added — Visual Formats Viewers
- `ViewerRegistry` with lazy-loaded viewers keyed by extension + priority resolution
- Custom `sherpa-file://` protocol — resolves project-relative paths with `path.relative` escape check
- Mermaid (standalone `.mmd` + MD fenced blocks for `mermaid` / `c4` / `sequence` / `dataflow` / `gantt` / `state` / `mindmap`); theme bridge synced with Sherpa light/dark
- BPMN 2.0 (`.bpmn`) via `bpmn-js/NavigatedViewer`
- MindMap via markmap (`.markmap`, `view: mindmap` frontmatter, fenced ` ```markmap ` blocks)
- Excalidraw (`.excalidraw`) with read-only toggle + debounced auto-save
- Enhanced CSV — `@tanstack/react-table` + `@tanstack/react-virtual` (sort / filter / search / virtualization for 100k+ rows)
- JSON tree/source toggle via `react-json-view-lite`
- PDF via Electron's bundled Chromium PDFium
- In-house Jupyter (`.ipynb`) renderer (markdown + lazy ShikiCode, no `@nteract/notebook-render`)
- MD enrichment: relative images resolved through `sherpa-file://`, syntax highlight via Shiki for ~30 languages

### Fixed
- CSS token unification (11 files) — replaced non-existent `--color-*` variables with real `--bg-*` / `--fg-*` / `--border-default` tokens

---

## [0.22.0] — 2026-05-18

### Added — Multi-Agent Connectors
- `AgentCli` expanded from 3 → 12 values: `claude-code`, `codex`, `opencode`, `gemini`, `goose`, `amp`, `cursor`, `copilot`, `pi`, `qwen-code`, `kimi`, `aider`
- `NdjsonAgentBase` + `PlainTextAgentBase` abstract adapter classes
- 11 new agent adapters (one per non-Claude agent)
- `AgentRegistry` singleton wiring all 12 adapters
- `AgentAuthService` — API key CRUD via `UserSettings.agentCredentials`
- 4 IPC channels: `agent.storeKey`, `agent.authRevoke`, `agent.authStatus`, `agent.health`
- `MasterChatController` refactored to take `AgentRegistry` and resolve adapters by `agentCli`
- Per-task agent selection: `Task.agentCli` field + `TaskSettingsPanel` dropdown
- Settings → Agents section: API key input + revoke + health status per agent
- Integration tests: 6 Ollama-backed tests (guarded by `SHERPA_OLLAMA_INTEGRATION=1`), 5 auth-error tests, AgentRegistry health routing tests

### Added — Proxy & Network
- HTTP / HTTPS / SOCKS5 proxy support — global settings + per-target routing (Claude agents, user browser, AI browser, web search)
- Settings → Network section for proxy CRUD + assignment table

### Fixed
- React error #185 (infinite re-render) when entering Settings → Network — caused by `?? []` creating a new array reference on every Zustand selector call
- Browser tab viewport rendered 1px tall — `height: 100%` doesn't resolve in a flex context; replaced with `flex: 1; min-height: 0`

---

## [0.21.14] — 2026-05-17

### Fixed
- Requirements stage asks the user questions as plain chat text instead of via the `AskUserQuestion` tool (which the renderer's "answer" UI couldn't ever surface for that stage)

---

## [0.21.13] — 2026-05-17

### Added
- Ctrl+P quick file search modal
- File context menu in the sidebar (Open, Copy path, Send to chat)
- Drag-and-drop of files from the explorer into the chat input

### Fixed
- 6 dogfooding fixes — dialogs, chat input ref handling, stale closures in attach `useEffect`, methodology stage UX

### Docs
- File explorer context menu design spec

---

## [0.21.12] — 2026-05-17

### Added
- Full E2E test system: shared `launchWithProject()` helper, JS error capture (`collectErrors` / `assertNoErrors`), backend error IPC channel (`SHERPA_DEBUG_E2E=1`), direct SQLite assertion helpers
- Smoke tests covering all major screens (empty workspace, kanban board, new task, settings, library, tab switching)
- Methodology flow tests with stub adapter (no real Claude Code required)

### Fixed
- E2E test sentinel — replaced dead `text=Project loaded` wait with `data-testid="workspace-loaded"` in all test files

---

## [0.21.11] — 2026-05-17

### Fixed
- Kanban board went blank (React infinite re-render, error #185) when switching to the tracker tab — caused by an unstable Zustand selector in `KanbanColumn` returning a new array reference on every render

---

## [0.21.10] — 2026-05-16

### Added
- **Kanban Tracker** — drag-and-drop task board with three default stages (Backlog / In Progress / Done), per-project board settings (stage CRUD, rename, reorder), stage badge in the task sidebar, full IPC chain, and 6 E2E tests
- `@dnd-kit/core` and `@dnd-kit/sortable` for drag-and-drop

---

## [0.21.9] — 2026-05-16

### Changed
- Task flow redesign: methodology selection is now optional; `TaskSettingsPanel` replaces the blocking `NewTaskDialog`; tasks can start immediately without a methodology

### Added
- File icon pack (Material Icon Theme) in the sidebar file browser

---

## [0.21.8] — 2026-05-15

### Changed
- UI shell redesign: VSCode-style layout with `PanelRegistry`, resizable sidebar panels, zen mode, density design tokens
- Trace panel renamed to "Event log"; hidden by default (toggle in Settings)
- i18n: tracker terminology unified (EN + RU)

---

## [0.21.0] — 2026-05-14

### Added
- Methodology runtime — full stage execution engine with gate evaluation, artifact passing, and IPC progress events
- Methodology YAML importer — paste or drop a YAML file to add a methodology to the project library
- Knowledge base — item CRUD, FTS5 full-text search, vector similarity search via sqlite-vec
- Template library — reusable prompt templates with CRUD and full-text search
- MCP stage transitions — stages can advance via tool calls from within a Claude Code session

---

## [0.20.0] — 2026-05-13

### Added
- Event system — typed domain event bus (`EventBus`) with eight event types
- Knowledge and Template stores in the Library panel
- Methodology constructor improvements: node palette, edge canvas, YAML round-trip

### Fixed
- Methodology runtime gate evaluation after YAML import

---

## [0.1.0-alpha.1] — 2026-05-04

First public alpha.

### Added
- Hexagonal-Lite architecture: `core/domain`, `core/ports`, `core/adapters`, `core/application`
- Claude Code adapter — PTY-driven subprocess with prompt parsing, permission allowlist, and audit hook
- Storage adapters — SqliteVecAdapter (sqlite-vec) and VectraAdapter (filesystem fallback)
- Embedding adapter — Ollama HTTP primary + transformers.js fallback
- Plugin loader — three-tier discovery (bundled / user-global / workspace) with manifest validation
- MCP server adapter — Sherpa RAG tools via Model Context Protocol
- IPC catalog — 50+ typed channels shared by main, preload bridge, and renderer
- React 19 renderer with i18n (English + Russian, 654 keys)
- Welcome screen, workspace shell, agent panel, RAG search, file browser, recovery screen
- Updater — electron-updater with SHA-256 signature verification
- Vitest unit suite (1 100+ tests)

[Unreleased]: https://github.com/Fa1qon/sherpa/compare/v0.21.12...HEAD
[0.21.12]: https://github.com/Fa1qon/sherpa/compare/v0.21.11...v0.21.12
[0.21.11]: https://github.com/Fa1qon/sherpa/compare/v0.21.10...v0.21.11
[0.21.10]: https://github.com/Fa1qon/sherpa/compare/v0.21.9...v0.21.10
[0.21.9]: https://github.com/Fa1qon/sherpa/compare/v0.21.8...v0.21.9
[0.21.8]: https://github.com/Fa1qon/sherpa/compare/v0.21.0...v0.21.8
[0.21.0]: https://github.com/Fa1qon/sherpa/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/Fa1qon/sherpa/compare/v0.1.0-alpha.1...v0.20.0
[0.1.0-alpha.1]: https://github.com/Fa1qon/sherpa/releases/tag/v0.1.0-alpha.1
