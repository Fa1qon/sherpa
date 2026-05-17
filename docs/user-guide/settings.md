# Settings

Sherpa stores preferences at two scopes:

- **Global** — `~/.sherpa/settings.json`. Theme, language, default
  agent, telemetry. Apply to every project.
- **Project** — `<project>/.sherpa/settings.yml`. Methodology, RAG
  scope, agent overrides. Override globals where set.

Open the Settings screen via **Ctrl+,** or the gear icon in the
ActivityBar.

[screenshot: Settings screen with the General tab selected]

## General

| Field | Default | Notes |
|---|---|---|
| Theme | `system` | Resolves to `dark` or `light` via OS preference. Tokyo Night palette per ADR-013. |
| Language | `auto` | Falls back to OS locale; supported: `en`, `ru`. |
| Show the tour again | — | Button — replays the 5-step onboarding tour next time you visit Welcome. |
| Open at login | off | Platform-specific (`launchctl` on macOS, registry run-key on Windows). |
| Send anonymous telemetry | off | Manual export only; no auto-send (NF17). |

Theme changes are instant — CSS variables flip on the `<html>`
element without a React re-render. The CodeMirror editor theme
swaps in roughly 100 ms.

## Methodology

| Field | Default | Notes |
|---|---|---|
| Default methodology | `standard_rdpi` | The list is sourced from `<project>/.sherpa/core/methodologies/`. |
| Stage flags | `{}` | Per-task overrides — e.g. skip `W3` review stage for hotfixes. |
| Custom overlay path | — | Workspace plugins can register custom overlays. |

## Agent settings

| Field | Default | Notes |
|---|---|---|
| Default agent | `claude-code` | Other adapters land via plugin path FR-P1. |
| Context threshold (%) | `70` | Yellow Banner triggers at this percentage of `context_max_tokens`. |
| Context max tokens | `200000` | Default Claude Code Sonnet context window. |
| Cost limit per session | unset | Soft warning only — does not stop the agent. |
| Default prompt prefix | empty | Prepended to every user prompt; useful for project conventions. |

## RAG settings

| Field | Default | Notes |
|---|---|---|
| Indexing enabled | on | If off, RAG search and the MCP server are unavailable. |
| Embedding provider | `ollama` | Falls back to `transformers.js` if Ollama is not reachable. |
| Ollama URL | `http://127.0.0.1:11434` | Override when running a remote Ollama instance. |
| Embedding model | `nomic-embed-text` | Configure per Ollama installation. |
| Exclusion patterns | derived from `.gitignore` | Glob list applied after `.gitignore`. |
| Storage backend | `sqlite-vec` | Falls back to Vectra if `better-sqlite3` cannot load. |

A **Rebuild index** button at the bottom drops the on-disk store and
re-embeds from scratch. Use after major Sherpa core upgrades or when
file metadata gets out of sync.

## Hooks

[screenshot: Settings → Hooks tab — managed and user hooks listed]

Sherpa exposes the inline hook surface defined in ADR-010:

- **Managed inline hooks** (cannot be disabled):
  - `sherpa.audit.log` — metadata-only JSONL append after every tool
    call.
- **Managed inline hooks** (can be configured):
  - `sherpa.verify.language` — language-mismatch checker; threshold
    is `proportion < 0.5` of expected-language characters.
  - `sherpa.notify.user` — toast on long-running tools.
- **User hooks** — drop a JS file under `<project>/.sherpa/hooks/`.
  The discovered list shows up in this tab; toggle each on/off.

User hooks have access to the same API as managed inline hooks; see
the API reference at `docs/architecture/QUICKSTART.md` (HookPort
section, *Coming in v0.2 with full hook authoring guide*).

## Updates

| Field | Default | Notes |
|---|---|---|
| Update channel | `stable` | `beta` available for preview builds. |
| Auto-update minor releases | off | Major versions always interactive. |
| Check on launch | on | Polls GitHub Releases via `electron-updater`. |
| Last check | derived | Read-only. |

Click **Check for updates** to force an immediate poll. If a new
release is available a banner appears at the top of every screen;
click **Install** to start the apply flow:

1. Sherpa downloads the artefact and verifies its SHA-256 against
   the release manifest.
2. The signature is verified against the bundled public key
   (placeholder in v0.1; real key replacement lands in T-L7-04).
3. A confirm modal asks **Restart and install now?** — clicking
   confirms triggers `autoUpdater.quitAndInstall`.
4. Sherpa core updates run in parallel via the `sherpa-cli`
   subprocess and are applied through `applyUpdate(target: 'core')`.
5. On failure, an `Undo` Banner exposes
   `update:rollback` — Sherpa core has a `core.bak/` checkpoint
   from before the apply step.

## Keyboard shortcuts

[screenshot: Settings → Keyboard shortcuts — list of all defaults]

The complete default mapping (FR40-FR45):

| Shortcut | Action |
|---|---|
| `F1` | Open user guide |
| `Ctrl+P` | Quick open file |
| `Ctrl+Shift+F` | Find in files |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+,` | Settings |
| `Ctrl+B` | Toggle file browser |
| `Ctrl+J` | Toggle agent panel |
| `Ctrl+Shift+E` | Focus file browser |
| `Ctrl+1..9` | Switch tab |
| `Ctrl+W` | Close tab |
| `Ctrl+T` | New task |
| `Ctrl+Enter` | Send agent prompt |
| `Esc` | Close overlays / dismiss modals |

User-customisable bindings are *Coming in v0.2* — for now the
mappings are hard-coded.

## Privacy

| Field | Default | Notes |
|---|---|---|
| Send anonymous telemetry | off | Manual export only — `Settings → Privacy → Export telemetry payload` writes a JSON file you can review and email. (NF17) |
| Audit log location | `<project>/.sherpa/logs/audit.log` | JSONL; metadata only. |
| Crash reports | off | Disabled in v0.1. |

The PII detector for RAG snippets runs locally; no traffic ever
leaves the machine unless you explicitly export the telemetry
payload.

## Project-scope overrides

Inside a project, the same Settings screen has a **Project** tab.
Anything you set there overrides the global value but only for that
project. The override is stored in `<project>/.sherpa/settings.yml`
and committed alongside your code if you check it in.

## Related documentation

- [Getting started](getting-started.md) — first-launch defaults.
- [Plugins](plugins.md) — workspace plugins ship as project-scope
  settings.
- `docs/architecture/QUICKSTART.md` — settings file paths and
  schema versions for contributors.
