// src/core/domain/app_events.ts
//
// Two parallel event surfaces live here:
//
// 1. `AppEventMap` (legacy, name → payload map)
//    Drives the original `eventBus` in `src/main/events/event_bus.ts` and the
//    `setupIpcEventBridge` forwarder. Emission uses two-arg shape
//    `ipcRenderer.send(CH.APP_EVENT, name, payload)`. Kept to avoid breaking
//    existing case/knowledge/template events.
//
// 2. `AppEvent` (Extension Framework Plan 02, discriminated union)
//    Drives the new typed `EventBus` in `src/main/services/event_bus.ts`.
//    Emission uses single-arg shape `ipcRenderer.send(CH.APP_EVENT, ev)`.
//    Subscribed to by `sherpa.events.on(type, cb)` in the renderer preload.
//
// Both surfaces share the `CH.APP_EVENT` channel; the renderer-side handler
// distinguishes them by argument shape (legacy callback receives 2 args, new
// callback receives 1).

// ---------------------------------------------------------------------------
// Legacy: AppEventMap (knowledge / case / template / stage / methodology)
// ---------------------------------------------------------------------------

export interface AppEventMap {
  'task.stage.completed': {
    taskId: string;
    stageId: string;
    nextStageId: string;
    ts: string;
  };
  'task.methodology.completed': {
    taskId: string;
    ts: string;
  };
  'case.changed': {
    projectPath: string;
    caseId?: string;
    action: 'created' | 'deleted' | 'updated';
  };
  'knowledge.changed': {
    projectPath: string;
    knowledgeId: string;
    action: 'created' | 'updated' | 'deleted';
  };
  'artifact_template.changed': {
    projectPath: string;
    templateId: string;
    action: 'created' | 'updated' | 'deleted';
  };
}

export type AppEventName = keyof AppEventMap;

// ---------------------------------------------------------------------------
// Extension Framework v1: AppEvent discriminated union
// ---------------------------------------------------------------------------

export type AppEvent =
  | { type: 'file.changed';        ts: number; projectPath: string; relPath: string; action: 'created' | 'modified' | 'deleted' }
  | { type: 'artifact.written';    ts: number; taskId: string; artifactPath: string; size: number }
  | { type: 'message.sent';        ts: number; taskId: string; role: 'user'; text: string }
  | { type: 'message.received';    ts: number; taskId: string; role: 'agent'; text: string; tokens?: number }
  | { type: 'tool.called';         ts: number; taskId: string; tool: string; input: unknown }
  | { type: 'tool.result';         ts: number; taskId: string; tool: string; ok: boolean; output: unknown; durationMs: number }
  | { type: 'stage.started';       ts: number; taskId: string; stageId: string }
  | { type: 'stage.completed';     ts: number; taskId: string; stageId: string; status: 'success' | 'failed' | 'skipped' }
  | { type: 'gate.evaluated';      ts: number; taskId: string; gateId: string; result: 'pass' | 'fail' | 'pending' }
  | { type: 'task.created';        ts: number; taskId: string; methodology?: string }
  | { type: 'task.completed';      ts: number; taskId: string; success: boolean }
  | { type: 'project.opened';      ts: number; projectPath: string };

/**
 * Type-guard factory for narrowing an `AppEvent` to a specific variant by
 * its `type` discriminant. Useful when wiring `onAny` to a switchboard.
 */
export function eventOfType<T extends AppEvent['type']>(
  t: T,
): (e: AppEvent) => e is Extract<AppEvent, { type: T }> {
  return (e): e is Extract<AppEvent, { type: T }> => e.type === t;
}
