// src/presentation/screens/Settings/sections/About.tsx
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export function About(): ReactElement {
  const { t } = useTranslation();
  return (
    <section>
      <h3>{t('settings.section.about')}</h3>
      <p style={{ marginTop: 16 }}>
        <strong>{t('settings.about.version')}:</strong> 0.1.0-alpha.1
      </p>
      <p style={{ marginTop: 8 }}>
        <strong>{t('settings.about.license')}:</strong> Proprietary
      </p>
    </section>
  );
}
