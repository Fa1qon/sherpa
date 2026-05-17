// src/presentation/screens/ProjectPicker/RecentList.tsx
import { type ReactElement } from 'react';
import type { RecentEntry } from '../../../core/domain/project';
import styles from './ProjectPicker.module.css';

export interface RecentListProps {
  recent: readonly RecentEntry[];
  onOpen(id: string): void;
  onRemove(id: string): void;
  emptyLabel: string;
}

export function RecentList({
  recent,
  onOpen,
  onRemove,
  emptyLabel,
}: RecentListProps): ReactElement {
  if (recent.length === 0) {
    return <p className={styles.emptyRecent}>{emptyLabel}</p>;
  }
  return (
    <ul className={styles.recentList}>
      {recent.map((p) => (
        <li key={p.id} className={styles.recentItem} onClick={() => onOpen(p.id)}>
          <div>
            <div className={styles.recentName}>{p.name}</div>
            <div className={styles.recentPath}>{p.path}</div>
          </div>
          <button
            className={styles.recentRemove}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(p.id);
            }}
            aria-label={`Remove ${p.name}`}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
