// src/presentation/screens/TaskWorkspace/Transparency/CallTreePanel.tsx
//
// Renders a hierarchical subagent call tree from tool calls passed by the parent.
// Data is owned by TransparencyPanel (single polling source); this component is
// purely presentational — no IPC, no polling.
// ADR-001: no imports from src/main.
import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToolCall } from './trace_parser';
import { buildCallTree } from './call_tree';
import { CallTreeNode } from './CallTreeNode';
import styles from './CallTreePanel.module.css';

interface Props {
  calls: readonly ToolCall[];
}

export function CallTreePanel({ calls }: Props): ReactElement {
  const { t } = useTranslation();

  const tree = useMemo(() => buildCallTree(calls), [calls]);

  return (
    <div className={styles.wrapper}>
      {tree.length === 0 ? (
        <p style={{ color: 'var(--fg-muted)', textAlign: 'center', padding: '40px', margin: 0 }}>
          {t('callTree.empty', 'No calls yet')}
        </p>
      ) : (
        tree.map(root => (
          <CallTreeNode key={root.call.callId} node={root} depth={0} />
        ))
      )}
    </div>
  );
}
