import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ViewerProps } from '../viewer_registry';
import styles from './BpmnViewer.module.css';

// bpmn-js stylesheets — loaded with this file's lazy chunk because this
// module is dynamically imported by register_default_viewers.ts.
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';

interface BpmnLikeViewer {
  destroy: () => void;
  importXML: (xml: string) => Promise<unknown>;
  get: (s: string) => { zoom: (a: string) => void };
}

export function BpmnViewer({ content }: ViewerProps): ReactElement {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let viewer: BpmnLikeViewer | null = null;
    let cancelled = false;
    setError(null);

    void (async () => {
      try {
        const { default: NavigatedViewer } = await import('bpmn-js/lib/NavigatedViewer');
        if (cancelled || !containerRef.current) return;
        viewer = new NavigatedViewer({ container: containerRef.current }) as unknown as BpmnLikeViewer;
        await viewer.importXML(content);
        viewer.get('canvas').zoom('fit-viewport');
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (viewer) {
        try {
          viewer.destroy();
        } catch {
          /* ignore */
        }
      }
    };
  }, [content]);

  if (error) {
    return (
      <div className={styles.error} role="alert">
        <div className={styles.errorTitle}>{t('bpmn.parseError', 'BPMN parse error')}</div>
        <pre className={styles.errorMsg}>{error}</pre>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div ref={containerRef} className={styles.canvas} aria-label="bpmn-diagram" />
    </div>
  );
}
