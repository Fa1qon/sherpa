import { useState, useEffect, useCallback, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppEvent } from '../../../../renderer/hooks/useAppEvent';
import type { ArtifactTemplate } from '../../../../core/domain/artifact_template';
import styles from './TemplatesPanel.module.css';

interface Props {
  projectPath: string;
}

const EMPTY_FORM = { name: '', description: '', content: '', stage_hint: '' };

export function TemplatesPanel({ projectPath }: Props): ReactElement {
  const { t } = useTranslation();
  const [items, setItems] = useState<ArtifactTemplate[]>([]);
  const [selected, setSelected] = useState<ArtifactTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const reload = useCallback(async () => {
    if (!projectPath) return;
    const all = await window.sherpa.templates.list(projectPath);
    setItems(all);
  }, [projectPath]);

  useEffect(() => { void reload(); }, [reload]);

  useAppEvent('artifact_template.changed', (ev) => {
    if (ev.projectPath === projectPath) void reload();
  });

  const onSave = async (): Promise<void> => {
    if (!form.name.trim()) return;
    if (creating) {
      await window.sherpa.templates.create(projectPath, {
        name: form.name,
        description: form.description || undefined,
        content: form.content,
        stage_hint: form.stage_hint || undefined,
      });
      setCreating(false);
      setForm(EMPTY_FORM);
    } else if (editing && selected) {
      await window.sherpa.templates.update(projectPath, selected.id, {
        name: form.name,
        description: form.description || undefined,
        content: form.content,
        stage_hint: form.stage_hint || undefined,
      });
      setEditing(false);
      setSelected(null);
    }
    await reload();
  };

  const onDelete = async (): Promise<void> => {
    if (!selected) return;
    if (!window.confirm(t('templates.deleteConfirm', 'Delete this template?'))) return;
    await window.sherpa.templates.delete(projectPath, selected.id);
    setSelected(null);
    await reload();
  };

  const onEdit = (): void => {
    if (!selected) return;
    setForm({
      name: selected.name,
      description: selected.description ?? '',
      content: selected.content,
      stage_hint: selected.stage_hint ?? '',
    });
    setEditing(true);
    setCreating(false);
  };

  const onNew = (): void => {
    setCreating(true);
    setEditing(false);
    setSelected(null);
    setForm(EMPTY_FORM);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <button className={styles.addButton} type="button" onClick={onNew}>
          {t('templates.new', '+ New template')}
        </button>
      </div>
      <div className={styles.list}>
        {items.length === 0 && (
          <p className={styles.empty}>{t('templates.empty', 'No templates yet.')}</p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className={`${styles.item} ${selected?.id === item.id ? styles.itemSelected : ''}`}
            onClick={() => { setSelected(item); setCreating(false); setEditing(false); }}
          >
            <div className={styles.itemTitle}>{item.name}</div>
            {item.stage_hint && <div className={styles.itemMeta}>{item.stage_hint}</div>}
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <div className={styles.detail}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('templates.name', 'Name')}</label>
            <input
              className={styles.input}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Template name"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('templates.stageHint', 'Stage hint')}</label>
            <input
              className={styles.input}
              value={form.stage_hint}
              onChange={(e) => setForm((f) => ({ ...f, stage_hint: e.target.value }))}
              placeholder="e.g. planning"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('templates.description', 'Description')}</label>
            <input
              className={styles.input}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('templates.content', 'Content (Markdown)')}</label>
            <textarea
              className={styles.textarea}
              rows={10}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="# Artifact title&#10;&#10;..."
            />
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={() => { setCreating(false); setEditing(false); }}>
              {t('common.cancel', 'Cancel')}
            </button>
            <button type="button" className={styles.saveButton} onClick={onSave}>
              {t('common.save', 'Save')}
            </button>
          </div>
        </div>
      )}

      {selected && !editing && !creating && (
        <div className={styles.detail}>
          <div className={styles.detailTitle}>{selected.name}</div>
          {selected.description && <div className={styles.itemMeta}>{selected.description}</div>}
          <div className={styles.detailContent}>{selected.content}</div>
          <div className={styles.actions}>
            <button type="button" className={styles.deleteButton} onClick={onDelete}>
              {t('common.delete', 'Delete')}
            </button>
            <button type="button" onClick={onEdit}>
              {t('common.edit', 'Edit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
