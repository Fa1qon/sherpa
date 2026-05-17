# Sherpa Methodology Format — YAML Specification

**Format version:** 1.0  
**File extension:** `.yaml`  
**Storage path:** `<project>/.sherpa/core/methodologies/<id>.yaml`

---

## Overview

A Sherpa methodology is a YAML file that defines a repeatable process as a directed graph of **stages**. Each stage instructs an AI agent what to produce, where to write it, and what conditions must be met before advancing.

The Sherpa engine for each stage:
1. Assembles a system prompt from `system_prompt_template`, `ai_directives`, `corpus_reads`, input artifacts, and knowledge deps
2. Runs the AI agent with that prompt until the gate passes or the agent stalls
3. Evaluates the **gate** — a set of pass/fail conditions checked after each AI turn
4. When all gate items pass, advances to the next stage via the matching edge

---

## Root fields

### Required

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier, kebab-case (e.g. `software-development`). Must be unique across all methodologies in the project. |
| `version` | string | SemVer string in quotes (e.g. `"1.0"`). |
| `name` | string | Human-readable name shown in the Library. |
| `stages` | Stage[] | One or more stage definitions. |

### Optional

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `description` | string | — | One-line summary shown in the Library. |
| `author` | string | — | Author or team name. |
| `anti_patterns` | string[] | — | Use cases this methodology is explicitly NOT suited for. Shown to the user during task creation. |
| `applicability` | string[] | — | Use cases where this methodology fits well. Used for AI routing. |
| `deps` | Dep[] | — | Linked knowledge items and artifact templates (see [Deps](#deps)). |
| `edges` | Edge[] | auto | Stage flow graph (see [Edges](#edges)). Omit entirely for linear flows — the engine derives them automatically. |
| `layout` | Record\<stageId, {x: number, y: number}\> | — | Canvas node positions. Auto-generated if absent; preserved on save. |
| `meta` | Record\<string, unknown\> | — | Arbitrary metadata for tooling. Not consumed by the engine. |

---

## Stage

Each entry in `stages` describes one step of the process.

### Required stage fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique within the methodology, kebab-case. Referenced by edges. |
| `name` | string | Human-readable label shown in the sidebar and on the canvas. |
| `mode` | enum | Execution mode — `auto`, `interactive`, or `gate` (see below). |
| `contract` | Contract | What the stage reads and writes (see [Contract](#contract)). |

### Mode values

| Value | Description |
|-------|-------------|
| `auto` | Agent runs autonomously until the gate passes. |
| `interactive` | Agent waits for user input after each AI turn; gate still evaluated after each turn. |
| `gate` | No agent turn. Gate is evaluated immediately against existing artifacts. Use for human approval checkpoints. |

### Optional stage fields

| Field | Type | Description |
|-------|------|-------------|
| `system_prompt_template` | string | Main instruction to the agent. Write as a multiline block scalar (`\|`). Supports `{project.name}`, `{task.complexity}`, `{meta.X}` placeholders. |
| `ai_directives` | string[] | Short rule lines appended to the system prompt as a bullet list. Supplement `system_prompt_template`, do not replace it. |
| `gate` | Gate | Pass/fail conditions evaluated after each agent turn. Without a gate, the stage advances immediately after one turn. |
| `phases` | Phase[] | Sub-steps within the stage. The agent follows them in sequence. |
| `corpus_reads` | CorpusRead[] | Files injected into the system prompt at stage entry (see [Corpus reads](#corpus-reads)). |
| `role_split` | RoleSplit | Documents AI vs human responsibility. Informational — shown in the sidebar. |
| `execution_isolation` | enum | `inline` (default), `subagent`, or `parallel_subagents`. Controls how the agent subprocess is spawned. |
| `confidence_threshold` | number 0–1 | Minimum confidence score; gate is blocked below this value. |
| `scope_by_complexity` | Record\<`C1`\|`C2`\|`C3`\|`C4`, ScopeOverride\> | Per-complexity prompt addendum or skip flag. |
| `preflight` | PreflightCheck[] | Pre-conditions validated before the stage starts. |
| `context_essentials` | ArtifactRef[] | Artifacts always loaded as context regardless of the stage's `contract.input`. |
| `active_in_modes` | string[] | If set, stage only runs when the task's selected mode matches one of these values. |
| `user_view_template` | string | Markdown template shown to the user (not to the agent) at stage entry. |

---

## Contract

Declares what the stage consumes and produces.

```yaml
contract:
  input:
    - artifact: artifacts/planning.md
      stage: planning
  output:
    path: artifacts/design.md
    format: markdown          # markdown | plaintext (default: markdown)
```

- **`input`** — list of `{artifact, stage}` references. The engine reads these files and injects their content into the assembled prompt before the first turn.
- **`output.path`** — REQUIRED. Path relative to the task directory (`<project>/.sherpa/tasks/<taskId>/`). The engine tells the agent this exact path in the system prompt. The gate evaluator checks for this file.
- **`output.format`** — optional; `markdown` (default) or `plaintext`.

---

## Gate

A gate is a set of conditions evaluated by the engine after each agent turn. The stage advances when all non-optional conditions pass.

```yaml
gate:
  kind: standard
  items:
    - id: output_written
      kind: artifact_written
      label: Output artifact written
      auto_pass_when:
        expr: "artifact_exists('artifacts/planning.md')"
```

### Gate fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `kind` | `standard` \| `comprehension` | `standard` | Gate evaluation mode. Use `standard` in almost all cases. |
| `items` | GateItem[] | — | List of conditions. |

### GateItem fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Unique within the gate. |
| `label` | string | ✅ | Human-readable description shown in the sidebar Gate panel. |
| `kind` | enum | ✅ | `artifact_written`, `user_confirmed`, `reviewer_pass`, `completeness_check`, or `custom`. |
| `auto_pass_when` | ConditionExpr | — | Evaluated automatically after each turn; item passes when the expression is true. |
| `hard_stop` | boolean | false | When `true`, a failing verdict blocks the gate entirely until a human resolves it. |

### GateItem kinds

| Kind | Description | Typical use |
|------|-------------|-------------|
| `artifact_written` | Checks whether an artifact file was written. MUST have `auto_pass_when`. | Every stage that produces an artifact. |
| `user_confirmed` | Requires explicit human approval. Use with `hard_stop: true`. | Review checkpoints, plan approvals. |
| `reviewer_pass` | Requires a registered reviewer agent to pass. | Quality gates, compliance checks. |
| `completeness_check` | Engine checks artifact for completeness markers. | Structured output validation. |
| `custom` | Custom expression in `auto_pass_when`. | Arbitrary conditions. |

### ConditionExpr

`auto_pass_when.expr` is a string expression. Available predicates:

| Predicate | Arguments | Returns | Description |
|-----------|-----------|---------|-------------|
| `artifact_exists(path)` | `path: string` | boolean | True when the file exists in the task artifact store. Path is relative to the task directory (matches `contract.output.path` exactly). |

### CRITICAL RULE — always include `auto_pass_when`

Every `artifact_written` gate item MUST have `auto_pass_when.expr` using `artifact_exists()`. Without it, the item gets verdict `ask` (non-blocking by default) and the stage advances after every message regardless of whether the artifact was written.

```yaml
# CORRECT — gate blocks until artifact is present:
- id: output_written
  kind: artifact_written
  label: Output written
  auto_pass_when:
    expr: "artifact_exists('artifacts/stage-id-output.md')"

# WRONG — gate never blocks, stage always advances:
- id: output_written
  kind: artifact_written
  label: Output written
```

The path in `artifact_exists()` must exactly match `contract.output.path`.

---

## Edges

Edges define the flow between stages. **Omit the `edges` key entirely for strictly linear flows** — the engine derives `start → stage[0] → stage[1] → … → end` automatically.

Include `edges` only when the flow is non-linear (branching, loops, rollbacks).

```yaml
edges:
  - from: start
    to: planning
    condition:
      kind: always

  - from: planning
    to: implementation
    condition:
      kind: gate-pass

  - from: planning
    to: planning
    condition:
      kind: gate-fail
      maxCycles: 3

  - from: implementation
    to: end
    condition:
      kind: gate-pass
```

### Edge condition kinds

| Kind | Extra fields | Description |
|------|-------------|-------------|
| `always` | — | Edge is always taken. Use for `start →` and `→ end` in non-linear graphs. |
| `gate-pass` | — | Taken when the stage gate passes. |
| `gate-fail` | `maxCycles?: number` | Taken when the gate fails. `maxCycles` caps the number of retry loops. |
| `rollback` | `maxCycles?: number` | Controlled return to an earlier stage. |
| `recut` | `maxCycles?: number` | Return to the first stage for scope reformulation. |
| `branch` | `expr: string` | Conditional; expression evaluated against artifact frontmatter. |

### Edge `from` / `to` values

- `start` — virtual entry node; exactly one `from: start` edge required in explicit edge lists
- `end` — virtual exit node; exactly one `to: end` edge required per termination path
- Any stage `id` — references a stage defined in `stages[]`

---

## Phases

Phases divide a stage into named sub-steps the agent follows in sequence. When phases are defined, the engine presents each phase prompt in order and evaluates the phase gate (if any) before advancing to the next phase.

```yaml
phases:
  - id: analyze
    name: Analyze requirements
    mode: auto
    prompt: |
      Analyze the requirements provided by the user.
      Identify ambiguities and list them explicitly.

  - id: draft
    name: Write draft
    mode: auto
    prompt: |
      Using the analysis above, write the first draft.
    gate:
      kind: standard
      items:
        - id: draft_written
          kind: artifact_written
          label: Draft written
          auto_pass_when:
            expr: "artifact_exists('artifacts/draft.md')"
```

### Phase fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Unique within the stage. |
| `name` | string | ✅ | Human-readable label. |
| `mode` | enum | — | Inherits stage mode if omitted. |
| `prompt` | string | — | Phase-specific instruction appended to the stage prompt. |
| `gate` | Gate | — | Phase-level gate; same structure as stage gate. |

---

## Corpus reads

Inject external file content into the assembled system prompt at stage entry.

```yaml
corpus_reads:
  - path: .sherpa/knowledge/k-abc123.md
    purpose: REST API design principles
    inject_into: system_prompt
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | ✅ | Path relative to the project root. |
| `purpose` | string | ✅ | Section header in the assembled prompt (e.g. `## REST API design principles`). |
| `inject_into` | `system_prompt` \| `user_message` | — | Where to inject the content. Default: `system_prompt`. |

**Note:** Knowledge items linked via `deps` are injected automatically — no need to repeat them in `corpus_reads`. Use `corpus_reads` for ad-hoc files not managed as knowledge items.

---

## Deps

Declares linked knowledge items and artifact templates. Knowledge items are injected automatically into the assembled system prompt.

```yaml
deps:
  - knowledge:
      - k-abc123def456        # ID of a knowledge item stored in the project
      - k-789xyz000aaa
  - templates:
      - tmpl-abc123def456     # ID of an artifact template stored in the project
```

Knowledge items are read from `.sherpa/knowledge/<id>.md` and injected as `## Knowledge: <id>` sections in the system prompt before the first turn of each stage.

Artifact template IDs are provided as suggestions to the agent — not auto-injected.

---

## Role split

Documents the division of responsibility between the AI agent and the human. Informational — shown in the sidebar, not injected into the prompt.

```yaml
role_split:
  ai_does: Analyze requirements and write the implementation plan
  human_does: Review the plan and decide whether to proceed
```

---

## Scope by complexity

Per-complexity overrides applied at stage assembly time. Task complexity is set by the user (`C1` through `C4`, from simple to very complex).

```yaml
scope_by_complexity:
  C1:
    system_prompt_addendum: "Keep the plan brief — two pages maximum."
  C3:
    system_prompt_addendum: "Include a risk register and dependency graph."
  C4:
    skip: false
    system_prompt_addendum: "Include formal change impact analysis."
```

| Field | Type | Description |
|-------|------|-------------|
| `skip` | boolean | When `true`, the stage is skipped at this complexity. |
| `system_prompt_addendum` | string | Appended to the assembled system prompt when this complexity is active. |

---

## Full minimal example

```yaml
id: simple-analysis
version: "1.0"
name: Simple Analysis
description: Analyze a topic and write a structured report

stages:
  - id: analyze
    name: Analyze
    mode: auto
    contract:
      input: []
      output:
        path: artifacts/analysis.md
        format: markdown
    system_prompt_template: |
      You are a research analyst working on project {project.name}.

      The user will give you a topic. Your job:
      1. Research the topic thoroughly using available tools
      2. Write a structured Markdown report covering: overview, key findings, risks, and recommendations
      3. Save the report to the path specified in your system context

      Be specific, actionable, and cite any sources you reference.
    gate:
      kind: standard
      items:
        - id: report_written
          kind: artifact_written
          label: Analysis report written
          auto_pass_when:
            expr: "artifact_exists('artifacts/analysis.md')"
```

---

## Full example — multi-stage with approval gate and loop

```yaml
id: software-feature-development
version: "1.0"
name: Software Feature Development
description: End-to-end process for developing a software feature with planning, implementation, and review
author: Sherpa Team

anti_patterns:
  - Emergency hotfixes under time pressure (no time for planning stage)
  - Pure research tasks with no concrete deliverable
  - Database migrations touching >50 tables (use a dedicated migration methodology)

applicability:
  - New software feature development
  - Bug fixes with clear reproduction steps and defined acceptance criteria
  - Refactoring with bounded scope

deps:
  - knowledge:
      - k-coding-standards-abc123
      - k-architecture-decisions-def456

stages:
  - id: planning
    name: Planning
    mode: auto
    role_split:
      ai_does: Analyze requirements, identify edge cases, write an implementation plan with file-level detail
      human_does: Review the plan and explicitly approve before implementation begins
    contract:
      input: []
      output:
        path: artifacts/planning.md
        format: markdown
    system_prompt_template: |
      You are a senior software engineer planning a feature for {project.name}.

      Produce a detailed implementation plan covering:
      1. Summary of what needs to be built and why
      2. Exact files to create or modify (with paths)
      3. Step-by-step implementation approach
      4. Edge cases, risks, and mitigations
      5. Acceptance criteria (specific, testable)

      Write the complete plan to the output artifact path shown in your context.
    ai_directives:
      - Be specific about file paths and function signatures
      - Flag any ambiguities as explicit numbered questions at the end of the plan
      - Estimate effort: low / medium / high
    gate:
      kind: standard
      items:
        - id: plan_written
          kind: artifact_written
          label: Implementation plan written
          auto_pass_when:
            expr: "artifact_exists('artifacts/planning.md')"
        - id: plan_approved
          kind: user_confirmed
          label: Plan reviewed and approved by engineer
          hard_stop: true

  - id: implementation
    name: Implementation
    mode: auto
    contract:
      input:
        - artifact: artifacts/planning.md
          stage: planning
      output:
        path: artifacts/implementation-summary.md
        format: markdown
    system_prompt_template: |
      You are a senior software engineer implementing a feature for {project.name}.

      The approved implementation plan is available in your context above.
      Follow it step by step. After completing all changes, write a summary
      of everything you did to the output artifact path shown in your context.

      The summary must include:
      - List of files created or modified (with full paths)
      - Brief description of each change
      - Any deviations from the plan and why
    gate:
      kind: standard
      items:
        - id: summary_written
          kind: artifact_written
          label: Implementation summary written
          auto_pass_when:
            expr: "artifact_exists('artifacts/implementation-summary.md')"

  - id: review
    name: Review
    mode: gate
    role_split:
      ai_does: Nothing — this is a human review checkpoint
      human_does: Review the implementation diff, run tests, and approve or request changes
    contract:
      input:
        - artifact: artifacts/implementation-summary.md
          stage: implementation
      output:
        path: artifacts/review-verdict.md
        format: markdown
    gate:
      kind: standard
      items:
        - id: reviewed
          kind: user_confirmed
          label: Implementation reviewed and approved
          hard_stop: true

edges:
  - from: start
    to: planning
    condition:
      kind: always

  - from: planning
    to: implementation
    condition:
      kind: gate-pass

  - from: planning
    to: planning
    condition:
      kind: gate-fail
      maxCycles: 3

  - from: implementation
    to: review
    condition:
      kind: gate-pass

  - from: implementation
    to: implementation
    condition:
      kind: gate-fail
      maxCycles: 2

  - from: review
    to: end
    condition:
      kind: gate-pass

  - from: review
    to: implementation
    condition:
      kind: gate-fail
```

---

## Rules checklist

When writing or generating a methodology YAML file, verify all of the following:

1. ✅ `id` is kebab-case and unique across the project
2. ✅ `version` is a quoted string (e.g. `"1.0"`)
3. ✅ Every stage has `id`, `name`, `mode`, and `contract`
4. ✅ Every stage has `contract.output.path`
5. ✅ Every stage's `system_prompt_template` tells the agent exactly what to produce
6. ✅ Every `artifact_written` gate item has `auto_pass_when.expr: "artifact_exists('...')"`
7. ✅ The path in `artifact_exists()` exactly matches `contract.output.path`
8. ✅ Human approval checkpoints use `kind: user_confirmed` with `hard_stop: true`
9. ✅ Linear flows have no `edges` key (engine auto-generates them)
10. ✅ Non-linear flows have `from: start` and `to: end` edges
11. ✅ All stage `id` values referenced in `edges` exist in `stages`
12. ✅ Paths in `contract.output.path` use forward slashes and no leading slash
