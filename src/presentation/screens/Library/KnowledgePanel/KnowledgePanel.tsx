import { useState, useEffect, useCallback, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppEvent } from '../../../../renderer/hooks/useAppEvent';
import type { KnowledgeItem } from '../../../../core/domain/knowledge';
import styles from './KnowledgePanel.module.css';

interface Props {
  projectPath: string;
}

const EMPTY_FORM = { title: '', category: '', content: '', tags: '' };

export function KnowledgePanel({ projectPath }: Props): ReactElement {
  const { t } = useTranslation();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [selected, setSelected] = useState<KnowledgeItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KnowledgeItem[] | null>(null);

  const reload = useCallback(async () => {
    if (!projectPath) return;
    const all = await window.sherpa.knowledge.list(projectPath);
    setItems(all);
  }, [projectPath]);

  useEffect(() => { void reload(); }, [reload]);

  useAppEvent('knowledge.changed', (ev) => {
    if (ev.projectPath === projectPath) void reload();
  });

  const onSearch = useCallback(async () => {
    if (!query.trim()) { setResults(null); return; }
    const res = await window.sherpa.knowledge.ftsSearch(projectPath, query);
    setResults(res);
  }, [projectPath, query]);

  useEffect(() => { void onSearch(); }, [onSearch]);

  const onSave = async (): Promise<void> => {
    if (!form.title.trim()) return;
    const tags = form.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (creating) {
      await window.sherpa.knowledge.create(projectPath, {
        title: form.title,
        category: form.category || undefined,
        content: form.content,
        tags,
      });
      setCreating(false);
      setForm(EMPTY_FORM);
    } else if (editing && selected) {
      await window.sherpa.knowledge.update(projectPath, selected.id, {
        title: form.title,
        category: form.category || undefined,
        content: form.content,
        tags,
      });
      setEditing(false);
      setSelected(null);
    }
    await reload();
  };

  const onDelete = async (): Promise<void> => {
    if (!selected) return;
    if (!window.confirm(t('knowledge.deleteConfirm', 'Delete this knowledge item?'))) return;
    await window.sherpa.knowledge.delete(projectPath, selected.id);
    setSelected(null);
    await reload();
  };

  const onEdit = (): void => {
    if (!selected) return;
    setForm({
      title: selected.title,
      category: selected.category ?? '',
      content: selected.content,
      tags: [...selected.tags].join(', '),
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

  const displayList = results ?? items;

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder={t('knowledge.search', 'Search knowledge...')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className={styles.addButton} type="button" onClick={onNew}>
          {t('knowledge.new', '+ New')}
        </button>
      </div>

      <div className={styles.list}>
        {displayList.length === 0 && (
          <p className={styles.empty}>
            {query ? t('knowledge.noResults', 'No results.') : t('knowledge.empty', 'No knowledge items yet.')}
          </p>
        )}
        {displayList.map((item) => (
          <div
            key={item.id}
            className={`${styles.item} ${selected?.id === item.id ? styles.itemSelected : ''}`}
            onClick={() => { setSelected(item); setCreating(false); setEditing(false); }}
          >
            <div className={styles.itemTitle}>{item.title}</div>
            {item.category && <div className={styles.itemMeta}>{item.category}</div>}
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <div className={styles.detail}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('knowledge.title', 'Title')}</label>
            <input
              className={styles.input}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Knowledge title"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('knowledge.category', 'Category')}</label>
            <input
              className={styles.input}
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Optional category"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('knowledge.tags', 'Tags (comma-separated)')}</label>
            <input
              className={styles.input}
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="tag1, tag2"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('knowledge.content', 'Content')}</label>
            <textarea
              className={styles.textarea}
              rows={8}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Markdown content..."
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
          <div className={styles.detailTitle}>{selected.title}</div>
          {selected.category && <div className={styles.itemMeta}>{selected.category}</div>}
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
