import { type ReactElement, type ComponentType, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderTree,
  LayoutList,
  Library,
  Settings,
  Search,
  GitBranch,
  Puzzle,
  Globe,
  type LucideProps,
} from 'lucide-react';
import { useSideBar, type Activity } from '../../renderer/store/sidebar';
import { useProject } from '../../renderer/store/project';
import { useNavigation } from '../../renderer/store/navigation';
import { ipcClient } from '../../renderer/ipc/client';
import styles from './ActivityBar.module.css';

type LucideIcon = ComponentType<LucideProps>;

interface SidebarItem {
  readonly kind: 'sidebar';
  readonly activity: Activity;
  readonly Icon: LucideIcon;
  readonly labelKey: string;
  readonly badge?: number;
}

interface StubItem {
  readonly kind: 'stub';
  readonly id: string;
  readonly Icon: LucideIcon;
  readonly labelKey: string;
}

interface ActionItem {
  readonly kind: 'action';
  readonly id: string;
  readonly Icon: LucideIcon;
  readonly labelKey: string;
}

type Item = SidebarItem | StubItem | ActionItem;

function useActiveTaskCount(): number {
  const project = useProject((s) => s.current);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!project) { setCount(0); return; }
    const refresh = (): void => {
      void ipcClient.task().list(project.path).then((tasks) => {
        setCount(tasks.filter((t) => t.status === 'running').length);
      }).catch(() => { /* ignore */ });
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [project]);

  return count;
}

export function ActivityBar(): ReactElement {
  const { t } = useTranslation();
  const sidebarActivity = useSideBar((s) => s.activity);
  const toggleSidebar = useSideBar((s) => s.toggle);
  const openTab = useNavigation((s) => s.openTab);
  const activeTaskCount = useActiveTaskCount();

  const TOP_ITEMS: readonly Item[] = [
    { kind: 'sidebar', activity: 'files', Icon: FolderTree, labelKey: 'sidebar.files' },
    { kind: 'sidebar', activity: 'tasks', Icon: LayoutList, labelKey: 'sidebar.tasks', badge: activeTaskCount },
    { kind: 'sidebar', activity: 'library', Icon: Library, labelKey: 'sidebar.library' },
    { kind: 'action', id: 'browser', Icon: Globe, labelKey: 'activityBar.browser' },
  ];

  const BOTTOM_ITEMS: readonly Item[] = [
    { kind: 'stub', id: 'search', Icon: Search, labelKey: 'activityBar.search' },
    { kind: 'stub', id: 'vcs', Icon: GitBranch, labelKey: 'activityBar.vcs' },
    { kind: 'stub', id: 'extensions', Icon: Puzzle, labelKey: 'activityBar.extensions' },
    { kind: 'sidebar', activity: 'settings', Icon: Settings, labelKey: 'sidebar.settings' },
  ];

  const renderItem = (item: Item): ReactElement => {
    const isActive = item.kind === 'sidebar' && sidebarActivity === item.activity;
    const Icon = item.Icon;
    const label = t(item.labelKey, item.labelKey);
    const key = item.kind === 'sidebar' ? `s:${item.activity}` : `${item.kind}:${item.id}`;
    const onClick = (): void => {
      if (item.kind === 'sidebar') toggleSidebar(item.activity);
      if (item.kind === 'action' && item.id === 'browser') {
        openTab({ kind: 'browser', title: t('activityBar.browser', 'Browser') });
      }
    };
    const badge = item.kind === 'sidebar' ? item.badge : undefined;
    return (
      <button
        key={key}
        type="button"
        className={styles.item}
        data-active={isActive}
        title={label}
        aria-label={label}
        onClick={onClick}
        disabled={item.kind === 'stub'}
      >
        <span className={styles.icon} aria-hidden="true">
          <Icon size={20} strokeWidth={1.75} />
        </span>
        {badge && badge > 0 ? (
          <span className={styles.badge} aria-label={t('activityBar.activeTasks', '{{count}} active', { count: badge })}>
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <nav className={styles.activityBar}>
      <div className={styles.topGroup}>
        {TOP_ITEMS.map(renderItem)}
      </div>
      <div className={styles.bottomGroup}>
        {BOTTOM_ITEMS.map(renderItem)}
      </div>
    </nav>
  );
}
