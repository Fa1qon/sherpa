import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

// v1: placeholder — tasksTimeseries data source not yet available.
// Renders an empty-state message until the data pipeline is wired.
export function TasksOverTime({ reloadKey: _reloadKey }: { reloadKey: number }): ReactElement {
  const { t } = useTranslation();

  return (
    <>
      <h3>{t('analytics.tasksOverTime', 'Tasks over time')}</h3>
      <p style={{ color: 'var(--fg-muted)' }}>{t('analytics.noData', 'No data')}</p>
    </>
  );
}
