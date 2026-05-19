import { useEffect, useState, type ReactElement } from 'react';
import { getHighlighter, supportedLangs } from './shiki_loader';
import styles from './ShikiCode.module.css';

interface Props {
  lang: string;
  code: string;
  theme: 'light' | 'dark';
}

export function ShikiCode({ lang, code, theme }: Props): ReactElement {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!supportedLangs().includes(lang)) {
          setError(true);
          return;
        }
        const h = await getHighlighter();
        const out = h.codeToHtml(code, {
          lang,
          theme: theme === 'light' ? 'github-light' : 'github-dark',
        });
        if (!cancelled) setHtml(out);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, lang, theme]);

  if (error || html === null) {
    return (
      <pre className={styles.fallback}>
        <code>{code}</code>
      </pre>
    );
  }
  return <div className={styles.shikiWrap} dangerouslySetInnerHTML={{ __html: html }} />;
}
