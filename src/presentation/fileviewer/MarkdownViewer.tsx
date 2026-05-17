// src/presentation/fileviewer/MarkdownViewer.tsx
import { useState, useCallback, type ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import CodeMirror from '@uiw/react-codemirror';
import { markdown as mdLang } from '@codemirror/lang-markdown';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../renderer/store/settings';
import styles from './MarkdownViewer.module.css';

interface Props {
  content: string;
  projectPath: string;
  relPath: string;
  onSave(content: string): Promise<void>;
}

type Mode = 'view' | 'edit';

export function MarkdownViewer({ content, onSave }: Props): ReactElement {
  const { t } = useTranslation();
  const theme = useSettings((s) => s.user.theme);
  const cmTheme = theme === 'light' ? 'light' : 'dark';
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);

  const enterEdit = (): void => {
    setDraft(content);
    setMode('edit');
  };

  const cancel = (): void => {
    setDraft(content);
    setMode('view');
  };

  const save = useCallback(async (): Promise<void> => {
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
        <div className={styles.mdContent}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {content}
          </ReactMarkdown>
        </div>
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
