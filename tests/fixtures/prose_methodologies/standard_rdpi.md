# Standard RDPI — methodology for medium features

> Use when the router classifies a task as T4-M (medium new functionality, C2 complexity) — several components, data flows between them, architectural decisions needed before code.

## Foundational Principle

AI writes code in only one stage (W5). All other stages are context preparation and verification. Skipping preparation does not save time — it creates rework that costs more than the skipped stage.

---

## When to apply

**Apply standard_rdpi if at least one of:**
- 3+ files, or multiple layers (JS + PHP + template + event)
- New interactions between components
- Decision required: "where do we store data / how do we pass it"
- No confident analogue in `/cases/` — pattern is unknown
- Risk = R1-R2 (touches several components or a critical flow)
- User wants to understand the architecture before implementation

**Switch to `module_track` if:**
- It is an independent functional block with its own install/release
- A data migration strategy between versions is required
- ADR (Architectural Decision Records) are needed

**Switch back to `lite_cycle` if:**
- Research reveals the task is simpler (1-2 files, pattern exists)

---

## Stages and artifacts

```
Router (task card)
  ↓
[Phase 0] Task Analysis     → requirements.md (lightweight)   ← user confirms outcome
          (SMART + AC + restate rubric; outcomes: go / clarify / restate / re_route)
  ↓
[Phase 1] Requirements      → requirements.md (full)          ← user confirmation
          (conditional: пропускается если Phase 0 outcome = go;
           активируется если outcome = clarify)
  ↓
[Phase 2] Research          → research.md       ← show to user, get feedback
  ↓
[Phase 2.5] Approach?       → conditional question before Design (no artifact)
  ↓
[Phase 3] Design            → design.md         ← user confirmation (main gate)
  ↓
[Phase 4] Plan              → plan.md           ← user confirmation
  ↓
[Phase 5] Implement         → code (per plan phases)
  ↓
[Phase 6] Verify            → user tests → confirmation
  ↓
[Phase 7] Case              → case.md, GitFlow
```

**Key rule:** errors and inaccuracies are fixed at the Design stage — before any code.
Changing the architecture during Implement is too late.

---

## Phase 0 — Task Analysis

**Goal:** assess task statement before formal Requirements gathering. Entry-phase для standard_rdpi (Group A).

**Protocol:** see `workflow_stages.md` §W0 Task Analysis. Full 4-outcomes logic (go / clarify / restate / re_route) + strict rubric + SMART checklist + lightweight artifact contract — single-source-of-truth там.

**Artifact:** `requirements.md` (lightweight — summary + SMART checklist + AC + scope + open questions, ≤80 строк).

**Gate:** [GATE W0→W1] из `workflow_stages.md` §W0.7.

**Completeness gate:** per `[BR-COMPLETENESS-GUARD]` in `behavioral_rules.md`.

**Branching per outcome:**
- `go` → Phase 1 Requirements может быть compressed (AC уже named в Phase 0)
- `clarify` → Phase 1 Requirements с full Dialogue
- `restate` → wait for user reformulation → re-enter Phase 0
- `re_route` → возврат в Router (классификация изменилась)

---

## Phase 1 — Requirements

**Goal:** collect full requirements. Conditional: активируется если Phase 0 outcome = `clarify` (размытая, нужен dialogue). Если outcome = `go` — Phase 1 compressed или skipped (requirements уже в lightweight artifact из Phase 0).

**Protocol:** see `workflow_stages.md` §W0 Task Analysis (SMART assessment) → если `clarify` → Requirements Dialogue (adaptive cap по complexity — см. `workflow_stages.md` §W1, counter visible).

**Gate:** yes — show reviewer menu + wait for user confirmation.

**Artifact: `requirements.md`**
```markdown
# Requirements — Task #[number]

## Goal
[One or two lines: why the user needs this]

## Functional requirements
| # | Requirement | Priority | Acceptance criteria |
|---|-------------|----------|---------------------|
| F1 | [what must work] | must / should / nice | [how to verify] |
| F2 | ... | ... | ... |

## Non-functional requirements
- Performance: [if relevant]
- Security: [if XSS/SQL risks exist]
- Compatibility: [browsers, framework versions]

## Edge cases
- [situation] → [expected behaviour]

## Explicitly out of scope
- [what we are NOT doing in this task]

## Questions (if any remain)
- [question] → [user's answer]
```

