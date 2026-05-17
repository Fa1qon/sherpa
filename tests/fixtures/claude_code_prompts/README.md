# Claude Code prompt fixtures — provenance

This directory holds real Claude Code stdout captures used by the T-L2-A
prompt_parser tests (per `<sherpa-source>/plan/phase-2-adapters.md` T-L2-A
capture-as-prologue + `<sherpa-source>/design/agent_protocol.md §3.1`).

## Capture method

Captured by T-L2-A integration setup via `@lydell/node-pty` subprocess
(`scripts/capture-claude-prompts.mjs`).

## Provenance — partial capture (2026-05-02)

| Field | Value |
|---|---|
| Capture timestamp (UTC) | 2026-05-02T17:13:00Z |
| OS | win32 (10.0.26200) — Windows 11 Home, x64 |
| claude binary | `C:\Users\fa1qon\AppData\Roaming\npm\claude.cmd` |
| `claude --version` | `2.1.126 (Claude Code)` |
| Capture host node | v20.x |
| @lydell/node-pty | 1.2.0-beta.12 |

## Status — 1/8 captured automatically; 7/8 require user-driven capture

| Fixture | Trigger prompt | Status | Bytes |
|---|---|---|---|
| `free_text_unknown.txt` | `claude -p "What is your favourite colour? …"` | captured | 321 |
| `edit_approval.txt` | `Edit src/test.ts and add "// touched" at top` | **PENDING** | 0 |
| `bash_approval.txt` | `Run the command: ls -la` | **PENDING** | 0 |
| `file_read_approval.txt` | `Read package.json …` | **PENDING** | 0 |
| `tool_call_approval.txt` | generic `Do you want to continue?` prompt | **PENDING** | 0 |
| `decision_fork.txt` | multi-choice menu trigger | **PENDING** | 0 |
| `reviewer_menu.txt` | reviewer selection menu trigger | **PENDING** | 0 |
| `login_credential.txt` | post `/logout` credential prompt — Type-CZ pause | **PENDING** | 0 |

The 7 PENDING fixtures require a real interactive `claude` session with
permission prompts. To capture them, run from a clean shell (NOT from inside
a running Claude Code session):

```bash
cd C:/Projects/sherpa-ui
node scripts/capture-claude-prompts.mjs
```

For `login_credential.txt` specifically — Type-CZ pause:

1. From a clean shell, `claude /logout` to clear OAuth state.
2. Run `node scripts/capture-claude-prompts.mjs --capture-login` —
   the script spawns claude and captures the credential prompt.
3. From a clean shell, run `claude` interactively and complete `/login`
   to restore authentication.

## Why this is a Type-CZ pause

Per `core/guides/critical_zones.md` (referenced by `CLAUDE.md`):

> Authentication code paths (Claude Code login wrapper) are always-interactive
> critical zones.

A subagent running INSIDE a Claude Code session cannot capture the
credential prompt without either (a) interfering with the parent session's
OAuth state or (b) burning credits on a real prompt-triggering interactive
run with non-deterministic timing. The fixture set therefore stays partial
and the remaining 7 captures must be performed offline by the user (or by
the master with a fresh terminal context). The capture script itself ships
in `scripts/capture-claude-prompts.mjs` and is fully automated for the 7
non-credential fixtures; only `login_credential.txt` needs the explicit
`/logout` step.

## What the test does without these fixtures

`tests/adapters/agents/claude_code/prompt_parser.spec.ts` runs both:

1. **Fixture-driven** test cases — one per fixture file. When a fixture is
   absent OR < 100 bytes the case is `skip()`-ed, NOT failed (so partial
   capture does not block the gate). Once the fixtures are committed each
   case reports its real classification.
2. **Synthetic fallback** test cases — exercise the same regex catalogue
   against hand-written strings. These run unconditionally and assert that
   each of the 7 known patterns + `free_text` fallback classify correctly.
   These ARE NOT a substitute for fixture-driven coverage (R-WIN-PTY
   mitigation requires real captures); they are a regression net during the
   capture gap.

When the fixtures are committed, the parser tests upgrade from 8 skips → 8
real captures × parsePrompt verifications, satisfying AC-T-L2-A-3 fully.
