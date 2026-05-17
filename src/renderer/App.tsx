// src/renderer/App.tsx
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useShellState } from './store/shell_state';
import { ThemeProvider } from './providers/ThemeProvider';
import { I18nProvider } from './providers/I18nProvider';
import { useProject } from './store/project';
import { useSettings } from './store/settings';
import { useNavigation, type Tab } from './store/navigation';
import { AppChrome, TabBar, ActivityBar, SideBar, Splitter, RightSidebar, BottomPanel, StatusBar } from '../presentation/chrome';
import { useSideBar } from './store/sidebar';
import { useRightSidebar } from './store/right_sidebar';
import { useTranslation } from 'react-i18next';
import { FileViewer } from '../presentation/fileviewer/FileViewer';
import { KanbanBoard } from '../presentation/screens/Tracker/KanbanBoard';
import { ProjectPicker } from '../presentation/screens/ProjectPicker';
import { EmptyWorkspace } from '../presentation/screens/EmptyWorkspace';
import { TaskWorkspace } from '../presentation/screens/TaskWorkspace';
import { Settings } from '../presentation/screens/Settings';
import { Library } from '../presentation/screens/Library';
import { useTask } from './store/task';
import { AboutDialog } from '../presentation/components/AboutDialog';
import { ipcClient } from './ipc/client';
import { useSessionPersistence } from './hooks/useSessionPersistence';
// Side-effect import: registers all built-in panel contributions.
import './panels';
import './styles/global.css';
import './styles/theme.css';

export function App(): ReactElement {
  const loadSettings = useSettings((s) => s.load);
  const refreshRecent = useProject((s) => s.refreshRecent);

  // Initial bootstrap.
  useEffect(() => {
    loadSettings();
    refreshRecent();
  }, [loadSettings, refreshRecent]);

  return (
    <I18nProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </I18nProvider>
  );
}

function Shell(): ReactElement {
  useSessionPersistence();
  const current = useProject((s) => s.current);
  const closeProject = useProject((s) => s.closeProject);
  const tabs = useNavigation((s) => s.tabs);
  const activeTabId = useNavigation((s) => s.activeTabId);
  const openTab = useNavigation((s) => s.openTab);
  const closeTab = useNavigation((s) => s.closeTab);
  const [showAbout, setShowAbout] = useState(false);
  const { t } = useTranslation();
  const sidebarActivity = useSideBar((s) => s.activity);
  const sidebarWidth = useSideBar((s) => s.width);
  const setSidebarWidth = useSideBar((s) => s.setWidth);
  const toggleRightSidebar = useRightSidebar((s) => s.toggle);
  const zenMode = useShellState((s) => s.zenMode);
  const toggleZenMode = useShellState((s) => s.toggleZenMode);

  // Keyboard shortcut: Ctrl+Shift+Z / Cmd+Shift+Z toggles zen mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        toggleZenMode();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleZenMode]);

  const showPicker = !current;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  // Auto-route: when project closes, clear tabs.
  // Read live state inside the effect so tabs is not a dependency — avoids
  // N separate re-executions (one per tab closed).
  useEffect(() => {
    if (!current) {
      const liveTabs = useNavigation.getState().tabs;
      for (const tab of liveTabs) closeTab(tab.id);
    }
  }, [current, closeTab]);

  const onCloseDirty = useCallback(
    (_tab: Tab): boolean => {
      // eslint-disable-next-line no-alert
      return window.confirm(t('tabs.discardConfirm', 'Discard unsaved changes?'));
    },
    [t],
  );

  const onAction = useCallback(
    (id: string) => {
      switch (id) {
        case 'project.new': {
          return;
        }
        case 'project.close':
          closeProject();
          return;
        case 'project.settings':
          openTab({ kind: 'project-settings', title: t('settings.project.title', 'Настройки проекта') });
          return;
        case 'view.theme':
        case 'view.language':
          openTab({ kind: 'settings' });
          return;
        case 'view.toggleLeftPanel':
          useSideBar.getState().setActivity(
            useSideBar.getState().activity ? null : 'files',
          );
          return;
        case 'view.toggleRightPanel':
          toggleRightSidebar();
          return;
        case 'view.zenMode':
          toggleZenMode();
          return;
        case 'tools.methodologyLibrary':
          useSideBar.getState().setActivity('library');
          return;
        case 'project.quit':
          window.close();
          return;
        case 'help.about':
          setShowAbout(true);
          return;
        case 'help.devtools':
          void (window as { sherpa?: { app?: { openDevTools?: () => void } } }).sherpa?.app?.openDevTools?.();
          return;
        case 'tools.openSherpaFolder': {
          if (!current) return;
          void ipcClient.shell().openPath(`${current.path}/.sherpa`);
          return;
        }
        case 'task.new':
          if (current) {
            const tempId = `new-${Math.random().toString(36).slice(2, 10)}`;
            useTask.getState().setCurrent(null);
            openTab({ kind: 'task', params: { taskId: tempId }, title: t('task.new', 'Новая задача') });
          }
          return;
        default:
          return;
      }
    },
    [closeProject, openTab, current, t, toggleRightSidebar, toggleZenMode],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppChrome onAction={onAction} />
      {showPicker ? (
        <ProjectPicker />
      ) : (
        <>
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {!zenMode && <ActivityBar />}
            {!zenMode && <SideBar />}
            {!zenMode && sidebarActivity !== null && (
              <Splitter onResize={(d) => setSidebarWidth(Math.max(120, Math.min(600, sidebarWidth + d)))} />
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <TabBar onCloseDirty={onCloseDirty} />
              <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {!activeTab && <EmptyWorkspace onAction={onAction} />}
                {activeTab && <TabContent tab={activeTab} onAction={onAction} />}
              </main>
              <BottomPanel />
            </div>
            {!zenMode && <RightSidebar />}
          </div>
          {!zenMode && <StatusBar />}
        </>
      )}
      {zenMode && (
        <button
          className="zen-exit-btn"
          onClick={toggleZenMode}
          title="Exit zen mode (Ctrl+Shift+Z)"
          type="button"
        >
          x Zen
        </button>
      )}
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
    </div>
  );
}

interface TabContentProps {
  tab: Tab;
  onAction: (id: string) => void;
}

function TabContent({ tab, onAction }: TabContentProps): ReactElement {
  switch (tab.kind) {
    case 'task':
      return <TaskContent />;
    case 'settings':
      return <Settings />;
    case 'project-settings':
      return <Settings initialSection="project" />;
    case 'methodology-editor': {
      const methodologyId = tab.params?.methodologyId;
      return <Library methodologyId={methodologyId} />;
    }
    case 'file':
      return <FileViewer />;
    case 'tracker':
      return <KanbanBoard />;
    default:
      return <EmptyWorkspace onAction={onAction} />;
  }
}

function TaskContent(): ReactElement {
  return <TaskWorkspace />;
}
