// src/core/domain/strictness_directives.ts
// Plan 8 Task 11 — single source of truth for the textual directive injected
// into a stage's system prompt per Task.strictness_mode. Engine-side only;
// gate verdict computation logic lives in gate_item_verdict.ts.

import type { StrictnessMode } from './task';

const DIRECTIVES: Readonly<Record<StrictnessMode, string>> = {
  autonomous:
    'Strictness: autonomous. Auto-pass gates where possible; do not stop unless an item explicitly requires human input.',
  standard:
    'Strictness: standard. Confirm with the user on ambiguous gate items.',
  careful:
    'Strictness: careful. Confirm every non-trivial decision with the user.',
  verify_only:
    'Strictness: verify only. Make no changes; report findings only.',
};

export function strictnessDirective(mode: StrictnessMode): string {
  return DIRECTIVES[mode] ?? DIRECTIVES.standard;
}
