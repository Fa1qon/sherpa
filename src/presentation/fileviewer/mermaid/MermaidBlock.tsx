import { useEffect, useRef, useState, useId, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { getMermaid } from './mermaid_loader';
import styles from './MermaidBlock.module.css';

interface Props {
  source: string;
}

export function MermaidBlock({ source }: Props): ReactElement {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const renderId = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPending(true);
    (async () => {
      try {
        const m = await getMermaid();
        const { svg } = await m.render(renderId, source);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setPending(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err instanceof Error ? err.message : err));
          setPending(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [source, renderId]);

  if (error) {
    return (
      <div className={styles.error} role="alert">
        <div className={styles.errorTitle}>{t('mermaid.renderError', 'Mermaid syntax error')}</div>
        <pre className={styles.errorMsg}>{error}</pre>
        <pre className={styles.errorSource}>{source}</pre>
      </div>
    );
  }

  return (
    <div className={styles.block}>
      {pending && <div className={styles.pending}>{t('mermaid.rendering', 'Rendering…')}</div>}
      <div ref={containerRef} className={styles.svgHost} aria-label="mermaid-diagram" />
    </div>
  );
}