---

## Phase 2 — Research

**Goal:** gather implementation context for requirements confirmed in Phase 1.
Research is TARGETED: "what do we need to know to implement THESE requirements?"

> Add to top of every research.md written in this phase:
> ```
> > **Research filter:** requirements.md — [N] must-requirements
> > **Scope:** only context relevant to implementing these requirements
> ```

**Agent actions (mandatory search order):**
1. `/cases/` — at least 2 searches: was there a similar component / pattern?
2. `/reports/` — at least 2 searches: was this flow mentioned before?
3. `/docs/` — at least 1 search: is there documentation on the required API / mechanism?
4. `/bitrix/` or `/core/` — at least 2 files: how is a similar mechanism natively implemented?
5. Context7 — for up-to-date documentation on a specific API/method
6. WebSearch — only if previous steps yielded no answer

**Detailed Research phase rules:** `core/research_rules.md`

**What NOT to write in research.md:**
- Opinions: "this should be refactored"
- Suggestions: "could be done like this..."
- Evaluations: "this is bad code"

**Confidence < MEDIUM** → request additional context from user before Design.

**Artifact: `research.md`**
```markdown
# Research — Task #[number]

## Task context
[One line: what exactly is being investigated]

## Existing components
| File / Class | Responsibility | Reference |
|-------------|----------------|-----------|
| [path] | [what it does] | [file:line] |

## APIs and mechanisms used
- [API / class] — [what it is used for] — [source: file:line]
- [event / hook] — [where and how it is called]

## Integration points
- Input: [where data comes from]
- Output: [where data goes]
- Events: [which events are listened to / generated]

## Constraints and risks (facts)
- [constraint 1]: [file:line where it is visible]
- [risk 1]: [why it is risky]

## Similar solutions in /cases/
- [case]: [what is implemented there, link]

## Confidence level
HIGH / MEDIUM / LOW

## Sources
- [file:line] — [what was found]
```

---

## Phase 2.5 — Approach Selection (conditional)

Conditional question before Design. No artifact, no gate.
Full protocol: `workflow_stages.md W2.5`.

---

## Phase 3 — Design (solution architecture)

**Goal:** record HOW the feature will be implemented — before writing code.
This is the main gate: errors are cheaper to fix here than in code.

**Agent actions:**
1. Based on Research + Requirements, propose a solution design
2. Show to user, collect feedback
3. Adjust and finalise
4. **Requirements traceability** (all risk levels): a subagent mechanically checks that every F* item from `requirements.md` is covered by at least one decision in `design.md`. The subagent does not evaluate architectural or UI decisions — that is the human's responsibility.

**Detailed Design phase rules:** `core/templates/design_standard.md`

**Structure of `design.md` — mandatory + conditional sections:**

`design.md` is split into **mandatory** sections (always) and **conditional** sections (activated by `## UI Scope Decision`). Entry-gate procedure is described in `design_standard.md` §0.

### Mandatory sections (always)
- `## UI Scope Decision` — result of W3 Step 0 entry-gate
- `## Chosen approach` — 2-3 sentences on the essence of the architectural decision
- `## Components` — what is created/modified
- `## Data Flow` — where data comes from, how it transforms, where it is stored
- `## Sequence (key scenarios)` — sequences for key scenarios
- `## Decisions and rationale` — extended format (see design_standard.md §2)
- `## Design risks` — risks + mitigations
- `## Explicitly outside the design` — what is intentionally deferred

### Conditional sections (activated by UI Scope Decision)
- `## UI Mockups` — **only when UI Scope = yes** (see design_standard.md §4.5)
- `## UX Scenarios` — **only when UI Scope = yes** and ≥2 interaction steps
- `## Mockup Approval` — **only when UI Scope = yes**
- `## API contracts (if changed)` — if public interfaces change

### GATE section (always at the end)
- `## [GATE — W3→W4]` — BR-6 gate protocol checklist

**Typical design decisions to record:**
- Where data is stored (framework data storage abstraction / separate table / module settings)
- How it integrates (event / component / widget / REST)
- How data reaches the frontend (AJAX / component props / global JS)
- Where files are placed (project structure)

**Artifact: `design.md`**

````markdown
# Design — Task #[number]

## UI Scope Decision

