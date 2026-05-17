// src/presentation/screens/Tracker/KanbanBoard.tsx
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useProject } from '../../../renderer/store/project';
import { useTracker } from '../../../renderer/store/tracker';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { BoardSettings } from './BoardSettings';
import styles from './KanbanBoard.module.css';

export function KanbanBoard(): ReactElement {
  const { t } = useTranslation();
  const project = useProject((s) => s.current);
  const { boardConfig, tasks, loading, error, loadBoard, moveToStage } = useTracker();
  const [showSettings, setShowSettings] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (project) void loadBoard(project.path);
  }, [project, loadBoard]);

  const handleDragStart = (e: DragStartEvent): void => {
    setActiveTaskId(e.active.id as string);
  };

  const handleDragOver = (e: DragOverEvent): void => {
    const { over } = e;
    const stageId = over?.id as string | undefined;
    const isStage = boardConfig?.stages.some((s) => s.id === stageId) ?? false;
    setOverStageId(isStage ? (stageId ?? null) : null);
  };

  const handleDragEnd = (e: DragEndEvent): void => {
    const { active, over } = e;
    setActiveTaskId(null);
    setOverStageId(null);
    if (!over || !project) return;
    const stageId = over.id as string;
    const isStage = boardConfig?.stages.some((s) => s.id === stageId) ?? false;
    if (!isStage) return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task || task.stageId === stageId) return;
    void moveToStage(project.path, task.id, stageId);
  };

  if (!project) return <div className={styles.empty}>{t('tracker.noProject', 'No project open.')}</div>;
  if (loading) return <div className={styles.loading}>{t('common.loading', 'Loading…')}</div>;
  if (error) return <div className={styles.empty}>{error}</div>;
  if (!boardConfig) return <div className={styles.empty}>{t('tracker.noBoard', 'No board.')}</div>;

  const activeTask = activeTaskId ? tasks.find((t) => t.id === activeTaskId) : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className={styles.board} data-testid="kanban-board">
        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>{t('tracker.board', 'Board')}</span>
          <button
            type="button"
            className={styles.settingsBtn}
            onClick={() => setShowSettings(true)}
            data-testid="board-settings-btn"
          >
            &#9881; {t('tracker.settings', 'Settings')}
          </button>
        </div>
        <div className={styles.columns}>
          {[...boardConfig.stages]
            .sort((a, b) => a.order - b.order)
            .map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                isOver={overStageId === stage.id}
                activeTaskId={activeTaskId}
              />
            ))}
        </div>
      </div>
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
      </DragOverlay>
      {showSettings && <BoardSettings onClose={() => setShowSettings(false)} />}
    </DndContext>
  );
}
