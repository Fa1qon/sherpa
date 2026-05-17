# Changelog

All notable changes to Sherpa are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
