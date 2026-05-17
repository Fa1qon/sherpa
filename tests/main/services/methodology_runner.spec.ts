// Plan 8 Task 14 — MethodologyRunner tests.
// Everything is mocked: StageRunner, MetaMdStore, TraceLogger. Tests cover
// linear flow, branch edges, rollback path, mode gating, counters, resume,
// failure propagation, and the empty/terminal cases.

import { describe, test, expect } from 'vitest';

import {
  MethodologyRunner,
  END_STAGE_ID,
  type TaskRunResult,
} from '../../../src/main/services/methodology_runner';
import type {
  StageRunner,
  StageResult,
  TraceLogger,
  TraceEvent,
} from '../../../src/main/services/stage_runner';
import type { MetaMdStore } from '../../../src/main/services/gate_evaluator';
import type {
  Methodology,
  Stage,
  Edge,
  EdgeCondition,
} from '../../../src/core/domain/methodology';
import type { Task } from '../../../src/core/domain/task';
import type { TaskMeta, CounterMutations } from '../../../src/core/domain/task_meta';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

class MockTraceLogger implements TraceLogger {
  readonly events: TraceEvent[] = [];
  async event(e: TraceEvent): Promise<void> {
    this.events.push(e);
  }
}

class ScriptedStageRunner {
  readonly calls: string[] = [];
  // Map of stage.id → scripted result. Missing stages default to 'completed'.
  constructor(private readonly script: Record<string, StageResult> = {}) {}
  async runStage(
    stage: Stage,
    _m: Methodology,
    _t: Task,
    _p: string,
  ): Promise<StageResult> {
    this.calls.push(stage.id);
    const scripted = this.script[stage.id];
    if (scripted) return scripted;
    return { kind: 'completed', stageId: stage.id, turns: 1 };
  }
}

interface StoreCall {
  readonly fn: string;
  readonly args: readonly unknown[];
}

class MockMetaStore implements MetaMdStore {
  readonly calls: StoreCall[] = [];
  readonly applied: CounterMutations[] = [];
  constructor(private meta: TaskMeta = {}) {}
  async load(projectPath: string, taskId: string): Promise<TaskMeta> {
    this.calls.push({ fn: 'load', args: [projectPath, taskId] });
    return this.meta;
  }
  async markStageCompleted(projectPath: string, taskId: string, stageId: string): Promise<void> {
    this.calls.push({ fn: 'markStageCompleted', args: [projectPath, taskId, stageId] });
  }
  async recordRollback(projectPath: string, taskId: string, fromStage: string, toStage: string): Promise<void> {
    this.calls.push({ fn: 'recordRollback', args: [projectPath, taskId, fromStage, toStage] });
  }
  async applyCounterMutations(projectPath: string, taskId: string, mutations: CounterMutations): Promise<void> {
    this.calls.push({ fn: 'applyCounterMutations', args: [projectPath, taskId, mutations] });
    this.applied.push(mutations);
  }
  async setCurrentStage(projectPath: string, taskId: string, stageId: string): Promise<void> {
    this.calls.push({ fn: 'setCurrentStage', args: [projectPath, taskId, stageId] });
  }
  async markPaused(projectPath: string, taskId: string): Promise<void> {
    this.calls.push({ fn: 'markPaused', args: [projectPath, taskId] });
  }
  setMeta(m: TaskMeta): void {
    this.meta = m;
  }
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeStage(id: string, overrides: Partial<Stage> = {}): Stage {
  return {
    id,
    name: id,
    mode: 'auto',
    contract: {
      input: [],
      output: { path: `${id}.md` },
    },
    ...overrides,
  };
}

function makeEdge(
  from: string,
  to: string,
  condition: EdgeCondition,
  extras: Partial<Edge> = {},
): Edge {
  return { from, to, condition, ...extras };
}

function makeMethodology(stages: readonly Stage[], edges: readonly Edge[]): Methodology {
  return {
    id: 'm1',
    version: '1.0.0',
    name: 'Test M',
    description: '',
    stages,
    edges,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    methodologyId: 'm1',
    stageId: 's1',
    status: 'running',
    thread: [],
    config: { autonomy: 'auto', urgency: 'normal', importance: 'normal' },
    createdAt: '2026-05-12T00:00:00Z',
    updatedAt: '2026-05-12T00:00:00Z',
    totalTokens: { input: 0, output: 0 },
    ...overrides,
  };
}

function kinds(events: readonly TraceEvent[]): readonly string[] {
  return events.map((e) => e.kind);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MethodologyRunner — linear flow', () => {
  test('runs start → s1 → s2 → s3 → end in order', async () => {
    const stages = [makeStage('s1'), makeStage('s2'), makeStage('s3')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 's2', { kind: 'gate-pass' }),
      makeEdge('s2', 's3', { kind: 'gate-pass' }),
      makeEdge('s3', 'end', { kind: 'always' }),
    ];
    const m = makeMethodology(stages, edges);
    const sr = new ScriptedStageRunner();
    const ms = new MockMetaStore();
    const tl = new MockTraceLogger();
    const runner = new MethodologyRunner(sr as unknown as StageRunner, ms, tl);

    const result: TaskRunResult = await runner.run(m, makeTask(), '/proj');

    expect(result).toEqual({ kind: 'completed' });
    expect(sr.calls).toEqual(['s1', 's2', 's3']);
    expect(kinds(tl.events)).toContain('task_started');
    expect(kinds(tl.events).filter((k) => k === 'edge_traversed').length).toBe(3);
    expect(kinds(tl.events)).toContain('task_completed');
  });

