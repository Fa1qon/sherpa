# Cases Synthesis — Reverse Engineering (targeted, autonomous)

> Use when **requirements and architecture are drafted** and the user needs a starter case library covering specific architectural blocks. The methodology mines public source repositories, official documentation, and Q&A consensus, cross-validates findings, runs an adversarial pass against an independent source pool, and produces stack-portable cases ready to feed W2 Research in subsequent delivery tasks.

---

## Foundational Principle

A delivery methodology stops at W2 Research and asks «which existing cases apply?» — and finds none, because the project is new on this stack. Microtask synthesis builds knowledge through hands-on empirical work, but it scales poorly: dozens of microtasks for full architectural coverage, each requiring user review.

Reverse engineering is the autonomous alternative. Given a fixed target (the user's requirements + architecture), the methodology:

1. **Decomposes** the target into atomic search goals.
2. **Mines** external sources (other projects, docs, Q&A) for patterns answering those goals.
3. **Cross-validates** findings across independent channels.
4. **Adversarially reviews** with an independent source pool to filter cargo-cult and dead patterns.
5. **Filters** for applicability against the user's own architecture.
6. **Formalizes** survivors as stack-portable cases.

The user is involved at the start (scope confirmation, source approval) and at the end (final report with quarantine review). The synthesis itself is autonomous — by design, because the user is non-expert in the stack and cannot validate intermediate results meaningfully.

The methodology declares its limits honestly: cases unfalsifiable through observation are capped at medium confidence; gaps in source coverage are reported, not hidden; cases below the abandon threshold are not written at all. The output is **a partial library with explicit holes** rather than a complete library with hidden weaknesses.

---

## When to apply

**Apply `cases_synthesis_reverse_engineering` if:**

- Project has drafted requirements (W1 artifact) and architecture (W3 design or equivalent).
- User wants a case library covering one or more architectural blocks before / alongside delivery.
- The stack has identifiable external sources (public repositories, docs, Q&A community).
- User accepts that synthesis is autonomous after scope confirmation — no per-iteration check-ins.

**Apply `cases_synthesis_microtasks` instead if:**

- Requirements / architecture not drafted yet.
- User is non-expert and wants to learn the stack through hands-on work first.

**Apply `deep_research` instead if:**

- The question is comparative / analytical (vendor selection, architectural alternatives) rather than pattern-extractive.

**Apply nothing — abandon synthesis — if:**

- Stack has no identifiable external sources (extremely niche, proprietary, no public artifacts).
- Architecture is so unusual that external patterns wouldn't transfer.

---

## Methodology defaults

```yaml
defaults:
  autonomy_mode: interactive            # methodology runs interactively per BR-AUTONOMY (interactive | autonomous boolean); Phase 3-8 form a pre-approved autonomous execution block within the interactive flow
  token_economy.enabled: false          # full reviewer scope for synthesis quality
  gate_strictness: standard             # transitions are gated; failure → fix-cycle or stop
  critical_zone_check: disabled         # synthesis writes new cases only; does not modify existing verified cases or touch project source code
  case_portability: stack_portable      # all produced cases are stack-portable
  iteration_unit: architectural_block   # one iteration per block
```

**On the autonomous block:** BR-AUTONOMY is a strict `interactive | autonomous` predicate (per `behavioral_rules.md`). This methodology declares `autonomy_mode: interactive` and structures Phases 3-8 as a **pre-approved autonomous execution block** — the user authorizes the block at the Phase 2 gate, the methodology does not return to user until Phase 9, and BR-AUTONOMY's autonomous-mode protocol does NOT activate (the activation guard `meta.Stage flags.autonomy_mode == autonomous` reads `interactive` and stays dormant). Mechanically, the autonomous block is a long subagent-orchestrated sequence inside an interactive methodology, not a real autonomy mode flip.

Per-task override: the user can request manual approvals at additional phase boundaries inside the autonomous block, but this slows the methodology to crawl and removes its main value-add over microtasks. Default flow (one approval at Phase 2, one report at Phase 9) is recommended unless the user has explicit reason to micromanage.

---

## Stages and artifacts

```
Router → task card
  ↓
[Phase 1] Scoping                              — INTERACTIVE
  → search_goals.md (atomic goals; user-confirmed)
  ↓
[Phase 2] Source discovery                     — INTERACTIVE
  → source_list.md (sources with quality profile; user-approved)
  ↓
─────────── AUTONOMOUS BLOCK ───────────
[Phase 3] Source ingestion                     — AUTONOMOUS
  → source_index.json (skeletons, types, indices)
[Phase 4] Pattern mining                       — AUTONOMOUS
  → raw_patterns.md (regularities, no rationale yet)
[Phase 5] Hypothesis generation                — AUTONOMOUS
  → hypotheses.md (case drafts with rationale)
[Phase 6] Cross-validation                     — AUTONOMOUS
  → validated_hypotheses.md (with confidence scores)
[Phase 7] Adversarial review                   — AUTONOMOUS (independent subagent + sources)
  → adversarial_findings.md (counterarguments, refutations)
[Phase 8] Applicability filter & formalization — AUTONOMOUS
  → cases written to projects/<project>/cases/ + _quarantine/
─────────── END AUTONOMOUS ───────────
  ↓
[Phase 9] Final report                         — INTERACTIVE
  → synthesis_report.md (cases produced; gaps; quarantine review)
```

**Note on iteration:** one methodology run = one iteration = one architectural block (e.g. «state management», «IPC layer», «scene system»). Multiple iterations cover broader architectures. Each iteration is independent — the methodology re-runs from Phase 1 with a different block.

---

## Phase 1 — Scoping (INTERACTIVE)

**Goal:** turn project requirements + architecture into a list of atomic search goals for one architectural block.

### Agent actions

1. **Receive** project requirements + architecture references + target block from user (or infer block from current task focus).

2. **Validate inputs:**
   - Requirements present (`requirements.md` or equivalent).
   - Architecture present (`design/` or equivalent).
   - Target block identified.
   - If any missing → ask user; if user can't provide → recommend `cases_synthesis_microtasks` instead and exit.

3. **Decompose target block into atomic search goals.** Atomicity criterion (computable):

   > A goal is atomic if a single combined search term yields answers of one type. If the answers are heterogeneous — split.

   For large blocks, use subagents in parallel: each handles one branch of decomposition, returns its atomic goals; root sums.

4. **Estimate coverage.** Use stack-canonical structure as reference (inferred from stack documentation by the AI; per-stack file at `.sherpa/stack/<stack>/canonical_structure.md` is the future home — TODO, not present until 2+ stacks need it). Goals beyond reasonable coverage are flagged; goals not covered by any external source candidate are flagged early.

5. **Write `search_goals.md`** per template below.

6. **Present to user for confirmation.** User can amend, reorder, exclude.

### Artifact: `search_goals.md`

```markdown
# Search goals — <project>: <block> (iteration N)

## Block under synthesis
<block name + 1-3 lines of what it covers in this project>

## Source inputs
- Requirements: <link to requirements.md>
- Architecture: <link to design/ or equivalent>
- Stack: <stack identifier>

## Search goals (atomic)
1. **<goal title>** — <one-sentence empirical question>
   - Expected case types: <documented_best_practice / community_idiom / defensive_pattern / ...>
   - Coverage area: <subarea of the block>
2. ...

## Coverage check
- Stack-canonical structure used as reference: <link or inline>
- Covered subareas: <list>
- Known coverage gaps (no goal): <list>

## Confidence
🟢 HIGH / 🟡 MEDIUM / 🔴 LOW
(LOW = block is ill-defined or stack lacks structure to decompose; consider re-cut.)
```

### Gate (Phase 1 → Phase 2)

- [ ] `search_goals.md` written; goals are atomic per criterion.
- [ ] Each goal has expected case type.
- [ ] Coverage check is explicit; gaps acknowledged.
- [ ] Confidence ≥ MEDIUM.
- [ ] User confirmed goals.

---

## Phase 2 — Source discovery (INTERACTIVE)

**Goal:** find candidate sources covering the search goals; user approves the list before autonomous block begins.

### Agent actions

1. **For each goal, find sources across three channels:**
   - **Public repositories** (GitHub, GitFlic, GitVerse, source mirrors). Filter by quality profile (see below).
   - **Q&A platforms** (StackOverflow, GitHub Discussions, dev.to, vendor forums for niche stacks). Filter by score, date, accepted-answer status.
   - **Documentation** (official + Context7 + vendor sites + verified third-party tutorials).

2. **Quality profile** (replaces naive «star count» filter):
   - Tests present in repository.
   - Last commit fresher than T months (configurable per stack; default 12).
   - Linter / formatter configuration (signal of discipline).
   - README answering «what + how to run».
   - For Q&A: score ≥ N (default 5); answer date fresher than T months; preferably accepted.
   - For docs: official or community-recognized authoritative source.
   - **Independence (when counting source coverage per goal):** treat repos sharing a fork lineage as one source; treat vendored copies of the same library as one source; treat tutorial-derivative projects (those that explicitly say «based on X tutorial») as one source counted with their root tutorial. Aim is to count distinct decisions, not distinct URLs.

3. **Stack-aware fallback:** if the standard channels yield insufficient sources for the stack (e.g., Bitrix has limited public GitHub presence), fall back to stack-specific source taxonomy (vendor forums, Telegram-channel digests, blog aggregators). The taxonomy lives at `.sherpa/stack/<stack>/source_taxonomy.md` (TODO — currently inline in this methodology; per-stack file is deferred until 2+ stacks have synthesis runs).

4. **Coverage check per goal:**
   - ≥ 3 independent sources (any channel) per goal → goal is well-covered.
   - 1-2 sources → goal flagged `low_coverage`; cases will carry `single_source_amber: true` if accepted later.
   - 0 sources → goal goes to «not synthesizable» list; reported in Phase 9 as a gap.

5. **Geographic / access fallbacks:** if GitHub is blocked or slow, methodology uses configured mirrors (`.sherpa/settings.yml::source_providers` — TODO; until configured, AI uses Context7 for docs and asks user for mirror URLs if standard fails).

6. **Write `source_list.md`** per template below.

7. **Present to user for approval.** User can:
   - Approve list as-is.
   - Exclude specific sources (with reason — recorded for trace).
   - Add sources the AI missed.
   - Adjust quality thresholds for low-source stacks.

### Artifact: `source_list.md`

```markdown
# Source list — <project>: <block> (iteration N)

## Per-goal coverage
| Goal | Channel | Sources | Coverage |
|------|---------|---------|----------|
| 1 | repos | <repo_url> (stars: X, last commit: Y), ... | well-covered / low_coverage / not_synthesizable |
| 1 | qa | <q&a_url> (score: X, date: Y), ... | ... |
| 1 | docs | <docs_url> (version: X), ... | ... |
| 2 | ... | ... | ... |

## Quality profile applied
- Repo filters: <values>
- Q&A filters: <values>
- Doc filters: <values>

## Excluded (with reason)
- <source> — <reason from user or auto-filter>

## Gaps (no sources found)
- Goal N: <goal title> — <reason: niche / blocked / outdated stack / ...>
```

### Gate (Phase 2 → autonomous block)

- [ ] `source_list.md` written; coverage classified per goal.
- [ ] Goals with `not_synthesizable` status are explicit (will become gaps in final report).
- [ ] User approved the source list (this is the **point of no return** before autonomous block — methodology will not return to user until Phase 9).

---

## Phase 3 — Source ingestion (AUTONOMOUS)

**Goal:** download / index sources without reading business logic; build a working index for Phase 4.

### Agent actions

1. **Repositories:** clone or shallow-fetch; run skeleton extraction (file topology, naming archaeology, boundary mapping) using static parsers (tree-sitter, ast-grep, language-specific tools). **No LLM reading at this stage** — pure structural analysis.

2. **Documentation:** classify each page as `reference` / `tutorial` / `guide` / `cookbook` / `changelog`. Only `tutorial` / `guide` / `cookbook` will feed Phase 4 pattern mining; `reference` feeds Phase 6 cross-validation.

3. **Q&A:** index by goal-relevant tags / keywords; rank by score and date.

4. **Map-reduce setup:** each source gets its own short LLM session in Phase 4; ingestion produces metadata for those sessions, not full reads.

5. **Write `source_index.json`** — machine-readable index of sources with their classification, paths to skeletons, and per-goal relevance scores.

### Self-check

- Every source from `source_list.md` is indexed (or marked failed-to-fetch with reason).
- Skeletons exist for repositories.
- Documentation classification is complete.

### Gate (Phase 3 → Phase 4)

- [ ] `source_index.json` written; all sources accounted for.
- [ ] Failures (fetch errors, parse errors) are logged, not hidden.
- [ ] Map-reduce inputs prepared.

---

## Phase 4 — Pattern mining (AUTONOMOUS)

**Goal:** find regularities across sources without yet formulating «why».

### Agent actions

1. **Per-source LLM session** (map step):
   - Input: source skeleton + relevant fragments (targeted reads, not full files) + goal description.
   - Output: structured summary in fixed schema (regularities observed, naming patterns, structural choices, explicit recommendations from doc/Q&A authors).
   - **Quotation requirement:** every claim in the summary must include a verbatim quote or path-line citation. Without citation, the claim is invalid (self-check rejects).

2. **Reduce step** (root session):
   - Aggregate per-source summaries.
   - Identify cross-source regularities: «pattern X appears in K of N sources»; «doc says Y»; «Q&A consensus is Z».
   - Note contrasts: where sources diverge, what's the divergence axis.

3. **Output `raw_patterns.md`:** list of observations, not yet hypotheses. Each entry has source citations.

### Self-check

- Each search goal has ≥ 1 raw pattern OR is explicitly logged as «no pattern found in available sources» (signal of Phase 9 gap).
- Every pattern carries citations.
- Map-reduce did not exceed token budget (configurable per stack).

### Gate (Phase 4 → Phase 5)

- [ ] `raw_patterns.md` written.
- [ ] Goals without patterns are tracked as gaps.

---

## Phase 5 — Hypothesis generation (AUTONOMOUS)

**Goal:** for each raw pattern, formulate a hypothesis-case explaining the «why» (forces, alternatives).

### Agent actions

1. **Per pattern:** draft a case in full schema (`cases_schema.md` + `cases_synthesis_schema.md` extension). Include:
   - All mandatory fields including `synthesis_source: reverse_engineering`, `portability: stack_portable`, `falsification_method`, `constraint_or_alternatives`.
   - RAG formulations (canonical / extended / triggers).
   - Forces explanation in `## Решение`.
   - Alternative-or-constraint statement.

2. **Mark patterns without alternatives** for usual scrutiny (not rejection): a pattern has alternative options and chose one, OR there's a documented external constraint making the choice forced. Patterns with neither reason are suspect.

3. **Write `hypotheses.md`:** all draft cases marked `not_validated`.

### Gate (Phase 5 → Phase 6)

- [ ] Each raw pattern transformed into a hypothesis-case (or explicitly dropped with reason).
- [ ] Cases without `constraint_or_alternatives` are flagged.

---

## Phase 6 — Cross-validation (AUTONOMOUS)

**Goal:** assign initial confidence per hypothesis based on cross-channel evidence.

### Agent actions

1. **For each hypothesis, evaluate per the case's `validation_type`:**

   | Validation type | Required evidence |
   |-----------------|-------------------|
   | `documented_best_practice` | official docs cite the pattern as recommended |
   | `community_idiom` | ≥ 3 independent project occurrences AND Q&A consensus |
   | `defensive_pattern` | Q&A or issue-tracker discussion AND ≥ 2 project usages |
   | `workaround` | bug-report or known-issue link |
   | `performance_driven` | benchmark or performance discussion |

2. **Compute initial confidence per `cases_synthesis_schema.md` §7 formula:**

   ```
   confidence = w_d * docs_support
              + w_p * project_count_support
              + w_q * qa_consensus
              - w_c * cargo_cult_signal
              - w_m * dead_pattern_signal
   ```

   (Adversarial bonus added in Phase 7.)

3. **Detect signals:**
   - **Cargo cult:** all sources trace back to a single tutorial / blog / example → high cargo_cult_signal.
   - **Dead pattern:** dominant supporting sources older than T years (default 3) AND newer sources (last 12 months) advise against → high dead_pattern_signal.

4. **Single-source amber:** if only one source supports the hypothesis but the source has high quality profile, flag `single_source_amber: true` (do not reject).

5. **Output `validated_hypotheses.md`:** hypotheses with confidence scores and signal annotations.

### Gate (Phase 6 → Phase 7)

- [ ] Each hypothesis has a confidence score.
- [ ] Cargo-cult and dead-pattern signals are detected and recorded.

---

## Phase 7 — Adversarial review (AUTONOMOUS, independent subagent + sources)

**Goal:** find counter-evidence with sources that did NOT feed Phase 2-6.

### Subagent setup

- **Independent subagent**, separate session, no memory of prior phases.
- **Independent source pool:** the subagent must search outside `source_list.md` — different repositories, different Q&A threads, academic / industry blogs, deprecation notices, issue trackers from the stack itself.
- **Adversarial system prompt:** «Your task is to refute, not to agree. Find ≥ 3 independent sources that contradict or propose alternatives. If you cannot find counter-evidence after independent search, say so explicitly — do not invent.»

### Subagent actions per hypothesis

1. Search for refuting sources (independent pool).
2. Test cargo-cult thoroughness: does the original source pool over-rely on a single root?
3. Test dead-pattern: is there evidence the pattern is being deprecated or superseded?
4. Test contextual fit: does the pattern apply only in contexts unlike the user's project?
5. **Out-of-stack comparison:** how does an adjacent stack solve the same problem? Sometimes a parallel solution is structurally superior and the hypothesis is local to a particular community blind spot.

### Subagent output per hypothesis

- **Survived:** no counter-evidence after independent search → `adversarial_survival_bonus = +0.05` (intentionally small per `cases_synthesis_schema.md` §7 — independence is structurally limited, the bonus encodes a weak positive signal not validation).
- **Refuted (counterargument with high confidence):** counter-evidence is strong and independent → confidence reduced by counterargument weight (see formula below).
- **Reframed:** the hypothesis is correct in a narrower context → forces description amended; confidence preserved; `## Synthesis trace` records how the scope was narrowed.
- **Incomplete:** subagent failed (crashed, returned empty, could not search independently within budget). Logged in `adversarial_findings.md` with reason; final confidence is computed **without** `adversarial_survival_bonus`; `## Synthesis trace` records «adversarial pass incomplete» with reason; in Phase 9 report this case is flagged for operator attention regardless of final confidence (extra column in report table).

**On adversarial limitations.** Two LLM agents searching the public web share training priors and query the same indexes; "independent" sources are sampled from overlapping surfaces. The adversarial pass is therefore a **weak filter**, not a strong validation. The intended replacement is targeted-dissent retrieval — mining specific dissent surfaces (issue-tracker labels like `bug` / `won't-fix`, deprecation notices in changelogs, framework migration guides, "X considered harmful" articles) — where dissent has structural existence, not subagent role-play. See TODO in `cases_synthesis_schema.md` §11.

### Counterargument confidence and weight

Each counterargument carries two values, both assigned by the adversarial subagent with rationale:

- **`counterargument_confidence`** ∈ [0.0, 1.0] — how confident the subagent is that the counter-evidence is real and applicable. Default scoring guidance:
  - 0.8–1.0: explicit refutation (deprecation notice, official advisory, accepted Q&A saying «do not use this»).
  - 0.4–0.7: alternative pattern preferred in newer sources, but the original isn't outright wrong.
  - 0.1–0.3: stylistic critique, individual opinion without consensus.
- **`counterargument_weight`** ∈ [0.0, 0.5] — how much this counterargument should subtract from the hypothesis confidence. Default scoring:
  - 0.4–0.5: refutation directly contradicts the case's claim.
  - 0.2–0.3: refutation narrows the case's applicability without invalidating it.
  - 0.0–0.1: refutation is contextual, doesn't apply broadly.

Final confidence after Phase 7 (single application; the formula in `cases_synthesis_schema.md` §7 is the authoritative single accounting — Phase 7 computes it, no double application):

```
confidence_final = confidence_phase_6_excluding_adversarial
                 + (w_a * adversarial_survival_bonus)
                 - sum(counterargument_confidence_i * counterargument_weight_i)
```

clamped to [0.0, 1.0].

Weak counterarguments («maybe outdated, not sure» — confidence 0.2, weight 0.1 → subtract 0.02) don't kill strong hypotheses. Strong refutations (confidence 0.9, weight 0.5 → subtract 0.45) push hypotheses to quarantine or below abandon threshold.

### Output `adversarial_findings.md`

For each hypothesis: survival / refutation / reframe verdict, supporting sources from the independent pool, final confidence after this phase.

### Gate (Phase 7 → Phase 8)

- [ ] Every hypothesis ran through adversarial pass.
- [ ] Adversarial subagent searched independent sources for each (no overlap with `source_list.md`).
- [ ] Final confidence computed.

---

## Phase 8 — Applicability filter & formalization (AUTONOMOUS)

**Goal:** filter hypotheses against the user's project context; formalize survivors as cases.

### Agent actions

1. **Per hypothesis, compute applicability:**
   - **Directly applicable:** hypothesis matches a goal from `search_goals.md`; project context matches the case's stated context.
   - **Conditionally applicable:** matches a goal but with caveats (different scale, different sub-stack); record caveat in `## Lessons`.
   - **Not applicable:** hypothesis context conflicts with project (e.g., hypothesis is for SaaS multi-tenant, project is single-tenant desktop). Drop or quarantine.

2. **Confidence threshold filter** (per `cases_synthesis_schema.md` §8 — split thresholds):
   - **Falsifiable** case: `final_confidence ≥ 0.6` AND directly applicable → write to `projects/<project>/cases/<case_id>.md`, `status: verified`.
   - **Unfalsifiable** case (structural / `falsification_method: cannot be falsified through code execution`): `final_confidence ≥ 0.5` AND directly applicable → write to `projects/<project>/cases/<case_id>.md`, `status: verified` (cap at 0.6 still applies).
   - `0.3 ≤ final_confidence < production_threshold` OR conditionally applicable → write to `projects/<project>/cases/_quarantine/<case_id>.md`, `status: draft`.
   - `final_confidence < 0.3` → not written; logged in synthesis report only.

3. **Atomicity / portability check:**
   - Each formalized case must satisfy `stack_portable` writing protocol (`cases_synthesis_schema.md` §3): no project paths, ≤ 80 LoC inline, structure-and-method description.
   - Fail → fix-cycle pattern (≤ 3 cycles); on 4th cycle, drop the case to quarantine with note. Pattern is analogous to BR-2 but operates outside W5/W6.5 scope.

4. **Graph wiring (forward links only):**
   - Detect `depends_on`, `contradicts`, `complements`, `supersedes` relationships from **newly formalized cases TO** existing library cases.
   - Populate these forward fields in the **new** cases' frontmatter.
   - **Do NOT modify existing verified cases.** Back-references (e.g., adding symmetric `complements` or `composed_into` to an existing verified case) require a separate operation outside this methodology — frontmatter edits to verified cases are out of scope here. Modifying existing verified cases would qualify as a destructive operation on corpus integrity (per critical-zone convention) and is forbidden in autonomous synthesis. If back-references are needed, queue them as a follow-up `rule_engineering` task in the Phase 9 report's «Recommended next iteration» section.

5. **`## Synthesis trace` section:**
   - Add to each formalized case: brief audit trail (which goals fed it, which sources, adversarial verdict). ≤ 30 lines.

6. **Confidence-cap honesty rule:**
   - Cases with `falsification_method` = «cannot be falsified through code execution» → confidence capped at **0.6** until empirical use in a real task. Even if all signals are strong, structural-only claims don't earn high confidence without observation.

### Gate (Phase 8 → Phase 9)

- [ ] All survivors written (production or quarantine) or dropped with logged reason.
- [ ] Each written case passes atomicity / portability checks.
- [ ] Graph relations populated.
- [ ] `## Synthesis trace` populated.

---

## Phase 9 — Final report (INTERACTIVE)

**Goal:** present the produced library, gaps, quarantine review.

### Agent actions

1. Compile `synthesis_report.md` per template below.
2. Show to user for review.
3. User decides on quarantine cases (per case): promote / discard / leave-in-quarantine.
4. User decides on next iteration: another block (loop to Phase 1) or stop.

### Artifact: `synthesis_report.md`

```markdown
# Synthesis report — <project>: <block> (iteration N, reverse engineering)

## Iteration summary
- Block: <block name>
- Search goals: M (atomic)
- Sources used: K repositories, Q Q&A threads, D doc pages
- Cases produced: V verified, R quarantined, D dropped
- Stack: <stack>

## Cases produced (verified)
| Case ID | Title | Grade | Validation type | Falsifiable? | Triggers (top 3) |
|---------|-------|-------|-----------------|--------------|-------------------|
| ... | ... | verified | community_idiom | yes / structural | ... |

> Per schema §8, grades (`verified` / `quarantine`) are the user-facing presentation; numerical confidence values are recorded in case files for diagnostic use but are NOT treated as comparable until weights are calibrated.

## Cases in quarantine (need user decision)
| Case ID | Title | Grade | Reason | Actionable check | Adversarial status | Recommendation |
|---------|-------|-------|--------|------------------|--------------------|----------------|
| ... | ... | quarantine | <single source: phaser-discord-thread / mixed Q&A: 3 say X, 2 say Y / cargo-cult signal: all sources from one tutorial> | <concrete observation user can make: e.g., "open 3 random Phaser starter projects on GitHub; if 2+ use this lifecycle pattern, promote — otherwise leave"> | survived / refuted / reframed / **incomplete** (flagged) | promote / discard / leave |

## Cases dropped (below abandon threshold or refuted)
| Hypothesis | Why dropped |
|------------|-------------|
| ... | <adversarial refutation / cargo-cult signal / context mismatch / ...> |

## Gaps (search goals with no producible case)
- Goal N: <title> — <reason: no sources / contradictory sources / out-of-context / ...>

## Recommended next iteration
- Block X (next architectural block) — <reason>
- Or: stop synthesis for this project; coverage of architecture is sufficient.

## Confidence calibration note
- This is iteration N out of estimated N_total for full architecture coverage.
- Confidence weights are <calibrated / provisional> (provisional for iterations 1-5).
```

### Gate (Phase 9 → Closure)

- [ ] `synthesis_report.md` written.
- [ ] User has reviewed quarantine and made per-case decisions (or explicitly deferred).
- [ ] Next-iteration decision made (continue / stop / re-cut).

---

## Reviewer scope

| Stage | Reviewer | When |
|-------|----------|------|
| Phase 1 | `gate_compliance` + `requirements_reviewer` (if requirements newly drafted) | always |
| Phase 2 | `gate_compliance` | always — validates source_list completeness |
| Phase 4-5 | `research_completeness_reviewer` | always — validates pattern mining covers goals |
| Phase 6 | `research_quality_reviewer` | always — validates cross-validation rigor |
| Phase 7 | `gate_compliance` (adversarial pass executed) | always |
| Phase 8 | `gate_compliance` (atomicity / portability) | always |
| Phase 9 | `gate_compliance` | always — validates report completeness |

`case_quality_reviewer` is the future home for atomicity / portability / synthesis-trace checks; until implemented, `gate_compliance` handles structural validation.

`security` reviewer is **not** in default scope — synthesis itself touches no production code. If a synthesized case is about security patterns, the user applying it in a delivery task will run security review at that point.

---

## AI / Human matrix

| Phase | AI | Human |
|-------|----|-------|
| Phase 1 | decomposes block; writes `search_goals.md` | confirms goals (or amends) |
| Phase 2 | discovers sources; classifies coverage; writes `source_list.md` | approves / excludes / adds sources (point of no return) |
| Phase 3-8 | autonomous block — ingests, mines, hypothesizes, validates, adversarially reviews, formalizes | not involved (autonomous) |
| Phase 9 | writes `synthesis_report.md`; surfaces gaps and quarantine | reviews quarantine; decides next iteration |

---

## Anti-patterns (forbidden)

- ❌ Skipping Phase 2 user approval. The source list is the contract for autonomous block; without approval, autonomous synthesis runs on possibly-wrong sources.
- ❌ Adversarial subagent using the same source pool as Phase 2-6. Defeats the purpose; correlated outputs from correlated inputs.
- ❌ Inflating `synthesis_confidence` past 0.6 for cases with `falsification_method = "cannot be falsified through code execution"`. Honesty cap is structural.
- ❌ Writing cases with project paths or > 80 LoC inline blocks. Atomicity / portability is mandatory; if the pattern can't fit, abandon the case (don't lower the bar).
- ❌ Hiding gaps in the final report. Goals without producible cases are explicit; the user's library is honestly partial, not falsely complete.
- ❌ Running this methodology when requirements / architecture aren't drafted. Use `cases_synthesis_microtasks` instead — exploratory mode handles the no-requirements case.
- ❌ Using a delivery methodology (`module_track` / `standard_rdpi`) when the goal is knowledge, not running code. Synthesis is the right shape; delivery would over-engineer for a non-deliverable.
- ❌ Treating confidence weights as absolute before calibration (iterations 1-5). Until calibrated, confidence is **relative-only** within an iteration.

