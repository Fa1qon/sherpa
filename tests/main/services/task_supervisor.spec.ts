// tests/main/services/task_supervisor.spec.ts
// Plan 8-fix Task 1 — TaskSupervisor unit tests.
//
// All collaborators are mocked: no real FS, no real Electron, no real
// MethodologyRunner. The MockRunner extends node:events EventEmitter so
// the supervisor's `runner.on('event', …)` subscription works exactly as
// it does in production.

import { describe, test, expect, beforeEach } from 'vitest';
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
import type { Methodology } from '../../../src/core/domain/methodology';
import type { Task } from '../../../src/core/domain/task';
import type { TaskMeta } from '../../../src/core/domain/task_meta';
import type { LooseTraceEvent } from '../../../src/main/services/trace_logger';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/**
 * Mock MethodologyRunner. The runner inherits from EventEmitter in
 * production; we mirror that so the supervisor's `runner.on('event', …)`
 * subscription wires up correctly.
 */
class MockRunner extends EventEmitter {
  pauseCalls = 0;
  cancelCalls = 0;
  runCalls = 0;
  /** Resolves the run() promise externally — set in tests. */
  private resolve!: (r: TaskRunResult) => void;
  private reject!: (err: Error) => void;
  readonly runPromise: Promise<TaskRunResult>;

