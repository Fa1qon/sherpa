// src/presentation/fileviewer/FileViewer.tsx
import { useState, useEffect, lazy, Suspense, useMemo, type ReactElement, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '../../renderer/store/navigation';
import { useProject } from '../../renderer/store/project';
import { ipcClient } from '../../renderer/ipc/client';
import { resolveViewer, type ViewerProps } from './viewer_registry';
import styles from './FileViewer.module.css';

function extOf(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx <= 0 || idx === name.length - 1) return '';
  return name.slice(idx + 1).toLowerCase();
}

export function FileViewer(): ReactElement {
  const { t } = useTranslation();
  const activeTabId = useNavigation((s) => s.activeTabId);
  const tabs = useNavigation((s) => s.tabs);
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const projectPath = useProject((s) => s.current?.path ?? '');

  const relPath = activeTab?.params?.relPath ?? '';
  const fileName = relPath.split('/').pop() ?? relPath;
  const ext = extOf(fileName);
  const entry = useMemo(() => (ext ? resolveViewer(ext) : null), [ext]);

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!relPath || !projectPath || !entry) return;
    let cancelled = false;
    setContent(null);
    setLoading(true);
    setError(null);
    const load = entry.loadMode === 'binary'
      ? ipcClient.files().readBinary(projectPath, relPath)
      : ipcClient.files().readFile(projectPath, relPath);
    load
      .then((c) => { if (!cancelled) { setContent(c); setLoading(false); } })
      .catch((err: unknown) => {
        if (!cancelled) { setError(String(err)); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [relPath, projectPath, entry]);

  const LazyViewer = useMemo<ComponentType<ViewerProps> | null>(() => {
    if (!entry) return null;
    return lazy(async () => {
      const mod = await entry.loader();
      return { default: mod.Viewer };
    });
  }, [entry]);

  if (!relPath) {
    return (
      <div className={styles.viewer}>
        <div className={`${styles.centered} ${styles.error}`}>
          {t('fileviewer.error', 'Ошибка: файл не указан')}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.viewer}>
      <div className={styles.toolbar}>
        <div className={styles.breadcrumb}>
          <span className={styles.fileName}>{fileName}</span>
          {relPath !== fileName && (
            <span title={relPath} style={{ opacity: 0.5, fontSize: 'var(--font-size-xs)' }}>
              {' '}· {relPath}
            </span>
          )}
        </div>
      </div>
      <div className={styles.content}>
        {!entry && (
          <div className={styles.centered}>
            {t('fileviewer.unsupported', 'Формат не поддерживается')}
          </div>
        )}
        {entry && loading && (
          <div className={styles.centered}>{t('fileviewer.loading', 'Загрузка…')}</div>
        )}
        {entry && error && (
          <div className={`${styles.centered} ${styles.error}`}>{error}</div>
        )}
        {entry && !loading && !error && content !== null && LazyViewer && (
          <Suspense fallback={<div className={styles.centered}>{t('fileviewer.loading', 'Загрузка…')}</div>}>
            <LazyViewer
              key={relPath}
              content={content}
              ext={ext}
              projectPath={projectPath}
              relPath={relPath}
              onSave={async (c) => {
                await ipcClient.files().writeFile(projectPath, relPath, c);
                setContent(c);
              }}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