| Field | Value |
|-------|-------|
| Decision | <yes / no / no, trivial / no, already approved> |
| Source | <requirements.md A3 / direct / auto (no user response)> |
| Rationale | <1-2 sentences> |
| UI sections in design.md | <listed / skipped> |
| Mockup | <mockup_*.html / n/a> |

**Decision log:**

```
YYYY-MM-DD | <decision> | source: <...> | rationale: <...>
```

## Chosen approach
[2-3 sentences: essence of the architectural decision]

## Components
| File / Class | Role | New / Modified |
|-------------|------|----------------|
| [path] | [what it does] | new / modified |

## Data Flow

```
[From] → [How] → [To]
Example:
Form (JS) → AJAX → /local/ajax/handler.php → HL block → JSON response
```

## Sequence (key scenarios)

```
User → [action]
  → [component A] calls [component B]
  → [component B] reads from [data source]
  → returns [what]
  → displayed [how]
```

## Decisions and rationale
| Decision | Alternatives | Why chosen | Cost of alternative |
|----------|-------------|------------|---------------------|
| [what was decided] | [what was considered] | [rationale] | [what we lose by choosing alternative] |

## Design risks
- [risk]: [how we mitigate]

## Explicitly outside the design
[Record decisions that are intentionally deferred]

<!-- Conditional sections below — include only if UI Scope = yes -->

## UI Mockups
- **File:** `chat_01/mockup_[feature].html`
- **States:** see checklist §4.5 design_standard.md
- **Comments:** [what to pay attention to during review]

## UX Scenarios
### Scenario 1: [name] (happy path)
1. User [action]
2. Sees [result]
3. [next step]

### Scenario 2: [name] (optional)
...

## Mockup Approval

| Field | Value |
|-------|-------|
| File | mockup_[feature].html |
| Status | approved / pending / dropped |
| Date | YYYY-MM-DD |
| Iterations | N |
| happy path | included |
| empty state | included / n/a |
| error state | included / n/a |
| loading state | included / n/a |

## API contracts (if changed)

```
Endpoint / method: [name]
Input: [parameters]
Output: [response structure]
Errors: [codes and meanings]
```

<!-- GATE section — always at the end -->

## [GATE — W3→W4]
- [ ] Entry-gate passed, UI Scope recorded
- [ ] Reviewer menu shown, selection received
- [ ] User confirmed design
- [ ] Mockup created and approved (if UI Scope = yes; otherwise n/a)
````

---

## Phase 4 — Plan (implementation plan)

**Goal:** step-by-step file-level plan. Each phase = a verifiable result.

**Agent actions:**
1. Decompose Design into implementation phases
2. Each phase = a complete piece: can be verified independently
3. Specify order and dependencies between phases
4. Show plan to user — wait for confirmation

**Rule:** agent MUST NOT write code before plan confirmation.

**Artifact: `plan.md`**
```markdown
# Implementation plan — Task #[number]

## Phase 1: [name]
**Goal:** [what will work after this phase]
- [ ] [File: path] — [what to create / change]
- [ ] [File: path] — [what to create / change]
**Phase verification:** [how to confirm the phase is complete]

## Phase 2: [name]
**Goal:** [what is added]
- [ ] [File: path] — [what to create / change]
**Depends on:** Phase 1
**Phase verification:** [how to confirm]

## Files we do NOT touch
[List neighbouring files that may appear related]

## Final verification scenarios
1. [Scenario] → expected: [result]
2. [Scenario] → expected: [result]

## Rollback
[How to return to the original state if something goes wrong]
```

---

## Phase 5 — Implement

**Goal:** code strictly per `design.md` and `plan.md`. By phases: complete and verify each phase before moving to the next.

**Implementation rules:**
- Modern framework API (`use Framework\Core\...`), not legacy API
- Use the stack's native UI Kit, not a generic CSS framework
- Comments in Russian with source: `// Source: {{project.cases_path}}/<example-case>.md, design.md`
- No `console.log()`, `error_log()`, `var_dump()`
- Maximum 3 nesting levels, early return
- No PHP tags in scripts for `php_command_line.php`

**After each plan phase — self-review:**
- [ ] CLAUDE.md checklist passed
- [ ] Implementation matches design.md
- [ ] Implementation matches current phase of plan.md
- [ ] No XSS, SQL injection
- [ ] Sources cited in comments
- [ ] No debug code

