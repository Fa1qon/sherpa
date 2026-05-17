// src/presentation/screens/TaskWorkspace/TaskControls/TaskControls.tsx
// Plan 8 Task 19 — Bottom controls strip for an active task.
// Plan 8-fix Task 4 — buttons now drive the live adapter session via
// TaskSupervisor IPC. Visibility prefers the live `runtime.status` from
// the renderer task store (populated by `engine_event` envelopes); when
// runtime is 'inactive' (no live engine attached, e.g. a paused task
// re-opened after restart) we fall back to meta.status.
//
// Visible buttons by effective status:
//   - 'running'   → Pause + Cancel
//   - 'paused'    → Resume + Cancel
//   - other       → none
//
// Click handlers invoke `window.sherpa.task.pause` / `task.resume` /
// `task.cancel`. Pause/resume include `projectPath` because the IPC
// handler may fall back to meta-only mutation; `cancel` only needs the
// taskId (the supervisor owns the live session).
import { useCallback, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { TaskMeta, TaskMetaStatus } from '../../../../core/domain/task_meta';
import { useTask } from '../../../../renderer/store/task';
import styles from './TaskControls.module.css';

interface Props {
  readonly projectPath: string;
  readonly taskId: string;
  readonly meta: TaskMeta | null;
  /** Optional running totals — undefined renders the placeholder. */
  readonly totalTokens?: { input: number; output: number };
  /** Called after a successful pause/resume/cancel so the parent can refresh meta. */
  readonly onChanged?: () => void;
}

/** Effective lifecycle status for control visibility. */
type EffectiveStatus = 'running' | 'paused' | 'completed' | 'failed' | 'inactive';

/**
 * Resolve effective status from live runtime + persisted meta. Runtime
 * wins when it has a live signal (anything other than 'inactive'); else
 * we map meta.status into the runtime vocabulary.
 */
export function resolveEffectiveStatus(
  runtimeStatus: 'inactive' | 'running' | 'paused' | 'completed' | 'failed',
  metaStatus: TaskMetaStatus | undefined,
): EffectiveStatus {
  if (runtimeStatus !== 'inactive') return runtimeStatus;
  switch (metaStatus) {
    case 'active':
      return 'running';
    case 'paused':
      return 'paused';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'inactive';
  }
}

export function TaskControls({
  projectPath,
  taskId,
  meta,
  totalTokens,
  onChanged,
}: Props): ReactElement {
  const { t } = useTranslation();
  const runtimeStatus = useTask((s) => s.runtime.status);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const status = resolveEffectiveStatus(runtimeStatus, meta?.status);
  const showPause = status === 'running';
  const showResume = status === 'paused';
  const showCancel = status === 'running' || status === 'paused';

  const tokensLabel: string =
    totalTokens && totalTokens.input + totalTokens.output > 0
      ? `${totalTokens.input + totalTokens.output} ${t('taskControls.tokens', 'tokens')}`
      : '—';

  const handlePause = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await window.sherpa.task.pause({ projectPath, taskId });
      if (!res.ok) {
        setError(t('taskControls.pauseFailed', { message: res.error }));
        return;
      }
      onChanged?.();
    } catch (err) {
      setError(t('taskControls.pauseFailed', { message: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }, [projectPath, taskId, onChanged, t]);

  const handleResume = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await window.sherpa.task.resume({ projectPath, taskId });
      if (!res.ok) {
        setError(t('taskControls.resumeFailed', { message: res.error }));
        return;
      }
      onChanged?.();
    } catch (err) {
      setError(t('taskControls.resumeFailed', { message: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }, [projectPath, taskId, onChanged, t]);

  const handleCancel = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await window.sherpa.task.cancel({ taskId });
      if (!res.ok) {
        setError(t('taskControls.cancelFailed', { message: res.error }));
        return;
      }
      onChanged?.();
    } catch (err) {
      setError(t('taskControls.cancelFailed', { message: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }, [taskId, onChanged, t]);

  return (
    <div className={styles.strip} data-testid="task-controls">
      <div className={styles.buttons}>
        {showPause && (
          <button
            type="button"
            className={styles.btn}
            onClick={() => void handlePause()}
            disabled={busy}
            data-testid="task-controls-pause"
          >
            {t('taskControls.pause', 'Pause')}
          </button>
        )}
        {showResume && (
          <button
            type="button"
            className={styles.btn}
            onClick={() => void handleResume()}
            disabled={busy}
            data-testid="task-controls-resume"
          >
            {t('taskControls.resume', 'Resume')}
          </button>
        )}
        {showCancel && (
          <button
            type="button"
            className={styles.btn}
            onClick={() => void handleCancel()}
            disabled={busy}
            data-testid="task-controls-cancel"
          >
            {t('taskControls.cancel', 'Cancel')}
          </button>
        )}
      </div>
      {error && (
        <div className={styles.error} role="alert" data-testid="task-controls-error">
          {error}
        </div>
      )}
      <div className={styles.tokens} data-testid="task-controls-tokens">
        {tokensLabel}
      </div>
    </div>
  );
}