  constructor() {
    super();
    this.runPromise = new Promise<TaskRunResult>((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
  }

  async run(
    _m: Methodology,
    _t: Task,
    _p: string,
  ): Promise<TaskRunResult> {
    this.runCalls += 1;
    return this.runPromise;
  }

  requestPause(): void {
    this.pauseCalls += 1;
  }

  requestCancel(): void {
    this.cancelCalls += 1;
  }

  /** Test helper: resolve the run promise with a given TaskRunResult. */
  finishWith(result: TaskRunResult): void {
    this.resolve(result);
  }

  /** Test helper: reject the run promise. */
  failWith(err: Error): void {
    this.reject(err);
  }
}

class MockMetaStore implements MetaMdStore {
  constructor(public meta: TaskMeta = {}) {}
  async load(): Promise<TaskMeta> {
    return this.meta;
  }
}

function makeMethodology(): Methodology {
  return {
    id: 'm1',
    version: '1.0.0',
    name: 'M1',
    description: 'fixture',
    stages: [],
    edges: [],
  };
}

function makeMethodologyPort(
  result: LoadMethodologyResult,
): MethodologyPort {
  return {
    async list() {
      return [];
    },
    async load() {
      return result;
    },
    async save() {
      // no-op
    },
  };
}

function makeTask(id: string): Task {
  const now = new Date().toISOString();
  return {
    id,
    methodologyId: 'm1',
    stageId: 's1',
    // Plan 8b Task 7 — supervisor branches on selection mode. Tests target
    // the engine-bootstrap path → 'manual'.
    methodology_selection_mode: 'manual',
    status: 'created',
    thread: [],
    config: { autonomy: 'interactive', urgency: 'normal', importance: 'normal' },
    createdAt: now,
    updatedAt: now,
    totalTokens: { input: 0, output: 0 },
  };
}

interface Wired {
  supervisor: TaskSupervisor;
  events: TaskEventEmitter;
  emitted: { taskId: string; event: LooseTraceEvent }[];
  runners: MockRunner[];
  metaStore: MockMetaStore;
  factory: RunnerFactory;
}

function wire(
  opts: {
    methodologyResult?: LoadMethodologyResult;
    metaStore?: MockMetaStore;
    runnerProvider?: () => MockRunner;
  } = {},
): Wired {
  const methodology = makeMethodology();
  const methodologyResult: LoadMethodologyResult =
    opts.methodologyResult ?? {
      ok: true,
      methodology,
      warnings: [],
    };
  const methodologyPort = makeMethodologyPort(methodologyResult);
  const events = new TaskEventEmitter();
  const emitted: { taskId: string; event: LooseTraceEvent }[] = [];
  events.on((taskId, event) => {
    emitted.push({ taskId, event });
  });
  const runners: MockRunner[] = [];
  const provider = opts.runnerProvider ?? ((): MockRunner => new MockRunner());
  const factory: RunnerFactory = (): MethodologyRunner => {
    const r = provider();
    runners.push(r);
    return r as unknown as MethodologyRunner;
  };
  const metaStore = opts.metaStore ?? new MockMetaStore();
  const supervisor = new TaskSupervisor(
    methodologyPort,
    factory,
    events,
    metaStore,
  );
  return { supervisor, events, emitted, runners, metaStore, factory };
}

/** Microtask flush helper — ensures fire-and-forget .then/.finally chains run. */
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 0));
  await new Promise<void>((r) => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskSupervisor.start', () => {
  let task: Task;
  beforeEach(() => {
    task = makeTask('t1');
  });

  test('instantiates a runner via factory and invokes run()', async () => {
    const w = wire();
    await w.supervisor.start(task, '/proj');
    expect(w.runners.length).toBe(1);
    expect(w.runners[0]!.runCalls).toBe(1);
    expect(w.supervisor.status('t1')).toBe('running');
  });

  test('forwards runner event emissions through TaskEventEmitter', async () => {
    const w = wire();
    await w.supervisor.start(task, '/proj');
    const r = w.runners[0]!;
    r.emit('event', { kind: 'stage_entered', stageId: 's1' });
    expect(w.emitted).toEqual([
      { taskId: 't1', event: { kind: 'stage_entered', stageId: 's1' } },
    ]);
  });

  test('rejects when same taskId is already running', async () => {
    const w = wire();
    await w.supervisor.start(task, '/proj');
    await expect(w.supervisor.start(task, '/proj')).rejects.toThrow(/already active/);
  });

  test('emits task_completed via emitter when runner returns {kind:"completed"}', async () => {
    const w = wire();
    await w.supervisor.start(task, '/proj');
    w.runners[0]!.finishWith({ kind: 'completed' });
    await flushMicrotasks();
    const completed = w.emitted.find((e) => e.event.kind === 'task_completed');
    expect(completed).toBeDefined();
    expect(w.supervisor.status('t1')).toBe('completed');
  });

  test('emits task_failed via emitter when runner rejects', async () => {
    const w = wire();
    await w.supervisor.start(task, '/proj');
    w.runners[0]!.failWith(new Error('boom'));
    await flushMicrotasks();
    const failed = w.emitted.find((e) => e.event.kind === 'task_failed');
    expect(failed).toBeDefined();
    expect((failed!.event as { reason?: string }).reason).toBe('boom');
    expect(w.supervisor.status('t1')).toBe('failed');
  });

  test('emits task_failed via emitter when runner returns {kind:"failed"}', async () => {
    const w = wire();
    await w.supervisor.start(task, '/proj');
    w.runners[0]!.finishWith({ kind: 'failed', reason: 'gate-block' });
    await flushMicrotasks();
    const failed = w.emitted.find((e) => e.event.kind === 'task_failed');
    expect(failed).toBeDefined();
    expect((failed!.event as { reason?: string }).reason).toBe('gate-block');
    expect(w.supervisor.status('t1')).toBe('failed');
  });

  test('throws and emits task_failed when methodology load fails', async () => {
    const w = wire({
      methodologyResult: { ok: false, error: { kind: 'not-found' } },
    });
    await expect(w.supervisor.start(task, '/proj')).rejects.toThrow(/methodology-load-failed/);
    expect(w.runners.length).toBe(0);
    const failed = w.emitted.find((e) => e.event.kind === 'task_failed');
    expect(failed).toBeDefined();
    expect(w.supervisor.status('t1')).toBe('failed');
  });

  test('finally clause removes task from active map after completion', async () => {
    const w = wire();
    await w.supervisor.start(task, '/proj');
    expect(w.supervisor.status('t1')).toBe('running');
    w.runners[0]!.finishWith({ kind: 'completed' });
    await flushMicrotasks();
    // After completion, status falls through to terminal map.
    expect(w.supervisor.status('t1')).toBe('completed');
    // A NEW start with the same id should now succeed (active map cleared).
    const task2 = makeTask('t1');
    await expect(w.supervisor.start(task2, '/proj')).resolves.toBeUndefined();
  });
});

