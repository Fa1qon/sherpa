# Sherpa

AI-assisted development orchestrator for [Claude Code](https://claude.ai/code).

Sherpa is a desktop application that brings structure to AI-assisted software development. It runs Claude Code through configurable **methodologies** — multi-stage YAML workflows with gate tracking, artifact passing, and a searchable knowledge base that improves with each completed task.

---

## Features

- **Methodology Engine** — define multi-stage development workflows in YAML; Sherpa orchestrates Claude Code through each stage, tracks gates, and passes artifacts forward automatically
- **Task Kanban** — drag-and-drop board to visualise tasks across customisable pipeline stages (Backlog / In Progress / Done by default)
- **Knowledge Base** — RAG-powered semantic search over project documents via [sqlite-vec](https://github.com/asg017/sqlite-vec); methodology runs contribute cases automatically
- **Claude Code Integration** — native PTY-driven subprocess with permission UI, allowlist management, and context-usage monitoring
- **Plugin System** — extend Sherpa with bundled or workspace-local plugins (methodology packs, hook scripts, custom adapters)
- **MCP Server** — built-in Model Context Protocol server exposing RAG search tools to Claude Code sessions
- **i18n** — English and Russian UI out of the box

---

## Requirements

| Requirement | Version |
|-------------|---------|
| OS | Windows 10 / 11 x64 |
| [Claude Code](https://claude.ai/code) | latest |

> macOS build is planned for a future release.

---

## Download

Download the latest installer from the [Releases](https://github.com/Fa1qon/sherpa/releases/latest) page.

Run `Sherpa-<version>-win-x64.exe` and follow the installer. Sherpa will auto-update when new versions are available.

---

## Building from source

```bash
# Prerequisites: Node.js 20+, npm
git clone https://github.com/Fa1qon/sherpa.git
cd sherpa
npm install

# Development (Vite + Electron hot-reload)
npm run dev

# Run tests
npm test                  # unit tests (Vitest)
npm run test:e2e          # E2E tests (Playwright + Electron)

# Build Windows installer
$env:SHERPA_DEV_BUILD=1; npm run dist:win
```

The built installer will appear in `out/Sherpa-<version>-win-x64.exe`.

---

## Architecture

Sherpa follows a **Hexagonal-Lite** architecture:

```
core/domain        — entities, value objects
core/ports         — port interfaces (AgentPort, StoragePort, …)
core/adapters      — concrete implementations (ClaudeCodeAdapter, SqliteVecAdapter, …)
core/application   — use cases wiring ports together
main/              — Electron main process + IPC handlers
renderer/          — React 19 renderer (stores, hooks, i18n)
presentation/      — React screens and components
```

Key design decisions are documented in `src/core/adapters/` ADR headers and `docs/architecture/`.

---

## Methodology format

Methodologies are YAML files placed in `<project>/.sherpa/methodologies/` or loaded from the bundled library. See [`docs/methodology-spec.md`](docs/methodology-spec.md) for the full format reference.

Example:

```yaml
id: my-workflow
name: My Workflow
version: "1.0"
stages:
  - id: research
    name: Research
    mode: auto
    contract:
      output:
        path: artifacts/research.md
    gate:
      items:
        - id: research_done
          kind: artifact_written
          label: Research artifact written
          auto_pass_when:
            expr: "artifact_exists('artifacts/research.md')"
```

---

## Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md).

---

## License

[MIT](LICENSE) — see also [LICENSE_OVERRIDES.md](LICENSE_OVERRIDES.md) for third-party notices.
