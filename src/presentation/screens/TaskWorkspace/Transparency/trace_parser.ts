// src/presentation/screens/TaskWorkspace/Transparency/trace_parser.ts
//
// Pairs tool_call / tool_result trace events from Sherpa's NDJSON trace.
//
// ADR-001: presentation MUST NOT import from src/main. We define a structural
// local alias instead of importing LooseTraceEvent from trace_logger.ts.

/** Structural alias for LooseTraceEvent — mirrors the shape without importing from src/main. */
export type TraceEventLike = {
  readonly kind: string;
  readonly [k: string]: unknown;
};

export interface ToolCall {
  /** Synthetic id — `${stageId}:${toolName}:${sequence}` */
  callId: string;
  toolName: string;
  stageId?: string;
  /** Parsed from args_excerpt (JSON.parse best-effort, fallback to raw string). */
  input?: unknown;
  /** Parsed from result_excerpt similarly. */
  output?: unknown;
  /** true when tool_result status === 'error'. */
  isError?: boolean;
  startedTs?: number;
  completedTs?: number;
  durationMs?: number;
}

/**
 * Parse an ISO timestamp string (or pass-through a numeric ms timestamp) into
 * a UNIX millisecond number. Returns undefined for invalid/missing values.
 */
export function parseTs(ts: unknown): number | undefined {
  if (typeof ts === 'string') {
    const t = Date.parse(ts);
    return Number.isFinite(t) ? t : undefined;
  }
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  return undefined;
}

/**
 * Parse a raw excerpt string into a structured value.
 * Attempts JSON.parse first; falls back to the raw string on failure.
 */
function parseExcerpt(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Aggregate raw trace events into paired ToolCall objects.
 *
 * Pairing strategy: FIFO queue keyed by `${stageId}:${toolName}`.
 * - tool_call → enqueue
 * - tool_result → dequeue oldest matching call and attach output
 * - Orphan tool_result (no matching call) → synthetic completed call surfaced
 */
export function aggregateToolCalls(events: readonly TraceEventLike[]): ToolCall[] {
  const calls: ToolCall[] = [];
  /** Map from `stageId:toolName` → ordered list of indices into `calls`. */
  const pending = new Map<string, number[]>();
  let seq = 0;

  for (const ev of events) {
    if (ev.kind === 'tool_call') {
      const stageId = ev.stageId as string | undefined;
      const name = (ev.name as string | undefined) ?? 'unknown';
      const idx = calls.length;

      calls.push({
        callId: `${stageId ?? '-'}:${name}:${seq++}`,
        toolName: name,
        stageId,
        input: parseExcerpt(ev.args_excerpt),
        startedTs: parseTs(ev.ts),
      });

      const key = `${stageId ?? '-'}:${name}`;
      const q = pending.get(key) ?? [];
      q.push(idx);
      pending.set(key, q);
    } else if (ev.kind === 'tool_result') {
      const stageId = ev.stageId as string | undefined;
      const name = (ev.name as string | undefined) ?? 'unknown';
      const key = `${stageId ?? '-'}:${name}`;
      const q = pending.get(key);
      const idx = q && q.length > 0 ? q.shift()! : -1;

      const output = parseExcerpt(ev.result_excerpt);
      const completedTs = parseTs(ev.ts);
      const isError = (ev.status as string | undefined) === 'error';

      if (idx >= 0) {
        const c = calls[idx];
        c.output = output;
        c.completedTs = completedTs;
        c.isError = isError;
        if (c.startedTs !== undefined && completedTs !== undefined) {
          c.durationMs = completedTs - c.startedTs;
        }
      } else {
        // Orphan result — surface as a synthetic completed call.
        calls.push({
          callId: `${stageId ?? '-'}:${name}:${seq++}:orphan`,
          toolName: name,
          stageId,
          input: undefined,
          output,
          completedTs,
          isError,
        });
      }
    }
  }

  return calls;
}
