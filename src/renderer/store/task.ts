// src/renderer/store/task.ts
import { create } from 'zustand';
import type {
  Task,
  TaskEventPayload,
  EngineTraceEventLike,
  GateEvaluationLike,
} from '../../core/domain/task';
import type { ToolCall } from '../../core/domain/agent';
import type { TaskMeta } from '../../core/domain/task_meta';
import type { Methodology } from '../../core/domain/methodology';

/**
 * Live engine runtime state for the active task. Layered on top of the
 * meta-driven sidebar polling so panels can react to engine events the
 * instant they arrive (rather than waiting for the next 1s meta poll).
 *
 * All fields default empty / inactive; panels treat an empty runtime as
 * "no live signal — fall back to meta" so cross-session loaded tasks
 * keep rendering correctly.
 */
export interface TaskRuntime {
  readonly currentStageId: string | null;
  readonly completedStages: readonly string[];
  readonly rolledBackFrom: Readonly<Record<string, readonly string[]>>;
  /** Per-stage gate evaluation, keyed by `stageId`. */
  readonly gateVerdicts: Readonly<Record<string, GateEvaluationLike>>;
  readonly artifacts: ReadonlyArray<{
    readonly path: string;
    readonly bytes: number;
    readonly written_at: string;
  }>;
  readonly status: 'inactive' | 'running' | 'paused' | 'completed' | 'failed';
}

function defaultRuntime(): TaskRuntime {
  return {
    currentStageId: null,
    completedStages: [],
    rolledBackFrom: {},
    gateVerdicts: {},
    artifacts: [],
    status: 'inactive',
  };
}

export interface RunningCounters {
  readonly toolUses: number;
  readonly elapsedSec: number;
  readonly estTokens: number;
  readonly linesWritten: number;
  /** Name of the last tool called by the agent (e.g. 'Read', 'Bash'). */
  readonly lastToolName: string | null;
}

const zeroCounters = (): RunningCounters => ({
  toolUses: 0,
  elapsedSec: 0,
  estTokens: 0,
  linesWritten: 0,
  lastToolName: null,
});

export interface TaskState {
  /** Currently-active task (null = no task selected). */
  current: Task | null;
  /** True while a turn is in flight. */
  sending: boolean;
  /** Last error from startTurn / event stream, surfaced to UI; cleared on next setCurrent / send. */
  error: string | null;
  /** Live counters during a turn (sending===true). Reset on 'started', frozen on 'done'/'error'. */
  running: RunningCounters;
  /** Live engine runtime state (populated from `engine_event` envelopes). */
  runtime: TaskRuntime;
  /** TaskMeta polled from disk (1s interval). Null until first poll completes. */
  meta: TaskMeta | null;
  /** Active methodology loaded by the task. Null when no methodology is assigned. */
  methodology: Methodology | null;

  setCurrent(t: Task | null): void;
  setMeta(m: TaskMeta | null): void;
  setMethodology(m: Methodology | null): void;
  sendUserMessage(projectPath: string, text: string): Promise<void>;
  applyEngineEvent(e: EngineTraceEventLike): void;
}

/**
 * Pure reducer for engine trace events. Idempotent (safe for double-emit
 * of `task_completed` / `task_failed` from supervisor + runner). Unknown
 * event kinds pass through unchanged so the renderer never crashes on
 * forward-compatible additions.
 */
export function applyEngineEventToRuntime(
  rt: TaskRuntime,
  e: EngineTraceEventLike,
): TaskRuntime {
  switch (e.kind) {
    case 'stage_entered': {
      const stageId = typeof e['stageId'] === 'string' ? (e['stageId'] as string) : null;
      if (!stageId) return rt;
      return { ...rt, currentStageId: stageId, status: 'running' };
    }
    case 'gate_evaluated': {
      const stageId = typeof e['stageId'] === 'string' ? (e['stageId'] as string) : null;
      const evaluation = e['evaluation'] as GateEvaluationLike | undefined;
      if (!stageId || !evaluation) return rt;
      return {
        ...rt,
        gateVerdicts: { ...rt.gateVerdicts, [stageId]: evaluation },
      };
    }
    case 'edge_traversed': {
      const from = typeof e['from'] === 'string' ? (e['from'] as string) : null;
      if (!from) return rt;
      // Idempotent: don't double-record the same stage as completed.
      if (rt.completedStages.includes(from)) return rt;
      return { ...rt, completedStages: [...rt.completedStages, from] };
    }
    case 'rollback_recorded': {
      const from = typeof e['from'] === 'string' ? (e['from'] as string) : null;
      const to = typeof e['to'] === 'string' ? (e['to'] as string) : null;
      if (!from || !to) return rt;
      const prev = rt.rolledBackFrom[to] ?? [];
      return {
        ...rt,
        rolledBackFrom: { ...rt.rolledBackFrom, [to]: [...prev, from] },
      };
    }
    case 'artifact_written': {
      const path = typeof e['path'] === 'string' ? (e['path'] as string) : null;
      const bytes = typeof e['bytes'] === 'number' ? (e['bytes'] as number) : 0;
      const ts = typeof e['ts'] === 'string' ? (e['ts'] as string) : '';
      if (!path) return rt;
      return {
        ...rt,
        artifacts: [...rt.artifacts, { path, bytes, written_at: ts }],
      };
    }
    case 'task_completed':
      return { ...rt, status: 'completed', currentStageId: null };
    case 'task_failed':
      return { ...rt, status: 'failed' };
    case 'task_paused':
      return { ...rt, status: 'paused' };
    case 'task_resumed': {
      const fromStage = typeof e['from_stage'] === 'string' ? (e['from_stage'] as string) : rt.currentStageId;
      return { ...rt, status: 'running', currentStageId: fromStage };
    }
    default:
      return rt;
  }
}

