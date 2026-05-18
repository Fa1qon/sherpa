// src/presentation/screens/TaskWorkspace/StagesPanel/StagesPanel.tsx
// Plan 8 Task 19 — Right-sidebar stage indicator.
// Plan 8-fix Task 3 — layered with live runtime from useTask().runtime so
// stage state updates the moment an `engine_event` arrives (no 1s meta
// poll wait). Runtime defaults are empty/inactive, so cross-session
// loaded tasks (no live engine) still classify off `meta` alone.
//
// Per-stage status (priority: runtime ∪ meta):
//   - runtime.currentStageId === stage.id  → current (●)
//   - runtime.completedStages.includes id  → completed (✓)
//   - meta.current_stage === stage.id      → current (●)
//   - meta.stage_history[*].completed_at   → completed (✓)
//   - otherwise                            → pending (○)
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Methodology } from '../../../../core/domain/methodology';
import type { TaskMeta } from '../../../../core/domain/task_meta';
import { useTask, type TaskRuntime } from '../../../../renderer/store/task';
import styles from './StagesPanel.module.css';

type StageStatus = 'completed' | 'current' | 'pending';

interface Props {
  readonly methodology: Methodology | null;
  readonly meta: TaskMeta | null;
}

function classifyStage(
  meta: TaskMeta | null,
  runtime: TaskRuntime,
  taskStageId: string | undefined,
  stageId: string,
): StageStatus {
  // Completion: union of runtime events + persisted meta history.
  const runtimeCompleted = runtime.completedStages.includes(stageId);
  const history = meta?.stage_history ?? [];
  const metaCompleted = history.some(
    (h) => h.stage_id === stageId && Boolean(h.completed_at),
  );
  if (runtimeCompleted || metaCompleted) return 'completed';
  // Current: runtime wins (freshest), then meta, then task.stageId as fallback.
  if (runtime.currentStageId === stageId) return 'current';
  if (meta?.current_stage === stageId) return 'current';
  if (taskStageId === stageId) return 'current';
  return 'pending';
}

function iconFor(status: StageStatus): string {
  switch (status) {
    case 'completed':
      return '✓'; // ✓
    case 'current':
      return '●'; // ●
    case 'pending':
    default:
      return '○'; // ○
  }
}

export function StagesPanel({ methodology, meta }: Props): ReactElement {
  const { t } = useTranslation();
  const runtime = useTask((s) => s.runtime);
  const taskStageId = useTask((s) => s.current?.stageId);
  const stages = methodology?.stages ?? [];

  return (
    <section className={styles.panel} data-testid="stages-panel">
      <header className={styles.header}>
        <h3 className={styles.title}>{t('stagesPanel.title', 'Stages')}</h3>
      </header>
      {stages.length === 0 ? (
        <div className={styles.empty} data-testid="stages-empty">
          {t('stagesPanel.empty', 'No stages.')}
        </div>
      ) : (
        <ul className={styles.list} role="list">
          {stages.map((s) => {
            const status = classifyStage(meta, runtime, taskStageId, s.id);
            const statusLabel = t(`stagesPanel.status.${status}`);
            return (
              <li
                key={s.id}
                className={styles.row}
                data-testid={`stage-row-${s.id}`}
                data-status={status}
              >
                <span
                  className={styles.icon}
                  aria-label={statusLabel}
                  data-testid={`stage-icon-${s.id}`}
                >
                  {iconFor(status)}
                </span>
                <span className={styles.name} title={s.id}>
                  {s.name || s.id}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
