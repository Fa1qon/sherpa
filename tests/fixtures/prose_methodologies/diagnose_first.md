# Diagnose First — methodology for bugs

> **Foundational principle:** Every fix MUST be preceded by a tested hypothesis. A patch without a confirmed root cause is gambling, not engineering.

## When to use

Use when a reproducible defect exists in production or staging code, system behaviour diverges from expected, and there is no active outage requiring immediate stabilization.

**Apply when:**
- A reproducible defect exists in existing logic
- System behaviour diverges from expected
- No signs of a prod outage (if there are — `stabilize_first` first, then `diagnose_first`)

**Switch to `stabilize_first`:** if severity = S0 (system is down / business process stopped right now).

---

## Fast Track (C1 + HIGH confidence)

For simple, obvious bugs (1 file, clear cause, no regression risk) — shortened cycle.

**Fast track conditions:**
- Complexity = C1 (single file / narrow scope)
- Risk = R3 (local, reversible)
- Cause is obvious from the description or stack trace points to a specific line

**What is shortened:**
- Triage + Reproduce are merged into one message to the user
- Diagnose and Fix Plan are merged: agent immediately shows diagnosis + proposes fix in one block
- One confirmation instead of three: "Cause is [X], fix is [Y] — agreed?"

**What remains mandatory even in fast track:**
- Diagnosis with file and line reference (even if brief)
- User confirmation before implementation
- User confirmation after verification
- `report.md` and `case.md`

**Fast track scheme:**
```
Triage+Reproduce (one question) → confirmation
  ↓
Diagnose+Fix Plan (one block) → confirmation
  ↓
Implement → Verify → Case
```

**If during fast track the bug turns out to be more complex** → immediately switch to the full cycle.

---

## Stages and artifacts

```
Router (task card)
  ↓
[Phase 0] Triage          → triage.md
  ↓
[Phase 1] Reproduce       → reproduce.md  ← user confirmation
  ↓
[Phase 2] Diagnose        → diagnosis.md  ← user confirmation
  ↓
[Phase 3] Fix Plan        → fix_plan.md   ← user confirmation
  ↓
[Phase 4] Implement       → code
  ↓
[Phase 5] Verify          → user tests → confirmation
  ↓
[Phase 6] Prevention + Case → case.md, GitFlow
```

---

## Phase 0 — Triage (assessment, 2-5 min)

**Goal:** understand scope and urgency, decide whether stabilization is needed before diagnosis.

### Sanity check (inline, before full Triage) — Group C (C1 only)

Для diagnose_first C1 (simple bug) — minimal inline check, без full W0 Task Analysis overhead. 3 questions:

- Симптом воспроизводим в контексте AI? (code/logs достаточны для reproduce)
- Ожидаемое поведение отличимо от фактического? (expected vs actual явно формулируется)
- Fix scope назван? (симптом или root cause — 1-line commitment)

Three yes → proceed to full Triage below (C1 fast path).
Any no OR complexity = C2+ → use Phase 0.5 Mini Task Analysis (see below, Group D conditional).

**Agent actions:**
1. Clarify symptoms (if not described): what happens, where, to whom, how often
2. Assess severity and risk from the task card
3. If S0 → immediately switch to `stabilize_first`, return to diagnose_first after stabilization

**Clarifying questions (ask if unclear):**
- Does this happen always or sometimes?
- How many users/processes are affected?
- When was it first noticed? Was anything changed before this?
- Are there logs, error messages, screenshots?

**Artifact: `triage.md`**
```markdown
# Triage — Task #[number]

## Symptoms
[What happens, where, to whom]

## Context
- First seen: [date/event]
- Frequency: [always / sometimes / rarely]
- Affected: [number of users/processes]
- Recent changes: [what changed before the bug appeared]

## Evidence
- Logs: [or "none"]
- Screenshots: [or "none"]
- Error message: [text or "none"]

## Assessment
- Severity: S[0-3]
- Risk: R[1-3]
- Decision: [continue diagnose_first / switch to stabilize_first]
```

---

## Phase 0.5 — Mini Task Analysis (conditional: C2+ only)

**Applies if:** Router assessed complexity = C2 / C3 / C4 for this diagnose_first task.

**Skip if:** complexity = C1 (see Phase 0 inline Sanity check above для C1 fast path).

