import { useState, useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '../../renderer/store/navigation';
import { useMethodology } from '../../renderer/store/methodology';
import styles from './LibrarySidebarPanel.module.css';

type LibSideTab = 'methodologies' | 'cases' | 'knowledge' | 'templates' | 'reviewers';

export function LibrarySidebarPanel(): ReactElement {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<LibSideTab>('methodologies');
  const openTab = useNavigation((s) => s.openTab);
  const methodologies = useMethodology((s) => s.list);
  const refresh = useMethodology((s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const TABS: { id: LibSideTab; label: string }[] = [
    { id: 'methodologies', label: t('library.methodologies', 'Методики') },
    { id: 'cases', label: t('library.cases', 'Кейсы') },
    { id: 'knowledge', label: t('library.knowledge', 'Знания') },
    { id: 'templates', label: t('library.templates', 'Шаблоны') },
    { id: 'reviewers', label: t('library.reviewers', 'Ревьюеры') },
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            data-active={activeTab === tab.id}
            className={styles.tab}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {activeTab === 'methodologies' && (
          <ul className={styles.list}>
            {methodologies.length === 0 && (
              <li className={styles.empty}>{t('library.noMethodologies', 'Нет методик')}</li>
            )}
            {methodologies.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={styles.row}
                  onClick={() =>
                    openTab({
                      kind: 'methodology-editor',
                      params: { methodologyId: m.id },
                      title: m.name,
                    })
                  }
                  title={m.name}
                >
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {(activeTab === 'cases' ||
          activeTab === 'knowledge' ||
          activeTab === 'templates' ||
          activeTab === 'reviewers') && (
          <div className={styles.empty}>
            <span>{t('library.openInMain', 'Открыть в главной панели...')}</span>
            <button
              type="button"
              className={styles.openBtn}
              onClick={() => openTab({ kind: 'methodology-editor' })}
            >
              {t('library.openLibrary', 'Открыть библиотеку')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
