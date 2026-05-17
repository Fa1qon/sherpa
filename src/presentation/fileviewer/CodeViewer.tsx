import { useState, useCallback, type ReactElement } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../renderer/store/settings';
import { getCodeMirrorLang } from './fileType';
import styles from './CodeViewer.module.css';

interface Props {
  content: string;
  ext: string;
  onSave?: (content: string) => Promise<void>;
}

export function CodeViewer({ content, ext, onSave }: Props): ReactElement {
  const { t } = useTranslation();
  const theme = useSettings((s) => s.user.theme);
  const cmTheme = theme === 'light' ? 'light' : 'dark';
  const lang = getCodeMirrorLang(ext);
  const extensions = lang ? [lang] : [];

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);

  const enterEdit = (): void => {
    setDraft(content);
    setEditing(true);
  };

  const cancel = (): void => {
    setDraft(content);
    setEditing(false);
  };

  const save = useCallback(async (): Promise<void> => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [draft, onSave]);

  return (
    <div className={styles.wrapper}>
      {onSave && (
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.editBtn}
            data-active={!editing}
            onClick={() => { if (editing) cancel(); }}
            aria-label={t('fileviewer.preview', 'Просмотр')}
          >
            {t('fileviewer.preview', 'Просмотр')}
          </button>
          <button
            type="button"
            className={styles.editBtn}
            data-active={editing}
            onClick={() => { if (!editing) enterEdit(); }}
            aria-label={t('fileviewer.edit', 'Редактировать')}
          >
            {t('fileviewer.edit', 'Редактировать')}
          </button>
          {editing && (
            <>
              <button type="button" className={styles.cancelBtn} onClick={cancel}>
                {t('fileviewer.cancel', 'Отмена')}
              </button>
              <button type="button" className={styles.saveBtn} onClick={() => void save()} disabled={saving}>
                {saving ? t('fileviewer.saving', 'Сохранение…') : t('fileviewer.save', 'Сохранить')}
              </button>
            </>
          )}
        </div>
      )}
      <div className={styles.editorWrap}>
        <CodeMirror
          value={editing ? draft : content}
          extensions={extensions}
          theme={cmTheme}
          editable={editing}
          onChange={(val) => setDraft(val)}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLineGutter: editing,
            highlightActiveLine: editing,
            autocompletion: false,
            closeBrackets: false,
            searchKeymap: true,
          }}
        />
      </div>
    </div>
  );
}
