// src/presentation/screens/Tracker/KanbanColumn.tsx
import type { ReactElement } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useTracker } from '../../../renderer/store/tracker';
import { useNavigation } from '../../../renderer/store/navigation';
import { useTask } from '../../../renderer/store/task';
import { useProject } from '../../../renderer/store/project';
import { useTranslation } from 'react-i18next';
import type { Stage } from '../../../core/domain/tracker';
import { TaskCard } from './TaskCard';
import styles from './KanbanBoard.module.css';

interface KanbanColumnProps {
  readonly stage: Stage;
  readonly isOver?: boolean;
  readonly activeTaskId?: string | null;
}

export function KanbanColumn({ stage, isOver, activeTaskId }: KanbanColumnProps): ReactElement {
  const { t } = useTranslation();
  const project = useProject((s) => s.current);
  const allTasks = useTracker((s) => s.tasks);
  const tasks = allTasks.filter((tt) => tt.stageId === stage.id);
  const openTab = useNavigation((s) => s.openTab);
  const setCurrent = useTask((s) => s.setCurrent);

  const { setNodeRef } = useDroppable({ id: stage.id });

  const handleAddTask = (): void => {
    if (!project) return;
    setCurrent(null);
    const tempId = `new-${Math.random().toString(36).slice(2, 10)}`;
    openTab({
      kind: 'task',
      params: { taskId: tempId, trackerStage: stage.id },
      title: t('task.new', 'Новая задача'),
    });
  };

  return (
    <div
      ref={setNodeRef}
      className={`${styles.column}${isOver ? ` ${styles.columnOver}` : ''}`}
      data-testid={`column-${stage.id}`}
    >
      <div
        className={styles.columnHeader}
        style={{ borderTopColor: stage.color ?? 'var(--border)' }}
      >
        <span className={styles.columnTitle}>{stage.name}</span>
        <span className={styles.columnCount}>{tasks.length}</span>
      </div>
      <div className={styles.columnBody}>
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} isDragging={task.id === activeTaskId} />
        ))}
        <button
          type="button"
          className={styles.addBtn}
          onClick={handleAddTask}
          data-testid={`add-task-${stage.id}`}
        >
          + {t('tracker.addTask', 'Add task')}
        </button>
      </div>
    </div>
  );
}