---

## Quality gates

| Gate | Transition condition |
|------|---------------------|
| Phase 1 → Phase 2 | search goals atomic, user-confirmed |
| Phase 2 → autonomous block | source list approved by user, gaps acknowledged (point of no return) |
| Phase 3 → Phase 4 | source index complete; failures logged |
| Phase 4 → Phase 5 | raw patterns extracted with citations; gaps tracked |
| Phase 5 → Phase 6 | hypotheses formulated with all mandatory fields |
| Phase 6 → Phase 7 | confidence scored per hypothesis; signals detected |
| Phase 7 → Phase 8 | adversarial pass executed with independent sources; final confidence computed |
| Phase 8 → Phase 9 | survivors written (production / quarantine), atomicity verified, graph wired |
| Phase 9 → Closure | report written, quarantine reviewed, next-iteration decision made |

---

## Mismatch signs (when this methodology is wrong)

- Source coverage repeatedly insufficient (multiple iterations, < 3 sources per goal) → stack is too niche; switch to `cases_synthesis_microtasks` for hands-on knowledge or accept that synthesis isn't possible for this stack.
- Adversarial pass refutes most hypotheses → either source pool is poisoned (revisit Phase 2) or the architecture is genuinely unconventional (switch to `prototype` for hands-on validation).
- User keeps overriding to interactive mode at every phase → user wants per-step control; switch to `cases_synthesis_microtasks` (interactive by design) and stop pretending this methodology fits.
- Synthesized cases keep failing portability checks → the architecture is project-specific in ways that don't transfer; synthesis is producing low-value output, abandon.

