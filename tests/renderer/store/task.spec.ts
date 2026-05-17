import { describe, test, expect, beforeEach, vi } from 'vitest';
import { useTask, applyEngineEventToRuntime } from '../../../src/renderer/store/task';
import type {
  Task,
  TaskEventPayload,
  EngineTraceEventLike,
  GateEvaluationLike,
} from '../../../src/core/domain/task';
import type { AgentMessage } from '../../../src/core/domain/agent';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    methodologyId: 'm',
    stageId: 's',
    status: 'created',
    thread: [],
    config: { autonomy: 'interactive', urgency: 'normal', importance: 'normal' },
    createdAt: '2026-05-12T00:00:00Z',
    updatedAt: '2026-05-12T00:00:00Z',
    totalTokens: { input: 0, output: 0 },
    ...overrides,
  };
}

function makeMessage(role: AgentMessage['role'], text: string): AgentMessage {
  return { id: `msg-${Math.random()}`, role, text, timestamp: '2026-05-12T00:00:00Z' };
}

// Controllable mock state — reset per test.
let emit: (payload: TaskEventPayload) => void = () => {};
let unsubscribeMock: ReturnType<typeof vi.fn>;
let onEventMock: ReturnType<typeof vi.fn>;
let startTurnMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  emit = () => {};
  unsubscribeMock = vi.fn();
  onEventMock = vi.fn().mockImplementation((handler: (p: TaskEventPayload) => void) => {
    emit = handler;
    return unsubscribeMock;
  });
  startTurnMock = vi.fn().mockResolvedValue({ ok: true });

  useTask.setState({
    current: null,
    sending: false,
    error: null,
    running: { toolUses: 0, elapsedSec: 0, estTokens: 0, linesWritten: 0, lastToolName: null },
    runtime: {
      currentStageId: null,
      completedStages: [],
      rolledBackFrom: {},
      gateVerdicts: {},
      artifacts: [],
      status: 'inactive',
    },
  });

  (window as { sherpa?: unknown }).sherpa = {
    task: {
      startTurn: startTurnMock,
      onEvent: onEventMock,
    },
  };
});

