import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useSideBar } from '../../renderer/store/sidebar';
import { FilesPanel } from '../sidebar/FilesPanel';
import { TasksPanel } from '../sidebar/TasksPanel';
import { LibrarySidebarPanel } from '../sidebar/LibrarySidebarPanel';
import { SettingsSidebarPanel } from '../sidebar/SettingsSidebarPanel';
import styles from './SideBar.module.css';

const HEADER_KEYS: Record<string, string> = {
  files: 'sidebar.files',
  tasks: 'sidebar.tasks',
  library: 'sidebar.library',
  settings: 'sidebar.settings',
};

export function SideBar(): ReactElement | null {
  const { t } = useTranslation();
  const activity = useSideBar((s) => s.activity);
  const width = useSideBar((s) => s.width);
  if (activity === null) return null;

  return (
    <aside className={styles.sideBar} style={{ width }}>
      <header className={styles.header}>
        {t(HEADER_KEYS[activity] ?? activity, activity)}
      </header>
      <div className={styles.content}>
        {activity === 'files' && <FilesPanel />}
        {activity === 'tasks' && <TasksPanel />}
        {activity === 'library' && <LibrarySidebarPanel />}
        {activity === 'settings' && <SettingsSidebarPanel />}
      </div>
    </aside>
  );
}