  test('falls back to first declared stage if no start edge exists', async () => {
    const stages = [makeStage('only'), makeStage('unused')];
    const edges = [makeEdge('only', END_STAGE_ID, { kind: 'always' })];
    const m = makeMethodology(stages, edges);
    const sr = new ScriptedStageRunner();
    const ms = new MockMetaStore();
    const runner = new MethodologyRunner(
      sr as unknown as StageRunner,
      ms,
      new MockTraceLogger(),
    );

    const result = await runner.run(m, makeTask(), '/proj');
    expect(result.kind).toBe('completed');
    expect(sr.calls).toEqual(['only']);
  });

  test('empty methodology terminates immediately as completed', async () => {
    const m = makeMethodology([], []);
    const tl = new MockTraceLogger();
    const runner = new MethodologyRunner(
      new ScriptedStageRunner() as unknown as StageRunner,
      new MockMetaStore(),
      tl,
    );
    const result = await runner.run(m, makeTask(), '/proj');
    expect(result.kind).toBe('completed');
    expect(kinds(tl.events)).toContain('task_completed');
  });
});

describe('MethodologyRunner — branch edges', () => {
  test('picks the branch whose expr evaluates true (uses meta.fields)', async () => {
    const stages = [makeStage('s1'), makeStage('left'), makeStage('right')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 'left', { kind: 'branch', expr: "meta.path == 'A'" }),
      makeEdge('s1', 'right', { kind: 'branch', expr: "meta.path == 'B'" }),
      makeEdge('left', 'end', { kind: 'always' }),
      makeEdge('right', 'end', { kind: 'always' }),
    ];
    const m = makeMethodology(stages, edges);
    const sr = new ScriptedStageRunner();
    const ms = new MockMetaStore({ fields: { path: 'B' } });
    const runner = new MethodologyRunner(
      sr as unknown as StageRunner,
      ms,
      new MockTraceLogger(),
    );

    const result = await runner.run(m, makeTask(), '/proj');
    expect(result.kind).toBe('completed');
    expect(sr.calls).toEqual(['s1', 'right']);
  });

  test('branch (specific) wins over gate-pass and always (fallback)', async () => {
    const stages = [makeStage('s1'), makeStage('specific'), makeStage('fallback')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      // Order: always first, gate-pass second, branch last — branch must still win.
      makeEdge('s1', 'fallback', { kind: 'always' }),
      makeEdge('s1', 'fallback', { kind: 'gate-pass' }),
      makeEdge('s1', 'specific', { kind: 'branch', expr: 'scope_unchanged()' }),
      makeEdge('specific', 'end', { kind: 'always' }),
      makeEdge('fallback', 'end', { kind: 'always' }),
    ];
    const m = makeMethodology(stages, edges);
    const sr = new ScriptedStageRunner();
    const runner = new MethodologyRunner(
      sr as unknown as StageRunner,
      new MockMetaStore(),
      new MockTraceLogger(),
    );
    const result = await runner.run(m, makeTask(), '/proj');
    expect(result.kind).toBe('completed');
    expect(sr.calls).toEqual(['s1', 'specific']);
  });

  test('unsatisfiable branches degrade to always-fallback', async () => {
    const stages = [makeStage('s1'), makeStage('A'), makeStage('B')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 'A', { kind: 'branch', expr: "meta.x == 'no'" }),
      makeEdge('s1', 'B', { kind: 'always' }),
      makeEdge('A', 'end', { kind: 'always' }),
      makeEdge('B', 'end', { kind: 'always' }),
    ];
    const m = makeMethodology(stages, edges);
    const sr = new ScriptedStageRunner();
    const runner = new MethodologyRunner(
      sr as unknown as StageRunner,
      new MockMetaStore(),
      new MockTraceLogger(),
    );
    const result = await runner.run(m, makeTask(), '/proj');
    expect(result.kind).toBe('completed');
    expect(sr.calls).toEqual(['s1', 'B']);
  });
});

