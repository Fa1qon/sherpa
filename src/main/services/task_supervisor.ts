// src/main/services/task_supervisor.ts
// Plan 8-fix Task 1 — TaskSupervisor service + in-process event emitter.
//
// Owns the lifecycle of active engine runs in the main process:
//   - start(task, projectPath) builds a fresh MethodologyRunner via the
//     injected factory, subscribes to its 'event' stream, and kicks off
//     `runner.run(methodology, task, projectPath)` as a fire-and-forget
//     promise. On settle, the active map is cleaned up.
//   - pause / resume / cancel route to the runner's cooperative request
//     methods (Plan 8-fix Task 2). pause/cancel are honoured at the next
//     stage boundary; resume re-enters start() so the runner reads
//     meta.current_stage again.
//
// The supervisor itself does not import Electron — `TaskEventEmitter` is
// a pure Node EventEmitter wrapper that the IPC handler subscribes to to
// forward engine events to renderer windows.
//
// Strict TS; no runtime deps; constructed by composition_root.ts.

import type { Task } from '../../core/domain/task';
import type {
  TaskSupervisorPort,
  TaskSupervisorStatus,
} from '../../core/ports/task_supervisor_port';
import type { MethodologyPort } from '../../core/ports/methodology_port';
import type { MethodologyRunner, TaskRunResult } from './methodology_runner';
import type { MetaMdStore } from './gate_evaluator';
import type { LooseTraceEvent } from './trace_logger';
import type { EventBus } from './event_bus';
import type { PluginExecutor } from '../plugins/plugin_executor';

// ---------------------------------------------------------------------------
// TaskEventEmitter — tiny pub/sub for engine events
// ---------------------------------------------------------------------------

export type EngineEventListener = (taskId: string, e: LooseTraceEvent) => void;

/**
 * Minimal in-process emitter used to forward engine trace events from the
 * supervisor to IPC handlers (which then forward to renderer windows).
 *
 * Deliberately not a Node `EventEmitter` subclass — we want a single typed
 * listener signature with string + payload, not the variadic event-name
 * API. Listener errors are swallowed so a buggy subscriber never crashes
 * the engine loop.
 */
export class TaskEventEmitter {
  private readonly listeners = new Set<EngineEventListener>();

  emit(taskId: string, e: LooseTraceEvent): void {
    for (const l of this.listeners) {
      try {
        l(taskId, e);
      } catch {
        // Subscriber errors must not interrupt the engine.
      }
    }
  }

