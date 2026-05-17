// src/presentation/screens/Tracker/TaskCard.tsx
import type { ReactElement } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useNavigation } from '../../../renderer/store/navigation';
import { useTask } from '../../../renderer/store/task';
import type { TrackerTask } from '../../../core/domain/tracker';
import styles from './KanbanBoard.module.css';

interface TaskCardProps {
  readonly task: TrackerTask;
  readonly isDragging?: boolean;
}

export function TaskCard({ task, isDragging: externalDragging }: TaskCardProps): ReactElement {
  const openTab = useNavigation((s) => s.openTab);
  const setCurrent = useTask((s) => s.setCurrent);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const isAnyDragging = isDragging || externalDragging;

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
  };

  const handleClick = (e: React.MouseEvent): void => {
    if (isDragging) { e.stopPropagation(); return; }
    void window.sherpa.task.get(task.id).then((t) => {
      if (t) {
        setCurrent(t);
        openTab({ kind: 'task', params: { taskId: task.id }, title: task.title });
      }
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.card}${isAnyDragging ? ` ${styles.cardDragging}` : ''}`}
      data-testid={`task-card-${task.id}`}
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      <span className={styles.cardTitle}>{task.title || task.id}</span>
      <div className={styles.cardMeta}>
        <span className={styles.cardStatus} data-status={task.status} />
        <span className={styles.cardId}>{task.id}</span>
      </div>
    </div>
  );
}
