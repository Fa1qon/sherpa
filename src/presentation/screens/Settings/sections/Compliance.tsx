// src/presentation/screens/Settings/sections/Compliance.tsx
// Plan 8b Task 3 — Compliance review output mode setting.
// Radio group for ComplianceOutputMode: off / file / clipboard / both.
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../../../renderer/store/settings';
import type { ComplianceOutputMode } from '../../../../core/domain/settings';

const MODES: readonly ComplianceOutputMode[] = ['off', 'file', 'clipboard', 'both'];

export function Compliance(): ReactElement {
  const { t } = useTranslation();
  const outputMode = useSettings((s) => s.user.complianceOutputMode);
  const setComplianceOutputMode = useSettings((s) => s.setComplianceOutputMode);

  return (
    <section>
      <h3>{t('settings.compliance.title', 'Compliance review')}</h3>
      <div style={{ marginTop: 16 }}>
        {MODES.map((mode) => (
          <label
            key={mode}
            style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}
          >
            <input
              type="radio"
              name="compliance-output-mode"
              value={mode}
              checked={outputMode === mode}
              onChange={() => void setComplianceOutputMode(mode)}
            />
            {t(`settings.compliance.outputMode.${mode}`)}
          </label>
        ))}
      </div>
    </section>
  );
}
