// src/presentation/screens/Settings/sections/Advanced.tsx
// Plan 8b Task 4 — Advanced settings section.
// Contains the "Show event journal panel" toggle.
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../../../renderer/store/settings';

export function Advanced(): ReactElement {
  const { t } = useTranslation();
  const showEventLog = useSettings((s) => s.user.showEventLog);
  const setShowEventLog = useSettings((s) => s.setShowEventLog);

  return (
    <section>
      <h3>{t('settings.eventLog.title', 'Event log')}</h3>
      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={showEventLog}
            onChange={(e) => void setShowEventLog(e.target.checked)}
            data-testid="show-event-log-toggle"
          />
          {t('settings.eventLog.showToggle', 'Show event journal panel')}
        </label>
      </div>
    </section>
  );
}