**If during implementation the design turns out to be wrong:**
- Stop
- Record in `report.md` what exactly does not work
- Return to Design with the specific problem (do not start guessing)
- Update design.md and plan.md, get confirmation

**If a phase does not complete — do not move to the next.**

---

## Phase 6 — Verify

**Goal:** user tests against scenarios from `plan.md`.

**Agent actions:**
1. Show verification scenarios from `plan.md`
2. Wait for result
3. If not working → follow **Post-Verify Fix Protocol** (CLAUDE.md W6.5)

**DO NOT close without explicit user confirmation.**

---

## Phase 7 — Case

**Goal:** final document for the knowledge base. Do not duplicate design.md — unique content only.

**Artifact: `case.md`** (in the task root folder)
```markdown
# Case — Task #[number]: [title]

## Requirements conformance
| Requirement | Status | Reference |
|-----------|--------|--------|
| F1 [text] | done / partial / deferred | [file:line] |

## What was done
[Brief description: files, key decisions]

## Deviations from design
[What changed relative to design.md and why — or "none"]

## Fixes during implementation
[What had to be redone, which hypotheses did not work]

## Useful patterns (for reuse)
[Non-standard solutions worth remembering]

## Final code
[Full code of key changed files without debug output]

## Sources
[What helped — /cases/, /bitrix/ files, documentation]

## Execution time
[Total time]
```

**GitFlow:** commit task folder + changed files, merge branch to master, delete branch.

---

## AI / Human matrix

| Phase | AI (%) | Human (%) | Confirmation points |
|-------|--------|-----------|---------------------|
| Research | 85% — search, facts, code map | 15% — completeness validation | Informing (not a gate) |
| Requirements | 60% — formulation | 40% — clarification, priorities | **Confirmation** |
| Design | 50% — options, diagrams, draft | 50% — trade-off decisions | **Confirmation (main gate)** |
| Plan | 65% — decomposition, order | 35% — risks, done criteria | **Confirmation** |
| Implement | 70% — code, self-review | 30% — invariant control | Each plan phase |
| Verify | 20% — test scenarios | 80% — testing, release decision | **Confirmation** |
| Case | 90% — writing | 10% — additions | — |

---

## Anti-patterns (forbidden)

- Move to Design without completed Research
- Write research.md before requirements.md is confirmed (violates Self-Check 1b)
- Move to Plan without confirmed Design
- Write code before Plan confirmation
- Include opinions and advice in research.md (facts only)
- Change architecture during Implement without returning to Design
- Close a task without user confirmation
- Move to the next plan phase before the current one is complete
- Start Implement with confidence < MEDIUM

---

## Review Agents

Launched per BR-6 gate protocol: artifact written → reviewer menu shown to user → user selects reviewers → agents run → Comprehension Gate. See `workflow_stages.md` Review Agents — General Rules.

| Stage | Reviewers | Parallel |
|-------|-----------|:--------:|
| Pre-Research (TDV) | Task Description Validator | 1 |
| Requirements → | Requirements Traceability + Requirements Quality | 2 |
| Research → | Research Completeness + Research Quality | 2 |
| Design → | Design Reviewer + Design Security Reviewer | 2 |
| Plan → | Plan Traceability + Plan Structure | 2 |
| Implement → | Compliance + Security + Performance + Standards + Maintainability + Robustness | 6 |

**Total: 15 reviewers. Prompts:** `core/reviewers/`

---

## Quality gates

| Gate | Transition condition |
|------|---------------------|
| Requirements → Research | user confirmed requirements |
| Research → Design | implementation context gathered, confidence ≥ MEDIUM |
| Design → Plan | user confirmed design |
| Plan → Implement | user confirmed plan |
| Phase N → Phase N+1 | phase N complete, self-review passed |
| Implement → Verify | all plan phases complete, checklist passed |
| Verify → Case | user confirmed the solution works |

---

## Related documents

- `docs/ai_development_research_design_plan_implement.md` — base RDPI concept
- `01_task_classification/router_prompt.md` — classification and initialization
- `core/methodologies/lite_cycle.md` — simplified variant (C1-C2, no cross-component links)
- `core/methodologies/module_track.md` — next level (C3, standalone module)
