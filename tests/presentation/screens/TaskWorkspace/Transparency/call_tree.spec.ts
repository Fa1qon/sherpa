// tests/presentation/screens/TaskWorkspace/Transparency/call_tree.spec.ts
import { describe, expect, it } from 'vitest';
import { buildCallTree, countDescendants } from '../../../../../src/presentation/screens/TaskWorkspace/Transparency/call_tree';
import type { ToolCall } from '../../../../../src/presentation/screens/TaskWorkspace/Transparency/trace_parser';

/** Helper to create a minimal ToolCall */
function tc(
  id: string,
  name: string,
  start: number,
  end: number,
  input: unknown = {},
): ToolCall {
  return {
    callId: id,
    toolName: name,
    input,
    startedTs: start,
    completedTs: end,
    durationMs: end - start,
  };
}

describe('buildCallTree', () => {
  it('returns empty tree for empty calls', () => {
    expect(buildCallTree([])).toEqual([]);
  });

  it('returns single root for single non-Task call', () => {
    const calls = [tc('1', 'Read', 0, 100)];
    const tree = buildCallTree(calls);
    expect(tree).toHaveLength(1);
    expect(tree[0].call.callId).toBe('1');
    expect(tree[0].children).toHaveLength(0);
    expect(tree[0].isSubagent).toBe(false);
  });

  it('places tool calls within Task window as children', () => {
    const calls = [
      tc('task', 'Task', 0, 100, { subagent_type: 'researcher' }),
      tc('read', 'Read', 10, 20),
      tc('bash', 'Bash', 30, 40),
      tc('edit', 'Edit', 110, 120),  // outside Task window
    ];
    const tree = buildCallTree(calls);
    // task + edit are roots
    expect(tree).toHaveLength(2);
    const taskNode = tree.find(n => n.call.callId === 'task')!;
    expect(taskNode).toBeDefined();
    expect(taskNode.children).toHaveLength(2);
    expect(taskNode.children.map(c => c.call.callId)).toContain('read');
    expect(taskNode.children.map(c => c.call.callId)).toContain('bash');
    expect(taskNode.isSubagent).toBe(true);
    expect(taskNode.subagentType).toBe('researcher');
  });

  it('handles nested Tasks — inner Task claims its own children first', () => {
    const calls = [
      tc('outer', 'Task', 0, 200),
      tc('inner', 'Task', 50, 150, { subagent_type: 'coder' }),
      tc('innerRead', 'Read', 80, 90),
      tc('outerEdit', 'Edit', 170, 180),
    ];
    const tree = buildCallTree(calls);
    // Only outer Task is root
    expect(tree).toHaveLength(1);
    const outerNode = tree[0];
    expect(outerNode.call.callId).toBe('outer');
    // outer has inner Task + outerEdit
    expect(outerNode.children).toHaveLength(2);
    const innerNode = outerNode.children.find(c => c.call.callId === 'inner')!;
    expect(innerNode).toBeDefined();
    expect(innerNode.children).toHaveLength(1);
    expect(innerNode.children[0].call.callId).toBe('innerRead');
    expect(innerNode.isSubagent).toBe(true);
    expect(innerNode.subagentType).toBe('coder');
  });

  it('Task without completedTs (open call) still claims children using Infinity window', () => {
    const calls = [
      // open Task — no completedTs
      { callId: 'openTask', toolName: 'Task', input: {}, startedTs: 0, durationMs: undefined } as ToolCall,
      tc('read', 'Read', 10, 20),
      tc('bash', 'Bash', 100, 200),
    ];
    const tree = buildCallTree(calls);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(2);
  });

  it('calls outside any Task window are all roots', () => {
    const calls = [
      tc('a', 'Read', 0, 10),
      tc('b', 'Bash', 20, 30),
      tc('c', 'Edit', 40, 50),
    ];
    const tree = buildCallTree(calls);
    expect(tree).toHaveLength(3);
    for (const n of tree) expect(n.children).toHaveLength(0);
  });

  it('preserves description from input', () => {
    const calls = [
      tc('t', 'Task', 0, 100, { description: 'do the thing' }),
    ];
    const tree = buildCallTree(calls);
    expect(tree[0].description).toBe('do the thing');
  });

  it('sets subagentType undefined when input has no subagent_type string', () => {
    const calls = [
      tc('t', 'Task', 0, 100, { subagent_type: 42 }),
    ];
    const tree = buildCallTree(calls);
    expect(tree[0].subagentType).toBeUndefined();
  });

  it('tool call with startedTs equal to Task.startedTs is NOT a child', () => {
    // Boundary: ts === start → condition (ts > start) is false → root sibling
    const calls = [
      tc('task', 'Task', 0, 100),
      tc('boundary', 'Read', 0, 10),  // startedTs === Task.startedTs (0)
    ];
    const tree = buildCallTree(calls);
    // Both should be roots — boundary call is NOT claimed
    const ids = tree.map(n => n.call.callId);
    expect(ids).toContain('boundary');
    const taskNode = tree.find(n => n.call.callId === 'task')!;
    expect(taskNode.children).toHaveLength(0);
  });

  it('tool call with startedTs equal to Task.completedTs is NOT a child', () => {
    // Boundary: ts === end → condition (ts < end) is false → root sibling
    const calls = [
      tc('task', 'Task', 0, 100),
      tc('boundary', 'Read', 100, 110),  // startedTs === Task.completedTs (100)
    ];
    const tree = buildCallTree(calls);
    // Both should be roots — boundary call is NOT claimed
    const ids = tree.map(n => n.call.callId);
    expect(ids).toContain('boundary');
    const taskNode = tree.find(n => n.call.callId === 'task')!;
    expect(taskNode.children).toHaveLength(0);
  });
});

describe('countDescendants', () => {
  it('returns 0 for leaf node', () => {
    const calls = [tc('1', 'Read', 0, 10)];
    const tree = buildCallTree(calls);
    expect(countDescendants(tree[0])).toBe(0);
  });

  it('counts direct children', () => {
    const calls = [
      tc('task', 'Task', 0, 100),
      tc('a', 'Read', 10, 20),
      tc('b', 'Bash', 30, 40),
    ];
    const tree = buildCallTree(calls);
    expect(countDescendants(tree[0])).toBe(2);
  });

  it('counts descendants recursively', () => {
    const calls = [
      tc('outer', 'Task', 0, 200),
      tc('inner', 'Task', 50, 150),
      tc('innerRead', 'Read', 80, 90),
      tc('outerEdit', 'Edit', 170, 180),
    ];
    const tree = buildCallTree(calls);
    // outer → inner, outerEdit; inner → innerRead
    // total descendants of outer = 3
    expect(countDescendants(tree[0])).toBe(3);
  });
});
