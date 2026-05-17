// src/presentation/screens/Settings/sections/Appearance.tsx
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../../../renderer/store/settings';

export function Appearance(): ReactElement {
  const { t } = useTranslation();
  const theme = useSettings((s) => s.user.theme);
  const language = useSettings((s) => s.user.language);
  const setTheme = useSettings((s) => s.setTheme);
  const setLanguage = useSettings((s) => s.setLanguage);

  return (
    <section>
      <h3>{t('settings.section.appearance')}</h3>
      <div style={{ marginTop: 16 }}>
        <label>{t('settings.appearance.theme')}</label>
        <div role="radiogroup" style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {(['dark', 'light', 'auto'] as const).map((opt) => (
            <button
              key={opt}
              data-active={theme === opt}
              onClick={() => setTheme(opt)}
            >
              {t(`settings.appearance.themeOption.${opt}`)}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <label>{t('settings.appearance.language')}</label>
        <div role="radiogroup" style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {(['en', 'ru'] as const).map((opt) => (
            <button
              key={opt}
              data-active={language === opt}
              onClick={() => setLanguage(opt)}
            >
              {opt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
