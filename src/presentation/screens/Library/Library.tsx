// src/presentation/screens/Library/Library.tsx
import { useState, useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useMethodology } from '../../../renderer/store/methodology';
import { useProject } from '../../../renderer/store/project';
import { MethodologyList } from './MethodologyList';
import { MethodologyDetail } from './MethodologyDetail';
import { CasesPanel } from './CasesPanel/CasesPanel';
import { KnowledgePanel } from './KnowledgePanel/KnowledgePanel';
import { TemplatesPanel } from './TemplatesPanel/TemplatesPanel';
import styles from './Library.module.css';

type LibraryTab = 'methodologies' | 'cases' | 'knowledge' | 'templates';

interface Props {
  /** If provided, selects this methodology on mount (ignored when undefined). */
  methodologyId?: string;
}

export function Library({ methodologyId }: Props): ReactElement {
  const { t } = useTranslation();
  const refresh = useMethodology((s) => s.refresh);
  const select = useMethodology((s) => s.select);
  const current = useProject((s) => s.current);
  const [activeTab, setActiveTab] = useState<LibraryTab>('methodologies');

  useEffect(() => {
    if (methodologyId) {
      void select(methodologyId);
    }
  }, [methodologyId]); // eslint-disable-line -- select is stable (Zustand action)

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className={styles.libraryContainer}>
      <div className={styles.tabBar}>
        <button
          className={activeTab === 'methodologies' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('methodologies')}
        >
          Methodologies
        </button>
        <button
          className={activeTab === 'cases' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('cases')}
        >
          Cases
        </button>
        <button
          className={activeTab === 'knowledge' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('knowledge')}
        >
          {t('library.knowledge', 'Knowledge')}
        </button>
        <button
          className={activeTab === 'templates' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('templates')}
        >
          {t('library.templates', 'Templates')}
        </button>
      </div>
      {activeTab === 'methodologies' && (
        <div className={styles.library}>
          <aside className={styles.sidebar}>
            <MethodologyList />
          </aside>
          <main className={styles.detail}>
            <MethodologyDetail />
          </main>
        </div>
      )}
      {activeTab === 'cases' && (
        <div className={styles.casesContainer}>
          <CasesPanel projectPath={current?.path ?? ''} />
        </div>
      )}
      {activeTab === 'knowledge' && (
        <div className={styles.casesContainer}>
          <KnowledgePanel projectPath={current?.path ?? ''} />
        </div>
      )}
      {activeTab === 'templates' && (
        <div className={styles.casesContainer}>
          <TemplatesPanel projectPath={current?.path ?? ''} />
        </div>
      )}
    </div>
  );
}
