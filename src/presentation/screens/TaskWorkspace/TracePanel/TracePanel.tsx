// src/presentation/screens/TaskWorkspace/TracePanel/TracePanel.tsx
// Plan 8 Task 17 — Trace viewer.
//
// Reads the per-task NDJSON trace (one event per line) via the IPC bridge
// (`window.sherpa.trace.read`) and renders it as:
//   - a per-stage timing summary table at the top,
//   - a row of kind-toggle filter buttons,
//   - a free-text search box,
//   - a reverse-chrono list with click-to-expand JSON per event.
//
// Strict TS. No new runtime deps. Defensive against malformed events —
// the loader (readTrace) already skips bad lines, but we still treat each
// event as { kind: string; [k: string]: unknown } here, which is what the
// permissive LooseTraceEvent in main/services/trace_logger.ts decays to.
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { useTranslation } from 'react-i18next';
import styles from './TracePanel.module.css';

/**
 * Structural shape of a trace event used by the UI. Mirrors LooseTraceEvent
 * in src/main/services/trace_logger.ts — kept local here to respect the
 * presentation → core dependency boundary (no imports from src/main).
 */
export interface TraceEventLike {
  readonly kind: string;
  readonly ts?: string;
  readonly stageId?: string;
  readonly name?: string;
  readonly [field: string]: unknown;
}

interface Props {
  readonly projectPath: string;
  readonly taskId: string;
}

/** Stable key for each event (for expansion state). */
function eventKey(e: TraceEventLike, idx: number): string {
  return `${idx}-${e.ts ?? ''}-${e.kind}`;
}

/** A short, human summary of the event for the collapsed row. */
function summarise(e: TraceEventLike): string {
  const parts: string[] = [];
  if (typeof e.stageId === 'string') parts.push(e.stageId);
  if (typeof e.name === 'string') parts.push(e.name);
  if (e.kind === 'edge_traversed') {
    const from = typeof e.from === 'string' ? e.from : '';
    const to = typeof e.to === 'string' ? e.to : '';
    if (from || to) parts.push(`${from}→${to}`);
  }
  if (e.kind === 'task_started' && typeof e.methodologyId === 'string') {
    parts.push(e.methodologyId);
  }
  if (e.kind === 'task_failed' && typeof e.reason === 'string') {
    parts.push(e.reason);
  }
  return parts.join(' · ');
}

interface StageTiming {
  readonly stageId: string;
  readonly durationMs: number;
}

/**
 * Compute per-stage durations from `stage_entered` to the latest of
 * `stage_completed` / `stage_failed` / `stage_rolled_back` /
 * `gate_evaluated` for that stage. Stages without an end event use the
 * last seen event timestamp as a best effort.
 */
export function computeStageTimings(events: readonly TraceEventLike[]): StageTiming[] {
  const enters = new Map<string, number>();
  const ends = new Map<string, number>();
  const END_KINDS = new Set([
    'stage_completed',
    'stage_failed',
    'stage_rolled_back',
    'gate_evaluated',
  ]);
  for (const e of events) {
    if (typeof e.stageId !== 'string' || typeof e.ts !== 'string') continue;
    const tMs = Date.parse(e.ts);
    if (Number.isNaN(tMs)) continue;
    if (e.kind === 'stage_entered' && !enters.has(e.stageId)) {
      enters.set(e.stageId, tMs);
    }
    if (END_KINDS.has(e.kind)) {
      // Keep the latest end timestamp per stage.
      const cur = ends.get(e.stageId);
      if (cur === undefined || tMs > cur) ends.set(e.stageId, tMs);
    }
  }
  const out: StageTiming[] = [];
  for (const [stageId, startMs] of enters) {
    const endMs = ends.get(stageId);
    if (endMs === undefined) continue;
    const d = endMs - startMs;
    if (d < 0) continue;
    out.push({ stageId, durationMs: d });
  }
  // Sort by descending duration so slow stages surface first.
  out.sort((a, b) => b.durationMs - a.durationMs);
  return out;
}

