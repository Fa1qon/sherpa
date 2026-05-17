// src/presentation/screens/ProjectPicker/ProjectPicker.tsx
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../../renderer/store/project';
import { ipcClient } from '../../../renderer/ipc/client';
import { RecentList } from './RecentList';
import styles from './ProjectPicker.module.css';

export function ProjectPicker(): ReactElement {
  const { t } = useTranslation();
  const refreshRecent = useProject((s) => s.refreshRecent);
  const recent = useProject((s) => s.recent);
  const error = useProject((s) => s.error);
  const busy = useProject((s) => s.busy);
  const addAndOpen = useProject((s) => s.addAndOpen);
  const openById = useProject((s) => s.openById);
  const removeFromRecent = useProject((s) => s.removeFromRecent);
  const [scaffoldPrompt, setScaffoldPrompt] = useState<string | null>(null);

  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);

  const handleAdd = async () => {
    const path = await ipcClient.project().pickFolder();
    if (!path) return;
    const result = await addAndOpen({ path });
    if (!result.ok && result.error.kind === 'sherpa-missing-and-no-scaffold') {
      setScaffoldPrompt(path);
    }
  };

  const handleScaffoldConfirm = async () => {
    if (!scaffoldPrompt) return;
    await addAndOpen({ path: scaffoldPrompt, scaffold: true });
    setScaffoldPrompt(null);
  };

  return (
    <div className={styles.picker}>
      <div>
        <h2 className={styles.title}>{t('picker.title')}</h2>
        <p className={styles.subtitle}>{t('picker.subtitle')}</p>
        <button
          className={styles.primaryButton}
          onClick={handleAdd}
          disabled={busy}
        >
          {t('picker.addProject')}
        </button>

        {error && <div className={styles.error}>{error}</div>}
        {scaffoldPrompt && (
          <div className={styles.scaffoldPrompt}>
            <p>{t('picker.errors.sherpaMissing')}</p>
            <button onClick={handleScaffoldConfirm}>{t('common.confirm')}</button>
            <button onClick={() => setScaffoldPrompt(null)}>{t('common.cancel')}</button>
          </div>
        )}
      </div>

      <div>
        <h3 className={styles.recentTitle}>{t('picker.recent')}</h3>
        <RecentList
          recent={recent}
          onOpen={openById}
          onRemove={removeFromRecent}
          emptyLabel={t('picker.noRecent')}
        />
      </div>
    </div>
  );
}
