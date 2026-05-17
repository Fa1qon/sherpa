// Plan 8 Task 13 — StageRunner tests.
// Mock AgentPort + GateEvaluator drive the full state machine through every
// terminal outcome (completed / failed / rollback) and every loop branch.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  StageRunner,
  MAX_TURNS_PER_STAGE,
  type TraceEvent,
  type TraceLogger,
  type ArtifactStore,
} from '../../../src/main/services/stage_runner';
import { SystemPromptAssembler, type AssembledPrompt } from '../../../src/main/services/system_prompt_assembler';
import {
  GateEvaluator,
  type GateEvaluation,
  type MetaMdStore,
  type FileSystemPort,
  type ReviewerOutcomeStore,
} from '../../../src/main/services/gate_evaluator';
import type {
  Methodology,
  Stage,
  Gate,
  GateItem,
  PreflightCheck,
} from '../../../src/core/domain/methodology';
import type { Task } from '../../../src/core/domain/task';
import type { AgentPort, AgentSession } from '../../../src/core/ports/agent_port';
import type { AgentSessionConfig, AgentMessage } from '../../../src/core/domain/agent';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockTraceLogger implements TraceLogger {
  readonly events: TraceEvent[] = [];
  async event(e: TraceEvent): Promise<void> {
    this.events.push(e);
  }
}

class MockArtifactStore implements ArtifactStore {}

class MockSession implements AgentSession {
  readonly id = { value: 'sess-1' };
  readonly sent: string[] = [];
  closed = false;
  constructor(private readonly onTurn?: () => void) {}
  async send(text: string): Promise<void> {
    this.sent.push(text);
  }
  onMessage(_cb: (m: AgentMessage) => void): () => void {
    return () => {};
  }
  async awaitTurn(): Promise<void> {
    this.onTurn?.();
  }
  async close(): Promise<void> {
    this.closed = true;
  }
}

class MockAdapter implements AgentPort {
  readonly providerId = 'mock';
  readonly sessions: MockSession[] = [];
  lastConfig?: AgentSessionConfig;
  constructor(private readonly onTurn?: () => void) {}
  async startSession(config: AgentSessionConfig): Promise<AgentSession> {
    this.lastConfig = config;
    const s = new MockSession(this.onTurn);
    this.sessions.push(s);
    return s;
  }
  async health() {
    return { ok: true as const };
  }
}

// Build a GateEvaluator that returns canned verdicts in order.
function gateEvaluatorReturning(...sequence: readonly GateEvaluation[]): GateEvaluator {
  const queue = [...sequence];
  const ev = new GateEvaluator(
    { async listFilesRecursive() { return []; } } satisfies FileSystemPort,
    { async load() { return {}; } } satisfies MetaMdStore,
    { async getPassedReviewers() { return []; } } satisfies ReviewerOutcomeStore,
  );
  // Stub the public method directly.
  vi.spyOn(ev, 'evaluate').mockImplementation(async () => {
    if (queue.length === 0) return { kind: 'no_gate' };
    return queue.shift()!;
  });
  return ev;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    methodologyId: 'm1',
    stageId: 's1',
    status: 'created',
    thread: [],
    config: { autonomy: 'interactive', urgency: 'normal', importance: 'normal' },
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    totalTokens: { input: 0, output: 0 },
    ...overrides,
  };
}

function makeStage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: 's1',
    name: 'Stage 1',
    mode: 'gate',
    contract: { input: [], output: { path: 'out.md' } },
    ...overrides,
  };
}

function makeMethodology(stages: readonly Stage[] = [makeStage()]): Methodology {
  return {
    id: 'm1',
    version: '1.0.0',
    name: 'Mock',
    description: '',
    stages,
    edges: [],
  };
}

function makeRunner(opts: {
  evaluator: GateEvaluator;
  adapter?: AgentPort;
  trace?: MockTraceLogger;
  assembler?: SystemPromptAssembler;
}): {
  runner: StageRunner;
  trace: MockTraceLogger;
  adapter: AgentPort;
  assembler: SystemPromptAssembler;
} {
  const trace = opts.trace ?? new MockTraceLogger();
  const adapter = opts.adapter ?? new MockAdapter();
  const assembler = opts.assembler ?? new SystemPromptAssembler();
  const metaStore: MetaMdStore = { async load() { return {}; } };
  const artifactStore = new MockArtifactStore();
  const runner = new StageRunner(assembler, adapter, opts.evaluator, trace, metaStore, artifactStore);
  return { runner, trace, adapter, assembler };
}