export function TracePanel({ projectPath, taskId }: Props): ReactElement {
  const { t } = useTranslation();
  const [events, setEvents] = useState<readonly TraceEventLike[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeKinds, setActiveKinds] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState<string>('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.sherpa.trace.read({ projectPath, taskId });
      setEvents(result as readonly TraceEventLike[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectPath, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const allKinds = useMemo((): readonly string[] => {
    const s = new Set<string>();
    for (const e of events) s.add(e.kind);
    return Array.from(s).sort();
  }, [events]);

  const timings = useMemo(() => computeStageTimings(events), [events]);

  const filtered = useMemo((): readonly TraceEventLike[] => {
    const lowerSearch = search.trim().toLowerCase();
    const kindFilterActive = activeKinds.size > 0;
    const out: TraceEventLike[] = [];
    for (const e of events) {
      if (kindFilterActive && !activeKinds.has(e.kind)) continue;
      if (lowerSearch.length > 0) {
        const serialised = JSON.stringify(e).toLowerCase();
        if (!serialised.includes(lowerSearch)) continue;
      }
      out.push(e);
    }
    // Reverse chrono — newest first.
    return out.slice().reverse();
  }, [events, activeKinds, search]);

  const toggleKind = useCallback((kind: string): void => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <div className={styles.panel} data-testid="trace-panel">
      <header className={styles.journalHeader}>
        <h3>{t('task.journal.title', 'Event log')}</h3>
        <small>{t('task.journal.explainer', 'Engine event log — shows stage transitions, gate evaluations, tool calls.')}</small>
      </header>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={() => void load()}
          disabled={loading}
        >
          {t('traceViewer.refresh', 'Refresh')}
        </button>
        <input
          type="text"
          className={styles.search}
          placeholder={t('traceViewer.search.placeholder', 'Search stage or tool…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('traceViewer.search.placeholder', 'Search stage or tool…')}
        />
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {timings.length > 0 && (
        <div className={styles.timingBox}>
          <div className={styles.timingTitle}>
            {t('traceViewer.timing.title', 'Per-stage timing')}
          </div>
          <table className={styles.timingTable}>
            <thead>
              <tr>
                <th>{t('traceViewer.timing.stage', 'Stage')}</th>
                <th>{t('traceViewer.timing.duration', 'Duration')}</th>
              </tr>
            </thead>
            <tbody>
              {timings.map((s) => (
                <tr key={s.stageId} data-testid={`timing-row-${s.stageId}`}>
                  <td>{s.stageId}</td>
                  <td>{t('traceViewer.timing.durationMs', { ms: s.durationMs })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {allKinds.length > 0 && (
        <div className={styles.filterRow} role="group" aria-label={t('traceViewer.filter.title', 'Filter by kind')}>
          <span className={styles.filterTitle}>{t('traceViewer.filter.title', 'Filter by kind')}:</span>
          {allKinds.map((k) => {
            const on = activeKinds.has(k);
            return (
              <button
                key={k}
                type="button"
                className={styles.kindBtn}
                data-active={on ? 'true' : 'false'}
                data-testid={`kind-filter-${k}`}
                aria-pressed={on}
                onClick={() => toggleKind(k)}
              >
                {k}
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className={styles.empty}>{t('traceViewer.empty', 'No trace events yet.')}</div>
      ) : (
        <ul className={styles.list}>
          {filtered.map((e, idx) => {
            // idx corresponds to position within `filtered` (reversed) — use
            // ts+kind to make the key stable enough between renders.
            const key = eventKey(e, events.length - 1 - idx);
            const isOpen = expanded.has(key);
            const summary = summarise(e);
            return (
              <li key={key} className={styles.row} data-testid={`trace-row-${key}`}>
                <button
                  type="button"
                  className={styles.rowHeader}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? t('traceViewer.collapse', 'Collapse event') : t('traceViewer.expand', 'Expand event')}
                  onClick={() => toggleExpanded(key)}
                >
                  <span className={styles.kindBadge} data-kind={e.kind}>{e.kind}</span>
                  <span className={styles.rowSummary}>{summary}</span>
                  <span className={styles.rowTs}>{e.ts ?? ''}</span>
                </button>
                {isOpen && (
                  <pre className={styles.detail} data-testid={`trace-detail-${key}`}>
                    {JSON.stringify(e, null, 2)}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