  /** Returns an unsubscribe function. */
  on(listener: EngineEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

// ---------------------------------------------------------------------------
// Internal active-run record
// ---------------------------------------------------------------------------

interface ActiveRun {
  readonly runner: MethodologyRunner;
  readonly promise: Promise<TaskRunResult>;
  status: 'running' | 'paused';
  readonly projectPath: string;
  readonly task: Task;
  /** Disposer for the runner.on('event', …) subscription. */
  readonly unsubscribe: () => void;
}

export type RunnerFactory = (
  task: Task,
  projectPath: string,
) => MethodologyRunner;

// ---------------------------------------------------------------------------
// TaskSupervisor
// ---------------------------------------------------------------------------

export class TaskSupervisor implements TaskSupervisorPort {
  private readonly active = new Map<string, ActiveRun>();
  /** Last terminal status by taskId (for status() after the run is done). */
  private readonly terminal = new Map<string, 'completed' | 'failed'>();

  constructor(
    private readonly methodologyStore: MethodologyPort,
    private readonly runnerFactory: RunnerFactory,
    private readonly events: TaskEventEmitter,
    private readonly metaStore: MetaMdStore,
    // Plan 02 — optional EventBus for SDK subscribers; default null keeps
    // existing tests constructing `new TaskSupervisor(...)` valid.
    private readonly bus: EventBus | null = null,
    // Track C Plan 02 — optional pipeline plugin executor; dispatches
    // `on_task_complete` / `on_task_fail` at run settlement.
    private readonly pluginExecutor: PluginExecutor | null = null,
  ) {}

  async start(task: Task, projectPath: string): Promise<void> {
    if (this.active.has(task.id)) {
      throw new Error(`task ${task.id} is already active`);
    }

    // Plan 8b Task 7 — Free-chat / router modes bypass the engine entirely.
    // The supervisor emits a marker event so renderer/tests can observe the
    // branch without bootstrapping a MethodologyRunner.
    const selectionMode = task.methodology_selection_mode ?? 'none';
    if (selectionMode === 'none' || !task.methodologyId) {
      this.events.emit(task.id, {
        kind: 'free_chat_session_opened',
        ts: new Date().toISOString(),
      });
      return;
    }
    if (selectionMode === 'router') {
      // Router placeholder — Plan 12. Fall back to free chat with a notice.
      this.events.emit(task.id, {
        kind: 'router_unavailable_fallback',
        ts: new Date().toISOString(),
      });
      return;
    }

    // Manual mode → engine bootstrap. Load methodology up-front so a
    // missing-methodology error surfaces synchronously to the caller
    // rather than via an emitted task_failed. The early return above
    // guarantees methodologyId is a string here.
    const loaded = await this.methodologyStore.load(projectPath, task.methodologyId as string);
    if (!loaded.ok) {
      const reason = `methodology-load-failed: ${loaded.error.kind}`;
      this.events.emit(task.id, { kind: 'task_failed', reason });
      this.terminal.set(task.id, 'failed');
      throw new Error(reason);
    }
    const methodology = loaded.methodology;

    const runner = this.runnerFactory(task, projectPath);

    // Forward every runner event through the supervisor's emitter.
    const onEvent = (e: unknown): void => {
      this.events.emit(task.id, e as LooseTraceEvent);
    };
    runner.on('event', onEvent);
    const unsubscribe = (): void => {
      runner.off('event', onEvent);
    };

    // Kick off the run. The promise is owned by ActiveRun; we attach
    // settlement handlers below to clean up + emit terminal events.
    const promise = runner
      .run(methodology, task, projectPath)
      .then(async (result): Promise<TaskRunResult> => {
        if (result.kind === 'completed') {
          this.events.emit(task.id, { kind: 'task_completed' });
          this.terminal.set(task.id, 'completed');
          this.bus?.emit({
            type: 'task.completed',
            ts: Date.now(),
            taskId: task.id,
            success: true,
          });
          await this.pluginExecutor?.dispatch('on_task_complete', {
            hook: 'on_task_complete',
            task: { id: task.id, workdir: projectPath, methodologyId: task.methodologyId },
            event: {},
            timestamp: Date.now(),
          });
        } else if (result.kind === 'failed') {
          this.events.emit(task.id, { kind: 'task_failed', reason: result.reason });
          this.terminal.set(task.id, 'failed');
          this.bus?.emit({
            type: 'task.completed',
            ts: Date.now(),
            taskId: task.id,
            success: false,
          });
          await this.pluginExecutor?.dispatch('on_task_fail', {
            hook: 'on_task_fail',
            task: { id: task.id, workdir: projectPath, methodologyId: task.methodologyId },
            event: { reason: result.reason },
            timestamp: Date.now(),
          });
        }
        // 'paused' is NOT a terminal state — the runner emitted task_paused
        // already; the active record is removed (resume re-bootstraps).
        return result;
      })
      .catch(async (err: unknown): Promise<TaskRunResult> => {
        const reason = err instanceof Error ? err.message : String(err);
        this.events.emit(task.id, { kind: 'task_failed', reason });
        this.terminal.set(task.id, 'failed');
        this.bus?.emit({
          type: 'task.completed',
          ts: Date.now(),
          taskId: task.id,
          success: false,
        });
        await this.pluginExecutor?.dispatch('on_task_fail', {
          hook: 'on_task_fail',
          task: { id: task.id, workdir: projectPath, methodologyId: task.methodologyId },
          event: { reason },
          timestamp: Date.now(),
        });
        return { kind: 'failed', reason };
      })
      .finally(() => {
        unsubscribe();
        this.active.delete(task.id);
      });

    this.active.set(task.id, {
      runner,
      promise,
      status: 'running',
      projectPath,
      task,
      unsubscribe,
    });
  }

  async pause(taskId: string): Promise<void> {
    const run = this.active.get(taskId);
    if (!run) return;
    run.runner.requestPause();
    run.status = 'paused';
  }

  async resume(taskId: string): Promise<void> {
    // Look up the projectPath we stored at start-time. If the run is no
    // longer in the active map (typical case — pause cleared it once the
    // runner returned 'paused'), we read meta to discover the path was
    // recorded against this task; without an active record we cannot
    // resume because we never persisted projectPath ourselves.
    //
    // For the simple in-memory case the supervisor handles, the active
    // record is GONE post-pause (the runner promise settled). Production
    // resume relies on the IPC handler receiving the projectPath again
    // from the renderer (see handlers.ts TASK_RESUME). Inline test
    // behaviour: while the run is still paused (rare race), no-op.
    const run = this.active.get(taskId);
    if (run) {
      // Active record still present (pre-stage-boundary pause): nothing
      // to do — the runner will continue at the next stage when its
      // pause flag is consumed.
      return;
    }

    // No active record — try meta-driven re-bootstrap.
    // We rely on a hint: check terminal map — if the task already
    // completed/failed, refuse silently.
    if (this.terminal.has(taskId)) return;

    // Without a stored projectPath/task we cannot rebuild the runner.
    // Resume from a fresh process (or after the pause settled) is driven
    // by the IPC handler calling start(task, projectPath) directly.
    return;
  }

  async cancel(taskId: string): Promise<void> {
    const run = this.active.get(taskId);
    if (!run) return;
    run.runner.requestCancel();
    // Wait for the runner to honour the request and settle. The .finally
    // attached in start() removes the entry from `active`, so we await
    // the promise itself rather than re-checking the map.
    try {
      await run.promise;
    } catch {
      // Cancellation surfaces as task_failed via the catch in start();
      // swallow here — the public API is "request honoured", not
      // "completed cleanly".
    }
  }

  status(taskId: string): TaskSupervisorStatus {
    const run = this.active.get(taskId);
    if (run) return run.status;
    const term = this.terminal.get(taskId);
    if (term) return term;
    return 'inactive';
  }

  /**
   * Re-entry point for resume from the IPC handler: re-bootstraps a
   * paused task with a freshly-supplied projectPath. Distinct from the
   * port's `resume(taskId)` because the port can't carry projectPath.
   *
   * Loads meta to verify status === 'paused' before starting; otherwise
   * no-ops to avoid double-starting an already-running task.
   */
  async resumeWithContext(task: Task, projectPath: string): Promise<void> {
    if (this.active.has(task.id)) return;
    const meta = await this.metaStore.load(projectPath, task.id);
    if (meta.status !== 'paused') return;
    await this.start(task, projectPath);
  }
}
