// src/presentation/screens/EmptyWorkspace/EmptyWorkspace.tsx
// Placeholder shown when no tab is active. Plan 4 replaces this with the
// Task Board + Task Workspace.
//
// Plan 8-fix Task 5 — when a project is open we expose a "New task" button
// (data-testid="new-task-button") so e2e tests can trigger NewTaskDialog
// without resorting to the chrome menu. The button dispatches the same
// `task.new` action the chrome menu does — App.tsx wires both into the
// same handler.
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutList, Plus } from 'lucide-react';
import { useProject } from '../../../renderer/store/project';
import { useSideBar } from '../../../renderer/store/sidebar';
import styles from './EmptyWorkspace.module.css';

interface Props {
  /**
   * Optional dispatcher for chrome-style action ids. When supplied, the
   * "New task" launcher button is rendered (only meaningful when a
   * project is open).
   */
  readonly onAction?: (id: string) => void;
}

export function EmptyWorkspace({ onAction }: Props = {}): ReactElement {
  const { t } = useTranslation();
  const current = useProject((s) => s.current);
  const toggleSidebar = useSideBar((s) => s.toggle);

  return (
    <div className={styles.empty}>
      {current && (
        <div
          data-testid="workspace-loaded"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '1px',
            height: '1px',
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      )}
      <div className={styles.logo}>Sherpa</div>
      <p className={styles.hint}>{t('empty.hint', 'Откройте задачу или создайте новую')}</p>
      {current && onAction && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.action}
            data-testid="new-task-button"
            onClick={() => onAction('task.new')}
          >
            <Plus size={16} strokeWidth={1.75} />
            <span>{t('empty.newTask', 'Новая задача')}</span>
            <kbd className={styles.kbd}>⌘T</kbd>
          </button>
          <button
            type="button"
            className={styles.action}
            onClick={() => toggleSidebar('tasks')}
          >
            <LayoutList size={16} strokeWidth={1.75} />
            <span>{t('empty.recentTasks', 'Недавние задачи')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