const TMP = path.join(os.tmpdir(), 'sherpa-stage-runner-tests');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StageRunner', () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await fsp.mkdtemp(TMP + '-');
  });

  afterEach(async () => {
    await fsp.rm(projectPath, { recursive: true, force: true });
  });

  test('happy path: stage completes after 1 turn when gate passes', async () => {
    const ev = gateEvaluatorReturning({ kind: 'pass', items: [] });
    const { runner, trace, adapter } = makeRunner({ evaluator: ev });
    const stage = makeStage();
    const result = await runner.runStage(stage, makeMethodology([stage]), makeTask(), projectPath);

    expect(result.kind).toBe('completed');
    if (result.kind === 'completed') {
      expect(result.stageId).toBe('s1');
      expect(result.turns).toBe(1);
    }
    // Adapter saw exactly one session and one send.
    const mock = adapter as MockAdapter;
    expect(mock.sessions.length).toBe(1);
    expect(mock.sessions[0]!.sent).toEqual([`Begin stage s1.`]);
    expect(mock.sessions[0]!.closed).toBe(true);
    // Trace contains stage_entered, gate_evaluated, stage_completed.
    expect(trace.events.map((e) => e.kind)).toContain('stage_entered');
    expect(trace.events.map((e) => e.kind)).toContain('gate_evaluated');
    expect(trace.events.map((e) => e.kind)).toContain('stage_completed');
  });

  test('no_gate evaluation also yields completed', async () => {
    const ev = gateEvaluatorReturning({ kind: 'no_gate' });
    const { runner } = makeRunner({ evaluator: ev });
    const stage = makeStage();
    const result = await runner.runStage(stage, makeMethodology([stage]), makeTask(), projectPath);
    expect(result.kind).toBe('completed');
  });

  test('hard_stop fail → failed with reason', async () => {
    const gate: Gate = {
      kind: 'standard',
      items: [
        { id: 'a', label: 'a', kind: 'artifact_written', hard_stop: true },
      ] satisfies readonly GateItem[],
    };
    const ev = gateEvaluatorReturning({
      kind: 'block',
      blocking_count: 1,
      items: [{ id: 'a', verdict: 'fail', reason: 'missing' }],
    });
    const stage = makeStage({ gate });
    const { runner, trace, adapter } = makeRunner({ evaluator: ev });
    const result = await runner.runStage(stage, makeMethodology([stage]), makeTask(), projectPath);
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.reason).toMatch(/hard_stop fail.*a/);
    }
    // Session closed.
    expect((adapter as MockAdapter).sessions[0]!.closed).toBe(true);
    expect(trace.events.map((e) => e.kind)).toContain('stage_failed');
  });

  test('gate keeps blocking with non-hard-stop → loop hits MAX_TURNS → failed', async () => {
    const gate: Gate = {
      kind: 'standard',
      items: [{ id: 'a', label: 'a', kind: 'artifact_written' }],
    };
    // Always blocking, ask verdict, no hard_stop → continue forever.
    const queue: GateEvaluation[] = Array.from({ length: MAX_TURNS_PER_STAGE + 2 }, () => ({
      kind: 'block' as const,
      blocking_count: 1,
      items: [{ id: 'a', verdict: 'ask' as const, reason: 'waiting' }],
    }));
    const ev = gateEvaluatorReturning(...queue);
    const stage = makeStage({ gate });
    const { runner, adapter, trace } = makeRunner({
      evaluator: ev,
    });
    const result = await runner.runStage(stage, makeMethodology([stage]), makeTask({ strictness_mode: 'autonomous' }), projectPath);
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') expect(result.reason).toBe('max turns exceeded');
    // Confirmed loop ran MAX_TURNS times.
    expect((adapter as MockAdapter).sessions[0]!.sent.length).toBe(MAX_TURNS_PER_STAGE);
    expect(trace.events.filter((e) => e.kind === 'gate_evaluated').length).toBe(MAX_TURNS_PER_STAGE);
  });

  test('preflight fail with on_fail=rollback → rollback to upstream', async () => {
    // Pre-create the upstream artifact, but with content that fails the section check.
    const upstreamRel = 'docs/plan.md';
    const abs = path.join(projectPath, upstreamRel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, '# title\n\nno sections here\n', 'utf8');
    const preflight: PreflightCheck = {
      id: 'pf-plan',
      input_artifact: { stage: 'upstream', artifact: upstreamRel },
      must_have_sections: ['Acceptance'],
      on_fail: 'rollback',
    };
    const stage = makeStage({ preflight: [preflight] });
    const ev = gateEvaluatorReturning(); // never used
    const { runner, trace, adapter } = makeRunner({ evaluator: ev });
    const result = await runner.runStage(stage, makeMethodology([stage]), makeTask(), projectPath);
    expect(result.kind).toBe('rollback');
    if (result.kind === 'rollback') expect(result.toStage).toBe('upstream');
    // No agent session opened.
    expect((adapter as MockAdapter).sessions.length).toBe(0);
    expect(trace.events.map((e) => e.kind)).toContain('preflight_failed');
  });

  test('preflight fail with on_fail=fail → failed', async () => {
    const preflight: PreflightCheck = {
      id: 'pf-missing',
      input_artifact: { stage: 'upstream', artifact: 'never-existed.md' },
      must_have_sections: ['x'],
      on_fail: 'fail',
    };
    const stage = makeStage({ preflight: [preflight] });
    const ev = gateEvaluatorReturning();
    const { runner } = makeRunner({ evaluator: ev });
    const result = await runner.runStage(stage, makeMethodology([stage]), makeTask(), projectPath);
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') expect(result.reason).toMatch(/pf-missing/);
  });

  test('preflight on_fail=ask is treated as rollback (with deferred trace event)', async () => {
    const preflight: PreflightCheck = {
      id: 'pf-ask',
      input_artifact: { stage: 'upstream', artifact: 'never-existed.md' },
      must_have_sections: ['x'],
      on_fail: 'ask',
    };
    const stage = makeStage({ preflight: [preflight] });
    const ev = gateEvaluatorReturning();
    const { runner, trace } = makeRunner({ evaluator: ev });
    const result = await runner.runStage(stage, makeMethodology([stage]), makeTask(), projectPath);
    expect(result.kind).toBe('rollback');
    if (result.kind === 'rollback') expect(result.toStage).toBe('upstream');
    expect(trace.events.map((e) => e.kind)).toContain('preflight_ask_deferred_as_rollback');
  });

  test('preflight passes when section is present', async () => {
    const rel = 'plan.md';
    await fsp.writeFile(path.join(projectPath, rel), '# Plan\n\n## Acceptance\n\nOK\n', 'utf8');
    const preflight: PreflightCheck = {
      id: 'pf',
      input_artifact: { stage: 'upstream', artifact: rel },
      must_have_sections: ['Acceptance'],
      on_fail: 'fail',
    };
    const stage = makeStage({ preflight: [preflight] });
    const ev = gateEvaluatorReturning({ kind: 'pass', items: [] });
    const { runner } = makeRunner({ evaluator: ev });
    const result = await runner.runStage(stage, makeMethodology([stage]), makeTask(), projectPath);
    expect(result.kind).toBe('completed');
  });

  test('preflight must_match_pattern enforced', async () => {
    const rel = 'plan.md';
    await fsp.writeFile(path.join(projectPath, rel), 'no token here', 'utf8');
    const preflight: PreflightCheck = {
      id: 'pf-regex',
      input_artifact: { stage: 'upstream', artifact: rel },
      must_match_pattern: 'REQUIRED_TOKEN',
      on_fail: 'fail',
    };
    const stage = makeStage({ preflight: [preflight] });
    const ev = gateEvaluatorReturning();
    const { runner } = makeRunner({ evaluator: ev });
    const result = await runner.runStage(stage, makeMethodology([stage]), makeTask(), projectPath);
    expect(result.kind).toBe('failed');
  });

  test('missing input artifact in contract.input is tolerated (assembler gets empty map)', async () => {
    const stage = makeStage({
      contract: { input: [{ stage: 'upstream', artifact: 'missing.md' }], output: { path: 'out.md' } },
    });
    const ev = gateEvaluatorReturning({ kind: 'pass', items: [] });
    const assembler = new SystemPromptAssembler();
    const spy = vi.spyOn(assembler, 'assemble');
    const { runner } = makeRunner({ evaluator: ev, assembler });
    const result = await runner.runStage(stage, makeMethodology([stage]), makeTask(), projectPath);
    expect(result.kind).toBe('completed');
    expect(spy).toHaveBeenCalledOnce();
    const ctx = spy.mock.calls[0]![0]!;
    expect(ctx.inputArtifacts.size).toBe(0);
  });

  test('assembler is called with full context (methodology/stage/task/projectPath)', async () => {
    const ev = gateEvaluatorReturning({ kind: 'pass', items: [] });
    const assembler = new SystemPromptAssembler();
    const spy = vi.spyOn(assembler, 'assemble').mockResolvedValue({
      systemPrompt: 'ASSEMBLED',
    } satisfies AssembledPrompt);
    const stage = makeStage();
    const methodology = makeMethodology([stage]);
    const task = makeTask();
    const { runner, adapter } = makeRunner({ evaluator: ev, assembler });
    await runner.runStage(stage, methodology, task, projectPath);
    expect(spy).toHaveBeenCalledOnce();
    const ctx = spy.mock.calls[0]![0]!;
    expect(ctx.methodology).toBe(methodology);
    expect(ctx.stage).toBe(stage);
    expect(ctx.task).toBe(task);
    expect(ctx.projectPath).toBe(projectPath);
    // Session got the assembled prompt.
    expect((adapter as MockAdapter).lastConfig?.systemPrompt).toBe('ASSEMBLED');
    expect((adapter as MockAdapter).lastConfig?.cwd).toBe(projectPath);
    expect((adapter as MockAdapter).lastConfig?.mode).toBe('worker');
  });

  test('strictness=autonomous treats ask verdicts as continuable; passes on second turn', async () => {
    const gate: Gate = {
      kind: 'standard',
      items: [{ id: 'a', label: 'a', kind: 'artifact_written' }],
    };
    const ev = gateEvaluatorReturning(
      { kind: 'block', blocking_count: 0, items: [{ id: 'a', verdict: 'ask', reason: 'pending' }] },
      { kind: 'pass', items: [{ id: 'a', verdict: 'pass', reason: 'ok' }] },
    );
    const stage = makeStage({ gate });
    const { runner, adapter } = makeRunner({ evaluator: ev });
    const result = await runner.runStage(stage, makeMethodology([stage]), makeTask({ strictness_mode: 'autonomous' }), projectPath);
    expect(result.kind).toBe('completed');
    if (result.kind === 'completed') expect(result.turns).toBe(2);
    expect((adapter as MockAdapter).sessions[0]!.sent.length).toBe(2);
  });

  test('strictness=standard with non-hard-stop ask also continues (Task 19 will route to user UI)', async () => {
    const gate: Gate = {
      kind: 'standard',
      items: [{ id: 'a', label: 'a', kind: 'artifact_written' }],
    };
    const ev = gateEvaluatorReturning(
      { kind: 'block', blocking_count: 0, items: [{ id: 'a', verdict: 'ask', reason: 'pending' }] },
      { kind: 'pass', items: [{ id: 'a', verdict: 'pass', reason: 'ok' }] },
    );
    const stage = makeStage({ gate });
    const { runner } = makeRunner({ evaluator: ev });
    const result = await runner.runStage(stage, makeMethodology([stage]), makeTask({ strictness_mode: 'standard' }), projectPath);
    expect(result.kind).toBe('completed');
  });

  test('initial prompt uses user_view_template when set', async () => {
    const ev = gateEvaluatorReturning({ kind: 'pass', items: [] });
    const stage = makeStage({ user_view_template: 'Start the elaborate stage prompt.' });
    const { runner, adapter } = makeRunner({ evaluator: ev });
    await runner.runStage(stage, makeMethodology([stage]), makeTask(), projectPath);
    expect((adapter as MockAdapter).sessions[0]!.sent[0]).toBe('Start the elaborate stage prompt.');
  });

  test('continue prompt summarises blocking items after first turn', async () => {
    const gate: Gate = {
      kind: 'standard',
      items: [{ id: 'a', label: 'a', kind: 'artifact_written' }],
    };
    const ev = gateEvaluatorReturning(
      { kind: 'block', blocking_count: 0, items: [{ id: 'a', verdict: 'ask', reason: 'awaiting plan.md' }] },
      { kind: 'pass', items: [] },
    );
    const stage = makeStage({ gate });
    const { runner, adapter } = makeRunner({ evaluator: ev });
    await runner.runStage(stage, makeMethodology([stage]), makeTask({ strictness_mode: 'autonomous' }), projectPath);
    const sent = (adapter as MockAdapter).sessions[0]!.sent;
    expect(sent[0]).toBe('Begin stage s1.');
    expect(sent[1]).toMatch(/not yet satisfied/);
    expect(sent[1]).toMatch(/awaiting plan\.md/);
  });

  test('trace event ordering: stage_entered → gate_evaluated → stage_completed', async () => {
    const ev = gateEvaluatorReturning({ kind: 'pass', items: [] });
    const stage = makeStage();
    const { runner, trace } = makeRunner({ evaluator: ev });
    await runner.runStage(stage, makeMethodology([stage]), makeTask(), projectPath);
    const order = trace.events.map((e) => e.kind);
    const ent = order.indexOf('stage_entered');
    const gat = order.indexOf('gate_evaluated');
    const done = order.indexOf('stage_completed');
    expect(ent).toBeGreaterThanOrEqual(0);
    expect(gat).toBeGreaterThan(ent);
    expect(done).toBeGreaterThan(gat);
  });

  // ------------------------------------------------------------------------
  // Plan 8-fix Task 2 — onEvent callback forwarding
  // ------------------------------------------------------------------------
  // tool_call / artifact_written forwarding via onEvent will land when
  // StageRunner is wired to ArtifactStore + adapter tool stream (Plan 8a).
  // For now we verify forwarding for events that StageRunner DOES emit.

  test('onEvent receives stage_entered + gate_evaluated + stage_completed (forwarded)', async () => {
    const ev = gateEvaluatorReturning({ kind: 'pass', items: [] });
    const stage = makeStage();
    const { runner, trace } = makeRunner({ evaluator: ev });
    const observed: TraceEvent[] = [];
    const result = await runner.runStage(
      stage,
      makeMethodology([stage]),
      makeTask(),
      projectPath,
      (e) => observed.push(e),
    );
    expect(result.kind).toBe('completed');
    const obsKinds = observed.map((e) => e.kind);
    expect(obsKinds).toContain('stage_entered');
    expect(obsKinds).toContain('gate_evaluated');
    expect(obsKinds).toContain('stage_completed');
    // Same events also went to the trace log.
    expect(trace.events.map((e) => e.kind)).toEqual(obsKinds);
  });

  test('onEvent forwards stage_failed on hard_stop fail', async () => {
    const gate: Gate = {
      kind: 'standard',
      items: [{ id: 'a', label: 'a', kind: 'artifact_written', hard_stop: true }],
    };
    const ev = gateEvaluatorReturning({
      kind: 'block',
      blocking_count: 1,
      items: [{ id: 'a', verdict: 'fail', reason: 'missing' }],
    });
    const stage = makeStage({ gate });
    const { runner } = makeRunner({ evaluator: ev });
    const observed: TraceEvent[] = [];
    const result = await runner.runStage(
      stage,
      makeMethodology([stage]),
      makeTask(),
      projectPath,
      (e) => observed.push(e),
    );
    expect(result.kind).toBe('failed');
    expect(observed.map((e) => e.kind)).toContain('stage_failed');
  });

  test('onEvent forwards preflight_failed on rollback', async () => {
    const preflight: PreflightCheck = {
      id: 'pf-rb',
      input_artifact: { stage: 'upstream', artifact: 'never-existed.md' },
      must_have_sections: ['x'],
      on_fail: 'rollback',
    };
    const stage = makeStage({ preflight: [preflight] });
    const ev = gateEvaluatorReturning();
    const { runner } = makeRunner({ evaluator: ev });
    const observed: TraceEvent[] = [];
    const result = await runner.runStage(
      stage,
      makeMethodology([stage]),
      makeTask(),
      projectPath,
      (e) => observed.push(e),
    );
    expect(result.kind).toBe('rollback');
    expect(observed.map((e) => e.kind)).toContain('preflight_failed');
  });

  test('runStage works without onEvent (backward-compatible)', async () => {
    const ev = gateEvaluatorReturning({ kind: 'pass', items: [] });
    const stage = makeStage();
    const { runner } = makeRunner({ evaluator: ev });
    const result = await runner.runStage(stage, makeMethodology([stage]), makeTask(), projectPath);
    expect(result.kind).toBe('completed');
  });

  test('session is closed even when gate yields immediate failure', async () => {
    const gate: Gate = {
      kind: 'standard',
      items: [{ id: 'a', label: 'a', kind: 'artifact_written', hard_stop: true }],
    };
    const ev = gateEvaluatorReturning({
      kind: 'block',
      blocking_count: 1,
      items: [{ id: 'a', verdict: 'fail', reason: 'missing' }],
    });
    const stage = makeStage({ gate });
    const { runner, adapter } = makeRunner({ evaluator: ev });
    await runner.runStage(stage, makeMethodology([stage]), makeTask(), projectPath);
    expect((adapter as MockAdapter).sessions[0]!.closed).toBe(true);
  });
});
