import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './MarkmapBlock.module.css';

interface Props {
  source: string;
}

export function MarkmapBlock({ source }: Props): ReactElement {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const [{ Transformer }, { Markmap }] = await Promise.all([
          import('markmap-lib'),
          import('markmap-view'),
        ]);
        if (cancelled || !svgRef.current) return;
        const transformer = new Transformer();
        const { root } = transformer.transform(source);
        svgRef.current.innerHTML = '';
        const mm = Markmap.create(svgRef.current, { autoFit: true }, root);
        await mm.fit();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (error) {
    return (
      <div className={styles.error} role="alert">
        <div className={styles.errorTitle}>{t('markmap.error', 'Markmap error')}</div>
        <pre>{error}</pre>
      </div>
    );
  }

  return (
    <div className={styles.block}>
      <svg ref={svgRef} className={styles.svg} aria-label="markmap" />
    </div>
  );
}
