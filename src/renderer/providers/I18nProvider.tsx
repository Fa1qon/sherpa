// src/renderer/providers/I18nProvider.tsx
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import i18n from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { useSettings } from '../store/settings';
import en from '../locales/en.json';
import ru from '../locales/ru.json';

let initialized = false;

function ensureInit(language: string): void {
  if (initialized) {
    if (i18n.language !== language) i18n.changeLanguage(language);
    return;
  }
  i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      ru: { translation: ru },
    },
    interpolation: { escapeValue: false },
  });
  initialized = true;
}

export function I18nProvider({ children }: { children: ReactNode }): ReactElement | null {
  const language = useSettings((s) => s.user.language);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureInit(language);
    setReady(true);
  }, [language]);

  if (!ready) return null;
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
