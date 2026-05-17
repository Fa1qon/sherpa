// src/core/domain/gate_item_verdict.ts
// Plan 8 Task 12 — shared per-item gate verdict logic.
//
// Originally introduced by Plan 7 Task 12 inside
// `src/presentation/screens/Library/LiveSimulation/computeVerdict.ts`
// for the live-simulation panel. Promoted here so the engine-side
// GateEvaluator (`src/main/services/gate_evaluator.ts`) and the
// simulation panel share one verdict-computation rule, differing only
// in how the `EvaluatorContext` is built (mock vs real signals).
//
// Pure, side-effect free. No fs, no async, no engine state.

import type { GateItem } from './methodology';
import type { StrictnessMode } from './task';
import { parseConditionExpr } from './condition_expr';
import { evaluateConditionExpr, type EvaluatorContext } from './condition_expr_evaluator';

export type Verdict = 'pass' | 'ask' | 'fail';

export interface VerdictTrace {
  readonly verdict: Verdict;
  /** Short human-readable explanation (engine traceability + UI tooltips). */
  readonly reason: string;
}

/**
 * Compute a single GateItem's verdict under a strictness mode.
 *
 * Rules:
 *   - No `auto_pass_when`:
 *       autonomous              → pass
 *       verify_only (non-user)  → pass
 *       verify_only (user_conf) → ask
 *       careful                 → ask
 *       standard                → ask
 *   - With `auto_pass_when`:
 *       careful                 → ask (always — bypassing auto-pass is the point)
 *       parse error / eval error → ask (degrade gracefully)
 *       expr true               → pass
 *       expr false, hard_stop   → fail
 *       expr false, !hard_stop  → ask
 */
export function computeGateItemVerdict(
  item: GateItem,
  ctx: EvaluatorContext,
  strictness: StrictnessMode,
): Verdict {
  if (!item.auto_pass_when) {
    if (strictness === 'autonomous') return 'pass';
    if (strictness === 'verify_only' && item.kind !== 'user_confirmed') return 'pass';
    return 'ask';
  }
  if (strictness === 'careful') return 'ask';
  const r = parseConditionExpr(item.auto_pass_when.expr);
  if (!r.ok) return 'ask';
  const ev = evaluateConditionExpr(r.ast, ctx);
  if (!ev.ok) return 'ask';
  if (ev.value) return 'pass';
  return item.hard_stop === true ? 'fail' : 'ask';
}

/**
 * Same as `computeGateItemVerdict` but also returns a short reason string
 * for engine traceability (audit log, UI tooltips, post-mortems).
 */
export function computeGateItemVerdictWithReason(
  item: GateItem,
  ctx: EvaluatorContext,
  strictness: StrictnessMode,
): VerdictTrace {
  if (!item.auto_pass_when) {
    if (strictness === 'autonomous') {
      return { verdict: 'pass', reason: 'no auto_pass_when; strictness=autonomous → pass' };
    }
    if (strictness === 'verify_only' && item.kind !== 'user_confirmed') {
      return { verdict: 'pass', reason: `no auto_pass_when; strictness=verify_only on ${item.kind} → pass` };
    }
    if (strictness === 'verify_only') {
      return { verdict: 'ask', reason: 'no auto_pass_when; strictness=verify_only on user_confirmed → ask' };
    }
    return { verdict: 'ask', reason: `no auto_pass_when; strictness=${strictness} → ask` };
  }

  const expr = item.auto_pass_when.expr;
  if (strictness === 'careful') {
    return { verdict: 'ask', reason: `strictness=careful overrides auto_pass_when '${expr}' → ask` };
  }
  const parsed = parseConditionExpr(expr);
  if (!parsed.ok) {
    return { verdict: 'ask', reason: `auto_pass_when parse error: ${parsed.message} → ask` };
  }
  const ev = evaluateConditionExpr(parsed.ast, ctx);
  if (!ev.ok) {
    return { verdict: 'ask', reason: `auto_pass_when eval error: ${ev.reason} → ask` };
  }
  if (ev.value) {
    return { verdict: 'pass', reason: `auto_pass_when '${expr}' → true → pass` };
  }
  if (item.hard_stop === true) {
    return { verdict: 'fail', reason: `auto_pass_when '${expr}' → false, hard_stop → fail` };
  }
  return { verdict: 'ask', reason: `auto_pass_when '${expr}' → false, not hard_stop → ask` };
}
