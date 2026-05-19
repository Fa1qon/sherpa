// src/presentation/fileviewer/PdfViewer.tsx
//
// .pdf preview via Electron's bundled Chromium PDFium. Rewritten in
// v0.24.5 to use a <webview> with plugins=true (lives in React DOM,
// CSS positioned).

import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ViewerProps } from './viewer_registry';
import styles from './PdfViewer.module.css';

function buildFileUrl(projectPath: string, relPath: string): string {
  const abs = `${projectPath}/${relPath}`.replace(/\\/g, '/').replace(/\/+/g, '/');
  return abs.startsWith('/') ? `file://${abs}` : `file:///${abs}`;
}

export function PdfViewer({ projectPath, relPath }: ViewerProps): ReactElement {
  const { t } = useTranslation();
  const fileUrl = buildFileUrl(projectPath, relPath);

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.label}>{t('fileviewer.pdf', 'PDF')}</span>
      </div>
      <webview
        src={fileUrl}
        className={styles.webview}
        webpreferences="plugins=true"
        aria-label="pdf"
      />
    </div>
  );
}
