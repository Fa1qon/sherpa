// src/presentation/fileviewer/JupyterViewer.tsx
//
// Thin Jupyter (.ipynb) renderer that uses Sherpa's existing infrastructure
// (react-markdown, ShikiCode) instead of @nteract/notebook-render. That package
// pulls a 4 MB transitive tree with deprecated react-markdown@4, core-js@2 and
// 30+ npm-audit vulnerabilities — overkill when the .ipynb format is just JSON
// with cells we already know how to render.
//
// Supported cell types: markdown, code, raw.
// Supported output mime types: text/plain, text/html (sanitized), text/markdown,
// image/png, image/jpeg, image/svg+xml, application/json, stream stdout/stderr,
// error tracebacks (ANSI stripped, monospace).

import { useMemo, lazy, Suspense, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSettings } from '../../renderer/store/settings';
import type { ViewerProps } from './viewer_registry';
import styles from './JupyterViewer.module.css';

const LazyShikiCode = lazy(async () => {
  const mod = await import('./markdown/ShikiCode');
  return { default: mod.ShikiCode };
});

interface Cell {
  cell_type: 'markdown' | 'code' | 'raw';
  source: string | string[];
  outputs?: Output[];
  execution_count?: number | null;
  metadata?: Record<string, unknown>;
}

interface Output {
  output_type: 'stream' | 'execute_result' | 'display_data' | 'error';
  name?: string;
  text?: string | string[];
  data?: Record<string, unknown>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
  execution_count?: number | null;
}

interface Notebook {
  cells: Cell[];
  metadata?: {
    kernelspec?: { language?: string; name?: string };
    language_info?: { name?: string };
  };
  nbformat?: number;
  nbformat_minor?: number;
}

function joinSource(src: string | string[]): string {
  return Array.isArray(src) ? src.join('') : src;
}

function dataToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join('');
  return String(value ?? '');
}

// Strip ANSI escape codes from Jupyter error tracebacks
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, '');
}

function detectLanguage(nb: Notebook): string {
  return (
    nb.metadata?.kernelspec?.language ??
    nb.metadata?.language_info?.name ??
    'python'
  );
}

function CellOutput({ output, theme }: { output: Output; theme: 'light' | 'dark' }): ReactElement | null {
  if (output.output_type === 'stream') {
    const text = dataToString(output.text);
    const isErr = output.name === 'stderr';
    return (
      <pre className={isErr ? styles.streamErr : styles.streamOut}>{text}</pre>
    );
  }

  if (output.output_type === 'error') {
    const tb = (output.traceback ?? []).map(stripAnsi).join('\n');
    return (
      <pre className={styles.streamErr}>
        <strong>{output.ename}: {output.evalue}</strong>
        {tb ? `\n${tb}` : ''}
      </pre>
    );
  }

  // execute_result or display_data — pick best mime type
  const data = output.data ?? {};
  // priority: image/svg+xml > image/png > image/jpeg > text/html > text/markdown > application/json > text/plain
  if (typeof data['image/svg+xml'] === 'string' || Array.isArray(data['image/svg+xml'])) {
    return <div className={styles.imageWrap} dangerouslySetInnerHTML={{ __html: dataToString(data['image/svg+xml']) }} />;
  }
  if (typeof data['image/png'] === 'string') {
    return <img className={styles.image} alt="output" src={`data:image/png;base64,${data['image/png'] as string}`} />;
  }
  if (typeof data['image/jpeg'] === 'string') {
    return <img className={styles.image} alt="output" src={`data:image/jpeg;base64,${data['image/jpeg'] as string}`} />;
  }
  if (data['text/html'] !== undefined) {
    // text/html is potentially untrusted (plotly, IPython.display.HTML, etc.).
    // No DOMPurify in deps — render as text to be safe. If user wants rich
    // HTML output, future work can add sanitization.
    const text = dataToString(data['text/html']);
    return <pre className={styles.htmlFallback}>{text}</pre>;
  }
  if (data['text/markdown'] !== undefined) {
    return (
      <div className={styles.mdOutput}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{dataToString(data['text/markdown'])}</ReactMarkdown>
      </div>
    );
  }
  if (data['application/json'] !== undefined) {
    const value = data['application/json'];
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return (
      <Suspense fallback={<pre className={styles.streamOut}>{text}</pre>}>
        <LazyShikiCode lang="json" code={text} theme={theme} />
      </Suspense>
    );
  }
  if (data['text/plain'] !== undefined) {
    return <pre className={styles.streamOut}>{dataToString(data['text/plain'])}</pre>;
  }
  return null;
}

function CellView({ cell, language, theme }: { cell: Cell; language: string; theme: 'light' | 'dark' }): ReactElement {
  const source = joinSource(cell.source);

  if (cell.cell_type === 'markdown') {
    return (
      <div className={styles.cellMarkdown}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
      </div>
    );
  }

  if (cell.cell_type === 'raw') {
    return <pre className={styles.cellRaw}>{source}</pre>;
  }

  // code
  return (
    <div className={styles.cellCode}>
      <div className={styles.codeRow}>
        <span className={styles.execCount}>
          [{cell.execution_count ?? ' '}]:
        </span>
        <div className={styles.codeBody}>
          <Suspense fallback={<pre className={styles.codeFallback}><code>{source}</code></pre>}>
            <LazyShikiCode lang={language} code={source} theme={theme} />
          </Suspense>
        </div>
      </div>
      {cell.outputs && cell.outputs.length > 0 && (
        <div className={styles.outputs}>
          {cell.outputs.map((out, idx) => (
            <CellOutput key={idx} output={out} theme={theme} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ParseResult {
  notebook: Notebook | null;
  error: string | null;
}

export function JupyterViewer({ content }: ViewerProps): ReactElement {
  const { t } = useTranslation();
  const theme = useSettings((s) => s.user.theme);
  const cmTheme: 'light' | 'dark' = theme === 'light' ? 'light' : 'dark';

  const { notebook, error }: ParseResult = useMemo(() => {
    const raw = (content ?? '').trim();
    if (!raw) {
      return { notebook: null, error: 'Empty notebook' };
    }
    try {
      const parsed = JSON.parse(raw) as Notebook;
      if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.cells)) {
        return {
          notebook: null,
          error: 'Not a valid Jupyter notebook (missing cells array)',
        };
      }
      return { notebook: parsed, error: null };
    } catch (err) {
      return {
        notebook: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [content]);

  if (error !== null || notebook === null) {
    return (
      <div className={styles.error} role="alert">
        <div className={styles.errorTitle}>
          {t('jupyter.parseError', 'Jupyter notebook parse error')}
        </div>
        <pre className={styles.errorBody}>{error ?? ''}</pre>
      </div>
    );
  }

  const language = detectLanguage(notebook);

  return (
    <div className={styles.wrapper}>
      <div className={styles.notebook}>
        {notebook.cells.map((cell, idx) => (
          <CellView key={idx} cell={cell} language={language} theme={cmTheme} />
        ))}
      </div>
    </div>
  );
}