**Purpose:** для complex bugs (cross-module, неочевидный repro, environment-specific) scope matters — фиксим симптом или root cause? Без этого risk wasted Research / iterative fix cycles.

**Mini Task Analysis (5-10 mins):**

1. **Scope decision:** fix symptom (temporary workaround) OR fix root cause (systematic)?
   - symptom: fast, localized, потенциально оставляет technical debt
   - root cause: longer, может затронуть другие components, решает проблему навсегда
   - Decision должно быть explicit, not implicit

2. **AC для fix:** какой observable signal указывает на success?
   - For symptom fix: specific failing scenario stops failing
   - For root cause fix: specific failing scenario + no regression на related features

3. **Regression scope:** какие другие functionality затронуты, которые нужно проверить?
   - List components / features, которые используют затронутый code path
   - Test scenarios для каждого (inform Phase 6 Verify later)

**Outcome recorded in:** `triage.md` — новая секция «### Mini Task Analysis (C2+)» с 3 пунктами выше.

**Next:** Phase 1 Reproduce с locked scope и AC.

**Not applicable:** C1 bugs — используется `## Phase 0` inline Sanity check (Group C fast path).

---

## Phase 1 — Reproduce

**Goal:** obtain stable reproduction steps. Without this, there is no confidence the fix works.

