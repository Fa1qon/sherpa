// src/presentation/screens/TaskWorkspace/Transparency/call_tree.ts
//
// Converts a flat list of ToolCall objects into a hierarchical call tree.
// Subagent dispatches (toolName === 'Task') become parent nodes; subsequent
// tool calls whose startedTs falls within the Task's time window are children.
// Nesting is resolved shortest-duration-first so inner Tasks claim their
// children before outer Tasks do.

import type { ToolCall } from './trace_parser';

export interface CallTreeNode {
  call: ToolCall;
  children: CallTreeNode[];
  isSubagent: boolean;
  subagentType?: string;
  description?: string;
}

/**
 * Build a hierarchical tree from tool calls.
 *
 * Uses a time-window heuristic: tool calls whose `startedTs` falls strictly
 * inside a Task call's [startedTs, completedTs] range are considered children.
 * Shortest-duration Task nodes are processed first so inner subagents claim
 * their children before outer ones do.
 */
export function buildCallTree(calls: readonly ToolCall[]): CallTreeNode[] {
  // Sort by start time (stable for equal ts)
  const sorted = [...calls].sort((a, b) => (a.startedTs ?? 0) - (b.startedTs ?? 0));

  const nodes: CallTreeNode[] = sorted.map(call => {
    const input = (call.input ?? {}) as { subagent_type?: unknown; description?: unknown };
    return {
      call,
      children: [],
      isSubagent: call.toolName === 'Task',
      subagentType: typeof input.subagent_type === 'string' ? input.subagent_type : undefined,
      description: typeof input.description === 'string' ? input.description : undefined,
    };
  });

  const claimed = new Set<string>();
  // Shortest-duration Task nodes claim first → inner nesting wins.
  const taskNodes = nodes.filter(n => n.isSubagent).sort((a, b) => {
    const aDur = (a.call.completedTs ?? Number.POSITIVE_INFINITY) - (a.call.startedTs ?? 0);
    const bDur = (b.call.completedTs ?? Number.POSITIVE_INFINITY) - (b.call.startedTs ?? 0);
    return aDur - bDur;
  });

  for (const taskNode of taskNodes) {
    const start = taskNode.call.startedTs ?? 0;
    const end = taskNode.call.completedTs ?? Number.POSITIVE_INFINITY;
    for (const other of nodes) {
      if (other === taskNode) continue;
      if (claimed.has(other.call.callId)) continue;
      const ts = other.call.startedTs ?? 0;
      if (ts > start && ts < end) {
        taskNode.children.push(other);
        claimed.add(other.call.callId);
      }
    }
  }

  const roots: CallTreeNode[] = [];
  for (const n of nodes) if (!claimed.has(n.call.callId)) roots.push(n);
  return roots;
}

export function countDescendants(node: CallTreeNode): number {
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);
}
