# Lite Cycle — methodology for small features

## Purpose

Lightweight cycle for **T4-S (small new functionality)**: quick requirements clarification,
targeted pattern search, short plan, implementation, and acceptance.

No design document. No separate research artifact. Fewer confirmations.

**Principle:** "Don't inflate the process where the task fits in one head."

---

## When to apply

**Apply lite_cycle only if ALL conditions are met:**
- 1-2 files affected **in one layer** (PHP only, or JS only — not both)
- No new interactions between components (data does not travel new routes)
- Other components' APIs / contracts are not changed
- Implementation pattern exists in `/cases/` (search is mandatory — "I know it anyway" does not count)
- Verification — by one user in 5-10 minutes

**Switch to `standard_rdpi` if at least one of:**
- 3+ files, or multiple layers (JS + PHP, or PHP + template, or PHP + event handler)
- Need to explain how data flows between components
- Existing API behaviour or contract is changed
- No analogue in `/cases/` after 3 searches — pattern is unknown
- Risk R1-R2 (touches a critical flow)

**When in doubt — choose `standard_rdpi`.** Time spent on design is cheaper than broken architecture.

---

## Difference from `standard_rdpi`

| Aspect | `lite_cycle` | `standard_rdpi` |
|--------|-------------|----------------|
| Research | Built into plan (2-3 searches, not an artifact) | Separate `research.md` |
| Design | Absent | `design.md` (C4, sequence, contracts) |
| Requirements | Brief list in `requirements.md` | Full `requirements.md` |
| Plan | Step checklist | Phased plan with gates |
| Gates | One: plan → user → implement | Three: research, design, plan |
| Artifacts | `requirements.md`, `plan.md`, `report.md` | + `research.md`, `design.md` |
| Complexity | C1 (rarely C2 without cross-component links) | C2-C3 |

---

## Stages and artifacts

```
Router (task card)
  ↓
[Phase 1] Clarify + Research    → requirements.md (+ research inside)
  ↓
[Phase 2] Plan                  → plan.md  ← user confirmation
  ↓
[Phase 3] Implement             → code
  ↓
[Phase 4] Verify                → user tests → confirmation
  ↓
[Phase 5] Case                  → case.md, GitFlow
```

---

## Phase 1 — Clarify + Research

**Goal:** understand exactly what needs to be done and find the correct implementation pattern for your stack.

### Task Analysis check (inline)

Before proceeding with Clarify+Research, assess task per `workflow_stages.md` §W0 Task Analysis (compact — не full Phase 0, т.к. lite_cycle =C1 overhead budget):

**SMART mini-check (1-2 mins):**
1. **Specific** — конкретный субъект (файл / компонент) и результат?
2. **Measurable** — что значит задача сделана (1 строка)?
3. **Achievable** — реализуемо в рамках 1-2 файлов и existing patterns?
4. **Relevant** — относится к текущему scope?

**AC checkpoint:** что значит задача сделана? (1 строка — минимум для lite_cycle).

**Restate trigger:** если Specific=FAIL OR Achievable=FAIL OR ≥2 signals FAIL → propose restate per `workflow_stages.md` §W0.6 format. Не продолжать Clarify+Research до reformulation.

**On PASS:** proceed with Clarify+Research actions below.

**Completeness gate:** per `[BR-COMPLETENESS-GUARD]` in `behavioral_rules.md`.

**Agent actions:**
1. Clarify requirements (1-2 questions max — only if unclear):
   - Where exactly should it work (page, component, module)?
   - Are there edge cases or constraints?
   - What should it look like (if UI)?
2. Search for pattern (2-3 searches, not a separate artifact):
   - `/cases/` — was there a similar component/button/filter?
   - `/bitrix/` or `/core/` — how is a similar mechanism natively implemented?
   - `/docs/` — is there documentation on the required API?
3. Record the found pattern in `requirements.md` (section "Source")
4. If no pattern found → switch to `standard_rdpi` (full research needed)

**Rule:** if pattern is unknown after 3 searches — this is not lite_cycle.

**Artifact: `requirements.md`**
```markdown
# Requirements — Task #[number]

## What to do
[1-3 sentences: specific result]

## Where
[Page / component / module / hook]

## Behavior
- [specific behaviour 1]
- [specific behaviour 2]

## Edge cases
- [if any]

## What NOT to do
[Scope constraints — to prevent creep]

## Pattern source
- [/cases/file] — [what was taken from there]
- [/bitrix/file:line] — [what was taken from there]

## Confidence
🟢 HIGH / 🟡 MEDIUM
(If below MEDIUM — switch to standard_rdpi)
```

---

## Phase 2 — Plan (short plan)

**Goal:** implementation step checklist. Not a phased plan, not an architectural document.

### Step 0: UI Entry-Gate (introduced in METH-024)

Before generating `plan.md` — **the entry-gate applies the same way as in `standard_rdpi` §W3 Step 0** (see `workflow_stages.md` §W3 and `design_standard.md` §0).

In `lite_cycle`, Design is merged with Plan, so the entry-gate is performed **at the start of the combined phase** (before writing the first step of plan.md):

1. Read `requirements.md` → find aspect A3 UI/UX (if present)
2. Show the preliminary decision to the user: `yes / no / no, trivial / no, already approved earlier`
3. Record the answer in the `## UI Scope Decision` section inside `plan.md` (lite_cycle has no separate design.md)
4. Update `meta.md: ui_entry_gate_passed: true`

