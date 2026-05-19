import { useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { JsonView, allExpanded, darkStyles, defaultStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import CodeMirror from '@uiw/react-codemirror';
import { json as jsonLang } from '@codemirror/lang-json';
import { useSettings } from '../../renderer/store/settings';
import type { ViewerProps } from './viewer_registry';
import styles from './JsonViewer.module.css';

type Mode = 'tree' | 'source';

export function JsonViewer({ content, onSave }: ViewerProps): ReactElement {
  const { t } = useTranslation();
  const theme = useSettings((s) => s.user.theme);
  const cmTheme = theme === 'light' ? 'light' : 'dark';
  const [mode, setMode] = useState<Mode>('tree');
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);

  const { parsed, error } = useMemo(() => {
    try {
      const value = JSON.parse(content || 'null') as object | unknown[] | null;
      return { parsed: value, error: null as string | null };
    } catch (err) {
      return { parsed: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [content]);

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
          data-active={mode === 'tree'}
          onClick={() => setMode('tree')}
        >
          {t('fileviewer.tree', 'Tree')}
        </button>
        <button
          type="button"
          className={styles.modeBtn}
          data-active={mode === 'source'}
          onClick={() => setMode('source')}
        >
          {t('fileviewer.source', 'Source')}
        </button>
        {mode === 'source' && onSave && (
          <button
            type="button"
            className={styles.saveBtn}
            onClick={() => void save()}
            disabled={saving || draft === content}
          >
            {saving ? t('fileviewer.saving', 'Saving…') : t('fileviewer.save', 'Save')}
          </button>
        )}
      </div>
      <div className={styles.content}>
        {mode === 'tree' ? (
          error ? (
            <div className={styles.error} role="alert">
              <div className={styles.errorTitle}>{t('fileviewer.jsonParseError', 'JSON parse error')}</div>
              <pre>{error}</pre>
            </div>
          ) : (
            <div className={styles.treeWrap}>
              <JsonView
                data={parsed ?? {}}
                shouldExpandNode={allExpanded}
                style={theme === 'light' ? defaultStyles : darkStyles}
              />
            </div>
          )
        ) : (
          <CodeMirror
            value={draft}
            extensions={[jsonLang()]}
            theme={cmTheme}
            onChange={setDraft}
            basicSetup={{ lineNumbers: true, foldGutter: true }}
          />
        )}
      </div>
    </div>
  );
}
