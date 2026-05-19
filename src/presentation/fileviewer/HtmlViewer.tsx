// src/presentation/fileviewer/HtmlViewer.tsx
//
// Preview of an .html file from the project. Rewritten in v0.24.5 to use
// the <webview> tag (lives in React DOM, CSS positioned) instead of the
// brittle UserBrowser/setBounds overlay.

import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ViewerProps } from './viewer_registry';
import styles from './HtmlViewer.module.css';

function buildFileUrl(projectPath: string, relPath: string): string {
  const abs = `${projectPath}/${relPath}`.replace(/\\/g, '/').replace(/\/+/g, '/');
  return abs.startsWith('/') ? `file://${abs}` : `file:///${abs}`;
}

export function HtmlViewer({ projectPath, relPath }: ViewerProps): ReactElement {
  const { t } = useTranslation();
  const fileUrl = buildFileUrl(projectPath, relPath);

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.label}>{t('fileviewer.htmlPreview', 'HTML Preview')}</span>
      </div>
      <webview
        src={fileUrl}
        className={styles.webview}
        allowpopups
        aria-label={t('fileviewer.htmlPreview', 'HTML Preview')}
      />
    </div>
  );
}
