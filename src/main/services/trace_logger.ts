// src/main/services/trace_logger.ts
// Plan 8 Task 16 — concrete TraceLogger (NDJSON event log).
//
// Per-task trace.jsonl under <projectPath>/.sherpa/tasks/<taskId>/, one
// JSON event per line. Strict TS discriminated union for the canonical
// event shapes (TraceEvent); a permissive `LooseTraceEvent` alias keeps
// the existing inline interfaces in stage_runner.ts / methodology_runner.ts
// compiling against this concrete class without churn — both runners emit
// extra ad-hoc fields (turn, condition, onFail, ...) that we transport
// verbatim until Plan 8 Task 17 hardens the UI consumer.
//
// Excerpt fields (prompt_excerpt / args_excerpt / result_excerpt) are
// truncated to MAX_EXCERPT chars (with an ellipsis marker) inside event()
// so callers don't have to remember.
//
// Parent directory is created lazily on first ENOENT — no eager mkdir.
//
// Strict TS; no new runtime deps (only node:fs / node:path).

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import type { GateEvaluation } from './gate_evaluator';
import type { EdgeConditionKind } from '../../core/domain/methodology';

// ---------------------------------------------------------------------------
// Event schema
// ---------------------------------------------------------------------------

export type TraceEvent =
  | { readonly kind: 'task_started'; readonly methodologyId: string; readonly taskId: string; readonly ts: string }
  | { readonly kind: 'stage_entered'; readonly stageId: string; readonly ts: string; readonly prompt_excerpt: string }
  | { readonly kind: 'stage_skipped_by_mode'; readonly stageId: string; readonly mode: string; readonly ts: string }
  | { readonly kind: 'preflight_failed'; readonly stageId: string; readonly checkId: string; readonly ts: string }
  | { readonly kind: 'tool_call'; readonly stageId: string; readonly name: string; readonly args_excerpt: string; readonly ts: string }
  | { readonly kind: 'tool_result'; readonly stageId: string; readonly name: string; readonly status: 'success' | 'error'; readonly result_excerpt: string; readonly ts: string }
  | { readonly kind: 'gate_evaluated'; readonly stageId: string; readonly evaluation: GateEvaluation; readonly ts: string }
  // NB: spec lists this variant with two `kind` properties — the discriminator
  // and the edge-condition kind. That's not representable in TS, so we name
  // the edge field `condition` (also matches what methodology_runner.ts
  // already emits today).
  | { readonly kind: 'edge_traversed'; readonly from: string; readonly to: string; readonly condition: EdgeConditionKind; readonly counter_mutations?: Readonly<Record<string, number>>; readonly ts: string }
  | { readonly kind: 'rollback_recorded'; readonly from: string; readonly to: string; readonly reason: string; readonly ts: string }
  | { readonly kind: 'counter_mutated'; readonly name: string; readonly prev: unknown; readonly next: unknown; readonly ts: string }
  | { readonly kind: 'artifact_written'; readonly path: string; readonly bytes: number; readonly ts: string }
  | { readonly kind: 'task_completed'; readonly ts: string }
  | { readonly kind: 'task_failed'; readonly reason: string; readonly ts: string }
  | { readonly kind: 'task_paused'; readonly ts: string }
  | { readonly kind: 'task_resumed'; readonly from_stage: string; readonly ts: string };

/**
 * Permissive shape accepted by `TraceLogger.event()`.
 *
 * Existing runners (stage_runner.ts, methodology_runner.ts) emit events
 * with ad-hoc field names (`turn`, `onFail`, `condition`, `toStage`,
 * `turns`, ...) — and a few additional kinds not in the canonical union
 * (`stage_completed`, `stage_rolled_back`, `stage_failed`,
 * `preflight_ask_deferred_as_rollback`). We accept them verbatim so the
 * trace remains lossless; Task 17's reader does the canonicalisation.
 */
export type LooseTraceEvent =
  | TraceEvent
  | { readonly kind: string; readonly [field: string]: unknown };

/** Excerpt field names whose values get auto-truncated. */
const EXCERPT_FIELDS = ['prompt_excerpt', 'args_excerpt', 'result_excerpt'] as const;
type ExcerptField = (typeof EXCERPT_FIELDS)[number];

/** Maximum excerpt length before truncation marker is appended. */
export const MAX_EXCERPT = 500;

// ---------------------------------------------------------------------------
// TraceLogger
// ---------------------------------------------------------------------------

export class TraceLogger {
  constructor(private readonly tracePath: string) {}

  /**
   * Append one event as an NDJSON line.
   *
   * - Truncates string-valued excerpt fields to MAX_EXCERPT.
   * - Creates the parent directory lazily on first ENOENT.
   */
  async event(e: LooseTraceEvent): Promise<void> {
    const normalised = truncateExcerpts(e);
    const line = JSON.stringify(normalised) + '\n';

    try {
      await fsp.appendFile(this.tracePath, line, { encoding: 'utf8' });
      return;
    } catch (err) {
      if (!isENOENT(err)) throw err;
    }

    // ENOENT — parent dir missing. Create once and retry.
    await fsp.mkdir(path.dirname(this.tracePath), { recursive: true });
    await fsp.appendFile(this.tracePath, line, { encoding: 'utf8' });
  }
}

// ---------------------------------------------------------------------------
// Factory / reader
// ---------------------------------------------------------------------------

/**
 * Convenience: build a TraceLogger pointing at the canonical per-task path
 *   <projectPath>/.sherpa/tasks/<taskId>/trace.jsonl
 */
export function createTraceLogger(projectPath: string, taskId: string): TraceLogger {
  const p = path.join(projectPath, '.sherpa', 'tasks', taskId, 'trace.jsonl');
  return new TraceLogger(p);
}

/**
 * Read an NDJSON trace file and return parsed events.
 *
 * - Skips blank lines and lines that fail JSON.parse (logging-only file
 *   should never be a hard dependency for callers).
 * - Missing file → empty array (not an error: trace just hasn't been
 *   appended to yet).
 */
export async function readTrace(tracePath: string): Promise<LooseTraceEvent[]> {
  let raw: string;
  try {
    raw = await fsp.readFile(tracePath, 'utf8');
  } catch (err) {
    if (isENOENT(err)) return [];
    throw err;
  }
  const events: LooseTraceEvent[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.length === 0) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object' && typeof (parsed as { kind?: unknown }).kind === 'string') {
        events.push(parsed as LooseTraceEvent);
      }
    } catch {
      // Malformed line — skip. Trace file is observability-grade; a single
      // bad line must never crash the consumer.
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Truncate a single string to `max` chars, appending an ellipsis marker
 * (`…`) when truncation occurred. Non-strings are returned unchanged.
 *
 * Exported so callers (and tests) can apply the same rule independently.
 */
export function truncateExcerpt(s: string, max: number = MAX_EXCERPT): string {
  if (typeof s !== 'string') return s;
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

/**
 * Returns a shallow-copied event with any excerpt fields truncated.
 * The original event object is not mutated.
 */
function truncateExcerpts(e: LooseTraceEvent): LooseTraceEvent {
  const src = e as Record<string, unknown>;
  let copy: Record<string, unknown> | undefined;
  for (const f of EXCERPT_FIELDS) {
    const v = src[f];
    if (typeof v === 'string' && v.length > MAX_EXCERPT) {
      if (!copy) copy = { ...src };
      copy[f as ExcerptField] = truncateExcerpt(v);
    }
  }
  return (copy ?? e) as LooseTraceEvent;
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'ENOENT'
  );
}
