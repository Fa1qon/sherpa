// tests/presentation/screens/TaskWorkspace/Transparency/trace_parser.spec.ts
import { describe, expect, it } from 'vitest';
import { aggregateToolCalls, parseTs, type TraceEventLike } from '../../../../../src/presentation/screens/TaskWorkspace/Transparency/trace_parser';

describe('parseTs', () => {
  it('returns ms for a valid ISO string', () => {
    const ms = parseTs('2024-01-15T10:00:00.000Z');
    expect(ms).toBe(Date.parse('2024-01-15T10:00:00.000Z'));
  });

  it('returns a numeric value unchanged', () => {
    expect(parseTs(12345)).toBe(12345);
  });

  it('returns undefined for invalid string', () => {
    expect(parseTs('not-a-date')).toBeUndefined();
  });

  it('returns undefined for null/undefined', () => {
    expect(parseTs(null)).toBeUndefined();
    expect(parseTs(undefined)).toBeUndefined();
  });
});

describe('aggregateToolCalls', () => {
  it('returns empty array for empty input', () => {
    expect(aggregateToolCalls([])).toEqual([]);
  });

  it('pairs a single tool_call with its tool_result', () => {
    const events: TraceEventLike[] = [
      { kind: 'tool_call', stageId: 's1', name: 'Read', args_excerpt: '{"path":"a.ts"}', ts: '2024-01-15T10:00:00.000Z' },
      { kind: 'tool_result', stageId: 's1', name: 'Read', status: 'success', result_excerpt: '"file content"', ts: '2024-01-15T10:00:01.000Z' },
    ];
    const calls = aggregateToolCalls(events);
    expect(calls).toHaveLength(1);
    const [c] = calls;
    expect(c.toolName).toBe('Read');
    expect(c.stageId).toBe('s1');
    expect(c.input).toEqual({ path: 'a.ts' });
    expect(c.output).toBe('file content');
    expect(c.isError).toBe(false);
    expect(c.durationMs).toBe(1000);
  });

  it('pairs multiple same-name same-stage calls in FIFO order', () => {
    const events: TraceEventLike[] = [
      { kind: 'tool_call', stageId: 's1', name: 'Bash', args_excerpt: '"cmd1"', ts: '2024-01-15T10:00:00.000Z' },
      { kind: 'tool_call', stageId: 's1', name: 'Bash', args_excerpt: '"cmd2"', ts: '2024-01-15T10:00:01.000Z' },
      { kind: 'tool_result', stageId: 's1', name: 'Bash', status: 'success', result_excerpt: '"out1"', ts: '2024-01-15T10:00:02.000Z' },
      { kind: 'tool_result', stageId: 's1', name: 'Bash', status: 'success', result_excerpt: '"out2"', ts: '2024-01-15T10:00:03.000Z' },
    ];
    const calls = aggregateToolCalls(events);
    expect(calls).toHaveLength(2);
    // FIFO: first call gets first result
    expect(calls[0].input).toBe('cmd1');
    expect(calls[0].output).toBe('out1');
    expect(calls[1].input).toBe('cmd2');
    expect(calls[1].output).toBe('out2');
  });

  it('marks isError true when status is error', () => {
    const events: TraceEventLike[] = [
      { kind: 'tool_call', stageId: 's1', name: 'Write', args_excerpt: '{}', ts: '2024-01-15T10:00:00.000Z' },
      { kind: 'tool_result', stageId: 's1', name: 'Write', status: 'error', result_excerpt: '"permission denied"', ts: '2024-01-15T10:00:01.000Z' },
    ];
    const [c] = aggregateToolCalls(events);
    expect(c.isError).toBe(true);
  });

  it('parses args_excerpt as JSON when valid', () => {
    const events: TraceEventLike[] = [
      { kind: 'tool_call', stageId: 's1', name: 'Read', args_excerpt: '{"file":"x.ts","line":42}', ts: '2024-01-15T10:00:00.000Z' },
    ];
    const [c] = aggregateToolCalls(events);
    expect(c.input).toEqual({ file: 'x.ts', line: 42 });
  });

  it('falls back to raw string when args_excerpt is not valid JSON', () => {
    const events: TraceEventLike[] = [
      { kind: 'tool_call', stageId: 's1', name: 'Bash', args_excerpt: 'not { valid json', ts: '2024-01-15T10:00:00.000Z' },
    ];
    const [c] = aggregateToolCalls(events);
    expect(c.input).toBe('not { valid json');
  });

  it('surfaces orphan tool_result as synthetic call', () => {
    const events: TraceEventLike[] = [
      { kind: 'tool_result', stageId: 's1', name: 'Read', status: 'success', result_excerpt: '"orphaned"', ts: '2024-01-15T10:00:01.000Z' },
    ];
    const calls = aggregateToolCalls(events);
    expect(calls).toHaveLength(1);
    expect(calls[0].callId).toContain('orphan');
    expect(calls[0].output).toBe('orphaned');
    expect(calls[0].input).toBeUndefined();
  });

  it('ignores non-tool events without surfacing extra calls', () => {
    const events: TraceEventLike[] = [
      { kind: 'stage_entered', stageId: 's1', ts: '2024-01-15T10:00:00.000Z', prompt_excerpt: 'do something' },
      { kind: 'tool_call', stageId: 's1', name: 'Read', args_excerpt: '{}', ts: '2024-01-15T10:00:01.000Z' },
      { kind: 'text', stageId: 's1', ts: '2024-01-15T10:00:02.000Z', text: 'thinking...' },
      { kind: 'tool_result', stageId: 's1', name: 'Read', status: 'success', result_excerpt: '"ok"', ts: '2024-01-15T10:00:03.000Z' },
    ];
    const calls = aggregateToolCalls(events);
    expect(calls).toHaveLength(1);
    expect(calls[0].toolName).toBe('Read');
  });

  it('handles unpaired call (no result) — call surfaced without output', () => {
    const events: TraceEventLike[] = [
      { kind: 'tool_call', stageId: 's1', name: 'Glob', args_excerpt: '"*.ts"', ts: '2024-01-15T10:00:00.000Z' },
    ];
    const calls = aggregateToolCalls(events);
    expect(calls).toHaveLength(1);
    expect(calls[0].output).toBeUndefined();
    expect(calls[0].durationMs).toBeUndefined();
  });

  it('pairs tool_call/tool_result when both omit stageId', () => {
    const events: TraceEventLike[] = [
      { kind: 'tool_call', name: 'Read', args_excerpt: '{"path":"b.ts"}', ts: '2024-01-15T10:00:00.000Z' },
      { kind: 'tool_result', name: 'Read', status: 'success', result_excerpt: '"content"', ts: '2024-01-15T10:00:01.000Z' },
    ];
    const calls = aggregateToolCalls(events);
    expect(calls).toHaveLength(1);
    const [c] = calls;
    expect(c.toolName).toBe('Read');
    expect(c.stageId).toBeUndefined();
    expect(c.callId).toContain('-:Read:');
    expect(c.input).toEqual({ path: 'b.ts' });
    expect(c.output).toBe('content');
  });

  it("falls back to 'unknown' when name is missing", () => {
    const events: TraceEventLike[] = [
      { kind: 'tool_call', stageId: 's1', args_excerpt: '{}', ts: '2024-01-15T10:00:00.000Z' },
    ];
    const calls = aggregateToolCalls(events);
    expect(calls).toHaveLength(1);
    expect(calls[0].toolName).toBe('unknown');
  });
});