describe('useTask', () => {
  // ── Test 1 ──────────────────────────────────────────────────────────────────
  test('setCurrent updates state and clears error', () => {
    useTask.setState({ error: 'prev' });
    useTask.getState().setCurrent(makeTask());
    expect(useTask.getState().current?.id).toBe('task-1');
    expect(useTask.getState().error).toBeNull();
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────────
  test('sendUserMessage no-ops when no current task', async () => {
    await useTask.getState().sendUserMessage('/proj', 'hi');
    expect(startTurnMock).not.toHaveBeenCalled();
    expect(onEventMock).not.toHaveBeenCalled();
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────────
  test('happy path: streams started + message + done, updates current task with totals', async () => {
    const task = makeTask();
    useTask.getState().setCurrent(task);

    const p = useTask.getState().sendUserMessage('/proj', 'hello');

    // Simulate streaming events
    const userMsg = makeMessage('user', 'hello');
    const agentMsg = makeMessage('agent', 'world');
    const updatedTask = makeTask({
      thread: [userMsg, agentMsg],
      totalTokens: { input: 5, output: 7 },
    });
    emit({ taskId: 'task-1', kind: 'started', message: userMsg });
    emit({ taskId: 'task-1', kind: 'message', message: agentMsg });
    emit({ taskId: 'task-1', kind: 'done', task: updatedTask });

    await p;

    const st = useTask.getState();
    expect(st.current).toBe(updatedTask);
    expect(st.current?.totalTokens).toEqual({ input: 5, output: 7 });
    expect(st.sending).toBe(false);
    expect(st.error).toBeNull();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────────
  test('startTurn returns ok=false: sets error, clears sending, calls unsubscribe', async () => {
    startTurnMock.mockResolvedValueOnce({ ok: false, error: 'task-not-found' });
    useTask.getState().setCurrent(makeTask());

    await useTask.getState().sendUserMessage('/proj', 'hi');

    const st = useTask.getState();
    expect(st.sending).toBe(false);
    expect(st.error).toBe('task-not-found');
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────────
  test('error event mid-stream: sets error, clears sending, calls unsubscribe', async () => {
    useTask.getState().setCurrent(makeTask());

    const p = useTask.getState().sendUserMessage('/proj', 'hi');

    emit({ taskId: 'task-1', kind: 'started', message: makeMessage('user', 'hi') });
    emit({ taskId: 'task-1', kind: 'error', message: 'agent-crashed' });

    await p;

    const st = useTask.getState();
    expect(st.sending).toBe(false);
    expect(st.error).toBe('agent-crashed');
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────────
  test('sending=true while turn is in flight (before done fires)', async () => {
    // startTurn resolves but we control whether events fire
    let resolveStart!: (v: { ok: true }) => void;
    startTurnMock.mockReturnValueOnce(
      new Promise<{ ok: true }>((r) => { resolveStart = r; }),
    );

    useTask.getState().setCurrent(makeTask());
    const p = useTask.getState().sendUserMessage('/proj', 'hi');

    // At this point startTurn hasn't resolved yet → sending must be true
    expect(useTask.getState().sending).toBe(true);

    // Resolve startTurn, then emit done
    resolveStart({ ok: true });
    emit({ taskId: 'task-1', kind: 'done', task: makeTask() });

    await p;
    expect(useTask.getState().sending).toBe(false);
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────────
  test('events for a previous task don\'t leak into a newly-switched task', async () => {
    const taskA = makeTask({ id: 'task-a' });
    const taskB = makeTask({ id: 'task-b' });

    // 1. Start streaming for taskA
    useTask.getState().setCurrent(taskA);
    const p = useTask.getState().sendUserMessage('/proj', 'hi from A');

    // 2. Switch to taskB BEFORE any events arrive
    useTask.getState().setCurrent(taskB);

    // 3. Emit a 'message' event that belongs to taskA
    emit({ taskId: 'task-a', kind: 'message', message: makeMessage('agent', 'sneaky A message') });

    // 4. Emit done so the promise resolves
    emit({ taskId: 'task-a', kind: 'done', task: makeTask({ id: 'task-a' }) });

    await p;

    const st = useTask.getState();
    expect(st.current?.id).toBe('task-b');
    expect(st.current?.thread).toHaveLength(0);
  });

  // ── Test 9 — running counters: reset on started ─────────────────────────────
  test('running counters reset on started event', async () => {
    // Seed with non-zero state to prove reset happens.
    useTask.setState({ running: { toolUses: 5, elapsedSec: 17, estTokens: 999, linesWritten: 42, lastToolName: 'Read' } });
    useTask.getState().setCurrent(makeTask());

    const p = useTask.getState().sendUserMessage('/proj', 'hi');
    emit({ taskId: 'task-1', kind: 'started', message: makeMessage('user', 'hi') });

    expect(useTask.getState().running).toEqual({ toolUses: 0, elapsedSec: 0, estTokens: 0, linesWritten: 0, lastToolName: null });

    emit({ taskId: 'task-1', kind: 'done', task: makeTask() });
    await p;
  });

  // ── Test 10 — agent text increments estTokens ───────────────────────────────
  test('agent text message increments estTokens by ceil(text.length / 4)', async () => {
    useTask.getState().setCurrent(makeTask());
    const p = useTask.getState().sendUserMessage('/proj', 'hi');

    emit({ taskId: 'task-1', kind: 'started', message: makeMessage('user', 'hi') });
    // 16 chars → ceil(16/4) = 4 tokens
    emit({ taskId: 'task-1', kind: 'message', message: makeMessage('agent', 'sixteen-chars-ok') });

    expect(useTask.getState().running.estTokens).toBe(4);
    expect(useTask.getState().running.toolUses).toBe(0);

    emit({ taskId: 'task-1', kind: 'done', task: makeTask() });
    await p;
  });

  // ── Test 11 — tool result increments toolUses + linesWritten ────────────────
  test('tool result message increments toolUses and linesWritten (Write)', async () => {
    useTask.getState().setCurrent(makeTask());
    const p = useTask.getState().sendUserMessage('/proj', 'hi');

    emit({ taskId: 'task-1', kind: 'started', message: makeMessage('user', 'hi') });
    const toolMsg: AgentMessage = {
      id: 'tool-1',
      role: 'tool',
      text: '',
      timestamp: '2026-05-12T00:00:00Z',
      toolCall: {
        name: 'Write',
        args: { file_path: 'x.ts', content: 'line1\nline2\nline3' },
        result: 'File created',
        status: 'success',
      },
    };
    emit({ taskId: 'task-1', kind: 'message', message: toolMsg });

    const r = useTask.getState().running;
    expect(r.toolUses).toBe(1);
    expect(r.linesWritten).toBe(3); // 2 newlines + 1 = 3 lines
    expect(r.estTokens).toBeGreaterThan(0); // 'File created' contributes

    emit({ taskId: 'task-1', kind: 'done', task: makeTask() });
    await p;
  });

  // ── Test 12 — pending tool call does NOT double-count ───────────────────────
  test('tool call without result does not increment toolUses', async () => {
    useTask.getState().setCurrent(makeTask());
    const p = useTask.getState().sendUserMessage('/proj', 'hi');

    emit({ taskId: 'task-1', kind: 'started', message: makeMessage('user', 'hi') });
    const pendingMsg: AgentMessage = {
      id: 'tool-pending',
      role: 'tool',
      text: '',
      timestamp: '2026-05-12T00:00:00Z',
      toolCall: { name: 'Read', args: { file_path: 'x.ts' }, status: 'pending' },
    };
    emit({ taskId: 'task-1', kind: 'message', message: pendingMsg });

    expect(useTask.getState().running.toolUses).toBe(0);

    emit({ taskId: 'task-1', kind: 'done', task: makeTask() });
    await p;
  });

  // ── Test 13 — setCurrent resets running counters ────────────────────────────
  test('setCurrent resets running counters to zero', () => {
    useTask.setState({ running: { toolUses: 9, elapsedSec: 99, estTokens: 9999, linesWritten: 9, lastToolName: 'Bash' } });
    useTask.getState().setCurrent(makeTask({ id: 'task-x' }));
    expect(useTask.getState().running).toEqual({ toolUses: 0, elapsedSec: 0, estTokens: 0, linesWritten: 0, lastToolName: null });
  });

  // ── Test 8 ──────────────────────────────────────────────────────────────────
  test('onEvent subscribed BEFORE startTurn (race-prevention)', async () => {
    const callOrder: string[] = [];

    onEventMock.mockImplementation((handler: (p: TaskEventPayload) => void) => {
      callOrder.push('onEvent');
      emit = handler;
      return unsubscribeMock;
    });
    startTurnMock.mockImplementation(async (_args: unknown) => {
      callOrder.push('startTurn');
      return { ok: true };
    });

    useTask.getState().setCurrent(makeTask());
    const p = useTask.getState().sendUserMessage('/proj', 'hi');
    emit({ taskId: 'task-1', kind: 'done', task: makeTask({ totalTokens: { input: 1, output: 1 } }) });
    await p;

    expect(callOrder.indexOf('onEvent')).toBeLessThan(callOrder.indexOf('startTurn'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Plan 8-fix Task 3 — engine runtime reducer + applyEngineEvent action
// ─────────────────────────────────────────────────────────────────────────────

const emptyRuntime = (): import('../../../src/renderer/store/task').TaskRuntime => ({
  currentStageId: null,
  completedStages: [],
  rolledBackFrom: {},
  gateVerdicts: {},
  artifacts: [],
  status: 'inactive',
});

describe('applyEngineEventToRuntime — pure reducer', () => {
  test('stage_entered sets currentStageId and status=running', () => {
    const next = applyEngineEventToRuntime(emptyRuntime(), {
      kind: 'stage_entered', stageId: 'plan', ts: 't', prompt_excerpt: '',
    });
    expect(next.currentStageId).toBe('plan');
    expect(next.status).toBe('running');
  });

  test('gate_evaluated stores evaluation under stageId', () => {
    const evaluation: GateEvaluationLike = {
      kind: 'pass',
      items: [{ id: 'a', verdict: 'pass', reason: 'ok' }],
    };
    const next = applyEngineEventToRuntime(emptyRuntime(), {
      kind: 'gate_evaluated', stageId: 'verify', evaluation, ts: 't',
    });
    expect(next.gateVerdicts['verify']).toBe(evaluation);
  });

  test('edge_traversed appends from-stage to completedStages', () => {
    const next = applyEngineEventToRuntime(emptyRuntime(), {
      kind: 'edge_traversed', from: 'req', to: 'plan', condition: 'on_pass', ts: 't',
    });
    expect(next.completedStages).toEqual(['req']);
  });

  test('edge_traversed is idempotent (no duplicate completedStages)', () => {
    const a = applyEngineEventToRuntime(emptyRuntime(), {
      kind: 'edge_traversed', from: 'req', to: 'plan', condition: 'on_pass', ts: 't',
    });
    const b = applyEngineEventToRuntime(a, {
      kind: 'edge_traversed', from: 'req', to: 'plan', condition: 'on_pass', ts: 't',
    });
    expect(b.completedStages).toEqual(['req']);
  });

  test('rollback_recorded appends from-stage under to-stage key', () => {
    const next = applyEngineEventToRuntime(emptyRuntime(), {
      kind: 'rollback_recorded', from: 'impl', to: 'plan', reason: 'scope', ts: 't',
    });
    expect(next.rolledBackFrom['plan']).toEqual(['impl']);
  });

  test('artifact_written appends to artifacts list', () => {
    const next = applyEngineEventToRuntime(emptyRuntime(), {
      kind: 'artifact_written', path: 'a.md', bytes: 42, ts: '2026-05-12T00:00:00Z',
    });
    expect(next.artifacts).toEqual([
      { path: 'a.md', bytes: 42, written_at: '2026-05-12T00:00:00Z' },
    ]);
  });

  test('task_completed sets status=completed and clears currentStageId', () => {
    const seeded = { ...emptyRuntime(), currentStageId: 'verify', status: 'running' as const };
    const next = applyEngineEventToRuntime(seeded, { kind: 'task_completed', ts: 't' });
    expect(next.status).toBe('completed');
    expect(next.currentStageId).toBeNull();
  });

  test('task_failed sets status=failed', () => {
    const next = applyEngineEventToRuntime(emptyRuntime(), {
      kind: 'task_failed', reason: 'boom', ts: 't',
    });
    expect(next.status).toBe('failed');
  });

  test('task_paused sets status=paused', () => {
    const next = applyEngineEventToRuntime(emptyRuntime(), { kind: 'task_paused', ts: 't' });
    expect(next.status).toBe('paused');
  });

  test('task_resumed sets status=running and adopts from_stage as currentStageId', () => {
    const next = applyEngineEventToRuntime(emptyRuntime(), {
      kind: 'task_resumed', from_stage: 'plan', ts: 't',
    });
    expect(next.status).toBe('running');
    expect(next.currentStageId).toBe('plan');
  });

  test('reducer is idempotent for double task_completed (supervisor + runner)', () => {
    let rt = emptyRuntime();
    rt = applyEngineEventToRuntime(rt, { kind: 'task_completed', ts: 't' });
    const after = applyEngineEventToRuntime(rt, { kind: 'task_completed', ts: 't' });
    expect(after.status).toBe('completed');
  });

  test('table-driven: every kind from the canonical schema produces no crash', () => {
    const events: readonly EngineTraceEventLike[] = [
      { kind: 'stage_entered', stageId: 's', ts: 't', prompt_excerpt: '' },
      { kind: 'gate_evaluated', stageId: 's', evaluation: { kind: 'no_gate' }, ts: 't' },
      { kind: 'edge_traversed', from: 'a', to: 'b', condition: 'on_pass', ts: 't' },
      { kind: 'rollback_recorded', from: 'a', to: 'b', reason: '', ts: 't' },
      { kind: 'artifact_written', path: 'x', bytes: 1, ts: 't' },
      { kind: 'task_completed', ts: 't' },
      { kind: 'task_failed', reason: '', ts: 't' },
      { kind: 'task_paused', ts: 't' },
      { kind: 'task_resumed', from_stage: 's', ts: 't' },
      { kind: 'unknown_future_event', anything: 1 },
    ];
    let rt = emptyRuntime();
    for (const e of events) {
      rt = applyEngineEventToRuntime(rt, e);
    }
    // Reducer is total and never throws.
    expect(rt).toBeDefined();
  });
});

describe('useTask().applyEngineEvent + setCurrent reset', () => {
  test('applyEngineEvent updates store runtime', () => {
    useTask.getState().applyEngineEvent({
      kind: 'stage_entered', stageId: 'plan', ts: 't', prompt_excerpt: '',
    });
    expect(useTask.getState().runtime.currentStageId).toBe('plan');
    expect(useTask.getState().runtime.status).toBe('running');
  });

  test('setCurrent resets runtime to defaults', () => {
    useTask.getState().applyEngineEvent({
      kind: 'stage_entered', stageId: 'plan', ts: 't', prompt_excerpt: '',
    });
    useTask.getState().setCurrent(makeTask({ id: 'task-fresh' }));
    expect(useTask.getState().runtime.currentStageId).toBeNull();
    expect(useTask.getState().runtime.status).toBe('inactive');
  });
});
