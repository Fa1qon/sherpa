# Sherpa v0.21.12

**First public release.**

Sherpa is an AI-assisted development orchestrator for [Claude Code](https://claude.ai/code). It brings structure to AI-driven software development through configurable methodology workflows, a Kanban task board, and a searchable knowledge base.

---

## What's included

### Core features

- **Methodology Engine** — define multi-stage YAML workflows; Sherpa runs Claude Code through each stage, evaluates gate conditions, and passes artifacts between stages automatically
- **Kanban Tracker** — drag-and-drop task board with configurable stages (default: Backlog / In Progress / Done)
- **Knowledge Base** — RAG-powered semantic search via [sqlite-vec](https://github.com/asg017/sqlite-vec); methodology runs contribute knowledge automatically
- **Claude Code Integration** — PTY-driven subprocess with permission allowlist UI and context-usage monitoring
- **Plugin System** — three-tier plugin discovery (bundled / user-global / workspace-local)
- **MCP Server** — built-in Model Context Protocol server exposing RAG search tools to Claude Code sessions
- **i18n** — English and Russian UI

### This release (v0.21.12)

- Full E2E test system: error capture, smoke tests for all screens, methodology flow tests with stub adapter
- Kanban tracker (drag-and-drop, board settings, stage badges)
- Task flow redesign: methodology is now optional when creating a task
- VSCode-style UI shell with resizable panels and zen mode

---

## Installation

**Windows 10 / 11 x64:**

1. Download `Sherpa-0.21.12-win-x64.exe` below
2. Run the installer (requires no admin rights for per-user install)
3. Launch Sherpa — Claude Code must be installed and on `PATH`

---

## Requirements

- Windows 10 / 11 x64
- [Claude Code](https://claude.ai/code) installed

---

## SHA-256

```
Sherpa-0.21.12-win-x64.exe  50F73D8202F7F2468DE8DE075612E27874C518C4E646096875B17E1DC88D6B0B
```
