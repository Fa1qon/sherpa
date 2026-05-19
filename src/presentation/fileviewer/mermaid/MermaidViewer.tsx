import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import { useSettings } from '../../../renderer/store/settings';
import type { ViewerProps } from '../viewer_registry';
import { MermaidBlock } from './MermaidBlock';
import { setMermaidTheme } from './mermaid_loader';
import styles from './MermaidViewer.module.css';

type Mode = 'view' | 'source';

export function MermaidViewer({ content, onSave }: ViewerProps): ReactElement {
  const { t } = useTranslation();
  const theme = useSettings((s) => s.user.theme);
  const cmTheme = theme === 'light' ? 'light' : 'dark';
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMermaidTheme(theme === 'light' ? 'light' : 'dark');
  }, [theme]);

  const save = async (): Promise<void> => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.modeBtn}
          data-active={mode === 'view'}
          onClick={() => setMode('view')}
        >
          {t('fileviewer.preview', 'Просмотр')}
        </button>
        <button
          type="button"
          className={styles.modeBtn}
          data-active={mode === 'source'}
          onClick={() => setMode('source')}
        >
          {t('fileviewer.source', 'Источник')}
        </button>
        {mode === 'source' && onSave && (
          <button
            type="button"
            className={styles.saveBtn}
            onClick={() => void save()}
            disabled={saving || draft === content}
          >
            {saving ? t('fileviewer.saving', 'Сохранение…') : t('fileviewer.save', 'Сохранить')}
          </button>
        )}
      </div>
      <div className={styles.content}>
        {mode === 'view' ? (
          <MermaidBlock source={draft} />
        ) : (
          <CodeMirror
            value={draft}
            theme={cmTheme}
            onChange={setDraft}
            basicSetup={{ lineNumbers: true, foldGutter: false }}
          />
        )}
      </div>
    </div>
  );
}