describe('MethodologyRunner — rollback path', () => {
  test('StageRunner returns rollback → recordRollback + jumps to target', async () => {
    const stages = [makeStage('s1'), makeStage('s2'), makeStage('s3')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 's2', { kind: 'gate-pass' }),
      makeEdge('s2', 's3', { kind: 'gate-pass' }),
      makeEdge('s3', 'end', { kind: 'always' }),
      // Declared rollback edge with counter increment.
      makeEdge('s2', 's1', { kind: 'rollback' }, {
        increment_counters_on_traverse: ['rollback_count'],
      }),
    ];
    const m = makeMethodology(stages, edges);
    // s2 rolls back to s1 ONCE, then on the second visit completes normally.
    let s2Visits = 0;
    const sr: ScriptedStageRunner = new ScriptedStageRunner();
    sr.runStage = async (stage) => {
      sr.calls.push(stage.id);
      if (stage.id === 's2') {
        s2Visits += 1;
        if (s2Visits === 1) return { kind: 'rollback', toStage: 's1' };
      }
      return { kind: 'completed', stageId: stage.id, turns: 1 };
    };

    const ms = new MockMetaStore();
    const tl = new MockTraceLogger();
    const runner = new MethodologyRunner(sr as unknown as StageRunner, ms, tl);

    const result = await runner.run(m, makeTask(), '/proj');
    expect(result.kind).toBe('completed');
    expect(sr.calls).toEqual(['s1', 's2', 's1', 's2', 's3']);

    const rollbackCall = ms.calls.find((c) => c.fn === 'recordRollback');
    expect(rollbackCall).toBeDefined();
    expect(rollbackCall!.args).toEqual(['/proj', 't1', 's2', 's1']);

    // Rollback edge declared an increment — must be applied.
    expect(ms.applied.some((m) => m.incremented.includes('rollback_count'))).toBe(true);

    expect(kinds(tl.events)).toContain('edge_traversed');
  });
});

