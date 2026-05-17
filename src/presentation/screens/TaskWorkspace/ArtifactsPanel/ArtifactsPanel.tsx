// src/presentation/screens/TaskWorkspace/ArtifactsPanel/ArtifactsPanel.tsx
// Plan 8 Task 19 — Right-sidebar artifact list.
// Plan 8-fix Task 3 — additionally refreshes the polled list whenever an
// `artifact_written` engine event arrives (observed via
// useTask().runtime.artifacts.length). The 1500ms polling stays as a
// fallback for filesystem changes the engine didn't trace.
//
// Polls `window.sherpa.task.artifactsList` every 1500ms to surface files
// the engine writes inside `<project>/.sherpa/tasks/<taskId>/`. Clicking a
// row fetches it via `task.artifactRead` and shows its contents in a
// preformatted preview pane. The preview pane is local to this panel.
//
// Errors are surfaced inline and never crash the panel.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useTask } from '../../../../renderer/store/task';
import styles from './ArtifactsPanel.module.css';

interface Props {
  readonly projectPath: string;
  readonly taskId: string;
  /**
   * Override the auto-refresh interval in milliseconds. Set to 0 / negative
   * to disable polling (used by tests). Default: 1500 ms.
   */
  readonly pollMs?: number;
}

type PreviewState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'loading'; readonly path: string }
  | { readonly kind: 'ok'; readonly path: string; readonly content: string }
  | { readonly kind: 'error'; readonly path: string; readonly message: string };

export function ArtifactsPanel({
  projectPath,
  taskId,
  pollMs = 1500,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [files, setFiles] = useState<readonly string[]>([]);
  const [preview, setPreview] = useState<PreviewState>({ kind: 'closed' });
  const mountedRef = useRef<boolean>(true);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const list = await window.sherpa.task.artifactsList({ projectPath, taskId });
      if (!mountedRef.current) return;
      setFiles(list);
    } catch {
      // Best-effort polling — swallow transient IPC errors.
      if (!mountedRef.current) return;
      setFiles([]);
    }
  }, [projectPath, taskId]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    if (pollMs <= 0) {
      return () => {
        mountedRef.current = false;
      };
    }
    const id = setInterval(() => {
      void refresh();
    }, pollMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [refresh, pollMs]);

  // Engine-event-driven refresh: when an `artifact_written` event lands
  // in the runtime store, the artifacts array length grows; we kick a
  // refresh so the polled directory listing converges immediately
  // instead of waiting up to `pollMs` for the next interval tick.
  // Skip the initial mount call (refresh already runs above) by tracking
  // the last-seen length in a ref.
  const runtimeArtifactCount = useTask((s) => s.runtime.artifacts.length);
  const lastSeenCountRef = useRef<number>(runtimeArtifactCount);
  useEffect(() => {
    if (runtimeArtifactCount > lastSeenCountRef.current) {
      lastSeenCountRef.current = runtimeArtifactCount;
      void refresh();
    } else if (runtimeArtifactCount < lastSeenCountRef.current) {
      // Runtime was reset (e.g. setCurrent on a new task) — resync.
      lastSeenCountRef.current = runtimeArtifactCount;
    }
  }, [runtimeArtifactCount, refresh]);

  const openFile = useCallback(
    async (relPath: string): Promise<void> => {
      setPreview({ kind: 'loading', path: relPath });
      try {
        const result = await window.sherpa.task.artifactRead({
          projectPath,
          taskId,
          relPath,
        });
        if (!mountedRef.current) return;
        if (result.ok) {
          setPreview({ kind: 'ok', path: relPath, content: result.content });
        } else {
          setPreview({ kind: 'error', path: relPath, message: result.error });
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setPreview({
          kind: 'error',
          path: relPath,
          message: (err as Error).message,
        });
      }
    },
    [projectPath, taskId],
  );

  return (
    <section className={styles.panel} data-testid="artifacts-panel">
      <header className={styles.header}>
        <h3 className={styles.title}>{t('artifactsPanel.title', 'Artifacts')}</h3>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={() => void refresh()}
          data-testid="artifacts-refresh-btn"
        >
          {t('artifactsPanel.refresh', 'Refresh')}
        </button>
      </header>
      {files.length === 0 ? (
        <div className={styles.empty} data-testid="artifacts-empty">
          {t('artifactsPanel.empty', 'No artifacts yet.')}
        </div>
      ) : (
        <ul className={styles.list} role="list">
          {files.map((f) => (
            <li key={f} className={styles.row}>
              <button
                type="button"
                className={styles.fileBtn}
                onClick={() => void openFile(f)}
                data-testid={`artifact-row-${f}`}
                title={f}
              >
                {f}
              </button>
            </li>
          ))}
        </ul>
      )}
      {preview.kind !== 'closed' && (
        <div className={styles.previewBox} data-testid="artifact-preview">
          <div className={styles.previewHeader}>
            <span className={styles.previewPath}>{preview.path}</span>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => setPreview({ kind: 'closed' })}
              data-testid="artifact-preview-close"
              aria-label={t('artifactsPanel.close', 'Close')}
            >
              ×
            </button>
          </div>
          {preview.kind === 'loading' && (
            <div className={styles.previewLoading}>{t('common.loading', 'Loading…')}</div>
          )}
          {preview.kind === 'error' && (
            <div className={styles.previewError} data-testid="artifact-preview-error">
              {t('artifactsPanel.loadError', { message: preview.message })}
            </div>
          )}
          {preview.kind === 'ok' && (
            <pre className={styles.previewContent} data-testid="artifact-preview-content">
              {preview.content}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