**Agent actions:**
1. Based on the description, formulate assumed reproduction steps
2. Ask user to verify the steps
3. Clarify expected vs actual behaviour
4. Request diagnostic data if needed:
   - browser console screenshot
   - diagnostic script output (stack-specific format — see `{{stack}}/methodology_augments/diagnose_first.md` for the project's preferred runner)
   - specific record ID where it reproduces

**Rule:** agent MUST NOT proceed to Diagnose until user confirms reproduction.

**Artifact: `reproduce.md`**
```markdown
# Reproduction — Task #[number]

## Reproduction steps
1. [step 1]
2. [step 2]
3. [step 3]

## Expected behavior
[What should happen]

## Actual behavior
[What happens]

## Environment
- Project: [project]
- Browser / version: [if JS]
- Specific ID / data: [if applicable]

## Reproduction evidence
[Screenshot / script output / log]

## Status
✅ Reproduced / ⚠️ Unstable / ❌ Cannot reproduce
```

**Protocol if status is ❌ Cannot Reproduce:**
1. Record all attempts and reproduction conditions in `reproduce.md`
2. Request from user: specific data/IDs, environment, reproduction on their side
3. If after 3+ attempts with additional context — still cannot reproduce:
   - Record as "Cannot Reproduce" in `reproduce.md`
   - Ask user for a decision: close / defer / continue as a hypothetical fix
   - MUST NOT proceed to Diagnose without reproduction or explicit user decision

**Protocol if status is ⚠️ Unstable:**
- Record conditions under which it reproduces (frequency, data, time)
- Continue as ✅ if reproduced at least once reliably

---

## Phase 2 — Diagnose

**Goal:** find the root cause, not the symptom. Build a map of the affected code.

**Agent actions:**
1. Search the codebase (order is mandatory):
   - `/cases/` — was there a similar bug?
   - `/reports/` — was this component mentioned?
   - `/docs/` — is there documentation on the affected logic?
   - `{{stack.core_path}}` or `/core/` — how does the native stack mechanism work?
2. Build a call map: where the chain starts, where it breaks
3. Formulate hypotheses (most likely to least)
4. Verify hypotheses via diagnostic scripts or questions to user
5. Record the root cause

**Rules:**
- Facts only, no fix-level assumptions
- Verify each hypothesis before moving to the next
- After >3 failed hypotheses — request additional data from user
- Confidence < 🟡 MEDIUM → transition to Fix Plan is forbidden

**Artifact: `diagnosis.md`**
```markdown
# Diagnosis — Task #[number]

## Code map
- Affected files: [list with paths]
- Entry point: [file:line]
- Failure point: [file:line]
- Call chain: A → B → C → [failure]

## Hypotheses
| # | Hypothesis | Verification | Status | Why rejected (if ❌) |
|---|------------|--------------|--------|----------------------|
| 1 | [hypothesis] | [how verified] | ✅/❌ | [reason / "" if accepted] |
| 2 | ... | ... | ... | ... |

## Root cause
[Exact description of cause with file and line reference]

## Why it happened
[Context: the change that led to the bug, or a design defect]

## Confidence level
🟢 HIGH / 🟡 MEDIUM / 🟠 LOW

## Sources
- [file:line] — [what was found]
- [case/document] — [what was used]
```

---

## Phase 3 — Fix Plan

**Goal:** minimal correct change. Not refactoring, not improvement — fix only.

**Agent actions:**
1. Formulate a minimal fix based on the diagnosis
2. Identify files and lines to change
3. Think through regression scenarios (what could break)
4. Show plan to user — wait for confirmation

**Rule:** agent MUST NOT write code before user confirms the plan.

**Artifact: `fix_plan.md`**
```markdown
# Fix plan — Task #[number]

## Root cause (brief)
[One line from diagnosis.md]

## What to change
| File | Line(s) | What exactly |
|------|---------|--------------|
| [path] | [N-M] | [description of change] |

## What NOT to touch
[Adjacent code that looks related but is not the cause]

## Considered fix alternatives
| Option | Why not chosen |
|--------|----------------|
| [alt. 1] | [reason] |

## Fix type
- [ ] Code change
- [ ] Data fix (migration script) → see "Data fix" section
- [ ] Workaround via event/inheritance (when stack core code is read-only — see stack augment)

## Regression risks
- [Scenario 1]: [how to verify]
- [Scenario 2]: [how to verify]

## Verification scenarios
1. [Reproduce bug — should be gone]
2. [Regression 1 — should still work]
3. [Regression 2 — should still work]

## Rollback (if the fix made things worse)
- Code rollback: `git revert [commit]` or restore files from branch
- Data rollback (if data fix): [backup file / restore script]
- Rollback criterion: [what exactly means "got worse"]

## Fix risk assessment
R[1-3] — [rationale]
```

---

## Phase 4 — Implement

**Goal:** write the fix strictly per `fix_plan.md`. Minimal changes.

**Implementation rules:**
- Only what is specified in the plan
- Use the stack's modern API only (no legacy/deprecated calls — see `{{stack}}/methodology_augments/diagnose_first.md` for stack-specific lists)
- No `console.log()`, `error_log()`, `var_dump()`
- Comments in Russian with sources
- Maximum 3 nesting levels

**Code review (after writing, before handing to user):**
- [ ] Pre-commit checklist (CLAUDE.md)
- [ ] Change strictly matches fix_plan.md
- [ ] No unrelated code touched
- [ ] No XSS, SQL injection
- [ ] Solution source cited in comment

---

## Phase 5 — Verify

**Goal:** confirmation from user that the bug is fixed and there are no regressions.

**Agent actions:**
1. Provide user with verification scenarios from `fix_plan.md`
2. Wait for test results
3. If bug not fixed → return to Diagnose (not to Fix) — per Post-Verify Fix Protocol type B
4. If regression → return to Fix Plan with new information — per Post-Verify Fix Protocol type A
5. For other feedback types → follow **Post-Verify Fix Protocol** (CLAUDE.md W6.5)

**❌ DO NOT close task without explicit user confirmation**

**Verification request template:**
```
Please verify:

1. [bug reproduction steps] → expected: [what should work]
2. [regression scenario 1] → expected: [what should work]
3. [regression scenario 2] → expected: [what should work]

Does everything work?
```

---

## Phase 6 — Prevention + Case

**Goal:** record what was done, propose measures to prevent this class of problems from recurring.

**Agent actions:**
1. Write `case.md` (final case)
2. Propose preventive measures (optional, if it makes sense)
3. GitFlow completion

**Artifact: `case.md`** (in the task root folder)
```markdown
# Case — Task #[number]: [bug name]

## Root cause
[One or two lines]

## What was done
[Files, lines, essence of change]

## How to reproduce (for testing)
[Steps from reproduce.md]

## Regression scenarios
[What was verified]

## Prevention
[What can be done to prevent this class of bugs from recurring — or "not applicable"]

## Final code
[Full code of changed fragments]

## Sources
[What helped find the cause]

## Execution time
[Total time from start to confirmation]
```

**GitFlow:**
```bash
git add projects/[project]/tasks/[number]/
git add [changed files]
git commit -m "fix: task [number] — [brief bug description]"
git checkout master
git merge issue_[number]
git branch -d issue_[number]
```

---

## AI / Human matrix

| Phase | AI | Human |
|-------|----|-------|
| Triage | Clarifying questions, severity assessment | Confirms criticality, decides on stabilization |
| Reproduce | Formulates steps, writes diagnostic scripts | **Confirms reproduction** in real environment |
| Diagnose | Code map, hypotheses, verification via scripts | **Confirms root cause**, provides additional data |
| Fix Plan | Minimal fix plan, risks, verification scenarios | **Confirms plan** before implementation |
| Implement | Writes code, self-review | Can request changes before testing |
| Verify | Formulates test scenarios | **Tests and confirms** the fix |
| Case | Writes case and prevention | Can add context |

---

## Anti-patterns (forbidden)

- ❌ Write a patch before confirming reproduction
- ❌ Write a patch before confirming diagnosis
- ❌ Refactor alongside the fix
- ❌ Close a task without user confirmation
- ❌ Move to the next phase without the current phase's artifact
- ❌ Record a LOW-confidence diagnosis without requesting additional data
- ❌ Start Implement with confidence < 🟡 MEDIUM

---

## Review Agents

Launched automatically. No Requirements/Design stages → those reviewers skipped.

| Stage | Reviewers | Parallel |
|-------|-----------|:--------:|
| Pre-Research (TDV) | Task Description Validator | 1 |
| Diagnose → | Research Completeness + Research Quality (on diagnosis.md) | 2 |
| Fix Plan → | Plan Traceability + Plan Structure | 2 |
| Implement → | Compliance + Security + Performance + Standards + Maintainability (if >1 file) + Robustness | 5-6 |

**Total: 10-11 reviewers.** Requirements and Design reviewers not launched.

---

## Quality gates

| Gate | Transition condition |
|------|---------------------|
| Triage → Reproduce | severity assessed, not S0 (or S0 handled) |
| Reproduce → Diagnose | user confirmed reproduction |
| Diagnose → Fix Plan | root cause established, confidence ≥ MEDIUM |
| Fix Plan → Implement | user confirmed plan |
| Implement → Verify | code checklist passed |
| Verify → Case | user confirmed the fix |

---

## Special case: bug in read-only code (stack core / vendor module)

When `diagnosis.md` points to code that the project cannot modify directly (stack core, vendor module, marketplace package).

General principle: prefer minimally invasive workarounds (events, hooks, class inheritance, file shadowing) over direct core modification. Direct core modification is a last resort and requires explicit user consent + a code comment with date and task number.

> Stack-specific strategies (which mechanism to use first, where to put overrides, what to monitor on stack updates) live in `{{stack}}/methodology_augments/diagnose_first.md`. The augment provides the full strategy table (events, file shadowing, init hooks, etc.) appropriate for the project's stack.

---

## Special case: data fix (cause is in data, not code)

When `diagnosis.md` indicates the cause is corrupted, incorrect, or missing data in the DB.

**Signs of a data fix:**
- Bug reproduces only on specific records / for specific users
- Code works correctly, but data is in an unexpected state
- After manual data correction, the bug disappears

**Mandatory order:**

1. **Diagnostic SELECT** — write a dry-run script (stack's preferred runner — see `{{stack}}/methodology_augments/diagnose_first.md`): count affected records + show 5 examples. Show result to user for confirmation.
2. **Backup** — MUST request explicit backup confirmation from user before any data modification.
3. **Fix script** (`data_fix_script.php` in chat_XX/ folder) — MUST include: verification BEFORE (count), fix logic, verification AFTER (count), pass/fail output.
4. **Data rollback** — if fix script is incorrect: restore from backup.

**Add to `fix_plan.md`:**
```markdown
## Data fix
- Affected table: [name]
- Record count before fix: [N]
- Backup: [confirmed by user / date]
- Script: `chat_XX/data_fix_script.php`
- Rollback: [restore from backup / restore script]
```

---

## Related documents

- `core/router/router_prompt.md` — classification and initialization
- `core/router/task_folder_structure.md` — artifact structure
- `core/methodologies/stabilize_first.md` — for S0 incidents
