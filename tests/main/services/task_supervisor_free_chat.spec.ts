// tests/main/services/task_supervisor_free_chat.spec.ts
// Plan 8b Task 7 — supervisor free-chat / router branches.

import { describe, test, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  TaskSupervisor,
  TaskEventEmitter,
  type RunnerFactory,
} from '../../../src/main/services/task_supervisor';
import type {
  MethodologyRunner,
  TaskRunResult,
} from '../../../src/main/services/methodology_runner';
import type { MetaMdStore } from '../../../src/main/services/gate_evaluator';
import type {
  MethodologyPort,
  LoadMethodologyResult,
} from '../../../src/core/ports/methodology_port';
import type { Task } from '../../../src/core/domain/task';
import type { LooseTraceEvent } from '../../../src/main/services/trace_logger';

class MockRunner extends EventEmitter {
  runCalls = 0;
  async run(): Promise<TaskRunResult> {
    this.runCalls += 1;
    return new Promise(() => { /* never settles */ });
  }
  requestPause(): void {}
  requestCancel(): void {}
}

class MockMetaStore implements MetaMdStore {
  async load(): Promise<Record<string, unknown>> {
    return {};
  }
}

function makeMethodologyPort(loadResult: LoadMethodologyResult): MethodologyPort {
  return {
    async list() { return []; },
    async load() { return loadResult; },
    async save() {},
  };
}

function makeFreeChatTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: 'task-free',
    title: 'free chat',
    status: 'created',
    thread: [],
    config: { autonomy: 'interactive', urgency: 'normal', importance: 'normal' },
    createdAt: now,
    updatedAt: now,
    totalTokens: { input: 0, output: 0 },
    methodology_selection_mode: 'none',
    ...overrides,
  };
}

function wire(opts: { methodologyResult?: LoadMethodologyResult } = {}): {
  supervisor: TaskSupervisor;
  emitted: { taskId: string; event: LooseTraceEvent }[];
  runners: MockRunner[];
} {
  const methodologyResult: LoadMethodologyResult =
    opts.methodologyResult ?? {
      ok: true,
      methodology: {
        id: 'm1',
        version: '1.0.0',
        name: 'M1',
        description: '',
        stages: [],
        edges: [],
      },
      warnings: [],
    };
  const port = makeMethodologyPort(methodologyResult);
  const events = new TaskEventEmitter();
  const emitted: { taskId: string; event: LooseTraceEvent }[] = [];
  events.on((taskId, event) => {
    emitted.push({ taskId, event });
  });
  const runners: MockRunner[] = [];
  const factory: RunnerFactory = (): MethodologyRunner => {
    const r = new MockRunner();
    runners.push(r);
    return r as unknown as MethodologyRunner;
  };
  const supervisor = new TaskSupervisor(port, factory, events, new MockMetaStore());
  return { supervisor, emitted, runners };
}

describe('TaskSupervisor — free-chat / router branches (Plan 8b Task 7)', () => {
  test('emits free_chat_session_opened when selection_mode = "none"', async () => {
    const w = wire();
    const task = makeFreeChatTask();
    await w.supervisor.start(task, '/proj');
    expect(w.runners.length).toBe(0);
    const ev = w.emitted.find((e) => e.event.kind === 'free_chat_session_opened');
    expect(ev).toBeDefined();
    expect(ev!.taskId).toBe('task-free');
  });

  test('emits free_chat_session_opened when methodologyId is missing even if mode is manual', async () => {
    const w = wire();
    const task = makeFreeChatTask({ methodology_selection_mode: 'manual' });
    // methodologyId intentionally undefined → free-chat path.
    await w.supervisor.start(task, '/proj');
    expect(w.runners.length).toBe(0);
    const ev = w.emitted.find((e) => e.event.kind === 'free_chat_session_opened');
    expect(ev).toBeDefined();
  });

  test('emits router_unavailable_fallback when selection_mode = "router"', async () => {
    const w = wire();
    const task = makeFreeChatTask({
      methodology_selection_mode: 'router',
      methodologyId: 'm1',
    });
    await w.supervisor.start(task, '/proj');
    expect(w.runners.length).toBe(0);
    const ev = w.emitted.find((e) => e.event.kind === 'router_unavailable_fallback');
    expect(ev).toBeDefined();
  });

  test('bootstraps engine when mode = "manual" AND methodologyId set', async () => {
    const w = wire();
    const task = makeFreeChatTask({
      methodology_selection_mode: 'manual',
      methodologyId: 'm1',
      stageId: 's1',
    });
    await w.supervisor.start(task, '/proj');
    expect(w.runners.length).toBe(1);
    expect(w.runners[0]!.runCalls).toBe(1);
    // Should NOT emit a free-chat marker.
    expect(w.emitted.find((e) => e.event.kind === 'free_chat_session_opened')).toBeUndefined();
  });
});
