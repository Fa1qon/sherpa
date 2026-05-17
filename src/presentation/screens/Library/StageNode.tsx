// src/presentation/screens/Library/StageNode.tsx
import { memo, type ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { StageMode } from '../../../core/domain/methodology';
import styles from './StageNode.module.css';

export interface StageNodeData {
  label: string;
  mode?: StageMode;
  kind: 'stage' | 'sentinel';
  role_split?: boolean;
  reviewerCount?: number;
  phaseCount?: number;
  phasesFromArtifact?: boolean;
}

function ModeIcon({ mode }: { mode: StageMode }): ReactElement {
  if (mode === 'auto') {
    return (
      <svg viewBox="0 0 14 14" width={12} height={12} aria-hidden="true">
        <circle cx={7} cy={7} r={5} fill="none" stroke="currentColor" />
        <path d="M7 4v3l2 1" stroke="currentColor" fill="none" />
      </svg>
    );
  }
  if (mode === 'interactive') {
    return (
      <svg viewBox="0 0 14 14" width={12} height={12} aria-hidden="true">
        <path d="M2 3h10v6H6l-3 3V3z" fill="none" stroke="currentColor" />
      </svg>
    );
  }
  // gate
  return (
    <svg viewBox="0 0 14 14" width={12} height={12} aria-hidden="true">
      <path d="M3 7l3 3 5-6" fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

export function StageNodeRaw({ data }: NodeProps): ReactElement {
  const d = data as unknown as StageNodeData;
  if (d.kind === 'sentinel') {
    return (
      <div className={styles.sentinel}>
        <Handle type="target" position={Position.Left} />
        <div>{d.label}</div>
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }
  const reviewerCount = d.reviewerCount ?? 0;
  const phaseCount = d.phaseCount ?? 0;
  const phasesFromArtifact = d.phasesFromArtifact === true;
  return (
    <div className={styles.node} data-mode={d.mode}>
      <Handle type="target" position={Position.Left} />
      <div className={styles.header}>
        {d.mode && <ModeIcon mode={d.mode} />}
        <span className={styles.title}>{d.label}</span>
      </div>
      {d.role_split && (
        <div className={styles.chips}>
          <span className={styles.chip} data-role="ai">AI</span>
          <span className={styles.chip} data-role="human">Human</span>
        </div>
      )}
      {(reviewerCount > 0 || phaseCount > 0 || phasesFromArtifact) && (
        <div className={styles.badges}>
          {reviewerCount > 0 && (
            <span className={styles.badge} title="Reviewers">
              R{reviewerCount}
            </span>
          )}
          {(phaseCount > 0 || phasesFromArtifact) && (
            <span
              className={styles.badge}
              title="Phases"
              data-from-artifact={phasesFromArtifact ? 'true' : 'false'}
            >
              P{phasesFromArtifact ? '*' : phaseCount}
            </span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const StageNode = memo(StageNodeRaw);