describe('MethodologyRunner — mode gating', () => {
  test('stage with active_in_modes=[standard] is skipped when task.agent_mode=light', async () => {
    const stages = [
      makeStage('s1'),
      makeStage('s2', { active_in_modes: ['standard', 'deep'] }),
      makeStage('s3'),
    ];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 's2', { kind: 'gate-pass' }),
      makeEdge('s2', 's3', { kind: 'gate-pass' }),
      makeEdge('s3', 'end', { kind: 'always' }),
    ];
    const m = makeMethodology(stages, edges);
    const sr = new ScriptedStageRunner();
    const tl = new MockTraceLogger();
    const runner = new MethodologyRunner(
      sr as unknown as StageRunner,
      new MockMetaStore(),
      tl,
    );

    const result = await runner.run(m, makeTask({ agent_mode: 'light' }), '/proj');
    expect(result.kind).toBe('completed');
    // s2 must NOT execute.
    expect(sr.calls).toEqual(['s1', 's3']);
    expect(kinds(tl.events)).toContain('stage_skipped_by_mode');
    const skipEvent = tl.events.find((e) => e.kind === 'stage_skipped_by_mode');
    expect(skipEvent).toMatchObject({ stageId: 's2', mode: 'light' });
  });

  test('stage is run when task.agent_mode IS in active_in_modes', async () => {
    const stages = [
      makeStage('only', { active_in_modes: ['deep'] }),
    ];
    const edges = [
      makeEdge('start', 'only', { kind: 'always' }),
      makeEdge('only', 'end', { kind: 'always' }),
    ];
    const sr = new ScriptedStageRunner();
    const runner = new MethodologyRunner(
      sr as unknown as StageRunner,
      new MockMetaStore(),
      new MockTraceLogger(),
    );
    const result = await runner.run(
      makeMethodology(stages, edges),
      makeTask({ agent_mode: 'deep' }),
      '/proj',
    );
    expect(result.kind).toBe('completed');
    expect(sr.calls).toEqual(['only']);
  });

  test('stage with active_in_modes is NOT gated when task.agent_mode is undefined', async () => {
    const stages = [makeStage('only', { active_in_modes: ['standard'] })];
    const edges = [
      makeEdge('start', 'only', { kind: 'always' }),
      makeEdge('only', 'end', { kind: 'always' }),
    ];
    const sr = new ScriptedStageRunner();
    const runner = new MethodologyRunner(
      sr as unknown as StageRunner,
      new MockMetaStore(),
      new MockTraceLogger(),
    );
    const result = await runner.run(
      makeMethodology(stages, edges),
      makeTask(), // no agent_mode
      '/proj',
    );
    expect(result.kind).toBe('completed');
    expect(sr.calls).toEqual(['only']);
  });
});

describe('MethodologyRunner — counter mutations', () => {
  test('increment_counters_on_traverse triggers applyCounterMutations on traversal', async () => {
    const stages = [makeStage('s1'), makeStage('s2')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 's2', { kind: 'gate-pass' }, {
        increment_counters_on_traverse: ['recut_count', 'stage_count'],
        preserve_counters_on_traverse: ['user_signed_off'],
      }),
      makeEdge('s2', 'end', { kind: 'always' }),
    ];
    const m = makeMethodology(stages, edges);
    const ms = new MockMetaStore();
    const runner = new MethodologyRunner(
      new ScriptedStageRunner() as unknown as StageRunner,
      ms,
      new MockTraceLogger(),
    );

    const result = await runner.run(m, makeTask(), '/proj');
    expect(result.kind).toBe('completed');

    const incrementCall = ms.applied.find(
      (m) => m.incremented.includes('recut_count') && m.incremented.includes('stage_count'),
    );
    expect(incrementCall).toBeDefined();
    expect(incrementCall!.preserved).toEqual(['user_signed_off']);
  });

  test('edges without counter declarations do NOT call applyCounterMutations', async () => {
    const stages = [makeStage('s1')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 'end', { kind: 'always' }),
    ];
    const ms = new MockMetaStore();
    const runner = new MethodologyRunner(
      new ScriptedStageRunner() as unknown as StageRunner,
      ms,
      new MockTraceLogger(),
    );
    await runner.run(makeMethodology(stages, edges), makeTask(), '/proj');
    expect(ms.applied).toEqual([]);
  });
});

describe('MethodologyRunner — failure propagation', () => {
  test('StageRunner failed → TaskRunResult.failed with reason and task_failed event', async () => {
    const stages = [makeStage('s1')];
    const edges = [makeEdge('start', 's1', { kind: 'always' })];
    const m = makeMethodology(stages, edges);

    const sr = new ScriptedStageRunner({
      s1: { kind: 'failed', reason: 'boom' },
    });
    const tl = new MockTraceLogger();
    const runner = new MethodologyRunner(
      sr as unknown as StageRunner,
      new MockMetaStore(),
      tl,
    );

    const result = await runner.run(m, makeTask(), '/proj');
    expect(result).toEqual({ kind: 'failed', reason: 'boom' });

    const failedEvent = tl.events.find((e) => e.kind === 'task_failed');
    expect(failedEvent).toMatchObject({ reason: 'boom', stageId: 's1' });
  });

  test('unknown stage id fails fast', async () => {
    // meta says we're resuming at 'ghost' which isn't in the methodology.
    const stages = [makeStage('s1')];
    const edges = [makeEdge('start', 's1', { kind: 'always' })];
    const m = makeMethodology(stages, edges);
    const ms = new MockMetaStore({ current_stage: 'ghost' });
    const runner = new MethodologyRunner(
      new ScriptedStageRunner() as unknown as StageRunner,
      ms,
      new MockTraceLogger(),
    );
    const result = await runner.run(m, makeTask(), '/proj');
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.reason).toContain('unknown stage');
    }
  });
});

