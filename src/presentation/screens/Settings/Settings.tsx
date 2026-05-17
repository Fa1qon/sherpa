// src/presentation/screens/Settings/Settings.tsx
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { General } from './sections/General';
import { Appearance } from './sections/Appearance';
import { CostTracking } from './sections/CostTracking';
import { Compliance } from './sections/Compliance';
import { Advanced } from './sections/Advanced';
import { About } from './sections/About';
import { ProjectConfig } from './sections/ProjectConfig';
import styles from './Settings.module.css';

type SectionId = 'general' | 'appearance' | 'cost' | 'compliance' | 'advanced' | 'project' | 'about';

interface Props {
  /** Optional initial section to show on mount. Defaults to 'general'. */
  initialSection?: SectionId;
}

export function Settings({ initialSection = 'general' }: Props): ReactElement {
  const { t } = useTranslation();
  const [section, setSection] = useState<SectionId>(initialSection);

  return (
    <div className={styles.settings}>
      <aside className={styles.sidebar}>
        <h2 className={styles.title}>{t('settings.title')}</h2>
        <nav>
          {(['general', 'appearance', 'cost', 'compliance', 'advanced', 'project', 'about'] as const).map((id) => (
            <button
              key={id}
              className={styles.navItem}
              data-active={section === id}
              onClick={() => setSection(id)}
            >
              {t(`settings.section.${id}`)}
            </button>
          ))}
        </nav>
      </aside>
      <main className={styles.body}>
        {section === 'general' && <General />}
        {section === 'appearance' && <Appearance />}
        {section === 'cost' && <CostTracking />}
        {section === 'compliance' && <Compliance />}
        {section === 'advanced' && <Advanced />}
        {section === 'project' && <ProjectConfig />}
        {section === 'about' && <About />}
      </main>
    </div>
  );
}
