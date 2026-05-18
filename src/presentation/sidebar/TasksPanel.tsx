import { useEffect, useState, useCallback, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { useProject } from '../../renderer/store/project';
import { useTask } from '../../renderer/store/task';
import { useNavigation } from '../../renderer/store/navigation';
import { ipcClient } from '../../renderer/ipc/client';
import type { Task } from '../../core/domain/task';
import styles from './FilesPanel.module.css';
import taskStyles from './TasksPanel.module.css';

function makeTempId(): string {
  return `new-${Math.random().toString(36).slice(2, 10)}`;
}

interface ContextMenu {
  taskId: string;
  x: number;
  y: number;
}

interface ConfirmDelete {
  task: Task;
}

export function TasksPanel(): ReactElement {
  const { t } = useTranslation();
  const project = useProject((s) => s.current);
  const currentTask = useTask((s) => s.current);
  const setCurrent = useTask((s) => s.setCurrent);
  const openTab = useNavigation((s) => s.openTab);
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null);

  const refresh = useCallback(() => {
    if (!project) return;
    void ipcClient.task().list(project.path).then(setTasks);
  }, [project]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refresh the task list when any task event arrives so externally-created
  // tasks (e.g. via IPC from a test or plugin) appear without requiring a
  // manual sidebar refresh.
  useEffect(() => {
    return window.sherpa.task.onEvent(() => {
      refresh();
    });
  }, [refresh]);

  const handleNewTask = (): void => {
    if (!project) return;
    setCurrent(null);
    openTab({ kind: 'task', params: { taskId: makeTempId() }, title: t('task.new', 'Новая задача') });
  };

  const handleOpenBoard = (): void => {
    openTab({ kind: 'tracker', title: t('tracker.board', 'Board') });
  };

  const handleOpenTask = (task: Task): void => {
    setCurrent(task);
    openTab({ kind: 'task', params: { taskId: task.id }, title: task.title ?? task.id });
  };

  const handleContextMenu = (e: React.MouseEvent, task: Task): void => {
    e.preventDefault();
    setContextMenu({ taskId: task.id, x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = (): void => setContextMenu(null);

  const confirmDeleteTask = (task: Task): void => {
    setConfirmDelete({ task });
    closeContextMenu();
  };

  const executeDelete = async (): Promise<void> => {
    if (!confirmDelete) return;
    const { task } = confirmDelete;
    try {
      await ipcClient.task().delete(task.id);
      setConfirmDelete(null);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      if (currentTask?.id === task.id) setCurrent(null);
    } catch {
      setConfirmDelete(null);
    }
  };

  if (!project) {
    return <div className={styles.empty}>{t('sidebar.noProject')}</div>;
  }

  const sorted = [...tasks].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <>
      <div className={styles.panel}>
        <div className={taskStyles.toolbar}>
          <button
            type="button"
            className={taskStyles.newBtn}
            onClick={handleNewTask}
            title={t('task.new', 'Новая задача')}
          >
            <Plus size={14} strokeWidth={2} />
            <span>{t('task.new', 'Новая задача')}</span>
          </button>
          <button
            type="button"
            className={taskStyles.boardBtn}
            onClick={handleOpenBoard}
            data-testid="open-board-btn"
            title={t('tracker.board', 'Board')}
          >
            &#8862;
          </button>
        </div>
        {sorted.length === 0 ? (
          <div className={styles.empty}>{t('sidebar.noTasks', 'Задач нет')}</div>
        ) : (
          <ul className={taskStyles.list}>
            {sorted.map((task) => (
              <li key={task.id} className={taskStyles.row}>
                <button
                  type="button"
                  className={taskStyles.item}
                  data-active={task.id === currentTask?.id}
                  onClick={() => handleOpenTask(task)}
                  onContextMenu={(e) => handleContextMenu(e, task)}
                  title={task.title ?? task.id}
                >
                  <span className={taskStyles.titleGroup}>
                    <span className={taskStyles.title}>
                      {task.title ?? t('task.untitled', 'Без названия')}
                    </span>
                    {task.methodologyId && task.stageId && (
                      <span
                        className={taskStyles.stageLabel}
                        data-testid="stage-label"
                        title={task.stageId}
                      >
                        {task.stageId}
                      </span>
                    )}
                  </span>
                  <span className={taskStyles.meta}>
                    {task.thread.length > 0 && (
                      <span className={taskStyles.msgCount}>
                        {task.thread.filter((m) => m.role === 'user' || m.role === 'agent').length}
                      </span>
                    )}
                    <span className={taskStyles.status} data-status={task.status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {contextMenu && (
        <>
          <div className={taskStyles.ctxOverlay} onClick={closeContextMenu} />
          <div
            className={taskStyles.ctxMenu}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
          >
            {(() => {
              const task = sorted.find((t) => t.id === contextMenu.taskId);
              if (!task) return null;
              return (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className={taskStyles.ctxItem}
                    onClick={() => { handleOpenTask(task); closeContextMenu(); }}
                  >
                    {t('task.open', 'Открыть')}
                  </button>
                  <div className={taskStyles.ctxSep} />
                  <button
                    type="button"
                    role="menuitem"
                    className={`${taskStyles.ctxItem} ${taskStyles.ctxItemDanger}`}
                    onClick={() => confirmDeleteTask(task)}
                  >
                    {t('task.delete', 'Удалить задачу')}
                  </button>
                </>
              );
            })()}
          </div>
        </>
      )}

      {confirmDelete && (
        <div className={taskStyles.confirmOverlay}>
          <div className={taskStyles.confirmDialog} role="alertdialog">
            <p className={taskStyles.confirmMsg}>
              {t('task.deleteConfirm', 'Удалить задачу «{{title}}»?', {
                title: confirmDelete.task.title ?? confirmDelete.task.id,
              })}
            </p>
            <div className={taskStyles.confirmActions}>
              <button
                type="button"
                className={taskStyles.confirmCancel}
                onClick={() => setConfirmDelete(null)}
              >
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                type="button"
                className={taskStyles.confirmDelete}
                onClick={() => void executeDelete()}
              >
                {t('task.delete', 'Удалить')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
