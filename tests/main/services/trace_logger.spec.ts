// tests/main/services/trace_logger.spec.ts
// Plan 8 Task 16 — TraceLogger NDJSON event log tests.
//
// Covers:
//   - round-trip for every TraceEvent variant
//   - NDJSON shape (one JSON object per line, trailing newline)
//   - excerpt truncation at MAX_EXCERPT chars
//   - parent directory auto-creation on first append
//   - append-doesn't-clobber semantics
//   - concurrent appends preserve line integrity
//   - readTrace skips empty / malformed / missing-file lines
//   - createTraceLogger builds the canonical per-task path

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  TraceLogger,
  createTraceLogger,
  readTrace,
  truncateExcerpt,
  MAX_EXCERPT,
  type TraceEvent,
  type LooseTraceEvent,
} from '../../../src/main/services/trace_logger';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), 'sherpa-trace-test-'));
});

afterEach(() => {
  fsSync.rmSync(tmpRoot, { recursive: true, force: true });
});

const TS = '2026-05-12T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Round-trip for every variant
// ---------------------------------------------------------------------------

describe('TraceLogger — round-trip', () => {
  test('every TraceEvent variant survives write/read JSON-equal', async () => {
    const tracePath = path.join(tmpRoot, 'trace.jsonl');
    const logger = new TraceLogger(tracePath);

    const events: readonly TraceEvent[] = [
      { kind: 'task_started', methodologyId: 'm1', taskId: 't1', ts: TS },
      { kind: 'stage_entered', stageId: 's1', ts: TS, prompt_excerpt: 'hello' },
      { kind: 'stage_skipped_by_mode', stageId: 's1', mode: 'plan', ts: TS },
      { kind: 'preflight_failed', stageId: 's1', checkId: 'pf1', ts: TS },
      { kind: 'tool_call', stageId: 's1', name: 'Read', args_excerpt: '{"path":"x"}', ts: TS },
      { kind: 'tool_result', stageId: 's1', name: 'Read', status: 'success', result_excerpt: 'ok', ts: TS },
      {
        kind: 'gate_evaluated',
        stageId: 's1',
        evaluation: { kind: 'pass', items: [{ id: 'g1', verdict: 'pass', reason: 'ok' }] },
        ts: TS,
      },
      {
        kind: 'edge_traversed',
        from: 's1',
        to: 's2',
        condition: 'gate-pass',
        counter_mutations: { recut_count: 1 },
        ts: TS,
      },
      { kind: 'rollback_recorded', from: 's2', to: 's1', reason: 'gate fail', ts: TS },
      { kind: 'counter_mutated', name: 'recut_count', prev: 0, next: 1, ts: TS },
      { kind: 'artifact_written', path: 'a.md', bytes: 42, ts: TS },
      { kind: 'task_completed', ts: TS },
      { kind: 'task_failed', reason: 'oops', ts: TS },
      { kind: 'task_paused', ts: TS },
      { kind: 'task_resumed', from_stage: 's1', ts: TS },
    ];

    for (const e of events) await logger.event(e);

    const back = await readTrace(tracePath);
    expect(back.length).toBe(events.length);
    for (let i = 0; i < events.length; i++) {
      expect(back[i]).toEqual(events[i]);
    }
  });

  test('count of discriminated-union variants matches spec (15 including task_resumed)', () => {
    // Sanity: ensure we have all variants represented above. This is a
    // type-level reminder rather than a structural check; lifting it out
    // makes the test list visible.
    const kinds: TraceEvent['kind'][] = [
      'task_started',
      'stage_entered',
      'stage_skipped_by_mode',
      'preflight_failed',
      'tool_call',
      'tool_result',
      'gate_evaluated',
      'edge_traversed',
      'rollback_recorded',
      'counter_mutated',
      'artifact_written',
      'task_completed',
      'task_failed',
      'task_paused',
      'task_resumed',
    ];
    expect(kinds.length).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// NDJSON shape
// ---------------------------------------------------------------------------

describe('TraceLogger — NDJSON shape', () => {
  test('one JSON object per line, newline-terminated', async () => {
    const tracePath = path.join(tmpRoot, 'trace.jsonl');
    const logger = new TraceLogger(tracePath);

    await logger.event({ kind: 'task_completed', ts: TS });
    await logger.event({ kind: 'task_failed', reason: 'x', ts: TS });

    const raw = await fsp.readFile(tracePath, 'utf8');
    const lines = raw.split('\n');
    // Two events + trailing empty string after final '\n'.
    expect(lines.length).toBe(3);
    expect(lines[2]).toBe('');
    expect(JSON.parse(lines[0]!)).toEqual({ kind: 'task_completed', ts: TS });
    expect(JSON.parse(lines[1]!)).toEqual({ kind: 'task_failed', reason: 'x', ts: TS });
  });

  test('appends do not clobber existing content', async () => {
    const tracePath = path.join(tmpRoot, 'trace.jsonl');
    const logger = new TraceLogger(tracePath);

    await logger.event({ kind: 'task_completed', ts: TS });
    // New logger instance, same path — must append.
    const logger2 = new TraceLogger(tracePath);
    await logger2.event({ kind: 'task_paused', ts: TS });

    const back = await readTrace(tracePath);
    expect(back.length).toBe(2);
    expect((back[0] as LooseTraceEvent).kind).toBe('task_completed');
    expect((back[1] as LooseTraceEvent).kind).toBe('task_paused');
  });
});

// ---------------------------------------------------------------------------
// Excerpt truncation
// ---------------------------------------------------------------------------

describe('TraceLogger — excerpt truncation', () => {
  test('truncateExcerpt helper truncates beyond MAX_EXCERPT with ellipsis', () => {
    const short = 'hello';
    expect(truncateExcerpt(short)).toBe('hello');

    const long = 'a'.repeat(MAX_EXCERPT + 50);
    const out = truncateExcerpt(long);
    expect(out.length).toBe(MAX_EXCERPT + 1); // +1 for the ellipsis char
    expect(out.endsWith('…')).toBe(true);
    expect(out.slice(0, MAX_EXCERPT)).toBe('a'.repeat(MAX_EXCERPT));
  });

  test('event() truncates prompt_excerpt / args_excerpt / result_excerpt', async () => {
    const tracePath = path.join(tmpRoot, 'trace.jsonl');
    const logger = new TraceLogger(tracePath);

    const long = 'x'.repeat(MAX_EXCERPT + 100);
    await logger.event({ kind: 'stage_entered', stageId: 's1', ts: TS, prompt_excerpt: long });
    await logger.event({
      kind: 'tool_call', stageId: 's1', name: 'Read', args_excerpt: long, ts: TS,
    });
    await logger.event({
      kind: 'tool_result', stageId: 's1', name: 'Read', status: 'success', result_excerpt: long, ts: TS,
    });

    const back = await readTrace(tracePath);
    expect(back).toHaveLength(3);

    const stage = back[0] as Extract<TraceEvent, { kind: 'stage_entered' }>;
    expect(stage.prompt_excerpt.length).toBe(MAX_EXCERPT + 1);
    expect(stage.prompt_excerpt.endsWith('…')).toBe(true);

    const call = back[1] as Extract<TraceEvent, { kind: 'tool_call' }>;
    expect(call.args_excerpt.length).toBe(MAX_EXCERPT + 1);

    const result = back[2] as Extract<TraceEvent, { kind: 'tool_result' }>;
    expect(result.result_excerpt.length).toBe(MAX_EXCERPT + 1);
  });

  test('short excerpts are NOT truncated and stay byte-identical', async () => {
    const tracePath = path.join(tmpRoot, 'trace.jsonl');
    const logger = new TraceLogger(tracePath);

    const short = 'short prompt';
    await logger.event({
      kind: 'stage_entered', stageId: 's1', ts: TS, prompt_excerpt: short,
    });
    const back = await readTrace(tracePath);
    expect((back[0] as { prompt_excerpt: string }).prompt_excerpt).toBe(short);
  });

  test('excerpt of exactly MAX_EXCERPT chars is NOT truncated', async () => {
    const tracePath = path.join(tmpRoot, 'trace.jsonl');
    const logger = new TraceLogger(tracePath);
    const exact = 'a'.repeat(MAX_EXCERPT);
    await logger.event({
      kind: 'stage_entered', stageId: 's1', ts: TS, prompt_excerpt: exact,
    });
    const back = await readTrace(tracePath);
    expect((back[0] as { prompt_excerpt: string }).prompt_excerpt).toBe(exact);
  });
});

// ---------------------------------------------------------------------------
// Parent dir auto-creation
// ---------------------------------------------------------------------------

describe('TraceLogger — parent directory', () => {
  test('creates missing parent dir on first append', async () => {
    const tracePath = path.join(tmpRoot, 'deeply', 'nested', 'missing', 'trace.jsonl');
    // Sanity: parent doesn't exist yet.
    expect(fsSync.existsSync(path.dirname(tracePath))).toBe(false);

    const logger = new TraceLogger(tracePath);
    await logger.event({ kind: 'task_completed', ts: TS });

    expect(fsSync.existsSync(tracePath)).toBe(true);
    const back = await readTrace(tracePath);
    expect(back).toHaveLength(1);
  });

  test('createTraceLogger() builds canonical .sherpa/tasks/<id>/trace.jsonl path', async () => {
    const logger = createTraceLogger(tmpRoot, 'task-abc');
    await logger.event({ kind: 'task_completed', ts: TS });
    const expected = path.join(tmpRoot, '.sherpa', 'tasks', 'task-abc', 'trace.jsonl');
    expect(fsSync.existsSync(expected)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Concurrent appends
// ---------------------------------------------------------------------------

describe('TraceLogger — concurrent appends', () => {
  test('parallel event() calls produce N intact lines', async () => {
    const tracePath = path.join(tmpRoot, 'trace.jsonl');
    const logger = new TraceLogger(tracePath);

    const N = 50;
    const writes: Promise<void>[] = [];
    for (let i = 0; i < N; i++) {
      writes.push(logger.event({ kind: 'counter_mutated', name: `c${i}`, prev: 0, next: 1, ts: TS }));
    }
    await Promise.all(writes);

    const back = await readTrace(tracePath);
    expect(back).toHaveLength(N);
    // Every recovered event must be well-formed counter_mutated; ordering
    // is not guaranteed under fs.appendFile parallelism, but line integrity is.
    const names = new Set<string>();
    for (const e of back) {
      const ev = e as Extract<TraceEvent, { kind: 'counter_mutated' }>;
      expect(ev.kind).toBe('counter_mutated');
      names.add(ev.name);
    }
    expect(names.size).toBe(N);
  });
});

// ---------------------------------------------------------------------------
// readTrace robustness
// ---------------------------------------------------------------------------

describe('readTrace', () => {
  test('returns [] for a missing file', async () => {
    const result = await readTrace(path.join(tmpRoot, 'does-not-exist.jsonl'));
    expect(result).toEqual([]);
  });

  test('skips empty and malformed lines without throwing', async () => {
    const tracePath = path.join(tmpRoot, 'trace.jsonl');
    const content = [
      '',
      JSON.stringify({ kind: 'task_completed', ts: TS }),
      'not-json',
      '   ',
      JSON.stringify({ kind: 'task_paused', ts: TS }),
      '{ "kind": 42 }', // kind not a string → skipped
      JSON.stringify({ foo: 'bar' }), // no kind → skipped
      '',
    ].join('\n');
    await fsp.writeFile(tracePath, content, 'utf8');

    const back = await readTrace(tracePath);
    expect(back).toHaveLength(2);
    expect(back.map((e) => (e as { kind: string }).kind)).toEqual(['task_completed', 'task_paused']);
  });
});

// ---------------------------------------------------------------------------
// Loose-event compatibility (runners emit extra fields and ad-hoc kinds)
// ---------------------------------------------------------------------------

describe('TraceLogger — loose event compatibility', () => {
  test('accepts events with ad-hoc kinds + extra fields (no schema enforcement)', async () => {
    const tracePath = path.join(tmpRoot, 'trace.jsonl');
    const logger = new TraceLogger(tracePath);

    // Mimic what stage_runner.ts emits today.
    await logger.event({
      kind: 'stage_completed',
      stageId: 's1',
      turns: 3,
    });
    await logger.event({
      kind: 'preflight_ask_deferred_as_rollback',
      checkId: 'pf1',
    });

    const back = await readTrace(tracePath);
    expect(back).toHaveLength(2);
    expect((back[0] as { kind: string }).kind).toBe('stage_completed');
    expect((back[0] as unknown as { turns: number }).turns).toBe(3);
    expect((back[1] as { kind: string }).kind).toBe('preflight_ask_deferred_as_rollback');
  });
});