**Branching:**
- `yes` → `plan.md` is augmented with a step "create `chat_01/mockup_*.html`" **before** any code steps. The mockup is approved by the user, and a `## Mockup Approval` section is added to `plan.md`. Transition to Implement is blocked until `meta.md: mockup_approved: true`.
- `no` → no UI steps in plan.md, normal flow.

**Practice:** 90% of `lite_cycle` tasks are C1-backend (migrations, fixes, CLI scripts); the answer is almost always `no`, and the entry-gate takes 5 seconds.

### Agent actions

1. **Step 0: UI Entry-Gate** (see above) — before all other actions
2. Build a step-by-step checklist: what and in which file to change
3. Add verification scenarios
4. Show to user — wait for confirmation

**Rule:** agent **does not write code** before plan confirmation.

**Artifact: `plan.md`**
```markdown
# Plan — Task #[number]

## Implementation steps
- [ ] [File: path] — [what to do]
- [ ] [File: path] — [what to do]
- [ ] [File: path] — [what to do]

## Files we do NOT touch
[List adjacent files that may appear related]

## Verification scenarios
1. [What to do] → expected: [result]
2. [What to do] → expected: [result]

## Rollback (if something goes wrong)
- [Rollback step 1 — e.g.: restore file from git]

## Risk assessment
R[1-3] — [rationale]
```

---

## Phase 3 — Implement

**Goal:** code strictly per `plan.md`. No scope creep.

**Implementation rules:**
- Only what is in the plan
- Modern framework API (`use Framework\Core\...`), not legacy API (`LegacyClassA*`, `LegacyClassB*`)
- Use the stack's native UI Kit, not a generic CSS framework
- Comments in the user's language with source: `// Source: {{project.cases_path}}/<example-case>.md`
- No `console.log()`, `error_log()`, `var_dump()`
- Maximum 3 nesting levels

**If during implementation the task turns out to be larger than the plan:**
- Stop
- Record in `report.md` what turned out to be more complex
- Discuss with user: expand plan or switch to `standard_rdpi`

**Self-review before handing to user:**
- [ ] CLAUDE.md checklist passed
- [ ] Changes match `plan.md`
- [ ] Nothing extra touched
- [ ] No XSS, SQL injection
- [ ] Source cited in comment

---

## Phase 4 — Verify

**Goal:** user checks against scenarios from `plan.md`.

**Agent actions:**
1. Show verification scenarios from `plan.md`
2. Wait for result
3. If not working → follow **Post-Verify Fix Protocol** (CLAUDE.md W6.5)

**❌ DO NOT close without explicit confirmation**

**Verification request template:**
```
Please verify:

1. [scenario 1] → expected: [result]
2. [scenario 2] → expected: [result]

Does everything work?
```

---

## Phase 5 — Case

**Goal:** brief case for the knowledge base. Do not duplicate `plan.md` — unique content only.

**Artifact: `case.md`** (in task root folder)
```markdown
# Case — Task #[number]: [name]

## What was done
[1-2 sentences: essence of change]

## Files
- [path] — [what exactly]

## Pattern (for reuse)
[Key technique, API, or approach worth remembering]

## Final code
[Full code of changed files / fragments]

## Sources
[What helped find the solution]
```

**GitFlow:**
```bash
git add projects/[project]/tasks/[number]/
git add [changed files]
git commit -m "feat: task [number] — [brief description]"
git checkout master
git merge issue_[number]
git branch -d issue_[number]
```

---

## AI / Human matrix

| Phase | AI | Human |
|-------|----|-------|
| Clarify + Research | Clarifying questions, pattern search | Answers questions, confirms requirements |
| Plan | Builds checklist, verification scenarios | **Confirms plan** before implementation |
| Implement | Writes code, self-review | Can request changes |
| Verify | Formulates scenarios | **Tests and confirms** |
| Case | Writes case | Can add context |

---

## Anti-patterns (forbidden)

- ❌ Apply lite_cycle when pattern is unknown (no analogue in /cases/)
- ❌ Apply lite_cycle when a design question appears ("where should we put the data?")
- ❌ Expand scope during implementation without discussing with user
- ❌ Skip pattern search in /cases/ and /bitrix/
- ❌ Close task without user confirmation

---

## Review Agents

Launched automatically. No separate Design stage → Design reviewers skipped.

| Stage | Reviewers | Parallel |
|-------|-----------|:--------:|
| Pre-Research (TDV) | Task Description Validator | 1 |
| Research → | Research Completeness + Research Quality | 2 |
| Plan (incl. Design) → | Req. Traceability + Req. Quality + Plan Traceability + Plan Structure | 4 |
| Implement → | Compliance + Security + Performance + Standards + Maintainability + Robustness | 6 |

**Total: 13 reviewers.** Design Reviewer and Design Security Reviewer not launched (no Design stage).

---

## Quality gates

| Gate | Transition condition |
|------|---------------------|
| Clarify → Plan | requirements recorded, pattern found, confidence ≥ MEDIUM |
| Plan → Implement | user confirmed plan |
| Implement → Verify | self-review passed |
| Verify → Case | user confirmed the solution works |

---

## Signs that lite_cycle was chosen incorrectly (switch to standard_rdpi)

- A question appeared: "how does this connect to [other component]?"
- File list in `plan.md` grew to 3+
- User says "and it also needs to affect…"
- No confident answer to "where does the data come from?"
- Implementation requires changing DB structure

---

## Related documents

- `01_task_classification/router_prompt.md` — classification and initialization
- `core/methodologies/standard_rdpi.md` — next complexity level
- `01_task_classification/complexity_model.md` — complexity model C1-C4