/**
 * Module-level handle so `setCurrent` (a separate code path from the
 * event-stream closure) can stop a still-ticking elapsed timer when the
 * user switches tasks mid-turn.
 */
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
function stopElapsedTimer(): void {
  if (elapsedTimer !== null) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

function countNewlines(s: unknown): number {
  if (typeof s !== 'string' || s.length === 0) return 0;
  return (s.match(/\n/g)?.length ?? 0) + 1;
}

function countLinesFromToolCall(tc: ToolCall): number {
  const args = tc.args ?? {};
  if (tc.name === 'Write') return countNewlines((args as { content?: unknown }).content);
  if (tc.name === 'Edit') return countNewlines((args as { new_string?: unknown }).new_string);
  if (tc.name === 'MultiEdit') {
    const edits = (args as { edits?: unknown }).edits;
    if (!Array.isArray(edits)) return 0;
    return edits.reduce(
      (sum: number, e) => sum + countNewlines((e as { new_string?: unknown })?.new_string),
      0,
    );
  }
  return 0;
}

export const useTask = create<TaskState>((set, get) => ({
  current: null,
  sending: false,
  error: null,
  running: zeroCounters(),
  runtime: defaultRuntime(),
  meta: null,
  methodology: null,

  setCurrent: (t) => {
    stopElapsedTimer();
    set({ current: t, error: null, running: zeroCounters(), runtime: defaultRuntime(), meta: null, methodology: null });
  },

  setMeta: (m) => set({ meta: m }),
  setMethodology: (m) => set({ methodology: m }),

  applyEngineEvent: (e) =>
    set((s) => ({ runtime: applyEngineEventToRuntime(s.runtime, e) })),

  sendUserMessage: async (projectPath, text) => {
    const cur = get().current;
    if (!cur) return;
    set({ sending: true, error: null, running: zeroCounters() });

    // Subscribe FIRST to avoid race with the synchronously-fired 'started' event.
    // The main process emits 'started' inside the ipcMain.handle before returning,
    // so we must be listening before startTurn() resolves.
    const unsubscribe = window.sherpa.task.onEvent((ev: TaskEventPayload) => {
      if (ev.taskId !== cur.id) return;
      switch (ev.kind) {
        case 'started': {
          stopElapsedTimer();
          set((s) => {
            if (!s.current || s.current.id !== cur.id) {
              return { running: zeroCounters() };
            }
            return {
              current: { ...s.current, thread: [...s.current.thread, ev.message] },
              running: zeroCounters(),
            };
          });
          elapsedTimer = setInterval(() => {
            set((s) => ({ running: { ...s.running, elapsedSec: s.running.elapsedSec + 1 } }));
          }, 1000);
          return;
        }
        case 'message': {
          const m = ev.message;
          set((s) => {
            if (!s.current || s.current.id !== cur.id) return s;
            let nextRunning: RunningCounters = s.running;
            if (m.role === 'agent' && m.text) {
              nextRunning = {
                ...nextRunning,
                estTokens: nextRunning.estTokens + Math.ceil(m.text.length / 4),
              };
            } else if (m.role === 'tool' && m.toolCall) {
              // Track the tool name as soon as the pending message arrives.
              nextRunning = { ...nextRunning, lastToolName: m.toolCall.name };
              if (m.toolCall.result !== undefined) {
                // Tool emits a 'pending' message and a 'success/error' message with
                // a populated `result`. Count once on the result-bearing payload.
                nextRunning = {
                  ...nextRunning,
                  toolUses: nextRunning.toolUses + 1,
                  estTokens: nextRunning.estTokens + Math.ceil(m.toolCall.result.length / 4),
                  linesWritten: nextRunning.linesWritten + countLinesFromToolCall(m.toolCall),
                };
              }
            }
            // Tool completion reuses the pending message's id — replace in-place.
            // All other messages are appended.
            const existingIdx = s.current.thread.findIndex((msg) => msg.id === m.id);
            const nextThread =
              existingIdx !== -1
                ? [
                    ...s.current.thread.slice(0, existingIdx),
                    m,
                    ...s.current.thread.slice(existingIdx + 1),
                  ]
                : [...s.current.thread, m];
            return {
              current: { ...s.current, thread: nextThread },
              running: nextRunning,
            };
          });
          return;
        }
        case 'done':
          stopElapsedTimer();
          set((s) => ({
            sending: false,
            // Only update current if the user hasn't switched away to a different task.
            current: s.current?.id === cur.id ? ev.task : s.current,
          }));
          unsubscribe();
          return;
        case 'error':
          stopElapsedTimer();
          set({ sending: false, error: ev.message });
          unsubscribe();
          return;
        case 'engine_event': {
          const innerKind = (ev.event as { kind?: string }).kind;
          if (innerKind === 'free_chat_session_opened') {
            console.log('[task-store] free_chat_session_opened', ev.taskId);
          } else if (innerKind === 'router_unavailable_fallback') {
            console.warn('[task-store] router_unavailable_fallback — falling back to free-chat', ev.taskId);
          } else {
            // Delegate other engine events to the runtime reducer.
            set((s) => ({ runtime: applyEngineEventToRuntime(s.runtime, ev.event) }));
          }
          return;
        }
      }
    });

    try {
      const result = await window.sherpa.task.startTurn({
        taskId: cur.id,
        projectPath,
        userMessage: text,
      });
      if (!result.ok) {
        stopElapsedTimer();
        set({ sending: false, error: result.error });
        unsubscribe();
      }
    } catch (err) {
      stopElapsedTimer();
      set({ sending: false, error: (err as Error).message });
      unsubscribe();
    }
  },
}));
