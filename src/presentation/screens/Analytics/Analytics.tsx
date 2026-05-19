import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StageDurations } from './widgets/StageDurations';
import { GateOutcomes } from './widgets/GateOutcomes';
import { ToolUsage } from './widgets/ToolUsage';
import { TasksOverTime } from './widgets/TasksOverTime';
import styles from './Analytics.module.css';

export function Analytics(): ReactElement {
  const { t } = useTranslation();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setReloadKey((k) => k + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h2>{t('analytics.title', 'Analytics')}</h2>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)}>
          {t('analytics.refresh', 'Refresh')}
        </button>
      </div>
      <div className={styles.grid}>
        <div className={styles.card}>
          <StageDurations reloadKey={reloadKey} />
        </div>
        <div className={styles.card}>
          <GateOutcomes reloadKey={reloadKey} />
        </div>
        <div className={styles.card}>
          <ToolUsage reloadKey={reloadKey} />
        </div>
        <div className={styles.card}>
          <TasksOverTime reloadKey={reloadKey} />
        </div>
      </div>
    </div>
  );
}
