import { useEffect, useMemo, useState, type ReactElement, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../../renderer/store/settings';
import type { ViewerProps } from '../viewer_registry';
import styles from './ExcalidrawViewer.module.css';

const Excalidraw = lazy(async () => {
  const [mod] = await Promise.all([
    import('@excalidraw/excalidraw'),
    import('@excalidraw/excalidraw/index.css'),
  ]);
  return { default: mod.Excalidraw };
});

interface SceneData {
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

interface ExcalidrawAppStateLike {
  viewBackgroundColor?: string;
  gridSize?: number | null;
  [k: string]: unknown;
}

export function ExcalidrawViewer({ content, onSave }: ViewerProps): ReactElement {
  const { t } = useTranslation();
  const theme = useSettings((s) => s.user.theme);
  const [parseError, setParseError] = useState<string | null>(null);
  const [scene, setScene] = useState<SceneData | null>(null);
  const [readonly, setReadonly] = useState(true);

  useEffect(() => {
    try {
      const parsed = JSON.parse(content || '{}') as SceneData;
      setScene(parsed);
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
  }, [content]);

  const debouncedSave = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (json: string): void => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => { void onSave?.(json); }, 600);
    };
  }, [onSave]);

  if (parseError) {
    return (
      <div className={styles.error} role="alert">
        <div className={styles.errorTitle}>{t('excalidraw.parseError', 'Excalidraw parse error')}</div>
        <pre>{parseError}</pre>
      </div>
    );
  }

  const handleChange = (
    elements: readonly unknown[],
    appState: ExcalidrawAppStateLike,
    files: Record<string, unknown>,
  ): void => {
    if (readonly || !onSave) return;
    const out = JSON.stringify({
      type: 'excalidraw',
      version: 2,
      source: 'sherpa-ui',
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
      },
      files,
    }, null, 2);
    debouncedSave(out);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={() => setReadonly((r) => !r)}
        >
          {readonly
            ? t('excalidraw.edit', 'Edit')
            : t('excalidraw.viewOnly', 'View only')}
        </button>
      </div>
      <div className={styles.canvas}>
        <Suspense fallback={<div className={styles.loading}>{t('fileviewer.loading', 'Loading…')}</div>}>
          <Excalidraw
            initialData={(scene ?? undefined) as unknown as Parameters<typeof Excalidraw>[0]['initialData']}
            theme={theme === 'light' ? 'light' : 'dark'}
            viewModeEnabled={readonly}
            onChange={handleChange as unknown as Parameters<typeof Excalidraw>[0]['onChange']}
          />
        </Suspense>
      </div>
    </div>
  );
}
