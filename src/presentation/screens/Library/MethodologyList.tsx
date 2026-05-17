// src/presentation/screens/Library/MethodologyList.tsx
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useMethodology } from '../../../renderer/store/methodology';
import { NewMethodologyDialog } from './NewMethodologyDialog';
import styles from './Library.module.css';

export function MethodologyList(): ReactElement {
  const { t } = useTranslation();
  const list = useMethodology((s) => s.list);
  const selectedId = useMethodology((s) => s.selectedId);
  const select = useMethodology((s) => s.select);
  const [filter, setFilter] = useState('');
  const [showNew, setShowNew] = useState(false);

  const filtered = list.filter((m) =>
    m.name.toLowerCase().includes(filter.toLowerCase()) ||
    m.id.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <>
      <h3 className={styles.sidebarTitle}>{t('library.title', 'Methodologies')}</h3>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button
          onClick={() => setShowNew(true)}
          style={{
            flex: 1, padding: '6px 8px',
            background: 'transparent', border: '1px dashed var(--border-default)',
            borderRadius: 4, color: 'var(--fg-default)', fontSize: 12, cursor: 'pointer',
          }}
        >
          {t('library.edit.newMethodology', '+ New methodology')}
        </button>
      </div>
      <input
        className={styles.searchBox}
        placeholder={t('library.search', 'Search…')}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {filtered.length === 0 && (
        <p className={styles.empty}>{t('library.empty', 'No methodologies in this project.')}</p>
      )}
      <ul className={styles.list}>
        {filtered.map((m) => (
          <li
            key={m.id}
            data-active={selectedId === m.id}
            className={styles.listItem}
            onClick={() => { void select(m.id); }}
          >
            <div className={styles.itemName}>{m.name}</div>
            <div className={styles.itemVersion}>v{m.version}</div>
          </li>
        ))}
      </ul>

      {showNew && <NewMethodologyDialog onClose={() => setShowNew(false)} />}
    </>
  );
}
