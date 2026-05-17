# Running an agent session

The Agent Panel is where you converse with Claude Code — sending
prompts, approving permission requests, and watching context usage in
real time.

> Implements UX flows F5, F6 (`design/ux.md §F5`, §F6) — agent session
> with permission gating, and the 70% context threshold.

## Launching the agent

[screenshot: Agent panel — empty session with composer focused]

1. Open a task from the Kanban OR select **Agent** in the
   ActivityBar to open a project-level session.
2. Press the green **Launch** pill at the top of the panel.
3. Sherpa spawns the Claude Code subprocess via PTY (using
   `@lydell/node-pty`) and pipes its stdout / stderr into the panel.

The session is bound to:

- The current task ID (or `null` for project-level sessions).
- The project's `<project>/.claude/settings.json` allowlist.
- The audit log at
  `<project>/.sherpa/logs/audit.log` (JSONL; metadata only).

Status pill colours:

| Pill | Meaning |
|---|---|
| `idle` | Agent is alive but not working — type a prompt. |
| `running` | Claude Code is processing your input. |
| `tool_running` | A tool (read / edit / search) is in flight. |
| `awaiting_input` | The agent is waiting for your decision (see Permissions below). |
| `crashed` | Subprocess died — click Launch to restart. |

## Sending a prompt

[screenshot: Agent panel mid-conversation, composer with text]

1. Type into the composer at the bottom of the panel.
2. Press `Ctrl+Enter` (or the **Send** button).
3. The prompt streams to Claude Code; output appears as
   markdown-rendered messages with code blocks highlighted via
   CodeMirror 6.

The composer supports:

- Multi-line input — `Shift+Enter` inserts a newline; `Ctrl+Enter`
  sends.
- Slash commands recognised by Claude Code (e.g. `/help`,
  `/cost`, `/clear`).
- Drag-and-drop files from the file browser to insert their path.

## Permission gating

[screenshot: Permission card — diff viewer + Allow / Deny / Always]

When Claude Code wants to edit a file, run a shell command, or invoke
an unfamiliar tool, the panel switches to **awaiting_input** and
mounts a permission card:

- **Read approval** — file path; one-click Allow.
- **Edit approval** — file path + unified diff (red removed / green
  added). Click Allow to apply, Deny to skip.
- **Bash / shell approval** — full command line.
- **Tool approval** — tool name + JSON arguments.

Each card has three actions:

| Action | Effect |
|---|---|
| **Allow once** | Sends `y` to Claude Code; no allowlist mutation. |
| **Always allow** | Adds the rule to `<project>/.claude/settings.json`; future invocations skip the prompt. |
| **Deny** | Sends `n`; the agent recovers and tries another path. |

Always-allow rules can target a specific file
(`Edit(src/components/Button.tsx)`) or a glob
(`Edit(src/components/*)`). Sherpa preserves your manually-edited
allowlist entries (NF25) — adding a rule never rewrites unrelated
keys.

Every permission decision is recorded in the audit log:

```json
{"ts":"2026-05-04T12:01:00Z","hook":"sherpa.audit.log","tool":"Edit","decision":"allow","target":"src/components/Button.tsx","session_id":"abc123"}
```

The audit log NEVER stores the diff or command output — only
metadata (per ADR-010 §Compliance §3).

## Context monitoring

[screenshot: Context meter at 71%, yellow Banner, Open context manager button]

A meter at the top of the panel shows current context usage as a
percentage of the configured threshold (default 200k tokens). The bar
turns yellow at 70 % and shows a non-blocking warning banner.

Click **Open context manager** to inspect what is in the context:

- **Pinned files** — never dropped; you mark them sticky.
- **Active files** — most recently used in the last 10 turns.
- **Excluded files** — discarded from the live context (recoverable).

For each file you see token count and last-used turn. Click the
**Drop** button to remove a file from the active context — Sherpa
sends a control sequence to Claude Code and updates the meter on the
next snapshot poll (default 5 seconds).

When the cumulative usage drops below 70 %, the banner disappears
automatically.

> The 70 % threshold is configurable per-project under
> [Settings → Agent → Context threshold](settings.md#agent-settings).

## Subagents

If your agent spawns subagents (Claude Code's parallel sub-task
mechanism), they appear in the **Subagent panel** — a separate pane
under the ActivityBar. Each subagent shows its task name, status,
and message stream.

Subagent observation is read-only — you cannot inject input. To
intervene, return to the parent session.

## Hooks

Sherpa runs three managed inline hooks during every agent session:

- `sherpa.audit.log` — appends a metadata-only JSONL record after
  each tool call (per ADR-010).
- `sherpa.verify.language` — checks `AssistantOutputComplete` events
  against the project's configured language. If the agent answers in
  English when the project language is `ru`, the hook returns
  `decision: 'modify'` and a finding surfaces in the Hook Activity
  feed. (Production wiring of the user-facing **language_mismatch**
  Banner inside the panel is *Coming in v0.2*.)
- `sherpa.notify.user` — fires when a long-running tool wants
  attention.

You can add your own user-defined hooks under
`<project>/.sherpa/hooks/` (see [Settings → Hooks](settings.md#hooks)).

## Cost tracking

The `/cost` slash command in the composer prints the running session
cost (input + output tokens × Claude Code's published rate). Sherpa
aggregates per-task and per-project totals in the **Metrics**
dashboard — see the side ActivityBar's metrics icon.

## Recovering from a crash

If the Sherpa app crashes during an agent session:

1. The agent subprocess is killed by the OS.
2. The crash recovery flow (F8) detects the stale lock at
   `~/.sherpa/projects/<slug>/.workspace.lock` on next launch.
3. The Recovery screen shows the pending sessions; click **Resume**
   to restore the chat history and timeline. The agent itself is
   NOT auto-restarted — click **Launch** when you are ready.

The chat history (`chat_history.jsonl`) is written through atomic
`StoragePort.put()` calls (NF14), so a partial write cannot corrupt
the replay.

## Related documentation

- [Searching with RAG](rag.md) — sherpa_* MCP tools available to the
  agent.
- [Settings — Agent](settings.md#agent-settings) — context threshold,
  cost limits, default prompt overrides.
- [Plugins](plugins.md) — adding custom tools the agent can call.