describe('MethodologyRunner — resume from meta.current_stage', () => {
  test('starts from meta.current_stage when present, not from start edge', async () => {
    const stages = [makeStage('s1'), makeStage('s2'), makeStage('s3')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 's2', { kind: 'gate-pass' }),
      makeEdge('s2', 's3', { kind: 'gate-pass' }),
      makeEdge('s3', 'end', { kind: 'always' }),
    ];
    const sr = new ScriptedStageRunner();
    const ms = new MockMetaStore({ current_stage: 's2' });
    const runner = new MethodologyRunner(
      sr as unknown as StageRunner,
      ms,
      new MockTraceLogger(),
    );

    const result = await runner.run(
      makeMethodology(stages, edges),
      makeTask(),
      '/proj',
    );
    expect(result.kind).toBe('completed');
    expect(sr.calls).toEqual(['s2', 's3']);
  });

  test('current_stage already "end" → completes immediately without running stages', async () => {
    const stages = [makeStage('s1')];
    const edges = [makeEdge('start', 's1', { kind: 'always' })];
    const sr = new ScriptedStageRunner();
    const ms = new MockMetaStore({ current_stage: 'end' });
    const runner = new MethodologyRunner(
      sr as unknown as StageRunner,
      ms,
      new MockTraceLogger(),
    );
    const result = await runner.run(
      makeMethodology(stages, edges),
      makeTask(),
      '/proj',
    );
    expect(result.kind).toBe('completed');
    expect(sr.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Plan 8-fix Task 2 — event emission + cooperative pause/cancel
// ---------------------------------------------------------------------------

describe('MethodologyRunner — event emission', () => {
  test('emits stage_entered (forwarded from StageRunner via onEvent)', async () => {
    const stages = [makeStage('s1'), makeStage('s2')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 's2', { kind: 'gate-pass' }),
      makeEdge('s2', 'end', { kind: 'always' }),
    ];
    const m = makeMethodology(stages, edges);
    // Mock that mimics real StageRunner — invokes onEvent for stage_entered + gate_evaluated.
    class EmittingStageRunner {
      readonly calls: string[] = [];
      async runStage(
        stage: Stage,
        _m: Methodology,
        _t: Task,
        _p: string,
        onEvent?: (e: TraceEvent) => void,
      ): Promise<StageResult> {
        this.calls.push(stage.id);
        onEvent?.({ kind: 'stage_entered', stageId: stage.id, ts: '2026-05-13T00:00:00.000Z' });
        onEvent?.({
          kind: 'gate_evaluated',
          stageId: stage.id,
          turn: 1,
          evaluation: { kind: 'pass', items: [] },
        });
        return { kind: 'completed', stageId: stage.id, turns: 1 };
      }
    }
    const sr = new EmittingStageRunner();
    const ms = new MockMetaStore();
    const runner = new MethodologyRunner(sr as unknown as StageRunner, ms, new MockTraceLogger());

    const observed: TraceEvent[] = [];
    runner.on('event', (e: TraceEvent) => observed.push(e));

    const result = await runner.run(m, makeTask(), '/proj');
    expect(result.kind).toBe('completed');

    const observedKinds = observed.map((e) => e.kind);
    // task_started, [s1 stage_entered, gate_evaluated], edge, [s2 stage_entered, gate_evaluated], edge, task_completed
    expect(observedKinds.filter((k) => k === 'stage_entered').length).toBe(2);
    expect(observedKinds.filter((k) => k === 'gate_evaluated').length).toBe(2);
    expect(observedKinds[0]).toBe('task_started');
    expect(observedKinds[observedKinds.length - 1]).toBe('task_completed');
  });

  test('emits task_started and task_completed on EventEmitter', async () => {
    const stages = [makeStage('s1')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 'end', { kind: 'always' }),
    ];
    const m = makeMethodology(stages, edges);
    const runner = new MethodologyRunner(
      new ScriptedStageRunner() as unknown as StageRunner,
      new MockMetaStore(),
      new MockTraceLogger(),
    );
    const observed: TraceEvent[] = [];
    runner.on('event', (e: TraceEvent) => observed.push(e));

    await runner.run(m, makeTask(), '/proj');
    const obsKinds = observed.map((e) => e.kind);
    expect(obsKinds).toContain('task_started');
    expect(obsKinds).toContain('task_completed');
    expect(obsKinds).toContain('edge_traversed');
  });

  test('events fire in correct order across a multi-stage run', async () => {
    const stages = [makeStage('s1'), makeStage('s2')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 's2', { kind: 'gate-pass' }),
      makeEdge('s2', 'end', { kind: 'always' }),
    ];
    const m = makeMethodology(stages, edges);
    const runner = new MethodologyRunner(
      new ScriptedStageRunner() as unknown as StageRunner,
      new MockMetaStore(),
      new MockTraceLogger(),
    );
    const observed: TraceEvent[] = [];
    runner.on('event', (e: TraceEvent) => observed.push(e));

    await runner.run(m, makeTask(), '/proj');
    const obsKinds = observed.map((e) => e.kind);
    // Order: task_started → edge_traversed (start→s1 happens lazily on advance) → ...
    // Concretely: task_started first, task_completed last.
    expect(obsKinds[0]).toBe('task_started');
    expect(obsKinds[obsKinds.length - 1]).toBe('task_completed');
    // Two edge_traversed (s1→s2, s2→end). The start→s1 transition uses
    // firstStageId() which doesn't emit edge_traversed.
    expect(obsKinds.filter((k) => k === 'edge_traversed').length).toBe(2);
  });
});

describe('MethodologyRunner — cooperative pause', () => {
  test('emits task_paused after requestPause(); returns {kind: "paused"}', async () => {
    const stages = [makeStage('s1'), makeStage('s2')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 's2', { kind: 'gate-pass' }),
      makeEdge('s2', 'end', { kind: 'always' }),
    ];
    const m = makeMethodology(stages, edges);

    // StageRunner asks the runner to pause as soon as s1 finishes.
    let runnerRef: MethodologyRunner | undefined;
    class PausingStageRunner {
      readonly calls: string[] = [];
      async runStage(stage: Stage): Promise<StageResult> {
        this.calls.push(stage.id);
        if (stage.id === 's1') {
          runnerRef!.requestPause();
        }
        return { kind: 'completed', stageId: stage.id, turns: 1 };
      }
    }
    const sr = new PausingStageRunner();
    const ms = new MockMetaStore();
    const tl = new MockTraceLogger();
    const runner = new MethodologyRunner(sr as unknown as StageRunner, ms, tl);
    runnerRef = runner;

    const observed: TraceEvent[] = [];
    runner.on('event', (e: TraceEvent) => observed.push(e));

    const result = await runner.run(m, makeTask(), '/proj');
    expect(result).toEqual({ kind: 'paused' });
    // s1 ran, but s2 did NOT (paused at the next stage boundary).
    expect(sr.calls).toEqual(['s1']);

    expect(observed.map((e) => e.kind)).toContain('task_paused');
    expect(kinds(tl.events)).toContain('task_paused');
    // markPaused was invoked on the meta store.
    const pausedCall = ms.calls.find((c) => c.fn === 'markPaused');
    expect(pausedCall).toBeDefined();
    expect(pausedCall!.args).toEqual(['/proj', 't1']);
  });

  test('pause request before any stage runs → no stages execute, paused immediately', async () => {
    const stages = [makeStage('s1')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 'end', { kind: 'always' }),
    ];
    const m = makeMethodology(stages, edges);
    const sr = new ScriptedStageRunner();
    const runner = new MethodologyRunner(
      sr as unknown as StageRunner,
      new MockMetaStore(),
      new MockTraceLogger(),
    );
    runner.requestPause();
    const result = await runner.run(m, makeTask(), '/proj');
    expect(result).toEqual({ kind: 'paused' });
    expect(sr.calls).toEqual([]);
  });
});

