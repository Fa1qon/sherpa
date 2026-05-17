# AI-Architect: Software Design Methodology

> Use when the router classifies a task as T7 — system-wide architectural design from scratch, where the primary deliverable is an architecture (modules, interfaces, dependencies, ADRs) rather than feature code.

## Foundational Principle

Architecture decisions are the most expensive to reverse. Every shortcut in requirements gathering or validation creates compounding cost in implementation. The purpose of this methodology is to make those decisions explicit, scored, and validated before any code exists.

---

## GATES — Phase Transition Rules

| Transition | Condition | Artifact |
|-----------|-----------|----------|
| → Phase 1 | Always (INIT complete) | — |
| Phase 1 → Phase 2 | User confirmed structured summary | interview_transcript.md (status: confirmed) |
| Phase 2 → Phase 3 | User confirmed requirements | requirements.md (status: confirmed) |
| Phase 3 → Phase 4 | User confirmed design + ADR | design.md + decisions/*.md |
| Phase 4 → Phase 5 | Validation PASS (0 FAIL in Cat A) | validation_report.md (verdict: PASS) |
| Phase 5 → Done | User confirmed plan | plan.md (status: confirmed) |

**Back-loops (max 2 cycles each):**
- Phase 2 → Phase 1: pre-flight found gaps in interview (max 2)
- Phase 3 → Phase 2: requirements conflict or are incomplete (max 2)
- Phase 4 → Phase 3: validation FAIL (max 2)
- Phase 5 → Phase 3: task infeasible in current architecture (max 2)
- After 2 failed cycles → show findings to user, ask for decision

**Hard rules:**
- NEVER proceed to next phase without the previous phase's recorded artifact
- NEVER proceed without explicit "yes" from user on gate phases (Phase 1.5, 2, 3, 5)
- Phase 4 (Validation) does NOT require user confirmation — automatic PASS/FAIL
- On every phase transition, update `meta.md`: `current_phase: N`

---

## INIT: Mode Detection

1. Determine working directory: `projects/{project}/tasks/{task_number}/architect/`
2. Check if `meta.md` exists in working directory:
   - **Exists** → CONTINUATION mode. Read `meta.md`, determine current phase and artifacts. Read last recorded artifact. Continue from interrupted phase.
   - **Does not exist** → NEW PROJECT mode. Go to step 3.
3. Create folder structure:
   ```
   projects/{project}/tasks/{task_number}/architect/
   ├── meta.md
   ├── interview_transcript.md
   └── decisions/
   ```
4. Initialize `meta.md`:
   ```yaml
   project: "{project}"
   task: "{task_number}"
   started: "{date}"
   current_phase: 1
   status: in_progress
   ```
5. Read `docs/patterns/index.md` — pattern catalog, keep in context.
6. Read template `templates/architect/interview_transcript.md.tmpl`.
7. Inform user:

> Starting AI-Architect. I will conduct a structured interview (5 phases), then generate requirements, architecture, and plan.
> Beginning with Phase 1 — tell me about the project.

Proceed to **PHASE 1**.

---

## PHASE 1: Interview

### Task Analysis check (inline)

Before Interview, assess architecture request per `workflow_stages.md` §W0 Task Analysis (T7 context — architecture design, Interview сам по себе = clarity-фаза, но SMART-проверка формализует entry):

**SMART questions (architecture-adapted):**
1. **Specific** — конкретный subject architecture (new project / module / migration)?
2. **Measurable** — что considered «архитектура закрыта» (ADR / plan / prototype / diagram-only)?
3. **Achievable** — архитектурный scope совместим с team capacity и timeframe?
4. **Relevant** — aligned с product direction / existing architecture constraints?

**AC checkpoint:** какой уровень архитектуры закрывает запрос — ADR / plan / prototype?

**Restate trigger:** Specific=FAIL (неясен subject — «спроектируй систему» без domain) OR Achievable=FAIL (архитектура требует resources вне team capacity) OR ≥2 signals FAIL → propose restate per `workflow_stages.md` §W0.6. Interview сам по себе длинный (~5 phases) — restate в начале экономит 30+ min wasted conversation.

**On PASS:** proceed with Interview (Phases 1.1-1.5 below).

**Completeness gate:** per `[BR-COMPLETENESS-GUARD]` in `behavioral_rules.md`.

<!-- AI: You are the interviewer. Goal: collect information for architectural decisions.
Rules:
- Max 4 questions per round (Cowan's 4-chunk limit)
- Show progress: "Phase X of 5"
- "don't know" → propose default with rationale
- After EACH phase, write to interview_transcript.md (file-based state)
- Short answers → follow-up question
- Contradiction → record it, resolve in Phase 4
-->

### Phase 1.1 — Context and Domain

**Progress:** Phase 1 of 5

Ask 3-4 questions (in one message):

1. **Project essence:** "Describe the project in 2-3 sentences. What problem does it solve?"
2. **Domain and audience:** "Who will use it? What type?" Options: `web_saas` / `game` / `api_backend` / `iot_embedded` / `desktop` / `mobile` / `data_pipeline`
3. **Stage:** "What stage is the project at?" Options: `new_idea` / `mvp` / `growth` / `mature` / `legacy_rescue`
4. **Existing code:** "Is there a codebase? If yes — stack and volume?"

<!-- AI: If domain not stated explicitly — infer from description: "Am I correct that this is {domain}?" -->

**After response:** Record in `interview_transcript.md` → "Phase 1". Extract: `domain`, `stage`, `description`, `has_existing_code`. → Phase 1.2

---

### Phase 1.2 — Team and Resources

**Progress:** Phase 2 of 5

Ask 3 questions:

1. **Team:** "How many developers? Level?" — `solo`(1) / `small`(2-5) / `medium`(5-15) / `large`(15+). Level: `junior` / `intermediate` / `senior` / `mixed`
2. **Timeline:** "When is the first result needed?" — `weeks` / `months` / `quarters` / `years`
3. **Constraints:** "Stack, budget, infrastructure, compliance (GDPR, PCI-DSS)?" If user answers "no constraints" — record `constraints: none` as an explicit decision.

<!-- AI: solo + junior → remember: check in Phase 4 that priorities are not too complex. -->

**After response:** Record in `interview_transcript.md` → "Phase 2". Extract: `team_size`, `skill_level`, `timeline`, `stack`, `budget`, `compliance`. → Phase 1.3

---

### Phase 1.3 — Quality Attributes (ATAM-inspired)

**Progress:** Phase 3 of 5

Show table and ask for H/M/L ranking:

> | Attribute | Meaning | Priority |
> |-----------|---------|----------|
> | **testability** | How easy to write and run tests? | H / M / L |
> | **modifiability** | How easy to change code without side effects? | H / M / L |
> | **scalability** | Can it handle load growth? | H / M / L |
> | **performance** | Response speed, latency | H / M / L |
> | **simplicity** | How easy for a new developer to understand? | H / M / L |
> | **deployability** | How often and easily can you deploy? | H / M / L |

<!-- AI: All H → "If everything is critical, recommendations will be diluted. Pick 2-3 most important."
"don't know" → defaults by domain:
- web_saas: modifiability=H, deployability=H, scalability=M
- game: performance=H, modifiability=H, simplicity=M
- api_backend: performance=H, scalability=H, testability=M
- iot_embedded: performance=H, simplicity=H, deployability=M
-->

For each H-attribute, ask a follow-up: "What scenario concerns you regarding {attribute}?"

**After response:** Record in `interview_transcript.md` → "Phase 3". Extract: `quality_priorities` (6×H/M/L) + scenarios for H. → Phase 1.4

---

### Phase 1.4 — Clarification (adaptive questions)

**Progress:** Phase 4 of 5

<!-- AI: Generate 2-3 questions DYNAMICALLY based on Phases 1-3: -->

1. **Contradictions** → resolve:
   - solo + microservices → "Ready for the complexity, or monolith + preparation for split?"
   - junior + performance=H → "Fast start or optimal performance?"

2. **Gaps** → fill (if not mentioned):
   - Data storage, authentication, integrations, monitoring

3. **Stress tests** → verify:
   - "What if the system goes down? What data must not be lost?"
   - "10x load — critical?"
   - "Project in 3 years — who maintains it?"

<!-- AI: Max 3 questions. Do not repeat what was already clarified. -->

**After response:** Record in `interview_transcript.md` → "Phase 4". Update data. → Phase 1.5

---

### Phase 1.5 — Confirmation

**Progress:** Phase 5 of 5

Show structured summary:

> ```yaml
> project:
>   domain: "{domain}"
>   stage: "{stage}"
>   description: "{description}"
> team:
>   size: {size}
>   skill_level: "{skill_level}"
>   timeline: "{timeline}"
> constraints:
>   stack: "{stack}"
>   budget: "{budget}"
>   compliance: "{compliance}"
> quality_priorities:
>   testability: {v}
>   modifiability: {v}
>   scalability: {v}
>   performance: {v}
>   simplicity: {v}
>   deployability: {v}
> ```

<!-- AI: Substitute real values. Do not leave placeholders. -->

- **"Yes"** → record YAML in `interview_transcript.md` (Structured Summary), `status: confirmed`. Update `meta.md`: `current_phase: 2`. → **PHASE 2**
- **Corrections** → apply edits, show again.
- **Cancel** → ask which phase to redo.

### Edge cases (PHASE 1)

| Situation | Action |
|-----------|--------|
| 1-2 word answer | "Can you elaborate? This is important for architecture." |
| "don't know" | Default + rationale: "For {domain} at {stage}, typically {X}, because {reason}." |
| All H | "Pick 2-3 attributes that determine success." |
| All L | "Usually simplicity or modifiability matter. Are you sure?" |
| Contradiction | "Noted: {X} vs {Y}. We will resolve in the clarification phase." |
| Compaction | Re-read `interview_transcript.md` + `meta.md`, continue. |
| Skip interview | "The interview is the foundation. I can shorten to express format (1 round, 6 questions)." |

---

## PHASE 2: Requirements Analysis

### Pre-flight check (MANDATORY)

Read `interview_transcript.md`. Find `## Structured Summary` (YAML). Verify:
- [ ] `project.domain`
- [ ] `project.stage`
- [ ] `team.size` and `team.skill_level`
- [ ] `constraints.stack`
- [ ] `quality_priorities` (6 attributes × H/M/L)
- [ ] at least one constraint

**If a field is missing** → DO NOT continue. Report what is missing, ask clarifying questions, update transcript. Repeat check.

---

### Step 1: Data extraction

Read `interview_transcript.md` fully. Extract: `domain`, `stage`, `description`, `team_size`, `skill_level`, `timeline`, `constraints`, `quality_priorities`, scenarios, metrics, and preferences from response text.

### Step 2: Scale determination

- **C1-C2 (simple):** solo/small, MVP/new_idea, ≤2 H-attributes → 3-5 FR, 2-3 NFR, shortened ATAM
- **C3-C4 (complex):** medium+, growth/mature, ≥3 H, compliance → 7+ FR, 5+ NFR, full ATAM

### Step 3: Generate requirements.md

Read `templates/architect/requirements.md.tmpl`. Fill in:

**FR:** EARS format ("When [trigger], the system MUST [action]"). ID: FR-1, FR-2... Priority: H/M/L.
**NFR:** Quality attribute scenarios (stimulus → response → metric). H-attributes → min 1 NFR, M → min 1 NFR. Metric MUST be measurable.
**Constraints:** technological / organizational / regulatory.
**ATAM Utility Tree:** H and M attributes only. Leaves: (business_priority, complexity). C1-C2: 1-2 scenarios/attribute, C3-C4: 2-3.
**Traceability:** leave empty (filled in Phase 3).

### Step 4: Gate

Show `requirements.md`. "Review and confirm ('yes') or provide feedback."
- "yes" → `status: confirmed` → **PHASE 3**
- feedback → edits → show again

---

## PHASE 2.5: Approach Selection (conditional)

<!-- AI: Before starting Phase 3 design.md — check if architectural approach is non-obvious.
Activate if at least one signal: multiple viable patterns with different trade-offs,
cross-system boundary, irreversible decision, requirements conflict with existing architecture.
If obvious — skip explicitly: "Approach is clear: [X]. Proceeding to Phase 3."
-->

**Condition:** architectural approach is non-obvious after requirements are confirmed.

Show 2-3 architectural patterns with scores/trade-offs + recommendation. User chooses.
Chosen approach → recorded as first section of design.md.

Full protocol: `workflow_stages.md W2.5`.

**Gate:** user confirms approach OR approach is skipped (obvious path stated explicitly).

---

## PHASE 3: Architectural Design

> You are the Architect. Inputs: requirements.md + KB. Outputs: design.md + ADR.

### Pre-flight check

Read `requirements.md`. Verify:
- [ ] Min 3 FR with IDs
- [ ] Quality priorities (6 × H/M/L)
- [ ] Min 1 constraint

Missing → **BACK-LOOP → Phase 2** with gap description.

---

### Step 3.1: Filter through decision trees

1. Read `docs/patterns/index.md`
2. Read `docs/patterns/decision_trees/by_context.yaml`
3. Match (domain, stage, team_size) → 2-4 candidates
4. Read `docs/patterns/decision_trees/by_quality.yaml`
5. Match H-priorities → additional candidates. When multiple rules match: prefer the most specific (more H-attributes in condition), but merge candidates from all matched rules.
6. Merge candidates from by_context and by_quality, deduplicate → **final list** (2-4 patterns)

If tree does not cover domain → reasoning by quality profile + note.

### Step 3.2: Scoring (CRITICAL)

**DO NOT implement scoring yourself.** Instead:
1. Read `docs/patterns/_meta/scoring_algorithm.md`
2. Follow EXACTLY AS WRITTEN
3. For each candidate: read `docs/patterns/architectural/{id}.md`, extract QA (G=3/O=2/B=1) and anti_drivers
4. Calculate score, apply anti_drivers penalty
5. Show top-2:

```
Top-1: {pattern} (score: {N})
   Strong: {QA=G where priority=H}
   Weak: {QA=B}

Top-2: {pattern} (score: {N})
   Delta = {difference}. {If ≤2: "Candidates are close. Showing trade-off."}
```

On equal scores → trade-off analysis, let user decide.

### Step 3.3: Design pattern selection

1. From Top-1: `related_patterns.combines_with` → for each id determine level by prefix (`arch-` = architectural, `dp-` = design) → read `docs/patterns/{architectural|design}/{id}.md`. Architectural ids from combines_with are marked as "complementary architecture" — do NOT include in design patterns list.
2. From `docs/patterns/decision_trees/by_problem.yaml` → match by FR
3. Check `decision_drivers` of each candidate
4. Select 3-5 patterns, for each: name, purpose, which module

### Step 3.4: Generate ADR

Read `templates/architect/adr.md.tmpl`. Generate ADR-001:
- Context: from interview summary
- Decision Drivers: H-priorities first
- Considered Options: Top-3 with scores
- Decision: Top-1 + reasoning
- Consequences: from pattern Tradeoffs

Save to `architect/decisions/ADR-001.md`. C3-C4: additional ADRs for significant decisions.

### Step 3.5: Generate design.md

Read `templates/architect/design.md.tmpl`. Fill in:

1. **Overview** (C4 Level 1): Mermaid, 2-3 sentence description
2. **Component Model** (C4 Level 2): modules, responsibilities (SRP), interfaces. Each module → min 1 FR.
3. **Dependencies**: Mermaid. No cycles, DIP respected. Cycle → extract interface.
4. **Interfaces**: max 7 methods/module (ISP). More → split module.
5. **Architectural decisions**: links to ADRs.
6. **Growth Path (MANDATORY)**:

| Trigger | Current | Evolution | Migration |
|---------|---------|-----------|-----------|

Use `related_patterns.evolves_to`.

7. **Quality attribute matrix**: H and M attributes → how implemented, which component.

**Adaptive scope:** C1-C2: sections 1,2,5,6 mandatory, rest brief. C3-C4: all in full.

### Conflict detection

If requirements contradict → **BACK-LOOP → Phase 2** with conflict description. DO NOT resolve yourself.

### Gate

Show: pattern + score, design patterns, modules, ADR, Growth Path.
"Do you confirm the design? (yes / no / adjustments)"
**STOP — wait for response.** "yes" → Phase 4. Adjustments → edits → gate again.

---

## PHASE 4: Validation

**Trigger:** design.md confirmed. **Goal:** Check against 66 rules (SOLID, ACID, GRASP, FailFast, CQS, Encapsulation, AI-Maintainability) → validation_report.md → PASS/FAIL.

### Step 4.1 — Load

1. Read `docs/patterns/principles/solid_rules.yaml` (66 rules, Cat A/B/C/D)
2. Read `docs/patterns/principles/context_weights.yaml`
3. From `interview_transcript.md`: determine `project_type` (startup/enterprise/safety_critical/library/microservices) based on `domain`, `stage`, `team_size`. Also extract `team_size`, `stage`, `complexity`
4. Read `design.md` (validation target)
5. Read `requirements.md` (for traceability)
6. Read `docs/patterns/principles/ai_patterns.md` (pattern reference for recommendations)

### Step 4.2 — Category A: Structural (deterministic)

Check all 19 Cat A rules from solid_rules.yaml (SOLID A1-A10, ACID/GRASP/FailFast/Encapsulation/CQS A11-A19). Each rule specifies FAIL or WARN threshold. Apply exactly as defined in the YAML.

### Step 4.2b — Category D: AI-Maintainability (arch-applicable only)

At architecture stage, check ONLY D-rules with `applicability: "arch"` or `"both"`: D7, D8, D9, D10, D13, D15.

**Blocking D-rules at arch stage:** D8 (implicit dependencies), D9 (cyclic dependencies) — always ERROR, NOT scaled by context weights.

D-rules with `applicability: "code"` (D1-D6, D11-D12, D14, D16-D24) → **N/A** at this stage. Checked during code review (W5/W6). Blocking at code review: D8, D9, D19, D20.

### Step 4.3 — Category B: Behavioral (reasoning)

Check all 18 Cat B rules from solid_rules.yaml (SOLID B1-B9, ACID/GRASP/FailFast/Idempotency/BoundedContext/PoLP/Encapsulation B10-B18). Each rule specifies WARN or ERROR threshold. Apply exactly as defined in the YAML.

### Step 4.4 — Category C: Contextual

1. Determine `project_type` → load block from `context_weights.yaml`
2. Apply contextual rules C1-C5 as defined in solid_rules.yaml
3. Formula: `effective = base_severity × context_weights[project_type][rule.weight_key]`. ≥0.8→ERROR, 0.4-0.79→WARN, <0.4→INFO
4. **EXCEPTION:** Blocking D-rules (D8, D9, D19, D20) are NOT scaled — always ERROR.

### Step 4.5 — Principle Conflicts

Read `interactions` section in solid_rules.yaml. Reinforcing pairs → merge, raise severity. Conflicting pairs → apply resolution, do not FAIL on both.

### Step 4.6 — Generate validation_report.md

Read `templates/architect/validation_report.md.tmpl`. Fill in: Cat A/B/C/D tables, summary, verdict. Show to user.

### Step 4.7 — Routing

- **PASS** (0 FAIL Cat A, 0 ERROR Cat D blocking): → Phase 5
  - Arch-stage blocking D-rules: D8, D9 (applicability: arch/both)
  - Code review (W5/W6) blocking D-rules: D8, D9, D19, D20
- **FAIL** (≥1 FAIL Cat A OR ≥1 ERROR Cat D blocking): → **BACK-LOOP → Phase 3** with specific recommendations. Max 2 cycles. After 2 failures → show findings, ask for decision.
- **WARN only** (0 FAIL, 0 blocking ERROR): → Phase 5 (warnings in report)

---

## PHASE 5: Planning

### Pre-flight check

Read `design.md`. Verify:
- [ ] Modules with responsibilities
- [ ] Dependencies between modules
- [ ] Module interfaces
- [ ] Min 1 ADR

Missing → **BACK-LOOP → Phase 3**.

### Inputs

1. `requirements.md` — FR/NFR with priorities
2. `design.md` — modules, dependencies, interfaces
3. `interview_transcript.md` — timeline, team constraints

### Step 1: Decomposition

- Each module → min 1 task
- Each FR → min 1 task
- Granularity: 1 task = 1 Claude Code working session
- Each task: description, inputs, outputs, acceptance criteria, module, effort (S<4h / M=4-16h / L>16h)
- L-tasks → split into subtasks

### Step 2: Dependency graph

- Task dependencies from module dependencies
- Critical path, parallel branches
- Mermaid diagram

### Step 3: Traceability

- Each FR → min 1 task
- Each NFR → min 1 task or ADR
- FR not covered → add task
- Task without FR → mark "YAGNI check"

### Step 4: Feasibility check

- Task infeasible → **BACK-LOOP → Phase 3**
- Effort > timeline × 1.5 → propose: a) scope reduction, b) phased delivery. Show, wait for decision.

### Step 5: Generate plan.md

Read `templates/architect/plan.md.tmpl`. Fill in:
- Tasks: table (#, name, description, effort, FR, acceptance)
- Traceability: from Step 3
- Dependency graph: Mermaid from Step 2
- Estimate: S/M/L summary + hours
- Order: Foundation → Core → Integration → Quality

### Gate

Show plan.md. Wait for "yes" / feedback. → edits → gate again.

---

## Appendix: W6 Conformance Check

> Used in W6 (Verify) of the main RDPI workflow to check code-to-architecture conformance.

During verification (W6), check:

1. **Structural conformance:** Components in code match modules from design.md §2.
2. **Dependencies:** Actual import/use matches dependency diagram in design.md §3. No cycles, no upward dependencies.
3. **Interfaces:** Public methods match design.md §4 (names, signatures, count ≤7).
4. **ADR:** Decisions from ADRs are implemented (pattern applied, not just described).
5. **SOLID rules:** Re-check Category A from solid_rules.yaml against final code. Any FAIL = blocking.

Output: `W6 Conformance: PASS / FAIL` with checklist (Modules, Dependencies, Interfaces, ADR, SOLID Cat A). If FAIL → list discrepancies + recommendation (fix code or update design.md).

---

### Completion

Report: AI-Architect complete. List all artifacts (interview_transcript.md, requirements.md, design.md + ADR, validation_report.md, plan.md). Hand control to main RDPI workflow (W5).
