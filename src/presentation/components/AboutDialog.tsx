// src/presentation/components/AboutDialog.tsx
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './AboutDialog.module.css';

interface Props {
  onClose(): void;
}

export function AboutDialog({ onClose }: Props): ReactElement {
  const { t } = useTranslation();
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{t('about.title', 'About Sherpa')}</h2>
        <dl className={styles.fields}>
          <dt>{t('about.version', 'Version')}</dt>
          <dd>0.1.0-alpha.1</dd>
          <dt>{t('about.license', 'License')}</dt>
          <dd>Proprietary</dd>
          <dt>{t('about.purpose', 'Purpose')}</dt>
          <dd>{t('about.purposeText', 'A visual orchestrator for AI-driven processes.')}</dd>
        </dl>
        <div className={styles.actions}>
          <button onClick={onClose}>{t('common.close', 'Close')}</button>
        </div>
      </div>
    </div>
  );
}
