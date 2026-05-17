# Getting started with Sherpa UI Client

Sherpa UI Client is a desktop assistant that hosts CLI coding agents
(Claude Code in v0.1) inside a project-aware workspace. This page
walks through the first launch, opening a project, and creating a
new project from scratch.

> Target time-to-first-task: 10 minutes (NF4).

## Prerequisites

- Windows 10/11, macOS 12+, or a recent Linux desktop.
- Node 20+ on `PATH` (used by the bundled `sherpa-cli`).
- Claude Code installed and authenticated. Sherpa launches it as a
  subprocess and parses its stdout — it does not handle login itself.

## First launch

[screenshot: Welcome screen with onboarding tour overlay step 1 of 5]

When you launch Sherpa for the first time it shows the **Welcome**
screen and overlays a 5-step tour explaining the Workspace, Kanban,
Agent, RAG and Settings panes. The tour is skippable in one click;
nothing on the screen is blocked while it is open.

What happens behind the scenes:

1. Sherpa creates `~/.sherpa/onboarding.json` and stores
   `completed: false`.
2. After you finish (or skip) the tour, the file is updated to
   `completed: true` and the tour does not appear again.
3. You can replay the tour anytime via **Settings → General → "Show
   the tour again"**.

The Welcome screen always shows three primary actions plus an action
grid:

- **Open Project** — pick a folder containing `.sherpa/settings.yml`
  (skip to [Open an existing project](#open-an-existing-project)).
- **Create New Project** — scaffold a fresh project under a folder
  of your choice (skip to [Create a new project](#create-a-new-project)).
- **Recent projects** — pinned and recently opened projects. Pinned
  projects stay at the top.

At the bottom of the action grid you will find:

- **Open documentation** (`F1`) — opens this user guide on GitHub in
  your default browser.
- **Theme** (`Ctrl+Shift+T`) — toggles between Tokyo Night dark and
  Tokyo Day light. The transition is instant — no restart.
- **Language** — switches the UI between Russian and English.

## Open an existing project

[screenshot: Welcome screen with two recent projects listed]

1. Click a project tile in **Recent projects** OR click **Open
   Project** and pick a folder.
2. Sherpa reads `<project>/.sherpa/settings.yml` and verifies the
   `sherpa_version` field against the running app version.
3. The Workspace mounts. Your previous session UI state — open
   tabs, active pane, panel sizes — is restored from
   `<project>/.sherpa/ui_state.json`.
4. If the project's `sherpa_version` differs from the running app,
   a non-blocking yellow banner appears above the tab bar with the
   `workspace.banner.version_mismatch` message. Open Settings or
   update Sherpa core to dismiss.

If you pick a folder that does NOT have `.sherpa/settings.yml`, the
UI will offer to initialise it — proceed to the next section.

## Create a new project

[screenshot: CreateProjectWizard step 1 of 5 — path picker]

The CreateProjectWizard walks you through five steps:

1. **Path** — type or paste the absolute path. (A native folder
   picker is *Coming in v0.2*; for now free-input only.)
2. **Language and stack** — `ru` or `en`; an optional stack tag
   (e.g. `bitrix`, `react`, `python`) used to bias the methodology.
3. **Methodology** — `standard_rdpi` (default) or one of the
   alternates available in your installed Sherpa core.
4. **Agent** — currently `claude-code`. Other adapters land in
   future minor versions.
5. **RAG** — toggle indexing on/off and configure exclusion globs.

After clicking **Create**:

- Sherpa invokes `sherpa-cli init --project <path> --lang <lang> --methodology <method>`.
- The CLI downloads the Sherpa core for your channel (default
  `stable`), verifies the signature against the bundled public key,
  and extracts it into `<path>/.sherpa/core/`.
- A starter `<path>/.sherpa/settings.yml` is scaffolded.

What you may see on failure:

- **Critical modal "Signature verification failed"** — exit 3. The
  CLI never wrote anything; pick another channel or re-download the
  installer.
- **"Network error — retry?" banner inside the wizard** — exit 4.
  The CLI did not reach the channel server; click Retry.

[screenshot: Critical signature-failure modal blocking the wizard]

When the CLI exits 0 the wizard transitions you straight to the
Workspace.

## Where things live

| Path | What |
|---|---|
| `~/.sherpa/onboarding.json` | First-run flag (single file). |
| `~/.sherpa/recent_projects.json` | Recent and pinned project list. |
| `~/.sherpa/projects/<slug>/` | Per-project recovery markers (`.workspace.lock`, `tasks/<id>/meta.md`, `tasks/<id>/chat_history.jsonl`). |
| `<project>/.sherpa/settings.yml` | Project-scoped settings (language, methodology, agent, RAG). |
| `<project>/.sherpa/ui_state.json` | Last open tabs, active pane, panel sizes — restored on open. |
| `<project>/.sherpa/core/` | Sherpa core artefacts downloaded by `sherpa-cli`. |
| `<project>/.claude/settings.json` | Claude Code allowlist + hooks. Sherpa preserves your manual entries (NF25). |
| `<project>/.claude/mcp.json` | Claude Code MCP server registry. Sherpa adds and removes its `sherpa.rag` entry without touching your other entries. |

## Keyboard shortcuts you will use first

| Shortcut | Action |
|---|---|
| `F1` | Open user guide |
| `Ctrl+P` | Quick open file |
| `Ctrl+Shift+F` | Find in files |
| `Ctrl+B` | Toggle file browser |
| `Ctrl+J` | Toggle agent panel |
| `Ctrl+T` | New task |
| `Ctrl+Enter` | Send agent prompt |
| `Esc` | Close overlays (QuickOpen, FindInFiles, modals) |

A complete list is in [Settings → Keyboard shortcuts](settings.md#keyboard-shortcuts).

## Next steps

- [Working with the Kanban board](kanban.md)
- [Running an agent session](agent.md)
- [Searching with RAG](rag.md)
- [Configuring settings](settings.md)
- [Installing plugins](plugins.md)
