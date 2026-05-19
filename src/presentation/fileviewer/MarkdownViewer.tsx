// src/presentation/fileviewer/MarkdownViewer.tsx
import { Suspense, lazy, useEffect, useMemo, useState, useCallback, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import CodeMirror from '@uiw/react-codemirror';
import { markdown as mdLang } from '@codemirror/lang-markdown';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../renderer/store/settings';
import { setMermaidTheme } from './mermaid/mermaid_loader';
import { isMindmapDoc, parseFrontmatter } from './markmap/frontmatter';
import type { ViewerProps } from './viewer_registry';
import { toSherpaFileUrl } from '../../renderer/util/sherpa_file_url';
import styles from './MarkdownViewer.module.css';

const LazyMermaidBlock = lazy(async () => {
  const mod = await import('./mermaid/MermaidBlock');
  return { default: mod.MermaidBlock };
});

const LazyMarkmapBlock = lazy(async () => {
  const mod = await import('./markmap/MarkmapBlock');
  return { default: mod.MarkmapBlock };
});

const LazyShikiCode = lazy(async () => {
  const mod = await import('./markdown/ShikiCode');
  return { default: mod.ShikiCode };
});

const MERMAID_LANGS = new Set([
  'mermaid', 'c4', 'sequence', 'dataflow', 'gantt', 'state', 'mindmap',
]);

type Mode = 'view' | 'edit';

export function MarkdownViewer({ content, relPath, onSave }: ViewerProps): ReactElement {
  const { t } = useTranslation();
  const theme = useSettings((s) => s.user.theme);
  const cmTheme = theme === 'light' ? 'light' : 'dark';
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMermaidTheme(theme === 'light' ? 'light' : 'dark');
  }, [theme]);

  const enterEdit = (): void => {
    setDraft(content);
    setMode('edit');
  };

  const cancel = (): void => {
    setDraft(content);
    setMode('view');
  };

  const isMindmap = useMemo(() => isMindmapDoc(content), [content]);
  const mindmapBody = useMemo(() => parseFrontmatter(content).body, [content]);

  const mdComponents = useMemo<ComponentProps<typeof ReactMarkdown>['components']>(() => ({
    code(props) {
      const { className, children, ...rest } = props as { className?: string; children?: ReactNode };
      const lang = /language-(\w+)/.exec(className ?? '')?.[1];
      if (lang && MERMAID_LANGS.has(lang)) {
        const src = String(children).replace(/\n$/, '');
        return (
          <Suspense fallback={<pre>{src}</pre>}>
            <LazyMermaidBlock source={src} />
          </Suspense>
        );
      }
      if (lang === 'markmap') {
        const src = String(children).replace(/\n$/, '');
        return (
          <Suspense fallback={<pre>{src}</pre>}>
            <LazyMarkmapBlock source={src} />
          </Suspense>
        );
      }
      if (lang) {
        const src = String(children).replace(/\n$/, '');
        return (
          <Suspense fallback={<pre><code>{src}</code></pre>}>
            <LazyShikiCode lang={lang} code={src} theme={theme === 'light' ? 'light' : 'dark'} />
          </Suspense>
        );
      }
      return <code className={className} {...rest}>{children}</code>;
    },
    img(props) {
      const { src, alt, ...rest } = props as { src?: unknown; alt?: string };
      const resolved = typeof src === 'string' ? (toSherpaFileUrl(src, relPath) ?? src) : src;
      return (
        <img
          {...(rest as Record<string, unknown>)}
          src={typeof resolved === 'string' ? resolved : undefined}
          alt={alt ?? ''}
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      );
    },
  }), [relPath, theme]);

  const save = useCallback(async (): Promise<void> => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(draft);
      setMode('view');
    } finally {
      setSaving(false);
    }
  }, [draft, onSave]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.modeBar}>
        <button
          type="button"
          className={styles.modeBtn}
          data-active={mode === 'view'}
          onClick={() => setMode('view')}
          aria-label={t('fileviewer.preview', 'Просмотр')}
        >
          {t('fileviewer.preview', 'Просмотр')}
        </button>
        <button
          type="button"
          className={styles.modeBtn}
          data-active={mode === 'edit'}
          onClick={enterEdit}
          aria-label={t('fileviewer.edit', 'Редактировать')}
        >
          {t('fileviewer.edit', 'Редактировать')}
        </button>
        {mode === 'edit' && (
          <>
            <button type="button" className={styles.cancelBtn} onClick={cancel} aria-label={t('fileviewer.cancel', 'Отмена')}>
              {t('fileviewer.cancel', 'Отмена')}
            </button>
            <button type="button" className={styles.saveBtn} onClick={() => void save()} disabled={saving} aria-label={t('fileviewer.save', 'Сохранить')}>
              {saving ? t('fileviewer.saving', 'Сохранение…') : t('fileviewer.save', 'Сохранить')}
            </button>
          </>
        )}
      </div>

      {mode === 'view' ? (
        isMindmap ? (
          <div className={styles.mdContent}>
            <Suspense fallback={<div>{t('markmap.loading', 'Loading…')}</div>}>
              <LazyMarkmapBlock source={mindmapBody} />
            </Suspense>
          </div>
        ) : (
          <div className={styles.mdContent}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
              {content}
            </ReactMarkdown>
          </div>
        )
      ) : (
        <div className={styles.editorWrap}>
          <CodeMirror
            value={draft}
            extensions={[mdLang()]}
            theme={cmTheme}
            onChange={(val) => setDraft(val)}
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              autocompletion: false,
              closeBrackets: false,
            }}
          />
        </div>
      )}
    </div>
  );
}
