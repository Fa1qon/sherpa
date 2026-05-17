import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, FolderCog } from 'lucide-react';
import { useNavigation } from '../../renderer/store/navigation';
import styles from './SettingsSidebarPanel.module.css';

export function SettingsSidebarPanel(): ReactElement {
  const { t } = useTranslation();
  const openTab = useNavigation((s) => s.openTab);

  return (
    <div>
      <ul className={styles.list}>
        <li>
          <button
            type="button"
            className={styles.item}
            onClick={() => openTab({ kind: 'settings', title: t('settings.title', 'Настройки') })}
          >
            <Settings size={14} strokeWidth={1.75} />
            <span>{t('settings.general.title', 'Общие настройки')}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={styles.item}
            onClick={() => openTab({ kind: 'project-settings', title: t('settings.project.title', 'Настройки проекта') })}
          >
            <FolderCog size={14} strokeWidth={1.75} />
            <span>{t('settings.project.title', 'Настройки проекта')}</span>
          </button>
        </li>
      </ul>
    </div>
  );
}