describe('MethodologyRunner — cooperative cancel', () => {
  test('requestCancel mid-run → next stage boundary fails with reason="cancelled"', async () => {
    const stages = [makeStage('s1'), makeStage('s2')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 's2', { kind: 'gate-pass' }),
      makeEdge('s2', 'end', { kind: 'always' }),
    ];
    const m = makeMethodology(stages, edges);

    let runnerRef: MethodologyRunner | undefined;
    class CancellingStageRunner {
      readonly calls: string[] = [];
      async runStage(stage: Stage): Promise<StageResult> {
        this.calls.push(stage.id);
        if (stage.id === 's1') {
          runnerRef!.requestCancel();
        }
        return { kind: 'completed', stageId: stage.id, turns: 1 };
      }
    }
    const sr = new CancellingStageRunner();
    const tl = new MockTraceLogger();
    const runner = new MethodologyRunner(
      sr as unknown as StageRunner,
      new MockMetaStore(),
      tl,
    );
    runnerRef = runner;

    const observed: TraceEvent[] = [];
    runner.on('event', (e: TraceEvent) => observed.push(e));

    const result = await runner.run(m, makeTask(), '/proj');
    expect(result).toEqual({ kind: 'failed', reason: 'cancelled' });
    expect(sr.calls).toEqual(['s1']);
    const failedEvent = observed.find((e) => e.kind === 'task_failed');
    expect(failedEvent).toMatchObject({ reason: 'cancelled' });
  });

  test('cancel takes precedence over pause when both are requested', async () => {
    const stages = [makeStage('s1')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 'end', { kind: 'always' }),
    ];
    const m = makeMethodology(stages, edges);
    const sr = new ScriptedStageRunner();
    const runner = new MethodologyRunner(
      sr as unknown as StageRunner,
      new MockMetaStore(),
      new MockTraceLogger(),
    );
    runner.requestPause();
    runner.requestCancel();
    const result = await runner.run(m, makeTask(), '/proj');
    expect(result).toEqual({ kind: 'failed', reason: 'cancelled' });
    expect(sr.calls).toEqual([]);
  });

  test('runner instance is reusable: flags reset between run() invocations', async () => {
    const stages = [makeStage('s1')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      makeEdge('s1', 'end', { kind: 'always' }),
    ];
    const m = makeMethodology(stages, edges);
    const sr = new ScriptedStageRunner();
    const runner = new MethodologyRunner(
      sr as unknown as StageRunner,
      new MockMetaStore(),
      new MockTraceLogger(),
    );
    runner.requestCancel();
    const r1 = await runner.run(m, makeTask(), '/proj');
    expect(r1.kind).toBe('failed');

    // Second run starts clean — no stale cancel.
    const r2 = await runner.run(m, makeTask(), '/proj');
    expect(r2.kind).toBe('completed');
  });
});