describe('TaskSupervisor.pause', () => {
  test('calls runner.requestPause and updates status to paused', async () => {
    const w = wire();
    const task = makeTask('t1');
    await w.supervisor.start(task, '/proj');
    await w.supervisor.pause('t1');
    expect(w.runners[0]!.pauseCalls).toBe(1);
    expect(w.supervisor.status('t1')).toBe('paused');
  });

  test('no-op for unknown taskId', async () => {
    const w = wire();
    await expect(w.supervisor.pause('does-not-exist')).resolves.toBeUndefined();
  });
});

describe('TaskSupervisor.resumeWithContext', () => {
  test('re-bootstraps runner when meta.status === "paused"', async () => {
    const metaStore = new MockMetaStore({ status: 'paused' });
    const w = wire({ metaStore });
    const task = makeTask('t1');
    await w.supervisor.resumeWithContext(task, '/proj');
    expect(w.runners.length).toBe(1);
    expect(w.runners[0]!.runCalls).toBe(1);
  });

  test('no-ops when meta.status !== "paused"', async () => {
    const metaStore = new MockMetaStore({ status: 'active' });
    const w = wire({ metaStore });
    const task = makeTask('t1');
    await w.supervisor.resumeWithContext(task, '/proj');
    expect(w.runners.length).toBe(0);
  });

  test('no-ops when task is already running (active map hit)', async () => {
    const metaStore = new MockMetaStore({ status: 'paused' });
    const w = wire({ metaStore });
    const task = makeTask('t1');
    await w.supervisor.start(task, '/proj');
    expect(w.runners.length).toBe(1);
    await w.supervisor.resumeWithContext(task, '/proj');
    // Did NOT spawn a second runner.
    expect(w.runners.length).toBe(1);
  });
});

describe('TaskSupervisor.cancel', () => {
  test('calls runner.requestCancel and removes task from active map', async () => {
    const w = wire();
    const task = makeTask('t1');
    await w.supervisor.start(task, '/proj');
    // Schedule cancel: it requests cancel, then awaits the run promise.
    const cancelPromise = w.supervisor.cancel('t1');
    expect(w.runners[0]!.cancelCalls).toBe(1);
    // Resolve the run promise so cancel's await completes.
    w.runners[0]!.finishWith({ kind: 'failed', reason: 'cancelled' });
    await cancelPromise;
    // Active map cleared (status falls to terminal 'failed').
    expect(w.supervisor.status('t1')).toBe('failed');
  });

  test('no-op for unknown taskId', async () => {
    const w = wire();
    await expect(w.supervisor.cancel('does-not-exist')).resolves.toBeUndefined();
  });
});

describe('TaskSupervisor.status', () => {
  test('returns "inactive" for unknown taskId', () => {
    const w = wire();
    expect(w.supervisor.status('never-existed')).toBe('inactive');
  });

  test('returns "running" while runner is active, then terminal status', async () => {
    const w = wire();
    const task = makeTask('t1');
    await w.supervisor.start(task, '/proj');
    expect(w.supervisor.status('t1')).toBe('running');
    w.runners[0]!.finishWith({ kind: 'completed' });
    await flushMicrotasks();
    expect(w.supervisor.status('t1')).toBe('completed');
  });
});

describe('TaskEventEmitter', () => {
  test('emits to all subscribed listeners', () => {
    const e = new TaskEventEmitter();
    const a: { taskId: string; event: LooseTraceEvent }[] = [];
    const b: { taskId: string; event: LooseTraceEvent }[] = [];
    e.on((id, ev) => a.push({ taskId: id, event: ev }));
    e.on((id, ev) => b.push({ taskId: id, event: ev }));
    e.emit('t1', { kind: 'task_started' });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  test('returned disposer removes the listener', () => {
    const e = new TaskEventEmitter();
    const seen: LooseTraceEvent[] = [];
    const off = e.on((_id, ev) => seen.push(ev));
    e.emit('t1', { kind: 'task_started' });
    off();
    e.emit('t1', { kind: 'task_completed' });
    expect(seen).toHaveLength(1);
  });

  test('listener errors are swallowed', () => {
    const e = new TaskEventEmitter();
    e.on(() => {
      throw new Error('boom');
    });
    expect(() => e.emit('t1', { kind: 'task_started' })).not.toThrow();
  });
});
