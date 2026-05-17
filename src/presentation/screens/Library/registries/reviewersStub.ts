// Plan 6 Task 11 — hardcoded reviewer registry for v1.
// Plan 9 will append plugin-provided reviewers to this list.
// Plan 7 Task 2 — names/descriptions moved to locale files
// (reviewers.builtin.<id>.{name,desc}). applicability stays here as a
// structural hint, not user copy.

export interface ReviewerDef {
  readonly id: string;
  readonly applicability: string;
}

export const BUILTIN_REVIEWERS: readonly ReviewerDef[] = [
  { id: 'requirements_quality',      applicability: 'requirements stages' },
  { id: 'requirements_traceability', applicability: 'requirements stages' },
  { id: 'research_completeness',     applicability: 'research stages' },
  { id: 'design_security',           applicability: 'design stages' },
  { id: 'devils_advocate',           applicability: 'any' },
  { id: 'fact_checker',              applicability: 'content/research stages' },
  { id: 'tone_reviewer',             applicability: 'content stages' },
  { id: 'structure_reviewer',        applicability: 'any' },
  // Plan 8 Task 18 — methodology compliance reviewer.
  // Reads trace + IR + meta + artifacts to judge whether the agent followed
  // the methodology faithfully. Dispatched manually after task completion
  // (see ComplianceReview UI in TaskWorkspace).
  { id: 'methodology_compliance',    applicability: 'after task completion' },
];
