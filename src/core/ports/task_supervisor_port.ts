// src/core/ports/task_supervisor_port.ts
// Plan 8-fix Task 1 — TaskSupervisor port.
//
// The supervisor owns the lifecycle of an active engine run for one task:
// it instantiates a per-task MethodologyRunner, kicks off run(), and
// honours pause/resume/cancel requests originated by the UI.
//
// Surface notes:
//   - `start` takes BOTH the Task and the projectPath. The Task domain
//     object does not carry the project path; the supervisor stores it
//     internally so subsequent pause/resume/cancel only need the taskId.
//   - All methods are async even when their honoured side-effects happen
//     at the next stage boundary (cooperative cancellation model — see
//     Plan 8-fix Task 2 / MethodologyRunner.requestPause).
//   - `status` is synchronous because it is a pure read of in-memory state.
//
// No runtime deps. No Electron / IPC types — this port lives in core.

import type { Task } from '../domain/task';

export type TaskSupervisorStatus =
  | 'inactive'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

export interface TaskSupervisorPort {
  /**
   * Begin engine execution for `task` rooted at `projectPath`.
   * Throws if `task.id` is already active (running or paused).
   */
  start(task: Task, projectPath: string): Promise<void>;

  /**
   * Cooperatively request pause. Honoured at the next stage boundary;
   * resolves once the request has been recorded (NOT once the runner has
   * actually halted — observers should listen on engine_event for the
   * `task_paused` trace event for that signal).
   */
  pause(taskId: string): Promise<void>;

  /**
   * Re-bootstrap the runner for a previously-paused task. The runner reads
   * `meta.current_stage` on entry, so resume picks up where pause left off.
   * No-op when the task is not currently paused.
   */
  resume(taskId: string): Promise<void>;

  /**
   * Request cancel and await the underlying run promise.
   * Removes the task from the active set on completion.
   */
  cancel(taskId: string): Promise<void>;

  /**
   * Synchronous status read. Returns 'inactive' for unknown task ids.
   */
  status(taskId: string): TaskSupervisorStatus;
}