---

## Promotion / related documents

- Cases produced here feed W2 Research in subsequent delivery tasks (`module_track` / `standard_rdpi` / `prototype`) via standard case search.
- Iterations cover architectural blocks one at a time; full architecture coverage typically requires N iterations where N = number of blocks.
- `core/methodologies/cases_synthesis_microtasks.md` — sister methodology, exploratory (vs. targeted) flow; appropriate when requirements aren't drafted.
- `core/methodologies/deep_research.md` — sister methodology for analytical / comparative research without code-pattern extraction.
- `core/cases_schema.md` + `core/cases_synthesis_schema.md` — case format spec.
- `core/templates/case_template.md` — template for produced cases.
- `core/reviewers/research_quality_reviewer_prompt.md`, `core/reviewers/research_completeness_reviewer_prompt.md` — used in Phase 4-6.
- TODO: dedicated `case_quality_reviewer` prompt — currently not implemented; `gate_compliance` is the temporary enforcer.
- TODO: per-stack source taxonomy at `.sherpa/stack/<stack>/source_taxonomy.md` — currently inline in this methodology; per-stack file deferred until 2+ stacks have synthesis runs.
- TODO: registration in `core/methodologies/README.md` catalog and `core/router/routing_matrix.md` (separate task via `rule_engineering` methodology when this methodology moves from experimental to standard).
