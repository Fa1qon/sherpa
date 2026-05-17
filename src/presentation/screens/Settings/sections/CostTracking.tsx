// src/presentation/screens/Settings/sections/CostTracking.tsx
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../../../renderer/store/settings';

export function CostTracking(): ReactElement {
  const { t } = useTranslation();
  const cost = useSettings((s) => s.user.costTracking);
  const setCostTracking = useSettings((s) => s.setCostTracking);

  return (
    <section>
      <h3>{t('settings.section.cost')}</h3>
      <p style={{ color: 'var(--fg-muted)', fontSize: 12, marginTop: 4 }}>
        {t('settings.cost.helper')}
      </p>
      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={cost.showCost}
            onChange={(e) => void setCostTracking({ ...cost, showCost: e.target.checked })}
          />
          {t('settings.cost.showCost')}
        </label>
      </div>
      <div style={{ marginTop: 16 }}>
        <label>{t('settings.cost.pricePerMillionInput')}</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={cost.pricePerMillionInputTokens}
          onChange={(e) => void setCostTracking({
            ...cost,
            pricePerMillionInputTokens: parseFloat(e.target.value) || 0,
          })}
          style={{ display: 'block', marginTop: 4, width: 200 }}
        />
      </div>
      <div style={{ marginTop: 16 }}>
        <label>{t('settings.cost.pricePerMillionOutput')}</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={cost.pricePerMillionOutputTokens}
          onChange={(e) => void setCostTracking({
            ...cost,
            pricePerMillionOutputTokens: parseFloat(e.target.value) || 0,
          })}
          style={{ display: 'block', marginTop: 4, width: 200 }}
        />
      </div>
    </section>
  );
}
