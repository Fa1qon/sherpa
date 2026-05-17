// src/presentation/fileviewer/FileViewer.tsx
import { useState, useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '../../renderer/store/navigation';
import { useProject } from '../../renderer/store/project';
import { ipcClient } from '../../renderer/ipc/client';
import { getFileType } from './fileType';
import { CodeViewer } from './CodeViewer';
import { MarkdownViewer } from './MarkdownViewer';
import { ImageViewer } from './ImageViewer';
import { CsvViewer } from './CsvViewer';
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
  const fileType = relPath ? getFileType(ext) : null;

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!relPath || !projectPath) return;
    let cancelled = false;
    setContent(null);
    setLoading(true);
    setError(null);
    const load = fileType === 'image'
      ? ipcClient.files().readBinary(projectPath, relPath)
      : ipcClient.files().readFile(projectPath, relPath);
    load
      .then((c) => { if (!cancelled) { setContent(c); setLoading(false); } })
      .catch((err: unknown) => {
        if (!cancelled) { setError(String(err)); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [relPath, projectPath, fileType]);

  if (!relPath) {
    return (
      <div className={styles.viewer}>
        <div className={`${styles.centered} ${styles.error}`}>{t('fileviewer.error', 'Ошибка: файл не указан')}</div>
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
        {loading && <div className={styles.centered}>{t('fileviewer.loading', 'Загрузка…')}</div>}
        {error && <div className={`${styles.centered} ${styles.error}`}>{error}</div>}
        {!loading && !error && content !== null && fileType === 'code' && (
          <CodeViewer
            key={relPath}
            content={content}
            ext={ext}
            onSave={async (c) => { await ipcClient.files().writeFile(projectPath, relPath, c); setContent(c); }}
          />
        )}
        {!loading && !error && content !== null && fileType === 'text' && (
          <CodeViewer
            key={relPath}
            content={content}
            ext=""
            onSave={async (c) => { await ipcClient.files().writeFile(projectPath, relPath, c); setContent(c); }}
          />
        )}
        {!loading && !error && content !== null && fileType === 'markdown' && (
          <MarkdownViewer
            key={relPath}
            content={content}
            projectPath={projectPath}
            relPath={relPath}
            onSave={async (c) => { await ipcClient.files().writeFile(projectPath, relPath, c); setContent(c); }}
          />
        )}
        {!loading && !error && content !== null && fileType === 'image' && (
          <ImageViewer base64={content} ext={ext} />
        )}
        {!loading && !error && content !== null && fileType === 'csv' && (
          <CsvViewer content={content} ext={ext} />
        )}
        {!loading && !error && content !== null && fileType === 'binary' && (
          <div className={styles.centered}>{t('fileviewer.binary', 'Бинарный файл — просмотр недоступен')}</div>
        )}
      </div>
    </div>
  );
}
