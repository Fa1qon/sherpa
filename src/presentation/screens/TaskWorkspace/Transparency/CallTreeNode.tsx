// src/presentation/screens/TaskWorkspace/Transparency/CallTreeNode.tsx
//
// Recursive component rendering one node in the subagent call tree.
// Open by default for depth < 2 (master + first subagent level visible).
import { useState, type ReactElement } from 'react';
import { ChevronDown, ChevronRight, Users, Wrench } from 'lucide-react';
import type { CallTreeNode as NodeType } from './call_tree';
import { ToolCallCard } from './ToolCallCard';
import styles from './CallTreePanel.module.css';

interface Props {
  node: NodeType;
  depth: number;
}

function fmtMs(ms?: number): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}

export function CallTreeNode({ node, depth }: Props): ReactElement {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div className={styles.node} style={{ marginLeft: depth * 16 }}>
      <button
        type="button"
        className={styles.row}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {hasChildren
          ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
          : <span style={{ display: 'inline-block', width: 12 }} />
        }
        {node.isSubagent
          ? <Users size={12} className={styles.subagentIcon} />
          : <Wrench size={12} className={styles.toolIcon} />
        }
        <span className={styles.name}>
          {node.isSubagent ? (node.subagentType ?? 'subagent') : node.call.toolName}
        </span>
        {node.description !== undefined && (
          <span className={styles.desc}>{node.description}</span>
        )}
        <span className={styles.duration}>{fmtMs(node.call.durationMs)}</span>
        {hasChildren && (
          <span className={styles.childCount}>{node.children.length} ch.</span>
        )}
      </button>
      {open && hasChildren && (
        <div className={styles.children}>
          {node.children.map(child => (
            <CallTreeNode key={child.call.callId} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
      {open && !hasChildren && !node.isSubagent && (
        <div className={styles.leafCard}>
          <ToolCallCard call={node.call} />
        </div>
      )}
    </div>
  );
}