describe('MethodologyRunner — terminal cases', () => {
  test('no outgoing edges → currentStage becomes end → task_completed', async () => {
    const stages = [makeStage('only')];
    // No edge out of 'only'.
    const edges = [makeEdge('start', 'only', { kind: 'always' })];
    const tl = new MockTraceLogger();
    const runner = new MethodologyRunner(
      new ScriptedStageRunner() as unknown as StageRunner,
      new MockMetaStore(),
      tl,
    );
    const result = await runner.run(
      makeMethodology(stages, edges),
      makeTask(),
      '/proj',
    );
    expect(result.kind).toBe('completed');
    expect(kinds(tl.events)).toContain('task_completed');
  });

  test('recut/gate-fail/rollback outgoing edges are not picked as next-stage', async () => {
    const stages = [makeStage('s1')];
    const edges = [
      makeEdge('start', 's1', { kind: 'always' }),
      // These three should be ignored when picking next; runner ends.
      makeEdge('s1', 's1', { kind: 'recut' }),
      makeEdge('s1', 's1', { kind: 'gate-fail' }),
      makeEdge('s1', 's1', { kind: 'rollback' }),
    ];
    const sr = new ScriptedStageRunner();
    const runner = new MethodologyRunner(
      sr as unknown as StageRunner,
      new MockMetaStore(),
      new MockTraceLogger(),
    );
    const result = await runner.run(
      makeMethodology(stages, edges),
      makeTask(),
      '/proj',
    );
    expect(result.kind).toBe('completed');
    // s1 executed once, then runner ended (no valid forward edge).
    expect(sr.calls).toEqual(['s1']);
  });
});
